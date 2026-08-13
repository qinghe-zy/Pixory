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
  assert.match(chat, /当前模型账号不可用，请检查 API key 或切换当前会话模型/);
  assert.match(chat, /retryAssistantMessage/);
  assert.match(chat, /stopStreamingMessage/);
  assert.match(chat, /fallbackAiThreadTitle/);
  assert.match(chat, /partialContent = ''/);
  assert.match(chat, /content: partialContent/);
  assert.match(chat, /const failureCode = setGenerationFailureReason\(generationMetrics, error\)/);
  assert.match(chat, /markAssistantFailed\(input\.space, input\.assistantMessageId, generationId, readableError, answerText, reasoningText \|\| null, createPromptSnapshotJson\(\{ failureReason: failureCode \}\)\)/);
  assert.match(chat, /async function markAssistantFailed[\s\S]*updateAssistantMessageForGeneration\(db, assistantMessageId, generationId/);
});

test('AI failed assistant bubbles provide readable errors and inline retry', () => {
  const errors = read('src/ai/aiErrorMessageService.ts');
  const chatService = read('src/ai/aiChatService.ts');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(errors, /normalizeAiErrorMessage/);
  assert.match(errors, /classifyAiProviderError/);
  assert.match(errors, /toUserProviderErrorMessage/);
  assert.match(chatService, /normalizeAiErrorMessage/);
  assert.match(chatService, /invalid_global_default/);
  assert.match(chatService, /invalid_thread_model/);
  assert.match(bubble, /inlineRetryButton/);
  assert.match(bubble, /重试/);
});

