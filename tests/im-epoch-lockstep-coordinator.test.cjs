const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

function transpileFile(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  return ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

// -------------------------------------------------------------
// 1. 逻辑回合归组器 (TurnNormalizer) 综合边界测试
// -------------------------------------------------------------
test('TurnNormalizer: correctly handles [BR] bursts, assistant greetings, system notices and time gaps', () => {
  const transpiled = transpileFile('../src/im/context/turnNormalizer.ts');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, () => ({}));

  const { groupMessagesIntoLogicalTurns, TURN_TIME_GAP_THRESHOLD_MS } = m.exports;

  // 1a. 伴侣开局主动打招呼 -> 独立封装为 Turn 0
  const t0 = 1000000;
  const mockMessages = [
    { id: 'm1', role: 'assistant', content: '早安呀，今天感觉怎么样？', createdAt: new Date(t0).toISOString() },
    { id: 'm2', role: 'user', content: '早安！今天起得好早', createdAt: new Date(t0 + 2000).toISOString() },
    { id: 'm3', role: 'assistant', content: '对呀[BR]昨晚睡得香香的~', createdAt: new Date(t0 + 4000).toISOString() },
    { id: 'm4', role: 'assistant', content: '你今天有什么安排嘛？', createdAt: new Date(t0 + 6000).toISOString() },
  ];

  const turns = groupMessagesIntoLogicalTurns(mockMessages);
  assert.equal(turns.length, 2, 'Should divide into Turn 0 (greeting) and Turn 1 (user answer + 2 assistant bubbles)');
  assert.equal(turns[0].firstMessageId, 'm1');
  assert.equal(turns[0].lastMessageId, 'm1');
  assert.equal(turns[1].firstMessageId, 'm2');
  assert.equal(turns[1].lastMessageId, 'm4');
  assert.equal(turns[1].messages.length, 3);

  // 1b. 拍一拍通知 (system_notice) 纳管
  const mockWithNudge = [
    { id: 'm1', role: 'user', content: '好困', createdAt: new Date(t0).toISOString() },
    { id: 'm2', role: 'assistant', content: '困了就睡[BR]别硬撑', createdAt: new Date(t0 + 2000).toISOString() },
    { id: 'm3', role: 'system', type: 'system_notice', content: '对方拍了拍你的脑门', createdAt: new Date(t0 + 4000).toISOString() },
    { id: 'm4', role: 'assistant', content: '醒醒啦~', createdAt: new Date(t0 + 6000).toISOString() },
  ];
  const turnsNudge = groupMessagesIntoLogicalTurns(mockWithNudge);
  assert.equal(turnsNudge.length, 2, 'system_notice after assistant bubble begins a new interaction turn');
  assert.equal(turnsNudge[1].firstMessageId, 'm3');

  // 1c. 超时截断 (时间差 > 5分钟强制切断)
  const tGap = t0 + TURN_TIME_GAP_THRESHOLD_MS + 10000;
  const mockWithTimeGap = [
    { id: 'm1', role: 'user', content: '第一句话', createdAt: new Date(t0).toISOString() },
    { id: 'm2', role: 'user', content: '第二句话（相隔10分钟后说）', createdAt: new Date(tGap).toISOString() },
  ];
  const turnsGap = groupMessagesIntoLogicalTurns(mockWithTimeGap);
  assert.equal(turnsGap.length, 2, 'Messages separated by > 5 minutes must split into new turns');
  assert.equal(turnsGap[0].firstMessageId, 'm1');
  assert.equal(turnsGap[1].firstMessageId, 'm2');
});

// -------------------------------------------------------------
// 2. 动态参数派生算法 (calculateEpochParameters)
// -------------------------------------------------------------
test('calculateEpochParameters: dynamically derives parameters according to userConfiguredWindowN', () => {
  const transpiled = transpileFile('../src/im/engine/epochLockstepCoordinator.ts');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, () => ({}));

  const { calculateEpochParameters } = m.exports;

  // Window = 20 (默认值)
  const p20 = calculateEpochParameters(20);
  assert.equal(p20.baseWindow, 20);
  assert.equal(p20.stepTurns, 6);
  assert.equal(p20.prefetchAt, 24); // 20 + 6 - 2
  assert.equal(p20.commitAt, 26);   // 20 + 6
  assert.equal(p20.elasticMax, 29); // 26 + 3

  // Window = 16
  const p16 = calculateEpochParameters(16);
  assert.equal(p16.baseWindow, 16);
  assert.equal(p16.stepTurns, 5);
  assert.equal(p16.prefetchAt, 19); // 16 + 5 - 2
  assert.equal(p16.commitAt, 21);   // 16 + 5
  assert.equal(p16.elasticMax, 23); // 21 + 2

  // Window = 10 (下限钳位)
  const p10 = calculateEpochParameters(10);
  assert.equal(p10.baseWindow, 10);
  assert.equal(p10.stepTurns, 4);   // clamp min=4
  assert.equal(p10.prefetchAt, 12);
  assert.equal(p10.commitAt, 14);

  // Window = 30
  const p30 = calculateEpochParameters(30);
  assert.equal(p30.baseWindow, 30);
  assert.equal(p30.stepTurns, 8);   // clamp max=8
  assert.equal(p30.prefetchAt, 36);
  assert.equal(p30.commitAt, 38);
});

