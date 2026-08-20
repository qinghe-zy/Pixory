const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadModule() {
  const filename = path.join(root, 'src/services/boundedFileConcurrency.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { AbortController, DOMException, exports: module.exports, module }, { filename });
  return module.exports;
}

test('bounded file work preserves order, contains failures, and never exceeds four workers', async () => {
  const { settleFileTasksWithConcurrency } = loadModule();
  let active = 0;
  let peak = 0;
  const results = await settleFileTasksWithConcurrency(
    Array.from({ length: 20 }, (_, index) => index),
    4,
    async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      if (value === 7) throw new Error('broken');
      return value * 2;
    },
  );

  assert.equal(peak, 4);
  assert.equal(results.length, 20);
  assert.equal(results[7].status, 'rejected');
  assert.equal(results[8].value, 16);
});

test('aborting bounded file work lets in-flight tasks settle but starts no new work', async () => {
  const { settleFileTasksWithConcurrency } = loadModule();
  const controller = new AbortController();
  const started = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const promise = settleFileTasksWithConcurrency(
    [0, 1, 2, 3, 4],
    2,
    async (value) => {
      started.push(value);
      await gate;
      return value;
    },
    { signal: controller.signal },
  );
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  release();
  const results = await promise;

  assert.equal(JSON.stringify(started), JSON.stringify([0, 1]));
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(results.slice(2).every((result) => result.status === 'rejected' && result.reason.name === 'AbortError'), true);
});

test('bounded file work rejects zero and limits above the hard cap', async () => {
  const { settleFileTasksWithConcurrency } = loadModule();
  await assert.rejects(() => settleFileTasksWithConcurrency([1], 0, async (value) => value));
  await assert.rejects(() => settleFileTasksWithConcurrency([1], 5, async (value) => value));
});
