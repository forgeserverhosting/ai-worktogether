import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOpenRouterModels, openRouterVirtualProvider, primeFreeRecommendations, scoreOpenRouterModel } from '../server/providers/openrouter.js';

const models = [
  { id: 'openai/gpt-oss-120b:free', name: 'GPT OSS 120B', author: 'openai', free: true, canChat: true, strengths: ['general', 'code', 'reasoning'], contextLength: 128000, supportedParameters: ['tools', 'reasoning', 'structured_outputs', 'max_tokens'], inputModalities: ['text'], description: 'Large reasoning and coding model', created: Math.floor(Date.now() / 1000) },
  { id: 'anthropic/claude-test:free', name: 'Claude Test Large', author: 'anthropic', free: true, canChat: true, strengths: ['general', 'writing', 'creative'], contextLength: 200000, supportedParameters: ['structured_outputs'], inputModalities: ['text'], description: 'Large writing model', created: Math.floor(Date.now() / 1000) },
  { id: 'google/gemini-vision-pro:free', name: 'Gemini Vision Pro', author: 'google', free: true, canChat: true, strengths: ['general', 'creative', 'multimodal'], contextLength: 1000000, supportedParameters: ['tools', 'structured_outputs'], inputModalities: ['text', 'image'], description: 'Multimodal vision model', created: Math.floor(Date.now() / 1000) },
  { id: 'fast/nano-7b:free', name: 'Nano 7B Fast', author: 'fast', free: true, canChat: true, strengths: ['general'], contextLength: 32000, supportedParameters: ['max_tokens'], inputModalities: ['text'], description: 'Small fast model', created: Math.floor(Date.now() / 1000) },
  { id: 'paid/model', name: 'Paid Model', author: 'paid', free: false, canChat: true, strengths: ['reasoning'], contextLength: 64000, supportedParameters: [], inputModalities: ['text'], description: '' }
];

test('selects diverse free OpenRouter models by default', () => {
  const selected = selectOpenRouterModels(models, { intent: { primary: 'code' }, taskRole: 'builder', count: 3, allowPaid: false });
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected.map((item) => item.author)).size, 3);
  assert.ok(selected.every((item) => item.free));
});

test('honors explicit OpenRouter model selections', () => {
  const selected = selectOpenRouterModels(models, { selectedIds: ['or:google/gemini-vision-pro:free'], allowPaid: false });
  assert.deepEqual(selected.map((item) => item.id), ['google/gemini-vision-pro:free']);
});

test('Prime Free ranks models by job instead of one generic order', () => {
  const recommendations = primeFreeRecommendations(models, { perRole: 3 });
  assert.equal(recommendations.builder[0].id, 'openai/gpt-oss-120b:free');
  assert.equal(recommendations.vision[0].id, 'google/gemini-vision-pro:free');
  assert.notEqual(recommendations.quick[0].id, recommendations.builder.at(-1)?.id);
  assert.ok(scoreOpenRouterModel(models[0], { taskRole: 'builder', allowPaid: false }) > scoreOpenRouterModel(models[3], { taskRole: 'builder', allowPaid: false }));
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
