import type { SQLiteDatabase } from 'expo-sqlite';

import {
  aiProviderRepository,
  aiRoleCardRepository,
  aiThreadRepository,
  settingsRepository,
  runWithDatabaseSpace,
  type AiBoundaryMode,
  type AiCitationRecord,
  type AiContextType,
  type AiProviderRecord,
  type AiReplyPreference,
  type AiRoleInstructionWeight,
  type AiThreadRecord,
  type PixorySpace,
} from '../database';
import type { AiBranchScope, AiMemoryRecord, AiMessageRecord, AiMessageVersionRecord, AiThreadHistoryFilter, AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import { DEFAULT_AI_ROLE_PROMPT, MATERIAL_SESSION_RULES, STRICT_MATERIAL_RULES } from './aiConstants';
import { getAdapterForProvider, ensureBuiltInProviders, listProviderCards } from './aiProviderService';
import { buildMaterialBoundPrompt, buildNormalChatPrompt } from './promptBuilder';
import { retrieveForThread } from './aiRetrievalService';
import { cleanupDeletedMaterialFiles, moveThreadOwnedMaterialsBetweenSpaces, removeMaterialsByOwner } from './aiDocumentService';
import { trimMessagesToContextBudget } from './aiContextBudget';
import {
  buildCompanionMemoryPrefix,
  buildStableMemoryPrefix,
} from './aiMemoryService';
import { scheduleDeferredCompanionMemoryMaintenance } from './aiMemoryMaintenanceService';
import { resolveMemoryMaintenanceModel } from './aiMemoryMaintenanceModelService';
import { normalizeAiErrorMessage } from './aiErrorMessageService';
import {
  buildProviderCachePolicy,
  deriveAiChatMode,
  hashPromptCacheText,
  ttlLikelyExpired,
  type AiPromptCacheSettings,
} from './aiPromptCache';
import { normalizeProviderUsage, type NormalizedProviderUsage } from './aiProviderUsage';
import {
  aggregateAiUsageObservations,
  type AiUsageAggregate,
} from './aiUsageAnalytics';
import {
  deleteThreadProviderApiKey,
  getProviderApiKey,
  getThreadProviderApiKey,
  hasThreadProviderApiKey,
  setThreadProviderApiKey,
} from './secureAiSettingsService';
import { verifyPersonalPassword } from '../services/personalSystemService';
import type { AiStreamEvent } from './providers/base';
import type { AiMessageFavoriteListItem as AiMessageFavoriteRepositoryListItem } from '../database/repositories/aiThreadRepository';

export interface AiThreadAvatarConfig {
  avatarEnabled: boolean;
  avatarUri: string | null;
}

export interface CreateThreadFromContextInput {
  space: PixorySpace;
  contextType: AiContextType;
  title: string;
  boundIpId?: number | null;
  boundKnowledgeBaseId?: string | null;
  includeIpDocuments?: boolean;
  providerId?: string | null;
  modelId?: string | null;
  systemPrompt?: string;
  roleInstructionWeight?: AiRoleInstructionWeight;
  replyPreference?: AiReplyPreference;
  thinkingDisabled?: boolean;
  boundaryMode?: AiBoundaryMode;
}

export interface SendUserMessageInput {
  space: PixorySpace;
  threadId: string;
  content: string;
  branchRootMessageId?: string | null;
  branchVersionIndex?: number | null;
  signal?: AbortSignal;
  onCreated?: (ids: { userMessageId: string; assistantMessageId: string }) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onUpdated?: () => void;
}

export interface RetryAssistantMessageInput {
  space: PixorySpace;
  threadId: string;
  assistantMessageId: string;
  signal?: AbortSignal;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onUpdated?: () => void;
}

export interface RewriteUserMessageInput {
  space: PixorySpace;
  threadId: string;
  userMessageId: string;
  content: string;
  signal?: AbortSignal;
  onCreated?: (ids: { userMessageId: string; assistantMessageId: string }) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onUpdated?: () => void;
}

export interface StopStreamingMessageInput {
  space: PixorySpace;
  assistantMessageId: string;
}

export interface MoveAiThreadsInput {
  sourceSpace: PixorySpace;
  targetSpace: PixorySpace;
  threadIds: string[];
  personalPassword?: string;
}

export interface AiThreadSessionConfig {
  thread: AiThreadRecord;
  roleCardName: string | null;
  avatar: AiThreadAvatarConfig;
  deepMemoryEnabled: boolean;
  lastMaintenanceError: string | null;
}

export interface AiSessionModelOption {
  hasApiKey: boolean;
  label: string;
  modelId: string;
  providerId: string;
  providerLabel: string;
}

export interface AiThreadSessionModelConfig {
  currentLabel: string;
  currentStatus: 'follow_default' | 'fixed_provider' | 'fixed_model' | 'invalid';
  followDefaultLabel: string;
  options: AiSessionModelOption[];
  providerId: string | null;
  modelId: string | null;
  sessionBaseUrl: string | null;
  sessionHasApiKeyOverride: boolean;
}

export interface AiHomeThreadItem extends AiThreadHistoryItem {
  avatar: AiThreadAvatarConfig;
  avatarAvailable: boolean;
  roleCardName: string | null;
}

export interface UpdateAiThreadSessionConfigInput {
  space: PixorySpace;
  threadId: string;
  systemPrompt: string;
  roleInstructionWeight: AiRoleInstructionWeight;
  replyPreference: AiReplyPreference;
  thinkingDisabled: boolean;
  boundaryMode: AiBoundaryMode;
  providerId?: string | null;
  modelId?: string | null;
  avatarEnabled?: boolean;
  deepMemoryEnabled?: boolean;
}

export interface ApplyRoleCardToThreadInput {
  space: PixorySpace;
  threadId: string;
  roleCardId: string | null;
}

type ThreadModelSource = 'global_default' | 'provider_default' | 'thread_model';

type ThreadModelConfig = Pick<AiThreadRecord, 'id' | 'space' | 'providerId' | 'modelId' | 'sessionBaseUrl' | 'sessionApiKeyRef'>;

type ResolvedThreadChatModel =
  | {
      status: 'ready';
      apiKey: string | null;
      modelId: string;
      provider: AiProviderRecord;
      source: ThreadModelSource;
    }
  | { status: 'invalid_global_default'; message: string; providerId?: string | null; modelId?: string | null }
  | { status: 'invalid_thread_model'; message: string; providerId?: string | null; modelId?: string | null };

const stoppedMessageIds = new Set<string>();

function emptyThreadModelConfig(space: PixorySpace): ThreadModelConfig {
  return {
    id: '',
    modelId: null,
    providerId: null,
    sessionApiKeyRef: null,
    sessionBaseUrl: null,
    space,
  };
}

const COMMON_TITLE_PREFIXES = [
  /^请(你)?帮我/,
  /^帮我/,
  /^麻烦(你)?/,
  /^能不能/,
  /^可以/,
  /^我想/,
  /^想要/,
  /^请/,
];

const LOW_SIGNAL_TITLE_PATTERNS = [
  /^(你)?好$/,
  /^您好$/,
  /^哈[喽啰罗]$/,
  /^嗨$/,
  /^hi$/i,
  /^hello$/i,
  /^在吗$/,
  /^测试$/,
  /^继续$/,
  /^ok$/i,
];

const GENERIC_TITLE_WORDS = [
  /^关于/,
  /^讨论/,
  /^问题/,
  /^请问/,
];

const TITLE_FILLER_PATTERNS = [
  /^(一下|这个|那个|一个|一些)/,
  /(一下|呢|吧|吗|么)$/g,
  /^怎么(样)?/,
];

const ASSISTANT_TOPIC_PATTERNS = [
  /(?:主题|问题|需求|重点|核心)是\s*([^。！？!?，,；;]{2,30})/,
  /(?:关于|围绕)\s*([^。！？!?，,；;]{2,30})/,
  /(?:你想要|你希望|你需要)\s*([^。！？!?，,；;]{2,30})/,
];

export type AiMessageWithCitations = AiMessageRecord & {
  citations: AiCitationRecord[];
  messageVersions: AiMessageVersionRecord[];
  versionIndex: number;
  versionTotal: number;
};

export interface AiStreamingMessagePatch {
  id: string;
  status?: AiMessageRecord['status'];
  content?: string;
  reasoningText?: string | null;
  errorMessage?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  modelSnapshotJson?: string;
  promptSnapshotJson?: string;
  createdAt?: string;
  completedAt?: string | null;
  citations?: AiCitationRecord[];
}

export interface ListThreadMessagesOptions {
  branchScopes?: AiBranchScope[];
  limit?: number;
  selectedVersionByMessageId?: Record<string, number>;
}

export type AiChatSearchMatchKind = 'exact' | 'fuzzy';

export interface AiChatSearchResult {
  messageId: string;
  role: AiMessageRecord['role'];
  content: string;
  snippet: string;
  matchedTerms: string[];
  matchKind: AiChatSearchMatchKind;
  createdAt: string;
  versionIndex: number;
  versionTotal: number;
}

export interface AiMessageFavoriteListItem {
  id: string;
  threadId: string;
  messageId: string;
  threadTitle: string;
  contextType: AiContextType;
  boundIpId: number | null;
  boundKnowledgeBaseId: string | null;
  includeIpDocuments: boolean;
  content: string;
  snippet: string;
  branchScopes: AiBranchScope[];
  messageVersionIndex: number | null;
  versionTotal: number;
  createdAt: string;
  messageCreatedAt: string;
  messageUpdatedAt: string;
}

const CHAT_HISTORY_MESSAGE_LIMIT = 30;
const CHAT_MESSAGE_PAGE_SIZE = 60;
const STREAMING_PERSIST_INTERVAL_MS = 120;
const STREAMING_UI_PATCH_INTERVAL_MS = 80;
const DEEP_MEMORY_LIMIT = 5;
const RELATED_HISTORY_LIMIT = 4;
const MODEL_TITLE_MIN_COMPLETED_MESSAGES = 6;
const MODEL_TITLE_MAX_CHARS = 8;

function parseThreadAvatarConfig(roleSnapshotJson: string): AiThreadAvatarConfig {
  try {
    const snapshot = JSON.parse(roleSnapshotJson);
    return {
      avatarEnabled: snapshot?.avatarEnabled === true,
      avatarUri: typeof snapshot?.avatarUri === 'string' && snapshot.avatarUri.trim() ? snapshot.avatarUri : null,
    };
  } catch {
    return { avatarEnabled: false, avatarUri: null };
  }
}

function patchThreadRoleSnapshot(roleSnapshotJson: string, patch: Partial<AiThreadAvatarConfig>): string {
  let snapshot: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(roleSnapshotJson);
    snapshot = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    snapshot = {};
  }
  return JSON.stringify({ ...snapshot, ...patch });
}

