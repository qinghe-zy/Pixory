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
  const continueBlock = /export async function continueAssistantMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function continueAssistantReply/.exec(service)?.[0] ?? '';

  assert.match(service, /export interface ContinueAssistantMessageInput/);
  assert.match(service, /export async function continueAssistantMessage/);
  assert.match(service, /mode:\s*'continue'/);
  assert.match(service, /initialAnswerText:\s*assistantMessage\.content/);
  assert.match(service, /initialReasoningText:\s*assistantMessage\.reasoningText/);
  assert.match(service, /ignoreReasoningDeltas:\s*true/);
  assert.match(service, /thinkingExpected:\s*false/);
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

test('AI completed assistant replies can either continue downward or branch into a manual reply from the same action slot', () => {
  const service = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const replyAssistUserPromptBlock = /function buildReplyAssistUserPrompt[\s\S]*?\r?\n}\r?\n\r?\nfunction extractReplyAssistJson/.exec(service)?.[0] ?? '';

  assert.match(service, /export interface ContinueAssistantReplyInput/);
  assert.match(service, /export async function continueAssistantReply/);
  assert.match(service, /export interface ReplyToAssistantMessageInput/);
  assert.match(service, /export async function replyToAssistantMessage/);
  assert.match(service, /CONTINUE_ASSISTANT_NEW_REPLY_INSTRUCTION/);
  assert.match(service, /createAiId\('aimsg'\)/);
  assert.match(service, /branchRootMessageId:\s*input\.assistantMessageId/);
  assert.match(service, /branchVersionIndex:\s*nextBranchVersionIndex/);
  assert.match(service, /buildGenerationGuardSnapshotJsonWithDisplayKind\([\s\S]*'standalone_assistant'/);
  assert.match(service, /markVisibleMessagesAfterAsBranch/);
  assert.match(service, /userHistoryContent:\s*input\.userMessage\.content/);
  assert.match(service, /thinkingExpected:\s*!latestThread\.thinkingDisabled/);
  assert.doesNotMatch(service, /continueAssistantReply[\s\S]*ignoreReasoningDeltas:\s*true/);
  assert.doesNotMatch(service, /requestContentOverride:\s*CONTINUE_ASSISTANT_NEW_REPLY_INSTRUCTION/);
  assert.doesNotMatch(replyAssistUserPromptBlock, /buildReplyAssistRoleContext/);
  assert.doesNotMatch(replyAssistUserPromptBlock, /stableMemoryPrefix|companionMemoryPrefix/);

  assert.match(manager, /continueAssistantReply/);
  assert.match(manager, /startContinueAssistantReply/);
  assert.match(manager, /replyToAssistantMessage/);
  assert.match(manager, /startReplyToAssistantMessage/);
  assert.doesNotMatch(manager, /startContinueAssistantReply[\s\S]*rememberAssistantMessage/);

  assert.match(bubble, /replyActionMode\?: 'continue' \| 'reply'/);
  assert.match(bubble, /const assistantActionTargetsLatestVersion = message\.versionIndex === message\.versionTotal;/);
  assert.match(bubble, /const canContinueReply = !isUser && assistantActionTargetsLatestVersion && !generating && !actionPending && replyActionMode === 'continue'/);
  assert.match(bubble, /const canReplyToAssistant = !isUser && assistantActionTargetsLatestVersion && !generating && !actionPending && replyActionMode === 'reply'/);
  assert.match(bubble, /const textReplyActionLabel = replyActionMode === 'reply' \? '回复' : '续答'/);
  assert.match(bubble, /styles\.continueReplyActionButton/);
  assert.match(bubble, /styles\.continueReplyActionText/);
  assert.match(bubble, /fontStyle:\s*'italic'/);
  assert.match(bubble, /if \(canReplyToAssistant\) \{\s*onReplyToAssistant\(message\.id\);/);

  assert.match(chat, /async function handleContinueAssistantReply/);
  assert.match(chat, /aiGenerationManager\.startContinueAssistantReply/);
  assert.match(chat, /startContinueAssistantReply\([\s\S]*promptSnapshotJson:\s*JSON\.stringify\([\s\S]*messageDisplayKind:\s*"standalone_assistant"/);
  assert.match(chat, /function handleReplyToAssistant/);
  assert.match(chat, /aiGenerationManager\.startReplyToAssistantMessage/);
  assert.match(chat, /pendingReplyTargetScrollMessageIdRef = useRef<string \| null>\(null\);/);
  assert.match(chat, /function scheduleReplyTargetVisibility\(messageId: string\)/);
  assert.match(chat, /targetMessage\.versionIndex !== targetMessage\.versionTotal/);
  assert.match(chat, /showLatestMessageVersion\(replyTarget\.messageId\)/);
  assert.match(chat, /scheduleReplyTargetVisibility\(messageId\);/);
  assert.match(chat, /if \(assistantReplyTarget\?\.messageId\) \{\s*scheduleReplyTargetVisibility\(assistantReplyTarget\.messageId\);/);
  assert.doesNotMatch(
    /function handleReplyToAssistant[\s\S]*?\r?\n  }\r?\n/.exec(chat)?.[0] ?? '',
    /scheduleComposerFocusVisibility\(\);/,
  );
  assert.match(chat, /onContinueReply=\{handleContinueAssistantReply\}/);
  assert.match(chat, /onReplyToAssistant=\{handleReplyToAssistant\}/);
  assert.match(chat, /messageUsesStandaloneAssistantDisplay/);
  assert.match(chat, /messageDisplayKind === "standalone_assistant"/);
});

test('AI reply assist warms the first short page, quietly appends the second short page, and softens minor length overflow retries', () => {
  const service = read('src/ai/aiChatService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(service, /const REPLY_ASSIST_SHORT_SOFT_MAX_CHARS = REPLY_ASSIST_SHORT_MAX_CHARS \+ 4;/);
  assert.doesNotMatch(service, /REPLY_ASSIST_LONG_SOFT_MAX_CHARS/);
  assert.match(service, /const REPLY_ASSIST_MAX_ATTEMPTS = 3;/);
  assert.match(service, /charCount < REPLY_ASSIST_SHORT_MIN_CHARS \|\| charCount > REPLY_ASSIST_SHORT_SOFT_MAX_CHARS/);
  assert.match(service, /charCount < REPLY_ASSIST_LONG_MIN_CHARS \|\| charCount > REPLY_ASSIST_LONG_MAX_CHARS/);
  assert.doesNotMatch(service, /replyAssistSentenceCount\(suggestion\)/);

  assert.match(chat, /replyAssistCacheRef = useRef\(new Map<string, ReplyAssistPagesByMode>\(\)\);/);
  assert.match(chat, /replyAssistInFlightRef = useRef\(new Map<string, Promise<string\[\]>>\(\)\);/);
  assert.match(chat, /async function ensureReplyAssistFirstPage/);
  assert.match(chat, /async function appendReplyAssistPage/);
  assert.match(chat, /if \(latestCached\[mode\]\.length <= nextPageIndex\) \{/);
  assert.match(chat, /ensureReplyAssistFirstPage\("short", \{\s*foreground: false,/);
  assert.match(chat, /appendReplyAssistPage\("short", \{\s*foreground: false,/);
});
