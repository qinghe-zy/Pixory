const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sliceAnchoredHistory,
  reAnchorHistory,
  roleSanitizerPipeline,
  buildChatPayload,
} = require('../src/im/engine/imContextBuilder.ts');

test('IM ContextBuilder 6 Deep Boundary Guards Defense', async (t) => {
  const dummyRolePrompt = '你是一个贴心的伴侣。';

  await t.test('Boundary 1: Insufficient History (< N) safely falls back to full loading without out-of-bounds error', () => {
    const fewMessages = [
      { id: 'm1', role: 'user', content: '你好' },
      { id: 'm2', role: 'assistant', content: '你好呀！' },
    ];
    // N = 20, but only 2 messages exist
    const sliced = sliceAnchoredHistory(fewMessages, 20);
    assert.equal(sliced.length, 2);
    assert.equal(sliced[0].role, 'user');
    assert.equal(sliced[1].role, 'assistant');
  });

  await t.test('Boundary 2: Dynamic Resizing N triggers on-the-fly re-anchoring', () => {
    const messages = [];
    for (let i = 1; i <= 30; i++) {
      messages.push({ id: `u_${i}`, role: 'user', content: `用户说 ${i}` });
      messages.push({ id: `a_${i}`, role: 'assistant', content: `伴侣回 ${i}` });
    }
    // Initially N = 20
    const anchor20 = reAnchorHistory(messages, 20);
    assert.ok(anchor20);

    // User dynamically resizes N = 10
    const anchor10 = reAnchorHistory(messages, 10);
    assert.ok(anchor10);
    assert.notEqual(anchor10, anchor20);

    // Slice using anchor10 yields exactly 10 turns
    const sliced = sliceAnchoredHistory(messages, 10, anchor10);
    assert.equal(sliced[0].role, 'user');
    assert.ok(sliced.length <= 20);
  });

  await t.test('Boundary 3: Strict Role Alternation drops initial assistant and merges consecutive same-role turns', () => {
    const rawTurns = [
      { role: 'assistant', content: '孤立的开场' },
      { role: 'user', content: '第一句话' },
      { role: 'user', content: '第二句话' },
      { role: 'assistant', content: '回复一' },
      { role: 'assistant', content: '回复二' },
    ];

    const sanitized = roleSanitizerPipeline(rawTurns);
    // 1. Initial assistant must be dropped (forward absorption)
    assert.equal(sanitized[0].role, 'user');
    assert.equal(sanitized[0].content, '第一句话\n第二句话');

    // 2. Consecutive assistants merged with \n
    assert.equal(sanitized[1].role, 'assistant');
    assert.equal(sanitized[1].content, '回复一\n回复二');
    assert.equal(sanitized.length, 2);
  });

  await t.test('Boundary 4: Giant message (> 4000 chars) is folded to protect context budget', () => {
    const giantText = 'A'.repeat(5000);
    const sanitized = roleSanitizerPipeline([{ role: 'user', content: giantText }]);
    assert.equal(sanitized.length, 1);
    assert.ok(sanitized[0].content.length < 3500);
    assert.ok(sanitized[0].content.includes('[...已折叠过长历史片段...]'));
  });

  await t.test('Boundary 5: Temporal awareness injects elapsed time purely as objective fact when > 3 mins', () => {
    const pastTime = new Date('2026-10-25T10:00:00Z').getTime();
    const nowTime = new Date('2026-10-25T10:45:00Z').getTime(); // 45 mins elapsed

    const history = [
      { id: '1', role: 'user', content: '先去开会啦', createdAt: new Date(pastTime).toISOString() },
      { id: '2', role: 'assistant', content: '好呀去吧~', createdAt: new Date(pastTime + 1000).toISOString() },
    ];

    const payload = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: history,
        now: nowTime,
      },
      '我开完会回来啦'
    );

    const userPayload = payload[payload.length - 1];
    assert.equal(userPayload.role, 'user');
    assert.ok(userPayload.content.includes('时间流逝感知: 距离上次交流已过去 44 分钟') || userPayload.content.includes('45 分钟'));
    // Ensure no commanding directive is added
    assert.ok(!userPayload.content.includes('请在回复中流露'));
  });

  await t.test('Boundary 6: Zero-history fallback cleanly skips Zone 2 and Zone 3 on soft reset', () => {
    const payload = buildChatPayload(
      {
        rolePrompt: dummyRolePrompt,
        historyMessages: [],
        now: Date.now(),
      },
      '初次见面'
    );

    // Only Zone 1 (System) and Zone 4 (User) should exist
    assert.equal(payload.length, 2);
    assert.equal(payload[0].role, 'system');
    assert.equal(payload[1].role, 'user');
    assert.ok(payload[1].content.includes('初次见面'));
  });
});