function createAiId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

function parseFavoriteBranchScopes(value: string): AiBranchScope[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((scope): scope is AiBranchScope =>
          Boolean(scope)
          && typeof scope.branchRootMessageId === 'string'
          && typeof scope.branchVersionIndex === 'number'
        )
      : [];
  } catch {
    return [];
  }
}

function createFavoriteSnippet(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function mapFavoriteListItem(row: AiMessageFavoriteRepositoryListItem): AiMessageFavoriteListItem {
  return {
    id: row.id,
    threadId: row.threadId,
    messageId: row.messageId,
    threadTitle: row.threadTitle,
    contextType: row.contextType,
    boundIpId: row.boundIpId,
    boundKnowledgeBaseId: row.boundKnowledgeBaseId,
    includeIpDocuments: row.includeIpDocuments,
    content: row.messageContent,
    snippet: createFavoriteSnippet(row.messageContent),
    branchScopes: parseFavoriteBranchScopes(row.branchScopesJson),
    messageVersionIndex: row.messageVersionIndex,
    versionTotal: row.versionTotal,
    createdAt: row.createdAt,
    messageCreatedAt: row.messageCreatedAt,
    messageUpdatedAt: row.messageUpdatedAt,
  };
}

export function fallbackAiThreadTitle(input: { contextTitle: string; firstUserMessage: string; contextType: AiContextType }): string {
  return generateAiThreadTitle(input);
}

function normalizeTitleSource(text: string): string {
  return COMMON_TITLE_PREFIXES.reduce(
    (title, pattern) => title.replace(pattern, ''),
    text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[`*_>#\[\](){}]/g, '')
      .replace(/[。！？!?，,；;：:、]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ).trim();
}

function trimGenericTitleWords(text: string): string {
  return GENERIC_TITLE_WORDS.reduce((title, pattern) => title.replace(pattern, ''), text).trim();
}

function trimTitleFiller(text: string): string {
  return TITLE_FILLER_PATTERNS.reduce((title, pattern) => title.replace(pattern, ''), text).trim();
}

function isLowSignalTitle(text: string): boolean {
  const compact = text.replace(/\s+/g, '').trim();
  return compact.length <= 1 || LOW_SIGNAL_TITLE_PATTERNS.some((pattern) => pattern.test(compact));
}

function prepareUserTitle(text: string): string {
  return trimTitleFiller(trimGenericTitleWords(normalizeTitleSource(text)));
}

function pickAssistantTopicCandidate(assistantReply: string): string {
  const normalized = normalizeTitleSource(assistantReply);
  for (const pattern of ASSISTANT_TOPIC_PATTERNS) {
    const match = pattern.exec(normalized);
    const candidate = trimTitleFiller(trimGenericTitleWords(match?.[1] ?? ''));
    if (candidate && !isLowSignalTitle(candidate)) {
      return candidate;
    }
  }
  return '';
}

function pickTitleCandidate(userMessage: string, assistantReply?: string): string {
  const userTitle = prepareUserTitle(userMessage);
  if (userTitle && !isLowSignalTitle(userTitle)) {
    return userTitle;
  }

  const assistantTopic = pickAssistantTopicCandidate(assistantReply ?? '');
  if (assistantTopic) {
    return assistantTopic;
  }

  return userTitle || '新的聊天';
}

export function generateAiThreadTitle(input: { contextTitle: string; firstUserMessage: string; contextType: AiContextType; assistantReply?: string }): string {
  const compact = pickTitleCandidate(input.firstUserMessage, input.assistantReply).slice(0, 18);
  if (input.contextType === 'normal') {
    return compact || '普通聊天';
  }
  return compact ? `${input.contextTitle} / ${compact}` : input.contextTitle;
}

function sanitizeModelThreadTitle(text: string): string {
  const compact = normalizeTitleSource(text)
    .replace(/^["'“”‘’《》【】]+|["'“”‘’《》【】]+$/g, '')
    .replace(/^(标题|主题|会话标题)\s*[:：]?\s*/i, '')
    .replace(/\s+/g, '');
  return compact.slice(0, MODEL_TITLE_MAX_CHARS);
}

function buildModelThreadTitlePrompt(messages: AiMessageRecord[]): string {
  const transcript = messages
    .map((message) => `${message.role === 'assistant' ? 'AI' : '用户'}：${message.content.replace(/\s+/g, ' ').trim()}`)
    .join('\n');
  return [
    '请根据下面这段聊天内容生成一个短标题。',
    `要求：不超过 ${MODEL_TITLE_MAX_CHARS} 个汉字；不要标点；不要引号；请只输出标题，不要解释。`,
    '',
    transcript,
  ].join('\n');
}

function shouldUseResolvedMaintenanceTitleModel(resolvedMaintenance: Awaited<ReturnType<typeof resolveMemoryMaintenanceModel>>): boolean {
  if (resolvedMaintenance.mode === 'custom' || resolvedMaintenance.mode === 'deepseek_flash') {
    return true;
  }
  return resolvedMaintenance.mode === 'auto'
    && resolvedMaintenance.providerId === 'deepseek'
    && resolvedMaintenance.modelId === 'deepseek-v4-flash';
}

async function generateModelThreadTitle(input: {
  completedMessages: AiMessageRecord[];
  space: PixorySpace;
  thread: AiThreadRecord;
}): Promise<string | null> {
  const resolvedMaintenance = await resolveMemoryMaintenanceModel(input.space, input.thread);
  const useMaintenanceTitleModel = shouldUseResolvedMaintenanceTitleModel(resolvedMaintenance);
  let provider = useMaintenanceTitleModel ? resolvedMaintenance.provider : null;
  let modelId = useMaintenanceTitleModel ? resolvedMaintenance.modelId : null;
  let apiKey = useMaintenanceTitleModel ? resolvedMaintenance.apiKey : null;
  if (!provider || !modelId || !apiKey || resolvedMaintenance.status === 'local_fallback') {
    const resolvedThreadModel = await resolveThreadChatModel(input.space, input.thread);
    if (resolvedThreadModel.status !== 'ready' || !resolvedThreadModel.apiKey) {
      return null;
    }
    provider = resolvedThreadModel.provider;
    modelId = resolvedThreadModel.modelId;
    apiKey = resolvedThreadModel.apiKey;
  }

  let text = '';
  let streamError: string | null = null;
  await getAdapterForProvider(provider).streamChat(
    {
      apiKey,
      baseUrl: provider.baseUrl ?? '',
      history: [],
      modelId,
      systemPrompt: '你是 Pixory 的聊天标题生成器，只输出简短中文标题。',
      userPrompt: buildModelThreadTitlePrompt(input.completedMessages),
    },
    (event) => {
      if (event.type === 'answer_delta') {
        text += event.text;
      }
      if (event.type === 'error') {
        streamError = event.message;
      }
    }
  );
  if (streamError) {
    return null;
  }
  const title = sanitizeModelThreadTitle(text);
  return title && !isLowSignalTitle(title) ? title : null;
}

function getDefaultThreadSystemPrompt(contextType: AiContextType): string {
  return contextType === 'normal' ? '' : DEFAULT_AI_ROLE_PROMPT;
}

function fallbackTitle(input: CreateThreadFromContextInput): string {
  if (input.title.trim()) {
    return input.title.trim();
  }
  if (input.contextType === 'normal') {
    return '普通聊天';
  }
  return input.contextType === 'ip' ? 'IP 对话' : '知识库对话';
}

function isCustomInitialTitle(input: CreateThreadFromContextInput): boolean {
  const title = input.title.trim();
  if (!title) {
    return false;
  }
  const defaultTitle = input.contextType === 'normal' ? '普通聊天' : input.contextType === 'ip' ? 'IP 对话' : '知识库对话';
  return title !== defaultTitle;
}

function materialRulesForMode(boundaryMode: AiBoundaryMode): string {
  return boundaryMode === 'strict_material' ? STRICT_MATERIAL_RULES : MATERIAL_SESSION_RULES;
}

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

function openAiUsageObservationEnabled(provider: AiProviderRecord): boolean {
  if (provider.providerType !== 'openai' || provider.protocol !== 'openai_compatible') {
    return false;
  }
  try {
    return new URL(provider.baseUrl ?? '').hostname.toLowerCase() === 'api.openai.com';
  } catch {
    return false;
  }
}

function buildPromptSnapshotJson(input: {
  cacheObservationBase: ReturnType<typeof buildCacheObservationBase>;
  contextTrimmed: boolean;
  contextTrimmedByBudget: boolean;
  contextTrimmedByCount: boolean;
  failureReason?: string | null;
  materialRules: string | null;
  normalizedUsage: NormalizedProviderUsage | null;
  providerCachePolicy: ReturnType<typeof buildProviderCachePolicy>;
  stopReason?: string | null;
  system: string;
}): string {
  const cacheObservation = {
    ...input.cacheObservationBase,
    providerCache: buildProviderCacheObservation({
      normalizedUsage: input.normalizedUsage,
      providerCachePolicy: input.providerCachePolicy,
    }),
    failureReason: input.failureReason ?? null,
    stopReason: input.stopReason ?? null,
  };
  return JSON.stringify({
    cacheObservation,
    contextTrimmed: input.contextTrimmed,
    contextTrimmedByBudget: input.contextTrimmedByBudget,
    contextTrimmedByCount: input.contextTrimmedByCount,
    materialRules: input.materialRules,
    system: input.system,
  });
}

function mergeProviderUsage(previous: unknown, next: unknown): unknown {
  if (!previous || typeof previous !== 'object' || !next || typeof next !== 'object') {
    return next ?? previous;
  }
  return { ...(previous as Record<string, unknown>), ...(next as Record<string, unknown>) };
}

function truncateForPrompt(value: string, maxLength: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}...`;
}

function getQueryTerms(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[\s,，。！？!?;；:：、]+/).filter((term) => term.length >= 2))].slice(0, 10);
}

export function normalizeChatSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[，。！？、；：,.!?;:()[\]{}"'`*_#>\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactChatSearchText(value: string): string {
  return normalizeChatSearchText(value).replace(/\s+/g, '');
}

function buildChatSearchTerms(query: string): string[] {
  const normalized = normalizeChatSearchText(query);
  if (!normalized) {
    return [];
  }
  const terms = normalized.split(' ').filter(Boolean);
  return terms.length > 1 ? [...new Set(terms)] : [normalized];
}