// -------------------------------------------------------------
// 3. 协调器双阶段锁步全流程仿真 (Prefetch -> Staging -> Commit -> Elastic -> Fallback)
// -------------------------------------------------------------
test('EpochLockstepCoordinator: full lifecycle with prefetch staging, atomic commit, elastic buffer and fallback', async () => {
  // 模拟 SQLite 内存态
  let dbRow = {
    thread_id: 't1',
    space: 'normal',
    role_card_id: 'r1',
    epoch_version: 1,
    active_anchor_msg_id: 'msg_0',
    active_slot_json: '{"user_job":"设计师"}',
    active_summary_json: '{"narrative_summary":"初始相遇"}',
    staged_next_anchor_msg_id: null,
    staged_evict_end_msg_id: null,
    staged_slot_json: null,
    staged_summary_json: null,
    evicted_up_to_turn: -1,
    updated_at: Date.now(),
  };

  const mockEpochRepo = {
    async getOrCreateState(space, threadId, roleCardId) {
      return { ...dbRow };
    },
    async updateActiveAnchor(space, threadId, anchorId) {
      dbRow.active_anchor_msg_id = anchorId;
      dbRow.staged_next_anchor_msg_id = null;
    },
    async saveStagedPreCompaction(params) {
      if (params.expectedEpochVersion !== dbRow.epoch_version) return false;
      if (params.expectedAnchorMsgId !== dbRow.active_anchor_msg_id) return false;
      dbRow.staged_next_anchor_msg_id = params.nextAnchorMsgId;
      dbRow.staged_evict_end_msg_id = params.evictEndMsgId;
      dbRow.staged_slot_json = params.slotJson;
      dbRow.staged_summary_json = params.summaryJson;
      return true;
    },
    async commitStagedEpochLockstep(space, threadId, roleCardId, evictedTurnIndex) {
      dbRow.active_anchor_msg_id = dbRow.staged_next_anchor_msg_id;
      dbRow.active_slot_json = dbRow.staged_slot_json || dbRow.active_slot_json;
      dbRow.active_summary_json = dbRow.staged_summary_json || dbRow.active_summary_json;
      dbRow.staged_next_anchor_msg_id = null;
      dbRow.staged_slot_json = null;
      dbRow.staged_summary_json = null;
      dbRow.evicted_up_to_turn = evictedTurnIndex;
      dbRow.epoch_version += 1;
      return { ...dbRow };
    },
  };

  const transpiledCoordinator = transpileFile('../src/im/engine/epochLockstepCoordinator.ts');
  const transpiledNormalizer = transpileFile('../src/im/context/turnNormalizer.ts');

  const normalizerModule = { exports: {} };
  new Function('module', 'exports', 'require', transpiledNormalizer)(normalizerModule, normalizerModule.exports, () => ({}));

  const coordinatorModule = { exports: {} };
  new Function('module', 'exports', 'require', transpiledCoordinator)(coordinatorModule, coordinatorModule.exports, (id) => {
    if (id.includes('turnNormalizer')) return normalizerModule.exports;
    if (id.includes('imEpochRepository')) return { imEpochRepository: mockEpochRepo };
    return {};
  });

  const { epochLockstepCoordinator } = coordinatorModule.exports;

  // 生成 20 个回合的消息流 (模拟 T0 ~ T19)
  function createTurnsMessages(turnCount) {
    const msgs = [];
    for (let i = 0; i < turnCount; i++) {
      msgs.push({ id: `msg_${i}_u`, role: 'user', content: `问题${i}`, createdAt: new Date(1000 + i * 2000).toISOString() });
      msgs.push({ id: `msg_${i}_a`, role: 'assistant', content: `回答${i}`, createdAt: new Date(1000 + i * 2000 + 1000).toISOString() });
    }
    return msgs;
  }

  // 阶段 3a: 在 16 轮基准下，T18 尚未达到 prefetch 水位 (16 + 5 - 2 = 19)
  const msgs18 = createTurnsMessages(18);
  dbRow.active_anchor_msg_id = msgs18[0].id;
  let compactorCalled = false;
  const res18 = await epochLockstepCoordinator.evaluateAndAssemble(
    'normal', 't1', 'r1', 16, msgs18,
    async () => { compactorCalled = true; return null; }
  );
  assert.equal(compactorCalled, false, 'Pre-compaction should not trigger before prefetchAt (19)');
  assert.equal(res18.didStepEpoch, false);

  // 阶段 3b: 到达 19 轮 (PrefetchAt = 19) -> 异步触发预提炼
  const msgs19 = createTurnsMessages(19);
  let prefetchPayload = null;
  const res19 = await epochLockstepCoordinator.evaluateAndAssemble(
    'normal', 't1', 'r1', 16, msgs19,
    async (slice, slot, summ) => {
      prefetchPayload = { slice, slot, summ };
      return {
        slotJson: '{"user_job":"高级设计师"}',
        summaryJson: '{"narrative_summary":"共同完成了大项目"}',
      };
    }
  );
  // 等待微任务队列清空
  await new Promise((r) => setImmediate(r));
  assert.ok(prefetchPayload, 'Pre-compaction must be triggered at 19 turns');
  assert.equal(prefetchPayload.slice.length, 10, 'Evicting slice must contain 5 turns = 10 bubbles');
  assert.equal(dbRow.staged_next_anchor_msg_id, 'msg_5_u', 'Staged anchor must point to Turn 5首条气泡');
  assert.equal(dbRow.active_anchor_msg_id, 'msg_0_u', 'Active anchor must NOT move yet! (Zone 2 & Zone 3 protected)');
  assert.equal(res19.didStepEpoch, false);

  // 阶段 3c: 到达 21 轮 (CommitAt = 16 + 5 = 21) 且 staged 已就绪 -> 原子锁步翻转！
  const msgs21 = createTurnsMessages(21);
  const res21 = await epochLockstepCoordinator.evaluateAndAssemble(
    'normal', 't1', 'r1', 16, msgs21,
    async () => null
  );
  assert.equal(res21.didStepEpoch, true, 'Lockstep commit must flip at 21 turns');
  assert.equal(dbRow.epoch_version, 2, 'Epoch version must increment to 2');
  assert.equal(dbRow.active_anchor_msg_id, 'msg_5_u', 'Active anchor must step to msg_5_u');
  assert.equal(dbRow.staged_next_anchor_msg_id, null, 'Staged anchor must be cleared');
  assert.equal(res21.activeSummaryJson, '{"narrative_summary":"共同完成了大项目"}', 'Zone 2 summary must flip to new generation');

  // 阶段 3d: 弹性宽限 (Elastic Grace Buffer) 验证
  // 模拟新世代在 21 轮锁步后，用户连发到 21 + 5 = 26 轮 (距当前锚点 21 轮)，但提炼迟迟未返回
  const msgs27 = createTurnsMessages(27); // active turns = 27 - 5 = 22, commitAt = 21, elasticMax = 23
  dbRow.staged_next_anchor_msg_id = null; // 模拟提炼未就绪
  const res27 = await epochLockstepCoordinator.evaluateAndAssemble(
    'normal', 't1', 'r1', 16, msgs27,
    async () => null // 模拟无返回
  );
  assert.equal(res27.didStepEpoch, false, 'In elastic window (22 <= 23), anchor must NOT step');
  assert.equal(dbRow.active_anchor_msg_id, 'msg_5_u', 'Anchor remains locked, protecting 100% KV cache and 0 vacuum');

  // 阶段 3e: 突破弹性容忍极值 (> 23 轮) -> 本地启发式零丢失降级提取
  const msgs30 = createTurnsMessages(30); // active turns = 30 - 5 = 25 > 23 (突破上限)
  const res30 = await epochLockstepCoordinator.evaluateAndAssemble(
    'normal', 't1', 'r1', 16, msgs30,
    async () => null
  );
  assert.equal(res30.didStepEpoch, true, 'Must force commit with fallback summary beyond elastic limit');
  assert.equal(dbRow.epoch_version, 3, 'Epoch version increments');
  assert.equal(dbRow.active_anchor_msg_id, 'msg_10_u', 'Anchor steps forward by 5 turns');
  assert.ok(res30.activeSummaryJson.includes('前情承接'), 'Fallback summary must contain preserved phrases without memory loss');
});

