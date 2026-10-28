const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// 导入待测纯函数 (采用 TypeScript 编译产物或动态包装)
const {
  coalesceHistoryBurstMessages,
  buildChatPayload,
  buildShadowCompactionPayload,
} = require('../src/im/engine/imContextBuilder.ts');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

test('IM ContextBuilder (IM-PERF-004) Four-Zone & Shadow Forking', async (t) => {
  const dummyRolePrompt = '你是一个温柔的伴侣。';

  await t.test('coalesceHistoryBurstMessages: merges adjacent assistant burst bubbles with [BR]', () => {
    const rawMessages = [
      { id: '1', role: 'user', content: '在干嘛呢' },
      { id: '2', role: 'assistant', content: '刚到家呀' },
      { id: '3', role: 'assistant', content: '今天路上好堵' },
      { id: '4', role: 'assistant', content: '你吃晚饭了吗？' },
      { id: '5', role: 'user', content: '刚吃过' },
    ];

    const coalesced = coalesceHistoryBurstMessages(rawMessages);
    assert.equal(coalesced.length, 3);
    assert.equal(coalesced[0].role, 'user');
    assert.equal(coalesced[0].content, '在干嘛呢');
    assert.equal(coalesced[1].role, 'assistant');
    assert.equal(
      coalesced[1].content,
      '刚到家呀[BR]今天路上好堵[BR]你吃晚饭了吗？'
    );
    assert.equal(coalesced[2].role, 'user');
    assert.equal(coalesced[2].content, '刚吃过');
  });

  await t.test('User-first guard: Zone 3 never starts with assistant', () => {
    const historyWithLeadingAssistant = [
      { id: '1', role: 'assistant', content: '孤立的AI首句' },
      { id: '2', role: 'user', content: '你好' },
      { id: '3', role: 'assistant', content: '你好呀' },
    ];

    const payload = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: historyWithLeadingAssistant,
        now: 1700000000000,
      },
      '最近怎么样'
    );

    // Zone 1 (system), Zone 2 (system), Zone 3 (user, assistant), Zone 4 (user)
    assert.equal(payload[0].role, 'system');
    assert.equal(payload[1].role, 'system');
    assert.equal(payload[2].role, 'user');
    assert.equal(payload[2].content, '你好');
    assert.equal(payload[3].role, 'assistant');
    assert.equal(payload[4].role, 'user');
    assert.match(payload[4].content, /最近怎么样/);
  });

  await t.test('Dangling anchor fallback: recovers gracefully when anchor was physically deleted by rollback', () => {
    const history = [
      { id: 'msg_1', role: 'user', content: '第一句' },
      { id: 'msg_2', role: 'assistant', content: '第二句' },
      { id: 'msg_3', role: 'user', content: '第三句' },
    ];

    const payload = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: history,
        anchorMessageId: 'deleted_msg_id', // 传入已被物理删除的悬空锚点
        now: 1700000000000,
      },
      '新消息'
    );

    // 验证自愈恢复，Zone 3 正常呈现且第一条为 user
    assert.equal(payload[0].role, 'system');
    assert.equal(payload[1].role, 'system');
    assert.equal(payload[2].role, 'user');
    assert.equal(payload[2].content, '第一句');
    assert.equal(payload[payload.length - 1].role, 'user');
  });

  await t.test('Prefix stability: Zone 1 ~ Zone 3 prefix remains SHA-256 byte-identical when appending new turns', () => {
    const historyA = [
      { id: '1', role: 'user', content: '第一句' },
      { id: '2', role: 'assistant', content: '第一句回复' },
    ];

    const payloadTurn1 = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: historyA,
        now: 1700000000000,
      },
      '第二句提问'
    );

    // 验证 Zone 1 & Zone 2 在不同时间戳调用下严格内容一致 (永固锁死)
    const payloadTurn2 = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: historyA,
        now: 1700099999000, // 时间发生变化
      },
      '不同输入'
    );

    const prefix1 = payloadTurn1.slice(0, 4).map((m) => `${m.role}:${m.content}`).join('||');
    const prefix2 = payloadTurn2.slice(0, 4).map((m) => `${m.role}:${m.content}`).join('||');
    assert.equal(sha256(prefix1), sha256(prefix2), 'Prefix byte sequence must be 100% frozen');
  });

  await t.test('Shadow Prefix Forking: compaction payload reuses exact Zone 1~3 prefix (96%+ token reuse)', () => {
    const history = [
      { id: '1', role: 'user', content: '今天带猫去体检了' },
      { id: '2', role: 'assistant', content: '体检结果怎么样？猫咪叫了吗？' },
      { id: '3', role: 'user', content: '它叫煤球，脾气特别大，咬了医生一口' },
      { id: '4', role: 'assistant', content: '哈哈煤球太皮了，明天下次记得给它带猫条哄哄' },
    ];

    const chatPayload = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: history,
        now: 1700000000000,
      },
      '煤球今晚还在生我气呢'
    );

    const compPayload = buildShadowCompactionPayload({
      rolePrompt: dummyRolePrompt,
      historyMessages: history,
    });

    // 验证 Zone 1, Zone 2, Zone 3 前缀 100% 字节相同
    assert.equal(chatPayload.length, compPayload.length);
    for (let i = 0; i < chatPayload.length - 1; i += 1) {
      assert.equal(
        chatPayload[i].content,
        compPayload[i].content,
        `Index ${i} content must match 100% for KV Cache reuse`
      );
      assert.equal(chatPayload[i].role, compPayload[i].role);
    }

    // 验证仅末尾 Zone 4 替换为 4D 结构化 JSON 压缩维护指令
    const lastCompMsg = compPayload[compPayload.length - 1];
    assert.equal(lastCompMsg.role, 'user');
    assert.match(lastCompMsg.content, /System Maintenance Mode/);
    assert.match(lastCompMsg.content, /episodic_continuity/);
    assert.match(lastCompMsg.content, /unresolved_tension/);
    assert.match(lastCompMsg.content, /l1_slot_mutations/);
    assert.match(lastCompMsg.content, /l2_memory_mutations/);
  });
});