function scoreChatSearchMessage(message: AiMessageWithCitations, rawQuery: string, terms: string[]): { matchKind: AiChatSearchMatchKind; rank: number } | null {
  const normalizedContent = normalizeChatSearchText(message.content);
  const normalizedQuery = normalizeChatSearchText(rawQuery);
  const compactContent = normalizedContent.replace(/\s+/g, '');
  const compactQuery = compactChatSearchText(rawQuery);
  if (!normalizedContent || !normalizedQuery) {
    return null;
  }
  if (normalizedContent.includes(normalizedQuery) || (compactQuery.length > 0 && compactContent.includes(compactQuery))) {
    return { matchKind: 'exact', rank: 0 };
  }
  if (terms.length > 0 && terms.every((term) => normalizedContent.includes(term) || compactContent.includes(term.replace(/\s+/g, '')))) {
    return { matchKind: 'exact', rank: 1 };
  }
  if (compactQuery.length >= 2 && compactQuery.split('').every((char) => compactContent.includes(char))) {
    return { matchKind: 'fuzzy', rank: 2 };
  }
  return null;
}

function buildChatSearchSnippet(content: string, rawQuery: string, terms: string[]): string {
  const normalizedContent = content.replace(/\s+/g, ' ').trim();
  if (!normalizedContent) {
    return '';
  }
  const loweredContent = normalizedContent.toLowerCase();
  const loweredQuery = rawQuery.trim().toLowerCase();
  const candidates = [loweredQuery, ...terms].filter(Boolean);
  const firstIndex = candidates.reduce((current, term) => {
    const index = loweredContent.indexOf(term);
    return index >= 0 ? Math.min(current, index) : current;
  }, Number.POSITIVE_INFINITY);
  const start = Number.isFinite(firstIndex) ? Math.max(0, firstIndex - 24) : 0;
  const end = Math.min(normalizedContent.length, start + 92);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalizedContent.length ? '...' : '';
  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

function toChatSearchResult(message: AiMessageWithCitations, rawQuery: string, terms: string[], matchKind: AiChatSearchMatchKind): AiChatSearchResult {
  return {
    content: message.content,
    createdAt: message.createdAt,
    matchKind,
    matchedTerms: terms,
    messageId: message.id,
    role: message.role,
    snippet: buildChatSearchSnippet(message.content, rawQuery, terms),
    versionIndex: message.versionIndex,
    versionTotal: message.versionTotal,
  };
}

function scoreTextForQuery(text: string, query: string): number {
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  let score = normalizedQuery && normalizedText.includes(normalizedQuery) ? 12 : 0;
  for (const term of getQueryTerms(query)) {
    if (normalizedText.includes(term)) {
      score += 3;
    }
  }
  return score;
}

function formatDeepMemorySection(input: {
  memories: AiMemoryRecord[];
  history: AiMessageRecord[];
}): string {
  const lines: string[] = [
    '深度记忆背景：以下内容只作为理解上下文的参考，不能覆盖用户当前最新要求、当前会话角色指令、安全规则或资料事实。回答时自然使用，不要模板化复述，也不要为了展示记忆而主动提到“记忆”。',
  ];
  if (input.memories.length > 0) {
    lines.push('相关长期记忆：');
    input.memories.forEach((memory, index) => {
      lines.push(`${index + 1}. ${truncateForPrompt(memory.content, 180)}`);
    });
  }
  if (input.history.length > 0) {
    lines.push('相关历史片段：');
    input.history.forEach((message, index) => {
      lines.push(`${index + 1}. ${message.role === 'assistant' ? 'AI' : '用户'}：${truncateForPrompt(message.content, 220)}`);
    });
  }
  return lines.join('\n');
}

async function retrieveDynamicMemoryContext(db: SQLiteDatabase, thread: AiThreadRecord, userMessage: string, branchScopes?: AiBranchScope[]): Promise<string> {
  const settings = await aiThreadRepository.getThreadMemorySettings(db, thread.id);
  if (!settings.deepMemoryEnabled) {
    return '';
  }
  const [memories, messages, recentMessages] = await Promise.all([
    aiThreadRepository.searchActiveMemoryFts(db, {
      branchScopes,
      boundIpId: thread.boundIpId,
      boundKnowledgeBaseId: thread.boundKnowledgeBaseId,
      query: userMessage,
      roleCardId: thread.roleCardId,
      space: thread.space,
      threadId: thread.id,
      limit: 80,
    }),
    aiThreadRepository.searchCompletedMessageFts(db, {
      branchScopes,
      limit: CHAT_HISTORY_MESSAGE_LIMIT + RELATED_HISTORY_LIMIT + 12,
      query: userMessage,
      threadId: thread.id,
    }),
    aiThreadRepository.listRecentCompletedNonSystemMessages(db, thread.id, CHAT_HISTORY_MESSAGE_LIMIT, branchScopes),
  ]);
  const rankedMemories = memories
    .map((memory) => ({
      memory,
      score: scoreTextForQuery(memory.content, userMessage) + memory.importance * 2 + (memory.type === 'correction' ? 4 : 0),
    }))
    .filter((item) => item.score > 0 || item.memory.importance >= 3)
    .sort((left, right) => right.score - left.score)
    .slice(0, DEEP_MEMORY_LIMIT)
    .map((item) => item.memory);
  const recentIds = new Set(recentMessages.map((message) => message.id));
  const rankedHistory = messages
    .filter((message) => message.status === 'completed' && message.role !== 'system' && !recentIds.has(message.id))
    .map((message) => ({ message, score: scoreTextForQuery(message.content, userMessage) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, RELATED_HISTORY_LIMIT)
    .map((item) => item.message);
  if (rankedMemories.length > 0) {
    await aiThreadRepository.touchMemories(db, rankedMemories.map((memory) => memory.id));
  }
  return formatDeepMemorySection({
    history: rankedHistory,
    memories: rankedMemories,
  });
}

function invalidThreadModel(message: string, providerId?: string | null, modelId?: string | null): ResolvedThreadChatModel {
  return { message, modelId, providerId, status: 'invalid_thread_model' };
}

function invalidGlobalDefault(message: string, providerId?: string | null, modelId?: string | null): ResolvedThreadChatModel {
  return { message, modelId, providerId, status: 'invalid_global_default' };
}

function modelInvalidMessage(source: ThreadModelSource): string {
  return source === 'global_default'
    ? '全局默认模型已失效，请重新配置默认模型，或为当前会话选择一个可用模型。'
    : '当前会话模型已失效，请重新选择模型，或切换为跟随全局默认。';
}

async function resolveThreadChatModel(space: PixorySpace, thread: ThreadModelConfig): Promise<ResolvedThreadChatModel> {
  await ensureBuiltInProviders(space);
  return runWithDatabaseSpace(space, async (db) => {
    const providers = await aiProviderRepository.listProviders(db);

    async function resolveProviderModel(provider: AiProviderRecord, modelId: string | null, source: ThreadModelSource): Promise<ResolvedThreadChatModel> {
      const models = await aiProviderRepository.listModels(db, provider.id);
      const explicitModel = modelId ? models.find((model) => model.modelId === modelId && model.supportsChat) ?? null : null;
      if (modelId && !explicitModel) {
        const message = modelInvalidMessage(source);
        return source === 'global_default'
          ? invalidGlobalDefault(message, provider.id, modelId)
          : invalidThreadModel(message, provider.id, modelId);
      }
      const defaultModel = provider.defaultChatModelId
        ? models.find((model) => model.modelId === provider.defaultChatModelId && model.supportsChat) ?? null
        : null;
      if (provider.defaultChatModelId && !defaultModel && !explicitModel) {
        const message = modelInvalidMessage(source);
        return source === 'global_default'
          ? invalidGlobalDefault(message, provider.id, provider.defaultChatModelId)
          : invalidThreadModel(message, provider.id, provider.defaultChatModelId);
      }
      const resolvedModel = explicitModel ?? defaultModel ?? models.find((model) => model.supportsChat) ?? null;
      if (!resolvedModel) {
        const message = modelInvalidMessage(source);
        return source === 'global_default'
          ? invalidGlobalDefault(message, provider.id, modelId)
          : invalidThreadModel(message, provider.id, modelId);
      }
      return {
        apiKey: thread.sessionApiKeyRef ? await getThreadProviderApiKey(space, thread.id, provider.id) : await getProviderApiKey(provider.id),
        modelId: resolvedModel.modelId,
        provider: {
          ...provider,
          baseUrl: thread.sessionBaseUrl ?? provider.baseUrl,
        },
        source,
        status: 'ready',
      };
    }

    if (thread.providerId) {
      const provider = providers.find((item) => item.id === thread.providerId) ?? null;
      if (!provider) {
        return invalidThreadModel('当前会话模型已失效，请重新选择模型，或切换为跟随全局默认。', thread.providerId, thread.modelId);
      }
      return resolveProviderModel(provider, thread.modelId, thread.modelId ? 'thread_model' : 'provider_default');
    }

    const defaultProviderId = await settingsRepository.getDefaultAiProviderId(db);
    const provider = defaultProviderId
      ? providers.find((item) => item.id === defaultProviderId) ?? null
      : providers[0] ?? null;
    if (!provider) {
      return invalidGlobalDefault('全局默认模型已失效，请重新配置默认模型，或为当前会话选择一个可用模型。', defaultProviderId, null);
    }
    return resolveProviderModel(provider, null, 'global_default');
  });
}

async function resolveDefaultThreadProvider(space: PixorySpace, providerId?: string | null, modelId?: string | null) {
  const provider = await runWithDatabaseSpace(space, async (db) => {
    if (providerId) {
      return aiProviderRepository.findProviderById(db, providerId);
    }
    const providers = await aiProviderRepository.listProviders(db);
    const defaultProviderId = await settingsRepository.getDefaultAiProviderId(db);
    if (defaultProviderId) {
      return providers.find((item) => item.id === defaultProviderId) ?? null;
    }
    return providers[0] ?? null;
  });
  if (!provider) {
    return { provider: null, model: null };
  }
  const models = await runWithDatabaseSpace(space, (db) => aiProviderRepository.listModels(db, provider.id));
  const model = (
    modelId ? models.find((item) => item.modelId === modelId && item.supportsChat) : null
  ) ?? (
    provider.defaultChatModelId ? models.find((item) => item.modelId === provider.defaultChatModelId && item.supportsChat) : null
  ) ?? models.find((item) => item.supportsChat) ?? null;
  return { provider, model };
}

async function resolveStreamingBranchScopes(
  db: SQLiteDatabase,
  input: { userMessageId: string; assistantMessageId: string }
): Promise<AiBranchScope[]> {
  const assistantMessage = await aiThreadRepository.findMessageById(db, input.assistantMessageId);
  if (assistantMessage?.branchRootMessageId && assistantMessage.branchVersionIndex) {
    return aiThreadRepository.resolveBranchLineage(db, assistantMessage.branchRootMessageId, assistantMessage.branchVersionIndex);
  }
  const userMessage = await aiThreadRepository.findMessageById(db, input.userMessageId);
  if (userMessage?.branchRootMessageId && userMessage.branchVersionIndex) {
    return aiThreadRepository.resolveBranchLineage(db, userMessage.branchRootMessageId, userMessage.branchVersionIndex);
  }
  return [];
}

async function buildPromptForThread(thread: AiThreadRecord, userMessage: string, branchScopes?: AiBranchScope[]) {
  const chatMode = deriveAiChatMode(thread, thread.space);
  const memoryPrefixPromise = runWithDatabaseSpace(thread.space, async (db) => {
    const memorySettings = await aiThreadRepository.getThreadMemorySettings(db, thread.id);
    return {
      companionMemoryPrefix: await buildCompanionMemoryPrefix(db, thread, { branchScopes, settings: memorySettings }),
      stableMemoryPrefix: await buildStableMemoryPrefix(db, thread, { branchScopes, settings: memorySettings }),
    };
  });
  const dynamicMemoryContextPromise = runWithDatabaseSpace(
    thread.space,
    async (db) => retrieveDynamicMemoryContext(db, thread, userMessage, branchScopes)
  );
  const threadMaterialRetrievalPromise = retrieveForThread({
    space: thread.space,
    ownerType: 'thread',
    ownerId: thread.id,
    query: userMessage,
  });
  const [{ companionMemoryPrefix, stableMemoryPrefix }, dynamicMemoryContext, threadMaterialRetrieval] = await Promise.all([
    memoryPrefixPromise,
    dynamicMemoryContextPromise,
    threadMaterialRetrievalPromise,
  ]);
  const threadMaterialSnippets = threadMaterialRetrieval.snippets;
  const memoryEpoch = [
    'thread',
    thread.id,
    thread.roleCardId ?? 'none',
    thread.boundaryMode,
    hashPromptCacheText([companionMemoryPrefix, stableMemoryPrefix].filter(Boolean).join('\n\n')).slice(0, 16),
  ].join(':');

  if (thread.contextType === 'normal') {
    return {
      prompt: buildNormalChatPrompt({
        chatMode,
        dynamicMemoryContext,
        memoryEpoch,
        roleInstructionWeight: thread.roleInstructionWeight,
        replyPreference: thread.replyPreference,
        companionMemoryPrefix,
        stableMemoryPrefix,
        systemPrompt: thread.contextType === 'normal' ? thread.systemPrompt : thread.systemPrompt || DEFAULT_AI_ROLE_PROMPT,
        materialSnippets: threadMaterialSnippets.map((snippet) => ({ label: snippet.label, text: snippet.text })),
        userMessage,
      }),
      snippets: threadMaterialSnippets,
    };
  }

  const ownerType = thread.contextType === 'ip' ? 'ip' : 'knowledge_base';
  const ownerId = thread.contextType === 'ip' ? String(thread.boundIpId ?? '') : thread.boundKnowledgeBaseId ?? '';
  const boundOwnerRetrievalPromise = ownerId
    ? retrieveForThread({
        space: thread.space,
        ownerType,
        ownerId,
        query: userMessage,
      })
    : { mode: 'keyword' as const, snippets: [] };
  const [, boundOwnerRetrieval] = await Promise.all([
    threadMaterialRetrievalPromise,
    boundOwnerRetrievalPromise,
  ]);
  const boundOwnerSnippets = boundOwnerRetrieval.snippets;
  const snippets = [...threadMaterialSnippets, ...boundOwnerSnippets];

  return {
    prompt: buildMaterialBoundPrompt({
      chatMode,
      editablePrompt: thread.systemPrompt || DEFAULT_AI_ROLE_PROMPT,
      dynamicMemoryContext,
      memoryEpoch,
      roleInstructionWeight: thread.roleInstructionWeight,
      replyPreference: thread.replyPreference,
      companionMemoryPrefix,
      stableMemoryPrefix,
      materialRules: materialRulesForMode(thread.boundaryMode),
      contextSummary: thread.title,
      snippets: snippets.map((snippet) => ({ label: snippet.label, text: snippet.text })),
      userMessage,
    }),
    snippets,
  };
}

export async function createThreadFromContext(input: CreateThreadFromContextInput): Promise<AiThreadRecord> {
  await ensureBuiltInProviders(input.space);
  const shouldUseFixedModel = Boolean(input.providerId || input.modelId);
  const { provider, model } = shouldUseFixedModel
    ? await resolveDefaultThreadProvider(input.space, input.providerId, input.modelId)
    : { provider: null, model: null };

  return runWithDatabaseSpace(input.space, (db) =>
    aiThreadRepository.createThread(db, {
      id: createAiId('aithread'),
      space: input.space,
      contextType: input.contextType,
      boundIpId: input.boundIpId ?? null,
      boundKnowledgeBaseId: input.boundKnowledgeBaseId ?? null,
      includeIpDocuments: input.includeIpDocuments ?? false,
      title: fallbackTitle(input),
      titleStatus: isCustomInitialTitle(input) ? 'custom' : 'fallback',
      providerId: shouldUseFixedModel && provider ? provider.id : null,
      modelId: shouldUseFixedModel && model ? model.modelId : null,
      modelSnapshotJson: shouldUseFixedModel ? JSON.stringify(model ?? {}) : '{}',
      roleInstructionWeight: input.roleInstructionWeight ?? 'default',
      replyPreference: input.replyPreference ?? 'auto',
      thinkingDisabled: input.thinkingDisabled ?? false,
      systemPrompt: input.systemPrompt ?? getDefaultThreadSystemPrompt(input.contextType),
      materialRulesSnapshot: input.contextType === 'normal' ? null : materialRulesForMode(input.boundaryMode ?? 'free'),
      boundaryMode: input.boundaryMode ?? 'free',
    })
  );
}

export async function createNormalThreadFromRoleCard(input: {
  roleCardId: string;
  space: PixorySpace;
}): Promise<AiThreadRecord> {
  await ensureBuiltInProviders(input.space);
  return runWithDatabaseSpace(input.space, async (db) => {
    const roleCard = await aiRoleCardRepository.findById(db, input.roleCardId);
    if (!roleCard || roleCard.space !== input.space) {
      throw new Error('角色卡不存在。');
    }
    let createdThread: AiThreadRecord | null = null;
    await db.withTransactionAsync(async () => {
      const thread = await aiThreadRepository.createThread(db, {
        id: createAiId('aithread'),
        space: input.space,
        contextType: 'normal',
        boundIpId: null,
        boundKnowledgeBaseId: null,
        includeIpDocuments: false,
        title: roleCard.name,
        titleStatus: 'custom',
        providerId: null,
        modelId: null,
        modelSnapshotJson: '{}',
        roleCardId: roleCard.id,
        roleSnapshotJson: JSON.stringify(roleCard),
        roleInstructionWeight: 'default',
        replyPreference: 'auto',
        thinkingDisabled: false,
        systemPrompt: roleCard.prompt,
        materialRulesSnapshot: null,
        boundaryMode: roleCard.boundaryMode,
        lastMessagePreview: roleCard.firstMessage?.slice(0, 80) ?? null,
      });
      if (roleCard.firstMessage?.trim()) {
        await aiThreadRepository.createMessage(db, {
          id: createAiId('aimsg'),
          threadId: thread.id,
          role: 'assistant',
          status: 'completed',
          content: roleCard.firstMessage.trim(),
          completedAt: new Date().toISOString(),
        });
      }
      createdThread = thread;
    });
    if (!createdThread) {
      throw new Error('创建角色聊天失败。');
    }
    return createdThread;
  });
}

export async function loadThreadTitle(space: PixorySpace, threadId: string): Promise<string | null> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    return thread && thread.space === space ? thread.title : null;
  });
}

