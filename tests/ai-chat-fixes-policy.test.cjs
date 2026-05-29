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
  assert.match(thinking, /toFixed\(1\)/);
  assert.match(thinking, /setInterval\(/);
  assert.match(bubble, /createdAt/);
  assert.match(bubble, /completedAt/);
  assert.doesNotMatch(bubble, /label=\{message\.modelSnapshotJson\.includes\('reasoning'\) \? '思路' : '摘要'\}/);
});

test('AI regenerated and rewritten replies reset the thinking timer for the new generation', () => {
  const service = read('src/ai/aiChatService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const resetBlock = /async function streamAssistantReply[\s\S]*?aiThreadRepository\.updateMessage\(db, input\.assistantMessageId, \{([\s\S]*?)\n    \}\);/.exec(service)?.[1] ?? '';

  assert.match(service, /const startedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(resetBlock, /status:\s*'generating'/);
  assert.match(resetBlock, /createdAt:\s*startedAt/);
  assert.match(resetBlock, /completedAt:\s*null/);
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

  assert.match(schema, /DATABASE_VERSION = 36/);
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
  assert.match(chat, /<View style=\{\[styles\.screenContent,\s*\{ paddingTop: statusBarHeight \+ layout\.pageTopOffset \}\]\}>/);
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
  assert.doesNotMatch(editorInput, /selectionColor=\{aiLightColors\.coral\}/);
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
  assert.match(chat, /const failedMessageId = invertedMessageItems\[info\.index\]\?\.message\.id/);
  assert.match(chat, /editingUserMessageIdRef\.current !== failedMessageId/);
  assert.match(chat, /inlineEditSafeVisibleMessageIdsRef\.current\.has\(failedMessageId\)/);
  assert.match(chat, /inlineEditVisibilityTimeoutsRef\.current\.push\(\s*setTimeout/);
  assert.match(chat, /invertedMessageItems\.findIndex\(\(item\) => item\.message\.id === messageId\)/);
  assert.match(chat, /messageListRef\.current\?\.scrollToIndex\(\{\s*animated:\s*true,\s*index,[\s\S]{0,80}viewPosition:\s*0\.42/);
  assert.match(chat, /viewabilityConfig=\{inlineEditViewabilityConfigRef\.current\}/);
  assert.match(chat, /onViewableItemsChanged=\{handleInlineEditViewableItemsChangedRef\.current\}/);
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

  assert.match(chat, /invertedMessageItems = useMemo/);
  assert.match(chat, /data=\{invertedMessageItems\}/);
  assert.match(chat, /\binverted\b/);
  assert.match(chat, /ListFooterComponent=/);
  assert.match(chat, /scrollToOffset\(\{\s*animated,\s*offset:\s*0\s*\}\)/);
  assert.match(chat, /const MESSAGE_STREAM_FOLLOW_THRESHOLD = 48/);
  assert.match(chat, /const MESSAGE_SCROLL_BUTTON_THRESHOLD = 4800/);
  assert.doesNotMatch(chat, /MESSAGE_STREAMING_BUTTON_THRESHOLD/);
  assert.match(chat, /const MESSAGE_SAFE_FLUSH_OFFSET = 1/);
  assert.match(chat, /const MESSAGE_LIST_ANCHOR_CONFIG = \{ minIndexForVisible: 0 \}/);
  assert.match(chat, /const ACTIVE_LATEST_JUMP_RETRY_DELAYS_MS = \[80, 260, 520\]/);
  assert.match(chat, /const nextBottomLocked = contentOffset\.y <= MESSAGE_STREAM_FOLLOW_THRESHOLD/);
  assert.match(chat, /const nextShowScrollToLatest = !hasUnseenStreamingUpdate && contentOffset\.y > MESSAGE_SCROLL_BUTTON_THRESHOLD/);
  assert.match(chat, /userScrolledAwayFromBottomRef\.current = !nextBottomLocked/);
  assert.match(chat, /maintainVisibleContentPosition=\{MESSAGE_LIST_ANCHOR_CONFIG\}/);
  assert.match(chat, /onMomentumScrollEnd=\{handleMessageScrollEnd\}/);
  assert.match(chat, /onScrollEndDrag=\{handleMessageScrollEnd\}/);
  assert.match(chat, /<AiScrollToLatestButton bottomOffset=\{composerPanelHeight \+ spacing\[4\]\} visible=\{showScrollToLatest && !inlineEditingActive\} onPress=\{handleReturnToLatestPress\}/);
  assert.doesNotMatch(chat, /const \[latestVisible, setLatestVisible\]/);
  assert.doesNotMatch(chat, /latestVisibleRef/);
  assert.doesNotMatch(chat, /<Animated\.View style=\{\[styles\.composerPanel, composerEntranceStyle\]\}>[\s\S]{0,220}<AiScrollToLatestButton/);
  assert.doesNotMatch(chat, /scrollToEnd/);
  assert.doesNotMatch(chat, /setTimeout\(scroll/);
  assert.doesNotMatch(chat, /onContentSizeChange=/);
  assert.doesNotMatch(chat, /onLayout=\{\(\) => \{/);
  assert.match(chat, /const handleComposerHeightChange = useCallback/);
  assert.match(chat, /handleComposerHeightChange[\s\S]*scrollToLatestMessage\(false\)/);
  assert.doesNotMatch(chat, /handleComposerHeightChange[\s\S]*followLatestMessage\(false\)/);
  assert.match(chat, /onComposerHeightChange=\{handleComposerHeightChange\}/);
  assert.match(composer, /onComposerHeightChange\?: \(\) => void/);
  assert.match(composer, /attachmentCountRef/);
  assert.match(composer, /onComposerHeightChange\?\.\(\)/);
  assert.match(composer, /if \(nextHeight !== inputHeight\)/);
});

test('AI chat buffers streaming patches while reading history and only flushes at safe points', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const scrollHandler = /const handleMessageScroll = useCallback\([\s\S]*?\n  \}, \[\]\);/.exec(chat)?.[0] ?? '';

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
  assert.match(chat, /function preserveReadModeFrozenMessages/);
  assert.match(chat, /const flushBufferedStreamingState = useCallback/);
  assert.match(chat, /const applyOrBufferStreamingMessagePatch = useCallback/);
  assert.match(chat, /const queueFollowLatestMessageAfterLayout = useCallback/);
  assert.match(chat, /requestAnimationFrame\(\(\) => \{[\s\S]{0,180}followLatestMessage\(animated\)/);
  assert.match(chat, /function clearLatestJumpTimeouts\(\)[\s\S]{0,180}latestJumpTimeoutsRef\.current\.forEach\(\(timeout\) => clearTimeout\(timeout\)\)/);
  assert.match(chat, /function scheduleIntentionalLatestJump\(animated = false\)[\s\S]{0,700}followLatestMessage\(animated\);[\s\S]{0,700}queueFollowLatestMessageAfterLayout\(animated\);[\s\S]{0,700}ACTIVE_LATEST_JUMP_RETRY_DELAYS_MS\.forEach\(\(delay\) => \{/);
  assert.match(chat, /setTimeout\(\(\) => \{[\s\S]{0,160}followLatestMessage\(animated\);[\s\S]{0,80}\}, delay\)/);
  assert.match(chat, /applyOrBufferStreamingMessagePatch\(patch\)/);
  assert.match(chat, /preserveReadModeFrozenMessages\(nextMessages\)/);
  assert.match(chat, /resetStreamingReadBufferState\(\)/);
  assert.match(chat, /function markIntentionalLatestJump\(\)[\s\S]{0,260}bottomLockedRef\.current = true[\s\S]{0,260}setScrollToLatestVisible\(false\)/);
  assert.match(chat, /flushBufferedStreamingState\(\{ followLatest: true \}\)/);
  assert.match(chat, /flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /bottomLockedRef\.current = bottomLockedRef\.current \|\| followLatest \|\| messageScrollOffsetRef\.current <= MESSAGE_SAFE_FLUSH_OFFSET/);
  assert.match(chat, /streamingReadBufferActiveRef\.current = true;\s*pendingFinalReloadRef\.current = true;\s*hasBufferedStreamingUpdateRef\.current = true/);
  assert.match(chat, /async function handleSend\(\)[\s\S]*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /async function handleSubmitInlineRewrite[\s\S]*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /async function handleConfirmedRegenerate[\s\S]*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /onCreated: \(\{ assistantMessageId \}\) => \{[\s\S]*scheduleIntentionalLatestJump\(false\)/);
  assert.match(chat, /async function handleSend\(\)[\s\S]*scheduleIntentionalLatestJump\(false\)/);
  assert.match(chat, /async function handleSubmitInlineRewrite[\s\S]*scheduleIntentionalLatestJump\(false\)/);
  assert.match(chat, /async function handleConfirmedRegenerate[\s\S]*scheduleIntentionalLatestJump\(false\)/);
  assert.match(chat, /async function handleSend\(\)[\s\S]*try \{\s*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /async function handleSubmitInlineRewrite[\s\S]*try \{\s*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /async function handleConfirmedRegenerate[\s\S]*try \{\s*markIntentionalLatestJump\(\);\s*await flushBufferedStreamingState\(\{ followLatest: false \}\)/);
  assert.match(chat, /const hasPendingBufferedFlush = hasBufferedStreamingUpdateRef\.current \|\| pendingFinalReloadRef\.current/);
  assert.match(chat, /if \(!hasPendingBufferedFlush\) \{\s*syncScrollToLatestVisibility\(offsetY\);\s*return;\s*\}/);
  assert.match(chat, /event\.nativeEvent\.contentOffset\.y <= MESSAGE_SAFE_FLUSH_OFFSET/);
  assert.doesNotMatch(scrollHandler, /flushBufferedStreamingState/);
  assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*flushBufferedStreamingState/);
  assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*scrollToOffset/);
});

test('AI chat route reloads do not fall back to stale active thread state', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.doesNotMatch(chat, /threadId \?\? activeThreadId/);
  assert.match(chat, /reloadMessages\(threadId \?\? null/);
  assert.match(chat, /reloadModelLabel\(threadId \?\? null/);
  assert.match(chat, /reloadAvatarConfig\(threadId \?\? null/);
  assert.match(chat, /reloadThreadTitle\(threadId \?\? null/);
  assert.match(chat, /reloadMemoryCaptures\(threadId \?\? null/);
  assert.match(chat, /latestRequestRef/);
  assert.match(chat, /screenMountedRef/);
  assert.match(chat, /async function ensureThread\(\): Promise<string \| null>/);
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

test('AI message action row puts version controls after edit regenerate and shows assistant reply time', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const actionRow = /<View style=\{\[styles\.actionRow[\s\S]*?\{messageTime \? <Text style=\{styles\.messageTime\}>\{messageTime\}<\/Text> : null\}[\s\S]*?<\/View>/m.exec(bubble)?.[0] ?? '';
  const copyIndex = actionRow.indexOf('accessibilityLabel="复制消息"');
  const editIndex = actionRow.indexOf('accessibilityLabel="重写消息"');
  const regenerateIndex = actionRow.indexOf('accessibilityLabel="重新生成回复"');
  const versionIndex = actionRow.indexOf('styles.versionControl');

  assert.ok(copyIndex >= 0);
  assert.ok(editIndex >= 0);
  assert.ok(regenerateIndex >= 0);
  assert.ok(versionIndex > editIndex);
  assert.ok(versionIndex > regenerateIndex);
  assert.match(bubble, /formatAiMessageMinute/);
  assert.match(bubble, /message\.completedAt \?\? message\.updatedAt/);
  assert.match(bubble, /styles\.messageTime/);
});

test('AI failed streaming state is not overwritten by a final generating patch', () => {
  const service = read('src/ai/aiChatService.ts');
  const streamBlock = /async function streamAssistantReply[\s\S]*?let finalCitations/.exec(service)?.[0] ?? '';
  const failedReturnIndex = streamBlock.indexOf('if (streamFailed)');
  const forcedPersistIndex = streamBlock.indexOf('await persistStreamingSnapshot(true)');
  const forcedEmitIndex = streamBlock.indexOf('emitStreamingPatch(true)');

  assert.ok(failedReturnIndex >= 0);
  assert.ok(forcedPersistIndex > failedReturnIndex);
  assert.ok(forcedEmitIndex > failedReturnIndex);
  assert.match(streamBlock, /if \(streamFailed\) \{\s*return;\s*\}/);
});

test('AI assistant replies use lightweight Claude-style markdown without changing bubble chrome', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');
  const citations = read('src/components/ai/AiCitationList.tsx');

  assert.match(bubble, /import \{ AiMessageContent \} from '\.\/AiMessageContent'/);
  assert.match(bubble, /isUser \? \([\s\S]*<Text selectable style=\{\[styles\.content, styles\.userText\]\}>\{content\}<\/Text>[\s\S]*\) : \([\s\S]*renderAssistantContentWithCursor\(content, streaming\)/);
  assert.match(bubble, /return <AiMessageContent content=\{content\} \/>/);
  assert.match(bubble, /trailingInline=\{<InlineStreamingCursor \/>/);
  assert.match(content, /trailingInline\?: ReactNode/);
  assert.match(content, /trailingTargetIndex/);
  assert.match(content, /block\.type === 'hr' \|\| block\.type === 'image' \? targetIndex : index/);
  assert.match(content, /parseMarkdownBlocks/);
  assert.match(content, /type: 'heading'/);
  assert.match(content, /type: 'list'/);
  assert.match(content, /type: 'quote'/);
  assert.match(content, /type: 'code'/);
  assert.match(content, /type: 'table'/);
  assert.match(content, /inlineCode/);
  assert.match(content, /boldText/);
  assert.match(content, /italicText/);
  assert.match(content, /strikeText/);
  assert.match(content, /linkText/);
  assert.match(content, /https\?:\\\/\\\/\[\^\\s\)\]\+/);
  assert.match(content, /☑/);
  assert.match(content, /☐/);
  assert.match(content, /Clipboard\.setStringAsync/);
  assert.match(content, /accessibilityLabel="复制代码块"/);
  assert.match(content, /aiLightColors\.dark/);
  assert.match(content, /aiLightColors\.onDark/);
  assert.match(content, /typography\.family\.mono/);
  assert.match(content, /aiLightDisplayFont/);
  assert.match(bubble, /bubble:\s*\{[\s\S]{0,80}padding:\s*spacing\[3\]/);
  assert.match(bubble, /assistantBubble:\s*\{[\s\S]*backgroundColor:\s*aiLightColors\.card/);
  assert.match(bubble, /messageActionButton:\s*\{[\s\S]*height:\s*28[\s\S]*width:\s*28/);
  assert.match(citations, /来源 · \{citations\.length\}/);
  assert.match(citations, /onPress=\{\(\) => onOpenCitation\(citation\)\}/);
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

test('video long-press fast-forward does not reveal playback controls', () => {
  const player = read('src/screens/VideoPlayerScreen.tsx');
  const startHold = /function startHoldFastForward\(\) \{([\s\S]*?)\n  \}/.exec(player)?.[1] ?? '';

  assert.match(startHold, /setHoldSpeedVisible\(true\)/);
  assert.doesNotMatch(startHold, /showControls\(\)/);
  assert.doesNotMatch(startHold, /resetHideTimer\(\)/);
});

test('AI deep memory is opt-in and stores local summaries memories and settings', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');
  const captureService = read('src/ai/aiMemoryCaptureService.ts');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_thread_memory_settings/);
  assert.match(schema, /deepMemoryEnabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_thread_summaries/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_memories/);
  assert.match(db, /MIGRATION_STATEMENTS_V22/);
  assert.match(repository, /getThreadMemorySettings/);
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
  assert.match(captureService, /modelUpdate \? modelUpdate\.memories : prepared\.localCandidates/);
  assert.match(captureService, /parseMemoryReconciliationOperations/);
  assert.match(service, /lastMaintenanceError/);
  assert.match(sessionConfig, /深度记忆/);
  assert.match(sessionConfig, /不会继续注入记忆背景/);
  assert.match(sessionConfig, /lastMaintenanceError/);
  assert.match(sessionConfig, /最近一次远程维护失败，已使用本地轻量整理/);
  assert.match(sessionConfig, /maintenanceWarning/);
  assert.match(sessionConfig, /accessibilityRole="switch"/);
  assert.match(sessionConfig, /deepMemoryEnabled/);
});

test('AI chat uses thirty short-term messages and avoids full reload for every streaming token', () => {
  const service = read('src/ai/aiChatService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const streamBlock = /async function streamAssistantReply[\s\S]*?\r?\n}\r?\n\r?\nexport async function sendUserMessage/.exec(service)?.[0] ?? '';
  const regenerateBlock = /export async function regenerateAssistantMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function retryAssistantMessage/.exec(service)?.[0] ?? '';
  const rewriteBlock = /export async function rewriteUserMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function stopStreamingMessage/.exec(service)?.[0] ?? '';

  assert.match(service, /CHAT_HISTORY_MESSAGE_LIMIT = 30/);
  assert.match(service, /searchCompletedMessageFts/);
  assert.match(service, /\.slice\(-CHAT_HISTORY_MESSAGE_LIMIT\)/);
  assert.doesNotMatch(service, /\.slice\(-8\)/);
  assert.match(repository, /listRecentCompletedMessagesBefore/);
  assert.match(repository, /countCompletedNonSystemMessagesAfter/);
  assert.match(repository, /listCompletedNonSystemMessagesAfter/);
  assert.match(repository, /listRecentCompletedNonSystemMessages/);
  assert.match(repository, /findPreviousMessageByRole/);
  assert.match(repository, /findNextMessageByRole/);
  assert.match(repository, /listMessageIdsAfter/);
  assert.match(streamBlock, /listRecentCompletedMessagesBefore/);
  assert.doesNotMatch(streamBlock, /listMessages\(db, input\.thread\.id\)/);
  assert.doesNotMatch(regenerateBlock, /listMessages\(db, thread\.id\)/);
  assert.doesNotMatch(rewriteBlock, /listMessages\(db, thread\.id\)/);
  assert.match(service, /onMessagePatch/);
  assert.match(service, /STREAMING_PERSIST_INTERVAL_MS/);
  assert.match(service, /STREAMING_UI_PATCH_INTERVAL_MS/);
  assert.match(chat, /applyStreamingMessagePatch/);
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

  assert.match(summary, /UNCOMPRESSED_ROUND_THRESHOLD = 50/);
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
  assert.match(chat, /scheduleMemoryMaintenance/);
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

test('AI deep memory updates are triggered or lazy instead of every reply', () => {
  const chatService = read('src/ai/aiChatService.ts');
  const captureService = read('src/ai/aiMemoryCaptureService.ts');

  assert.match(captureService, /shouldRunImmediateMemoryCapture/);
  assert.match(captureService, /pendingTurnCount/);
  assert.match(captureService, /callMemoryMaintenanceModel/);
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

  assert.match(schema, /DATABASE_VERSION = 36/);
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
  assert.match(chat, /visibleMessages = useMemo\([\s\S]*\.filter\(messageMatchesSelectedBranch\)/);
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

  assert.match(schema, /DATABASE_VERSION = 36/);
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
  assert.match(service, /buildPromptForThread\(input\.thread, input\.userMessage\.content, branchScopes\)/);
  assert.match(service, /buildCompanionMemoryPrefix\(db, thread, \{ branchScopes, settings: memorySettings \}\)/);
  assert.match(service, /buildStableMemoryPrefix\(db, thread, \{ branchScopes, settings: memorySettings \}\)/);
  assert.match(service, /searchCompletedMessageFts\(db, \{[\s\S]*branchScopes/);
  assert.match(service, /searchActiveMemoryFts\(db, \{[\s\S]*branchScopes/);
  assert.match(service, /listRecentCompletedNonSystemMessages\(db, thread\.id, CHAT_HISTORY_MESSAGE_LIMIT, branchScopes\)/);
  assert.match(service, /scheduleMemoryMaintenance\(\{[\s\S]*branchScopes/);
  assert.match(memoryService, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(memoryService, /listMemoryBoardItems\(db, \{[\s\S]*branchScopes: options\?\.branchScopes/);
  assert.match(memoryService, /listSummarySegments\(db, thread\.id, options\?\.branchScopes\)/);
  assert.match(memoryService, /searchActiveMemoryFts\(db, \{[\s\S]*branchScopes: options\?\.branchScopes/);
  assert.match(maintenance, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(maintenance, /const branchScopes = input\.branchScopes \?\? \[\]/);
  assert.match(maintenance, /compressOldestThreadRounds\(input\.space, input\.threadId, \{ allowRemoteModel, branchScopes \}\)/);
  assert.match(maintenance, /maybeMergeSummarySegments\(input\.space, input\.threadId, \{ allowRemoteModel, branchScopes \}\)/);
  assert.match(maintenance, /loadLastUserMessage\(input\.space, input\.threadId, branchScopes\)/);
  assert.match(capture, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(capture, /listMessages\(db, input\.thread\.id, 80, input\.branchScopes\)/);
  assert.match(capture, /searchActiveMemoryFts\(db, \{[\s\S]*branchScopes: input\.branchScopes/);
  assert.match(profile, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(profile, /listRecentCompletedNonSystemMessages\(db, threadId, 30, options\.branchScopes\)/);
  assert.match(summary, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(summary, /listSummarySegments\(db, threadId, options\.branchScopes\)/);
  assert.match(summary, /listCompletedNonSystemMessagesAfter\(db, threadId, job\.lastCompressedMessageId, UNCOMPRESSED_MESSAGE_SCAN_LIMIT, options\.branchScopes\)/);
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
  assert.match(manager, /stopGeneration\(\{ assistantMessageId, space, threadId \}/);
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

test('AI memory board exposes summary segments and maintenance status controls', () => {
  const board = read('src/screens/AiMemoryBoardScreen.tsx');
  const service = read('src/ai/aiMemoryService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(service, /listSummarySegments/);
  assert.match(service, /deleteSummarySegment/);
  assert.match(service, /rerunSummaryMaintenance/);
  assert.match(service, /loadMemoryMaintenanceStatus/);
  assert.match(repository, /deleteSummarySegment/);
  assert.match(board, /会话摘要/);
  assert.match(board, /summarySegments/);
  assert.match(board, /重新整理摘要/);
  assert.match(board, /删除摘要/);
  assert.match(board, /roundCount/);
  assert.match(board, /formatSummaryRange/);
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
  assert.match(chat, /buildStableMemoryPrefix\(db, thread, \{ branchScopes, settings: memorySettings/);
  assert.match(chat, /retrieveDynamicMemoryContext\(db, thread, userMessage, branchScopes\)/);
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
  assert.match(chat, /return message\.versionIndex === message\.versionTotal \? message/);
  assert.match(chat, /type VisibleMessageItem/);
  assert.match(chat, /visibleMessageItems = useMemo/);
  assert.match(chat, /invertedMessageItems = useMemo/);
  assert.match(chat, /showAvatar: message\.role === 'assistant'/);
  assert.match(chat, /previousMessage\?\.role !== 'assistant'/);
  assert.match(chat, /messageKeyExtractor = useCallback/);
  assert.match(chat, /renderMessageItem = useCallback/);
  assert.match(chat, /data=\{invertedMessageItems\}/);
  assert.match(chat, /renderItem=\{renderMessageItem\}/);
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
  assert.match(chat, /contextTrimNotice/);
  assert.match(chat, /function findLatestAssistantMessage/);
  assert.match(chat, /const latestAssistant = findLatestAssistantMessage\(visibleMessages\)/);
  assert.match(chat, /较早的部分对话可能不会被本次回复参考/);
  assert.match(chat, /promptSnapshotJson/);
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

test('AI chat empty start uses a Claude-like greeting and faint starter suggestions', () => {
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
  assert.match(content, /const parsedMarkdown = useMemo\(\(\) => parseMarkdownContent\(content\), \[content\]\)/);
  assert.match(content, /const \{ blocks, footnotes, referenceLinks \} = parsedMarkdown/);
  assert.match(content, /onError=\{\(\) => setLoadFailed\(true\)\}/);
  assert.match(content, /图片无法预览/);
  assert.doesNotMatch(content, /!\[alt\]\(url\)/);
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
  assert.match(chat, /maxToRenderPerBatch=\{8\}/);
  assert.match(chat, /windowSize=\{11\}/);
  assert.match(chat, /removeClippedSubviews=\{Platform\.OS === 'android'\}/);
});

test('AI chat polish avoids redundant scroll state updates and clears transient timers', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');
  const latestButton = read('src/components/ai/AiScrollToLatestButton.tsx');

  assert.match(chat, /showScrollToLatestRef/);
  assert.match(chat, /const nextShowScrollToLatest = !hasUnseenStreamingUpdate && contentOffset\.y > MESSAGE_SCROLL_BUTTON_THRESHOLD/);
  assert.match(chat, /if \(showScrollToLatestRef\.current === nextValue\)/);
  assert.match(chat, /showScrollToLatestRef\.current = nextValue/);
  assert.doesNotMatch(chat, /latestVisibleRef/);
  assert.match(chat, /findLatestAssistantMessage/);
  assert.doesNotMatch(chat, /\[\.\.\.messages\]\.reverse\(\)\.find/);
  assert.doesNotMatch(chat, /\[\.\.\.visibleMessages\]\.reverse\(\)\.find/);
  assert.match(chat, /composerPanelHeight/);
  assert.match(chat, /onLayout=\{\(event\) => setComposerPanelHeight\(event\.nativeEvent\.layout\.height\)\}/);
  assert.match(chat, /bottomOffset=\{composerPanelHeight \+ spacing\[4\]\}/);
  assert.match(latestButton, /bottomOffset: number/);
  assert.match(latestButton, /bottom:\s*bottomOffset/);
  assert.doesNotMatch(latestButton, /bottom:\s*spacing\[12\] \+ spacing\[10\]/);

  assert.match(content, /feedbackTimeoutRef/);
  assert.match(content, /clearFeedbackTimer/);
  assert.match(content, /return clearFeedbackTimer/);
  assert.match(bubble, /copyFeedbackTimeoutRef/);
  assert.match(bubble, /clearCopyFeedbackTimer/);
  assert.match(bubble, /return clearCopyFeedbackTimer/);
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
  assert.match(board, /formatAiFullMinute/);
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
  assert.match(maintenance, /isThreadMemoryMaintenanceActive/);
  assert.doesNotMatch(chat, /scheduleDeepMemoryAfterReply/);
  assert.match(chat, /scheduleMemoryMaintenance/);
});

test('AI memory retrieval uses FTS candidates without full history scans', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');
  const memoryService = read('src/ai/aiMemoryService.ts');

  assert.match(schema, /DATABASE_VERSION = 36/);
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
  assert.match(composer, /accessibilityLabel="上传视频"/);
  assert.match(composer, /accessibilityLabel="上传文档"/);
  assert.match(composer, /disabled=\{generating\}/);
  assert.match(composer, /if \(generating\) \{[\s\S]{0,120}setAttachmentPopoverVisible\(false\)/);
  assert.match(composer, /flexDirection: 'row'/);
  assert.doesNotMatch(composer, /添加附件[\s\S]{0,400}上传图片[\s\S]{0,400}上传视频[\s\S]{0,400}上传文档/);
  assert.doesNotMatch(chat, /attachmentSheetVisible/);
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
  const scrollHandler = /const handleMessageScroll = useCallback\([\s\S]*?\n  \}, \[\]\);/.exec(chat)?.[0] ?? '';

  assert.match(chat, /userScrolledAwayFromBottomRef/);
  assert.match(chat, /followLatestMessage/);
  assert.match(chat, /scrollToOffset\(\{\s*animated,\s*offset:\s*0\s*\}\)/);
  assert.match(chat, /reloadMessages\(targetThreadId\)/);
  assert.match(chat, /pendingFinalReloadRef\.current = true/);
  assert.match(chat, /handleComposerFocus\(\)[\s\S]{0,220}hasPendingStreamingReadBuffer\(\)/);
  assert.doesNotMatch(scrollHandler, /flushBufferedStreamingState/);
  assert.doesNotMatch(chat, /keyboardBottomInset/);
  assert.doesNotMatch(chat, /scrollToEnd/);
  assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*followLatestMessage/);
  assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*scrollToOffset/);
});
