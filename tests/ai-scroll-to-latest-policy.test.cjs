const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src/ai/aiScrollToLatestPolicy.ts');

function loadPolicy() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: sourcePath,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    output,
    { exports: module.exports, module, require },
    { filename: sourcePath },
  );
  return module.exports;
}

test('latest-message policy uses the approved thresholds', () => {
  const policy = loadPolicy();
  assert.equal(policy.SCROLL_TO_LATEST_GESTURE_DISTANCE, 8);
  assert.equal(policy.SCROLL_TO_LATEST_REATTACH_OFFSET, 160);
  assert.equal(policy.SCROLL_TO_LATEST_SHOW_OFFSET, 200);
});

test('gesture direction latches only after eight points of physical movement', () => {
  const { resolveScrollToLatestGestureDirection } = loadPolicy();
  assert.equal(
    resolveScrollToLatestGestureDirection('undetermined', 7.9),
    'undetermined',
  );
  assert.equal(
    resolveScrollToLatestGestureDirection('undetermined', 8),
    'toward_latest',
  );
  assert.equal(
    resolveScrollToLatestGestureDirection('undetermined', -8),
    'away_from_latest',
  );
  assert.equal(
    resolveScrollToLatestGestureDirection('away_from_latest', 40),
    'away_from_latest',
  );
  assert.equal(
    resolveScrollToLatestGestureDirection('toward_latest', -40),
    'toward_latest',
  );
});

test('only an explicit downward gesture can reattach within 160 points', () => {
  const { shouldReattachToLatest } = loadPolicy();
  assert.equal(
    shouldReattachToLatest({ direction: 'toward_latest', offsetY: 160 }),
    true,
  );
  assert.equal(
    shouldReattachToLatest({ direction: 'toward_latest', offsetY: 161 }),
    false,
  );
  assert.equal(
    shouldReattachToLatest({ direction: 'away_from_latest', offsetY: 0 }),
    false,
  );
  assert.equal(
    shouldReattachToLatest({ direction: 'undetermined', offsetY: 0 }),
    false,
  );
});

test('the affordance appears at 200 points', () => {
  const { shouldShowScrollToLatest } = loadPolicy();
  assert.equal(shouldShowScrollToLatest(199.9), false);
  assert.equal(shouldShowScrollToLatest(200), true);
});