export async function getCurrentChatModelLabel(space: PixorySpace, threadId?: string | null): Promise<string> {
  await ensureBuiltInProviders(space);
  const thread = threadId ? await runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId)) : null;
  const resolved = await resolveThreadChatModel(space, thread ?? emptyThreadModelConfig(space));
  if (resolved.status !== 'ready') {
    return resolved.status === 'invalid_global_default' ? '全局默认模型已失效' : '当前会话模型已失效';
  }
  const model = await runWithDatabaseSpace(space, (db) => aiProviderRepository.findModel(db, resolved.provider.id, resolved.modelId));
  const modelName = model?.displayName ?? resolved.modelId;
  return `${resolved.provider.displayName} · ${modelName}`;
}

async function loadBranchRootMessages(
  db: SQLiteDatabase,
  threadId: string,
  messages: AiMessageRecord[]
): Promise<AiMessageRecord[]> {
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  let pendingRootIds = [...new Set(messages
    .map((message) => message.branchRootMessageId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .filter((id) => !messagesById.has(id)))];
  while (pendingRootIds.length > 0) {
    const roots = (await aiThreadRepository.findMessagesByIds(db, pendingRootIds))
      .filter((message) => message.threadId === threadId);
    pendingRootIds = [];
    for (const root of roots) {
      if (messagesById.has(root.id)) {
        continue;
      }
      messagesById.set(root.id, root);
      if (root.branchRootMessageId && !messagesById.has(root.branchRootMessageId)) {
        pendingRootIds.push(root.branchRootMessageId);
      }
    }
    pendingRootIds = [...new Set(pendingRootIds)];
  }
  return [...messagesById.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
  );
}

export async function listThreadMessages(space: PixorySpace, threadId: string, options: ListThreadMessagesOptions = {}): Promise<AiMessageWithCitations[]> {
  return runWithDatabaseSpace(space, async (db) => {
    const messages = await aiThreadRepository.listMessagesBase(db, threadId, options.limit, options.branchScopes);
    const messagesWithBranchRoots = await loadBranchRootMessages(db, threadId, messages);
    const messageIds = messagesWithBranchRoots.map((message) => message.id);
    const [versionTotalsByMessageId, citationsByMessageId] = await Promise.all([
      aiThreadRepository.listMessageVersionTotalsForMessages(db, messageIds),
      aiThreadRepository.listCitationsForMessages(db, messageIds),
    ]);
    const selectedVersionEntries = messagesWithBranchRoots
      .map((message) => {
        const versionTotal = versionTotalsByMessageId[message.id] ?? 1;
        const selectedVersionIndex = options.selectedVersionByMessageId?.[message.id];
        if (!selectedVersionIndex || selectedVersionIndex >= versionTotal) {
          return null;
        }
        return {
          messageId: message.id,
          versionIndex: selectedVersionIndex,
        };
      })
      .filter((selection): selection is { messageId: string; versionIndex: number } => Boolean(selection));
    const selectedVersionsByMessageId = selectedVersionEntries.length > 0
      ? await aiThreadRepository.listMessageVersionsByIndexForMessages(db, selectedVersionEntries)
      : {};
    return messagesWithBranchRoots.map((message) => {
      const versionTotal = versionTotalsByMessageId[message.id] ?? 1;
      const selectedVersion = selectedVersionsByMessageId[message.id] ?? null;
      return {
        ...message,
        citations: citationsByMessageId[message.id] ?? [],
        messageVersions: selectedVersion ? [selectedVersion] : [],
        versionIndex: selectedVersion?.versionIndex ?? versionTotal,
        versionTotal,
      };
    });
  });
}

export async function searchThreadMessages(input: {
  space: PixorySpace;
  threadId: string;
  query: string;
  branchScopes?: AiBranchScope[];
  offset?: number;
  limit?: number;
}): Promise<{ results: AiChatSearchResult[]; hasMore: boolean }> {
  const terms = buildChatSearchTerms(input.query);
  const limit = Math.max(1, input.limit ?? 40);
  const offset = Math.max(0, input.offset ?? 0);
  if (terms.length === 0) {
    return { hasMore: false, results: [] };
  }
  const branchScopes = input.branchScopes ?? [];
  const messages = await listThreadMessages(input.space, input.threadId, {
    branchScopes,
  });
  const matches = messages
    .filter((message) => message.role !== 'system')
    .map((message) => {
      const score = scoreChatSearchMessage(message, input.query, terms);
      return score ? { message, ...score } : null;
    })
    .filter((item): item is { message: AiMessageWithCitations; matchKind: AiChatSearchMatchKind; rank: number } => Boolean(item))
    .sort((left, right) =>
      left.rank - right.rank ||
      left.message.createdAt.localeCompare(right.message.createdAt) ||
      left.message.id.localeCompare(right.message.id)
    )
    .map((item) => toChatSearchResult(item.message, input.query, terms, item.matchKind));
  return {
    hasMore: offset + limit < matches.length,
    results: matches.slice(offset, offset + limit),
  };
}

export async function loadThreadAvatarConfig(space: PixorySpace, threadId: string): Promise<AiThreadAvatarConfig> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread || thread.space !== space) {
      return { avatarEnabled: false, avatarUri: null };
    }
    return parseThreadAvatarConfig(thread.roleSnapshotJson);
  });
}

