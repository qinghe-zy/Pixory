const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadTypeScriptModule(relativePath) {
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'module', output)(module.exports, module);
  return module.exports;
}

test('message context menu is positioned from the finger with a 5px vertical gap', () => {
  const positioning = read('src/components/ai/aiMessageContextMenuPosition.ts');
  const { resolveAiMessageContextMenuPosition } = loadTypeScriptModule(
    'src/components/ai/aiMessageContextMenuPosition.ts',
  );

  assert.match(positioning, /gap = input\.gap \?\? 5/);
  assert.match(positioning, /input\.anchorY < input\.viewportHeight \/ 2/);
  assert.match(positioning, /input\.anchorY \+ gap/);
  assert.match(positioning, /input\.anchorY - gap - input\.menuHeight/);
  assert.match(positioning, /Math\.min\(maxTop, Math\.max\(minTop, preferredTop\)\)/);
  assert.deepEqual(
    resolveAiMessageContextMenuPosition({
      anchorX: 180,
      anchorY: 240,
      bottomInset: 24,
      horizontalMargin: 8,
      menuHeight: 296,
      menuWidth: 190,
      topInset: 24,
      viewportHeight: 800,
      viewportWidth: 360,
    }),
    {
      left: 85,
      opensBelowFinger: true,
      top: 245,
    },
  );
  assert.deepEqual(
    resolveAiMessageContextMenuPosition({
      anchorX: 300,
      anchorY: 620,
      bottomInset: 24,
      horizontalMargin: 8,
      menuHeight: 296,
      menuWidth: 190,
      topInset: 24,
      viewportHeight: 800,
      viewportWidth: 360,
    }),
    {
      left: 162,
      opensBelowFinger: false,
      top: 319,
    },
  );
});

test('message context menu has regular icons, dismiss handling, and a persistent time row', () => {
  const menu = read('src/components/ai/AiMessageContextMenu.tsx');

  assert.match(menu, /export type AiMessageContextMenuAction/);
  assert.match(menu, /accessibilityLabel="关闭消息操作菜单"/);
  assert.match(menu, /action\.icon/);
  assert.match(menu, /timeLabel/);
  assert.match(menu, /styles\.timeRow/);
  assert.match(menu, /onRequestClose=\{onClose\}/);
});

test('select text opens a full-screen selectable message reader', () => {
  const modal = read('src/components/ai/AiMessageTextSelectionModal.tsx');

  assert.match(modal, /presentationStyle="fullScreen"/);
  assert.match(modal, /选择文本/);
  assert.match(modal, /selectable/);
  assert.match(modal, /ScrollView/);
  assert.match(modal, /onRequestClose=\{onClose\}/);
});

test('user and assistant long-press menus keep their distinct existing actions', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(bubble, /onLongPress\?: \(message: AiMessageWithCitations, pageX: number, pageY: number\) => void/);
  assert.match(bubble, /event\.nativeEvent\.pageX/);
  assert.match(bubble, /event\.nativeEvent\.pageY/);
  assert.match(chat, /label: "复制"/);
  assert.match(chat, /label: "选择文本"/);
  assert.match(chat, /label: "修改"/);
  assert.match(chat, /label: "继续生成"/);
  assert.match(chat, /label: replyActionMode === "reply" \? "回复" : "续答"/);
  assert.match(chat, /label: "重新生成"/);
  assert.doesNotMatch(chat, /label: "分享"/);
});

test('only the latest visible assistant keeps actions while versions remain independent', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(bubble, /showActionButtons\?: boolean/);
  assert.match(bubble, /message\.versionTotal > 1/);
  assert.match(
    chat,
    /const latestVisibleMessageId =\s*visibleMessages\[visibleMessages\.length - 1\]\?\.id \?\? null/,
  );
  assert.match(chat, /showActionButtons=\{message\.role === "assistant" && message\.id === latestVisibleMessageId\}/);
  assert.match(chat, /gap: spacing\[2\]/);
});

test('every long-press menu receives time only without a date', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /formatAiMessageMinute/);
  assert.match(chat, /timeLabel: formatAiMessageMinute\(/);
  assert.doesNotMatch(chat, /timeLabel: formatAiFullMinute\(/);
});
