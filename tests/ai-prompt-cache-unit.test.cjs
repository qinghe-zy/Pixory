const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadPromptCache() {
  const filename = path.join(root, 'src/ai/aiPromptCache.ts');
  const originalExtension = require.extensions['.ts'];
  require.extensions['.ts'] = (module, sourcePath) => module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText, sourcePath);
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (originalExtension) require.extensions['.ts'] = originalExtension;
    else delete require.extensions['.ts'];
  }
}

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

test('memory content changes isolate cache identity while volatile epoch and generation params do not churn it', () => {
  const { buildPromptCacheMetadata, buildProviderCachePolicy } = loadPromptCache();
  const blocks = (memory) => [
    { name: 'stable_role', text: 'You are a companion.', stable: true, version: 1 },
    { name: 'memory_snapshot', text: memory, stable: true, version: 1 },
    { name: 'summary_archive', text: 'Earlier conversation', stable: true, version: 1 },
    { name: 'current_user_message', text: 'Hello', stable: false, version: 1 },
  ];
  const metadata = (memory, memoryEpoch) => buildPromptCacheMetadata({
    blocks: blocks(memory), chatMode: 'companion', memoryEpoch, retrievalText: '',
  });
  const provider = { id: 'openai', providerType: 'openai', protocol: 'openai_compatible', openAiUsageObservationEnabled: true };
  const settings = { enabled: true, disabledProviderIds: [] };
  const policy = (value) => buildProviderCachePolicy({
    modelId: 'gpt-test', provider, settings, metadata: value, stableSystemBlocks: blocks('memory A'),
    branchRouteHash: 'route', generationParamsHash: 'volatile-params', scopeKey: 'space:normal:thread:t1',
    requestedAt: '2026-10-20T00:00:00.000Z', requestEstimatedTokens: 2000,
  });

  const first = policy(metadata('memory A', 'epoch-1'));
  const sameMemory = policy(metadata('memory A', 'epoch-2'));
  const changedMemory = policy(metadata('memory B', 'epoch-2'));
  assert.equal(first.strategy, 'openai_prompt_cache_key');
  assert.equal(first.openAiPromptCacheKey, sameMemory.openAiPromptCacheKey);
  assert.notEqual(first.openAiPromptCacheKey, changedMemory.openAiPromptCacheKey);
});

test('cache observation keeps final-answer caching out of scope', () => {
  const chat = read('src/ai/aiChatService.ts');
  const promptCache = read('src/ai/aiPromptCache.ts');

  assert.doesNotMatch(chat, /semanticCache/i);
  assert.doesNotMatch(chat, /answerCache/i);
  assert.doesNotMatch(promptCache, /semanticCache/i);
  assert.doesNotMatch(promptCache, /answerCache/i);
});
