# AI Chat Prompt Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local prompt-cache readiness for Pixory AI chat by making prompt prefixes deterministic, observable, and provider-cache-friendly without adding a server or caching private final answers.

**Architecture:** Keep the existing direct-to-provider mobile architecture. Add focused prompt-cache helper modules, attach prompt layer metadata at the existing prompt build boundary, record normalized cache observations in `promptSnapshotJson`, and pass provider cache hints only through adapter-level optional metadata with local kill switches.

**Tech Stack:** Expo React Native, TypeScript, Expo SQLite app settings, existing Pixory AI chat provider adapters, Node policy tests, `pnpm typecheck`.

---

## File Map

- Create: `src/ai/aiPromptCache.ts` for prompt block types, normalization, deterministic hashes, token estimates, purity linting, chat mode derivation, TTL defaults, and provider cache policy decisions.
- Create: `src/ai/aiProviderUsage.ts` for provider usage normalization and `cachedTokenRatio` calculation with Anthropic's total-token denominator fix.
- Create: `tests/ai-prompt-cache-policy.test.cjs` for policy coverage across layering, hashes, provider usage normalization, kill switches, and adapter payloads.
- Modify: `src/ai/promptBuilder.ts` to return prompt layers and stable-prefix metadata while preserving `system`, `user`, and `materialRules`.
- Modify: `src/ai/aiChatService.ts` to build cache metadata, freeze it per request, pass optional provider cache policy to adapters, and persist observations in `promptSnapshotJson`.
- Modify: `src/ai/providers/base.ts` to add optional cache metadata and provider usage stream events.
- Modify: `src/ai/providers/openAiCompatibleProvider.ts` to optionally send `prompt_cache_key`, request streaming usage when cache observation is enabled, parse cached-token usage, and silently omit unsupported cache keys.
- Modify: `src/ai/providers/claudeProvider.ts` to represent `system` as cacheable text blocks when explicit Anthropic caching is enabled and breakpoint thresholds pass.
- Modify: `src/ai/providers/geminiProvider.ts` to keep implicit-cache-friendly ordering and parse usage metadata when available.
- Modify: `src/database/repositories/settingsRepository.ts` to expose local prompt-cache kill switches through existing `app_settings`, without a schema migration.

---

## Implementation Notes

- Do not add Redis, vector cache, server gateway, account system, cloud sync, or semantic answer cache.
- Do not store full stable prefix text in analytics-like observation fields. `promptSnapshotJson.system` already exists for debug snapshots; new cache observation fields must be hashes and numeric metadata.
- Add observation before enabling cost-affecting provider behavior. OpenAI-compatible `prompt_cache_key` is a routing hint; Anthropic `cache_control` can change cost and must be behind explicit policy checks.
- Keep adapter metadata optional. A provider that ignores cache metadata must still send a normal request.
- Use the existing conservative token estimator from `src/ai/aiContextBudget.ts`; do not introduce a tokenizer dependency in this phase.

---

### Task 1: Add Prompt Cache Policy Tests

**Files:**
- Create: `tests/ai-prompt-cache-policy.test.cjs`

- [ ] **Step 1: Write the failing policy test**

Create `tests/ai-prompt-cache-policy.test.cjs`:

```js
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
  assert.match(source, /createHash\('sha256'\)/);
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
  assert.match(chat, /normalizeProviderUsage/);
  assert.match(chat, /totalPromptTokens/);
  assert.match(chat, /cachedTokenRatio/);
  assert.match(chat, /providerCachePolicy/);
  assert.match(chat, /promptSnapshotJson: JSON\.stringify\(\{[\s\S]*cacheObservation/);

  assert.match(settings, /AI_PROVIDER_PROMPT_CACHE_ENABLED_KEY/);
  assert.match(settings, /AI_PROVIDER_PROMPT_CACHE_DISABLED_PROVIDER_IDS_KEY/);
  assert.match(settings, /getAiPromptCacheSettings/);
  assert.match(settings, /updateAiPromptCacheSettings/);
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
  assert.match(openai, /prompt_tokens_details/);
  assert.match(openai, /cached_tokens/);
  assert.match(openai, /input\.providerCachePolicy\?\.openAiPromptCacheKey/);

  assert.match(claude, /cache_control/);
  assert.match(claude, /ephemeral/);
  assert.match(claude, /input\.providerCachePolicy\?\.anthropicSystemBlocks/);
  const breakpointMatches = claude.match(/cache_control/g) ?? [];
  assert.ok(breakpointMatches.length <= 4, 'Anthropic adapter should stay below the provider breakpoint limit');

  assert.match(gemini, /usageMetadata/);
  assert.match(gemini, /cachedContentTokenCount/);
  assert.match(gemini, /systemInstruction/);
  assert.doesNotMatch(gemini, /cachedContents\/create/);
});
```

- [ ] **Step 2: Run the new policy test and verify RED**

Run:

```powershell
node --test tests/ai-prompt-cache-policy.test.cjs
```

Expected: FAIL because `src/ai/aiPromptCache.ts`, `src/ai/aiProviderUsage.ts`, and cache metadata plumbing do not exist yet.

- [ ] **Step 3: Commit only the failing test**

Run:

```powershell
git add tests/ai-prompt-cache-policy.test.cjs
git commit -m "test: cover AI prompt cache policy"
```

Expected: commit succeeds. `AGENTS.md` remains unstaged if it is still locally modified.

---

### Task 2: Add Prompt Cache Core Helpers

**Files:**
- Create: `src/ai/aiPromptCache.ts`
- Modify: `src/ai/promptBuilder.ts`

- [ ] **Step 1: Add prompt cache helper module**

Create `src/ai/aiPromptCache.ts`:

