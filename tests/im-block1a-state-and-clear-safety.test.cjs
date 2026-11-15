const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(root, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.tsx') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(`${targetPath}.ts`)) targetPath += '.ts';
    else if (fs.existsSync(`${targetPath}.tsx`)) targetPath += '.tsx';
    else if (fs.existsSync(`${targetPath}.js`)) targetPath += '.js';
    else if (fs.existsSync(path.join(targetPath, 'index.ts'))) targetPath = path.join(targetPath, 'index.ts');
  }
  const source = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: targetPath,
  }).outputText;

  const mod = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      const resolved = path.resolve(path.dirname(targetPath), reqPath);
      const relFromRoot = path.relative(root, resolved).replace(/\\/g, '/');
      if (mockRequire[relFromRoot]) return mockRequire[relFromRoot];
      return loadTsModule(relFromRoot, mockRequire);
    }
    return require(reqPath);
  };

  new Function('module', 'exports', 'require', transpiled)(mod, mod.exports, customRequire);
  return mod.exports;
}

function createSqliteAdapter(memDb) {
  const execSql = async (sql, params = []) => {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const stmt = memDb.prepare(sql);
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('PRAGMA')) {
      return stmt.all(...flatParams);
    }
    stmt.run(...flatParams);
    return { changes: 0, lastInsertRowId: 0 };
  };

  const rawDb = {
    async execAsync(source) {
      memDb.exec(source);
    },
    async runAsync(source, ...params) {
      return execSql(source, params);
    },
    async getFirstAsync(source, ...params) {
      const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      const row = memDb.prepare(source).get(...flatParams);
      return row ?? null;
    },
    async getAllAsync(source, ...params) {
      const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      return memDb.prepare(source).all(...flatParams);
    },
    async withTransactionAsync(fn) {
      memDb.exec('BEGIN IMMEDIATE');
      try {
        const res = await fn(rawDb);
        memDb.exec('COMMIT');
        return res;
      } catch (err) {
        try {
          memDb.exec('ROLLBACK');
        } catch {}
        throw err;
      }
    },
  };

  const { serializeSqliteDatabase } = loadTsModule('src/database/sqliteSerialization.ts');
  return serializeSqliteDatabase(rawDb);
}

test('IM P2 #15: MemoryExtractionBatcher unifies keys and flushes overflow batches without dropping turns', async () => {
  const { MemoryExtractionBatcher, buildMemoryBatcherKey } = loadTsModule(
    'src/core/memory/memoryExtractionBatcher.ts',
    {
      '../../database/index': {},
      'expo-secure-store': { getItemAsync: async () => null },
      'expo-sqlite': {},
    }
  );

  assert.equal(buildMemoryBatcherKey('normal', 'role_1', 'th_1'), 'normal:role_1');
  assert.equal(buildMemoryBatcherKey('personal', '', 'th_fallback'), 'personal:th_fallback');
  assert.equal(buildMemoryBatcherKey('normal', null, null), 'normal:default');

  const batcher = new MemoryExtractionBatcher();
  const calls = [];
  batcher.setExtractorForTest(async (params) => {
    await new Promise((r) => setTimeout(r, 15));
    calls.push(params.userMessage);
    return 1;
  });

  const base = {
    space: 'normal',
    roleCardId: 'role_burst',
    threadId: 'th_burst',
    chatProviderId: 'deepseek',
    chatModelId: 'deepseek-chat',
    existingFacts: [],
  };

  batcher.enqueue({ ...base, userMessage: '第1轮：喜欢喝冰美式' });
  batcher.enqueue({ ...base, userMessage: '第2轮：最近在学日语' });
  batcher.enqueue({ ...base, userMessage: '第3轮：养了只橘猫' });
  assert.equal(batcher.getPendingCount('normal:role_burst'), 3);

  // 第 4 轮到达时，必须先将前 3 轮刷出入队，绝不能用 queue.shift() 丢弃第 1 轮
  batcher.enqueue({ ...base, userMessage: '第4轮：周末去爬山' });
  assert.equal(batcher.getPendingCount('normal:role_burst'), 1);

  await batcher.flushKey(buildMemoryBatcherKey('normal', 'role_burst', 'th_burst'));

  assert.equal(calls.length, 2, 'Should emit two sequential batches instead of shifting/dropping');
  assert.ok(calls[0].includes('第1轮：喜欢喝冰美式'), 'First turn must never be dropped');
  assert.ok(calls[0].includes('第2轮：最近在学日语'));
  assert.ok(calls[0].includes('第3轮：养了只橘猫'));
  assert.ok(calls[1].includes('第4轮：周末去爬山'));

  // clearKey cancels timer and prevents unstarted extraction
  batcher.enqueue({ ...base, roleCardId: 'role_forget', userMessage: '气话忘掉吧' });
  assert.equal(batcher.getPendingCount('normal:role_forget'), 1);
  batcher.clearKey(buildMemoryBatcherKey('normal', 'role_forget'));
  assert.equal(batcher.getPendingCount('normal:role_forget'), 0);
  await batcher.flushKey(buildMemoryBatcherKey('normal', 'role_forget'));
  assert.equal(calls.length, 2);
});