export async function listAiHistoryThreads(input: {
  space: PixorySpace;
  filter?: AiThreadHistoryFilter;
  limit?: number;
  searchText?: string;
}): Promise<AiThreadHistoryItem[]> {
  return runWithDatabaseSpace(input.space, (db) => aiThreadRepository.listHistoryItems(db, input.space, input.filter ?? 'all', input.limit ?? 100, input.searchText ?? ''));
}

export async function listAiHomeThreads(input: {
  space: PixorySpace;
  limit?: number;
}): Promise<AiHomeThreadItem[]> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const threads = await aiThreadRepository.listHistoryItems(db, input.space, 'all', input.limit ?? 30, '');
    const activeRoleCardIds = new Set((await aiRoleCardRepository.listActive(db, input.space)).map((roleCard) => roleCard.id));
    return Promise.all(
      threads.map(async (thread) => {
        const roleCard = thread.roleCardId ? await aiRoleCardRepository.findById(db, thread.roleCardId) : null;
        return {
          ...thread,
          avatar: parseThreadAvatarConfig(thread.roleSnapshotJson),
          avatarAvailable: thread.roleCardId ? activeRoleCardIds.has(thread.roleCardId) : false,
          roleCardName: roleCard?.name ?? null,
        };
      })
    );
  });
}

export async function archiveAiThread(space: PixorySpace, threadId: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiThreadRepository.updateThread(db, threadId, { archivedAt: new Date().toISOString() }));
}

export async function loadThreadSessionConfig(space: PixorySpace, threadId: string): Promise<AiThreadSessionConfig | null> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread || thread.space !== space) {
      return null;
    }
    const roleCard = thread.roleCardId ? await aiRoleCardRepository.findById(db, thread.roleCardId) : null;
    const memorySettings = await aiThreadRepository.getThreadMemorySettings(db, thread.id);
    const memoryJob = await aiThreadRepository.getThreadMemoryJob(db, thread.id);
    return {
      thread,
      roleCardName: roleCard?.name ?? null,
      avatar: parseThreadAvatarConfig(thread.roleSnapshotJson),
      deepMemoryEnabled: memorySettings.deepMemoryEnabled,
      lastMaintenanceError: memoryJob.lastMaintenanceError,
    };
  });
}

function emptyAiUsageAggregate(): AiUsageAggregate {
  return aggregateAiUsageObservations({ observations: [] });
}

function usageSinceForWindow(window: '7d' | '30d' | 'all'): string | null {
  if (window === 'all') {
    return null;
  }
  const days = window === '7d' ? 7 : 30;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export async function loadAiUsageOverview(
  space: PixorySpace,
  window: '7d' | '30d' | 'all' = '30d'
): Promise<AiUsageAggregate> {
  return runWithDatabaseSpace(space, async (db) => {
    const rows = await aiThreadRepository.listAssistantUsageObservationMessages(db, {
      limit: 600,
      since: usageSinceForWindow(window),
      space,
    });
    return aggregateAiUsageObservations({ observations: rows, recentLimit: 10 });
  });
}

export async function loadThreadAiUsageOverview(space: PixorySpace, threadId: string): Promise<AiUsageAggregate> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread || thread.space !== space) {
      return emptyAiUsageAggregate();
    }
    const rows = await aiThreadRepository.listThreadAssistantUsageObservationMessages(db, {
      limit: 80,
      space,
      threadId,
    });
    return aggregateAiUsageObservations({ observations: rows, recentLimit: 12 });
  });
}

export async function loadThreadSessionModelConfig(space: PixorySpace, threadId: string): Promise<AiThreadSessionModelConfig | null> {
  const [thread, cards, defaultLabel] = await Promise.all([
    runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId)),
    listProviderCards(space),
    getCurrentChatModelLabel(space, null),
  ]);
  if (!thread || thread.space !== space) {
    return null;
  }

  const options: AiSessionModelOption[] = cards.flatMap((card) =>
    card.models
      .filter((model) => model.supportsChat)
      .map((model) => ({
        hasApiKey: card.hasApiKey,
        label: model.displayName,
        modelId: model.modelId,
        providerId: card.provider.id,
        providerLabel: card.provider.displayName,
      }))
  );
  const resolvedModel = await resolveThreadChatModel(space, thread);
  const resolvedOption = resolvedModel.status === 'ready'
    ? options.find((option) => option.providerId === resolvedModel.provider.id && option.modelId === resolvedModel.modelId) ?? null
    : null;
  const currentStatus: AiThreadSessionModelConfig['currentStatus'] = !thread.providerId
    ? 'follow_default'
    : resolvedModel.status !== 'ready'
      ? 'invalid'
      : thread.modelId
        ? 'fixed_model'
        : 'fixed_provider';

  return {
    currentLabel:
      currentStatus === 'follow_default'
        ? `跟随全局默认（当前：${defaultLabel}）`
        : resolvedModel.status === 'ready'
          ? `${resolvedModel.provider.displayName} · ${resolvedOption?.label ?? resolvedModel.modelId}`
            : '模型配置已失效',
    currentStatus,
    followDefaultLabel: `跟随全局默认（当前：${defaultLabel}）`,
    modelId: thread.modelId,
    options,
    providerId: thread.providerId,
    sessionBaseUrl: thread.sessionBaseUrl,
    sessionHasApiKeyOverride: thread.providerId ? await hasThreadProviderApiKey(space, thread.id, thread.providerId) : false,
  };
}

export async function saveThreadSessionModelOverride(input: {
  apiKey?: string | null;
  baseUrl?: string | null;
  modelId: string | null;
  providerId: string | null;
  space: PixorySpace;
  threadId: string;
}): Promise<AiThreadRecord | null> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread || thread.space !== input.space) {
      return null;
    }
    let sessionApiKeyRef = thread.sessionApiKeyRef;
    if (thread.providerId && thread.providerId !== input.providerId) {
      await deleteThreadProviderApiKey(input.space, input.threadId, thread.providerId);
      sessionApiKeyRef = null;
    }
    if (input.providerId && input.apiKey !== undefined) {
      sessionApiKeyRef = await setThreadProviderApiKey(input.space, input.threadId, input.providerId, input.apiKey ?? '');
    }
    return aiThreadRepository.updateThread(db, input.threadId, {
      modelId: input.modelId,
      providerId: input.providerId,
      sessionApiKeyRef,
      sessionBaseUrl: input.baseUrl?.trim() || null,
    });
  });
}

export async function clearThreadSessionModelOverride(space: PixorySpace, threadId: string): Promise<AiThreadRecord | null> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread || thread.space !== space) {
      return null;
    }
    if (thread.providerId) {
      await deleteThreadProviderApiKey(space, threadId, thread.providerId);
    }
    return aiThreadRepository.updateThread(db, threadId, {
      modelId: null,
      providerId: null,
      sessionApiKeyRef: null,
      sessionBaseUrl: null,
    });
  });
}

export async function updateAiThreadSessionConfig(input: UpdateAiThreadSessionConfigInput): Promise<AiThreadRecord | null> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread || thread.space !== input.space) {
      return null;
    }
    const updated = await aiThreadRepository.updateThread(db, input.threadId, {
      boundaryMode: input.boundaryMode,
      materialRulesSnapshot: thread.contextType === 'normal' ? null : materialRulesForMode(input.boundaryMode),
      modelId: input.modelId,
      providerId: input.providerId,
      roleSnapshotJson:
        input.avatarEnabled == null
          ? thread.roleSnapshotJson
          : patchThreadRoleSnapshot(thread.roleSnapshotJson, { avatarEnabled: input.avatarEnabled }),
      roleInstructionWeight: input.roleInstructionWeight,
      replyPreference: input.replyPreference,
      thinkingDisabled: input.thinkingDisabled,
      systemPrompt: input.systemPrompt.trim() || getDefaultThreadSystemPrompt(thread.contextType),
    });
    if (input.deepMemoryEnabled != null) {
      await aiThreadRepository.updateThreadMemorySettings(db, input.threadId, input.deepMemoryEnabled);
    }
    return updated;
  });
}

