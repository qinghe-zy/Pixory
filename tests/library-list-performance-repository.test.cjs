const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const previousTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = function compileTypeScript(module, filename) {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename
  );
};

let ipRepository;
let groupRepository;
let tagRepository;
try {
  ({ ipRepository } = require(path.join(root, 'src/database/repositories/ipRepository.ts')));
  ({ groupRepository } = require(path.join(root, 'src/database/repositories/groupRepository.ts')));
  ({ tagRepository } = require(path.join(root, 'src/database/repositories/tagRepository.ts')));
} finally {
  if (previousTsLoader) require.extensions['.ts'] = previousTsLoader;
  else delete require.extensions['.ts'];
}

class TestDatabase {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(`
      CREATE TABLE ips (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, isFavorite INTEGER NOT NULL DEFAULT 0, coverImageAssetId INTEGER, coverBlurEnabled INTEGER, coverBlurRadius INTEGER, deletedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE groups (id INTEGER PRIMARY KEY, ipId INTEGER NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, sortOrder INTEGER NOT NULL DEFAULT 0, isPinned INTEGER NOT NULL DEFAULT 0, coverImageAssetId INTEGER, description TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE image_assets (id INTEGER PRIMARY KEY, ipId INTEGER NOT NULL, groupId INTEGER, thumbnailFileUri TEXT, fileSize INTEGER NOT NULL, mediaType TEXT NOT NULL DEFAULT 'image', deletedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, lastViewedAt TEXT);
      CREATE TABLE image_groups (imageAssetId INTEGER NOT NULL, groupId INTEGER NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY (imageAssetId, groupId));
      CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE image_tags (imageAssetId INTEGER NOT NULL, tagId INTEGER NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY (imageAssetId, tagId));
    `);
  }

  async getAllAsync(sql, ...params) { return this.db.prepare(sql).all(...params); }
  async getFirstAsync(sql, ...params) { return this.db.prepare(sql).get(...params) ?? null; }
  close() { this.db.close(); }
}

function seed(db) {
  const now = '2026-08-13T10:00:00.000Z';
  for (let id = 1; id <= 3; id += 1) {
    db.db.prepare('INSERT INTO ips (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)').run(id, `IP ${id}`, now, now);
  }
  db.db.prepare("INSERT INTO groups (id, ipId, name, type, createdAt, updatedAt) VALUES (1, 1, 'G1', 'custom', ?, ?), (2, 1, 'G2', 'custom', ?, ?), (3, 1, 'G3', 'custom', ?, ?), (4, 1, 'G4', 'custom', ?, ?), (5, 1, 'G5', 'custom', ?, ?)").run(now, now, now, now, now, now, now, now, now, now);
  db.db.prepare("INSERT INTO image_assets (id, ipId, fileSize, mediaType, createdAt, updatedAt, lastViewedAt) VALUES (1, 1, 100, 'image', ?, ?, ?), (2, 1, 100, 'image', ?, ?, ?), (3, 2, 50, 'video', ?, ?, ?), (4, 3, 25, 'image', ?, ?, ?)").run(now, now, now, now, now, now, now, now, now, now, now, now);
  db.db.prepare("INSERT INTO tags (id, name, createdAt, updatedAt) VALUES (1, 'alpha', ?, ?), (2, 'beta', ?, ?), (3, 'gamma', ?, ?)").run(now, now, now, now, now, now);
  db.db.prepare("INSERT INTO image_tags (imageAssetId, tagId, createdAt) VALUES (1, 1, ?), (2, 1, ?), (3, 2, ?), (4, 3, ?)").run(now, now, now, now);
}

test('IP library pages preserve all rows and sum equal-sized assets correctly', async () => {
  const db = new TestDatabase();
  try {
    seed(db);
    const first = await ipRepository.findLibraryItemsPage(db, { limit: 2, offset: 0 });
    const second = await ipRepository.findLibraryItemsPage(db, { limit: 2, offset: 2 });
    assert.deepEqual([...first.items, ...second.items].map((item) => item.id), [1, 2, 3]);
    assert.equal(first.items[0].totalBytes, 200);
    assert.equal(first.hasMore, true);
    assert.equal(second.hasMore, false);
  } finally {
    db.close();
  }
});

test('tag overview helpers return SQL-limited recent and popular tags', async () => {
  const db = new TestDatabase();
  try {
    seed(db);
    const popular = await tagRepository.findPopular(db, 1);
    const recent = await tagRepository.findRecentlyUsed(db, 1);
    assert.deepEqual(popular.map((tag) => tag.name), ['alpha']);
    assert.equal(recent.length, 1);
  } finally {
    db.close();
  }
});

test('IP detail group preview queries only the requested limit', async () => {
  const db = new TestDatabase();
  try {
    seed(db);
    const groups = await groupRepository.findOverviewPreviewByIpId(db, 1, 4);
    assert.equal(groups.length, 4);
  } finally {
    db.close();
  }
});
