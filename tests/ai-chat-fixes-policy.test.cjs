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
  assert.match(service, /snapshotMessageVersion\(db, nextAssistant\)/);
  assert.match(repository, /createdAt\?: string/);
  assert.match(repository, /createdAt:\s*patch\.createdAt/);
});

test('AI chat persists and exposes message versions for edits and regenerations', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(schema, /DATABASE_VERSION = 29/);
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

test('AI chat voice input stays on the mic button and uses Android speech recognition', () => {
  const composer = read('src/components/ai/AiChatComposer.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const nativeTs = read('src/native/pixoryMediaModule.ts');
  const nativeKt = read('android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');
  const appJson = read('app.json');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const pluginManifest = read('plugins/pixory-android-intents/templates/app/src/main/AndroidManifest.xml');

  assert.match(composer, /accessibilityLabel="语音输入"/);
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

test('AI inline message editing does not lift the edit bubble when the Android keyboard opens', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /editingUserMessageIdRef/);
  assert.match(chat, /Keyboard\.addListener\('keyboardDidShow'[\s\S]*editingUserMessageIdRef\.current[\s\S]*setKeyboardBottomInset\(0\)[\s\S]*return;/);
  assert.match(chat, /function handleEditUserMessage[\s\S]*editingUserMessageIdRef\.current = messageId[\s\S]*setKeyboardBottomInset\(0\)/);
  assert.match(chat, /function cancelInlineEdit\(\)[\s\S]*editingUserMessageIdRef\.current = null[\s\S]*setEditingUserMessageId\(null\)/);
  assert.match(chat, /keyboardBottomInset && !editingUserMessageId/);
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

test('AI chat keeps the latest message visible after initial load keyboard show and composer growth', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const composer = read('src/components/ai/AiChatComposer.tsx');

  assert.match(chat, /forceScrollAfterMessagesRef/);
  assert.match(chat, /setTimeout\(scroll,\s*80\)/);
  assert.match(chat, /setTimeout\(scroll,\s*180\)/);
  assert.match(chat, /forceScrollAfterMessagesRef\.current = true/);
  assert.match(chat, /forceScrollAfterMessagesRef\.current = false/);
  assert.match(chat, /scrollToLatestMessage\(messages\.length > 1,\s*force\)/);
  assert.match(chat, /Keyboard\.addListener\('keyboardDidShow'[\s\S]*followLatestMessage\(\)/);
  assert.match(chat, /const handleComposerHeightChange = useCallback/);
  assert.match(chat, /onComposerHeightChange=\{handleComposerHeightChange\}/);
  assert.match(composer, /onComposerHeightChange\?: \(\) => void/);
  assert.match(composer, /attachmentCountRef/);
  assert.match(composer, /onComposerHeightChange\?\.\(\)/);
  assert.match(composer, /if \(nextHeight !== inputHeight\)/);
});

test('AI regenerate switches back to the newest generated message version', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const regenerateBlock = /async function handleRegenerate[\s\S]*?try \{/.exec(chat)?.[0] ?? '';

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
  assert.match(bubble, /isUser \? \([\s\S]*<Text selectable style=\{\[styles\.content, styles\.userText\]\}>\{content\}<\/Text>[\s\S]*\) : \([\s\S]*<AiMessageContent content=\{content\} \/>/);
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
  assert.match(content, /https\?:\\\/\\\/\[\^\)\\s\]\+/);
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

test('AI session settings keep role instructions visible above the Android keyboard', () => {
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const scaffold = read('src/components/ai/AiLightScaffold.tsx');

  assert.match(sessionConfig, /keyboardBottomInset/);
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
  assert.match(service, /loadDeepMemoryContext/);
  assert.match(captureService, /captureDeepMemoryForExchange/);
  assert.match(captureService, /callMemoryMaintenanceModel/);
  assert.match(captureService, /buildMemoryModelPrompt/);
  assert.match(captureService, /parseModelMemoryUpdate/);
  assert.match(captureService, /只输出 JSON/);
  assert.match(captureService, /modelUpdate\?\.memories\.length \? modelUpdate\.memories : prepared\.localCandidates/);
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
  assert.match(chat, /maintainVisibleContentPosition=\{\{ minIndexForVisible: 0 \}\}/);
  assert.match(chat, /isLoadingEarlierRef/);
  assert.match(chat, /onContentSizeChange=\{\(\) => \{[\s\S]*!isLoadingEarlierRef\.current[\s\S]*scrollToLatestMessage/);
  assert.match(chat, /onLayout=\{\(\) => \{[\s\S]*!isLoadingEarlierRef\.current[\s\S]*scrollToLatestMessage\(false, true\)/);
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
  assert.match(service, /importance DESC/);
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

test('AI early rewrite and regenerate warn before removing later messages and delete in chunks', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(chat, /Alert\.alert\(/);
  assert.match(chat, /移除后续对话/);
  assert.match(chat, /hasLaterMessages/);
  assert.match(chat, /handleSubmitInlineRewrite[\s\S]*confirmRemovingLaterMessages/);
  assert.match(chat, /handleRegenerate[\s\S]*confirmRemovingLaterMessages/);
  assert.match(repository, /DELETE_MESSAGE_CHUNK_SIZE = 200/);
  assert.match(repository, /DELETE FROM ai_messages WHERE id IN/);
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
  assert.match(memoryService, /settings\?: AiThreadMemorySettingsRecord/);
  assert.match(chat, /const memorySettings = await aiThreadRepository\.getThreadMemorySettings\(db, thread\.id\)/);
  assert.match(chat, /buildCompanionMemoryPrefix\(db, thread, \{ settings: memorySettings/);
  assert.match(chat, /buildStableMemoryPrefix\(db, thread, \{ settings: memorySettings/);
  assert.match(chat, /retrieveDynamicMemoryContext\(db, thread, userMessage, \{ settings: memorySettings/);
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
  assert.match(chat, /showAvatar: message\.role === 'assistant'/);
  assert.match(chat, /previousMessage\?\.role !== 'assistant'/);
  assert.match(chat, /messageKeyExtractor = useCallback/);
  assert.match(chat, /renderMessageItem = useCallback/);
  assert.match(chat, /data=\{visibleMessageItems\}/);
  assert.match(chat, /renderItem=\{renderMessageItem\}/);
});

test('AI assistant waiting and streaming states use lightweight animated feedback', () => {
  const typing = read('src/components/ai/AiTypingIndicator.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(typing, /Animated/);
  assert.match(typing, /typingDot/);
  assert.match(bubble, /AiTypingIndicator/);
  assert.match(bubble, /waitingForFirstToken/);
  assert.match(bubble, /Animated\.loop/);
  assert.match(bubble, /streamingCursorOpacity/);
});

test('AI chat surfaces a subtle notice when older context was trimmed', () => {
  const service = read('src/ai/aiChatService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(service, /contextTrimmedByBudget/);
  assert.match(service, /contextTrimmedByCount/);
  assert.match(chat, /contextTrimNotice/);
  assert.match(chat, /const latestAssistant = \[\.\.\.visibleMessages\]\.reverse\(\)\.find/);
  assert.match(chat, /较早的部分对话可能不会被本次回复参考/);
  assert.match(chat, /promptSnapshotJson/);
});

test('AI message text supports selection and lightweight markdown separators', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(bubble, /<Text selectable style=\{\[styles\.content, styles\.userText\]\}/);
  assert.match(content, /selectable/);
  assert.match(content, /type: 'hr'/);
  assert.match(content, /isHorizontalRule/);
  assert.match(content, /styles\.horizontalRule/);
  assert.match(content, /nestLevel/);
});

test('AI thinking block expands and collapses with a lightweight animation', () => {
  const thinking = read('src/components/ai/AiThinkingBlock.tsx');

  assert.match(thinking, /Animated/);
  assert.match(thinking, /expandedProgress/);
  assert.match(thinking, /Animated\.timing/);
  assert.match(thinking, /useNativeDriver: false/);
  assert.match(thinking, /thinkingAnimatedBody/);
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

  assert.match(schema, /DATABASE_VERSION = 29/);
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
  assert.match(content, /isSafeHttpUrl/);
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
