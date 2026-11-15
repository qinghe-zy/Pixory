const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');

function loadTsModule(relPathFromTests, mocks = {}, cache = new Map()) {
  const fullPath = relPathFromTests.startsWith(root)
    ? relPathFromTests
    : path.resolve(__dirname, relPathFromTests);

  if (cache.has(fullPath)) {
    return cache.get(fullPath).exports;
  }

  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: fullPath,
  }).outputText;

  const mod = { exports: {} };
  cache.set(fullPath, mod);

  const customRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(mocks, specifier)) {
      return mocks[specifier];
    }
    for (const [key, val] of Object.entries(mocks)) {
      if (key.startsWith('*') && specifier.endsWith(key.slice(1))) {
        return val;
      }
    }
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(fullPath), specifier);
      const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return loadTsModule(candidate, mocks, cache);
        }
      }
    }
    return require(specifier);
  };

  new Function('module', 'exports', 'require', '__filename', '__dirname', transpiled)(
    mod,
    mod.exports,
    customRequire,
    fullPath,
    path.dirname(fullPath)
  );
  return mod.exports;
}

function createSerializedMemoryDb(sqliteSerMod) {
  const syncDb = new DatabaseSync(':memory:');
  const normalizeParams = (params) => {
    if (params.length === 1 && Array.isArray(params[0])) return params[0];
    return params;
  };
  const rawDb = {
    async execAsync(sql) {
      syncDb.exec(sql);
    },
    async runAsync(sql, ...params) {
      return syncDb.prepare(sql).run(...normalizeParams(params));
    },
    async getFirstAsync(sql, ...params) {
      return syncDb.prepare(sql).get(...normalizeParams(params)) ?? null;
    },
    async getAllAsync(sql, ...params) {
      return syncDb.prepare(sql).all(...normalizeParams(params));
    },
    async withTransactionAsync(fn) {
      syncDb.exec('BEGIN IMMEDIATE');
      try {
        await fn();
        syncDb.exec('COMMIT');
      } catch (err) {
        try {
          syncDb.exec('ROLLBACK');
        } catch {}
        throw err;
      }
    },
  };
  const serialized = sqliteSerMod.serializeSqliteDatabase(rawDb, {
    busyTimeoutMs: 5000,
    isTransactionActive: () => syncDb.isTransaction,
  });
  return { db: serialized, syncDb };
}

