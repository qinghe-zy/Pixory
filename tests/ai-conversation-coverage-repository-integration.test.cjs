const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadRepository() {
  const filename = path.join(root, 'src/database/repositories/aiThreadRepository.ts');
  const originalExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename).aiThreadRepository;
  } finally {
    if (originalExtension) {
      require.extensions['.ts'] = originalExtension;
    } else {
      delete require.extensions['.ts'];
    }
  }
}

function loadCoverageService() {
  const filename = path.join(root, 'src/ai/context/conversationCoverageService.ts');
  const originalExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (originalExtension) {
      require.extensions['.ts'] = originalExtension;
    } else {
      delete require.extensions['.ts'];
    }
  }
}

class AsyncDatabase {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  exec(sql) {
    this.db.exec(sql);
  }

  async runAsync(sql, ...params) {
    return this.db.prepare(sql).run(...params);
  }

  async getFirstAsync(sql, ...params) {
    return this.db.prepare(sql).get(...params) ?? null;
  }

  async getAllAsync(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  close() {
    this.db.close();
  }

  async withExclusiveTransactionAsync(task) {
    this.db.exec('BEGIN');
    try { await task(this); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE ai_threads (id TEXT PRIMARY KEY);
    INSERT INTO ai_threads VALUES ('thread-1');
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY, threadId TEXT NOT NULL, branchRootMessageId TEXT,
      branchVersionIndex INTEGER, role TEXT, status TEXT, content TEXT,
      reasoningText TEXT, errorMessage TEXT, providerId TEXT, modelId TEXT,
      modelSnapshotJson TEXT, promptSnapshotJson TEXT, continuityImportSessionId TEXT,
      continuitySyntheticKind TEXT, createdAt TEXT, updatedAt TEXT, completedAt TEXT
    );
    CREATE TABLE ai_continuity_import_sessions (
      id TEXT PRIMARY KEY, reviewGateState TEXT
    );
    CREATE TABLE ai_thread_summary_segments (
      id TEXT PRIMARY KEY, threadId TEXT NOT NULL, space TEXT NOT NULL,
      kind TEXT NOT NULL, summaryText TEXT NOT NULL, startMessageId TEXT,
      endMessageId TEXT, startAt TEXT, endAt TEXT, roundCount INTEGER NOT NULL,
      sourceSegmentIdsJson TEXT NOT NULL DEFAULT '[]',
      continuityImportSessionId TEXT, sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]',
      branchRouteHash TEXT NOT NULL DEFAULT '', lineageVersion INTEGER NOT NULL DEFAULT 0,
      sourceMessageVersionHash TEXT NOT NULL DEFAULT '', quality TEXT NOT NULL DEFAULT 'legacy',
      status TEXT NOT NULL DEFAULT 'stale', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
  `);
  const source = fs.readFileSync(path.join(root, 'src/database/schema.ts'), 'utf8');
  db.exec(source.match(/export const MIGRATION_STATEMENTS_V66 = `([\s\S]*?)`;/)[1]);
}

function insertMessage(db, input) {
  const createdAt = input.createdAt ?? '2026-07-29T00:00:00.000Z';
  db.db.prepare(`INSERT INTO ai_messages (
    id, threadId, branchRootMessageId, branchVersionIndex, role, status, content,
    reasoningText, errorMessage, providerId, modelId, modelSnapshotJson,
    promptSnapshotJson, continuityImportSessionId, continuitySyntheticKind,
    createdAt, updatedAt, completedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '{}', '{}', NULL, NULL, ?, ?, ?)`)
    .run(
      input.id,
      input.threadId ?? 'thread-1',
      input.branchRootMessageId ?? null,
      input.branchVersionIndex ?? null,
      input.role,
      input.status ?? 'completed',
      input.content ?? input.id,
      createdAt,
      createdAt,
      createdAt,
    );
}

for (const [failedTable, delayedTable] of [
  ['ai_messages', 'ai_thread_summary_segments'],
  ['ai_thread_summary_segments', 'ai_messages'],
  ['ai_context_windows', 'ai_thread_summary_segments'],
]) {
  test(`coverage rolls back ${failedTable} failures without closing over pending reads`, async () => {
    const db = new AsyncDatabase();
    createSchema(db);
    insertMessage(db, { id: 'anchor', role: 'user', content: 'keep original request' });
    const failure = new Error(`injected ${failedTable} prepare failure`);
    let releaseRead;
    const readGate = new Promise(resolve => { releaseRead = resolve; });
    let pendingReads = 0;
    let pendingAtClose = null;
    let transactionClosed = false;
    for (const method of ['getFirstAsync', 'getAllAsync']) {
      const read = db[method].bind(db);
      db[method] = async (sql, ...params) => {
        if (sql.includes(`FROM ${failedTable}`)) throw failure;
        if (!sql.includes(`FROM ${delayedTable}`)) return read(sql, ...params);
        pendingReads += 1;
        try {
          await readGate;
          assert.equal(transactionClosed, false, 'native read outlived its transaction connection');
          return await read(sql, ...params);
        } finally {
          pendingReads -= 1;
        }
      };
    }
    const transaction = db.withExclusiveTransactionAsync.bind(db);
    db.withExclusiveTransactionAsync = async task => {
      try { return await transaction(task); }
      finally {
        pendingAtClose = pendingReads;
        transactionClosed = true;
      }
    };
    const { compileConversationCoverage } = loadCoverageService();
    const outcome = compileConversationCoverage(db, {
      thread: { id: 'thread-1', space: 'normal', lineageVersion: 0 },
      anchorMessageId: 'anchor', historyRoundLimit: 5, branchScopes: [],
    }).then(() => null, error => error);
    try {
      await new Promise(resolve => setImmediate(resolve));
      const closedWithPendingRead = transactionClosed && pendingReads > 0;
      releaseRead();
      assert.equal(await outcome, failure, 'the original query failure must reach the caller');
      assert.equal(closedWithPendingRead, false);
      assert.equal(pendingAtClose, 0);
      assert.equal(db.db.prepare('SELECT content FROM ai_messages WHERE id = ?').get('anchor').content, 'keep original request');
      assert.equal(db.db.prepare('SELECT COUNT(*) AS total FROM ai_context_windows').get().total, 0);
    } finally {
      releaseRead();
      await outcome;
      db.close();
    }
  });
}

test('V51 exact summary provenance remains declared and ordered before later migrations', () => {
  const schema = fs.readFileSync(path.join(root, 'src/database/schema.ts'), 'utf8');
  const dbSource = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
  assert.ok(Number(schema.match(/DATABASE_VERSION\s*=\s*(\d+)/)?.[1]) >= 54);
  assert.match(schema, /MIGRATION_STATEMENTS_V51/);
  for (const field of [
    'sourceMessageIdsJson',
    'branchRouteHash',
    'lineageVersion',
    'sourceMessageVersionHash',
    'quality',
    'status',
  ]) {
    assert.match(schema, new RegExp(`ADD COLUMN ${field}`));
  }
  assert.ok(dbSource.indexOf('MIGRATION_STATEMENTS_V50') < dbSource.indexOf('MIGRATION_STATEMENTS_V51'));
  assert.ok(dbSource.indexOf('MIGRATION_STATEMENTS_V51') < dbSource.indexOf('MIGRATION_STATEMENTS_V52'));
  assert.match(dbSource, /currentVersion < 51[\s\S]*MIGRATION_STATEMENTS_V51/);
});

test('summary repository round-trips provenance and excludes stale or sibling-branch rows', async () => {
  const db = new AsyncDatabase();
  createSchema(db);
  const repository = loadRepository();
  insertMessage(db, { id: 'm1', role: 'user' });
  insertMessage(db, { id: 'm2', role: 'assistant' });
  insertMessage(db, {
    id: 'branch-root',
    role: 'assistant',
    branchRootMessageId: 'branch-root',
    branchVersionIndex: 2,
    createdAt: '2099-07-29T00:00:02.000Z',
  });

  const created = await repository.createSummarySegment(db, {
    id: 'summary-active',
    threadId: 'thread-1',
    space: 'normal',
    kind: 'compressed',
    summaryText: 'summary text',
    startMessageId: 'm1',
    endMessageId: 'm2',
    startAt: '2026-07-29T00:00:00.000Z',
    endAt: '2026-07-29T00:00:00.000Z',
    roundCount: 1,
    sourceSegmentIdsJson: '[]',
    sourceMessageIdsJson: '["m1","m2"]',
    branchRouteHash: 'route-main',
    lineageVersion: 7,
    sourceMessageVersionHash: 'version-hash',
    quality: 'model',
    status: 'active',
    continuityImportSessionId: null,
  });
  assert.equal(created.sourceMessageIdsJson, '["m1","m2"]');
  assert.equal(created.branchRouteHash, 'route-main');
  assert.equal(created.lineageVersion, 7);
  assert.equal(created.sourceMessageVersionHash, 'version-hash');
  assert.equal(created.quality, 'model');
  assert.equal(created.status, 'active');

  db.db.prepare(`INSERT INTO ai_thread_summary_segments (
    id, threadId, space, kind, summaryText, endMessageId, roundCount,
    sourceSegmentIdsJson, sourceMessageIdsJson, branchRouteHash, lineageVersion,
    sourceMessageVersionHash, quality, status, createdAt, updatedAt
  ) VALUES (?, 'thread-1', 'normal', 'compressed', ?, ?, 1, '[]', '["m1","m2"]', ?, 7, 'hash', 'model', ?, ?, ?)`)
    .run('summary-stale', 'stale', 'm2', 'route-main', 'stale', '2026-07-29T00:00:01.000Z', '2026-07-29T00:00:01.000Z');
  db.db.prepare(`INSERT INTO ai_thread_summary_segments (
    id, threadId, space, kind, summaryText, endMessageId, roundCount,
    sourceSegmentIdsJson, sourceMessageIdsJson, branchRouteHash, lineageVersion,
    sourceMessageVersionHash, quality, status, createdAt, updatedAt
  ) VALUES (?, 'thread-1', 'normal', 'compressed', ?, ?, 1, '[]', '["m1","branch-root"]', ?, 7, 'hash', 'model', 'active', ?, ?)`)
    .run('summary-sibling', 'sibling', 'branch-root', 'route-sibling', '2099-07-29T00:00:02.000Z', '2099-07-29T00:00:02.000Z');

  const main = await repository.listSummarySegments(db, 'thread-1', []);
  assert.deepEqual(main.map((item) => item.id), ['summary-active']);
  const sibling = await repository.listSummarySegments(db, 'thread-1', [
    { branchRootMessageId: 'branch-root', branchVersionIndex: 2 },
  ]);
  assert.deepEqual(sibling.map((item) => item.id), ['summary-active', 'summary-sibling']);
  db.close();
});

test('SQLite coverage compiler materializes all completed rounds before the anchor without a model call', async () => {
  const db = new AsyncDatabase();
  createSchema(db);
  for (let round = 1; round <= 12; round += 1) {
    insertMessage(db, {
      id: `m${round * 2 - 1}`,
      role: 'user',
      content: `user-${round}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, round * 2 - 1)).toISOString(),
    });
    insertMessage(db, {
      id: `m${round * 2}`,
      role: 'assistant',
      content: `assistant-${round}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, round * 2)).toISOString(),
    });
  }
  insertMessage(db, {
    id: 'm25',
    role: 'user',
    content: 'current request',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 25)).toISOString(),
  });
  const { compileConversationCoverage } = loadCoverageService();
  const compiled = await compileConversationCoverage(db, {
    thread: {
      id: 'thread-1',
      space: 'normal',
      lineageVersion: 4,
    },
    anchorMessageId: 'm25',
    historyRoundLimit: 5,
    branchScopes: [],
  });
  assert.deepEqual(compiled.plan.recentMessageIds, Array.from({ length: 24 }, (_, index) => `m${index + 1}`));
  assert.deepEqual(compiled.plan.bridgeMessageIds, []);
  assert.equal(db.db.prepare('SELECT windowTarget FROM ai_context_windows').get().windowTarget, 5);
  assert.equal(compiled.plan.coverageComplete, true);
  const rollback = await compileConversationCoverage(db, { thread: { id: 'thread-1', space: 'normal', lineageVersion: 4 },
    anchorMessageId: 'm25', historyRoundLimit: 30, contextPlanning: false, branchScopes: [] });
  assert.deepEqual(rollback.plan.recentMessageIds, compiled.plan.recentMessageIds);
  assert.equal(rollback.plan.summarySegmentIds.length, 0);
  assert.equal(db.db.prepare('SELECT windowTarget FROM ai_context_windows').get().windowTarget, 5);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/ai/context/conversationCoverageService.ts'), 'utf8'), /callMemoryMaintenanceModel|callProvider|fetch\(/);
  db.close();
});
