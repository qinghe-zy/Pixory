const test = require('node:test');
const assert = require('node:assert/strict');

// 提取与复现微信语音条宽度增长公式
function calculateVoiceBubbleWidth(durationSec) {
  const minWidth = 72;
  const maxWidth = 232;
  const s = Math.max(1, Math.min(60, durationSec));
  if (s <= 1) return minWidth;
  if (s >= 60) return maxWidth;
  const logRatio = Math.log(s) / Math.log(60);
  return Math.round(minWidth + logRatio * (maxWidth - minWidth));
}

// 模拟 parseVoiceTag 规则
const VOICE_TAG_REGEX = /[[\[【]\s*(?:VOICE|语音)\s*[:：]\s*([^\]】\n]+?)\s*[\]】]/i;
function parseVoiceTag(text) {
  if (!text) return null;
  const match = text.match(VOICE_TAG_REGEX);
  if (!match) return null;
  const voiceContent = match[1]?.trim();
  if (!voiceContent) return null;
  return { text: voiceContent, rawTag: match[0] };
}

test('Voice Tag Parser - 严格识别与拦截 [VOICE:...] 与 【语音:...】', () => {
  const t1 = parseVoiceTag('[VOICE: 想你了，今天过得开心吗？]');
  assert.ok(t1);
  assert.equal(t1.text, '想你了，今天过得开心吗？');

  const t2 = parseVoiceTag('【语音: 早点休息哦，晚安】');
  assert.ok(t2);
  assert.equal(t2.text, '早点休息哦，晚安');

  const t3 = parseVoiceTag('[VOICE: 刚到家累瘫啦 ]');
  assert.ok(t3);
  assert.equal(t3.text, '刚到家累瘫啦');

  // 普通文本与其它标签不得误拦截
  assert.equal(parseVoiceTag('普通的文字回复'), null);
  assert.equal(parseVoiceTag('[STATUS: 窝在沙发里 | load=free]'), null);
  assert.equal(parseVoiceTag('[STICKER: 抱抱]'), null);
  assert.equal(parseVoiceTag(''), null);
});

test('WeChat Voice Bubble Width - 100% 像素级对数单调递增尺寸验证', () => {
  const w1 = calculateVoiceBubbleWidth(1);
  assert.equal(w1, 72, '1 秒语音物理基准宽度必须精准等于 72dp');

  const w60 = calculateVoiceBubbleWidth(60);
  assert.equal(w60, 232, '60 秒语音最大宽度必须精准等于 232dp');

  const w2 = calculateVoiceBubbleWidth(2);
  const w5 = calculateVoiceBubbleWidth(5);
  const w10 = calculateVoiceBubbleWidth(10);
  const w30 = calculateVoiceBubbleWidth(30);

  assert.ok(w2 > w1, '2 秒必须大于 1 秒');
  assert.ok(w5 > w2, '5 秒必须大于 2 秒');
  assert.ok(w10 > w5, '10 秒必须大于 5 秒');
  assert.ok(w30 > w10, '30 秒必须大于 10 秒');
  assert.ok(w60 > w30, '60 秒必须大于 30 秒');

  // 极值保护
  assert.equal(calculateVoiceBubbleWidth(0), 72, '小于 1 秒必须截断兜底为 72dp');
  assert.equal(calculateVoiceBubbleWidth(120), 232, '超长录音必须截断最大为 232dp');
});

test('Voice Stream Parsing & Protection - 标签不被吞没与意图识别', () => {
  const META_TAG_REGEX = /[[\[【]\s*(STATUS|MOOD|HEARTBEAT|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING)(?:[:：][^\]】\n]+)?\s*[\]】]/gi;
  const SPLIT_PATTERN = /(\[br\s*\/?\]|<\/?br\s*\/?>|[[\[【]\s*(?:STICKER|表情)\s*[:：]\s*[^\]】\n]{1,10}?\s*[\]】]|[[\[【]\s*(?:VOICE|语音)\s*[:：]\s*[^\]】\n]+?\s*[\]】])/i;
  const VOICE_INTENT_PATTERN = /(?:发|发条|发个|来条|来个|用|给我|想听|听下|听听|听你的)?(?:语音|声音|说句话|说话|亲口说)/i;

  // 1. META_TAG_REGEX 绝对不可过滤 VOICE 和 STICKER
  const rawVoice = '[VOICE: 听清楚了没]';
  assert.equal(rawVoice.replace(META_TAG_REGEX, ''), rawVoice, 'META_TAG_REGEX 绝不能清空 VOICE 标签');

  // 2. SPLIT_PATTERN 必须精确匹配切分界标
  const match = '行吧[VOICE: 听清楚了没]'.match(SPLIT_PATTERN);
  assert.ok(match);
  assert.equal(match[0], '[VOICE: 听清楚了没]');

  // 3. VOICE_INTENT_PATTERN 必须能识别各种发语音指令
  assert.ok(VOICE_INTENT_PATTERN.test('发语音'));
  assert.ok(VOICE_INTENT_PATTERN.test('给我发条语音'));
  assert.ok(VOICE_INTENT_PATTERN.test('想听你的声音'));
  assert.ok(VOICE_INTENT_PATTERN.test('说句话听听'));
  assert.ok(VOICE_INTENT_PATTERN.test('用语音说'));
  assert.ok(!VOICE_INTENT_PATTERN.test('今天天气怎么样'));
});