// -------------------------------------------------------------
// 4. 视窗外检索屏障 (Evicted-Only Fence) 测试
// -------------------------------------------------------------
test('ContextBuilder: Evicted-Only Fence prevents duplicate recall when memory is visible in Zone 3', () => {
  const transpiledBuilder = transpileFile('../src/im/engine/imContextBuilder.ts');
  const builderModule = { exports: {} };
  new Function('module', 'exports', 'require', transpiledBuilder)(builderModule, builderModule.exports, () => ({}));

  const { buildChatPayload } = builderModule.exports;

  const mockHistory = [
    { role: 'user', content: '我家小黑猫叫煤球' },
    { role: 'assistant', content: '煤球真是一个可爱的名字！' },
    { role: 'user', content: '今天准备给它买个新猫爬架' },
    { role: 'assistant', content: '买多高的一定要注意稳固哦~' },
  ];

  // 4a. 当历史视窗包含“煤球”对话时，召回的关于“煤球”的记忆被 FENCE 过滤，不注入 Zone 4
  const recalledCandidate = [
    { id: 'mem1', content: '我家小黑猫叫煤球', score: 0.95 },
    { id: 'mem2', content: '用户在北京工作喜欢喝冰美式', score: 0.88 },
  ];

  const payloadWithFence = buildChatPayload(
    {
      rolePrompt: '伴侣人设',
      historyMessages: mockHistory,
      windowN: 10,
      recalledMemories: recalledCandidate,
    },
    '它现在好皮啊'
  );

  const zone4 = payloadWithFence[payloadWithFence.length - 2];
  assert.ok(
    !zone4.content.includes('我家小黑猫叫煤球'),
    'Memory appearing in Zone 3 MUST be fenced out from Layer 4 to prevent duplicate attention distraction'
  );
  assert.ok(
    zone4.content.includes('用户在北京工作喜欢喝冰美式'),
    'Unrelated memory not in Zone 3 is safely admitted into Layer 4'
  );
});