export async function applyRoleCardToThread(input: ApplyRoleCardToThreadInput): Promise<AiThreadRecord | null> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread || thread.space !== input.space) {
      return null;
    }
    const roleCard = input.roleCardId ? await aiRoleCardRepository.findById(db, input.roleCardId) : null;
    const nextBoundaryMode = roleCard?.boundaryMode ?? thread.boundaryMode;
    return aiThreadRepository.updateThread(db, input.threadId, {
      boundaryMode: nextBoundaryMode,
      materialRulesSnapshot: thread.contextType === 'normal' ? null : materialRulesForMode(nextBoundaryMode),
      roleCardId: roleCard?.id ?? null,
      roleSnapshotJson: JSON.stringify(roleCard ?? {}),
      systemPrompt: roleCard?.prompt ?? getDefaultThreadSystemPrompt(thread.contextType),
    });
  });
}

export async function renameAiThread(space: PixorySpace, threadId: string, title: string): Promise<AiThreadRecord | null> {
  const nextTitle = title.replace(/\s+/g, ' ').trim();
  if (!nextTitle) {
    throw new Error('聊天名称不能为空。');
  }
  return runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.updateThread(db, threadId, {
      title: nextTitle.slice(0, 40),
      titleStatus: 'custom',
    })
  );
}

export async function unarchiveAiThread(space: PixorySpace, threadId: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiThreadRepository.updateThread(db, threadId, { archivedAt: null }));
}

export async function deleteAiThreads(space: PixorySpace, threadIds: string[]): Promise<number> {
  const uniqueThreadIds = Array.from(new Set(threadIds));
  if (uniqueThreadIds.length === 0) {
    return 0;
  }
  return runWithDatabaseSpace(space, (db) => aiThreadRepository.softDeleteThreads(db, space, uniqueThreadIds));
}

export async function permanentlyDeleteAiThreads(space: PixorySpace, threadIds: string[]): Promise<number> {
  const uniqueThreadIds = Array.from(new Set(threadIds));
  if (uniqueThreadIds.length === 0) {
    return 0;
  }
  const deletedFileUris: string[] = [];
  return runWithDatabaseSpace(space, async (db) => {
    let deletedCount = 0;
    await db.withTransactionAsync(async () => {
      await removeMaterialsByOwner({
        db,
        deletedFileUris,
        space,
        ownerType: 'thread',
        ownerIds: uniqueThreadIds,
      });
      deletedCount = await aiThreadRepository.deleteThreads(db, uniqueThreadIds);
    });
    await cleanupDeletedMaterialFiles(deletedFileUris);
    return deletedCount;
  });
}

export async function moveAiThreadsBetweenSpaces(input: MoveAiThreadsInput): Promise<number> {
  const uniqueThreadIds = Array.from(new Set(input.threadIds));
  if (uniqueThreadIds.length === 0) {
    return 0;
  }
  if (input.sourceSpace === input.targetSpace) {
    return 0;
  }
  if (input.targetSpace === 'personal') {
    const verified = await verifyPersonalPassword(input.personalPassword ?? '');
    if (!verified.ok) {
      throw new Error(verified.message ?? '隐私密码不正确。');
    }
  }

  const snapshots = await runWithDatabaseSpace(input.sourceSpace, async (db) => {
    const exported = [];
    for (const threadId of uniqueThreadIds) {
      const snapshot = await aiThreadRepository.exportThread(db, threadId);
      if (snapshot && snapshot.thread.space === input.sourceSpace) {
        exported.push(snapshot);
      }
    }
    return exported;
  });

  if (snapshots.length === 0) {
    return 0;
  }

  const movedThreadIds = snapshots.map((snapshot) => snapshot.thread.id);
  let targetImported = false;
  try {
    await runWithDatabaseSpace(input.targetSpace, async (db) => {
      await db.withTransactionAsync(async () => {
        for (const snapshot of snapshots) {
          await aiThreadRepository.importThread(db, snapshot, input.targetSpace);
        }
      });
    });
    targetImported = true;

    await moveThreadOwnedMaterialsBetweenSpaces({
      cleanupSource: false,
      sourceSpace: input.sourceSpace,
      targetSpace: input.targetSpace,
      threadIds: movedThreadIds,
    });

    const deletedFileUris: string[] = [];
    await runWithDatabaseSpace(input.sourceSpace, async (db) => {
      await db.withTransactionAsync(async () => {
        await removeMaterialsByOwner({
          db,
          deletedFileUris,
          space: input.sourceSpace,
          ownerType: 'thread',
          ownerIds: movedThreadIds,
        });
        await aiThreadRepository.deleteThreads(db, movedThreadIds);
      });
    });
    await cleanupDeletedMaterialFiles(deletedFileUris);
  } catch (error) {
    if (targetImported) {
      try {
        await permanentlyDeleteAiThreads(input.targetSpace, movedThreadIds);
      } catch (rollbackError) {
        console.warn('Pixory AI thread move rollback failed.', {
          message: rollbackError instanceof Error ? rollbackError.message : 'unknown rollback error',
        });
      }
    }
    throw error;
  }

  return snapshots.length;
}

async function markAssistantFailed(
  space: PixorySpace,
  assistantMessageId: string,
  message: string,
  partialContent = '',
  partialReasoningText: string | null = null,
  promptSnapshotJson?: string
): Promise<void> {
  await runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.updateMessage(db, assistantMessageId, {
      status: 'failed',
      content: partialContent,
      reasoningText: partialReasoningText,
      errorMessage: message,
      ...(promptSnapshotJson ? { promptSnapshotJson } : {}),
      completedAt: new Date().toISOString(),
    })
  );
}

async function markAssistantStopped(
  space: PixorySpace,
  assistantMessageId: string,
  partialContent?: string,
  partialReasoningText?: string | null,
  promptSnapshotJson?: string
): Promise<string> {
  const completedAt = new Date().toISOString();
  await runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.updateMessage(db, assistantMessageId, {
      status: 'stopped',
      content: partialContent,
      reasoningText: partialReasoningText,
      ...(promptSnapshotJson ? { promptSnapshotJson } : {}),
      completedAt,
    })
  );
  stoppedMessageIds.delete(assistantMessageId);
  return completedAt;
}

async function snapshotMessageVersion(
  db: SQLiteDatabase,
  message: AiMessageRecord
): Promise<AiMessageVersionRecord> {
  const citations = await aiThreadRepository.listCitations(db, message.id);
  return aiThreadRepository.createMessageVersion(db, {
    id: createAiId('aimver'),
    originalMessageId: message.id,
    threadId: message.threadId,
    role: message.role,
    status: message.status,
    content: message.content,
    reasoningText: message.reasoningText,
    errorMessage: message.errorMessage,
    providerId: message.providerId,
    modelId: message.modelId,
    modelSnapshotJson: message.modelSnapshotJson,
    promptSnapshotJson: message.promptSnapshotJson,
    citations,
    messageCreatedAt: message.createdAt,
    messageUpdatedAt: message.updatedAt,
    messageCompletedAt: message.completedAt,
  });
}

function buildChatHistory(messages: AiMessageRecord[], userMessageId: string): {
  contextTrimmedByBudget: boolean;
  history: Array<{ role: 'assistant' | 'user'; content: string }>;
} {
  const userIndex = messages.findIndex((message) => message.id === userMessageId);
  const previousMessages = userIndex >= 0 ? messages.slice(0, userIndex) : messages;
  const completedMessages = previousMessages
    .filter((message) => message.role !== 'system' && message.status === 'completed')
    .slice(-CHAT_HISTORY_MESSAGE_LIMIT);
  const budgeted = trimMessagesToContextBudget({
    messages: completedMessages,
    protectedPrompt: 'Current user message and role instruction are protected from context trimming.',
  });
  return {
    contextTrimmedByBudget: budgeted.trimmed,
    history: budgeted.messages
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: message.content,
      })),
  };
}

async function finalizeThreadTitleAfterReply(input: {
  space: PixorySpace;
  thread: AiThreadRecord;
  userMessage: Pick<AiMessageRecord, 'content'>;
  assistantReply: string;
}): Promise<void> {
  const nextTitle = generateAiThreadTitle({
    assistantReply: input.assistantReply,
    contextTitle: input.thread.title,
    contextType: input.thread.contextType,
    firstUserMessage: input.userMessage.content,
  });
  await runWithDatabaseSpace(input.space, async (db) => {
    const current = await aiThreadRepository.findThreadById(db, input.thread.id);
    if (!current || current.space !== input.space || current.titleStatus !== 'fallback') {
      return;
    }
    await aiThreadRepository.updateThread(db, input.thread.id, {
      title: nextTitle,
      titleStatus: 'generated',
    });
  });
}

async function maybeGenerateModelThreadTitleAfterReply(input: {
  branchScopes?: AiBranchScope[];
  onUpdated?: () => void;
  space: PixorySpace;
  thread: AiThreadRecord;
}): Promise<void> {
  try {
    const snapshot = await runWithDatabaseSpace(input.space, async (db) => {
      const current = await aiThreadRepository.findThreadById(db, input.thread.id);
      if (!current || current.space !== input.space || current.titleStatus !== 'generated') {
        return null;
      }
      if (current.modelTitleGeneratedAt) {
        return null;
      }
      const completedCount = await aiThreadRepository.countCompletedNonSystemMessages(db, input.thread.id, input.branchScopes);
      if (completedCount < MODEL_TITLE_MIN_COMPLETED_MESSAGES) {
        return { completedMessages: [], current };
      }
      const completedMessages = await aiThreadRepository.listRecentCompletedNonSystemMessages(
        db,
        input.thread.id,
        MODEL_TITLE_MIN_COMPLETED_MESSAGES,
        input.branchScopes
      );
      return { completedMessages, current };
    });
    if (!snapshot || snapshot.completedMessages.length !== MODEL_TITLE_MIN_COMPLETED_MESSAGES) {
      return;
    }
    const title = await generateModelThreadTitle({
      completedMessages: snapshot.completedMessages,
      space: input.space,
      thread: snapshot.current,
    });
    if (!title) {
      return;
    }
    const updated = await runWithDatabaseSpace(input.space, async (db) => {
      const current = await aiThreadRepository.findThreadById(db, input.thread.id);
      if (!current || current.space !== input.space || current.titleStatus !== 'generated') {
        return null;
      }
      if (current.modelTitleGeneratedAt) {
        return null;
      }
      return aiThreadRepository.updateThread(db, input.thread.id, {
        modelTitleGeneratedAt: new Date().toISOString(),
        title,
        titleStatus: 'generated',
      });
    });
    if (updated) {
      input.onUpdated?.();
    }
  } catch {
    // Title generation is a non-critical polish pass; keep the completed reply intact.
  }
}

