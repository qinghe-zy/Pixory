const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('prompt cache hashing normalizes Unicode, whitespace, and structured block identity', () => {
  const source = read('src/ai/aiPromptCache.ts');

  assert.match(source, /normalize\('NFKC'\)/);
  assert.match(source, /replace\(\/\\r\\n\/g, '\\n'\)/);
  assert.match(source, /replace\(\/\[ \\t\]\+\$\/g, ''\)/);
  assert.match(source, /JSON\.stringify\(normalized\)/);
  assert.match(source, /name: block\.name/);
  assert.match(source, /version: block\.version/);
});

test('anthropic policy gates each breakpoint by cumulative token count', () => {
  const source = read('src/ai/aiPromptCache.ts');

  assert.match(source, /shouldEnableAnthropicBreakpoint/);
  assert.match(source, /breakpoint: 'core'/);
  assert.match(source, /breakpoint: 'prefix'/);
  assert.match(source, /coreEstimatedTokens >= threshold/);
  assert.match(source, /prefixEstimatedTokens >= threshold/);
  assert.match(source, /&& !ttlLikelyExpired\(input\)/);
  assert.match(source, /hasEnabledBreakpoint/);
  assert.match(source, /return \{ requested: false, strategy: 'none', ttlMs \}/);
});

test('cache observation keeps final-answer caching out of scope', () => {
  const chat = read('src/ai/aiChatService.ts');
  const promptCache = read('src/ai/aiPromptCache.ts');

  assert.doesNotMatch(chat, /semanticCache/i);
  assert.doesNotMatch(chat, /answerCache/i);
  assert.doesNotMatch(promptCache, /semanticCache/i);
  assert.doesNotMatch(promptCache, /answerCache/i);
});
