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
}

function createSchema(db) {
  db.exec(`
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

test('V51 declares exact summary provenance and applies it after V50', () => {
  const schema = fs.readFileSync(path.join(root, 'src/database/schema.ts'), 'utf8');
  const dbSource = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
  assert.match(schema, /DATABASE_VERSION = 51/);
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
    createdAt: '2026-07-29T00:00:02.000Z',
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
    .run('summary-sibling', 'sibling', 'branch-root', 'route-sibling', '2026-07-29T00:00:02.000Z', '2026-07-29T00:00:02.000Z');

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
  assert.deepEqual(compiled.plan.recentMessageIds, [
    'm15', 'm16', 'm17', 'm18', 'm19', 'm20', 'm21', 'm22', 'm23', 'm24',
  ]);
  assert.deepEqual(compiled.plan.bridgeMessageIds, [
    'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12', 'm13', 'm14',
  ]);
  assert.equal(compiled.plan.coverageComplete, true);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/ai/context/conversationCoverageService.ts'), 'utf8'), /callMemoryMaintenanceModel|callProvider|fetch\(/);
  db.close();
});
