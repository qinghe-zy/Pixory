const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('stores one current diary per role and Beijing date with versions and jobs', () => {
  const schema = readFileSync('src/database/schema.ts', 'utf8');
  const database = readFileSync('src/database/db.ts', 'utf8');

  assert.match(schema, /export const DATABASE_VERSION = 5[1-9]/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS companion_diaries/);
  assert.match(schema, /UNIQUE\s*\(roleCardId, diaryDate\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS companion_diary_versions/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS companion_diary_jobs/);
  assert.match(database, /MIGRATION_STATEMENTS_V49/);
});

test('stores frozen diary prompt provenance separately from the effective message hash and indexes round lookup', () => {
  const schema = readFileSync('src/database/schema.ts', 'utf8');
  const database = readFileSync('src/database/db.ts', 'utf8');

  assert.match(schema, /export const DATABASE_VERSION = 57/);
  assert.match(schema, /ALTER TABLE companion_diary_jobs ADD COLUMN sourceSystemPromptSnapshot TEXT/);
  assert.match(schema, /ALTER TABLE companion_diary_versions ADD COLUMN jobContextSnapshotHash TEXT/);
  assert.match(schema, /ALTER TABLE companion_diary_versions ADD COLUMN sourceSystemPromptSnapshot TEXT/);
  assert.match(schema, /idx_ai_messages_snapshot_candidates[\s\S]*threadId, status, role, createdAt DESC/);
  assert.match(database, /MIGRATION_STATEMENTS_V57/);
  assert.match(database, /currentVersion < 57/);
});