```ts
import { createHash } from 'node:crypto';

import type { AiProviderProtocol, AiProviderRecord, AiThreadRecord, PixorySpace } from '../database';
import { estimatePromptTokens } from './aiContextBudget';

export type AiChatMode = 'companion' | 'roleplay' | 'knowledge' | 'personal';

export type AiPromptLayerName =
  | 'stable_app_policy'
  | 'stable_role'
  | 'stable_material_rules'
  | 'stable_tool_definitions'
  | 'memory_snapshot'
  | 'history_window'
  | 'dynamic_memory'
  | 'retrieval_context'
  | 'current_user_message';

export interface AiPromptBlock {
  name: AiPromptLayerName;
  text: string;
  stable: boolean;
  version: number;
}

export interface AiPromptCacheMetadata {
  promptVersion: number;
  promptLayerVersions: {
    appPolicy: number;
    role: number;
    materialRules: number;
    toolDefinitions: number;
    memorySnapshot: number;
  };
  chatMode: AiChatMode;
  stableCoreHash: string;
  stablePrefixHash: string;
  stablePrefixEstimatedTokens: number;
  memoryEpoch: string;
  memorySnapshotHash: string;
  memorySnapshotEstimatedTokens: number;
  retrievalHash: string;
  purityWarnings: string[];
}

export interface AiPromptCacheSettings {
  enabled: boolean;
  disabledProviderIds: string[];
}

export interface AiProviderCachePolicy {
  requested: boolean;
  strategy: 'none' | 'openai_prompt_cache_key' | 'anthropic_ephemeral' | 'gemini_implicit';
  openAiPromptCacheKey?: string;
  anthropicSystemBlocks?: Array<{ text: string; cacheControl?: boolean }>;
  ttlMs: number;
}

export interface AiProviderCacheDecisionInput {
  modelId: string;
  provider: AiProviderRecord;
  settings: AiPromptCacheSettings;
  metadata: AiPromptCacheMetadata;
  stableSystemBlocks: Array<{ name: AiPromptLayerName; text: string }>;
  previousRequestAt?: string | null;
  requestedAt: string;
}

export const AI_PROMPT_VERSION = 1;
export const AI_PROMPT_LAYER_VERSIONS = {
  appPolicy: 1,
  role: 1,
  materialRules: 1,
  toolDefinitions: 1,
  memorySnapshot: 1,
} as const;

const OPENAI_CACHE_THRESHOLD_TOKENS = 1024;
const ANTHROPIC_DEFAULT_THRESHOLD_TOKENS = 1024;
const ANTHROPIC_SMALL_MODEL_THRESHOLD_TOKENS = 2048;
const GEMINI_IMPLICIT_THRESHOLD_TOKENS = 1024;

const PROVIDER_TTL_MS: Record<AiProviderProtocol, number> = {
  anthropic: 5 * 60 * 1000,
  gemini: 5 * 60 * 1000,
  openai_compatible: 10 * 60 * 1000,
};

const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const REQUEST_ID_PATTERN = /\b(?:request|req|trace|span|session|turn)[_-]?id\b/i;

export function normalizePromptCacheText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

export function hashPromptCacheText(value: string): string {
  return createHash('sha256').update(normalizePromptCacheText(value), 'utf8').digest('hex');
}

export function hashPromptBlocks(blocks: Array<Pick<AiPromptBlock, 'name' | 'text' | 'version'>>): string {
  const normalized = blocks.map((block) => ({
    name: block.name,
    text: normalizePromptCacheText(block.text),
    version: block.version,
  }));
  return hashPromptCacheText(JSON.stringify(normalized));
}

export function stablePromptBlocks(blocks: AiPromptBlock[]): AiPromptBlock[] {
  return blocks.filter((block) => block.stable && normalizePromptCacheText(block.text));
}

export function estimatePromptBlocksTokens(blocks: Array<Pick<AiPromptBlock, 'text'>>): number {
  return blocks.reduce((total, block) => total + estimatePromptTokens(block.text), 0);
}

export function lintStablePromptBlocks(blocks: AiPromptBlock[]): string[] {
  const warnings: string[] = [];
  for (const block of stablePromptBlocks(blocks)) {
    if (ISO_DATE_PATTERN.test(block.text)) {
      warnings.push(`${block.name}:contains_date_like_text`);
    }
    if (UUID_PATTERN.test(block.text)) {
      warnings.push(`${block.name}:contains_uuid_like_text`);
    }
    if (REQUEST_ID_PATTERN.test(block.text)) {
      warnings.push(`${block.name}:contains_request_id_like_text`);
    }
  }
  return warnings;
}

export function deriveAiChatMode(thread: Pick<AiThreadRecord, 'contextType' | 'roleCardId'>, space: PixorySpace): AiChatMode {
  if (space === 'personal') {
    return 'personal';
  }
  if (thread.contextType !== 'normal') {
    return 'knowledge';
  }
  if (thread.roleCardId) {
    return 'roleplay';
  }
  return 'companion';
}

export function providerTtlMs(provider: Pick<AiProviderRecord, 'protocol'>): number {
  return PROVIDER_TTL_MS[provider.protocol];
}

export function ttlLikelyExpired(input: {
  provider: Pick<AiProviderRecord, 'protocol'>;
  previousRequestAt?: string | null;
  requestedAt: string;
}): boolean {
  if (!input.previousRequestAt) {
    return false;
  }
  const previous = Date.parse(input.previousRequestAt);
  const requested = Date.parse(input.requestedAt);
  if (!Number.isFinite(previous) || !Number.isFinite(requested)) {
    return false;
  }
  return requested - previous > providerTtlMs(input.provider);
}

export function anthropicBreakpointThresholds(modelId: string): { core: number; prefix: number } {
  const lower = modelId.toLowerCase();
  const threshold = lower.includes('haiku') ? ANTHROPIC_SMALL_MODEL_THRESHOLD_TOKENS : ANTHROPIC_DEFAULT_THRESHOLD_TOKENS;
  return { core: threshold, prefix: threshold };
}

export function shouldEnableAnthropicBreakpoint(input: {
  breakpoint: 'core' | 'prefix';
  coreEstimatedTokens: number;
  prefixEstimatedTokens: number;
  modelId: string;
}): boolean {
  const threshold = anthropicBreakpointThresholds(input.modelId)[input.breakpoint];
  if (input.breakpoint === 'core') {
    return input.coreEstimatedTokens >= threshold;
  }
  return input.prefixEstimatedTokens >= threshold;
}

export function buildPromptCacheMetadata(input: {
  blocks: AiPromptBlock[];
  chatMode: AiChatMode;
  memoryEpoch: string;
  retrievalText: string;
}): AiPromptCacheMetadata {
  const stableBlocks = stablePromptBlocks(input.blocks);
  const coreBlocks = stableBlocks.filter((block) => block.name !== 'memory_snapshot');
  const memoryBlock = stableBlocks.find((block) => block.name === 'memory_snapshot');
  return {
    promptVersion: AI_PROMPT_VERSION,
    promptLayerVersions: { ...AI_PROMPT_LAYER_VERSIONS },
    chatMode: input.chatMode,
    stableCoreHash: hashPromptBlocks(coreBlocks),
    stablePrefixHash: hashPromptBlocks(stableBlocks),
    stablePrefixEstimatedTokens: estimatePromptBlocksTokens(stableBlocks),
    memoryEpoch: input.memoryEpoch,
    memorySnapshotHash: hashPromptCacheText(memoryBlock?.text ?? ''),
    memorySnapshotEstimatedTokens: memoryBlock ? estimatePromptTokens(memoryBlock.text) : 0,
    retrievalHash: hashPromptCacheText(input.retrievalText),
    purityWarnings: lintStablePromptBlocks(stableBlocks),
  };
}

export function buildProviderCachePolicy(input: AiProviderCacheDecisionInput): AiProviderCachePolicy {
  const ttlMs = providerTtlMs(input.provider);
  if (!input.settings.enabled || input.settings.disabledProviderIds.includes(input.provider.id)) {
    return { requested: false, strategy: 'none', ttlMs };
  }

  if (input.provider.protocol === 'openai_compatible') {
    if (input.metadata.stablePrefixEstimatedTokens < OPENAI_CACHE_THRESHOLD_TOKENS) {
      return { requested: false, strategy: 'none', ttlMs };
    }
    const openAiPromptCacheKey = [
      'pixory',
      input.provider.id,
      input.modelId,
      input.metadata.chatMode,
      input.metadata.stablePrefixHash,
      input.metadata.memoryEpoch,
    ].join(':');
    return { openAiPromptCacheKey, requested: true, strategy: 'openai_prompt_cache_key', ttlMs };
  }

  if (input.provider.protocol === 'anthropic') {
    const coreBlocks = input.stableSystemBlocks.filter((block) => block.name !== 'memory_snapshot');
    const snapshotBlock = input.stableSystemBlocks.find((block) => block.name === 'memory_snapshot');
    const coreText = coreBlocks.map((block) => block.text).filter(Boolean).join('\n\n');
    const snapshotText = snapshotBlock?.text ?? '';
    const coreEstimatedTokens = estimatePromptTokens(coreText);
    const prefixEstimatedTokens = estimatePromptTokens([coreText, snapshotText].filter(Boolean).join('\n\n'));
    const enableCore = shouldEnableAnthropicBreakpoint({
      breakpoint: 'core',
      coreEstimatedTokens,
      modelId: input.modelId,
      prefixEstimatedTokens,
    });
    const enablePrefix = shouldEnableAnthropicBreakpoint({
      breakpoint: 'prefix',
      coreEstimatedTokens,
      modelId: input.modelId,
      prefixEstimatedTokens,
    }) && !ttlLikelyExpired(input);
    const anthropicSystemBlocks = [
      coreText ? { cacheControl: enableCore, text: coreText } : null,
      snapshotText ? { cacheControl: enablePrefix, text: snapshotText } : null,
    ].filter((block): block is { text: string; cacheControl: boolean } => Boolean(block));
    return {
      anthropicSystemBlocks,
      requested: anthropicSystemBlocks.some((block) => block.cacheControl),
      strategy: anthropicSystemBlocks.some((block) => block.cacheControl) ? 'anthropic_ephemeral' : 'none',
      ttlMs,
    };
  }

  if (input.provider.protocol === 'gemini') {
    return input.metadata.stablePrefixEstimatedTokens >= GEMINI_IMPLICIT_THRESHOLD_TOKENS
      ? { requested: true, strategy: 'gemini_implicit', ttlMs }
      : { requested: false, strategy: 'none', ttlMs };
  }

  return { requested: false, strategy: 'none', ttlMs };
}
```

