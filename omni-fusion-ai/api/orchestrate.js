import crypto from 'node:crypto';
import { sendJson, readJsonBody } from './lib/http.js';
import { authorize, rateLimit, cleanString, clampInt } from './lib/security.js';
import { resolveProviders, callWithFallback } from './providers/runtime.js';
import { inferIntent, rankProviders, fallbackRoles, parseJsonObject } from './lib/routing.js';

export const config = { maxDuration: 180 };

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function providerRotation(ranked, preferred) {
  if (!ranked.length) return [];
  const head = preferred || ranked[0];
  const fallbackRouter = ranked.find((item) => item.id === 'openrouter');
  return unique([head, ...ranked.filter((item) => item.id !== head.id), fallbackRouter].map((item) => item?.id))
    .map((id) => ranked.find((item) => item.id === id))
    .filter(Boolean);
}

function createChannel(req, res, requestId) {
  const wantsStream = String(req.headers.accept || '').includes('text/event-stream');
  const trace = [];
  let heartbeat = null;

  function emit(type, data = {}, { record = true } = {}) {
    const payload = { ...data, requestId, eventId: data.eventId || crypto.randomUUID(), ts: data.ts || Date.now() };
    if (record && type !== 'heartbeat') trace.push({ type, ...payload });
    if (wantsStream) res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
    return payload;
  }

  function start() {
    if (!wantsStream) return;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');
    heartbeat = setInterval(() => emit('heartbeat', { detail: 'working' }), 12_000);
  }

  function finish(payload, status = 200) {
    if (heartbeat) clearInterval(heartbeat);
    if (wantsStream) {
      if (status >= 400) emit('error', { message: payload.error || payload.message || 'The run failed.', status, trace: payload.trace || trace }, { record: false });
      else emit('run_complete', payload, { record: false });
      res.end();
    } else {
      sendJson(res, status, payload);
    }
  }

  return { wantsStream, trace, emit, start, finish };
}

function makeAttemptReporter(channel, scope = {}) {
  return (attempt) => {
    if (attempt.phase === 'start') {
      channel.emit('provider_attempt', {
        ...scope,
        providerId: attempt.providerId,
        providerName: attempt.providerName,
        requestedModel: attempt.requestedModel
      });
    } else if (attempt.phase === 'failure') {
      channel.emit('provider_failure', {
        ...scope,
        providerId: attempt.providerId,
        providerName: attempt.providerName,
        requestedModel: attempt.requestedModel,
        latencyMs: attempt.latencyMs,
        error: attempt.error
      });
    }
  };
}

function trimWorkspace(messages, maxChars = 28000) {
  const blocks = messages.map((message, index) => {
    const header = `[${index + 1}] ${message.from} → ${message.to} (${message.kind})`;
    return `${header}\n${message.content}`;
  });
  let joined = blocks.join('\n\n---\n\n');
  if (joined.length <= maxChars) return joined;
  joined = blocks.slice(-Math.max(3, Math.floor(blocks.length * 0.7))).join('\n\n---\n\n');
  return joined.slice(-maxChars);
}

function fallbackCollaborationRoles(intent, count) {
  const base = fallbackRoles(intent, Math.max(count, 4));
  const leadByIntent = {
    code: { role: 'Lead Architect', instruction: 'Define the implementation plan, interfaces, constraints, and acceptance criteria.' },
    creative: { role: 'Creative Lead', instruction: 'Define the central concept, audience, tone, and success criteria.' },
    research: { role: 'Research Lead', instruction: 'Define the research questions, evidence needs, and uncertainty boundaries.' },
    writing: { role: 'Lead Editor', instruction: 'Define the document structure, voice, required facts, and quality bar.' },
    reasoning: { role: 'Strategy Lead', instruction: 'Define the decision framework, constraints, and desired outcome.' },
    general: { role: 'Team Lead', instruction: 'Define the task, constraints, deliverables, and quality bar.' }
  };
  const lead = leadByIntent[intent.primary] || leadByIntent.general;
  const roles = [lead, ...base.filter((item) => item.role !== lead.role)];
  if (!roles.some((item) => /review|critic|skeptic|test/i.test(item.role))) {
    roles.push({ role: 'Quality Reviewer', instruction: 'Review the shared work, identify concrete defects, and request specific revisions.' });
  }
  return roles.slice(0, count).map((item, index) => ({
    role: item.role || `Collaborator ${index + 1}`,
    instruction: item.instruction || 'Add a concrete contribution based on the shared workspace.',
    deliverable: index === 0 ? 'A clear team plan and acceptance criteria.' : 'A concrete contribution that advances the shared deliverable.'
  }));
}

