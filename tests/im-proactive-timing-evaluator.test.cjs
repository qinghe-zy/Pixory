const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

function loadModule(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(require, mod, mod.exports);
  return mod.exports;
}

const {
  parseDelayStringToMs,
  detectSituationalDelay,
  parseProactiveDecision,
  buildProactivePromptDirective,
} = loadModule('../src/im/engine/proactiveTimingEvaluator.ts');

test('ProactiveTimingEvaluator: 伴侣自主追聊与时钟感知决策机测试', async (t) => {
  await t.test('1. parseDelayStringToMs: 时间字符串解析', () => {
    assert.equal(parseDelayStringToMs('1m'), 60000);
    assert.equal(parseDelayStringToMs('45m'), 45 * 60 * 1000);
    assert.equal(parseDelayStringToMs('2h'), 2 * 3600 * 1000);
    assert.equal(parseDelayStringToMs('1d'), 86400 * 1000);
    assert.equal(parseDelayStringToMs('1分钟'), 60000);
    assert.equal(parseDelayStringToMs('30分钟'), 30 * 60 * 1000);
    assert.equal(parseDelayStringToMs('2小时'), 2 * 3600 * 1000);
    assert.equal(parseDelayStringToMs('pass'), 0);
    assert.equal(parseDelayStringToMs('none'), 0);
    assert.equal(parseDelayStringToMs('0'), 0);
    assert.equal(parseDelayStringToMs('不需要'), 0);
    assert.equal(parseDelayStringToMs('不用'), 0);
    assert.equal(parseDelayStringToMs('invalid'), 60000);
  });

  await t.test('2. detectSituationalDelay: 用户特定场景时长判定', () => {
    const meeting = detectSituationalDelay('我先去开会了，晚点聊');
    assert.ok(meeting);
    assert.equal(meeting.scenario, 'meeting');
    assert.equal(meeting.delayMs, 45 * 60 * 1000);

    const bath = detectSituationalDelay('先去洗澡啦');
    assert.ok(bath);
    assert.equal(bath.scenario, 'bath');
    assert.equal(bath.delayMs, 30 * 60 * 1000);

    const meal = detectSituationalDelay('肚子好饿，去做饭了');
    assert.ok(meal);
    assert.equal(meal.scenario, 'meal');
    assert.equal(meal.delayMs, 40 * 60 * 1000);

    const normal = detectSituationalDelay('今天天气真好');
    assert.equal(normal, null);
  });

  await t.test('3. parseProactiveDecision: 大模型决策解析', () => {
    // 判定 PASS
    const passRes = parseProactiveDecision('[PASS]');
    assert.equal(passRes.action, 'pass');

    // 即刻追聊 + 下次期望 1m 观察
    const replyRes = parseProactiveDecision(
      '怎么突然没声音啦？[NUDGE: 脸颊][NEXT_FOLLOWUP: 1m]'
    );
    assert.equal(replyRes.action, 'immediate_reply');
    assert.equal(replyRes.cleanText, '怎么突然没声音啦？');
    assert.equal(replyRes.nudgeAction, '脸颊');
    assert.equal(replyRes.nextFollowupMs, 60000);

    // 模型自主决断后续静默 [NEXT_FOLLOWUP: pass]
    const passDecision = parseProactiveDecision(
      '好啦你先忙，我不吵你啦[NEXT_FOLLOWUP: pass]'
    );
    assert.equal(passDecision.action, 'immediate_reply');
    assert.equal(passDecision.cleanText, '好啦你先忙，我不吵你啦');
    assert.equal(passDecision.nextFollowupMs, 0);

    // 预埋延时信封
    const stageRes = parseProactiveDecision(
      '[STAGE_FOLLOWUP: 45m | 你这会儿应该开完会了吧？辛苦啦！]'
    );
    assert.equal(stageRes.action, 'stage_future');
    assert.equal(stageRes.stagedDelayMs, 45 * 60 * 1000);
    assert.equal(stageRes.stagedText, '你这会儿应该开完会了吧？辛苦啦！');
  });

  await t.test('4. buildProactivePromptDirective: Stage 1, Stage 2 与 Stage 3 提示词', () => {
    const s1 = buildProactivePromptDirective(1, '伴侣');
    assert.ok(s1.includes('对方在聊天界面'));
    assert.ok(s1.includes('[NEXT_FOLLOWUP:'));

    const s2 = buildProactivePromptDirective(2, '伴侣');
    assert.ok(s2.includes('Stage 2') || s2.includes('趣味互动'));
    assert.ok(s2.includes('[NEXT_FOLLOWUP:'));

    const s3 = buildProactivePromptDirective(3, '伴侣');
    assert.ok(s3.includes('Stage 3') || s3.includes('体贴收束'));
    assert.ok(s3.includes('[PING:'));
  });
});
