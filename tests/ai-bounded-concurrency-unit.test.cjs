const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadModule() {
  const filename = path.join(root, 'src/ai/aiBoundedConcurrency.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

test('bounded map preserves order and never exceeds the limit', async () => {
  const { settleWithConcurrency } = loadModule();
  let active = 0;
  let maxActive = 0;
  const results = await settleWithConcurrency([0, 1, 2, 3, 4, 5], 3, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, (5 - value) * 2));
    active -= 1;
    if (value === 2) throw new Error('expected failure');
    return value * 10;
  });
  assert.equal(maxActive, 3);
  assert.deepEqual(results.map((result) => result.status), [
    'fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled', 'fulfilled',
  ]);
  assert.deepEqual(
    results.map((result) => result.status === 'fulfilled' ? result.value : null),
    [0, 10, null, 30, 40, 50],
  );
});

test('bounded map rejects invalid limits before invoking the mapper', async () => {
  const { settleWithConcurrency } = loadModule();
  let calls = 0;
  await assert.rejects(
    () => settleWithConcurrency([1], 0, async () => {
      calls += 1;
      return 1;
    }),
    /positive integer/,
  );
  assert.equal(calls, 0);
});
