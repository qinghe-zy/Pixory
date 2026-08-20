const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadPolicy() {
  const filename = path.join(root, 'src/media/mediaPrefetchPolicy.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module }, { filename });
  return module.exports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('prefetch windows expand from slow through fling without unbounded decode', () => {
  const { resolveMediaPrefetchWindow } = loadPolicy();
  assert.deepEqual(plain(resolveMediaPrefetchWindow({ direction: 1, memoryPressure: 'normal', velocity: 0.2 })), {
    decodedAhead: 3, decodedBehind: 2, encodedAhead: 8, encodedBehind: 4,
  });
  assert.deepEqual(plain(resolveMediaPrefetchWindow({ direction: 1, memoryPressure: 'normal', velocity: 1.2 })), {
    decodedAhead: 5, decodedBehind: 3, encodedAhead: 16, encodedBehind: 6,
  });
  assert.deepEqual(plain(resolveMediaPrefetchWindow({ direction: 1, memoryPressure: 'normal', velocity: 4 })), {
    decodedAhead: 6, decodedBehind: 3, encodedAhead: 32, encodedBehind: 8,
  });
});

test('direction reverses ahead and behind while high memory pressure disables speculative decode', () => {
  const { buildPrefetchIndices, resolveMediaPrefetchWindow } = loadPolicy();
  const window = resolveMediaPrefetchWindow({ direction: -1, memoryPressure: 'normal', velocity: 1.2 });
  assert.deepEqual(plain(buildPrefetchIndices({ currentIndex: 10, direction: -1, itemCount: 30, kind: 'encoded', window }).slice(0, 5)), [10, 9, 8, 7, 6]);
  assert.deepEqual(plain(buildPrefetchIndices({ currentIndex: 10, direction: 1, itemCount: 30, kind: 'encoded', window }).slice(0, 5)), [10, 11, 12, 13, 14]);
  assert.deepEqual(plain(resolveMediaPrefetchWindow({ direction: 1, memoryPressure: 'high', velocity: 4 })), {
    decodedAhead: 0, decodedBehind: 0, encodedAhead: 8, encodedBehind: 4,
  });
  assert.deepEqual(plain(buildPrefetchIndices({
    currentIndex: 10,
    direction: 1,
    itemCount: 30,
    kind: 'decoded',
    window: resolveMediaPrefetchWindow({ direction: 1, memoryPressure: 'high', velocity: 4 }),
  })), []);
});

test('prefetch indices are current-first, unique, and clamped at both boundaries', () => {
  const { buildPrefetchIndices, resolveMediaPrefetchWindow } = loadPolicy();
  const window = resolveMediaPrefetchWindow({ direction: 1, memoryPressure: 'normal', velocity: 4 });
  const indices = buildPrefetchIndices({ currentIndex: 1, direction: 1, itemCount: 5, kind: 'encoded', window });
  assert.equal(indices[0], 1);
  assert.equal(new Set(indices).size, indices.length);
  assert.equal(indices.every((index) => index >= 0 && index < 5), true);
  assert.deepEqual(plain([...indices].sort((a, b) => a - b)), [0, 1, 2, 3, 4]);
});
