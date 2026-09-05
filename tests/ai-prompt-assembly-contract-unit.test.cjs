const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const compiler = fs.readFileSync('src/ai/companion/companionContextCompiler.ts', 'utf8');
const builder = fs.readFileSync('src/ai/promptBuilder.ts', 'utf8');

test('main chat prompt does not inject companion stance controls by default', () => {
  assert.match(compiler, /awarenessEnabled/);
  assert.doesNotMatch(compiler, /当前回应姿态|回应意图|温度：|安抚：|主动性：|亲密表达|篇幅：/);
  assert.match(builder, /block\('companion_runtime', compileDynamicSegments\(input\.dynamicSegments, 'companion_runtime'\)/);
});

test('prompt assembly preserves clean current user text and fixed dynamic order', () => {
  assert.match(builder, /block\('summary_bridge'/);
  assert.match(builder, /block\('dynamic_memory'/);
  assert.match(builder, /block\('retrieval_context'/);
  assert.match(builder, /block\('current_user_message'/);
  assert.match(builder, /用户当前问题：/);
  assert.match(builder, /\$\{input\.userMessage\}/);
});