- [ ] **Step 2: If TypeScript rejects `node:crypto`, switch hash implementation**

Run:

```powershell
pnpm typecheck
```

Expected before integration: TypeScript may fail because the new helper is not yet imported anywhere or because React Native TypeScript cannot resolve `node:crypto`.

If the error is about `node:crypto`, replace the import and `hashPromptCacheText` implementation with `@noble/hashes`:

```ts
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

export function hashPromptCacheText(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(normalizePromptCacheText(value))));
}
```

Then update the policy test in `tests/ai-prompt-cache-policy.test.cjs` from:

```js
assert.match(source, /createHash\('sha256'\)/);
```

to:

```js
assert.match(source, /sha256/);
assert.match(source, /bytesToHex/);
```

- [ ] **Step 3: Extend `BuiltPrompt` with prompt layers**

Modify `src/ai/promptBuilder.ts` imports:

```ts
import {
  buildPromptCacheMetadata,
  type AiChatMode,
  type AiPromptBlock,
  type AiPromptCacheMetadata,
} from './aiPromptCache';
```

Change `BuiltPrompt`:

```ts
export interface BuiltPrompt {
  cacheMetadata: AiPromptCacheMetadata;
  materialRules?: string | null;
  promptLayers: AiPromptBlock[];
  stableSystemBlocks: Array<{ name: AiPromptBlock['name']; text: string }>;
  system: string;
  user: string;
}
```

