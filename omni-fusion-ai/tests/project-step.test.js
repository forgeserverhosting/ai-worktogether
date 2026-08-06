import test from 'node:test';
import assert from 'node:assert/strict';
import { salvageProject, deterministicValidation, normalizeReview } from '../api/project-step.js';

test('salvageProject parses a structured static project', () => {
  const raw = JSON.stringify({
    projectName: 'demo-site', projectType: 'static', entryFile: 'index.html', summary: 'Demo',
    files: [
      { path: 'index.html', content: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Demo</title></head><body><h1>Demo</h1><script src="script.js"></script></body></html>' },
      { path: 'script.js', content: 'console.log("ok")' }
    ]
  });
  const project = salvageProject(raw, 'static', 'fallback');
  assert.equal(project.projectName, 'demo-site');
  assert.equal(project.files.length, 2);
  assert.equal(project.entryFile, 'index.html');
});

test('salvageProject recovers plain HTML', () => {
  const project = salvageProject('Here you go\n<!doctype html><html><body>Hello</body></html>', 'single-html', 'recovered');
  assert.equal(project.files.length, 1);
  assert.match(project.files[0].content, /<!doctype html>/i);
});

test('deterministicValidation catches missing local files and JS syntax', () => {
  const report = deterministicValidation({
    projectName: 'bad', projectType: 'static', entryFile: 'index.html', files: [
      { path: 'index.html', content: '<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Bad</title></head><body><h1>Bad</h1><script src="missing.js"></script></body></html>' },
      { path: 'script.js', content: 'function {' }
    ]
  }, 'Build a site');
  assert.equal(report.passed, false);
  assert.ok(report.checks.some((check) => check.name === 'Local asset references' && !check.passed));
  assert.ok(report.checks.some((check) => check.name === 'JavaScript syntax' && !check.passed));
});

test('normalizeReview restricts the review schema', () => {
  const review = normalizeReview({ approved: false, issues: [{ severity: 'HIGH', file: '../index.html', problem: 'Broken', fix: 'Repair' }] });
  assert.equal(review.issues[0].severity, 'high');
  assert.equal(review.issues[0].file, 'index.html');
});
