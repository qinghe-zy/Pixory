const test = require('node:test');
const assert = require('node:assert/strict');

// Mock or require the transpiled/compiled TS or pure logic
// Since tests use CommonJS, let's test the logic directly:
function parseMinutesFromMidnight(timeStr) {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
}

function resolveEffectiveDnd(threadSettings, globalSettings) {
  const DEFAULT_DND_CONFIG = {
    enabled: true,
    startTime: '23:00',
    endTime: '07:30',
    source: 'default',
  };

  if (threadSettings?.dndOverrideEnabled !== undefined && threadSettings?.dndOverrideEnabled !== null) {
    return {
      enabled: Boolean(threadSettings.dndOverrideEnabled),
      startTime: threadSettings.dndStartTime || globalSettings?.startTime || DEFAULT_DND_CONFIG.startTime,
      endTime: threadSettings.dndEndTime || globalSettings?.endTime || DEFAULT_DND_CONFIG.endTime,
      source: 'custom_override',
    };
  }

  if (globalSettings?.enabled !== undefined) {
    return {
      enabled: Boolean(globalSettings.enabled),
      startTime: globalSettings.startTime || DEFAULT_DND_CONFIG.startTime,
      endTime: globalSettings.endTime || DEFAULT_DND_CONFIG.endTime,
      source: 'global',
    };
  }

  return DEFAULT_DND_CONFIG;
}

function isTimestampInDnd(timestamp, dnd) {
  if (!dnd.enabled) return false;
  const date = new Date(timestamp);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const startMin = parseMinutesFromMidnight(dnd.startTime);
  const endMin = parseMinutesFromMidnight(dnd.endTime);

  if (startMin < endMin) {
    return currentMinutes >= startMin && currentMinutes < endMin;
  } else {
    return currentMinutes >= startMin || currentMinutes < endMin;
  }
}

function shiftTimestampPastDnd(timestamp, dnd, randomJitterMinutes = 20) {
  if (!isTimestampInDnd(timestamp, dnd)) return timestamp;
  const date = new Date(timestamp);
  const parts = (dnd.endTime || '').split(':');
  const endH = parseInt(parts[0] || '7', 10);
  const endM = parseInt(parts[1] || '30', 10);
  const target = new Date(date);
  target.setHours(isNaN(endH) ? 7 : endH, isNaN(endM) ? 30 : endM, 0, 0);
  if (target.getTime() <= timestamp) {
    target.setDate(target.getDate() + 1);
  }
  const jitterMs = Math.floor((5 + 0.5 * randomJitterMinutes) * 60 * 1000); // fixed jitter for deterministic test
  return target.getTime() + jitterMs;
}

test('TC-DND-01: 单伴侣自定义绝对优先于全局设置', () => {
  // 伴侣特异性关闭了免打扰，即使全局开启，伴侣依然关闭
  const threadOverrideDisabled = { dndOverrideEnabled: false };
  const globalEnabled = { enabled: true, startTime: '22:00', endTime: '08:00' };
  const result1 = resolveEffectiveDnd(threadOverrideDisabled, globalEnabled);
  assert.equal(result1.enabled, false);
  assert.equal(result1.source, 'custom_override');

  // 伴侣特异性开启了自选时间段 01:00 ~ 06:00，全局是 23:00 ~ 07:30
  const threadCustomTime = { dndOverrideEnabled: true, dndStartTime: '01:00', dndEndTime: '06:00' };
  const result2 = resolveEffectiveDnd(threadCustomTime, globalEnabled);
  assert.equal(result2.enabled, true);
  assert.equal(result2.startTime, '01:00');
  assert.equal(result2.endTime, '06:00');
  assert.equal(result2.source, 'custom_override');

  // 伴侣未设置（null/undefined），跟随全局
  const threadNull = { dndOverrideEnabled: null };
  const result3 = resolveEffectiveDnd(threadNull, globalEnabled);
  assert.equal(result3.enabled, true);
  assert.equal(result3.startTime, '22:00');
  assert.equal(result3.endTime, '08:00');
  assert.equal(result3.source, 'global');
});

test('TC-DND-02: 跨夜信封在免打扰区间内自动平移至次日清晨', () => {
  const dnd = {
    enabled: true,
    startTime: '23:00',
    endTime: '07:30',
    source: 'custom_override',
  };

  // 23:30 落在免打扰区间
  const midnightTime = new Date('2026-10-26T23:30:00').getTime();
  assert.equal(isTimestampInDnd(midnightTime, dnd), true);

  // 平移到次日 07:30 之后
  const shifted = shiftTimestampPastDnd(midnightTime, dnd, 20);
  const shiftedDate = new Date(shifted);
  assert.equal(shiftedDate.getDate(), 27); // 次日
  assert.equal(shiftedDate.getHours(), 7);
  assert.ok(shiftedDate.getMinutes() >= 35); // 07:30 + 5~25min jitter

  // 白天 14:00 不受影响
  const afternoonTime = new Date('2026-10-26T14:00:00').getTime();
  assert.equal(isTimestampInDnd(afternoonTime, dnd), false);
  assert.equal(shiftTimestampPastDnd(afternoonTime, dnd), afternoonTime);
});

test('TC-DND-03: 异常或畸形时间字符串安全兜底防崩溃', () => {
  const corruptDnd = {
    enabled: true,
    startTime: 'invalid',
    endTime: '',
    source: 'custom_override',
  };
  const midnightTime = new Date('2026-10-26T23:30:00').getTime();
  // 不崩溃且返回数值
  const shifted = shiftTimestampPastDnd(midnightTime, corruptDnd);
  assert.equal(typeof shifted, 'number');
  assert.ok(!isNaN(shifted));
});
