const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const captureSource = fs.readFileSync(path.join(root, 'src/ai/aiMemoryCaptureService.ts'), 'utf8');
const reconSource = fs.readFileSync(path.join(root, 'src/ai/aiMemoryReconciliationService.ts'), 'utf8');

test('Extreme Environment Policy - Garbage JSON is caught by try-catch and returns null', () => {
  // Verifies that JSON.parse is wrapped in try-catch and returns null instead of throwing
  assert.match(captureSource, /try {\s*const parsed = JSON\.parse/);
  assert.match(captureSource, /\} catch \{\s*return null;\s*\}/);
});

test('Extreme Environment Policy - Memory fields are heavily validated and clamped', () => {
  // Verifies that string lengths are clamped and type checked
  assert.match(captureSource, /typeof record\.content === 'string'/);
  assert.match(captureSource, /content\.length < 4 \|\| content\.length > 180/);
  // Verifies that confidences and importances are safely clamped using Math.max and Math.min
  assert.match(captureSource, /Math\.max\(0\.1, Math\.min\(1, record\.confidence\)\)/);
  assert.match(captureSource, /Math\.max\(1, Math\.min\(5, Math\.round\(record\.importance\)\)\)/);
});

test('Extreme Environment Policy - Malformed scopes are normalized strictly to ip or thread', () => {
  // Verifies that any scope from the LLM that isn't global, ip, or thread is forced to null, preventing injection of random scopes
  assert.match(captureSource, /record\.scope === 'global' \|\| record\.scope === 'ip' \? 'ip' : record\.scope === 'thread' \? 'thread' : null/);
  assert.match(captureSource, /!scope \|\| !type/); // If null, it gets rejected
});

test('Extreme Environment Policy - Empty LLM results bypass local RegEx hallucination', () => {
  // Verifies the fix for issue 3: trusting an empty model result over a regex local hit
  assert.match(captureSource, /const candidates = modelUpdate \? modelUpdate\.memories : prepared\.localCandidates;/);
});

test('Extreme Environment Policy - Reconciliation strictly rejects unauthorized manual staleness', () => {
  // Verifies that reconciliation operation processing won't let the AI overwrite manual memories
  assert.match(reconSource, /if \(\(operation\.op === 'update' \|\| operation\.op === 'stale'\) && target\.sourceKind === 'manual'\) \{/);
  assert.match(reconSource, /reject\(operation, 'manual_memory_requires_user_action'\)/);
});
