import crypto from 'node:crypto';
import { sendJson, readJsonBody } from '../server/lib/http.js';
import { authorize, rateLimit, cleanString, clampInt } from '../server/lib/security.js';
import { callProvider, configuredProviders } from '../server/providers/runtime.js';
import { openRouterFallbackProvider } from '../server/providers/openrouter.js';

export const config = { maxDuration: 60 };

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function directOpenRouterProvider(modelId) {
  const id = String(modelId || '').replace(/^or:/, '').trim();
  if (!id || !process.env.OPENROUTER_API_KEY) return null;
  return {
    id: `or:${id}`,
    name: id === 'openrouter/free' ? 'OpenRouter Free Router' : id,
    key: process.env.OPENROUTER_API_KEY,
    model: id,
    type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    gateway: 'openrouter',
    free: id.endsWith(':free') || id === 'openrouter/free'
  };
}

function providerRoster(modelIds = []) {
  const requested = unique(modelIds.map((id) => String(id || '').replace(/^or:/, '').trim())).slice(0, 12);
  const directModels = requested.map(directOpenRouterProvider).filter(Boolean);
  const directProviders = configuredProviders().filter((provider) => provider.id !== 'openrouter');
  const fallback = process.env.OPENROUTER_API_KEY ? openRouterFallbackProvider() : null;
  const combined = [...directModels, ...directProviders, fallback].filter(Boolean);
  const seen = new Set();
  return combined.filter((provider) => {
    const key = `${provider.id}:${provider.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function providersForSlot(roster, slot = 0) {
  if (!roster.length) return [];
  const primaryIndex = Math.abs(Number(slot) || 0) % roster.length;
  const primary = roster[primaryIndex];
  const fallback = roster.find((provider) => provider.id === 'openrouter' && provider !== primary);
  const alternate = roster.find((provider, index) => index !== primaryIndex && provider !== fallback);
  return [primary, fallback, alternate].filter(Boolean).slice(0, 3);
}

async function callWithinBudget(providers, messages, options = {}) {
  const attempts = [];
  const totalBudgetMs = clampInt(options.totalBudgetMs, 15000, 56000, 54000);
  const maxAttemptMs = clampInt(options.maxAttemptMs, 8000, 48000, 43000);
  const deadline = Date.now() + totalBudgetMs;
  let lastError = null;

  for (const provider of providers) {
    const remaining = deadline - Date.now();
    if (remaining < 5000) break;
    const attemptStarted = Date.now();
    const timeoutMs = Math.max(4500, Math.min(maxAttemptMs, remaining - 1800));
    try {
      const result = await callProvider(provider, messages, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        timeoutMs
      });
      attempts.push({
        providerId: provider.id,
        providerName: provider.name,
        requestedModel: provider.model,
        actualModel: result.model,
        success: true,
        latencyMs: Date.now() - attemptStarted
      });
      return { ...result, attempts };
    } catch (error) {
      lastError = error;
      attempts.push({
        providerId: provider.id,
        providerName: provider.name,
        requestedModel: provider.model,
        success: false,
        latencyMs: Date.now() - attemptStarted,
        error: error?.message || 'Provider call failed.'
      });
    }
  }

  const error = new Error(lastError?.message || 'No model completed this project step.');
  error.attempts = attempts;
  throw error;
}

function extractJson(raw) {
  const text = String(raw || '').trim();
  const candidates = [
    text,
    text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''),
    text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  ];
  for (const candidate of candidates) {
    if (!candidate || !candidate.startsWith('{')) continue;
    try { return JSON.parse(candidate); } catch {}
  }
  return null;
}

function safePath(value, fallback = 'index.html') {
  const path = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '').replace(/\.\.(\/|$)/g, '').trim();
  if (!path || path.length > 160 || /[\0<>:"|?*]/.test(path)) return fallback;
  return path;
}

function cleanProject(input, fallbackName = 'ai-project') {
  const source = input && typeof input === 'object' ? input : {};
  const files = [];
  const seen = new Set();
  for (const item of Array.isArray(source.files) ? source.files : []) {
    if (!item || typeof item.content !== 'string') continue;
    const path = safePath(item.path || item.name, `file-${files.length + 1}.txt`);
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({ path, content: item.content.slice(0, 140000) });
    if (files.length >= 24) break;
  }
  const totalChars = files.reduce((sum, file) => sum + file.content.length, 0);
  if (totalChars > 420000) {
    let remaining = 420000;
    for (const file of files) {
      file.content = file.content.slice(0, remaining);
      remaining -= file.content.length;
      if (remaining <= 0) break;
    }
  }
  const entryFile = safePath(source.entryFile || (files.some((f) => f.path === 'index.html') ? 'index.html' : files[0]?.path), 'index.html');
  return {
    projectName: cleanString(source.projectName, 80) || fallbackName,
    projectType: ['static', 'single-html', 'nextjs'].includes(source.projectType) ? source.projectType : 'static',
    entryFile,
    summary: cleanString(source.summary, 600) || 'AI-generated project files.',
    files,
    notes: Array.isArray(source.notes) ? source.notes.map((note) => cleanString(note, 300)).filter(Boolean).slice(0, 12) : []
  };
}

function salvageProject(raw, outputFormat, fallbackName) {
  const parsed = extractJson(raw);
  if (parsed) {
    const project = cleanProject(parsed, fallbackName);
    if (project.files.length) return project;
  }

  const text = String(raw || '');
  const htmlStart = text.search(/<!doctype html|<html[\s>]/i);
  if (htmlStart >= 0) {
    const html = text.slice(htmlStart).replace(/```\s*$/g, '').trim();
    return cleanProject({
      projectName: fallbackName,
      projectType: 'single-html',
      entryFile: 'index.html',
      summary: 'Recovered HTML project from the model response.',
      files: [{ path: 'index.html', content: html }],
      notes: ['The model did not return the requested JSON envelope, so the HTML was recovered automatically.']
    }, fallbackName);
  }

  if (outputFormat === 'single-html') {
    return cleanProject({
      projectName: fallbackName,
      projectType: 'single-html',
      entryFile: 'index.html',
      summary: 'Fallback project.',
      files: [{ path: 'index.html', content: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${fallbackName}</title></head><body><main><h1>Project generation incomplete</h1><p>${String(raw || 'No usable output was returned.').replace(/[<&]/g, '')}</p></main></body></html>` }],
      notes: ['Generation was incomplete. Use the Team Room transcript to retry the Developer step.']
    }, fallbackName);
  }
  return cleanProject({}, fallbackName);
}

function compactTranscript(messages, maxChars = 36000) {
  return (Array.isArray(messages) ? messages : []).slice(-20).map((message) => {
    const header = `${cleanString(message.from, 70) || 'AI'} → ${cleanString(message.to, 70) || 'Team'} (${cleanString(message.kind, 40) || 'message'})`;
    return `${header}\n${cleanString(message.content, 9000)}`;
  }).join('\n\n---\n\n').slice(-maxChars);
}

function compactFiles(project, maxChars = 52000) {
  const files = cleanProject(project).files;
  let output = '';
  for (const file of files) {
    const block = `FILE: ${file.path}\n\n${file.content}\n\n===== END FILE =====\n\n`;
    if (output.length + block.length > maxChars) {
      output += block.slice(0, Math.max(0, maxChars - output.length));
      break;
    }
    output += block;
  }
  return output;
}

function normalizeReview(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    approved: Boolean(source.approved),
    summary: cleanString(source.summary, 800) || 'Review completed.',
    issues: (Array.isArray(source.issues) ? source.issues : []).slice(0, 24).map((issue) => ({
      severity: ['critical', 'high', 'medium', 'low'].includes(String(issue?.severity).toLowerCase()) ? String(issue.severity).toLowerCase() : 'medium',
      file: safePath(issue?.file || 'project', 'project'),
      problem: cleanString(issue?.problem, 600) || 'Unspecified issue.',
      fix: cleanString(issue?.fix, 700) || 'Revise this area.'
    }))
  };
}

function normalizeConcepts(input) {
  const source = input && typeof input === 'object' ? input : {};
  const safeColor = (value) => /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? String(value) : '';
  const fallback = [
    { id: 'signature-geometry', name: 'Signature Geometry', tagline: 'A conversion-first identity built around one memorable visual system.', palette: ['#0c1324', '#f4f1e9', '#f28b43'], layout: 'Asymmetric editorial grid with oversized type and project-led reveals', motion: 'Smooth, purposeful transitions', signature: 'A custom framed-corner motif used across navigation, images, and section dividers', why: 'Distinctive without sacrificing clarity.' },
    { id: 'human-proof', name: 'Human Proof', tagline: 'Warm local credibility presented like a premium field journal.', palette: ['#f5efe4', '#17211d', '#c96f3b'], layout: 'Story-led split screens, process timeline, and tactile project notes', motion: 'Subtle image reveals and tactile hover states', signature: 'Annotated project-stamp system', why: 'Builds trust without invented claims.' },
    { id: 'kinetic-monument', name: 'Kinetic Monument', tagline: 'Bold digital presence with an unmistakable first screen.', palette: ['#080a0f', '#d8ff4f', '#e9edf6'], layout: 'Full-bleed modular canvas with sticky conversion rail', motion: 'Kinetic typography and layered scroll choreography', signature: 'A living service map that changes through the page', why: 'Maximizes memorability and differentiation.' }
  ];
  const concepts = (Array.isArray(source.concepts) ? source.concepts : []).slice(0, 3).map((item, index) => ({
    id: cleanString(item?.id, 60) || `concept-${index + 1}`,
    name: cleanString(item?.name, 80) || fallback[index].name,
    tagline: cleanString(item?.tagline, 240) || fallback[index].tagline,
    palette: (Array.isArray(item?.palette) ? item.palette : []).map(safeColor).filter(Boolean).slice(0, 5),
    layout: cleanString(item?.layout, 500) || fallback[index].layout,
    motion: cleanString(item?.motion, 400) || fallback[index].motion,
    signature: cleanString(item?.signature, 500) || fallback[index].signature,
    why: cleanString(item?.why, 500) || fallback[index].why
  }));
  return concepts.length === 3 ? concepts : fallback;
}

function deterministicValidation(project, prompt = '') {
  const p = cleanProject(project);
  const checks = [];
  const add = (name, passed, detail, severity = 'medium') => checks.push({ name, passed: Boolean(passed), detail, severity });
  const fileMap = new Map(p.files.map((file) => [file.path, file.content]));
  const entry = fileMap.get(p.entryFile) || fileMap.get('index.html') || '';

  add('Files generated', p.files.length > 0, p.files.length ? `${p.files.length} files are present.` : 'No files were generated.', 'critical');
  add('Entry file exists', Boolean(entry), entry ? `Entry file: ${p.entryFile}` : `Missing ${p.entryFile}.`, 'critical');

  if (/\.html?$/i.test(p.entryFile) || p.projectType !== 'nextjs') {
    add('HTML document', /<!doctype html/i.test(entry) && /<html[\s>]/i.test(entry), 'Entry file should contain a complete HTML document.', 'high');
    add('Viewport metadata', /name=["']viewport["']/i.test(entry), 'Mobile viewport metadata is required.', 'high');
    add('Page title', /<title>[^<]+<\/title>/i.test(entry), 'A descriptive page title is required.', 'medium');
    add('Language attribute', /<html[^>]+lang=["'][^"']+["']/i.test(entry), 'Add a language attribute for accessibility.', 'medium');
    add('Primary heading', /<h1[\s>]/i.test(entry), 'A primary heading helps structure and SEO.', 'medium');
    add('Responsive styling', /@media|clamp\(|min\(|max\(/i.test(entry + '\n' + (fileMap.get('styles.css') || '')), 'Responsive CSS patterns should be present.', 'medium');
  }

  const localRefs = [...entry.matchAll(/(?:src|href)=["'](?!https?:|mailto:|tel:|#|data:|\/\/)([^"'?]+)[^"']*["']/gi)].map((match) => match[1].replace(/^\.\//, ''));
  const missingRefs = localRefs.filter((ref) => !fileMap.has(ref) && !ref.startsWith('/'));
  add('Local asset references', missingRefs.length === 0, missingRefs.length ? `Missing: ${unique(missingRefs).join(', ')}` : 'All local references resolve.', 'high');

  let jsSyntaxOk = true;
  const jsErrors = [];
  for (const file of p.files.filter((item) => /\.m?js$/i.test(item.path))) {
    try { new Function(file.content); } catch (error) { jsSyntaxOk = false; jsErrors.push(`${file.path}: ${error.message}`); }
  }
  add('JavaScript syntax', jsSyntaxOk, jsSyntaxOk ? 'No JavaScript syntax errors detected.' : jsErrors.join(' | '), 'high');

  const promptDigits = unique(String(prompt).match(/\d[\d()\-\s]{6,}\d/g) || []);
  const combined = p.files.map((file) => file.content).join('\n');
  const missingDigits = promptDigits.filter((value) => !combined.includes(value.trim()));
  if (promptDigits.length) add('Required contact details', missingDigits.length === 0, missingDigits.length ? `Missing requested value(s): ${missingDigits.join(', ')}` : 'Requested numeric contact details are present.', 'high');

  const placeholders = combined.match(/\b(?:TODO|LOREM IPSUM|YOUR COMPANY|PLACEHOLDER TEXT)\b/gi) || [];
  add('No accidental placeholders', placeholders.length === 0, placeholders.length ? `${placeholders.length} placeholder markers remain.` : 'No common accidental placeholders detected.', 'low');

  const criticalFailures = checks.filter((check) => !check.passed && ['critical', 'high'].includes(check.severity));
  const passedCount = checks.filter((check) => check.passed).length;
  return {
    passed: criticalFailures.length === 0,
    score: Math.round((passedCount / Math.max(checks.length, 1)) * 100),
    checks,
    criticalFailures: criticalFailures.length
  };
}

function meta(result) {
  return {
    provider: result.providerName,
    providerId: result.providerId,
    model: result.model,
    latencyMs: result.latencyMs,
    attempts: result.attempts || [],
    citations: result.citations || []
  };
}

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.', requestId });
    const access = authorize(req);
    if (!access.ok) return sendJson(res, access.status, { error: access.error, requestId });
    const limiter = rateLimit(req);
    if (!limiter.ok) return sendJson(res, limiter.status, { error: limiter.error, requestId });

    const body = await readJsonBody(req);
    const action = cleanString(body.action, 30);
    const prompt = cleanString(body.prompt, 12000);
    const projectMode = body.mode === 'general' ? 'general' : 'website';
    const profile = body.profile && typeof body.profile === 'object' ? body.profile : {};
    const concept = body.concept && typeof body.concept === 'object' ? body.concept : {};
    const outputFormat = ['auto', 'static', 'single-html', 'nextjs'].includes(body.outputFormat) ? body.outputFormat : 'static';
    const modelIds = Array.isArray(body.modelIds) ? body.modelIds.slice(0, 12) : [];
    const roster = providerRoster(modelIds);
    const slot = clampInt(body.slot, 0, 30, 0);
    const providers = providersForSlot(roster, slot);
    if (!prompt) return sendJson(res, 400, { error: 'Enter a project request.', requestId });
    if (!roster.length) return sendJson(res, 503, { error: 'No AI provider is configured. Add OPENROUTER_API_KEY in Vercel.', requestId });

    if (action === 'concepts') {
      const result = await callWithinBudget(providers, [
        {
          role: 'system',
          content: 'You are a world-class web Creative Director. Return JSON only with exactly this shape: {"concepts":[{"id":"kebab-case","name":"2-4 word concept name","tagline":"one sentence","palette":["#hex","#hex","#hex"],"layout":"specific composition system","motion":"specific motion system","signature":"one unique repeatable visual motif","why":"why it fits"}]}. Produce exactly three genuinely different, buildable website directions. Avoid generic purple gradients, floating blobs, repetitive card grids, and vague words like modern or sleek unless supported by specific design decisions. Each concept must have a distinct layout, palette, signature motif, and interaction approach.'
        },
        {
          role: 'user',
          content: `PROJECT INFORMATION:\n${prompt || '(No detailed business information yet.)'}\n\nWEBSITE ARCHITECT ANSWERS:\n${JSON.stringify(profile)}\n\nGenerate three original design systems that fit these choices and can be implemented without external design libraries.`
        }
      ], { temperature: 0.82, maxTokens: 2300, totalBudgetMs: 52000, maxAttemptMs: 43000 });
      const concepts = normalizeConcepts(extractJson(result.content));
      return sendJson(res, 200, { requestId, action, concepts, ...meta(result) });
    }

    if (action === 'build') {
      const transcript = compactTranscript(body.workspace, 39000);
      const requestedSchema = outputFormat === 'single-html'
        ? 'Return exactly one file named index.html with all CSS and JavaScript embedded.'
        : outputFormat === 'nextjs'
          ? 'Return a compact Next.js project with package.json, app/page.tsx, app/globals.css, and any essential components.'
          : 'Return a deployable static multi-file project, normally index.html, styles.css, script.js, and README.md.';
      const modeInstruction = projectMode === 'website'
        ? 'You are the Frontend Developer in a website-first AI creative agency. Implement the approved design DNA as a consistent visual system. Reject generic AI website patterns: do not default to a purple gradient hero, floating blobs, or a repetitive service-card grid as the main composition. Use distinctive typography, layout, imagery direction, interaction, and mobile behavior tied to this specific project.'
        : 'You are the Frontend Developer in a collaborative AI development studio. Follow the shared project plan and create the requested usable project files without forcing website-specific patterns onto unrelated work.';
      const result = await callWithinBudget(providers, [
        {
          role: 'system',
          content: `${modeInstruction} Build actual project files, not a description. Return JSON only with this exact shape: {"projectName":"kebab-case name","projectType":"static|single-html|nextjs","entryFile":"index.html or app/page.tsx","summary":"what was built","files":[{"path":"relative/path","content":"complete file contents"}],"notes":["optional note"]}. ${requestedSchema} Every file must be complete and usable. Do not wrap JSON in markdown. Do not claim a file exists unless it is included. Preserve all factual constraints from the original request and team transcript. Avoid unsupported claims.`
        },
        {
          role: 'user',
          content: `ORIGINAL PROJECT REQUEST:\n${prompt}\n\nVISIBLE TEAM WORK:\n${transcript || '(No prior team messages.)'}\n\nBuild the project now. The JSON files are the deliverable.`
        }
      ], { temperature: 0.22, maxTokens: 12000, totalBudgetMs: 56000, maxAttemptMs: 47000 });
      const fallbackName = cleanString(body.projectName, 80) || 'ai-project';
      const project = salvageProject(result.content, outputFormat, fallbackName);
      if (!project.files.length) throw Object.assign(new Error('The developer model did not return usable project files.'), { attempts: result.attempts });
      return sendJson(res, 200, { requestId, action, project, rawLength: result.content.length, ...meta(result) });
    }

    if (action === 'review') {
      const project = cleanProject(body.project);
      const files = compactFiles(project, 50000);
      const transcript = compactTranscript(body.workspace, 12000);
      const result = await callWithinBudget(providers, [
        {
          role: 'system',
          content: `You are the QA Reviewer in an AI development studio. Review the ACTUAL files against the original request. Return JSON only: {"approved":true|false,"summary":"short assessment","issues":[{"severity":"critical|high|medium|low","file":"path or project","problem":"specific defect","fix":"specific correction"}]}. Check requirements, factual accuracy, usability, responsive design, accessibility, SEO, broken links, file completeness, and invented claims. ${projectMode === 'website' ? 'Also verify that the design follows the approved design DNA. Flag generic AI patterns, repeated card grids, template-like composition, weak mobile behavior, meaningless decorative gradients, and missing signature visual motifs.' : ''} Do not review imaginary features; inspect only the supplied files.`
        },
        {
          role: 'user',
          content: `ORIGINAL REQUEST:\n${prompt}\n\nEARLIER TEAM WORK:\n${transcript}\n\nACTUAL PROJECT FILES:\n${files}\n\nReturn the concrete QA report.`
        }
      ], { temperature: 0.08, maxTokens: 2600, totalBudgetMs: 52000, maxAttemptMs: 43000 });
      const review = normalizeReview(extractJson(result.content) || { approved: false, summary: result.content, issues: [] });
      return sendJson(res, 200, { requestId, action, review, ...meta(result) });
    }

    if (action === 'repair' || action === 'apply') {
      const project = cleanProject(body.project);
      if (!project.files.length) return sendJson(res, 400, { error: 'No project files were supplied.', requestId });
      const files = compactFiles(project, 52000);
      const review = normalizeReview(body.review);
      const customInstruction = cleanString(body.customInstruction, 5000);
      const result = await callWithinBudget(providers, [
        {
          role: 'system',
          content: `You are the Fixer Developer. Modify the ACTUAL project files to resolve the review and user instruction. Return the COMPLETE updated project as JSON only using: {"projectName":"...","projectType":"static|single-html|nextjs","entryFile":"...","summary":"...","files":[{"path":"...","content":"complete updated content"}],"notes":["..."]}. Include every file that should remain in the project, even unchanged files. Do not return patches, prose, or markdown. ${projectMode === 'website' ? 'Preserve or strengthen the approved design DNA and remove generic template patterns.' : 'Preserve the correct shared project decisions.'}`
        },
        {
          role: 'user',
          content: `ORIGINAL REQUEST:\n${prompt}\n\nCURRENT PROJECT:\n${files}\n\nQA REVIEW:\n${JSON.stringify(review)}\n\nADDITIONAL TEAM OR USER INSTRUCTION:\n${customInstruction || '(none)'}\n\nReturn the complete corrected project JSON.`
        }
      ], { temperature: 0.12, maxTokens: 12000, totalBudgetMs: 56000, maxAttemptMs: 47000 });
      const updated = salvageProject(result.content, project.projectType, project.projectName);
      if (!updated.files.length) throw Object.assign(new Error('The fixer did not return usable project files.'), { attempts: result.attempts });
      return sendJson(res, 200, { requestId, action, project: updated, ...meta(result) });
    }

    if (action === 'validate') {
      const project = cleanProject(body.project);
      const deterministic = deterministicValidation(project, prompt);
      const files = compactFiles(project, 36000);
      let ai = { passed: deterministic.passed, summary: 'AI validation was skipped.', concerns: [] };
      let result = null;
      try {
        result = await callWithinBudget(providers, [
          {
            role: 'system',
            content: 'You are the Release Validator. Inspect the supplied project files and deterministic checks. Return JSON only: {"passed":true|false,"summary":"release assessment","concerns":["specific remaining concern"]}. Do not claim you ran a browser or external service. Base the assessment only on the files and checks shown.'
          },
          {
            role: 'user',
            content: `ORIGINAL REQUEST:\n${prompt}\n\nDETERMINISTIC CHECKS:\n${JSON.stringify(deterministic)}\n\nPROJECT FILES:\n${files}`
          }
        ], { temperature: 0.05, maxTokens: 1200, totalBudgetMs: 44000, maxAttemptMs: 36000 });
        const parsed = extractJson(result.content);
        if (parsed) {
          ai = {
            passed: Boolean(parsed.passed),
            summary: cleanString(parsed.summary, 900) || 'AI validation completed.',
            concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map((item) => cleanString(item, 500)).filter(Boolean).slice(0, 16) : []
          };
        }
      } catch (error) {
        result = { providerName: 'Validator unavailable', providerId: 'none', model: 'not completed', latencyMs: 0, attempts: error?.attempts || [], citations: [] };
        ai = { passed: deterministic.passed, summary: 'The model validator did not complete; deterministic checks are still shown.', concerns: [error?.message || 'AI validation failed.'] };
      }
      const report = {
        passed: deterministic.passed && ai.passed,
        score: deterministic.score,
        deterministic,
        ai,
        generatedAt: new Date().toISOString()
      };
      return sendJson(res, 200, { requestId, action, report, ...meta(result) });
    }

    return sendJson(res, 400, { error: 'Unknown project action.', requestId });
  } catch (error) {
    return sendJson(res, 500, {
      error: error?.name === 'AbortError' ? 'This project step timed out.' : error?.message || 'The project step failed.',
      attempts: error?.attempts || [],
      requestId
    });
  }
}

export { cleanProject, salvageProject, deterministicValidation, normalizeReview, normalizeConcepts };
