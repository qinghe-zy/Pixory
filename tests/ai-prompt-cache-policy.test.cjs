const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('prompt cache helper defines stable layers, hashes, purity lint, chat modes, and provider policy', () => {
  const source = read('src/ai/aiPromptCache.ts');

  for (const layer of [
    'stable_app_policy',
    'stable_role',
    'stable_material_rules',
    'stable_tool_definitions',
    'memory_snapshot',
    'history_window',
    'dynamic_memory',
    'retrieval_context',
    'current_user_message',
  ]) {
    assert.match(source, new RegExp(layer));
  }

  assert.match(source, /export type AiChatMode = 'companion' \| 'roleplay' \| 'knowledge' \| 'personal'/);
  assert.match(source, /normalizePromptCacheText/);
  assert.match(source, /\.normalize\('NFKC'\)/);
  assert.match(source, /hashPromptCacheText/);
  assert.match(source, /sha256/);
  assert.match(source, /bytesToHex/);
  assert.match(source, /stableCoreHash/);
  assert.match(source, /stablePrefixHash/);
  assert.match(source, /lintStablePromptBlocks/);
  assert.match(source, /ISO_DATE_PATTERN/);
  assert.match(source, /UUID_PATTERN/);
  assert.match(source, /REQUEST_ID_PATTERN/);
  assert.match(source, /providerTtlMs/);
  assert.match(source, /anthropicBreakpointThresholds/);
  assert.match(source, /shouldEnableAnthropicBreakpoint/);
  assert.match(source, /coreEstimatedTokens >= threshold/);
  assert.match(source, /prefixEstimatedTokens >= threshold/);
});

test('provider usage normalizer uses totalPromptTokens denominator for cached ratio', () => {
  const source = read('src/ai/aiProviderUsage.ts');

  assert.match(source, /normalizeProviderUsage/);
  assert.match(source, /totalPromptTokens/);
  assert.match(source, /cache_creation_input_tokens/);
  assert.match(source, /cache_read_input_tokens/);
  assert.match(source, /input_tokens \+ cacheCreationInputTokens \+ cacheReadInputTokens/);
  assert.match(source, /cachedTokenRatio: totalPromptTokens > 0 \? cachedInputTokens \/ totalPromptTokens : null/);
  assert.doesNotMatch(source, /cachedInputTokens \/ promptTokens/);
});

test('prompt builder returns stable-to-dynamic prompt layers and keeps dynamic content out of stable prefix', () => {
  const promptBuilder = read('src/ai/promptBuilder.ts');

  assert.match(promptBuilder, /promptLayers/);
  assert.match(promptBuilder, /stable_app_policy/);
  assert.match(promptBuilder, /stable_role/);
  assert.match(promptBuilder, /stable_material_rules/);
  assert.match(promptBuilder, /stable_tool_definitions/);
  assert.match(promptBuilder, /memory_snapshot/);
  assert.match(promptBuilder, /history_window/);
  assert.match(promptBuilder, /dynamic_memory/);
  assert.match(promptBuilder, /retrieval_context/);
  assert.match(promptBuilder, /current_user_message/);
  assert.match(promptBuilder, /buildPromptCacheMetadata/);

  const normalBody = /export function buildNormalChatPrompt[\s\S]*?\r?\n}\r?\n\r?\nexport function buildMaterialBoundPrompt/.exec(promptBuilder)?.[0] ?? '';
  const stablePrefixRegion = /const stableBlocks[\s\S]*?const dynamicBlocks/.exec(normalBody)?.[0] ?? '';
  assert.doesNotMatch(stablePrefixRegion, /input\.dynamicMemoryContext/);
  assert.doesNotMatch(stablePrefixRegion, /input\.materialSnippets/);
  assert.doesNotMatch(stablePrefixRegion, /input\.userMessage/);
});

