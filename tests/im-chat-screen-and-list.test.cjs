const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('IM chat screen and list policy verification', async (t) => {
  const headerPath = path.resolve(__dirname, '../src/im/components/ImChatHeader.tsx');
  const listPath = path.resolve(__dirname, '../src/im/components/ImChatList.tsx');
  const screenPath = path.resolve(__dirname, '../src/im/screens/ImChatScreen.tsx');

  const headerContent = fs.readFileSync(headerPath, 'utf8');
  const listContent = fs.readFileSync(listPath, 'utf8');
  const screenContent = fs.readFileSync(screenPath, 'utf8');

  await t.test('ImChatHeader renders title, subText and more options button without wechat text label', () => {
    assert.match(headerContent, /export function ImChatHeader/);
    assert.match(headerContent, /useImTheme\(\)/);
    assert.match(headerContent, /name="people-outline"/);
    assert.match(headerContent, /name="ellipsis-horizontal"/);
    assert.doesNotMatch(headerContent, /'微信'/);
  });

  await t.test('ImChatList renders FlashList with getItemType isolation', () => {
    assert.match(listContent, /export function ImChatList/);
    assert.match(listContent, /FlashList/);
    assert.match(listContent, /getItemType=\{(?:item => item\.type \|\| 'text'|\(item\) => item\.type \|\| 'text')\}/);
    assert.match(listContent, /scrollToEnd/);
  });

  await t.test('ImChatScreen code line count is strictly constrained to < 150 lines', () => {
    const lines = screenContent.split(/\r?\n/).length;
    assert.ok(lines < 150, `ImChatScreen line count must be < 150, but was ${lines}`);
    assert.match(screenContent, /export function ImChatScreen/);
    assert.match(screenContent, /ImThemeProvider/);
    assert.match(screenContent, /ImChatHeader/);
    assert.match(screenContent, /ImChatList/);
    assert.match(screenContent, /ImInputBar/);
  });
});