test('IM P0 #1: buildChatPayload followupContinuation prevents userInput duplication and image re-attachment', () => {
  const { buildChatPayload } = loadTsModule('src/im/engine/imContextBuilder.ts');
  const now = Date.now();
  const userQ = '帮我想想去年冬天那家甜品店叫啥，顺便发语音告诉我';
  const opening = '让我想想……那家店好像是在老街拐角那边？';

  const followupHistory = [
    {
      id: 'm1',
      threadId: 'th1',
      role: 'user',
      content: userQ,
      status: 'sent',
      createdAt: new Date(now - 5000).toISOString(),
    },
    {
      id: 'm2',
      threadId: 'th1',
      role: 'assistant',
      content: opening,
      status: 'sent',
      createdAt: new Date(now - 2000).toISOString(),
    },
  ];

  const payload = buildChatPayload(
    {
      rolePrompt: '你是贴心伴侣。',
      roleName: '阿依',
      historyMessages: followupHistory,
      recalledMemories: [
        {
          id: 'mem_shop',
          roleCardId: 'r1',
          space: 'normal',
          tier: 'L2_EPISODE',
          category: 'memory',
          content: '去年冬天去过老街拐角那家叫「雪松」的焦糖布丁店',
          triggerKeywords: ['雪松'],
          entities: ['雪松'],
          importance: 7,
          hitCount: 0,
          isPinned: false,
          createdAt: now - 100000,
          lastAccessedAt: now - 100000,
          sourceMode: 'im',
          score: 0.9,
        },
      ],
      currentImageBase64: 'SHOULD_NOT_REPEAT_IMAGE',
      followupContinuation: true,
      now,
    },
    userQ
  );

  const userMessages = payload.filter((m) => m.role === 'user');
  const duplicateUserInputs = userMessages.filter(
    (m) => typeof m.content === 'string' && m.content === userQ
  );
  assert.equal(duplicateUserInputs.length, 1, 'Original userInput must appear once in Layer 3, never duplicated in Layer 5');

  const lastMsg = payload[payload.length - 1];
  assert.equal(lastMsg.role, 'user');
  assert.equal(typeof lastMsg.content, 'string', 'Continuation Layer 5 must not re-attach array image payload');
  assert.ok(lastMsg.content.includes('顺接刚才已检索到的完整记忆'));

  const systemJoined = payload.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  assert.ok(systemJoined.includes('动态语音意图提示'), 'Voice intent on original input must still apply to Layer 4');
});

