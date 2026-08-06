import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/project-step.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('V15 preserves exact supplied names and user-authorized source material', () => {
  assert.match(app, /extractExactProjectName/);
  assert.match(app, /never replace it with a random business name/i);
  assert.match(app, /Treat text, images, files, names, logos/);
  assert.match(api, /never invent a replacement name/i);
  assert.match(api, /Do not claim the material is public domain/i);
});

test('V15 researches supplied public links without pretending name-only verification', () => {
  assert.match(app, /researchSuppliedSource/);
  assert.match(app, /I found no public link to research/i);
  assert.match(app, /will not pretend it was independently confirmed/i);
  assert.match(app, /sourceUnderstanding: project\.sourceUnderstanding/);
});

test('V15 exposes an obvious custom answer inside the chat questions', () => {
  assert.match(app, /custom-answer-card/);
  assert.match(app, /Tell OmniFusion exactly what you want/);
  assert.match(app, /Use custom answer/);
  assert.match(html, /OmniFusion Motion Studio V17|OmniFusion Website Genius V16|OmniFusion Prime Source Intelligence V15/);
});
