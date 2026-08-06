import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('website intake happens inside the main chat', () => {
  assert.match(html, /id="briefingChat"/);
  assert.match(html, /Paste the business information/);
  assert.doesNotMatch(html, /Start Website Architect/);
  assert.match(app, /startWebsiteIntake/);
  assert.match(app, /answerIntakeQuestion/);
  assert.match(app, /data-intake-answer/);
});

test('Prime Free skips answers already present in the initial message', () => {
  assert.match(app, /inferKnownWebsiteAnswers/);
  assert.match(app, /adaptiveQuestionPlan/);
  assert.match(app, /intake\.questionPlan/);
  assert.match(app, /projectMemory\(project\)\.preferences/);
});

test('compact interface exposes the live AI team drawer', () => {
  assert.match(html, /id="teamToggleBtn"/);
  assert.match(html, /id="teamPanel"/);
  assert.match(html, /Pause before each handoff/);
  assert.match(app, /openTeamPanel/);
  assert.match(app, /Prime Free Router/);
});

test('compact chat accepts pictures and scans them once into project memory', () => {
  assert.match(html, /id="attachImageBtn"/);
  assert.match(html, /id="imageInput"[^>]+accept="image\/png,image\/jpeg,image\/webp,image\/gif"/);
  assert.match(html, /id="attachmentStrip"/);
  assert.match(app, /scanProjectImages/);
  assert.match(app, /Prime Vision Analyst/);
  assert.doesNotMatch(app, /Visual Brand Reviewer/);
  assert.match(app, /action: 'vision'/);
});

test('Prime Free tracks local daily model attempts and keeps a role plan', () => {
  assert.match(app, /requestBudget/);
  assert.match(app, /createPrimeModelPlan/);
  assert.match(app, /modelIdsForRole/);
  assert.match(app, /Prime Free ·/);
});
