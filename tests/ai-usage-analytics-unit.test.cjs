const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/ai/aiUsageAnalytics.ts'), 'utf8');

test('AI usage analytics source defines safe aggregate contracts', () => {
  assert.match(source, /export interface AiUsageAggregate/);
  assert.match(source, /export function aggregateAiUsageObservations/);
  assert.match(source, /totalPromptTokens/);
  assert.match(source, /cachedInputTokens/);
  assert.doesNotMatch(source, /content:/);
  assert.doesNotMatch(source, /promptText|memoryText|retrievedContext|stablePrefixHash|stableCoreHash/);
});

test('AI usage analytics clamps cached ratio and uses total prompt tokens', () => {
  assert.match(source, /Math\.min\(1,\s*Math\.max\(0,/);
  assert.match(source, /cachedInputTokens \/ totalPromptTokens/);
  assert.doesNotMatch(source, /cachedInputTokens \/ promptTokens/);
});

test('AI usage analytics skips malformed prompt snapshots safely', () => {
  assert.match(source, /try\s*{/);
  assert.match(source, /catch/);
  assert.match(source, /return null/);
});

test('AI usage analytics keeps newest recent rounds from newest-first repository rows', () => {
  assert.match(source, /recentRounds: rounds\.slice\(0,\s*recentLimit\)/);
  assert.doesNotMatch(source, /recentRounds: rounds\.slice\(-recentLimit\)\.reverse\(\)/);
});
