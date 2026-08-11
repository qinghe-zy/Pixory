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

test('token estimator preserves the previous multilingual contract', () => {
  const corpus = [
    '', 'plain ASCII 123', '中文上下文', '日本語テスト', '한국어 테스트',
    '中A🙂日B한C', '\ud83d\ude42\ud83d\ude42', 'a'.repeat(8193), '中文Ab'.repeat(4097),
  ];
  for (const value of corpus) {
    assert.equal(budget.estimatePromptTokens(value), previousEstimate(value), value.slice(0, 24));
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
