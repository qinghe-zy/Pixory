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
  constructor(maxBindParams = Number.POSITIVE_INFINITY) {
    this.maxBindParams = maxBindParams;
    this.db = new DatabaseSync(':memory:');
    this.db.exec(`
      CREATE TABLE ips (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, isFavorite INTEGER NOT NULL DEFAULT 0, coverImageAssetId INTEGER, coverBlurEnabled INTEGER, coverBlurRadius INTEGER, deletedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE groups (id INTEGER PRIMARY KEY, ipId INTEGER NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, sortOrder INTEGER NOT NULL DEFAULT 0, isPinned INTEGER NOT NULL DEFAULT 0, coverImageAssetId INTEGER, description TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE image_assets (id INTEGER PRIMARY KEY, ipId INTEGER NOT NULL, groupId INTEGER, thumbnailFileUri TEXT, fileSize INTEGER NOT NULL, mediaType TEXT NOT NULL DEFAULT 'image', deletedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, lastViewedAt TEXT);
      CREATE TABLE image_groups (imageAssetId INTEGER NOT NULL, groupId INTEGER NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY (imageAssetId, groupId));
      CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE image_tags (imageAssetId INTEGER NOT NULL, tagId INTEGER NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY (imageAssetId, tagId));
      CREATE INDEX idx_ips_deleted_at ON ips(deletedAt);
      CREATE INDEX idx_image_assets_ip_id ON image_assets(ipId);
      CREATE INDEX idx_groups_ip_id ON groups(ipId);
      CREATE INDEX idx_image_groups_group_id ON image_groups(groupId);
      CREATE INDEX idx_image_tags_tag_id ON image_tags(tagId);
    `);
  }

  assertBindLimit(params) {
    if (params.length > this.maxBindParams) {
      throw new Error(`too many SQL variables: ${params.length}`);
    }
  }

  async getAllAsync(sql, ...params) {
    this.assertBindLimit(params);
    this.lastQuery = { sql, params };
    return this.db.prepare(sql).all(...params);
  }
  async getFirstAsync(sql, ...params) {
    this.assertBindLimit(params);
    return this.db.prepare(sql).get(...params) ?? null;
  }
  async runAsync(sql, ...params) {
    this.assertBindLimit(params);
    return this.db.prepare(sql).run(...params);
  }
  async withTransactionAsync(action) {
    this.db.exec('BEGIN');
    try {
      await action();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
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

test('IP page aggregates start from page ids and use child ip indexes', async () => {
  const db = new TestDatabase();
  try {
    seed(db);
    await ipRepository.findLibraryItemsPage(db, { limit: 2 });
    const plan = db.db.prepare(`EXPLAIN QUERY PLAN ${db.lastQuery.sql}`).all(...db.lastQuery.params);
    const details = plan.map((row) => row.detail);
    assert.equal(details.some((detail) => /SCAN image_assets/.test(detail)), false);
    assert.equal(details.some((detail) => /SEARCH image_assets USING INDEX idx_image_assets_ip_id \(ipId=\?\)/.test(detail)), true);
    assert.equal(details.some((detail) => /SCAN groups/.test(detail)), false);
    assert.equal(details.some((detail) => /SEARCH groups USING COVERING INDEX idx_groups_ip_id \(ipId=\?\)/.test(detail)), true);
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

test('group and tag pages keep a stable id tie-breaker without duplicates', async () => {
  const db = new TestDatabase();
  try {
    seed(db);
    const firstGroups = await groupRepository.findOverviewPage(db, { ipId: 1, limit: 2, offset: 0 });
    const secondGroups = await groupRepository.findOverviewPage(db, { ipId: 1, limit: 2, offset: 2 });
    const thirdGroups = await groupRepository.findOverviewPage(db, { ipId: 1, limit: 2, offset: 4 });
    assert.deepEqual(
      [...firstGroups.items, ...secondGroups.items, ...thirdGroups.items].map((group) => group.id),
      [5, 4, 3, 2, 1]
    );

    const firstTags = await tagRepository.findUsageOverviewPage(db, { limit: 2, offset: 0 });
    const secondTags = await tagRepository.findUsageOverviewPage(db, { limit: 2, offset: 2 });
    assert.deepEqual([...firstTags.items, ...secondTags.items].map((tag) => tag.id), [1, 2, 3]);
  } finally {
    db.close();
  }
});

test('repository pages stay bounded with 1000 IPs, 5000 groups, and 10000 tags', async () => {
  const db = new TestDatabase();
  try {
    const now = '2026-08-13T10:00:00.000Z';
    db.db.exec(`
      WITH RECURSIVE seq(id) AS (SELECT 1 UNION ALL SELECT id + 1 FROM seq WHERE id < 1000)
      INSERT INTO ips (id, name, createdAt, updatedAt)
      SELECT id, printf('IP %04d', id), '${now}', '${now}' FROM seq;
      WITH RECURSIVE seq(id) AS (SELECT 1 UNION ALL SELECT id + 1 FROM seq WHERE id < 5000)
      INSERT INTO groups (id, ipId, name, type, createdAt, updatedAt)
      SELECT id, ((id - 1) % 1000) + 1, printf('Group %05d', id), 'custom', '${now}', '${now}' FROM seq;
      WITH RECURSIVE seq(id) AS (SELECT 1 UNION ALL SELECT id + 1 FROM seq WHERE id < 10000)
      INSERT INTO tags (id, name, createdAt, updatedAt)
      SELECT id, printf('Tag %05d', id), '${now}', '${now}' FROM seq;
    `);

    const ips = await ipRepository.findLibraryItemsPage(db, { limit: 20 });
    const groups = await groupRepository.findOverviewPage(db, { limit: 30 });
    const tags = await tagRepository.findUsageOverviewPage(db, { limit: 60 });
    assert.equal(ips.items.length, 20);
    assert.equal(groups.items.length, 30);
    assert.equal(tags.items.length, 60);
    assert.equal(ips.hasMore && groups.hasMore && tags.hasMore, true);
  } finally {
    db.close();
  }
});

test('batch tag deletion respects Android-sized SQLite bind limits', async () => {
  const db = new TestDatabase(999);
  try {
    const now = '2026-08-13T10:00:00.000Z';
    db.db.exec(`
      INSERT INTO ips (id, name, createdAt, updatedAt) VALUES (1, 'IP', '${now}', '${now}');
      WITH RECURSIVE seq(id) AS (SELECT 1 UNION ALL SELECT id + 1 FROM seq WHERE id < 1200)
      INSERT INTO image_assets (id, ipId, fileSize, mediaType, createdAt, updatedAt)
      SELECT id, 1, 1, 'image', '${now}', '${now}' FROM seq;
      WITH RECURSIVE seq(id) AS (SELECT 1 UNION ALL SELECT id + 1 FROM seq WHERE id < 1200)
      INSERT INTO tags (id, name, createdAt, updatedAt)
      SELECT id, printf('Tag %04d', id), '${now}', '${now}' FROM seq;
      WITH RECURSIVE seq(id) AS (SELECT 1 UNION ALL SELECT id + 1 FROM seq WHERE id < 1200)
      INSERT INTO image_tags (imageAssetId, tagId, createdAt)
      SELECT id, id, '${now}' FROM seq;
    `);

    const ids = Array.from({ length: 1200 }, (_, index) => index + 1);
    assert.equal(await tagRepository.deleteMany(db, ids), 1200);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM tags').get().count, 0);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM image_tags').get().count, 0);
  } finally {
    db.close();
  }
});

test('global group search is filtered and limited in SQLite', async () => {
  const db = new TestDatabase();
  try {
    seed(db);
    const groups = await groupRepository.findOverviewSearch(db, 'G', 2);
    assert.equal(groups.length, 2);
    assert.equal(groups.every((group) => group.name.startsWith('G')), true);
    assert.deepEqual(await groupRepository.findOverviewSearch(db, '', 2), []);
  } finally {
    db.close();
  }
});
