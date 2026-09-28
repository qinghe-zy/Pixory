const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, cache = new Map()) {
  const filename = path.join(root, relativePath);
  if (cache.has(filename)) {
    return cache.get(filename).exports;
  }
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
  vm.runInNewContext(output, { exports: module.exports, module, require: localRequire }, { filename });
  return module.exports;
}

function snapshot(currentId, currentIndex = 0) {
  return {
    currentId,
    currentIndex,
    entryId: 5,
    hasNewer: false,
    hasOlder: true,
    items: [{ id: currentId }],
    newerCursor: null,
    olderCursor: { id: currentId, sortValue: currentId },
  };
}

test('reader sessions are keyed by context and data epoch and restore current position', () => {
  const { MediaReaderSessionCache } = loadTypeScriptModule('src/media/mediaReaderSessionCache.ts');
  const cache = new MediaReaderSessionCache({ maxEntries: 4, ttlMs: 1_000, now: () => 0 });
  const first = snapshot(42, 3);

  cache.set('normal', 'ip:7:all', 4, first);

  assert.equal(cache.get('normal', 'ip:7:all', 4).currentId, 42);
  assert.equal(cache.get('normal', 'ip:7:all', 4).currentIndex, 3);
  assert.equal(cache.get('normal', 'ip:7:all', 4).entryId, 5);
  assert.equal(cache.get('normal', 'ip:7:all', 5), undefined);
  assert.equal(cache.get('normal', 'ip:8:all', 4), undefined);
});

test('reader session cache has bounded LRU capacity', () => {
  const { MediaReaderSessionCache } = loadTypeScriptModule('src/media/mediaReaderSessionCache.ts');
  const cache = new MediaReaderSessionCache({ maxEntries: 2, ttlMs: 1_000, now: () => 0 });

  cache.set('normal', 'a', 0, snapshot(1));
  cache.set('normal', 'b', 0, snapshot(2));
  cache.get('normal', 'a', 0);
  cache.set('normal', 'c', 0, snapshot(3));

  assert.equal(cache.get('normal', 'b', 0), undefined);
  assert.equal(cache.get('normal', 'a', 0).currentId, 1);
  assert.equal(cache.get('normal', 'c', 0).currentId, 3);
});

test('clearing Personal sessions preserves normal-space restoration', () => {
  const { MediaReaderSessionCache } = loadTypeScriptModule('src/media/mediaReaderSessionCache.ts');
  const cache = new MediaReaderSessionCache({ maxEntries: 4, ttlMs: 1_000, now: () => 0 });

  cache.set('normal', 'same', 0, snapshot(1));
  cache.set('personal', 'same', 0, snapshot(2));
  cache.clearSpace('personal');

  assert.equal(cache.get('personal', 'same', 0), undefined);
  assert.equal(cache.get('normal', 'same', 0).currentId, 1);
});

test('context serialization is stable across object key order but preserves array order', () => {
  const { createMediaReaderContextKey } = loadTypeScriptModule('src/media/mediaReaderSessionCache.ts');
  const a = createMediaReaderContextKey({ type: 'ip-all', space: 'normal', filter: { type: 'size', maxFileSize: 20, minFileSize: 10 } });
  const b = createMediaReaderContextKey({ filter: { minFileSize: 10, type: 'size', maxFileSize: 20 }, space: 'normal', type: 'ip-all' });

  assert.equal(a, b);
  assert.notEqual(createMediaReaderContextKey({ imageIds: [1, 2] }), createMediaReaderContextKey({ imageIds: [2, 1] }));
});
