const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadQuery() {
  const filename = path.join(root, 'src/media/mediaReaderContextQuery.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { exports: module.exports, module }, { filename });
  return module.exports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('reader context maps all large collection scopes to image-only cursor filters', () => {
  const { buildMediaReaderCursorRequest } = loadQuery();
  assert.deepEqual(plain(buildMediaReaderCursorRequest({ type: 'import-batch', space: 'normal', ipId: 2, importBatchId: 9 })), {
    importBatchId: 9, limit: 81, mediaType: 'image', orderBy: 'sourceOrderAsc',
  });
  assert.deepEqual(plain(buildMediaReaderCursorRequest({ type: 'group', space: 'normal', ipId: 2, groupId: 7 })), {
    groupId: 7, ipId: 2, limit: 81, mediaType: 'image', orderBy: 'createdAtDesc',
  });
  assert.deepEqual(plain(buildMediaReaderCursorRequest({ type: 'tag', space: 'normal', tagId: 4 })), {
    limit: 81, mediaType: 'image', orderBy: 'createdAtDesc', tagId: 4,
  });
  assert.deepEqual(plain(buildMediaReaderCursorRequest({ type: 'favorites', space: 'normal' })), {
    favoritesOnly: true, limit: 81, mediaType: 'image', orderBy: 'createdAtDesc',
  });
  assert.deepEqual(plain(buildMediaReaderCursorRequest({ type: 'recent-viewed', space: 'normal' })), {
    limit: 81, mediaType: 'image', orderBy: 'lastViewedAtDesc', recentlyViewedOnly: true,
  });
});

test('ip filters and explicit image scope preserve their exact constraints', () => {
  const { buildMediaReaderCursorRequest } = loadQuery();
  assert.deepEqual(plain(buildMediaReaderCursorRequest({
    type: 'ip-all', space: 'normal', ipId: 5, filter: { type: 'size', minFileSize: 10, maxFileSize: 20 },
  })), {
    ipId: 5, limit: 81, maxFileSize: 20, mediaType: 'image', minFileSize: 10, orderBy: 'createdAtDesc',
  });
  assert.deepEqual(plain(buildMediaReaderCursorRequest({
    type: 'ip-all', space: 'normal', ipId: 5, filter: { type: 'recent-viewed' },
  })), {
    ipId: 5, limit: 81, mediaType: 'image', orderBy: 'lastViewedAtDesc', recentlyViewedOnly: true,
  });
  assert.deepEqual(plain(buildMediaReaderCursorRequest({ type: 'image-scope', space: 'normal', imageIds: [9, 3, 7] })), {
    imageIds: [9, 3, 7], limit: 81, mediaType: 'image', orderBy: 'createdAtDesc',
  });
});

test('bounded ip-recent context remains an explicit small-list load', () => {
  const { buildMediaReaderCursorRequest } = loadQuery();
  assert.equal(buildMediaReaderCursorRequest({ type: 'ip-recent', space: 'normal', ipId: 5, limit: 12 }), null);
});
