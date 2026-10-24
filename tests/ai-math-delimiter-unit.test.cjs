const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AiMessageContent supports LaTeX bracket display math \\[ \\] and dollar math $$', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(content, /trimmed === '\\\\\['/);
  assert.match(content, /trimmed\.startsWith\('\\\\\['\)/);
  assert.match(content, /isMathBlockStart/);
  assert.match(content, /blocks\.push\(\{\s*type:\s*'math'/);
});

test('AiMessageContent supports LaTeX inline math \\( \\) and dollar inline math $', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(content, /\\\\\\\(\[\^\\n\]\+\?\\\\\\\)/);
  assert.match(content, /part\.startsWith\('\\\\\('\)\s*&&\s*part\.endsWith\('\\\\\)'\)/);
  assert.match(content, /formatInlineMath/);
  assert.match(content, /ESCAPED_MARKDOWN_TOKEN_PATTERN/);
});

test('Inline math correctly formats complexity formulas like \\(O(n\\log n)\\)', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');

  // Verify that renderToken places inline math check before escaped check
  const renderTokenIndex = content.indexOf('function renderToken(part: string, key: string)');
  assert.ok(renderTokenIndex > -1);
  const mathCheckIndex = content.indexOf("part.startsWith('\\\\(')", renderTokenIndex);
  const escapedCheckIndex = content.indexOf('part.match(ESCAPED_MARKDOWN_TOKEN_PATTERN)', renderTokenIndex);

  assert.ok(mathCheckIndex > -1);
  assert.ok(escapedCheckIndex > -1);
  assert.ok(mathCheckIndex < escapedCheckIndex, 'Math check must come before escaped markdown check');

  // Extract formatInlineMath for pure unit testing
  const fnMatch = /function formatInlineMath\(math: string\): string \{([\s\S]*?)\n\}/.exec(content);
  assert.ok(fnMatch, 'formatInlineMath should be defined');
  const formatInlineMath = new Function('math', fnMatch[1]);

  assert.equal(formatInlineMath('O(n\\log n)'), 'O(n log n)');
  assert.equal(formatInlineMath('O(n^2)'), 'O(n²)');
  assert.equal(formatInlineMath('O(n)'), 'O(n)');
  assert.equal(formatInlineMath('O(\\log n)'), 'O(log n)');
});
