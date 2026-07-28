const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('stores one current diary per role and Beijing date with versions and jobs', () => {
  const schema = readFileSync('src/database/schema.ts', 'utf8');
  const database = readFileSync('src/database/db.ts', 'utf8');

  assert.match(schema, /export const DATABASE_VERSION = 50/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS companion_diaries/);
  assert.match(schema, /UNIQUE\s*\(roleCardId, diaryDate\)/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS companion_diary_versions/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS companion_diary_jobs/);
  assert.match(database, /MIGRATION_STATEMENTS_V49/);
});
