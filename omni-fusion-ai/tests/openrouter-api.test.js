import test from 'node:test';
import assert from 'node:assert/strict';
import statusHandler from '../api/status.js';
import orchestrateHandler from '../api/orchestrate.js';

function responseMock() {
  return {
    code: 0,
    headers: {},
    payload: null,
    status(code) { this.code = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { this.payload = value ? JSON.parse(value) : null; }
  };
}

const modelData = [
  { id: 'openai/gpt-test:free', name: 'GPT Test', context_length: 128000, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature', 'tools'] },
  { id: 'anthropic/claude-test:free', name: 'Claude Test', context_length: 200000, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature'] },
  { id: 'google/gemini-test:free', name: 'Gemini Test', context_length: 1000000, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature'] }
];

test('one OpenRouter key loads models and runs a multi-model council', async () => {
  const oldFetch = global.fetch;
  const oldKey = process.env.OPENROUTER_API_KEY;
  const oldAllowPaid = process.env.OPENROUTER_ALLOW_PAID;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.OPENROUTER_ALLOW_PAID = 'false';

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/api/v1/models')) {
      return new Response(JSON.stringify({ data: modelData, links: { next: null } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (href.endsWith('/api/v1/images/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'openai/image-test', name: 'Image Test' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (href.endsWith('/api/v1/videos/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'google/video-test', name: 'Video Test' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (href.endsWith('/api/v1/chat/completions')) {
      const body = JSON.parse(options.body || '{}');
      const system = body.messages?.find((item) => item.role === 'system')?.content || '';
      let content = `Specialist answer from ${body.model}`;
      if (system.includes('Return JSON only')) {
        content = JSON.stringify({ goal: 'Use several OpenRouter models.', roles: [
          { role: 'Architect', instruction: 'Plan it.' },
          { role: 'Reviewer', instruction: 'Review it.' },
          { role: 'Editor', instruction: 'Improve it.' }
        ] });
      } else if (system.includes('Act as lead judge')) {
        content = 'Combined multi-model answer.';
      }
      return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { message: `Unexpected URL: ${href}` } }), { status: 404, headers: { 'content-type': 'application/json' } });
  };

  const statusRes = responseMock();
  await statusHandler({ method: 'GET', headers: {} }, statusRes);
  assert.equal(statusRes.code, 200);
  assert.equal(statusRes.payload.openRouter.modelCount, 3);
  assert.equal(statusRes.payload.openRouter.freeModelCount, 3);
  assert.equal(statusRes.payload.openRouter.imageModelCount, 1);
  assert.equal(statusRes.payload.openRouter.videoModelCount, 1);

  const orchestrationRes = responseMock();
  await orchestrateHandler({ method: 'POST', headers: { 'x-forwarded-for': `or-test-${Date.now()}` }, body: { prompt: 'Build a website', mode: 'council' }, socket: {} }, orchestrationRes);
  assert.equal(orchestrationRes.code, 200);
  assert.equal(orchestrationRes.payload.answer, 'Combined multi-model answer.');
  assert.equal(orchestrationRes.payload.agents.length, 3);
  assert.ok(new Set(orchestrationRes.payload.agents.map((agent) => agent.model)).size >= 2);

  global.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
  if (oldAllowPaid === undefined) delete process.env.OPENROUTER_ALLOW_PAID; else process.env.OPENROUTER_ALLOW_PAID = oldAllowPaid;
});
