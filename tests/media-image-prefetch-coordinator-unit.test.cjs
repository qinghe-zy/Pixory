const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, cache = new Map()) {
  const filename = path.join(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  cache.set(filename, module);
  const localRequire = (request) => {
    if (request.startsWith('.')) {
      const resolved = path.relative(root, path.resolve(path.dirname(filename), request)).replaceAll('\\', '/');
      return loadTypeScriptModule(resolved.endsWith('.ts') ? resolved : `${resolved}.ts`, cache);
    }
    return require(request);
  };
  vm.runInNewContext(output, { exports: module.exports, module, require: localRequire, setTimeout, clearTimeout }, { filename });
  return module.exports;
}

function items(count, prefix = 'image') {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1, originalFileUri: `${prefix}-${index + 1}` }));
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('encoded prefetch is bounded at four concurrent requests and fast fling does not decode the full list', async () => {
  const { MediaImagePrefetchCoordinator } = loadTypeScriptModule('src/media/mediaImagePrefetchCoordinator.ts');
  let active = 0;
  let peak = 0;
  const pending = [];
  const decoded = [];
  const coordinator = new MediaImagePrefetchCoordinator({
    prefetchEncoded: (uri) => new Promise((resolve) => {
      active += 1;
      peak = Math.max(peak, active);
      pending.push(() => { active -= 1; resolve(true); });
    }),
    decodeImage: async (uri) => { decoded.push(uri); return { release() {} }; },
  });

  coordinator.updateTarget({ items: items(60), index: 20, direction: 1, velocity: 4, space: 'normal' });
  await settle();
  assert.equal(peak, 4);
  assert.equal(decoded.length <= 10, true);
  assert.equal(decoded.length < 60, true);

  while (pending.length > 0) {
    pending.splice(0).forEach((resolve) => resolve());
    await settle();
  }
  assert.equal(peak, 4);
  coordinator.dispose();
});

test('Personal prefetch uses memory-only policy', async () => {
  const { MediaImagePrefetchCoordinator } = loadTypeScriptModule('src/media/mediaImagePrefetchCoordinator.ts');
  const policies = [];
  const coordinator = new MediaImagePrefetchCoordinator({
    prefetchEncoded: async (_uri, policy) => { policies.push(policy); return true; },
    decodeImage: async () => ({ release() {} }),
  });

  coordinator.updateTarget({ items: items(3), index: 0, direction: 1, velocity: 0, space: 'personal' });
  await settle();

  assert.equal(policies.length > 0, true);
  assert.deepEqual([...new Set(policies)], ['memory']);
  coordinator.dispose();
});

test('obsolete decode completions are released and never reported as current', async () => {
  const { MediaImagePrefetchCoordinator } = loadTypeScriptModule('src/media/mediaImagePrefetchCoordinator.ts');
  const pendingDecodes = new Map();
  const released = [];
  const reported = [];
  const coordinator = new MediaImagePrefetchCoordinator({
    prefetchEncoded: async () => true,
    decodeImage: (uri) => new Promise((resolve) => pendingDecodes.set(uri, resolve)),
    onDecoded: (uri) => reported.push(uri),
  });

  coordinator.updateTarget({ items: items(1, 'old'), index: 0, direction: 1, velocity: 0, space: 'normal' });
  await settle();
  coordinator.updateTarget({ items: items(1, 'new'), index: 0, direction: 1, velocity: 0, space: 'normal' });
  await settle();

  pendingDecodes.get('old-1')({ release: () => released.push('old-1') });
  pendingDecodes.get('new-1')({ release: () => released.push('new-1') });
  await settle();

  assert.deepEqual(reported, ['new-1']);
  assert.deepEqual(released, ['old-1']);
  coordinator.dispose();
  assert.deepEqual(released, ['old-1', 'new-1']);
});

test('overlapping swipe windows do not resend encoded prefetch work already cached', async () => {
  const { MediaImagePrefetchCoordinator } = loadTypeScriptModule('src/media/mediaImagePrefetchCoordinator.ts');
  const prefetched = [];
  const coordinator = new MediaImagePrefetchCoordinator({
    prefetchEncoded: async (uri) => { prefetched.push(uri); return true; },
    decodeImage: async () => ({ release() {} }),
  });
  const mediaItems = items(5);

  coordinator.updateTarget({ items: mediaItems, index: 2, direction: 1, velocity: 0, space: 'normal' });
  await settle();
  const firstCount = prefetched.length;
  coordinator.updateTarget({ items: mediaItems, index: 3, direction: 1, velocity: 0, space: 'normal' });
  await settle();

  assert.equal(firstCount, 5);
  assert.equal(prefetched.length, firstCount);
  coordinator.dispose();
});

test('high memory pressure releases decoded refs and keeps subsequent work encoded-only', async () => {
  const { MediaImagePrefetchCoordinator } = loadTypeScriptModule('src/media/mediaImagePrefetchCoordinator.ts');
  const decoded = [];
  const released = [];
  const mediaItems = items(4);
  const coordinator = new MediaImagePrefetchCoordinator({
    prefetchEncoded: async () => true,
    decodeImage: async (uri) => {
      decoded.push(uri);
      return { release: () => released.push(uri) };
    },
  });

  coordinator.updateTarget({ items: mediaItems, index: 1, direction: 1, velocity: 0, space: 'normal' });
  await settle();
  assert.equal(decoded.length > 0, true);
  const decodedBeforePressure = decoded.length;

  coordinator.updateTarget({
    items: mediaItems,
    index: 1,
    direction: 1,
    memoryPressure: 'high',
    velocity: 4,
    space: 'normal',
  });
  await settle();

  assert.equal(released.length, decodedBeforePressure);
  assert.equal(decoded.length, decodedBeforePressure);
  coordinator.dispose();
});