- [ ] **Step 4: Add local helper functions to `promptBuilder.ts`**

Add below `frameReplyPreference`:

```ts
function block(name: AiPromptBlock['name'], text: string | null | undefined, stable: boolean, version = 1): AiPromptBlock {
  return {
    name,
    stable,
    text: text?.trim() ?? '',
    version,
  };
}

function joinBlocks(blocks: Array<{ text: string }>): string {
  return blocks.map((item) => item.text).filter(Boolean).join('\n\n');
}
```

- [ ] **Step 5: Update `buildNormalChatPrompt` input and return**

Add to `buildNormalChatPrompt` input:

```ts
  chatMode: AiChatMode;
  memoryEpoch: string;
```

Inside `buildNormalChatPrompt`, replace the current return object construction with:

```ts
  const stableBlocks = [
    block('stable_app_policy', frameRoleInstruction(input.systemPrompt, input.roleInstructionWeight), true),
    block('stable_role', frameReplyPreference(input.replyPreference), true),
    block('stable_material_rules', '', true),
    block('stable_tool_definitions', '', true),
    block('memory_snapshot', [
      input.companionMemoryPrefix,
      input.userProfile ? `关于这个用户：\n${input.userProfile}\n不要为了展示记忆而主动提旧事。` : '',
      input.summarySegments ? `过往记忆：\n${input.summarySegments}` : '',
      input.stableMemoryPrefix,
      input.rolePrompt,
    ].filter(Boolean).join('\n\n'), true),
  ];
  const dynamicBlocks = [
    block('dynamic_memory', input.dynamicMemoryContext, false),
    block('retrieval_context', materialSection, false),
    block('current_user_message', `用户当前问题：\n${input.userMessage}`, false),
  ];
  const promptLayers = [...stableBlocks, ...dynamicBlocks];
  const system = joinBlocks(stableBlocks);
  const user = joinBlocks(dynamicBlocks);
  return {
    cacheMetadata: buildPromptCacheMetadata({
      blocks: promptLayers,
      chatMode: input.chatMode,
      memoryEpoch: input.memoryEpoch,
      retrievalText: materialSection,
    }),
    materialRules: null,
    promptLayers,
    stableSystemBlocks: stableBlocks.map((item) => ({ name: item.name, text: item.text })),
    system,
    user,
  };
```

- [ ] **Step 6: Update `buildMaterialBoundPrompt` input and return**

Add to `buildMaterialBoundPrompt` input:

```ts
  chatMode: AiChatMode;
  memoryEpoch: string;
```

Inside `buildMaterialBoundPrompt`, replace the current return object construction with:

```ts
  const retrievalContext = [
    input.contextSummary,
    '可引用资料片段：',
    ...input.snippets.map((snippet, index) => `[${index + 1}] ${snippet.label}\n${snippet.text}`),
  ].join('\n\n');
  const stableBlocks = [
    block('stable_app_policy', frameRoleInstruction(input.editablePrompt, input.roleInstructionWeight), true),
    block('stable_role', frameReplyPreference(input.replyPreference), true),
    block('stable_material_rules', ['资料规则：', materialRules].join('\n'), true),
    block('stable_tool_definitions', '', true),
    block('memory_snapshot', [
      input.companionMemoryPrefix,
      input.userProfile ? `关于这个用户：\n${input.userProfile}\n不要为了展示记忆而主动提旧事。` : '',
      input.summarySegments ? `过往记忆：\n${input.summarySegments}` : '',
      input.stableMemoryPrefix,
    ].filter(Boolean).join('\n\n'), true),
  ];
  const dynamicBlocks = [
    block('dynamic_memory', input.dynamicMemoryContext, false),
    block('retrieval_context', retrievalContext, false),
    block('current_user_message', ['用户问题：', input.userMessage].join('\n'), false),
  ];
  const promptLayers = [...stableBlocks, ...dynamicBlocks];
  const system = joinBlocks(stableBlocks);
  const user = joinBlocks(dynamicBlocks);
  return {
    cacheMetadata: buildPromptCacheMetadata({
      blocks: promptLayers,
      chatMode: input.chatMode,
      memoryEpoch: input.memoryEpoch,
      retrievalText: retrievalContext,
    }),
    materialRules,
    promptLayers,
    stableSystemBlocks: stableBlocks.map((item) => ({ name: item.name, text: item.text })),
    system,
    user,
  };
```

- [ ] **Step 7: Run focused policy test**

Run:

```powershell
node --test tests/ai-prompt-cache-policy.test.cjs
```

Expected: FAIL on chat service, settings, and provider adapter requirements; helper and prompt builder assertions PASS.

- [ ] **Step 8: Commit helper and prompt builder changes**

Run:

```powershell
git add src/ai/aiPromptCache.ts src/ai/promptBuilder.ts tests/ai-prompt-cache-policy.test.cjs
git commit -m "feat: add AI prompt cache metadata helpers"
```

Expected: commit succeeds.

---

### Task 3: Add Provider Usage Normalization

**Files:**
- Create: `src/ai/aiProviderUsage.ts`
- Modify: `src/ai/providers/base.ts`

- [ ] **Step 1: Create provider usage normalizer**

Create `src/ai/aiProviderUsage.ts`:

