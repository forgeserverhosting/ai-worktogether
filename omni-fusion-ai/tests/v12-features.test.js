import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractWebsite } from '../api/import-website.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('V12 keeps the compact chat while exposing import and reference tools', () => {
  assert.match(html, /id="addToolsMenu"/);
  assert.match(html, /data-add-action="photos"/);
  assert.match(html, /data-add-action="references"/);
  assert.match(html, /data-add-action="import"/);
  assert.match(html, /id="importWebsiteModal"/);
  assert.match(app, /importWebsiteFromDialog/);
  assert.match(app, /formatImportedWebsite/);
});

test('V12 supports rendered visual QA and focused preview editing', () => {
  assert.match(html, /id="visualReviewBtn"/);
  assert.match(html, /id="editSelectedSectionBtn"/);
  assert.match(app, /previewBridgeMarkup/);
  assert.match(app, /omnifusion-section-selected/);
  assert.match(app, /runRenderedVisualAudit/);
  assert.match(app, /applySelectedSectionEdit/);
});

test('V12 stores brand memory, originality evidence, and versions', () => {
  assert.match(html, /data-workspace-view="brand"/);
  assert.match(html, /data-workspace-view="versions"/);
  assert.match(app, /deriveBrandMemory/);
  assert.match(app, /analyzeOriginality/);
  assert.match(app, /snapshotVersion/);
  assert.match(app, /restoreVersion/);
});

test('website importer extracts public page information', () => {
  const imported = extractWebsite(`<!doctype html><html><head><title>Acme Painting</title><meta name="description" content="Local painters"></head><body><h1>Acme Painting</h1><h2>Interior and exterior</h2><p>Call us for residential painting in Winter Springs.</p><a href="tel:4075551234">(407) 555-1234</a><a href="mailto:hello@acme.test">Email</a><img src="/work.jpg"><style>:root{--brand:#ff7700}</style></body></html>`, 'https://acme.test/');
  assert.equal(imported.title, 'Acme Painting');
  assert.ok(imported.headings.includes('Interior and exterior'));
  assert.ok(imported.phones.some((value) => value.includes('407')));
  assert.ok(imported.emails.includes('hello@acme.test'));
  assert.ok(imported.images.includes('https://acme.test/work.jpg'));
  assert.ok(imported.colors.includes('#ff7700'));
});
