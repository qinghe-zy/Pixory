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
