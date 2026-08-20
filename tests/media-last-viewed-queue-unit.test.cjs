const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadQueue() {
  const filename = path.join(root, 'src/media/mediaLastViewedQueue.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module }, { filename });
  return module.exports;
}

function createScheduler() {
  let callback = null;
  return {
    clearTimeout: () => { callback = null; },
    fire: () => { const current = callback; callback = null; current?.(); },
    hasTimer: () => callback !== null,
    setTimeout: (next) => { callback = next; return 1; },
  };
}

test('last-view queue deduplicates stable-visible ids and flushes once per interval', async () => {
  const { MediaLastViewedQueue } = loadQueue();
  const scheduler = createScheduler();
  const batches = [];
  const queue = new MediaLastViewedQueue({
    flushIds: async (ids) => batches.push([...ids]),
    scheduler,
  });

  queue.enqueue(4);
  queue.enqueue(4);
  queue.enqueue(7);
  assert.equal(scheduler.hasTimer(), true);
  scheduler.fire();
  await queue.whenIdle();

  assert.deepEqual(batches, [[4, 7]]);
  assert.equal(scheduler.hasTimer(), false);
});

test('ids queued during a write are retained for the next flush', async () => {
  const { MediaLastViewedQueue } = loadQueue();
  const scheduler = createScheduler();
  let finishFirst;
  const batches = [];
  const queue = new MediaLastViewedQueue({
    flushIds: (ids) => {
      batches.push([...ids]);
      if (batches.length === 1) return new Promise((resolve) => { finishFirst = resolve; });
      return Promise.resolve();
    },
    scheduler,
  });

  queue.enqueue(1);
  scheduler.fire();
  queue.enqueue(2);
  finishFirst();
  await queue.whenIdle();
  scheduler.fire();
  await queue.whenIdle();

  assert.deepEqual(batches, [[1], [2]]);
});

test('dispose cancels the timer and flushes pending ids', async () => {
  const { MediaLastViewedQueue } = loadQueue();
  const scheduler = createScheduler();
  const batches = [];
  const queue = new MediaLastViewedQueue({ flushIds: async (ids) => batches.push([...ids]), scheduler });
  queue.enqueue(11);

  await queue.dispose();

  assert.equal(scheduler.hasTimer(), false);
  assert.deepEqual(batches, [[11]]);
});
