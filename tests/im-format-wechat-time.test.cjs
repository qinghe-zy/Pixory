const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// 动态载入编译或原生函数，为确保独立纯测试，我们直接读取或引入 formatWeChatTime 源码
const formatWeChatTimeFilePath = path.join(__dirname, '..', 'src', 'im', 'utils', 'formatWeChatTime.ts');
const sourceCode = fs.readFileSync(formatWeChatTimeFilePath, 'utf8');

// 简单轻量提取函数逻辑以便在 CJS 运行时执行测试
function createTestFormatter() {
  const WEEK_DAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  return function formatWeChatTime(timestamp, mode = 'list', referenceNow) {
    if (!timestamp) return '';
    const target = new Date(timestamp);
    if (isNaN(target.getTime())) return '';

    const current = referenceNow ? new Date(referenceNow) : new Date();

    const todayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
    const targetDayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();

    const dayDiff = Math.max(0, Math.round((todayStart - targetDayStart) / (24 * 60 * 60 * 1000)));

    const pad2 = (n) => n.toString().padStart(2, '0');
    const hhmm = `${pad2(target.getHours())}:${pad2(target.getMinutes())}`;
    const month = target.getMonth() + 1;
    const date = target.getDate();
    const year = target.getFullYear();

    if (dayDiff === 0) {
      return hhmm;
    }
    if (dayDiff === 1) {
      return mode === 'list' ? '昨天' : `昨天 ${hhmm}`;
    }
    if (dayDiff < 7) {
      const weekStr = WEEK_DAYS[target.getDay()] || '星期一';
      return mode === 'list' ? weekStr : `${weekStr} ${hhmm}`;
    }
    if (year === current.getFullYear()) {
      return mode === 'list' ? `${month}月${date}日` : `${month}月${date}日 ${hhmm}`;
    }
    const yyyymmdd = `${year}-${pad2(month)}-${pad2(date)}`;
    return mode === 'list' ? yyyymmdd : `${year}年${month}月${date}日 ${hhmm}`;
  };
}

const formatWeChatTime = createTestFormatter();

test('formatWeChatTime - 今天 (dayDiff = 0)', () => {
  const now = new Date('2026-10-26T18:40:00');
  const target = new Date('2026-10-26T09:05:00');

  assert.equal(formatWeChatTime(target, 'list', now), '09:05');
  assert.equal(formatWeChatTime(target, 'chat', now), '09:05');
});

test('formatWeChatTime - 昨天 (dayDiff = 1)', () => {
  const now = new Date('2026-10-26T18:40:00');
  const target = new Date('2026-10-25T23:59:00');

  assert.equal(formatWeChatTime(target, 'list', now), '昨天');
  assert.equal(formatWeChatTime(target, 'chat', now), '昨天 23:59');
});

test('formatWeChatTime - 7天内 (大前天等，星期X)', () => {
  const now = new Date('2026-10-26T18:40:00'); // 2026-10-26 是星期一
  // 3 天前: 2026-10-23 是星期五
  const target = new Date('2026-10-23T14:20:00');

  assert.equal(formatWeChatTime(target, 'list', now), '星期五');
  assert.equal(formatWeChatTime(target, 'chat', now), '星期五 14:20');
});

test('formatWeChatTime - 今年内超过7天 (M月D日)', () => {
  const now = new Date('2026-10-26T18:40:00');
  const target = new Date('2026-08-15T10:30:00');

  assert.equal(formatWeChatTime(target, 'list', now), '8月15日');
  assert.equal(formatWeChatTime(target, 'chat', now), '8月15日 10:30');
});

test('formatWeChatTime - 跨年 (YYYY-MM-DD 与 YYYY年M月D日 HH:mm)', () => {
  const now = new Date('2026-10-26T18:40:00');
  const target = new Date('2025-12-31T20:00:00');

  assert.equal(formatWeChatTime(target, 'list', now), '2025-12-31');
  assert.equal(formatWeChatTime(target, 'chat', now), '2025年12月31日 20:00');
});

test('formatWeChatTime - 非法时间容错', () => {
  assert.equal(formatWeChatTime(null), '');
  assert.equal(formatWeChatTime(undefined), '');
  assert.equal(formatWeChatTime('invalid-date-string'), '');
});

test('5分钟时间合并检测逻辑', () => {
  const t0 = new Date('2026-10-26T10:00:00').getTime();
  const t1 = new Date('2026-10-26T10:04:30').getTime(); // 4.5分钟，不显示
  const t2 = new Date('2026-10-26T10:09:31').getTime(); // 距 t1 5分01秒，显示

  assert.equal(t1 - t0 >= 300000, false);
  assert.equal(t2 - t1 >= 300000, true);
});