test('Block 1C (IM P1 #13): handleImAlarmHeadless strictly stays in normal space, delegates revealPendingMessages safely without unscoped tx warnings', async () => {
  const sqliteSerMod = loadTsModule('../src/database/sqliteSerialization.ts');
  const { db, syncDb } = createSerializedMemoryDb(sqliteSerMod);

  syncDb.exec(`
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY,
      space TEXT NOT NULL,
      roleCardId TEXT,
      title TEXT NOT NULL,
      chat_mode TEXT DEFAULT 'companion_im',
      lastMessagePreview TEXT,
      isPinned INTEGER DEFAULT 0,
      im_is_folded INTEGER DEFAULT 0,
      im_hidden_from_list INTEGER DEFAULT 0,
      living_state_json TEXT,
      consecutive_unreplied_count INTEGER DEFAULT 0,
      im_unread_count INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY,
      threadId TEXT NOT NULL,
      burst_group_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      delivery_status TEXT,
      visible_at INTEGER,
      createdAt TEXT NOT NULL
    );
  `);

  const now = Date.now();
  const threadId = 'th_alarm_1';
  const olderVisibleAt = now - 60_000;
  const userMsgAt = now - 30_000;
  const dueVisibleAt = now - 5_000;
  const expiredVisibleAt = now - 13 * 3600 * 1000;

  syncDb
    .prepare(
      `INSERT INTO ai_threads (id, space, title, createdAt, updatedAt, living_state_json)
       VALUES (?, 'normal', '星织', ?, ?, ?)`
    )
    .run(
      threadId,
      new Date(now - 24 * 3600 * 1000).toISOString(),
      new Date(userMsgAt).toISOString(),
      JSON.stringify({ activityLoad: 'free', deviceAccess: 'reachable' })
    );

  // 用户在 olderVisibleAt 之后已经发了新消息 -> olderVisibleAt 的旧预埋气泡应被 cancelled_by_user
  syncDb
    .prepare(
      `INSERT INTO ai_messages (id, threadId, role, content, status, delivery_status, visible_at, createdAt)
       VALUES (?, ?, 'user', '我先睡觉啦', 'completed', 'delivered', ?, ?)`
    )
    .run('m_user', threadId, userMsgAt, new Date(userMsgAt).toISOString());

  syncDb
    .prepare(
      `INSERT INTO ai_messages (id, threadId, role, content, status, delivery_status, visible_at, createdAt)
       VALUES (?, ?, 'assistant', '刚才在干嘛呀', 'completed', 'staged', ?, ?)`
    )
    .run('m_overtaken', threadId, olderVisibleAt, new Date(olderVisibleAt).toISOString());

  // 有效到期预埋气泡（带 STATUS 协议标签，应在预览中被清洗）
  syncDb
    .prepare(
      `INSERT INTO ai_messages (id, threadId, role, content, status, delivery_status, visible_at, createdAt)
       VALUES (?, ?, 'assistant', '夜深了记得盖好被子哦[STATUS: 准备休息 | load=free]', 'completed', 'staged', ?, ?)`
    )
    .run('m_due', threadId, dueVisibleAt, new Date(userMsgAt + 1000).toISOString());

  // 第二会话：无后续用户打断、但超时 13 小时的陈旧气泡 -> expired_ttl
  const expiredThreadId = 'th_alarm_expired';
  syncDb
    .prepare(
      `INSERT INTO ai_threads (id, space, title, createdAt, updatedAt, living_state_json)
       VALUES (?, 'normal', '辰星', ?, ?, ?)`
    )
    .run(
      expiredThreadId,
      new Date(now - 24 * 3600 * 1000).toISOString(),
      new Date(expiredVisibleAt).toISOString(),
      JSON.stringify({ activityLoad: 'free', deviceAccess: 'reachable' })
    );
  syncDb
    .prepare(
      `INSERT INTO ai_messages (id, threadId, role, content, status, delivery_status, visible_at, createdAt)
       VALUES (?, ?, 'assistant', '午安呀', 'completed', 'staged', ?, ?)`
    )
    .run('m_expired', expiredThreadId, expiredVisibleAt, new Date(expiredVisibleAt).toISOString());

  const initDbSpaces = [];
  const notifications = [];
  const listenerEvents = [];
  const cache = new Map();

  const mockDatabaseModule = {
    initDatabase: async (space) => {
      initDbSpaces.push(space);
      if (space === 'personal') {
        throw new Error('FORBIDDEN: headless alarm touched personal space');
      }
      return db;
    },
    withScopedTransaction: sqliteSerMod.withScopedTransaction,
  };

  const mockRn = {
    Platform: { OS: 'android', Version: 33 },
    PermissionsAndroid: { check: async () => true, request: async () => true, RESULTS: { GRANTED: 'granted' } },
    Linking: { openSettings: () => {} },
    AppState: { addEventListener: () => ({ remove: () => {} }) },
  };

  const mockMedia = {
    scheduleDiaryAlarm: async () => 'exact',
    cancelDiaryAlarm: async () => true,
    postCompanionNotification: async (tId, title, body) => {
      notifications.push({ tId, title, body });
      return true;
    },
    cancelCompanionNotification: async () => true,
  };

  const mockSettings = {
    settingsRepository: {
      getNotificationSettings: async () => ({
        enabled: true,
        showContent: true,
        showAvatar: true,
        dndEnabled: false,
        dndStart: '23:00',
        dndEnd: '08:00',
        vibrationEnabled: true,
      }),
    },
  };

  const sharedMocks = {
    'react-native': mockRn,
    '../../native/pixoryMediaModule': mockMedia,
    '../../database/index': mockDatabaseModule,
    '../../database': mockDatabaseModule,
    '../../database/repositories/settingsRepository': mockSettings,
    '../../utils/formatMessagePreview': {
      formatMessagePreview: (text, fallback = '') =>
        String(text || '').replace(/\[STATUS:[^\]]+\]/g, '').trim() || fallback,
    },
    '../utils/formatImPreviewText': {
      formatImPreviewText: (text, fallback = '') =>
        String(text || '').replace(/\[STATUS:[^\]]+\]/g, '').trim() || fallback,
    },
  };

  const { GlobalHeartbeatEngine } = loadTsModule(
    '../src/im/heartbeat/globalHeartbeatEngine.ts',
    sharedMocks,
    cache
  );
  const { handleImAlarmHeadless } = loadTsModule(
    '../src/im/services/imNotificationManager.ts',
    sharedMocks,
    cache
  );

  const unsub = GlobalHeartbeatEngine.shared.subscribe((tId, sp) => {
    listenerEvents.push({ tId, sp });
  });

  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    await handleImAlarmHeadless(`im_staged_${threadId}`);
    await handleImAlarmHeadless(`im_staged_${expiredThreadId}`);
  } finally {
    console.warn = origWarn;
    unsub();
  }

  assert.ok(
    initDbSpaces.every((s) => s === 'normal'),
    'Headless alarm must only ever access normal space'
  );
  assert.equal(
    warnings.filter((w) => w.includes('Unscoped mutating SQL')).length,
    0,
    'Reveal transaction must use withScopedTransaction with zero unscoped warnings'
  );

  const msgOvertaken = syncDb.prepare('SELECT delivery_status FROM ai_messages WHERE id = ?').get('m_overtaken');
  const msgExpired = syncDb.prepare('SELECT delivery_status FROM ai_messages WHERE id = ?').get('m_expired');
  const msgDue = syncDb.prepare('SELECT delivery_status, status, createdAt FROM ai_messages WHERE id = ?').get('m_due');
  assert.equal(msgOvertaken.delivery_status, 'cancelled_by_user', 'Overtaken staged msg must be cancelled_by_user');
  assert.equal(msgExpired.delivery_status, 'expired_ttl', 'Stale staged msg > 12h must expire_ttl');
  assert.equal(msgDue.delivery_status, 'delivered');
  assert.equal(msgDue.status, 'completed');
  assert.equal(
    msgDue.createdAt,
    new Date(dueVisibleAt).toISOString(),
    'Delivered staged message createdAt must align to visible_at'
  );

  const threadRow = syncDb
    .prepare('SELECT consecutive_unreplied_count, im_unread_count, lastMessagePreview FROM ai_threads WHERE id = ?')
    .get(threadId);
  assert.equal(threadRow.consecutive_unreplied_count, 1);
  assert.equal(threadRow.im_unread_count, 1);
  assert.equal(threadRow.lastMessagePreview, '夜深了记得盖好被子哦');

  assert.equal(listenerEvents.length, 1);
  assert.deepEqual(listenerEvents[0], { tId: threadId, sp: 'normal' });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, '星织');
  assert.equal(notifications[0].body, '夜深了记得盖好被子哦');
});

