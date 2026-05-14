const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const constantsPath = path.join(root, 'src/ai/aiConstants.ts');
const servicePath = path.join(root, 'src/ai/secureAiSettingsService.ts');
const registryPath = path.join(root, 'src/ai/providerRegistry.ts');

test('AI constants define required built-in providers without storing keys in SQLite', () => {
  const constants = fs.readFileSync(constantsPath, 'utf8');
  for (const provider of ['deepseek', 'openai', 'gemini', 'claude', 'openai_compatible']) {
    assert.match(constants, new RegExp(provider));
  }
  assert.match(constants, /secureStoreKeyForProvider/);
});

test('secure AI settings service uses expo-secure-store for API keys', () => {
  const service = fs.readFileSync(servicePath, 'utf8');
  assert.match(service, /expo-secure-store/);
  assert.match(service, /setProviderApiKey/);
  assert.match(service, /getProviderApiKey/);
  assert.match(service, /deleteProviderApiKey/);
});

test('provider registry exposes concrete model capabilities and long context labels', () => {
  const registry = fs.readFileSync(registryPath, 'utf8');
  assert.match(registry, /deepseek-v4-flash/);
  assert.match(registry, /deepseek-v4-pro/);
  assert.match(registry, /contextWindowTokens/);
  assert.match(registry, /supportsThinking/);
  assert.match(registry, /detectProviderType/);
});
