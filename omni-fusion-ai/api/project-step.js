import crypto from 'node:crypto';
import { sendJson, readJsonBody } from '../server/lib/http.js';
import { authorize, rateLimit, cleanString, clampInt } from '../server/lib/security.js';
import { callProvider } from '../server/providers/runtime.js';
import { resolvePrimeProviders, providersForPrimeStep } from '../server/providers/prime-router.js';
import { contractInstruction, normalizeAgentContract, validateAgentContract, contractMeta } from '../server/lib/contracts.js';
import { auditProjectSecurity } from '../server/lib/security-audit.js';
import { relevantMemoryText } from '../server/lib/project-memory.js';
import { patternLibraryText } from '../server/lib/website-patterns.js';

export const config = { maxDuration: 60 };

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

async function callWithinBudget(providers, messages, options = {}) {
  const attempts = [];
  const totalBudgetMs = clampInt(options.totalBudgetMs, 12000, 42000, 39000);
  const maxAttemptMs = clampInt(options.maxAttemptMs, 7000, 31000, 28000);
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


function parseAgentContract(raw, expectedType) {
  const parsed = extractJson(raw);
  const contract = normalizeAgentContract(parsed || {}, expectedType);
  const validation = validateAgentContract(contract, expectedType);
  return { parsed, contract, validation, payload: contract.payload || {} };
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

function normalizePatches(input) {
  const source = input && typeof input === 'object' ? input : {};
  return (Array.isArray(source.patches) ? source.patches : []).slice(0, 24).map((patch) => ({
    path: safePath(patch?.path, ''),
    search: typeof patch?.search === 'string' ? patch.search.slice(0, 40000) : '',
    replace: typeof patch?.replace === 'string' ? patch.replace.slice(0, 50000) : '',
    reason: cleanString(patch?.reason, 500)
  })).filter((patch) => patch.path && patch.search && patch.search !== patch.replace);
}

function applyExactPatches(project, patches = []) {
  const output = cleanProject(project, project?.projectName || 'ai-project');
  const fileMap = new Map(output.files.map((file) => [file.path, file]));
  const applied = [];
  const rejected = [];
  for (const patch of normalizePatches({ patches })) {
    const file = fileMap.get(patch.path);
    if (!file) { rejected.push({ ...patch, error: 'File not found.' }); continue; }
    const occurrences = file.content.split(patch.search).length - 1;
    if (occurrences !== 1) {
      rejected.push({ ...patch, error: occurrences === 0 ? 'Exact search text was not found.' : `Search text matched ${occurrences} times.` });
      continue;
    }
    file.content = file.content.replace(patch.search, patch.replace);
    applied.push({ path: patch.path, reason: patch.reason, removedChars: patch.search.length, addedChars: patch.replace.length });
  }
  return { project: output, applied, rejected };
}

function analyzeContactForm(project, prompt = '') {
  const p = cleanProject(project);
  const combined = p.files.map((file) => file.content).join('\n');
  const entry = p.files.find((file) => file.path === p.entryFile)?.content || p.files.find((file) => /\.html?$/i.test(file.path))?.content || '';
  const forms = [...entry.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
  const requested = /(?:contact|estimate|quote|booking|inquiry|request)\s+form|form\s+(?:for|to)\s+(?:contact|estimate|quote|booking|inquiry)|collect\s+(?:estimate|quote|contact)\s+requests?/i.test(String(prompt));
  if (!forms.length) {
    return { present: false, requested, working: !requested, status: requested ? 'Missing' : 'Not requested', method: 'none', destination: '', detail: requested ? 'The request calls for a contact or estimate form, but no form exists.' : 'No form was requested.' };
  }
  const workingSignals = [];
  let destination = '';
  let method = 'unknown';
  for (const match of forms) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const action = attrs.match(/\baction=["']([^"']+)["']/i)?.[1] || '';
    const demo = /data-(?:demo-form|form-mode)=["'](?:true|demo)["']/i.test(attrs) || /demo form|demonstration only/i.test(body);
    if (/^mailto:/i.test(action)) { workingSignals.push('email action'); destination ||= action.replace(/^mailto:/i, ''); method = 'email'; }
    else if (/^https?:\/\//i.test(action) && !/example\.com|localhost/i.test(action)) { workingSignals.push('external endpoint'); destination ||= action; method = 'endpoint'; }
    else if (demo) { workingSignals.push('clearly labeled demo'); method = 'demo'; }
  }
  if (/addEventListener\s*\(\s*["']submit["']|onsubmit\s*=|\.onsubmit\s*=|new\s+FormData\s*\(/i.test(combined) && /fetch\s*\(|XMLHttpRequest|formspree|web3forms|mailto:|sms:|location\.(?:href|assign)|window\.open\s*\(/i.test(combined)) {
    workingSignals.push('JavaScript submission handler');
    if (/sms:/i.test(combined)) method = 'text message';
    else if (/mailto:/i.test(combined)) method = 'email';
    else if (/fetch\s*\(/i.test(combined)) method = 'JavaScript endpoint';
  }
  const working = workingSignals.length > 0;
  return { present: true, requested, working, status: working ? (method === 'demo' ? 'Clearly labeled demo' : 'Working behavior detected') : 'No submission behavior detected', method, destination, detail: working ? `Detected ${workingSignals.join(' and ')}${destination ? ` to ${destination}` : ''}.` : 'The form has fields, but no valid action, endpoint, text/email behavior, or clearly labeled demo mode was found.' };
}

function deterministicValidation(project, prompt = '', mediaPaths = [], options = {}) {
  const p = cleanProject(project);
  const checks = [];
  const add = (name, passed, detail, severity = 'medium') => checks.push({ name, passed: Boolean(passed), detail, severity });
  const fileMap = new Map(p.files.map((file) => [file.path, file.content]));
  const virtualMedia = new Set((Array.isArray(mediaPaths) ? mediaPaths : []).map((path) => safePath(path, '')).filter(Boolean));
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
  const missingRefs = localRefs.filter((ref) => !fileMap.has(ref) && !virtualMedia.has(ref) && !ref.startsWith('/'));
  add('Local asset references', missingRefs.length === 0, missingRefs.length ? `Missing: ${unique(missingRefs).join(', ')}` : 'All local references resolve.', 'high');

  let jsSyntaxOk = true;
  const jsErrors = [];
  for (const file of p.files.filter((item) => /\.m?js$/i.test(item.path))) {
    try { new Function(file.content); } catch (error) { jsSyntaxOk = false; jsErrors.push(`${file.path}: ${error.message}`); }
  }
  add('JavaScript syntax', jsSyntaxOk, jsSyntaxOk ? 'No JavaScript syntax errors detected.' : jsErrors.join(' | '), 'high');

  const promptDigits = unique(String(prompt).match(/\d[\d()\-\s]{6,}\d/g) || []);
  const combined = p.files.map((file) => file.content).join('\n');
  if (virtualMedia.size) {
    const unusedMedia = [...virtualMedia].filter((path) => !combined.includes(path));
    add('Uploaded pictures used', unusedMedia.length === 0, unusedMedia.length ? `Uploaded asset(s) not referenced: ${unusedMedia.join(', ')}` : 'Every uploaded picture is referenced by the website files.', 'high');
  }
  const missingDigits = promptDigits.filter((value) => !combined.includes(value.trim()));
  if (promptDigits.length) add('Required contact details', missingDigits.length === 0, missingDigits.length ? `Missing requested value(s): ${missingDigits.join(', ')}` : 'Requested numeric contact details are present.', 'high');

  const contactForm = analyzeContactForm(p, prompt);
  add('Contact form behavior', contactForm.working, contactForm.detail, contactForm.requested ? 'high' : 'medium');

  if (/\.html?$/i.test(p.entryFile) || p.projectType !== 'nextjs') {
    add('Meta description', /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{30,}["']/i.test(entry) || /<meta[^>]+content=["'][^"']{30,}["'][^>]+name=["']description["']/i.test(entry), 'A descriptive meta description should be present.', 'medium');
    const localBusinessRequested = /local|service area|business|company|contractor|painter|restaurant|salon|store/i.test(String(prompt));
    if (localBusinessRequested) add('Structured data', /application\/ld\+json/i.test(entry) && /LocalBusiness|Organization|ProfessionalService|Store|Restaurant/i.test(entry), 'Relevant JSON-LD structured data should be included using only verified facts.', 'low');
  }

  const placeholders = combined.match(/\b(?:TODO|LOREM IPSUM|YOUR COMPANY|PLACEHOLDER TEXT)\b/gi) || [];
  add('No accidental placeholders', placeholders.length === 0, placeholders.length ? `${placeholders.length} placeholder markers remain.` : 'No common accidental placeholders detected.', 'low');

  const unsupportedClaimPatterns = [
    ['licensed', /\blicensed\b/i], ['insured', /\binsured\b/i], ['bonded', /\bbonded\b/i],
    ['guarantee', /\b(?:guaranteed|lifetime guarantee|money-back guarantee)\b/i],
    ['years in business', /\b(?:\d{1,3}\+? years|since 19\d{2}|since 20\d{2})\b/i],
    ['award claim', /\b(?:award-winning|#1|number one|best in)\b/i],
    ['family-owned', /\bfamily[- ]owned\b/i]
  ];
  const unsupportedClaims = unsupportedClaimPatterns
    .filter(([, pattern]) => pattern.test(combined) && !pattern.test(String(prompt)))
    .map(([name]) => name);
  add('No unsupported business claims', unsupportedClaims.length === 0, unsupportedClaims.length ? `Claims not supplied by the user: ${unsupportedClaims.join(', ')}` : 'No common unsupported trust claims were detected.', 'high');

  if (/<img\b/i.test(combined)) {
    const images = [...combined.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    const missingAlt = images.filter((tag) => !/\balt=["'][^"']*["']/i.test(tag));
    add('Image alternative text', missingAlt.length === 0, missingAlt.length ? `${missingAlt.length} image tag(s) are missing alt text.` : 'Every image tag has an alt attribute.', 'medium');
  }

  const internalLinks = [...entry.matchAll(/href=["']#([^"']+)["']/gi)].map((match) => match[1]);
  const missingAnchors = internalLinks.filter((id) => !new RegExp(`id=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(entry));
  if (internalLinks.length) add('Internal navigation targets', missingAnchors.length === 0, missingAnchors.length ? `Missing section IDs: ${unique(missingAnchors).join(', ')}` : 'Every hash link has a matching section target.', 'medium');

  const cssText = p.files.filter((file) => /\.css$/i.test(file.path)).map((file) => file.content).join('\n') + '\n' + entry;
  const openingBraces = (cssText.match(/{/g) || []).length;
  const closingBraces = (cssText.match(/}/g) || []).length;
  add('CSS structure', openingBraces === closingBraces, openingBraces === closingBraces ? 'CSS braces are balanced.' : `CSS brace mismatch: ${openingBraces} opening and ${closingBraces} closing.`, 'high');

  const genericSignals = [
    /linear-gradient\([^)]*(?:#?7c3aed|#?8b5cf6|purple)/i.test(cssText),
    /class=["'][^"']*(?:blob|floating-orb|gradient-orb)/i.test(entry),
    ((entry.match(/class=["'][^"']*card/gi) || []).length >= 10)
  ].filter(Boolean).length;
  add('Anti-generic design check', genericSignals < 2, genericSignals >= 2 ? 'The build combines multiple common AI-template signals; the reviewer should replace the generic composition.' : 'No strong cluster of generic AI-template signals was detected.', 'medium');

  const security = auditProjectSecurity(p, { approvedDomains: Array.isArray(options.approvedDomains) ? options.approvedDomains : [] });
  for (const check of security.checks) add(`Security: ${check.name}`, check.passed, check.detail, check.severity);

  const browserChecks = Array.isArray(options.browserAudit?.checks) ? options.browserAudit.checks : [];
  for (const check of browserChecks) add(`Browser: ${cleanString(check.name, 100) || 'runtime check'}`, check.passed, cleanString(check.detail, 700), check.severity || 'medium');

  const requiredReleaseFiles = ['README.md', 'robots.txt', '404.html'];
  const missingReleaseFiles = requiredReleaseFiles.filter((path) => !fileMap.has(path));
  add('Production support files', missingReleaseFiles.length === 0, missingReleaseFiles.length ? `Missing production support file(s): ${missingReleaseFiles.join(', ')}. The packager can add safe defaults, but keeping them in the project makes the release transparent.` : 'README, robots.txt, and 404.html are present.', 'low');

  const criticalFailures = checks.filter((check) => !check.passed && ['critical', 'high'].includes(check.severity));
  const passedCount = checks.filter((check) => check.passed).length;
  return {
    passed: criticalFailures.length === 0,
    score: Math.round((passedCount / Math.max(checks.length, 1)) * 100),
    checks,
    criticalFailures: criticalFailures.length,
    contactForm,
    security,
    browserAudit: options.browserAudit || null
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
    const prompt = cleanString(body.prompt, 24000);
    const projectMode = body.mode === 'general' ? 'general' : 'website';
    const profile = body.profile && typeof body.profile === 'object' ? body.profile : {};
    const concept = body.concept && typeof body.concept === 'object' ? body.concept : {};
    const sourceUnderstanding = body.sourceUnderstanding && typeof body.sourceUnderstanding === 'object' ? body.sourceUnderstanding : {};
    const importedSite = body.importedSite && typeof body.importedSite === 'object' ? body.importedSite : {};
    const sourceContext = cleanString(JSON.stringify({
      exactName: sourceUnderstanding.exactName || '',
      researchStatus: sourceUnderstanding.researchStatus || '',
      publicSource: importedSite.sourceUrl || '',
      publicTitle: importedSite.title || '',
      publicDescription: importedSite.description || '',
      publicHeadings: Array.isArray(importedSite.headings) ? importedSite.headings.slice(0, 12) : [],
      publicPhones: Array.isArray(importedSite.phones) ? importedSite.phones.slice(0, 8) : [],
      publicEmails: Array.isArray(importedSite.emails) ? importedSite.emails.slice(0, 8) : []
    }, null, 2), 12000);
    const sourcePolicy = 'Treat materials supplied directly by the user as user-authorized project inputs. Preserve exact business, brand, product, and project names. Do not invent replacement names or reject supplied material merely because it may be copyrighted. Do not claim the material is public domain or legally uncopyrighted. Third-party references may guide principles but must not be copied exactly unless the user explicitly states authorization.';
    const memoryContext = relevantMemoryText(body.memoryContext || {}, cleanString(body.memoryRole, 100) || 'AI teammate', 12000);
    const outputFormat = ['auto', 'static', 'single-html', 'nextjs'].includes(body.outputFormat) ? body.outputFormat : 'static';
    const modelIds = Array.isArray(body.modelIds) ? body.modelIds.slice(0, 12) : [];
    const taskRole = action === 'concepts' ? 'creative'
      : action === 'build' || action === 'repair' || action === 'apply' || action === 'patch' ? 'builder'
        : action === 'review' || action === 'validate' ? 'reviewer'
          : 'lead';
    const roster = await resolvePrimeProviders({ modelIds, taskRole, prompt, desiredCount: 5, excludeIds: body.excludeModelIds, performanceHints: body.modelPerformance || {} });
    const slot = clampInt(body.slot, 0, 30, 0);
    const providers = providersForPrimeStep(roster, slot);
    const patternText = projectMode === 'website' ? patternLibraryText({ prompt, concept: body.concept || {}, count: 6 }) : '';
    if (!prompt) return sendJson(res, 400, { error: 'Enter a project request.', requestId });
    if (!roster.length) return sendJson(res, 503, { error: 'No AI provider is configured. Add OPENROUTER_API_KEY in Vercel.', requestId });

    if (action === 'concepts') {
      const result = await callWithinBudget(providers, [
        {
          role: 'system',
          content: `You are a world-class web Creative Director. ${sourcePolicy} ${contractInstruction('concepts', 'Creative Director')} The payload must be exactly {"concepts":[{"id":"kebab-case","name":"2-4 word concept name","tagline":"one sentence","palette":["#hex","#hex","#hex"],"layout":"specific composition system","motion":"specific motion system","signature":"one unique repeatable visual motif","why":"why it fits"}]}. Produce exactly three genuinely different, buildable website directions. Avoid generic purple gradients, floating blobs, repetitive card grids, and vague words like modern or sleek unless supported by specific design decisions. Each concept must have a distinct layout, palette, signature motif, and interaction approach. Use the internal pattern library as inspiration, but combine and transform patterns rather than copying one unchanged.\n\nCURATED BUILDABLE PATTERNS:\n${patternText}`
        },
        {
          role: 'user',
          content: `PROJECT INFORMATION:\n${prompt || '(No detailed business information yet.)'}\n\nRELEVANT PROJECT MEMORY:\n${memoryContext || '(No saved memory yet.)'}\n\nWEBSITE ARCHITECT ANSWERS:\n${JSON.stringify(profile)}\n\nGenerate three original design systems that fit these choices and can be implemented without external design libraries.`
        }
      ], { temperature: 0.82, maxTokens: 2300, totalBudgetMs: 52000, maxAttemptMs: 43000 });
      const parsedContract = parseAgentContract(result.content, 'concepts');
      const concepts = normalizeConcepts(parsedContract.payload);
      return sendJson(res, 200, { requestId, action, concepts, contract: parsedContract.contract, ...contractMeta(parsedContract.contract, parsedContract.validation), ...meta(result) });
    }

    if (action === 'build') {
      const transcript = compactTranscript(body.workspace, 39000);
      const requestedSchema = outputFormat === 'single-html'
        ? 'Return exactly one file named index.html with all CSS and JavaScript embedded.'
        : outputFormat === 'nextjs'
          ? 'Return a compact Next.js project with package.json, app/page.tsx, app/globals.css, and any essential components.'
          : 'Return a deployable static multi-file project, normally index.html, styles.css, script.js, and README.md.';
      const modeInstruction = projectMode === 'website'
        ? 'You are the Frontend Developer in a website-first AI creative agency. Implement the approved design DNA as a consistent visual system. Reject generic AI website patterns: do not default to a purple gradient hero, floating blobs, or a repetitive service-card grid as the main composition. Use distinctive typography, layout, imagery direction, interaction, and mobile behavior tied to this specific project. Draw from the supplied curated component patterns, transform them for this business, and never stack unrelated patterns just to appear creative.'
        : 'You are the Frontend Developer in a collaborative AI development studio. Follow the shared project plan and create the requested usable project files without forcing website-specific patterns onto unrelated work.';
      const result = await callWithinBudget(providers, [
        {
          role: 'system',
          content: `${modeInstruction} ${sourcePolicy} Build actual project files, not a description. ${contractInstruction('project', 'Frontend Developer')} The payload must use exactly this shape: {"projectName":"kebab-case name","projectType":"static|single-html|nextjs","entryFile":"index.html or app/page.tsx","summary":"what was built","files":[{"path":"relative/path","content":"complete file contents"}],"notes":["optional note"]}. ${requestedSchema} Every file must be complete and usable. Do not claim a file exists unless it is included. Preserve all factual constraints from the original request, relevant memory, and team transcript. Use the exact supplied business or project name in visible copy, metadata, and structured data; never invent a replacement name. Avoid unsupported claims.`
        },
        {
          role: 'user',
          content: `ORIGINAL PROJECT REQUEST:\n${prompt}\n\nRELEVANT PROJECT MEMORY:\n${memoryContext || '(No saved memory yet.)'}\n\nVISIBLE TEAM WORK:\n${transcript || '(No prior team messages.)'}\n\nCURATED COMPONENT PATTERNS TO ADAPT:\n${patternText || '(Not a website project.)'}\n\nBuild the project now. The structured project files are the deliverable.`
        }
      ], { temperature: 0.22, maxTokens: 12000, totalBudgetMs: 56000, maxAttemptMs: 47000 });
      const fallbackName = cleanString(body.projectName, 80) || 'ai-project';
      const parsedContract = parseAgentContract(result.content, 'project');
      const project = salvageProject(JSON.stringify(parsedContract.payload), outputFormat, fallbackName);
      if (!project.files.length || parsedContract.contract.status === 'blocked') throw Object.assign(new Error(parsedContract.contract.remainingIssues?.[0] || 'The developer model did not return usable project files.'), { attempts: result.attempts });
      return sendJson(res, 200, { requestId, action, project, contract: parsedContract.contract, rawLength: result.content.length, ...contractMeta(parsedContract.contract, parsedContract.validation), ...meta(result) });
    }

    if (action === 'review') {
      const project = cleanProject(body.project);
      const files = compactFiles(project, 50000);
      const transcript = compactTranscript(body.workspace, 12000);
      const result = await callWithinBudget(providers, [
        {
          role: 'system',
          content: `You are the QA Reviewer in an AI development studio. Review the ACTUAL files against the original request. ${sourcePolicy} ${contractInstruction('review', 'QA Reviewer')} The payload must be {"approved":true|false,"summary":"short assessment","issues":[{"severity":"critical|high|medium|low","file":"path or project","problem":"specific defect","fix":"specific correction"}]}. Check requirements, factual accuracy, usability, responsive design, accessibility, SEO, broken links, file completeness, and invented claims. ${projectMode === 'website' ? 'Also verify that the design follows the approved design DNA and makes coherent use of at least one project-specific composition pattern. Flag generic AI patterns, repeated card grids, template-like composition, weak mobile behavior, meaningless decorative gradients, and missing signature visual motifs.' : ''} Do not review imaginary features; inspect only the supplied files.`
        },
        {
          role: 'user',
          content: `ORIGINAL REQUEST:\n${prompt}\n\nRELEVANT PROJECT MEMORY:\n${memoryContext || '(No saved memory yet.)'}\n\nEARLIER TEAM WORK:\n${transcript}\n\nACTUAL PROJECT FILES:\n${files}\n\nReturn the concrete QA report.`
        }
      ], { temperature: 0.08, maxTokens: 2600, totalBudgetMs: 52000, maxAttemptMs: 43000 });
      const parsedContract = parseAgentContract(result.content, 'review');
      const review = normalizeReview(parsedContract.payload || { approved: false, summary: parsedContract.contract.summary || result.content, issues: [] });
      return sendJson(res, 200, { requestId, action, review, contract: parsedContract.contract, ...contractMeta(parsedContract.contract, parsedContract.validation), ...meta(result) });
    }

    if (action === 'patch') {
      const project = cleanProject(body.project);
      if (!project.files.length) return sendJson(res, 400, { error: 'No project files were supplied.', requestId });
      const files = compactFiles(project, 52000);
      const customInstruction = cleanString(body.customInstruction, 6000);
      const result = await callWithinBudget(providers, [
        { role: 'system', content: `You are a surgical code editor. ${contractInstruction('patches', 'Surgical Code Editor')} The payload must be {"summary":"what changed","patches":[{"path":"existing/file.ext","search":"exact existing text copied verbatim","replace":"complete replacement text","reason":"why"}]}. Make the smallest safe changes needed. Each search string must occur exactly once in the supplied file. Never return entire files, markdown, line numbers, ellipses, or prose outside JSON. Preserve unrelated code and the existing design system.` },
        { role: 'user', content: `ORIGINAL REQUEST:\n${prompt}\n\nRELEVANT PROJECT MEMORY:\n${memoryContext || '(No saved memory yet.)'}\n\nCURRENT PROJECT FILES:\n${files}\n\nPRECISE CHANGE REQUEST:\n${customInstruction || '(none)'}\n\nReturn exact search-and-replace patches only.` }
      ], { temperature: 0.06, maxTokens: 5200, totalBudgetMs: 50000, maxAttemptMs: 41000 });
      const parsedContract = parseAgentContract(result.content, 'patches');
      const parsed = parsedContract.payload || {};
      const patches = normalizePatches(parsed);
      const patched = applyExactPatches(project, patches);
      if (!patched.applied.length) {
        const explanation = patched.rejected[0]?.error || 'The model did not return a safe exact patch.';
        throw Object.assign(new Error(`No precise edit could be applied. ${explanation}`), { attempts: result.attempts });
      }
      const changedFiles = unique(patched.applied.map((item) => item.path));
      return sendJson(res, 200, { requestId, action, project: patched.project, patches: patched.applied, rejectedPatches: patched.rejected, changedFiles, summary: cleanString(parsed.summary, 800) || `Patched ${changedFiles.length} file(s).`, contract: parsedContract.contract, ...contractMeta(parsedContract.contract, parsedContract.validation), ...meta(result) });
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
          content: `You are the Fixer Developer. ${sourcePolicy} Modify the ACTUAL project files to resolve the review and user instruction. ${contractInstruction('project', 'Fixer Developer')} The payload must be {"projectName":"...","projectType":"static|single-html|nextjs","entryFile":"...","summary":"...","files":[{"path":"...","content":"complete updated content"}],"notes":["..."]}. Include every file that should remain in the project, even unchanged files. Do not return patches, prose, or markdown. ${projectMode === 'website' ? 'Preserve or strengthen the approved design DNA and remove generic template patterns.' : 'Preserve the correct shared project decisions.'}`
        },
        {
          role: 'user',
          content: `ORIGINAL REQUEST:\n${prompt}\n\nRELEVANT PROJECT MEMORY:\n${memoryContext || '(No saved memory yet.)'}\n\nCURRENT PROJECT:\n${files}\n\nQA REVIEW:\n${JSON.stringify(review)}\n\nADDITIONAL TEAM OR USER INSTRUCTION:\n${customInstruction || '(none)'}\n\nReturn the complete corrected project JSON.`
        }
      ], { temperature: 0.12, maxTokens: 12000, totalBudgetMs: 56000, maxAttemptMs: 47000 });
      const parsedContract = parseAgentContract(result.content, 'project');
      const updated = salvageProject(JSON.stringify(parsedContract.payload), project.projectType, project.projectName);
      if (!updated.files.length || parsedContract.contract.status === 'blocked') throw Object.assign(new Error(parsedContract.contract.remainingIssues?.[0] || 'The fixer did not return usable project files.'), { attempts: result.attempts });
      return sendJson(res, 200, { requestId, action, project: updated, contract: parsedContract.contract, ...contractMeta(parsedContract.contract, parsedContract.validation), ...meta(result) });
    }

    if (action === 'validate') {
      const project = cleanProject(body.project);
      const deterministic = deterministicValidation(project, prompt, body.mediaPaths, { browserAudit: body.browserAudit, approvedDomains: body.approvedDomains });
      const files = compactFiles(project, 36000);
      const useAiValidation = body.aiValidation === true;
      let ai = { passed: deterministic.passed, summary: 'Prime Free used deterministic validation to save an AI request.', concerns: [] };
      let result = { providerName: 'Deterministic validator', providerId: 'deterministic', model: 'local-release-checks', latencyMs: 0, attempts: [], citations: [] };
      if (useAiValidation) try {
        result = await callWithinBudget(providers, [
          {
            role: 'system',
            content: `You are the Release Validator. Inspect the supplied project files and deterministic checks. ${contractInstruction('validation', 'Release Validator')} The payload must be {"passed":true|false,"summary":"release assessment","concerns":["specific remaining concern"]}. Do not claim you ran a browser or external service. Base the assessment only on the files and checks shown.`
          },
          {
            role: 'user',
            content: `ORIGINAL REQUEST:\n${prompt}\n\nRELEVANT PROJECT MEMORY:\n${memoryContext || '(No saved memory yet.)'}\n\nDETERMINISTIC CHECKS:\n${JSON.stringify(deterministic)}\n\nPROJECT FILES:\n${files}`
          }
        ], { temperature: 0.05, maxTokens: 1200, totalBudgetMs: 44000, maxAttemptMs: 36000 });
        const parsedContract = parseAgentContract(result.content, 'validation');
        const parsed = parsedContract.payload;
        if (parsed) {
          ai = {
            passed: Boolean(parsed.passed),
            summary: cleanString(parsed.summary, 900) || parsedContract.contract.summary || 'AI validation completed.',
            concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map((item) => cleanString(item, 500)).filter(Boolean).slice(0, 16) : []
          };
          result.contract = parsedContract.contract;
          result.contractValidation = parsedContract.validation;
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
        contactForm: deterministic.contactForm,
        security: deterministic.security,
        browserAudit: deterministic.browserAudit,
        generatedAt: new Date().toISOString()
      };
      return sendJson(res, 200, { requestId, action, report, ...(result.contract ? contractMeta(result.contract, result.contractValidation) : {}), ...meta(result) });
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

export { cleanProject, salvageProject, deterministicValidation, normalizeReview, normalizeConcepts, normalizePatches, applyExactPatches, analyzeContactForm, parseAgentContract, auditProjectSecurity };
