const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI chat keeps bottom safe-area spacing stable and reduces only the external gap', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const composer = read('src/components/ai/AiChatComposer.tsx');

  assert.match(chat, /const initialBottomInsetRef = useRef\(insets\.bottom\)/);
  assert.match(
    chat,
    /paddingBottom:\s*initialBottomInsetRef\.current\s*\+\s*layout\.pageBottomOffset\s*-\s*spacing\[2\]/,
  );
  assert.match(
    chat,
    /paddingTop:\s*statusBarHeight\s*\+\s*layout\.pageTopOffset\s*-\s*spacing\[2\]/,
  );
  assert.match(chat, /fontSize:\s*typography\.textStyles\.body\.fontSize/);
  assert.match(chat, /fontWeight:\s*typography\.textStyles\.body\.fontWeight/);
  assert.match(chat, /lineHeight:\s*typography\.textStyles\.body\.lineHeight/);
  const titleBlock = /title:\s*\{[\s\S]*?\n  \},/.exec(chat)?.[0] ?? '';
  assert.doesNotMatch(titleBlock, /fontFamily/);
  assert.match(composer, /paddingBottom:\s*spacing\[2\]/);
});

test('AI chat title matches the 14px conversation body without a custom font', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const message = read('src/components/ai/AiMessageContent.tsx');
  const titleBlock = /title:\s*\{[\s\S]*?\n  \},/.exec(chat)?.[0] ?? '';

  assert.match(titleBlock, /fontSize:\s*typography\.textStyles\.body\.fontSize/);
  assert.match(titleBlock, /lineHeight:\s*typography\.textStyles\.body\.lineHeight/);
  assert.doesNotMatch(titleBlock, /fontFamily/);
  assert.match(message, /body:\s*\{[\s\S]*?typography\.textStyles\.body/);
  assert.match(message, /lineHeight:\s*22/);
  assert.match(chat, /modelSubtitle:\s*\{[\s\S]*?typography\.textStyles\.caption/);
});
