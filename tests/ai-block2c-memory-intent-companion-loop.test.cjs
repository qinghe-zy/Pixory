const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath, customMocks = {}) {
  const fullPath = path.join(root, relativePath);
  const visitedCache = new Map();

  function compileAndLoad(targetPath) {
    if (visitedCache.has(targetPath)) {
      return visitedCache.get(targetPath);
    }
    const source = fs.readFileSync(targetPath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: targetPath,
    }).outputText;

    const mod = { exports: {} };
    visitedCache.set(targetPath, mod.exports);

    const localRequire = (reqPath) => {
      if (Object.prototype.hasOwnProperty.call(customMocks, reqPath)) {
        return customMocks[reqPath];
      }
      if (reqPath.startsWith('.')) {
        const base = path.resolve(path.dirname(targetPath), reqPath);
        for (const ext of ['', '.ts', '.js', '/index.ts', '/index.js']) {
          const candidate = base + ext;
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            const candidateRel = path.relative(root, candidate).replace(/\\/g, '/');
            if (Object.prototype.hasOwnProperty.call(customMocks, candidateRel)) {
              return customMocks[candidateRel];
            }
            return compileAndLoad(candidate);
          }
        }
      }
      return require(reqPath);
    };

    const fn = new Function('exports', 'module', 'require', '__filename', '__dirname', transpiled);
    fn(mod.exports, mod, localRequire, targetPath, path.dirname(targetPath));
    visitedCache.set(targetPath, mod.exports);
    return mod.exports;
  }

  return compileAndLoad(fullPath);
}

function wrapSqlite(nativeDb, options = {}) {
  let inTransaction = false;
  let activeQueriesInTx = 0;

  async function runSequential(fn) {
    if (inTransaction) {
      if (activeQueriesInTx > 0) {
        throw new Error('concurrent_query_inside_sqlite_transaction');
      }
      activeQueriesInTx += 1;
      try {
        if (options.yieldMs) {
          await new Promise((resolve) => setTimeout(resolve, options.yieldMs));
        }
        return fn();
      } finally {
        activeQueriesInTx -= 1;
      }
    }
    return fn();
  }

  return {
    nativeDb,
    async execAsync(sql) {
      return runSequential(() => nativeDb.exec(sql));
    },
    async runAsync(sql, ...params) {
      return runSequential(() => {
        const result = nativeDb.prepare(sql).run(...params);
        return {
          changes: Number(result.changes ?? 0),
          lastInsertRowId: Number(result.lastInsertRowid ?? 0),
        };
      });
    },
    async getFirstAsync(sql, ...params) {
      return runSequential(() => {
        const row = nativeDb.prepare(sql).get(...params);
        return row ?? null;
      });
    },
    async getAllAsync(sql, ...params) {
      return runSequential(() => nativeDb.prepare(sql).all(...params));
    },
    async withTransactionAsync(task) {
      nativeDb.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      try {
        const result = await task();
        nativeDb.exec('COMMIT');
        return result;
      } catch (error) {
        nativeDb.exec('ROLLBACK');
        throw error;
      } finally {
        inTransaction = false;
        activeQueriesInTx = 0;
      }
    },
  };
}