test('Block 1C (IM P1 #13): GlobalHeartbeatEngine queues pendingRescan if personal unlock happens during active scan', async () => {
  const scannedSpaces = [];
  let releaseNormalScan;
  const normalScanGate = new Promise((resolve) => {
    releaseNormalScan = resolve;
  });

  const { GlobalHeartbeatEngine } = loadTsModule('../src/im/heartbeat/globalHeartbeatEngine.ts', {
    'react-native': { AppState: { addEventListener: () => ({ remove: () => {} }) } },
    '../repository/imThreadRepository': {
      getActiveStagedThreadIds: async (space) => {
        scannedSpaces.push(space);
        if (space === 'normal' && scannedSpaces.length === 1) {
          await normalScanGate;
        }
        return [];
      },
      revealPendingMessages: async () => 0,
      getThreadLivingState: async () => null,
      getDuePendingPings: async () => [],
    },
  });

  // 1. 先开始扫描（锁定时只扫 normal），在其未结束时解锁 personal
  const firstScan = GlobalHeartbeatEngine.shared.scanAndReveal();
  await Promise.resolve();
  GlobalHeartbeatEngine.shared.setPersonalSpaceUnlocked(true);

  // 2. 放行第一次扫描，等待排队触发的第二轮补扫完成
  releaseNormalScan();
  await firstScan;
  await new Promise((r) => setTimeout(r, 20));

  assert.ok(
    scannedSpaces.includes('personal'),
    'Unlocking personal space mid-scan must schedule follow-up scan covering personal space'
  );

  // Reset singleton state
  GlobalHeartbeatEngine.shared.setPersonalSpaceUnlocked(false);
  await new Promise((r) => setTimeout(r, 10));
});

