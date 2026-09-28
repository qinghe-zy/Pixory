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

const { enqueueAiPostReplyTask } = require(path.join(
  __dirname,
  '..',
  'src/ai/aiPostReplyTaskQueue.ts',
));

test('post-reply tasks serialize per space and thread', async () => {
  const order = [];
  const first = enqueueAiPostReplyTask('normal', 'thread-a', async () => {
    order.push('first:start');
    await Promise.resolve();
    order.push('first:end');
  });
  const second = enqueueAiPostReplyTask('normal', 'thread-a', async () => {
    order.push('second');
  });

  await Promise.all([first, second]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second']);
});

test('a failed post-reply task does not block the next task', async () => {
  const order = [];
  await enqueueAiPostReplyTask('normal', 'thread-failure', async () => {
    throw new Error('expected');
  });
  await enqueueAiPostReplyTask('normal', 'thread-failure', async () => {
    order.push('recovered');
  });

  assert.deepEqual(order, ['recovered']);
});