function createMemoryPipelineDb(schemaMod) {
  const nativeDb = new DatabaseSync(':memory:');
  nativeDb.exec(`
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY,
      space TEXT NOT NULL DEFAULT 'normal',
      contextType TEXT NOT NULL DEFAULT 'normal',
      title TEXT NOT NULL DEFAULT 'Test Thread',
      boundIpId INTEGER,
      boundKnowledgeBaseId TEXT,
      roleCardId TEXT,
      currentBranchRootMessageId TEXT,
      currentBranchVersionIndex INTEGER NOT NULL DEFAULT 0,
      lineageVersion INTEGER NOT NULL DEFAULT 0,
      replyPreference TEXT NOT NULL DEFAULT 'auto',
      roleInstructionWeight TEXT NOT NULL DEFAULT 'normal',
      isPinned INTEGER NOT NULL DEFAULT 0,
      pinnedAt TEXT,
      providerId TEXT,
      modelId TEXT,
      thinkingMode TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastMessageAt TEXT,
      deletedAt TEXT
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY,
      threadId TEXT NOT NULL,
      branchRootMessageId TEXT,
      branchVersionIndex INTEGER,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      content TEXT NOT NULL,
      reasoningText TEXT,
      thinkingDurationMs INTEGER,
      modelId TEXT,
      providerId TEXT,
      tokenUsageJson TEXT,
      citationsJson TEXT NOT NULL DEFAULT '[]',
      errorMessage TEXT,
      updatedAt TEXT NOT NULL,
      completedAt TEXT,
      createdAt TEXT NOT NULL,
      deletedAt TEXT,
      FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
    );
    CREATE TABLE ai_message_branch_versions (
      id TEXT PRIMARY KEY,
      threadId TEXT NOT NULL,
      branchRootMessageId TEXT NOT NULL,
      versionIndex INTEGER NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_thread_memory_settings (
      threadId TEXT PRIMARY KEY,
      deepMemoryEnabled INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_thread_summaries (
      threadId TEXT PRIMARY KEY,
      summary TEXT NOT NULL DEFAULT '',
      decisions TEXT NOT NULL DEFAULT '',
      openQuestions TEXT NOT NULL DEFAULT '',
      lastMessageId TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_thread_memory_jobs (
      threadId TEXT PRIMARY KEY,
      pendingTurnCount INTEGER NOT NULL DEFAULT 0,
      lastConsolidatedMessageId TEXT,
      lastCaptureNoticeJson TEXT NOT NULL DEFAULT '[]',
      lastCompressedMessageId TEXT,
      uncompressedRoundCount INTEGER NOT NULL DEFAULT 0,
      completedMessageCountAtProfileUpdate INTEGER NOT NULL DEFAULT 0,
      lastProfileUpdatedAt TEXT,
      profileUpdateCooldownUntil TEXT,
      lastMaintenanceError TEXT,
      lastMaintenanceModelProviderId TEXT,
      lastMaintenanceModelId TEXT,
      lastMaintenanceCompletedAt TEXT,
      lastMaintenanceUsedFallback INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_memories (
      id TEXT PRIMARY KEY,
      space TEXT NOT NULL DEFAULT 'normal',
      scope TEXT NOT NULL DEFAULT 'thread',
      scopeId TEXT,
      type TEXT NOT NULL DEFAULT 'fact',
      content TEXT NOT NULL,
      normalizedContent TEXT NOT NULL,
      sourceMessageId TEXT,
      confidence REAL NOT NULL DEFAULT 0.7,
      importance INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      lastUsedAt TEXT,
      ipId INTEGER,
      groupId INTEGER,
      imageAssetId INTEGER,
      assetSnapshotJson TEXT NOT NULL DEFAULT '{}',
      sourceKind TEXT NOT NULL DEFAULT 'auto',
      mergeReason TEXT,
      supersededByMemoryId TEXT,
      lastReconciledAt TEXT,
      reconcileSourceMessageId TEXT,
      mergedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      deletedAt TEXT
    );
    CREATE VIRTUAL TABLE ai_memory_fts USING fts5(
      id UNINDEXED,
      space UNINDEXED,
      scope UNINDEXED,
      scopeId UNINDEXED,
      content,
      normalizedContent,
      assetSnapshotJson UNINDEXED,
      updatedAt UNINDEXED,
      tokenize='unicode61'
    );
  `);
  nativeDb.exec(schemaMod.MIGRATION_STATEMENTS_V43);
  nativeDb.exec(schemaMod.MIGRATION_STATEMENTS_V47);
  nativeDb.exec(schemaMod.MIGRATION_STATEMENTS_V48);
  return wrapSqlite(nativeDb, { yieldMs: 1 });
}

