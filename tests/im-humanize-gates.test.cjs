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

test('HumanizeOutputGate: Strips parenthetical stage directions and robotic cliches', () => {
  const { sanitizeCompanionBubble } = loadModule('../src/im/engine/humanizeOutputGate.ts');

  // Strip Chinese parentheses stage action
  const sample1 = '（轻笑）快去休息吧，明天还要早起呢！';
  assert.equal(sanitizeCompanionBubble(sample1), '快去休息吧，明天还要早起呢！');

  // Strip English parentheses stage action
  const sample2 = '(揉了揉眼睛) 怎么还没睡呀？';
  assert.equal(sanitizeCompanionBubble(sample2), '怎么还没睡呀？');

  // Strip customer-support cliches
  const sample3 = '好的呢，有什么可以帮您的呢？明天见！';
  assert.equal(sanitizeCompanionBubble(sample3), '好的呢明天见！');
});

test('HumanizeOutputGate: Detects repetitive starter tokens and excessive question ratio', () => {
  const {
    extractStarterToken,
    detectRepetitiveStarters,
    detectExcessiveQuestions,
  } = loadModule('../src/im/engine/humanizeOutputGate.ts');

  assert.equal(extractStarterToken('哈哈太逗了'), '哈哈');
  assert.equal(extractStarterToken('！好呀没问题'), '好呀');

  // Starter repeats 3 times out of last 8
  const repetitiveList = ['哈哈真的假的', '确实不错', '哈哈笑死我了', '明天见', '哈哈好巧'];
  const notice = detectRepetitiveStarters(repetitiveList);
  assert.ok(notice !== null);
  assert.ok(notice.includes('「哈哈」'));

  // Excessive questions > 40%
  const questionList = [
    '你在干嘛呢？',
    '今天吃什么了呀？',
    '作业写完了吗？',
    '几点睡觉呢？',
    '晚安好梦。',
  ];
  const qNotice = detectExcessiveQuestions(questionList);
  assert.ok(qNotice !== null);
  assert.ok(qNotice.includes('互动节律提示'));
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
