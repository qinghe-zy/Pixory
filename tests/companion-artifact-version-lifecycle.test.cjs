const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(filename) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const schema = loadTypeScriptModule(path.join(root, 'src/database/schema.ts'));
const repositoryPath = path.join(root, 'src/ai/companion/companionArtifactChatStateRepository.ts');
const chatStateRepository = fs.existsSync(repositoryPath)
  ? loadTypeScriptModule(repositoryPath).companionArtifactChatStateRepository
  : null;
const diaryRepository = loadTypeScriptModule(
  path.join(root, 'src/ai/diary/diaryRepository.ts'),
).diaryRepository;

class DB {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  exec(statement) { this.db.exec(statement); }
  async runAsync(statement, ...params) { return this.db.prepare(statement).run(...params); }
  async getFirstAsync(statement, ...params) { return this.db.prepare(statement).get(...params) ?? null; }
  async getAllAsync(statement, ...params) { return this.db.prepare(statement).all(...params); }
  async withExclusiveTransactionAsync(task) {
    this.db.exec('BEGIN');
    try {
      const result = await task(this);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.db.close(); }
}

function createDb() {
  const db = new DB();
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
      status TEXT NOT NULL DEFAULT 'completed',
      role TEXT NOT NULL DEFAULT 'user',
      createdAt TEXT NOT NULL DEFAULT '2026-08-11T00:00:00.000Z',
      FOREIGN KEY(threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
    );
    INSERT INTO ai_threads(id, space) VALUES ('thread-a', 'normal'), ('thread-b', 'normal');
  `);
  db.exec(schema.MIGRATION_STATEMENTS_V49);
  db.exec(schema.MIGRATION_STATEMENTS_V50);
  db.exec(schema.MIGRATION_STATEMENTS_V57);
  db.exec(schema.MIGRATION_STATEMENTS_V53);
  db.exec(schema.MIGRATION_STATEMENTS_V58);
  db.exec(schema.MIGRATION_STATEMENTS_V59);
  return db;
}

test('chat-only hiding is scoped to artifact kind, group, and thread', async () => {
  assert.ok(chatStateRepository);
  const db = createDb();
  try {
    await chatStateRepository.hide(db, {
      artifactKind: 'diary',
      artifactGroupId: 'diary-a',
      threadId: 'thread-a',
    });

    assert.deepEqual(
      [...await chatStateRepository.listHiddenGroupIds(db, 'thread-a', 'diary')],
      ['diary-a'],
    );
    assert.deepEqual(
      [...await chatStateRepository.listHiddenGroupIds(db, 'thread-a', 'dream')],
      [],
    );
    assert.deepEqual(
      [...await chatStateRepository.listHiddenGroupIds(db, 'thread-b', 'diary')],
      [],
    );
  } finally {
    db.close();
  }
});

test('diary versions are append-only, promote after deletion, and clear orphaned chat state', async () => {
  const db = createDb();
  try {
    const base = {
      bodyFontKey: 'serif',
      diaryDate: '2026-08-11',
      effectiveSourceSnapshotHash: 'snapshot-a',
      jobContextSnapshotHash: 'job-context-a',
      roleCardId: 'role-a',
      sourceBranchRouteJson: '[]',
      sourceThreadId: 'thread-a',
      status: 'ready',
      themeKey: 'paper-light',
    };
    const first = await diaryRepository.saveDiaryVersion(db, { ...base, body: '第一版日记。' });
    const second = await diaryRepository.saveDiaryVersion(db, { ...base, body: '第二版日记。' });
    const diaryId = 'role-diary:role-a:2026-08-11';

    const groups = await diaryRepository.listVersionGroupsForRole(db, 'role-a');
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].versions.map((version) => version.versionNumber), [1, 2]);

    await chatStateRepository.hide(db, {
      artifactKind: 'diary',
      artifactGroupId: diaryId,
      threadId: 'thread-a',
    });
    await assert.rejects(
      diaryRepository.permanentlyDeleteVersions(db, [first.id, 'missing-version']),
      /发生变化/,
    );
    assert.equal((await diaryRepository.findDiaryVersion(db, diaryId)).version.id, second.id);

    await diaryRepository.permanentlyDeleteVersions(db, [second.id]);
    const promoted = await diaryRepository.findDiaryVersion(db, diaryId);
    assert.equal(promoted.version.id, first.id);
    assert.equal(promoted.version.status, 'current');

    await diaryRepository.permanentlyDeleteVersions(db, [first.id]);
    assert.equal(await diaryRepository.findCurrentDiaryById(db, diaryId), null);
    assert.deepEqual(
      [...await chatStateRepository.listHiddenGroupIds(db, 'thread-a', 'diary')],
      [],
    );
  } finally {
    db.close();
  }
});
