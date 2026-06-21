const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const constantsPath = path.join(root, 'src/ai/aiConstants.ts');
const repositoryPath = path.join(root, 'src/database/repositories/aiProviderRepository.ts');
const servicePath = path.join(root, 'src/ai/secureAiSettingsService.ts');
const providerServicePath = path.join(root, 'src/ai/aiProviderService.ts');
const providerSettingsPath = path.join(root, 'src/screens/AiProviderSettingsScreen.tsx');
const providerBasePath = path.join(root, 'src/ai/providers/base.ts');
const registryPath = path.join(root, 'src/ai/providerRegistry.ts');
const schemaPath = path.join(root, 'src/database/schema.ts');

test('AI constants define required built-in providers without storing keys in SQLite', () => {
  const constants = fs.readFileSync(constantsPath, 'utf8');
  for (const provider of ['deepseek', 'openai', 'gemini', 'claude', 'openai_compatible']) {
    assert.match(constants, new RegExp(provider));
  }
  assert.match(constants, /secureStoreKeyForProvider/);
});

test('provider bootstrap does not overwrite saved provider model selection', () => {
  const repository = fs.readFileSync(repositoryPath, 'utf8');
  assert.match(repository, /defaultChatModelId = COALESCE\(ai_providers\.defaultChatModelId, excluded\.defaultChatModelId\)/);
  assert.match(repository, /defaultEmbeddingModelId = COALESCE\(ai_providers\.defaultEmbeddingModelId, excluded\.defaultEmbeddingModelId\)/);
  assert.match(repository, /updatedAt = ai_providers\.updatedAt/);
});

test('secure AI settings service uses expo-secure-store for API keys', () => {
  const service = fs.readFileSync(servicePath, 'utf8');
  const providerService = fs.readFileSync(providerServicePath, 'utf8');
  const providerSettings = fs.readFileSync(providerSettingsPath, 'utf8');
  assert.match(service, /expo-secure-store/);
  assert.match(service, /setProviderApiKey/);
  assert.match(service, /getProviderApiKey/);
  assert.match(service, /deleteProviderApiKey/);
  assert.match(service, /setProviderApiKeyForSpace/);
  assert.match(service, /getProviderApiKeyForSpace/);
  assert.match(service, /hasProviderApiKeyForSpace/);
  assert.match(providerService, /getSavedProviderApiKey/);
  assert.match(providerSettings, /getSavedProviderApiKey\(selectedProviderId, space\)/);
  assert.match(providerSettings, /setApiDraft\(apiKey\)/);
});

test('provider settings expose test sync and embedding model controls', () => {
  const providerSettings = fs.readFileSync(providerSettingsPath, 'utf8');
  const providerService = fs.readFileSync(providerServicePath, 'utf8');
  const providerBase = fs.readFileSync(providerBasePath, 'utf8');
  const chatService = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  assert.match(providerSettings, /verifyCurrentProviderModel/);
  assert.match(providerSettings, /syncProviderModels/);
  assert.match(providerSettings, /saveProviderDraft/);
  assert.doesNotMatch(providerSettings, /保存并测试/);
  assert.match(providerSettings, /label="保存配置"/);
  assert.match(providerSettings, /label="刷新模型列表"/);
  assert.match(providerSettings, /label="测试当前模型"/);
  assert.match(providerSettings, /测试当前模型/);
  assert.match(providerSettings, /刷新模型列表/);
  assert.match(providerSettings, /embeddingModels/);
  assert.match(providerSettings, /默认 Embedding/);
  assert.match(providerSettings, /Embedding 接口/);
  assert.match(providerSettings, /embeddingBaseUrlDraft/);
  assert.match(providerSettings, /saveProviderEmbeddingBaseUrl/);
  assert.match(providerSettings, /saveManualEmbeddingModel/);
  assert.match(providerSettings, /自定义 Embedding 模型/);
  assert.match(providerSettings, /defaultEmbeddingModelId/);
  assert.match(providerSettings, /advancedVisible/);
  assert.match(providerSettings, /parsedBaseUrl\.search \|\| parsedBaseUrl\.hash/);
  assert.match(providerSettings, /Base URL 不能包含查询参数或片段/);
  assert.match(providerService, /getDefaultChatProviderId/);
  assert.match(providerService, /saveProviderDefaultModels/);
  assert.match(providerService, /saveProviderEmbeddingBaseUrl/);
  assert.match(providerService, /saveManualEmbeddingModel/);
  assert.match(providerService, /verifyCurrentProviderModel/);
  assert.match(providerService, /saveProviderBaseUrl[\s\S]*normalizeBaseUrl\(baseUrl\)/);
  assert.match(providerBase, /parsed\.search = ''/);
  assert.match(providerBase, /parsed\.hash = ''/);
  assert.match(providerBase, /replace\(\/\\\/\+\$\/, ''\)[\s\S]*replace\(\/\\\/\+\(chat\\\/completions\|completions\|models\|embeddings\)\$\/i, ''\)/);
  assert.match(chatService, /getDefaultAiProviderId/);
});

