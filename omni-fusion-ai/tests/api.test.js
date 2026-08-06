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

test('status returns the integration library', async () => {
  const res = responseMock();
  await statusHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.code, 200);
  assert.ok(res.payload.integrations.length >= 45);
  assert.ok(res.payload.integrations.some((item) => item.name === 'Microsoft Copilot'));
});

test('orchestrator explains missing provider configuration', async () => {
  const saved = { ...process.env };
  for (const key of ['OPENROUTER_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','XAI_API_KEY','PERPLEXITY_API_KEY','MISTRAL_API_KEY','GROQ_API_KEY','DEEPSEEK_API_KEY','HF_TOKEN','CLOUDFLARE_API_TOKEN','OLLAMA_BASE_URL']) delete process.env[key];
  process.env.CUSTOM_PROVIDERS_JSON = '[]';
  const res = responseMock();
  await orchestrateHandler({ method: 'POST', headers: {}, body: { prompt: 'Hello' }, socket: {} }, res);
  assert.equal(res.code, 503);
  assert.match(res.payload.error, /No AI provider is configured/);
  process.env = saved;
});

import http from 'node:http';

test('full collaboration runs through an OpenAI-compatible custom provider', async () => {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const system = body.messages?.find((item) => item.role === 'system')?.content || '';
    let content = 'A useful specialist answer.';
    if (system.includes('Return JSON only')) {
      content = JSON.stringify({ goal: 'Test the collaboration.', roles: [
        { role: 'Team Lead', instruction: 'Create the plan.', deliverable: 'Plan' },
        { role: 'Builder', instruction: 'Build from the plan.', deliverable: 'Draft' },
        { role: 'Quality Reviewer', instruction: 'Review the work.', deliverable: 'Review' }
      ] });
    } else if (system.includes('Final Integrator')) {
      content = 'Final collaborative answer.';
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: 'fake-model', choices: [{ message: { content } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const oldCustom = process.env.CUSTOM_PROVIDERS_JSON;
  const oldKey = process.env.TEST_CUSTOM_KEY;
  process.env.TEST_CUSTOM_KEY = 'test-key';
  process.env.CUSTOM_PROVIDERS_JSON = JSON.stringify([{ id: 'fake', name: 'Fake AI', baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnv: 'TEST_CUSTOM_KEY', model: 'fake-model', strengths: ['general'] }]);

  const res = responseMock();
  await orchestrateHandler({ method: 'POST', headers: { 'x-forwarded-for': `test-${Date.now()}` }, body: { prompt: 'Create a test answer', mode: 'team', agentCount: 3, collaborationRounds: 1 }, socket: {} }, res);
  assert.equal(res.code, 200);
  assert.equal(res.payload.answer, 'Final collaborative answer.');
  assert.ok(res.payload.teamMessages.length >= 4);
  assert.equal(res.payload.collaborationVerified, true);
  assert.deepEqual(res.payload.providersUsed, ['Fake AI']);

  if (oldCustom === undefined) delete process.env.CUSTOM_PROVIDERS_JSON; else process.env.CUSTOM_PROVIDERS_JSON = oldCustom;
  if (oldKey === undefined) delete process.env.TEST_CUSTOM_KEY; else process.env.TEST_CUSTOM_KEY = oldKey;
  await new Promise((resolve) => server.close(resolve));
});
