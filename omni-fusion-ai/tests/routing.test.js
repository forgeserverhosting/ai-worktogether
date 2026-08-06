import test from 'node:test';
import assert from 'node:assert/strict';
import { inferIntent, rankProviders, parseJsonObject } from '../server/lib/routing.js';

test('detects code intent', () => {
  assert.equal(inferIntent('Build a GitHub website with JavaScript').primary, 'code');
});

test('prioritizes Perplexity for research', () => {
  const providers = [
    { id: 'openai', priority: 10, strengths: ['general'] },
    { id: 'perplexity', priority: 7, strengths: ['research'] }
  ];
  assert.equal(rankProviders(providers, inferIntent('Research the latest news'))[0].id, 'perplexity');
});

test('parses fenced JSON', () => {
  assert.equal(parseJsonObject('```json\n{"goal":"x"}\n```').goal, 'x');
});