async function streamAssistantReply(input: {
  space: PixorySpace;
  thread: AiThreadRecord;
  userMessage: Pick<AiMessageRecord, 'id' | 'content'>;
  assistantMessageId: string;
  signal?: AbortSignal;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onUpdated?: () => void;
}): Promise<void> {
  let answerText = '';
  let reasoningText = '';
  let assistantReset = false;
  const stopForAbort = async (options?: { promptSnapshotJson?: string }): Promise<boolean> => {
    if (!input.signal?.aborted) {
      return false;
    }
    const completedAt = await markAssistantStopped(
      input.space,
      input.assistantMessageId,
      assistantReset ? answerText : undefined,
      assistantReset ? reasoningText || null : undefined,
      options?.promptSnapshotJson
    );
    input.onMessagePatch?.({
      id: input.assistantMessageId,
      status: 'stopped',
      content: assistantReset ? answerText : undefined,
      reasoningText: assistantReset ? reasoningText || null : undefined,
      completedAt,
    });
    input.onUpdated?.();
    return true;
  };
  if (await stopForAbort()) {
    return;
  }
  stoppedMessageIds.delete(input.assistantMessageId);
  const startedAt = new Date().toISOString();
  await runWithDatabaseSpace(input.space, async (db) => {
    await aiThreadRepository.updateMessage(db, input.assistantMessageId, {
      status: 'generating',
      content: '',
      reasoningText: null,
      errorMessage: null,
      providerId: null,
      modelId: null,
      modelSnapshotJson: '{}',
      promptSnapshotJson: '{}',
      createdAt: startedAt,
      completedAt: null,
    });
    await aiThreadRepository.replaceCitations(db, input.assistantMessageId, []);
  });
  assistantReset = true;
  input.onMessagePatch?.({
    id: input.assistantMessageId,
    status: 'generating',
    content: '',
    reasoningText: null,
    errorMessage: null,
    providerId: null,
    modelId: null,
    modelSnapshotJson: '{}',
    promptSnapshotJson: '{}',
    createdAt: startedAt,
    completedAt: null,
    citations: [],
  });
  input.onUpdated?.();

  if (await stopForAbort()) {
    return;
  }

  const resolvedModel = await resolveThreadChatModel(input.space, input.thread);
  if (await stopForAbort()) {
    return;
  }
  if (resolvedModel.status !== 'ready') {
    await markAssistantFailed(input.space, input.assistantMessageId, resolvedModel.message);
    input.onMessagePatch?.({ id: input.assistantMessageId, status: 'failed', content: '', reasoningText: null, errorMessage: resolvedModel.message, completedAt: new Date().toISOString() });
    input.onUpdated?.();
    return;
  }
  const { apiKey, modelId, provider } = resolvedModel;
  if (!apiKey) {
    const apiKeyMessage = '当前模型账号不可用，请检查 API key 或切换当前会话模型。';
    await markAssistantFailed(input.space, input.assistantMessageId, apiKeyMessage);
    input.onMessagePatch?.({ id: input.assistantMessageId, status: 'failed', content: '', reasoningText: null, errorMessage: apiKeyMessage, completedAt: new Date().toISOString() });
    input.onUpdated?.();
    return;
  }

  const branchScopes = await runWithDatabaseSpace(input.space, (db) =>
    resolveStreamingBranchScopes(db, {
      assistantMessageId: input.assistantMessageId,
      userMessageId: input.userMessage.id,
    })
  );
  const { prompt, snippets } = await buildPromptForThread(input.thread, input.userMessage.content, branchScopes);
  if (await stopForAbort()) {
    return;
  }
  const historySource = await runWithDatabaseSpace(input.space, (db) =>
    aiThreadRepository.listRecentCompletedMessagesBefore(
      db,
      input.thread.id,
      input.userMessage.id,
      CHAT_HISTORY_MESSAGE_LIMIT + 1,
      branchScopes
    )
  );
  if (await stopForAbort()) {
    return;
  }
  const contextTrimmedByCount = historySource.length > CHAT_HISTORY_MESSAGE_LIMIT;
  const historyMessages = contextTrimmedByCount ? historySource.slice(1) : historySource;
  const { contextTrimmedByBudget, history } = buildChatHistory(historyMessages, input.userMessage.id);
  const contextTrimmed = contextTrimmedByCount || contextTrimmedByBudget;
  const requestedAt = startedAt;
  const previousRequestAt = historyMessages.at(-1)?.completedAt ?? null;
  const turnIntervalMs = previousRequestAt ? Date.parse(requestedAt) - Date.parse(previousRequestAt) : null;
  const promptCacheSettings = await resolvePromptCacheSettings(input.space);
  const providerCachePolicy = buildProviderCachePolicy({
    metadata: prompt.cacheMetadata,
    modelId,
    previousRequestAt,
    provider: {
      ...provider,
      openAiUsageObservationEnabled: openAiUsageObservationEnabled(provider),
    },
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
    ttlLikelyExpired: ttlLikelyExpired({ previousRequestAt, provider, requestedAt, settings: promptCacheSettings }),
    turnIntervalMs: turnIntervalMs != null && Number.isFinite(turnIntervalMs) ? turnIntervalMs : null,
  });
  let providerUsageRaw: unknown = null;
  const createPromptSnapshotJson = (input?: { failureReason?: string | null; stopReason?: string | null }) => buildPromptSnapshotJson({
    cacheObservationBase,
    contextTrimmed,
    contextTrimmedByBudget,
    contextTrimmedByCount,
    failureReason: input?.failureReason ?? null,
    materialRules: prompt.materialRules ?? null,
    normalizedUsage: providerUsageRaw ? normalizeProviderUsage(provider.protocol, providerUsageRaw) : null,
    providerCachePolicy,
    stopReason: input?.stopReason ?? null,
    system: prompt.system,
  });

  let streamFailed = false;
  let lastPersistAt = 0;
  let lastUiPatchAt = 0;
  const adapter = getAdapterForProvider(provider);
  const emitStreamingPatch = (force = false) => {
    if (input.signal?.aborted) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastUiPatchAt < STREAMING_UI_PATCH_INTERVAL_MS) {
      return;
    }
    lastUiPatchAt = now;
    input.onMessagePatch?.({
      id: input.assistantMessageId,
      content: answerText,
      reasoningText: reasoningText || null,
      status: 'generating',
    });
  };
  const persistStreamingSnapshot = async (force = false) => {
    if (input.signal?.aborted) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastPersistAt < STREAMING_PERSIST_INTERVAL_MS) {
      return;
    }
    lastPersistAt = now;
    await runWithDatabaseSpace(input.space, (db) =>
      aiThreadRepository.updateMessage(db, input.assistantMessageId, {
        content: answerText,
        reasoningText: reasoningText || null,
      })
    );
  };

  try {
    await adapter.streamChat(
      {
        apiKey,
        baseUrl: provider.baseUrl ?? '',
        modelId,
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        history,
        providerCachePolicy,
        thinkingDisabled: input.thread.thinkingDisabled,
        signal: input.signal,
      },
      async (event: AiStreamEvent) => {
        if (input.signal?.aborted || stoppedMessageIds.has(input.assistantMessageId)) {
          return;
        }
        if (event.type === 'provider_usage') {
          providerUsageRaw = mergeProviderUsage(providerUsageRaw, event.rawUsage);
          return;
        }
        if (event.type === 'answer_delta') {
          answerText += event.text;
        }
        if (event.type === 'reasoning_delta' && !input.thread.thinkingDisabled) {
          reasoningText += event.text;
        }
        if (event.type === 'answer_delta' || (event.type === 'reasoning_delta' && !input.thread.thinkingDisabled)) {
          emitStreamingPatch();
          await persistStreamingSnapshot();
        }
        if (event.type === 'error') {
          streamFailed = true;
          const readableError = normalizeAiErrorMessage(event.message);
          await markAssistantFailed(input.space, input.assistantMessageId, readableError, answerText, reasoningText || null, createPromptSnapshotJson({ failureReason: readableError }));
          input.onMessagePatch?.({ id: input.assistantMessageId, status: 'failed', content: answerText, reasoningText: reasoningText || null, errorMessage: readableError, completedAt: new Date().toISOString() });
          input.onUpdated?.();
        }
      }
    );
  } catch (error) {
    if (await stopForAbort({ promptSnapshotJson: createPromptSnapshotJson({ stopReason: 'aborted' }) })) {
      return;
    }
    streamFailed = true;
    const readableError = normalizeAiErrorMessage(error);
    await markAssistantFailed(input.space, input.assistantMessageId, readableError, answerText, reasoningText || null, createPromptSnapshotJson({ failureReason: readableError }));
    input.onMessagePatch?.({ id: input.assistantMessageId, status: 'failed', content: answerText, reasoningText: reasoningText || null, errorMessage: readableError, completedAt: new Date().toISOString() });
    input.onUpdated?.();
  }

  if (streamFailed) {
    return;
  }

  if (await stopForAbort({ promptSnapshotJson: createPromptSnapshotJson({ stopReason: 'aborted' }) })) {
    return;
  }

  await persistStreamingSnapshot(true);
  emitStreamingPatch(true);

  if (await stopForAbort({ promptSnapshotJson: createPromptSnapshotJson({ stopReason: 'aborted' }) })) {
    return;
  }

  if (stoppedMessageIds.has(input.assistantMessageId)) {
    const completedAt = await markAssistantStopped(input.space, input.assistantMessageId, answerText, reasoningText || null, createPromptSnapshotJson({ stopReason: 'user_stopped' }));
    input.onMessagePatch?.({ id: input.assistantMessageId, status: 'stopped', content: answerText, reasoningText: reasoningText || null, completedAt });
    input.onUpdated?.();
    return;
  }

  let finalCitations: AiCitationRecord[] = [];
  const completedAt = new Date().toISOString();
  const promptSnapshotJson = createPromptSnapshotJson();
  await runWithDatabaseSpace(input.space, async (db) => {
    const current = await aiThreadRepository.updateMessage(db, input.assistantMessageId, {
      status: answerText ? 'completed' : 'failed',
      content: answerText,
      reasoningText: reasoningText || null,
      errorMessage: answerText ? null : 'AI 没有返回可用内容。',
      providerId: provider.id,
      modelId,
      modelSnapshotJson: JSON.stringify({ providerId: provider.id, modelId }),
      promptSnapshotJson,
      completedAt,
    });
    if (current?.status === 'completed' && snippets.length > 0) {
      const citations = snippets.map((snippet) => ({
        id: createAiId('aicite'),
        sourceType: snippet.sourceType ?? 'document_chunk',
        sourceId: snippet.sourceId ?? snippet.chunkId,
        label: snippet.label,
        locator: snippet.locator,
      }));
      await aiThreadRepository.replaceCitations(db, input.assistantMessageId, citations);
      finalCitations = await aiThreadRepository.listCitations(db, input.assistantMessageId);
    }
  });
  input.onMessagePatch?.({
    id: input.assistantMessageId,
    status: answerText ? 'completed' : 'failed',
    content: answerText,
    reasoningText: reasoningText || null,
    errorMessage: answerText ? null : 'AI 没有返回可用内容。',
    providerId: provider.id,
    modelId,
    modelSnapshotJson: JSON.stringify({ providerId: provider.id, modelId }),
    promptSnapshotJson,
    completedAt,
    citations: finalCitations,
  });
  if (answerText) {
    await finalizeThreadTitleAfterReply({
      assistantReply: answerText,
      space: input.space,
      thread: input.thread,
      userMessage: input.userMessage,
    });
    await maybeGenerateModelThreadTitleAfterReply({
      branchScopes,
      onUpdated: input.onUpdated,
      space: input.space,
      thread: input.thread,
    });
    void scheduleDeferredCompanionMemoryMaintenance({
      assistantMessageId: input.assistantMessageId,
      branchScopes,
      reason: 'reply_completed',
      space: input.space,
      thread: input.thread,
      threadId: input.thread.id,
      userMessage: input.userMessage,
    });
  }
  input.onUpdated?.();
}