test('AI P1 #8 timing: explicit forget intent staged before drain executes synchronously without 1-turn lag and resolves ancestor branch lineage', async () => {
  const chatServiceSource = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const streamIdx = chatServiceSource.indexOf('async function streamAssistantReply(');
  assert.ok(streamIdx >= 0);
  const streamPrefix = chatServiceSource.slice(streamIdx, streamIdx + 1200);
  const stagePos = streamPrefix.indexOf('stageExplicitMemoryIntentObservation(');
  const drainPos = streamPrefix.indexOf('drainCurrentTurnMemory(');
  const modelPos = chatServiceSource.indexOf('resolveThreadChatModel(', streamIdx);
  assert.ok(stagePos >= 0 && drainPos > stagePos, 'stageExplicitMemoryIntentObservation must run before drainCurrentTurnMemory');
  assert.ok(drainPos < modelPos, 'both intent staging and drain must execute before resolveThreadChatModel');

  const schemaMod = loadTsModule('src/database/schema.ts');
  const db = createMemoryPipelineDb(schemaMod);
  const repoMod = loadTsModule('src/database/repositories/aiThreadRepository.ts', {
    'expo-sqlite': {},
    '../sqliteSerialization': {
      runWithTransactionRetry: async (_db, task) => task(),
    },
  });
  const dbMock = {
    aiThreadRepository: repoMod.aiThreadRepository,
    runWithDatabaseSpace: async (_space, task) => task(db),
    getDatabase: async () => db,
  };
  const sharedMocks = {
    'expo-sqlite': {},
    'src/database/index.ts': dbMock,
    'src/database/sqliteSerialization.ts': { runWithTransactionRetry: async (_d, task) => task() },
    '../database': dbMock,
    '../../database': dbMock,
    '../../database/repositories/aiThreadRepository': repoMod,
  };

  const obsRepo = loadTsModule('src/ai/memory/memoryCurrentTurnRepository.ts', sharedMocks);
  const facade = loadTsModule('src/ai/memory/memoryFacade.ts', sharedMocks);
  const extractor = loadTsModule('src/ai/memory/localFastExtractor.ts', sharedMocks);
  const retrieval = loadTsModule('src/ai/memory/memoryRetrievalService.ts', sharedMocks);

  const now = '2026-11-15T00:00:00.000Z';
  db.nativeDb.prepare(
    `INSERT INTO ai_threads (id, space, contextType, title, currentBranchRootMessageId, currentBranchVersionIndex, lineageVersion, createdAt, updatedAt)
     VALUES ('thread_1', 'normal', 'normal', 'Test', 'msg_branch_root', 2, 1, ?, ?)`
  ).run(now, now);
  db.nativeDb.prepare(
    `INSERT INTO ai_messages (id, threadId, branchRootMessageId, branchVersionIndex, role, status, content, updatedAt, completedAt, createdAt)
     VALUES
       ('msg_parent_root', 'thread_1', NULL, NULL, 'user', 'completed', '初始提问', ?, ?, ?),
       ('msg_branch_claim', 'thread_1', 'msg_parent_root', 1, 'user', 'completed', '我喜欢喝美式黑咖啡', ?, ?, ?),
       ('msg_branch_root', 'thread_1', 'msg_parent_root', 1, 'user', 'completed', '切换话题', ?, ?, ?),
       ('msg_forget_turn', 'thread_1', 'msg_branch_root', 2, 'user', 'completed', '忘掉我喜欢喝美式黑咖啡这件事', ?, ?, ?)`
  ).run(now, now, now, now, now, now, now, now, now, now, now, now);

  // Ancestor branch claim on msg_parent_root:1 must be forgotten from child branch msg_branch_root:2 during drain!
  const claim = await facade.MemoryFacade.createClaim({
    actor: 'user',
    confidenceBand: 'high',
    confidenceRaw: 0.92,
    importance: 80,
    kind: 'state',
    lane: 'confirmed',
    predicate: 'preference.food',
    scopeId: 'thread_1',
    scopeType: 'thread',
    sourceKind: 'message',
    sourceMessageId: 'msg_branch_claim',
    space: 'normal',
    speechMode: 'asserted',
    stability: 'long',
    valueDisplay: '用户喜欢喝美式黑咖啡',
    valueNormalized: '用户喜欢喝美式黑咖啡',
  }, {
    actorId: 'user',
    commandId: 'seed-claim-coffee',
    source: 'test',
  });

  // Simulate current-turn sequence: stage FIRST (passing child+ancestor lineage), then drain immediately.
  const fullLineage = await repoMod.aiThreadRepository.resolveBranchLineage(db, 'msg_branch_root', 2);
  assert.equal(fullLineage.length, 2, 'ancestor + child branch lineage must both be resolved');
  const targetIds = await retrieval.resolveMemoryIntentTargetClaimIds(db, {
    branchScopes: fullLineage,
    observation: { explicitUserAction: true, intent: 'forget', payload: {}, targetText: '忘掉我喜欢喝美式黑咖啡这件事' },
    thread: {
      id: 'thread_1',
      space: 'normal',
      contextType: 'normal',
      boundIpId: null,
      boundKnowledgeBaseId: null,
      roleCardId: null,
    },
  });
  assert.ok(targetIds.includes(claim.id));

  await obsRepo.writeCurrentTurnObservation(db, {
    branchRootMessageId: 'msg_branch_root',
    branchVersionIndex: 2,
    explicitUserAction: true,
    intent: 'forget',
    messageId: 'msg_forget_turn',
    payload: { candidateSource: 'pre-provider-intent-v1', targetClaimIds: targetIds },
    space: 'normal',
    threadId: 'thread_1',
  });

  const drained = await extractor.drainCurrentTurnMemory({
    maxDurationMs: 200,
    space: 'normal',
    threadId: 'thread_1',
  });
  assert.equal(drained, 1);

  const afterClaim = db.nativeDb.prepare('SELECT status, deletedAt FROM memory_claims WHERE id = ?').get(claim.id);
  assert.equal(afterClaim.status, 'deleted', 'Claim must be deleted immediately within the same turn');
  assert.ok(afterClaim.deletedAt, 'deletedAt timestamp must be populated');

  const obsRow = db.nativeDb.prepare('SELECT status FROM memory_current_turn_observations WHERE messageId = ?').get('msg_forget_turn');
  assert.equal(obsRow.status, 'consumed');
});

