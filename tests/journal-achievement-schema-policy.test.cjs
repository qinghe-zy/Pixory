const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('journal achievement storage keeps source and unread state per space', () => {
  const schema = read('src/database/schema.ts');
  assert.match(schema, /DATABASE_VERSION = 63/);
  assert.match(schema, /MIGRATION_STATEMENTS_V63/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS journal_achievements/);
  for (const column of [
    'space',
    'achievementId',
    'category',
    'occurredAt',
    'unlockedAt',
    'readAt',
    'sourceType',
    'sourceId',
    'sourcePayload',
  ]) {
    assert.match(schema, new RegExp(`\\b${column}\\b`));
  }
  assert.match(schema, /UNIQUE\(space, achievementId\)/);
  assert.match(schema, /idx_journal_achievements_space_category_read/);
});

test('database migration runner applies the journal achievement migration', () => {
  const db = read('src/database/db.ts');
  assert.match(db, /MIGRATION_STATEMENTS_V63/);
});
