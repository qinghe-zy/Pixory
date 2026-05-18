const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI final failure paths keep local records recoverable', () => {
  const chat = read('src/ai/aiChatService.ts');
  assert.match(chat, /createMessage\(db,\s*{\s*id: userMessageId/s);
  assert.match(chat, /createMessage\(db,\s*{\s*id: assistantMessageId/s);
  assert.match(chat, /请先在 AI 设置中填写 API key/);
  assert.match(chat, /retryAssistantMessage/);
  assert.match(chat, /stopStreamingMessage/);
  assert.match(chat, /fallbackAiThreadTitle/);
});

test('new AI chats snapshot the last selected chat provider and model', () => {
  const chat = read('src/ai/aiChatService.ts');
  const providerService = read('src/ai/aiProviderService.ts');
  const settingsRepository = read('src/database/repositories/settingsRepository.ts');
  assert.match(chat, /resolveDefaultThreadProvider/);
  assert.match(chat, /settingsRepository\.getDefaultAiProviderId/);
  assert.match(providerService, /setDefaultAiProviderId/);
  assert.match(settingsRepository, /AI_DEFAULT_CHAT_PROVIDER_ID_KEY/);
  assert.match(chat, /provider\.defaultChatModelId/);
  assert.match(chat, /item\.supportsChat/);
  assert.match(chat, /providerId: provider\?\.id \?\? null/);
  assert.match(chat, /modelId: model\?\.modelId \?\? null/);
});

test('AI documents are copied locally and parse failures remain recoverable', () => {
  const documentService = read('src/ai/aiDocumentService.ts');
  const materialList = read('src/screens/AiMaterialListScreen.tsx');
  assert.match(documentService, /copyLocalFile\(input\.sourceUri, localUri\)/);
  assert.match(documentService, /parserStatus: 'pending'/);
  assert.match(documentService, /updateDocumentStatus\(db, input\.documentId, 'failed'/);
  assert.match(materialList, /重试解析/);
  assert.match(materialList, /removeMaterial/);
});

test('AI retrieval and history stay bounded and space scoped', () => {
  const retrieval = read('src/ai/aiRetrievalService.ts');
  const threadRepository = read('src/database/repositories/aiThreadRepository.ts');
  assert.match(retrieval, /DEFAULT_RETRIEVAL_LIMIT = 6/);
  assert.match(retrieval, /LIMIT 80/);
  assert.match(retrieval, /directSnippets = \[\.\.\.ipContext, \.\.\.keyword\]/);
  assert.match(retrieval, /ownerPreviewSearch/);
  assert.match(retrieval, /LIMIT \?/);
  assert.match(threadRepository, /ai_threads\.space = \?/);
  assert.match(threadRepository, /archivedAt IS NOT NULL/);
});

test('AI provider setup supports SecureStore keys and manual model IDs', () => {
  const secureSettings = read('src/ai/secureAiSettingsService.ts');
  const providerService = read('src/ai/aiProviderService.ts');
  const providerSettings = read('src/screens/AiProviderSettingsScreen.tsx');
  assert.match(secureSettings, /expo-secure-store/);
  assert.match(providerService, /saveManualChatModel/);
  assert.match(providerService, /source: 'manual'/);
  assert.match(providerSettings, /自定义模型/);
});

test('AI session settings persist role cards system prompt and boundary mode to the thread', () => {
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const roleEditor = read('src/screens/AiRoleCardEditorScreen.tsx');
  const app = read('App.tsx');
  const chatScreen = read('src/screens/AiChatScreen.tsx');
  const chatService = read('src/ai/aiChatService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(sessionConfig, /loadThreadSessionConfig/);
  assert.match(sessionConfig, /updateAiThreadSessionConfig/);
  assert.match(sessionConfig, /applyRoleCardToThread/);
  assert.match(sessionConfig, /avatarEnabled/);
  assert.match(sessionConfig, /启用头像|隐藏头像/);
  assert.match(sessionConfig, /保存设置/);
  assert.match(roleEditor, /onApplyRoleCard/);
  assert.match(roleEditor, /ImagePicker\.launchImageLibraryAsync/);
  assert.match(roleEditor, /copyAiRoleAvatarToAppStorage/);
  assert.match(roleEditor, /imageRepository\.findByIpId/);
  assert.match(roleEditor, /deleteRoleCards/);
  assert.match(roleEditor, /selectedCardIds/);
  assert.match(roleEditor, /selectionFooter/);
  assert.match(roleEditor, /onLongPress=\{\(\) => toggleSelected\(card\.id\)\}/);
  assert.match(app, /onThreadReady/);
  assert.match(chatScreen, /handleOpenSessionConfig/);
  assert.match(chatScreen, /loadThreadAvatarConfig/);
  assert.match(chatService, /updateAiThreadSessionConfig/);
  assert.match(chatService, /parseThreadAvatarConfig/);
  assert.match(chatService, /patchThreadRoleSnapshot/);
  assert.match(chatService, /systemPrompt: roleCard\?\.prompt \?\? DEFAULT_AI_ROLE_PROMPT/);
  assert.match(chatService, /roleSnapshotJson/);
  assert.match(repository, /roleCardId/);
});

test('AI chat can show role avatars while keeping no-avatar mode', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const roleRepository = read('src/database/repositories/aiRoleCardRepository.ts');
  const storage = read('src/services/fileStorageService.ts');

  assert.match(bubble, /assistantAvatar/);
  assert.match(bubble, /avatarEnabled/);
  assert.match(bubble, /SecureImage/);
  assert.match(bubble, /showAssistantAvatar/);
  assert.match(roleRepository, /avatarEnabled/);
  assert.match(roleRepository, /avatarUri/);
  assert.match(storage, /copyAiRoleAvatarToAppStorage/);
  assert.match(storage, /getAiRoleAvatarsDir/);
});

test('AI citations open document readers and IP sources without treating all sources as documents', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const app = read('App.tsx');

  assert.match(chat, /onOpenIpSource/);
  assert.match(chat, /onOpenImageSource/);
  assert.match(chat, /citation\.sourceType === 'ip_metadata'/);
  assert.match(chat, /citation\.sourceType === 'image_note'/);
  assert.match(app, /onOpenIpSource/);
  assert.match(app, /onOpenImageSource/);
  assert.match(app, /image-detail/);
});
