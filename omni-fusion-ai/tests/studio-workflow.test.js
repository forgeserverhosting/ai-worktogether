import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import projectStepHandler from '../api/project-step.js';

function responseMock() {
  return {
    code: 0, headers: {}, raw: '',
    status(code) { this.code = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { this.raw = value || ''; this.payload = value ? JSON.parse(value) : null; }
  };
}

test('development studio builds, reviews, repairs, and validates real files', async () => {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const system = body.messages?.find((item) => item.role === 'system')?.content || '';
    let content;
    if (system.includes('Build actual project files')) {
      content = JSON.stringify({ projectName: 'demo-site', projectType: 'static', entryFile: 'index.html', summary: 'Built', files: [
        { path: 'index.html', content: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Demo</title><link rel="stylesheet" href="styles.css"></head><body><h1>Demo</h1><script src="script.js"></script></body></html>' },
        { path: 'styles.css', content: '@media(max-width:600px){body{padding:1rem}}' },
        { path: 'script.js', content: 'console.log("ok")' }
      ] });
    } else if (system.includes('QA Reviewer')) {
      content = JSON.stringify({ approved: false, summary: 'Add a CTA.', issues: [{ severity: 'medium', file: 'index.html', problem: 'No CTA', fix: 'Add a button' }] });
    } else if (system.includes('Fixer Developer')) {
      content = JSON.stringify({ projectName: 'demo-site', projectType: 'static', entryFile: 'index.html', summary: 'Fixed', files: [
        { path: 'index.html', content: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Demo</title><link rel="stylesheet" href="styles.css"></head><body><h1>Demo</h1><a href="#contact">Contact</a><script src="script.js"></script></body></html>' },
        { path: 'styles.css', content: '@media(max-width:600px){body{padding:1rem}}' },
        { path: 'script.js', content: 'console.log("ok")' }
      ] });
    } else {
      content = JSON.stringify({ passed: true, summary: 'Ready', concerns: [] });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: 'studio-model', choices: [{ message: { content } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const oldCustom = process.env.CUSTOM_PROVIDERS_JSON;
  const oldKey = process.env.TEST_STUDIO_KEY;
  process.env.TEST_STUDIO_KEY = 'test';
  process.env.CUSTOM_PROVIDERS_JSON = JSON.stringify([{ id: 'studio', name: 'Studio AI', baseUrl: `http://127.0.0.1:${port}/v1`, apiKeyEnv: 'TEST_STUDIO_KEY', model: 'studio-model' }]);

  const reqBase = { method: 'POST', headers: { 'x-forwarded-for': `studio-${Date.now()}` }, socket: {} };
  let res = responseMock();
  await projectStepHandler({ ...reqBase, body: { action: 'build', prompt: 'Build a demo', outputFormat: 'static' } }, res);
  assert.equal(res.code, 200);
  const project = res.payload.project;
  assert.equal(project.files.length, 3);

  res = responseMock();
  await projectStepHandler({ ...reqBase, headers: { 'x-forwarded-for': `studio-review-${Date.now()}` }, body: { action: 'review', prompt: 'Build a demo', project } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.payload.review.approved, false);

  res = responseMock();
  await projectStepHandler({ ...reqBase, headers: { 'x-forwarded-for': `studio-repair-${Date.now()}` }, body: { action: 'repair', prompt: 'Build a demo', project, review: res.payload?.review || { approved: false, issues: [] } } }, res);
  assert.equal(res.code, 200);
  assert.match(res.payload.project.files[0].content, /Contact/);

  res = responseMock();
  await projectStepHandler({ ...reqBase, headers: { 'x-forwarded-for': `studio-validate-${Date.now()}` }, body: { action: 'validate', prompt: 'Build a demo', project: res.payload?.project || project } }, res);
  assert.equal(res.code, 200);
  assert.ok(Number.isFinite(res.payload.report.score));

  if (oldCustom === undefined) delete process.env.CUSTOM_PROVIDERS_JSON; else process.env.CUSTOM_PROVIDERS_JSON = oldCustom;
  if (oldKey === undefined) delete process.env.TEST_STUDIO_KEY; else process.env.TEST_STUDIO_KEY = oldKey;
  await new Promise((resolve) => server.close(resolve));
});
