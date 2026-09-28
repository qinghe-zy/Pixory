const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath) {
  const filename = path.join(rootDir, relativePath);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module }, { filename });
  return module.exports;
}

test('scoped LRU refreshes reads and evicts the least recently used entry', () => {
  const { ScopedLruCache } = loadTypeScriptModule('src/services/scopedLruCache.ts');
  const cache = new ScopedLruCache({ maxEntries: 2, ttlMs: 1_000, now: () => 0 });

  cache.set('normal', 'a', 1);
  cache.set('normal', 'b', 2);
  assert.equal(cache.get('normal', 'a'), 1);
  cache.set('normal', 'c', 3);

  assert.equal(cache.get('normal', 'b'), undefined);
  assert.equal(cache.get('normal', 'a'), 1);
  assert.equal(cache.get('normal', 'c'), 3);
  assert.equal(cache.size, 2);
});

test('scoped LRU expires on access and clears only the requested scope', () => {
  const { ScopedLruCache } = loadTypeScriptModule('src/services/scopedLruCache.ts');
  let now = 10;
  const cache = new ScopedLruCache({ maxEntries: 4, ttlMs: 100, now: () => now });

  cache.set('normal', 'same', 'normal-value');
  cache.set('personal', 'same', 'personal-value', 20);
  cache.clearScope('normal');
  assert.equal(cache.get('normal', 'same'), undefined);
  assert.equal(cache.get('personal', 'same'), 'personal-value');

  now = 31;
  assert.equal(cache.get('personal', 'same'), undefined);
  assert.equal(cache.size, 0);
});

test('scoped LRU rejects invalid capacity and TTL values', () => {
  const { ScopedLruCache } = loadTypeScriptModule('src/services/scopedLruCache.ts');

  assert.throws(() => new ScopedLruCache({ maxEntries: 0, ttlMs: 100 }), /maxEntries/);
  assert.throws(() => new ScopedLruCache({ maxEntries: 1, ttlMs: 0 }), /ttlMs/);
});

test('expired newer entries are pruned before a live older entry is evicted', () => {
  const { ScopedLruCache } = loadTypeScriptModule('src/services/scopedLruCache.ts');
  let now = 0;
  const cache = new ScopedLruCache({ maxEntries: 2, ttlMs: 100, now: () => now });
  cache.set('normal', 'live', 1, 100);
  cache.set('normal', 'expires-first', 2, 10);

  now = 11;
  cache.set('normal', 'new', 3, 100);

  assert.equal(cache.get('normal', 'live'), 1);
  assert.equal(cache.get('normal', 'expires-first'), undefined);
  assert.equal(cache.get('normal', 'new'), 3);
});
