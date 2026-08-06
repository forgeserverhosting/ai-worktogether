import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyExactPatches, analyzeContactForm, deterministicValidation } from '../api/project-step.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('V13 exposes resumable builds without cluttering the main interface', () => {
  assert.match(html, /id="continueBuildBtn"/);
  assert.match(app, /workflowState/);
  assert.match(app, /beginWorkflowStage/);
  assert.match(app, /resumeBuildProject/);
  assert.match(app, /Completed stages will not run again/);
});

test('V13 uses adaptive in-chat questions with recommendation and skip controls', () => {
  assert.match(app, /adaptiveQuestionPlan/);
  assert.match(app, /questionRecommendation/);
  assert.match(app, /id="inlineRecommend"/);
  assert.match(app, /id="inlineSkip"/);
});

test('V13 supports project backup transfer and model health recovery', () => {
  assert.match(html, /id="exportProjectBtn"/);
  assert.match(html, /id="projectBackupInput"/);
  assert.match(app, /exportActiveProjectBackup/);
  assert.match(app, /importProjectBackupFile/);
  assert.match(app, /modelHealthEntry/);
  assert.match(app, /cooldownUntil/);
});

test('exact patches change only the uniquely matched text', () => {
  const project = { projectName: 'demo', projectType: 'static', entryFile: 'index.html', files: [{ path: 'index.html', content: '<button>Call now</button><p>Keep me</p>' }] };
  const result = applyExactPatches(project, [{ path: 'index.html', search: '<button>Call now</button>', replace: '<button>Get estimate</button>', reason: 'Update CTA' }]);
  assert.equal(result.applied.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.match(result.project.files[0].content, /Get estimate/);
  assert.match(result.project.files[0].content, /Keep me/);
});

test('contact-form validation distinguishes working and non-working forms', () => {
  const broken = { projectName: 'broken', projectType: 'static', entryFile: 'index.html', files: [{ path: 'index.html', content: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Contact</title></head><body><h1>Contact</h1><form><input name="name"><button>Send</button></form></body></html>' }] };
  const working = { projectName: 'working', projectType: 'static', entryFile: 'index.html', files: [{ path: 'index.html', content: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Contact</title></head><body><h1>Contact</h1><form action="mailto:hello@example.test"><input name="name"><button>Send</button></form></body></html>' }] };
  assert.equal(analyzeContactForm(broken, 'Create an estimate form').working, false);
  assert.equal(analyzeContactForm(working, 'Create an estimate form').working, true);
  const report = deterministicValidation(broken, 'Create an estimate form');
  assert.ok(report.checks.some((check) => check.name === 'Contact form behavior' && !check.passed));
});

test('V13 renders a transparent category quality score', () => {
  assert.match(app, /buildQualityScore/);
  assert.match(app, /Functionality/);
  assert.match(app, /Business accuracy/);
  assert.match(app, /quality-dashboard/);
});