test('Block 1C (IM P2 #16): getActiveProviderConfig resets preferredModelId across fallback provider and marks didFallbackProvider', async () => {
  const providers = {
    'deepseek-empty': {
      id: 'deepseek-empty',
      baseUrl: 'https://api.deepseek.com',
      protocol: 'openai_compatible',
      defaultChatModelId: 'deepseek-chat',
    },
    'openai-backup': {
      id: 'openai-backup',
      baseUrl: 'https://api.openai.com/v1',
      protocol: 'openai_compatible',
      defaultChatModelId: 'gpt-4o-mini',
    },
    'anthropic-no-default': {
      id: 'anthropic-no-default',
      baseUrl: 'https://api.anthropic.com',
      protocol: 'anthropic',
      defaultChatModelId: null,
    },
  };

  const makeModule = (activeList, keys) =>
    loadTsModule('../src/core/llm-transport/secureApiKey.ts', {
      'expo-secure-store': {
        getItemAsync: async (key) => {
          for (const [pid, val] of Object.entries(keys)) {
            if (key.includes(pid)) return val;
          }
          return null;
        },
      },
      '../../database/index': {
        initDatabase: async () => ({
          getFirstAsync: async (sql, params) => {
            if (sql.includes('FROM ai_providers')) {
              const id = Array.isArray(params) ? params[0] : params;
              return providers[id] || null;
            }
            if (sql.includes('FROM ai_provider_models')) {
              const pid = Array.isArray(params) ? params[0] : params;
              if (pid === 'anthropic-no-default' && sql.includes('supportsChat = 1')) {
                return { modelId: 'claude-3-5-sonnet-20241022', supportsThinking: 1 };
              }
              return null;
            }
            return null;
          },
          getAllAsync: async () => activeList,
        }),
      },
      '../../database/repositories/settingsRepository': {
        settingsRepository: {
          getAiPromptCacheSettings: async () => ({ enabled: true, disabledProviderIds: [] }),
          getDefaultAiProviderId: async () => null,
        },
      },
    });

  // 场景 A: 首选无 Key，回退到有 defaultChatModelId 的 OpenAI 备选
  const modA = makeModule([providers['deepseek-empty'], providers['openai-backup']], {
    'openai-backup': 'sk-openai-valid',
  });
  const cfgA = await modA.getActiveProviderConfig('normal', 'deepseek-empty', 'deepseek-chat');
  assert.equal(cfgA.providerId, 'openai-backup');
  assert.equal(cfgA.didFallbackProvider, true);
  assert.equal(
    cfgA.modelId,
    'gpt-4o-mini',
    'Cross-provider fallback must NOT leak preferredModelId (deepseek-chat) onto openai-backup'
  );

  // 场景 B: 首选无 Key，回退到无 defaultChatModelId 但有 ai_provider_models 的 Anthropic
  const modB = makeModule([providers['anthropic-no-default']], {
    'anthropic-no-default': 'sk-ant-valid',
  });
  const cfgB = await modB.getActiveProviderConfig('normal', 'deepseek-empty', 'deepseek-chat');
  assert.equal(cfgB.providerId, 'anthropic-no-default');
  assert.equal(cfgB.didFallbackProvider, true);
  assert.equal(cfgB.modelId, 'claude-3-5-sonnet-20241022');
  assert.equal(cfgB.supportsThinking, true);

  // 场景 C: 首选命中自己 -> 保留 preferredModelId 且 didFallbackProvider === false
  const modC = makeModule([providers['openai-backup']], {
    'openai-backup': 'sk-openai-valid',
  });
  const cfgC = await modC.getActiveProviderConfig('normal', 'openai-backup', 'gpt-4.1');
  assert.equal(cfgC.providerId, 'openai-backup');
  assert.equal(cfgC.didFallbackProvider, false);
  assert.equal(cfgC.modelId, 'gpt-4.1');
});