test('AI P1 #8 reconciliation: captureDeepMemoryForExchange queries V2 memory_claims, executes update & stale via MemoryFacade, guards manual/global, and stops writing dead ai_thread_summaries', async () => {
  const schemaMod = loadTsModule('src/database/schema.ts');
  const db = createMemoryPipelineDb(schemaMod);
  const repoMod = loadTsModule('src/database/repositories/aiThreadRepository.ts', {
    'expo-sqlite': {},
    '../sqliteSerialization': {
      runWithTransactionRetry: async (_db, task) => task(),
    },
  });
  const dbMock = {
    aiThreadRepository: repoMod.aiThreadRepository,
    runWithDatabaseSpace: async (_space, task) => task(db),
    getDatabase: async () => db,
  };

  let promptSeenByMaintenanceModel = '';
  const sharedMocks = {
    'expo-sqlite': {},
    'src/database/index.ts': dbMock,
    'src/database/sqliteSerialization.ts': { runWithTransactionRetry: async (_d, task) => task() },
    '../database': dbMock,
    '../../database': dbMock,
    '../database/repositories/aiThreadRepository': repoMod,
    '../../database/repositories/aiThreadRepository': repoMod,
  };

  const facade = loadTsModule('src/ai/memory/memoryFacade.ts', sharedMocks);
  const now = '2026-11-15T00:00:00.000Z';
  db.nativeDb.prepare(
    `INSERT INTO ai_threads (id, space, contextType, title, createdAt, updatedAt)
     VALUES ('thread_v2', 'normal', 'normal', 'V2 Test', ?, ?)`
  ).run(now, now);
  db.nativeDb.prepare(
    `INSERT INTO ai_thread_memory_settings (threadId, deepMemoryEnabled, updatedAt)
     VALUES ('thread_v2', 1, ?)`
  ).run(now);
  db.nativeDb.prepare(
    `INSERT INTO ai_thread_memory_jobs (threadId, pendingTurnCount, updatedAt)
     VALUES ('thread_v2', 4, ?)`
  ).run(now);
  db.nativeDb.prepare(
    `INSERT INTO ai_messages (id, threadId, role, status, content, updatedAt, completedAt, createdAt)
     VALUES
       ('msg_user_1', 'thread_v2', 'user', 'completed', '我改喝热美式了，不喝冰拿铁了，家里的橘猫也搬去杭州了', ?, ?, ?),
       ('msg_asst_1', 'thread_v2', 'assistant', 'completed', '好的，我记下了。', ?, ?, ?)`
  ).run(now, now, now, now, now, now);

  const autoCoffeeClaim = await facade.MemoryFacade.createClaim({
    actor: 'user',
    confidenceBand: 'high',
    confidenceRaw: 0.9,
    importance: 80,
    kind: 'state',
    lane: 'confirmed',
    predicate: 'preference.general',
    scopeId: 'thread_v2',
    scopeType: 'thread',
    sourceKind: 'message',
    sourceMessageId: 'msg_user_1',
    space: 'normal',
    speechMode: 'asserted',
    stability: 'long',
    valueDisplay: '用户每天早上习惯喝冰拿铁咖啡',
    valueNormalized: '用户每天早上习惯喝冰拿铁咖啡',
  }, { commandId: 'seed-coffee', source: 'test' });

  const autoCatCityClaim = await facade.MemoryFacade.createClaim({
    actor: 'user',
    confidenceBand: 'high',
    confidenceRaw: 0.9,
    importance: 80,
    kind: 'state',
    lane: 'confirmed',
    predicate: 'fact.identity',
    scopeId: 'thread_v2',
    scopeType: 'thread',
    sourceKind: 'message',
    sourceMessageId: 'msg_user_1',
    space: 'normal',
    speechMode: 'asserted',
    stability: 'long',
    valueDisplay: '用户的橘猫住在上海',
    valueNormalized: '用户的橘猫住在上海',
  }, { commandId: 'seed-cat-city', source: 'test' });

  const manualClaim = await facade.MemoryFacade.createClaim({
    actor: 'user',
    confidenceBand: 'high',
    confidenceRaw: 1.0,
    importance: 100,
    kind: 'state',
    lane: 'confirmed',
    manualLocked: true,
    predicate: 'fact.identity',
    scopeId: 'thread_v2',
    scopeType: 'thread',
    sourceKind: 'manual',
    sourceMessageId: null,
    space: 'normal',
    speechMode: 'asserted',
    stability: 'permanent',
    valueDisplay: '手动锁定：用户对花生严重过敏',
    valueNormalized: '手动锁定：用户对花生严重过敏',
  }, { actorId: 'user', commandId: 'seed-manual', source: 'manual' });

  const captureMod = loadTsModule('src/ai/aiMemoryCaptureService.ts', {
    ...sharedMocks,
    'src/ai/aiMemoryMaintenanceModelService.ts': {
      async callMemoryMaintenanceModel(req) {
        promptSeenByMaintenanceModel = req.userPrompt;
        return {
          error: null,
          modelId: 'mock-model',
          providerId: 'mock-provider',
          text: JSON.stringify({
            summary: 'should not be written to ai_thread_summaries',
            decisions: 'ignored decision',
            openQuestions: '',
            memories: [],
            operations: [
              {
                op: 'stale',
                targetMemoryId: autoCoffeeClaim.id,
                confidence: 0.92,
                reason: '不再喝冰拿铁',
              },
              {
                op: 'update',
                targetMemoryId: autoCatCityClaim.id,
                scope: 'thread',
                type: 'fact',
                content: '用户养的猫搬去了杭州',
                confidence: 0.91,
                importance: 4,
              },
              {
                op: 'update',
                targetMemoryId: manualClaim.id,
                scope: 'thread',
                type: 'fact',
                content: '企图覆盖手动记忆',
                confidence: 0.99,
                importance: 5,
              },
              {
                op: 'update',
                targetMemoryId: autoCatCityClaim.id,
                scope: 'global',
                type: 'fact',
                content: '企图越权写全局',
                confidence: 0.99,
                importance: 5,
              },
            ],
          }),
          usedRemote: true,
        };
      },
    },
  });

  await captureMod.captureDeepMemoryForExchange({
    allowRemoteModel: true,
    assistantMessageId: 'msg_asst_1',
    space: 'normal',
    thread: {
      id: 'thread_v2',
      space: 'normal',
      contextType: 'normal',
      boundIpId: null,
      boundKnowledgeBaseId: null,
      roleCardId: null,
    },
    userMessage: {
      id: 'msg_user_1',
      content: '我改喝热美式了，不喝冰拿铁了，家里的橘猫也搬去杭州了',
    },
  });

  // 1) V2 claims surfaced in reconciliation prompt!
  assert.ok(promptSeenByMaintenanceModel.includes(autoCoffeeClaim.id), 'V2 claim ID must appear in reconciliation prompt');
  assert.ok(promptSeenByMaintenanceModel.includes(autoCatCityClaim.id), 'Second V2 claim ID must appear in reconciliation prompt');

  // 2) stale executed on V2 claim!
  const coffeeAfter = db.nativeDb.prepare('SELECT status, lane FROM memory_claims WHERE id = ?').get(autoCoffeeClaim.id);
  assert.equal(coffeeAfter.status, 'stale');
  assert.equal(coffeeAfter.lane, 'archive');

  // 3) update executed via MemoryFacade.editClaim!
  const catOldAfter = db.nativeDb.prepare('SELECT status, supersededByClaimId FROM memory_claims WHERE id = ?').get(autoCatCityClaim.id);
  assert.equal(catOldAfter.status, 'superseded');
  assert.ok(catOldAfter.supersededByClaimId);
  const catNewAfter = db.nativeDb.prepare('SELECT valueDisplay, scopeType FROM memory_claims WHERE id = ?').get(catOldAfter.supersededByClaimId);
  assert.equal(catNewAfter.valueDisplay, '用户养的猫搬去了杭州');
  assert.equal(catNewAfter.scopeType, 'thread');

  // 4) manual claim & global escalation both rejected!
  const manualAfter = db.nativeDb.prepare('SELECT status, valueDisplay FROM memory_claims WHERE id = ?').get(manualClaim.id);
  assert.equal(manualAfter.status, 'confirmed');
  assert.equal(manualAfter.valueDisplay, '手动锁定：用户对花生严重过敏');
  const globalEsc = db.nativeDb.prepare("SELECT COUNT(*) AS count FROM memory_claims WHERE scopeType = 'global'").get();
  assert.equal(Number(globalEsc.count), 0);

  // 5) dead ai_thread_summaries table no longer written by captureDeepMemoryForExchange!
  const summaryRows = db.nativeDb.prepare('SELECT COUNT(*) AS count FROM ai_thread_summaries').get();
  assert.equal(Number(summaryRows.count), 0);
});

