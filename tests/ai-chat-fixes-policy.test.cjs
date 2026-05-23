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

  assert.match(schema, /DATABASE_VERSION = 23/);
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
  const actionRow = /<View style=\{\[styles\.actionRow[\s\S]*?<\/View>\n      <\/View>/m.exec(bubble)?.[0] ?? '';
  const copyIndex = actionRow.indexOf('accessibilityLabel="复制消息"');
  const editIndex = actionRow.indexOf('accessibilityLabel="重写消息"');
  const regenerateIndex = actionRow.indexOf('accessibilityLabel="重新生成回复"');
  const versionIndex = actionRow.indexOf('styles.versionControl');

  assert.ok(copyIndex >= 0);
  assert.ok(editIndex >= 0);
  assert.ok(regenerateIndex >= 0);
  assert.ok(versionIndex > editIndex);
  assert.ok(versionIndex > regenerateIndex);
  assert.match(bubble, /formatMessageMinute/);
  assert.match(bubble, /message\.completedAt \?\? message\.updatedAt/);
  assert.match(bubble, /styles\.messageTime/);
});

test('AI assistant replies use lightweight Claude-style markdown without changing bubble chrome', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');
  const citations = read('src/components/ai/AiCitationList.tsx');

  assert.match(bubble, /import \{ AiMessageContent \} from '\.\/AiMessageContent'/);
  assert.match(bubble, /isUser \? \([\s\S]*<Text style=\{\[styles\.content, styles\.userText\]\}>\{content\}<\/Text>[\s\S]*\) : \([\s\S]*<AiMessageContent content=\{content\} \/>/);
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
  assert.match(service, /updateDeepMemoryAfterReply/);
  assert.match(service, /summarizeMemoryWithModel/);
  assert.match(service, /buildMemoryModelPrompt/);
  assert.match(service, /parseModelMemoryUpdate/);
  assert.match(service, /只输出 JSON/);
  assert.match(service, /modelUpdate\?\.memories\.length \? modelUpdate\.memories : extractMemoryCandidates/);
  assert.match(sessionConfig, /深度记忆/);
  assert.match(sessionConfig, /不会继续注入记忆背景/);
  assert.match(sessionConfig, /accessibilityRole="switch"/);
  assert.match(sessionConfig, /deepMemoryEnabled/);
});

test('AI chat uses twenty short-term messages and avoids full reload for every streaming token', () => {
  const service = read('src/ai/aiChatService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(service, /CHAT_HISTORY_MESSAGE_LIMIT = 20/);
  assert.match(service, /\.slice\(-CHAT_HISTORY_MESSAGE_LIMIT\)/);
  assert.doesNotMatch(service, /\.slice\(-8\)/);
  assert.match(service, /onMessagePatch/);
  assert.match(service, /STREAMING_PERSIST_INTERVAL_MS/);
  assert.match(service, /STREAMING_UI_PATCH_INTERVAL_MS/);
  assert.match(chat, /applyStreamingMessagePatch/);
  assert.match(chat, /<FlatList/);
  assert.match(chat, /CHAT_MESSAGE_PAGE_SIZE = 60/);
  assert.match(chat, /加载更早消息/);
  assert.match(repository, /listMessageVersionsForMessages/);
  assert.match(repository, /listCitationsForMessages/);
});