```ts
import type { AiProviderProtocol } from './types';

export interface NormalizedProviderUsage {
  totalPromptTokens: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
  cachedTokenRatio: number | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeProviderUsage(protocol: AiProviderProtocol, rawUsage: unknown): NormalizedProviderUsage {
  const usage = rawUsage && typeof rawUsage === 'object' ? rawUsage as Record<string, unknown> : {};

  if (protocol === 'anthropic') {
    const input_tokens = numberOrNull(usage.input_tokens) ?? 0;
    const cacheCreationInputTokens = numberOrNull(usage.cache_creation_input_tokens) ?? 0;
    const cacheReadInputTokens = numberOrNull(usage.cache_read_input_tokens) ?? 0;
    const cachedInputTokens = cacheReadInputTokens;
    const totalPromptTokens = input_tokens + cacheCreationInputTokens + cacheReadInputTokens;
    return {
      totalPromptTokens,
      promptTokens: input_tokens,
      completionTokens: numberOrNull(usage.output_tokens),
      cachedInputTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
      cachedTokenRatio: totalPromptTokens > 0 ? cachedInputTokens / totalPromptTokens : null,
    };
  }

  if (protocol === 'gemini') {
    const totalPromptTokens = numberOrNull(usage.promptTokenCount);
    const cachedInputTokens = numberOrNull(usage.cachedContentTokenCount) ?? 0;
    return {
      totalPromptTokens,
      promptTokens: totalPromptTokens,
      completionTokens: numberOrNull(usage.candidatesTokenCount),
      cachedInputTokens,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: cachedInputTokens,
      cachedTokenRatio: totalPromptTokens && totalPromptTokens > 0 ? cachedInputTokens / totalPromptTokens : null,
    };
  }

  const totalPromptTokens = numberOrNull(usage.prompt_tokens);
  const promptTokensDetails = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
    ? usage.prompt_tokens_details as Record<string, unknown>
    : {};
  const cachedInputTokens = numberOrNull(promptTokensDetails.cached_tokens) ?? 0;
  return {
    totalPromptTokens,
    promptTokens: totalPromptTokens,
    completionTokens: numberOrNull(usage.completion_tokens),
    cachedInputTokens,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: cachedInputTokens,
    cachedTokenRatio: totalPromptTokens && totalPromptTokens > 0 ? cachedInputTokens / totalPromptTokens : null,
  };
}
```

- [ ] **Step 2: Add usage event types to provider base**

Modify `src/ai/providers/base.ts` imports:

```ts
import type { AiProviderCachePolicy } from '../aiPromptCache';
```

Change `AiStreamEvent`:

```ts
export type AiStreamEvent =
  | { type: 'answer_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'provider_usage'; rawUsage: unknown }
  | { type: 'completed'; finishReason?: string }
  | { type: 'error'; message: string };
```

Add optional cache policy to `AiChatRequest`:

```ts
  providerCachePolicy?: AiProviderCachePolicy;
```

- [ ] **Step 3: Run focused checks**

Run:

```powershell
node --test tests/ai-prompt-cache-policy.test.cjs
pnpm typecheck
```

Expected: policy test still FAILS on chat service and adapter requirements. Typecheck should PASS or show only errors caused by later integration points; fix any errors in the files changed by this task before continuing.

- [ ] **Step 4: Commit usage normalization**

Run:

```powershell
git add src/ai/aiProviderUsage.ts src/ai/providers/base.ts tests/ai-prompt-cache-policy.test.cjs
git commit -m "feat: normalize AI provider cache usage"
```

Expected: commit succeeds.

---

### Task 4: Add Prompt Cache Settings And Chat Service Observation

**Files:**
- Modify: `src/database/repositories/settingsRepository.ts`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/promptBuilder.ts`

- [ ] **Step 1: Add prompt cache settings to settings repository**

In `src/database/repositories/settingsRepository.ts`, add constants near the other AI settings keys:

```ts
export const AI_PROVIDER_PROMPT_CACHE_ENABLED_KEY = 'aiProviderPromptCacheEnabled';
export const AI_PROVIDER_PROMPT_CACHE_DISABLED_PROVIDER_IDS_KEY = 'aiProviderPromptCacheDisabledProviderIds';
```

Add interface:

```ts
export interface AiPromptCacheSettingsRecord {
  enabled: boolean;
  disabledProviderIds: string[];
}
```

Add helper:

```ts
function parseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}
```

Add repository methods before asset-list methods:

```ts
  async getAiPromptCacheSettings(db: SQLiteDatabase): Promise<AiPromptCacheSettingsRecord> {
    const enabled = await this.getValue(db, AI_PROVIDER_PROMPT_CACHE_ENABLED_KEY);
    const disabledProviderIds = await this.getValue(db, AI_PROVIDER_PROMPT_CACHE_DISABLED_PROVIDER_IDS_KEY);
    return {
      enabled: enabled !== 'false',
      disabledProviderIds: parseStringArray(disabledProviderIds),
    };
  },

  async updateAiPromptCacheSettings(db: SQLiteDatabase, patch: Partial<AiPromptCacheSettingsRecord>): Promise<AiPromptCacheSettingsRecord> {
    if (patch.enabled !== undefined) {
      await this.setValue(db, AI_PROVIDER_PROMPT_CACHE_ENABLED_KEY, patch.enabled ? 'true' : 'false');
    }
    if (patch.disabledProviderIds !== undefined) {
      await this.setValue(db, AI_PROVIDER_PROMPT_CACHE_DISABLED_PROVIDER_IDS_KEY, JSON.stringify([...new Set(patch.disabledProviderIds)]));
    }
    return this.getAiPromptCacheSettings(db);
  },
