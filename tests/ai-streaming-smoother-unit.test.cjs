const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const oldLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const { computeSmoothedVisibleLength, safeSliceCodePoints } = require(path.join(root, 'src/ai/aiStreamingSmoother.ts'));
if (oldLoader) require.extensions['.ts'] = oldLoader; else delete require.extensions['.ts'];

test('computeSmoothedVisibleLength instantly catches up when not streaming', () => {
  assert.equal(computeSmoothedVisibleLength(10, 50, false), 50);
  assert.equal(computeSmoothedVisibleLength(0, 100, false), 100);
  assert.equal(computeSmoothedVisibleLength(50, 50, false), 50);
});

test('computeSmoothedVisibleLength handles small backlogs with fine-grained steps', () => {
  // Backlog <= 8 -> step = 1
  assert.equal(computeSmoothedVisibleLength(10, 15, true), 11);
  assert.equal(computeSmoothedVisibleLength(10, 18, true), 11);

  // Backlog <= 20 -> step = 2
  assert.equal(computeSmoothedVisibleLength(10, 25, true), 12);
  assert.equal(computeSmoothedVisibleLength(10, 30, true), 12);
});

test('computeSmoothedVisibleLength accelerates on medium and large bursts', () => {
  // Backlog = 48 -> step = ceil(48 / 6) = 8
  assert.equal(computeSmoothedVisibleLength(0, 48, true), 8);

  // Backlog = 90 -> step = ceil(90 / 3) = 30
  assert.equal(computeSmoothedVisibleLength(0, 90, true), 30);
});

test('computeSmoothedVisibleLength never exceeds targetLength', () => {
  assert.equal(computeSmoothedVisibleLength(49, 50, true), 50);
  assert.equal(computeSmoothedVisibleLength(50, 50, true), 50);
  assert.equal(computeSmoothedVisibleLength(55, 50, true), 50);
});

test('safeSliceCodePoints correctly slices ASCII and Chinese characters', () => {
  assert.equal(safeSliceCodePoints('Hello Pixory', 5), 'Hello');
  assert.equal(safeSliceCodePoints('你好，世界！', 2), '你好');
  assert.equal(safeSliceCodePoints('你好，世界！', 6), '你好，世界！');
  assert.equal(safeSliceCodePoints('你好，世界！', 0), '');
  assert.equal(safeSliceCodePoints('你好，世界！', 100), '你好，世界！');
});

test('safeSliceCodePoints preserves emoji surrogate pairs without splitting', () => {
  const textWithEmoji = 'AI🚀助手';
  // Code points:
  // 0: 'A' (1 unit)
  // 1: 'I' (1 unit)
  // 2: '🚀' (2 units: \uD83D\uDE80)
  // 3: '助' (1 unit)
  // 4: '手' (1 unit)
  assert.equal(safeSliceCodePoints(textWithEmoji, 1), 'A');
  assert.equal(safeSliceCodePoints(textWithEmoji, 2), 'AI');
  assert.equal(safeSliceCodePoints(textWithEmoji, 3), 'AI🚀');
  assert.equal(safeSliceCodePoints(textWithEmoji, 4), 'AI🚀助');
  assert.equal(safeSliceCodePoints(textWithEmoji, 5), 'AI🚀助手');
});
