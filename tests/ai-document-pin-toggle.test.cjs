const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');

test('AiMessageBubble: defines onUnpinDocument prop and props comparison', () => {
  const bubbleContent = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');

  // 1. Props 接口定义包含 onUnpinDocument
  assert.match(bubbleContent, /onUnpinDocument\?:\s*\(documentId:\s*string,\s*title:\s*string\)\s*=>\s*void;/);

  // 2. areAiMessageBubblePropsEqual 深度对比 onUnpinDocument 与文档附件变动
  assert.match(bubbleContent, /previous\.onUnpinDocument !== next\.onUnpinDocument/);
  assert.match(bubbleContent, /previous\.onPinDocument !== next\.onPinDocument/);
});

test('AiMessageBubble: renders selected state (pinPillActive with primarySoft) and direct toggle', () => {
  const bubbleContent = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');

  // 1. 样式包含主色选中背景与白色高对比文字
  assert.match(bubbleContent, /pinPillActive:\s*\{[\s\S]*?borderColor:\s*aiLightColors\.primary[\s\S]*?backgroundColor:\s*aiLightColors\.primary/);
  assert.match(bubbleContent, /pinPillTextActive:\s*\{[\s\S]*?color:\s*aiLightColors\.onPrimary[\s\S]*?fontWeight:\s*['"]600['"]/);

  // 2. 文本在选中时为「📌 已纳入资料库」/「📌 已原文注入」，未选中时为「📌 纳入资料库」/「📌 原文注入」
  assert.match(bubbleContent, /📌 已纳入资料库/);
  assert.match(bubbleContent, /📌 纳入资料库/);
  assert.match(bubbleContent, /📌 已原文注入/);
  assert.match(bubbleContent, /📌 原文注入/);

  // 4. 点击已纳入状态自动触发取消锁定与移出
  assert.match(bubbleContent, /if\s*\(onToggleKnowledgeBase\)\s*\{\s*onToggleKnowledgeBase\(docId,\s*attachment\.name\);/);
});

test('AiChatScreen: defines handleUnpinDocument and binds onUnpinDocument', () => {
  const chatScreenContent = fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');

  // 1. 定义 handleUnpinDocument 并调用 removeDocumentFromKnowledgeBase 与 showUndoSnackbar
  assert.match(chatScreenContent, /const handleUnpinDocument =/);
  assert.match(chatScreenContent, /await removeDocumentFromKnowledgeBase\(\{ space, documentId, threadId: currentThreadId \}\);/);
  assert.match(chatScreenContent, /showUndoSnackbar\(\{[\s\S]*?message:\s*['"]已从资料库移出['"]/);

  // 2. 传递给 AiMessageBubble
  assert.match(chatScreenContent, /onUnpinDocument=\{handleUnpinDocument\}/);
});