// -------------------------------------------------------------
// 5. 世代状态乐观锁防串槽与角色卡隔离测试
// -------------------------------------------------------------
test('imEpochRepository: optimistic lock with dual fingerprint rejects stale compaction writes', async () => {
  let tableCreated = false;
  let epochRow = null;

  const mockDb = {
    async execAsync(sql) { tableCreated = true; },
    async getFirstAsync(sql, params) { return epochRow; },
    async runAsync(sql, params) {
      if (sql.includes('INSERT INTO')) {
        epochRow = {
          thread_id: params[0],
          space: params[1],
          role_card_id: params[2],
          epoch_version: 1,
          active_anchor_msg_id: null,
          active_slot_json: '{}',
          active_summary_json: '{}',
          staged_next_anchor_msg_id: null,
          updated_at: params[3],
        };
        return { changes: 1 };
      }
      if (sql.includes('staged_next_anchor_msg_id = ?')) {
        const expectedVersion = params[8];
        const expectedAnchor = params[9];
        if (expectedVersion !== epochRow.epoch_version) return { changes: 0 };
        if (expectedAnchor !== epochRow.active_anchor_msg_id && (expectedAnchor !== null || epochRow.active_anchor_msg_id !== null)) return { changes: 0 };
        epochRow.staged_next_anchor_msg_id = params[0];
        return { changes: 1 };
      }
      return { changes: 0 };
    },
    async withTransactionAsync(fn) { return fn(); },
  };

  const transpiledRepo = transpileFile('../src/im/repository/imEpochRepository.ts');
  const repoModule = { exports: {} };
  new Function('module', 'exports', 'require', transpiledRepo)(repoModule, repoModule.exports, (id) => {
    if (id.includes('database')) return { initDatabase: async () => mockDb };
    return {};
  });

  const { imEpochRepository } = repoModule.exports;

  // 初始化
  const state = await imEpochRepository.getOrCreateState('normal', 'th1', 'roleA');
  assert.equal(state.epoch_version, 1);

  // 5a. 匹配版本与锚点时保存成功
  const savedOk = await imEpochRepository.saveStagedPreCompaction({
    space: 'normal',
    threadId: 'th1',
    expectedEpochVersion: 1,
    expectedAnchorMsgId: null,
    nextAnchorMsgId: 'next_1',
    evictEndMsgId: 'end_1',
    slotJson: '{}',
    summaryJson: '{}',
  });
  assert.equal(savedOk, true);

  // 5b. 版本号过期 (例如在途提炼返回时会话已被清空或升级) -> 乐观锁拒绝
  const savedStale = await imEpochRepository.saveStagedPreCompaction({
    space: 'normal',
    threadId: 'th1',
    expectedEpochVersion: 0, // 过期版本
    expectedAnchorMsgId: null,
    nextAnchorMsgId: 'next_stale',
    evictEndMsgId: 'end_stale',
    slotJson: '{}',
    summaryJson: '{}',
  });
  assert.equal(savedStale, false, 'Stale compaction with mismatched epoch version must be rejected');
});
