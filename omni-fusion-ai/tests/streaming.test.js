import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import orchestrateHandler from '../api/orchestrate.js';

function streamResponseMock() {
  return {
    headers: {}, chunks: [], ended: false,
    setHeader(key, value) { this.headers[key] = value; },
    flushHeaders() {},
    write(value) { this.chunks.push(String(value)); },
    end(value) { if (value) this.chunks.push(String(value)); this.ended = true; },
    status(code) { this.statusCode = code; return this; }
  };
}

test('team mode streams real handoffs, review, revision, and completion', async () => {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const system = body.messages?.find((item) => item.role === 'system')?.content || '';
    let content = `Work message from ${body.model}`;
    if (system.includes('Return JSON only')) {
      content = JSON.stringify({ goal: 'Collaboratively finish the test.', roles: [
        { role: 'Team Lead', instruction: 'Create the plan.', deliverable: 'Plan' },
        { role: 'Builder', instruction: 'Build on the plan.', deliverable: 'Draft' },
        { role: 'Quality Reviewer', instruction: 'Review the shared work.', deliverable: 'Review' }
      ] });
    } else if (system.includes('Final Integrator')) {
      content = 'Final collaborative answer.';
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: body.model, choices: [{ message: { content } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const oldCustom = process.env.CUSTOM_PROVIDERS_JSON;
  const oldKey = process.env.TEST_STREAM_KEY;
  process.env.TEST_STREAM_KEY = 'test';
  process.env.CUSTOM_PROVIDERS_JSON = JSON.stringify([
    { id: 'stream-one', name: 'Stream One', baseUrl: `http://127.0.0.1:${port}/v1`, apiKeyEnv: 'TEST_STREAM_KEY', model: 'model-one', strengths: ['general'] },
    { id: 'stream-two', name: 'Stream Two', baseUrl: `http://127.0.0.1:${port}/v1`, apiKeyEnv: 'TEST_STREAM_KEY', model: 'model-two', strengths: ['general'] }
  ]);

  const res = streamResponseMock();
  await orchestrateHandler({
    method: 'POST',
    headers: { accept: 'text/event-stream', 'x-forwarded-for': `stream-${Date.now()}` },
    body: { prompt: 'Test collaboration', mode: 'team', agentCount: 3, collaborationRounds: 1 },
    socket: {}
  }, res);

  const output = res.chunks.join('');
  assert.match(output, /event: run_start/);
  assert.match(output, /event: collaboration_start/);
  assert.match(output, /event: team_message/);
  assert.match(output, /"kind":"review"|"kind":"quality-review"/);
  assert.match(output, /"kind":"revision"/);
  assert.match(output, /event: finalizer_complete/);
  assert.match(output, /event: run_complete/);
  assert.doesNotMatch(output, /event: error/);

  if (oldCustom === undefined) delete process.env.CUSTOM_PROVIDERS_JSON; else process.env.CUSTOM_PROVIDERS_JSON = oldCustom;
  if (oldKey === undefined) delete process.env.TEST_STREAM_KEY; else process.env.TEST_STREAM_KEY = oldKey;
  await new Promise((resolve) => server.close(resolve));
});
