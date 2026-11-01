const test = require('node:test');
const assert = require('node:assert/strict');

const {
  estimateImTokens,
  fitLayer2CoreFacts,
  fitLayer4Memories,
  LAYER_2_MAX_TOKENS,
  LAYER_4_MAX_TOKENS,
  buildChatPayload,
} = require('../src/im/engine/imContextBuilder.ts');

test('im-prefix-cache-and-budget: 前缀KV缓存稳定性与双层预算控制器测试', async (t) => {
  await t.test('1. estimateImTokens: 混合中英文与符号 Token 估算精度', () => {
    // 纯中文字符: 10 个汉字 * 0.65 = 6.5 -> 7
    const cnStr = '今天天气真好适合散步';
    const cnTok = estimateImTokens(cnStr);
    assert.equal(cnTok >= 6 && cnTok <= 8, true, `Expected ~7 tokens, got ${cnTok}`);

    // 纯英文字符: 20 个 ASCII 字符 * 0.28 = 5.6 -> 6
    const enStr = 'hello world test code';
    const enTok = estimateImTokens(enStr);
    assert.equal(enTok >= 5 && enTok <= 7, true, `Expected ~6 tokens, got ${enTok}`);

    // 空串或 null 返回 0
    assert.equal(estimateImTokens(''), 0);
    assert.equal(estimateImTokens(null), 0);
  });

  await t.test('2. fitLayer2CoreFacts: 置顶/重要度优先级排序与 <= 550 Token 预算严控', () => {
    const mockFacts = [
      {
        id: 'mem_normal_low',
        content: '普通低优先级事实内容，用户提到过一次并不重要',
        importance: 3,
        isPinned: false,
        confidence: 0.8,
        lastAccessedAt: 1000,
      },
      {
        id: 'mem_pinned',
        content: '置顶关键偏好：用户对花生严重过敏，千万不能食用',
        importance: 8,
        isPinned: true,
        confidence: 0.95,
        lastAccessedAt: 2000,
      },
      {
        id: 'mem_high_importance',
        content: '高重要度事实：用户正在备考全日制研究生',
        importance: 9,
        isPinned: false,
        confidence: 0.9,
        lastAccessedAt: 1500,
      },
    ];

    const fitted = fitLayer2CoreFacts(mockFacts, LAYER_2_MAX_TOKENS);
    assert.equal(fitted.length, 3);
    // 第一项必须是置顶项
    assert.equal(fitted[0].id, 'mem_pinned');
    // 第二项必须是高重要度项
    assert.equal(fitted[1].id, 'mem_high_importance');
    // 第三项是普通项
    assert.equal(fitted[2].id, 'mem_normal_low');

    // 测试溢出预算截断 (设置一个极小的预算，如 30 token)
    const tightFitted = fitLayer2CoreFacts(mockFacts, 30);
    assert.equal(tightFitted.length < mockFacts.length, true);
    assert.equal(tightFitted[0].id, 'mem_pinned', '最紧缺预算下置顶项必须被优先保留');
  });

  await t.test('3. fitLayer4Memories: 动态召回记忆 <= 180 Token 预算严控', () => {
    const candidates = [
      { id: 'c1', content: '上周五在公园散步遇到了流浪猫', score: 0.95 },
      { id: 'c2', content: '昨天聊到了周末想去吃日本拉面', score: 0.88 },
      { id: 'c3', content: '之前提过很喜欢周杰伦的早期专辑', score: 0.72 },
      { id: 'c4', content: '提到过高中是在江南水乡读的', score: 0.65 },
    ];

    const fitted = fitLayer4Memories(candidates, LAYER_4_MAX_TOKENS);
    assert.equal(fitted.length > 0, true);
    // 最高分必须在最前
    assert.equal(fitted[0].id, 'c1');
    assert.equal(fitted[1].id, 'c2');
  });

  await t.test('4. 前缀字节级冻结 (Prefix KV Cache): 世代内多轮对话前两层字节完全一致', () => {
    const fixedRolePrompt = '你是一个温柔体贴、懂得分寸的AI伴侣。';
    const epochSlotJson = JSON.stringify({ '用户职业': '独立独立制作人', '口味': '微辣' });
    const epochCoreFactsJson = JSON.stringify([
      { id: 'f1', content: '用户正在开发一款复古RPG游戏', importance: 9, isPinned: true, lastAccessedAt: 100 },
    ]);

    // 第 1 轮
    const ctxTurn1 = buildChatPayload({
      rolePrompt: fixedRolePrompt,
      roleName: '小汐',
      epochSlotJson,
      epochCoreFactsJson,
      historyMessages: [
        { id: 'm1', role: 'user', content: '今天写了一整天代码', createdAt: 1000 },
        { id: 'm2', role: 'assistant', content: '辛苦啦，累坏了吧[BR]去泡杯茶休息会儿', createdAt: 2000 },
        { id: 'm3', role: 'user', content: '嗯，刚泡好大红袍', createdAt: 3000 },
      ],
      now: 1700000000000,
    });

    // 第 2 轮 (伴侣已生成新消息，且 mid-epoch 产生了新事实)
    const ctxTurn2 = buildChatPayload({
      rolePrompt: fixedRolePrompt,
      roleName: '小汐',
      epochSlotJson,
      epochCoreFactsJson,
      midEpochDeltaFacts: [
        { id: 'f_new', content: '用户刚泡了一杯大红袍', importance: 5, isPinned: false, lastAccessedAt: 3000, roleCardId: 'rc1', space: 'normal', tier: 'L2_FACT', category: 'hobby', triggerKeywords: [], entities: [], hitCount: 0, createdAt: 3000, sourceMode: 'im' },
      ],
      historyMessages: [
        { id: 'm1', role: 'user', content: '今天写了一整天代码', createdAt: 1000 },
        { id: 'm2', role: 'assistant', content: '辛苦啦，累坏了吧[BR]去泡杯茶休息会儿', createdAt: 2000 },
        { id: 'm3', role: 'user', content: '嗯，刚泡好大红袍', createdAt: 3000 },
        { id: 'm4', role: 'assistant', content: '热茶暖胃最舒服了[BR]慢慢喝', createdAt: 4000 },
        { id: 'm5', role: 'user', content: '对啊，准备边喝边听会儿音乐', createdAt: 5000 },
      ],
      now: 1700000060000,
    });

    // 验证 Layer 1 (协议与人设) 完全一致
    assert.equal(ctxTurn1[0].role, 'system');
    assert.equal(ctxTurn2[0].role, 'system');
    assert.equal(ctxTurn1[0].content, ctxTurn2[0].content, 'Layer 1 必须字节级 100% 一致');

    // 验证 Layer 2 (核心画像与记忆快照) 完全一致，保证前缀命中 DeepSeek/OpenAI KV Cache
    assert.equal(ctxTurn1[1].role, 'system');
    assert.equal(ctxTurn2[1].role, 'system');
    assert.equal(ctxTurn1[1].content, ctxTurn2[1].content, 'Layer 2 必须世代内字节级 100% 冻结一致');

    // 验证 mid-epoch 新事实被安排在尾部场记层或动态层，不破坏前缀
    const tailMessage = ctxTurn2[ctxTurn2.length - 1];
    assert.equal(tailMessage.role, 'user');
  });
});