```

- [ ] **Step 2: Add chat service imports**

In `src/ai/aiChatService.ts`, import:

```ts
import {
  buildProviderCachePolicy,
  deriveAiChatMode,
  ttlLikelyExpired,
  type AiPromptCacheSettings,
} from './aiPromptCache';
import { normalizeProviderUsage, type NormalizedProviderUsage } from './aiProviderUsage';
```

- [ ] **Step 3: Add local helper functions to chat service**

Add near the other local helpers in `src/ai/aiChatService.ts`:

```ts
async function resolvePromptCacheSettings(space: PixorySpace): Promise<AiPromptCacheSettings> {
  return runWithDatabaseSpace(space, (db) => settingsRepository.getAiPromptCacheSettings(db));
}

function buildCacheObservationBase(input: {
  contextTrimmed: boolean;
  contextTrimmedByBudget: boolean;
  contextTrimmedByCount: boolean;
  historyMessageCount: number;
  modelId: string;
  previousRequestAt: string | null;
  prompt: Awaited<ReturnType<typeof buildPromptForThread>>['prompt'];
  providerId: string;
  requestedAt: string;
  ttlLikelyExpired: boolean;
  turnIntervalMs: number | null;
}) {
  return {
    provider: input.providerId,
    modelId: input.modelId,
    requestedAt: input.requestedAt,
    promptVersion: input.prompt.cacheMetadata.promptVersion,
    promptLayerVersions: input.prompt.cacheMetadata.promptLayerVersions,
    chatMode: input.prompt.cacheMetadata.chatMode,
    stableCoreHash: input.prompt.cacheMetadata.stableCoreHash,
    stablePrefixHash: input.prompt.cacheMetadata.stablePrefixHash,
    stablePrefixEstimatedTokens: input.prompt.cacheMetadata.stablePrefixEstimatedTokens,
    memoryEpoch: input.prompt.cacheMetadata.memoryEpoch,
    memorySnapshotHash: input.prompt.cacheMetadata.memorySnapshotHash,
    retrievalHash: input.prompt.cacheMetadata.retrievalHash,
    historyMessageCount: input.historyMessageCount,
    contextTrimmed: input.contextTrimmed,
    contextTrimmedByBudget: input.contextTrimmedByBudget,
    contextTrimmedByCount: input.contextTrimmedByCount,
    previousRequestAt: input.previousRequestAt,
    turnIntervalMs: input.turnIntervalMs,
    ttlLikelyExpired: input.ttlLikelyExpired,
    purityWarnings: input.prompt.cacheMetadata.purityWarnings,
  };
}

function buildProviderCacheObservation(input: {
  normalizedUsage: NormalizedProviderUsage | null;
  providerCachePolicy: ReturnType<typeof buildProviderCachePolicy>;
}) {
  const usage = input.normalizedUsage;
  return {
    requested: input.providerCachePolicy.requested,
    observed: Boolean(usage),
    strategy: input.providerCachePolicy.strategy,
    totalPromptTokens: usage?.totalPromptTokens ?? null,
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    cachedTokenRatio: usage?.cachedTokenRatio ?? null,
    cacheCreationInputTokens: usage?.cacheCreationInputTokens ?? null,
    cacheReadInputTokens: usage?.cacheReadInputTokens ?? null,
    estimatedCostSaved: null,
    estimatedCostDelta: null,
    missReason: usage?.cachedInputTokens === 0 ? 'provider_reported_no_cached_tokens' : null,
  };
}
```

- [ ] **Step 4: Pass chat mode and memory epoch into prompt builder**

Change `buildPromptForThread` signature:

```ts
async function buildPromptForThread(thread: AiThreadRecord, userMessage: string, branchScopes?: AiBranchScope[]) {
```

Keep the signature unchanged but compute inside:

```ts
  const chatMode = deriveAiChatMode(thread, thread.space);
  const memoryEpoch = `thread:${thread.id}:${thread.updatedAt}:${thread.roleCardId ?? 'none'}:${thread.boundaryMode}`;
```

Pass `chatMode` and `memoryEpoch` into both `buildNormalChatPrompt` and `buildMaterialBoundPrompt`.

- [ ] **Step 5: Freeze provider cache policy at request-build time**

In `streamAssistantReply`, after `const contextTrimmed = contextTrimmedByCount || contextTrimmedByBudget;`, add:

```ts
  const requestedAt = startedAt;
  const previousRequestAt = historyMessages.at(-1)?.completedAt ?? null;
  const turnIntervalMs = previousRequestAt ? Date.parse(requestedAt) - Date.parse(previousRequestAt) : null;
  const promptCacheSettings = await resolvePromptCacheSettings(input.space);
  const providerCachePolicy = buildProviderCachePolicy({
    metadata: prompt.cacheMetadata,
    modelId,
    previousRequestAt,
    provider,
    requestedAt,
    settings: promptCacheSettings,
    stableSystemBlocks: prompt.stableSystemBlocks,
  });
  const cacheObservationBase = buildCacheObservationBase({
    contextTrimmed,
    contextTrimmedByBudget,
    contextTrimmedByCount,
    historyMessageCount: history.length,
    modelId,
    previousRequestAt,
    prompt,
    providerId: provider.id,
    requestedAt,
    ttlLikelyExpired: ttlLikelyExpired({ previousRequestAt, provider, requestedAt }),
    turnIntervalMs: turnIntervalMs != null && Number.isFinite(turnIntervalMs) ? turnIntervalMs : null,
  });
  let providerUsageRaw: unknown = null;
```

- [ ] **Step 6: Pass provider policy and capture usage events**

In the `adapter.streamChat` request object, add:

```ts
        providerCachePolicy,
```

In the stream event handler, before the delta checks, add:

```ts
        if (event.type === 'provider_usage') {
          providerUsageRaw = event.rawUsage;
          return;
        }
```

- [ ] **Step 7: Persist cache observation on completion**

Before the final database update, add:

```ts
  const normalizedUsage = providerUsageRaw
    ? normalizeProviderUsage(provider.protocol, providerUsageRaw)
    : null;
  const cacheObservation = {
    ...cacheObservationBase,
    providerCache: buildProviderCacheObservation({
      normalizedUsage,
      providerCachePolicy,
    }),
  };
  const promptSnapshotJson = JSON.stringify({
    cacheObservation,
    contextTrimmed,
    contextTrimmedByBudget,
    contextTrimmedByCount,
    materialRules: prompt.materialRules ?? null,
    system: prompt.system,
  });
```

Replace both final `promptSnapshotJson: JSON.stringify({ contextTrimmed, contextTrimmedByBudget, contextTrimmedByCount, system: prompt.system, materialRules: prompt.materialRules ?? null })` occurrences with:

```ts
      promptSnapshotJson,
```

and:

```ts
    promptSnapshotJson,
```

- [ ] **Step 8: Run focused checks**

Run:

```powershell
node --test tests/ai-prompt-cache-policy.test.cjs
node --test tests/ai-rag-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
pnpm typecheck
```

Expected: policy test still FAILS on provider adapter payload requirements. RAG/performance tests PASS. Typecheck PASS.

- [ ] **Step 9: Commit observation plumbing**

Run:

```powershell
git add src/database/repositories/settingsRepository.ts src/ai/aiChatService.ts src/ai/promptBuilder.ts tests/ai-prompt-cache-policy.test.cjs
git commit -m "feat: observe AI prompt cache metadata"
```

Expected: commit succeeds.

---

### Task 5: Add OpenAI-Compatible Cache Key And Usage Parsing

**Files:**
- Modify: `src/ai/providers/openAiCompatibleProvider.ts`

- [ ] **Step 1: Parse streaming usage chunks**

In `parseOpenAiStreamLine`, after `const parsed = JSON.parse(payload);`, add:

```ts
    if (parsed.usage) {
      return [{ type: 'provider_usage', rawUsage: parsed.usage }];
    }
```

- [ ] **Step 2: Build request body with optional cache key**

In `streamChat`, before `expoFetch`, add:

```ts
      const body: Record<string, unknown> = {
        model: input.modelId,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: input.systemPrompt },
          ...input.history,
          { role: 'user', content: input.userPrompt },
        ],
      };
      if (input.providerCachePolicy?.openAiPromptCacheKey) {
        body.prompt_cache_key = input.providerCachePolicy.openAiPromptCacheKey;
      }
