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

class DB {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  exec(statement) { this.db.exec(statement); }
  async runAsync(statement, ...params) { return this.db.prepare(statement).run(...params); }
  async getAllAsync(statement, ...params) { return this.db.prepare(statement).all(...params); }
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
      FOREIGN KEY(threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
    );
    INSERT INTO ai_threads(id, space) VALUES ('thread-a', 'normal'), ('thread-b', 'normal');
  `);
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
