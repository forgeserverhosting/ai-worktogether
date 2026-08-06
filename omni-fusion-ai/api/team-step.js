import crypto from 'node:crypto';
import { sendJson, readJsonBody } from '../server/lib/http.js';
import { authorize, rateLimit, cleanString, clampInt } from '../server/lib/security.js';
import { callProvider, configuredProviders } from '../server/providers/runtime.js';
import { getOpenRouterCatalog, openRouterAllowPaid, openRouterFallbackProvider, openRouterVirtualProvider } from '../server/providers/openrouter.js';
import { inferIntent, fallbackRoles, parseJsonObject } from '../server/lib/routing.js';

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
    env: 'OPENROUTER_API_KEY',
    key: process.env.OPENROUTER_API_KEY,
    model: id,
    type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    strengths: ['general', 'creative', 'reasoning', 'code', 'research', 'writing'],
    priority: id === 'openrouter/free' ? 4 : 10,
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

async function visionProviderRoster(modelIds = []) {
  if (!process.env.OPENROUTER_API_KEY) return [];
  const catalog = await getOpenRouterCatalog();
  const allowPaid = openRouterAllowPaid();
  const requested = new Set(modelIds.map((id) => String(id || '').replace(/^or:/, '')));
  const visionModels = (catalog.models || []).filter((model) => model.canChat && model.inputModalities?.includes('image') && (allowPaid || model.free));
  const selected = requested.size ? visionModels.filter((model) => requested.has(model.id)) : [];
  const pool = [...selected, ...visionModels].filter((model, index, items) => items.findIndex((item) => item.id === model.id) === index).slice(0, 8);
  const providers = pool.map(openRouterVirtualProvider);
  providers.push(openRouterFallbackProvider());
  return providers.filter((provider, index, items) => items.findIndex((item) => `${item.id}:${item.model}` === `${provider.id}:${provider.model}`) === index);
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
    const timeoutMs = Math.max(4500, Math.min(maxAttemptMs, remaining - 2200));
    try {
      const result = await callProvider(provider, messages, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        timeoutMs
      });
      const attempt = {
        providerId: provider.id,
        providerName: provider.name,
        requestedModel: provider.model,
        actualModel: result.model,
        success: true,
        latencyMs: Date.now() - attemptStarted
      };
      attempts.push(attempt);
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

  const error = new Error(lastError?.message || 'No model completed this collaboration step.');
  error.attempts = attempts;
  throw error;
}

function trimWorkspace(messages, maxChars = 32000) {
  const safe = Array.isArray(messages) ? messages.slice(-24) : [];
  const blocks = safe.map((message, index) => {
    const header = `[${index + 1}] ${cleanString(message.from, 80) || 'AI'} → ${cleanString(message.to, 80) || 'Team'} (${cleanString(message.kind, 40) || 'message'})`;
    return `${header}\n${cleanString(message.content, 9000)}`;
  });
  return blocks.join('\n\n---\n\n').slice(-maxChars);
}

function collaborationRoles(intent, count) {
  const base = fallbackRoles(intent, Math.max(count, 4));
  const leadByIntent = {
    code: ['Lead Architect', 'Define the implementation plan, interfaces, constraints, and acceptance criteria.'],
    creative: ['Creative Lead', 'Define the central concept, audience, tone, and success criteria.'],
    research: ['Research Lead', 'Define the research questions, evidence needs, and uncertainty boundaries.'],
    writing: ['Lead Editor', 'Define the document structure, voice, required facts, and quality bar.'],
    reasoning: ['Strategy Lead', 'Define the decision framework, constraints, and desired outcome.'],
    general: ['Team Lead', 'Define the task, constraints, deliverables, and quality bar.']
  };
  const [leadRole, leadInstruction] = leadByIntent[intent.primary] || leadByIntent.general;
  const roles = [{ role: leadRole, instruction: leadInstruction }];
  for (const item of base) {
    if (roles.length >= count - 1) break;
    if (item.role === leadRole || /review|critic|skeptic|test|quality/i.test(item.role)) continue;
    roles.push(item);
  }
  while (roles.length < count - 1) {
    roles.push({ role: `Specialist ${roles.length}`, instruction: 'Build on the shared transcript and contribute a concrete work product.' });
  }
  roles.push({ role: 'Quality Reviewer', instruction: 'Read all prior work, identify concrete defects, contradictions, missing requirements, and request exact revisions.' });
  return roles.slice(0, count).map((item, index) => ({
    role: item.role || `Collaborator ${index + 1}`,
    instruction: item.instruction || 'Build on the shared transcript and make a concrete handoff.',
    deliverable: index === 0
      ? 'A clear project plan, work breakdown, and acceptance criteria.'
      : index === count - 1
        ? 'A specific quality review with required corrections.'
        : 'A concrete contribution that advances the shared deliverable.'
  }));
}

