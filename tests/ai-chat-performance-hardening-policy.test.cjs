const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('branch lineage uses one recursive SQLite query with invalid lineage guards', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const lineageBody = /async resolveBranchLineage[\s\S]*?\r?\n  \},\r?\n\r?\n  async listRecentCompletedMessagesBefore/.exec(repository)?.[0] ?? '';

  assert.match(lineageBody, /BRANCH_LINEAGE_MAX_DEPTH/);
  assert.match(lineageBody, /WITH RECURSIVE/);
  assert.match(lineageBody, /lineage/);
  assert.match(lineageBody, /path/);
  assert.match(lineageBody, /cycleDetected/);
  assert.match(lineageBody, /missingParentDetected/);
  assert.match(lineageBody, /depthLimitReached/);
  assert.match(lineageBody, /ORDER BY depth ASC/);
  assert.doesNotMatch(lineageBody, /while \(currentRootMessageId && currentVersionIndex\)/);
  assert.doesNotMatch(lineageBody, /getFirstAsync<AiMessageRecord>\('SELECT \* FROM ai_messages WHERE id = \?', currentRootMessageId\)/);
});

test('AI chat streaming patches update by indexed message id before falling back', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const patchBody = /const applyStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[\]\);/.exec(chat)?.[0] ?? '';
  const bufferBody = /const applyOrBufferStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[[^\]]*\]\);/.exec(chat)?.[0] ?? '';
  const preserveLiveBody = /function preserveLiveStreamingMessages\(nextMessages: AiMessageWithCitations\[\]\): AiMessageWithCitations\[\] \{[\s\S]*?\r?\n  \}/.exec(chat)?.[0] ?? '';

  assert.match(chat, /messageIndexByIdRef/);
  assert.match(chat, /function rebuildMessageIndex/);
  assert.match(chat, /function replaceMessages/);
  assert.match(patchBody, /const messageIndex = messageIndexByIdRef\.current\.get\(patch\.id\)/);
  assert.match(patchBody, /current\[messageIndex\]/);
  assert.match(patchBody, /nextMessages\[messageIndex\] =/);
  assert.match(patchBody, /current\.map/);
  assert.match(patchBody, /rebuildMessageIndex\(nextMessages\)/);
  assert.match(chat, /replaceMessages\(\[\]\)/);
  assert.match(chat, /replaceMessages\(renderedMessages\)/);
  assert.match(chat, /function preserveLiveStreamingMessages/);
  assert.match(preserveLiveBody, /message\.status !== 'generating'/);
  assert.match(preserveLiveBody, /messageIndexByIdRef\.current\.get\(message\.id\)/);
  assert.match(preserveLiveBody, /currentMessage\.status !== 'generating'/);
  assert.match(preserveLiveBody, /currentContentLength/);
  assert.match(preserveLiveBody, /nextContentLength >= currentContentLength/);
  assert.match(preserveLiveBody, /content: currentMessage\.content/);
  assert.match(preserveLiveBody, /reasoningText: currentMessage\.reasoningText/);
  assert.match(chat, /preserveLiveStreamingMessages\(forceToLatest \? nextMessages : preserveReadModeFrozenMessages\(nextMessages\)\)/);
  const mergeMatches = bufferBody.match(/mergeBufferedStreamingPatch\(patch\)/g) ?? [];
  assert.equal(mergeMatches.length, 1);
  assert.match(bufferBody, /shouldPublishLiveStreamingPatch/);
  assert.match(bufferBody, /publishStreamingMessage/);
  assert.match(bufferBody, /const canAttachLiveLayout = bottomLockedRef\.current && !hasPendingStreamingReadBuffer\(\)/);
  assert.match(bufferBody, /if \(canAttachLiveLayout && canPublishLive && streamingIdentity\) \{[\s\S]*publishStreamingMessage/);
  assert.doesNotMatch(bufferBody, /else \{[\s\S]*publishStreamingMessage/);
  assert.doesNotMatch(bufferBody, /scrollToOffset/);
});

test('AI chat streaming assistant creation avoids an immediate full message reload', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const subscriberBody = /function createGenerationSubscriber[\s\S]*?\r?\n  }\r?\n\r?\n  function beginStreamingRequest/.exec(chat)?.[0] ?? '';
  const onCreatedBody = /onCreated: \(\{ assistantMessageId, generationId \}\) => \{[\s\S]*?\r?\n      \},\r?\n      onMessagePatch/.exec(subscriberBody)?.[0] ?? '';

  assert.match(onCreatedBody, /publishStreamingMessage\(streamingIdentity/);
  assert.match(onCreatedBody, /createStreamingAssistantMessage\(targetThreadId, assistantMessageId\)/);
  assert.match(onCreatedBody, /scheduleIntentionalLatestJump\(false\)/);
  assert.doesNotMatch(onCreatedBody, /reloadMessages\(targetThreadId/);
});

