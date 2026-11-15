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

test('HumanizeOutputGate: Preserves stage actions and natural prose by default, strips on false and strips protocol/think tags', () => {
  const { sanitizeCompanionBubble } = loadModule('../src/im/engine/humanizeOutputGate.ts');

  // Default preserves inline Chinese and English parenthetical stage actions
  const sample1 = '（轻笑）快去休息吧，明天还要早起呢！';
  assert.equal(sanitizeCompanionBubble(sample1), '（轻笑）快去休息吧，明天还要早起呢！');

  const sample2 = '(揉了揉眼睛) 怎么还没睡呀？';
  assert.equal(sanitizeCompanionBubble(sample2), '(揉了揉眼睛) 怎么还没睡呀？');

  // Explicit preserveInlineStageActions: false strips stage directions (e.g. for TTS script)
  assert.equal(
    sanitizeCompanionBubble(sample1, { preserveInlineStageActions: false }),
    '快去休息吧，明天还要早起呢！'
  );
  assert.equal(
    sanitizeCompanionBubble(sample2, { preserveInlineStageActions: false }),
    '怎么还没睡呀？'
  );

  // Natural prose including phrases like "有什么可以帮您的呢" is no longer stripped
  const sample3 = '好的呢，有什么可以帮您的呢？明天见！';
  assert.equal(sanitizeCompanionBubble(sample3), '好的呢，有什么可以帮您的呢？明天见！');

  // Strips technical control tags and residual <think>/<thought> tags
  const protocolSample =
    '<think>内部思考</think></think>[NEXT_FOLLOWUP: 30s | 怎么还不理我][STATUS: online]早安[PASS][MEMORY_RECALL: 早餐][MEMORY_NOTE: ADD | 喜欢豆浆]';
  assert.equal(sanitizeCompanionBubble(protocolSample), '早安');

  // Empty, whitespace-only, and oversized STICKER/VOICE residue never leaks "]"
  assert.equal(sanitizeCompanionBubble('[STICKER:   ]'), '');
  assert.equal(sanitizeCompanionBubble('[VOICE:   ]'), '');
  assert.equal(sanitizeCompanionBubble('[VOICE: 轻声 |   ]'), '');
  assert.equal(
    sanitizeCompanionBubble('[STICKER: 超过四十个字的贴纸描述超过四十个字的贴纸描述超过四十个字的贴纸描述]'),
    ''
  );
  assert.equal(
    sanitizeCompanionBubble('哈哈[STICKER: 超过四十个字的贴纸描述超过四十个字的贴纸描述超过四十个字的贴纸描述]真的绝'),
    '哈哈真的绝'
  );
});

test('HumanizeOutputGate: Disables starter suppression and triggers question hint only on >= 3 consecutive questions', () => {
  const {
    extractStarterToken,
    detectRepetitiveStarters,
    detectExcessiveQuestions,
  } = loadModule('../src/im/engine/humanizeOutputGate.ts');

  assert.equal(extractStarterToken('哈哈太逗了'), '哈哈');
  assert.equal(extractStarterToken('！好呀没问题'), '好呀');

  // detectRepetitiveStarters is disabled and always returns null
  const repetitiveList = ['哈哈真的假的', '确实不错', '哈哈笑死我了', '明天见', '哈哈好巧'];
  assert.equal(detectRepetitiveStarters(repetitiveList), null);

  // 2 consecutive questions -> ignored (null)
  assert.equal(
    detectExcessiveQuestions(['你在干嘛呢？', '今天吃什么了呀？']),
    null
  );

  // Mixed list with <= 2 consecutive trailing questions (even if >= 40% overall) -> ignored (null)
  assert.equal(
    detectExcessiveQuestions([
      '你在干嘛呢？',
      '今天吃什么了呀？',
      '作业写完了吗？',
      '晚安好梦。',
      '今天天气真好呢？',
    ]),
    null
  );

  // >= 3 consecutive question-ending bubbles -> triggers non-imperative flow hint
  const qNotice = detectExcessiveQuestions([
    '今天好冷呀。',
    '你在干嘛呢？',
    '今天吃什么了呀？',
    '作业写完了吗？',
  ]);
  assert.equal(
    qNotice,
    '[对话流向提示: 近期已连续多轮向对方发问，本轮可自然陈述自身看法、反应或状态，无需刻意在句末抛问题]'
  );
});

test('HumanizeOutputGate: Duplicate bubble dice similarity detection', () => {
  const { isDuplicateBubble } = loadModule('../src/im/engine/humanizeOutputGate.ts');

  const history = ['外面雨下得好大啊，你带伞了没？', '今天食堂二楼的黄焖鸡味道还可以'];

  // Highly similar sentence (> 0.82)
  const duplicate = '外面雨下得好大呀，你带伞了没？';
  assert.equal(isDuplicateBubble(duplicate, history), true);

  // Different sentence
  const novel = '明天下午图书馆闭馆，我们去咖啡厅吧。';
  assert.equal(isDuplicateBubble(novel, history), false);
});

test('StyleEntrainment: Analyzes user style and produces symmetric pacing directive', () => {
  const {
    analyzeUserStyle,
    buildStyleEntrainmentPrompt,
  } = loadModule('../src/im/engine/styleEntrainment.ts');

  const userMessages = [
    { role: 'user', content: '好滴~' },
    { role: 'user', content: '今天好累QAQ' },
    { role: 'user', content: '先去洗澡啦~' },
    { role: 'user', content: '哈哈绝了！' },
  ];

  const profile = analyzeUserStyle(userMessages);
  assert.equal(profile.prefersShortSentences, true);
  assert.equal(profile.usesEmoji, true);

  // Short user input -> concise directive
  const shortTurnPrompt = buildStyleEntrainmentPrompt('嗯嗯', profile);
  assert.ok(shortTurnPrompt !== null);
  assert.ok(shortTurnPrompt.includes('精炼短气泡'));

  // Long user input -> careful listening directive
  const longTurnPrompt = buildStyleEntrainmentPrompt(
    '今天在实验室搞了一整天的数据，导师还是不满意，让我全部重跑一次，真的感觉心态要崩了，不知道该怎么办才好。',
    profile
  );
  assert.ok(longTurnPrompt !== null);
  assert.ok(longTurnPrompt.includes('长段倾诉'));
});