test('IM P0 #4: clearImThreadFullState & deleteImThread protect sibling role threads and cascade cleanly on last thread', async () => {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec(`
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      roleCardId TEXT,
      title TEXT NOT NULL,
      chat_mode TEXT NOT NULL,
      lastMessagePreview TEXT,
      im_unread_count INTEGER DEFAULT 0,
      consecutive_unreplied_count INTEGER DEFAULT 0,
      living_state_json TEXT,
      pending_ping_at INTEGER,
      pending_ping_intent TEXT,
      ping_retry_count INTEGER DEFAULT 0,
      pending_diary_hook TEXT,
      updatedAt TEXT
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY NOT NULL,
      threadId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE TABLE ai_im_epoch_states (
      thread_id TEXT NOT NULL,
      space TEXT NOT NULL,
      role_card_id TEXT,
      epoch_version INTEGER DEFAULT 1,
      PRIMARY KEY (thread_id, space)
    );
    CREATE TABLE ai_companion_diaries (
      id TEXT PRIMARY KEY NOT NULL,
      thread_id TEXT NOT NULL,
      role_card_id TEXT,
      content TEXT
    );
    CREATE TABLE ai_companion_memories (
      id TEXT PRIMARY KEY NOT NULL,
      role_card_id TEXT NOT NULL,
      space TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE ai_companion_memories_fts USING fts5(
      memory_id UNINDEXED,
      content,
      trigger_keywords
    );
  `);

  memDb.exec(`
    INSERT INTO ai_threads (id, space, roleCardId, title, chat_mode, lastMessagePreview, im_unread_count, living_state_json, pending_ping_at, pending_diary_hook, updatedAt)
    VALUES
      ('th_a', 'normal', 'role_shared', 'A', 'im', 'hi A', 2, '{}', 12345, 'hookA', '2026-11-14'),
      ('th_b', 'normal', 'role_shared', 'B', 'im', 'hi B', 1, '{}', 67890, 'hookB', '2026-11-14');
    INSERT INTO ai_messages VALUES ('m_a1', 'th_a', 'user', 'A msg'), ('m_b1', 'th_b', 'user', 'B msg');
    INSERT INTO ai_im_epoch_states (thread_id, space, role_card_id) VALUES ('th_a', 'normal', 'role_shared'), ('th_b', 'normal', 'role_shared');
    INSERT INTO ai_companion_diaries VALUES ('d_a', 'th_a', 'role_shared', 'diary A'), ('d_b', 'th_b', 'role_shared', 'diary B');
    INSERT INTO ai_companion_memories VALUES ('mem_1', 'role_shared', 'normal', 'shared fact');
    INSERT INTO ai_companion_memories_fts (memory_id, content, trigger_keywords) VALUES ('mem_1', 'shared fact', 'fact');
  `);

  const dbAdapter = createSqliteAdapter(memDb);
  const { withScopedTransaction } = loadTsModule('src/database/sqliteSerialization.ts');

  const cleanupCalls = {
    aborted: [],
    stagedCancelled: [],
    pingCancelled: [],
    batcherCleared: [],
    prefetchInvalidated: [],
  };

  const { clearImThreadFullState, deleteImThread } = loadTsModule(
    'src/im/repository/imThreadRepository.ts',
    {
      '../../database': {
        initDatabase: async () => dbAdapter,
        withScopedTransaction,
      },
      '../services/imBackgroundStreamService': {
        abortActiveStream: (sp, th) => cleanupCalls.aborted.push(`${sp}:${th}`),
      },
      '../services/imNotificationManager': {
        cancelStagedMessageAlarm: async (th) => { cleanupCalls.stagedCancelled.push(th); return true; },
        cancelProactivePingAlarm: async (th) => { cleanupCalls.pingCancelled.push(th); return true; },
      },
      '../../core/memory/memoryExtractionBatcher': {
        MemoryExtractionBatcher: {
          shared: { clearKey: (k) => cleanupCalls.batcherCleared.push(k) },
        },
        buildMemoryBatcherKey: (sp, roleId, thId) => `${sp}:${roleId || thId || 'default'}`,
      },
      '../../core/memory/memoryPrefetchService': {
        invalidateRoleMemoryPrefetch: (sp, roleId) => cleanupCalls.prefetchInvalidated.push(`${sp}:${roleId}`),
      },
    }
  );

  // 1. 清空 th_a（仍存在兄弟会话 th_b 引用同一 role_shared）：禁止误删共享记忆与 th_b 日记/消息
  await clearImThreadFullState('normal', 'th_a', 'role_shared');

  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_messages WHERE threadId = 'th_a'").get().c, 0);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_im_epoch_states WHERE thread_id = 'th_a'").get().c, 0);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_companion_diaries WHERE thread_id = 'th_a'").get().c, 0);
  const thARow = memDb.prepare("SELECT * FROM ai_threads WHERE id = 'th_a'").get();
  assert.equal(thARow.lastMessagePreview, null);
  assert.equal(thARow.im_unread_count, 0);
  assert.equal(thARow.pending_ping_at, null);
  assert.equal(thARow.pending_diary_hook, null);

  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_messages WHERE threadId = 'th_b'").get().c, 1);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_companion_diaries WHERE thread_id = 'th_b'").get().c, 1);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_companion_memories WHERE role_card_id = 'role_shared'").get().c, 1);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_companion_memories_fts").get().c, 1);

  // 2. 删除 th_a，th_b 仍存活：仍不级联删除共享角色记忆
  await deleteImThread('normal', 'th_a');
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_threads WHERE id = 'th_a'").get().c, 0);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_companion_memories WHERE role_card_id = 'role_shared'").get().c, 1);

  // 3. 删除最后一个存活会话 th_b：此时无兄弟会话，应安全级联删除角色记忆、FTS、epoch_states 与全部清理动作
  await deleteImThread('normal', 'th_b');
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_threads").get().c, 0);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_messages").get().c, 0);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_im_epoch_states").get().c, 0);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_companion_diaries").get().c, 0);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_companion_memories").get().c, 0);
  assert.equal(memDb.prepare("SELECT COUNT(*) AS c FROM ai_companion_memories_fts").get().c, 0);

  assert.ok(cleanupCalls.aborted.includes('normal:th_b'));
  assert.ok(cleanupCalls.stagedCancelled.includes('th_b'));
  assert.ok(cleanupCalls.pingCancelled.includes('th_b'));
  assert.ok(cleanupCalls.prefetchInvalidated.includes('normal:role_shared'));
  assert.ok(cleanupCalls.batcherCleared.includes('normal:role_shared'));
});

