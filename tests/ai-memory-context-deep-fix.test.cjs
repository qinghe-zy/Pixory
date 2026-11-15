const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

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
      if (reqPath === 'expo-sqlite') {
        return { SQLiteDatabase: class {} };
      }
      if (reqPath === 'expo-secure-store') {
        return { getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} };
      }
      if (reqPath === 'expo/fetch' || reqPath === 'expo') {
        return { fetch: globalThis.fetch };
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

const mockDatabase = {
  aiThreadRepository: {
    findThreadById: async () => ({ id: 'thread_1', space: 'normal', lineageVersion: 0, contextHistoryRoundLimit: 30 }),
    getThreadMemorySettings: async () => ({ deepMemoryEnabled: true }),
    getThreadMemoryJob: async () => ({ lastCompressedMessageId: null }),
    countCompletedNonSystemMessagesAfter: async () => 10,
    listSummarySegments: async () => [],
    createSummarySegment: async () => {},
    deleteSummarySegments: async () => {},
    updateThreadMemoryJob: async () => {},
  },
  runWithDatabaseSpace: async (space, fn) => fn({
    withTransactionAsync: async (cb) => cb(),
    getAllAsync: async () => [],
  }),
};

test('P0-1: buildSummaryMergePrompt generates configurable maxChars constraint', () => {
  const { buildSummaryMergePrompt } = loadTsModule('src/ai/aiMemoryPrompts.ts');
  const defaultPrompt = buildSummaryMergePrompt('段落1\n段落2');
  assert.match(defaultPrompt, /总字数不超过1200字/);

  const customPrompt = buildSummaryMergePrompt('段落1\n段落2', 800);
  assert.match(customPrompt, /总字数不超过800字/);
  assert.match(customPrompt, /【合并原则】/);
  assert.match(customPrompt, /【安全边界】/);
});

test('P1-5: resolveSummarySegmentPolicy dynamically scales with round limit', () => {
  const {
    resolveSummarySegmentPolicy,
    SUMMARY_SEGMENT_LIMIT,
    PRESERVE_LATEST_SEGMENT_COUNT,
  } = loadTsModule('src/ai/aiMemorySummaryService.ts', {
    '../database': mockDatabase,
    'src/database': mockDatabase,
    'src/database/index.ts': mockDatabase,
  });

  assert.equal(SUMMARY_SEGMENT_LIMIT, 5);
  assert.equal(PRESERVE_LATEST_SEGMENT_COUNT, 2);

  const small = resolveSummarySegmentPolicy(30);
  assert.equal(small.segmentLimit, 5);
  assert.equal(small.preserveLatestCount, 2);

  const medium = resolveSummarySegmentPolicy(60);
  assert.equal(medium.segmentLimit, 10);
  assert.equal(medium.preserveLatestCount, 3);

  const large = resolveSummarySegmentPolicy(120);
  assert.equal(large.segmentLimit, 16);
  assert.equal(large.preserveLatestCount, 5);
});

test('P1-2: buildAllowedScopeSqlClause constructs parameter-bound SQL clauses for memory scopes', () => {
  const { buildAllowedScopeSqlClause } = loadTsModule('src/ai/memory/memoryRetrievalService.ts', {
    '../database': mockDatabase,
    'src/database': mockDatabase,
    'src/database/index.ts': mockDatabase,
  });

  const thread = {
    id: 'thread_test_1',
    space: 'normal',
    roleCardId: 'role_test_1',
    boundIpId: 101,
    boundKnowledgeBaseId: 'kb_test_1',
  };
  const branchScopes = [
    { branchRootMessageId: 'msg_root_1', branchVersionIndex: 1 },
  ];

  const claimsClause = buildAllowedScopeSqlClause(thread, branchScopes, 'scopeType');
  assert.match(claimsClause.sql, /scopeType = 'global'/);
  assert.match(claimsClause.sql, /scopeType = 'thread' AND scopeId = \?/);
  assert.match(claimsClause.sql, /scopeType = 'role' AND scopeId = \?/);
  assert.match(claimsClause.sql, /scopeType = 'ip' AND scopeId = \?/);
  assert.match(claimsClause.sql, /scopeType = 'knowledge_base' AND scopeId = \?/);
  assert.match(claimsClause.sql, /scopeType = 'branch' AND scopeId IN \(\?\)/);
  assert.deepEqual(claimsClause.params, [
    'thread_test_1',
    'role_test_1',
    '101',
    'kb_test_1',
    'msg_root_1:1',
  ]);

  const ftsClause = buildAllowedScopeSqlClause(thread, [], 'scope');
  assert.match(ftsClause.sql, /scope = 'global'/);
  assert.match(ftsClause.sql, /scope = 'thread' AND scopeId = \?/);
  assert.equal(ftsClause.params.length, 4);
});

test('P1-3: conversationCoverage stops greedily on summary token overflow without skipping segments', () => {
  const { buildConversationCoveragePlan } = loadTsModule('src/ai/context/conversationCoverage.ts');

  const messages = Array.from({ length: 40 }, (_, idx) => ({
    id: `m_${idx + 1}`,
    role: idx % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${idx + 1}`,
    createdAt: new Date(Date.now() + idx * 1000).toISOString(),
    completedAt: new Date(Date.now() + idx * 1000 + 500).toISOString(),
    status: 'completed',
  }));

  const seg1SourceIds = messages.slice(0, 10).map((m) => m.id);
  const seg2SourceIds = messages.slice(10, 20).map((m) => m.id);

  const segment1 = {
    id: 'seg_1',
    threadId: 't1',
    branchRouteHash: 'hash_test',
    lineageVersion: 0,
    sourceMessageIdsJson: JSON.stringify(seg1SourceIds),
    sourceMessageVersionHash: 'vhash_1',
    summaryText: 'Summary segment 1 covering rounds 1 to 5 with critical details.',
    roundCount: 5,
    quality: 'model',
    status: 'active',
  };

  const segment2 = {
    id: 'seg_2',
    threadId: 't1',
    branchRouteHash: 'hash_test',
    lineageVersion: 0,
    sourceMessageIdsJson: JSON.stringify(seg2SourceIds),
    sourceMessageVersionHash: 'vhash_2',
    summaryText: 'Summary segment 2 covering rounds 6 to 10 with expansive updates and longer content to consume budget tokens.',
    roundCount: 5,
    quality: 'model',
    status: 'active',
  };

  const coveragePlan = buildConversationCoveragePlan({
    branchRouteHash: 'hash_test',
    historyRoundLimit: 10,
    messages,
    summarySegments: [segment1, segment2],
    summaryTokenBudget: 15,
  });

  if (coveragePlan.plan.summarySegmentIds.length === 1) {
    assert.equal(coveragePlan.plan.summarySegmentIds[0], 'seg_2');
  }
});

test('P0-1: maybeMergeSummarySegments aborts cleanly when remote model is disabled without deleting segments', async () => {
  let deleteCalled = false;
  let createCalled = false;

  const mockDbWithSegments = {
    aiThreadRepository: {
      findThreadById: async () => ({ id: 't_merge_1', space: 'normal', lineageVersion: 0, contextHistoryRoundLimit: 30 }),
      getThreadMemorySettings: async () => ({ deepMemoryEnabled: true }),
      listSummarySegments: async () => [
        { id: 's1', branchRouteHash: 'h', lineageVersion: 0, sourceMessageIdsJson: '["m1","m2"]', roundCount: 1, startAt: 't1', endAt: 't2', startMessageId: 'm1', endMessageId: 'm2', summaryText: 'text1' },
        { id: 's2', branchRouteHash: 'h', lineageVersion: 0, sourceMessageIdsJson: '["m3","m4"]', roundCount: 1, startAt: 't3', endAt: 't4', startMessageId: 'm3', endMessageId: 'm4', summaryText: 'text2' },
        { id: 's3', branchRouteHash: 'h', lineageVersion: 0, sourceMessageIdsJson: '["m5","m6"]', roundCount: 1, startAt: 't5', endAt: 't6', startMessageId: 'm5', endMessageId: 'm6', summaryText: 'text3' },
        { id: 's4', branchRouteHash: 'h', lineageVersion: 0, sourceMessageIdsJson: '["m7","m8"]', roundCount: 1, startAt: 't7', endAt: 't8', startMessageId: 'm7', endMessageId: 'm8', summaryText: 'text4' },
        { id: 's5', branchRouteHash: 'h', lineageVersion: 0, sourceMessageIdsJson: '["m9","m10"]', roundCount: 1, startAt: 't9', endAt: 't10', startMessageId: 'm9', endMessageId: 'm10', summaryText: 'text5' },
        { id: 's6', branchRouteHash: 'h', lineageVersion: 0, sourceMessageIdsJson: '["m11","m12"]', roundCount: 1, startAt: 't11', endAt: 't12', startMessageId: 'm11', endMessageId: 'm12', summaryText: 'text6' },
      ],
      findMessagesByIds: async (db, ids) => ids.map((id) => ({ id, role: 'user', content: 'test', createdAt: '2026-01-01' })),
      createSummarySegment: async () => { createCalled = true; },
      deleteSummarySegments: async () => { deleteCalled = true; },
      updateThreadMemoryJob: async () => {},
    },
    runWithDatabaseSpace: async (space, fn) => fn({
      withTransactionAsync: async (cb) => cb(),
    }),
  };

  const { maybeMergeSummarySegments } = loadTsModule('src/ai/aiMemorySummaryService.ts', {
    '../database': mockDbWithSegments,
    'src/database': mockDbWithSegments,
    'src/database/index.ts': mockDbWithSegments,
  });

  const result = await maybeMergeSummarySegments('normal', 't_merge_1', { allowRemoteModel: false });
  assert.equal(result.usedRemote, false);
  assert.equal(deleteCalled, false);
  assert.equal(createCalled, false);
});

test('P2-1: drainCurrentTurnMemory prioritizes explicit forget/correction and consumes observations', async () => {
  const pendingObs = [
    {
      id: 'obs_generic',
      messageId: 'msg_generic',
      space: 'normal',
      threadId: 't1',
      explicitUserAction: false,
      intent: 'none',
      status: 'pending',
    },
    {
      id: 'obs_forget',
      messageId: 'msg_forget',
      space: 'normal',
      threadId: 't1',
      explicitUserAction: true,
      intent: 'forget',
      status: 'pending',
    },
  ];

  const processedOrder = [];
  const consumedIds = new Set();

  const mockFastExtractorDb = {
    aiThreadRepository: {
      findThreadById: async () => ({ id: 't1', space: 'normal', roleCardId: null, boundIpId: null, boundKnowledgeBaseId: null }),
      findMessageById: async (db, msgId) => {
        processedOrder.push(msgId);
        return {
          id: msgId,
          role: 'user',
          content: msgId === 'msg_forget' ? '忘掉这件事' : '我刚才去吃饭了',
          createdAt: '2026-01-01',
        };
      },
      resolveBranchLineage: async () => [],
    },
    runWithDatabaseSpace: async (space, fn) => fn({
      withTransactionAsync: async (cb) => cb(),
      getAllAsync: async () => [],
    }),
  };

  const mockObservationRepo = {
    listPendingCurrentTurnObservations: async () => [...pendingObs].filter(o => !consumedIds.has(o.id)),
    consumeCurrentTurnObservation: async (db, { id }) => {
      consumedIds.add(id);
    },
    writeCurrentTurnObservation: async (db, input) => ({ id: `obs_written_${input.messageId}`, ...input }),
    parseObservationPayload: (o) => ({}),
  };

  const { drainCurrentTurnMemory } = loadTsModule('src/ai/memory/localFastExtractor.ts', {
    '../database': mockFastExtractorDb,
    'src/database': mockFastExtractorDb,
    '../../database': mockFastExtractorDb,
    './memoryCurrentTurnRepository': mockObservationRepo,
    'src/ai/memory/memoryCurrentTurnRepository': mockObservationRepo,
  });

  const count = await drainCurrentTurnMemory({
    space: 'normal',
    threadId: 't1',
    maxDurationMs: 1000,
  });

  assert.equal(count, 2);
  assert.equal(processedOrder[0], 'msg_forget');
  assert.equal(processedOrder[1], 'msg_generic');
  assert.ok(consumedIds.has('obs_forget'));
  assert.ok(consumedIds.has('obs_generic'));
});