function safeRole(value, fallback = 'Collaborator') {
  const role = value && typeof value === 'object' ? value : {};
  return {
    role: cleanString(role.role, 70) || fallback,
    instruction: cleanString(role.instruction, 500) || 'Build on the shared transcript and make a concrete contribution.',
    deliverable: cleanString(role.deliverable, 350) || 'A concrete work product for the next teammate.'
  };
}

function resultMeta(result) {
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
    const modelIds = Array.isArray(body.modelIds) ? body.modelIds.slice(0, 12) : [];
    const roster = action === 'vision' ? await visionProviderRoster(modelIds) : providerRoster(modelIds);
    if (!prompt) return sendJson(res, 400, { error: 'Enter a prompt.', requestId });
    if (!roster.length) return sendJson(res, 503, { error: 'No AI provider is configured. Add OPENROUTER_API_KEY in Vercel.', requestId });

    const intent = inferIntent(prompt);
    const slot = clampInt(body.slot, 0, 30, 0);
    const providers = providersForSlot(roster, slot);

    if (action === 'vision') {
      const images = (Array.isArray(body.images) ? body.images : []).slice(0, 4).flatMap((item, index) => {
        const dataUrl = cleanString(item?.dataUrl, 950000);
        if (!/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(dataUrl)) return [];
        return [{ id: cleanString(item?.id, 80) || `image-${index + 1}`, name: cleanString(item?.name, 100) || `Picture ${index + 1}`, dataUrl }];
      });
      const totalChars = images.reduce((sum, item) => sum + item.dataUrl.length, 0);
      if (!images.length) return sendJson(res, 400, { error: 'Attach at least one supported picture.', requestId });
      if (totalChars > 3_500_000) return sendJson(res, 413, { error: 'The attached pictures are too large. Try fewer or smaller images.', requestId });
      const roleName = cleanString(body.role, 70) || 'Vision Analyst';
      const instruction = cleanString(body.instruction, 1800) || 'Analyze the pictures accurately for the shared project.';
      const priorAnalysis = cleanString(body.priorAnalysis, 10000);
      const content = [
        {
          type: 'text',
          text: `You are ${roleName}, working inside a visible collaborative AI team. ${instruction}\n\nPROJECT INFORMATION:\n${prompt}\n\n${priorAnalysis ? `EARLIER VISION TEAM FINDINGS TO REVIEW:\n${priorAnalysis}\n\n` : ''}Return a concise but specific visible team handoff. For each picture, distinguish directly visible facts from uncertain interpretations. Explain useful website placement, crop, alt text, branding cues, and factual risks. Do not reveal hidden chain-of-thought.`
        },
        ...images.map((item) => ({ type: 'image_url', image_url: { url: item.dataUrl } }))
      ];
      const result = await callWithinBudget(providers, [{ role: 'user', content }], {
        temperature: roleName.includes('Reviewer') ? 0.2 : 0.3,
        maxTokens: 2200,
        totalBudgetMs: 41000,
        maxAttemptMs: 30000
      });
      const message = {
        id: crypto.randomUUID(), agentId: `vision-${slot + 1}`, from: roleName,
        to: roleName.includes('Reviewer') ? 'Website Strategist' : 'Visual Brand Reviewer',
        kind: roleName.includes('Reviewer') ? 'image-review' : 'image-analysis', round: 0,
        content: result.content, ...resultMeta(result)
      };
      return sendJson(res, 200, { requestId, action, message, imageCount: images.length });
    }

    if (action === 'quick') {
      const result = await callWithinBudget(providers, [
        { role: 'system', content: 'Answer directly, accurately, and usefully. Follow the requested language and format. Do not claim tools or sources you did not use.' },
        { role: 'user', content: prompt }
      ], { temperature: intent.primary === 'creative' ? 0.68 : 0.32, maxTokens: 4200, totalBudgetMs: 54000, maxAttemptMs: 42000 });
      return sendJson(res, 200, { requestId, action, answer: result.content, intent: intent.primary, ...resultMeta(result) });
    }

    if (action === 'plan') {
      const agentCount = clampInt(body.agentCount, 3, 6, 4);
      let roles = collaborationRoles(intent, agentCount);
      let goal = `Complete the request through a visible ${agentCount}-member collaboration.`;
      let planner = null;
      try {
        planner = await callWithinBudget(providers, [
          {
            role: 'system',
            content: `Return JSON only: {"goal":"short sentence","roles":[{"role":"short title","instruction":"how this teammate advances shared work","deliverable":"specific work product"}]}. Create exactly ${agentCount} roles. The first role leads. The last role reviews quality. Every role must read and respond to earlier teammates rather than independently answering the user.`
          },
          { role: 'user', content: prompt }
        ], { temperature: 0.1, maxTokens: 950, totalBudgetMs: 44000, maxAttemptMs: 33000 });
        const parsed = parseJsonObject(planner.content);
        if (Array.isArray(parsed?.roles) && parsed.roles.length >= agentCount) {
          roles = parsed.roles.slice(0, agentCount).map((item, index) => safeRole(item, `Collaborator ${index + 1}`));
          if (!/review|critic|quality|test|verify/i.test(roles.at(-1).role)) {
            roles[roles.length - 1] = safeRole({
              role: 'Quality Reviewer',
              instruction: 'Read all prior work, identify exact defects and missing requirements, and request concrete revisions.',
              deliverable: 'A specific quality review with required corrections.'
            });
          }
          goal = cleanString(parsed.goal, 240) || goal;
        }
      } catch (error) {
        planner = { content: '', providerName: 'Built-in planner', providerId: 'built-in', model: 'deterministic-role-planner', latencyMs: 0, attempts: error?.attempts || [], citations: [] };
      }
      return sendJson(res, 200, {
        requestId,
        action,
        goal,
        roles,
        intent: intent.primary,
        roster: roster.slice(0, Math.max(agentCount + 1, 5)).map((provider) => ({ id: provider.id, model: provider.model, name: provider.name })),
        planner: resultMeta(planner)
      });
    }

    if (action === 'message') {
      const role = safeRole(body.role);
      const to = cleanString(body.to, 80) || 'Team';
      const kind = cleanString(body.kind, 40) || 'contribution';
      const round = clampInt(body.round, 0, 20, 1);
      const prior = trimWorkspace(body.workspace, 34000);
      const result = await callWithinBudget(providers, [
        {
          role: 'system',
          content: `You are ${role.role}, a member of a collaborative AI team. ${role.instruction}\n\nRead the shared transcript. Respond to prior teammates, preserve useful decisions, correct problems you notice, and make a concrete handoff to ${to}. Do not act like an isolated contestant. Share conclusions, edits, decisions, evidence, questions, code, and usable artifacts—but not hidden private chain-of-thought.`
        },
        {
          role: 'user',
          content: `ORIGINAL REQUEST:\n${prompt}\n\nYOUR DELIVERABLE:\n${role.deliverable}\n\nSHARED TEAM TRANSCRIPT:\n${prior || '(No earlier messages. Start the project and hand off clearly.)'}\n\nWrite your visible team message to ${to}.`
        }
      ], {
        temperature: /creative|design|audience/i.test(role.role) ? 0.58 : 0.3,
        maxTokens: kind === 'revision' ? 3600 : 2600,
        totalBudgetMs: 54000,
        maxAttemptMs: 42000
      });
      const message = {
        id: crypto.randomUUID(),
        agentId: cleanString(body.agentId, 80) || `agent-${slot + 1}`,
        from: role.role,
        to,
        kind,
        round,
        content: result.content,
        ...resultMeta(result),
        createdAt: Date.now()
      };
      return sendJson(res, 200, { requestId, action, message });
    }

    if (action === 'finalize') {
      const goal = cleanString(body.goal, 300) || 'Complete the user request.';
      const transcript = trimWorkspace(body.workspace, 46000);
      const result = await callWithinBudget(providers, [
        {
          role: 'system',
          content: 'You are the Final Integrator of a collaborative AI team. Use the visible team transcript as shared work. Incorporate accepted decisions and revisions, resolve conflicts, remove duplicate discussion, and return the completed deliverable in exactly the format the user requested. Do not merely summarize the chat. Do not reveal hidden chain-of-thought or invent citations.'
        },
        {
          role: 'user',
          content: `ORIGINAL REQUEST:\n${prompt}\n\nTEAM GOAL:\n${goal}\n\nVISIBLE TEAM TRANSCRIPT:\n${transcript}\n\nReturn the finished deliverable now.`
        }
      ], { temperature: 0.2, maxTokens: 6000, totalBudgetMs: 54000, maxAttemptMs: 46000 });
      return sendJson(res, 200, { requestId, action, answer: result.content, ...resultMeta(result) });
    }

    return sendJson(res, 400, { error: 'Unknown collaboration action.', requestId });
  } catch (error) {
    return sendJson(res, 500, {
      error: error?.name === 'AbortError' ? 'This collaboration step timed out.' : error?.message || 'The collaboration step failed.',
      attempts: error?.attempts || [],
      requestId
    });
  }
}
