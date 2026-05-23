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
  assert.match(providerService, /getSavedProviderApiKey/);
  assert.match(providerSettings, /getSavedProviderApiKey\(selectedProviderId\)/);
  assert.match(providerSettings, /setApiDraft\(apiKey\)/);
});

test('provider settings expose test sync and embedding model controls', () => {
  const providerSettings = fs.readFileSync(providerSettingsPath, 'utf8');
  const providerService = fs.readFileSync(providerServicePath, 'utf8');
  const chatService = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  assert.match(providerSettings, /testProvider/);
  assert.match(providerSettings, /syncProviderModels/);
  assert.match(providerSettings, /saveProviderDraft/);
  assert.match(providerSettings, /保存并测试/);
  assert.match(providerSettings, /await saveProviderDraft\(\)/);
  assert.match(providerSettings, /测试连接/);
  assert.match(providerSettings, /同步模型/);
  assert.match(providerSettings, /embeddingModels/);
  assert.match(providerSettings, /默认 Embedding/);
  assert.match(providerSettings, /Embedding 接口/);
  assert.match(providerSettings, /embeddingBaseUrlDraft/);
  assert.match(providerSettings, /saveProviderEmbeddingBaseUrl/);
  assert.match(providerSettings, /saveManualEmbeddingModel/);
  assert.match(providerSettings, /自定义 Embedding 模型/);
  assert.match(providerSettings, /defaultEmbeddingModelId/);
  assert.match(providerSettings, /advancedVisible/);
  assert.match(providerService, /getDefaultChatProviderId/);
  assert.match(providerService, /saveProviderDefaultModels/);
  assert.match(providerService, /saveProviderEmbeddingBaseUrl/);
  assert.match(providerService, /saveManualEmbeddingModel/);
  assert.match(chatService, /getDefaultAiProviderId/);
});

test('OpenAI-compatible built-in providers can manually configure embedding endpoints without marking DeepSeek official embedding support', () => {
  const constants = fs.readFileSync(constantsPath, 'utf8');
  const providerSettings = fs.readFileSync(providerSettingsPath, 'utf8');
  const deepSeekBlock = /providerType: 'deepseek'[\s\S]*?visionEnabled: false,\n  \}/.exec(constants)?.[0] ?? '';

  assert.match(deepSeekBlock, /embeddingEnabled:\s*false/);
  assert.match(providerSettings, /selectedSupportsManualEmbedding/);
  assert.match(providerSettings, /selectedCard\?\.provider\.protocol === 'openai_compatible'/);
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
  assert.match(gemini, /:streamGenerateContent/);
  assert.match(gemini, /await emitCompletedGeminiChunks\(buffer, onEvent\)/);
  assert.match(gemini, /buffer \+= decoder\.decode\(value, \{ stream: true \}\);[\s\S]{0,120}buffer = await emitCompletedGeminiChunks\(buffer, onEvent\)/);
  assert.match(gemini, /embedContent/);
  assert.match(claude, /stream:\s*true/);
  assert.match(claude, /content_block_delta/);
});

test('provider API errors are normalized before reaching chat bubbles', () => {
  const base = fs.readFileSync(providerBasePath, 'utf8');
  assert.match(base, /friendlyProviderErrorMessage/);
  assert.match(base, /insufficient balance/);
  assert.match(base, /余额或额度不足/);
  assert.match(base, /API Key 无效或无权限/);
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
