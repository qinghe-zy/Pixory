const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI reply assist uses a dedicated generation contract with fixed short/long lengths', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /export type AiReplyAssistMode = 'short' \| 'long'/);
  assert.match(service, /export async function generateReplyAssistSuggestions/);
  assert.match(service, /REPLY_ASSIST_SHORT_COUNT = 3/);
  assert.match(service, /REPLY_ASSIST_SHORT_MAX_CHARS = 25/);
  assert.match(service, /REPLY_ASSIST_LONG_MIN_SENTENCES = 3/);
  assert.match(service, /buildReplyAssistUserPrompt/);
  assert.match(service, /validateReplyAssistSuggestions/);
  assert.match(service, /你是 Pixory 的聊天帮答生成器/);
  assert.match(service, /openAiUsageObservationEnabled/);
});

test('AI chat composer adds a bulb entry beside the model icon for reply assist', () => {
  const composer = read('src/components/ai/AiChatComposer.tsx');

  assert.match(composer, /onReplyAssist: \(\) => void/);
  assert.match(composer, /replyAssistDisabled\?: boolean/);
  assert.match(composer, /accessibilityLabel="AI 帮答"/);
  assert.match(composer, /name="bulb-outline"/);
  assert.match(composer, /styles\.replyAssistButton/);
  assert.match(composer, /onPress=\{onReplyAssist\}/);
});

test('AI chat screen keeps per-mode reply assist pages and writes a picked suggestion into the composer', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /AiReplyAssistModal/);
  assert.match(chat, /replyAssistVisible/);
  assert.match(chat, /replyAssistPagesByMode/);
  assert.match(chat, /replyAssistPageIndexByMode/);
  assert.match(chat, /handleOpenReplyAssist/);
  assert.match(chat, /handleRefreshReplyAssistPage/);
  assert.match(chat, /generateReplyAssistSuggestions/);
  assert.match(chat, /replyAssistAbortControllerRef/);
  assert.match(chat, /replyAssistContextSignatureRef/);
  assert.match(chat, /buildReplyAssistContextSignature/);
  assert.match(chat, /signal:\s*controller\.signal/);
  assert.match(chat, /onReplyAssist=\{\(\) => \{\s*void handleOpenReplyAssist\(\);\s*\}\}/);
  assert.match(chat, /setComposerText\(suggestion\)/);
});

test('AI reply assist modal uses a fixed-height reader-like sheet with page navigation and mode switch', () => {
  const modal = read('src/components/ai/AiReplyAssistModal.tsx');

  assert.match(modal, /export function AiReplyAssistModal/);
  assert.match(modal, /accessibilityLabel="刷新帮答候选"/);
  assert.match(modal, /accessibilityLabel="切换到长句帮答"/);
  assert.match(modal, /accessibilityLabel="切换到短句帮答"/);
  assert.match(modal, /accessibilityLabel="上一页帮答候选"/);
  assert.match(modal, /accessibilityLabel="下一页帮答候选"/);
  assert.match(modal, /`\$\{safePageIndex \+ 1\}\/\$\{totalPages\}`/);
  assert.match(modal, /height:\s*\d+/);
  assert.match(modal, /short'\s*\?\s*3\s*:\s*1/);
});