```

Replace the existing inline `body: JSON.stringify({ ... })` with:

```ts
        body: JSON.stringify(body),
```

- [ ] **Step 3: Run focused checks**

Run:

```powershell
node --test tests/ai-prompt-cache-policy.test.cjs
pnpm typecheck
```

Expected: policy test still FAILS on Claude/Gemini requirements. Typecheck PASS.

- [ ] **Step 4: Commit OpenAI-compatible cache support**

Run:

```powershell
git add src/ai/providers/openAiCompatibleProvider.ts tests/ai-prompt-cache-policy.test.cjs
git commit -m "feat: add OpenAI-compatible prompt cache hints"
```

Expected: commit succeeds.

---

### Task 6: Add Anthropic Breakpoint Cache-Control

**Files:**
- Modify: `src/ai/providers/claudeProvider.ts`

- [ ] **Step 1: Add Anthropic system content helper**

Add below `parseClaudeStreamLine`:

```ts
function buildClaudeSystem(input: AiChatRequest): string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  const blocks = input.providerCachePolicy?.anthropicSystemBlocks;
  if (!blocks?.length) {
    return input.systemPrompt;
  }
  return blocks
    .filter((block) => block.text.trim())
    .map((block) => ({
      type: 'text' as const,
      text: block.text,
      ...(block.cacheControl ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));
}
```

- [ ] **Step 2: Parse Anthropic usage events**

In `parseClaudeStreamLine`, add handling for message start and message delta usage:

```ts
    if (parsed.type === 'message_start' && parsed.message?.usage) {
      return [{ type: 'provider_usage', rawUsage: parsed.message.usage }];
    }
    if (parsed.type === 'message_delta' && parsed.usage) {
      return [{ type: 'provider_usage', rawUsage: parsed.usage }];
    }
```

Keep the existing stop-reason handling after usage parsing:

```ts
    if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
      return [{ type: 'completed', finishReason: parsed.delta.stop_reason }];
    }
```

- [ ] **Step 3: Use cacheable system blocks**

In the Claude request body, replace:

```ts
          system: input.systemPrompt,
```

with:

```ts
          system: buildClaudeSystem(input),
```

- [ ] **Step 4: Run focused checks**

Run:

```powershell
node --test tests/ai-prompt-cache-policy.test.cjs
pnpm typecheck
```

Expected: policy test still FAILS on Gemini requirements only. Typecheck PASS.

- [ ] **Step 5: Commit Anthropic cache-control support**

Run:

```powershell
git add src/ai/providers/claudeProvider.ts tests/ai-prompt-cache-policy.test.cjs
git commit -m "feat: add Anthropic prompt cache breakpoints"
```

Expected: commit succeeds.

---

### Task 7: Add Gemini Usage Observation

**Files:**
- Modify: `src/ai/providers/geminiProvider.ts`

- [ ] **Step 1: Emit Gemini usage metadata from chunks**

In `emitGeminiTextFromChunk`, after `const candidate = ...`, add:

```ts
  const usageMetadata = (chunk as { usageMetadata?: unknown }).usageMetadata;
  if (usageMetadata) {
    await onEvent({ type: 'provider_usage', rawUsage: usageMetadata });
  }
