const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function assertOccursBefore(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `Missing first marker: ${first}`);
  assert.notEqual(secondIndex, -1, `Missing second marker: ${second}`);
  assert.ok(firstIndex < secondIndex, `Expected ${first} before ${second}`);
}

test('SQLite rejects a moved message whose continuity import session was not copied first', () => {
  const result = spawnSync(process.execPath, ['--no-warnings', '-e', `
    const assert = require('node:assert/strict');
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec(\`
      PRAGMA foreign_keys = ON;
      CREATE TABLE ai_threads (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE ai_continuity_import_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        threadId TEXT NOT NULL,
        FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
      );
      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY NOT NULL,
        threadId TEXT NOT NULL,
        continuityImportSessionId TEXT,
        FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
        FOREIGN KEY (continuityImportSessionId) REFERENCES ai_continuity_import_sessions(id) ON DELETE SET NULL
      );
      INSERT INTO ai_threads (id) VALUES ('thread-1');
    \`);
    assert.throws(
      () => db.prepare(
        'INSERT INTO ai_messages (id, threadId, continuityImportSessionId) VALUES (?, ?, ?)'
      ).run('message-1', 'thread-1', 'continuity-1'),
      /FOREIGN KEY constraint failed/
    );
    db.prepare(
      'INSERT INTO ai_continuity_import_sessions (id, threadId) VALUES (?, ?)'
    ).run('continuity-1', 'thread-1');
    db.prepare(
      'INSERT INTO ai_messages (id, threadId, continuityImportSessionId) VALUES (?, ?, ?)'
    ).run('message-1', 'thread-1', 'continuity-1');
    assert.equal(
      db.prepare('SELECT continuityImportSessionId FROM ai_messages WHERE id = ?')
        .get('message-1').continuityImportSessionId,
      'continuity-1'
    );
    db.close();
  `], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('thread space-move snapshots preserve continuity metadata and import dependencies first', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const snapshotInterface = repository.slice(
    repository.indexOf('export interface AiThreadExportSnapshot'),
    repository.indexOf('function validateUserProfileScope')
  );
  const exportBody = repository.slice(
    repository.indexOf('async exportThread'),
    repository.indexOf('async importThread')
  );
  const importBody = repository.slice(
    repository.indexOf('async importThread'),
    repository.indexOf('async deleteUserProfilesBoundToThreads')
  );

  for (const field of [
    'attachments: AiMessageAttachmentRecord[]',
    'favorites: AiMessageFavoriteRecord[]',
    'memorySettings: AiThreadMemorySettingsRecord | null',
    'summary: AiThreadSummaryRecord | null',
    'threadMemories: AiMemoryRecord[]',
    'memoryJob: AiThreadMemoryJobRecord | null',
    'summarySegments: AiThreadSummarySegmentRecord[]',
    'continuityImportSessions: AiContinuityImportSessionRecord[]',
    'continuityImportBlocks: AiContinuityImportBlockRecord[]',
  ]) {
    assert.match(snapshotInterface, new RegExp(field.replaceAll('[]', '\\[\\]')));
  }
  assert.doesNotMatch(snapshotInterface, /continuityImportEffects/);
  assert.match(exportBody, /FROM ai_continuity_import_sessions[\s\S]*WHERE threadId = \?/);
  assert.match(exportBody, /FROM ai_continuity_import_blocks[\s\S]*ai_continuity_import_sessions\.threadId = \?/);
  assert.match(exportBody, /FROM ai_message_attachments[\s\S]*WHERE threadId = \?/);
  assert.match(exportBody, /FROM ai_message_favorites[\s\S]*WHERE threadId = \?/);
  assert.match(exportBody, /FROM ai_thread_memory_settings[\s\S]*WHERE threadId = \?/);
  assert.match(exportBody, /FROM ai_thread_summaries[\s\S]*WHERE threadId = \?/);
  assert.match(exportBody, /FROM ai_memories[\s\S]*scope = 'thread'[\s\S]*scopeId = \?/);
  assert.match(exportBody, /FROM ai_thread_memory_jobs[\s\S]*WHERE threadId = \?/);
  assert.match(exportBody, /FROM ai_thread_summary_segments[\s\S]*WHERE threadId = \?/);
  assert.match(importBody, /INSERT INTO ai_continuity_import_sessions/);
  assert.match(importBody, /INSERT INTO ai_continuity_import_blocks/);
  assert.match(importBody, /INSERT INTO ai_message_attachments/);
  assert.match(importBody, /INSERT INTO ai_message_favorites/);
  assert.match(importBody, /const targetFavoriteKey = favorite\.favoriteKey\.startsWith\(`\$\{favorite\.space\}\|`\)/);
  assert.match(importBody, /favorite\.favoriteKey\.slice\(favorite\.space\.length \+ 1\)/);
  assert.match(importBody, /INSERT INTO ai_thread_memory_settings/);
  assert.match(importBody, /INSERT INTO ai_thread_summaries/);
  assert.match(importBody, /INSERT INTO ai_memories/);
  assert.match(importBody, /INSERT INTO ai_thread_memory_jobs/);
  assert.match(importBody, /INSERT INTO ai_thread_summary_segments/);
  assert.match(importBody, /syncMessageFts\(db, message\)/);
  assert.match(importBody, /syncMemoryFts\(db, movedMemory\)/);
  assert.match(importBody, /session\.rollbackState === 'available'\s*\?\s*'locked'/);
  assert.match(importBody, /targetRollbackState === 'locked'\s*\?\s*0/);
  assert.doesNotMatch(importBody, /INSERT INTO ai_continuity_import_effects/);
  assertOccursBefore(importBody, 'for (const session', 'for (const message');
});

test('permanent thread deletion removes independent FTS rows and thread-scoped memories', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const deleteBody = repository.slice(
    repository.indexOf('async deleteThreads'),
    repository.indexOf('async softDeleteThreads')
  );

  assert.match(deleteBody, /DELETE FROM ai_message_fts WHERE threadId = \?/);
  assert.match(deleteBody, /DELETE FROM ai_message_version_fts WHERE threadId = \?/);
  assert.match(deleteBody, /DELETE FROM ai_memory_fts WHERE id IN/);
  assert.match(deleteBody, /DELETE FROM ai_memories WHERE space = \? AND scope = 'thread' AND scopeId = \?/);
  assertOccursBefore(deleteBody, 'DELETE FROM ai_message_fts', 'DELETE FROM ai_threads');
  assertOccursBefore(deleteBody, 'DELETE FROM ai_memories', 'DELETE FROM ai_threads');
});

test('thread attachment document links are restored only after target documents exist', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(repository, /async restoreMessageAttachmentDocumentLinks/);
  const restoreBody = repository.slice(
    repository.indexOf('async restoreMessageAttachmentDocumentLinks'),
    repository.indexOf('async deleteUserProfilesBoundToThreads')
  );
  assert.match(restoreBody, /SELECT id, localUri FROM ai_documents WHERE id = \?/);
  assert.match(restoreBody, /throw new Error\('聊天附件关联的文档迁移不完整。'\)/);
  assert.match(restoreBody, /UPDATE ai_message_attachments SET documentId = \?, localUri = \?/);
});

