const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadPool() {
  const filename = path.join(root, 'src/media/videoPreloadPool.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module }, { filename });
  return module.exports;
}

function createHarness() {
  const { VideoPreloadPool } = loadPool();
  const prepared = [];
  const released = [];
  const audioOwners = new Set();
  const pool = new VideoPreloadPool({
    createPlayer: (item) => ({ itemId: item.id }),
    getItemId: (item) => item.id,
    preparePlayer: async (player, item) => { prepared.push(item.id); player.itemId = item.id; },
    releasePlayer: (player) => { released.push(player.itemId); },
    setPlayerActive: (player, active) => {
      if (active) audioOwners.add(player.itemId);
      else audioOwners.delete(player.itemId);
    },
  });
  return { audioOwners, pool, prepared, released };
}

const items = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, uri: `video-${id}` }));

test('pool keeps active, three forward players, one reverse player, and one audio owner', async () => {
  const harness = createHarness();
  await harness.pool.update({ currentId: 3, direction: 1, items });

  assert.equal(harness.pool.size, 5);
  assert.deepEqual([...harness.pool.getResidentIds()], [3, 4, 5, 6, 2]);
  assert.deepEqual([...harness.audioOwners], [3]);
});

test('nearest item in swipe direction is prepared before the opposite neighbor', async () => {
  const harness = createHarness();
  await harness.pool.update({ currentId: 3, direction: 1, items });
  assert.deepEqual(harness.prepared, [3, 4, 5, 6, 2]);

  const reverse = createHarness();
  await reverse.pool.update({ currentId: 5, direction: -1, items });
  assert.deepEqual(reverse.prepared, [5, 4, 3, 2, 6]);
});

test('activation retains reusable neighbors and releases removed players exactly once', async () => {
  const harness = createHarness();
  await harness.pool.update({ currentId: 2, direction: 1, items });
  await harness.pool.update({ currentId: 3, direction: 1, items });

  assert.equal(harness.pool.size, 5);
  assert.deepEqual([...harness.pool.getResidentIds()], [3, 4, 5, 6, 2]);
  assert.deepEqual(harness.released, [1]);
  assert.deepEqual([...harness.audioOwners], [3]);

  harness.pool.dispose();
  harness.pool.dispose();
  assert.deepEqual([...harness.released].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
});

test('direction reversal reprioritizes the bounded five-player window', async () => {
  const harness = createHarness();
  await harness.pool.update({ currentId: 4, direction: 1, items });
  await harness.pool.update({ currentId: 4, direction: -1, items });

  assert.equal(harness.pool.size, 5);
  assert.deepEqual([...harness.pool.getResidentIds()], [4, 3, 2, 1, 5]);
  assert.deepEqual(harness.released, [6, 7]);
  assert.deepEqual([...harness.audioOwners], [4]);
});

test('empty updates release all players and clear audio ownership', async () => {
  const harness = createHarness();
  await harness.pool.update({ currentId: 2, direction: 1, items });
  await harness.pool.update({ currentId: 99, direction: 1, items: [] });

  assert.equal(harness.pool.size, 0);
  assert.deepEqual([...harness.audioOwners], []);
  assert.deepEqual([...harness.released].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test('an already playing instance can be adopted without replacing its source', async () => {
  const harness = createHarness();
  const playing = { itemId: 2 };
  harness.pool.adoptPlayer(items[1], playing, true);

  await harness.pool.update({ currentId: 2, direction: 1, items });

  assert.equal(harness.pool.getPlayer(2), playing);
  assert.equal(harness.pool.isReady(2), true);
  assert.deepEqual(harness.prepared, [3, 4, 5, 1]);
  harness.pool.dispose();
});

test('player preparation overlaps but never exceeds the bounded codec budget', async () => {
  const { VideoPreloadPool } = loadPool();
  let activePrepares = 0;
  let maxActivePrepares = 0;
  const releases = [];
  const pool = new VideoPreloadPool({
    createPlayer: (item) => ({ itemId: item.id }),
    getItemId: (item) => item.id,
    preparePlayer: async () => {
      activePrepares += 1;
      maxActivePrepares = Math.max(maxActivePrepares, activePrepares);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activePrepares -= 1;
    },
    releasePlayer: (player) => releases.push(player.itemId),
    setPlayerActive: () => undefined,
  });

  await pool.update({ currentId: 3, direction: 1, items });

  assert.equal(maxActivePrepares, 3);
  assert.equal(pool.getResidentIds().every((id) => pool.isReady(id)), true);
  pool.dispose();
  assert.equal(releases.length, 5);
});
