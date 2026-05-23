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

  assert.match(schema, /DATABASE_VERSION = 21/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_message_versions/);
  assert.match(schema, /originalMessageId TEXT NOT NULL/);
  assert.match(schema, /versionIndex INTEGER NOT NULL/);
  assert.match(schema, /UNIQUE\(originalMessageId, versionIndex\)/);
  assert.match(db, /MIGRATION_STATEMENTS_V20/);
  assert.match(db, /currentVersion < 20/);
  assert.match(db, /MIGRATION_STATEMENTS_V21/);
  assert.match(db, /currentVersion < 21/);
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
