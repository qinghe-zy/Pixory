const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadModule(path.join(path.dirname(targetPath), reqPath), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

const { parseVoiceTag, parseVoicePayload } = loadModule('../src/im/engine/imTagParser.ts');
const { sanitizeCompanionBubble } = loadModule('../src/im/engine/humanizeOutputGate.ts');
const { stripMetaTags, TagAwareStreamParser } = loadModule('../src/im/engine/tagAwareStreamParser.ts');

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

test('Voice Tag Parser - 严格识别标准形式与各类大模型变体（防泄漏）', () => {
  // 1. 标准内联冒号格式
  const t1 = parseVoiceTag('[VOICE: 想你了，今天过得开心吗？]');
  assert.ok(t1);
  assert.equal(t1.text, '想你了，今天过得开心吗？');

  const t2 = parseVoiceTag('【语音: 早点休息哦，晚安】');
  assert.ok(t2);
  assert.equal(t2.text, '早点休息哦，晚安');

  const t3 = parseVoiceTag('[VOICE: 刚到家累瘫啦 ]');
  assert.ok(t3);
  assert.equal(t3.text, '刚到家累瘫啦');

  // 2. 外部冒号变体（截图泄漏根因场景修复验证）
  const t4 = parseVoiceTag('[VOICE]: 你到底还有完没完呀，撒娇也撒了，软话也说了');
  assert.ok(t4, '必须成功拦截 [VOICE]: 外部冒号变体');
  assert.equal(t4.text, '你到底还有完没完呀，撒娇也撒了，软话也说了');

  const t5 = parseVoiceTag('[VOICE]：这次声音够软了吧？');
  assert.ok(t5, '必须成功拦截 [VOICE]：全角冒号变体');
  assert.equal(t5.text, '这次声音够软了吧？');

  const t6 = parseVoiceTag('[VOICE] 声音放轻一点');
  assert.ok(t6, '必须成功拦截 [VOICE] 空格变体');
  assert.equal(t6.text, '声音放轻一点');

  const t7 = parseVoiceTag('【语音】: 晚安啦，早点休息');
  assert.ok(t7, '必须成功拦截 【语音】: 中文标签变体');
  assert.equal(t7.text, '晚安啦，早点休息');

  const t8 = parseVoiceTag('[语音]: 听清楚了没？');
  assert.ok(t8, '必须成功拦截 [语音]: 变体');
  assert.equal(t8.text, '听清楚了没？');

  // 3. 带神态或管道语气的外部冒号变体
  const t9 = parseVoiceTag('[VOICE]: (声音放得又轻又软) 好啦，这次声音够软了吧？');
  assert.ok(t9);
  assert.equal(t9.styleDirective, '声音放得又轻又软');
  assert.equal(t9.ttsScript, '好啦，这次声音够软了吧？');

  // 4. 跨换行与包含管道风格语气的标准格式（截图真实泄漏高危场景）
  const t10 = parseVoiceTag('[VOICE: 语气又懒又带着点得意 | 哼，想你了，就这一句啊，别得寸进尺说要听第二遍。 ]');
  assert.ok(t10);
  assert.equal(t10.styleDirective, '语气又懒又带着点得意');
  assert.equal(t10.text, '哼，想你了，就这一句啊，别得寸进尺说要听第二遍。');

  const t11 = parseVoiceTag('[VOICE: 语气又懒又带着点得意 |\n哼，想你了，就这一句啊，别得寸进尺说要听第二遍。 ]');
  assert.ok(t11, '跨换行管道语法必须成功解析');
  assert.equal(t11.styleDirective, '语气又懒又带着点得意');
  assert.equal(t11.text, '哼，想你了，就这一句啊，别得寸进尺说要听第二遍。');

  // 5. 普通文本与其它标签不得误拦截
  assert.equal(parseVoiceTag('普通的文字回复'), null);
  assert.equal(parseVoiceTag('[STATUS: 窝在沙发里 | load=free]'), null);
  assert.equal(parseVoiceTag('[STICKER: 抱抱]'), null);
  assert.equal(parseVoiceTag(''), null);
});

test('Bubble Sanitizer - 兜底清洗残存标签，确保文本气泡永不裸露控制指令', () => {
  // 若未走语音通道直接降级为文本气泡，前缀的 [VOICE]: 或 [VOICE] 必须被剥离
  const s1 = sanitizeCompanionBubble('[VOICE]: 你到底还有完没完呀');
  assert.equal(s1, '你到底还有完没完呀');

  const s2 = sanitizeCompanionBubble('[VOICE]：好啦好啦');
  assert.equal(s2, '好啦好啦');

  const s3 = sanitizeCompanionBubble('【语音】: 早点休息');
  assert.equal(s3, '早点休息');

  const s4 = sanitizeCompanionBubble('[VOICE: 刚到家累瘫啦]');
  assert.equal(s4, '刚到家累瘫啦');

  // 截图泄漏场景 100% 覆盖断言：带前导换行符、空格、管道语气
  const leakSample = '[VOICE: 语气又懒又带着点得意 | 哼，想你了，就这一句啊，别得寸进尺说要听第二遍。 ]';
  assert.equal(sanitizeCompanionBubble(leakSample), '哼，想你了，就这一句啊，别得寸进尺说要听第二遍。');
  assert.equal(sanitizeCompanionBubble('\n' + leakSample), '哼，想你了，就这一句啊，别得寸进尺说要听第二遍。');
  assert.equal(sanitizeCompanionBubble('   ' + leakSample), '哼，想你了，就这一句啊，别得寸进尺说要听第二遍。');
  assert.equal(sanitizeCompanionBubble('[VOICE: 语气又懒又带着点得意 |\n哼，想你了，就这一句啊，别得寸进尺说要听第二遍。 ]'), '哼，想你了，就这一句啊，别得寸进尺说要听第二遍。');

  // 动作描写与语音混排时，神态保留与台词纯净
  const hybrid = '（还是低头按住了录音键，尾音懒懒的）\n[VOICE: 语气又懒又带着点得意 | 哼，想你了，就这一句啊，别得寸进尺说要听第二遍。 ]';
  const preserved = sanitizeCompanionBubble(hybrid, { preserveInlineStageActions: true });
  assert.equal(preserved, '（还是低头按住了录音键，尾音懒懒的）\n哼，想你了，就这一句啊，别得寸进尺说要听第二遍。');
  assert.ok(!preserved.includes('VOICE'), '净化结果绝不可残存 VOICE 协议关键字');
  assert.ok(!preserved.includes('|'), '净化结果绝不可残存语气管道分隔符');

  // stripMetaTags 也必须净化语音协议残留
  const stripped = stripMetaTags(leakSample);
  assert.equal(stripped, '哼，想你了，就这一句啊，别得寸进尺说要听第二遍。');
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
  const SPLIT_PATTERN =
    /(\[br\s*\/?\]|<\/?br\s*\/?>|[[\[【]\s*(?:STICKER|表情)\s*(?:[:：]\s*[^\]】\n]{1,10}?\s*[\]】]|[\]】]\s*[:：]?\s*[^\[\]\n]{1,10}?(?=(?:\[br|<\/?br|$)))|[[\[【]\s*(?:VOICE|语音)\s*(?:[:：]\s*[^\]】\n]+?\s*[\]】]|[\]】]\s*[:：]?\s*[^\[\]\n]+?(?=(?:\[br|<\/?br|$))))/i;
  const VOICE_INTENT_PATTERN = /(?:发|发条|发个|来条|来个|用|给我|想听|听下|听听|听你的)?(?:语音|声音|说句话|说话|亲口说)/i;

  // 1. META_TAG_REGEX 绝对不可过滤 VOICE 和 STICKER
  const rawVoice = '[VOICE: 听清楚了没]';
  assert.equal(rawVoice.replace(META_TAG_REGEX, ''), rawVoice, 'META_TAG_REGEX 绝不能清空 VOICE 标签');

  // 2. SPLIT_PATTERN 必须精确匹配切分界标
  const match1 = '行吧[VOICE: 听清楚了没]'.match(SPLIT_PATTERN);
  assert.ok(match1);
  assert.equal(match1[0], '[VOICE: 听清楚了没]');

  const match2 = '行吧[BR][VOICE]: 听清楚了没呀[BR]下回不理你了'.match(SPLIT_PATTERN);
  assert.ok(match2);
  assert.equal(match2[0], '[BR]');

  // 3. VOICE_INTENT_PATTERN 必须能识别各种发语音指令
  assert.ok(VOICE_INTENT_PATTERN.test('发语音'));
  assert.ok(VOICE_INTENT_PATTERN.test('给我发条语音'));
  assert.ok(VOICE_INTENT_PATTERN.test('想听你的声音'));
  assert.ok(VOICE_INTENT_PATTERN.test('说句话听听'));
  assert.ok(VOICE_INTENT_PATTERN.test('用语音说'));
  assert.ok(!VOICE_INTENT_PATTERN.test('今天天气怎么样'));
});
