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
    'continuityImportSessions: AiContinuityImportSessionRecord[]',
    'continuityImportBlocks: AiContinuityImportBlockRecord[]',
  ]) {
    assert.match(snapshotInterface, new RegExp(field.replaceAll('[]', '\\[\\]')));
  }
  assert.doesNotMatch(snapshotInterface, /continuityImportEffects/);
  assert.match(exportBody, /FROM ai_continuity_import_sessions[\s\S]*WHERE threadId = \?/);
  assert.match(exportBody, /FROM ai_continuity_import_blocks[\s\S]*ai_continuity_import_sessions\.threadId = \?/);
  assert.match(importBody, /INSERT INTO ai_continuity_import_sessions/);
  assert.match(importBody, /INSERT INTO ai_continuity_import_blocks/);
  assert.match(importBody, /session\.rollbackState === 'available'\s*\?\s*'locked'/);
  assert.match(importBody, /targetRollbackState === 'locked'\s*\?\s*0/);
  assert.doesNotMatch(importBody, /INSERT INTO ai_continuity_import_effects/);
  assertOccursBefore(importBody, 'for (const session', 'for (const message');
});
