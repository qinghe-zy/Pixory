const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI thinking block shows timed thinking state instead of the old summary label', () => {
  const thinking = read('src/components/ai/AiThinkingBlock.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(thinking, /正在思考中/);
  assert.match(thinking, /思考完成/);
  assert.match(thinking, /thinkingActive\?: boolean/);
  assert.match(thinking, /const thinking = thinkingActive \?\? \(status === 'generating' \|\| status === 'queued'\);/);
  assert.match(thinking, /toFixed\(1\)/);
  assert.match(thinking, /setInterval\(/);
  assert.match(bubble, /createdAt/);
  assert.match(bubble, /completedAt/);
  assert.match(bubble, /thinkingExpected\?: boolean/);
  assert.match(bubble, /const hasReasoningText = Boolean\(message\.reasoningText\?\.trim\(\)\);/);
  assert.match(bubble, /const thinkingActive = Boolean\(\s*thinkingExpected && \(message\.status === 'generating' \|\| message\.status === 'queued'\),?\s*\)/);
  assert.match(bubble, /const shouldRenderThinking =[\s\S]*thinkingActive \|\|[\s\S]*hasReasoningText/);
  assert.doesNotMatch(bubble, /label=\{message\.modelSnapshotJson\.includes\('reasoning'\) \? '思路' : '摘要'\}/);
});

