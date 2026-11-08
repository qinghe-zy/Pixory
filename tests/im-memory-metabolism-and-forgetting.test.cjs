const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    if (fs.existsSync(path.join(targetPath, 'index.ts'))) targetPath = path.join(targetPath, 'index.ts');
    else if (fs.existsSync(path.join(targetPath, 'index.js'))) targetPath = path.join(targetPath, 'index.js');
  } else if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
    else if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      if (fs.existsSync(path.join(targetPath, 'index.ts'))) targetPath = path.join(targetPath, 'index.ts');
      else if (fs.existsSync(path.join(targetPath, 'index.js'))) targetPath = path.join(targetPath, 'index.js');
    }
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
  new Function('module', 'exports', 'require', '__DEV__', transpiled)(m, m.exports, customRequire, false);
  return m.exports;
}

global.__DEV__ = false;
globalThis.__DEV__ = false;

const mockExpoSecureStore = {
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
};

function createMockDbAdapter(memDb) {
  const flatten = (params) => (params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
  return {
    runAsync: async (sql, ...params) => {
      const stmt = memDb.prepare(sql);
      return stmt.run(...flatten(params));
    },
    getAllAsync: async (sql, ...params) => {
      const stmt = memDb.prepare(sql);
      return stmt.all(...flatten(params));
    },
    getFirstAsync: async (sql, ...params) => {
      const stmt = memDb.prepare(sql);
      return stmt.get(...flatten(params));
    },
    withTransactionAsync: async (cb) => {
      memDb.exec('BEGIN TRANSACTION;');
      try {
        await cb();
        memDb.exec('COMMIT;');
      } catch (e) {
        memDb.exec('ROLLBACK;');
        throw e;
      }
    },
  };
}

// 1. AC-1: 气话拦截与真实情绪放行测试
test('AC-1: Modality Vent vs Real Emotion Admission Gate', () => {
  const { shouldAdmitToLongTermMemory } = loadModule('../src/core/memory/memorySieveGatekeeper.ts');

  // Case A: 典型情绪气话与反事实动作 (应拦截进入 L2_FACT 与 commitment)
  const ventCandidate1 = {
    content: '气死我了，明天我就辞职去卖烤肠',
    tier: 'L2_FACT',
    category: 'fact',
  };
  const res1 = shouldAdmitToLongTermMemory(ventCandidate1);
  assert.equal(res1.admit, false, '气话应被长期事实门禁拦截');
  assert.equal(res1.rejectReason, 'vent_or_hyperbole');

  const ventCandidate2 = {
    content: '被老板搞崩溃了，再也不想去上班了，准备去天桥贴膜',
    category: 'commitment',
  };
  const res2 = shouldAdmitToLongTermMemory(ventCandidate2);
  assert.equal(res2.admit, false, '反事实赌气应被拦截');
  assert.equal(res2.rejectReason, 'vent_or_hyperbole');

  // Case B: 正常真实情绪倾诉 (必须放行进入 L2_EPISODE)
  const realEmotionCandidate = {
    content: '今天项目汇报被领导当众批评了，心里特别委屈难受',
    tier: 'L2_EPISODE',
    category: 'emotional_confide',
  };
  const res3 = shouldAdmitToLongTermMemory(realEmotionCandidate);
  assert.equal(res3.admit, true, '真实情绪倾诉必须允许进入 L2_EPISODE');
});

// 2. AC-2: 跨字面状态演进覆写 (SUPERSEDE) 与 FTS5 同步清理
test('AC-2: State Evolution Supersede & FTS Sync', async () => {
  // 建立 SQLite 内存表仿真
  const memDb = new DatabaseSync(':memory:');
  memDb.exec(`
    CREATE TABLE ai_companion_memories (
      id TEXT PRIMARY KEY NOT NULL,
      role_card_id TEXT NOT NULL,
      space TEXT NOT NULL DEFAULT 'normal',
      tier TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      trigger_keywords TEXT,
      entities TEXT,
      importance INTEGER NOT NULL DEFAULT 5,
      hit_count INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL,
      source_mode TEXT DEFAULT 'im',
      expires_at INTEGER DEFAULT NULL,
      superseded_by TEXT DEFAULT NULL,
      deleted_at INTEGER DEFAULT NULL,
      confidence REAL NOT NULL DEFAULT 0.85
    );
    CREATE VIRTUAL TABLE ai_companion_memories_fts USING fts5(
      memory_id UNINDEXED,
      content,
      trigger_keywords
    );
  `);

  const mockDbAdapter = createMockDbAdapter(memDb);

  const { memoryRepository } = loadModule('../src/core/memory/memoryRepository.ts', {
    '../../database/index': {
      initDatabase: async () => mockDbAdapter,
    },
    'expo-secure-store': mockExpoSecureStore,
  });

  const now = Date.now();
  // 预置旧记忆: mem_101
  await memoryRepository.saveMemory({
    id: 'mem_101',
    roleCardId: 'role_test',
    space: 'normal',
    tier: 'L2_FACT',
    category: 'identity',
    content: '用户正在脱产准备考研二战',
    triggerKeywords: ['考研', '复习'],
    entities: ['考研'],
    importance: 8,
    hitCount: 2,
    isPinned: false,
    createdAt: now - 3600000,
    lastAccessedAt: now - 3600000,
    sourceMode: 'im',
  }, 'normal');

  // 验证旧记录在 FTS 中存在
  const ftsBefore = memDb.prepare("SELECT * FROM ai_companion_memories_fts WHERE memory_id = 'mem_101';").all();
  assert.equal(ftsBefore.length, 1);

  // 跨字面新状态演进 (字面重合度 0)
  const newRecord = {
    id: 'mem_102',
    roleCardId: 'role_test',
    space: 'normal',
    tier: 'L2_FACT',
    category: 'identity',
    content: '用户拿到字节跳动Offer下周一入职',
    triggerKeywords: ['入职', '字节跳动', '工作'],
    entities: ['字节跳动', '工作'],
    importance: 8,
    hitCount: 0,
    isPinned: false,
    createdAt: now,
    lastAccessedAt: now,
    sourceMode: 'im',
  };

  await memoryRepository.supersedeMemory('normal', 'mem_101', newRecord);

  // 验证旧记录被标记 superseded_by 与 deleted_at，且从 FTS 中移除
  const oldRow = memDb.prepare("SELECT * FROM ai_companion_memories WHERE id = 'mem_101';").get();
  assert.equal(oldRow.superseded_by, 'mem_102');
  assert.ok(oldRow.deleted_at !== null, '被替代的旧记录应当标记 deleted_at');

  const ftsOld = memDb.prepare("SELECT * FROM ai_companion_memories_fts WHERE memory_id = 'mem_101';").all();
  assert.equal(ftsOld.length, 0, '旧记录必须从 FTS5 索引中被移除');

  const ftsNew = memDb.prepare("SELECT * FROM ai_companion_memories_fts WHERE memory_id = 'mem_102';").all();
  assert.equal(ftsNew.length, 1, '新记录已建立 FTS5 全文索引');
});

const mockExpoSqlite = {
  openDatabaseSync: () => ({
    execAsync: async () => {},
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
  }),
};

// 3. AC-3: 主动命令遗忘与队列清除
test('AC-3: Forget Request & Transient Memory Soft Delete', async () => {
  const { classifyTurnMemoryIntent } = loadModule('../src/core/memory/memoryIntentClassifier.ts');
  const { MemoryExtractionBatcher } = loadModule('../src/core/memory/memoryExtractionBatcher.ts', {
    'expo-secure-store': mockExpoSecureStore,
    'expo-sqlite': mockExpoSqlite,
  });

  // 1. 意图分类测试
  const i1 = classifyTurnMemoryIntent('刚才我说的气话你全忘了吧');
  assert.equal(i1.intent, 'FORGET_REQUEST');

  const i2 = classifyTurnMemoryIntent('算啦刚才都是开玩笑的，别当真哈');
  assert.equal(i2.intent, 'FORGET_REQUEST');

  // 2. 队列清除测试
  const batcher = MemoryExtractionBatcher.shared;
  batcher.enqueue({
    space: 'normal',
    roleCardId: 'role_test',
    userMessage: '今天真的气死我了！',
  });
  assert.equal(batcher.getPendingCount('normal:role_test'), 1);

  batcher.clearKey('normal:role_test');
  assert.equal(batcher.getPendingCount('normal:role_test'), 0, '主动遗忘应立即清空在途防抖提炼队列');
});

// 4. AC-4: 动态半衰期衰减与解耦断头台 (Fuzzy Recall vs L0 钢印保底)
test('AC-4: Dynamic Decay & Decoupled Forgetting Floor (Fuzzy Recall Invariant)', () => {
  const { computeTimeDecayFactor, scoreCompanionMemory } = loadModule('../src/core/memory/memoryScorer.ts');
  const { renderLayer4MemoryItem } = loadModule('../src/im/engine/imContextBuilder.ts');

  const now = Date.now();

  // Case A: 10 天前的普通日常情景记忆 (importance = 6, hitCount = 0)
  const tenDaysAgoMs = now - 10 * 24 * 3600 * 1000;
  const staleEpisode = {
    id: 'ep_10d',
    roleCardId: 'role_test',
    space: 'normal',
    tier: 'L2_EPISODE',
    category: 'daily_life',
    content: '[2026-10-28] 中午食堂红烧肉太咸了',
    triggerKeywords: ['红烧肉', '食堂', '咸'],
    entities: ['食堂'],
    importance: 6,
    hitCount: 0,
    isPinned: false,
    createdAt: tenDaysAgoMs,
    lastAccessedAt: tenDaysAgoMs,
    sourceMode: 'im',
  };

  const decayFactor10d = computeTimeDecayFactor(staleEpisode, now);
  // deltaHours = 240, 0.996^240 ≈ 0.3818 (处于 0.30 ~ 0.65 模糊区)
  assert.ok(decayFactor10d >= 0.30 && decayFactor10d < 0.65, `decayFactor 应处于模糊区，实际为 ${decayFactor10d}`);

  // 模拟打分：即便 baseRelevance 达到 0.90，finalScore 约为 0.185
  const scored = scoreCompanionMemory(staleEpisode, '食堂的红烧肉', now);
  assert.ok(scored, '应当产生召回打分');
  assert.ok(scored.score > 0.12 && scored.score < 0.28, `finalScore 约为 0.185，实际为 ${scored.score}`);

  // 关键断言：在解耦断头台下，该记忆绝对不能被误杀，必须稳定渲染为 fuzzy 模糊记忆！
  const renderedFuzzy = renderLayer4MemoryItem(scored);
  assert.ok(renderedFuzzy.includes('clarity="fuzzy"'), '必须输出 clarity="fuzzy"');
  assert.ok(!renderedFuzzy.includes('[2026-10-28]'), '模糊记忆必须剥离精确 [YYYY-MM-DD] 日期前缀');
  assert.ok(renderedFuzzy.includes('hint="此事印象较模糊'), '必须去台词化并包含模糊回忆提示');

  // Case B: L0 钢印层（重要度 9 且为禁忌类），拨至 180 天后 (4320 小时)
  const halfYearAgoMs = now - 180 * 24 * 3600 * 1000;
  const tabooMemory = {
    id: 'mem_taboo',
    roleCardId: 'role_test',
    space: 'normal',
    tier: 'L2_FACT',
    category: 'user_taboo',
    content: '用户对芒果严重过敏，千万不能碰',
    triggerKeywords: ['芒果', '过敏'],
    entities: ['芒果'],
    importance: 9,
    hitCount: 1,
    isPinned: false,
    createdAt: halfYearAgoMs,
    lastAccessedAt: halfYearAgoMs,
    sourceMode: 'im',
  };

  const decayTaboo = computeTimeDecayFactor(tabooMemory, now);
  assert.equal(decayTaboo, 0.85, 'L0 钢印层即使过去 180 天依然必须保持 0.85 铁底保护');

  const scoredTaboo = scoreCompanionMemory(tabooMemory, '要不要吃芒果蛋糕', now);
  assert.ok(scoredTaboo);
  const renderedClear = renderLayer4MemoryItem(scoredTaboo);
  assert.ok(renderedClear.includes('clarity="clear"'), 'L0 钢印层必须保持 clarity="clear" 完整召回');
});

// 5. AC-5: 内存倒排表同实体碎片坍缩 (Episode Folding)
test('AC-5: In-Memory Inverted Index Episode Folding', async () => {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec(`
    CREATE TABLE ai_companion_memories (
      id TEXT PRIMARY KEY NOT NULL,
      role_card_id TEXT NOT NULL,
      space TEXT NOT NULL DEFAULT 'normal',
      tier TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      trigger_keywords TEXT,
      entities TEXT,
      importance INTEGER NOT NULL DEFAULT 5,
      hit_count INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL,
      source_mode TEXT DEFAULT 'im',
      expires_at INTEGER DEFAULT NULL,
      superseded_by TEXT DEFAULT NULL,
      deleted_at INTEGER DEFAULT NULL,
      confidence REAL NOT NULL DEFAULT 0.85
    );
    CREATE VIRTUAL TABLE ai_companion_memories_fts USING fts5(
      memory_id UNINDEXED,
      content,
      trigger_keywords
    );
  `);

  const mockDbAdapter = createMockDbAdapter(memDb);

  const { runDailyMemoryMetabolism } = loadModule('../src/core/memory/memoryMetabolismService.ts');

  const now = Date.now();
  const twentyDaysAgo = now - 20 * 24 * 3600 * 1000;

  // 插入 5 条包含共同实体 '总监' 的旧 Episode（entities 存为 JSON 数组字符串）
  for (let i = 1; i <= 5; i++) {
    memDb.prepare(`
      INSERT INTO ai_companion_memories
      (id, role_card_id, space, tier, category, content, trigger_keywords, entities, importance, hit_count, is_pinned, created_at, last_accessed_at)
      VALUES (?, 'role_test', 'normal', 'L2_EPISODE', 'work', ?, '["周报","工作"]', '["总监","周报"]', 6, 0, 0, ?, ?);
    `).run(`ep_work_${i}`, `第${i}次因为周报被总监找茬`, twentyDaysAgo, twentyDaysAgo);

    memDb.prepare(`
      INSERT INTO ai_companion_memories_fts (memory_id, content, trigger_keywords)
      VALUES (?, ?, '周报 工作');
    `).run(`ep_work_${i}`, `第${i}次因为周报被总监找茬`);
  }

  // 插入 1 条 20 天前未命中的僵尸记忆 (hit_count = 0, importance = 5)
  memDb.prepare(`
    INSERT INTO ai_companion_memories
    (id, role_card_id, space, tier, category, content, trigger_keywords, entities, importance, hit_count, is_pinned, created_at, last_accessed_at)
    VALUES ('ep_zombie', 'role_test', 'normal', 'L2_EPISODE', 'trivia', '买了一杯生椰拿铁微糖', '["拿铁"]', '[]', 5, 0, 0, ?, ?);
  `).run(twentyDaysAgo, twentyDaysAgo);

  // 运行睡眠新陈代谢
  let consolidatorCalled = false;
  await runDailyMemoryMetabolism(
    mockDbAdapter,
    'role_test',
    'normal',
    now,
    async (episodes) => {
      consolidatorCalled = true;
      assert.equal(episodes.length, 5);
      return '用户在工作中与总监关系紧张，因周报问题多次产生摩擦';
    }
  );

  assert.equal(consolidatorCalled, true, '当某一实体下累积 >= 5 条旧经历时，必须触发合并归纳');

  // 验证僵尸记忆 ep_zombie 被软删除
  const zombie = memDb.prepare("SELECT * FROM ai_companion_memories WHERE id = 'ep_zombie';").get();
  assert.ok(zombie.deleted_at !== null, '僵尸记忆满 14 天零命中必须被软删除');

  // 验证 5 条旧 Episode 被原子标记 superseded_by 与 deleted_at
  const oldEpisodes = memDb.prepare("SELECT * FROM ai_companion_memories WHERE id LIKE 'ep_work_%';").all();
  for (const ep of oldEpisodes) {
    assert.ok(ep.superseded_by && ep.superseded_by.startsWith('mem_fact_fold_'));
    assert.ok(ep.deleted_at !== null);
  }

  // 验证新生成的长期事实
  const newFact = memDb.prepare("SELECT * FROM ai_companion_memories WHERE id LIKE 'mem_fact_fold_%';").get();
  assert.ok(newFact, '必须生成新的折叠 Fact 记录');
  assert.equal(newFact.tier, 'L2_FACT');
  assert.equal(newFact.importance, 8);
  assert.ok(newFact.content.includes('与总监关系紧张'));
});