```

Keep text emission after usage emission.

- [ ] **Step 2: Confirm no explicit remote cache lifecycle is added**

Inspect:

```powershell
rg -n "cachedContents|cachedContent|cacheName" src/ai/providers/geminiProvider.ts
```

Expected: no explicit remote cache creation path. `cachedContentTokenCount` may appear only in tests or usage parsing references.

- [ ] **Step 3: Run focused checks**

Run:

```powershell
node --test tests/ai-prompt-cache-policy.test.cjs
pnpm typecheck
```

Expected: policy test PASS. Typecheck PASS.

- [ ] **Step 4: Commit Gemini observation support**

Run:

```powershell
git add src/ai/providers/geminiProvider.ts tests/ai-prompt-cache-policy.test.cjs
git commit -m "feat: observe Gemini prompt cache usage"
```

Expected: commit succeeds.

---

### Task 8: Add Deterministic Golden Tests

**Files:**
- Create: `tests/ai-prompt-cache-unit.test.cjs`

- [ ] **Step 1: Add a lightweight unit test for helper source guarantees**

Create `tests/ai-prompt-cache-unit.test.cjs`:

```js
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
});

test('cache observation keeps final-answer caching out of scope', () => {
  const chat = read('src/ai/aiChatService.ts');
  const promptCache = read('src/ai/aiPromptCache.ts');

  assert.doesNotMatch(chat, /semanticCache/i);
  assert.doesNotMatch(chat, /answerCache/i);
  assert.doesNotMatch(promptCache, /semanticCache/i);
  assert.doesNotMatch(promptCache, /answerCache/i);
});
```

- [ ] **Step 2: Run unit and policy tests**

Run:

```powershell
node --test tests/ai-prompt-cache-unit.test.cjs tests/ai-prompt-cache-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 3: Commit golden tests**

Run:

```powershell
git add tests/ai-prompt-cache-unit.test.cjs
git commit -m "test: add AI prompt cache golden checks"
```

Expected: commit succeeds.

---

### Task 9: Focused Regression Verification

**Files:**
- Review touched files only.

- [ ] **Step 1: Run AI-focused policy tests**

Run:

```powershell
node --test tests/ai-prompt-cache-policy.test.cjs tests/ai-prompt-cache-unit.test.cjs tests/ai-rag-policy.test.cjs tests/ai-provider-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript and diff checks**

Run:

```powershell
pnpm typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run:

```powershell
git diff -- src/ai/aiPromptCache.ts src/ai/aiProviderUsage.ts src/ai/promptBuilder.ts src/ai/aiChatService.ts src/ai/providers/base.ts src/ai/providers/openAiCompatibleProvider.ts src/ai/providers/claudeProvider.ts src/ai/providers/geminiProvider.ts src/database/repositories/settingsRepository.ts tests/ai-prompt-cache-policy.test.cjs tests/ai-prompt-cache-unit.test.cjs
```

Confirm:

- Stable layers appear before dynamic layers.
- Dynamic memory, retrieval snippets, and current user text are not included in `stableCoreHash` or `stablePrefixHash`.
- `stable_tool_definitions` exists even when empty, so future tool schemas have a stable insertion point.
- `memoryEpoch` is frozen when `buildPromptForThread` returns and does not change during streaming.
- Anthropic breakpoint decisions are per cumulative token segment.
- `cachedTokenRatio` always uses `totalPromptTokens`, especially for Anthropic.
- Provider cache kill switches only disable provider hints; they do not disable prompt layering or cache observation.
- Gemini remains implicit-cache-only with no explicit remote cache lifecycle.
- No semantic answer cache for private companion replies was introduced.

- [ ] **Step 4: Run all policy tests**

Run:

```powershell
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Commit verification fixes if any were needed**

If any verification fix changed files, run:

```powershell
git add src/ai/aiPromptCache.ts src/ai/aiProviderUsage.ts src/ai/promptBuilder.ts src/ai/aiChatService.ts src/ai/providers/base.ts src/ai/providers/openAiCompatibleProvider.ts src/ai/providers/claudeProvider.ts src/ai/providers/geminiProvider.ts src/database/repositories/settingsRepository.ts tests/ai-prompt-cache-policy.test.cjs tests/ai-prompt-cache-unit.test.cjs
git commit -m "fix: stabilize AI prompt cache implementation"
```

Expected: commit succeeds only if fixes were necessary. Skip this step when the previous task commits already contain the final verified state.

---

### Task 10: Manual Chat Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Start the app**

Run:

```powershell
pnpm start
```

Expected: Expo starts without TypeScript errors.

- [ ] **Step 2: Verify normal companion chat**

In the app:

- Open or create a normal AI chat thread.
- Send two short consecutive messages.
- Confirm responses stream normally.
- Inspect the completed assistant message `promptSnapshotJson` through the existing debug path or database inspection.

Expected:

- `cacheObservation.chatMode` is `companion` or `roleplay` depending on the thread.
- `stableCoreHash`, `stablePrefixHash`, `memorySnapshotHash`, and `providerCache` exist.
- `providerCache.observed` is false if the provider did not return usage and true if usage arrived.

- [ ] **Step 3: Verify material-bound chat**

In the app:

- Open an IP-bound or knowledge-base-bound AI thread with at least one retrievable material.
- Send a question that triggers retrieval.
- Inspect `promptSnapshotJson`.

Expected:

- `cacheObservation.chatMode` is `knowledge`.
- `retrievalHash` changes when retrieval context changes.
- `stableCoreHash` does not include the retrieved snippet text.
- Citations still display normally.

- [ ] **Step 4: Verify local kill switch fallback**

In a temporary local database session or debug console, set:

```sql
INSERT INTO app_settings (key, value, updatedAt)
VALUES ('aiProviderPromptCacheEnabled', 'false', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt;
```

Send another chat request.

Expected:

- The request still succeeds.
- `cacheObservation.providerCache.requested` is false.
- Prompt hashes are still recorded.

- [ ] **Step 5: Stop the dev server**

Stop Expo with `Ctrl+C`.

Expected: no long-running dev server remains from this verification session.