test('AI chat favorite identity work is memoized outside row rendering', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const renderBody = /const renderMessageItem = useCallback\([\s\S]*?\r?\n  \);/.exec(chat)?.[0] ?? '';

  assert.match(chat, /type MessageFavoriteIdentity = \{/);
  assert.match(chat, /const favoriteBranchIdentityState = useMemo/);
  assert.match(chat, /branchScopeSignature: JSON\.stringify\(normalizedScopes\)/);
  assert.match(chat, /const favoriteIdentityByMessageId = useMemo/);
  assert.match(chat, /next\.set\(message\.id, buildMessageFavoriteIdentity\(message\)\)/);
  assert.match(chat, /const assistantFavoriteKeyState = useMemo/);
  assert.match(chat, /Array\.from\(favoriteIdentityByMessageId\.values\(\)\)\.map\(\(identity\) => identity\.key\)/);
  assert.match(renderBody, /favoriteIdentityByMessageId\.get\(message\.id\)/);
  assert.doesNotMatch(renderBody, /buildMessageFavoriteIdentity\(message\)/);
});

test('embedding retrieval limits vector candidates before JS cosine scoring', () => {
  const embedding = read('src/ai/aiEmbeddingService.ts');
  const retrievalBody = /export async function tryEmbeddingRetrieval[\s\S]*?\r?\n}\r?\n?$/.exec(embedding)?.[0] ?? '';

  assert.match(embedding, /const EMBEDDING_VECTOR_CANDIDATE_LIMIT =/);
  assert.match(retrievalBody, /const candidateLimit = Math\.max/);
  assert.match(retrievalBody, /LIMIT \?/);
  assert.match(retrievalBody, /candidateLimit/);
  assert.match(retrievalBody, /ORDER BY ai_chunks\.documentId ASC, ai_chunks\.chunkIndex ASC, ai_embeddings\.chunkId ASC/);
  assert.match(retrievalBody, /\.slice\(0, input\.limit \?\? 6\)/);
});

test('thread retrieval only generates query embeddings after bounded direct retrieval is insufficient', () => {
  const retrieval = read('src/ai/aiRetrievalService.ts');
  const retrievalBody = /export async function retrieveForThread[\s\S]*?\r?\n}\r?\n?$/.exec(retrieval)?.[0] ?? '';

  assert.match(retrieval, /const OWNER_EMBEDDING_AVAILABILITY_CACHE_MAX =/);
  assert.match(retrieval, /const OWNER_EMBEDDING_AVAILABILITY_TTL_MS =/);
  assert.match(retrieval, /const QUERY_EMBEDDING_TIMEOUT_MS =/);
  assert.match(retrieval, /const ownerEmbeddingAvailabilityCache = new Map/);
  assert.match(retrieval, /function ownerEmbeddingAvailabilityCacheKey/);
  assert.match(retrieval, /async function withTimeout/);
  assert.match(retrievalBody, /const \[keyword, ipContext\] = await Promise\.all/);
  assert.match(retrievalBody, /const directSnippets = \[\.\.\.ipContext, \.\.\.keyword\]\.slice\(0, limit\)/);
  assert.match(retrievalBody, /if \(input\.tier === 'keyword'\)/);
  assert.match(retrievalBody, /if \(directSnippets\.length >= limit\) \{\s*return \{ mode: 'keyword', partial: false, snippets: directSnippets, timedOut: false \};\s*\}/);
  assert.match(retrievalBody, /const canTryEmbedding = await hasAnyEmbeddingsForOwner/);
  assert.match(retrievalBody, /withTimeout\(\s*generateQueryEmbedding/);
  assert.match(retrievalBody, /QUERY_EMBEDDING_TIMEOUT_MS/);
  assert.match(retrievalBody, /const queryEmbeddingResult = input\.queryVector\?\.length/);
  assert.match(retrievalBody, /const queryEmbedding = queryEmbeddingResult/);
  assert.match(retrievalBody, /canTryEmbedding\s*\?/);
  assert.match(retrievalBody, /: null;/);
  assert.match(retrievalBody, /const fallbackSnippets = directSnippets\.length === 0 \? await ownerPreviewSearch/);
  assert.doesNotMatch(retrievalBody, /const keyword = await keywordSearch/);
  assert.doesNotMatch(retrievalBody, /const ipContext = await collectIpContextSnippets/);
});