test('chat service passes cache metadata, freezes observation per request, and preserves normal fallback', () => {
  const chat = read('src/ai/aiChatService.ts');
  const settings = read('src/database/repositories/settingsRepository.ts');

  assert.match(chat, /resolvePromptCacheSettings/);
  assert.match(chat, /deriveAiChatMode/);
  assert.match(chat, /buildProviderCachePolicy/);
  assert.match(chat, /cacheObservationBase/);
  assert.match(chat, /providerUsageRaw/);
  assert.match(chat, /mergeProviderUsage/);
  assert.match(chat, /normalizeProviderUsage/);
  assert.match(chat, /totalPromptTokens/);
  assert.match(chat, /cachedTokenRatio/);
  assert.match(chat, /providerCachePolicy/);
  assert.match(chat, /function buildPromptSnapshotJson[\s\S]*JSON\.stringify\(\{[\s\S]*cacheObservation/);
  assert.match(chat, /const promptSnapshotJson = createPromptSnapshotJson\(\)/);

  assert.match(settings, /AI_PROVIDER_PROMPT_CACHE_ENABLED_KEY/);
  assert.match(settings, /AI_PROVIDER_PROMPT_CACHE_DISABLED_PROVIDER_IDS_KEY/);
  assert.match(settings, /getAiPromptCacheSettings/);
  assert.match(settings, /updateAiPromptCacheSettings/);
});

test('cache observation is persisted for completed, failed, and stopped assistant messages', () => {
  const chat = read('src/ai/aiChatService.ts');

  assert.match(chat, /buildPromptSnapshotJson/);
  assert.match(chat, /failureReason/);
  assert.match(chat, /stopReason/);
  assert.match(chat, /markAssistantFailed\([^)]*promptSnapshotJson/s);
  assert.match(chat, /markAssistantStopped\([^)]*promptSnapshotJson/s);
  assert.match(chat, /stopForAbort\(\s*\{ promptSnapshotJson: createPromptSnapshotJson\(\{ stopReason: 'aborted' \}\)/);
  assert.match(chat, /promptSnapshotJson,\s*$/m);
});

test('material-bound prompt keeps retrieved material context before dynamic memory', () => {
  const promptBuilder = read('src/ai/promptBuilder.ts');
  const materialBody = /export function buildMaterialBoundPrompt[\s\S]*?\r?\n}\r?\n/.exec(promptBuilder)?.[0] ?? '';
  const dynamicRegion = /const dynamicBlocks = \[[\s\S]*?\];/.exec(materialBody)?.[0] ?? '';

  assert.match(dynamicRegion, /block\('retrieval_context'[\s\S]*block\('dynamic_memory'/);
});

test('provider adapters keep cache metadata optional and provider-specific', () => {
  const base = read('src/ai/providers/base.ts');
  const openai = read('src/ai/providers/openAiCompatibleProvider.ts');
  const claude = read('src/ai/providers/claudeProvider.ts');
  const gemini = read('src/ai/providers/geminiProvider.ts');

  assert.match(base, /providerCachePolicy\?: AiProviderCachePolicy/);
  assert.match(base, /provider_usage/);
  assert.match(base, /rawUsage/);

  assert.match(openai, /prompt_cache_key/);
  assert.match(openai, /stream_options/);
  assert.match(openai, /include_usage: true/);
  assert.match(openai, /openAiIncludeUsage/);
  assert.match(openai, /input\.providerCachePolicy\?\.openAiIncludeUsage/);
  assert.match(openai, /input\.providerCachePolicy\?\.openAiPromptCacheKey/);
  assert.doesNotMatch(openai, /stream_options: \{ include_usage: true \},[\s\S]*messages/);

  assert.match(claude, /cache_control/);
  assert.match(claude, /ephemeral/);
  assert.match(claude, /input\.providerCachePolicy\?\.anthropicSystemBlocks/);
  assert.match(claude, /flushClaudeBuffer/);
  const breakpointMatches = claude.match(/cache_control/g) ?? [];
  assert.ok(breakpointMatches.length <= 4, 'Anthropic adapter should stay below the provider breakpoint limit');

  assert.match(gemini, /usageMetadata/);
  assert.match(gemini, /systemInstruction/);
  assert.doesNotMatch(gemini, /cachedContents\/create/);
});

test('provider usage field mappings stay observable across adapters and normalizer', () => {
  const usage = read('src/ai/aiProviderUsage.ts');

  assert.match(usage, /prompt_tokens_details/);
  assert.match(usage, /cached_tokens/);
  assert.match(usage, /cache_creation_input_tokens/);
  assert.match(usage, /cache_read_input_tokens/);
  assert.match(usage, /cachedContentTokenCount/);
});

test('prompt cache settings filter configurable TTLs to supported provider protocols', () => {
  const settings = read('src/database/repositories/settingsRepository.ts');
  const promptCache = read('src/ai/aiPromptCache.ts');

  assert.match(settings, /SUPPORTED_PROMPT_CACHE_PROVIDER_PROTOCOLS/);
  assert.match(settings, /SUPPORTED_PROMPT_CACHE_PROVIDER_PROTOCOLS\.includes/);
  assert.match(settings, /sanitizeProviderTtlMs/);
  assert.match(promptCache, /openAiUsageObservationEnabled/);
  assert.match(promptCache, /provider\.openAiUsageObservationEnabled/);
  assert.match(promptCache, /if \(!input\.provider\.openAiUsageObservationEnabled\) \{\s*return \{ requested: false, strategy: 'none', ttlMs \};\s*\}/);
});
