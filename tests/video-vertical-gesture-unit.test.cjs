const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const tsFilePath = path.join(__dirname, '../src/media/videoVerticalGesture.ts');
const tsCode = fs.readFileSync(tsFilePath, 'utf8');

const { outputText } = ts.transpileModule(tsCode, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

const context = vm.createContext({ exports: {}, require });
vm.runInContext(outputText, context);

const {
  clampGestureValue,
  computeVerticalGestureValue,
  getVerticalGestureIconName,
  formatVerticalGesturePercent,
} = context.exports;

test('clampGestureValue clamps out-of-range and non-finite numbers', () => {
  assert.equal(clampGestureValue(-0.4), 0);
  assert.equal(clampGestureValue(1.5), 1);
  assert.equal(clampGestureValue(0.42), 0.42);
  assert.equal(clampGestureValue(Number.NaN), 0);
  assert.equal(clampGestureValue(Number.POSITIVE_INFINITY), 0);
});

test('computeVerticalGestureValue scales deltaY against surface height ratio cleanly', () => {
  // Swiping up (-dy) increases value; swiping down (+dy) decreases value.
  const height = 1000;
  const fullSpan = 580; // 1000 * 0.58
  const increased = computeVerticalGestureValue(0.5, -fullSpan / 2, height, 0.58);
  assert.ok(Math.abs(increased - 1) < 1e-6);

  const decreased = computeVerticalGestureValue(0.5, fullSpan / 2, height, 0.58);
  assert.ok(Math.abs(decreased - 0) < 1e-6);

  // Rebase after async start resolution preserves proportional adjustment.
  const rebased = computeVerticalGestureValue(0.2, -116, height, 0.58);
  assert.ok(Math.abs(rebased - 0.4) < 1e-6);
});

test('getVerticalGestureIconName reflects brightness and volume thresholds', () => {
  assert.equal(getVerticalGestureIconName('brightness', 0.2), 'sunny-outline');
  assert.equal(getVerticalGestureIconName('brightness', 0.8), 'sunny');

  assert.equal(getVerticalGestureIconName('volume', 0), 'volume-mute');
  assert.equal(getVerticalGestureIconName('volume', 0.2), 'volume-low');
  assert.equal(getVerticalGestureIconName('volume', 0.5), 'volume-medium');
  assert.equal(getVerticalGestureIconName('volume', 0.9), 'volume-high');
});

test('formatVerticalGesturePercent formats rounded clamped percentages', () => {
  assert.equal(formatVerticalGesturePercent(0.676), '68%');
  assert.equal(formatVerticalGesturePercent(-0.1), '0%');
  assert.equal(formatVerticalGesturePercent(1.2), '100%');
});
