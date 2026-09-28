const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('all chat adapters expose bounded output and JSON response controls', () => {
  const base = read('src/ai/providers/base.ts');
  const openAi = read('src/ai/providers/openAiCompatibleProvider.ts');
  const claude = read('src/ai/providers/claudeProvider.ts');
  const gemini = read('src/ai/providers/geminiProvider.ts');
  const maintenance = read('src/ai/aiMemoryMaintenanceModelService.ts');

  assert.match(base, /maxOutputTokens\?: number/);
  assert.match(base, /responseFormat\?: 'text' \| 'json_object'/);
  assert.match(base, /responseJsonSchema\?: Record<string, unknown>/);
  assert.match(openAi, /body\.max_tokens = input\.maxOutputTokens/);
  assert.match(openAi, /body\.response_format = \{ type: 'json_object' \}/);
  assert.match(claude, /max_tokens: input\.maxOutputTokens \?\? 2048/);
  assert.match(claude, /output_config:[\s\S]*type: 'json_schema'[\s\S]*responseJsonSchema/);
  assert.match(gemini, /generationConfig\.maxOutputTokens = input\.maxOutputTokens/);
  assert.match(gemini, /generationConfig\.responseMimeType = 'application\/json'/);
  assert.match(gemini, /generationConfig\.responseSchema = input\.responseJsonSchema/);
  assert.match(maintenance, /maxOutputTokens: input\.maxOutputTokens/);
  assert.match(maintenance, /responseJsonSchema: input\.responseJsonSchema/);
  assert.match(maintenance, /thinkingDisabled: input\.thinkingDisabled/);
  assert.match(maintenance, /providerProtocol: resolved\.provider\.protocol/);
  assert.match(maintenance, /mergeRawUsage/);
  assert.match(read('src/ai/dream/dreamWorker.ts'), /normalizeProviderUsage[\s\S]*recordUsage/);
  assert.match(read('src/ai/thought/thoughtWorker.ts'), /normalizeProviderUsage[\s\S]*recordUsage/);
});