test('new AI chats follow the global default until a session model is explicitly set', () => {
  const chat = read('src/ai/aiChatService.ts');
  const providerService = read('src/ai/aiProviderService.ts');
  const settingsRepository = read('src/database/repositories/settingsRepository.ts');
  assert.match(chat, /resolveDefaultThreadProvider/);
  assert.match(chat, /settingsRepository\.getDefaultAiProviderId/);
  assert.match(providerService, /setDefaultAiProviderId/);
  assert.match(settingsRepository, /AI_DEFAULT_CHAT_PROVIDER_ID_KEY/);
  assert.match(chat, /provider\.defaultChatModelId/);
  assert.match(chat, /item\.supportsChat/);
  assert.match(chat, /const shouldUseFixedModel = Boolean\(input\.providerId \|\| input\.modelId\)/);
  assert.match(chat, /providerId: shouldUseFixedModel && provider \? provider\.id : null/);
  assert.match(chat, /modelId: shouldUseFixedModel && model \? model\.modelId : null/);
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
  const roleLibrary = read('src/screens/AiRoleLibraryScreen.tsx');
  const app = read('App.tsx');
  const chatScreen = read('src/screens/AiChatScreen.tsx');
  const chatService = read('src/ai/aiChatService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(sessionConfig, /loadThreadSessionConfig/);
  assert.match(sessionConfig, /updateAiThreadSessionConfig/);
  assert.doesNotMatch(sessionConfig, /applyRoleCardToThread/);
  assert.doesNotMatch(sessionConfig, /恢复默认角色/);
  assert.match(sessionConfig, /avatarEnabled/);
  assert.match(sessionConfig, /DEFAULT_AI_USER_AVATAR_ENABLED/);
  assert.match(sessionConfig, /头像开启|头像关闭/);
  assert.match(sessionConfig, /高级角色指令/);
  assert.match(sessionConfig, /回复设置/);
  assert.match(sessionConfig, /当前会话模型/);
  assert.match(sessionConfig, /跟随全局默认/);
  assert.match(sessionConfig, /资料范围/);
  assert.match(sessionConfig, /回复倾向/);
  assert.match(sessionConfig, /思考过程/);
  assert.match(sessionConfig, /thinkingDisabled/);
  assert.match(sessionConfig, /REPLY_PREFERENCES/);
  assert.match(sessionConfig, /模型自适应/);
  assert.match(sessionConfig, /更简洁/);
  assert.match(sessionConfig, /更详细/);
  assert.match(sessionConfig, /ROLE_INSTRUCTION_WEIGHTS/);
  assert.match(sessionConfig, /权重等级/);
  assert.match(sessionConfig, /setRoleInstructionWeight/);
  assert.match(sessionConfig, /保存角色指令并开始聊天/);
  assert.match(sessionConfig, /仅保存角色指令/);
  assert.match(roleEditor, /onApplyRoleCard/);
  assert.match(roleEditor, /ImagePicker\.launchImageLibraryAsync/);
  assert.match(roleEditor, /copyAiRoleAvatarToAppStorage/);
  assert.match(roleEditor, /imageRepository\.findByIpId/);
  assert.match(roleLibrary, /deleteRoleCards/);
  assert.match(roleLibrary, /selectedCardIds/);
  assert.match(roleLibrary, /selectionFooter/);
  assert.match(roleLibrary, /onLongPress=\{toggleSelected\}/);
  assert.match(app, /onThreadReady/);
  assert.match(chatScreen, /handleOpenSessionConfig/);
  assert.match(chatScreen, /loadThreadMessageAppearanceConfig/);
  assert.match(chatScreen, /DEFAULT_AI_USER_AVATAR_ENABLED/);
  assert.match(chatService, /updateAiThreadSessionConfig/);
  assert.match(chatService, /parseThreadAvatarConfig/);
  assert.match(chatService, /DEFAULT_AI_USER_AVATAR_ENABLED = true/);
  assert.match(chatService, /snapshot\.userAvatarEnabled === false[\s\S]{0,120}DEFAULT_AI_USER_AVATAR_ENABLED/);
  assert.match(chatService, /patchThreadRoleSnapshot/);
  assert.match(chatService, /systemPrompt: roleCard\?\.prompt \?\? getDefaultThreadSystemPrompt\(thread\.contextType\)/);
  assert.match(chatService, /roleInstructionWeight: input\.roleInstructionWeight/);
  assert.match(chatService, /replyPreference: input\.replyPreference/);
  assert.match(chatService, /thinkingDisabled: input\.thinkingDisabled/);
  assert.match(chatService, /roleSnapshotJson/);
  assert.match(repository, /roleCardId/);
  assert.match(repository, /roleInstructionWeight/);
  assert.match(repository, /replyPreference/);
  assert.match(repository, /thinkingDisabled/);
});

test('normal chat keeps role instruction empty unless the user configures one', () => {
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const chatService = read('src/ai/aiChatService.ts');
  const promptBuilder = read('src/ai/promptBuilder.ts');

  assert.match(sessionConfig, /getDefaultSystemPrompt\(contextType\)/);
  assert.match(sessionConfig, /contextType === 'normal' \? '' : DEFAULT_AI_ROLE_PROMPT/);
  assert.match(chatService, /systemPrompt: input\.systemPrompt \?\? getDefaultThreadSystemPrompt\(input\.contextType\)/);
  assert.match(chatService, /thread\.contextType === 'normal'\s*\?\s*thread\.systemPrompt/);
  assert.match(chatService, /contextType === 'normal' \? '' : DEFAULT_AI_ROLE_PROMPT/);
  assert.match(promptBuilder, /if \(!trimmed\) \{\s*return '';\s*\}/);
});

test('high role instruction weight uses a stronger prompt frame without conflict wording', () => {
  const promptBuilder = read('src/ai/promptBuilder.ts');
  const chatService = read('src/ai/aiChatService.ts');

  assert.match(promptBuilder, /HIGH_ROLE_INSTRUCTION_FRAME/);
  assert.match(promptBuilder, /【最高优先级：当前会话角色指令】/);
  assert.match(promptBuilder, /身份、语气、边界和输出方式/);
  assert.doesNotMatch(promptBuilder, /除非与安全规则、资料事实或用户最新明确要求冲突/);
  assert.match(promptBuilder, /weight === 'high'/);
  assert.match(chatService, /roleInstructionWeight: thread\.roleInstructionWeight/);
});

test('AI session settings report save success and failed missing thread updates', () => {
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  assert.match(sessionConfig, /setStatus\(\{ message: '正在保存会话设置\.\.\.', tone: 'info', title: '保存中' \}\)/);
  assert.match(sessionConfig, /会话设置已保存。/);
  assert.match(sessionConfig, /const updated = await updateAiThreadSessionConfig/);
  assert.match(sessionConfig, /if \(!updated\) \{/);
  assert.match(sessionConfig, /throw new Error\('没有找到当前会话，设置未保存。'\)/);
  assert.match(sessionConfig, /保存失败/);
  assert.match(sessionConfig, /设置已保存/);
});

test('AI session settings autosave lightweight options and separates dangerous deletion', () => {
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(sessionConfig, /setTimeout\(\(\) => \{/);
  assert.match(sessionConfig, /updateAiThreadSessionConfig/);
  assert.match(sessionConfig, /boundaryMode[\s\S]*deepMemoryEnabled[\s\S]*replyPreference[\s\S]*thinkingDisabled/);
  assert.doesNotMatch(sessionConfig, /subtitle=\{`\$\{spaceLabel\}\$\{threadId/);
  assert.match(sessionConfig, /dangerSection/);
  assert.match(sessionConfig, /删除当前会话/);
});

test('AI session settings can disable model thinking for the current thread', () => {
  const types = read('src/ai/types.ts');
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const chatService = read('src/ai/aiChatService.ts');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const providerBase = read('src/ai/providers/base.ts');
  const openai = read('src/ai/providers/openAiCompatibleProvider.ts');
  const gemini = read('src/ai/providers/geminiProvider.ts');

  assert.match(types, /thinkingDisabled: boolean/);
  assert.match(schema, /DATABASE_VERSION = 5[1-9]/);
  assert.match(schema, /thinkingDisabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /MIGRATION_STATEMENTS_V40/);
  assert.match(db, /MIGRATION_STATEMENTS_V40/);
  assert.match(db, /currentVersion < 40/);
  assert.match(repository, /thinkingDisabled: sqliteToBoolean\(row\.thinkingDisabled\)/);
  assert.match(repository, /booleanToSqlite\(input\.thinkingDisabled \?\? false\)/);
  assert.match(repository, /thinkingDisabled: patch\.thinkingDisabled === undefined \? undefined : booleanToSqlite\(patch\.thinkingDisabled\)/);
  assert.match(sessionConfig, /setThinkingDisabled\(config\.thread\.thinkingDisabled\)/);
  assert.match(
    chatService,
    /thinkingDisabled: input\.thinkingDisabled \?\? thinkingDisabledOverride \?\? false/,
  );
  assert.match(chatService, /thinkingDisabled: input\.thread\.thinkingDisabled/);
  assert.match(providerBase, /thinkingDisabled\?: boolean/);
  assert.match(openai, /function shouldDisableOpenAiReasoning\(input: AiChatRequest\): boolean/);
  assert.match(openai, /host === 'api\.openai\.com' && supportsOpenAiReasoningNone\(input\.modelId\)/);
  assert.match(openai, /body\.reasoning_effort = 'none'/);
  assert.match(openai, /function shouldDisableDeepSeekThinking\(input: AiChatRequest\): boolean/);
  assert.match(openai, /host === 'api\.deepseek\.com' && \/\^deepseek-v4-\//);
  assert.match(openai, /if \(shouldDisableDeepSeekThinking\(input\)\) \{[\s\S]*body\.thinking = \{ type: 'disabled' \}/);
  assert.doesNotMatch(openai, /if \(input\.thinkingDisabled\) \{[\s\S]*body\.thinking = \{ type: 'disabled' \}/);
  assert.match(gemini, /function shouldDisableGeminiThinking\(input: AiChatRequest\): boolean/);
  assert.match(gemini, /input\.thinkingDisabled && \/\^gemini-2\\\.5-flash\/i\.test\(input\.modelId\)/);
  assert.match(gemini, /if \(shouldDisableGeminiThinking\(input\)\)[\s\S]{0,80}thinkingConfig = \{ thinkingBudget: 0 \}/);
  assert.match(sessionConfig, /accessibilityRole="switch"/);
  assert.match(sessionConfig, /accessibilityState=\{\{ checked: thinkingDisabled \}\}/);
  assert.match(sessionConfig, /setThinkingDisabled\(\(current\) => !current\)/);
});

test('AI session settings clearly distinguish autosaved options from role instruction saves', () => {
  const session = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(session, /这些选项会自动保存/);
  assert.match(session, /角色指令需要点击保存后生效/);
  assert.match(session, /保存角色指令并开始聊天/);
  assert.match(session, /仅保存角色指令/);
  assert.match(session, /dangerSection/);
});

test('AI memory board uses confirmation and compact governance labels', () => {
  const board = read('src/screens/AiMemoryBoardScreen.tsx');

  assert.match(board, /deleteTarget/);
  assert.match(board, /AppDialog/);
  assert.match(board, /忘记这条记忆/);
  assert.doesNotMatch(board, /删除这段摘要/);
  assert.match(board, /scopeText/);
  assert.match(board, /SCOPE_LABELS\[memory\.scope\]/);
  assert.match(board, /memory\.sourceKind === 'manual'/);
  assert.doesNotMatch(board, /formatMemoryImportanceLabel/);
  assert.doesNotMatch(board, /formatMemoryConfidenceLabel/);
  assert.doesNotMatch(board, /重要度 \{memory\.importance\} · 可信度 \{Math\.round\(memory\.confidence \* 100\)\}%/);
});

test('AI reply preference is per-thread and only adds lightweight prompt hints when selected', () => {
  const types = read('src/ai/types.ts');
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const chatService = read('src/ai/aiChatService.ts');
  const promptBuilder = read('src/ai/promptBuilder.ts');

  assert.match(types, /AiReplyPreference = 'auto' \| 'concise' \| 'detailed'/);
  assert.match(schema, /replyPreference TEXT NOT NULL DEFAULT 'auto'/);
  assert.match(db, /MIGRATION_STATEMENTS_V23/);
  assert.match(repository, /replyPreference: row\.replyPreference === 'concise' \|\| row\.replyPreference === 'detailed' \? row\.replyPreference : 'auto'/);
  assert.match(repository, /input\.replyPreference \?\? 'auto'/);
  assert.match(repository, /snapshot\.thread\.replyPreference \?\? 'auto'/);
  assert.match(chatService, /replyPreference: thread\.replyPreference/);
  assert.match(chatService, /replyPreference: input\.replyPreference \?\? 'auto'/);
  assert.match(promptBuilder, /function frameReplyPreference/);
  assert.match(promptBuilder, /preference === 'concise'/);
  assert.match(promptBuilder, /preference === 'detailed'/);
  assert.match(promptBuilder, /return ''/);
  assert.match(promptBuilder, /以用户当前要求为准/);
});

test('AI memory repository supports visible board controls and lazy job state', () => {
  const types = read('src/ai/types.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(types, /AiMemorySourceKind = 'auto' \| 'manual'/);
  assert.match(repository, /listMemoryBoardItems/);
  assert.match(repository, /createManualMemory/);
  assert.match(repository, /updateMemoryContent/);
  assert.match(repository, /updateMemoryStatus\(db, memoryId, 'deleted'\)/);
  assert.match(repository, /getThreadMemoryJob/);
  assert.match(repository, /updateThreadMemoryJob/);
  assert.match(repository, /sourceKind: 'manual'/);
  assert.match(repository, /memoryScopePrioritySql/);
  assert.match(repository, /ORDER BY \$\{memoryScopePrioritySql\(\)\} DESC, importance DESC, createdAt ASC, id ASC/);
});

test('AI companion memory repository supports profiles and summary segments', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const settings = read('src/database/repositories/settingsRepository.ts');

  assert.match(repository, /AiUserProfileRecord/);
  assert.match(repository, /upsertUserProfile/);
  assert.match(repository, /getUserProfile/);
  assert.match(repository, /createSummarySegment/);
  assert.match(repository, /listSummarySegments/);
  assert.match(repository, /deleteSummarySegments/);
  assert.match(repository, /lastCompressedMessageId/);
  assert.match(settings, /getMemoryMaintenanceSettings/);
  assert.match(settings, /updateMemoryMaintenanceSettings/);
});

test('AI companion memory profile service updates session profiles early enough for long chats', () => {
  const profile = read('src/ai/aiMemoryProfileService.ts');
  const prompts = read('src/ai/aiMemoryPrompts.ts');
  const board = read('src/screens/AiMemoryBoardScreen.tsx');
  const providerSettings = read('src/screens/AiProviderSettingsScreen.tsx');

  assert.match(profile, /PROFILE_INITIAL_MESSAGE_COUNT = 8/);
  assert.match(profile, /PROFILE_UPDATE_MESSAGE_INTERVAL = 16/);
  assert.match(profile, /PROFILE_PASSIVE_UPDATE_MESSAGE_INTERVAL = 10/);
  assert.match(profile, /PROFILE_STRONG_SIGNAL_MESSAGE_COOLDOWN = 4/);
  assert.match(profile, /PROFILE_STRONG_SIGNAL_TIME_COOLDOWN_MS = 5 \* 60 \* 1000/);
  assert.match(profile, /PROFILE_SIGNAL_PATTERNS/);
  assert.match(profile, /我希望|我需要|叫我|我叫|你可以记住/);
  assert.match(profile, /maybeInitializeUserProfile/);
  assert.match(profile, /maybeUpdateUserProfile/);
  assert.match(profile, /buildProfileInitializationPrompt/);
  assert.match(profile, /buildProfileUpdatePrompt/);
  assert.match(profile, /profileTextToJson/);
  assert.match(profile, /用户手动画像/);
  assert.match(profile, /prepared\.currentProfile\.profileText/);
  assert.match(prompts, /手动画像优先/);
  assert.match(board, /长期记住/);
  assert.match(board, /最近对话/);
  assert.doesNotMatch(board, /人设画像/);
  assert.match(providerSettings, /全局用户画像/);
  assert.match(providerSettings, /updateUserProfile\(space,\s*globalProfileDraft\.trim\(\),\s*null,\s*null\)/);
});

test('AI memory board is reachable from session settings and supports user control', () => {
  const app = read('App.tsx');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const board = read('src/screens/AiMemoryBoardScreen.tsx');

  assert.match(app, /ai-memory-board/);
  assert.match(app, /AiMemoryBoardScreen/);
  assert.match(sessionConfig, /onOpenMemoryBoard/);
  assert.match(sessionConfig, /管理记忆/);
  assert.match(board, /AI 记住了这些/);
  assert.match(board, /createManualMemory/);
  assert.match(board, /updateMemoryContent/);
  assert.match(board, /deleteMemory/);
});

test('AI memory board removes profile internals while global profile management stays in provider settings', () => {
  const board = read('src/screens/AiMemoryBoardScreen.tsx');
  const providerSettings = read('src/screens/AiProviderSettingsScreen.tsx');

  assert.doesNotMatch(board, /人设画像/);
  assert.doesNotMatch(board, /画像用于长期理解你，不会覆盖当前要求/);
  assert.doesNotMatch(board, /globalProfileDraft/);
  assert.doesNotMatch(board, /handleSaveGlobalProfile/);
  assert.doesNotMatch(board, /projectProfileDraft/);
  assert.doesNotMatch(board, /handleSaveProjectProfile/);
  assert.match(board, /长期记住/);
  assert.match(board, /最近对话/);
  assert.match(providerSettings, /全局用户画像/);
  assert.match(providerSettings, /globalProfileDraft/);
  assert.match(providerSettings, /handleSaveGlobalProfile/);
});

test('AI chat title is finalized from the first exchange and refreshed in the chat header', () => {
  const chatScreen = read('src/screens/AiChatScreen.tsx');
  const chatService = read('src/ai/aiChatService.ts');
  const app = read('App.tsx');

  assert.match(chatService, /generateAiThreadTitle/);
  assert.match(chatService, /COMMON_TITLE_PREFIXES/);
  assert.match(chatService, /LOW_SIGNAL_TITLE_PATTERNS/);
  assert.match(chatService, /TITLE_FILLER_PATTERNS/);
  assert.match(chatService, /ASSISTANT_TOPIC_PATTERNS/);
  assert.match(chatService, /pickAssistantTopicCandidate/);
  assert.match(chatService, /assistantReply/);
  assert.doesNotMatch(chatService, /const assistantTitle = trimGenericTitleWords\(normalizeTitleSource/);
  assert.match(chatService, /finalizeThreadTitleAfterReply/);
  assert.match(chatService, /isCustomInitialTitle/);
  assert.match(chatService, /title !== defaultTitle/);
  assert.match(chatService, /titleStatus === 'fallback'/);
  assert.match(chatService, /current\.titleStatus !== 'fallback'/);
  assert.match(chatService, /titleStatus:\s*'generated'/);
  assert.match(chatScreen, /loadThreadTitle/);
  assert.match(chatScreen, /displayTitle/);
  assert.match(chatScreen, /displayTitleRef/);
  assert.match(chatScreen, /onThreadTitleChange/);
  assert.match(app, /onThreadTitleChange=\{\(title\) => updateCurrentAiChatRoute\(\{ contextTitle: title \}, currentRoute\.routeKey\)\}/);
});

test('AI chat title uses a cheap model after three rounds while keeping the first-round local fallback', () => {
  const chatService = read('src/ai/aiChatService.ts');

  assert.match(chatService, /MODEL_TITLE_MIN_COMPLETED_MESSAGES = 6/);
  assert.match(chatService, /modelTitleGeneratedAt/);
  assert.match(chatService, /generateAiThreadTitle/);
  assert.match(chatService, /maybeGenerateModelThreadTitleAfterReply/);
  assert.match(chatService, /resolveMemoryMaintenanceModel/);
  assert.match(chatService, /resolvedMaintenance\.provider[\s\S]*resolvedMaintenance\.modelId[\s\S]*resolvedMaintenance\.apiKey/);
  assert.match(chatService, /shouldUseResolvedMaintenanceTitleModel/);
  assert.match(chatService, /resolvedMaintenance\.mode === 'custom' \|\| resolvedMaintenance\.mode === 'deepseek_flash'/);
  assert.match(chatService, /resolvedMaintenance\.mode === 'auto'[\s\S]*providerId === 'deepseek'[\s\S]*modelId === 'deepseek-v4-flash'/);
  assert.match(chatService, /const useMaintenanceTitleModel = shouldUseResolvedMaintenanceTitleModel\(resolvedMaintenance\)/);
  assert.match(chatService, /resolveThreadChatModel\(input\.space, input\.thread\)/);
  assert.match(chatService, /ThreadModelConfig = Pick<AiThreadRecord,[\s\S]*sessionBaseUrl[\s\S]*sessionApiKeyRef/);
  assert.match(chatService, /buildModelThreadTitlePrompt/);
  assert.match(chatService, /请只输出标题，不要解释/);
  assert.match(chatService, /`要求：不超过 \$\{MODEL_TITLE_MAX_CHARS\} 个汉字/);
  assert.match(chatService, /sanitizeModelThreadTitle/);
  assert.match(chatService, /MODEL_TITLE_MAX_CHARS = 8/);
  assert.match(chatService, /\.slice\(0,\s*MODEL_TITLE_MAX_CHARS\)/);
  assert.match(chatService, /countCompletedNonSystemMessages\(db, input\.thread\.id, input\.branchScopes\)/);
  assert.match(chatService, /listRecentCompletedNonSystemMessages[\s\S]*input\.branchScopes/);
  assert.match(chatService, /completedCount < MODEL_TITLE_MIN_COMPLETED_MESSAGES/);
  assert.match(chatService, /completedMessages\.length !== MODEL_TITLE_MIN_COMPLETED_MESSAGES/);
  assert.match(chatService, /current\.titleStatus !== 'generated'/);
  assert.match(chatService, /modelTitleGeneratedAt: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(chatService, /titleStatus:\s*'custom'[\s\S]{0,120}maybeGenerateModelThreadTitleAfterReply/);
  assert.match(chatService, /void enqueueAiPostReplyTask/);
  assert.match(chatService, /enqueueAiPostReplyTask\([\s\S]{0,400}await maybeGenerateModelThreadTitleAfterReply/);
  assert.doesNotMatch(chatService, /await finalizeThreadTitleAfterReply\([\s\S]{0,300}\);\s*await maybeGenerateModelThreadTitleAfterReply/);
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

test('AI thread session endpoint overrides are thread scoped and do not store key plaintext', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const types = read('src/ai/types.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(schema, /DATABASE_VERSION = 5[1-9]/);
  assert.match(schema, /MIGRATION_STATEMENTS_V38/);
  assert.match(schema, /sessionBaseUrl TEXT/);
  assert.match(schema, /sessionApiKeyRef TEXT/);
  assert.doesNotMatch(schema, /sessionApiKey TEXT/);
  assert.match(db, /MIGRATION_STATEMENTS_V38/);
  assert.match(types, /sessionBaseUrl: string \| null/);
  assert.match(types, /sessionApiKeyRef: string \| null/);
  assert.match(repository, /sessionBaseUrl: patch\.sessionBaseUrl/);
  assert.match(repository, /sessionApiKeyRef: patch\.sessionApiKeyRef/);
});

test('AI session API key overrides use SecureStore scoped by space thread and provider', () => {
  const secureSettings = read('src/ai/secureAiSettingsService.ts');
  assert.match(secureSettings, /setThreadProviderApiKey/);
  assert.match(secureSettings, /getThreadProviderApiKey/);
  assert.match(secureSettings, /deleteThreadProviderApiKey/);
  assert.match(secureSettings, /hasThreadProviderApiKey/);
  assert.match(secureSettings, /space/);
  assert.match(secureSettings, /threadId/);
  assert.match(secureSettings, /providerId/);
  assert.match(secureSettings, /SecureStore\.setItemAsync/);
  assert.match(secureSettings, /SecureStore\.deleteItemAsync/);
});

test('AI session model override resolution uses thread endpoint and key before provider defaults', () => {
  const chat = read('src/ai/aiChatService.ts');
  assert.match(chat, /sessionBaseUrl/);
  assert.match(chat, /sessionApiKeyRef/);
  assert.match(chat, /getThreadProviderApiKey/);
  assert.match(chat, /provider: \{\s*\.\.\.provider,\s*baseUrl: thread\.sessionBaseUrl \?\? provider\.baseUrl/s);
  assert.match(chat, /apiKey: thread\.sessionApiKeyRef \? await getThreadProviderApiKey/);
  assert.match(chat, /saveThreadSessionModelOverride/);
  assert.match(chat, /clearThreadSessionModelOverride/);
});

test('AI session settings edits only current session model endpoint and key', () => {
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const chatService = read('src/ai/aiChatService.ts');
  const providerService = read('src/ai/aiProviderService.ts');
  const candidateFunction = providerService.match(/export async function saveManualChatModelCandidate[\s\S]*?(?=\nexport async function recordSuccessfulProviderModel)/)?.[0] ?? '';

  assert.match(sessionConfig, /saveThreadSessionModelOverride/);
  assert.match(sessionConfig, /clearThreadSessionModelOverride/);
  assert.match(sessionConfig, /sessionBaseUrlDraft/);
  assert.match(sessionConfig, /sessionApiKeyDraft/);
  assert.match(sessionConfig, /manualSessionModelDraft/);
  assert.match(sessionConfig, /仅本会话/);
  assert.match(sessionConfig, /清除 API/);
  assert.match(sessionConfig, /保存本会话配置/);
  assert.match(sessionConfig, /测试当前模型/);
  assert.match(sessionConfig, /复用全局模型配置/);
  assert.match(sessionConfig, /添加新模型/);
  assert.match(sessionConfig, /添加并用于当前会话/);
  assert.match(sessionConfig, /verifyThreadSessionModelOverride/);
  assert.match(sessionConfig, /addThreadSessionManualModel/);
  assert.match(sessionConfig, /apiKey: ''/);
  assert.match(sessionConfig, /跟随全局默认/);
  assert.match(chatService, /verifyThreadSessionModelOverride[\s\S]*verifyChatCompletion/);
  assert.match(chatService, /loadThreadSessionModelConfig[\s\S]*resolveThreadChatModel\(space, emptyThreadModelConfig\(space\)\)/);
  assert.match(candidateFunction, /manualModelRecord/);
  assert.doesNotMatch(candidateFunction, /updateProviderDefaults/);
  assert.doesNotMatch(sessionConfig, /saveProviderBaseUrl\(space/);
  assert.doesNotMatch(sessionConfig, /saveProviderApiKey/);
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
