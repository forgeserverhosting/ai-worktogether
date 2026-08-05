import { sendJson, readJsonBody } from './lib/http.js';
import { authorize, rateLimit, cleanString, clampInt } from './lib/security.js';
import { configuredProviders, callWithFallback } from './providers/runtime.js';
import { inferIntent, rankProviders, fallbackRoles, parseJsonObject } from './lib/routing.js';

export const config = { maxDuration: 180 };

function providerRotation(ranked, preferred, index) {
  const head = preferred || ranked[index % ranked.length];
  return [head, ...ranked.filter((item) => item.id !== head.id)];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
  const access = authorize(req);
  if (!access.ok) return sendJson(res, access.status, { error: access.error });
  const limiter = rateLimit(req);
  if (!limiter.ok) return sendJson(res, limiter.status, { error: limiter.error });

  const body = await readJsonBody(req);
  const prompt = cleanString(body.prompt, 12000);
  const mode = ['quick', 'council', 'deep'].includes(body.mode) ? body.mode : 'council';
  const requestedIds = Array.isArray(body.providers) ? body.providers.map((id) => cleanString(id, 40)) : [];
  const requestedAgents = mode === 'quick' ? 1 : mode === 'deep' ? 5 : clampInt(body.agentCount, 2, 4, 3);

  if (!prompt) return sendJson(res, 400, { error: 'Enter a prompt.' });

  const available = configuredProviders();
  if (!available.length) {
    return sendJson(res, 503, { error: 'No AI provider is configured. Add at least OPENROUTER_API_KEY or another provider key in Vercel.' });
  }

  const intent = inferIntent(prompt);
  const ranked = rankProviders(available, intent, requestedIds);
  const started = Date.now();

  try {
    if (mode === 'quick') {
      const result = await callWithFallback(ranked, [
        { role: 'system', content: 'Answer the request directly, accurately, and usefully. Follow the requested language and format. Do not invent sources.' },
        { role: 'user', content: prompt }
      ], { temperature: intent.primary === 'creative' ? 0.7 : 0.35, maxTokens: 2400 });
      return sendJson(res, 200, {
        answer: result.content,
        goal: 'Direct answer from the best available provider.',
        intent: intent.primary,
        agents: [{ role: 'Primary AI', content: result.content, provider: result.providerName, model: result.model, latencyMs: result.latencyMs }],
        providersUsed: [result.providerName],
        citations: result.citations || [],
        mediaSuggested: intent.mediaRequested,
        durationMs: Date.now() - started
      });
    }

    let roles = fallbackRoles(intent, requestedAgents);
    let goal = `Solve the request with a ${requestedAgents}-agent ${intent.primary} council.`;
    try {
      const plan = await callWithFallback(ranked, [
        { role: 'system', content: `Return JSON only: {"goal":"short sentence","roles":[{"role":"short title","instruction":"short instruction"}]}. Create exactly ${requestedAgents} different specialists.` },
        { role: 'user', content: prompt }
      ], { temperature: 0.15, maxTokens: 650, timeoutMs: 40000 });
      const parsed = parseJsonObject(plan.content);
      if (Array.isArray(parsed?.roles) && parsed.roles.length >= requestedAgents) {
        roles = parsed.roles.slice(0, requestedAgents).map((item, index) => ({
          role: cleanString(item.role, 60) || `Specialist ${index + 1}`,
          instruction: cleanString(item.instruction, 280) || 'Solve the request from a distinct expert perspective.'
        }));
        goal = cleanString(parsed.goal, 220) || goal;
      }
    } catch {
      // Deterministic roles keep the job alive when a planning model is unavailable.
    }

    const specialistSettled = await Promise.allSettled(roles.map(async (role, index) => {
      const preferred = ranked[index % ranked.length];
      const result = await callWithFallback(providerRotation(ranked, preferred, index), [
        { role: 'system', content: `You are the ${role.role}. ${role.instruction} Work independently. Be concrete and concise. Never claim you used tools you did not use.` },
        { role: 'user', content: prompt }
      ], { temperature: role.role.toLowerCase().includes('creative') ? 0.72 : 0.38, maxTokens: 1450 });
      return {
        role: role.role,
        content: result.content,
        provider: result.providerName,
        providerId: result.providerId,
        model: result.model,
        latencyMs: result.latencyMs,
        citations: result.citations || []
      };
    }));

    const agents = specialistSettled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (!agents.length) throw new Error('Every specialist provider failed. Check keys, credits, model IDs, and provider status.');

    const councilText = agents.map((agent, index) => `SPECIALIST ${index + 1} — ${agent.role} (${agent.provider})\n${agent.content}`).join('\n\n---\n\n');
    const judge = await callWithFallback(ranked, [
      { role: 'system', content: 'Act as lead judge. Produce the best final answer to the original request. Combine strong ideas, resolve contradictions, remove repetition, correct obvious errors, and preserve the requested language and format. Do not mention internal agents unless useful. Never invent citations.' },
      { role: 'user', content: `REQUEST:\n${prompt}\n\nCOUNCIL WORK:\n${councilText}` }
    ], { temperature: 0.24, maxTokens: 3000, timeoutMs: 65000 });

    return sendJson(res, 200, {
      answer: judge.content,
      goal,
      intent: intent.primary,
      agents,
      judge: { provider: judge.providerName, model: judge.model, latencyMs: judge.latencyMs },
      providersUsed: unique([...agents.map((agent) => agent.provider), judge.providerName]),
      citations: unique([...agents.flatMap((agent) => agent.citations || []), ...(judge.citations || [])]),
      mediaSuggested: intent.mediaRequested,
      partialFailures: specialistSettled.filter((result) => result.status === 'rejected').length,
      durationMs: Date.now() - started
    });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'The provider timed out. Try Quick mode or update the model selection.' : error?.message || 'The request could not be completed.';
    return sendJson(res, 500, { error: message });
  }
}