function createCompanionRuntimeDb(schemaMod) {
  const nativeDb = new DatabaseSync(':memory:');
  nativeDb.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY,
      roleCardId TEXT,
      lineageVersion INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY,
      threadId TEXT NOT NULL,
      branchRootMessageId TEXT,
      branchVersionIndex INTEGER,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      content TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      completedAt TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
    );
  `);
  nativeDb.exec(schemaMod.MIGRATION_STATEMENTS_V52);
  return wrapSqlite(nativeDb, { yieldMs: 1 });
}

test('AI P2 #10 companion OpenLoops: sequential DB reads inside transaction, topic-matched settlement & boundary dismissal, and anaphoric fallback safety', async () => {
  const schemaMod = loadTsModule('src/database/schema.ts');
  const db = createCompanionRuntimeDb(schemaMod);
  const repoMod = loadTsModule('src/database/repositories/aiThreadRepository.ts', {
    'expo-sqlite': {},
    '../sqliteSerialization': { runWithTransactionRetry: async (_d, task) => task() },
  });
  const dbMock = {
    aiThreadRepository: repoMod.aiThreadRepository,
    runWithDatabaseSpace: async (_space, task) => task(db),
  };

  const companionSource = fs.readFileSync(path.join(root, 'src/ai/companion/companionRuntimeService.ts'), 'utf8');
  const txBlock = companionSource.slice(companionSource.indexOf('await db.withTransactionAsync'));
  assert.doesNotMatch(txBlock, /Promise\.all\(/, 'must not issue concurrent queries inside SQLite withTransactionAsync');

  const runtime = loadTsModule('src/ai/companion/companionRuntimeService.ts', {
    'expo-sqlite': {},
    'src/database/index.ts': dbMock,
    '../../database': dbMock,
    'src/ai/companion/companionSettingsService.ts': {
      isCompanionAwarenessEnabled: async () => true,
    },
    'src/ai/companion/companionProjectionEngine.ts': {
      rebuildCompanionProjection: async () => null,
    },
    '../../database/repositories/aiThreadRepository': repoMod,
  });

  const baseTime = '2026-11-15T08:00:00.000Z';
  db.nativeDb.prepare("INSERT INTO ai_threads (id, roleCardId, lineageVersion) VALUES ('thread_c', 'role_c', 0)").run();

  const insertMsg = (id, content) => {
    db.nativeDb.prepare(
      `INSERT INTO ai_messages (id, threadId, branchRootMessageId, branchVersionIndex, role, status, content, updatedAt, completedAt, createdAt)
       VALUES (?, 'thread_c', NULL, NULL, 'user', 'completed', ?, ?, ?, ?)`
    ).run(id, content, baseTime, baseTime, baseTime);
  };

  insertMsg('m_loop_exam', '等体检结果出来告诉你');
  insertMsg('m_loop_pkg', '等快递消息到了跟你说');

  const thread = {
    id: 'thread_c',
    roleCardId: 'role_c',
    lineageVersion: 0,
    space: 'normal',
    contextType: 'normal',
    boundIpId: null,
    boundKnowledgeBaseId: null,
  };

  await runtime.observeCompanionCurrentTurn({ space: 'normal', thread, userMessageId: 'm_loop_exam', now: baseTime });
  await runtime.observeCompanionCurrentTurn({ space: 'normal', thread, userMessageId: 'm_loop_pkg', now: baseTime });

  const initialLoops = db.nativeDb.prepare('SELECT id, topicText, status FROM companion_open_loops ORDER BY topicText ASC').all();
  assert.equal(initialLoops.length, 2);
  assert.ok(initialLoops.every((loop) => loop.status === 'open'));

  // Case A: unrelated topic completion must NOT settle either unrelated open loop.
  insertMsg('m_unrelated', '房贷合同已经搞定了');
  await runtime.observeCompanionCurrentTurn({ space: 'normal', thread, userMessageId: 'm_unrelated', now: baseTime });
  const afterUnrelated = db.nativeDb.prepare("SELECT COUNT(*) AS count FROM companion_open_loops WHERE status = 'open'").get();
  assert.equal(Number(afterUnrelated.count), 2, 'Unrelated completion must not wrongly resolve existing open loops');

  // Case B: specific completion settles ONLY the matching loop ("体检") and keeps "快递" open.
  insertMsg('m_exam_done', '体检结果出来了，很健康');
  await runtime.observeCompanionCurrentTurn({ space: 'normal', thread, userMessageId: 'm_exam_done', now: baseTime });
  const afterExamDone = db.nativeDb.prepare('SELECT topicText, status FROM companion_open_loops').all();
  const examLoop = afterExamDone.find((item) => item.topicText.includes('体检'));
  const pkgLoop = afterExamDone.find((item) => item.topicText.includes('快递'));
  assert.equal(examLoop.status, 'resolved');
  assert.equal(pkgLoop.status, 'open');

  // Case C: add a second open loop, verify topic-specific boundary dismissal ("别再提快递") only dismisses matching loop!
  insertMsg('m_loop_rent', '明天晚上交房租后再聊');
  await runtime.observeCompanionCurrentTurn({ space: 'normal', thread, userMessageId: 'm_loop_rent', now: baseTime });
  insertMsg('m_dismiss_pkg', '别再提快递的事了');
  await runtime.observeCompanionCurrentTurn({ space: 'normal', thread, userMessageId: 'm_dismiss_pkg', now: baseTime });
  const afterTargetedDismiss = db.nativeDb.prepare('SELECT topicText, status FROM companion_open_loops').all();
  assert.equal(afterTargetedDismiss.find((item) => item.topicText.includes('快递')).status, 'dismissed');
  assert.equal(afterTargetedDismiss.find((item) => item.topicText.includes('房租')).status, 'open');

  // Case D: with only 1 remaining open loop ("房租"), pure anaphoric completion ("已经搞定了") resolves it unambiguously!
  insertMsg('m_anaphoric_done', '已经搞定了');
  await runtime.observeCompanionCurrentTurn({ space: 'normal', thread, userMessageId: 'm_anaphoric_done', now: baseTime });
  const afterAnaphoric = db.nativeDb.prepare('SELECT topicText, status FROM companion_open_loops').all();
  assert.equal(afterAnaphoric.find((item) => item.topicText.includes('房租')).status, 'resolved');
});
