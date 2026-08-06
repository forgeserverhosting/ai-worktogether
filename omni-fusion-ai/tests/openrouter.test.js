import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOpenRouterModels, openRouterVirtualProvider } from '../api/providers/openrouter.js';

const models = [
  { id: 'openai/gpt-test:free', name: 'GPT Test', author: 'openai', free: true, canChat: true, strengths: ['general', 'code'], contextLength: 128000, supportedParameters: ['tools'], inputModalities: ['text'] },
  { id: 'anthropic/claude-test:free', name: 'Claude Test', author: 'anthropic', free: true, canChat: true, strengths: ['general', 'writing'], contextLength: 200000, supportedParameters: [], inputModalities: ['text'] },
  { id: 'google/gemini-test:free', name: 'Gemini Test', author: 'google', free: true, canChat: true, strengths: ['general', 'creative'], contextLength: 1000000, supportedParameters: [], inputModalities: ['text', 'image'] },
  { id: 'paid/model', name: 'Paid Model', author: 'paid', free: false, canChat: true, strengths: ['reasoning'], contextLength: 64000, supportedParameters: [], inputModalities: ['text'] }
];

test('selects diverse free OpenRouter models by default', () => {
  const selected = selectOpenRouterModels(models, { intent: { primary: 'code' }, count: 3, allowPaid: false });
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected.map((item) => item.author)).size, 3);
  assert.ok(selected.every((item) => item.free));
});

test('honors explicit OpenRouter model selections', () => {
  const selected = selectOpenRouterModels(models, { selectedIds: ['or:google/gemini-test:free'], allowPaid: false });
  assert.deepEqual(selected.map((item) => item.id), ['google/gemini-test:free']);
});

test('creates a virtual provider that uses the OpenRouter gateway', () => {
  const saved = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test';
  const provider = openRouterVirtualProvider(models[0]);
  assert.equal(provider.gateway, 'openrouter');
  assert.equal(provider.model, models[0].id);
  assert.equal(provider.id, `or:${models[0].id}`);
  if (saved === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = saved;
});
