const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const oldTs = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const budget = require(path.join(root, 'src/ai/aiContextBudget.ts'));
if (oldTs) require.extensions['.ts'] = oldTs; else delete require.extensions['.ts'];

const cjkPattern = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;
function previousEstimate(value) {
  const cjkChars = value.match(cjkPattern)?.length ?? 0;
  const nonCjkChars = Math.max(0, value.length - cjkChars);
  return Math.max(1, Math.ceil(cjkChars * 0.8) + Math.ceil(nonCjkChars / 4));
}

function previousTrimTextToTokenBudget(value, maxTokens, minChars = 0) {
  if (!value || maxTokens <= 0) {
    return minChars > 0 ? value.slice(0, minChars) : '';
  }
  if (previousEstimate(value) <= maxTokens) {
    return value;
  }
  const trimNotice = '\n[已因模型上下文窗口裁剪]';
  const noticeTokens = previousEstimate(trimNotice);
  const contentMaxTokens = maxTokens > noticeTokens + 1 ? maxTokens - noticeTokens : maxTokens;
  const minCandidate = value.slice(0, Math.min(minChars, value.length));
  let low = minCandidate && previousEstimate(minCandidate) <= contentMaxTokens ? minCandidate.length : 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (previousEstimate(value.slice(0, mid)) <= contentMaxTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  const trimmed = value.slice(0, low).trimEnd();
  if (trimmed.length >= value.length) {
    return trimmed;
  }
  const withNotice = `${trimmed}${trimNotice}`;
  return previousEstimate(withNotice) <= maxTokens ? withNotice : trimmed;
}

function createDeterministicRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

test('token estimator preserves the previous multilingual contract', () => {
  const corpus = [
    '', 'plain ASCII 123', '中文上下文', '日本語テスト', '한국어 테스트',
    '中A🙂日B한C', '\ud83d\ude42\ud83d\ude42', 'a'.repeat(8193), '中文Ab'.repeat(4097),
  ];
  for (const value of corpus) {
    assert.equal(budget.estimatePromptTokens(value), previousEstimate(value), value.slice(0, 24));
  }
});

test('token estimator preserves the previous result for a 1MB mixed-language fixture', () => {
  const unit = '中文 English 日本語 한국어 12345 🙂\n';
  const value = unit.repeat(Math.ceil(1_048_576 / unit.length)).slice(0, 1_048_576);
  assert.equal(budget.estimatePromptTokens(value), previousEstimate(value));
});

test('context trimming matches the previous binary-search implementation across deterministic boundaries', () => {
  const random = createDeterministicRandom(0x5eed1234);
  const alphabet = ['a', 'Z', '0', ' ', '\n', '中', '文', '日', '한', '🙂'];
  for (let caseIndex = 0; caseIndex < 400; caseIndex += 1) {
    const length = 1 + Math.floor(random() * 480);
    let value = '';
    for (let index = 0; index < length; index += 1) {
      value += alphabet[Math.floor(random() * alphabet.length)];
    }
    const modelContextWindowTokens = 16 + Math.floor(random() * 256);
    const budgetTokens = Math.floor(modelContextWindowTokens * 0.7);
    const minChars = Math.floor(random() * (value.length + 80));
    const result = budget.fitPromptBlocksToContextBudget({
      modelContextWindowTokens,
      blocks: [{ key: 'dynamic', priority: 'dynamic', text: value, minChars }],
    });
    assert.equal(
      result.blocks[0].text,
      previousTrimTextToTokenBudget(value, budgetTokens, minChars),
      `case ${caseIndex}`,
    );
  }
});

test('context fitting remains deterministic at mixed-language boundaries', () => {
  const result = budget.fitPromptBlocksToContextBudget({
    modelContextWindowTokens: 128,
    blocks: [
      { key: 'required', priority: 'required', text: '角色约束', minChars: 4 },
      { key: 'dynamic', priority: 'dynamic', text: '中A🙂日B한C'.repeat(200), minChars: 12 },
    ],
  });
  assert.equal(result.blocks[0].text, '角色约束');
  assert.equal(result.trimmed, true);
  assert.ok(result.blocks[1].text.endsWith('[已因模型上下文窗口裁剪]'));
  assert.ok(result.estimatedTokens <= 128);
});

test('context fitting does not exceed the budget when minChars is too large', () => {
  const result = budget.fitPromptBlocksToContextBudget({
    modelContextWindowTokens: 32,
    blocks: [
      { key: 'required', priority: 'required', text: '角色约束', minChars: 4 },
      { key: 'dynamic', priority: 'dynamic', text: '中A🙂日B한C'.repeat(20), minChars: 200 },
    ],
  });
  assert.equal(result.trimmed, true);
  assert.ok(result.estimatedTokens <= 22);
  assert.ok(result.blocks[1].text.length < 200);
});
