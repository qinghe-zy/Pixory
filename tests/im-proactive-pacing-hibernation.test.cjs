const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

function transpileFile(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  return ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

test('ProactivePacingGuard: 三阶情感退避时序判定', () => {
  const transpiled = transpileFile('../src/im/heartbeat/proactivePacingGuard.ts');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, () => ({}));

  const { evaluateProactivePacing, HIBERNATION_CUTOFF_MS, TIER1_MIN_DELAY_MS, TIER2_MIN_DELAY_MS } = m.exports;

  const now = 1700000000000;
  const recentUserActive = now - 10 * 60 * 1000; // 10分钟前用户发过言

  // 1. 第 1 轮未回复 (count = 0) -> Tier 1 (30min ~ 2h)
  const dec1 = evaluateProactivePacing(0, recentUserActive, now);
  assert.equal(dec1.allowHeartbeat, true);
  assert.equal(dec1.tier, 1);
  assert.equal(dec1.isHibernating, false);
  assert.ok(dec1.suggestedDelayMs >= TIER1_MIN_DELAY_MS);
  assert.ok(dec1.suggestedDelayMs <= 2 * 3600 * 1000);

  // 2. 第 2 轮未回复 (count = 1) -> Tier 2 (>= 4h)
  const dec2 = evaluateProactivePacing(1, recentUserActive, now);
  assert.equal(dec2.allowHeartbeat, true);
  assert.equal(dec2.tier, 2);
  assert.equal(dec2.isHibernating, false);
  assert.ok(dec2.suggestedDelayMs >= TIER2_MIN_DELAY_MS);

  // 3. 第 3 轮未回复 (count = 2) -> Tier 3 (8~12h 次日清晨)
  const dec3 = evaluateProactivePacing(2, recentUserActive, now);
  assert.equal(dec3.allowHeartbeat, true);
  assert.equal(dec3.tier, 3);
  assert.equal(dec3.isHibernating, false);
  assert.ok(dec3.suggestedDelayMs >= 8 * 3600 * 1000);

  // 4. 连续 3 轮未回复 (count = 3) -> 绝不静默断连，在 72h 内保持心跳主动联系
  const dec4 = evaluateProactivePacing(3, recentUserActive, now);
  assert.equal(dec4.allowHeartbeat, true);
  assert.equal(dec4.isHibernating, false);
  assert.ok(dec4.suggestedDelayMs >= 6 * 3600 * 1000);

  // 5. 72 小时断连终极休眠 (哪怕 count = 0)
  const ancientUserActive = now - (HIBERNATION_CUTOFF_MS + 1000);
  const dec5 = evaluateProactivePacing(0, ancientUserActive, now);
  assert.equal(dec5.allowHeartbeat, false);
  assert.equal(dec5.isHibernating, true);
  assert.equal(dec5.reason, 'hibernating_72h');
});

test('ImDndGuard: 晚安信封语义 TTL 熔断检测', () => {
  const transpiled = transpileFile('../src/im/heartbeat/imDndGuard.ts');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, () => ({}));

  const { isGoodnightMessage, shouldExpireGoodnightEnvelope } = m.exports;

  // 1. 晚安关键词识别
  assert.equal(isGoodnightMessage('晚安啦，早点休息哦'), true);
  assert.equal(isGoodnightMessage('快睡吧，明天还要早起呢'), true);
  assert.equal(isGoodnightMessage('做个好梦~'), true);
  assert.equal(isGoodnightMessage('今天下午吃了草莓大福'), false);

  // 2. 晚安信封在 2 小时内且未推迟到早晨 -> 不熔断 (使用本地时间 22:30)
  const baseDate = new Date(2026, 9, 28, 22, 30, 0);
  const now = baseDate.getTime();
  const scheduledTime = now + 15 * 60 * 1000;
  const isExp1 = shouldExpireGoodnightEnvelope('晚安啦', now, scheduledTime, now + 10 * 60 * 1000);
  assert.equal(isExp1, false);

  // 3. 晚安信封超过 2 小时 -> 语义过期
  const isExp2 = shouldExpireGoodnightEnvelope('晚安啦', now, scheduledTime, now + 3 * 3600 * 1000);
  assert.equal(isExp2, true);

  // 4. 晚安信封被推迟至次日清晨 (8:00 AM) -> 严防早晨道晚安，直接熔断
  const morningDate = new Date(2026, 9, 29, 8, 0, 0);
  const morningScheduledTime = morningDate.getTime();
  const isExp3 = shouldExpireGoodnightEnvelope('快睡吧好梦', now, morningScheduledTime, now + 30 * 60 * 1000);
  assert.equal(isExp3, true);

  // 5. 普通非晚安信封推迟到早晨 -> 不误杀
  const isExp4 = shouldExpireGoodnightEnvelope('明天记得带伞哦', now, morningScheduledTime, now + 30 * 60 * 1000);
  assert.equal(isExp4, false);
});
