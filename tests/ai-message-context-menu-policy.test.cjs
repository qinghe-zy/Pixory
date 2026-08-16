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
  assert.match(positioning, /const constrainedMenuHeight = Math\.min\(input\.menuHeight, maxHeight\)/);
  assert.match(positioning, /input\.anchorY - gap - constrainedMenuHeight/);
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
      maxHeight: 523,
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
      maxHeight: 583,
      opensBelowFinger: false,
      top: 319,
    },
  );
});

test('message context menu preserves its 5px finger anchor in a constrained viewport', () => {
  const { resolveAiMessageContextMenuPosition } = loadTypeScriptModule(
    'src/components/ai/aiMessageContextMenuPosition.ts',
  );

  assert.deepEqual(
    resolveAiMessageContextMenuPosition({
      anchorX: 180,
      anchorY: 240,
      bottomInset: 24,
      horizontalMargin: 8,
      menuHeight: 296,
      menuWidth: 190,
      topInset: 24,
      viewportHeight: 500,
      viewportWidth: 360,
    }),
    {
      left: 85,
      maxHeight: 223,
      opensBelowFinger: true,
      top: 245,
    },
  );
  assert.deepEqual(
    resolveAiMessageContextMenuPosition({
      anchorX: 180,
      anchorY: 260,
      bottomInset: 24,
      horizontalMargin: 8,
      menuHeight: 296,
      menuWidth: 190,
      topInset: 24,
      viewportHeight: 500,
      viewportWidth: 360,
    }),
    {
      left: 85,
      maxHeight: 223,
      opensBelowFinger: false,
      top: 32,
    },
  );
});

test('message context menu has regular icons, dismiss handling, and a persistent time row', () => {
  const menu = read('src/components/ai/AiAnchoredContextMenu.tsx');

  assert.match(menu, /export type AiAnchoredContextMenuAction/);
  assert.match(menu, /accessibilityLabel=\{dismissAccessibilityLabel\}/);
  assert.match(menu, /action\.icon/);
  assert.match(menu, /timeLabel/);
  assert.match(menu, /styles\.timeRow/);
  assert.match(menu, /onRequestClose=\{onClose\}/);
  assert.match(menu, /ScrollView/);
  assert.match(menu, /maxHeight: position\.maxHeight/);
});

test('message context menu delegates its presentation to the shared anchored menu', () => {
  const anchoredPath = path.join(root, 'src/components/ai/AiAnchoredContextMenu.tsx');
  const anchored = fs.existsSync(anchoredPath) ? fs.readFileSync(anchoredPath, 'utf8') : '';
  const messageMenu = read('src/components/ai/AiMessageContextMenu.tsx');

  assert.match(anchored, /resolveAiMessageContextMenuPosition/);
  assert.match(anchored, /animationType="fade"/);
  assert.match(anchored, /dismissAccessibilityLabel/);
  assert.match(messageMenu, /AiAnchoredContextMenu/);
  assert.match(messageMenu, /关闭消息操作菜单/);
});

test('select text opens a full-screen selectable message reader', () => {
  const modal = read('src/components/ai/AiMessageTextSelectionModal.tsx');

  assert.match(modal, /presentationStyle="fullScreen"/);
  assert.match(modal, /选择文本/);
  assert.match(modal, /selectable/);
  assert.match(modal, /ScrollView/);
  assert.match(modal, /onRequestClose=\{handleBack\}/);
});

test('user and assistant long-press menus keep their distinct existing actions', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const tail = read('src/components/ai/AiStreamingTailMessageSegment.tsx');

  assert.match(bubble, /onLongPress\?: \(message: AiMessageWithCitations, pageX: number, pageY: number\) => void/);
  assert.match(bubble, /event\.nativeEvent\.pageX/);
  assert.match(bubble, /event\.nativeEvent\.pageY/);
  assert.match(bubble, /accessibilityHint=\{editing \? undefined : ['"]长按打开消息操作['"]\}/);
  assert.match(tail, /onLongPress\?: \(pageX: number, pageY: number\) => void/);
  assert.match(tail, /delayLongPress=\{500\}/);
  assert.match(tail, /event\.nativeEvent\.pageX/);
  assert.match(tail, /event\.nativeEvent\.pageY/);
  assert.match(chat, /label: "复制"/);
  assert.match(chat, /label: "选择文本"/);
  assert.match(chat, /label: "修改"/);
  assert.match(chat, /label: "继续生成"/);
  assert.match(chat, /label: replyActionMode === "reply" \? "回复" : "续答"/);
  assert.match(chat, /label: "重新生成"/);
  assert.match(
    chat,
    /onLongPress=\{\s*message\s*\?\s*\(pageX, pageY\)\s*=>\s*handleMessageLongPress\(message, pageX, pageY\)\s*:\s*undefined\s*\}/,
  );
  assert.doesNotMatch(chat, /label: "分享"/);
});

test('detached streaming tails open the same menu with their latest text', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const segment = read('src/components/ai/AiStreamingTailMessageSegment.tsx');
  const continuation = read('src/components/ai/AiStreamingTailContinuationBubble.tsx');

  assert.match(chat, /mergeBufferedStreamingPatchIntoContextMenuTarget/);
  assert.match(chat, /visibleMessagesById\.get\(item\.group\.messageId\)/);
  assert.match(segment, /lane === "reasoning"[\s\S]*?<Pressable/);
  assert.match(continuation, /onLongPress\?: \(pageX: number, pageY: number\) => void/);
  assert.match(continuation, /delayLongPress=\{500\}/);
  assert.match(continuation, /event\.nativeEvent\.pageX/);
  assert.match(continuation, /event\.nativeEvent\.pageY/);
});

test('latest detached streaming patch overlays only the context-menu message fields', () => {
  const { mergeBufferedStreamingPatchIntoContextMenuTarget } = loadTypeScriptModule(
    'src/components/ai/aiMessageContextMenuTarget.ts',
  );
  const frozenMessage = {
    citations: [{ id: 'frozen-citation' }],
    completedAt: '2026-07-29T08:00:00.000Z',
    content: '冻结前缀',
    errorMessage: null,
    id: 'assistant-message',
    reasoningText: '冻结思考',
    status: 'generating',
    versionIndex: 1,
    versionTotal: 1,
  };
  const patch = {
    citations: [{ id: 'latest-citation' }],
    completedAt: null,
    content: '冻结前缀\n刚生成的尾段',
    errorMessage: '已停止',
    generationId: 'generation-1',
    id: 'assistant-message',
    reasoningText: '最新思考',
    status: 'stopped',
  };

  assert.deepEqual(
    mergeBufferedStreamingPatchIntoContextMenuTarget(frozenMessage, patch),
    {
      ...frozenMessage,
      citations: patch.citations,
      completedAt: null,
      content: patch.content,
      errorMessage: patch.errorMessage,
      reasoningText: patch.reasoningText,
      status: patch.status,
    },
  );
  assert.strictEqual(
    mergeBufferedStreamingPatchIntoContextMenuTarget(frozenMessage, {
      generationId: 'generation-2',
      id: 'other-message',
    }),
    frozenMessage,
  );
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
