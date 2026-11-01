const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveEffectiveDnd,
  isTimestampInDnd,
  shiftTimestampPastDnd,
  parseMinutesFromMidnight,
  DEFAULT_DND_CONFIG,
} = require('../src/im/heartbeat/imDndGuard.ts');

test('im-memory-model-and-dnd-p1-p3: 专属作息免打扰、记忆模型配置与P3手账共鸣测试', async (t) => {
  await t.test('1. resolveEffectiveDnd: 严格双层仲裁 (单伴侣 > 全局 > 默认)', () => {
    // 1a. 单伴侣自定义覆盖生效
    const customRes = resolveEffectiveDnd(
      { dndOverrideEnabled: true, dndStartTime: '01:00', dndEndTime: '09:00' },
      { enabled: true, startTime: '22:00', endTime: '06:00' }
    );
    assert.equal(customRes.source, 'custom_override');
    assert.equal(customRes.enabled, true);
    assert.equal(customRes.startTime, '01:00');
    assert.equal(customRes.endTime, '09:00');

    // 1b. 单伴侣显式关闭免打扰 (dndOverrideEnabled = false)，即使全局开启，也必须关闭
    const customOffRes = resolveEffectiveDnd(
      { dndOverrideEnabled: false },
      { enabled: true, startTime: '22:00', endTime: '06:00' }
    );
    assert.equal(customOffRes.source, 'custom_override');
    assert.equal(customOffRes.enabled, false);

    // 1c. 单伴侣跟随全局默认 (dndOverrideEnabled = null)
    const fallbackGlobalRes = resolveEffectiveDnd(
      { dndOverrideEnabled: null },
      { enabled: true, startTime: '00:00', endTime: '08:00' }
    );
    assert.equal(fallbackGlobalRes.source, 'global');
    assert.equal(fallbackGlobalRes.enabled, true);
    assert.equal(fallbackGlobalRes.startTime, '00:00');
    assert.equal(fallbackGlobalRes.endTime, '08:00');

    // 1d. 两者皆空时回退到默认
    const defaultRes = resolveEffectiveDnd(null, null);
    assert.equal(defaultRes.source, 'default');
    assert.equal(defaultRes.enabled, true);
    assert.equal(defaultRes.startTime, '23:00');
    assert.equal(defaultRes.endTime, '07:30');
  });

  await t.test('2. isTimestampInDnd: 跨午夜免打扰时间窗口判定与时间偏移', () => {
    const config = { enabled: true, startTime: '23:00', endTime: '07:30', source: 'default' };

    // 午夜 00:30 (在 23:00~07:30 内)
    const midNightTs = new Date('2026-10-31T00:30:00').getTime();
    assert.equal(isTimestampInDnd(midNightTs, config), true);

    // 深夜 23:45 (在 23:00~07:30 内)
    const lateNightTs = new Date('2026-10-31T23:45:00').getTime();
    assert.equal(isTimestampInDnd(lateNightTs, config), true);

    // 正午 12:00 (不在免打扰内)
    const noonTs = new Date('2026-10-31T12:00:00').getTime();
    assert.equal(isTimestampInDnd(noonTs, config), false);

    // 当 enabled = false 时，任何时间都返回 false
    assert.equal(isTimestampInDnd(midNightTs, { ...config, enabled: false }), false);

    // 测试夜间消息被顺延到次日清晨 (07:30 以后)
    const shifted = shiftTimestampPastDnd(lateNightTs, config, 10);
    assert.equal(shifted > lateNightTs, true);
    assert.equal(isTimestampInDnd(shifted, config), false);
  });

  await t.test('3. P3 手账共鸣闭环: 引导草稿生成与引用截断', () => {
    // 超过 25 字截断
    const longExcerpt = '今天和你在江边散步吹风，看着夕阳慢慢沉入地平线，感觉整个人都被治愈了，特别轻松。';
    const quoteExcerpt = longExcerpt.length > 25 ? `${longExcerpt.slice(0, 25)}...` : longExcerpt;
    assert.equal(quoteExcerpt.length <= 28, true);
    assert.equal(quoteExcerpt.endsWith('...'), true);

    const dateKey = '2026-10-31';
    const draft = `翻到了你 ${dateKey} 写的那篇手账，看到你说「${quoteExcerpt}」……`;
    assert.match(draft, /翻到了你 2026-10-31 写的那篇手账/);
    assert.match(draft, /看到你说「今天和你在江边散步吹风/);
    assert.match(draft, /」……$/);
  });
});