test('provider settings support non-mutating gateway connection import', () => {
  const providerSettings = fs.readFileSync(providerSettingsPath, 'utf8');

  assert.match(providerSettings, /parseProviderConnectionImport/);
  assert.match(providerSettings, /connectionImportDraft/);
  assert.match(providerSettings, /连接信息导入/);
  assert.match(providerSettings, /导入连接信息/);
  assert.match(providerSettings, /setBaseUrlDraft\(result\.baseUrl\)/);
  assert.match(providerSettings, /setApiDraft\(result\.apiKey\)/);
  assert.match(providerSettings, /未识别到有效的 url 和 key/);
  assert.match(providerSettings, /该连接未包含 `\/v1`/);
  assert.doesNotMatch(providerSettings, /saveProviderApiKey[\s\S]{0,160}parseProviderConnectionImport/);
});

test('provider verification state is stored without API key plaintext', () => {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const types = fs.readFileSync(path.join(root, 'src/ai/types.ts'), 'utf8');
  const repository = fs.readFileSync(repositoryPath, 'utf8');
  const providerService = fs.readFileSync(providerServicePath, 'utf8');

  assert.match(schema, /DATABASE_VERSION = 41/);
  assert.match(schema, /keyUpdatedAt TEXT/);
  assert.match(schema, /lastVerifiedAt TEXT/);
  assert.match(schema, /lastVerifyStatus TEXT/);
  assert.match(schema, /verifyFingerprint TEXT/);
  assert.match(types, /keyUpdatedAt: string \| null/);
  assert.match(types, /AiProviderVerifyStatus = 'ready' \| 'changed' \| 'failed' \| 'untested'/);
  assert.match(types, /lastVerifyStatus: AiProviderVerifyStatus \| null/);
  assert.match(repository, /updateProviderKeyUpdatedAt/);
  assert.match(repository, /updateProviderVerification/);
  assert.match(repository, /ai_provider_models\.source = 'manual' AND excluded\.source <> 'manual'/);
  assert.match(repository, /THEN ai_provider_models\.capabilityJson ELSE excluded\.capabilityJson/);
  assert.match(repository, /THEN ai_provider_models\.source ELSE excluded\.source/);
  assert.match(providerService, /buildProviderVerifyFingerprint/);
  assert.match(providerService, /keyUpdatedAt/);
  assert.match(providerService, /saveProviderApiKey\(providerId: string, apiKey: string, space\?: PixorySpace\)/);
  assert.match(providerService, /space \? await getProviderApiKeyForSpace\(space, providerId\) : await getProviderApiKey\(providerId\)/);
  assert.match(providerService, /setProviderApiKeyForSpace\(space, providerId, apiKey\)/);
  assert.match(providerService, /previousApiKey !== apiKey\.trim\(\)/);
  assert.match(providerService, /hasProviderApiKeyForSpace\(space, provider\.id\)/);
  assert.match(providerService, /provider\.verifyFingerprint && provider\.verifyFingerprint !== fingerprint/);
  assert.match(providerService, /controller\.abort\(\)/);
  assert.doesNotMatch(providerService, /new DOMException/);
  assert.doesNotMatch(schema, /apiKey TEXT/);
});

