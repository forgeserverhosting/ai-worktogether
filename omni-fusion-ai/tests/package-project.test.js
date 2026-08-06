import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZip, crc32 } from '../api/package-project.js';

test('buildZip creates a valid ZIP envelope containing filenames', () => {
  const zip = buildZip([{ path: 'index.html', content: '<h1>Hello</h1>' }, { path: 'styles.css', content: 'body{}' }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from('index.html')));
  assert.ok(zip.includes(Buffer.from('styles.css')));
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});

test('crc32 matches the standard test vector', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('buildZip stores uploaded binary image bytes', () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const zip = buildZip([{ path: 'assets/photo.png', buffer: bytes }]);
  assert.ok(zip.includes(Buffer.from('assets/photo.png')));
  assert.ok(zip.includes(bytes));
});
