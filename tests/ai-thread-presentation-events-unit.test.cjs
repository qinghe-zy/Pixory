const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  emitAiThreadPresentationUpdated,
  subscribeAiThreadPresentation,
} = require(path.join(
  __dirname,
  '..',
  'src/ai/aiThreadPresentationEvents.ts',
));

test('thread presentation events are scoped and unsubscribe cleanly', () => {
  const updates = [];
  const unsubscribe = subscribeAiThreadPresentation('normal', 'thread-a', () => {
    updates.push('a');
  });

  emitAiThreadPresentationUpdated('normal', 'thread-b');
  emitAiThreadPresentationUpdated('personal', 'thread-a');
  emitAiThreadPresentationUpdated('normal', 'thread-a');
  unsubscribe();
  emitAiThreadPresentationUpdated('normal', 'thread-a');

  assert.deepEqual(updates, ['a']);
});
