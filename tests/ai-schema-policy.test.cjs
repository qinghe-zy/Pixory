const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'src/database/schema.ts'), 'utf8');
const db = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/database/index.ts'), 'utf8');

test('AI migration bumps database version and creates core local tables', () => {
  assert.match(schema, /DATABASE_VERSION = 18/);
  for (const table of [
    'ai_providers',
    'ai_provider_models',
    'ai_role_cards',
    'ai_threads',
    'ai_messages',
    'ai_knowledge_bases',
    'ai_documents',
    'ai_chunks',
    'ai_embeddings',
    'ai_message_citations',
  ]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test('AI data model preserves space isolation and local document ownership', () => {
  assert.match(schema, /space TEXT NOT NULL CHECK \(space IN \('normal', 'personal'\)\)/);
  assert.match(schema, /avatarEnabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /avatarUri TEXT/);
  assert.match(schema, /ownerType TEXT NOT NULL CHECK \(ownerType IN \('knowledge_base', 'ip', 'thread'\)\)/);
  assert.match(schema, /parserStatus TEXT NOT NULL CHECK/);
});

test('database runner applies AI migration and exports AI repositories', () => {
  assert.match(db, /MIGRATION_STATEMENTS_V17/);
  assert.match(db, /MIGRATION_STATEMENTS_V18/);
  assert.match(db, /currentVersion < 17/);
  assert.match(db, /currentVersion < 18/);
  assert.match(index, /aiProviderRepository/);
  assert.match(index, /aiThreadRepository/);
  assert.match(index, /aiKnowledgeRepository/);
});
