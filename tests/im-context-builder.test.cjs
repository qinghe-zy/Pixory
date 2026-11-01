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

  await t.test('coalesceHistoryBurstMessages: preserves system_notice as user-visible action prompt for AI self-awareness', () => {
    const rawMessages = [
      { id: '1', role: 'user', content: '好无聊啊' },
      { id: '2', role: 'system', type: 'system_notice', content: '星野 拍了拍你的小脑瓜' },
      { id: '3', role: 'user', content: '你干嘛拍我脑袋？' },
    ];

    const coalesced = coalesceHistoryBurstMessages(rawMessages);
    assert.equal(coalesced.length, 3);
    assert.equal(coalesced[0].content, '好无聊啊');
    assert.equal(coalesced[1].role, 'user');
    assert.equal(coalesced[1].content, '[系统动作提示: 星野 拍了拍你的小脑瓜]');
    assert.equal(coalesced[2].content, '你干嘛拍我脑袋？');
  });

  await t.test('Synthetic First-Turn Padding: protects leading assistant greeting from deletion', () => {
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

    // Layer 1 (system), Layer 3 (padded user event, assistant, user, assistant), Layer 4 (@D1 system), Layer 5 (user)
    assert.equal(payload[0].role, 'system');
    assert.equal(payload[1].role, 'user');
    assert.equal(payload[1].content, '[系统事件: 会话开始]');
    assert.equal(payload[2].role, 'assistant');
    assert.equal(payload[2].content, '孤立的AI首句');
    assert.equal(payload[3].role, 'user');
    assert.equal(payload[3].content, '你好');
    assert.equal(payload[4].role, 'assistant');
    assert.equal(payload[4].content, '你好呀');
    assert.equal(payload[5].role, 'system');
    assert.match(payload[5].content, /当前情境/);
    assert.equal(payload[6].role, 'user');
    assert.match(payload[6].content, /最近怎么样/);
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

    // 验证自愈恢复，Layer 3 正常呈现且第一条为 user
    assert.equal(payload[0].role, 'system');
    assert.equal(payload[1].role, 'user');
    assert.equal(payload[1].content, '第一句');
    assert.equal(payload[payload.length - 1].role, 'user');
  });

  await t.test('Prefix stability: Layer 1 ~ Layer 3 prefix remains SHA-256 byte-identical when appending new turns', () => {
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

    // 验证 Layer 1 & 历史视窗在不同时间戳调用下严格内容一致 (永固锁死)
    const payloadTurn2 = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: historyA,
        now: 1700099999000, // 时间发生变化
      },
      '不同输入'
    );

    const prefix1 = payloadTurn1.slice(0, 3).map((m) => `${m.role}:${m.content}`).join('||');
    const prefix2 = payloadTurn2.slice(0, 3).map((m) => `${m.role}:${m.content}`).join('||');
    assert.equal(sha256(prefix1), sha256(prefix2), 'Prefix byte sequence must be 100% frozen');
  });

  await t.test('Shadow Prefix Forking: compaction payload reuses exact Layer 1 & Layer 3 prefix', () => {
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

    // 验证 Layer 1 与 Layer 3 历史视窗 100% 字节相同（前 5 项）
    assert.equal(compPayload.length, 6); // 1 system + 4 history + 1 compaction
    for (let i = 0; i < 5; i += 1) {
      assert.equal(
        chatPayload[i].content,
        compPayload[i].content,
        `Index ${i} content must match 100% for KV Cache reuse`
      );
      assert.equal(chatPayload[i].role, compPayload[i].role);
    }

    // 验证仅末尾替换为 4D 结构化 JSON 压缩维护指令
    const lastCompMsg = compPayload[compPayload.length - 1];
    assert.equal(lastCompMsg.role, 'user');
    assert.match(lastCompMsg.content, /System Maintenance Mode/);
    assert.match(lastCompMsg.content, /episodic_continuity/);
    assert.match(lastCompMsg.content, /unresolved_tension/);
    assert.match(lastCompMsg.content, /l1_slot_mutations/);
    assert.match(lastCompMsg.content, /l2_memory_mutations/);
  });

  await t.test('Burst Deduplication: strips multiple trailing burst user messages from Layer 3', () => {
    const burstHistory = [
      { id: '1', role: 'user', content: '昨天聊到哪里了' },
      { id: '2', role: 'assistant', content: '聊到你打算去图书馆' },
      { id: '3', role: 'user', content: '我今天打算去图书馆自习' },
      { id: '4', role: 'user', content: '顺便把高数题刷完' },
      { id: '5', role: 'user', content: '晚上再回去' },
    ];

    const aggregatedInput = '我今天打算去图书馆自习\n顺便把高数题刷完\n晚上再回去';

    const payload = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: burstHistory,
        now: 1700000000000,
      },
      aggregatedInput
    );

    // 验证 Layer 3 末尾切除属于当前连发批次的消息，只保留之前的对话
    const historyRoles = payload.filter((m, idx) => idx > 0 && idx < payload.length - 2);
    assert.equal(historyRoles.length, 2);
    assert.equal(historyRoles[0].content, '昨天聊到哪里了');
    assert.equal(historyRoles[1].content, '聊到你打算去图书馆');

    // 验证 Layer 5 为唯一的聚合输入
    assert.equal(payload[payload.length - 1].role, 'user');
    assert.equal(payload[payload.length - 1].content, aggregatedInput);
  });

  await t.test('Proactive Followup: closes with synthetic user event and absorbs directive into Layer 4', () => {
    const proactiveHistory = [
      { id: '1', role: 'user', content: '先去忙啦' },
      { id: '2', role: 'assistant', content: '好呀，忙完见' },
    ];

    const directive = '[系统提示: 对方已经停顿了 1 分钟。请发一句短问候]';
    const payload = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: proactiveHistory,
        now: 1700000000000,
      },
      directive
    );

    // 验证 Layer 4 吸收追聊指令
    const layer4 = payload[payload.length - 2];
    assert.equal(layer4.role, 'system');
    assert.match(layer4.content, /对方已经停顿了 1 分钟/);

    // 验证 Layer 5 闭合为标准 user 触发事件，彻底杜绝尾部 system 导致的 API 报错
    const layer5 = payload[payload.length - 1];
    assert.equal(layer5.role, 'user');
    assert.equal(layer5.content, '[系统事件: 已到预定联系时间，请主动发送消息]');
  });

  await t.test('Micro-timestamp coalescing: inserts [HH:mm 主动发消息] when interval >= 5min', () => {
    const rawMessages = [
      { id: '1', role: 'user', content: '我去图书馆啦', createdAt: '2026-10-28T13:20:00.000Z' },
      { id: '2', role: 'assistant', content: '好的去吧，注意安全！', createdAt: '2026-10-28T13:20:05.000Z' },
      // 75 minutes later, companion sends proactive message
      { id: '3', role: 'assistant', content: '图书馆闭馆了吧？到宿舍没呀', createdAt: '2026-10-28T14:35:00.000Z' },
    ];

    const coalesced = coalesceHistoryBurstMessages(rawMessages);
    assert.equal(coalesced.length, 2);
    assert.equal(coalesced[0].role, 'user');
    assert.equal(coalesced[1].role, 'assistant');
    // Notice: 14:35 UTC is 22:35 in UTC+8
    const d = new Date('2026-10-28T14:35:00.000Z');
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    assert.equal(
      coalesced[1].content,
      `好的去吧，注意安全！[BR][${hh}:${mm} 主动发消息] 图书馆闭馆了吧？到宿舍没呀`
    );
  });

  await t.test('Wakeup Ping: Layer 4 and Layer 5 formatted for scheduled proactive alarm', () => {
    const history = [
      { id: '1', role: 'user', content: '去洗澡啦' },
      { id: '2', role: 'assistant', content: '去吧去吧' },
    ];

    const payload = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: history,
        now: new Date('2026-10-28T14:45:00.000Z').getTime(),
        isWakeupPing: true,
        pingIntent: '问问洗完没',
      },
      ''
    );

    const layer4 = payload[payload.length - 2];
    assert.equal(layer4.role, 'system');
    assert.match(layer4.content, /\[主动联系唤醒/);
    assert.match(layer4.content, /问问洗完没/);

    const layer5 = payload[payload.length - 1];
    assert.equal(layer5.role, 'user');
    assert.equal(layer5.content, '[系统事件: 预约闹钟到期唤醒，请主动发起问候]');
  });
});
