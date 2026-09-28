const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadPolicy() {
  const filename = path.join(root, 'src/media/videoSwipePolicy.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module }, { filename });
  return module.exports;
}

function resolve(overrides = {}) {
  const { resolveVideoSwipe } = loadPolicy();
  return JSON.parse(JSON.stringify(resolveVideoSwipe({
    canGoNext: true,
    canGoPrevious: true,
    translationY: 0,
    velocityY: 0,
    viewportHeight: 800,
    ...overrides,
  })));
}

test('distance and velocity independently commit a short-video switch', () => {
  assert.deepEqual(resolve({ translationY: -180 }), { action: 'switch', direction: 1, targetOffset: -800 });
  assert.deepEqual(resolve({ translationY: -40, velocityY: -0.9 }), { action: 'switch', direction: 1, targetOffset: -800 });
});

test('small slow movement cancels and returns to the current slot', () => {
  assert.deepEqual(resolve({ translationY: 60, velocityY: 0.2 }), { action: 'cancel', direction: 0, targetOffset: 0 });
});

test('downward movement selects previous while unavailable boundaries cancel', () => {
  assert.deepEqual(resolve({ translationY: 180 }), { action: 'switch', direction: -1, targetOffset: 800 });
  assert.deepEqual(resolve({ translationY: -200, canGoNext: false }), { action: 'cancel', direction: 0, targetOffset: 0 });
  assert.deepEqual(resolve({ translationY: 200, canGoPrevious: false }), { action: 'cancel', direction: 0, targetOffset: 0 });
});

test('strong reverse velocity retargets an interrupted offset without inheriting stale direction', () => {
  assert.deepEqual(resolve({ translationY: -320, velocityY: 1.1 }), {
    action: 'switch',
    direction: -1,
    targetOffset: 800,
  });
});

test('invalid viewport dimensions fail closed', () => {
  assert.deepEqual(resolve({ translationY: -200, viewportHeight: 0 }), { action: 'cancel', direction: 0, targetOffset: 0 });
});
