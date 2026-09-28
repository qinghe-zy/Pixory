const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath) {
  const filename = path.join(root, relativePath);
  const originalExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (originalExtension) {
      require.extensions['.ts'] = originalExtension;
    } else {
      delete require.extensions['.ts'];
    }
  }
}

function loadProviderWithFetch(fetchImpl) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'expo/fetch') {
      return { fetch: fetchImpl };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return loadTypeScriptModule('src/ai/providers/openAiCompatibleProvider.ts').openAiCompatibleProvider;
  } finally {
    Module._load = originalLoad;
  }
}

function streamingResponse(chunks) {
  const encoder = new TextEncoder();
  const encodedChunks = chunks.map((chunk) => encoder.encode(chunk));
  let index = 0;
  return {
    body: {
      getReader() {
        return {
          async read() {
            if (index >= encodedChunks.length) {
              return { done: true };
            }
            return { done: false, value: encodedChunks[index++] };
          },
        };
      },
    },
    ok: true,
    status: 200,
  };
}

test('official DeepSeek model surface excludes retired aliases and maps their legacy modes', () => {
  const registry = fs.readFileSync(path.join(root, 'src/ai/providerRegistry.ts'), 'utf8');
  assert.doesNotMatch(registry, /build\('deepseek-chat'/);
  assert.doesNotMatch(registry, /build\('deepseek-reasoner'/);

  const policy = loadTypeScriptModule('src/ai/deepseekModelPolicy.ts');
  assert.equal(policy.isOfficialDeepSeekEndpoint('https://api.deepseek.com'), true);
  assert.equal(policy.isAllowedOfficialDeepSeekModel('deepseek-v4-flash'), true);
  assert.equal(policy.isAllowedOfficialDeepSeekModel('deepseek-v4-pro'), true);
  assert.equal(policy.isAllowedOfficialDeepSeekModel('deepseek-v3'), false);
  assert.equal(policy.isAllowedOfficialDeepSeekModel('deepseek-chat'), false);
  assert.deepEqual(policy.migrateDeprecatedDeepSeekModel('deepseek-chat', 'https://api.deepseek.com'), {
    modelId: 'deepseek-v4-flash',
    thinkingDisabled: true,
  });
  assert.deepEqual(policy.migrateDeprecatedDeepSeekModel('deepseek-reasoner', 'https://api.deepseek.com'), {
    modelId: 'deepseek-v4-flash',
    thinkingDisabled: false,
  });
  assert.equal(policy.migrateDeprecatedDeepSeekModel('deepseek-chat', 'https://relay.example.com'), null);
});

test('DeepSeek model migration preserves the mode of the model actually selected', () => {
  const service = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const maintenance = fs.readFileSync(path.join(root, 'src/ai/aiMemoryMaintenanceModelService.ts'), 'utf8');
  const providerService = fs.readFileSync(path.join(root, 'src/ai/aiProviderService.ts'), 'utf8');

  assert.match(
    service,
    /const selectedMigration = explicitModel \? explicitMigration : defaultModel \? defaultMigration : null;/,
  );
  assert.match(service, /thinkingDisabledOverride: selectedMigration\?\.thinkingDisabled/);
  assert.match(
    service,
    /thinkingDisabled: input\.thinkingDisabled \?\? thinkingDisabledOverride \?\? false/,
  );
  assert.match(
    service,
    /if \(legacyThinkingDisabled && !input\.thread\.thinkingDisabled\) \{[\s\S]*?thinkingExpected: false/,
  );
  assert.match(maintenance, /migrateDeprecatedDeepSeekModel\(configuredModelId, effectiveBaseUrl\)/);
  assert.match(
    maintenance,
    /migrateDeprecatedDeepSeekModel\(\s*settings\.memoryMaintenanceModelId,\s*provider\?\.baseUrl/,
  );
  assert.match(maintenance, /thread\?\.sessionBaseUrl \?\? provider\.baseUrl/);
  assert.match(maintenance, /getThreadProviderApiKey\(space, thread\.id, provider\.id\)/);
  assert.match(providerService, /effectiveProviderChatModelId\(provider, provider\.defaultChatModelId\)/);
  assert.match(providerService, /isAllowedOfficialDeepSeekModel/);
});

test('DeepSeek native cache policy is provider-specific and does not use OpenAI prompt cache keys', () => {
  const promptCache = fs.readFileSync(path.join(root, 'src/ai/aiPromptCache.ts'), 'utf8');
  assert.match(promptCache, /deepseek_native/);
  assert.match(promptCache, /isOfficialDeepSeekV4Model/);
  assert.match(promptCache, /prompt_cache_key/);
  assert.match(promptCache, /openAiPromptCacheKey/);

  const { buildProviderCachePolicy } = loadTypeScriptModule('src/ai/aiPromptCache.ts');
  const policy = buildProviderCachePolicy({
    modelId: 'deepseek-v4-pro',
    provider: {
      id: 'deepseek',
      providerType: 'deepseek',
      protocol: 'openai_compatible',
      baseUrl: 'https://api.deepseek.com',
      openAiUsageObservationEnabled: false,
    },
    settings: { enabled: true, disabledProviderIds: [] },
    metadata: { stablePrefixEstimatedTokens: 20 },
    stableSystemBlocks: [],
    requestedAt: '2026-07-29T00:00:00.000Z',
  });
  assert.deepEqual(policy, {
    openAiIncludeUsage: true,
    requested: true,
    strategy: 'deepseek_native',
    ttlMs: 10 * 60 * 1000,
  });

  const disabledCachePolicy = buildProviderCachePolicy({
    modelId: 'deepseek-v4-pro',
    provider: {
      id: 'deepseek',
      providerType: 'deepseek',
      protocol: 'openai_compatible',
      baseUrl: 'https://api.deepseek.com',
      openAiUsageObservationEnabled: false,
    },
    settings: { enabled: false, disabledProviderIds: [] },
    metadata: { stablePrefixEstimatedTokens: 20 },
    stableSystemBlocks: [],
    requestedAt: '2026-07-29T00:00:00.000Z',
  });
  assert.deepEqual(disabledCachePolicy, {
    openAiIncludeUsage: true,
    requested: false,
    strategy: 'deepseek_native',
    ttlMs: 10 * 60 * 1000,
  });

  const relayPolicy = buildProviderCachePolicy({
    modelId: 'deepseek-v4-pro',
    provider: {
      id: 'relay',
      providerType: 'deepseek',
      protocol: 'openai_compatible',
      baseUrl: 'https://relay.example.com/v1',
      openAiUsageObservationEnabled: false,
    },
    settings: { enabled: true, disabledProviderIds: [] },
    metadata: { stablePrefixEstimatedTokens: 20 },
    stableSystemBlocks: [],
    requestedAt: '2026-07-29T00:00:00.000Z',
  });
  assert.deepEqual(relayPolicy, {
    requested: false,
    strategy: 'none',
    ttlMs: 10 * 60 * 1000,
  });
});

test('DeepSeek native cache request observes streamed usage without sending an OpenAI cache key', async () => {
  let body = null;
  const provider = loadProviderWithFetch(async (_url, init) => {
    body = JSON.parse(init.body);
    return streamingResponse([
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  });

  await provider.streamChat(
    {
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com',
      history: [],
      modelId: 'deepseek-v4-pro',
      providerCachePolicy: {
        openAiIncludeUsage: true,
        requested: true,
        strategy: 'deepseek_native',
        ttlMs: 10 * 60 * 1000,
      },
      systemPrompt: 'stable system',
      userPrompt: 'hello',
    },
    () => undefined,
  );

  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.equal(Object.hasOwn(body, 'prompt_cache_key'), false);
});

test('DeepSeek usage normalizer reads native hit and miss token fields', () => {
  const usage = loadTypeScriptModule('src/ai/aiProviderUsage.ts');
  const normalized = usage.normalizeProviderUsage(
    'openai_compatible',
    {
      prompt_tokens: 1000,
      prompt_cache_hit_tokens: 800,
      prompt_cache_miss_tokens: 200,
      completion_tokens: 300,
      total_tokens: 1300,
    },
    'deepseek',
    'https://api.deepseek.com',
  );

  assert.equal(normalized.totalPromptTokens, 1000);
  assert.equal(normalized.cachedInputTokens, 800);
  assert.equal(normalized.cacheReadInputTokens, 800);
  assert.equal(normalized.cacheMissInputTokens, 200);
  assert.equal(normalized.cacheFieldsObserved, true);
  assert.equal(normalized.cachedTokenRatio, 0.8);
});

test('partial DeepSeek cache fields remain unobserved instead of becoming a false zero', () => {
  const usage = loadTypeScriptModule('src/ai/aiProviderUsage.ts');
  const missingHit = usage.normalizeProviderUsage(
    'openai_compatible',
    {
      prompt_tokens: 100,
      prompt_cache_miss_tokens: 100,
      completion_tokens: 20,
    },
    'deepseek',
    'https://api.deepseek.com',
  );
  assert.equal(missingHit.cachedInputTokens, null);
  assert.equal(missingHit.cacheMissInputTokens, 100);
  assert.equal(missingHit.cacheFieldsObserved, false);
  assert.equal(missingHit.cachedTokenRatio, null);

  const missingMiss = usage.normalizeProviderUsage(
    'openai_compatible',
    {
      prompt_tokens: 100,
      prompt_cache_hit_tokens: 0,
      completion_tokens: 20,
    },
    'deepseek',
    'https://api.deepseek.com',
  );
  assert.equal(missingMiss.cachedInputTokens, 0);
  assert.equal(missingMiss.cacheMissInputTokens, null);
  assert.equal(missingMiss.cacheFieldsObserved, false);
  assert.equal(missingMiss.cachedTokenRatio, null);
});

test('custom DeepSeek-compatible relays keep generic OpenAI usage behavior', () => {
  const usage = loadTypeScriptModule('src/ai/aiProviderUsage.ts');
  const normalized = usage.normalizeProviderUsage(
    'openai_compatible',
    {
      prompt_tokens: 1000,
      prompt_tokens_details: { cached_tokens: 300 },
      completion_tokens: 100,
    },
    'deepseek',
    'https://relay.example.com/v1',
  );

  assert.equal(normalized.cachedInputTokens, 300);
  assert.equal(normalized.cacheMissInputTokens, 700);
  assert.equal(normalized.cacheFieldsObserved, true);
  assert.equal(normalized.cachedTokenRatio, 0.3);
});

test('generic OpenAI-compatible usage keeps legacy zero-cache accounting', () => {
  const usage = loadTypeScriptModule('src/ai/aiProviderUsage.ts');
  const normalized = usage.normalizeProviderUsage(
    'openai_compatible',
    {
      prompt_tokens: 1000,
      completion_tokens: 100,
    },
    'openai',
    'https://api.openai.com/v1',
  );

  assert.equal(normalized.cachedInputTokens, 0);
  assert.equal(normalized.cacheFieldsObserved, true);
  assert.equal(normalized.cachedTokenRatio, 0);
});

test('usage overview distinguishes a real zero cache hit from an unobserved cache field', () => {
  const analytics = loadTypeScriptModule('src/ai/aiUsageAnalytics.ts');
  const observation = (id, providerCache) => ({
    completedAt: '2026-07-29T00:00:01.000Z',
    createdAt: '2026-07-29T00:00:00.000Z',
    id,
    modelId: 'deepseek-v4-flash',
    promptSnapshotJson: JSON.stringify({ cacheObservation: { providerCache } }),
    providerId: 'deepseek',
    threadId: 'thread',
  });

  const observedZero = analytics.aggregateAiUsageObservations({
    observations: [
      observation('observed', {
        cacheFieldsObserved: true,
        cachedInputTokens: 0,
        completionTokens: 20,
        totalPromptTokens: 100,
      }),
    ],
  });
  assert.equal(observedZero.cacheObservedRequestCount, 1);
  assert.equal(observedZero.cacheUnobservedPromptTokens, 0);
  assert.equal(observedZero.nonCachedInputTokens, 100);
  assert.equal(observedZero.cachedTokenRatio, 0);
  assert.equal(observedZero.recentRounds[0].cachedTokenRatio, 0);

  const unobserved = analytics.aggregateAiUsageObservations({
    observations: [
      observation('unobserved', {
        cacheFieldsObserved: false,
        cachedInputTokens: null,
        completionTokens: 20,
        totalPromptTokens: 100,
      }),
    ],
  });
  assert.equal(unobserved.cacheObservedRequestCount, 0);
  assert.equal(unobserved.cacheUnobservedPromptTokens, 100);
  assert.equal(unobserved.nonCachedInputTokens, 0);
  assert.equal(unobserved.cachedTokenRatio, null);
  assert.equal(unobserved.recentRounds[0].cachedTokenRatio, null);

  const summary = fs.readFileSync(path.join(root, 'src/components/ai/AiUsageSummary.tsx'), 'utf8');
  assert.match(summary, /cacheUnobservedPromptTokens/);
  assert.match(summary, /未观测输入/);
});
