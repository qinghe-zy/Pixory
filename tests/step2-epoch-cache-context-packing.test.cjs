const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// 1. 验证 imContextBuilder: 零突变表情历史、语音预处理、锚点物理上限与去重
const {
  coalesceHistoryBurstMessages,
  sliceAnchoredHistory,
  computeMidEpochDeltaFacts,
} = require('../src/im/engine/imContextBuilder.ts');

// 2. 验证 streamClient: 多模态安全的 Layer 4 折叠与跨协议规范化
const {
  mergeLayer4IntoUserContent,
  normalizeMessagesForTransport,
} = require('../src/core/llm-transport/streamClient.ts');

test('IM Step 2: Layer 3 历史表情标签零突变铁律 (跨回合全周期恒定)', () => {
  // 模拟一个包含贴纸的 assistant 历史消息
  const messages = [
    {
      id: 'm1',
      role: 'assistant',
      type: 'sticker',
      content: 'hug',
      metadata: { sticker: { name: '抱抱' } },
      createdAt: '2026-11-07T10:00:00Z',
    },
    // 追加 6 轮用户和伴侣对话，使 m1 的 turnDistance 达到 6
    { id: 'u1', role: 'user', type: 'text', content: '轮次1', createdAt: '2026-11-07T10:01:00Z' },
    { id: 'a1', role: 'assistant', type: 'text', content: '回复1', createdAt: '2026-11-07T10:01:05Z' },
    { id: 'u2', role: 'user', type: 'text', content: '轮次2', createdAt: '2026-11-07T10:02:00Z' },
    { id: 'a2', role: 'assistant', type: 'text', content: '回复2', createdAt: '2026-11-07T10:02:05Z' },
    { id: 'u3', role: 'user', type: 'text', content: '轮次3', createdAt: '2026-11-07T10:03:00Z' },
    { id: 'a3', role: 'assistant', type: 'text', content: '回复3', createdAt: '2026-11-07T10:03:05Z' },
  ];

  const coalesced = coalesceHistoryBurstMessages(messages);
  const firstAssistant = coalesced.find((m) => m.role === 'assistant');
  assert.ok(firstAssistant, '必须包含首条 assistant 消息');
  // 必须依然保留 [STICKER: 抱抱]，绝不允许因为 turnDistance > 2 而静默剪枝导致字节突变！
  assert.match(firstAssistant.content, /\[STICKER: 抱抱\]/);
});

test('IM Step 2: 语音消息在 Burst Coalescing 前安全解构为 [VOICE: ...] 文本', () => {
  const messages = [
    {
      id: 'v1',
      role: 'assistant',
      type: 'voice',
      content: '{"type":"voice","transcription":"大半夜的不睡，就会折腾我"}',
      voice: { transcription: '大半夜的不睡，就会折腾我' },
      createdAt: '2026-11-07T10:00:00Z',
    },
    {
      id: 'v2',
      role: 'assistant',
      type: 'text',
      content: '赶紧去休息啦',
      createdAt: '2026-11-07T10:00:02Z',
    },
  ];

  const coalesced = coalesceHistoryBurstMessages(messages);
  assert.equal(coalesced.length, 1, '应合并为连发气泡');
  assert.match(coalesced[0].content, /\[VOICE: 大半夜的不睡，就会折腾我\]\[BR\]赶紧去休息啦/);
});

