const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('text reader no longer renders each chunk as a bordered card', () => {
  const source = read('src/components/ai/AiTextReader.tsx');

  assert.doesNotMatch(source, /borderWidth:\s*1/);
  assert.doesNotMatch(source, /chunkCard/);
});

test('markdown reader supports continuous markdown blocks without a body card', () => {
  const source = read('src/components/ai/AiMarkdownReader.tsx');

  
  
  assert.doesNotMatch(source, /borderWidth:\s*1/);
  assert.doesNotMatch(source, /markdownCard/);
});