function findReviewerIndex(roles) {
  const index = roles.findIndex((item) => /review|critic|skeptic|test|quality|verify/i.test(item.role));
  return index >= 0 ? index : roles.length - 1;
}

function findLeadIndex(roles) {
  const index = roles.findIndex((item) => /lead|architect|engineer|writer|editor|producer|strategist|developer/i.test(item.role));
  return index >= 0 ? index : 0;
}

async function callTeamMember({ channel, ranked, preferred, prompt, role, to, kind, workspace, round, messageIndex, completedCalls, failedAttempts, maxTokens = 2300, temperature = 0.35 }) {
  const agentId = `agent-${messageIndex + 1}`;
  const prior = trimWorkspace(workspace);
  channel.emit('team_message_start', {
    agentId,
    from: role.role,
    to,
    kind,
    round,
    requestedModel: preferred?.model
  });

  const result = await callWithFallback(providerRotation(ranked, preferred), [
    {
      role: 'system',
      content: `You are ${role.role}, one member of a real collaborative AI team. ${role.instruction}\n\nRead the shared workspace before replying. Build on earlier work, address named teammates when useful, and make a concrete handoff to ${to}. Do not work as an isolated contestant. Do not reveal private chain-of-thought; share only conclusions, decisions, questions, edits, evidence, and usable work artifacts. Keep the visible team message focused but complete.`
    },
    {
      role: 'user',
      content: `ORIGINAL REQUEST:\n${prompt}\n\nYOUR DELIVERABLE:\n${role.deliverable || 'Advance the shared deliverable.'}\n\nSHARED TEAM WORKSPACE:\n${prior || '(No earlier messages. Start the project and hand off clearly.)'}\n\nWrite your visible message to ${to}.`
    }
  ], {
    temperature,
    maxTokens,
    timeoutMs: 52000,
    onAttempt: makeAttemptReporter(channel, { stage: 'team', agentId, role: role.role, round })
  });

  for (const attempt of result?.attempts || []) {
    if (attempt.success) completedCalls.push(attempt);
    else failedAttempts.push(attempt);
  }

  const message = {
    id: crypto.randomUUID(),
    agentId,
    from: role.role,
    to,
    kind,
    round,
    content: result.content,
    provider: result.providerName,
    providerId: result.providerId,
    model: result.model,
    latencyMs: result.latencyMs,
    citations: result.citations || [],
    attempts: result.attempts || [],
    createdAt: Date.now()
  };
  workspace.push(message);
  channel.emit('team_message', message, { record: false });
  return message;
}

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  const channel = createChannel(req, res, requestId);

  try {
    if (req.method !== 'POST') return channel.finish({ error: 'Use POST.' }, 405);
    channel.start();

    const access = authorize(req);
    if (!access.ok) return channel.finish({ error: access.error }, access.status);
    const limiter = rateLimit(req);
    if (!limiter.ok) return channel.finish({ error: limiter.error }, limiter.status);

    const body = await readJsonBody(req);
    const prompt = cleanString(body.prompt, 12000);
    const requestedMode = ['quick', 'team', 'council', 'deep'].includes(body.mode) ? body.mode : 'team';
    const mode = requestedMode === 'council' ? 'team' : requestedMode;
    const requestedIds = Array.isArray(body.providers) ? body.providers.slice(0, 12).map((id) => cleanString(id, 180)) : [];
    const requestedAgents = mode === 'quick' ? 1 : mode === 'deep' ? 5 : clampInt(body.agentCount, 3, 4, 4);
    const revisionRounds = mode === 'quick' ? 0 : clampInt(body.collaborationRounds, 1, 2, mode === 'deep' ? 2 : 1);

    if (!prompt) return channel.finish({ error: 'Enter a prompt.' }, 400);

    const started = Date.now();
    channel.emit('run_start', { mode, promptPreview: prompt.slice(0, 120), collaborationRounds: revisionRounds });

    const intent = inferIntent(prompt);
    const available = await resolveProviders({ intent, requestedIds, desiredCount: Math.max(requestedAgents + 3, 7) });
    if (!available.length) return channel.finish({ error: 'No AI provider is configured. Add OPENROUTER_API_KEY in Vercel.' }, 503);

    const ranked = rankProviders(available, intent, requestedIds);
    channel.emit('route_complete', {
      intent: intent.primary,
      candidateCount: ranked.length,
      requestedAgents,
      candidates: ranked.slice(0, 12).map((item) => ({ provider: item.name, requestedModel: item.model }))
    });

    const completedCalls = [];
    const failedAttempts = [];
    const recordAttempts = (result) => {
      for (const attempt of result?.attempts || []) {
        if (attempt.success) completedCalls.push(attempt);
        else failedAttempts.push(attempt);
      }
    };

    if (mode === 'quick') {
      channel.emit('agent_start', { agentId: 'primary', role: 'Primary AI', requestedModel: ranked[0]?.model });
      const result = await callWithFallback(providerRotation(ranked, ranked[0]), [
        { role: 'system', content: 'Answer the request directly, accurately, and usefully. Follow the requested language and format. Do not invent sources or claim tools you did not use.' },
        { role: 'user', content: prompt }
      ], {
        temperature: intent.primary === 'creative' ? 0.7 : 0.35,
        maxTokens: 3800,
        timeoutMs: 60000,
        onAttempt: makeAttemptReporter(channel, { stage: 'primary', role: 'Primary AI' })
      });
      recordAttempts(result);
      channel.emit('agent_complete', {
        agentId: 'primary', role: 'Primary AI', provider: result.providerName, model: result.model,
        latencyMs: result.latencyMs, contentPreview: result.content.slice(0, 180)
      });
      const models = unique(completedCalls.map((item) => item.actualModel));
      return channel.finish({
        answer: result.content,
        goal: 'Direct answer from one available model.',
        intent: intent.primary,
        teamMessages: [],
        agents: [{ role: 'Primary AI', content: result.content, provider: result.providerName, model: result.model, latencyMs: result.latencyMs, attempts: result.attempts }],
        finalizer: null,
        providersUsed: [result.providerName],
        completedModels: models,
        distinctModels: models.length,
        callsCompleted: completedCalls.length,
        failedAttempts: failedAttempts.length,
        verifiedMultiModel: false,
        collaborationVerified: false,
        citations: result.citations || [],
        durationMs: Date.now() - started,
        trace: channel.trace
      });
    }

    let roles = fallbackCollaborationRoles(intent, requestedAgents);
    let goal = `Complete the request through a visible ${requestedAgents}-member collaboration.`;
    channel.emit('planner_start', { requestedModel: ranked[0]?.model });
    try {
      const plan = await callWithFallback(providerRotation(ranked, ranked[0]), [
        {
          role: 'system',
          content: `Return JSON only: {"goal":"short sentence","roles":[{"role":"short title","instruction":"how this teammate contributes","deliverable":"specific work product"}]}. Create exactly ${requestedAgents} roles. The first role must lead the project. The last role must review quality. Roles must depend on and respond to one another, not compete.`
        },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.12,
        maxTokens: 850,
        timeoutMs: 32000,
        onAttempt: makeAttemptReporter(channel, { stage: 'planner' })
      });
      recordAttempts(plan);
      const parsed = parseJsonObject(plan.content);
      if (Array.isArray(parsed?.roles) && parsed.roles.length >= requestedAgents) {
        roles = parsed.roles.slice(0, requestedAgents).map((item, index) => ({
          role: cleanString(item.role, 60) || `Collaborator ${index + 1}`,
          instruction: cleanString(item.instruction, 320) || 'Build on the shared workspace and add a concrete contribution.',
          deliverable: cleanString(item.deliverable, 260) || 'A concrete work product for the next teammate.'
        }));
        goal = cleanString(parsed.goal, 220) || goal;
      }
      channel.emit('planner_complete', { provider: plan.providerName, model: plan.model, latencyMs: plan.latencyMs, roles: roles.map((item) => item.role) });
    } catch (error) {
      failedAttempts.push(...(error?.attempts || []).filter((item) => !item.success));
      channel.emit('planner_complete', { provider: 'Deterministic fallback', model: 'built-in team planner', latencyMs: 0, roles: roles.map((item) => item.role), fallback: true });
    }

    const workspace = [];
    channel.emit('collaboration_start', { goal, roles: roles.map((item) => item.role), rounds: revisionRounds });

    const leadIndex = findLeadIndex(roles);
    let reviewerIndex = findReviewerIndex(roles);
    if (reviewerIndex === leadIndex) reviewerIndex = roles.length - 1 === leadIndex ? Math.max(0, roles.length - 2) : roles.length - 1;
    const leadRole = roles[leadIndex];
    const reviewerRole = roles[reviewerIndex];
    const specialistIndexes = roles.map((_, index) => index).filter((index) => index !== leadIndex && index !== reviewerIndex);

    channel.emit('round_start', { round: 0, label: 'Project setup' });
    await callTeamMember({
      channel,
      ranked,
      preferred: ranked[leadIndex % ranked.length],
      prompt,
      role: leadRole,
      to: specialistIndexes.length ? roles[specialistIndexes[0]].role : reviewerRole.role,
      kind: 'plan',
      workspace,
      round: 0,
      messageIndex: workspace.length,
      completedCalls,
      failedAttempts,
      maxTokens: 2100,
      temperature: 0.28
    });

    channel.emit('round_start', { round: 1, label: 'Specialist contributions' });
    const sharedLeadSnapshot = [...workspace];
    const specialistResults = await Promise.allSettled(specialistIndexes.map(async (roleIndex, position) => {
      const localWorkspace = [...sharedLeadSnapshot];
      const next = position === specialistIndexes.length - 1 ? reviewerRole.role : roles[specialistIndexes[position + 1]].role;
      const message = await callTeamMember({
        channel,
        ranked,
        preferred: ranked[roleIndex % ranked.length],
        prompt,
        role: roles[roleIndex],
        to: next,
        kind: 'contribution',
        workspace: localWorkspace,
        round: 1,
        messageIndex: workspace.length + position,
        completedCalls,
        failedAttempts,
        maxTokens: 2300,
        temperature: /creative|design|audience/i.test(roles[roleIndex].role) ? 0.62 : 0.34
      });
      return message;
    }));

    for (const result of specialistResults) {
      if (result.status === 'fulfilled') workspace.push(result.value);
      else failedAttempts.push(...(result.reason?.attempts || []).filter((item) => !item.success));
    }
    channel.emit('round_complete', { round: 1, completed: specialistResults.filter((item) => item.status === 'fulfilled').length });

    if (!workspace.length) throw new Error('Every team member failed. Open the Team Room to inspect provider errors.');

    for (let reviewRound = 1; reviewRound <= revisionRounds; reviewRound += 1) {
      const roundNumber = reviewRound + 1;
      channel.emit('round_start', { round: roundNumber, label: `Review and revision ${reviewRound}` });
      const reviewMessage = await callTeamMember({
        channel,
        ranked,
        preferred: ranked[reviewerIndex % ranked.length],
        prompt,
        role: reviewerRole,
        to: leadRole.role,
        kind: reviewRound === revisionRounds ? 'quality-review' : 'review',
        workspace,
        round: roundNumber,
        messageIndex: workspace.length,
        completedCalls,
        failedAttempts,
        maxTokens: 1900,
        temperature: 0.2
      });

      const revisionRole = {
        ...leadRole,
        instruction: `${leadRole.instruction} Reply directly to ${reviewerRole.role}, resolve the concrete issues raised, reconcile specialist contributions, and update the shared deliverable.`,
        deliverable: reviewRound === revisionRounds ? 'A revised near-final deliverable that explicitly resolves the review.' : 'A revised draft and a clear response to the reviewer.'
      };
      await callTeamMember({
        channel,
        ranked,
        preferred: ranked[(leadIndex + reviewRound) % ranked.length],
        prompt,
        role: revisionRole,
        to: reviewRound === revisionRounds ? 'Final Integrator' : reviewerRole.role,
        kind: 'revision',
        workspace,
        round: roundNumber,
        messageIndex: workspace.length,
        completedCalls,
        failedAttempts,
        maxTokens: 3300,
        temperature: 0.3
      });
      channel.emit('round_complete', { round: roundNumber, reviewMessageId: reviewMessage.id });
    }

    channel.emit('finalizer_start', { requestedModel: ranked[0]?.model, messageCount: workspace.length });
    const finalizer = await callWithFallback(providerRotation(ranked, ranked[0]), [
      {
        role: 'system',
        content: 'You are the Final Integrator of a collaborative AI team. Read the real team transcript. Deliver the requested final result, incorporating the accepted decisions and revisions. Resolve remaining conflicts, remove duplicated discussion, and follow the requested format exactly. Do not expose hidden chain-of-thought. Do not merely summarize the team chat. Never invent citations or capabilities.'
      },
      {
        role: 'user',
        content: `ORIGINAL REQUEST:\n${prompt}\n\nTEAM GOAL:\n${goal}\n\nVISIBLE TEAM TRANSCRIPT:\n${trimWorkspace(workspace, 44000)}\n\nReturn the completed final deliverable.`
      }
    ], {
      temperature: 0.22,
      maxTokens: 5200,
      timeoutMs: 65000,
      onAttempt: makeAttemptReporter(channel, { stage: 'finalizer' })
    });
    recordAttempts(finalizer);
    channel.emit('finalizer_complete', { provider: finalizer.providerName, model: finalizer.model, latencyMs: finalizer.latencyMs });

    const completedModels = unique(completedCalls.map((item) => item.actualModel));
    const collaborationVerified = workspace.length >= 3 && workspace.some((item) => item.kind === 'revision') && workspace.some((item) => /review/.test(item.kind));
    const verifiedMultiModel = completedModels.length >= 2 && collaborationVerified;
    const agents = workspace.map((message) => ({
      role: message.from,
      content: message.content,
      provider: message.provider,
      model: message.model,
      latencyMs: message.latencyMs,
      kind: message.kind,
      to: message.to,
      round: message.round,
      attempts: message.attempts
    }));

    return channel.finish({
      answer: finalizer.content,
      goal,
      intent: intent.primary,
      roles: roles.map((item) => item.role),
      teamMessages: workspace,
      agents,
      finalizer: { provider: finalizer.providerName, model: finalizer.model, latencyMs: finalizer.latencyMs, attempts: finalizer.attempts || [] },
      providersUsed: unique([...workspace.map((message) => message.provider), finalizer.providerName]),
      completedModels,
      distinctModels: completedModels.length,
      callsCompleted: completedCalls.length,
      failedAttempts: failedAttempts.length,
      verifiedMultiModel,
      collaborationVerified,
      collaborationRounds: revisionRounds,
      citations: unique([...workspace.flatMap((message) => message.citations || []), ...(finalizer.citations || [])]),
      durationMs: Date.now() - started,
      trace: channel.trace
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'A provider timed out. Try Team mode with one review round or choose fewer models.'
      : error?.message || 'The request could not be completed.';
    return channel.finish({ error: message, requestId, trace: channel.trace }, 500);
  }
}