async function loadThreadForGeneration(space: PixorySpace, threadId: string): Promise<AiThreadRecord> {
  const thread = await runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId));
  if (!thread || thread.space !== space) {
    throw new Error('AI thread was not found.');
  }
  return thread;
}

export async function sendUserMessage(
  input: SendUserMessageInput
): Promise<{ userMessageId: string; assistantMessageId: string }> {
  const thread = await runWithDatabaseSpace(input.space, (db) => aiThreadRepository.findThreadById(db, input.threadId));
  if (!thread || thread.space !== input.space) {
    throw new Error('AI thread was not found.');
  }

  const userMessageId = createAiId('aimsg');
  const assistantMessageId = createAiId('aimsg');
  await runWithDatabaseSpace(input.space, async (db) => {
    await aiThreadRepository.createMessage(db, {
      id: userMessageId,
      threadId: thread.id,
      branchRootMessageId: input.branchRootMessageId ?? null,
      branchVersionIndex: input.branchVersionIndex ?? null,
      role: 'user',
      status: 'completed',
      content: input.content,
      completedAt: new Date().toISOString(),
    });
    await aiThreadRepository.createMessage(db, {
      id: assistantMessageId,
      threadId: thread.id,
      branchRootMessageId: input.branchRootMessageId ?? null,
      branchVersionIndex: input.branchVersionIndex ?? null,
      role: 'assistant',
      status: 'generating',
      content: '',
    });
    await aiThreadRepository.updateThread(db, thread.id, {
      title: thread.titleStatus === 'fallback'
        ? fallbackAiThreadTitle({ contextTitle: thread.title, contextType: thread.contextType, firstUserMessage: input.content })
        : undefined,
      lastMessagePreview: input.content.slice(0, 80),
      titleStatus: thread.titleStatus === 'fallback' ? 'fallback' : undefined,
    });
    await aiThreadRepository.setThreadCurrentBranch(db, {
      branchRootMessageId: input.branchRootMessageId ?? null,
      branchVersionIndex: input.branchVersionIndex ?? null,
      threadId: thread.id,
    });
  });
  input.onCreated?.({ userMessageId, assistantMessageId });
  input.onUpdated?.();
  const latestThread = await loadThreadForGeneration(input.space, thread.id);

  await streamAssistantReply({
    assistantMessageId,
    onMessagePatch: input.onMessagePatch,
    onUpdated: input.onUpdated,
    signal: input.signal,
    space: input.space,
    thread: latestThread,
    userMessage: { id: userMessageId, content: input.content },
  });

  return { userMessageId, assistantMessageId };
}

export async function regenerateAssistantMessage(input: RetryAssistantMessageInput): Promise<void> {
  const thread = await runWithDatabaseSpace(input.space, (db) => aiThreadRepository.findThreadById(db, input.threadId));
  if (!thread || thread.space !== input.space) {
    throw new Error('AI thread was not found.');
  }

  const userMessage = await runWithDatabaseSpace(input.space, async (db) => {
    const assistantMessage = await aiThreadRepository.findMessageById(db, input.assistantMessageId);
    if (!assistantMessage || assistantMessage.threadId !== thread.id || assistantMessage.role !== 'assistant') {
      throw new Error('AI assistant message was not found.');
    }
    const assistantBranchScopes = await aiThreadRepository.resolveBranchLineage(
      db,
      assistantMessage.branchRootMessageId,
      assistantMessage.branchVersionIndex
    );
    const previousUserMessage = await aiThreadRepository.findPreviousMessageByRole(db, thread.id, input.assistantMessageId, 'user', assistantBranchScopes);
    if (!previousUserMessage) {
      throw new Error('没有可用于重新生成的用户消息。');
    }
    await db.withTransactionAsync(async () => {
      const previousAssistantVersion = await snapshotMessageVersion(db, assistantMessage);
      const nextBranchVersionIndex = previousAssistantVersion.versionIndex + 1;
      await aiThreadRepository.markVisibleMessagesAfterAsBranch(db, thread.id, input.assistantMessageId, input.assistantMessageId, previousAssistantVersion.versionIndex, assistantMessage);
      await aiThreadRepository.updateThread(db, thread.id, {
        lastMessagePreview: previousUserMessage.content.slice(0, 80),
      });
      await aiThreadRepository.setThreadCurrentBranch(db, {
        branchRootMessageId: input.assistantMessageId,
        branchVersionIndex: nextBranchVersionIndex,
        threadId: thread.id,
      });
    });
    return previousUserMessage;
  });
  const latestThread = await loadThreadForGeneration(input.space, thread.id);

  await streamAssistantReply({
    assistantMessageId: input.assistantMessageId,
    onMessagePatch: input.onMessagePatch,
    onUpdated: input.onUpdated,
    signal: input.signal,
    space: input.space,
    thread: latestThread,
    userMessage,
  });
}

export async function retryAssistantMessage(input: RetryAssistantMessageInput): Promise<void> {
  await regenerateAssistantMessage(input);
}

export async function rewriteUserMessage(input: RewriteUserMessageInput): Promise<{ userMessageId: string; assistantMessageId: string }> {
  const content = input.content.trim();
  if (!content) {
    throw new Error('消息不能为空。');
  }

  const thread = await runWithDatabaseSpace(input.space, (db) => aiThreadRepository.findThreadById(db, input.threadId));
  if (!thread || thread.space !== input.space) {
    throw new Error('AI thread was not found.');
  }

  const assistantMessageId = createAiId('aimsg');
  await runWithDatabaseSpace(input.space, async (db) => {
    const userMessage = await aiThreadRepository.findMessageById(db, input.userMessageId);
    if (!userMessage || userMessage.threadId !== thread.id || userMessage.role !== 'user') {
      throw new Error('AI user message was not found.');
    }
    await db.withTransactionAsync(async () => {
      const previousUserVersion = await snapshotMessageVersion(db, userMessage);
      const nextBranchVersionIndex = previousUserVersion.versionIndex + 1;
      await aiThreadRepository.markVisibleMessagesAfterAsBranch(db, thread.id, input.userMessageId, input.userMessageId, previousUserVersion.versionIndex, userMessage);
      await aiThreadRepository.updateMessage(db, input.userMessageId, {
        status: 'completed',
        content,
        errorMessage: null,
        completedAt: new Date().toISOString(),
      });
      await aiThreadRepository.createMessage(db, {
        id: assistantMessageId,
        threadId: thread.id,
        branchRootMessageId: input.userMessageId,
        branchVersionIndex: nextBranchVersionIndex,
        role: 'assistant',
        status: 'generating',
        content: '',
      });
      await aiThreadRepository.updateThread(db, thread.id, {
        lastMessagePreview: content.slice(0, 80),
      });
      await aiThreadRepository.setThreadCurrentBranch(db, {
        branchRootMessageId: input.userMessageId,
        branchVersionIndex: nextBranchVersionIndex,
        threadId: thread.id,
      });
    });
  });

  input.onCreated?.({ userMessageId: input.userMessageId, assistantMessageId });
  input.onUpdated?.();
  const latestThread = await loadThreadForGeneration(input.space, thread.id);

  await streamAssistantReply({
    assistantMessageId,
    onMessagePatch: input.onMessagePatch,
    onUpdated: input.onUpdated,
    signal: input.signal,
    space: input.space,
    thread: latestThread,
    userMessage: { id: input.userMessageId, content },
  });

  return { userMessageId: input.userMessageId, assistantMessageId };
}

export async function stopStreamingMessage(input: StopStreamingMessageInput): Promise<void> {
  stoppedMessageIds.add(input.assistantMessageId);
  await runWithDatabaseSpace(input.space, (db) =>
    aiThreadRepository.updateMessage(db, input.assistantMessageId, {
      status: 'stopped',
      completedAt: new Date().toISOString(),
    })
  );
}

export async function toggleAssistantMessageFavorite(input: {
  space: PixorySpace;
  threadId: string;
  messageId: string;
  branchScopes?: AiBranchScope[];
  messageVersionIndex?: number | null;
  favorited: boolean;
}): Promise<boolean> {
  await runWithDatabaseSpace(input.space, async (db) => {
    if (input.favorited) {
      await aiThreadRepository.favoriteAssistantMessage(db, input);
    } else {
      await aiThreadRepository.unfavoriteAssistantMessage(db, input);
    }
  });
  return input.favorited;
}

export async function findFavoriteAssistantMessageState(input: {
  space: PixorySpace;
  threadId: string;
  messageId: string;
  branchScopes?: AiBranchScope[];
  messageVersionIndex?: number | null;
}): Promise<boolean> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const row = await aiThreadRepository.findFavoriteAssistantMessageState(db, input);
    return Boolean(row);
  });
}

export async function listFavoriteAssistantMessageKeys(input: {
  space: PixorySpace;
  favoriteKeys: string[];
}): Promise<Set<string>> {
  return runWithDatabaseSpace(input.space, (db) =>
    aiThreadRepository.listFavoriteAssistantMessageKeys(db, input)
  );
}

export async function listFavoriteAssistantMessages(input: {
  space: PixorySpace;
  limit?: number;
  offset?: number;
}): Promise<AiMessageFavoriteListItem[]> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const rows = await aiThreadRepository.listFavoriteAssistantMessages(db, input);
    return rows.map(mapFavoriteListItem);
  });
}
