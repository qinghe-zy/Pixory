const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  module._compile(output, sourcePath);
};

let schema;
let eventRepository;
let observer;
let engine;
let projectionRepository;
try {
  schema = require(path.join(root, 'src/database/schema.ts'));
  eventRepository = require(path.join(root, 'src/ai/companion/companionEventRepository.ts'));
  observer = require(path.join(root, 'src/ai/companion/companionEventObserver.ts'));
  engine = require(path.join(root, 'src/ai/companion/companionProjectionEngine.ts'));
  projectionRepository = require(path.join(root, 'src/ai/companion/companionProjectionRepository.ts'));
} finally {
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
}

class AsyncDatabase {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  exec(sql) { this.db.exec(sql); }
  async runAsync(sql, ...params) { return this.db.prepare(sql).run(...params); }
  async getFirstAsync(sql, ...params) { return this.db.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.db.prepare(sql).all(...params); }
  async withTransactionAsync(task) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = await task(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}

function createDatabase() {
  const db = new AsyncDatabase();
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY, space TEXT NOT NULL, contextType TEXT NOT NULL DEFAULT 'normal', roleCardId TEXT,
      currentBranchRootMessageId TEXT, currentBranchVersionIndex INTEGER, lineageVersion INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '', titleStatus TEXT NOT NULL DEFAULT 'manual', includeIpDocuments INTEGER NOT NULL DEFAULT 0,
      modelSnapshotJson TEXT NOT NULL DEFAULT '{}', roleSnapshotJson TEXT NOT NULL DEFAULT '{}', roleInstructionWeight TEXT NOT NULL DEFAULT 'default',
      replyPreference TEXT NOT NULL DEFAULT 'auto', contextHistoryRoundLimit INTEGER NOT NULL DEFAULT 30, thinkingDisabled INTEGER NOT NULL DEFAULT 0,
      systemPrompt TEXT NOT NULL DEFAULT '', boundaryMode TEXT NOT NULL DEFAULT 'standard', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY, threadId TEXT NOT NULL, branchRootMessageId TEXT, branchVersionIndex INTEGER,
      role TEXT NOT NULL, status TEXT NOT NULL, content TEXT NOT NULL, reasoningText TEXT, errorMessage TEXT,
      providerId TEXT, modelId TEXT, modelSnapshotJson TEXT, promptSnapshotJson TEXT,
      updatedAt TEXT NOT NULL, completedAt TEXT, createdAt TEXT NOT NULL,
      FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
    );
  `);
  db.exec(schema.MIGRATION_STATEMENTS_V52);
  db.exec(schema.MIGRATION_STATEMENTS_V53);
  return db;
}

function insertMessage(db, id, role, content, at) {
  db.db.prepare(`INSERT INTO ai_messages
    (id, threadId, role, status, content, updatedAt, completedAt, createdAt)
    VALUES (?, 'thread-a', ?, 'completed', ?, ?, ?, ?)`)
    .run(id, role, content, at, at, at);
}

async function appendObserved(db, messageId, content) {
  const observed = observer.observeCompanionEvents({
    branchRouteHash: 'route-a', lineageVersion: 0,
    message: { id: messageId, content, role: 'user', status: 'completed', branchRootMessageId: null, branchVersionIndex: null, updatedAt: '2026-07-29T08:00:00.000Z', completedAt: '2026-07-29T08:00:00.000Z' },
  });
  for (const candidate of observed.accepted) {
    await eventRepository.appendCompanionEvent(db, {
      branchRouteHash: 'route-a', candidate, lineageVersion: 0, sourceMessageId: messageId,
      space: 'normal', subjectId: 'thread-a', subjectType: 'thread', threadId: 'thread-a',
    });
  }
}

test('projection replay creates expiring observations and auditable repair state', async () => {
  const db = createDatabase();
  try {
    db.db.prepare(`INSERT INTO ai_threads (id, space, createdAt, updatedAt) VALUES ('thread-a', 'normal', ?, ?)`).run('2026-07-29T08:00:00.000Z', '2026-07-29T08:00:00.000Z');
    insertMessage(db, 'user-a', 'user', '我今天很难过，别再叫我小朋友。', '2026-07-29T08:00:00.000Z');
    await appendObserved(db, 'user-a', '我今天很难过，别再叫我小朋友。');
    const thread = { id: 'thread-a', space: 'normal', roleCardId: null, lineageVersion: 0 };
    const first = await engine.rebuildCompanionProjection(db, {
      branchRouteHash: 'route-a', currentMessageId: 'user-a', currentRound: 4, lineageVersion: 0,
      now: '2026-07-29T08:00:00.000Z', space: 'normal', thread,
    });
    assert.equal(first.relationship.unresolvedRepairIds.length, 1);
    assert.equal(first.stance.primaryIntent, 'repair');
    const observation = db.db.prepare('SELECT * FROM companion_affective_observations').get();
    assert.equal(observation.expiresAt, '2026-07-29T14:00:00.000Z');
    assert.equal(observation.expiresAfterRound, 12);
    const repairs = await projectionRepository.listCompanionRepairs(db, { branchRouteHash: 'route-a', lineageVersion: 0, space: 'normal', threadId: 'thread-a' });
    assert.deepEqual(repairs[0].forbiddenTerms, ['小朋友']);

    for (let index = 1; index <= 3; index += 1) {
      const id = `assistant-${index}`;
      insertMessage(db, id, 'assistant', `好的，我会尊重你的称呼。${index}`, `2026-07-29T08:0${index}:00.000Z`);
      await engine.processCompanionAssistantRepairTurns(db, {
        assistantMessageId: id, branchRouteHash: 'route-a', currentRound: 4 + index,
        lineageVersion: 0, now: `2026-07-29T08:0${index}:00.000Z`, space: 'normal', thread,
      });
    }
    const verified = await projectionRepository.listCompanionRepairs(db, { branchRouteHash: 'route-a', lineageVersion: 0, space: 'normal', states: ['verified'], threadId: 'thread-a' });
    assert.equal(verified.length, 1);
    assert.equal(verified[0].passedRelevantTurns, 3);
  } finally { db.close(); }
});

test('source edits remove stale events and repairs from the rebuilt active projection', async () => {
  const db = createDatabase();
  try {
    db.db.prepare(`INSERT INTO ai_threads (id, space, createdAt, updatedAt) VALUES ('thread-a', 'normal', ?, ?)`).run('2026-07-29T08:00:00.000Z', '2026-07-29T08:00:00.000Z');
    insertMessage(db, 'user-a', 'user', '别再叫我小朋友。', '2026-07-29T08:00:00.000Z');
    await appendObserved(db, 'user-a', '别再叫我小朋友。');
    const thread = { id: 'thread-a', space: 'normal', roleCardId: null, lineageVersion: 0 };
    await engine.rebuildCompanionProjection(db, { branchRouteHash: 'route-a', currentMessageId: 'user-a', currentRound: 1, lineageVersion: 0, now: '2026-07-29T08:00:00.000Z', space: 'normal', thread });
    db.db.prepare('UPDATE ai_messages SET content = ?, updatedAt = ? WHERE id = ?').run('我们聊别的吧。', '2026-07-29T09:00:00.000Z', 'user-a');
    const rebuilt = await engine.rebuildCompanionProjection(db, { branchRouteHash: 'route-a', currentMessageId: 'user-a', currentRound: 1, lineageVersion: 0, now: '2026-07-29T09:00:00.000Z', space: 'normal', thread });
    assert.deepEqual(rebuilt.relationship.unresolvedRepairIds, []);
    assert.notEqual(rebuilt.stance.primaryIntent, 'repair');
  } finally { db.close(); }
});