test('thread message loading keeps version totals cheap and only hydrates selected historical versions', () => {
  const chat = read('src/ai/aiChatService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const listBody = /export async function listThreadMessages[\s\S]*?\r?\n}\r?\n\r?\nexport async function searchThreadMessages/.exec(chat)?.[0] ?? '';
  const anchorBody = /async listMessagesBaseAroundAnchor[\s\S]*?\r?\n  \},\r?\n\r?\n  async findMessageById/.exec(repository)?.[0] ?? '';

  assert.match(chat, /anchorMessageId\?: string/);
  assert.match(chat, /selectedVersionByMessageId\?: Record<string, number>/);
  assert.match(listBody, /options\.anchorMessageId && options\.limit/);
  assert.match(listBody, /aiThreadRepository\.listMessagesBaseAroundAnchor/);
  assert.match(listBody, /aiThreadRepository\.listMessageVersionTotalsForMessages/);
  assert.match(listBody, /aiThreadRepository\.listMessagesBase/);
  assert.match(listBody, /const selectedVersionEntries = messagesWithBranchRoots/);
  assert.match(listBody, /aiThreadRepository\.listMessageVersionsByIndexForMessages/);
  assert.match(listBody, /const selectedVersion = selectedVersionsByMessageId\[message\.id\] \?\? null/);
  assert.match(listBody, /messageVersions: selectedVersion \? \[selectedVersion\] : \[\]/);
  assert.match(listBody, /versionIndex: selectedVersion\?\.versionIndex \?\? versionTotal/);
  assert.match(listBody, /versionTotal,/);
  assert.match(repository, /async listMessagesBase/);
  assert.match(repository, /async listMessagesBaseAroundAnchor/);
  assert.match(anchorBody, /const latestLimit = Math\.max\(1, limit\)/);
  assert.match(anchorBody, /const sideLimit = Math\.max\(1, Math\.ceil\(limit \/ 2\)\)/);
  assert.match(anchorBody, /aiThreadRepository\.listMessagesBase\(db, threadId, latestLimit, branchScopes\)/);
  assert.match(anchorBody, /ORDER BY createdAt DESC, id DESC[\s\S]*LIMIT \?/);
  assert.match(anchorBody, /ORDER BY createdAt ASC, id ASC[\s\S]*LIMIT \?/);
  assert.match(anchorBody, /\[\.\.\.latestRows, \.\.\.beforeRows, anchor, \.\.\.afterRows\]/);
  assert.match(repository, /async listMessageVersionTotalsForMessages/);
  assert.match(repository, /async listMessageVersionsByIndexForMessages/);
  assert.doesNotMatch(listBody, /listMessages\(db, threadId, options\.limit, options\.branchScopes\)/);
  assert.doesNotMatch(listBody, /listMessageVersionsForMessages\(db, messageIds\)/);
});

test('selecting an older message version refreshes thread messages with the latest selected-version map', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /const selectedVersionByMessageIdRef = useRef<Record<string, number>>\(\{\}\)/);
  assert.match(chat, /selectedVersionByMessageIdRef\.current = selectedVersionByMessageId/);
  assert.match(chat, /selectedVersionByMessageId: selectedVersionByMessageIdRef\.current/);
  assert.match(chat, /function handleSelectMessageVersion\(messageId: string, versionIndex: number\)/);
  assert.match(chat, /selectedVersionByMessageIdRef\.current = nextSelection/);
  assert.match(chat, /void reloadMessages\(targetThreadId, false, nextBranchScopes\)/);
  assert.match(chat, /selectedVersionByMessageIdRef\.current = branchTreeSelection\.selectionMap/);
});

test('streaming assistant content uses lightweight rendering until the reply is complete', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(bubble, /renderAssistantContentWithCursor\(content, streaming\)/);
  assert.match(bubble, /<AiMessageContent content=\{content\} streaming=\{streaming\} trailingInline=\{<InlineStreamingCursor \/>\} \/>/);
  assert.match(content, /streaming\?: boolean;/);
  assert.match(content, /if \(streaming\) \{/);
  assert.match(content, /return <Text selectable style=\{\[styles\.body, styles\.assistantText\]\}>/);
  assert.doesNotMatch(content, /const parsedMarkdown = useMemo\(.*\[content, streaming\]\)/);
});

