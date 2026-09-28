const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const original = require.extensions['.ts'];
require.extensions['.ts'] = function compileTypeScript(module, filename) {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};

let schema;
try {
  schema = require(path.join(root, 'src/database/schema.ts'));
} finally {
  if (original) require.extensions['.ts'] = original;
  else delete require.extensions['.ts'];
}

test('V59 backfills legacy dreams into one current version group and creates chat-only state', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE ai_threads (
        id TEXT PRIMARY KEY,
        space TEXT NOT NULL,
        roleSnapshotJson TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY,
        threadId TEXT NOT NULL,
        FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
      );
      INSERT INTO ai_threads(id, space) VALUES ('thread-a', 'normal');
      INSERT INTO ai_messages(id, threadId) VALUES ('message-a', 'thread-a');
    `);
    db.exec(schema.MIGRATION_STATEMENTS_V53);
    db.exec(schema.MIGRATION_STATEMENTS_V58);
    db.prepare(`
      INSERT INTO companion_dream_scenes (
        id, space, roleCardId, threadId, branchRouteHash, lineageVersion,
        semanticState, evidenceMessageIdsJson, sourceSnapshotHash, openedAt, updatedAt
      ) VALUES ('scene-a', 'normal', 'role-a', 'thread-a', 'route-a', 0,
        'sleep_established', '[]', 'snapshot-a', '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z')
    `).run();
    db.prepare(`
      INSERT INTO companion_dream_seeds (
        id, space, roleCardId, threadId, branchRouteHash, lineageVersion, sceneId,
        sourceMessageIdsJson, sourceMessageVersionHashesJson, sourceSnapshotHash,
        roll, decision, manual, policyVersion, idempotencyKey, createdAt, updatedAt, roleSnapshotJson
      ) VALUES ('seed-a', 'normal', 'role-a', 'thread-a', 'route-a', 0, 'scene-a',
        '[]', '[]', 'snapshot-a', 0, 'selected', 0, 'v1', 'seed-a',
        '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z', '{}')
    `).run();
    db.prepare(`
      INSERT INTO companion_dream_jobs (
        id, space, roleCardId, threadId, branchRouteHash, lineageVersion, sceneId,
        seedId, phase, status, sourceSnapshotHash, sourceMessageIdsJson, nextRunAt,
        idempotencyKey, createdAt, updatedAt
      ) VALUES ('job-a', 'normal', 'role-a', 'thread-a', 'route-a', 0, 'scene-a',
        'seed-a', 'generating', 'completed', 'snapshot-a', '[]',
        '2026-08-11T00:00:00.000Z', 'job-a', '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z')
    `).run();
    db.prepare(`
      INSERT INTO companion_dreams (
        id, space, roleCardId, sourceThreadId, sourceBranchRouteHash, lineageVersion,
        sceneId, seedId, jobId, sourceMessageIdsJson, sourceSnapshotHash, title, body,
        displayAt, status, createdAt, updatedAt
      ) VALUES ('legacy-dream', 'normal', 'role-a', 'thread-a', 'route-a', 0,
        'scene-a', 'seed-a', 'job-a', '[]', 'snapshot-a', '旧梦', '旧梦正文',
        '2026-08-11T00:00:00.000Z', 'active', '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z')
    `).run();

    assert.equal(schema.DATABASE_VERSION, 61);
    db.exec(schema.MIGRATION_STATEMENTS_V59);
    assert.deepEqual(
      {
        ...db.prepare(`
        SELECT versionGroupId, versionNumber, isCurrent
        FROM companion_dreams WHERE id = 'legacy-dream'
        `).get(),
      },
      { versionGroupId: 'legacy-dream', versionNumber: 1, isCurrent: 1 },
    );
    assert.deepEqual(
      db.prepare('PRAGMA table_info(companion_artifact_chat_states)').all().map((column) => column.name),
      ['artifactKind', 'artifactGroupId', 'threadId', 'hiddenAt', 'createdAt', 'updatedAt'],
    );
  } finally {
    db.close();
  }
});
