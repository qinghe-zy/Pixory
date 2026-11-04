const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.tsx') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.tsx')) targetPath += '.tsx';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadModule(path.join(path.dirname(targetPath), reqPath), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

test('LivingState Seed: 首次建联与过期自动生成超过跑马灯阈值的灵动状态文案', () => {
  const {
    buildDefaultLivingState,
    shouldSeedOrRefreshLivingState,
  } = loadModule('../src/im/engine/imProactiveFallbackPlanner.ts');

  const eveningTs = new Date('2026-10-28T20:15:00').getTime();
  assert.equal(shouldSeedOrRefreshLivingState(null, eveningTs), true);

  const state = buildDefaultLivingState(eveningTs);
  assert.ok(state.statusText.length >= 16, `状态文案应足够丰富以驱动跑马灯: ${state.statusText}`);
  assert.equal(state.activityLoad, 'free');
  assert.equal(shouldSeedOrRefreshLivingState(state, eveningTs + 5 * 60 * 1000), false);
  assert.equal(shouldSeedOrRefreshLivingState(state, state.validUntil + 3 * 3600 * 1000 + 1000), true);

  // 验证 24 小时全时段状态文案均为世界观中立、无现代特定道具泄露 (如美式/耳机/手机/屏幕)，且长度均 >= 16
  const FORBIDDEN_MODERN_PROPS = ['美式', '咖啡', '耳机', '手机', '屏幕', '大灯'];
  for (let h = 0; h < 24; h++) {
    const testTs = new Date(2026, 9, 28, h, 30, 0).getTime();
    const hourlyState = buildDefaultLivingState(testTs);
    assert.ok(hourlyState.statusText.length >= 16, `Hour ${h} statusText must be >= 16 chars: ${hourlyState.statusText}`);
    for (const prop of FORBIDDEN_MODERN_PROPS) {
      assert.ok(!hourlyState.statusText.includes(prop), `Hour ${h} must not contain '${prop}': ${hourlyState.statusText}`);
    }
  }
});

test('Fallback Proactive Planner: 模型漏写 [PING] 时自动按情境+退避+作息生成兜底闹钟', () => {
  const { planFallbackProactivePing } = loadModule('../src/im/engine/imProactiveFallbackPlanner.ts');

  // 1. 常规晚间聊天 (19:30, unreplied=0) -> Tier 1 温情主动关心时间窗 (15m ~ 120m)
  const now1930 = new Date('2026-10-28T19:30:00').getTime();
  const plan1 = planFallbackProactivePing({
    consecutiveUnreplied: 0,
    lastUserInteractionAt: now1930,
    lastUserText: '刚吃完晚饭在散步',
    now: now1930,
  });
  assert.ok(plan1, '必须生成兜底主动闹钟');
  assert.ok(
    plan1.targetTimestamp >= now1930 + 15 * 60 * 1000 &&
      plan1.targetTimestamp <= now1930 + 120 * 60 * 1000,
    'Tier 1 兜底主动闹钟应落在合理日常窗口内'
  );

  // 2. 情境化表达“我去洗澡啦” -> 自动识别洗澡情境关心意图
  const bathPlan = planFallbackProactivePing({
    consecutiveUnreplied: 0,
    lastUserInteractionAt: now1930,
    lastUserText: '先不聊啦我去洗澡了',
    now: now1930,
  });
  assert.ok(bathPlan);
  assert.ok(bathPlan.intent.includes('洗完澡'));

  // 3. 深夜 23:20 触发 -> 目标落入睡眠免打扰窗，自动钳位至次晨 07:35 ~ 08:15 早安问候
  const late2320 = new Date('2026-10-28T23:20:00').getTime();
  const clampedPlan = planFallbackProactivePing({
    consecutiveUnreplied: 0,
    lastUserInteractionAt: late2320,
    lastUserText: '准备躺下啦',
    now: late2320,
  });
  assert.ok(clampedPlan);
  const clampedDate = new Date(clampedPlan.targetTimestamp);
  assert.ok(clampedDate.getHours() === 7 || clampedDate.getHours() === 8);
  assert.ok(clampedPlan.intent.includes('早安'));

  // 4. 连续 3 次未回 -> 在 72h 内依然保持心跳早晚问候，绝不静默断连
  const continuedPlan = planFallbackProactivePing({
    consecutiveUnreplied: 3,
    lastUserInteractionAt: now1930,
    now: now1930,
  });
  assert.ok(continuedPlan);

  // 5. 超过 72 小时无互动 -> 终极休眠
  const stoppedPlan = planFallbackProactivePing({
    consecutiveUnreplied: 0,
    lastUserInteractionAt: now1930 - 73 * 3600 * 1000,
    now: now1930,
  });
  assert.equal(stoppedPlan, null);
});

test('Wakeup Generation: 完整透传 baseUrl/apiKey + 注入五层记忆 + 无通知权限静默落库与未读红点', async () => {
  let capturedPayload = null;
  let capturedTransportConfig = null;
  let updatedUnreadSqlParams = null;
  let savedNextPing = null;
  const insertedMsgs = [];

  const nowTs = new Date('2026-10-28T16:00:00').getTime();

  const mockDb = {
    getFirstAsync: async (sql) => {
      if (sql.includes('FROM ai_threads')) {
        return {
          id: 'th_silent_1',
          roleCardId: 'role_companion_1',
          providerId: 'custom_provider',
          modelId: 'deepseek-chat-v3',
          proactive_enabled: 1,
          context_window_n: 20,
          living_state_json: null,
          consecutive_unreplied_count: 0,
          last_user_interaction_at: nowTs - 30 * 60 * 1000,
        };
      }
      if (sql.includes('FROM ai_role_cards')) {
        return {
          name: '林夏',
          prompt: '你是林夏，温柔细腻的插画师。',
          description: null,
          sourceJson: null,
        };
      }
      return null;
    },
    runAsync: async (sql, params) => {
      if (sql.includes('im_unread_count')) {
        updatedUnreadSqlParams = params;
      }
    },
  };

  const mockRepo = {
    getPendingPing: async () => ({
      pendingPingAt: nowTs - 5000,
      intent: '问问下午茶喝了没',
      retryCount: 0,
    }),
    clearPendingPing: async () => {},
    savePendingPing: async (_space, _tid, ts, intent) => {
      savedNextPing = { ts, intent };
    },
    postponePendingPing: async () => {},
    getContextMessagesFromAnchor: async () => [
      { id: 'm1', threadId: 'th_silent_1', role: 'user', content: '下午好困呀', createdAt: new Date(nowTs - 1800000).toISOString() },
      { id: 'm2', threadId: 'th_silent_1', role: 'assistant', content: '去买杯冰美式提提神吧~', createdAt: new Date(nowTs - 1790000).toISOString() },
    ],
    getVisibleImMessages: async () => [],
    consumeThreadPendingDiaryHook: async () => '昨天答应给他画一张速写头像',
    insertImMessage: async (_space, msg) => {
      insertedMsgs.push(msg);
    },
    updateThreadLivingState: async () => {},
  };

  const { executeWakeupGeneration } = loadModule('../src/im/services/imWakeupGenerationService.ts', {
    '../../database': { initDatabase: async () => mockDb },
    '../repository/imThreadRepository': mockRepo,
    '../repository/imEpochRepository': {
      imEpochRepository: {
        getOrCreateState: async () => ({
          active_anchor_msg_id: 'm1',
          active_slot_json: '{}',
          active_summary_json: '{}',
        }),
      },
    },
    '../../core/memory/memoryRepository': {
      memoryRepository: {
        listMemories: async (_rid, _sp, tier) => {
          if (tier === 'L1_SLOT') return [{ id: 's1', category: '昵称', content: '阿泽' }];
          return [];
        },
        listCoreProfileFacts: async () => [
          { id: 'f1', category: 'allergy_taboo', content: '用户对芒果严重过敏', importance: 9, isPinned: true },
        ],
      },
    },
    '../../core/memory/zeroVectorRetriever': {
      retrieveRelevantMemories: async () => [
        { id: 'r1', content: '用户下午常点无糖冰美式', finalScore: 0.9 },
      ],
    },
    './imNotificationManager': { scheduleProactivePingAlarm: async () => {} },
    '../../core/llm-transport/secureApiKey': {
      getActiveProviderConfig: async (_sp, pId, mId) => ({
        providerId: pId,
        modelId: mId,
        baseUrl: 'https://custom-gateway.example.com/v1',
        apiKey: 'sk-real-secret-key',
      }),
    },
    '../../core/llm-transport/streamClient': {
      streamClient: {
        streamText: async function* (payload, cfg) {
          capturedPayload = payload;
          capturedTransportConfig = cfg;
          yield '阿泽，下午茶点了吗？[BR]记得别点芒果冰沙哦~[STATUS: 窝在画室窗边修线稿，手边放着温热的伯爵红茶 | load=free]';
        },
      },
    },
    '../heartbeat/globalHeartbeatEngine': {
      GlobalHeartbeatEngine: {
        shared: {
          isThreadActivelyOpen: () => false, // 模拟在后台或未打开聊天页（无通知权限静默生成）
          notifyListeners: () => {},
        },
      },
    },
  });

  const ok = await executeWakeupGeneration('normal', 'th_silent_1', { isHeadless: false, now: nowTs });
  assert.equal(ok, true);

  // 1. 验证 baseUrl 与 apiKey 100% 透传（彻底根治 HTTP 401）
  assert.equal(capturedTransportConfig.baseUrl, 'https://custom-gateway.example.com/v1');
  assert.equal(capturedTransportConfig.apiKey, 'sk-real-secret-key');
  assert.equal(capturedTransportConfig.providerId, 'custom_provider');
  assert.equal(capturedTransportConfig.modelId, 'deepseek-chat-v3');

  // 2. 验证五层记忆完整注入唤醒请求
  const fullSystemTexts = capturedPayload.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  assert.ok(fullSystemTexts.includes('阿泽'), 'Layer 2 L1_SLOT 未被空 {} 遮蔽');
  assert.ok(fullSystemTexts.includes('用户对芒果严重过敏'), 'Layer 2 常驻核心事实注入成功');
  assert.ok(fullSystemTexts.includes('用户下午常点无糖冰美式'), 'Layer 4 唤醒意图关联记忆注入成功');
  assert.ok(fullSystemTexts.includes('昨天答应给他画一张速写头像'), 'Layer 4 昨日手账钩子注入成功');

  // 3. 验证无通知权限时静默落库 2 条气泡、累加 2 条未读红点并自动接力下一阶梯退避闹钟
  assert.equal(insertedMsgs.length, 2);
  assert.deepEqual(updatedUnreadSqlParams.slice(0, 2), [1, 2]); // consecutive_unreplied=1, unreadDelta=2
  assert.ok(savedNextPing, '唤醒完成后即使模型未写 [PING] 也必须自动挂载下一阶梯退避闹钟');
});

test('Foreground Catch-Up: 白天闹钟被系统杀后台错过后，深夜打开 App 仍立即静默补发而非推迟明早', async () => {
  const insertedMsgs = [];
  const daytimeAlarm = new Date('2026-10-28T15:00:00').getTime();
  const reopenLateNight = new Date('2026-10-28T23:50:00').getTime();

  const mockDb = {
    getFirstAsync: async () => ({
      id: 'th_catchup',
      roleCardId: null,
      proactive_enabled: 1,
      context_window_n: 20,
      living_state_json: null,
      consecutive_unreplied_count: 0,
      last_user_interaction_at: daytimeAlarm - 3600000,
    }),
    runAsync: async () => {},
  };

  const { executeWakeupGeneration } = loadModule('../src/im/services/imWakeupGenerationService.ts', {
    '../../database': { initDatabase: async () => mockDb },
    '../repository/imThreadRepository': {
      getPendingPing: async () => ({ pendingPingAt: daytimeAlarm, intent: '下午问候', retryCount: 0 }),
      clearPendingPing: async () => {},
      savePendingPing: async () => {},
      postponePendingPing: async () => {
        throw new Error('不应将白天错过的闹钟推迟到次晨');
      },
      getVisibleImMessages: async () => [],
      insertImMessage: async (_sp, msg) => insertedMsgs.push(msg),
      updateThreadLivingState: async () => {},
    },
    './imNotificationManager': { scheduleProactivePingAlarm: async () => {} },
    '../../core/llm-transport/secureApiKey': {
      getActiveProviderConfig: async () => ({
        providerId: 'openai',
        modelId: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
      }),
    },
    '../../core/llm-transport/streamClient': {
      streamClient: {
        streamText: async function* () {
          yield '下午忙完啦？一直记挂着你呢~';
        },
      },
    },
    '../heartbeat/globalHeartbeatEngine': {
      GlobalHeartbeatEngine: {
        shared: { isThreadActivelyOpen: () => false, notifyListeners: () => {} },
      },
    },
  });

  const ok = await executeWakeupGeneration('normal', 'th_catchup', {
    isHeadless: false,
    now: reopenLateNight,
  });
  assert.equal(ok, true);
  assert.equal(insertedMsgs.length, 1);
});

test('Killed-App Recovery: 用户发完消息被杀后台未生成回复时，下次启动静默补回并累加未读红点', async () => {
  const insertedMsgs = [];
  let unreadAdded = 0;
  const nowTs = new Date('2026-10-28T18:30:00').getTime();
  const userSentIso = new Date(nowTs - 60000).toISOString();

  const mockDb = {
    getFirstAsync: async () => ({
      id: 'th_interrupted',
      roleCardId: null,
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      proactive_enabled: 1,
      context_window_n: 20,
      living_state_json: null,
    }),
    runAsync: async (sql, params) => {
      if (sql.includes('im_unread_count')) {
        unreadAdded = params[0];
      }
    },
  };

  const { recoverInterruptedUserReply } = loadModule('../src/im/services/imBackgroundStreamService.ts', {
    '../../database': { initDatabase: async () => mockDb },
    '../repository/imThreadRepository': {
      getVisibleImMessages: async () => [
        { id: 'u2', threadId: 'th_interrupted', role: 'user', content: '今晚吃火锅还是烤肉？', createdAt: userSentIso },
      ],
      insertImMessage: async (_sp, m) => insertedMsgs.push(m),
      updateThreadLivingState: async () => {},
      savePendingPing: async () => {},
    },
    './imNotificationManager': { scheduleProactivePingAlarm: async () => {} },
    './imWakeupGenerationService': {
      isWakeupInFlight: () => false,
      resolveCompanionRolePrompt: () => ({ rolePrompt: '你是贴心伴侣', companionName: '苏苏' }),
    },
    '../../core/llm-transport/secureApiKey': {
      getActiveProviderConfig: async () => ({
        providerId: 'deepseek',
        modelId: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'sk-recover',
      }),
    },
    '../../core/llm-transport/streamClient': {
      streamClient: {
        streamText: async function* () {
          yield '天冷当然吃热腾腾的番茄牛油鸳鸯锅啦！[BR]记得点一份虾滑~';
        },
      },
    },
    '../heartbeat/globalHeartbeatEngine': {
      GlobalHeartbeatEngine: {
        shared: { isThreadActivelyOpen: () => false, notifyListeners: () => {} },
      },
    },
  });

  const recovered = await recoverInterruptedUserReply('normal', 'th_interrupted', nowTs);
  assert.equal(recovered, true);
  assert.equal(insertedMsgs.length, 2);
  assert.equal(unreadAdded, 2);
});

test('Audit Guard 1 (Privacy Isolation): 私密空间锁定时严禁后台扫描或唤醒，解锁后瞬时追平', async () => {
  const scannedSpaces = [];
  const { GlobalHeartbeatEngine } = loadModule('../src/im/heartbeat/globalHeartbeatEngine.ts', {
    'react-native': { AppState: { addEventListener: () => ({ remove: () => {} }) } },
    '../repository/imThreadRepository': {
      getActiveStagedThreadIds: async (sp) => {
        scannedSpaces.push(sp);
        return [];
      },
      revealPendingMessages: async () => 0,
      getThreadLivingState: async () => null,
      getDuePendingPings: async () => [],
      getInterruptedUserThreads: async () => [],
    },
  });

  // 默认锁定态：仅扫描 normal，绝不触碰 personal
  assert.equal(GlobalHeartbeatEngine.shared.isPersonalSpaceUnlocked(), false);
  await GlobalHeartbeatEngine.shared.scanAndReveal();
  assert.deepEqual(scannedSpaces, ['normal']);

  // 解锁后：同时扫描 normal 与 personal
  scannedSpaces.length = 0;
  GlobalHeartbeatEngine.shared.setPersonalSpaceUnlocked(true);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(scannedSpaces.includes('personal'), '解锁后必须自动追平扫描 personal 空间');

  // 重新锁定后：再次恢复严格隔离
  await GlobalHeartbeatEngine.shared.suspendPersonalSpace();
  scannedSpaces.length = 0;
  await GlobalHeartbeatEngine.shared.scanAndReveal();
  assert.deepEqual(scannedSpaces, ['normal']);

  // 验证系统级后台闹钟对 personal 空间严格拒止
  let nativeAlarmCalled = false;
  const {
    scheduleStagedMessageAlarm,
    scheduleProactivePingAlarm,
  } = loadModule('../src/im/services/imNotificationManager.ts', {
    'react-native': { Platform: { OS: 'android', Version: 34 }, PermissionsAndroid: {}, Linking: {} },
    '../../native/pixoryMediaModule': {
      scheduleDiaryAlarm: async () => {
        nativeAlarmCalled = true;
        return 'exact';
      },
      cancelDiaryAlarm: async () => true,
    },
    '../../database/index': { initDatabase: async () => ({}) },
  });

  assert.equal(await scheduleStagedMessageAlarm('th_p', Date.now() + 60000, 'personal'), false);
  assert.equal(await scheduleProactivePingAlarm('th_p', Date.now() + 60000, 'personal'), false);
  assert.equal(nativeAlarmCalled, false, '私密空间严禁注册操作系统级后台精准闹钟');
});

test('Audit Guard 2 (Reuse & Preview Hygiene): 统一角色宏解析与列表预览标签剥离', () => {
  const { resolveCompanionRolePrompt } = loadModule('../src/im/engine/imRolePromptResolver.ts');
  const { formatImPreviewText } = loadModule('../src/im/utils/formatImPreviewText.ts');

  const resolved = resolveCompanionRolePrompt(
    {
      name: '林夏',
      prompt: '{{char}}喜欢在傍晚散步，总是惦记{{user}}。',
      description: '美术馆策展助理',
      sourceJson: JSON.stringify({
        data: {
          personality: '细腻敏锐，说话慢条斯理',
          scenario: '{{char}}与{{user}}住在同一条老街',
        },
      }),
    },
    '伴侣'
  );
  assert.equal(resolved.companionName, '林夏');
  assert.ok(resolved.rolePrompt.includes('林夏喜欢在傍晚散步，总是惦记你。'));
  assert.ok(resolved.rolePrompt.includes('【角色身份与外貌】\n美术馆策展助理'));
  assert.ok(resolved.rolePrompt.includes('林夏与你住在同一条老街'));

  assert.equal(
    formatImPreviewText('到家啦[BR]今天晚霞超美[STATUS: 在阳台吹风][PING: +1h | 问吃晚饭没]'),
    '到家啦 今天晚霞超美'
  );
  assert.equal(
    formatImPreviewText('{"type":"image","imageUri":"file:///a.jpg"}'),
    '[图片]'
  );
});

test('Audit Guard 3 (UI/UX/A11y/Context Contracts): 跑马灯无障碍减动效、列表安全头像骨架屏与非污染错误提示', () => {
  const marqueeSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/im/components/common/ImMarqueeText.tsx'),
    'utf8'
  );
  assert.ok(marqueeSrc.includes('useReducedMotion'), 'ImMarqueeText 必须支持系统减弱动态效果无障碍偏好');
  assert.ok(marqueeSrc.includes('no-hide-descendants'), 'ImMarqueeText 必须屏蔽隐藏测量层与重复副本的读屏朗读');

  const threadListSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/im/components/ImThreadList.tsx'),
    'utf8'
  );
  assert.ok(threadListSrc.includes('SecureImage'), 'ImThreadList 必须使用 SecureImage 保护私密空间头像缓存');
  assert.ok(threadListSrc.includes('initialLoading'), 'ImThreadList 必须提供首屏骨架态防止空态闪烁');

  const sessionSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/im/hooks/useImChatSession.ts'),
    'utf8'
  );
  assert.ok(!sessionSrc.includes('网络开小差了，稍后再试一次吧~'), '网络错误严禁伪造 assistant 气泡污染 Layer 3 上下文');
  assert.ok(sessionSrc.includes("type: 'system_notice'"), '网络错误应通过非污染型 system_notice 提示用户');
});