test('AI regenerated and rewritten replies reset the thinking timer for the new generation', () => {
  const service = read('src/ai/aiChatService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const resetBlock = /const resetPatch = mode === 'continue'[\s\S]*?: \{([\s\S]*?)\n        \};/.exec(service)?.[1] ?? '';
  const regenerateResetBlock = /await aiThreadRepository\.updateMessage\(db, input\.assistantMessageId, \{([\s\S]*?)\n      \}\);/.exec(service)?.[1] ?? '';

  assert.match(service, /const startedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(resetBlock, /status:\s*'generating'/);
  assert.match(resetBlock, /createdAt:\s*startedAt/);
  assert.match(resetBlock, /completedAt:\s*null/);
  assert.match(regenerateResetBlock, /status:\s*'generating'/);
  assert.match(regenerateResetBlock, /promptSnapshotJson:\s*buildGenerationGuardSnapshotJson\(generationMetrics\)/);
  assert.match(regenerateResetBlock, /completedAt:\s*null/);
  assert.match(service, /snapshotMessageVersion\(db, assistantMessage\)/);
  assert.match(service, /snapshotMessageVersion\(db, userMessage\)/);
  assert.match(repository, /createdAt\?: string/);
  assert.match(repository, /createdAt:\s*patch\.createdAt/);
});

test('AI chat persists and exposes message versions for edits and regenerations', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(schema, /DATABASE_VERSION = 5[1-9]/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_message_versions/);
  assert.match(schema, /originalMessageId TEXT NOT NULL/);
  assert.match(schema, /versionIndex INTEGER NOT NULL/);
  assert.match(schema, /UNIQUE\(originalMessageId, versionIndex\)/);
  assert.match(db, /MIGRATION_STATEMENTS_V20/);
  assert.match(db, /currentVersion < 20/);
  assert.match(db, /MIGRATION_STATEMENTS_V21/);
  assert.match(db, /currentVersion < 21/);
  assert.match(db, /MIGRATION_STATEMENTS_V22/);
  assert.match(db, /currentVersion < 22/);
  assert.match(repository, /createMessageVersion/);
  assert.match(repository, /listMessageVersions/);
  assert.match(service, /snapshotMessageVersion/);
  assert.match(service, /messageVersions/);
  assert.match(service, /versionIndex/);
  assert.match(bubble, /onSelectVersion/);
  assert.match(bubble, /versionTotal/);
  assert.match(bubble, /chevron-back/);
  assert.match(bubble, /chevron-forward/);
});

test('AI chat hides the voice input entry while keeping Android speech recognition code available', () => {
  const composer = read('src/components/ai/AiChatComposer.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const nativeTs = read('src/native/pixoryMediaModule.ts');
  const nativeKt = read('android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');
  const appJson = read('app.json');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const pluginManifest = read('plugins/pixory-android-intents/templates/app/src/main/AndroidManifest.xml');

  assert.doesNotMatch(composer, /accessibilityLabel="语音输入"/);
  assert.doesNotMatch(composer, /name="mic-outline"/);
  assert.match(composer, /onVoiceInput/);
  assert.doesNotMatch(composer, /refresh-outline/);
  assert.doesNotMatch(composer, /retryAvailable/);
  assert.match(chat, /recognizeSpeech/);
  assert.match(nativeTs, /recognizeSpeech\(\): Promise<\{ text: string \}>/);
  assert.match(nativeKt, /RecognizerIntent/);
  assert.match(nativeKt, /SpeechRecognizer/);
  assert.match(appJson, /android\.permission\.RECORD_AUDIO/);
  assert.doesNotMatch(appJson, /blockedPermissions[\s\S]*RECORD_AUDIO/);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.doesNotMatch(manifest, /RECORD_AUDIO" tools:node="remove"/);
  assert.match(pluginManifest, /android\.permission\.RECORD_AUDIO/);
  assert.doesNotMatch(pluginManifest, /RECORD_AUDIO" tools:node="remove"/);
});

test('AI chat keeps the composer above Android keyboard with a scoped avoiding host', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.doesNotMatch(chat, /keyboardResizeHost/);
  assert.match(chat, /KeyboardAvoidingView/);
  assert.match(chat, /behavior=\{Platform\.OS === 'android' \? 'height' : undefined\}/);
  assert.match(chat, /enabled=\{Platform\.OS === 'android'\}/);
  assert.match(chat, /style=\{styles\.keyboardAvoidingHost\}/);
  assert.match(chat, /keyboardAvoidingHost:\s*\{[\s\S]{0,80}flex:\s*1/);
  assert.match(chat, /<View\s+style=\{\[styles\.screenContent,\s*\{ paddingTop: statusBarHeight \+ layout\.pageTopOffset \}\]\}[\s\S]{0,140}\{\.\.\.swipeDrawerPanResponder\.panHandlers\}/);
  assert.match(chat, /DRAWER_SWIPE_ACTIVATION_DISTANCE = 6/);
  assert.match(chat, /editingUserMessageIdRef/);
  assert.doesNotMatch(chat, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.doesNotMatch(chat, /keyboardBottomInset/);
  assert.doesNotMatch(chat, /marginBottom:\s*keyboardBottomInset/);
  assert.match(chat, /function handleEditUserMessage[\s\S]*editingUserMessageIdRef\.current = messageId/);
  assert.match(chat, /function cancelInlineEdit\(\)[\s\S]*editingUserMessageIdRef\.current = null[\s\S]*setEditingUserMessageId\(null\)/);
  assert.match(chat, /const inlineEditingActive = Boolean\(editingUserMessageId\)/);
  assert.match(chat, /keyboardDismissMode=\{inlineEditingActive \? 'none' : Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  assert.match(chat, /const handleComposerHeightChange = useCallback\(\(\) => \{\s*if \(editingUserMessageIdRef\.current\) \{\s*return;\s*\}/);
  assert.match(chat, /\{inlineEditingActive \? null : \(\s*<Animated\.View[\s\S]{0,120}style=\{\[styles\.composerPanel, composerEntranceStyle\]\}>/);
});

test('AI chat composer focus keeps the input visible without keyboard height hacks', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const composer = read('src/components/ai/AiChatComposer.tsx');

  assert.match(chat, /COMPOSER_FOCUS_VISIBILITY_DELAYS_MS/);
  assert.match(chat, /composerFocusVisibilityTimeoutsRef/);
  assert.match(chat, /function clearComposerFocusVisibilityTimeouts/);
  assert.match(chat, /function scheduleComposerFocusVisibility/);
  assert.match(chat, /function handleComposerFocus/);
  assert.match(chat, /COMPOSER_FOCUS_VISIBILITY_DELAYS_MS\.forEach\(\(delay\) =>/);
  assert.match(chat, /setTimeout\(\(\) => followLatestMessage\(false\), delay\)/);
  assert.match(chat, /editingUserMessageIdRef\.current/);
  assert.match(chat, /onFocus=\{handleComposerFocus\}/);
  assert.match(chat, /clearComposerFocusVisibilityTimeouts\(\)/);
  assert.doesNotMatch(chat, /Keyboard\.addListener/);
  assert.doesNotMatch(chat, /keyboardBottomInset/);

  assert.match(composer, /onFocus\?: \(\) => void/);
  assert.match(composer, /onFocus,/);
  assert.match(composer, /onFocus=\{onFocus\}/);
});

test('AI inline edit cancel and send labels are centered in their buttons', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const buttonStyle = /inlineEditorButton:\s*\{([\s\S]*?)\n  \}/.exec(bubble)?.[1] ?? '';
  const labelStyle = /inlineEditorButtonText:\s*\{([\s\S]*?)\n  \}/.exec(bubble)?.[1] ?? '';

  assert.match(buttonStyle, /alignItems:\s*'center'/);
  assert.match(buttonStyle, /justifyContent:\s*'center'/);
  assert.match(buttonStyle, /paddingVertical:\s*0/);
  assert.match(labelStyle, /textAlign:\s*'center'/);
});

test('AI inline edit cursor stays visible on the user bubble', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const editorInput = /<TextInput[\s\S]*?value=\{editDraft\}/.exec(bubble)?.[0] ?? '';

  assert.match(editorInput, /cursorColor=\{aiLightColors\.onDark\}/);
  assert.match(editorInput, /selectionColor=\{aiLightColors\.onDark\}/);
  assert.doesNotMatch(editorInput, /selectionColor=\{aiLightColors\.primary\}/);
});

test('AI inline edit keeps the edited user message visible above the keyboard', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /INLINE_EDIT_VISIBILITY_SCROLL_DELAYS_MS/);
  assert.match(chat, /INLINE_EDIT_SCROLL_RETRY_DELAY_MS/);
  assert.match(chat, /inlineEditVisibilityTimeoutsRef/);
  assert.match(chat, /inlineEditSafeVisibleMessageIdsRef/);
  assert.match(chat, /inlineEditViewabilityConfigRef/);
  assert.match(chat, /function clearInlineEditVisibilityTimeouts/);
  assert.match(chat, /function scrollInlineEditMessageIntoView/);
  assert.match(chat, /function retryInlineEditScrollToIndex/);
  assert.match(chat, /function scheduleInlineEditVisibility/);
  assert.match(chat, /editingUserMessageIdRef\.current !== messageId/);
  assert.match(chat, /inlineEditSafeVisibleMessageIdsRef\.current = new Set/);
  assert.match(chat, /inlineEditSafeVisibleMessageIdsRef\.current\.has\(messageId\)/);
  assert.match(chat, /function getMessageItemIdAtIndex/);
  assert.match(chat, /const failedMessageId = getMessageItemIdAtIndex\(info\.index\)/);
  assert.doesNotMatch(chat, /const failedMessageId = invertedMessageItems\[info\.index\]\?\.message\.id/);
  assert.match(chat, /editingUserMessageIdRef\.current !== failedMessageId/);
  assert.match(chat, /inlineEditSafeVisibleMessageIdsRef\.current\.has\(failedMessageId\)/);
  assert.match(chat, /inlineEditVisibilityTimeoutsRef\.current\.push\(\s*setTimeout/);
  assert.match(chat, /const index = invertedMessageIndexById\.get\(messageId\)/);
  assert.match(chat, /messageListRef\.current\?\.scrollToIndex\(\{\s*animated:\s*true,\s*index,[\s\S]{0,80}viewPosition:\s*0\.42/);
  assert.match(chat, /viewabilityConfigCallbackPairs=\{viewabilityConfigCallbackPairsRef\.current\}/);
  assert.match(
    chat,
    /onViewableItemsChanged: handleInlineEditViewableItemsChangedRef\.current,[\s\S]{0,120}viewabilityConfig: inlineEditViewabilityConfigRef\.current/,
  );
  assert.match(chat, /function handleMessageScrollToIndexFailed/);
  assert.match(chat, /handleMessageScrollToIndexFailed[\s\S]{0,160}retryInlineEditScrollToIndex\(info\)/);
  assert.match(chat, /onScrollToIndexFailed=\{handleMessageScrollToIndexFailed\}/);
  assert.match(chat, /scheduleInlineEditVisibility\(messageId\)/);
  assert.match(chat, /clearInlineEditVisibilityTimeouts\(\)/);
  assert.doesNotMatch(chat, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.doesNotMatch(chat, /keyboardBottomInset/);
});

test('AI chat uses an inverted list pinned to offset zero without forced scrollToEnd loops', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const composer = read('src/components/ai/AiChatComposer.tsx');

  assert.match(chat, /const nextInvertedMessageItems = nextVisibleMessageItems\.slice\(\)\.reverse\(\)/);
  assert.match(chat, /data=\{invertedMessageItems\}/);
  assert.match(chat, /\binverted\b/);
  assert.match(chat, /ListFooterComponent=/);
  assert.match(chat, /scrollToOffset\(\{\s*animated,\s*offset:\s*0\s*\}\)/);
  assert.match(chat, /const MESSAGE_STREAM_FOLLOW_THRESHOLD = 48/);
  assert.match(chat, /const MESSAGE_SCROLL_BUTTON_THRESHOLD = 2400/);
  assert.doesNotMatch(chat, /MESSAGE_STREAMING_BUTTON_THRESHOLD/);
  assert.match(chat, /const MESSAGE_SAFE_FLUSH_OFFSET = 32/);
  assert.match(chat, /const STICK_TO_BOTTOM_OFFSET_PX = 70/);
  assert.match(chat, /const MESSAGE_LIST_ANCHOR_CONFIG = \{ minIndexForVisible: 0 \}/);
  assert.match(chat, /const ACTIVE_LATEST_JUMP_RETRY_DELAYS_MS = \[80, 260, 520\]/);
  assert.match(chat, /updateStreamingLockStateSnapshot/);
  assert.match(chat, /const nextShowScrollToLatest = contentOffset\.y > MESSAGE_SCROLL_BUTTON_THRESHOLD/);
  assert.doesNotMatch(chat, /const nextShowScrollToLatest = hasUnseenStreamingUpdate \|\|/);
  const latestVisibilityBody = /function syncScrollToLatestVisibility\(offsetY = messageScrollOffsetRef\.current\) \{[\s\S]*?\n  \}/.exec(chat)?.[0] ?? '';
  assert.match(latestVisibilityBody, /offsetY > MESSAGE_SCROLL_BUTTON_THRESHOLD/);
  assert.doesNotMatch(latestVisibilityBody, /hasBufferedStreamingUpdateRef|pendingFinalReloadRef|hasPendingStreamingReadBuffer/);
  assert.match(chat, /userScrolledAwayFromBottomRef\.current = !isNearBottomRef\.current/);
  assert.match(chat, /maintainVisibleContentPosition=\{MESSAGE_LIST_ANCHOR_CONFIG\}/);
  assert.match(chat, /onScrollBeginDrag=\{handleMessageScrollBeginDrag\}/);
  assert.match(chat, /onMomentumScrollBegin=\{handleMessageMomentumScrollBegin\}/);
  assert.match(chat, /onMomentumScrollEnd=\{handleMessageMomentumScrollEnd\}/);
  assert.match(chat, /onScrollEndDrag=\{handleMessageScrollEnd\}/);
  assert.match(chat, /<AiScrollToLatestButton\s+bottomOffset=\{composerShellHeight \+ spacing\[3\] \+ spacing\[1\.5\]\}\s+visible=\{showScrollToLatest && !inlineEditingActive\}\s+onPress=\{handleReturnToLatestPress\}/);
  assert.doesNotMatch(chat, /const \[latestVisible, setLatestVisible\]/);
  assert.doesNotMatch(chat, /latestVisibleRef/);
  assert.doesNotMatch(chat, /<Animated\.View style=\{\[styles\.composerPanel, composerEntranceStyle\]\}>[\s\S]{0,220}<AiScrollToLatestButton/);
  assert.doesNotMatch(chat, /scrollToEnd/);
  assert.doesNotMatch(chat, /setTimeout\(scroll/);
  assert.doesNotMatch(chat, /onContentSizeChange=/);
  assert.doesNotMatch(chat, /onLayout=\{\(\) => \{/);
  assert.match(chat, /const handleComposerHeightChange = useCallback/);
  assert.match(chat, /hasPendingStreamingReadBuffer\(\)[\s\S]{0,80}userScrolledAwayFromBottomRef\.current[\s\S]{0,80}!bottomLockedRef\.current/);
  assert.match(chat, /handleComposerHeightChange[\s\S]*scheduleStreamingTailReconcile\("composer-height"/);
  assert.match(chat, /onComposerHeightChange=\{handleComposerHeightChange\}/);
  assert.match(composer, /onComposerHeightChange\?: \(\) => void/);
  assert.match(composer, /attachmentCountRef/);
  assert.match(composer, /onComposerHeightChange\?\.\(\)/);
  assert.match(composer, /if \(nextHeight === inputHeightRef\.current\) \{\s*return/);
});

test('AI chat sends attachments as provider payloads instead of filename-only prompt text', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const service = read('src/ai/aiChatService.ts');
  const base = read('src/ai/providers/base.ts');
  const openai = read('src/ai/providers/openAiCompatibleProvider.ts');
  const gemini = read('src/ai/providers/geminiProvider.ts');
  const claude = read('src/ai/providers/claudeProvider.ts');

  assert.match(base, /export interface AiChatAttachment/);
  assert.match(base, /type:\s*'input_image'/);
  assert.match(base, /base64Data:\s*string/);
  assert.match(base, /attachments\?: AiChatAttachment\[\]/);

  assert.match(chat, /attachments,/);
  assert.match(chat, /startSendUserMessage\(\{[\s\S]*attachments/);

  assert.match(service, /export interface AiOutgoingAttachment/);
  assert.match(service, /prepareOutgoingAttachments/);
  assert.match(service, /FileSystem\.readAsStringAsync\(attachment\.uri,[\s\S]*EncodingType\.Base64/);
  assert.match(service, /buildAttachmentPromptContext/);
  assert.match(service, /input\.attachments/);
  assert.match(service, /visionEnabled: canSendVisionAttachments/);
  assert.match(service, /attachments: outgoingAttachments/);

  assert.match(openai, /buildOpenAiUserContent/);
  assert.match(openai, /image_url/);
  assert.match(openai, /data:\$\{attachment\.mimeType\};base64,\$\{attachment\.base64Data\}/);
  assert.match(gemini, /buildGeminiUserParts/);
  assert.match(gemini, /inlineData/);
  assert.match(claude, /buildClaudeUserContent/);
  assert.match(claude, /source:\s*\{\s*type:\s*'base64'/);
});

test('AI chat attachment pipeline is replayable and budget-safe', () => {
  const service = read('src/ai/aiChatService.ts');
  const schema = read('src/database/schema.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_message_attachments/);
  assert.match(schema, /documentId TEXT/);
  assert.match(schema, /FOREIGN KEY \(documentId\) REFERENCES ai_documents\(id\) ON DELETE SET NULL/);
  assert.match(repository, /createMessageAttachment/);
  assert.match(repository, /listMessageAttachments/);

  assert.match(service, /persistOutgoingAttachments/);
  assert.match(service, /loadOutgoingAttachmentsForMessage/);
  assert.match(service, /importDocumentAttachment/);
  assert.match(service, /documentId: importedDocument\?\.id \?\? null/);
  assert.match(service, /findDocumentById\(db, attachment\.documentId as string\)/);
  assert.match(service, /regenerateAssistantMessage[\s\S]*loadOutgoingAttachmentsForMessage/);
  assert.match(service, /retryAssistantMessage/);

  assert.match(service, /const canSendVisionAttachments = hasImageAttachments \|\| \(provider\.visionEnabled && resolvedModel\.model\.supportsVision\);/);
  assert.match(service, /canSendVisionAttachments/);
  assert.match(service, /input\.visionEnabled\s*\?\s*Promise\.all/);

  assert.match(service, /attachmentPromptContext/);
  assert.match(service, /buildDocumentAttachmentContext/);
  assert.match(service, /buildPromptForThread\(input\.thread, requestContent, branchScopes, \{[\s\S]*attachmentPromptContext/);
  assert.doesNotMatch(service, /const userPromptWithAttachments = \[/);
});

test('AI chat buffers streaming patches while reading history and only flushes at safe points', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const scrollHandler = /const handleMessageScroll = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/.exec(chat)?.[0] ?? '';
  const scrollEndHandler = /const handleMessageScrollEnd = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/.exec(chat)?.[0] ?? '';

  assert.match(chat, /bottomLockedRef/);
  assert.match(chat, /showScrollToLatestRef/);
  assert.match(chat, /streamingReadBufferActiveRef/);
  assert.match(chat, /bufferedStreamingPatchRef/);
  assert.match(chat, /pendingFinalReloadRef/);
  assert.match(chat, /hasBufferedStreamingUpdateRef/);
  assert.match(chat, /latestJumpTimeoutsRef/);
  assert.match(chat, /frozenStreamingMessageByIdRef/);
  assert.match(chat, /messagesRef/);
  assert.match(chat, /function mergeBufferedStreamingPatch/);
  assert.match(chat, /function freezeVisibleStreamingMessage/);
  assert.doesNotMatch(chat, /function buildScrollRevealedStreamingPatch/);
  assert.doesNotMatch(chat, /function revealBufferedStreamingStateForScroll/);
  assert.match(chat, /function preserveReadModeFrozenMessages/);
  assert.match(chat, /const flushBufferedStreamingState = useCallback/);
  assert.match(chat, /const applyOrBufferStreamingMessagePatch = useCallback/);
  assert.match(chat, /const queueFollowLatestMessageAfterLayout = useCallback/);
  assert.match(chat, /requestAnimationFrame\(\(\) => \{[\s\S]{0,180}followLatestMessage\(animated\)/);
  assert.match(chat, /function clearLatestJumpTimeouts\(\)[\s\S]{0,180}latestJumpTimeoutsRef\.current\.forEach\(\(timeout\) => clearTimeout\(timeout\)\)/);
  assert.match(chat, /function scheduleIntentionalLatestJump\(animated = false\)[\s\S]{0,700}followLatestMessage\(animated\);[\s\S]{0,700}queueFollowLatestMessageAfterLayout\(animated\);[\s\S]{0,700}ACTIVE_LATEST_JUMP_RETRY_DELAYS_MS\.forEach\(\(delay\) => \{/);
  assert.match(chat, /setTimeout\(\(\) => \{[\s\S]{0,160}followLatestMessage\(animated\);[\s\S]{0,80}\}, delay\)/);
  assert.match(chat, /applyOrBufferStreamingMessagePatch\(targetThreadId, generation, patch\)/);
  assert.match(chat, /preserveReadModeFrozenMessages\(nextMessages\)/);
  assert.match(chat, /resetStreamingReadBufferState\(\)/);
  assert.match(chat, /function markIntentionalLatestJump\(\)[\s\S]{0,420}bottomLockedRef\.current = true[\s\S]{0,420}setScrollToLatestVisible\(false\)/);
  assert.match(chat, /previousMessageScrollOffsetRef/);
  assert.match(chat, /scrollingTowardLatestRef/);
  assert.match(chat, /requestStreamingTailCommit\(\)/);
  assert.match(chat, /flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /scheduleStreamingTailReconcile\("detached-patch"/);
  assert.match(chat, /scheduleStreamingTailReconcile\("final-completion"/);
  assert.match(chat, /bottomLockedRef\.current = bottomLockedRef\.current \|\| followLatest \|\| messageScrollOffsetRef\.current <= MESSAGE_SAFE_FLUSH_OFFSET/);
  assert.match(chat, /streamingReadBufferActiveRef\.current = true;\s*pendingFinalReloadRef\.current = true;\s*pendingStreamingTailCommitRef\.current = true;\s*hasBufferedStreamingUpdateRef\.current = true/);
  assert.match(chat, /async function handleSend\(\)[\s\S]*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /async function handleSubmitInlineRewrite[\s\S]*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /async function handleConfirmedRegenerate[\s\S]*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /onCreated: \(\{ assistantMessageId, generationId, thinkingExpected \}\) => \{[\s\S]*thinkingExpectedByMessageIdRef\.current\.set\([\s\S]*publishStreamingMessage\(streamingIdentity[\s\S]*scheduleIntentionalLatestJump\(false\)/);
  assert.match(chat, /async function handleSend\(\)[\s\S]*scheduleIntentionalLatestJump\(false\)/);
  assert.match(chat, /async function handleSubmitInlineRewrite[\s\S]*scheduleIntentionalLatestJump\(false\)/);
  assert.match(chat, /async function handleConfirmedRegenerate[\s\S]*scheduleIntentionalLatestJump\(false\)/);
  assert.match(chat, /async function handleSend\(\)[\s\S]*try \{\s*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /async function handleSubmitInlineRewrite[\s\S]*try \{\s*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /startReplyToAssistantMessage\([\s\S]*onCreated: \(\{[\s\S]*thinkingExpected,[\s\S]*streamRequest\.subscriber\.onCreated\?\.\(\{[\s\S]*thinkingExpected,/);
  assert.match(chat, /startRewriteUserMessage\([\s\S]*onCreated: \(\{[\s\S]*thinkingExpected,[\s\S]*subscriber\.onCreated\?\.\(\{[\s\S]*thinkingExpected,/);
  assert.match(chat, /startContinueAssistantMessage\([\s\S]*onCreated: \(\{[\s\S]*thinkingExpected,[\s\S]*subscriber\.onCreated\?\.\(\{[\s\S]*thinkingExpected,/);
  assert.match(chat, /startContinueAssistantReply\([\s\S]*onCreated: \(\{[\s\S]*thinkingExpected,[\s\S]*subscriber\.onCreated\?\.\(\{[\s\S]*thinkingExpected,/);
  assert.match(chat, /async function handleConfirmedRegenerate[\s\S]*try \{\s*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /const hasPendingBufferedFlush = hasBufferedStreamingUpdateRef\.current \|\| pendingFinalReloadRef\.current/);
  assert.match(chat, /if \(!hasPendingBufferedFlush\) \{[\s\S]{0,120}syncScrollToLatestVisibility\(offsetY\);[\s\S]{0,120}markScrollGestureSettled\(\);[\s\S]{0,80}return;/);
  assert.match(chat, /event\.nativeEvent\.contentOffset\.y <= MESSAGE_SAFE_FLUSH_OFFSET/);
  assert.match(chat, /pendingStreamingTailCommitRef/);
  assert.match(chat, /canCommitStreamingTailToMessage/);
  assert.match(chat, /const canRestoreLiveStreamingAtBottom = useCallback/);
  assert.match(chat, /nativeMessageScrollOffsetRef\.current > MESSAGE_SAFE_FLUSH_OFFSET/);
  assert.match(chat, /isUserDraggingRef\.current/);
  assert.match(chat, /tailState\.pendingShrinkHeight > 0/);
  assert.match(chat, /promotedBlockIds\.has\(block\.blockId\)[\s\S]{0,160}typeof block\.measuredHeight !== "number"/);
  assert.match(chat, /requestAnimationFrame\(\(\) => \{[\s\S]{0,500}canRestoreLiveStreamingAtBottom\(\)[\s\S]{0,500}flushBufferedStreamingState\(\{[\s\S]{0,120}followLatest: true,[\s\S]{0,120}resetTail: true/);
  assert.match(chat, /visibleStreamingTailMessageIdsRef/);
  assert.match(
    chat,
    /if \(shouldStartDetachedTail\)[\s\S]{0,180}visibleStreamingTailMessageIdsRef\.current\.add\(patch\.id\)/,
  );
  assert.match(chat, /replayVisible:[\s\S]{0,140}visibleStreamingTailMessageIdsRef\.current\.has/);
  assert.match(chat, /viewabilityConfigCallbackPairs/);
  assert.match(scrollEndHandler, /requestStreamingTailCommit/);
  assert.doesNotMatch(
    scrollEndHandler,
    /void flushBufferedStreamingState\(\{ followLatest: false \}\)/,
  );
  assert.match(scrollHandler, /scheduleStreamingTailReconcile\("scroll"\)/);
  assert.doesNotMatch(scrollHandler, /revealBufferedStreamingStateForScroll/);
  assert.doesNotMatch(scrollHandler, /flushBufferedStreamingState/);
  assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*flushBufferedStreamingState/);
  assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*scrollToOffset/);
});

test('AI chat route reloads do not fall back to stale active thread state', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const routeReloadEffect = /  useEffect\(\(\) => \{\r?\n    const targetThreadId = threadId \?\? null;[\s\S]*?\r?\n  \}, \[reloadMessages, scrollToLatestMessage, searchTargetBranchScopes, searchTargetMessageId, threadId\]\);/.exec(chat)?.[0] ?? '';

  assert.doesNotMatch(chat, /threadId \?\? activeThreadId/);
  assert.match(routeReloadEffect, /const targetThreadId = threadId \?\? null/);
  assert.match(routeReloadEffect, /currentBranchScopes = searchTargetBranchScopes \?\? await loadPersistedCurrentBranchScopes\(targetThreadId\)/);
  assert.match(routeReloadEffect, /const hasSearchTarget = Boolean\(searchTargetMessageId\)/);
  assert.match(routeReloadEffect, /await reloadMessages\(targetThreadId, \{\s*anchorMessageId: searchTargetMessageId \?\? undefined,\s*branchScopes: currentBranchScopes,\s*forceToLatest: !hasSearchTarget,\s*\}\)/);
  assert.doesNotMatch(routeReloadEffect, /activeThreadId/);
  assert.match(chat, /reloadModelLabel\(threadId \?\? null/);
  assert.match(chat, /reloadParticipantAppearance\(threadId \?\? null/);
  assert.match(chat, /reloadThreadTitle\(threadId \?\? null/);
  assert.match(chat, /reloadMemoryCaptures\(threadId \?\? null/);
  assert.match(chat, /latestRequestRef/);
  assert.match(chat, /screenMountedRef/);
  assert.match(chat, /async function ensureThread\(\s*options\?: \{\s*preserveComposerDraft\?: boolean;\s*\},\s*\): Promise<string \| null>/);
  assert.match(chat, /if \(!screenMountedRef\.current\) \{\s*return null;\s*\}/);
  assert.match(chat, /if \(!nextThreadId \|\| !screenMountedRef\.current\) \{\s*return;\s*\}/);
  assert.match(chat, /screenMountedRef\.current = false/);
  assert.match(chat, /generationBusyRef/);
  assert.match(chat, /function beginGenerationAction/);
  assert.match(chat, /if \(generationBusyRef\.current\) \{\s*return null;\s*\}/);
  assert.match(chat, /const actionToken = beginGenerationAction\(\)/);
  assert.match(chat, /finishGenerationAction\(actionToken\)/);
  assert.match(chat, /cancelGenerationAction\(\)/);
});

test('AI chat send-created threads do not restore the sent text into the composer draft', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const ensureThreadBody =
    /async function ensureThread\([\s\S]*?\r?\n  \}/.exec(chat)?.[0] ?? '';
  const sendBody =
    /async function handleSend\(\) \{[\s\S]*?\r?\n  \}/.exec(chat)?.[0] ?? '';

  assert.match(ensureThreadBody, /const preserveComposerDraft = options\?\.preserveComposerDraft !== false/);
  assert.match(ensureThreadBody, /if \(preserveComposerDraft && composerText\) \{/);
  assert.match(ensureThreadBody, /else if \(!preserveComposerDraft\) \{[\s\S]*clearComposerDraft\(thread\.id\)/);
  assert.match(sendBody, /nextThreadId = await ensureThread\(\{ preserveComposerDraft: false \}\)/);
  assert.match(sendBody, /setComposerText\(""\)/);
  assert.match(sendBody, /clearComposerDraft\(draftThreadKey\)/);
});

test('AI chat keeps first-message streaming alive when a new thread is written back to the route', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const routeEffect = /useEffect\(\(\) => \{[\s\S]*?activeThreadIdRef\.current = nextThreadId[\s\S]*?\}, \[applyDisplayTitle, contextTitle, contextType, threadId\]\);/.exec(chat)?.[0] ?? '';

  assert.match(routeEffect, /if \(activeThreadIdRef\.current === nextThreadId\)/);
  assert.match(routeEffect, /applyDisplayTitle\(nextDisplayTitle\)/);
  assert.match(routeEffect, /return;/);
  assert.match(routeEffect, /clearGenerationSubscription\(\)/);
  assert.match(routeEffect, /activeStreamGenerationRef\.current \+= 1/);
  assert.match(chat, /setMessages\(\(current\) => \{\s*const nextMessages = current\.some\(\(message\) => message\.id === assistantMessageId\)/);
  assert.match(chat, /messagesRef\.current = nextMessages/);
  assert.match(chat, /role:\s*'assistant'/);
  assert.match(chat, /status:\s*'generating'/);
});

test('AI regenerate switches back to the newest generated message version', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const regenerateBlock = /async function handleConfirmedRegenerate[\s\S]*?aiGenerationManager\.startRegenerateAssistantMessage/.exec(chat)?.[0] ?? '';

  assert.match(chat, /function showLatestMessageVersion\(messageId: string\)/);
  assert.match(chat, /delete next\[messageId\]/);
  assert.match(regenerateBlock, /showLatestMessageVersion\(targetMessageId\)/);
});

test('AI message header shows participant identity and keeps action ordering intact', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const actionRow = /<View style=\{\[styles\.actionRow[\s\S]*?<\/View>/m.exec(bubble)?.[0] ?? '';
  const copyIndex = actionRow.indexOf('accessibilityLabel="复制消息"');
  const editIndex = actionRow.indexOf('accessibilityLabel="重写消息"');
  const regenerateIndex = actionRow.indexOf('accessibilityLabel="重新生成回复"');
  const versionIndex = actionRow.indexOf('styles.versionControl');

  assert.ok(copyIndex >= 0);
  assert.ok(editIndex >= 0);
  assert.ok(regenerateIndex >= 0);
  assert.ok(versionIndex > editIndex);
  assert.ok(versionIndex > regenerateIndex);
  assert.match(bubble, /assistantDisplayName\?: string \| null/);
  assert.match(bubble, /showUserAvatar\?: boolean/);
  assert.match(bubble, /formatAiFullMinute/);
  assert.match(bubble, /const headerTime = formatAiFullMinute/);
  assert.match(bubble, /const messageTimestamp = message\.completedAt \?\? message\.updatedAt \?\? message\.createdAt/);
  assert.match(bubble, /const footerTime = headerVisible/);
  assert.match(bubble, /isUser[\s\S]{0,80}formatAiMessageMinute\(message\.completedAt \?\? message\.updatedAt\)[\s\S]{0,80}formatAiFullMinute\(messageTimestamp\)/);
  assert.match(bubble, /styles\.headerRow/);
  assert.match(bubble, /styles\.headerName/);
  assert.match(bubble, /styles\.headerTime/);
  assert.match(bubble, /formatAiMessageMinute/);
  assert.match(bubble, /messageTimestamp/);
  assert.match(bubble, /styles\.messageTime/);
});

test('AI failed streaming state is not overwritten by a final generating patch', () => {
  const service = read('src/ai/aiChatService.ts');
  const streamBlock = /async function streamAssistantReply[\s\S]*?let finalCitations/.exec(service)?.[0] ?? '';
  const failedReturnIndex = streamBlock.indexOf('if (streamFailed)');
  const forcedPersistIndex = streamBlock.indexOf('await persistStreamingSnapshot(true)');
  const forcedEmitIndex = streamBlock.lastIndexOf('emitStreamingPatch(true)');

  assert.ok(failedReturnIndex >= 0);
  assert.ok(forcedPersistIndex > failedReturnIndex);
  assert.ok(forcedEmitIndex > failedReturnIndex);
  assert.match(streamBlock, /if \(streamFailed\) \{\s*flushStreamingTextChunks\(\);[\s\S]{0,120}return;\s*\}/);
});



test('AI markdown renderer covers common GFM and lightweight inline HTML without unsafe scrolling', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(content, /\^#\{1,6\}/);
  assert.match(content, /parseMarkdownContent/);
  assert.match(content, /collectReferenceLinks/);
  assert.match(content, /REFERENCE_LINK_DEFINITION_PATTERN/);
  assert.match(content, /normalizeReferenceLabel/);
  assert.match(content, /REFERENCE_LINK_TOKEN_PATTERN/);
  assert.match(content, /collectFootnotes/);
  assert.match(content, /FOOTNOTE_DEFINITION_PATTERN/);
  assert.match(content, /FOOTNOTE_TOKEN_PATTERN/);
  assert.match(content, /type: 'footnote'/);
  assert.match(content, /AUTO_LINK_TOKEN_PATTERN/);
  assert.match(content, /EMAIL_AUTO_LINK_TOKEN_PATTERN/);
  assert.match(content, /HTML_INLINE_TOKEN_PATTERN/);
  assert.match(content, /ESCAPED_MARKDOWN_TOKEN_PATTERN/);
  assert.match(content, /type: 'definitionList'/);
  assert.match(content, /definitionTerm/);
  assert.match(content, /definitionText/);
  assert.match(content, /parseTableAlignments/);
  assert.match(content, /alignments: parseTableAlignments/);
  assert.match(content, /tableCellCenter/);
  assert.match(content, /tableCellRight/);
  assert.match(content, /kbdText/);
  assert.match(content, /supText/);
  assert.match(content, /subText/);
  assert.match(content, /footnoteMarker/);
  assert.match(content, /footnoteText/);
  assert.match(content, /part\.match\(HTML_INLINE_TOKEN_PATTERN\)/);
  assert.match(content, /message:\s*'不支持打开该链接'/);
  assert.doesNotMatch(content, /<ScrollView/);
});

test('AI rich text rendering keeps untrusted HTML and network preview behavior bounded', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');
  const math = read('src/components/ai/AiMathBlock.tsx');
  const linkPreview = read('src/components/ai/AiLinkPreviewCard.tsx');

  assert.match(content, /renderSafeInlineHtmlToken/);
  assert.match(content, /HTML_INLINE_TOKEN_PATTERN = \/\^<\(span\|font\|kbd\|sup\|sub\)\[\^>\]\*>\(\[\\s\\S\]\*\?\)<\\\/\\1>\$\/i/);
  assert.match(content, /<\(\?:span\|font\|kbd\|sup\|sub\)\[\^>\]\*>\[\\s\\S\]\*\?<\\\/\(\?:span\|font\|kbd\|sup\|sub\)>/);
  assert.match(content, /sanitizeInlineFontWeight/);
  assert.match(content, /font-weight:\\s\*\(bold\|700\|600\)/);
  assert.match(content, /const inlineHtml = rawCode\.match\(HTML_INLINE_TOKEN_PATTERN\)/);
  assert.match(content, /return renderSafeInlineHtmlToken\(rawCode, key\)/);
  assert.match(content, /return <Text key=\{key\} style=\{styles\.inlineCode\}>\{rawCode\}<\/Text>/);
  assert.match(content, /if \(tagName === 'span' \|\| tagName === 'font'\) \{[\s\S]*?safeColor \? \{ color: safeColor \} : undefined[\s\S]*?innerText/);
  assert.match(content, /INLINE_TOKEN_PATTERN\.exec\(text\)/);
  assert.match(content, /sanitizeInlineColor/);
  assert.match(content, /stripInlineHtmlText/);
  assert.match(content, /isRenderableHttpUrl/);
  assert.doesNotMatch(content, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(content, /\{ color \}/);

  assert.match(math, /escapeHtml/);
  assert.match(math, /KATEX_CORE_CSS/);
  assert.match(math, /\.mfrac/);
  assert.match(math, /\.mtable/);
  assert.match(math, /originWhitelist=\{\['about:blank'\]\}/);
  assert.match(math, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
  assert.match(math, /setSupportMultipleWindows=\{false\}/);
  assert.match(math, /allowFileAccess=\{false\}/);
  assert.doesNotMatch(math, /cdn\.jsdelivr/);
  assert.doesNotMatch(math, /e\.message\}<\/div>/);

  assert.match(linkPreview, /const \[loadState, setLoadState\] = useState<'idle' \| 'loading' \| 'ready' \| 'failed'>\('idle'\)/);
  assert.match(linkPreview, /AbortController/);
  assert.match(linkPreview, /mountedRef/);
  assert.match(linkPreview, /requestIdRef/);
  assert.match(linkPreview, /resetPreviewState/);
  assert.match(linkPreview, /requestIdRef\.current \+= 1/);
  assert.match(linkPreview, /LINK_PREVIEW_MAX_BYTES/);
  assert.match(linkPreview, /response\.body\?\.getReader\(\)/);
  assert.match(linkPreview, /reader\.cancel\(\)/);
  assert.match(linkPreview, /LINK_PREVIEW_ALLOWED_CONTENT_TYPE = \/\^\(\?:text\\\/html\\b\|application\\\/xhtml\\\+xml\\b\)\/i/);
  assert.match(linkPreview, /function resolveOgImageUrl/);
  assert.match(linkPreview, /onPress=\{loadState === 'ready' \? openUrl : loadPreview\}/);
});

test('AI rich HTML uses a bounded WebView for CSS and block layout support', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(content, /import \{ WebView \} from 'react-native-webview'/);
  assert.match(content, /function shouldRenderRichHtml/);
  assert.match(content, /function shouldRenderWholeRichHtml/);
  assert.match(content, /function shouldRenderHtmlCodeBlock/);
  assert.match(content, /function AiRichHtmlBlock/);
  for (const property of [
    'font-size',
    'font-family',
    'font-style',
    'text-decoration',
    'text-shadow',
    'opacity',
    'border',
    'border-radius',
    'padding',
    'margin',
    'letter-spacing',
    'text-transform',
    'display',
    'white-space',
  ]) {
    assert.match(content, new RegExp(property.replace('-', '[-]')));
  }
  assert.match(content, /address\|article\|aside\|blockquote[\s\S]*div[\s\S]*section[\s\S]*table[\s\S]*thead[\s\S]*tbody[\s\S]*tr[\s\S]*th[\s\S]*td/);
  assert.match(content, /linear-gradient|radial-gradient|repeating-linear-gradient/);
  assert.match(content, /replace\(\s*\/url\\\(\[\^\\\)\]\*\\\)\/gi,\s*'none'\s*\)/);
  assert.match(content, /replace\(\s*\/@import\\s\+/);
  assert.match(content, /replace\(\s*\/\\s\+\(src\|srcset\|poster\)/);
  assert.match(content, /shouldRenderWholeRichHtml\(content\)[\s\S]*<AiRichHtmlBlock html=\{content\}/);
  assert.match(content, /const renderWholeRichHtml = shouldRenderWholeRichHtml\(content\)/);
  assert.match(content, /shouldParseMarkdown \? getCachedMarkdownContent\(content\) : null/);
  assert.match(content, /variant === 'assistant' && !streaming && !renderWholeRichHtml/);
  assert.match(content, /Math\.max\(rect\.height, root\.scrollHeight\)/);
  assert.doesNotMatch(content, /body\.scrollHeight/);
  assert.doesNotMatch(content, /doc\.scrollHeight/);
  assert.match(content, /originWhitelist=\{\['about:blank'\]\}/);
  assert.match(content, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
  assert.match(content, /setSupportMultipleWindows=\{false\}/);
  assert.match(content, /allowFileAccess=\{false\}/);
  assert.match(content, /onShouldStartLoadWithRequest=\{\(request\) => request\.url === 'about:blank'\}/);
  assert.match(content, /scrollEnabled=\{false\}/);
  assert.match(content, /block\.type === 'code'[\s\S]*shouldRenderHtmlCodeBlock\(block\)[\s\S]*<AiRichHtmlBlock html=\{block\.text\}/);
});

test('AI inline code avoids Android Text background stacking artifacts', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');
  const inlineCodeStyle = /inlineCode:\s*\{[\s\S]*?\n  \},/.exec(content)?.[0] ?? '';

  assert.match(inlineCodeStyle, /lineHeight:\s*22/);
  assert.doesNotMatch(inlineCodeStyle, /paddingHorizontal/);
  assert.doesNotMatch(inlineCodeStyle, /borderRadius/);
});

test('AI session settings rely on Android adjustResize without JS keyboard padding', () => {
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const scaffold = read('src/components/ai/AiLightScaffold.tsx');

  assert.doesNotMatch(sessionConfig, /keyboardBottomInset/);
  assert.doesNotMatch(sessionConfig, /Keyboard\.addListener/);
  assert.doesNotMatch(sessionConfig, /paddingBottom:\s*keyboardBottomInset/);
  assert.match(sessionConfig, /scrollViewRef/);
  assert.match(sessionConfig, /handleSystemPromptFocus/);
  assert.match(sessionConfig, /onFocus=\{handleSystemPromptFocus\}/);
  assert.match(scaffold, /contentContainerStyle/);
  assert.match(scaffold, /scrollViewRef/);
});

test('AI session role instruction textarea stays anchored for long prompts above Android keyboard', () => {
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const promptTextarea = /<AiLightTextareaRow[\s\S]*?value=\{systemPrompt\}/.exec(sessionConfig)?.[0] ?? '';

  assert.match(sessionConfig, /systemPromptFieldRef/);
  assert.match(sessionConfig, /SYSTEM_PROMPT_FOCUS_SCROLL_DELAY_MS/);
  assert.match(sessionConfig, /SYSTEM_PROMPT_FOCUS_TOP_OFFSET/);
  assert.match(sessionConfig, /measureLayout\(/);
  assert.match(sessionConfig, /scrollTo\(\{ y: Math\.max\(0, y - SYSTEM_PROMPT_FOCUS_TOP_OFFSET\), animated: true \}\)/);
  assert.match(sessionConfig, /<View collapsable=\{false\} ref=\{systemPromptFieldRef\}>/);
  assert.doesNotMatch(sessionConfig, /handleSystemPromptFocus[\s\S]{0,600}scrollToEnd/);
  assert.match(promptTextarea, /scrollEnabled/);
  assert.match(promptTextarea, /style=\{styles\.systemPromptTextarea\}/);
  assert.match(sessionConfig, /SYSTEM_PROMPT_TEXTAREA_MAX_HEIGHT/);
  assert.match(sessionConfig, /maxHeight: SYSTEM_PROMPT_TEXTAREA_MAX_HEIGHT/);
});

test('video long-press fast-forward does not reveal playback controls', () => {
  const player = read('src/screens/VideoPlayerScreen.tsx');
  const startHold = /function startHoldFastForward\(\) \{([\s\S]*?)\n  \}/.exec(player)?.[1] ?? '';

  assert.match(startHold, /setHoldSpeedVisible\(true\)/);
  assert.doesNotMatch(startHold, /showControls\(\)/);
  assert.doesNotMatch(startHold, /resetHideTimer\(\)/);
});

test('AI deep memory defaults on and stores local summaries memories and settings', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');
  const captureService = read('src/ai/aiMemoryCaptureService.ts');
  const maintenanceModel = read('src/ai/aiMemoryMaintenanceModelService.ts');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_thread_memory_settings/);
  assert.match(schema, /deepMemoryEnabled INTEGER NOT NULL DEFAULT 1/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_thread_summaries/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_memories/);
  assert.match(db, /MIGRATION_STATEMENTS_V22/);
  assert.match(repository, /getThreadMemorySettings/);
  assert.match(repository, /deepMemoryEnabled:\s*true/);
  assert.match(repository, /updateThreadMemorySettings/);
  assert.match(repository, /upsertThreadSummary/);
  assert.match(repository, /listActiveMemories/);
  assert.match(service, /if \(!settings\.deepMemoryEnabled\)/);
  assert.match(service, /retrieveDynamicMemoryContext/);
  assert.match(captureService, /captureDeepMemoryForExchange/);
  assert.match(captureService, /callMemoryMaintenanceModel/);
  assert.match(captureService, /buildMemoryModelPrompt/);
  assert.match(captureService, /parseModelMemoryUpdate/);
  assert.match(captureService, /只输出 JSON/);
  assert.match(captureService, /modelUpdate\?\.memories \?\? prepared\.localCandidates/);
  assert.match(captureService, /MemoryFacade\.createClaim/);
  assert.match(captureService, /parseMemoryReconciliationOperations/);
  assert.match(maintenanceModel, /status:\s*'local_fallback'/);
  assert.match(maintenanceModel, /未配置远程维护模型，摘要压缩和画像维护不会调用远程模型/);
  assert.match(service, /lastMaintenanceError/);
  assert.match(sessionConfig, /深度记忆/);
  assert.match(sessionConfig, /不会继续注入记忆背景/);
  assert.match(sessionConfig, /lastMaintenanceError/);
  assert.match(sessionConfig, /最近一次远程维护失败，已使用本地轻量整理/);
  assert.match(sessionConfig, /maintenanceWarning/);
  assert.match(sessionConfig, /accessibilityRole="switch"/);
  assert.match(sessionConfig, /deepMemoryEnabled/);
});

test('AI chat uses configurable complete rounds and avoids full reload for every streaming token', () => {
  const service = read('src/ai/aiChatService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const streamBlock = /async function streamAssistantReply[\s\S]*?\r?\n}\r?\n\r?\nexport async function sendUserMessage/.exec(service)?.[0] ?? '';
  const regenerateBlock = /export async function regenerateAssistantMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function retryAssistantMessage/.exec(service)?.[0] ?? '';
  const rewriteBlock = /export async function rewriteUserMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function stopStreamingMessage/.exec(service)?.[0] ?? '';

  assert.match(service, /contextHistoryLoadLimit/);
  assert.match(service, /selectRecentMessagesByRound/);
  assert.match(service, /historyRoundLimit/);
  assert.match(service, /searchCompletedMessageFts/);
  assert.doesNotMatch(service, /\.slice\(-8\)/);
  assert.match(repository, /listRecentCompletedMessagesBefore/);
  assert.match(repository, /countCompletedNonSystemMessagesAfter/);
  assert.match(repository, /listCompletedNonSystemMessagesAfter/);
  assert.match(repository, /listRecentCompletedNonSystemMessages/);
  assert.match(repository, /findPreviousMessageByRole/);
  assert.match(repository, /findNextMessageByRole/);
  assert.match(repository, /listMessageIdsAfter/);
  assert.match(streamBlock, /buildPromptForThread/);
  assert.match(streamBlock, /coverage\.recentMessages/);
  assert.doesNotMatch(streamBlock, /listMessages\(db, input\.thread\.id\)/);
  assert.doesNotMatch(regenerateBlock, /listMessages\(db, thread\.id\)/);
  assert.doesNotMatch(rewriteBlock, /listMessages\(db, thread\.id\)/);
  assert.match(service, /onMessagePatch/);
  assert.match(service, /targetPersistIntervalMs/);
  assert.match(service, /targetStreamingPatchIntervalMs/);
  assert.match(service, /STREAMING_RECOVERABILITY_PERSIST_INTERVAL_MS/);
  assert.match(chat, /applyStreamingMessagePatch/);
  assert.match(chat, /publishStreamingMessage/);
  assert.match(chat, /shouldUseLiveStreamingPatch/);
  assert.match(chat, /activeStreamingIdentityRef/);
  assert.match(chat, /generationId/);
  assert.match(read('src/components/ai/AiMessageBubble.tsx'), /AiStreamingMessageText/);
  assert.match(read('src/components/ai/AiStreamingMessageText.tsx'), /useStreamingMessageTextSnapshot/);
  assert.match(read('src/components/ai/AiStreamingMessageText.tsx'), /useStreamingMessageReasoningSnapshot/);
  assert.match(chat, /<FlatList/);
  assert.match(chat, /CHAT_MESSAGE_PAGE_SIZE = 60/);
  assert.match(chat, /加载更早消息/);
  assert.match(chat, /ListFooterComponent=/);
  assert.match(chat, /invertedMessageItems/);
  assert.match(chat, /isLoadingEarlierRef/);
  assert.match(chat, /maintainVisibleContentPosition=\{MESSAGE_LIST_ANCHOR_CONFIG\}/);
  assert.doesNotMatch(chat, /maintainVisibleContentPosition=\{\{ minIndexForVisible: 0 \}\}/);
  assert.doesNotMatch(chat, /onContentSizeChange=/);
  assert.doesNotMatch(chat, /onLayout=\{\(\) => \{/);
  assert.match(service, /signal\?: AbortSignal/);
  assert.match(service, /signal: input\.signal/);
  assert.match(service, /input\.signal\?\.aborted/);
  assert.match(service, /markAssistantStopped/);
  assert.match(service, /stopForAbort/);
  assert.match(service, /status: 'stopped'/);
  assert.match(repository, /listMessageVersionsForMessages/);
  assert.match(repository, /listCitationsForMessages/);
});

test('AI companion memory compression is asynchronous and segment based', () => {
  const summary = read('src/ai/aiMemorySummaryService.ts');
  const maintenance = read('src/ai/aiMemoryMaintenanceService.ts');
  const queue = read('src/ai/aiMemoryMaintenanceQueue.ts');
  const chat = read('src/ai/aiChatService.ts');

  assert.match(summary, /summaryPrewarmRoundThreshold/);
  assert.match(summary, /COMPRESS_OLDEST_ROUND_COUNT = 20/);
  assert.match(summary, /SUMMARY_SEGMENT_LIMIT = 5/);
  assert.match(summary, /PRESERVE_LATEST_SEGMENT_COUNT = 2/);
  assert.match(summary, /compressOldestThreadRounds/);
  assert.match(summary, /maybeMergeSummarySegments/);
  assert.match(summary, /buildCompressionPrompt/);
  assert.match(summary, /buildSummaryMergePrompt/);
  assert.match(summary, /countCompletedNonSystemMessagesAfter/);
  assert.match(summary, /listCompletedNonSystemMessagesAfter/);
  assert.match(summary, /buildLocalCompressionSummary/);
  assert.match(summary, /buildLocalMergedSummary/);
  assert.match(maintenance, /scheduleCompanionMemoryMaintenance/);
  assert.match(queue, /activeMaintenanceTasks/);
  assert.match(queue, /maintenanceTaskKey/);
  assert.match(queue, /activeMaintenanceTasks\.get\(key\)/);
  assert.match(queue, /pendingReason/);
  assert.match(queue, /chooseStrongerReason/);
  assert.match(queue, /recordMaintenanceFailure/);
  assert.match(summary, /remoteFallbackError/);
  assert.match(maintenance, /scheduleDeferredCompanionMemoryMaintenance/);
  assert.match(chat, /scheduleDeferredCompanionMemoryMaintenance/);
  assert.match(queue, /allowRemoteModel/);
});

test('AI memory service exposes board lazy capture and prompt helpers', () => {
  const service = read('src/ai/aiMemoryService.ts');

  assert.match(service, /listMemoryBoardItems/);
  assert.match(service, /createManualMemory/);
  assert.match(service, /deleteMemory/);
  assert.match(service, /shouldRunImmediateMemoryCapture/);
  assert.match(service, /MEMORY_CAPTURE_PATTERNS/);
  assert.match(service, /maybeRunLazyMemoryConsolidation/);
  assert.match(service, /pendingTurnCount >= 5/);
  assert.match(service, /buildStableMemoryPrefix/);
  assert.match(service, /retrieveDynamicMemoryContext/);
  assert.match(service, /getMemoryPromptPriority/);
  assert.match(service, /right\.priority - left\.priority/);
});

test('AI companion memory profile maintenance has bounded queries and local fallback', () => {
  const profile = read('src/ai/aiMemoryProfileService.ts');

  assert.match(profile, /countCompletedNonSystemMessagesAfter/);
  assert.match(profile, /listCompletedNonSystemMessagesAfter/);
  assert.match(profile, /listRecentCompletedNonSystemMessages/);
  assert.match(profile, /buildLocalProfileJsonFromMessages/);
  assert.match(profile, /remoteFallbackError/);
  assert.doesNotMatch(profile, /listMessages\(db, threadId\)/);
});

test('AI deep memory uses local current-turn extraction and cadence-bound remote maintenance', () => {
  const chatService = read('src/ai/aiChatService.ts');
  const captureService = read('src/ai/aiMemoryCaptureService.ts');
  const extractor = read('src/ai/memory/localFastExtractor.ts');

  assert.match(captureService, /pendingTurnCount/);
  assert.match(captureService, /nextPendingTurnCount < 5/);
  assert.match(captureService, /callMemoryMaintenanceModel/);
  assert.match(extractor, /runLocalFastExtraction/);
  assert.match(extractor, /lane:\s*'working'/);
  assert.match(chatService, /writeCurrentTurnObservation/);
  const summarizeBlock =
    /export async function captureDeepMemoryForExchange[\s\S]*?\r?\n}\r?\n?$/.exec(captureService)?.[0] ?? '';
  assert.match(summarizeBlock, /callMemoryMaintenanceModel/);
  assert.doesNotMatch(summarizeBlock, /resolveThreadProvider/);
  assert.doesNotMatch(chatService, /void updateDeepMemoryAfterReply\(\{[\s\S]*\}\);/);
});

test('AI companion memory maintenance runs on chat leave and app background', () => {
  const app = read('App.tsx');
  const maintenance = read('src/ai/aiMemoryMaintenanceService.ts');

  assert.match(maintenance, /type CompanionMaintenanceReason = 'reply_completed' \| 'leave_chat' \| 'app_background'/);
  assert.match(app, /scheduleAiChatMemoryMaintenanceForRoute/);
  assert.match(app, /scheduleCompanionMemoryMaintenance/);
  assert.match(app, /AppState\.addEventListener\('change'[\s\S]*scheduleAiChatMemoryMaintenanceForRoute[\s\S]*'app_background'/);
  assert.match(app, /function popRoute\(\)[\s\S]*scheduleAiChatMemoryMaintenanceForRoute[\s\S]*'leave_chat'/);
  assert.match(app, /hardwareBackPress[\s\S]*scheduleAiChatMemoryMaintenanceForRoute[\s\S]*'leave_chat'/);
  assert.match(app, /function pushRoute\(route: AppRoute\)[\s\S]*route\.name === 'ai-chat'[\s\S]*scheduleAiChatMemoryMaintenanceForRoute[\s\S]*'leave_chat'/);
});

test('AI early rewrite and regenerate keep later messages as branches without destructive prompts', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const rewriteHandler = /async function handleSubmitInlineRewrite[\s\S]*?\n  }\n\n  async function handleStop/.exec(chat)?.[0] ?? '';
  const regenerateHandler = /async function handleRegenerate[\s\S]*?\n  }\n\n  async function handleConfirmedRegenerate/.exec(chat)?.[0] ?? '';

  assert.match(chat, /Alert\.alert\(/);
  assert.doesNotMatch(chat, /移除后续对话/);
  assert.doesNotMatch(chat, /hasLaterMessages/);
  assert.doesNotMatch(rewriteHandler, /confirmRemovingLaterMessages/);
  assert.doesNotMatch(regenerateHandler, /confirmRemovingLaterMessages/);
  assert.match(repository, /markVisibleMessagesAfterAsBranch/);
  assert.match(repository, /DELETE_MESSAGE_CHUNK_SIZE = 200/);
  assert.match(repository, /DELETE FROM ai_messages WHERE id IN/);
});

test('AI editing a user message keeps full branch history instead of deleting later messages', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  const rewriteBlock = /export async function rewriteUserMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function stopStreamingMessage/.exec(service)?.[0] ?? '';

  assert.match(schema, /DATABASE_VERSION = 5[1-9]/);
  assert.match(schema, /branchRootMessageId TEXT/);
  assert.match(schema, /branchVersionIndex INTEGER/);
  assert.match(schema, /MIGRATION_STATEMENTS_V31/);
  assert.match(db, /MIGRATION_STATEMENTS_V31/);
  assert.match(repository, /branchRootMessageId: string \| null/);
  assert.match(repository, /branchVersionIndex: number \| null/);
  assert.match(repository, /markVisibleMessagesAfterAsBranch/);
  assert.match(repository, /branchRootMessageId IS NULL/);
  assert.match(service, /const previousUserVersion = await snapshotMessageVersion\(db, userMessage\)/);
  assert.match(service, /const nextBranchVersionIndex = previousUserVersion\.versionIndex \+ 1/);
  assert.match(rewriteBlock, /markVisibleMessagesAfterAsBranch\(db, thread\.id, input\.userMessageId, input\.userMessageId, previousUserVersion\.versionIndex, userMessage\)/);
  assert.match(rewriteBlock, /branchRootMessageId:\s*input\.userMessageId/);
  assert.match(rewriteBlock, /branchVersionIndex:\s*nextBranchVersionIndex/);
  assert.doesNotMatch(rewriteBlock, /deleteMessagesByIds/);
  assert.doesNotMatch(/async function handleSubmitInlineRewrite[\s\S]*?\n  }\n\n  async function handleStop/.exec(chat)?.[0] ?? '', /confirmRemovingLaterMessages/);
});

test('AI message version selection filters descendant branch messages and future sends inherit the active branch', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const service = read('src/ai/aiChatService.ts');
  const branching = read('src/ai/aiBranching.ts');

  assert.match(chat, /function getSelectedMessageVersionIndex/);
  assert.match(chat, /function getBoundMessageVersionIndex/);
  assert.match(branching, /export function messageMatchesSelectedBranchPath/);
  assert.match(branching, /const path: AiBranchMessageLike\[\] = \[\]/);
  assert.match(branching, /while \(current\?\.branchRootMessageId && current\.branchVersionIndex\)/);
  assert.match(branching, /return false/);
  assert.doesNotMatch(branching, /messageMatchesSelectedBranchPath\(branchRoot/);
  assert.match(chat, /messageMatchesSelectedBranchPath/);
  assert.match(chat, /message\.branchRootMessageId/);
  assert.match(chat, /branchVersionIndex/);
  assert.match(chat, /previousMessage\?\.role === 'user'/);
  assert.match(chat, /selectedVersionByMessageId\[previousMessage\.id\]/);
  assert.match(chat, /const visibleMessageState = useMemo\(/);
  assert.match(chat, /const nextMessagesById = new Map<string, AiMessageWithCitations>\(\)/);
  assert.match(chat, /if \(!messageMatchesSelectedBranchPath\(message, nextMessagesById, selectedVersionByMessageId\)\) \{/);
  assert.match(chat, /const nextVisibleMessages: AiMessageWithCitations\[\] = \[\]/);
  assert.match(chat, /function getActiveBranchForNextMessage/);
  assert.match(chat, /getActiveBranchForNextMessageFromVisibleMessages/);
  assert.match(chat, /branchRootMessageId:\s*activeBranch\?\.branchRootMessageId/);
  assert.match(chat, /branchVersionIndex:\s*activeBranch\?\.branchVersionIndex/);
  assert.match(service, /branchRootMessageId\?: string \| null/);
  assert.match(service, /branchVersionIndex\?: number \| null/);
  assert.match(service, /branchRootMessageId:\s*input\.branchRootMessageId/);
  assert.match(service, /branchVersionIndex:\s*input\.branchVersionIndex/);
});

test('AI branch scoping keeps hidden branches out of prompts retrieval and memory maintenance', () => {
  const service = read('src/ai/aiChatService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const maintenance = read('src/ai/aiMemoryMaintenanceQueue.ts');
  const capture = read('src/ai/aiMemoryCaptureService.ts');
  const memoryService = read('src/ai/aiMemoryService.ts');
  const profile = read('src/ai/aiMemoryProfileService.ts');
  const summary = read('src/ai/aiMemorySummaryService.ts');
  const coverageService = read('src/ai/context/conversationCoverageService.ts');

  assert.match(schema, /DATABASE_VERSION = 5[1-9]/);
  assert.match(schema, /CREATE VIRTUAL TABLE IF NOT EXISTS ai_message_version_fts USING fts5/);
  assert.match(db, /MIGRATION_STATEMENTS_V32/);
  assert.match(db, /currentVersion < 32/);
  assert.match(repository, /export interface AiBranchScope/);
  assert.match(repository, /async resolveBranchLineage/);
  assert.match(repository, /buildVisibleBranchClause/);
  assert.match(repository, /materializeMessagesForBranchScopes/);
  assert.match(repository, /listBranchVersionRowsForScopes/);
  assert.match(repository, /applyBranchVersionContent/);
  assert.match(repository, /syncMessageVersionFts/);
  assert.match(repository, /searchVersionedCompletedMessages/);
  assert.match(repository, /candidate\.branchRootMessageId IS NULL/);
  assert.match(repository, /buildMemorySourceVisibilityClause/);
  assert.match(repository, /buildSummarySegmentVisibilityClause/);
  assert.match(repository, /searchCompletedMessageFts\(db: SQLiteDatabase, input: \{[\s\S]*branchScopes\?: AiBranchScope\[\]/);
  assert.match(repository, /searchActiveMemoryFts\([\s\S]*branchScopes\?: AiBranchScope\[\]/);
  assert.match(repository, /listSummarySegments\(db: SQLiteDatabase, threadId: string, branchScopes\?: AiBranchScope\[\]/);
  assert.match(repository, /listRecentCompletedMessagesBefore\([\s\S]*branchScopes\?: AiBranchScope\[\]/);
  assert.match(service, /resolveStreamingBranchScopes/);
  assert.match(service, /const attachmentPromptContext = preparedAttachments\.promptContext/);
  assert.match(service, /buildPromptForThread\(input\.thread, requestContent, branchScopes, \{[\s\S]*attachmentPromptContext[\s\S]*generationMetrics/);
  assert.match(service, /buildCompanionMemoryPrefix\(db, thread, \{ branchScopes, settings: memorySettings \}\)/);
  assert.match(service, /buildStableMemoryPrefix\(db, thread, \{ branchScopes, excludedClaimIds, settings: memorySettings \}\)/);
  assert.match(service, /searchCompletedMessageFts\(db, \{[\s\S]*branchScopes/);
  assert.match(service, /searchActiveMemoryFts\(db, \{[\s\S]*branchScopes/);
  assert.match(service, /listRecentCompletedNonSystemMessages\(db, thread\.id, DEEP_MEMORY_RECENT_MESSAGE_LIMIT, branchScopes\)/);
  assert.match(service, /scheduleDeferredCompanionMemoryMaintenance\(\{[\s\S]*branchScopes/);
  assert.match(memoryService, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(memoryService, /listMemoryBoardItems\(db, \{[\s\S]*branchScopes: options\?\.branchScopes/);
  assert.match(coverageService, /listSummarySegments\(db, input\.thread\.id, input\.branchScopes\)/);
  assert.match(memoryService, /searchActiveMemoryFts\(db, \{[\s\S]*branchScopes: options\?\.branchScopes/);
  assert.match(maintenance, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(maintenance, /const branchScopes = input\.branchScopes \?\? \[\]/);
  assert.match(maintenance, /allowIrreversibleImportEffects/);
  assert.match(maintenance, /reversibleImportSessionId/);
  assert.match(maintenance, /compressOldestThreadRounds\(input\.space, input\.threadId, \{ allowRemoteModel, branchScopes, \.\.\.importAwareContext \}\)/);
  assert.match(maintenance, /maybeMergeSummarySegments\(input\.space, input\.threadId, \{ allowRemoteModel, branchScopes, \.\.\.importAwareContext \}\)/);
  assert.match(maintenance, /loadLastUserMessage\(input\.space, input\.threadId, branchScopes\)/);
  assert.match(capture, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(capture, /listMessages\(db, input\.thread\.id, 80, input\.branchScopes\)/);
  assert.match(capture, /searchActiveMemoryFts\(db, \{[\s\S]*branchScopes: input\.branchScopes/);
  assert.match(profile, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(profile, /listRecentCompletedNonSystemMessages\(db, threadId, 30, options\.branchScopes\)/);
  assert.match(summary, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(summary, /listSummarySegments\(db, threadId, options\.branchScopes\)/);
  assert.match(summary, /messageScanLimit = \(prewarmRoundThreshold \+ COMPRESS_OLDEST_ROUND_COUNT \+ 5\) \* 2/);
  assert.match(summary, /listCompletedNonSystemMessagesAfter\(db, threadId, job\.lastCompressedMessageId, messageScanLimit, options\.branchScopes\)/);
});

test('AI stop-and-new-chat routes immediately while generation cleanup runs in the background', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const newChatBlock = /function handleNewChatPress\(\)[\s\S]*?function handleSessionSettingsPress/.exec(chat)?.[0]
    ?? /function handleNewChatPress\(\)[\s\S]*?async function stopCurrentGeneration/.exec(chat)?.[0]
    ?? '';
  const stopBlock = /async function handleStop\([\s\S]*?\r?\n  }\r?\n\r?\n  async function handleRegenerate/.exec(chat)?.[0] ?? '';

  assert.match(chat, /async function stopCurrentGeneration/);
  assert.match(stopBlock, /stopCurrentGeneration\(\{ reloadAfterStop: true \}\)/);
  assert.match(newChatBlock, /onNewChat\(\);[\s\S]{0,240}void stopCurrentGeneration\(\{ reloadAfterStop: false \}\)/);
  assert.doesNotMatch(newChatBlock, /handleStop\(\)\.finally/);
});

test('AI background generation is owned by a runtime manager instead of chat screen unmount', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const managerPath = path.join(root, 'src/ai/aiGenerationManager.ts');

  assert.ok(fs.existsSync(managerPath));
  const manager = read('src/ai/aiGenerationManager.ts');
  const unmountCleanup = /useEffect\(\(\) => \{\s*return \(\) => \{[\s\S]*?\n\s*\};\s*\}, \[\]\);/.exec(chat)?.[0] ?? '';

  assert.match(manager, /const tasksByThreadId = new Map/);
  assert.match(manager, /const tasksByAssistantId = new Map/);
  assert.match(manager, /function taskKey\(space: PixorySpace, threadId: string\)/);
  assert.match(manager, /tasksByThreadId\.get\(taskKey\(space, threadId\)\)/);
  assert.match(manager, /subscribeToThread/);
  assert.match(manager, /getActiveTaskForThread/);
  assert.match(manager, /hasActiveTask/);
  assert.match(manager, /startSendUserMessage/);
  assert.match(manager, /startRegenerateAssistantMessage/);
  assert.match(manager, /startRewriteUserMessage/);
  assert.match(manager, /stopGeneration/);
  assert.match(manager, /sendUserMessage\(/);
  assert.match(manager, /regenerateAssistantMessage\(/);
  assert.match(manager, /rewriteUserMessage\(/);
  assert.match(manager, /stopStreamingMessage\(/);
  assert.match(manager, /stopGeneration\(\{ assistantMessageId, reason = 'user', space, threadId \}/);
  assert.match(manager, /if \(!stoppedAssistantId && task\) \{[\s\S]{0,160}await task\.promise\.catch/);
  assert.match(chat, /function isGenerationActionCurrent\(actionToken: number\)/);
  assert.match(chat, /if \(!isGenerationActionCurrent\(actionToken\)\) \{[\s\S]{0,120}return/);
  assert.match(chat, /aiGenerationManager\.stopGeneration\(\{ assistantMessageId: targetAssistantId, space, threadId: targetThreadId \}\)/);
  assert.match(chat, /aiGenerationManager/);
  assert.doesNotMatch(unmountCleanup, /abort\(/);
});

test('AI startup cleanup stops interrupted generating messages in SQLite', () => {
  const db = read('src/database/db.ts');

  assert.match(db, /cleanupInterruptedAiGenerations/);
  assert.match(db, /UPDATE ai_messages[\s\S]*status = 'stopped'[\s\S]*completedAt = \?[\s\S]*errorMessage = '生成被系统中断。'[\s\S]*WHERE status = 'generating'/);
  assert.match(db, /await cleanupInterruptedAiGenerations\(db\)/);
});

test('AI paged chat loads branch root messages before recursive visibility filtering', () => {
  const service = read('src/ai/aiChatService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(repository, /findMessagesByIds/);
  assert.match(service, /async function loadBranchRootMessages/);
  assert.match(service, /pendingRootIds/);
  assert.match(service, /message\.branchRootMessageId/);
  assert.match(service, /const messagesWithBranchRoots = await loadBranchRootMessages\(db, threadId, messages\)/);
  assert.match(service, /messagesWithBranchRoots\.map/);
});

test('AI edit and regenerate branch descendants instead of deleting or leaking later messages', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');
  const regenerateBlock = /export async function regenerateAssistantMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function retryAssistantMessage/.exec(service)?.[0] ?? '';
  const rewriteBlock = /export async function rewriteUserMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function stopStreamingMessage/.exec(service)?.[0] ?? '';

  assert.match(repository, /markVisibleMessagesAfterAsBranch/);
  assert.match(repository, /sameBranchClause/);
  assert.match(repository, /candidate\.branchRootMessageId = \?/);
  assert.doesNotMatch(repository, /markUnbranchedMessagesAfterAsBranch/);
  assert.match(rewriteBlock, /markVisibleMessagesAfterAsBranch\(db, thread\.id, input\.userMessageId, input\.userMessageId, previousUserVersion\.versionIndex, userMessage\)/);
  assert.match(regenerateBlock, /const previousAssistantVersion = await snapshotMessageVersion\(db, assistantMessage\)/);
  assert.match(regenerateBlock, /markVisibleMessagesAfterAsBranch\(db, thread\.id, input\.assistantMessageId, input\.assistantMessageId, previousAssistantVersion\.versionIndex, assistantMessage\)/);
  assert.doesNotMatch(regenerateBlock, /deleteMessagesByIds/);
  assert.doesNotMatch(regenerateBlock, /listMessageIdsAfter/);
});

test('AI chat shows memory capture notice with undo and board actions', () => {
  const notice = read('src/components/ai/AiMemoryCaptureNotice.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(notice, /\$\{headline\}：\$\{summaryText\}/);
  assert.match(notice, /\+\$\{count - 1\}/);
  assert.match(notice, /\$\{headline\} \$\{count\} 条内容/);
  assert.match(notice, /记忆已更新/);
  assert.match(notice, /已修正/);
  assert.match(notice, /撤销/);
  assert.match(notice, /管理/);
  assert.match(chat, /AiMemoryCaptureNotice/);
  assert.match(chat, /summary=\{inlineMemoryCaptures\[0\]\?\.content\}/);
  assert.match(chat, /summary=\{fallbackMemoryCaptures\[0\]\?\.content\}/);
  assert.match(chat, /onUndoMemoryCapture/);
  assert.match(chat, /onOpenMemoryBoard/);
});

test('AI memory board keeps the simplified two-lane surface while maintenance stays available elsewhere', () => {
  const board = read('src/screens/AiMemoryBoardScreen.tsx');
  const service = read('src/ai/aiMemoryService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(service, /listSummarySegments/);
  assert.match(service, /deleteSummarySegment/);
  assert.match(service, /rerunSummaryMaintenance/);
  assert.match(service, /loadMemoryMaintenanceStatus/);
  assert.match(repository, /deleteSummarySegment/);
  assert.match(board, /长期记住/);
  assert.match(board, /最近对话/);
  assert.match(board, /查看已移除内容/);
  assert.doesNotMatch(board, /会话摘要/);
  assert.doesNotMatch(board, /summarySegments/);
  assert.match(sessionConfig, /lastMaintenanceCompletedAt/);
  assert.match(sessionConfig, /uncompressedRoundCount/);
  assert.match(sessionConfig, /summarySegmentCount/);
  assert.match(sessionConfig, /profileUpdatedAt/);
  assert.match(sessionConfig, /远程失败，已使用本地轻量整理/);
});

test('AI memory repository uses atomic pending increments bounded board queries and stable touch timestamps', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const memoryService = read('src/ai/aiMemoryService.ts');

  assert.match(repository, /incrementThreadMemoryPendingTurn/);
  assert.match(repository, /pendingTurnCount = pendingTurnCount \+ 1/);
  assert.match(memoryService, /incrementThreadMemoryPendingTurn\(db, threadId\)/);
  assert.doesNotMatch(memoryService, /const current = await aiThreadRepository\.getThreadMemoryJob\(db, threadId\)[\s\S]*pendingTurnCount: current\.pendingTurnCount \+ 1/);
  assert.match(repository, /listMemoryBoardItems\(db:[\s\S]*limit\?: number[\s\S]*offset\?: number/);
  assert.match(repository, /LIMIT \?/);
  assert.match(repository, /OFFSET \?/);
  assert.match(repository, /const now = createTimestamp\(\);[\s\S]*lastUsedAt = \?, updatedAt = \?[\s\S]*now,\s*now/);
  assert.match(repository, /const existing = await aiThreadRepository\.findActiveMemoryByNormalizedContent/);
  assert.match(repository, /return existing/);
  assert.match(repository, /已存在相同的记忆/);
});

test('AI prompt build reuses deep memory settings instead of repeating settings reads', () => {
  const chat = read('src/ai/aiChatService.ts');
  const memoryService = read('src/ai/aiMemoryService.ts');

  assert.match(memoryService, /BuildMemoryPrefixOptions/);
  assert.match(memoryService, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(memoryService, /settings\?: AiThreadMemorySettingsRecord/);
  assert.match(chat, /const memorySettings = await aiThreadRepository\.getThreadMemorySettings\(db, thread\.id\)/);
  assert.match(chat, /buildCompanionMemoryPrefix\(db, thread, \{ branchScopes, settings: memorySettings/);
  assert.match(chat, /buildStableMemoryPrefix\(db, thread, \{ branchScopes, excludedClaimIds, settings: memorySettings/);
  assert.match(chat, /compileMemoryContextPlan\(db, \{/);
  assert.match(chat, /memorySettings\.deepMemoryEnabled \? userMessage : ''/);
});

test('AI long chat rendering memoizes message rows and precomputes avatar grouping', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(bubble, /import \{ memo, useEffect, useRef, useState \} from 'react'/);
  assert.match(bubble, /showAvatar\?: boolean/);
  assert.match(bubble, /function AiMessageBubbleComponent/);
  assert.match(bubble, /showAssistantAvatar = !isUser && showAvatar && assistantAvatar\?\.avatarEnabled/);
  assert.match(bubble, /areAiMessageBubblePropsEqual/);
  assert.match(bubble, /previous\.message === next\.message/);
  assert.match(bubble, /export const AiMessageBubble = memo\(AiMessageBubbleComponent, areAiMessageBubblePropsEqual\)/);
  assert.match(chat, /message\.versionIndex === message\.versionTotal \? message : \{ \.\.\.message, versionIndex: message\.versionTotal \}/);
  assert.match(chat, /type VisibleMessageItem/);
  assert.match(chat, /const messagesByDate = new Map<string, AiMessageWithCitations\[\]>\(\)/);
  assert.match(chat, /dayMessages\.forEach\(\(sourceMessage, index\) =>/);
  assert.match(chat, /const nextInvertedMessageItems = nextVisibleMessageItems\.slice\(\)\.reverse\(\)/);
  assert.match(chat, /const nextInvertedMessageIndexById = new Map<string, number>\(\)/);
  assert.match(chat, /const \{\s*invertedMessageIndexById,\s*invertedMessageItems,\s*messagesById,/);
  assert.match(chat, /showAvatar:\s*message\.role === 'assistant'/);
  assert.match(chat, /previousMessage\?\.role !== 'assistant'/);
  assert.match(chat, /messageUsesStandaloneAssistantDisplay\(message\)/);
  assert.match(chat, /messageKeyExtractor = useCallback/);
  assert.match(chat, /renderMessageItem = useCallback/);
  assert.match(chat, /data=\{invertedMessageItems\}/);
  assert.match(chat, /renderItem=\{renderMessageItem\}/);
  assert.match(chat, /invertedMessageIndexById\.get\(messageId\)/);
});

test('AI assistant waiting and streaming states use lightweight animated feedback', () => {
  const typing = read('src/components/ai/AiTypingIndicator.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(typing, /Animated/);
  assert.match(typing, /typingDot/);
  assert.match(bubble, /AiTypingIndicator/);
  assert.match(bubble, /waitingForFirstToken/);
  assert.match(bubble, /InlineStreamingCursor/);
  assert.doesNotMatch(bubble, /streamingCursorOpacity/);
});

test('AI chat surfaces a subtle notice when older context was trimmed', () => {
  const service = read('src/ai/aiChatService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(service, /contextTrimmedByBudget/);
  assert.match(service, /contextTrimmedByCount/);
  assert.doesNotMatch(chat, /contextTrimNotice/);
  assert.match(chat, /function findLatestAssistantMessage/);
  assert.match(chat, /const latestVisibleAssistant = findLatestAssistantMessage\(nextVisibleMessages\)/);
  assert.match(chat, /const activeContinuityMilestone = useMemo<ActiveContinuityMilestone \| null>/);
  assert.match(chat, /continuityMilestones/);
  assert.match(chat, /continuityInlineNotice/);
  assert.match(chat, /latestVisibleBranchRootMessageId/);
  assert.match(chat, /reloadContinuityMilestones/);
  assert.match(chat, /查看详情/);
  assert.doesNotMatch(chat, /较早的部分对话可能不会被本次回复参考/);
  assert.match(chat, /promptSnapshotJson/);
});

test('AI streaming first-token path keeps the live subscriber attached instead of falling back to the waiting placeholder after creation', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(chat, /setMessages\(\(current\) => \{/);
  assert.match(chat, /publishStreamingMessage\(streamingIdentity, \{ content: '', reasoningText: null, status: 'generating' \}\)/);
  assert.match(chat, /const activeStreamingIdentity = activeStreamingIdentityRef\.current/);
  assert.match(chat, /const streamingIdentity = activeStreamingIdentity\?\.messageId === message\.id \? activeStreamingIdentity : null/);
  assert.match(chat, /const streamingReadModeActive = hasPendingStreamingReadBuffer\(\) && message\.status === 'generating'/);
  assert.match(chat, /const streamingRendererActive = Boolean\(streamingIdentity\) && generating && message\.id === activeAssistantId && !streamingReadModeActive/);
  assert.match(chat, /streaming=\{streamingRendererActive\}/);
  assert.match(
    bubble,
    /const waitingForFirstToken =\s*generating && !message\.content\.trim\(\) && !thinkingActive/,
  );
  assert.match(bubble, /streaming && streamingIdentity \?/);
});

test('AI composer collapses back to its minimum height when sent text is cleared', () => {
  const composer = read('src/components/ai/AiChatComposer.tsx');

  assert.match(
    composer,
    /useEffect\(\(\) => \{[\s\S]{0,360}value\.length !== 0[\s\S]{0,360}updateInputHeight\(COMPOSER_INPUT_MIN_HEIGHT\)/,
  );
});

test('AI composer measures controlled long text independently from native input content-size events', () => {
  const composer = read('src/components/ai/AiChatComposer.tsx');

  assert.match(composer, /styles\.inputMeasurer/);
  assert.match(composer, /numberOfLines=\{MAX_COMPOSER_LINES\}/);
  assert.match(composer, /onLayout=\{handleMeasuredTextLayout\}/);
  assert.match(composer, /\{value \? `\$\{value\}\\u200B` : '\\u200B'\}/);
  assert.match(composer, /const handleMeasuredTextLayout = useCallback/);
  assert.match(composer, /updateInputHeight\(event\.nativeEvent\.layout\.height\)/);
  assert.doesNotMatch(composer, /onContentSizeChange=/);
});



test('AI user text supports selection while assistant markdown stays Android layout safe', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');
  const assistantRender = /const trailingTargetIndex[\s\S]*?return \([\s\S]*?\n  \);/m.exec(content)?.[0] ?? '';

  assert.match(bubble, /<Text selectable style=\{\[styles\.content, styles\.userText\]\}/);
  assert.match(content, /return <Text selectable style=\{\[styles\.body, styles\.userText\]\}>\{content\}<\/Text>/);
  assert.doesNotMatch(assistantRender, /<Text selectable/);
  assert.match(content, /type: 'hr'/);
  assert.match(content, /isHorizontalRule/);
  assert.match(content, /styles\.horizontalRule/);
  assert.match(content, /nestLevel/);
});

test('AI markdown code blocks avoid horizontal scroll and selectable text on Android', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');
  const codeBranch = /if \(block\.type === 'code'\) \{[\s\S]*?if \(block\.type === 'table'\)/.exec(content)?.[0] ?? '';

  assert.doesNotMatch(content, /ScrollView/);
  assert.doesNotMatch(content, /useWindowDimensions/);
  assert.doesNotMatch(content, /horizontalBlockWidth/);
  assert.match(codeBranch, /style=\{styles\.codeBlock\}/);
  assert.match(codeBranch, /accessibilityLabel="复制代码块"/);
  assert.doesNotMatch(codeBranch, /<Text selectable/);
});

test('AI markdown tables render in bounded views without horizontal scroll on Android', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.doesNotMatch(content, /<ScrollView/);
  assert.match(content, /style=\{styles\.tableBlock\}/);
  assert.match(bubble, /bubble:\s*\{[\s\S]*maxWidth:\s*'100%'/);
  assert.match(content, /wrap:\s*\{[\s\S]*maxWidth:\s*'100%'/);
});

test('AI thinking block expands and collapses with a lightweight animation', () => {
  const thinking = read('src/components/ai/AiThinkingBlock.tsx');

  assert.match(thinking, /Animated/);
  assert.match(thinking, /expandedProgress/);
  assert.match(thinking, /Animated\.timing/);
  assert.match(thinking, /useNativeDriver: true/);
  assert.doesNotMatch(thinking, /useNativeDriver: false/);
  assert.match(thinking, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 500\)/);
  assert.doesNotMatch(thinking, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 100\)/);
  assert.match(thinking, /thinkingAnimatedBody/);
});

test('AI thinking block keeps collapsed streaming reasoning hidden and avoids fixed-height clipping', () => {
  const thinking = read('src/components/ai/AiThinkingBlock.tsx');

  assert.match(thinking, /defaultExpanded\?: boolean/);
  assert.match(thinking, /useState\(defaultExpanded\)/);
  assert.match(thinking, /const hasReasoningText = Boolean\(reasoningText\?\.trim\(\)\)/);
  assert.match(thinking, /const waitingForReasoningText = thinking && expanded && !hasReasoningText/);
  assert.match(thinking, /const bodyVisible = expanded && \(hasReasoningText \|\| thinking\)/);
  assert.match(thinking, /正在等待思考内容/);
  assert.match(thinking, /disabled=\{!hasReasoningText && !thinking\}/);
  assert.doesNotMatch(thinking, /expanded \|\| thinking/);
  assert.doesNotMatch(thinking, /bodyVisible = \(expanded \|\| thinking\)/);
  assert.doesNotMatch(thinking, /outputRange:\s*\[0,\s*320\]/);
  assert.doesNotMatch(thinking, /maxHeight:\s*expandedProgress\.interpolate/);
});

test('AI thinking block stays slightly narrower than the message stack', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const thinkingWrap = /thinkingWrap:\s*\{[\s\S]*?\n  \}/.exec(bubble)?.[0] ?? '';

  assert.match(thinkingWrap, /maxWidth:\s*'98%'/);
  assert.doesNotMatch(thinkingWrap, /maxWidth:\s*'100%'/);
});

test('AI thinking expansion defaults follow the previous assistant thinking block state', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const thinking = read('src/components/ai/AiThinkingBlock.tsx');

  assert.match(chat, /thinkingExpandedByMessageIdRef/);
  assert.match(chat, /visibleMessagesRef/);
  assert.match(chat, /visibleMessagesRef\.current = visibleMessages/);
  assert.match(chat, /function getLatestAssistantThinkingExpanded\(\): boolean/);
  assert.match(chat, /visibleMessagesRef\.current\.length - 1/);
  assert.match(chat, /thinkingExpandedByMessageIdRef\.current\.set\(assistantMessageId, getLatestAssistantThinkingExpanded\(\)\)/);
  assert.match(chat, /thinkingDefaultExpanded=\{thinkingExpandedByMessageIdRef\.current\.get\(message\.id\) \?\? false\}/);
  assert.match(chat, /onThinkingExpandedChange=\{\(messageId, expanded\) => \{/);
  assert.match(chat, /thinkingExpandedByMessageIdRef\.current\.set\(messageId, expanded\)/);
  assert.match(bubble, /thinkingDefaultExpanded\?: boolean/);
  assert.match(bubble, /onThinkingExpandedChange\?: \(messageId: string, expanded: boolean\) => void/);
  assert.match(bubble, /defaultExpanded=\{thinkingDefaultExpanded\}/);
  assert.match(bubble, /onExpandedChange=\{\(expanded\) => onThinkingExpandedChange\?\.\(message\.id, expanded\)\}/);
  assert.match(thinking, /onExpandedChange\?: \(expanded: boolean\) => void/);
  assert.match(thinking, /onExpandedChange\?\.\(nextExpanded\)/);
});

test.skip('AI chat empty start uses a Claude-like greeting and faint starter suggestions', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /function getAiChatGreeting/);
  assert.match(chat, /今天想聊点什么？/);
  assert.match(chat, /现在想聊点什么？/);
  assert.match(chat, /今晚想聊点什么？/);
  assert.doesNotMatch(chat, /ListEmptyComponent=\{invertedMessageItems\.length === 0 \? /);
  assert.match(chat, /\{invertedMessageItems\.length === 0 && !errorMessage \? \(\s*<View style=\{styles\.starterOverlay\}>/);
  assert.match(chat, /starterOverlay:\s*\{[\s\S]{0,180}position:\s*'absolute'/);
  assert.doesNotMatch(chat, /scaleY:\s*-1/);
  assert.match(chat, /AiChatStarterHints/);
  assert.match(chat, /fontSize:\s*28/);
  assert.match(chat, /lineHeight:\s*36/);
  assert.match(chat, /fontWeight:\s*'400'/);
  assert.match(chat, /letterSpacing:\s*0/);
  assert.match(chat, /整理这段资料/);
  assert.match(chat, /帮我发散想法/);
  assert.match(chat, /总结当前设定/);
  assert.match(chat, /onPickSuggestion=\{setComposerText\}/);
  assert.match(chat, /placeholder=""/);
  assert.doesNotMatch(chat, /placeholder=\{getComposerPlaceholder\(\)\}/);
  assert.doesNotMatch(chat, /function getComposerPlaceholder/);
  assert.doesNotMatch(chat, /onPickSuggestion=\{handleSend\}/);
  assert.doesNotMatch(chat, /emptyStateCard/);
});

test('AI message content memoizes markdown and renders image markdown inline', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(content, /import \{ useEffect, useMemo, useRef, useState, type ReactNode \} from 'react'/);
  assert.match(content, /Image/);
  assert.match(content, /type: 'image'/);
  assert.match(content, /IMAGE_MARKDOWN_TOKEN_PATTERN/);
  assert.match(content, /appendParagraphBlocksWithImages/);
  assert.match(content, /while \(\(match = IMAGE_MARKDOWN_TOKEN_PATTERN\.exec\(text\)\) !== null\)/);
  assert.match(content, /appendParagraphBlocksWithImages\(blocks, paragraphLines\.join\('\\n'\)\)/);
  assert.doesNotMatch(content, /blocks\.push\(\{ type: 'paragraph', text: paragraphLines\.join\('\\n'\) \}\)/);
  assert.match(content, /isImageMarkdownLine/);
  assert.match(content, /AiMarkdownImage/);
  assert.match(content, /const shouldParseMarkdown = variant === 'assistant' && !streaming/);
  assert.match(content, /const parsedMarkdown = useMemo\(/);
  assert.match(content, /MARKDOWN_PARSE_CACHE_LIMIT/);
  assert.match(content, /const markdownParseCache = new Map<string, ParsedMarkdownContent>\(\)/);
  assert.match(content, /function getCachedMarkdownContent\(content: string\): ParsedMarkdownContent/);
  assert.match(content, /trimMapToLimit\(markdownParseCache, MARKDOWN_PARSE_CACHE_LIMIT\)/);
  assert.match(content, /shouldParseMarkdown \? getCachedMarkdownContent\(content\) : null/);
  assert.match(content, /const \{ blocks, footnotes, referenceLinks \} = parsedMarkdown \?\? getCachedMarkdownContent\(content\)/);
  assert.doesNotMatch(content, /shouldParseMarkdown \? parseMarkdownContent\(content\) : null/);
  assert.doesNotMatch(content, /parsedMarkdown \?\? parseMarkdownContent\(content\)/);
  assert.match(content, /onError=\{\(\) => setLoadFailed\(true\)\}/);
  assert.match(content, /图片无法预览/);
  assert.doesNotMatch(content, /!\[alt\]\(url\)/);
});

test('AI rich HTML blocks cache measured heights and avoid redundant updates', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(content, /MESSAGE_RENDER_CACHE_MAX_CONTENT_LENGTH/);
  assert.match(content, /RICH_HTML_HEIGHT_CACHE_LIMIT/);
  assert.match(content, /RICH_HTML_HEIGHT_UPDATE_EPSILON/);
  assert.match(content, /const richHtmlHeightCache = new Map<string, number>\(\)/);
  assert.match(content, /function shouldCacheMessageRenderContent\(content: string\): boolean/);
  assert.match(content, /function getMessageRenderCacheKey\(content: string\): string/);
  assert.match(content, /function getCachedRichHtmlHeight\(html: string\): number/);
  assert.match(content, /function setCachedRichHtmlHeight\(html: string, height: number\)/);
  assert.match(content, /const cacheKey = getMessageRenderCacheKey\(html\)/);
  assert.match(content, /if \(!shouldCacheMessageRenderContent\(html\)\) \{\s*return RICH_HTML_INITIAL_HEIGHT;\s*\}/);
  assert.match(content, /if \(!shouldCacheMessageRenderContent\(html\)\) \{\s*return;\s*\}/);
  assert.match(content, /trimMapToLimit\(richHtmlHeightCache, RICH_HTML_HEIGHT_CACHE_LIMIT\)/);
  assert.match(content, /useState\(\(\) => getCachedRichHtmlHeight\(html\)\)/);
  assert.match(content, /useEffect\(\(\) => \{\s*setHeight\(getCachedRichHtmlHeight\(html\)\);\s*\}, \[html\]\)/);
  assert.match(content, /setCachedRichHtmlHeight\(html, measuredHeight\)/);
  assert.match(content, /Math\.abs\(currentHeight - measuredHeight\) <= RICH_HTML_HEIGHT_UPDATE_EPSILON/);
  assert.match(content, /return currentHeight/);
  assert.match(content, /<AiRichHtmlBlock html=\{content\} key=\{getMessageRenderCacheKey\(content\)\}/);
  assert.match(content, /<AiRichHtmlBlock html=\{block\.text\} key=\{`\$\{key\}-\$\{getMessageRenderCacheKey\(block\.text\)\}`\}/);
});

test('AI message render caches skip oversized markdown and html content', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(content, /MESSAGE_RENDER_CACHE_MAX_CONTENT_LENGTH = 30000/);
  assert.match(content, /hash = Math\.imul\(hash \^ content\.charCodeAt\(index\), 16777619\)/);
  assert.match(content, /return `\$\{content\.length\}:\$\{\(hash >>> 0\)\.toString\(36\)\}`/);
  assert.match(content, /return content\.length <= MESSAGE_RENDER_CACHE_MAX_CONTENT_LENGTH/);
  assert.match(content, /if \(!shouldCacheMessageRenderContent\(content\)\) \{\s*return parseMarkdownContent\(content\);\s*\}/);
  assert.match(content, /if \(!shouldCacheMessageRenderContent\(html\)\) \{\s*return RICH_HTML_INITIAL_HEIGHT;\s*\}/);
  assert.match(content, /if \(!shouldCacheMessageRenderContent\(html\)\) \{\s*return;\s*\}/);
});

test('AI chat long histories chunk attached data lookups', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const versionsBody = /async listMessageVersionsForMessages[\s\S]*?\r?\n  \},\r?\n\r?\n  async replaceCitations/.exec(repository)?.[0] ?? '';
  const citationsBody = /async listCitationsForMessages[\s\S]*?\r?\n  \},\r?\n\r?\n  async getThreadMemorySettings/.exec(repository)?.[0] ?? '';

  assert.match(repository, /MESSAGE_LOOKUP_CHUNK_SIZE = 200|DELETE_MESSAGE_CHUNK_SIZE = 200/);
  assert.match(versionsBody, /for \(let index = 0; index < messageIds\.length; index \+= MESSAGE_LOOKUP_CHUNK_SIZE\)/);
  assert.match(versionsBody, /const chunk = messageIds\.slice\(index, index \+ MESSAGE_LOOKUP_CHUNK_SIZE\)/);
  assert.match(versionsBody, /makeInClause\(chunk\)/);
  assert.doesNotMatch(versionsBody, /makeInClause\(messageIds\)/);
  assert.match(citationsBody, /for \(let index = 0; index < messageIds\.length; index \+= MESSAGE_LOOKUP_CHUNK_SIZE\)/);
  assert.match(citationsBody, /const chunk = messageIds\.slice\(index, index \+ MESSAGE_LOOKUP_CHUNK_SIZE\)/);
  assert.match(citationsBody, /makeInClause\(chunk\)/);
  assert.doesNotMatch(citationsBody, /makeInClause\(messageIds\)/);
});

test('AI chat long histories keep FlatList resident rows bounded', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /initialNumToRender=\{10\}/);
  assert.match(chat, /const tailListMaxToRenderPerBatch = shouldExpandRenderWindow \? 16 : 8/);
  assert.match(chat, /const tailListWindowSize = shouldExpandRenderWindow \? 15 : 11/);
  assert.match(chat, /const tailListUpdateCellsBatchingPeriod = shouldExpandRenderWindow \? 16 : 50/);
  assert.match(chat, /const tailListRemoveClippedSubviews =\s*Platform\.OS === "android" \? !shouldRelaxClipping : undefined/);
  assert.match(chat, /maxToRenderPerBatch=\{tailListMaxToRenderPerBatch\}/);
  assert.match(chat, /windowSize=\{tailListWindowSize\}/);
  assert.match(chat, /updateCellsBatchingPeriod=\{tailListUpdateCellsBatchingPeriod\}/);
  assert.match(chat, /removeClippedSubviews=\{tailListRemoveClippedSubviews\}/);
});

test('AI chat polish avoids redundant scroll state updates and clears transient timers', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');
  const latestButton = read('src/components/ai/AiScrollToLatestButton.tsx');

  assert.match(chat, /showScrollToLatestRef/);
  assert.match(chat, /const nextShowScrollToLatest = contentOffset\.y > MESSAGE_SCROLL_BUTTON_THRESHOLD/);
  assert.doesNotMatch(chat, /hasUnseenStreamingUpdate \|\| contentOffset\.y > MESSAGE_SCROLL_BUTTON_THRESHOLD/);
  assert.match(chat, /if \(showScrollToLatestRef\.current === nextValue\)/);
  assert.match(chat, /showScrollToLatestRef\.current = nextValue/);
  assert.doesNotMatch(chat, /latestVisibleRef/);
  assert.match(chat, /findLatestAssistantMessage/);
  assert.doesNotMatch(chat, /\[\.\.\.messages\]\.reverse\(\)\.find/);
  assert.doesNotMatch(chat, /\[\.\.\.visibleMessages\]\.reverse\(\)\.find/);
  assert.match(chat, /composerPanelHeight/);
  assert.match(chat, /onLayout=\{\(event\) => setComposerPanelHeight\(event\.nativeEvent\.layout\.height\)\}/);
  assert.match(chat, /bottomOffset=\{composerShellHeight \+ spacing\[3\] \+ spacing\[1\.5\]\}/);
  assert.match(latestButton, /bottomOffset: number/);
  assert.match(latestButton, /bottom:\s*bottomOffset/);
  assert.doesNotMatch(latestButton, /bottom:\s*spacing\[12\] \+ spacing\[10\]/);
  assert.match(latestButton, /Animated/);
  assert.match(latestButton, /Animated\.timing/);
  assert.match(latestButton, /useNativeDriver:\s*true/);
  assert.match(latestButton, /BlurView/);
  assert.match(latestButton, /rgba\(248,\s*248,\s*250,\s*0\.8[0-9]\)/);
  assert.match(latestButton, /color=\{aiLightColors\.primaryActive\}/);

  assert.match(chat, /voiceResetTimeoutRef/);
  assert.match(chat, /clearVoiceResetTimeout/);
});

test('AI screens use shared time formatting helpers', () => {
  const formatter = read('src/utils/aiTimeFormatters.ts');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const board = read('src/screens/AiMemoryBoardScreen.tsx');

  assert.match(formatter, /formatAiMessageMinute/);
  assert.match(formatter, /formatAiFullMinute/);
  assert.match(formatter, /formatAiHistoryMinute/);
  assert.match(bubble, /formatAiMessageMinute/);
  assert.doesNotMatch(bubble, /function formatMessageMinute/);
  assert.doesNotMatch(board, /formatAiFullMinute/);
  assert.doesNotMatch(board, /function formatMinute/);
});

test('AI memory maintenance uses a unified per-thread queue', () => {
  const queue = read('src/ai/aiMemoryMaintenanceQueue.ts');
  const maintenance = read('src/ai/aiMemoryMaintenanceService.ts');
  const chat = read('src/ai/aiChatService.ts');

  assert.match(queue, /activeMaintenanceTasks/);
  assert.match(queue, /pendingReason/);
  assert.match(queue, /reasonPriority/);
  assert.match(queue, /manual/);
  assert.match(queue, /runUnifiedMemoryMaintenancePass/);
  assert.match(queue, /compressOldestThreadRounds/);
  assert.match(queue, /maybeInitializeUserProfile/);
  assert.match(queue, /maybeUpdateUserProfile/);
  assert.match(queue, /captureDeepMemoryForExchange/);
  assert.match(queue, /maybeMergeSummarySegments/);
  assert.match(queue, /allowRemoteModel/);
  assert.match(queue, /lastMaintenanceCompletedAt/);
  assert.match(queue, /lastMaintenanceUsedFallback/);
  assert.match(queue, /hasPendingExchange/);
  assert.match(queue, /remoteFailedUsedFallback/);
  assert.match(maintenance, /scheduleMemoryMaintenance/);
  assert.match(maintenance, /scheduleDeferredCompanionMemoryMaintenance/);
  assert.match(maintenance, /isThreadMemoryMaintenanceActive/);
  assert.doesNotMatch(chat, /scheduleDeepMemoryAfterReply/);
  assert.match(chat, /scheduleDeferredCompanionMemoryMaintenance/);
});

test('AI memory retrieval uses FTS candidates without full history scans', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');
  const memoryService = read('src/ai/aiMemoryService.ts');

  assert.match(schema, /DATABASE_VERSION = 5[1-9]/);
  assert.match(schema, /CREATE VIRTUAL TABLE IF NOT EXISTS ai_message_fts USING fts5/);
  assert.match(schema, /CREATE VIRTUAL TABLE IF NOT EXISTS ai_memory_fts USING fts5/);
  assert.match(db, /MIGRATION_STATEMENTS_V26/);
  assert.match(repository, /syncMessageFts/);
  assert.match(repository, /syncMemoryFts/);
  assert.match(repository, /searchCompletedMessageFts/);
  assert.match(repository, /searchActiveMemoryFts/);
  assert.match(repository, /buildSearchTerms/);
  assert.match(repository, /\\u4e00-\\u9fff/);
  assert.match(service, /searchCompletedMessageFts/);
  assert.match(memoryService, /retrieveDynamicMemoryContext/);
  assert.match(memoryService, /searchActiveMemoryFts/);
  assert.doesNotMatch(memoryService, /getThreadSummary/);
  assert.doesNotMatch(service, /listRecentCompletedNonSystemMessages\(db, thread\.id, DEEP_MEMORY_HISTORY_SCAN_LIMIT\)/);
});

test('AI memory capture notice expands to edit and mark inaccurate', () => {
  const notice = read('src/components/ai/AiMemoryCaptureNotice.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const service = read('src/ai/aiMemoryService.ts');

  assert.match(notice, /expanded/);
  assert.match(notice, /编辑记忆/);
  assert.match(notice, /不准确/);
  assert.match(notice, /onSave/);
  assert.match(notice, /onMarkInaccurate/);
  assert.match(chat, /onSaveMemoryCapture/);
  assert.match(chat, /onMarkMemoryCaptureInaccurate/);
  assert.match(service, /markMemoryInaccurate/);
});

test('AI chat feedback voice empty state error and long navigation polish are wired', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');
  const composer = read('src/components/ai/AiChatComposer.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(bubble, /AiInlineFeedback/);
  assert.match(bubble, /setCopyFeedbackVisible\(true\)/);
  assert.match(content, /Linking\.openURL/);
  assert.match(content, /isSafeLinkUrl/);
  assert.match(content, /代码已复制/);
  assert.match(composer, /AiVoiceInputStatus/);
  assert.match(composer, /voiceState/);
  assert.match(composer, /attachmentThumb/);
  assert.match(composer, /disabledSendButton/);
  assert.doesNotMatch(chat, /AiEmptyChatSuggestions/);
  assert.match(chat, /AiChatErrorBanner/);
  assert.match(chat, /AiScrollToLatestButton/);
  assert.match(chat, /dateSeparator/);
  assert.match(chat, /formatDateSeparator/);
  assert.match(chat, /最新/);
  assert.match(chat, /voiceState/);
});

test('AI composer uses compact icon-only attachment popover anchored above add button', () => {
  const composer = read('src/components/ai/AiChatComposer.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(composer, /attachmentPopoverVisible/);
  assert.match(composer, /styles\.attachmentPopover/);
  assert.match(composer, /accessibilityLabel="上传图片"/);
  assert.match(composer, /accessibilityLabel="上传文档"/);
  assert.doesNotMatch(composer, /accessibilityLabel="上传视频"/);
  assert.match(composer, /disabled=\{generating\}/);
  assert.match(composer, /if \(generating\) \{[\s\S]{0,120}setAttachmentPopoverVisible\(false\)/);
  assert.match(composer, /flexDirection: 'row'/);
  assert.doesNotMatch(composer, /添加附件[\s\S]{0,400}上传视频/);
  assert.doesNotMatch(chat, /attachmentSheetVisible/);
});

test('AI streaming timeout only stops when the provider stays silent for 60 seconds before the first event, then relaxes to idle timeout', () => {
  const service = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');

  assert.match(service, /const FIRST_PROVIDER_BYTE_TIMEOUT_MS = 60000/);
  assert.match(service, /const PROVIDER_IDLE_TIMEOUT_MS = 45000/);
  assert.match(service, /scheduleProviderTimeout\(FIRST_PROVIDER_BYTE_TIMEOUT_MS\)/);
  assert.match(service, /async \(event: AiStreamEvent\) => \{[\s\S]*scheduleProviderTimeout\(PROVIDER_IDLE_TIMEOUT_MS\)/);
  assert.match(service, /if \(event\.type === 'provider_usage'\) \{[\s\S]*return;/);
  assert.match(service, /if \(event\.type === 'answer_delta'\) \{[\s\S]*appendContinuationAnswerDelta\(answerText, event\.text, initialAnswerText\)/);
  assert.match(service, /if \(event\.type === 'reasoning_delta' && !input\.thread\.thinkingDisabled && !ignoreReasoningDeltas\) \{[\s\S]*pendingReasoningChunks\.push\(event\.text\)/);
  assert.match(manager, /reason: 'timeout'/);
});

test('AI streaming cursor is rendered inline with assistant text', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(bubble, /InlineStreamingCursor/);
  assert.match(bubble, /renderAssistantContentWithCursor/);
  assert.match(bubble, /trailingInline=\{<InlineStreamingCursor \/>/);
  assert.match(content, /appendTrailingInline/);
  assert.match(content, /\{appendTrailingInline \? trailingInline : null\}/);
  assert.match(content, /block\.type === 'code'[\s\S]*\{appendTrailingInline \? trailingInline : null\}/);
  assert.match(content, /block\.type === 'table'[\s\S]*rowIndex === block\.rows\.length - 1 && cellIndex === row\.length - 1 \? trailingInline : null/);
  assert.doesNotMatch(bubble, /streamingCursorBlock/);
  assert.doesNotMatch(bubble, /assistantContentWithCursor/);
  assert.doesNotMatch(bubble, /\\n\s*<InlineStreamingCursor/);
});

test('AI history archive restore swipe clips the action background to the row', () => {
  const history = read('src/screens/AiHistoryScreen.tsx');

  assert.match(history, /swipeActionClip/);
  assert.match(history, /swipeActionSurface/);
  assert.match(history, /<View key=\{thread\.id\}>\s*\{groupLabel !== previousGroupLabel[\s\S]*<View style=\{styles\.swipeWrap\}>/);
  assert.match(history, /if \(swipedThreadId && swipedThreadId !== thread\.id\) \{[\s\S]{0,120}animateSwipe\(swipedThreadId, 0\)/);
  assert.match(history, /if \(swipedThreadId\) \{[\s\S]{0,160}setSwipedThreadId\(null\)[\s\S]{0,80}return;/);
  assert.match(history, /interpolate\(\{[\s\S]*inputRange:\s*\[0,\s*ARCHIVE_ACTION_WIDTH\]/);
  assert.match(history, /outputRange:\s*\[ARCHIVE_ACTION_WIDTH,\s*0\]/);
  assert.match(history, /transform:\s*\[\{ translateX: actionTranslateX \}\]/);
  assert.match(history, /Animated\.spring/);
  assert.match(history, /useNativeDriver: true/);
  assert.match(history, /ARCHIVE_SWIPE_THRESHOLD/);
  assert.doesNotMatch(history, /width: actionWidth/);
  assert.doesNotMatch(history, /style=\{\(\{ pressed \}\) => \[styles\.archiveAction/);
});

test('AI edit and regenerate actions expose pending guards and call service paths', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const service = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');

  assert.match(chat, /const \[pendingMessageActionId, setPendingMessageActionId\]/);
  assert.match(chat, /setPendingMessageActionId\(userMessageId\)/);
  assert.match(chat, /setPendingMessageActionId\(targetMessageId\)/);
  assert.match(chat, /aiGenerationManager\.startRewriteUserMessage\(/);
  assert.match(chat, /aiGenerationManager\.startRegenerateAssistantMessage\(/);
  assert.match(manager, /rewriteUserMessage\(/);
  assert.match(manager, /regenerateAssistantMessage\(/);
  assert.match(chat, /finally \{[\s\S]{0,300}setPendingMessageActionId\(null\)/);
  assert.match(service, /export async function rewriteUserMessage/);
  assert.match(service, /export async function regenerateAssistantMessage/);
});

test('AI chat keeps no-jitter scroll policy during streaming keyboard and return flows', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const scrollHandler = /const handleMessageScroll = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/.exec(chat)?.[0] ?? '';
  const followLatestHandler = /const followLatestMessage = useCallback\([\s\S]*?\n  \},\n    \[[^\]]*\],\n  \);/.exec(chat)?.[0] ?? '';
  const returnToLatestHandler = /const handleReturnToLatestPress = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/.exec(chat)?.[0] ?? '';

  assert.match(chat, /userScrolledAwayFromBottomRef/);
  assert.match(chat, /followLatestMessage/);
  assert.match(chat, /scrollToOffset\(\{\s*animated,\s*offset:\s*0\s*\}\)/);
  assert.match(chat, /reloadMessages\(targetThreadId\)/);
  assert.match(chat, /pendingFinalReloadRef\.current = true/);
  assert.match(chat, /handleComposerFocus\(\)[\s\S]{0,220}hasPendingStreamingReadBuffer\(\)/);
  assert.doesNotMatch(scrollHandler, /flushBufferedStreamingState/);
  assert.match(chat, /scheduleStreamingTailReconcile\("composer-height"/);
  assert.match(chat, /scheduleStreamingTailReconcile\("scroll-settled"/);
  assert.match(chat, /nativeMessageScrollOffsetRef/);
  assert.doesNotMatch(
    followLatestHandler,
    /nativeMessageScrollOffsetRef\.current\s*=\s*0/,
  );
  assert.match(returnToLatestHandler, /followLatestMessage\(\)/);
  assert.doesNotMatch(returnToLatestHandler, /requestStreamingTailCommit\(\)/);
  assert.doesNotMatch(chat, /keyboardBottomInset/);
  assert.doesNotMatch(chat, /scrollToEnd/);
  assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*followLatestMessage/);
  assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*scrollToOffset/);
});

test('AI chat renders one standalone date item per day outside message rows', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const messageRenderBranch = /const \{ message \} = item;[\s\S]*?<AiMessageBubble/.exec(chat)?.[0] ?? '';

  assert.match(chat, /type:\s*["']dateSeparator["']/);
  assert.match(chat, /dateKey:\s*string/);
  assert.match(chat, /if \(item\.type === ["']dateSeparator["']\)/);
  assert.doesNotMatch(messageRenderBranch, /item\.showDateSeparator/);
  assert.doesNotMatch(messageRenderBranch, /formatDateSeparator\(message\.createdAt\)/);
});
