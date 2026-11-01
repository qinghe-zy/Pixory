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
// 1. 测试 countDialogueTurns 与 气泡聚合
// -------------------------------------------------------------
test('Dialogue Turn Counting: ignores [BR] burst fragments and measures true interaction turns', () => {
  const transpiled = transpileFile('../src/im/engine/imContextBuilder.ts');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, (id) => {
    return {};
  });

  const { countDialogueTurns, coalesceHistoryBurstMessages } = m.exports;

  const mockMessages = [
    { role: 'user', content: '今天好累啊' },
    { role: 'assistant', content: '抱抱你呀[BR]辛苦啦！' },
    { role: 'assistant', content: '快去洗个热水澡早点休息~' },
    { role: 'user', content: '嗯嗯，听你的' },
  ];

  const coalesced = coalesceHistoryBurstMessages(mockMessages);
  assert.equal(coalesced.length, 3, '2 assistant bubbles must be coalesced into 1 assistant turn');
  assert.equal(
    coalesced[1].content,
    '抱抱你呀[BR]辛苦啦！[BR]快去洗个热水澡早点休息~',
    'Assistant contents must be properly joined with [BR]'
  );

  const turns = countDialogueTurns(mockMessages);
  assert.equal(turns, 3, 'Dialogue turn count must be exactly 3 turns');
});

// -------------------------------------------------------------
// 2. 测试被打断草稿注入 Zone 4
// -------------------------------------------------------------
test('Zone 4 Context Anchor: injects interrupted draft when companion was interrupted', () => {
  const transpiled = transpileFile('../src/im/engine/imContextBuilder.ts');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, (id) => {
    return {};
  });

  const { buildChatPayload } = m.exports;

  const payload = buildChatPayload(
    {
      rolePrompt: '你是一个温柔的伴侣。',
      historyMessages: [
        { id: '1', role: 'user', content: '在干嘛？', createdAt: new Date().toISOString() },
      ],
      interruptedDraft: '我刚刚做好了曲奇！',
    },
    '我刚跟领导吵架了，好烦'
  );

  const zone4 = payload[payload.length - 2];
  assert.ok(
    zone4.content.includes('我刚刚做好了曲奇！'),
    'Layer 4 text must include the interrupted draft'
  );
  assert.ok(
    zone4.content.includes('瞬态交互提示'),
    'Layer 4 text must include the transient interaction guidance'
  );
});

