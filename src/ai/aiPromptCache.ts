import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { AiProviderProtocol, AiProviderRecord, AiThreadRecord, PixorySpace } from '../database';
import { estimatePromptTokens } from './aiContextBudget';
import { isOfficialDeepSeekV4Model } from './deepseekModelPolicy';

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
  retrievalVersion: number;
  purityWarnings: string[];
}

export interface AiPromptCacheSettings {
  enabled: boolean;
  disabledProviderIds: string[];
  providerTtlMs?: Partial<Record<AiProviderProtocol, number>>;
}

export interface AiProviderCachePolicy {
  requested: boolean;
  strategy: 'none' | 'deepseek_native' | 'openai_prompt_cache_key' | 'anthropic_ephemeral' | 'gemini_implicit';
  openAiIncludeUsage?: boolean;
  openAiPromptCacheKey?: string;
  anthropicSystemBlocks?: Array<{ text: string; cacheControl?: boolean }>;
  ttlMs: number;
}

export interface AiProviderCacheDecisionInput {
  modelId: string;
  provider: AiProviderRecord & { openAiUsageObservationEnabled?: boolean };
  settings: AiPromptCacheSettings;
  metadata: AiPromptCacheMetadata;
  branchRouteHash?: string | null;
  generationParamsHash?: string | null;
  stableSystemBlocks: Array<{ name: AiPromptLayerName; text: string }>;
  previousRequestAt?: string | null;
  requestedAt: string;
  scopeKey?: string | null;
}

export const AI_PROMPT_VERSION = 1;
export const AI_PROMPT_LAYER_VERSIONS = {
  appPolicy: 1,
  role: 3,
  materialRules: 1,
  toolDefinitions: 1,
  memorySnapshot: 1,
} as const;
export const AI_RETRIEVAL_CONTEXT_VERSION = 1;

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
  return bytesToHex(sha256(new TextEncoder().encode(normalizePromptCacheText(value))));
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

export function providerTtlMs(
  provider: Pick<AiProviderRecord, 'protocol'>,
  settings?: Pick<AiPromptCacheSettings, 'providerTtlMs'>
): number {
  const override = settings?.providerTtlMs?.[provider.protocol];
  return typeof override === 'number' && Number.isFinite(override) && override > 0
    ? override
    : PROVIDER_TTL_MS[provider.protocol];
}

export function ttlLikelyExpired(input: {
  provider: Pick<AiProviderRecord, 'protocol'>;
  previousRequestAt?: string | null;
  requestedAt: string;
  settings?: Pick<AiPromptCacheSettings, 'providerTtlMs'>;
}): boolean {
  if (!input.previousRequestAt) {
    return false;
  }
  const previous = Date.parse(input.previousRequestAt);
  const requested = Date.parse(input.requestedAt);
  if (!Number.isFinite(previous) || !Number.isFinite(requested)) {
    return false;
  }
  return requested - previous > providerTtlMs(input.provider, input.settings);
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
    retrievalVersion: AI_RETRIEVAL_CONTEXT_VERSION,
    purityWarnings: lintStablePromptBlocks(stableBlocks),
  };
}

export function buildProviderCachePolicy(input: AiProviderCacheDecisionInput): AiProviderCachePolicy {
  const ttlMs = providerTtlMs(input.provider, input.settings);
  const isDeepSeekNative = input.provider.protocol === 'openai_compatible'
    && isOfficialDeepSeekV4Model({
      baseUrl: input.provider.baseUrl,
      modelId: input.modelId,
      providerType: input.provider.providerType,
    });
  if (isDeepSeekNative) {
    return {
      openAiIncludeUsage: true,
      requested: input.settings.enabled && !input.settings.disabledProviderIds.includes(input.provider.id),
      strategy: 'deepseek_native',
      ttlMs,
    };
  }
  if (!input.settings.enabled || input.settings.disabledProviderIds.includes(input.provider.id)) {
    return { requested: false, strategy: 'none', ttlMs };
  }

  if (input.provider.protocol === 'openai_compatible') {
    if (!input.provider.openAiUsageObservationEnabled) {
      return { requested: false, strategy: 'none', ttlMs };
    }
    if (input.provider.providerType !== 'openai' || input.metadata.stablePrefixEstimatedTokens < OPENAI_CACHE_THRESHOLD_TOKENS) {
      return { openAiIncludeUsage: true, requested: false, strategy: 'none', ttlMs };
    }
    const openAiPromptCacheKey = [
      'pixory',
      `pv${input.metadata.promptVersion}`,
      input.provider.id,
      input.modelId,
      input.metadata.chatMode,
      input.metadata.stablePrefixHash,
      input.metadata.memoryEpoch,
      `rv${input.metadata.retrievalVersion}`,
      input.scopeKey ?? 'scope:unknown',
      input.branchRouteHash ?? 'branch:latest',
      input.generationParamsHash ?? 'params:default',
    ].join(':');
    return {
      openAiIncludeUsage: input.provider.openAiUsageObservationEnabled,
      openAiPromptCacheKey,
      requested: true,
      strategy: 'openai_prompt_cache_key',
      ttlMs,
    };
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
    const hasEnabledBreakpoint = anthropicSystemBlocks.some((block) => block.cacheControl);
    if (!hasEnabledBreakpoint) {
      return { requested: false, strategy: 'none', ttlMs };
    }
    return {
      anthropicSystemBlocks,
      requested: true,
      strategy: 'anthropic_ephemeral',
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