test('IM P0 #3: imBackgroundStreamService aligns personalization, memoryTurnCoordinator, Lockstep, settlement and Batcher', async () => {
  const nowTs = new Date('2026-11-14T15:00:00Z').getTime();
  const userSentIso = new Date(nowTs - 60_000).toISOString();
  const insertedMsgs = [];
  const batchEnqueued = [];
  const settledCalls = [];
  const ackedDiaryHooks = [];
  let capturedPayload = null;

  const mockDb = {
    getFirstAsync: async (sql) => {
      if (sql.includes('FROM ai_threads')) {
        return {
          id: 'th_bg_sync',
          roleCardId: 'role_bg',
          providerId: 'deepseek',
          modelId: 'deepseek-chat',
          proactive_enabled: 1,
          context_window_n: 20,
          living_state_json: null,
          im_settings_json: JSON.stringify({
            voiceReplyEnabled: false,
            personalization: {
              companionCallName: '阿晴',
              userNickname: '林木',
              replyStyleGear: 'tsundere',
              milestones: [{ id: 'ms1', label: '相识百天', dateKey: '11-14' }],
            },
          }),
        };
      }
      if (sql.includes('FROM ai_role_cards')) {
        return {
          name: '江晴',
          prompt: '{{char}}总把{{user}}的事情记在心上。',
          description: '同桌兼损友',
          sourceJson: null,
        };
      }
      return null;
    },
    runAsync: async () => {},
  };

  const { recoverInterruptedUserReply } = loadTsModule('src/im/services/imBackgroundStreamService.ts', {
    '../../database': { initDatabase: async () => mockDb },
    '../repository/imEpochRepository': {
      imEpochRepository: {
        getOrCreateState: async () => ({
          active_anchor_msg_id: null,
          active_slot_json: '{}',
          active_summary_json: '{}',
        }),
      },
    },
    '../repository/imThreadRepository': {
      getVisibleImMessages: async () => [
        { id: 'u_bg_1', threadId: 'th_bg_sync', role: 'user', content: '我胃有点不舒服', createdAt: userSentIso },
      ],
      getContextMessagesFromAnchor: async () => [],
      peekThreadPendingDiaryHook: async () => '昨天写的胃药提醒日记',
      ackThreadPendingDiaryHook: async (_sp, id) => ackedDiaryHooks.push(id),
      consumeThreadPendingDiaryHook: async () => null,
      insertImMessage: async (_sp, m) => insertedMsgs.push(m),
      updateThreadLivingState: async () => {},
      savePendingPing: async () => {},
      revealPendingMessages: async () => 0,
    },
    '../engine/memoryTurnCoordinator': {
      prepareTurnMemoryContext: async () => ({
        intentProfile: { intent: 'GENERAL', invokeMemoryModel: true },
        slots: [],
        l1Summary: null,
        coreFacts: [{ id: 'cf1', content: '用户胃容易不舒服' }],
        allL2Memories: [{ id: 'ep1', category: 'health', content: '上次喝热粥缓解了', entities: ['热粥'] }],
        recalled: [{ id: 'mem_rec_1', category: 'health', content: '抽屉里有常备铝碳酸镁', entities: ['铝碳酸镁'], triggerKeywords: ['胃药'], score: 0.9 }],
        epochCatalogText: 'health: 热粥, 胃药',
        activeArcNotice: '[承诺台账: 今晚监督对方喝热粥]',
        epochState: {
          active_anchor_msg_id: null,
          active_slot_json: '{}',
          active_summary_json: '{}',
          active_core_facts_json: '[]',
        },
        pendingDiaryHook: null,
      }),
      settlePostReplyMemorySignals: async (params) => {
        settledCalls.push(params);
        return { echoHitIds: ['mem_rec_1'], appliedNoteIds: [], recallRoundRequested: false, recallQuery: null, secondaryRecalledMemories: [] };
      },
    },
    '../engine/epochLockstepCoordinator': {
      epochLockstepCoordinator: {
        evaluateAndAssemble: async () => ({
          activeSlotJson: '{"mood":"worried"}',
          activeSummaryJson: JSON.stringify({ narrative_summary: '前情：聊到加班' }),
          activeCoreFactsJson: JSON.stringify([{ id: 'cf1', content: '用户胃容易不舒服' }]),
          windowMessages: [],
          epochVersion: 2,
          evictedUpToTurn: 5,
          activeAnchorMessageId: null,
          didStepEpoch: false,
        }),
      },
    },
    '../engine/epochCompactionRunner': {
      createImEpochShadowCompactor: () => async () => null,
      syncCommittedEpochL1ToMemoryRepository: async () => {},
    },
    '../../core/memory/memoryExtractionBatcher': {
      MemoryExtractionBatcher: {
        shared: { enqueue: (p) => batchEnqueued.push(p) },
      },
    },
    './imNotificationManager': { scheduleProactivePingAlarm: async () => false },
    './imWakeupGenerationService': {
      isWakeupInFlight: () => false,
      cancelAllWakeupsForSpace: () => {},
    },
    '../../core/llm-transport/secureApiKey': {
      getActiveProviderConfig: async () => ({
        providerId: 'deepseek',
        modelId: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'sk-bg',
      }),
    },
    '../../core/llm-transport/streamClient': {
      streamClient: {
        streamText: async function* (payload) {
          capturedPayload = payload;
          yield '哼，谁让你老不按时吃饭的！快去喝点温水吃胃药。';
        },
      },
    },
    '../heartbeat/globalHeartbeatEngine': {
      GlobalHeartbeatEngine: {
        shared: { isThreadActivelyOpen: () => false, notifyListeners: () => {} },
      },
    },
  });

  const ok = await recoverInterruptedUserReply('normal', 'th_bg_sync', nowTs);
  assert.equal(ok, true);
  assert.ok(capturedPayload, 'Payload should be passed to streamText');

  const systemContent = capturedPayload.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  assert.ok(systemContent.includes('阿晴总把林木的事情记在心上'), 'Personalization macros must be resolved in recovery');
  assert.ok(systemContent.includes('傲娇口嫌'), 'Reply style personalization must apply');
  assert.ok(
    systemContent.includes('当前会话用户已关闭模型语音回复'),
    'voiceReplyEnabled: false must pass through to buildChatPayload'
  );
  assert.ok(systemContent.includes('已知记忆脉络索引'), 'Layer 2 epochCatalogText must be injected');
  assert.ok(systemContent.includes('承诺台账'), 'Layer 4 activeArcNotice must be injected');
  assert.ok(systemContent.includes('前情：聊到加班'), 'Layer 2 epochSummaryJson must be injected');
  assert.ok(systemContent.includes('铝碳酸镁'), 'Recalled memories must be injected');
  assert.ok(systemContent.includes('昨天写的胃药提醒日记'), 'Diary hook must be injected');

  assert.deepEqual(ackedDiaryHooks, ['th_bg_sync']);
  assert.equal(settledCalls.length, 1);
  assert.equal(settledCalls[0].roleCardId, 'role_bg');
  assert.equal(batchEnqueued.length, 1);
  assert.equal(batchEnqueued[0].threadId, 'th_bg_sync');
});

test('IM P2 #14, P2 #18 & P0 #1: useImChatSession structural and telemetry invariants hold', () => {
  const src = fs.readFileSync(path.resolve(root, 'src/im/hooks/useImChatSession.ts'), 'utf8');
  assert.match(src, /const loadGenerationRef = useRef<number>\(0\);/, 'Mount loads must carry monotonic generation guard');
  assert.match(src, /threadSettingsRef\.current = s;\s*setThreadSettings\(s\);/, 'Settings ref must synchronize before role resolution');
  assert.match(src, /const persisted = await persistOptimisticUserMessage\(userMsg\);\s*if \(!persisted\) return;\s*aggregatorRef\.current\?\.push/, 'Text send must persist before pushing to InputAggregator');
  assert.match(src, /followupContinuation:\s*hasSpokenOpening/, 'Round-2 recall must pass followupContinuation flag');
  assert.match(src, /recordFallbackUsageIfMissing\(recordedRound1Usage/, 'Round-1 and Round-2 usage telemetry must track independently');
  assert.match(src, /recordFallbackUsageIfMissing\(recordedRound2Usage/, 'Round-2 usage fallback must record separately');
});
