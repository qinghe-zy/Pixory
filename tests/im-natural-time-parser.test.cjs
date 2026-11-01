const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('fs');

function loadModule(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, () => ({}));
  return m.exports;
}

const { parseNaturalTimeToTimestamp } = loadModule('./src/im/engine/naturalTimeParser.ts');

test('NaturalTimeParser: relative, clock, fuzzy anchors and schedule clamping', async (t) => {
  // 固定基准时间：2026-10-28 周三 14:00:00 (白天)
  const baseDayTime = new Date('2026-10-28T14:00:00+08:00').getTime();

  await t.test('1. Relative English notations (+20s, +45m, +2h, +1d)', () => {
    const r1 = parseNaturalTimeToTimestamp('+20s', baseDayTime);
    assert.equal(r1.delayMs, 20 * 1000);

    const r2 = parseNaturalTimeToTimestamp('+45m', baseDayTime);
    assert.equal(r2.delayMs, 45 * 60 * 1000);

    const r3 = parseNaturalTimeToTimestamp('+2h', baseDayTime);
    assert.equal(r3.delayMs, 2 * 3600 * 1000);

    const r4 = parseNaturalTimeToTimestamp('+1d', baseDayTime);
    assert.equal(r4.delayMs, 24 * 3600 * 1000);
  });

  await t.test('2. Chinese relative notations (半小时后, 一小时后, 两个小时后, 十分钟后)', () => {
    const r1 = parseNaturalTimeToTimestamp('半小时后', baseDayTime);
    assert.equal(r1.delayMs, 30 * 60 * 1000);

    const r2 = parseNaturalTimeToTimestamp('一小时后', baseDayTime);
    assert.equal(r2.delayMs, 60 * 60 * 1000);

    const r3 = parseNaturalTimeToTimestamp('两个小时后', baseDayTime);
    assert.equal(r3.delayMs, 120 * 60 * 1000);

    const r4 = parseNaturalTimeToTimestamp('十分钟后', baseDayTime);
    assert.equal(r4.delayMs, 10 * 60 * 1000);
  });

  await t.test('3. Fuzzy anchor mappings (明早, 明天中午, 明天下午, 明晚, 今晚)', () => {
    const rMorning = parseNaturalTimeToTimestamp('明早', baseDayTime);
    const dMorning = new Date(rMorning.targetTimestamp);
    assert.equal(dMorning.getDate(), 29);
    assert.equal(dMorning.getHours(), 8);
    assert.equal(dMorning.getMinutes(), 30);

    const rNoon = parseNaturalTimeToTimestamp('明天中午', baseDayTime);
    const dNoon = new Date(rNoon.targetTimestamp);
    assert.equal(dNoon.getDate(), 29);
    assert.equal(dNoon.getHours(), 12);
    assert.equal(dNoon.getMinutes(), 30);

    const rNight = parseNaturalTimeToTimestamp('明晚', baseDayTime);
    const dNight = new Date(rNight.targetTimestamp);
    assert.equal(dNight.getDate(), 29);
    assert.equal(dNight.getHours(), 20);
    assert.equal(dNight.getMinutes(), 30);
  });

  await t.test('4. Specific clock notations (22:30 today vs tomorrow roll-over)', () => {
    // 14:00 -> 22:30 (今天晚上)
    const rToday = parseNaturalTimeToTimestamp('22:30', baseDayTime);
    const dToday = new Date(rToday.targetTimestamp);
    assert.equal(dToday.getDate(), 28);
    assert.equal(dToday.getHours(), 22);
    assert.equal(dToday.getMinutes(), 30);

    // 14:00 -> 10:00 (已过，自动滚入明日)
    const rTmrw = parseNaturalTimeToTimestamp('10:00', baseDayTime);
    const dTmrw = new Date(rTmrw.targetTimestamp);
    assert.equal(dTmrw.getDate(), 29);
    assert.equal(dTmrw.getHours(), 10);
    assert.equal(dTmrw.getMinutes(), 0);
  });

  await t.test('5. Living state sleeping & late night schedule clamping (23:30 ~ 07:00 -> 次日 07:30)', () => {
    // 20:00 设定一个 +5h 闹钟 -> 凌晨 01:00
    const baseEightPm = new Date('2026-10-28T20:00:00+08:00').getTime();
    const rClamped = parseNaturalTimeToTimestamp('+5h', baseEightPm);
    assert.ok(rClamped.wasClampedToMorning, 'Must clamp late night alarm to next morning');
    const dClamped = new Date(rClamped.targetTimestamp);
    assert.equal(dClamped.getDate(), 29);
    assert.equal(dClamped.getHours(), 7);
    assert.equal(dClamped.getMinutes(), 30);
  });

  await t.test('6. Boundary protection and fallback for invalid strings', () => {
    // 畸形字符串安全兜底 60 分钟后
    const rFallback = parseNaturalTimeToTimestamp('gibberish_string', baseDayTime);
    assert.equal(rFallback.delayMs, 60 * 60 * 1000);

    // 极小限制保护 (>= 10s)
    const rMin = parseNaturalTimeToTimestamp('+1s', baseDayTime);
    assert.ok(rMin.delayMs >= 10 * 1000);
  });
});