test('provider verification uses chat completions and records successful models', () => {
  const providerSettings = fs.readFileSync(providerSettingsPath, 'utf8');
  const providerService = fs.readFileSync(providerServicePath, 'utf8');
  const openai = fs.readFileSync(path.join(root, 'src/ai/providers/openAiCompatibleProvider.ts'), 'utf8');
  const claude = fs.readFileSync(path.join(root, 'src/ai/providers/claudeProvider.ts'), 'utf8');
  const base = fs.readFileSync(providerBasePath, 'utf8');

  assert.match(providerService, /verifyCurrentProviderModel/);
  assert.match(providerService, /recordSuccessfulProviderModel/);
  assert.match(providerService, /message\?: string/);
  assert.match(providerService, /toUserProviderErrorMessage\(reason\)/);
  assert.match(providerSettings, /当前模型不会被清空/);
  assert.match(providerService, /defaultChatModelId/);
  assert.match(providerService, /lastVerifyStatus: 'ready'/);
  assert.match(providerService, /lastVerifyStatus: 'failed'/);
  assert.match(openai, /verifyChatCompletion/);
  assert.match(openai, /\/chat\/completions/);
  assert.match(openai, /stream:\s*false/);
  assert.match(openai, /max_tokens:\s*1/);
  assert.match(openai, /temperature:\s*0/);
  assert.match(openai, /Boolean\(json\?\.id \|\| json\?\.choices\)/);
  assert.match(claude, /listModels\(input\)[\s\S]*signal: input\.signal/);
  assert.doesNotMatch(base, /testConnection\(input:/);
  assert.doesNotMatch(openai, /async testConnection/);
  assert.doesNotMatch(claude, /async testConnection/);
});

test('provider API errors use a shared classifier with redaction', () => {
  const classifier = fs.readFileSync(path.join(root, 'src/ai/aiProviderErrorClassifier.ts'), 'utf8');
  const base = fs.readFileSync(providerBasePath, 'utf8');

  for (const kind of ['auth', 'model', 'billing', 'rate_limit', 'timeout', 'network', 'upstream', 'bad_shape', 'empty_response', 'unknown']) {
    assert.match(classifier, new RegExp(kind));
  }
  assert.match(classifier, /redactProviderErrorText/);
  assert.match(classifier, /Authorization/);
  assert.match(classifier, /sk-\[redacted\]/);
  assert.match(classifier, /\$1\[redacted\]/);
  assert.match(classifier, /\(\?:api_\)\?key=/);
  assert.match(classifier, /authorization/);
  assert.match(base, /classifyAiProviderError/);
  assert.match(base, /toUserProviderErrorMessage/);
});

test('provider settings labels chat model selection as a global default', () => {
  const providerSettings = fs.readFileSync(providerSettingsPath, 'utf8');

  assert.match(providerSettings, /全局默认模型/);
  assert.doesNotMatch(providerSettings, /默认对话模型/);
  assert.match(providerSettings, /新创建会话的默认选择/);
  assert.match(providerSettings, /不会影响已有独立设置的会话/);
  assert.match(providerSettings, /saveProviderDefaultModels/);
});

test('AI memory maintenance model resolves status and reuses SecureStore keys', () => {
  const service = fs.readFileSync(path.join(root, 'src/ai/aiMemoryMaintenanceModelService.ts'), 'utf8');
  const screen = fs.readFileSync(path.join(root, 'src/screens/AiProviderSettingsScreen.tsx'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'src/database/repositories/settingsRepository.ts'), 'utf8');

  assert.match(service, /resolveMemoryMaintenanceModel/);
  assert.match(service, /testMemoryMaintenanceModel/);
  assert.match(service, /deepseek-v4-flash/);
  assert.match(service, /getProviderApiKey/);
  assert.match(service, /local_fallback/);
  assert.match(service, /lastTestStatus/);
  assert.match(service, /hashMaintenanceBaseUrl/);
  assert.match(service, /memoryMaintenanceTestedProviderId/);
  assert.match(service, /memoryMaintenanceTestedModelId/);
  assert.match(service, /memoryMaintenanceTestedBaseUrlHash/);
  assert.match(service, /配置已变更，请重新测试记忆模型/);
  assert.match(service, /MemoryMaintenanceModelCallResult/);
  assert.match(service, /streamError/);
  assert.match(service, /event\.type === 'error'/);
  assert.match(service, /return \{ error: streamError, modelId: resolved\.modelId, providerId: resolved\.providerId, status: 'error', text: null, usedRemote: true \}/);
  assert.match(service, /测试通过/);
  assert.match(service, /点击“测试记忆模型”确认链路可用/);
  assert.match(screen, /记忆维护模型/);
  assert.match(screen, /当前使用/);
  assert.match(screen, /配置状态/);
  assert.match(screen, /链路测试通过/);
  assert.match(screen, /链路测试失败/);
  assert.match(screen, /已保存，待测试/);
  assert.match(screen, /maintenanceResultBanner/);
  assert.match(screen, /memoryMaintenanceLastTestStatus: null/);
  assert.match(screen, /maintenanceInfoExpanded/);
  assert.match(screen, /setMaintenanceInfoExpanded/);
  assert.match(screen, /远程维护只用于摘要和画像，Key 保存在本机/);
  assert.match(screen, /pageContent:\s*\{[\s\S]{0,80}gap:\s*rhythm\.listCardGap/);
  assert.match(screen, /sectionDivider/);
  assert.doesNotMatch(screen, /<\/AiLightCard>\s*<AiLightCard>\s*<Text style=\{styles\.sectionTitle\}>记忆维护模型/);
  assert.match(screen, /测试记忆模型/);
  assert.match(screen, /API Key 仅保存在本机安全存储中/);
  assert.match(settings, /getMemoryMaintenanceSettings/);
  assert.match(settings, /updateMemoryMaintenanceSettings/);
  assert.match(settings, /MEMORY_MAINTENANCE_TESTED_PROVIDER_ID_KEY/);
  assert.match(settings, /MEMORY_MAINTENANCE_TESTED_MODEL_ID_KEY/);
  assert.match(settings, /MEMORY_MAINTENANCE_TESTED_BASE_URL_HASH_KEY/);
});

test('provider settings expose maintenance model mode controls', () => {
  const providerSettings = fs.readFileSync(providerSettingsPath, 'utf8');

  assert.match(providerSettings, /memoryMaintenanceMode/);
  assert.match(providerSettings, /自动/);
  assert.match(providerSettings, /跟随聊天模型/);
  assert.match(providerSettings, /DeepSeek V4 Flash/);
  assert.match(providerSettings, /自定义/);
  assert.match(providerSettings, /deepseek-v4-flash/);
  assert.match(providerSettings, /测试通过后，摘要压缩和画像维护会使用该远程模型/);
  assert.match(providerSettings, /未配置远程维护模型/);
});

test('OpenAI-compatible built-in providers can manually configure embedding endpoints without marking DeepSeek official embedding support', () => {
  const constants = fs.readFileSync(constantsPath, 'utf8');
  const providerSettings = fs.readFileSync(providerSettingsPath, 'utf8');
  const deepSeekBlock = /providerType: 'deepseek'[\s\S]*?visionEnabled: false,\r?\n  \}/.exec(constants)?.[0] ?? '';

  assert.match(deepSeekBlock, /embeddingEnabled:\s*false/);
  assert.match(providerSettings, /selectedSupportsManualChatModel/);
  assert.match(providerSettings, /selectedSupportsManualEmbedding/);
  assert.match(providerSettings, /selectedCard\?\.provider\.protocol === 'openai_compatible'/);
  assert.match(providerSettings, /selectedSupportsManualChatModel \?/);
  assert.match(providerSettings, /selectedCard\?\.provider\.embeddingEnabled \|\| selectedSupportsManualEmbedding/);
  assert.match(providerSettings, /DeepSeek 官方接口暂未列出 Embedding/);
  assert.match(providerSettings, /兼容网关/);
  assert.match(providerSettings, /\/embeddings/);
});

test('provider adapters expose real streaming and embedding interfaces', () => {
  const base = fs.readFileSync(providerBasePath, 'utf8');
  const openai = fs.readFileSync(path.join(root, 'src/ai/providers/openAiCompatibleProvider.ts'), 'utf8');
  const gemini = fs.readFileSync(path.join(root, 'src/ai/providers/geminiProvider.ts'), 'utf8');
  const claude = fs.readFileSync(path.join(root, 'src/ai/providers/claudeProvider.ts'), 'utf8');

  assert.match(base, /embedText\(input:/);
  assert.match(base, /Promise<void>/);
  for (const provider of [openai, gemini, claude]) {
    assert.match(provider, /expo\/fetch/);
    assert.match(provider, /await onEvent\(/);
    assert.doesNotMatch(provider, /const response = await fetch\(/);
  }
  assert.match(openai, /\/embeddings/);
  assert.match(openai, /stream:\s*true/);
  assert.match(openai, /parseOpenAiChatCompletionJson/);
  assert.match(openai, /message\?\.content/);
  assert.doesNotMatch(openai, /if \(!contentType\.includes\('text\/event-stream'\)\)/);
  assert.match(openai, /sawStreamPayload/);
  assert.match(openai, /trimmed\.startsWith\('\{'\)/);
  assert.match(openai, /rawText/);
  assert.match(gemini, /:streamGenerateContent/);
  assert.match(gemini, /await emitCompletedGeminiChunks\(buffer, onEvent\)/);
  assert.match(gemini, /buffer \+= decoder\.decode\(value, \{ stream: true \}\);[\s\S]{0,120}buffer = await emitCompletedGeminiChunks\(buffer, onEvent\)/);
  assert.match(gemini, /embedContent/);
  assert.match(claude, /stream:\s*true/);
  assert.match(claude, /content_block_delta/);
});

test('provider API errors are normalized before reaching chat bubbles', () => {
  const base = fs.readFileSync(providerBasePath, 'utf8');
  const classifier = fs.readFileSync(path.join(root, 'src/ai/aiProviderErrorClassifier.ts'), 'utf8');
  const errors = fs.readFileSync(path.join(root, 'src/ai/aiErrorMessageService.ts'), 'utf8');
  assert.match(base, /classifyAiProviderError/);
  assert.match(base, /toUserProviderErrorMessage/);
  assert.match(errors, /classifyAiProviderError/);
  assert.match(errors, /toUserProviderErrorMessage/);
  assert.match(classifier, /insufficient balance/);
  assert.match(classifier, /中转站余额或额度不足/);
  assert.match(classifier, /API Key 无效或已过期/);
  assert.doesNotMatch(base, /\$\{fallbackMessage\}: \$\{detail\.slice/);
});

test('provider registry exposes concrete model capabilities and long context labels', () => {
  const registry = fs.readFileSync(registryPath, 'utf8');
  assert.match(registry, /deepseek-v4-flash/);
  assert.match(registry, /deepseek-v4-pro/);
  assert.match(registry, /contextWindowTokens/);
  assert.match(registry, /supportsThinking/);
  assert.match(registry, /detectProviderType/);
});