// -------------------------------------------------------------
// 3. 测试心跳 5 态生命周期、时间戳对齐与二次守卫 (SQLite 模拟)
// -------------------------------------------------------------
test('Heartbeat Lifecycle & Guard: staged -> delivered, cancelled_by_user, cancelled_by_state, expired_ttl', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY,
      lastMessagePreview TEXT,
      updatedAt TEXT
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY,
      threadId TEXT,
      role TEXT,
      content TEXT,
      status TEXT,
      delivery_status TEXT,
      visible_at INTEGER,
      createdAt TEXT
    );
  `);

  const threadId = 'th_test_1';
  db.exec(`INSERT INTO ai_threads (id, lastMessagePreview, updatedAt) VALUES ('${threadId}', NULL, '2026-10-28T10:00:00.000Z');`);

  // 模拟 imThreadRepository 逻辑
  const mockRepo = {
    async insertStagedHeartbeat(msgId, content, visibleAt, createdAt) {
      db.prepare(`
        INSERT INTO ai_messages (id, threadId, role, content, status, delivery_status, visible_at, createdAt)
        VALUES (?, ?, 'assistant', ?, 'sent', 'staged', ?, ?)
      `).run(msgId, threadId, content, visibleAt, createdAt);
    },

    async cancelStagedMessages(reason = 'cancelled_by_user') {
      const stagedRow = db.prepare(
        `SELECT content FROM ai_messages WHERE threadId = ? AND delivery_status = 'staged' LIMIT 1;`
      ).get(threadId);
      const interruptedDraft = stagedRow?.content?.trim() || null;

      const result = db.prepare(
        `UPDATE ai_messages SET delivery_status = ? WHERE threadId = ? AND delivery_status = 'staged';`
      ).run(reason, threadId);

      return { cancelledCount: result.changes, interruptedDraft };
    },

    async revealPendingMessages(nowMs, livingState) {
      const TTL_MS = 30 * 60 * 1000;
      const rows = db.prepare(
        `SELECT id, content, visible_at, createdAt
         FROM ai_messages
         WHERE threadId = ? AND visible_at <= ? AND delivery_status IN ('staged', 'revealing');`
      ).all(threadId, nowMs);

      if (rows.length === 0) return 0;

      let revealedCount = 0;
      const isCompanionSleeping =
        livingState?.activityLoad === 'sleeping' ||
        livingState?.deviceAccess === 'away';

      for (const row of rows) {
        if (nowMs - row.visible_at > TTL_MS) {
          db.prepare(`UPDATE ai_messages SET delivery_status = 'expired_ttl' WHERE id = ?;`).run(row.id);
          continue;
        }

        if (isCompanionSleeping) {
          db.prepare(`UPDATE ai_messages SET delivery_status = 'cancelled_by_state' WHERE id = ?;`).run(row.id);
          continue;
        }

        const alignedCreatedAt = new Date(Math.max(new Date(row.createdAt).getTime(), row.visible_at)).toISOString();
        db.prepare(`UPDATE ai_messages SET delivery_status = 'delivered', createdAt = ? WHERE id = ?;`).run(alignedCreatedAt, row.id);
        db.prepare(`UPDATE ai_threads SET lastMessagePreview = ?, updatedAt = ? WHERE id = ?;`).run(row.content, alignedCreatedAt, threadId);
        revealedCount += 1;
      }
      return revealedCount;
    },

    getVisibleMessages() {
      return db.prepare(
        `SELECT * FROM ai_messages
         WHERE threadId = ? AND ((delivery_status = 'delivered') OR (delivery_status IS NULL AND visible_at IS NULL))
         ORDER BY createdAt DESC;`
      ).all(threadId);
    },
  };

  const t0 = 1761645600000; // 某基准时间点
  const t0Iso = new Date(t0).toISOString();

  // Case A: 正常到期显影并对齐时间戳
  await mockRepo.insertStagedHeartbeat('msg_hb_1', '怎么不理我啦？', t0 + 30000, t0Iso);
  // 在 t0 + 10s 查询快车道：此时仍为 staged，绝不能透传
  assert.equal(mockRepo.getVisibleMessages().length, 0, 'Staged heartbeat must NOT be visible before reveal');

  // 在 t0 + 35s 执行到期显影 (伴侣清醒)
  const revealedA = await mockRepo.revealPendingMessages(t0 + 35000, { activityLoad: 'free', deviceAccess: 'available' });
  assert.equal(revealedA, 1, 'Should reveal 1 message');

  const visibleA = mockRepo.getVisibleMessages();
  assert.equal(visibleA.length, 1);
  assert.equal(visibleA[0].delivery_status, 'delivered');
  assert.equal(
    visibleA[0].createdAt,
    new Date(t0 + 30000).toISOString(),
    'Delivered message createdAt must be aligned to visible_at timestamp'
  );

  // Case B: 用户抢话打断与草稿捕获
  await mockRepo.insertStagedHeartbeat('msg_hb_2', '看我给你带了什么好吃的', t0 + 60000, t0Iso);
  const cancelRes = await mockRepo.cancelStagedMessages('cancelled_by_user');
  assert.equal(cancelRes.cancelledCount, 1);
  assert.equal(cancelRes.interruptedDraft, '看我给你带了什么好吃的');

  const rowCancelled = db.prepare(`SELECT delivery_status FROM ai_messages WHERE id = 'msg_hb_2'`).get();
  assert.equal(rowCancelled.delivery_status, 'cancelled_by_user');

  // Case C: 二次生活自知觉守卫 (伴侣进入 sleeping，拦截显影)
  await mockRepo.insertStagedHeartbeat('msg_hb_3', '睡前晚安追聊', t0 + 90000, t0Iso);
  const revealedSleeping = await mockRepo.revealPendingMessages(t0 + 95000, { activityLoad: 'sleeping' });
  assert.equal(revealedSleeping, 0, 'Sleeping companion must NOT reveal heartbeat');

  const rowSleeping = db.prepare(`SELECT delivery_status FROM ai_messages WHERE id = 'msg_hb_3'`).get();
  assert.equal(rowSleeping.delivery_status, 'cancelled_by_state');

  // Case D: TTL 过期熔断 (超过 30 分钟未处理，如隔夜切回前台)
  await mockRepo.insertStagedHeartbeat('msg_hb_4', '隔夜旧追问', t0 + 100000, t0Iso);
  const revealedTtl = await mockRepo.revealPendingMessages(t0 + 100000 + 35 * 60 * 1000, { activityLoad: 'free' });
  assert.equal(revealedTtl, 0, 'Expired heartbeat must NOT be delivered');

  const rowTtl = db.prepare(`SELECT delivery_status FROM ai_messages WHERE id = 'msg_hb_4'`).get();
  assert.equal(rowTtl.delivery_status, 'expired_ttl');
});

// -------------------------------------------------------------
// 4. 测试 L2 记忆体系分流 (L2_FACT 覆盖 vs L2_EPISODE 追加)
// -------------------------------------------------------------
test('Memory Taxonomy: L2_FACT overwrites profile attribute, L2_EPISODE appends narrative events (No 煤球 Overwrite Bug)', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE ai_companion_memories (
      id TEXT PRIMARY KEY,
      role_card_id TEXT,
      space TEXT,
      tier TEXT,
      category TEXT,
      content TEXT,
      trigger_keywords TEXT,
      entities TEXT,
      importance INTEGER,
      hit_count INTEGER,
      is_pinned INTEGER,
      created_at INTEGER,
      last_accessed_at INTEGER,
      source_mode TEXT,
      expires_at INTEGER,
      superseded_by TEXT,
      deleted_at INTEGER,
      confidence REAL
    );
    CREATE TABLE ai_companion_memories_fts (
      memory_id TEXT PRIMARY KEY,
      content TEXT,
      trigger_keywords TEXT
    );
  `);

  // 载入真实 memoryRepository
  const transpiled = transpileFile('../src/core/memory/memoryRepository.ts');
  const m = { exports: {} };

  const mockDb = {
    async getAllAsync(query, ...params) {
      return db.prepare(query).all(...params);
    },
    async getFirstAsync(query, ...params) {
      return db.prepare(query).get(...params);
    },
    async runAsync(query, ...params) {
      return db.prepare(query).run(...params);
    },
  };

  const mockDatabase = {
    initDatabase: async () => mockDb,
  };

  const gatekeeperMod = { exports: {} };
  const gatekeeperTranspiled = transpileFile('../src/core/memory/memorySieveGatekeeper.ts');
  new Function('module', 'exports', 'require', gatekeeperTranspiled)(gatekeeperMod, gatekeeperMod.exports, () => ({}));

  new Function('module', 'exports', 'require', transpiled)(m, m.exports, (id) => {
    if (id.includes('database')) return mockDatabase;
    if (id.includes('memorySieveGatekeeper')) return gatekeeperMod.exports;
    return {};
  });

  const { memoryRepository } = m.exports;

  const roleCardId = 'role_cat_owner';
  const space = 'normal';

  // 1. 存入静态事实 L2_FACT (用户养了一只英短银渐层叫煤球)
  await memoryRepository.applyCompaction(roleCardId, space, {
    episodic_continuity: { unresolved_tension: '', emotional_aftertaste: '', narrative_summary: '' },
    l1_slot_mutations: [],
    l2_memory_mutations: [
      {
        op: 'ADD',
        tier: 'L2_FACT',
        category: 'pet_profile',
        content: '用户养了一只英短银渐层猫叫煤球',
        importance: 8,
        entities: ['煤球', '猫'],
        expanded_triggers: ['煤球', '猫咪', '逆子'],
      },
    ],
  });

  const facts1 = await memoryRepository.listMemories(roleCardId, space, 'L2_FACT');
  assert.equal(facts1.length, 1);
  assert.equal(facts1[0].content, '用户养了一只英短银渐层猫叫煤球');

  // 2. 存入情节事件 1: L2_EPISODE (带煤球去宠物医院看鼻支花了500)
  await memoryRepository.applyCompaction(roleCardId, space, {
    episodic_continuity: { unresolved_tension: '', emotional_aftertaste: '', narrative_summary: '' },
    l1_slot_mutations: [],
    l2_memory_mutations: [
      {
        op: 'ADD',
        tier: 'L2_EPISODE',
        category: 'pet_event',
        content: '带煤球去宠物医院看鼻支花了500元',
        importance: 7,
        entities: ['煤球', '宠物医院'],
        expanded_triggers: ['医院', '白大褂', '看病', '煤球'],
      },
    ],
  });

  // 3. 存入情节事件 2: L2_EPISODE (煤球把茶几上的水杯打碎了)
  await memoryRepository.applyCompaction(roleCardId, space, {
    episodic_continuity: { unresolved_tension: '', emotional_aftertaste: '', narrative_summary: '' },
    l1_slot_mutations: [],
    l2_memory_mutations: [
      {
        op: 'ADD',
        tier: 'L2_EPISODE',
        category: 'pet_event',
        content: '煤球把茶几上的水杯打碎了，用户假装生气但没舍得揍它',
        importance: 6,
        entities: ['煤球'],
        expanded_triggers: ['打碎', '杯子', '淘气', '煤球'],
      },
    ],
  });

  // 验证: 两个事件必须全部共存，绝对不能因为实体都是“煤球”而被覆盖抹除！
  const allL2 = await memoryRepository.listMemories(roleCardId, space, 'L2_EPISODIC');
  assert.equal(allL2.length, 3, '1 Fact and 2 Episodes must ALL coexist in L2 storage');

  const episodes = allL2.filter((m) => m.tier === 'L2_EPISODE');
  assert.equal(episodes.length, 2, 'Both episodic events must be preserved');
  assert.ok(episodes.some((e) => e.content.includes('看鼻支花了500元')));
  assert.ok(episodes.some((e) => e.content.includes('水杯打碎了')));

  // 4. 更新静态事实: 煤球的喜好偏好更新 (L2_FACT)
  await memoryRepository.applyCompaction(roleCardId, space, {
    episodic_continuity: { unresolved_tension: '', emotional_aftertaste: '', narrative_summary: '' },
    l1_slot_mutations: [],
    l2_memory_mutations: [
      {
        op: 'ADD',
        tier: 'L2_FACT',
        category: 'pet_profile',
        content: '用户养了一只英短银渐层猫叫煤球，性格粘人且最爱吃冻干',
        importance: 9,
        entities: ['煤球'],
        expanded_triggers: ['小祖宗', '煤球'],
      },
    ],
  });

  const updatedL2 = await memoryRepository.listMemories(roleCardId, space, 'L2_EPISODIC');
  assert.equal(updatedL2.length, 3, 'Updating fact should NOT increase count and NOT touch episodes');
  const factUpdated = updatedL2.find((m) => m.tier === 'L2_FACT');
  assert.ok(factUpdated.content.includes('最爱吃冻干'), 'Fact must be updated in place');
  assert.ok(factUpdated.triggerKeywords.includes('小祖宗'), 'Triggers must be merged');
});
