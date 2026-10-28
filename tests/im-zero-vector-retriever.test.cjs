const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreCompanionMemory, sanitizeAndExtractFtsTerms } = require('../src/core/memory/memoryScorer.ts');

test('Zero-Vector Retriever Scoring and Channel Verification', async (t) => {
  const dummyMemory = {
    id: 'mem_cat_1',
    roleCardId: 'role_1',
    space: 'normal',
    tier: 'L2_EPISODIC',
    category: 'pet_facts',
    content: '用户的英短黑猫煤球喜欢在他写代码时踩MacBook键盘',
    triggerKeywords: ['煤球', '猫', '黑猫', '宠物', '踩键盘', '写代码', '猫砂'],
    entities: ['entity:煤球', 'entity:MacBook'],
    importance: 8,
    hitCount: 2,
    isPinned: false,
    createdAt: 1700000000000,
    lastAccessedAt: 1700000000000,
    sourceMode: 'im',
  };

  await t.test('Channel 1: Trigger keywords substring match activates for casual short inputs', () => {
    // 短口语: "买猫砂" 命中 expanded_triggers 中的 "猫砂"
    const result = scoreCompanionMemory(dummyMemory, '今天下班得去买点猫砂', 1700000000000);
    assert.ok(result !== null);
    assert.equal(result.id, 'mem_cat_1');
    assert.equal(result.matchedChannel, 'trigger');
    assert.ok(result.score > 0.3, `Score should be high, got ${result.score}`);
  });

  await t.test('Punctuation robustness: 2-char query with special punctuation never crashes and recalls memory', () => {
    // 带有全半角特殊符号与 SQL 敏感标点的两字查询
    const cleanTerms = sanitizeAndExtractFtsTerms('猫砂？！"*');
    assert.deepEqual(cleanTerms, ['猫砂']);

    const result = scoreCompanionMemory(dummyMemory, '猫砂？！"*', 1700000000000);
    assert.ok(result !== null);
    assert.equal(result.id, 'mem_cat_1');
    assert.ok(result.score > 0.3);
  });

  await t.test('Channel 3: Entity co-occurrence match', () => {
    // 用户输入未直接提及猫砂，但提及实体 MacBook
    const result = scoreCompanionMemory(dummyMemory, '新换的MacBook屏幕真亮', 1700000000000);
    assert.ok(result !== null);
    assert.equal(result.id, 'mem_cat_1');
    assert.ok(result.score > 0.1);
  });

  await t.test('Channel 4: Temporal intent detects time words on ongoing events', () => {
    const ongoingEventMemory = {
      id: 'mem_event_1',
      roleCardId: 'role_1',
      space: 'normal',
      tier: 'L2_EPISODIC',
      category: 'ongoing_threads',
      content: '约定周一下午论文答辩结束后第一时间给伴侣报喜，晚上一起连麦庆功',
      triggerKeywords: ['答辩', '论文', '庆功'],
      entities: ['entity:答辩'],
      importance: 9,
      hitCount: 5,
      isPinned: true,
      createdAt: 1700000000000,
      lastAccessedAt: 1700000000000,
      sourceMode: 'im',
    };

    const result = scoreCompanionMemory(ongoingEventMemory, '明天下午答辩我好紧张啊', 1700000000000);
    assert.ok(result !== null);
    assert.ok(result.score > 0.4);
  });

  await t.test('Zero false positives on completely unrelated inputs', () => {
    const result = scoreCompanionMemory(dummyMemory, '股市今天大盘暴跌了八十点', 1700000000000);
    assert.equal(result, null, 'Unrelated input must return null');
  });
});
