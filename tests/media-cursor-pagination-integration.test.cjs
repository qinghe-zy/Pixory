const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const previousTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = function compileTypeScript(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
let imageRepository;
let assetRepository;
try {
  ({ imageRepository } = require(path.join(root, 'src/database/repositories/imageRepository.ts')));
  ({ assetRepository } = require(path.join(root, 'src/database/repositories/assetRepository.ts')));
} finally {
  if (previousTsLoader) require.extensions['.ts'] = previousTsLoader;
  else delete require.extensions['.ts'];
}

class TestDatabase {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(`
      CREATE TABLE ips (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE image_assets (
        id INTEGER PRIMARY KEY, ipId INTEGER NOT NULL, importBatchId INTEGER, sourceOrder INTEGER, groupId INTEGER,
        mediaType TEXT NOT NULL, originalFileUri TEXT NOT NULL DEFAULT '', thumbnailFileUri TEXT, coverThumbnailFileUri TEXT,
        originalFilename TEXT NOT NULL DEFAULT '', internalFilename TEXT NOT NULL DEFAULT '', width INTEGER NOT NULL DEFAULT 1,
        height INTEGER NOT NULL DEFAULT 1, durationMs INTEGER, mimeType TEXT NOT NULL DEFAULT 'image/jpeg', fileSize INTEGER NOT NULL DEFAULT 1,
        isFavorite INTEGER NOT NULL DEFAULT 0, note TEXT, deletedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        lastViewedAt TEXT, lastPlaybackPositionMs INTEGER, previewStatus TEXT NOT NULL DEFAULT 'ready', contentHash TEXT, visualHash TEXT
      );
      CREATE TABLE groups (id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'custom', sortOrder INTEGER NOT NULL DEFAULT 0, updatedAt TEXT NOT NULL);
      CREATE TABLE image_groups (imageAssetId INTEGER NOT NULL, groupId INTEGER NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE image_tags (imageAssetId INTEGER NOT NULL, tagId INTEGER NOT NULL, createdAt TEXT NOT NULL);
    `);
    this.db.prepare("INSERT INTO ips (id, name) VALUES (1, 'IP')").run();
    const insert = this.db.prepare(`INSERT INTO image_assets
      (id, ipId, sourceOrder, mediaType, originalFilename, internalFilename, fileSize, deletedAt, createdAt, updatedAt, lastViewedAt)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (let id = 1; id <= 8; id += 1) {
      const createdAt = id <= 4 ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z';
      const viewedAt = id === 1 ? null : `2026-01-${String(Math.ceil(id / 2)).padStart(2, '0')}T00:00:00.000Z`;
      insert.run(id, Math.ceil(id / 2), [2, 5, 8].includes(id) ? 'video' : 'image', `${9 - id}.jpg`, `${id}.jpg`, id * 10, null, createdAt, createdAt, viewedAt);
    }
    this.db.exec(`
      INSERT INTO groups (id, name, updatedAt) VALUES (1, 'G', '2026-01-01');
      INSERT INTO tags (id, name) VALUES (1, 'T');
      INSERT INTO image_groups (imageAssetId, groupId, createdAt) VALUES (1,1,'x'),(2,1,'x'),(3,1,'x');
      INSERT INTO image_tags (imageAssetId, tagId, createdAt) VALUES (2,1,'x'),(3,1,'x'),(4,1,'x');
    `);
  }
  async getAllAsync(sql, ...params) { this.lastQuery = { sql, params }; return this.db.prepare(sql).all(...params); }
  async getFirstAsync(sql, ...params) { return this.db.prepare(sql).get(...params) ?? null; }
  close() { this.db.close(); }
}

test('created-time cursor pages keep equal timestamps stable without duplicates or OFFSET', async () => {
  const db = new TestDatabase();
  try {
    const first = await imageRepository.findFilteredCursorPage(db, { direction: 'after', limit: 3, mediaType: 'all', orderBy: 'createdAtDesc' });
    const second = await imageRepository.findFilteredCursorPage(db, { cursor: first.olderCursor, direction: 'after', limit: 3, mediaType: 'all', orderBy: 'createdAtDesc' });
    assert.deepEqual(first.items.map((item) => item.id), [8, 7, 6]);
    assert.deepEqual(second.items.map((item) => item.id), [5, 4, 3]);
    assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 6);
    assert.doesNotMatch(db.lastQuery.sql, /OFFSET/i);
    assert.equal(db.lastQuery.params.at(-1), 4);
  } finally { db.close(); }
});

test('cursor pages support every asset-list sort and deleted-only scopes', async () => {
  const db = new TestDatabase();
  try {
    const cases = [
      ['createdAtAsc', [1, 2, 3]],
      ['updatedAtDesc', [8, 7, 6]],
      ['updatedAtAsc', [1, 2, 3]],
      ['lastViewedAtAsc', [2, 3, 4]],
      ['sourceOrderDesc', [8, 7, 6]],
      ['filenameAsc', [8, 7, 6]],
      ['filenameDesc', [1, 2, 3]],
      ['fileSizeDesc', [8, 7, 6]],
      ['fileSizeAsc', [1, 2, 3]],
    ];
    for (const [orderBy, expected] of cases) {
      const page = await imageRepository.findFilteredCursorPage(db, { direction: 'after', limit: 3, mediaType: 'all', orderBy });
      assert.deepEqual(page.items.map((item) => item.id), expected, orderBy);
      assert.doesNotMatch(db.lastQuery.sql, /OFFSET/i);
    }
    db.db.exec("UPDATE image_assets SET deletedAt = createdAt WHERE id IN (7, 8)");
    const trash = await imageRepository.findFilteredCursorPage(db, {
      deletedOnly: true,
      direction: 'after',
      includeDeleted: true,
      limit: 3,
      mediaType: 'all',
      orderBy: 'deletedAtDesc',
    });
    assert.deepEqual(trash.items.map((item) => item.id), [8, 7]);
  } finally { db.close(); }
});

test('cursor pages preserve source, viewed, id, group, tag, and video filters', async () => {
  const db = new TestDatabase();
  try {
    const source = await imageRepository.findFilteredCursorPage(db, { direction: 'after', limit: 4, mediaType: 'all', orderBy: 'sourceOrderAsc' });
    assert.deepEqual(source.items.map((item) => item.id), [1, 2, 3, 4]);
    const viewed = await imageRepository.findFilteredCursorPage(db, { direction: 'after', limit: 3, mediaType: 'all', orderBy: 'lastViewedAtDesc' });
    assert.deepEqual(viewed.items.map((item) => item.id), [8, 7, 6]);
    const explicit = await imageRepository.findFilteredCursorPage(db, { direction: 'after', imageIds: [1, 4, 7], limit: 5, mediaType: 'all', orderBy: 'createdAtDesc' });
    assert.deepEqual(explicit.items.map((item) => item.id), [7, 4, 1]);
    const grouped = await imageRepository.findFilteredCursorPage(db, { direction: 'after', groupId: 1, limit: 5, mediaType: 'all', orderBy: 'createdAtDesc' });
    assert.deepEqual(grouped.items.map((item) => item.id), [3, 2, 1]);
    const tagged = await imageRepository.findFilteredCursorPage(db, { direction: 'after', tagId: 1, limit: 5, mediaType: 'all', orderBy: 'createdAtDesc' });
    assert.deepEqual(tagged.items.map((item) => item.id), [4, 3, 2]);
    const videos = await assetRepository.findVideoQueuePageByIpId(db, 1, { direction: 'after', limit: 5, orderBy: 'createdAtDesc' });
    assert.deepEqual(videos.items.map((item) => item.id), [8, 5, 2]);
  } finally { db.close(); }
});

test('around-anchor cursor page keeps the anchor and both bounded neighbors', async () => {
  const db = new TestDatabase();
  try {
    const page = await imageRepository.findCursorPageAroundId(db, 4, { limit: 5, mediaType: 'all', orderBy: 'createdAtDesc' });
    assert.deepEqual(page.items.map((item) => item.id), [6, 5, 4, 3, 2]);
    assert.equal(page.items.some((item) => item.id === 4), true);
  } finally { db.close(); }
});
