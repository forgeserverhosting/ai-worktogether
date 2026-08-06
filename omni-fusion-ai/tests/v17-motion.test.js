import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('V17 uses the Motion Studio identity', () => {
  assert.match(html, /OmniFusion Motion Studio V17/);
});

test('V17 includes premium motion and reduced-motion accessibility', () => {
  assert.match(css, /V17 Motion Studio/);
  assert.match(css, /@keyframes viewReveal/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /\.prompt-dock:focus-within/);
});

test('V17 animates dynamically rendered collaboration and artifact UI', () => {
  assert.match(app, /MutationObserver/);
  assert.match(app, /markMotionTargets/);
  assert.match(app, /ui-ripple/);
  assert.match(app, /motionTargets/);
});