test('Block 1C (IM P2 #17): diary generator unwraps voice/drops thought & raw JSON, strips internal tags, and harvester deduplicates L2 memories >= 0.78', async () => {
  const { selectDiaryDialogue } = loadTsModule('../src/im/diary/engine/diaryDayWindow.ts');
  const dayDialogue = selectDiaryDialogue([
    { role: 'assistant', type: 'thought', content: '其实我有点紧张，但不能表现出来' },
    {
      role: 'assistant',
      type: 'text',
      content: '<think>先检查记忆</think>早上好呀[BR][MEMORY_RECALL: coffee][MEMORY_NOTE: likes latte][VOICE: 温柔 | 早安，快起床]',
    },
    { role: 'user', type: 'text', content: '早安！今天喝拿铁了' },
  ]);
  assert.ok(!dayDialogue.includes('其实我有点紧张'), 'thought bubble must be excluded');
  assert.ok(!dayDialogue.includes('先检查记忆'), '<think> must be stripped');
  assert.ok(!dayDialogue.includes('[MEMORY_RECALL'), '[MEMORY_RECALL] must be stripped');
  assert.ok(!dayDialogue.includes('[MEMORY_NOTE'), '[MEMORY_NOTE] must be stripped');
  assert.ok(!dayDialogue.includes('[VOICE:'), '[VOICE:] must be stripped');
  assert.ok(!dayDialogue.includes('[BR]'), '[BR] must be stripped');
  assert.ok(dayDialogue.includes('早上好呀'));
  assert.ok(dayDialogue.includes('早安！今天喝拿铁了'));

  // 全链路验证 imDiaryGenerator 对 DB 中的 voice / thought / unknown JSON 信封解码
  let capturedPrompt = '';
  const nowIso = '2026-11-14T12:00:00.000Z';
  const genDb = {
    getFirstAsync: async (sql) => {
      if (sql.includes('COUNT(id)')) return { count: 1 };
      if (sql.includes('FROM ai_threads')) return { providerId: 'p1', modelId: 'm1', living_state_json: null };
      return null;
    },
    getAllAsync: async () => [
      { role: 'user', content: '想听你的声音', createdAt: nowIso },
      {
        role: 'assistant',
        content: JSON.stringify({ type: 'thought', content: ' secretly happy inner thought ' }),
        createdAt: nowIso,
      },
      {
        role: 'assistant',
        content: JSON.stringify({ type: 'voice', audioUri: 'file://v1.m4a', durationMs: 3200, transcription: '晚安啦，早点盖被子' }),
        createdAt: nowIso,
      },
      {
        role: 'assistant',
        content: JSON.stringify({ type: 'internal_probe', secretPayload: 'should_never_leak' }),
        createdAt: nowIso,
      },
    ],
  };

  const genMod = loadTsModule('../src/im/diary/engine/imDiaryGenerator.ts', {
    '../../../database': { initDatabase: async () => genDb },
    '../../../core/llm-transport/streamClient': {
      streamClient: {
        streamText: async function* (messages) {
          capturedPrompt = messages[0].content;
          yield '[THEME: sage][MOOD: 安心][WEATHER: 晴]\n<Diary_Content>今天听见你的声音很开心，晚风也很温柔。</Diary_Content>';
        },
      },
    },
    '../../../core/llm-transport/secureApiKey': {
      getActiveProviderConfig: async () => ({
        providerId: 'p1',
        modelId: 'm1',
        baseUrl: 'https://api.deepseek.com',
        protocol: 'openai_compatible',
        apiKey: 'sk-test',
        promptCacheEnabled: false,
      }),
    },
    '../repository/imDiaryRepository': {
      saveCompanionDiary: async () => {},
      getCompanionDiaryByDate: async () => null,
    },
    './diaryMemoryHarvester': {
      harvestDiaryMemoryToL2: async () => ({ factsCreated: 0, episodesCreated: 0, hookStored: null }),
    },
    '../../../core/memory/memoryMetabolismService': { runDailyMemoryMetabolism: async () => {} },
    '../../repository/imThreadRepository': { insertImMessage: async () => {} },
  });

  await genMod.generateCompanionDailyDiary({
    space: 'normal',
    threadId: 'th_diary_1',
    roleCardId: 'rc_1',
    roleName: '星织',
    targetDateStr: '2026-11-14',
    forceRewrite: true,
  });

  assert.ok(capturedPrompt.includes('[语音] 晚安啦，早点盖被子'), 'voice JSON should unwrap transcription cleanly');
  assert.ok(!capturedPrompt.includes('secretly happy inner thought'), 'thought JSON must never leak into diary prompt');
  assert.ok(!capturedPrompt.includes('should_never_leak'), 'opaque unknown JSON must never leak into diary prompt');
  assert.ok(!capturedPrompt.includes('{"type":'), 'raw JSON braces must not leak into diary prompt');

  // 验证 diaryMemoryHarvester 使用 calculateMemorySimilarity >= 0.78 去重合并
  const saved = [];
  const updated = [];
  const existingL2 = [
    {
      id: 'mem_existing_fact',
      roleCardId: 'rc_1',
      space: 'normal',
      tier: 'L2_FACT',
      content: '用户偏好: 喜欢喝冰美式和乌龙茶',
    },
    {
      id: 'mem_existing_ep',
      roleCardId: 'rc_1',
      space: 'normal',
      tier: 'L2_EPISODE',
      content: '2026-11-14 手账纪事: 今天一起去植物园散步还喝了桂花乌龙茶',
    },
  ];
  const sieveMod = loadTsModule('../src/core/memory/memorySieveGatekeeper.ts');
  const harvesterMod = loadTsModule('../src/im/diary/engine/diaryMemoryHarvester.ts', {
    '../../../core/memory/memorySieveGatekeeper': sieveMod,
    '../../../core/memory/memoryRepository': {
      memoryRepository: {
        listMemories: async () => [...existingL2],
        saveMemory: async (rec) => {
          saved.push(rec);
        },
        updateMemoryContent: async (_sp, id, newContent) => {
          updated.push({ id, newContent });
        },
      },
    },
    '../../repository/imThreadRepository': { setThreadPendingDiaryHook: async () => {} },
    '../../../core/memory/memoryPrefetchService': { invalidateRoleMemoryPrefetch: () => {} },
    '../../../core/memory/memoryMetabolismService': { compileEntityKnowledgeCluster: async () => {} },
    '../../../database/index': { initDatabase: async () => ({}) },
  });

  const harvestRes = await harvesterMod.harvestDiaryMemoryToL2({
    space: 'normal',
    threadId: 'th_diary_1',
    roleCardId: 'rc_1',
    diaryDate: '2026-11-14',
    metadata: {
      summary: '今天一起去植物园散步还喝了桂花乌龙茶',
      userPreferences: [
        '喜欢喝冰美式和乌龙茶，晚上不喝', // 相似度 >= 0.78 且明显更长 -> updateMemoryContent 合并
        '周末清晨喜欢沿着湖边慢跑',
        '周末早晨喜欢沿着湖边慢跑', // 批内高度相似 -> 去重跳过
      ],
      keyEntities: ['植物园'],
      hooks: ['明天去借那本植物图鉴'],
    },
  });

  assert.equal(harvestRes.episodesCreated, 0, 'Duplicate episode summary >= 0.78 must not insert duplicate');
  assert.equal(harvestRes.factsCreated, 1, 'Similar existing pref should merge & intra-batch dup should skip, leaving 1 new fact');
  assert.equal(saved.length, 1);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, 'mem_existing_fact');
  assert.ok(updated[0].newContent.includes('晚上不喝'));
});
