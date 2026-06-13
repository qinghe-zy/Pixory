const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'src/database/schema.ts'), 'utf8');
const db = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/database/index.ts'), 'utf8');

test('AI migration bumps database version and creates core local tables', () => {
  assert.match(schema, /DATABASE_VERSION = 37/);
  assert.match(schema, /MIGRATION_STATEMENTS_V19/);
  assert.match(schema, /MIGRATION_STATEMENTS_V20/);
  assert.match(schema, /MIGRATION_STATEMENTS_V21/);
  assert.match(schema, /MIGRATION_STATEMENTS_V22/);
  assert.match(schema, /MIGRATION_STATEMENTS_V23/);
  assert.match(schema, /MIGRATION_STATEMENTS_V24/);
  assert.match(schema, /MIGRATION_STATEMENTS_V25/);
  assert.match(schema, /MIGRATION_STATEMENTS_V26/);
  assert.match(schema, /MIGRATION_STATEMENTS_V27/);
  assert.match(schema, /MIGRATION_STATEMENTS_V28/);
  assert.match(schema, /MIGRATION_STATEMENTS_V29/);
  assert.match(schema, /embeddingBaseUrl TEXT/);
  assert.match(schema, /roleInstructionWeight TEXT NOT NULL DEFAULT 'default'/);
  assert.match(schema, /replyPreference TEXT NOT NULL DEFAULT 'auto'/);
  assert.match(schema, /ALTER TABLE ai_memories ADD COLUMN ipId INTEGER/);
  assert.match(schema, /ALTER TABLE ai_memories ADD COLUMN groupId INTEGER/);
  assert.match(schema, /ALTER TABLE ai_memories ADD COLUMN imageAssetId INTEGER/);
  assert.match(schema, /ALTER TABLE ai_memories ADD COLUMN assetSnapshotJson TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(schema, /ALTER TABLE ai_memories ADD COLUMN sourceKind TEXT NOT NULL DEFAULT 'auto'/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_thread_memory_jobs/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_user_profiles/);
  assert.match(schema, /profileJson TEXT NOT NULL/);
  assert.match(schema, /profileText TEXT NOT NULL/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_thread_summary_segments/);
  assert.match(schema, /kind TEXT NOT NULL CHECK \(kind IN \('compressed', 'merged'\)\)/);
  assert.match(schema, /lastCompressedMessageId TEXT/);
  assert.match(schema, /uncompressedRoundCount INTEGER NOT NULL DEFAULT 0/);
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
    'ai_message_versions',
  ]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test('AI memory performance migration adds normalized content index and active duplicate guard', () => {
  assert.match(schema, /DATABASE_VERSION = 37/);
  assert.match(schema, /MIGRATION_STATEMENTS_V27/);
  assert.match(schema, /idx_ai_memories_normalized_content/);
  assert.match(schema, /space,\s*scope,\s*scopeId,\s*normalizedContent,\s*status/);
  assert.match(schema, /MIGRATION_STATEMENTS_V28/);
  assert.match(schema, /duplicateRank > 1/);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_memories_active_normalized_content/);
  assert.match(schema, /WHERE status = 'active'/);
  assert.match(db, /MIGRATION_STATEMENTS_V27/);
  assert.match(db, /currentVersion < 27/);
  assert.match(db, /MIGRATION_STATEMENTS_V28/);
  assert.match(db, /currentVersion < 28/);
  assert.match(schema, /MIGRATION_STATEMENTS_V29/);
  assert.match(schema, /supersededByMemoryId TEXT/);
  assert.match(schema, /lastReconciledAt TEXT/);
  assert.match(schema, /reconcileSourceMessageId TEXT/);
  assert.match(schema, /WHERE status = 'active' AND supersededByMemoryId IS NULL/);
  assert.match(db, /MIGRATION_STATEMENTS_V29/);
  assert.match(db, /currentVersion < 29/);
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
  assert.match(db, /MIGRATION_STATEMENTS_V19/);
  assert.match(db, /MIGRATION_STATEMENTS_V20/);
  assert.match(db, /MIGRATION_STATEMENTS_V21/);
  assert.match(db, /MIGRATION_STATEMENTS_V22/);
  assert.match(db, /MIGRATION_STATEMENTS_V23/);
  assert.match(db, /MIGRATION_STATEMENTS_V24/);
  assert.match(db, /MIGRATION_STATEMENTS_V25/);
  assert.match(db, /MIGRATION_STATEMENTS_V26/);
  assert.match(db, /MIGRATION_STATEMENTS_V27/);
  assert.match(db, /MIGRATION_STATEMENTS_V28/);
  assert.match(db, /MIGRATION_STATEMENTS_V29/);
  assert.match(db, /MIGRATION_STATEMENTS_V35/);
  assert.match(db, /MIGRATION_STATEMENTS_V36/);
  assert.match(db, /currentVersion < 17/);
  assert.match(db, /currentVersion < 18/);
  assert.match(db, /currentVersion < 19/);
  assert.match(db, /currentVersion < 20/);
  assert.match(db, /currentVersion < 21/);
  assert.match(db, /currentVersion < 22/);
  assert.match(db, /currentVersion < 23/);
  assert.match(db, /currentVersion < 24/);
  assert.match(db, /currentVersion < 25/);
  assert.match(db, /currentVersion < 26/);
  assert.match(db, /currentVersion < 27/);
  assert.match(db, /currentVersion < 28/);
  assert.match(db, /currentVersion < 29/);
  assert.match(db, /currentVersion < 35/);
  assert.match(db, /currentVersion < 36/);
  assert.match(index, /aiProviderRepository/);
  assert.match(index, /aiThreadRepository/);
  assert.match(index, /aiKnowledgeRepository/);
});

test('AI branch route metadata migration stores only lightweight route labels', () => {
  assert.match(schema, /DATABASE_VERSION = 37/);
  assert.match(schema, /MIGRATION_STATEMENTS_V35/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_branch_route_metadata/);
  assert.match(schema, /branchRootMessageId TEXT NOT NULL/);
  assert.match(schema, /branchVersionIndex INTEGER NOT NULL/);
  assert.match(schema, /status TEXT NOT NULL DEFAULT 'exploring'/);
  assert.match(schema, /CHECK \(status IN \('exploring', 'adopted', 'paused', 'abandoned'\)\)/);
  assert.match(schema, /UNIQUE\(threadId, branchRootMessageId, branchVersionIndex\)/);
  assert.match(schema, /idx_ai_branch_route_metadata_thread/);
  assert.doesNotMatch(schema, /ai_branch_route_metadata[\s\S]{0,900}messageContent/);
  assert.doesNotMatch(schema, /ai_branch_route_metadata[\s\S]{0,900}promptSnapshotJson/);
  assert.match(db, /MIGRATION_STATEMENTS_V35/);
  assert.match(db, /currentVersion < 35/);
});

test('AI thread current branch migration persists the adopted route pointer', () => {
  assert.match(schema, /DATABASE_VERSION = 37/);
  assert.match(schema, /MIGRATION_STATEMENTS_V36/);
  assert.match(schema, /currentBranchRootMessageId TEXT/);
  assert.match(schema, /currentBranchVersionIndex INTEGER/);
  assert.match(db, /MIGRATION_STATEMENTS_V36/);
  assert.match(db, /currentVersion < 36/);
});

test('fresh AI database migration skips branch columns already created by the base AI schema', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_messages[\s\S]*branchRootMessageId TEXT/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_threads[\s\S]*currentBranchRootMessageId TEXT/);
  assert.match(db, /currentVersion >= 17 && currentVersion < 31[\s\S]*MIGRATION_STATEMENTS_V31/);
  assert.match(db, /currentVersion >= 17 && currentVersion < 36[\s\S]*MIGRATION_STATEMENTS_V36/);
  assert.doesNotMatch(db, /if \(currentVersion < 31\) \{\s*await database\.execAsync\(MIGRATION_STATEMENTS_V31\);/);
  assert.doesNotMatch(db, /if \(currentVersion < 36\) \{\s*await database\.execAsync\(MIGRATION_STATEMENTS_V36\);/);
});

test('AI branch schema guard repairs already-versioned local databases', () => {
  assert.match(db, /async function ensureAiBranchSchema/);
  assert.match(db, /PRAGMA table_info\(\$\{tableName\}\)/);
  assert.match(db, /currentBranchRootMessageId/);
  assert.match(db, /currentBranchVersionIndex/);
  assert.match(db, /ALTER TABLE ai_threads ADD COLUMN currentBranchRootMessageId TEXT/);
  assert.match(db, /ALTER TABLE ai_threads ADD COLUMN currentBranchVersionIndex INTEGER/);
  assert.match(db, /ai_branch_route_metadata/);
  assert.match(db, /await ensureAiBranchSchema\(database\)/);
});

test('AI role-card chat activity sort has durable local indexes', () => {
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_ai_threads_role_card_activity\s+ON ai_threads\(space, archivedAt, roleCardId, updatedAt\)/);
  assert.match(db, /async function ensureAiPerformanceIndexes/);
  assert.match(db, /CREATE INDEX IF NOT EXISTS idx_ai_threads_role_card_activity/);
  assert.match(db, /await ensureAiPerformanceIndexes\(database\)/);
});