test('IM Step 2: sliceAnchoredHistory 具备物理上限安全约束 (防无界膨胀)', () => {
  const total = 50;
  const messages = [];
  for (let i = 0; i < total; i++) {
    messages.push({
      id: `msg_${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      type: 'text',
      content: `内容 ${i}`,
    });
  }

  // 假设锚点停留在第 0 条消息，但窗口设为 5
  const sliced = sliceAnchoredHistory(messages, 5, 'msg_0');
  // maxTurnItems = 5 * 2 = 10，切片绝不能是 50 条全量
  assert.ok(sliced.length <= 11, `切片长度应当受控，实际为: ${sliced.length}`);
});

test('IM Step 2: mergeLayer4IntoUserContent 多模态数组与字符串安全合并 (零 [object Object])', () => {
  const anchor = '当前情境 | 周三 21:20 (夜晚)\n• 伴侣状态: 在线';

  // 1. 纯文本场景
  const textUserContent = '今天好累呀';
  const mergedText = mergeLayer4IntoUserContent(textUserContent, anchor);
  assert.equal(typeof mergedText, 'string');
  assert.match(mergedText, /<context_anchor>[\s\S]*<\/context_anchor>\s*今天好累呀/);

  // 2. 多模态图片数组场景
  const multimodalUserContent = [
    { type: 'text', text: '看我拍的小猫' },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,xxxx' } },
  ];
  const mergedMulti = mergeLayer4IntoUserContent(multimodalUserContent, anchor);
  assert.ok(Array.isArray(mergedMulti), '多模态必须依然返回数组');
  assert.equal(mergedMulti.length, 2);
  assert.match(mergedMulti[0].text, /<context_anchor>[\s\S]*<\/context_anchor>\s*看我拍的小猫/);
  assert.equal(mergedMulti[1].type, 'image_url');
  assert.equal(mergedMulti[1].image_url.url, 'data:image/jpeg;base64,xxxx');
  assert.doesNotMatch(JSON.stringify(mergedMulti), /\[object Object\]/);
});

test('IM Step 2: normalizeMessagesForTransport 跨厂商协议收敛与 Anthropic 缓存声明', () => {
  const rawPayload = [
    { role: 'system', content: 'Layer 1: 人设与协议' },
    { role: 'system', content: 'Layer 2: 核心记忆画像' },
    { role: 'user', content: '你好呀' },
    { role: 'assistant', content: '在呢，怎么啦？' },
    { role: 'system', content: 'Layer 4: 动态场记锚点' }, // 后置的 system 节点
    { role: 'user', content: '分享今天拍的照片' },
  ];

  // 1. OpenAI / DeepSeek 协议规范化
  const standardRes = normalizeMessagesForTransport(rawPayload, 'openai_compatible');
  const stdMsgs = standardRes.normalizedMessages;
  // 必须且仅有开头的 system 节点为 system，后置的 Layer 4 必须折叠进末尾 user
  assert.equal(stdMsgs[0].role, 'system');
  assert.equal(stdMsgs[1].role, 'system');
  assert.equal(stdMsgs[2].role, 'user');
  assert.equal(stdMsgs[3].role, 'assistant');
  assert.equal(stdMsgs[4].role, 'user'); // Layer 4 被安全折叠
  assert.match(stdMsgs[4].content, /<context_anchor>[\s\S]*Layer 4: 动态场记锚点[\s\S]*<\/context_anchor>/);
  assert.equal(stdMsgs.length, 5);

  // 2. Anthropic 协议规范化 (包含 Ephemeral 缓存标记)
  const anthropicRes = normalizeMessagesForTransport(rawPayload, 'anthropic');
  assert.ok(anthropicRes.anthropicSystem, 'Anthropic 必须生成独立 system 结构');
  assert.equal(anthropicRes.anthropicSystem[0].cache_control.type, 'ephemeral');
  assert.equal(anthropicRes.anthropicMessages.length, 3); // 2 条历史 + 1 条折叠后的 user
});

test('IM Step 2: computeMidEpochDeltaFacts 双重去重 (ID 与 文本内容)', () => {
  const activeFactsJson = JSON.stringify([
    { id: 'f1', content: '喜欢吃辣' },
    { id: 'f2', content: '养了一只小猫叫煤球' },
  ]);

  const liveFacts = [
    { id: 'f1', content: '喜欢吃辣' }, // 已存在 ID
    { id: 'f3_new_id', content: '养了一只小猫叫煤球' }, // 不同 ID 但相同文本内容
    { id: 'f4', content: '明天要考科三' }, // 全新事实
  ];

  const deltas = computeMidEpochDeltaFacts(liveFacts, activeFactsJson);
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].id, 'f4');
  assert.equal(deltas[0].content, '明天要考科三');
});

test('IM Step 2: peekThreadPendingDiaryHook 与 ackThreadPendingDiaryHook 契约与 SQLite 事务仿真', () => {
  // 1. 契约校验
  const repoPath = path.resolve(__dirname, '../src/im/repository/imThreadRepository.ts');
  const repoContent = fs.readFileSync(repoPath, 'utf8');
  assert.match(repoContent, /export async function peekThreadPendingDiaryHook/);
  assert.match(repoContent, /export async function ackThreadPendingDiaryHook/);
  assert.match(repoContent, /export async function consumeThreadPendingDiaryHook/);

  // 2. SQLite 行为仿真
  const memDb = new DatabaseSync(':memory:');
  memDb.exec(`
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY,
      pending_diary_hook TEXT
    );
  `);

  memDb.prepare(`INSERT INTO ai_threads (id, pending_diary_hook) VALUES (?, ?);`).run(
    't1',
    '2026-11-06: 第一次看海 - 吹着海风好惬意'
  );

  // 模拟 peek: 查询但不修改
  const peekStmt = memDb.prepare(`SELECT pending_diary_hook FROM ai_threads WHERE id = ? LIMIT 1;`);
  const peek1 = peekStmt.get('t1');
  assert.match(peek1.pending_diary_hook, /第一次看海/);

  // 再次 peek: 依然存在
  const peek2 = peekStmt.get('t1');
  assert.equal(peek2.pending_diary_hook, peek1.pending_diary_hook);

  // 模拟 ack: 显式置空
  memDb.prepare(`UPDATE ai_threads SET pending_diary_hook = NULL WHERE id = ?;`).run('t1');
  const peek3 = peekStmt.get('t1');
  assert.equal(peek3.pending_diary_hook, null);
});
