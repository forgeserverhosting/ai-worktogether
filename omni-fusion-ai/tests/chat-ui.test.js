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

test('compact interface exposes the live AI team drawer', () => {
  assert.match(html, /id="teamToggleBtn"/);
  assert.match(html, /id="teamPanel"/);
  assert.match(html, /Pause before each handoff/);
  assert.match(app, /openTeamPanel/);
});
