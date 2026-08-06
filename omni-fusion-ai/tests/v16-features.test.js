import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectWebsitePatterns, WEBSITE_PATTERN_LIBRARY } from '../server/lib/website-patterns.js';
import { scoreOpenRouterModel } from '../server/providers/openrouter.js';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/project-step.js', import.meta.url), 'utf8');
const packager = fs.readFileSync(new URL('../api/package-project.js', import.meta.url), 'utf8');

test('V16 provides a curated original website pattern library', () => {
  assert.ok(WEBSITE_PATTERN_LIBRARY.length >= 15);
  const selected = selectWebsitePatterns({ prompt: 'painting and handyman service with editorial motion', concept: { name: 'Editorial Craft' }, count: 6 });
  assert.equal(selected.length, 6);
  assert.ok(new Set(selected.map((item) => item.family)).size >= 3);
  assert.match(api, /CURATED COMPONENT PATTERNS TO ADAPT/);
});

test('V16 renders three visual concept directions inside the chat', () => {
  assert.match(app, /conceptMiniPreviewMarkup/);
  assert.match(app, /Rendered mini direction/);
  assert.match(app, /concept-browser/);
  assert.match(html, /OmniFusion Website Genius V16/);
});

test('V16 exports and imports a GPT senior review bridge', () => {
  assert.match(html, /Export review pack/);
  assert.match(html, /Import expert review/);
  assert.match(app, /downloadExpertReviewPack/);
  assert.match(app, /applyExpertReview/);
  assert.match(app, /REVIEW-ME-FIRST\.md/);
  assert.match(packager, /packageMode === 'release'/);
});

test('V16 model scoring can learn from real role performance', () => {
  const model = { id: 'free/coder:free', name: 'Coder', description: 'coding reasoning model', canChat: true, free: true, strengths: ['general', 'code', 'reasoning'], inputModalities: ['text'], supportedParameters: ['structured_outputs'], contextLength: 128000, created: Math.floor(Date.now() / 1000) };
  const baseline = scoreOpenRouterModel(model, { taskRole: 'builder', allowPaid: false });
  const learned = scoreOpenRouterModel(model, { taskRole: 'builder', allowPaid: false, performanceHints: { [model.id]: { roles: { builder: { samples: 8, successRate: 1, contractRate: 1, averageQuality: 95, averageLatencyMs: 5000 } } } } });
  assert.ok(learned > baseline);
  assert.match(app, /modelPerformanceHints/);
});