test('moved role threads keep their snapshot identity when the target role library has no matching card', () => {
  const service = read('src/ai/aiChatService.ts');
  const homeBody = service.slice(
    service.indexOf('export async function listAiHomeThreads'),
    service.indexOf('export async function archiveAiThread')
  );
  const sessionBody = service.slice(
    service.indexOf('export async function loadThreadSessionConfig'),
    service.indexOf('function emptyAiUsageAggregate')
  );

  assert.match(homeBody, /roleCard\?\.name \?\? parseThreadRoleName\(thread\.roleSnapshotJson\)/);
  assert.match(sessionBody, /roleCard\?\.name \?\? parseThreadRoleName\(thread\.roleSnapshotJson\)/);
});

test('cross-space moves migrate role cards, avatars, and role-scoped memories before threads', () => {
  const service = read('src/ai/aiChatService.ts');
  const roleRepository = read('src/database/repositories/aiRoleCardRepository.ts');
  const threadRepository = read('src/database/repositories/aiThreadRepository.ts');
  const moveBody = service.slice(
    service.indexOf('export async function moveAiThreadsBetweenSpaces'),
    service.indexOf('async function markAssistantFailed')
  );

  assert.match(service, /copyAiRoleAvatarToAppStorage/);
  assert.match(service, /copyRoleCardsBetweenSpaces/);
  assert.match(service, /rewriteThreadRoleSnapshotForMove/);
  assert.match(moveBody, /importRoleCardForSpaceMove/);
  assert.match(moveBody, /importRoleMemoriesForSpaceMove/);
  assert.match(moveBody, /deleteUnreferencedRoleCardsAfterThreadMove/);
  assert.match(moveBody, /existingTargetRoleCards/);
  assert.match(moveBody, /importedTargetRoleCardIds/);
  assert.match(moveBody, /roleIdMap\.set\(roleCard\.id, roleCard\.id\)/);
  assert.match(service, /shouldImport: !existingTargetRoleCard/);
  assert.match(service, /shouldReactivate: Boolean\(existingTargetRoleCard\?\.archivedAt\)/);
  assert.match(service, /filter\(\(memory\) => !input\.skippedMemoryIds\.has\(memory\.id\)\)/);
  assert.doesNotMatch(moveBody, /createAiId\('role'\)/);
  assertOccursBefore(moveBody, 'importRoleCardForSpaceMove', 'aiThreadRepository.importThread');

  assert.match(roleRepository, /async importRoleCardForSpaceMove/);
  assert.match(roleRepository, /async setArchivedAtForSpaceMove/);
  assert.match(roleRepository, /async deleteUnreferencedRoleCardsAfterThreadMove/);
  assert.match(threadRepository, /async listRoleMemoriesForSpaceMove/);
  assert.match(threadRepository, /async findRoleMemoriesForSpaceMoveByIds/);
  assert.match(threadRepository, /async importRoleMemoriesForSpaceMove/);
  assert.match(threadRepository, /async deleteRoleMemoriesForSpaceMove/);
});
