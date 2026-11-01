const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadTs(relPath, mocks = {}) {
  let fullPath = path.resolve(__dirname, relPath);
  if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) {
    if (fs.existsSync(fullPath + '.ts')) fullPath += '.ts';
    else if (fs.existsSync(fullPath + '.tsx')) fullPath += '.tsx';
  }
  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (id) => {
    if (mocks[id]) return mocks[id];
    if (id.startsWith('.')) {
      return loadTs(path.join(path.dirname(fullPath), id), mocks);
    }
    return require(id);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

test('Continuous Layer 2 Injection: 初始空 "{}" 世代绝不遮蔽 L1_SLOT/L1_SUMMARY 且绝不输出空 JSON 噪音', () => {
  const { buildChatPayload } = require('../src/im/engine/imContextBuilder.ts');

  const payload = buildChatPayload(
    {
      rolePrompt: '你是温柔伴侣小夏。',
      roleName: '小夏',
      l1Slots: [
        { id: 'slot_1', category: '用户称呼', content: '阿辰' },
        { id: 'slot_2', category: '共同宠物', content: '布偶猫糯米' },
      ],
      l1Summary: {
        id: 'sum_1',
        category: 'continuity_summary',
        content: JSON.stringify({
          unresolved_tension: '周末约好去美术馆看展',
          narrative_summary: '上周一起领养了小猫糯米',
        }),
      },
      coreFacts: [
        { id: 'fact_allergy', category: 'allergy_taboo', content: '用户对海鲜和花生过敏', importance: 9, isPinned: true },
      ],
      // 模拟 imEpochRepository 刚初始化时的空 '{}' 默认值
      epochSlotJson: '{}',
      epochSummaryJson: '{}',
      recalledMemories: [
        // 同 ID 的 coreFact 应在 Layer 4 自动去重，不重复浪费 Token
        { id: 'fact_allergy', content: '用户对海鲜和花生过敏', finalScore: 0.95 },
        { id: 'ep_coffee', content: '昨天在街角咖啡店点了燕麦拿铁', finalScore: 0.82 },
      ],
      historyMessages: [
        { id: 'm1', threadId: 't1', role: 'user', content: '早安呀', createdAt: '2026-10-28T08:00:00Z' },
        { id: 'm2', threadId: 't1', role: 'assistant', content: '早安阿辰！', createdAt: '2026-10-28T08:01:00Z' },
      ],
      windowN: 20,
    },
    '中午吃什么好呢？'
  );

  const systemNodes = payload.filter((m) => m.role === 'system');
  assert.equal(systemNodes.length, 3, '应包含 Layer 1, Layer 2, Layer 4 三个 system 节点');

  const layer2Content = systemNodes[1].content;
  assert.ok(!layer2Content.includes('{}'), '绝不允许输出空的 "{}" 噪音');
  assert.ok(layer2Content.includes('用户称呼: 阿辰'), 'L1_SLOT 必须完整保留');
  assert.ok(layer2Content.includes('布偶猫糯米'), 'L1_SLOT 宠物槽位必须完整保留');
  assert.ok(layer2Content.includes('用户对海鲜和花生过敏'), 'Core Profile Facts 必须常驻注入 Layer 2');
  assert.ok(layer2Content.includes('周末约好去美术馆看展'), '当 epochSummaryJson 为 "{}" 时必须自动回退使用持久化 l1Summary');

  const layer4Content = systemNodes[2].content;
  assert.ok(!layer4Content.includes('用户对海鲜和花生过敏'), '已在 Layer 2 常驻的 coreFacts 必须在 Layer 4 去重');
  assert.ok(layer4Content.includes('昨天在街角咖啡店点了燕麦拿铁'), '非重复的情境召回记忆正常注入 Layer 4');
});

test('Window Slicing: windowN=20 保留完整 20 个来回对话轮次 (40 个合并消息节点) 且严格以 user 起始', () => {
  const { sliceAnchoredHistory } = require('../src/im/engine/imContextBuilder.ts');

  const msgs = [];
  for (let i = 1; i <= 25; i++) {
    msgs.push({
      id: `u_${i}`,
      threadId: 't1',
      role: 'user',
      content: `第${i}轮用户发言`,
      createdAt: new Date(1700000000000 + i * 60000).toISOString(),
    });
    msgs.push({
      id: `a_${i}`,
      threadId: 't1',
      role: 'assistant',
      content: `第${i}轮伴侣回复第一句`,
      createdAt: new Date(1700000000000 + i * 60000 + 5000).toISOString(),
    });
    msgs.push({
      id: `a_${i}_b`,
      threadId: 't1',
      role: 'assistant',
      content: `第${i}轮伴侣回复第二句`,
      createdAt: new Date(1700000000000 + i * 60000 + 8000).toISOString(),
    });
  }

  const sliced = sliceAnchoredHistory(msgs, 20);
  assert.equal(sliced[0].role, 'user', '切片起点必须对齐 user 角色');
  assert.equal(sliced.length, 40, 'windowN=20 必须保留完整 20 轮来回 (40 个合并节点)，而非被砍半成 10 轮');
  assert.equal(sliced[0].content, '第6轮用户发言');
});

test('Immediate Fact Sieve: 0延迟规则筛子即时捕获用户姓名、过敏禁忌、喜恶与宠物信息', () => {
  const { extractImmediateFactsFromUserText } = loadTs('../src/core/memory/memoryRepository.ts', {
    '../../database/index': { initDatabase: async () => ({}) },
  });

  const facts = extractImmediateFactsFromUserText(
    '你可以叫我小周，我对芒果和花生过敏，平时不吃香菜，最喜欢吃抹茶千层，我家猫叫煤球'
  );
  assert.ok(facts.length >= 4, `应提取出多条核心事实，实际: ${facts.length}`);
  const joined = facts.map((f) => f.content).join(' | ');
  assert.ok(joined.includes('小周'), '提取用户称呼');
  assert.ok(joined.includes('过敏'), '提取过敏禁忌');
  assert.ok(joined.includes('香菜'), '提取饮食忌口');
  assert.ok(joined.includes('煤球'), '提取宠物名字');
});

test('Chinese Tail-Entity Recall: 长句尾部无空格中文实体不被截断且命中 N-gram 评分通道', () => {
  const {
    sanitizeAndExtractFtsTerms,
    scoreCompanionMemory,
  } = loadTs('../src/core/memory/memoryScorer.ts');

  const longChineseInput = '今天在公司开了一整天复盘会真的好累啊晚上路过便利店看到宇治抹茶雪糕';
  const ftsTerms = sanitizeAndExtractFtsTerms(longChineseInput);
  const ftsJoined = Array.isArray(ftsTerms) ? ftsTerms.join(' ') : String(ftsTerms);
  assert.ok(ftsJoined.includes('抹茶') || ftsJoined.includes('雪糕'), `尾部中文实体词必须被保留: ${ftsJoined}`);

  const memory = {
    id: 'mem_matcha',
    roleCardId: 'r1',
    space: 'normal',
    tier: 'L2_FACT',
    category: 'preference',
    content: '用户非常喜欢宇治抹茶口味的甜品与雪糕',
    triggerKeywords: [],
    entities: [],
    importance: 8,
    hitCount: 1,
    isPinned: false,
    createdAt: Date.now() - 86400000,
    lastAccessedAt: Date.now() - 86400000,
    sourceMode: 'im',
  };

  // 即使 SQLite unicode61 FTS 未命中无空格中文 (ftsMatchedIds 为空 Set)，内存 N-gram 仍可精准召回！
  const scored = scoreCompanionMemory(memory, longChineseInput, Date.now(), new Set());
  assert.ok(scored && scored.score > 0.1, `无空格中文长句尾词应成功激活记忆召回，得分: ${scored?.score}`);
});

test('Top Marquee Layout Guard: ImMarqueeText 具备 10000px 无约束测量层与双轨道单行防折行约束', () => {
  const marqueeSrc = fs.readFileSync(
    path.resolve(__dirname, '../src/im/components/common/ImMarqueeText.tsx'),
    'utf8'
  );
  assert.ok(marqueeSrc.includes('width: 10000'), '测量容器必须设置宽画布防止 Android Yoga 按父容器折行');
  assert.ok(marqueeSrc.includes('numberOfLines={1}'), '测量与滚动文本必须声明单行以触发真实自然宽度滚动');
  assert.ok(marqueeSrc.includes('textWidth * 2 + spacing'), '滚动轨道必须显式赋予双倍文本宽度防止截断');
});
