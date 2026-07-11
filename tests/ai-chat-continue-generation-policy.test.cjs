const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI stopped or failed assistant replies can continue without replacing existing visible text', () => {
  const service = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const continueBlock = /export async function continueAssistantMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function rewriteUserMessage/.exec(service)?.[0] ?? '';

  assert.match(service, /export interface ContinueAssistantMessageInput/);
  assert.match(service, /export async function continueAssistantMessage/);
  assert.match(service, /mode:\s*'continue'/);
  assert.match(service, /initialAnswerText:\s*assistantMessage\.content/);
  assert.match(service, /initialReasoningText:\s*assistantMessage\.reasoningText/);
  assert.match(service, /ignoreReasoningDeltas:\s*true/);
  assert.match(service, /appendVisibleAssistantPartialToHistory/);
  assert.match(service, /CONTINUE_ASSISTANT_REPLY_INSTRUCTION/);
  assert.doesNotMatch(continueBlock, /snapshotMessageVersion/);

  assert.match(manager, /continueAssistantMessage/);
  assert.match(manager, /startContinueAssistantMessage/);

  assert.match(bubble, /onContinue/);
  assert.match(bubble, /canContinue/);
  assert.match(bubble, /accessibilityLabel="继续生成回复"/);
  assert.match(bubble, /name="play-forward-outline"/);

  assert.match(chat, /async function handleContinueAssistantMessage/);
  assert.match(chat, /aiGenerationManager\.startContinueAssistantMessage/);
  assert.match(chat, /onContinue=\{handleContinueAssistantMessage\}/);
});

test('AI completed assistant replies can spawn a new follow-up assistant message from a styled续答 action', () => {
  const service = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(service, /export interface ContinueAssistantReplyInput/);
  assert.match(service, /export async function continueAssistantReply/);
  assert.match(service, /CONTINUE_ASSISTANT_NEW_REPLY_INSTRUCTION/);
  assert.match(service, /createAiId\('aimsg'\)/);
  assert.match(service, /role: 'assistant'/);
  assert.match(service, /status: 'generating'/);
  assert.match(service, /userHistoryContent:\s*input\.userMessage\.content/);
  assert.doesNotMatch(service, /requestContentOverride:\s*CONTINUE_ASSISTANT_NEW_REPLY_INSTRUCTION/);

  assert.match(manager, /continueAssistantReply/);
  assert.match(manager, /startContinueAssistantReply/);
  assert.doesNotMatch(manager, /startContinueAssistantReply[\s\S]*rememberAssistantMessage/);

  assert.match(bubble, /const canContinueReply = !isUser && !generating && !actionPending && Boolean\(message\.content\.trim\(\)\) && message\.status === 'completed'/);
  assert.match(bubble, /accessibilityLabel="续答"/);
  assert.match(bubble, /styles\.continueReplyActionButton/);
  assert.match(bubble, /styles\.continueReplyActionText/);
  assert.match(bubble, /fontStyle:\s*'italic'/);
  assert.match(bubble, /onPress=\{\(\) => onContinueReply\(message\.id\)\}/);

  assert.match(chat, /async function handleContinueAssistantReply/);
  assert.match(chat, /aiGenerationManager\.startContinueAssistantReply/);
  assert.match(chat, /onContinueReply=\{handleContinueAssistantReply\}/);
});
