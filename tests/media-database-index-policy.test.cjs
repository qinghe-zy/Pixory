const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readPerformanceIndexStatements() {
  const dbSource = readProjectFile('src/database/db.ts');
  const match = dbSource.match(/const MEDIA_PERFORMANCE_INDEX_STATEMENTS = `([\s\S]*?)`;/);
  assert.ok(match, 'db.ts must expose one idempotent media performance index statement block');
  return match[1];
}

function explainDetails(db, sql, ...params) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((row) => String(row.detail));
}

test('runtime initialization ensures media indexes without bumping schema version', () => {
  const dbSource = readProjectFile('src/database/db.ts');
  const schemaSource = readProjectFile('src/database/schema.ts');

  assert.match(dbSource, /async function ensureMediaPerformanceIndexes\(db: SQLiteDatabase\)/);
  assert.match(dbSource, /await ensureMediaPerformanceIndexes\(database\)/);
  assert.match(dbSource, /idx_image_assets_ip_media_live_created/);
  assert.match(dbSource, /idx_image_assets_media_live_viewed/);
  assert.match(dbSource, /idx_ai_messages_thread_created_id/);
  assert.match(schemaSource, /DATABASE_VERSION\s*=\s*(?:59|6[01])/);
});

test('media and chat hot queries use the intended composite indexes without temp sorting', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE image_assets (
        id INTEGER PRIMARY KEY,
        ipId INTEGER NOT NULL,
        mediaType TEXT NOT NULL,
        deletedAt TEXT,
        createdAt TEXT NOT NULL,
        lastViewedAt TEXT
      );
      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY,
        threadId TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
    `);
    db.exec(readPerformanceIndexStatements());

    const createdPlan = explainDetails(
      db,
      `SELECT id FROM image_assets
       WHERE ipId = ? AND mediaType = ? AND deletedAt IS NULL
       ORDER BY createdAt DESC, id DESC LIMIT ?`,
      1,
      'image',
      40
    );
    const viewedPlan = explainDetails(
      db,
      `SELECT id FROM image_assets
       WHERE mediaType = ? AND deletedAt IS NULL AND lastViewedAt IS NOT NULL
       ORDER BY lastViewedAt DESC, id DESC LIMIT ?`,
      'image',
      40
    );
    const chatPlan = explainDetails(
      db,
      `SELECT id FROM ai_messages
       WHERE threadId = ?
       ORDER BY createdAt DESC, id DESC LIMIT ?`,
      'thread-a',
      60
    );

    assert.ok(createdPlan.some((detail) => detail.includes('idx_image_assets_ip_media_live_created')), createdPlan.join('\n'));
    assert.ok(viewedPlan.some((detail) => detail.includes('idx_image_assets_media_live_viewed')), viewedPlan.join('\n'));
    assert.ok(chatPlan.some((detail) => detail.includes('idx_ai_messages_thread_created_id')), chatPlan.join('\n'));
    for (const detail of [...createdPlan, ...viewedPlan, ...chatPlan]) {
      assert.doesNotMatch(detail, /USE TEMP B-TREE/);
    }
  } finally {
    db.close();
  }
});
