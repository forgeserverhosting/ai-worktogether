import test from 'node:test';
import assert from 'node:assert/strict';
import teamStepHandler from '../api/team-step.js';

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

async function invoke(body, suffix) {
  const res = responseMock();
  await teamStepHandler({
    method: 'POST',
    headers: { 'x-forwarded-for': `team-step-${suffix}-${Date.now()}` },
    body,
    socket: {}
  }, res);
  assert.equal(res.code, 200, JSON.stringify(res.payload));
  return res.payload;
}

test('step-by-step collaboration completes through separate short requests', async () => {
  const oldFetch = global.fetch;
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    if (!href.endsWith('/chat/completions')) {
      return new Response(JSON.stringify({ error: { message: `Unexpected URL: ${href}` } }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    const body = JSON.parse(options.body || '{}');
    const system = body.messages?.find((item) => item.role === 'system')?.content || '';
    let content = `Visible handoff from ${body.model}`;
    if (system.includes('Return JSON only')) {
      content = JSON.stringify({
        goal: 'Build the requested website collaboratively.',
        roles: [
          { role: 'Lead Architect', instruction: 'Plan the site.', deliverable: 'Plan' },
          { role: 'UX Designer', instruction: 'Improve the user experience.', deliverable: 'UX work' },
          { role: 'Frontend Engineer', instruction: 'Implement the site.', deliverable: 'Code' },
          { role: 'Quality Reviewer', instruction: 'Review all work.', deliverable: 'Review' }
        ]
      });
    } else if (system.includes('Final Integrator')) {
      content = 'Final integrated website deliverable.';
    }
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const modelIds = [
    'or:openai/gpt-test:free',
    'or:anthropic/claude-test:free',
    'or:google/gemini-test:free',
    'or:qwen/qwen-test:free',
    'or:deepseek/deepseek-test:free'
  ];
  const prompt = 'Build a contractor website.';
  const plan = await invoke({ action: 'plan', prompt, modelIds, agentCount: 4, slot: 0 }, 'plan');
  assert.equal(plan.roles.length, 4);

  const workspace = [];
  for (let index = 0; index < 3; index += 1) {
    const step = await invoke({
      action: 'message',
      prompt,
      modelIds,
      role: plan.roles[index],
      to: plan.roles[index + 1].role,
      kind: index === 0 ? 'plan' : 'contribution',
      round: index,
      slot: index,
      workspace
    }, `message-${index}`);
    workspace.push(step.message);
  }
  const review = await invoke({
    action: 'message', prompt, modelIds, role: plan.roles[3], to: plan.roles[0].role,
    kind: 'quality-review', round: 3, slot: 3, workspace
  }, 'review');
  workspace.push(review.message);
  const revision = await invoke({
    action: 'message', prompt, modelIds, role: plan.roles[0], to: 'Final Integrator',
    kind: 'revision', round: 3, slot: 0, workspace
  }, 'revision');
  workspace.push(revision.message);
  const final = await invoke({ action: 'finalize', prompt, modelIds, goal: plan.goal, workspace, slot: 4 }, 'final');

  assert.equal(final.answer, 'Final integrated website deliverable.');
  assert.equal(workspace.length, 5);
  assert.ok(new Set(workspace.map((message) => message.model)).size >= 3);
  assert.ok(workspace.some((message) => message.kind === 'quality-review'));
  assert.ok(workspace.some((message) => message.kind === 'revision'));

  global.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
});

test('vision teammates receive uploaded pictures through OpenRouter multimodal messages', async () => {
  const oldFetch = global.fetch;
  const oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'vision-test-key';
  let sawImage = false;

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/api/v1/models')) {
      return new Response(JSON.stringify({
        data: [{
          id: 'test/vision-model:free', name: 'Vision Test', context_length: 32000,
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
          pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature', 'max_tokens']
        }], links: {}
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (href.includes('/api/v1/images/models') || href.includes('/api/v1/videos/models')) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (href.endsWith('/chat/completions')) {
      const body = JSON.parse(options.body || '{}');
      const content = body.messages?.[0]?.content;
      sawImage = Array.isArray(content) && content.some((part) => part.type === 'image_url');
      return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: 'Visible picture analysis for the website team.' } }] }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: { message: `Unexpected URL: ${href}` } }), { status: 404, headers: { 'content-type': 'application/json' } });
  };

  const result = await invoke({
    action: 'vision', prompt: 'Build a painter website.', role: 'Vision Analyst', slot: 0,
    images: [{ name: 'work.jpg', dataUrl: 'data:image/jpeg;base64,aGVsbG8=' }]
  }, 'vision');
  assert.equal(result.imageCount, 1);
  assert.equal(result.message.kind, 'image-analysis');
  assert.equal(result.message.content, 'Visible picture analysis for the website team.');
  assert.equal(sawImage, true);

  global.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
});