test('streaming output keeps live rendering separate from detached history layout', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const button = read('src/components/ai/AiScrollToLatestButton.tsx');
  const bufferBody = /const applyOrBufferStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[[^\]]*\]\);/.exec(chat)?.[0] ?? '';
  const detachedBody = /bottomLockedRef\.current = false;[\s\S]*?syncScrollToLatestVisibility\(\);/.exec(bufferBody)?.[0] ?? '';

  assert.match(chat, /shouldPublishLiveStreamingPatch/);
  assert.match(bufferBody, /const canPublishLive/);
  assert.match(bufferBody, /const canAttachLiveLayout = bottomLockedRef\.current && !hasPendingStreamingReadBuffer\(\)/);
  assert.match(bufferBody, /publishStreamingMessage/);
  assert.match(bufferBody, /canAttachLiveLayout && canPublishLive && streamingIdentity/);
  assert.match(detachedBody, /freezeVisibleStreamingMessage\(patch\.id\)/);
  assert.match(detachedBody, /mergeBufferedStreamingPatch\(patch\)/);
  assert.doesNotMatch(detachedBody, /scrollToOffset/);
  assert.doesNotMatch(detachedBody, /followLatestMessage/);
  assert.doesNotMatch(button, /streaming\?: boolean/);
  assert.doesNotMatch(button, /AI 正在回复/);
});

test('reply-completed memory maintenance is deferred so chat completion does not compete with the foreground path', () => {
  const chat = read('src/ai/aiChatService.ts');
  const maintenance = read('src/ai/aiMemoryMaintenanceService.ts');

  assert.match(chat, /scheduleDeferredCompanionMemoryMaintenance/);
  assert.match(chat, /void scheduleDeferredCompanionMemoryMaintenance\(\{/);
  assert.match(maintenance, /const DEFERRED_REPLY_MAINTENANCE_DELAY_MS =/);
  assert.match(maintenance, /export function scheduleDeferredCompanionMemoryMaintenance/);
  assert.match(maintenance, /setTimeout\(\(\) => \{/);
  assert.match(maintenance, /scheduleMemoryMaintenance\(input\)/);
});

test('material-bound prompt building starts thread and bound-owner retrieval in parallel', () => {
  const chat = read('src/ai/aiChatService.ts');
  const promptBody = /async function buildPromptForThread[\s\S]*?\r?\n}\r?\n\r?\nexport async function createThreadFromContext/.exec(chat)?.[0] ?? '';

  assert.match(promptBody, /const threadMaterialRetrievalPromise: Promise<ThreadRetrievalResult>/);
  assert.match(promptBody, /retrieveForThread\(\{/);
  assert.match(promptBody, /const boundOwnerRetrievalPromise = ownerId/);
  assert.match(promptBody, /ownerType,/);
  assert.match(promptBody, /Promise\.all\(\[/);
  assert.match(promptBody, /threadMaterialRetrievalPromise/);
  assert.match(promptBody, /boundOwnerRetrievalPromise/);
  assert.doesNotMatch(promptBody, /const boundOwnerRetrieval = ownerId\s*\?\s*await retrieveForThread/);
});

test('deferred reply-completed maintenance coalesces per thread instead of stacking timers', () => {
  const maintenance = read('src/ai/aiMemoryMaintenanceService.ts');

  assert.match(maintenance, /const deferredReplyMaintenanceTimers = new Map/);
  assert.match(maintenance, /function deferredReplyMaintenanceKey/);
  assert.match(maintenance, /const existing = deferredReplyMaintenanceTimers\.get\(key\)/);
  assert.match(maintenance, /clearTimeout\(existing\.timeout\)/);
  assert.match(maintenance, /deferredReplyMaintenanceTimers\.set\(key, entry\)/);
  assert.match(maintenance, /deferredReplyMaintenanceTimers\.delete\(key\)/);
  assert.match(maintenance, /input = entry\.input/);
});

test('memory maintenance preserves per-thread coalescing and serializes global passes', () => {
  const queue = read('src/ai/aiMemoryMaintenanceQueue.ts');

  assert.match(queue, /const activeMaintenanceTasks = new Map/);
  assert.match(queue, /const queuedMaintenanceTasks: ActiveMaintenanceTask\[\] = \[\]/);
  assert.match(queue, /let globalMaintenanceRunnerActive = false/);
  assert.match(queue, /function enqueueMaintenanceTask/);
  assert.match(queue, /async function drainMaintenanceQueue/);
  assert.match(queue, /queuedMaintenanceTasks\.sort/);
  assert.match(queue, /reasonPriority\(right\.reason\) - reasonPriority\(left\.reason\)/);
  assert.match(queue, /let currentInput = entry\.currentInput/);
  assert.match(queue, /await runUnifiedMemoryMaintenancePass\(currentInput\)/);
  assert.match(queue, /recordMaintenanceFailure\(currentInput\.space, currentInput\.threadId, error\)/);
  assert.match(queue, /entry\.done\(undefined\)/);
  assert.match(queue, /activeMaintenanceTasks\.set\(key, entry\)/);
  assert.match(queue, /return entry\.promise/);
});
