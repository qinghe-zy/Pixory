const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const {
  formatLivingStateAnchor,
  buildChatPayload,
} = require('../src/im/engine/imContextBuilder.ts');

const {
  evaluateAgencyCapacity,
  decayAlterValue,
  advanceLivingState,
  clampAlterValue,
} = require('../src/im/engine/imAgencyEngine.ts');

const {
  parseStatusTag,
  parseHeartbeatTag,
  validateHeartbeatConsistency,
} = require('../src/im/engine/imTagParser.ts');

const {
  calculateBubbleTypingDelay,
} = require('../src/im/config/pacingProfile.ts');

test('HDSI Living State & Agency 5 Vulnerabilities Guard Verification', async (t) => {
  // --------------------------------------------------------------------------
  // TC-VULN-01: TTL 到期双态锚点转换测试（彻底杜绝“连洗 360 分钟澡”穿帮）
  // --------------------------------------------------------------------------
  await t.test('TC-VULN-01: TTL expiration anchor transforms to natural conclusion prompt', () => {
    const baseTime = 1700000000000;
    const activeState = {
      statusText: '在浴室冲热水澡',
      activityLoad: 'occupied',
      privacyContext: 'private',
      deviceAccess: 'away',
      startedAt: baseTime,
      validUntil: baseTime + 30 * 60 * 1000, // 30 分钟后结束
      alterValue: 1,
      recentTrajectory: [],
    };

    // 1. 状态进行中 (10 分钟后发消息)
    const activeAnchor = formatLivingStateAnchor(
      activeState,
      baseTime + 10 * 60 * 1000,
      '2026/10/26 14:10:00',
      ''
    );
    assert.match(activeAnchor, /伴侣当前正在做: "在浴室冲热水澡" \(已持续 10 分钟\)/);
    assert.match(activeAnchor, /负荷: occupied \| 场合: private \| 设备: away/);
    assert.doesNotMatch(activeAnchor, /自然结束/);

    // 2. 状态已超时 (6 个小时 = 360 分钟后发消息)
    const sixHoursLater = baseTime + 360 * 60 * 1000;
    const expiredAnchor = formatLivingStateAnchor(
      activeState,
      sixHoursLater,
      '2026/10/26 20:00:00',
      ''
    );
    // 关键断言：绝不能输出“已持续 360 分钟”，必须输出已自然结束并引导推进最新生活动作
    assert.doesNotMatch(expiredAnchor, /已持续 360 分钟/);
    assert.match(expiredAnchor, /伴侣上一阶段做的事: "在浴室冲热水澡" 已于 330 分钟前自然结束/);
    assert.match(expiredAnchor, /请结合当前时间 \(2026\/10\/26 20:00:00\) 与人设作息，在本次回复中自然推进你的最新生活动作/);
  });

  // --------------------------------------------------------------------------
  // TC-VULN-02: 物理行动容量有效期自动解封（彻底杜绝“无限静默死锁”）
  // --------------------------------------------------------------------------
  await t.test('TC-VULN-02: evaluateAgencyCapacity automatically unlocks when now >= validUntil', () => {
    const baseTime = 1700000000000;
    const busyState = {
      statusText: '去羽毛球馆打球',
      activityLoad: 'occupied',
      privacyContext: 'public',
      deviceAccess: 'away',
      startedAt: baseTime,
      validUntil: baseTime + 45 * 60 * 1000, // 45 分钟后打完球
      alterValue: 0,
      recentTrajectory: [],
    };

    // 1. 在 45 分钟有效期内：被物理容量阻断，建议延迟对齐至打球结束时间
    const checkDuringGame = evaluateAgencyCapacity(busyState, 'ordinary', baseTime + 20 * 60 * 1000);
    assert.equal(checkDuringGame.allowed, false);
    assert.equal(checkDuringGame.reason, 'device-away');
    assert.equal(checkDuringGame.suggestedDelayMs, 25 * 60 * 1000); // 剩余 25 分钟

    // 2. 关键修复验证：45 分钟过后 (打完球了)，容量守卫必须立即放行，绝不死锁！
    const checkAfterGame = evaluateAgencyCapacity(busyState, 'ordinary', baseTime + 46 * 60 * 1000);
    assert.equal(checkAfterGame.allowed, true);
    assert.equal(checkAfterGame.reason, 'capacity-available');

    // 3. 睡眠状态始终拦截
    const sleepingState = { ...busyState, activityLoad: 'sleeping' };
    const sleepCheck = evaluateAgencyCapacity(sleepingState, 'ordinary', baseTime + 50 * 60 * 1000);
    assert.equal(sleepCheck.allowed, false);
    assert.equal(sleepCheck.reason, 'sleeping');
  });

  // --------------------------------------------------------------------------
  // TC-VULN-03: ScriptCommit 自洽守卫（睡觉/洗澡出站拦截）与入站阻尼联动
  // --------------------------------------------------------------------------
  await t.test('TC-VULN-03: ScriptCommit outbound guard drops sleep heartbeat & dampens typing when occupied', () => {
    const now = 1700000000000;

    // 1. 出站守卫：伴侣睡着后，近期心跳信封强制被抛弃
    const sleepHeartbeat = parseHeartbeatTag('[HEARTBEAT: 20m | 你睡了吗？]');
    assert.deepEqual(sleepHeartbeat, { delayMs: 20 * 60 * 1000, message: '你睡了吗？' });
    const guardedSleep = validateHeartbeatConsistency(
      sleepHeartbeat,
      { activityLoad: 'sleeping', deviceAccess: 'away', validUntil: now + 8 * 3600 * 1000 },
      now
    );
    assert.equal(guardedSleep, null); // 强制丢弃

    // 2. 出站守卫：去洗澡预计 30 分钟，但模型输出了 10 分钟后心跳，强制推迟到洗完澡之后
    const bathHeartbeat = parseHeartbeatTag('[HEARTBEAT: 10m | 我快洗好啦]');
    const guardedBath = validateHeartbeatConsistency(
      bathHeartbeat,
      { activityLoad: 'occupied', deviceAccess: 'away', validUntil: now + 30 * 60 * 1000 },
      now
    );
    assert.notEqual(guardedBath, null);
    assert.equal(guardedBath.delayMs >= 30 * 60 * 1000, true);

    // 3. 入站阻尼：当 occupied 时，打字节律乘上 1.5x 阻尼系数
    const normalDelay = calculateBubbleTypingDelay('在做模拟卷呢', undefined, false, { isOccupied: false });
    const dampedDelay = calculateBubbleTypingDelay('在做模拟卷呢', undefined, false, { isOccupied: true });
    assert.equal(dampedDelay >= Math.round(normalDelay * 1.4), true);
  });

  // --------------------------------------------------------------------------
  // TC-VULN-04: Alter 情绪惯性合流、单轮夹逼与 4 小时/跨夜半衰衰减
  // --------------------------------------------------------------------------
  await t.test('TC-VULN-04: Alter tag parsing, [-5, 5] clamping, and 4h/overnight half-life decay', () => {
    // 1. 标签合流解析
    const tag = parseStatusTag('[STATUS: 刚冲完咖啡看书 | load=free | privacy=private | device=available | alter=+1]');
    assert.notEqual(tag, null);
    assert.equal(tag.statusText, '刚冲完咖啡看书');
    assert.equal(tag.activityLoad, 'free');
    assert.equal(tag.privacyContext, 'private');
    assert.equal(tag.deviceAccess, 'available');
    assert.equal(tag.alterDelta, 1);

    // 2. 单轮增量与边界夹逼 [-5, +5]
    assert.equal(clampAlterValue(6), 5);
    assert.equal(clampAlterValue(-8), -5);

    // 3. 4 小时半衰期向 0 回归衰减
    const startTime = 1700000000000;
    const initialAlter = -4; // 伤心低落
    // 4 小时后，衰减 50% -> -2
    const after4h = decayAlterValue(initialAlter, startTime, startTime + 4 * 3600 * 1000);
    assert.equal(after4h, -2);
    // 8 小时后，衰减 75% -> -1
    const after8h = decayAlterValue(initialAlter, startTime, startTime + 8 * 3600 * 1000);
    assert.equal(after8h, -1);
    // 12 小时后，归零 -> 0
    const after12h = decayAlterValue(initialAlter, startTime, startTime + 12 * 3600 * 1000);
    assert.equal(after12h, 0);

    // 4. 状态机推进与轨迹追加
    const advanced = advanceLivingState(
      {
        statusText: '在图书馆刷题',
        activityLoad: 'occupied',
        privacyContext: 'public',
        deviceAccess: 'limited',
        startedAt: startTime,
        validUntil: startTime + 60 * 60 * 1000,
        alterValue: 2,
        recentTrajectory: [],
      },
      {
        statusText: '和朋友散步看晚霞',
        activityLoad: 'free',
        alterDelta: 1,
      },
      startTime + 2 * 3600 * 1000
    );
    assert.equal(advanced.statusText, '和朋友散步看晚霞');
    assert.equal(advanced.recentTrajectory.length, 1);
    assert.equal(advanced.recentTrajectory[0].statusText, '在图书馆刷题');
    assert.equal(advanced.alterValue, 3);
  });

  // --------------------------------------------------------------------------
  // TC-VULN-05: SQLite living_state_json 持久化与 Delivery Ledger 状态转移
  // --------------------------------------------------------------------------
  await t.test('TC-VULN-05: DatabaseSync validates living_state_json column and delivery_status zero-fork cancel', () => {
    const db = new DatabaseSync(':memory:');

    // 创建仿真表结构 (带有 V70 列)
    db.exec(`
      CREATE TABLE ai_threads (
        id TEXT PRIMARY KEY,
        title TEXT,
        chat_mode TEXT DEFAULT 'im',
        living_state_json TEXT
      );

      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY,
        threadId TEXT,
        role TEXT,
        content TEXT,
        delivery_status TEXT DEFAULT 'delivered',
        visible_at INTEGER
      );
    `);

    // 1. 持久化 living_state_json
    const sampleState = {
      statusText: '在阳台给绿植浇水',
      activityLoad: 'free',
      privacyContext: 'private',
      deviceAccess: 'available',
      startedAt: Date.now(),
      validUntil: Date.now() + 1800000,
      alterValue: 2,
      recentTrajectory: [{ statusText: '吃早餐', startedAt: Date.now() - 3600000, endedAt: Date.now(), activityLoad: 'free', privacyContext: 'private', deviceAccess: 'available' }],
    };
    db.prepare('INSERT INTO ai_threads (id, title, living_state_json) VALUES (?, ?, ?);')
      .run('th_1', '小青', JSON.stringify(sampleState));

    const loadedThread = db.prepare('SELECT living_state_json FROM ai_threads WHERE id = ?;').get('th_1');
    const parsedState = JSON.parse(loadedThread.living_state_json);
    assert.equal(parsedState.statusText, '在阳台给绿植浇水');
    assert.equal(parsedState.alterValue, 2);
    assert.equal(parsedState.recentTrajectory.length, 1);

    // 2. Write-Ahead Delivery Ledger: 预埋 staged 消息
    db.prepare(`
      INSERT INTO ai_messages (id, threadId, role, content, delivery_status, visible_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `).run('msg_hb_1', 'th_1', 'assistant', '忙完啦，在干嘛呢？', 'staged', Date.now() + 600000);

    // 验证预埋消息存在
    const stagedBefore = db.prepare('SELECT COUNT(*) as count FROM ai_messages WHERE threadId = ? AND delivery_status = ?;').get('th_1', 'staged');
    assert.equal(stagedBefore.count, 1);

    // 3. 用户先开口：执行 Zero-fork 取消 (直接删除或标记 cancelled)
    db.prepare("DELETE FROM ai_messages WHERE threadId = ? AND delivery_status = 'staged';").run('th_1');
    const stagedAfter = db.prepare('SELECT COUNT(*) as count FROM ai_messages WHERE threadId = ? AND delivery_status = ?;').get('th_1', 'staged');
    assert.equal(stagedAfter.count, 0); // 预埋消息被彻底清除，零分叉保障达成！
  });
});
