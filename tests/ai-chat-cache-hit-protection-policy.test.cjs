const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('generation metrics do not enter prompt construction or prompt cache keys', () => {
  const promptBuilder = read('src/ai/promptBuilder.ts');
  const promptCache = read('src/ai/aiPromptCache.ts');

  assert.doesNotMatch(promptBuilder, /generationMetrics/);
  assert.doesNotMatch(promptBuilder, /sendPressedAt|providerRequestSentAt|firstProviderDeltaAt/);
  assert.doesNotMatch(promptCache, /generationMetrics/);
  assert.doesNotMatch(promptCache, /sendPressedAt|providerRequestSentAt|firstProviderDeltaAt/);
});

test('chat service keeps diagnostics outside provider prompt and cache policy inputs', () => {
  const chat = read('src/ai/aiChatService.ts');

  assert.match(chat, /systemPrompt: prompt\.system/);
  assert.match(chat, /userPrompt,/);
  assert.match(chat, /userPrompt = prompt\.user/);
  assert.match(chat, /metadata: prompt\.cacheMetadata/);
  assert.match(chat, /stableSystemBlocks: prompt\.stableSystemBlocks/);
  assert.match(chat, /generationMetrics:\s*input\.generationMetrics/);
  assert.doesNotMatch(chat, /systemPrompt:\s*.*generationMetrics/);
  assert.doesNotMatch(chat, /userPrompt:\s*.*generationMetrics/);
  assert.doesNotMatch(chat, /metadata:\s*.*generationMetrics/);
  assert.doesNotMatch(chat, /stableSystemBlocks:\s*.*generationMetrics/);
});
