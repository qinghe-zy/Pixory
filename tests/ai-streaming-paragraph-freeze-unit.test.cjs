const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const file = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageContent.tsx'), 'utf8');

// Extract splitStreamingParagraphs definition for pure unit testing
const fnMatch = /function splitStreamingParagraphs\(content: string\): string\[\] \{([\s\S]*?)\n\}/.exec(file);
assert.ok(fnMatch, 'splitStreamingParagraphs should be defined in AiMessageContent.tsx');

const splitStreamingParagraphs = new Function('content', fnMatch[1]);

test('splitStreamingParagraphs handles single paragraph content', () => {
  const result = splitStreamingParagraphs('这是一个单段落的内容。');
  assert.deepEqual(result, ['这是一个单段落的内容。']);
});

test('splitStreamingParagraphs handles multiple paragraphs separated by double newlines', () => {
  const input = '第一段内容。\n\n第二段内容。\n\n第三段内容。';
  const result = splitStreamingParagraphs(input);
  assert.deepEqual(result, ['第一段内容。', '第二段内容。', '第三段内容。']);
});

test('splitStreamingParagraphs protects unclosed code blocks from premature paragraph splitting', () => {
  const input = '这里是前置说明：\n\n```typescript\nfunction hello() {\n\n  console.log("hello");\n}';
  const result = splitStreamingParagraphs(input);
  // The code block has only 1 ```, so it is unclosed. The double newline inside the code block is protected.
  assert.equal(result.length, 2);
  assert.equal(result[0], '这里是前置说明：');
  assert.equal(result[1], '```typescript\nfunction hello() {\n\n  console.log("hello");\n}');
});

test('splitStreamingParagraphs splits after closed code block', () => {
  const input = '说明：\n\n```typescript\nconst x = 1;\n```\n\n总结段落。';
  const result = splitStreamingParagraphs(input);
  assert.equal(result.length, 3);
  assert.equal(result[0], '说明：');
  assert.equal(result[1], '```typescript\nconst x = 1;\n```');
  assert.equal(result[2], '总结段落。');
});

test('AiMessageContent includes FrozenStreamingParagraphs memoized sub-component', () => {
  assert.match(file, /const FrozenStreamingParagraphs = (?:React\.)?memo/);
  assert.match(file, /styles\.streamingBlockGap/);
  assert.match(file, /hasFrozen \? <FrozenStreamingParagraphs blocks=\{frozenBlocks\} \/> : null/);
  assert.match(file, /tailBlock/);
});
