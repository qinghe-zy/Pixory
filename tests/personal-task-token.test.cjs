const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const original = require.extensions['.ts'];
require.extensions['.ts'] = function compile(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
let tokens;
try { tokens = require(path.join(root, 'src/services/personalTaskToken.ts')); }
finally { if (original) require.extensions['.ts'] = original; else delete require.extensions['.ts']; }

test('Personal lock invalidates new checkpoints and waits for already tracked work', async () => {
  const token = tokens.createPersonalTaskToken('session', 1);
  let finish;
  const task = new Promise((resolve) => { finish = resolve; });
  tokens.trackPersonalTask(token, task);
  tokens.invalidatePersonalTaskToken(token);
  assert.throws(() => tokens.assertPersonalTaskActive(token), /no longer active/);
  let settled = false;
  const wait = tokens.waitForPersonalTasks(token).then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  finish();
  await wait;
  assert.equal(settled, true);
});
