const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const original = require.extensions['.ts'];
require.extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
let policy;
try { policy = require(path.join(root, 'src/ai/dream/dreamPolicy.ts')); } finally { if (original) require.extensions['.ts'] = original; else delete require.extensions['.ts']; }

test('broad sleep and dream signals map to ordered semantic intents', () => {
  assert.equal(policy.detectDreamIntent('梦里我们站在雨中').intent, 'active_dream_scene');
  assert.equal(policy.detectDreamIntent('我们抱着一起入睡吧').intent, 'shared_sleep_scene');
  assert.equal(policy.detectDreamIntent('她慢慢闭上眼睡着了').intent, 'role_sleep_scene');
  assert.equal(policy.detectDreamIntent('晚安，我有点困了').intent, 'bedtime_signal');
  assert.equal(policy.detectDreamIntent('昨晚我做了个梦').intent, 'past_dream_report');
  assert.equal(policy.detectDreamIntent('*her breathing grows steady* she falls asleep').intent, 'role_sleep_scene');
  assert.equal(policy.detectDreamIntent('失眠和睡眠质量有什么关系').intent, 'sleep_topic');
  assert.equal(policy.detectDreamIntent('她睁开眼醒来了').closing, true);
});

test('manual requests are explicit and automatic frequency is first-dream friendly', () => {
  assert.equal(policy.detectManualDreamRequest('给我生成一张梦境卡片'), true);
  assert.equal(policy.detectManualDreamRequest('昨晚梦见下雨'), false);
  assert.equal(policy.dreamFrequencyAllowed({ totalRounds: 1, lastDreamSuccessRound: null, dailyDreamSuccessCount: 0, dailyDreamReservedCount: 0 }), true);
  assert.equal(policy.dreamFrequencyAllowed({ totalRounds: 50, lastDreamSuccessRound: 1, dailyDreamSuccessCount: 0, dailyDreamReservedCount: 0 }), false);
  assert.equal(policy.dreamFrequencyAllowed({ totalRounds: 51, lastDreamSuccessRound: 1, dailyDreamSuccessCount: 0, dailyDreamReservedCount: 0 }), true);
  assert.equal(policy.dreamFrequencyAllowed({ totalRounds: 80, lastDreamSuccessRound: null, dailyDreamSuccessCount: 2, dailyDreamReservedCount: 0 }), false);
  assert.equal(policy.dreamFrequencyAllowed({ totalRounds: 1, lastDreamSuccessRound: 1, dailyDreamSuccessCount: 2, dailyDreamReservedCount: 0, manual: true }), true);
});

test('rolls are deterministic and selection uses specified probabilities', () => {
  const roll = policy.deterministicDreamRoll('scene-a');
  assert.equal(roll, policy.deterministicDreamRoll('scene-a'));
  assert.ok(roll >= 0 && roll < 1);
  const bedtime = { intentType: 'bedtime_signal', participants: ['user'], temporality: 'current', assertionMode: 'asserted', roleplay: true, evidenceStrength: 'strong', sceneRelation: 'starts', sourceMessageIds: ['m1'], confidence: 0.9 };
  assert.equal(policy.shouldSelectDream(0.09, bedtime), true);
  assert.equal(policy.shouldSelectDream(0.1, bedtime), false);
  assert.equal(policy.shouldSelectDream(0.01, { ...bedtime, assertionMode: 'negated' }), false);
  assert.equal(policy.shouldSelectDream(0.01, { ...bedtime, confidence: 0.6 }), false);
});

test('strict classifier and generator envelopes reject drift and oversized content', () => {
  const classification = { intentType: 'shared_sleep_scene', participants: ['user', 'character'], temporality: 'current', assertionMode: 'asserted', roleplay: true, evidenceStrength: 'strong', sceneRelation: 'starts', sourceMessageIds: ['m1'], confidence: 0.9 };
  assert.deepEqual(policy.parseDreamClassification(JSON.stringify(classification), new Set(['m1'])), classification);
  assert.equal(policy.parseDreamClassification(JSON.stringify({ ...classification, x: 1 }), new Set(['m1'])), null);
  assert.equal(policy.parseDreamClassification(JSON.stringify({ ...classification, sourceMessageIds: ['sibling'] }), new Set(['m1'])), null);
  assert.deepEqual(policy.parseDreamGeneration('{"title":"雾中回声","body":"我沿着月光走进一片安静的雾。"}'), { title: '雾中回声', body: '我沿着月光走进一片安静的雾。' });
  assert.equal(policy.parseDreamGeneration(JSON.stringify({ title: '短', body: 'x' })), null);
  assert.equal(policy.parseDreamGeneration(JSON.stringify({ title: '合格标题', body: '梦'.repeat(221) })), null);
});
