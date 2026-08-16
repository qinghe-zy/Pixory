import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  aiKnowledgeRepository,
  ipRepository,
  aiProviderRepository,
  aiRoleCardRepository,
  aiThreadRepository,
  settingsRepository,
  runWithDatabaseSpace,
  type AiBoundaryMode,
  type AiCitationRecord,
  type AiContextType,
  type AiProviderModelRecord,
  type AiProviderRecord,
  type AiReplyPreference,
  type AiRoleCardRecord,
  type AiRoleInstructionWeight,
  type AiThreadRecord,
  type PixorySpace,
} from '../database';
import type { AiBranchScope, AiMemoryRecord, AiMessagePageCursor, AiMessageRecord, AiMessageVersionRecord, AiThreadHistoryFilter, AiThreadHistoryItem, AiMessageAttachmentRecord, AiThreadExportSnapshot } from '../database/repositories/aiThreadRepository';
import type { AiThreadContinuityMilestoneRecord } from '../database/repositories/aiThreadRepository';
import type { AiDocumentRecord } from '../database/repositories/aiKnowledgeRepository';
import { DEFAULT_AI_ROLE_PROMPT, MATERIAL_SESSION_RULES, STRICT_MATERIAL_RULES } from './aiConstants';
import { classifyAiChatFastPath } from './aiChatFastPath';
import { resolveAiChatPerformanceProfile } from './aiChatPerformanceMode';
import { assertAiThreadSpaceMoveAllowed } from './aiThreadSpaceMovePolicy';
import {
  deleteProviderModel as deleteProviderModelService,
  deleteProviderModels as deleteProviderModelsService,
  deleteProviderModelsByProvider as deleteProviderModelsByProviderService,
  getAdapterForProvider,
  ensureBuiltInProviders,
  listProviderCards,
  recordSuccessfulProviderModel,
  saveManualChatModelCandidate,
} from './aiProviderService';
import {
  importThreadContinuity as importThreadContinuityService,
  onContinuityImportConversationRoundCompleted,
  rollbackThreadContinuityImport as rollbackThreadContinuityImportService,
} from './aiContinuityImportService';
import { buildMaterialBoundPrompt, buildNormalChatPrompt, fitBuiltPromptToContextBudget } from './promptBuilder';
import { loadCurrentIpCitationSnippet, retrieveForThread, type RetrievalMode, type RetrievedSnippet } from './aiRetrievalService';
import {
  buildCitationRegistry,
  CitationMarkerStreamParser,
  hasCitationLexicalSupport,
  hashCitationExcerpt,
  type CitationRegistryEntry,
  type ParsedCitationMarker,
} from './aiCitationProtocol';
import { cleanupDeletedMaterialFiles, importPickedDocumentsToThread, moveThreadOwnedMaterialsBetweenSpaces, removeMaterialsByOwner } from './aiDocumentService';
import { estimatePromptTokens, trimMessagesToContextBudget } from './aiContextBudget';
import { AI_CONTEXT_DEFAULTS, normalizeAiContextSettings } from './aiContextSettings';
import {
  buildCompanionMemoryPrefix,
  buildStableMemoryPrefix,
} from './aiMemoryService';
import { scheduleDeferredCompanionMemoryMaintenance } from './aiMemoryMaintenanceService';
import { drainCurrentTurnMemory } from './memory/localFastExtractor';
import { detectMemoryIntent } from './memory/memoryIntentDetector';
import { writeCurrentTurnObservation } from './memory/memoryCurrentTurnRepository';
import {
  compileMemoryContextPlan,
  type MemoryContextPlan,
} from './memory/memoryContextPlanService';
import { resolveMemoryIntentTargetClaimIds } from './memory/memoryRetrievalService';
import { resolveMemoryMaintenanceModel } from './aiMemoryMaintenanceModelService';
import { normalizeAiErrorMessage } from './aiErrorMessageService';
import { compileConversationCoverage } from './context/conversationCoverageService';
import type { CompiledConversationCoverage } from './context/conversationCoverage';
import { compileCompanionContext, type CompanionContextPlan } from './companion/companionContextCompiler';
import { markCompanionOpenLoopMentioned, markCompanionTemporalAnchorMentioned, recordCompanionContextTrace } from './companion/companionEventRepository';
import { deriveCompanionTraceId } from './companion/companionDiagnostics';
import { scheduleCompanionMaintenance } from './companion/companionMaintenanceQueue';
import { observeCompanionCurrentTurn } from './companion/companionRuntimeService';
import { processCompanionAssistantRepairTurns } from './companion/companionProjectionEngine';
import { detectAndCreateManualDreamRequest, registerCompanionDreamRound } from './dream/dreamService';
import { dreamRepository } from './dream/dreamRepository';
import { activateThoughtSession, observeThoughtScope, recordCompanionThoughtRound } from './thought/thoughtSessionCoordinator';
import { hashBranchRoute } from './context/conversationCoverage';
import { deliverThoughtReservation, releaseThoughtReservationForMessage, selectCompanionArtifactForTurn } from './companion/companionArtifactService';
import {
  buildPromptCacheMetadata,
  buildProviderCachePolicy,
  deriveAiChatMode,
  hashPromptCacheText,
  ttlLikelyExpired,
  type AiPromptCacheSettings,
  type AiDynamicContextSegment,
} from './aiPromptCache';
import {
  isAllowedOfficialDeepSeekModel,
  isOfficialDeepSeekProvider,
  migrateDeprecatedDeepSeekModel,
} from './deepseekModelPolicy';
import { normalizeProviderUsage, type NormalizedProviderUsage } from './aiProviderUsage';
import {
  STREAMING_PRESSURE_RECOVERY_MS,
  STREAMING_RECOVERABILITY_PERSIST_INTERVAL_MS,
  type StreamingVisibilityState,
  targetPersistIntervalMs,
  targetStreamingDisplayStep,
  targetStreamingFps,
  targetStreamingPatchIntervalMs,
  updateStreamingDevicePressure,
} from './aiStreamingRuntime';
import {
  aggregateAiUsageObservations,
  type AiUsageAggregate,
} from './aiUsageAnalytics';
import {
  createGenerationMetricsDraft,
  finalizeGenerationMetrics,
  markGenerationMetric,
  nowIso,
  redactGenerationMetricsForDiagnostics,
  toGenerationFailureCode,
  type AiGenerationMetricsDraft,
} from './aiGenerationMetrics';
import {
  takeStreamingPerformanceSnapshot,
  type StreamingPerformanceIdentity,
} from './aiStreamingPerformanceDiagnostics';
import {
  deleteThreadProviderApiKey,
  getProviderApiKeyForSpace,
  getThreadProviderApiKey,
  hasThreadProviderApiKey,
  setThreadProviderApiKey,
} from './secureAiSettingsService';
import { verifyPersonalPassword } from '../services/personalSystemService';
import {
  copyAiRoleAvatarToAppStorage,
  copyLocalFile,
  ensureLocalDirectory,
  generateInternalFilename,
  getAiDocumentsDir,
  getAiRoleAvatarsDir,
  joinStoragePath,
} from '../services/fileStorageService';
import { normalizeBaseUrl, type AiChatAttachment, type AiStreamEvent } from './providers/base';
import type { AiMessageFavoriteListItem as AiMessageFavoriteRepositoryListItem } from '../database/repositories/aiThreadRepository';
import { resolveModelIconBrand, type AiModelIconBrand } from './aiModelIconService';
import {
  createPreparedGenerationJob,
  persistGenerationPartial,
  settleGenerationJob,
  transitionGenerationJob,
  type AiGenerationJobRecord,
} from './generation/aiGenerationRepository';
import { mergeContinuationDelta } from './generation/aiGenerationRecovery';
import { enqueueAiPostReplyTask } from './aiPostReplyTaskQueue';
import { emitAiThreadPresentationUpdated } from './aiThreadPresentationEvents';

export interface AiThreadAvatarConfig {
  avatarEnabled: boolean;
  avatarUri: string | null;
}

export interface AiThreadMessageAppearanceConfig {
  assistantAvatar: AiThreadAvatarConfig;
  assistantName: string | null;
  userAvatarEnabled: boolean;
}

export const DEFAULT_AI_USER_AVATAR_ENABLED = true;

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
  attachments?: AiOutgoingAttachment[];
  branchRootMessageId?: string | null;
  branchVersionIndex?: number | null;
  sendPressedAt?: string;
  signal?: AbortSignal;
  getStreamingVisibility?: () => StreamingVisibilityState;
  onCreated?: (ids: AiGenerationCreatedInfo) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onTimeout?: () => void;
  onUpdated?: () => void;
}

export interface AiOutgoingAttachment {
  documentId?: string | null;
  id: string;
  kind: 'image' | 'video' | 'document';
  mimeType?: string | null;
  name: string;
  size?: number | null;
  uri: string;
}

export interface RetryAssistantMessageInput {
  space: PixorySpace;
  threadId: string;
  assistantMessageId: string;
  sendPressedAt?: string;
  signal?: AbortSignal;
  getStreamingVisibility?: () => StreamingVisibilityState;
  onCreated?: (ids: AiGenerationCreatedInfo) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onTimeout?: () => void;
  onUpdated?: () => void;
}

export interface ContinueAssistantMessageInput {
  space: PixorySpace;
  threadId: string;
  assistantMessageId: string;
  sendPressedAt?: string;
  signal?: AbortSignal;
  getStreamingVisibility?: () => StreamingVisibilityState;
  onCreated?: (ids: AiGenerationCreatedInfo) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onTimeout?: () => void;
  onUpdated?: () => void;
}

export interface ContinueAssistantReplyInput {
  space: PixorySpace;
  threadId: string;
  assistantMessageId: string;
  sendPressedAt?: string;
  signal?: AbortSignal;
  getStreamingVisibility?: () => StreamingVisibilityState;
  onCreated?: (ids: AiGenerationCreatedInfo) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onTimeout?: () => void;
  onUpdated?: () => void;
}

export interface AiGenerationCreatedInfo {
  assistantMessageId: string;
  generationId: string;
  thinkingExpected?: boolean;
  userMessageId: string;
}

export interface ReplyToAssistantMessageInput {
  space: PixorySpace;
  threadId: string;
  assistantMessageId: string;
  content: string;
  attachments?: AiOutgoingAttachment[];
  sendPressedAt?: string;
  signal?: AbortSignal;
  getStreamingVisibility?: () => StreamingVisibilityState;
  onCreated?: (ids: AiGenerationCreatedInfo) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onTimeout?: () => void;
  onUpdated?: () => void;
}

export interface RewriteUserMessageInput {
  space: PixorySpace;
  threadId: string;
  userMessageId: string;
  content: string;
  sendPressedAt?: string;
  signal?: AbortSignal;
  getStreamingVisibility?: () => StreamingVisibilityState;
  onCreated?: (ids: AiGenerationCreatedInfo) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onTimeout?: () => void;
  onUpdated?: () => void;
}

export interface StopStreamingMessageInput {
  space: PixorySpace;
  assistantMessageId: string;
  reason?: 'timeout' | 'user';
}

export interface FlushStreamingMessageSnapshotInput {
  assistantMessageId: string;
  content: string;
  generationId: string;
  reasoningText?: string | null;
  space: PixorySpace;
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
  userAvatarEnabled: boolean;
  deepMemoryEnabled: boolean;
  lastMaintenanceError: string | null;
}

export interface AiSessionModelOption {
  hasApiKey: boolean;
  label: string;
  modelId: string;
  providerId: string;
  providerLabel: string;
  source: AiProviderModelRecord['source'];
}

export interface AiThreadSessionModelConfig {
  currentLabel: string;
  currentStatus: 'follow_default' | 'fixed_provider' | 'fixed_model' | 'invalid';
  defaultModelId: string | null;
  defaultProviderId: string | null;
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
  contextHistoryRoundLimit?: number;
  boundaryMode: AiBoundaryMode;
  providerId?: string | null;
  modelId?: string | null;
  avatarEnabled?: boolean;
  userAvatarEnabled?: boolean;
  deepMemoryEnabled?: boolean;
}

export interface ApplyRoleCardToThreadInput {
  space: PixorySpace;
  threadId: string;
  roleCardId: string | null;
}

type ThreadModelSource = 'global_default' | 'provider_default' | 'thread_model';

type ThreadModelConfig = Pick<AiThreadRecord, 'id' | 'space' | 'providerId' | 'modelId' | 'sessionBaseUrl' | 'sessionApiKeyRef'>;

type BuildPromptForThreadOptions = {
  attachmentPromptContext?: string | null;
  generationMetrics?: AiGenerationMetricsDraft | null;
  excludedMemoryClaimIds?: string[];
  historyAnchorMessageId: string;
  historyRoundLimit: number;
  companionDynamicSegments?: AiDynamicContextSegment[];
  assistantMessageId: string;
  allowCompanionArtifact?: boolean;
};

type ThreadRetrievalResult = {
  mode: RetrievalMode;
  partial: boolean;
  snippets: RetrievedSnippet[];
  timedOut: boolean;
};

const CONTINUE_ASSISTANT_REPLY_INSTRUCTION = [
  '继续上一条 assistant 回复。',
  '只输出紧接在已显示正文后面的后续正文，不要重写、总结或重复已显示内容。',
  '不要提及中断、续写、内部思考或系统上下文。',
].join('\n');

const CONTINUE_ASSISTANT_NEW_REPLY_INSTRUCTION = [
  '基于刚才最后一条 assistant 回复继续往下说，并作为下一条新的 assistant 消息输出。',
  '延续原来的语气、情绪、叙述方向和上下文，不要重复上一条回复已经说过的开头或整段内容。',
  '直接输出新的后续正文，不要提及系统提示、续答指令、内部思考或“这是下一条消息”。',
].join('\n');

function snippetTextNeedle(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40);
}

function filterSnippetsPresentInPrompt<T extends RetrievedSnippet>(snippets: T[], prompt: { user: string }): T[] {
  if (snippets.length === 0) {
    return snippets;
  }
  const normalizedPromptUser = prompt.user.replace(/\s+/g, ' ');
  return snippets.filter((snippet) => {
    if (!prompt.user.includes(snippet.label)) {
      return false;
    }
    const textNeedle = snippetTextNeedle(snippet.text);
    return !textNeedle || normalizedPromptUser.includes(textNeedle);
  });
}

export type ResolvedThreadChatModel =
  | {
      status: 'ready';
      apiKey: string | null;
      modelContextWindowTokens: number | null;
      modelId: string;
      model: AiProviderModelRecord;
      provider: AiProviderRecord;
      source: ThreadModelSource;
      thinkingDisabledOverride?: boolean;
    }
  | { status: 'invalid_global_default'; message: string; providerId?: string | null; modelId?: string | null }
  | { status: 'invalid_thread_model'; message: string; providerId?: string | null; modelId?: string | null };

const stoppedMessageIds = new Set<string>();
const stoppedTimeoutGenerationIds = new Set<string>();

function stoppedGenerationKey(messageId: string, generationId: string): string {
  return `${messageId}:${generationId}`;
}

function hasStoppedGeneration(messageId: string, generationId: string): boolean {
  const key = stoppedGenerationKey(messageId, generationId);
  return stoppedMessageIds.has(key) || stoppedTimeoutGenerationIds.has(key);
}

function buildGenerationGuardSnapshotJson(generationMetrics: AiGenerationMetricsDraft): string {
  return JSON.stringify({
    messageDisplayKind: null,
    generationMetrics: redactGenerationMetricsForDiagnostics(finalizeGenerationMetrics(generationMetrics)),
  });
}

type AiMessageDisplayKind = 'standalone_assistant';

function buildGenerationGuardSnapshotJsonWithDisplayKind(
  generationMetrics: AiGenerationMetricsDraft,
  messageDisplayKind?: AiMessageDisplayKind | null,
): string {
  return JSON.stringify({
    messageDisplayKind: messageDisplayKind ?? null,
    generationMetrics: redactGenerationMetricsForDiagnostics(
      finalizeGenerationMetrics(generationMetrics),
    ),
  });
}

function readSnapshotGenerationId(promptSnapshotJson: string | null | undefined): string | null {
  try {
    const parsed = JSON.parse(promptSnapshotJson || '{}') as {
      generationMetrics?: {
        context?: {
          generationId?: unknown;
        };
      };
    };
    return typeof parsed.generationMetrics?.context?.generationId === 'string'
      ? parsed.generationMetrics.context.generationId
      : null;
  } catch {
    return null;
  }
}

function generationSnapshotNeedle(generationId: string): string {
  return `"generationId":${JSON.stringify(generationId)}`;
}

async function isAssistantMessageCurrentGeneration(
  db: SQLiteDatabase,
  assistantMessageId: string,
  generationId: string
): Promise<boolean> {
  const current = await aiThreadRepository.findMessageById(db, assistantMessageId);
  return readSnapshotGenerationId(current?.promptSnapshotJson) === generationId;
}

async function updateAssistantMessageForGeneration(
  db: SQLiteDatabase,
  assistantMessageId: string,
  generationId: string,
  patch: Parameters<typeof aiThreadRepository.updateMessage>[2],
  options?: { syncFts?: boolean }
): Promise<AiMessageRecord | null> {
  return aiThreadRepository.updateMessageWherePromptSnapshotJsonContains(
    db,
    assistantMessageId,
    generationSnapshotNeedle(generationId),
    patch,
    options
  );
}

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
  attachments?: AiMessageAttachmentRecord[];
  citations: AiCitationRecord[];
  messageVersions: AiMessageVersionRecord[];
  versionIndex: number;
  versionTotal: number;
};

export interface AiStreamingMessagePatch {
  id: string;
  generationId: string;
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
  anchorMessageId?: string;
  branchScopes?: AiBranchScope[];
  limit?: number;
  selectedVersionByMessageId?: Record<string, number>;
}

export interface AiThreadMessagePage {
  baseMessageCount: number;
  hasEarlierMessages: boolean;
  messages: AiMessageWithCitations[];
  olderCursor: AiMessagePageCursor | null;
}

export interface LoadThreadMessagePageOptions extends ListThreadMessagesOptions {
  beforeCursor?: AiMessagePageCursor;
  limit: number;
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

const CHAT_MESSAGE_PAGE_SIZE = 60;
const DEEP_MEMORY_LIMIT = 5;
const RELATED_HISTORY_LIMIT = 4;
const DEEP_MEMORY_RECENT_MESSAGE_LIMIT = 30;
const MODEL_TITLE_MIN_COMPLETED_MESSAGES = 6;
const MODEL_TITLE_MAX_CHARS = 8;
const REPLY_ASSIST_CONTEXT_MESSAGE_LIMIT = 12;
const REPLY_ASSIST_CONTEXT_MAX_CHARS = 4200;
const REPLY_ASSIST_MAX_ATTEMPTS = 3;
const REPLY_ASSIST_SHORT_COUNT = 3;
const REPLY_ASSIST_SHORT_MIN_CHARS = 4;
const REPLY_ASSIST_SHORT_MAX_CHARS = 25;
const REPLY_ASSIST_SHORT_SOFT_MAX_CHARS = REPLY_ASSIST_SHORT_MAX_CHARS + 4;
const REPLY_ASSIST_LONG_COUNT = 1;
const REPLY_ASSIST_LONG_MIN_CHARS = 20;
const REPLY_ASSIST_LONG_MAX_CHARS = 200;

export type AiReplyAssistMode = 'short' | 'long';

export interface GenerateReplyAssistSuggestionsInput {
  space: PixorySpace;
  threadId: string;
  mode: AiReplyAssistMode;
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>;
  branchScopes?: AiBranchScope[];
  signal?: AbortSignal;
}

function parseThreadRoleSnapshot(roleSnapshotJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(roleSnapshotJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeReplyAssistText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’\-*•\d.、]+/, '')
    .trim();
}

function replyAssistCharCount(value: string): number {
  return [...value].length;
}

function formatReplyAssistTranscript(
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
  const normalizedMessages = transcript
    .map((message) => ({
      content: normalizeReplyAssistText(message.content),
      role: message.role,
    }))
    .filter((message) => message.content.length > 0);
  if (normalizedMessages.length <= REPLY_ASSIST_CONTEXT_MESSAGE_LIMIT) {
    return normalizedMessages
      .map((message) => `[${message.role}] ${message.content}`)
      .join('\n');
  }
  const selected = normalizedMessages.slice(-REPLY_ASSIST_CONTEXT_MESSAGE_LIMIT);
  return selected
    .map((message) => `[${message.role}] ${message.content}`)
    .join('\n');
}

function trimReplyAssistTranscript(
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const selected = transcript
    .map((message) => ({
      content: normalizeReplyAssistText(message.content),
      role: message.role,
    }))
    .filter((message) => message.content.length > 0)
    .slice(-REPLY_ASSIST_CONTEXT_MESSAGE_LIMIT);
  let totalChars = selected.reduce((sum, message) => sum + replyAssistCharCount(message.content), 0);
  if (totalChars <= REPLY_ASSIST_CONTEXT_MAX_CHARS) {
    return selected;
  }
  const trimmed = [...selected];
  for (let index = 0; index < trimmed.length && totalChars > REPLY_ASSIST_CONTEXT_MAX_CHARS; index += 1) {
    const overflow = totalChars - REPLY_ASSIST_CONTEXT_MAX_CHARS;
    const content = trimmed[index]?.content ?? '';
    if (replyAssistCharCount(content) <= 80) {
      continue;
    }
    const keepChars = Math.max(80, replyAssistCharCount(content) - overflow);
    const nextContent = [...content].slice(-keepChars).join('').trim();
    totalChars -= Math.max(0, replyAssistCharCount(content) - replyAssistCharCount(nextContent));
    trimmed[index] = { ...trimmed[index], content: nextContent };
  }
  return trimmed.filter((message) => message.content.length > 0);
}

function buildReplyAssistRoleContext(thread: AiThreadRecord): string {
  const roleContext = buildRolePromptContextFromThread(thread);
  const sections = [
    thread.contextType !== 'normal' ? `会话标题：${thread.title}` : '',
    roleContext?.name ? `角色名：${roleContext.name}` : '',
    roleContext?.description ? `角色描述：${roleContext.description}` : '',
    thread.systemPrompt?.trim() ? `主会话提示词：\n${thread.systemPrompt.trim()}` : '',
  ].filter(Boolean);
  return sections.join('\n\n');
}

function buildReplyAssistOutputContract(mode: AiReplyAssistMode): string {
  if (mode === 'short') {
    return [
      '当前模式：短句帮答。',
      `必须返回 ${REPLY_ASSIST_SHORT_COUNT} 条 suggestions。`,
      `每条必须是自然口语，至少 ${REPLY_ASSIST_SHORT_MIN_CHARS} 个字，不超过 ${REPLY_ASSIST_SHORT_MAX_CHARS} 个字。`,
      '避免模板化、避免重复句式、不要过度热情。',
      '输出 JSON：{"suggestions":["...", "...", "..."]}',
    ].join('\n');
  }
  return [
    '当前模式：长句帮答。',
    `只返回 ${REPLY_ASSIST_LONG_COUNT} 条 suggestion。`,
    `该句为 ${REPLY_ASSIST_LONG_MIN_CHARS} 到 ${REPLY_ASSIST_LONG_MAX_CHARS} 个字，句数和停顿由你根据当前语境自然决定。`,
    '语气延续当前对话，内容完整可直接发送。',
    '输出 JSON：{"suggestions":["..."]}',
  ].join('\n');
}

function buildReplyAssistUserPrompt(input: {
  mode: AiReplyAssistMode;
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>;
}): string {
  const transcript = formatReplyAssistTranscript(input.transcript);
  return [
    transcript ? `当前可见分支对话：\n${transcript}` : '',
    buildReplyAssistOutputContract(input.mode),
  ].filter(Boolean).join('\n\n');
}

function buildReplyAssistCorrectionPrompt(
  basePrompt: string,
  previousValidationError: string,
): string {
  return [
    basePrompt,
    `上一轮输出未通过校验：${previousValidationError}`,
    '请纠正上述问题，只返回符合约束的 JSON，不要解释。',
  ].join('\n\n');
}

function extractReplyAssistJson(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

function parseReplyAssistSuggestions(text: string): string[] {
  const jsonText = extractReplyAssistJson(text);
  const parsed = JSON.parse(jsonText) as { suggestions?: unknown };
  if (!Array.isArray(parsed.suggestions)) {
    throw new Error('AI 帮答返回格式无效。');
  }
  return parsed.suggestions
    .filter((value): value is string => typeof value === 'string')
    .map((value) => normalizeReplyAssistText(value))
    .filter(Boolean);
}

function validateReplyAssistSuggestions(mode: AiReplyAssistMode, suggestions: string[]): string[] {
  const expectedCount = mode === 'short' ? REPLY_ASSIST_SHORT_COUNT : REPLY_ASSIST_LONG_COUNT;
  if (suggestions.length !== expectedCount) {
    throw new Error('AI 帮答候选数量不符合要求。');
  }
  const uniqueSuggestions = new Set<string>();
  for (const suggestion of suggestions) {
    const dedupeKey = suggestion.replace(/\s+/g, '');
    if (uniqueSuggestions.has(dedupeKey)) {
      throw new Error('AI 帮答候选存在重复内容。');
    }
    uniqueSuggestions.add(dedupeKey);
  }
  if (mode === 'short') {
    return suggestions.map((suggestion) => {
      const charCount = replyAssistCharCount(suggestion);
      if (charCount < REPLY_ASSIST_SHORT_MIN_CHARS || charCount > REPLY_ASSIST_SHORT_SOFT_MAX_CHARS) {
        throw new Error('AI 帮答短句长度不符合要求。');
      }
      return suggestion;
    });
  }
  return suggestions.map((suggestion) => {
    const charCount = replyAssistCharCount(suggestion);
    if (charCount < REPLY_ASSIST_LONG_MIN_CHARS || charCount > REPLY_ASSIST_LONG_MAX_CHARS) {
      throw new Error('AI 帮答长句长度不符合要求。');
    }
    return suggestion;
  });
}

function parseThreadAvatarConfig(roleSnapshotJson: string): AiThreadAvatarConfig {
  const snapshot = parseThreadRoleSnapshot(roleSnapshotJson);
  return {
    avatarEnabled: snapshot.avatarEnabled === true,
    avatarUri:
      typeof snapshot.avatarUri === 'string' && snapshot.avatarUri.trim()
        ? snapshot.avatarUri
        : null,
  };
}

function parseThreadRoleName(roleSnapshotJson: string): string | null {
  const snapshot = parseThreadRoleSnapshot(roleSnapshotJson);
  return typeof snapshot.name === 'string' && snapshot.name.trim()
    ? snapshot.name.trim()
    : null;
}

function parseThreadMessageAppearanceConfig(
  roleSnapshotJson: string,
): AiThreadMessageAppearanceConfig {
  const snapshot = parseThreadRoleSnapshot(roleSnapshotJson);
  return {
    assistantAvatar: parseThreadAvatarConfig(roleSnapshotJson),
    assistantName:
      typeof snapshot.name === 'string' && snapshot.name.trim()
        ? snapshot.name.trim()
        : null,
    userAvatarEnabled:
      snapshot.userAvatarEnabled === false
        ? false
        : DEFAULT_AI_USER_AVATAR_ENABLED,
  };
}

function patchThreadRoleSnapshot(
  roleSnapshotJson: string,
  patch: Partial<AiThreadAvatarConfig & { userAvatarEnabled: boolean }>,
): string {
  const snapshot = parseThreadRoleSnapshot(roleSnapshotJson);
  return JSON.stringify({ ...snapshot, ...patch });
}

function buildRolePromptContextFromThread(thread: AiThreadRecord) {
  try {
    const parsed: unknown = JSON.parse(thread.roleSnapshotJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const snapshot = parsed as { description?: unknown; name?: unknown; sourceJson?: unknown };
    return {
      description: typeof snapshot.description === 'string' ? snapshot.description : null,
      name: typeof snapshot.name === 'string' ? snapshot.name : null,
      sourceJson: typeof snapshot.sourceJson === 'string' ? snapshot.sourceJson : null,
    };
  } catch {
    return null;
  }
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
    cacheMissInputTokens: usage?.cacheMissInputTokens ?? null,
    cachedTokenRatio: usage?.cachedTokenRatio ?? null,
    cacheCreationInputTokens: usage?.cacheCreationInputTokens ?? null,
    cacheReadInputTokens: usage?.cacheReadInputTokens ?? null,
    cacheFieldsObserved: usage?.cacheFieldsObserved ?? false,
    estimatedCostSaved: null,
    estimatedCostDelta: null,
    missReason: usage?.cacheFieldsObserved && usage.cachedInputTokens === 0
      ? 'provider_reported_no_cached_tokens'
      : null,
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
  generationMetrics?: AiGenerationMetricsDraft | null;
  materialRules: string | null;
  messageDisplayKind?: AiMessageDisplayKind | null;
  normalizedUsage: NormalizedProviderUsage | null;
  memoryContextPlan: MemoryContextPlan;
  providerCachePolicy: ReturnType<typeof buildProviderCachePolicy>;
  space: PixorySpace;
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
    messageDisplayKind: input.messageDisplayKind ?? null,
    system: input.space === 'personal' ? null : input.system,
    memoryContextPlan: {
      ...input.memoryContextPlan,
      providerCachedTokens: input.normalizedUsage?.cachedInputTokens ?? null,
    },
    generationMetrics: input.generationMetrics
      ? redactGenerationMetricsForDiagnostics(finalizeGenerationMetrics(input.generationMetrics))
      : null,
  });
}

function buildBranchRouteHash(branchScopes: AiBranchScope[]): string {
  return hashPromptCacheText(JSON.stringify(branchScopes.map((scope) => ({
    branchRootMessageId: scope.branchRootMessageId,
    branchVersionIndex: scope.branchVersionIndex,
  }))));
}

function buildGenerationParamsHash(input: { thinkingDisabled: boolean; historyRoundLimit?: number }): string {
  return hashPromptCacheText(JSON.stringify(input));
}

function buildPromptScopeKey(thread: AiThreadRecord): string {
  return [
    `space:${thread.space}`,
    `thread:${thread.id}`,
    `context:${thread.contextType}`,
    `role:${thread.roleCardId ?? 'none'}`,
    `ip:${thread.boundIpId ?? 'none'}`,
    `kb:${thread.boundKnowledgeBaseId ?? 'none'}`,
  ].join('|');
}

function buildMetricsOnlyPromptSnapshotJson(input: {
  failureReason?: string | null;
  generationMetrics: AiGenerationMetricsDraft;
  messageDisplayKind?: AiMessageDisplayKind | null;
  stopReason?: string | null;
}): string {
  if (input.failureReason) {
    input.generationMetrics.context.failureReason = toGenerationFailureCode(input.failureReason);
  }
  if (input.stopReason) {
    input.generationMetrics.context.stopReason = input.stopReason;
  }
  markGenerationMetric(input.generationMetrics, 'generationSettledAt');
  return JSON.stringify({
    cacheObservation: {
      failureReason: input.failureReason ?? null,
      stopReason: input.stopReason ?? null,
    },
    messageDisplayKind: input.messageDisplayKind ?? null,
    generationMetrics: redactGenerationMetricsForDiagnostics(finalizeGenerationMetrics(input.generationMetrics)),
  });
}

function setGenerationFailureReason(metrics: AiGenerationMetricsDraft, reason: unknown): string {
  const code = toGenerationFailureCode(reason);
  metrics.context.failureReason = code;
  return code;
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

function describeOutgoingAttachmentKind(kind: AiOutgoingAttachment['kind']): string {
  if (kind === 'image') {
    return '图片';
  }
  if (kind === 'video') {
    return '视频';
  }
  return '文档';
}

async function readImageAttachment(attachment: AiOutgoingAttachment): Promise<AiChatAttachment> {
  const base64Data = await FileSystem.readAsStringAsync(attachment.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return {
    base64Data,
    mimeType: attachment.mimeType || 'image/jpeg',
    name: attachment.name,
    type: 'input_image',
  };
}

async function buildDocumentAttachmentContext(input: {
  attachments: AiOutgoingAttachment[];
  space: PixorySpace;
  threadId: string;
}): Promise<string[]> {
  const documents = input.attachments.filter((attachment) => attachment.kind === 'document');
  if (documents.length === 0) {
    return [];
  }
  const contexts: string[] = [];
  for (const attachment of documents) {
    const document = attachment.documentId
      ? await runWithDatabaseSpace(input.space, (db) => aiKnowledgeRepository.findDocumentById(db, attachment.documentId as string))
      : (await importPickedDocumentsToThread({
          assets: [{
            fileName: attachment.name,
            fileSize: attachment.size ?? null,
            mimeType: attachment.mimeType ?? null,
            sourceUri: attachment.uri,
          }],
          space: input.space,
          threadId: input.threadId,
        }))[0] ?? null;
    if (!document) {
      contexts.push(`文档：${attachment.name}\n状态：没有找到已导入的文档内容。`);
      continue;
    }
    await runWithDatabaseSpace(input.space, async (db) => {
      const chunks = await aiKnowledgeRepository.listChunksByDocumentId(db, document.id);
      if (chunks.length === 0) {
        contexts.push(`文档：${document.originalFilename}\n状态：${document.parserError || '没有提取到可发送的文本内容。'}`);
        return;
      }
      contexts.push([
        `文档：${document.originalFilename}`,
        ...chunks.slice(0, 4).map((chunk) => `${chunk.sourceLabel}\n${truncateForPrompt(chunk.text, 900)}`),
      ].join('\n\n'));
    });
  }
  return contexts;
}

function buildAttachmentPromptContext(input: {
  attachments: AiOutgoingAttachment[];
  documentContexts: string[];
  imageCount: number;
  visionEnabled: boolean;
}): string {
  if (input.attachments.length === 0) {
    return '';
  }
  const lines = [
    '本轮附件上下文：',
    ...input.attachments.map((attachment, index) => {
      const type = attachment.mimeType ? `，类型：${attachment.mimeType}` : '';
      const size = typeof attachment.size === 'number' ? `，大小：${attachment.size} 字节` : '';
      return `${index + 1}. ${describeOutgoingAttachmentKind(attachment.kind)}：${attachment.name}${type}${size}`;
    }),
  ];
  if (input.imageCount > 0 && input.visionEnabled) {
    lines.push(`图片附件：已随本轮请求作为视觉输入发送 ${input.imageCount} 张。`);
  } else if (input.imageCount > 0) {
    lines.push(`图片附件：用户发送了 ${input.imageCount} 张图片，但视觉传入未就绪，仅可基于文件名和用户描述讨论。`);
  }
  if (input.attachments.some((attachment) => attachment.kind === 'video')) {
    lines.push('视频附件：当前版本不会直接把视频帧或音轨发送给模型；只能基于文件名、类型、大小和用户描述讨论。');
  }
  if (input.documentContexts.length > 0) {
    lines.push('文档附件摘录：', input.documentContexts.join('\n\n---\n\n'));
  }
  return lines.join('\n\n');
}

async function prepareOutgoingAttachments(input: {
  attachments?: AiOutgoingAttachment[];
  space: PixorySpace;
  threadId: string;
  visionEnabled: boolean;
}): Promise<{ promptContext: string; providerAttachments: AiChatAttachment[] }> {
  const attachments = input.attachments ?? [];
  if (attachments.length === 0) {
    return { promptContext: '', providerAttachments: [] };
  }
  const [providerAttachments, documentContexts] = await Promise.all([
    input.visionEnabled
      ? Promise.all(attachments.filter((attachment) => attachment.kind === 'image').map(readImageAttachment))
      : Promise.resolve([]),
    buildDocumentAttachmentContext({ attachments, space: input.space, threadId: input.threadId }),
  ]);
  return {
    promptContext: buildAttachmentPromptContext({
      attachments,
      documentContexts,
      imageCount: attachments.filter((attachment) => attachment.kind === 'image').length,
      visionEnabled: input.visionEnabled,
    }),
    providerAttachments,
  };
}

function getThreadAttachmentDirectory(space: PixorySpace, threadId: string): string {
  return `${joinStoragePath(joinStoragePath(getAiDocumentsDir(space), `thread_${threadId}`), 'attachments')}/`;
}

async function copyAttachmentToThreadStorage(input: {
  attachment: AiOutgoingAttachment;
  space: PixorySpace;
  threadId: string;
}): Promise<string> {
  const targetDir = getThreadAttachmentDirectory(input.space, input.threadId);
  await ensureLocalDirectory(targetDir);
  const targetUri = joinStoragePath(targetDir, generateInternalFilename(input.attachment.name));
  await copyLocalFile(input.attachment.uri, targetUri);
  return targetUri;
}

async function copyThreadAttachmentsBetweenSpaces(
  snapshots: AiThreadExportSnapshot[],
  targetSpace: PixorySpace
): Promise<{ copiedTargetUris: string[]; snapshots: AiThreadExportSnapshot[] }> {
  const copiedTargetUris: string[] = [];
  try {
    const copiedSnapshots: AiThreadExportSnapshot[] = [];
    for (const snapshot of snapshots) {
      const targetDir = getThreadAttachmentDirectory(targetSpace, snapshot.thread.id);
      if (snapshot.attachments.length > 0) {
        await ensureLocalDirectory(targetDir);
      }
      const attachments: AiMessageAttachmentRecord[] = [];
      for (const attachment of snapshot.attachments) {
        if (attachment.documentId) {
          attachments.push(attachment);
          continue;
        }
        const targetUri = joinStoragePath(targetDir, generateInternalFilename(attachment.name));
        await copyLocalFile(attachment.localUri, targetUri);
        copiedTargetUris.push(targetUri);
        attachments.push({ ...attachment, localUri: targetUri });
      }
      copiedSnapshots.push({ ...snapshot, attachments });
    }
    return { copiedTargetUris, snapshots: copiedSnapshots };
  } catch (error) {
    await cleanupDeletedMaterialFiles(copiedTargetUris);
    throw error;
  }
}

interface AiRoleCardSpaceMoveBundle {
  copiedTargetAvatarUris: string[];
  memories: AiMemoryRecord[];
  roleCards: Array<{
    roleCard: AiRoleCardRecord;
    shouldImport: boolean;
    shouldReactivate: boolean;
    targetAvatarEnabled: boolean;
    targetAvatarUri: string | null;
    targetOriginalArchivedAt: string | null;
    targetRoleCardId: string;
  }>;
  snapshots: AiThreadExportSnapshot[];
}

function rewriteThreadRoleSnapshotForMove(input: {
  roleSnapshotJson: string;
  targetAvatarEnabled: boolean;
  targetAvatarUri: string | null;
  targetRoleCardId: string;
  targetSpace: PixorySpace;
}): string {
  const existingSnapshot = parseThreadRoleSnapshot(input.roleSnapshotJson);
  return JSON.stringify({
    ...existingSnapshot,
    id: input.targetRoleCardId,
    space: input.targetSpace,
    avatarEnabled: input.targetAvatarEnabled,
    avatarUri: input.targetAvatarUri,
  });
}

async function copyRoleCardsBetweenSpaces(input: {
  existingTargetRoleCards: Map<string, AiRoleCardRecord>;
  memories: AiMemoryRecord[];
  memoryIdMap: Map<string, string>;
  roleCards: AiRoleCardRecord[];
  roleIdMap: Map<string, string>;
  skippedMemoryIds: Set<string>;
  snapshots: AiThreadExportSnapshot[];
  targetSpace: PixorySpace;
}): Promise<AiRoleCardSpaceMoveBundle> {
  const copiedTargetAvatarUris: string[] = [];
  try {
    const roleCards = [];
    for (const roleCard of input.roleCards) {
      const targetRoleCardId = input.roleIdMap.get(roleCard.id);
      if (!targetRoleCardId) {
        throw new Error('角色卡迁移映射不完整。');
      }
      const existingTargetRoleCard = input.existingTargetRoleCards.get(targetRoleCardId);
      const targetAvatarUri =
        existingTargetRoleCard
          ? existingTargetRoleCard.avatarUri
          : roleCard.avatarEnabled && roleCard.avatarUri
          ? await copyAiRoleAvatarToAppStorage(roleCard.avatarUri, input.targetSpace)
          : null;
      if (targetAvatarUri && !existingTargetRoleCard) {
        copiedTargetAvatarUris.push(targetAvatarUri);
      }
      roleCards.push({
        roleCard,
        shouldImport: !existingTargetRoleCard,
        shouldReactivate: Boolean(existingTargetRoleCard?.archivedAt),
        targetAvatarEnabled:
          existingTargetRoleCard?.avatarEnabled ?? roleCard.avatarEnabled,
        targetAvatarUri,
        targetOriginalArchivedAt: existingTargetRoleCard?.archivedAt ?? null,
        targetRoleCardId,
      });
    }

    const roleBundleBySourceId = new Map(
      roleCards.map((bundle) => [bundle.roleCard.id, bundle])
    );
    const snapshots = input.snapshots.map((snapshot) => {
      if (!snapshot.thread.roleCardId) {
        return snapshot;
      }
      const roleBundle = roleBundleBySourceId.get(snapshot.thread.roleCardId);
      if (!roleBundle) {
        throw new Error('聊天引用的角色卡数据不完整，无法安全迁移。');
      }
      return {
        ...snapshot,
        thread: {
          ...snapshot.thread,
          roleCardId: roleBundle.targetRoleCardId,
          roleSnapshotJson: rewriteThreadRoleSnapshotForMove({
            roleSnapshotJson: snapshot.thread.roleSnapshotJson,
            targetAvatarEnabled: roleBundle.targetAvatarEnabled,
            targetAvatarUri: roleBundle.targetAvatarUri,
            targetRoleCardId: roleBundle.targetRoleCardId,
            targetSpace: input.targetSpace,
          }),
        },
      };
    });

    const movedMessageIds = new Set(
      snapshots.flatMap((snapshot) => snapshot.messages.map((message) => message.id))
    );
    const memories = input.memories
      .filter((memory) => !input.skippedMemoryIds.has(memory.id))
      .map((memory): AiMemoryRecord => {
        const targetRoleCardId = memory.scopeId
          ? input.roleIdMap.get(memory.scopeId)
          : null;
        if (!targetRoleCardId) {
          throw new Error('角色记忆的迁移映射不完整。');
        }
        return {
          ...memory,
          id: input.memoryIdMap.get(memory.id) ?? createAiId('aimem'),
          space: input.targetSpace,
          scopeId: targetRoleCardId,
          sourceMessageId:
            memory.sourceMessageId && movedMessageIds.has(memory.sourceMessageId)
              ? memory.sourceMessageId
              : null,
          supersededByMemoryId: memory.supersededByMemoryId
            ? input.memoryIdMap.get(memory.supersededByMemoryId) ?? null
            : null,
          reconcileSourceMessageId:
            memory.reconcileSourceMessageId && movedMessageIds.has(memory.reconcileSourceMessageId)
              ? memory.reconcileSourceMessageId
              : null,
          // Numeric asset ids belong to a space-specific database and must never be
          // interpreted as references to unrelated target-space assets.
          ipId: null,
          groupId: null,
          imageAssetId: null,
        };
      });

    return { copiedTargetAvatarUris, memories, roleCards, snapshots };
  } catch (error) {
    await cleanupDeletedMaterialFiles(copiedTargetAvatarUris);
    throw error;
  }
}

async function importDocumentAttachment(input: {
  attachment: AiOutgoingAttachment;
  space: PixorySpace;
  threadId: string;
}): Promise<AiDocumentRecord> {
  const [document] = await importPickedDocumentsToThread({
    assets: [{
      fileName: input.attachment.name,
      fileSize: input.attachment.size ?? null,
      mimeType: input.attachment.mimeType ?? null,
      sourceUri: input.attachment.uri,
    }],
    space: input.space,
    threadId: input.threadId,
  });
  if (!document) {
    throw new Error(`文档附件 ${input.attachment.name} 导入失败。`);
  }
  return document;
}

async function persistOutgoingAttachments(input: {
  attachments?: AiOutgoingAttachment[];
  messageId: string;
  space: PixorySpace;
  threadId: string;
}): Promise<AiOutgoingAttachment[]> {
  const attachments = input.attachments ?? [];
  if (attachments.length === 0) {
    return [];
  }
  const persisted: AiOutgoingAttachment[] = [];
  for (const attachment of attachments) {
    if (attachment.kind === 'video') {
      continue;
    }
    const attachmentKind = attachment.kind;
    const importedDocument = attachment.kind === 'document'
      ? await importDocumentAttachment({ attachment, space: input.space, threadId: input.threadId })
      : null;
    const localUri = importedDocument?.localUri
      ?? await copyAttachmentToThreadStorage({ attachment, space: input.space, threadId: input.threadId });
    const persistedAttachment: AiOutgoingAttachment = { ...attachment, documentId: importedDocument?.id ?? null, uri: localUri };
    await runWithDatabaseSpace(input.space, (db) =>
      aiThreadRepository.createMessageAttachment(db, {
        documentId: importedDocument?.id ?? null,
        id: createAiId('aiattach'),
        fileSize: attachment.size ?? null,
        kind: attachmentKind,
        localUri,
        messageId: input.messageId,
        mimeType: attachment.mimeType ?? null,
        name: attachment.name,
        threadId: input.threadId,
      })
    );
    persisted.push(persistedAttachment);
  }
  return persisted;
}

async function loadOutgoingAttachmentsForMessage(input: {
  messageId: string;
  space: PixorySpace;
}): Promise<AiOutgoingAttachment[]> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const rows = await aiThreadRepository.listMessageAttachments(db, input.messageId);
    return rows.map((row) => ({
      documentId: row.documentId,
      id: row.id,
      kind: row.kind,
      mimeType: row.mimeType,
      name: row.name,
      size: row.fileSize,
      uri: row.localUri,
    }));
  });
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
      limit: DEEP_MEMORY_RECENT_MESSAGE_LIMIT + RELATED_HISTORY_LIMIT + 12,
      query: userMessage,
      threadId: thread.id,
    }),
    aiThreadRepository.listRecentCompletedNonSystemMessages(db, thread.id, DEEP_MEMORY_RECENT_MESSAGE_LIMIT, branchScopes),
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

export async function resolveThreadChatModel(space: PixorySpace, thread: ThreadModelConfig): Promise<ResolvedThreadChatModel> {
  await ensureBuiltInProviders(space);
  return runWithDatabaseSpace(space, async (db) => {
    const providers = await aiProviderRepository.listProviders(db);

    async function resolveProviderModel(provider: AiProviderRecord, modelId: string | null, source: ThreadModelSource): Promise<ResolvedThreadChatModel> {
      const models = await aiProviderRepository.listModels(db, provider.id);
      const effectiveBaseUrl = thread.sessionBaseUrl ?? provider.baseUrl;
      const isOfficialDeepSeek = isOfficialDeepSeekProvider({
        baseUrl: effectiveBaseUrl,
        providerType: provider.providerType,
      });
      const findChatModel = (candidateModelId: string | null | undefined) =>
        candidateModelId
          ? models.find((model) =>
            model.modelId === candidateModelId
              && model.supportsChat
              && (!isOfficialDeepSeek || isAllowedOfficialDeepSeekModel(model.modelId))
          ) ?? null
          : null;
      const explicitMigration = migrateDeprecatedDeepSeekModel(modelId, effectiveBaseUrl);
      const effectiveModelId = explicitMigration?.modelId ?? modelId;
      const explicitModel = findChatModel(effectiveModelId);
      if (modelId && !explicitModel) {
        const message = modelInvalidMessage(source);
        return source === 'global_default'
          ? invalidGlobalDefault(message, provider.id, modelId)
          : invalidThreadModel(message, provider.id, modelId);
      }
      const defaultMigration = migrateDeprecatedDeepSeekModel(provider.defaultChatModelId, effectiveBaseUrl);
      const effectiveDefaultModelId = defaultMigration?.modelId ?? provider.defaultChatModelId;
      const defaultModel = findChatModel(effectiveDefaultModelId);
      if (provider.defaultChatModelId && !defaultModel && !explicitModel) {
        const message = modelInvalidMessage(source);
        return source === 'global_default'
          ? invalidGlobalDefault(message, provider.id, provider.defaultChatModelId)
          : invalidThreadModel(message, provider.id, provider.defaultChatModelId);
      }
      const resolvedModel = explicitModel
        ?? defaultModel
        ?? models.find((model) =>
          model.supportsChat
            && (!isOfficialDeepSeek || isAllowedOfficialDeepSeekModel(model.modelId))
        )
        ?? null;
      if (!resolvedModel) {
        const message = modelInvalidMessage(source);
        return source === 'global_default'
          ? invalidGlobalDefault(message, provider.id, modelId)
          : invalidThreadModel(message, provider.id, modelId);
      }
      const selectedMigration = explicitModel ? explicitMigration : defaultModel ? defaultMigration : null;
      return {
        apiKey: thread.sessionApiKeyRef ? await getThreadProviderApiKey(space, thread.id, provider.id) : await getProviderApiKeyForSpace(space, provider.id),
        model: resolvedModel,
        modelContextWindowTokens: resolvedModel.contextWindowTokens ?? null,
        modelId: resolvedModel.modelId,
        provider: {
          ...provider,
          baseUrl: thread.sessionBaseUrl ?? provider.baseUrl,
        },
        source,
        status: 'ready',
        thinkingDisabledOverride: selectedMigration?.thinkingDisabled,
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
  const isOfficialDeepSeek = isOfficialDeepSeekProvider({
    baseUrl: provider.baseUrl,
    providerType: provider.providerType,
  });
  const findChatModel = (candidateModelId: string | null | undefined) =>
    candidateModelId
      ? models.find((item) =>
        item.modelId === candidateModelId
          && item.supportsChat
          && (!isOfficialDeepSeek || isAllowedOfficialDeepSeekModel(item.modelId))
      ) ?? null
      : null;
  const migratedModel = migrateDeprecatedDeepSeekModel(modelId, provider.baseUrl);
  const migratedDefaultModel = migrateDeprecatedDeepSeekModel(provider.defaultChatModelId, provider.baseUrl);
  const explicitModel = (
    migratedModel
      ? findChatModel(migratedModel.modelId)
      : findChatModel(modelId)
  ) ?? null;
  const defaultModel = (
    migratedDefaultModel
      ? findChatModel(migratedDefaultModel.modelId)
      : findChatModel(provider.defaultChatModelId)
  ) ?? null;
  const model = explicitModel
    ?? defaultModel
    ?? models.find((item) =>
      item.supportsChat
        && (!isOfficialDeepSeek || isAllowedOfficialDeepSeekModel(item.modelId))
    )
    ?? null;
  const selectedMigration = explicitModel ? migratedModel : defaultModel ? migratedDefaultModel : null;
  return {
    model,
    provider,
    thinkingDisabledOverride: selectedMigration?.thinkingDisabled,
  };
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

function citationOwnerIsVisible(thread: AiThreadRecord, ownerType: string, ownerId: string): boolean {
  if (ownerType === 'thread') return ownerId === thread.id;
  if (ownerType === 'knowledge_base') return thread.contextType === 'knowledge_base' && ownerId === thread.boundKnowledgeBaseId;
  if (ownerType === 'ip') return thread.contextType === 'ip' && ownerId === String(thread.boundIpId ?? '') && thread.includeIpDocuments;
  return false;
}

async function validateCitationRegistryEntry(db: SQLiteDatabase, thread: AiThreadRecord, entry: CitationRegistryEntry): Promise<string | null> {
  if (entry.sourceType === 'document_chunk') {
    const row = await db.getFirstAsync<{ text: string; documentVersion: string; ownerType: string; ownerId: string; space: PixorySpace }>(
      `SELECT ai_chunks.text, ai_documents.updatedAt AS documentVersion,
              ai_documents.ownerType, ai_documents.ownerId, ai_documents.space
       FROM ai_chunks
       INNER JOIN ai_documents ON ai_documents.id = ai_chunks.documentId
       WHERE ai_chunks.id = ? AND ai_documents.id = ?`,
      entry.chunkId,
      entry.sourceId,
    );
    if (!row || row.space !== thread.space || !citationOwnerIsVisible(thread, row.ownerType, row.ownerId)) return 'source_not_visible';
    if (entry.documentVersion && row.documentVersion !== entry.documentVersion) return 'document_version_changed';
    if (hashCitationExcerpt(row.text) !== entry.sourceExcerptHash) return 'source_excerpt_changed';
    return null;
  }
  if (thread.contextType !== 'ip' || String(thread.boundIpId ?? '') !== entry.locator.ipId?.toString()) return 'source_not_visible';
  if (entry.sourceType === 'image_note') {
    const image = await db.getFirstAsync<{ originalFilename: string; note: string | null; isFavorite: number; updatedAt: string; deletedAt: string | null }>(
      'SELECT originalFilename, note, isFavorite, updatedAt, deletedAt FROM image_assets WHERE id = ? AND ipId = ?',
      Number(entry.sourceId),
      thread.boundIpId,
    );
    if (!image || image.deletedAt) return 'source_not_visible';
    if (entry.documentVersion && image.updatedAt !== entry.documentVersion) return 'document_version_changed';
    const excerpt = [`文件名：${image.originalFilename}`, image.note ? `备注：${image.note}` : null, image.isFavorite ? '收藏：是' : null].filter(Boolean).join('\n');
    return hashCitationExcerpt(excerpt) === entry.sourceExcerptHash ? null : 'source_excerpt_changed';
  }
  if (thread.boundIpId == null) return 'source_not_visible';
  const currentSnippet = await loadCurrentIpCitationSnippet({
    chunkId: entry.chunkId,
    ipId: thread.boundIpId,
    space: thread.space,
  });
  if (!currentSnippet) return 'source_not_visible';
  if (entry.documentVersion && currentSnippet.documentVersion !== entry.documentVersion) return 'document_version_changed';
  return hashCitationExcerpt(currentSnippet.text) === entry.sourceExcerptHash ? null : 'source_excerpt_changed';
}

async function buildValidatedAnswerCitations(db: SQLiteDatabase, input: {
  answerText: string;
  markers: ParsedCitationMarker[];
  registry: CitationRegistryEntry[];
  thread: AiThreadRecord;
  now: string;
}) {
  const byRefId = new Map(input.registry.map((entry) => [entry.refId, entry]));
  const citations = [];
  const seenMarkers = new Set<string>();
  for (const marker of input.markers) {
    const entry = byRefId.get(marker.refId);
    if (!entry) continue;
    if (marker.claimStart < 0 || marker.claimEnd <= marker.claimStart || marker.claimEnd > input.answerText.length) continue;
    const markerKey = `${marker.refId}:${marker.claimStart}:${marker.claimEnd}`;
    if (seenMarkers.has(markerKey)) continue;
    seenMarkers.add(markerKey);
    const claim = input.answerText.slice(marker.claimStart, marker.claimEnd);
    const sourceReason = await validateCitationRegistryEntry(db, input.thread, entry);
    const supportReason = sourceReason ?? (hasCitationLexicalSupport(claim, entry.excerpt) ? null : 'lexical_support_missing');
    citations.push({
      claimEnd: marker.claimEnd,
      claimStart: marker.claimStart,
      documentVersion: entry.documentVersion,
      id: createAiId('aicite'),
      label: entry.label,
      locator: { ...entry.locator, chunkId: entry.chunkId },
      refId: entry.refId,
      sourceExcerptHash: entry.sourceExcerptHash,
      sourceId: entry.sourceId,
      sourceType: entry.sourceType,
      usedAt: input.now,
      validationReason: supportReason,
      validationStatus: supportReason ? 'invalid' as const : 'valid' as const,
    });
  }
  return citations;
}

function mergeContinuationCitations(
  retained: AiCitationRecord[],
  appended: Awaited<ReturnType<typeof buildValidatedAnswerCitations>>,
) {
  const merged = [...retained, ...appended];
  const seen = new Set<string>();
  return merged.filter((citation) => {
    const key = [citation.refId, citation.claimStart, citation.claimEnd, citation.sourceType, citation.sourceId].join('\u001F');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function revalidateRetainedCitations(
  db: SQLiteDatabase,
  thread: AiThreadRecord,
  citations: AiCitationRecord[],
  answerText: string,
  now: string,
): Promise<AiCitationRecord[]> {
  const results: AiCitationRecord[] = [];
  for (const citation of citations) {
    const chunkId = typeof citation.locator?.chunkId === 'string' ? citation.locator.chunkId : '';
    let validationReason: string | null = null;
    if (citation.claimStart == null || citation.claimEnd == null || citation.claimStart < 0 || citation.claimEnd <= citation.claimStart || citation.claimEnd > answerText.length) {
      validationReason = 'claim_span_changed';
    } else if (!citation.refId || !citation.sourceExcerptHash || !chunkId) {
      validationReason = 'citation_registry_incomplete';
    } else {
      validationReason = await validateCitationRegistryEntry(db, thread, {
        chunkId,
        documentVersion: citation.documentVersion,
        excerpt: '',
        label: citation.label,
        locator: citation.locator,
        refId: citation.refId,
        sourceExcerptHash: citation.sourceExcerptHash,
        sourceId: citation.sourceId,
        sourceType: citation.sourceType,
      });
    }
    results.push({
      ...citation,
      usedAt: citation.usedAt ?? now,
      validationReason,
      validationStatus: validationReason ? 'invalid' : 'valid',
    });
  }
  return results;
}

async function buildPromptForThread(
  thread: AiThreadRecord,
  userMessage: string,
  branchScopes?: AiBranchScope[],
  options?: BuildPromptForThreadOptions
) {
  if (!options?.historyAnchorMessageId) {
    throw new Error('A history anchor is required to compile conversation coverage.');
  }
  const chatMode = deriveAiChatMode(thread, thread.space);
  const generationMetrics = options?.generationMetrics ?? null;
  const fastPathContext = await runWithDatabaseSpace(thread.space, async (db) => {
    const [threadMaterialCount, messageCount] = await Promise.all([
      aiKnowledgeRepository.countDocumentsByOwner(db, {
        ownerId: thread.id,
        ownerType: 'thread',
        space: thread.space,
      }),
      aiThreadRepository.countCompletedNonSystemMessages(db, thread.id, branchScopes),
    ]);
    return {
      hasThreadMaterials: threadMaterialCount > 0,
      messageCount,
    };
  });
  const fastPath = classifyAiChatFastPath({
    contextType: thread.contextType,
    hasThreadMaterials: fastPathContext.hasThreadMaterials,
    includeIpDocuments: thread.includeIpDocuments,
    messageCount: fastPathContext.messageCount,
    userMessage,
  });
  const memoryPromise = (async () => {
    if (generationMetrics) {
      markGenerationMetric(generationMetrics, 'memoryResolveStartAt');
    }
    try {
      const memoryBundle = await runWithDatabaseSpace(thread.space, async (db) => {
        const memorySettings = await aiThreadRepository.getThreadMemorySettings(db, thread.id);
        if (generationMetrics) {
          markGenerationMetric(generationMetrics, 'historyLoadStartAt');
        }
        const coverage = await compileConversationCoverage(db, {
          anchorMessageId: options?.historyAnchorMessageId,
          branchScopes,
          historyRoundLimit: options.historyRoundLimit,
          thread,
        });
        if (generationMetrics) {
          markGenerationMetric(generationMetrics, 'historyLoadEndAt');
        }
        const intent = detectMemoryIntent(userMessage);
        const excludedClaimIds = await resolveMemoryIntentTargetClaimIds(db, {
          branchScopes,
          observation: intent,
          thread,
        });
        const compiledMemory = await compileMemoryContextPlan(db, {
          branchScopes,
          excludedClaimIds,
          query: memorySettings.deepMemoryEnabled ? userMessage : '',
          thread,
        });
        const artifactSelection = await selectCompanionArtifactForTurn(db, {
          allowArtifact: options.allowCompanionArtifact !== false,
          assistantMessageId: options.assistantMessageId,
          branchRouteHash: coverage.plan.branchRouteHash,
          branchScopes: branchScopes ?? [],
          now: new Date().toISOString(),
          thread,
        });
        return {
          companionMemoryPrefix: await buildCompanionMemoryPrefix(db, thread, { branchScopes, settings: memorySettings }),
          coverage,
          artifactSelection,
          dynamicMemoryContext: compiledMemory.context,
          memoryContextPlan: compiledMemory.plan,
          memorySettings,
          stableMemoryPrefix: await buildStableMemoryPrefix(db, thread, { branchScopes, excludedClaimIds, settings: memorySettings }),
        };
      });
      return memoryBundle;
    } finally {
      if (generationMetrics) {
        markGenerationMetric(generationMetrics, 'memoryResolveEndAt');
      }
    }
  })();
  const retrievalPromise = (async () => {
    if (generationMetrics) {
      markGenerationMetric(generationMetrics, 'retrievalStartAt');
    }
    try {
      const skippedRetrievalResult: ThreadRetrievalResult = { mode: 'skipped', partial: false, snippets: [], timedOut: false };
      const threadMaterialRetrievalPromise: Promise<ThreadRetrievalResult> = fastPath.retrievalTier === 'none'
        ? Promise.resolve(skippedRetrievalResult)
        : retrieveForThread({
            space: thread.space,
            ownerType: 'thread',
            ownerId: thread.id,
            query: userMessage,
            tier: fastPath.retrievalTier === 'keyword' ? 'keyword' : 'full',
          });
      if (thread.contextType === 'normal') {
        const threadMaterialRetrieval = await threadMaterialRetrievalPromise;
        return {
          boundOwnerSnippets: [],
          threadMaterialRetrieval,
          threadMaterialSnippets: threadMaterialRetrieval.snippets,
        };
      }
      const ownerType = thread.contextType === 'ip' ? 'ip' : 'knowledge_base';
      const ownerId = thread.contextType === 'ip' ? String(thread.boundIpId ?? '') : thread.boundKnowledgeBaseId ?? '';
      const boundOwnerRetrievalPromise = ownerId
        ? retrieveForThread({
            includeDocumentChunks: ownerType !== 'ip' || thread.includeIpDocuments,
            space: thread.space,
            ownerType,
            ownerId,
            query: userMessage,
            tier: 'full',
          })
        : { mode: 'keyword' as const, partial: false, snippets: [], timedOut: false };
      const [threadMaterialRetrieval, boundOwnerRetrieval] = await Promise.all([
        threadMaterialRetrievalPromise,
        boundOwnerRetrievalPromise,
      ]);
      return {
        boundOwnerSnippets: boundOwnerRetrieval.snippets,
        threadMaterialRetrieval,
        threadMaterialSnippets: threadMaterialRetrieval.snippets,
      };
    } finally {
      if (generationMetrics) {
        markGenerationMetric(generationMetrics, 'retrievalEndAt');
      }
    }
  })();
  const [
    { artifactSelection, companionMemoryPrefix, coverage, dynamicMemoryContext, memoryContextPlan, memorySettings, stableMemoryPrefix },
    { boundOwnerSnippets, threadMaterialRetrieval, threadMaterialSnippets },
  ] = await Promise.all([memoryPromise, retrievalPromise]);
  const finalFastPath = classifyAiChatFastPath({
    contextType: thread.contextType,
    hasMemoryContext: memorySettings.deepMemoryEnabled,
    hasThreadMaterials: fastPathContext.hasThreadMaterials,
    includeIpDocuments: thread.includeIpDocuments,
    messageCount: fastPathContext.messageCount,
    userMessage,
  });
  if (generationMetrics) {
    generationMetrics.context.chatMode = chatMode;
    generationMetrics.context.memoryProjectionVersion = memoryContextPlan.projectionVersion;
    generationMetrics.context.memoryRetrievalScorerVersion = memoryContextPlan.retrievalScorerVersion;
    generationMetrics.context.memoryRetrievalCandidateCount = memoryContextPlan.candidateClaimIds.length;
    generationMetrics.context.memoryRetrievalInjectedCount = Math.max(
      0,
      memoryContextPlan.candidateClaimIds.length - memoryContextPlan.omittedClaimIds.length
    );
    generationMetrics.context.coverageComplete = coverage.plan.coverageComplete;
    generationMetrics.context.coverageSummarySegmentCount = coverage.plan.summarySegmentIds.length;
    generationMetrics.context.coverageBridgeMessageCount = coverage.plan.bridgeMessageIds.length;
    generationMetrics.context.coverageProvisionalMessageCount = coverage.plan.provisionalSourceMessageIds.length;
    generationMetrics.context.coverageLineageVersion = coverage.plan.lineageVersion;
    generationMetrics.context.coverageBranchRouteHash = coverage.plan.branchRouteHash;
    generationMetrics.context.fastPathClassification = finalFastPath.classification;
    generationMetrics.context.chatPerformanceProfile = resolveAiChatPerformanceProfile({
      contextType: thread.contextType,
      fastPathClassification: finalFastPath.classification,
      space: thread.space,
    });
    generationMetrics.context.retrievalSkippedReason = finalFastPath.retrievalSkippedReason;
    generationMetrics.context.retrievalMode = threadMaterialRetrieval.mode;
    generationMetrics.context.retrievalPartial = threadMaterialRetrieval.partial;
    generationMetrics.context.retrievalTimedOut = threadMaterialRetrieval.timedOut;
  }
  const memoryEpoch = [
    'thread',
    thread.id,
    thread.roleCardId ?? 'none',
    thread.boundaryMode,
    memoryContextPlan.projectionVersion,
    memoryContextPlan.lineageVersion,
    hashPromptCacheText([coverage.stableSummaryText, stableMemoryPrefix].filter(Boolean).join('\n\n')).slice(0, 16),
  ].join(':');
  const roleCardContext = buildRolePromptContextFromThread(thread);
  const dynamicSegments: AiDynamicContextSegment[] = [
    ...(options?.companionDynamicSegments ?? []),
    ...(artifactSelection ? [artifactSelection.segment] : []),
    ...(companionMemoryPrefix ? [{
      branchRouteHash: coverage.plan.branchRouteHash,
      expiresAt: null,
      id: `user-observation:${memoryContextPlan.projectionVersion}`,
      privacy: thread.space,
      priority: 60,
      scope: `thread:${thread.id}`,
      source: 'automatic-profile-and-relationship',
      text: companionMemoryPrefix,
      tokenEstimate: estimatePromptTokens(companionMemoryPrefix),
      traceOnly: false,
      trust: 'derived' as const,
      type: 'user_observation' as const,
      version: memoryContextPlan.projectionVersion,
    }] : []),
    ...(coverage.summaryBridgeText ? [{
      branchRouteHash: coverage.plan.branchRouteHash,
      expiresAt: null,
      id: coverage.plan.provisionalSummaryId ?? `history-bridge:${coverage.plan.lineageVersion}`,
      privacy: thread.space,
      priority: 100,
      scope: `thread:${thread.id}`,
      source: 'conversation-coverage',
      text: coverage.summaryBridgeText,
      tokenEstimate: estimatePromptTokens(coverage.summaryBridgeText),
      traceOnly: false,
      trust: 'source' as const,
      type: 'summary_bridge' as const,
      version: coverage.plan.lineageVersion,
    }] : []),
  ];

  if (thread.contextType === 'normal') {
    const citationRegistry = buildCitationRegistry(threadMaterialSnippets);
    if (generationMetrics) {
      generationMetrics.context.memoryEpoch = memoryEpoch;
      generationMetrics.context.retrievalSnippetCount = threadMaterialSnippets.length;
      generationMetrics.context.stablePrefixEstimatedTokens = null;
    }
    return {
      prompt: buildNormalChatPrompt({
        chatMode,
        dynamicMemoryContext,
        dynamicSegments,
        memoryEpoch,
        roleInstructionWeight: thread.roleInstructionWeight,
        replyPreference: thread.replyPreference,
        stableMemoryPrefix,
        stableSummarySnapshot: coverage.stableSummaryText,
        roleCardContext,
        systemPrompt: thread.contextType === 'normal' ? thread.systemPrompt : thread.systemPrompt || DEFAULT_AI_ROLE_PROMPT,
        materialSnippets: citationRegistry.map((snippet) => ({ label: snippet.label, refId: snippet.refId, text: snippet.text })),
        attachmentPromptContext: options?.attachmentPromptContext ?? null,
        userMessage,
      }),
      snippets: citationRegistry,
      coverage,
      memoryContextPlan,
    };
  }

  const snippets = buildCitationRegistry([...threadMaterialSnippets, ...boundOwnerSnippets]);
  if (generationMetrics) {
    generationMetrics.context.memoryEpoch = memoryEpoch;
    generationMetrics.context.retrievalSnippetCount = snippets.length;
    generationMetrics.context.stablePrefixEstimatedTokens = null;
  }

  return {
    prompt: buildMaterialBoundPrompt({
      chatMode,
      editablePrompt: thread.systemPrompt || DEFAULT_AI_ROLE_PROMPT,
      dynamicMemoryContext,
      dynamicSegments,
      memoryEpoch,
      roleInstructionWeight: thread.roleInstructionWeight,
      replyPreference: thread.replyPreference,
      stableMemoryPrefix,
      stableSummarySnapshot: coverage.stableSummaryText,
      roleCardContext,
      materialRules: materialRulesForMode(thread.boundaryMode),
      contextSummary: thread.title,
      snippets: snippets.map((snippet) => ({ label: snippet.label, refId: snippet.refId, text: snippet.text })),
      attachmentPromptContext: options?.attachmentPromptContext ?? null,
      userMessage,
    }),
    snippets,
    coverage,
    memoryContextPlan,
  };
}

export async function createThreadFromContext(input: CreateThreadFromContextInput): Promise<AiThreadRecord> {
  await ensureBuiltInProviders(input.space);
  const shouldUseFixedModel = Boolean(input.providerId || input.modelId);
  const { provider, model, thinkingDisabledOverride } = shouldUseFixedModel
    ? await resolveDefaultThreadProvider(input.space, input.providerId, input.modelId)
    : { provider: null, model: null, thinkingDisabledOverride: undefined };

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
      thinkingDisabled: input.thinkingDisabled ?? thinkingDisabledOverride ?? false,
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

export async function importThreadContinuity(input: {
  fileName: string;
  text: string;
  space: PixorySpace;
  threadId: string;
  allowRemoteModelForPersonal?: boolean;
}) {
  return importThreadContinuityService(input);
}

export async function rollbackThreadContinuityImport(input: {
  importSessionId: string;
  space: PixorySpace;
}) {
  return rollbackThreadContinuityImportService(input);
}

export async function loadThreadContinuityMilestones(space: PixorySpace, threadId: string): Promise<AiThreadContinuityMilestoneRecord[]> {
  return runWithDatabaseSpace(space, (db) => aiThreadRepository.listThreadContinuityMilestones(db, threadId));
}

export async function loadThreadTitle(space: PixorySpace, threadId: string): Promise<string | null> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    return thread && thread.space === space ? thread.title : null;
  });
}

export async function getCurrentChatModelLabel(space: PixorySpace, threadId?: string | null): Promise<string> {
  return (await getCurrentChatModelPresentation(space, threadId)).label;
}

export async function getCurrentChatModelPresentation(
  space: PixorySpace,
  threadId?: string | null,
): Promise<{ label: string; iconBrand: AiModelIconBrand }> {
  await ensureBuiltInProviders(space);
  const thread = threadId ? await runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId)) : null;
  const resolved = await resolveThreadChatModel(space, thread ?? emptyThreadModelConfig(space));
  if (resolved.status !== 'ready') {
    return {
      iconBrand: 'default',
      label: resolved.status === 'invalid_global_default' ? '全局默认模型已失效' : '当前会话模型已失效',
    };
  }
  const model = await runWithDatabaseSpace(space, (db) => aiProviderRepository.findModel(db, resolved.provider.id, resolved.modelId));
  const modelName = model?.displayName ?? resolved.modelId;
  return {
    iconBrand: resolveModelIconBrand(resolved.provider.providerType, resolved.modelId, resolved.provider.baseUrl),
    label: `${resolved.provider.displayName} · ${modelName}`,
  };
}

export async function getCurrentChatModelIconBrand(space: PixorySpace, threadId?: string | null): Promise<AiModelIconBrand> {
  return (await getCurrentChatModelPresentation(space, threadId)).iconBrand;
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

async function hydrateThreadMessagesInDatabase(
  db: SQLiteDatabase,
  threadId: string,
  baseMessages: AiMessageRecord[],
  selectedVersionByMessageId?: Record<string, number>,
): Promise<AiMessageWithCitations[]> {
  const messagesWithBranchRoots = await loadBranchRootMessages(db, threadId, baseMessages);
  const messageIds = messagesWithBranchRoots.map((message) => message.id);
  // Sequential queries: expo-sqlite does not support concurrent prepared
  // statements on the same connection; Promise.all here caused
  // NativeStatement.finalizeAsync crashes.
  const versionTotalsByMessageId = await aiThreadRepository.listMessageVersionTotalsForMessages(db, messageIds);
  const citationsByMessageId = await aiThreadRepository.listCitationsForMessages(db, messageIds);
  const attachmentsByMessageId = await aiThreadRepository.listAttachmentsForMessages(db, messageIds);
  const selectedVersionEntries = messagesWithBranchRoots
    .map((message) => {
      const versionTotal = versionTotalsByMessageId[message.id] ?? 1;
      const selectedVersionIndex = selectedVersionByMessageId?.[message.id];
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
      attachments: attachmentsByMessageId[message.id] ?? [],
      citations: citationsByMessageId[message.id] ?? [],
      messageVersions: selectedVersion ? [selectedVersion] : [],
      versionIndex: selectedVersion?.versionIndex ?? versionTotal,
      versionTotal,
    };
  });
}

export async function listThreadMessagesInDatabase(db: SQLiteDatabase, threadId: string, options: ListThreadMessagesOptions = {}): Promise<AiMessageWithCitations[]> {
  const baseMessages = options.anchorMessageId && options.limit
    ? await aiThreadRepository.listMessagesBaseAroundAnchor(db, threadId, options.anchorMessageId, options.limit, options.branchScopes)
    : await aiThreadRepository.listMessagesBase(db, threadId, options.limit, options.branchScopes);
  return hydrateThreadMessagesInDatabase(
    db,
    threadId,
    baseMessages,
    options.selectedVersionByMessageId,
  );
}

export async function loadThreadMessagePageInDatabase(
  db: SQLiteDatabase,
  threadId: string,
  options: LoadThreadMessagePageOptions,
): Promise<AiThreadMessagePage> {
  const limit = Math.max(1, options.limit);
  const candidates = options.beforeCursor
    ? await aiThreadRepository.listMessagesBaseBefore(
      db,
      threadId,
      options.beforeCursor,
      limit + 1,
      options.branchScopes,
    )
    : await aiThreadRepository.listMessagesBase(
      db,
      threadId,
      limit + 1,
      options.branchScopes,
    );
  const hasEarlierMessages = candidates.length > limit;
  const baseMessages = hasEarlierMessages ? candidates.slice(1) : candidates;
  const oldest = baseMessages[0] ?? null;
  return {
    baseMessageCount: baseMessages.length,
    hasEarlierMessages,
    messages: await hydrateThreadMessagesInDatabase(
      db,
      threadId,
      baseMessages,
      options.selectedVersionByMessageId,
    ),
    olderCursor: oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
  };
}

export async function loadThreadMessagePageAroundAnchorInDatabase(
  db: SQLiteDatabase,
  threadId: string,
  options: LoadThreadMessagePageOptions & { anchorMessageId: string },
): Promise<AiThreadMessagePage> {
  const baseMessages = await aiThreadRepository.listMessagesBaseAroundAnchor(
    db,
    threadId,
    options.anchorMessageId,
    options.limit,
    options.branchScopes,
  );
  const oldest = baseMessages[0] ?? null;
  const olderCursor = oldest
    ? { createdAt: oldest.createdAt, id: oldest.id }
    : null;
  const hasEarlierMessages = Boolean(
    olderCursor
    && (await aiThreadRepository.listMessagesBaseBefore(
      db,
      threadId,
      olderCursor,
      1,
      options.branchScopes,
    )).length,
  );
  return {
    baseMessageCount: baseMessages.length,
    hasEarlierMessages,
    messages: await hydrateThreadMessagesInDatabase(
      db,
      threadId,
      baseMessages,
      options.selectedVersionByMessageId,
    ),
    olderCursor,
  };
}

export async function listThreadMessages(space: PixorySpace, threadId: string, options: ListThreadMessagesOptions = {}): Promise<AiMessageWithCitations[]> {
  return runWithDatabaseSpace(space, (db) => listThreadMessagesInDatabase(db, threadId, options));
}

export async function loadThreadMessagePage(
  space: PixorySpace,
  threadId: string,
  options: LoadThreadMessagePageOptions,
): Promise<AiThreadMessagePage> {
  return runWithDatabaseSpace(space, (db) => loadThreadMessagePageInDatabase(db, threadId, options));
}

export async function loadThreadMessagePageAroundAnchor(
  space: PixorySpace,
  threadId: string,
  options: LoadThreadMessagePageOptions & { anchorMessageId: string },
): Promise<AiThreadMessagePage> {
  return runWithDatabaseSpace(space, (db) => loadThreadMessagePageAroundAnchorInDatabase(db, threadId, options));
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
  const candidateLimit = offset + limit + 1;
  const matches = await runWithDatabaseSpace(input.space, async (db) => {
    const candidateRows = await aiThreadRepository.searchCompletedMessageFts(db, {
      branchScopes,
      limit: candidateLimit,
      query: input.query,
      threadId: input.threadId,
    });
    const messageIds = candidateRows.map((message) => message.id);
    const versionTotalsByMessageId = await aiThreadRepository.listMessageVersionTotalsForMessages(db, messageIds);
    const candidates: AiMessageWithCitations[] = candidateRows
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        ...message,
        citations: [] as AiCitationRecord[],
        messageVersions: [],
        versionIndex: versionTotalsByMessageId[message.id] ?? 1,
        versionTotal: versionTotalsByMessageId[message.id] ?? 1,
      }));
    return candidates
      .map((message) => {
        const score = scoreChatSearchMessage(message, input.query, terms);
        return score ? { message, ...score } : null;
      })
      .filter((item): item is { message: AiMessageWithCitations; matchKind: AiChatSearchMatchKind; rank: number } => Boolean(item))
      .sort((left, right) =>
        left.rank - right.rank ||
        left.message.createdAt.localeCompare(right.message.createdAt) ||
        left.message.id.localeCompare(right.message.id)
      );
  });
  const pagedMatches = matches.slice(offset, offset + limit);
  return {
    hasMore: matches.length > offset + limit,
    results: pagedMatches
      .map((item) => toChatSearchResult(item.message, input.query, terms, item.matchKind)),
  };
}

export async function searchGlobalMessages(input: {
  space: PixorySpace;
  query: string;
  offset?: number;
  limit?: number;
}): Promise<{ results: (AiChatSearchResult & { threadTitle: string; threadId: string })[]; hasMore: boolean }> {
  const terms = buildChatSearchTerms(input.query);
  const limit = Math.max(1, input.limit ?? 40);
  const offset = Math.max(0, input.offset ?? 0);
  if (terms.length === 0) {
    return { hasMore: false, results: [] };
  }
  const candidateLimit = offset + limit + 1;
  const matches = await runWithDatabaseSpace(input.space, async (db) => {
    const candidateRows = await aiThreadRepository.searchGlobalCompletedMessageFts(db, input.space, {
      limit: candidateLimit,
      query: input.query,
    });
    const messageIds = candidateRows.map((message) => message.id);
    const versionTotalsByMessageId = await aiThreadRepository.listMessageVersionTotalsForMessages(db, messageIds);
    const candidates: (AiMessageWithCitations & { threadTitle: string })[] = candidateRows
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        ...message,
        citations: [] as AiCitationRecord[],
        messageVersions: [],
        versionIndex: versionTotalsByMessageId[message.id] ?? 1,
        versionTotal: versionTotalsByMessageId[message.id] ?? 1,
      }));
    return candidates
      .map((message) => {
        const score = scoreChatSearchMessage(message, input.query, terms);
        return score ? { message, ...score } : null;
      })
      .filter((item): item is { message: AiMessageWithCitations & { threadTitle: string }; matchKind: AiChatSearchMatchKind; rank: number } => Boolean(item))
      .sort((left, right) =>
        left.rank - right.rank ||
        left.message.createdAt.localeCompare(right.message.createdAt) ||
        left.message.id.localeCompare(right.message.id)
      );
  });
  const pagedMatches = matches.slice(offset, offset + limit);
  return {
    hasMore: matches.length > offset + limit,
    results: pagedMatches
      .map((item) => ({
        ...toChatSearchResult(item.message, input.query, terms, item.matchKind),
        threadTitle: item.message.threadTitle,
        threadId: item.message.threadId,
      })),
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

export async function loadThreadMessageAppearanceConfig(
  space: PixorySpace,
  threadId: string,
): Promise<AiThreadMessageAppearanceConfig> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread || thread.space !== space) {
      return {
        assistantAvatar: { avatarEnabled: false, avatarUri: null },
        assistantName: null,
        userAvatarEnabled: DEFAULT_AI_USER_AVATAR_ENABLED,
      };
    }
    return parseThreadMessageAppearanceConfig(thread.roleSnapshotJson);
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
    const activeRoleCards = await aiRoleCardRepository.listActive(db, input.space);
    const roleCardsById = new Map(activeRoleCards.map((roleCard) => [roleCard.id, roleCard]));
    return threads.map((thread) => {
      const roleCard = thread.roleCardId ? roleCardsById.get(thread.roleCardId) : null;
      return {
        ...thread,
        avatar: parseThreadAvatarConfig(thread.roleSnapshotJson),
        avatarAvailable: Boolean(roleCard),
        roleCardName: roleCard?.name ?? parseThreadRoleName(thread.roleSnapshotJson),
      };
    });
  });
}

export async function searchGlobalThreads(input: {
  space: PixorySpace;
  query: string;
  limit?: number;
}): Promise<AiHomeThreadItem[]> {
  return runWithDatabaseSpace(input.space, async (db) => {
    // Fetch a larger pool of recent threads without text filtering (so we don't match message contents)
    const threads = await aiThreadRepository.listHistoryItems(db, input.space, 'all', 1000, '');
    const activeRoleCards = await aiRoleCardRepository.listActive(db, input.space);
    const roleCardsById = new Map(activeRoleCards.map((roleCard) => [roleCard.id, roleCard]));
    const queryLower = input.query.toLowerCase();
    
    const results: AiHomeThreadItem[] = [];
    for (const thread of threads) {
      const roleCard = thread.roleCardId ? roleCardsById.get(thread.roleCardId) : null;
      const roleCardName = roleCard?.name ?? parseThreadRoleName(thread.roleSnapshotJson);
      
      if (thread.title.toLowerCase().includes(queryLower) || (roleCardName && roleCardName.toLowerCase().includes(queryLower))) {
        results.push({
          ...thread,
          avatar: parseThreadAvatarConfig(thread.roleSnapshotJson),
          avatarAvailable: Boolean(roleCard),
          roleCardName,
        });
        if (results.length >= (input.limit ?? 20)) {
          break;
        }
      }
    }
    return results;
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
      roleCardName: roleCard?.name ?? parseThreadRoleName(thread.roleSnapshotJson),
      avatar: parseThreadAvatarConfig(thread.roleSnapshotJson),
      userAvatarEnabled:
        parseThreadMessageAppearanceConfig(thread.roleSnapshotJson)
          .userAvatarEnabled,
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
        source: model.source,
      }))
  );
  const [resolvedModel, defaultResolvedModel] = await Promise.all([
    resolveThreadChatModel(space, thread),
    resolveThreadChatModel(space, emptyThreadModelConfig(space)),
  ]);
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
    defaultModelId: defaultResolvedModel.status === 'ready' ? defaultResolvedModel.modelId : null,
    defaultProviderId: defaultResolvedModel.status === 'ready' ? defaultResolvedModel.provider.id : null,
    followDefaultLabel: `跟随全局默认（当前：${defaultLabel}）`,
    modelId: thread.modelId,
    options,
    providerId: thread.providerId,
    sessionBaseUrl: thread.sessionBaseUrl,
    sessionHasApiKeyOverride: thread.providerId ? await hasThreadProviderApiKey(space, thread.id, thread.providerId) : false,
  };
}

export async function addThreadSessionManualModel(input: {
  modelId: string;
  providerId: string;
  space: PixorySpace;
}): Promise<void> {
  await saveManualChatModelCandidate(input.space, input.providerId, input.modelId);
}

export async function deleteProviderModel(input: {
  modelId: string;
  providerId: string;
  space: PixorySpace;
}): Promise<void> {
  await deleteProviderModelService(input.space, input.providerId, input.modelId);
}

export async function deleteProviderModels(input: {
  models: Array<{ providerId: string; modelId: string }>;
  space: PixorySpace;
}): Promise<number> {
  return deleteProviderModelsService(input.space, input.models);
}

export async function deleteProviderModelsByProvider(input: {
  providerId: string;
  space: PixorySpace;
}): Promise<number> {
  return deleteProviderModelsByProviderService(input.space, input.providerId);
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
      sessionBaseUrl: input.baseUrl ? normalizeBaseUrl(input.baseUrl) || null : null,
    });
  });
}

function withProviderVerifyTimeout(ms: number): { cancel: () => void; signal: AbortSignal } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { cancel: () => clearTimeout(timer), signal: controller.signal };
}

export async function verifyThreadSessionModelOverride(space: PixorySpace, threadId: string): Promise<void> {
  const thread = await runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId));
  if (!thread || thread.space !== space) {
    throw new Error('没有找到当前会话，模型未测试。');
  }
  const resolved = await resolveThreadChatModel(space, thread);
  if (resolved.status !== 'ready') {
    throw new Error(resolved.message);
  }
  if (!resolved.apiKey) {
    throw new Error('请先保存当前会话 API Key，或复用全局模型配置。');
  }
  const timeout = withProviderVerifyTimeout(15000);
  try {
    await getAdapterForProvider(resolved.provider).verifyChatCompletion({
      apiKey: resolved.apiKey,
      baseUrl: resolved.provider.baseUrl ?? '',
      modelId: resolved.modelId,
      signal: timeout.signal,
    });
    await recordSuccessfulProviderModel(space, resolved.provider.id, resolved.modelId);
  } catch (error) {
    throw new Error(normalizeAiErrorMessage(error));
  } finally {
    timeout.cancel();
  }
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
    const roleSnapshotPatch: Partial<
      AiThreadAvatarConfig & { userAvatarEnabled: boolean }
    > = {};
    if (input.avatarEnabled != null) {
      roleSnapshotPatch.avatarEnabled = input.avatarEnabled;
    }
    if (input.userAvatarEnabled != null) {
      roleSnapshotPatch.userAvatarEnabled = input.userAvatarEnabled;
    }
    const updated = await aiThreadRepository.updateThread(db, input.threadId, {
      boundaryMode: input.boundaryMode,
      materialRulesSnapshot: thread.contextType === 'normal' ? null : materialRulesForMode(input.boundaryMode),
      modelId: input.modelId,
      providerId: input.providerId,
      roleSnapshotJson:
        Object.keys(roleSnapshotPatch).length === 0
          ? thread.roleSnapshotJson
          : patchThreadRoleSnapshot(thread.roleSnapshotJson, roleSnapshotPatch),
      roleInstructionWeight: input.roleInstructionWeight,
      replyPreference: input.replyPreference,
      contextHistoryRoundLimit: input.contextHistoryRoundLimit,
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
    const roleRows = await db.getAllAsync<{ roleCardId: string }>(
      `SELECT DISTINCT roleCardId FROM ai_threads
       WHERE id IN (${uniqueThreadIds.map(() => '?').join(', ')}) AND roleCardId IS NOT NULL`,
      ...uniqueThreadIds,
    );
    await db.withTransactionAsync(async () => {
      await removeMaterialsByOwner({
        db,
        deletedFileUris,
        space,
        ownerType: 'thread',
        ownerIds: uniqueThreadIds,
      });
      deletedCount = await aiThreadRepository.deleteThreads(db, uniqueThreadIds);
      for (const { roleCardId } of roleRows) {
        await dreamRepository.rebuildRoleRoundCounter(db, { roleCardId, space });
      }
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

  const moveExport = await runWithDatabaseSpace(input.sourceSpace, async (db) => {
    const exported = [];
    for (const threadId of uniqueThreadIds) {
      const snapshot = await aiThreadRepository.exportThread(db, threadId);
      if (snapshot && snapshot.thread.space === input.sourceSpace) {
        exported.push(snapshot);
      }
    }
    const roleCardIds = Array.from(new Set(
      exported
        .map((snapshot) => snapshot.thread.roleCardId)
        .filter((roleCardId): roleCardId is string => Boolean(roleCardId))
    ));
    const roleCards: AiRoleCardRecord[] = [];
    for (const roleCardId of roleCardIds) {
      const roleCard = await aiRoleCardRepository.findAnyById(db, roleCardId);
      if (!roleCard || roleCard.space !== input.sourceSpace) {
        throw new Error('聊天引用的角色卡数据不完整，无法安全迁移。');
      }
      roleCards.push(roleCard);
    }
    const roleMemories = await aiThreadRepository.listRoleMemoriesForSpaceMove(
      db,
      input.sourceSpace,
      roleCardIds
    );
    return { roleCards, roleMemories, snapshots: exported };
  });

  const { roleCards, roleMemories, snapshots } = moveExport;
  if (snapshots.length === 0) {
    return 0;
  }
  for (const snapshot of snapshots) {
    assertAiThreadSpaceMoveAllowed(snapshot);
  }

  const movedThreadIds = snapshots.map((snapshot) => snapshot.thread.id);
  const sourceAttachmentRoot = getAiDocumentsDir(input.sourceSpace);
  const sourceAttachmentUris = Array.from(new Set(
    snapshots.flatMap((snapshot) => snapshot.attachments.map((attachment) => attachment.localUri))
  )).filter((uri) => uri.startsWith(sourceAttachmentRoot));
  const targetRoleState = await runWithDatabaseSpace(input.targetSpace, async (db) => {
    const roleIdMap = new Map<string, string>();
    const existingTargetRoleCards = new Map<string, AiRoleCardRecord>();
    for (const roleCard of roleCards) {
      const existing = await aiRoleCardRepository.findAnyById(db, roleCard.id);
      if (existing && existing.space !== input.targetSpace) {
        throw new Error('目标空间中的角色卡记录异常，无法安全迁移。');
      }
      roleIdMap.set(roleCard.id, roleCard.id);
      if (existing) {
        existingTargetRoleCards.set(roleCard.id, existing);
      }
    }
    const existingTargetMemories =
      await aiThreadRepository.findRoleMemoriesForSpaceMoveByIds(
        db,
        roleMemories.map((memory) => memory.id)
      );
    const existingMemoryById = new Map(
      existingTargetMemories.map((memory) => [memory.id, memory])
    );
    const reservedMemoryIds = new Set(existingTargetMemories.map((memory) => memory.id));
    const memoryIdMap = new Map<string, string>();
    const skippedMemoryIds = new Set<string>();
    for (const memory of roleMemories) {
      const targetRoleCardId = memory.scopeId
        ? roleIdMap.get(memory.scopeId)
        : null;
      if (!targetRoleCardId) {
        throw new Error('角色记忆的迁移映射不完整。');
      }
      const existingMemory = existingMemoryById.get(memory.id);
      if (
        existingMemory?.space === input.targetSpace &&
        existingMemory.scope === 'role' &&
        existingMemory.scopeId === targetRoleCardId
      ) {
        memoryIdMap.set(memory.id, memory.id);
        skippedMemoryIds.add(memory.id);
        continue;
      }
      let targetMemoryId = memory.id;
      while (
        reservedMemoryIds.has(targetMemoryId) ||
        (
          await aiThreadRepository.findRoleMemoriesForSpaceMoveByIds(
            db,
            [targetMemoryId]
          )
        ).length > 0
      ) {
        targetMemoryId = createAiId('aimem');
      }
      memoryIdMap.set(memory.id, targetMemoryId);
      reservedMemoryIds.add(targetMemoryId);
    }
    return {
      existingTargetRoleCards,
      memoryIdMap,
      roleIdMap,
      skippedMemoryIds,
    };
  });
  const {
    existingTargetRoleCards,
    memoryIdMap,
    roleIdMap,
    skippedMemoryIds,
  } = targetRoleState;
  let snapshotsForImport = snapshots;
  let targetAttachmentUris: string[] = [];
  let targetRoleAvatarUris: string[] = [];
  let importedTargetRoleCardIds: string[] = [];
  let importedTargetRoleMemoryIds: string[] = [];
  let reactivatedTargetRoleCards: Array<{
    archivedAt: string;
    id: string;
  }> = [];
  let targetImported = false;
  try {
    const copiedRoles = await copyRoleCardsBetweenSpaces({
      existingTargetRoleCards,
      memories: roleMemories,
      memoryIdMap,
      roleCards,
      roleIdMap,
      skippedMemoryIds,
      snapshots,
      targetSpace: input.targetSpace,
    });
    targetRoleAvatarUris = copiedRoles.copiedTargetAvatarUris;
    importedTargetRoleCardIds = copiedRoles.roleCards
      .filter((roleBundle) => roleBundle.shouldImport)
      .map((roleBundle) => roleBundle.targetRoleCardId);
    importedTargetRoleMemoryIds = copiedRoles.memories.map((memory) => memory.id);
    reactivatedTargetRoleCards = copiedRoles.roleCards
      .filter(
        (roleBundle) =>
          roleBundle.shouldReactivate && Boolean(roleBundle.targetOriginalArchivedAt)
      )
      .map((roleBundle) => ({
        archivedAt: roleBundle.targetOriginalArchivedAt as string,
        id: roleBundle.targetRoleCardId,
      }));
    const copiedAttachments = await copyThreadAttachmentsBetweenSpaces(
      copiedRoles.snapshots,
      input.targetSpace
    );
    snapshotsForImport = copiedAttachments.snapshots;
    targetAttachmentUris = copiedAttachments.copiedTargetUris;

    await runWithDatabaseSpace(input.targetSpace, async (db) => {
      await db.withTransactionAsync(async () => {
        for (const roleBundle of copiedRoles.roleCards) {
          if (roleBundle.shouldReactivate) {
            await aiRoleCardRepository.setArchivedAtForSpaceMove(
              db,
              input.targetSpace,
              roleBundle.targetRoleCardId,
              null
            );
            continue;
          }
          if (!roleBundle.shouldImport) {
            continue;
          }
          await aiRoleCardRepository.importRoleCardForSpaceMove(
            db,
            roleBundle.roleCard,
            input.targetSpace,
            roleBundle.targetRoleCardId,
            roleBundle.targetAvatarUri
          );
        }
        for (const snapshot of snapshotsForImport) {
          await aiThreadRepository.importThread(db, snapshot, input.targetSpace);
        }
        await aiThreadRepository.importRoleMemoriesForSpaceMove(db, copiedRoles.memories);
        for (const roleCardId of roleCards.map((roleCard) => roleCard.id)) {
          await dreamRepository.rebuildRoleRoundCounter(db, {
            roleCardId: roleIdMap.get(roleCardId) ?? roleCardId,
            space: input.targetSpace,
          });
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

    await runWithDatabaseSpace(input.targetSpace, async (db) => {
      await db.withTransactionAsync(async () => {
        for (const snapshot of snapshotsForImport) {
          await aiThreadRepository.restoreMessageAttachmentDocumentLinks(db, snapshot.attachments);
        }
      });
    });

    const deletedFileUris: string[] = [];
    const deletedSourceRoleAvatarUris: string[] = [];
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
        for (const roleCardId of roleCards.map((roleCard) => roleCard.id)) {
          await dreamRepository.rebuildRoleRoundCounter(db, {
            roleCardId,
            space: input.sourceSpace,
          });
        }
        const deletedRoleCards =
          await aiRoleCardRepository.deleteUnreferencedRoleCardsAfterThreadMove(
            db,
            input.sourceSpace,
            roleCards.map((roleCard) => roleCard.id)
          );
        for (const roleCard of deletedRoleCards) {
          if (
            roleCard.avatarUri &&
            !(await aiRoleCardRepository.isAvatarUriReferenced(
              db,
              input.sourceSpace,
              roleCard.avatarUri
            ))
          ) {
            deletedSourceRoleAvatarUris.push(roleCard.avatarUri);
          }
        }
      });
    });
    const sourceRoleAvatarRoot = getAiRoleAvatarsDir(input.sourceSpace);
    await cleanupDeletedMaterialFiles([
      ...deletedFileUris,
      ...sourceAttachmentUris,
      ...deletedSourceRoleAvatarUris.filter((uri) => uri.startsWith(sourceRoleAvatarRoot)),
    ]);
  } catch (error) {
    let targetThreadsRolledBack = !targetImported;
    if (targetImported) {
      try {
        await permanentlyDeleteAiThreads(input.targetSpace, movedThreadIds);
        targetThreadsRolledBack = true;
      } catch (rollbackError) {
        console.warn('Pixory AI thread move rollback failed.', {
          message: rollbackError instanceof Error ? rollbackError.message : 'unknown rollback error',
        });
      }
    }
    const deletedTargetRoleAvatarUris: string[] = [];
    if (!targetImported || targetThreadsRolledBack) {
      try {
        let deletedTargetRoleCards: AiRoleCardRecord[] = [];
        await runWithDatabaseSpace(input.targetSpace, async (db) => {
          await db.withTransactionAsync(async () => {
            await aiThreadRepository.deleteRoleMemoriesForSpaceMove(
              db,
              input.targetSpace,
              importedTargetRoleMemoryIds
            );
            for (const roleCard of reactivatedTargetRoleCards) {
              await aiRoleCardRepository.setArchivedAtForSpaceMove(
                db,
                input.targetSpace,
                roleCard.id,
                roleCard.archivedAt
              );
            }
            deletedTargetRoleCards =
              await aiRoleCardRepository.deleteUnreferencedRoleCardsAfterThreadMove(
                db,
                input.targetSpace,
                importedTargetRoleCardIds
              );
          });
        });
        deletedTargetRoleAvatarUris.push(
          ...deletedTargetRoleCards
            .map((roleCard) => roleCard.avatarUri)
            .filter((uri): uri is string => Boolean(uri))
        );
      } catch (rollbackError) {
        console.warn('Pixory AI role card move rollback failed.', {
          message: rollbackError instanceof Error ? rollbackError.message : 'unknown rollback error',
        });
      }
    }
    await cleanupDeletedMaterialFiles([
      ...(targetThreadsRolledBack ? targetAttachmentUris : []),
      ...(!targetImported ? targetRoleAvatarUris : deletedTargetRoleAvatarUris),
    ]);
    throw error;
  }

  return snapshots.length;
}

async function markAssistantFailed(
  space: PixorySpace,
  assistantMessageId: string,
  generationId: string,
  message: string,
  partialContent = '',
  partialReasoningText: string | null = null,
  promptSnapshotJson?: string
): Promise<string> {
  const completedAt = new Date().toISOString();
  await runWithDatabaseSpace(space, async (db) => {
    await db.withTransactionAsync(async () => {
      await updateAssistantMessageForGeneration(db, assistantMessageId, generationId, {
        status: 'failed',
        content: partialContent,
        reasoningText: partialReasoningText,
        errorMessage: message,
        ...(promptSnapshotJson ? { promptSnapshotJson } : {}),
        completedAt,
      });
      await settleGenerationJob(db, {
        completionReason: 'failed', content: partialContent, errorCode: 'generation_failed',
        generationId, now: completedAt, reasoning: partialReasoningText, state: 'failed',
      });
      await releaseThoughtReservationForMessage(db, assistantMessageId, completedAt);
    });
  });
  stoppedMessageIds.delete(stoppedGenerationKey(assistantMessageId, generationId));
  stoppedTimeoutGenerationIds.delete(stoppedGenerationKey(assistantMessageId, generationId));
  return completedAt;
}

async function markAssistantStopped(
  space: PixorySpace,
  assistantMessageId: string,
  generationId: string,
  partialContent?: string,
  partialReasoningText?: string | null,
  promptSnapshotJson?: string
): Promise<string> {
  const completedAt = new Date().toISOString();
  await runWithDatabaseSpace(space, async (db) => {
    await db.withTransactionAsync(async () => {
      await updateAssistantMessageForGeneration(db, assistantMessageId, generationId, {
        status: 'stopped',
        content: partialContent,
        reasoningText: partialReasoningText,
        ...(promptSnapshotJson ? { promptSnapshotJson } : {}),
        completedAt,
      });
      await settleGenerationJob(db, {
        completionReason: 'stopped', content: partialContent ?? '', generationId,
        now: completedAt, reasoning: partialReasoningText ?? null, state: 'stopped',
      });
      await releaseThoughtReservationForMessage(db, assistantMessageId, completedAt);
    });
  });
  stoppedMessageIds.delete(stoppedGenerationKey(assistantMessageId, generationId));
  return completedAt;
}

async function updateAssistantPromptSnapshot(
  space: PixorySpace,
  assistantMessageId: string,
  generationId: string,
  promptSnapshotJson: string
): Promise<void> {
  await runWithDatabaseSpace(space, (db) =>
    updateAssistantMessageForGeneration(db, assistantMessageId, generationId, { promptSnapshotJson }, { syncFts: false })
  );
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

function contextHistoryLoadLimit(roundLimit: number): number {
  const normalizedRounds = normalizeAiContextSettings({ historyRoundLimit: roundLimit }).historyRoundLimit;
  return Math.max(32, normalizedRounds * 3 + 1);
}

function selectRecentMessagesByRound(messages: AiMessageRecord[], roundLimit: number): {
  messages: AiMessageRecord[];
  trimmed: boolean;
} {
  const normalizedRounds = normalizeAiContextSettings({ historyRoundLimit: roundLimit }).historyRoundLimit;
  const rounds: AiMessageRecord[][] = [];
  let currentRound: AiMessageRecord[] | null = null;
  const flushCompleteRound = () => {
    if (currentRound?.some((message) => message.role === 'assistant')) {
      rounds.push(currentRound);
    }
  };
  for (const message of messages) {
    if (message.role === 'user') {
      flushCompleteRound();
      currentRound = [message];
    } else if (message.role === 'assistant' && currentRound) {
      currentRound.push(message);
    }
  }
  flushCompleteRound();
  const selectedRounds = rounds.slice(-normalizedRounds);
  const selectedMessages = selectedRounds.flat();
  return {
    messages: selectedMessages,
    trimmed: selectedMessages.length < messages.length,
  };
}

function buildChatHistory(messages: AiMessageRecord[], userMessageId: string, options?: {
  historyRoundLimit?: number;
  modelContextWindowTokens?: number | null;
  protectedPrompt?: string;
}): {
  contextTrimmedByCount: boolean;
  contextTrimmedByBudget: boolean;
  history: Array<{ role: 'assistant' | 'user'; content: string }>;
} {
  const userIndex = messages.findIndex((message) => message.id === userMessageId);
  const previousMessages = userIndex >= 0 ? messages.slice(0, userIndex) : messages;
  const completedMessages = previousMessages
    .filter((message) => message.role !== 'system' && message.status === 'completed')
  const roundSelected = selectRecentMessagesByRound(
    completedMessages,
    options?.historyRoundLimit ?? AI_CONTEXT_DEFAULTS.historyRoundLimit,
  );
  const budgeted = trimMessagesToContextBudget({
    messages: roundSelected.messages,
    protectedPrompt: options?.protectedPrompt ?? 'Current user message and role instruction are protected from context trimming.',
    modelContextWindowTokens: options?.modelContextWindowTokens,
  });
  return {
    contextTrimmedByCount: roundSelected.trimmed,
    contextTrimmedByBudget: budgeted.trimmed,
    history: budgeted.messages
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: message.content,
      })),
  };
}

function buildAssistantContinuationContext(input: {
  initialAnswerText: string;
  initialReasoningText?: string | null;
}): string {
  const visibleAnswer = input.initialAnswerText.trim();
  const hiddenReasoning = input.initialReasoningText?.trim();
  return [
    visibleAnswer,
    hiddenReasoning
      ? [
          '',
          '---',
          'Continuation-only hidden context. Do not reveal, mention, quote, or summarize this section in the user-visible answer.',
          hiddenReasoning,
        ].join('\n')
      : '',
  ].filter(Boolean).join('\n');
}

function appendVisibleAssistantPartialToHistory(
  history: Array<{ role: 'assistant' | 'user'; content: string }>,
  input: {
    assistantPartial: string;
    originalUserPrompt?: string;
    userHistoryContent?: string;
  }
): Array<{ role: 'assistant' | 'user'; content: string }> {
  const userHistoryContent = input.userHistoryContent ?? input.originalUserPrompt ?? '';
  return [
    ...history,
    { role: 'user', content: userHistoryContent },
    { role: 'assistant', content: input.assistantPartial },
  ];
}

function appendContinuationAnswerDelta(currentText: string, delta: string, initialAnswerText: string): string {
  return mergeContinuationDelta(initialAnswerText, currentText, delta);
}

type RecoverableThreadSnapshot = Pick<AiThreadRecord,
  | 'boundaryMode'
  | 'boundIpId'
  | 'boundKnowledgeBaseId'
  | 'contextHistoryRoundLimit'
  | 'contextType'
  | 'includeIpDocuments'
  | 'materialRulesSnapshot'
  | 'modelId'
  | 'modelSnapshotJson'
  | 'providerId'
  | 'replyPreference'
  | 'roleCardId'
  | 'roleInstructionWeight'
  | 'roleSnapshotJson'
  | 'sessionApiKeyRef'
  | 'sessionBaseUrl'
  | 'systemPrompt'
  | 'thinkingDisabled'
>;

interface PersistedGenerationRequestSnapshot {
  version: 1;
  thread: RecoverableThreadSnapshot;
  attachments: AiOutgoingAttachment[];
  continuationContext: { answerText: string; reasoningText?: string | null } | null;
  continuationInstruction: string | null;
  historyAnchorMessageId: string | null;
  requestContentOverride: string | null;
}

function buildGenerationRequestSnapshot(input: Parameters<typeof streamAssistantReply>[0]): PersistedGenerationRequestSnapshot {
  const thread = input.thread;
  return {
    version: 1,
    thread: {
      boundaryMode: thread.boundaryMode,
      boundIpId: thread.boundIpId,
      boundKnowledgeBaseId: thread.boundKnowledgeBaseId,
      contextHistoryRoundLimit: thread.contextHistoryRoundLimit,
      contextType: thread.contextType,
      includeIpDocuments: thread.includeIpDocuments,
      materialRulesSnapshot: thread.materialRulesSnapshot,
      modelId: thread.modelId,
      modelSnapshotJson: thread.modelSnapshotJson,
      providerId: thread.providerId,
      replyPreference: thread.replyPreference,
      roleCardId: thread.roleCardId,
      roleInstructionWeight: thread.roleInstructionWeight,
      roleSnapshotJson: thread.roleSnapshotJson,
      sessionApiKeyRef: thread.sessionApiKeyRef,
      sessionBaseUrl: thread.sessionBaseUrl,
      systemPrompt: thread.systemPrompt,
      thinkingDisabled: thread.thinkingDisabled,
    },
    attachments: input.attachments ?? [],
    continuationContext: input.continuationContext ?? null,
    continuationInstruction: input.continuationInstruction ?? null,
    historyAnchorMessageId: input.historyAnchorMessageId ?? null,
    requestContentOverride: input.requestContentOverride ?? null,
  };
}

function parseGenerationRequestSnapshot(value: string): PersistedGenerationRequestSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<PersistedGenerationRequestSnapshot>;
    return parsed.version === 1 && parsed.thread && Array.isArray(parsed.attachments)
      ? parsed as PersistedGenerationRequestSnapshot
      : null;
  } catch {
    return null;
  }
}

async function transitionGenerationToRequesting(input: {
  cacheMetadataJson: string;
  generationId: string;
  modelId: string;
  promptSnapshotHash: string;
  protocol: string;
  providerId: string;
  space: PixorySpace;
}): Promise<void> {
  await runWithDatabaseSpace(input.space, (db) => transitionGenerationJob(db, {
    cacheMetadataJson: input.cacheMetadataJson,
    generationId: input.generationId,
    modelId: input.modelId,
    now: new Date().toISOString(),
    promptSnapshotHash: input.promptSnapshotHash,
    protocol: input.protocol,
    providerId: input.providerId,
    state: 'requesting',
  })).then((job) => {
    if (!job) throw new Error('Generation recovery record is missing before the provider request.');
  });
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

async function stageExplicitMemoryIntentObservation(input: {
  space: PixorySpace;
  thread: AiThreadRecord;
  messageId: string;
  messageContent: string;
}): Promise<void> {
  const intent = detectMemoryIntent(input.messageContent);
  if (!intent.explicitUserAction || (intent.intent !== 'forget' && intent.intent !== 'correction')) {
    return;
  }
  await runWithDatabaseSpace(input.space, async (db) => {
    const message = await aiThreadRepository.findMessageById(db, input.messageId);
    const branchScopes = message?.branchRootMessageId && message.branchVersionIndex != null
      ? await aiThreadRepository.resolveBranchLineage(
        db,
        message.branchRootMessageId,
        message.branchVersionIndex
      )
      : [];
    const targetClaimIds = await resolveMemoryIntentTargetClaimIds(db, {
      branchScopes,
      observation: intent,
      thread: input.thread,
    });
    const targets = targetClaimIds.length > 0
      ? await db.getAllAsync<{
        canonicalClaimId: string;
        predicate: string;
        scopeType: string;
        scopeId: string | null;
      }>(
        `SELECT canonicalClaimId, predicate, scopeType, scopeId
         FROM memory_claims
         WHERE space = ? AND id IN (${targetClaimIds.map(() => '?').join(', ')})`,
        input.space,
        ...targetClaimIds
      )
      : [];
    await writeCurrentTurnObservation(db, {
      branchRootMessageId: branchScopes[0]?.branchRootMessageId ?? null,
      branchVersionIndex: branchScopes[0]?.branchVersionIndex ?? null,
      explicitUserAction: true,
      intent: intent.intent,
      messageId: input.messageId,
      payload: {
        ...intent.payload,
        candidateSource: 'pre-provider-intent-v1',
        targetClaimIds,
        targets,
      },
      space: input.space,
      threadId: input.thread.id,
    });
  });
}

async function streamAssistantReply(input: {
  space: PixorySpace;
  thread: AiThreadRecord;
  userMessage: Pick<AiMessageRecord, 'id' | 'content'>;
  attachments?: AiOutgoingAttachment[];
  assistantMessageId: string;
  generationMetrics: AiGenerationMetricsDraft;
  ignoreReasoningDeltas?: boolean;
  initialAnswerText?: string;
  initialReasoningText?: string | null;
  mode?: 'replace' | 'continue' | 'followup';
  requestContentOverride?: string;
  historyAnchorMessageId?: string;
  continuationContext?: {
    answerText: string;
    reasoningText?: string | null;
  };
  continuationInstruction?: string;
  signal?: AbortSignal;
  getStreamingVisibility?: () => StreamingVisibilityState;
  onCreated?: (ids: AiGenerationCreatedInfo) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onTimeout?: () => void;
  onUpdated?: () => void;
}): Promise<void> {
  await drainCurrentTurnMemory({
    maxDurationMs: 20,
    space: input.space,
    threadId: input.thread.id,
  }).catch(() => 0);
  await stageExplicitMemoryIntentObservation({
    messageContent: input.userMessage.content,
    messageId: input.userMessage.id,
    space: input.space,
    thread: input.thread,
  });
  const mode = input.mode ?? 'replace';
  const messageDisplayKind: AiMessageDisplayKind | null =
    mode === 'followup' ? 'standalone_assistant' : null;
  const initialAnswerText = mode === 'continue' ? input.initialAnswerText ?? '' : '';
  const initialReasoningText = mode === 'continue' ? input.initialReasoningText ?? null : null;
  const requestContent = input.requestContentOverride ?? input.userMessage.content;
  const ignoreReasoningDeltas = Boolean(input.ignoreReasoningDeltas);
  let answerText = initialAnswerText;
  let reasoningText = initialReasoningText ?? '';
  const citationMarkerParser = new CitationMarkerStreamParser(initialAnswerText);
  let parsedCitationMarkers: ParsedCitationMarker[] = [];
  let citationRegistry: CitationRegistryEntry[] = [];
  let retainedCitations: AiCitationRecord[] = [];
  let citationParserFinalized = false;
  const pendingAnswerChunks: string[] = [];
  const pendingReasoningChunks: string[] = [];
  let pendingAnswerChars = 0;
  let pendingReasoningChars = 0;
  function flushStreamingTextChunks() {
    if (pendingAnswerChunks.length > 0) {
      answerText += pendingAnswerChunks.join('');
      pendingAnswerChunks.length = 0;
      pendingAnswerChars = 0;
    }
    if (pendingReasoningChunks.length > 0) {
      reasoningText += pendingReasoningChunks.join('');
      pendingReasoningChunks.length = 0;
      pendingReasoningChars = 0;
    }
  }
  function finalizeCitationParser(): void {
    if (citationParserFinalized) return;
    const result = citationMarkerParser.finish();
    citationParserFinalized = true;
    parsedCitationMarkers = result.markers;
    if (result.visibleTail) {
      if (mode === 'continue') answerText = appendContinuationAnswerDelta(answerText, result.visibleTail, initialAnswerText);
      else pendingAnswerChunks.push(result.visibleTail);
    }
    flushStreamingTextChunks();
  }
  async function persistParsedCitations(completedAt: string): Promise<AiCitationRecord[]> {
    return runWithDatabaseSpace(input.space, async (db) => {
      if (mode === 'continue' && retainedCitations.length === 0) {
        retainedCitations = await aiThreadRepository.listCitations(db, input.assistantMessageId);
      }
      if (mode === 'continue') {
        retainedCitations = await revalidateRetainedCitations(db, input.thread, retainedCitations, initialAnswerText, completedAt);
      }
      const appendedCitations = citationRegistry.length && parsedCitationMarkers.length
        ? await buildValidatedAnswerCitations(db, {
            answerText,
            markers: parsedCitationMarkers,
            now: completedAt,
            registry: citationRegistry,
            thread: input.thread,
          })
        : [];
      const citations = mode === 'continue'
        ? mergeContinuationCitations(retainedCitations, appendedCitations)
        : appendedCitations;
      await aiThreadRepository.replaceCitations(db, input.assistantMessageId, citations);
      return aiThreadRepository.listCitations(db, input.assistantMessageId);
    });
  }
  let assistantReset = mode === 'continue';
  const generationMetrics = input.generationMetrics;
  const generationId = generationMetrics.context.generationId;
  const streamingPerformanceIdentity: StreamingPerformanceIdentity = {
    generationId,
    messageId: input.assistantMessageId,
    space: input.space,
    threadId: input.thread.id,
  };
  const recordStreamingProviderDelta = (event: AiStreamEvent) => {
    if (event.type === 'answer_delta') {
      generationMetrics.counters.providerAnswerChars += [...event.text].length;
    }
    if (event.type === 'reasoning_delta') {
      generationMetrics.counters.providerReasoningChars += [...event.text].length;
    }
  };
  const recordStreamingPersistence = (elapsedMs: number) => {
    generationMetrics.counters.partialPersistTotalMs += Math.max(0, elapsedMs);
  };
  const mergeStreamingPerformanceSnapshot = () => {
    const snapshot = takeStreamingPerformanceSnapshot(streamingPerformanceIdentity);
    if (!snapshot) return;
    generationMetrics.counters.maxUiBacklogChars = Math.max(
      generationMetrics.counters.maxUiBacklogChars,
      snapshot.maxUiBacklogChars,
    );
    generationMetrics.counters.maxUiBacklogAgeMs = Math.max(
      generationMetrics.counters.maxUiBacklogAgeMs,
      snapshot.maxUiBacklogAgeMs,
    );
    generationMetrics.counters.detachedTailMergeTotalMs += snapshot.detachedTailMergeTotalMs;
  };
  const emitMessagePatch = (patch: Omit<AiStreamingMessagePatch, 'generationId'>) => {
    input.onMessagePatch?.({ generationId, ...patch });
  };
  markGenerationMetric(generationMetrics, 'generationStartAt');
  const currentStopReason = () =>
    stoppedTimeoutGenerationIds.has(stoppedGenerationKey(input.assistantMessageId, generationId))
      ? 'timeout_failed'
      : stoppedMessageIds.has(stoppedGenerationKey(input.assistantMessageId, generationId))
        ? 'user_stopped'
        : 'aborted';
  const stopForAbort = async (options?: { buildPromptSnapshotJson?: () => string }): Promise<boolean> => {
    if (!input.signal?.aborted) {
      return false;
    }
    const stopReason = currentStopReason();
    finalizeCitationParser();
    generationMetrics.context.stopReason = stopReason;
    if (stopReason === 'timeout_failed') {
      const errorMessage = '生成已中断';
      const completedAt = await markAssistantFailed(
        input.space,
        input.assistantMessageId,
        generationId,
        errorMessage,
        assistantReset ? answerText : '',
        assistantReset ? reasoningText || null : null,
        options?.buildPromptSnapshotJson?.() ?? buildMetricsOnlyPromptSnapshotJson({
          generationMetrics,
          messageDisplayKind,
          stopReason,
        }),
      );
      const citations = await persistParsedCitations(completedAt);
      emitMessagePatch({
        id: input.assistantMessageId,
        status: 'failed',
        content: assistantReset ? answerText : '',
        reasoningText: assistantReset ? reasoningText || null : null,
        errorMessage,
        completedAt,
        citations,
      });
      input.onUpdated?.();
      return true;
    }
    const completedAt = await markAssistantStopped(
      input.space,
      input.assistantMessageId,
      generationId,
      assistantReset ? answerText : undefined,
      assistantReset ? reasoningText || null : undefined,
      options?.buildPromptSnapshotJson?.() ?? buildMetricsOnlyPromptSnapshotJson({
        generationMetrics,
        messageDisplayKind,
        stopReason,
      })
    );
    const citations = await persistParsedCitations(completedAt);
    emitMessagePatch({
      id: input.assistantMessageId,
      status: 'stopped',
      content: assistantReset ? answerText : undefined,
      reasoningText: assistantReset ? reasoningText || null : undefined,
      completedAt,
      citations,
    });
    input.onUpdated?.();
    return true;
  };
  if (await stopForAbort()) {
    return;
  }
  stoppedMessageIds.delete(stoppedGenerationKey(input.assistantMessageId, generationId));
  stoppedTimeoutGenerationIds.delete(stoppedGenerationKey(input.assistantMessageId, generationId));
  const startedAt = new Date().toISOString();
  if (!generationMetrics.timestamps.assistantPlaceholderPersistStartAt) {
    markGenerationMetric(generationMetrics, 'assistantPlaceholderPersistStartAt');
  }
  await runWithDatabaseSpace(input.space, async (db) => {
    if (mode === 'continue') {
      retainedCitations = await revalidateRetainedCitations(
        db,
        input.thread,
        await aiThreadRepository.listCitations(db, input.assistantMessageId),
        initialAnswerText,
        startedAt,
      );
      await aiThreadRepository.replaceCitations(db, input.assistantMessageId, retainedCitations);
      retainedCitations = await aiThreadRepository.listCitations(db, input.assistantMessageId);
    }
    const resetPatch = mode === 'continue'
      ? {
          status: 'generating' as const,
          content: initialAnswerText,
          reasoningText: initialReasoningText,
          errorMessage: null,
          providerId: null,
          modelId: null,
          modelSnapshotJson: '{}',
          promptSnapshotJson: buildGenerationGuardSnapshotJsonWithDisplayKind(
            generationMetrics,
            messageDisplayKind,
          ),
          completedAt: null,
        }
      : {
          status: 'generating' as const,
          content: '',
          reasoningText: null,
          errorMessage: null,
          providerId: null,
          modelId: null,
          modelSnapshotJson: '{}',
          promptSnapshotJson: buildGenerationGuardSnapshotJsonWithDisplayKind(
            generationMetrics,
            messageDisplayKind,
          ),
          createdAt: startedAt,
          completedAt: null,
        };
    const resetMessage = await updateAssistantMessageForGeneration(db, input.assistantMessageId, generationId, resetPatch);
    if (!resetMessage) {
      return;
    }
    if (mode !== 'continue') await aiThreadRepository.replaceCitations(db, input.assistantMessageId, []);
  });
  if (!(await runWithDatabaseSpace(input.space, (db) => isAssistantMessageCurrentGeneration(db, input.assistantMessageId, generationId)))) {
    return;
  }
  if (!generationMetrics.timestamps.assistantPlaceholderPersistEndAt) {
    markGenerationMetric(generationMetrics, 'assistantPlaceholderPersistEndAt');
  }
  assistantReset = true;
  emitMessagePatch({
    id: input.assistantMessageId,
    status: 'generating',
    content: initialAnswerText,
    reasoningText: initialReasoningText,
    errorMessage: null,
    providerId: null,
    modelId: null,
    modelSnapshotJson: '{}',
    promptSnapshotJson: '{}',
    createdAt: mode === 'continue' ? undefined : startedAt,
    completedAt: null,
    citations: retainedCitations,
  });
  input.onUpdated?.();

  if (await stopForAbort()) {
    return;
  }

  let apiKey: string | null = '';
  let branchScopes: AiBranchScope[] = [];
  let companionContextPlan: CompanionContextPlan | null = null;
  let companionBranchRouteHash = '';
  let cacheObservationBase: ReturnType<typeof buildCacheObservationBase>;
  let contextTrimmed = false;
  let contextTrimmedByBudget = false;
  let contextTrimmedByCount = false;
  let coverage: CompiledConversationCoverage;
  let history: Array<{ role: 'assistant' | 'user'; content: string }> = [];
  let modelId = '';
  let modelContextWindowTokens: number | null = null;
  let outgoingAttachments: AiChatAttachment[] = [];
  let previousRequestAt: string | null = null;
  let prompt: Awaited<ReturnType<typeof buildPromptForThread>>['prompt'];
  let memoryContextPlan: MemoryContextPlan;
  let provider: AiProviderRecord;
  let providerCachePolicy: ReturnType<typeof buildProviderCachePolicy>;
  let legacyThinkingDisabled = false;
  let snippets: Awaited<ReturnType<typeof buildPromptForThread>>['snippets'] = [];
  let userPrompt = '';
  const requestedAt = startedAt;

  try {
    markGenerationMetric(generationMetrics, 'branchResolveStartAt');
    branchScopes = await runWithDatabaseSpace(input.space, (db) =>
      resolveStreamingBranchScopes(db, {
        assistantMessageId: input.assistantMessageId,
        userMessageId: input.userMessage.id,
      })
    );
    generationMetrics.context.branchScopeCount = branchScopes.length;
    markGenerationMetric(generationMetrics, 'branchResolveEndAt');
    await runWithDatabaseSpace(input.space, async (db) => {
      await db.withTransactionAsync(async () => {
        await createPreparedGenerationJob(db, {
          assistantMessageId: input.assistantMessageId,
          attemptId: createAiId('aiattempt'),
          branchRouteHash: hashBranchRoute(branchScopes),
          generationId,
          lineageVersion: input.thread.lineageVersion ?? 0,
          now: startedAt,
          partialContent: initialAnswerText,
          partialReasoning: initialReasoningText,
          requestMode: mode,
          requestSnapshotJson: JSON.stringify(buildGenerationRequestSnapshot(input)),
          space: input.space,
          threadId: input.thread.id,
          userMessageId: input.userMessage.id,
        });
      });
    });
    observeThoughtScope(input.space, { branchRouteHash: hashBranchRoute(branchScopes), roleCardId: input.thread.roleCardId, threadId: input.thread.id });
    if (input.thread.roleCardId) {
      try {
        const recentMessages = await runWithDatabaseSpace(input.space, (db) =>
          aiThreadRepository.listSnapshotCandidateMessages(db, input.thread.id, 20, branchScopes));
        await detectAndCreateManualDreamRequest({
          branchRouteHash: hashBranchRoute(branchScopes),
          recentMessages,
          space: input.space,
          threadId: input.thread.id,
          userMessageId: input.userMessage.id,
        });
      } catch {
        // Manual dream affordance is recoverable and must not block chat generation.
      }
    }
    try {
      const observed = await observeCompanionCurrentTurn({
        branchScopes,
        space: input.space,
        thread: input.thread,
        userMessageId: input.userMessage.id,
      });
      companionBranchRouteHash = observed.branchRouteHash;
      const compilerStartedAt = Date.now();
      const compiledPlan = await runWithDatabaseSpace(input.space, async (db) => {
        const completedMessageCount = await aiThreadRepository.countCompletedNonSystemMessages(
          db,
          input.thread.id,
          branchScopes,
        );
        return compileCompanionContext(db, {
          branchRouteHash: observed.branchRouteHash,
          awarenessEnabled: observed.awarenessEnabled,
          currentMessageId: input.userMessage.id,
          currentRound: Math.floor(completedMessageCount / 2),
          lineageVersion: input.thread.lineageVersion ?? 0,
          now: requestedAt,
          roleCardId: input.thread.roleCardId,
          space: input.space,
          threadId: input.thread.id,
        });
      });
      companionContextPlan = compiledPlan;
      generationMetrics.context.companionEventCount = observed.events.length;
      generationMetrics.context.companionDiagnosticCandidateCount = observed.diagnosticCandidateCount;
      generationMetrics.context.companionObserverDurationMs = observed.observerDurationMs;
      generationMetrics.context.companionCompilerDurationMs = Date.now() - compilerStartedAt;
      generationMetrics.context.companionOptionalCandidateCount = compiledPlan.optionalCandidateCount;
      generationMetrics.context.companionPolicyVersion = compiledPlan.policyVersion;
      generationMetrics.context.companionProjectionVersion = compiledPlan.projectionVersion;
      generationMetrics.context.companionStanceLabel = compiledPlan.stanceLabel;
      generationMetrics.context.companionSelectedTopicType = compiledPlan.selectedTopicType;
      await runWithDatabaseSpace(input.space, (db) => recordCompanionContextTrace(db, {
        branchRouteHash: observed.branchRouteHash,
        compilerDurationMs: generationMetrics.context.companionCompilerDurationMs,
        diagnosticCandidateCount: observed.diagnosticCandidateCount,
        eventCount: observed.events.length,
        id: deriveCompanionTraceId({
          branchRouteHash: observed.branchRouteHash,
          lineageVersion: input.thread.lineageVersion ?? 0,
          sourceMessageId: input.userMessage.id,
          space: input.space,
          threadId: input.thread.id,
        }),
        lineageVersion: input.thread.lineageVersion ?? 0,
        observerDurationMs: observed.observerDurationMs,
        optionalCandidateCount: compiledPlan.optionalCandidateCount,
        policyVersion: compiledPlan.policyVersion,
        selectedTopicType: compiledPlan.selectedTopicType,
        sourceMessageId: input.userMessage.id,
        space: input.space,
        threadId: input.thread.id,
      }));
    } catch {
      companionContextPlan = null;
    }
    markGenerationMetric(generationMetrics, 'providerResolveStartAt');
    const resolvedModel = await resolveThreadChatModel(input.space, input.thread);
    markGenerationMetric(generationMetrics, 'providerResolveEndAt');
    if (await stopForAbort()) {
      return;
    }
    if (resolvedModel.status !== 'ready') {
      const failureCode = setGenerationFailureReason(generationMetrics, resolvedModel.status);
      await markAssistantFailed(
        input.space,
        input.assistantMessageId,
        generationId,
        resolvedModel.message,
        answerText,
        reasoningText || null,
        buildMetricsOnlyPromptSnapshotJson({
          failureReason: failureCode,
          generationMetrics,
          messageDisplayKind,
        })
      );
      emitMessagePatch({ id: input.assistantMessageId, status: 'failed', content: answerText, reasoningText: reasoningText || null, errorMessage: resolvedModel.message, completedAt: new Date().toISOString() });
      input.onUpdated?.();
      return;
    }
    ({ apiKey, modelContextWindowTokens, modelId, provider } = resolvedModel);
    legacyThinkingDisabled = resolvedModel.thinkingDisabledOverride ?? false;
    if (legacyThinkingDisabled && !input.thread.thinkingDisabled) {
      input.onCreated?.({
        assistantMessageId: input.assistantMessageId,
        generationId,
        thinkingExpected: false,
        userMessageId: input.userMessage.id,
      });
    }
    generationMetrics.context.providerId = provider.id;
    generationMetrics.context.modelId = modelId;
    generationMetrics.context.modelContextWindowTokens = resolvedModel.modelContextWindowTokens;
    if (!apiKey) {
      const apiKeyMessage = '当前模型账号不可用，请检查 API key 或切换当前会话模型。';
      const failureCode = setGenerationFailureReason(generationMetrics, 'missing_api_key');
      await markAssistantFailed(
        input.space,
        input.assistantMessageId,
        generationId,
        apiKeyMessage,
        answerText,
        reasoningText || null,
        buildMetricsOnlyPromptSnapshotJson({
          failureReason: failureCode,
          generationMetrics,
          messageDisplayKind,
        })
      );
      emitMessagePatch({ id: input.assistantMessageId, status: 'failed', content: answerText, reasoningText: reasoningText || null, errorMessage: apiKeyMessage, completedAt: new Date().toISOString() });
      input.onUpdated?.();
      return;
    }

    const hasImageAttachments = (input.attachments ?? []).some((a) => a.kind === 'image');
    // If the user attached images, always send them — the user's intent is the
    // strongest signal.  Model capability flags may be stale or incomplete; let
    // the provider return an error if the model truly cannot handle images.
    const canSendVisionAttachments = hasImageAttachments || (provider.visionEnabled && resolvedModel.model.supportsVision);
    const preparedAttachments = await prepareOutgoingAttachments({
      attachments: input.attachments,
      space: input.space,
      threadId: input.thread.id,
      visionEnabled: canSendVisionAttachments,
    });
    outgoingAttachments = preparedAttachments.providerAttachments;
    const attachmentPromptContext = preparedAttachments.promptContext;
    const historyRoundLimit = normalizeAiContextSettings({
      historyRoundLimit: input.thread.contextHistoryRoundLimit,
    }).historyRoundLimit;
    markGenerationMetric(generationMetrics, 'promptBuildStartAt');
    ({ coverage, prompt, snippets, memoryContextPlan } = await buildPromptForThread(input.thread, requestContent, branchScopes, {
      allowCompanionArtifact: !companionContextPlan?.selectedRepairId && !companionContextPlan?.selectedOpenLoopId && !companionContextPlan?.selectedTemporalAnchorId,
      assistantMessageId: input.assistantMessageId,
      attachmentPromptContext,
      companionDynamicSegments: companionContextPlan?.dynamicSegments,
      generationMetrics,
      historyAnchorMessageId: input.historyAnchorMessageId ?? input.userMessage.id,
      historyRoundLimit,
    }));
    prompt = fitBuiltPromptToContextBudget({ modelContextWindowTokens, prompt });
    snippets = filterSnippetsPresentInPrompt(snippets, prompt);
    citationRegistry = snippets;
    generationMetrics.context.chatMode = prompt.cacheMetadata.chatMode;
    generationMetrics.context.memoryEpoch = prompt.cacheMetadata.memoryEpoch;
    generationMetrics.context.retrievalSnippetCount = snippets.length;
    generationMetrics.context.stablePrefixEstimatedTokens = prompt.cacheMetadata.stablePrefixEstimatedTokens;
    generationMetrics.context.dynamicContextTokenCount = prompt.promptLayers
      .filter((layer) => (
        layer.name === 'companion_runtime'
        || layer.name === 'temporal_open_loops'
        || layer.name === 'summary_bridge'
        || layer.name === 'user_observation'
      ))
      .reduce((total, layer) => total + (layer.text ? estimatePromptTokens(layer.text) : 0), 0);
    markGenerationMetric(generationMetrics, 'promptBuildEndAt');
    if (await stopForAbort()) {
      return;
    }
    if (await stopForAbort()) {
      return;
    }
    if (!coverage.plan.coverageComplete) {
      throw new Error('Conversation coverage is incomplete.');
    }
    const historyMessages = coverage.recentMessages;
    const protectedPrompt = [
      prompt.system,
      prompt.user,
      requestContent,
      mode === 'continue' ? initialAnswerText : '',
      mode === 'continue' ? CONTINUE_ASSISTANT_REPLY_INSTRUCTION : '',
      mode === 'followup' ? input.continuationContext?.answerText ?? '' : '',
      mode === 'followup' ? input.continuationInstruction ?? '' : '',
    ].filter(Boolean).join('\n\n');
    ({ contextTrimmedByCount, contextTrimmedByBudget, history } = buildChatHistory(historyMessages, input.userMessage.id, {
      historyRoundLimit,
      modelContextWindowTokens,
      protectedPrompt,
    }));
    if (mode === 'continue') {
      history = appendVisibleAssistantPartialToHistory(history, {
        assistantPartial: buildAssistantContinuationContext({
          initialAnswerText,
          initialReasoningText,
        }),
        originalUserPrompt: prompt.user,
      });
      userPrompt = CONTINUE_ASSISTANT_REPLY_INSTRUCTION;
    } else if (mode === 'followup' && input.continuationContext) {
      history = appendVisibleAssistantPartialToHistory(history, {
        assistantPartial: buildAssistantContinuationContext({
          initialAnswerText: input.continuationContext.answerText,
          initialReasoningText: input.continuationContext.reasoningText,
        }),
        userHistoryContent: input.userMessage.content,
      });
      userPrompt = input.continuationInstruction ?? CONTINUE_ASSISTANT_NEW_REPLY_INSTRUCTION;
    } else {
      userPrompt = prompt.user;
    }
    generationMetrics.context.loadedMessageCountAtSend = coverage.recentMessages.length;
    generationMetrics.context.historyMessageCount = history.length;
    contextTrimmed = contextTrimmedByCount || contextTrimmedByBudget || Boolean(prompt.contextBudgetTrimmed);
    previousRequestAt = historyMessages.at(-1)?.completedAt ?? null;
    const turnIntervalMs = previousRequestAt ? Date.parse(requestedAt) - Date.parse(previousRequestAt) : null;
    const promptCacheSettings = await resolvePromptCacheSettings(input.space);
    providerCachePolicy = buildProviderCachePolicy({
      branchRouteHash: buildBranchRouteHash(branchScopes),
      generationParamsHash: buildGenerationParamsHash({
        historyRoundLimit,
        thinkingDisabled: input.thread.thinkingDisabled || legacyThinkingDisabled,
      }),
      metadata: prompt.cacheMetadata,
      modelId,
      previousRequestAt,
      provider: {
        ...provider,
        openAiUsageObservationEnabled: openAiUsageObservationEnabled(provider),
      },
      requestedAt,
      settings: promptCacheSettings,
      scopeKey: buildPromptScopeKey(input.thread),
      stableSystemBlocks: prompt.stableSystemBlocks,
    });
    cacheObservationBase = buildCacheObservationBase({
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
  } catch (error) {
    if (await stopForAbort({ buildPromptSnapshotJson: () => buildMetricsOnlyPromptSnapshotJson({ generationMetrics, messageDisplayKind, stopReason: currentStopReason() }) })) {
      return;
    }
    const readableError = normalizeAiErrorMessage(error);
    const failureCode = setGenerationFailureReason(generationMetrics, error);
    await markAssistantFailed(
      input.space,
      input.assistantMessageId,
      generationId,
      readableError,
      answerText,
      reasoningText || null,
      buildMetricsOnlyPromptSnapshotJson({
        failureReason: failureCode,
        generationMetrics,
        messageDisplayKind,
      })
    );
    emitMessagePatch({ id: input.assistantMessageId, status: 'failed', content: answerText, reasoningText: reasoningText || null, errorMessage: readableError, completedAt: new Date().toISOString() });
    input.onUpdated?.();
    return;
  }
  let providerUsageRaw: unknown = null;
  const createPromptSnapshotJson = (snapshotOptions?: { failureReason?: string | null; stopReason?: string | null }) => {
    if (snapshotOptions?.failureReason) {
      setGenerationFailureReason(generationMetrics, snapshotOptions.failureReason);
    }
    if (snapshotOptions?.stopReason) {
      generationMetrics.context.stopReason = snapshotOptions.stopReason;
    }
    if ((snapshotOptions?.failureReason || snapshotOptions?.stopReason) && !generationMetrics.timestamps.generationSettledAt) {
      markGenerationMetric(generationMetrics, 'generationSettledAt');
    }
    return buildPromptSnapshotJson({
      cacheObservationBase,
      contextTrimmed,
      contextTrimmedByBudget,
      contextTrimmedByCount,
      failureReason: snapshotOptions?.failureReason ?? null,
      generationMetrics,
      materialRules: prompt.materialRules ?? null,
      memoryContextPlan,
      messageDisplayKind,
      normalizedUsage: providerUsageRaw
        ? normalizeProviderUsage(provider.protocol, providerUsageRaw, provider.providerType, provider.baseUrl)
        : null,
      providerCachePolicy,
      space: input.space,
      stopReason: snapshotOptions?.stopReason ?? null,
      system: prompt.system,
    });
  };

  let streamFailed = false;
  let consecutivePressureWindows = 0;
  let lastPersistAt = 0;
  let lastPersistedAnswerChars = initialAnswerText.length;
  let lastPersistedReasoningChars = reasoningText.length;
  let lastUiPatchAt = 0;
  let lastUiPatchAnswerChars = initialAnswerText.length;
  let lastUiPatchReasoningChars = reasoningText.length;
  const hasUnpublishedStreamingText = () =>
    answerText.length + pendingAnswerChars !== lastUiPatchAnswerChars
    || reasoningText.length + pendingReasoningChars !== lastUiPatchReasoningChars;
  let pressureProbeExpectedAt = Date.now();
  let pressureProbeActive = true;
  const sampleStreamingDevicePressure = () => {
    if (!pressureProbeActive || input.signal?.aborted) {
      return;
    }
    const now = Date.now();
    const pressure = updateStreamingDevicePressure({
      consecutivePressureWindows,
      observedDelayMs: now - pressureProbeExpectedAt,
    });
    consecutivePressureWindows = pressure.consecutivePressureWindows;
    generationMetrics.context.devicePressureThrottled = pressure.devicePressureThrottled;
    pressureProbeExpectedAt = now + STREAMING_PRESSURE_RECOVERY_MS;
    setTimeout(sampleStreamingDevicePressure, STREAMING_PRESSURE_RECOVERY_MS);
  };
  pressureProbeExpectedAt += STREAMING_PRESSURE_RECOVERY_MS;
  setTimeout(sampleStreamingDevicePressure, STREAMING_PRESSURE_RECOVERY_MS);
  const adapter = getAdapterForProvider(provider);
  const FIRST_PROVIDER_BYTE_TIMEOUT_MS = 60000;
  const PROVIDER_IDLE_TIMEOUT_MS = 45000;
  let providerTimeout: ReturnType<typeof setTimeout> | null = null;
  const clearProviderTimeout = () => {
    if (providerTimeout) {
      clearTimeout(providerTimeout);
      providerTimeout = null;
    }
  };
  const scheduleProviderTimeout = (ms: number) => {
    clearProviderTimeout();
    providerTimeout = setTimeout(() => {
      void input.onTimeout?.();
    }, ms);
  };
  const emitStreamingPatch = (force = false) => {
    if (input.signal?.aborted) {
      return;
    }
    const now = Date.now();
    const answerChars = answerText.length + pendingAnswerChars;
    const reasoningChars = reasoningText.length + pendingReasoningChars;
    if (!force && answerChars === lastUiPatchAnswerChars && reasoningChars === lastUiPatchReasoningChars) {
      generationMetrics.counters.streamSkippedUiPatchCount += 1;
      return;
    }
    const visibility = input.getStreamingVisibility?.() ?? { bottomLocked: true };
    const streamingVisibility = {
      ...visibility,
      devicePressure: generationMetrics.context.devicePressureThrottled,
      visibleChars: answerText.length + reasoningText.length,
    };
    const patchIntervalMs = targetStreamingPatchIntervalMs({
      ...streamingVisibility,
    });
    generationMetrics.context.streamingTargetFps = targetStreamingFps({
      ...streamingVisibility,
    });
    if (patchIntervalMs == null) {
      generationMetrics.counters.streamSkippedUiPatchCount += 1;
      return;
    }
    const backlogChars = Math.max(
      0,
      answerChars + reasoningChars - lastUiPatchAnswerChars - lastUiPatchReasoningChars
    );
    const displayStep = targetStreamingDisplayStep({
      backlogChars,
      devicePressure: generationMetrics.context.devicePressureThrottled,
      visibleChars: answerText.length + reasoningText.length,
    });
    const effectivePatchIntervalMs = backlogChars >= displayStep && displayStep > 0
      ? Math.max(16, Math.floor(patchIntervalMs / 2))
      : patchIntervalMs;
    if (!force && now - lastUiPatchAt < effectivePatchIntervalMs) {
      generationMetrics.counters.streamSkippedUiPatchCount += 1;
      return;
    }
    flushStreamingTextChunks();
    lastUiPatchAt = now;
    lastUiPatchAnswerChars = answerText.length;
    lastUiPatchReasoningChars = reasoningText.length;
    generationMetrics.counters.streamUiPatchCount += 1;
    if (!generationMetrics.timestamps.firstUiPatchAt && answerText.length + reasoningText.length > 0) {
      markGenerationMetric(generationMetrics, 'firstUiPatchAt');
    }
    emitMessagePatch({
      id: input.assistantMessageId,
      content: answerText,
      reasoningText: reasoningText || null,
      status: 'generating',
    });
  };
  let pendingUiPatchTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleStreamingPatch = () => {
    if (pendingUiPatchTimer || streamFailed || input.signal?.aborted) {
      return;
    }
    const visibility = input.getStreamingVisibility?.() ?? { bottomLocked: true };
    const intervalMs = targetStreamingPatchIntervalMs({
      ...visibility,
      devicePressure: generationMetrics.context.devicePressureThrottled,
      visibleChars: answerText.length + reasoningText.length + pendingAnswerChars + pendingReasoningChars,
    });
    if (intervalMs == null) {
      return;
    }
    pendingUiPatchTimer = setTimeout(() => {
      pendingUiPatchTimer = null;
      if (!streamFailed && hasUnpublishedStreamingText()) {
        emitStreamingPatch(true);
      }
    }, intervalMs);
  };
  const persistStreamingSnapshot = async (force = false) => {
    if (input.signal?.aborted) {
      return;
    }
    flushStreamingTextChunks();
    const now = Date.now();
    const answerChars = answerText.length + pendingAnswerChars;
    const reasoningChars = reasoningText.length + pendingReasoningChars;
    if (!force && answerChars === lastPersistedAnswerChars && reasoningChars === lastPersistedReasoningChars) {
      generationMetrics.counters.streamSkippedPersistCount += 1;
      return;
    }
    const persistIntervalMs = targetPersistIntervalMs(generationMetrics.context.devicePressureThrottled) || STREAMING_RECOVERABILITY_PERSIST_INTERVAL_MS;
    if (!force && now - lastPersistAt < persistIntervalMs) {
      generationMetrics.counters.streamSkippedPersistCount += 1;
      return;
    }
    flushStreamingTextChunks();
    lastPersistAt = now;
    lastPersistedAnswerChars = answerChars;
    lastPersistedReasoningChars = reasoningChars;
    generationMetrics.counters.streamPersistCount += 1;
    const persistStartedAt = Date.now();
    await runWithDatabaseSpace(input.space, async (db) => {
      await db.withTransactionAsync(async () => {
        await updateAssistantMessageForGeneration(db, input.assistantMessageId, generationId, {
          content: answerText,
          reasoningText: reasoningText || null,
        }, { syncFts: false });
        await persistGenerationPartial(db, {
          content: answerText,
          generationId,
          now: new Date().toISOString(),
          reasoning: reasoningText || null,
        });
      });
    });
    recordStreamingPersistence(Date.now() - persistStartedAt);
  };
  let persistInFlight = false;
  let persistPending = false;
  let persistTask: Promise<void> | null = null;
  const schedulePersistStreamingSnapshot = () => {
    if (input.signal?.aborted) {
      return;
    }
    persistPending = true;
    if (persistInFlight) {
      return;
    }
    persistInFlight = true;
    persistTask = (async () => {
      try {
        while (persistPending && !input.signal?.aborted) {
          persistPending = false;
          await persistStreamingSnapshot(false);
        }
      } catch (error) {
        console.warn('Pixory AI streaming snapshot persistence failed.', error);
      } finally {
        persistInFlight = false;
        if (persistPending && !input.signal?.aborted) {
          schedulePersistStreamingSnapshot();
        }
      }
    })();
  };
  const waitForScheduledPersistStreamingSnapshot = async () => {
    while (persistInFlight && persistTask) {
      await persistTask;
    }
  };

  await transitionGenerationToRequesting({
    cacheMetadataJson: JSON.stringify({
      chatMode: prompt.cacheMetadata.chatMode,
      memoryEpoch: prompt.cacheMetadata.memoryEpoch,
      providerCachePolicy,
    }),
    generationId,
    modelId,
    promptSnapshotHash: hashPromptCacheText(JSON.stringify({ history, system: prompt.system, userPrompt })),
    protocol: provider.protocol,
    providerId: provider.id,
    space: input.space,
  });
  let streamingTransition: Promise<void> | null = null;
  const ensureGenerationStreaming = async () => {
    if (!streamingTransition) {
      streamingTransition = runWithDatabaseSpace(input.space, (db) => transitionGenerationJob(db, {
        generationId,
        now: new Date().toISOString(),
        state: 'streaming',
      })).then((job) => {
        if (!job) throw new Error('Generation recovery record disappeared while streaming.');
      });
    }
    await streamingTransition;
  };

  try {
    markGenerationMetric(generationMetrics, 'providerRequestSentAt');
    scheduleProviderTimeout(FIRST_PROVIDER_BYTE_TIMEOUT_MS);
    await adapter.streamChat(
      {
        apiKey,
        baseUrl: provider.baseUrl ?? '',
        modelId,
        systemPrompt: prompt.system,
        userPrompt,
        attachments: outgoingAttachments,
        history,
        providerCachePolicy,
        thinkingDisabled: input.thread.thinkingDisabled || legacyThinkingDisabled || ignoreReasoningDeltas,
        signal: input.signal,
      },
      async (event: AiStreamEvent) => {
        const eventStartedAt = Date.now();
        if (input.signal?.aborted || hasStoppedGeneration(input.assistantMessageId, generationId)) {
          return;
        }
        scheduleProviderTimeout(PROVIDER_IDLE_TIMEOUT_MS);
        if (event.type === 'provider_usage') {
          providerUsageRaw = mergeProviderUsage(providerUsageRaw, event.rawUsage);
          const normalizedUsage = normalizeProviderUsage(
            provider.protocol,
            providerUsageRaw,
            provider.providerType,
            provider.baseUrl,
          );
          generationMetrics.context.totalPromptTokens = normalizedUsage?.totalPromptTokens ?? null;
          generationMetrics.context.cachedInputTokens = normalizedUsage?.cachedInputTokens ?? null;
          generationMetrics.context.cachedTokenRatio = normalizedUsage?.cachedTokenRatio ?? null;
          return;
        }
        if (event.type === 'answer_delta') {
          await ensureGenerationStreaming();
          recordStreamingProviderDelta(event);
          generationMetrics.counters.providerDeltaCount += 1;
          generationMetrics.counters.answerDeltaCount += 1;
          if (!generationMetrics.timestamps.firstProviderDeltaAt) {
            markGenerationMetric(generationMetrics, 'firstProviderDeltaAt');
          }
          markGenerationMetric(generationMetrics, 'lastProviderDeltaAt');
          const visibleDelta = citationMarkerParser.push(event.text);
          if (mode === 'continue') {
            answerText = appendContinuationAnswerDelta(answerText, visibleDelta, initialAnswerText);
          } else {
            if (visibleDelta) pendingAnswerChunks.push(visibleDelta);
            pendingAnswerChars += visibleDelta.length;
          }
        }
        if (event.type === 'reasoning_delta' && !input.thread.thinkingDisabled && !ignoreReasoningDeltas) {
          if (!legacyThinkingDisabled) {
            await ensureGenerationStreaming();
            recordStreamingProviderDelta(event);
            generationMetrics.counters.providerDeltaCount += 1;
            generationMetrics.counters.reasoningDeltaCount += 1;
            if (!generationMetrics.timestamps.firstProviderDeltaAt) {
              markGenerationMetric(generationMetrics, 'firstProviderDeltaAt');
            }
            markGenerationMetric(generationMetrics, 'lastProviderDeltaAt');
            pendingReasoningChunks.push(event.text);
            pendingReasoningChars += event.text.length;
          }
        }
        generationMetrics.counters.maxBufferedChars = Math.max(
          generationMetrics.counters.maxBufferedChars,
          generationMetrics.counters.providerAnswerChars + generationMetrics.counters.providerReasoningChars
        );
        if (event.type === 'answer_delta' || (event.type === 'reasoning_delta' && !input.thread.thinkingDisabled && !ignoreReasoningDeltas)) {
          if (event.type !== 'reasoning_delta' || !legacyThinkingDisabled) {
            emitStreamingPatch();
            scheduleStreamingPatch();
            generationMetrics.counters.streamMergedDeltaCount = Math.max(
              0,
              generationMetrics.counters.providerDeltaCount - generationMetrics.counters.streamUiPatchCount
            );
            schedulePersistStreamingSnapshot();
          }
        }
        generationMetrics.counters.providerEventHandlerTotalMs += Date.now() - eventStartedAt;
        if (event.type === 'error') {
          finalizeCitationParser();
          streamFailed = true;
          if (pendingUiPatchTimer) {
            clearTimeout(pendingUiPatchTimer);
            pendingUiPatchTimer = null;
          }
          const readableError = normalizeAiErrorMessage(event.message);
          const failureCode = setGenerationFailureReason(generationMetrics, event.message);
          const completedAt = await markAssistantFailed(input.space, input.assistantMessageId, generationId, readableError, answerText, reasoningText || null, createPromptSnapshotJson({ failureReason: failureCode }));
          const citations = await persistParsedCitations(completedAt);
          emitMessagePatch({ id: input.assistantMessageId, status: 'failed', content: answerText, reasoningText: reasoningText || null, errorMessage: readableError, completedAt, citations });
          input.onUpdated?.();
        }
      }
    );
  } catch (error) {
    if (await stopForAbort({ buildPromptSnapshotJson: () => createPromptSnapshotJson({ stopReason: currentStopReason() }) })) {
      return;
    }
    streamFailed = true;
    finalizeCitationParser();
    const readableError = normalizeAiErrorMessage(error);
    const failureCode = setGenerationFailureReason(generationMetrics, error);
    const completedAt = await markAssistantFailed(input.space, input.assistantMessageId, generationId, readableError, answerText, reasoningText || null, createPromptSnapshotJson({ failureReason: failureCode }));
    const citations = await persistParsedCitations(completedAt);
    emitMessagePatch({ id: input.assistantMessageId, status: 'failed', content: answerText, reasoningText: reasoningText || null, errorMessage: readableError, completedAt, citations });
    input.onUpdated?.();
  } finally {
    pressureProbeActive = false;
    if (pendingUiPatchTimer) {
      clearTimeout(pendingUiPatchTimer);
      pendingUiPatchTimer = null;
    }
    clearProviderTimeout();
  }

  finalizeCitationParser();

  if (streamFailed) {
    flushStreamingTextChunks();
    mergeStreamingPerformanceSnapshot();
    return;
  }

  if (await stopForAbort({ buildPromptSnapshotJson: () => createPromptSnapshotJson({ stopReason: currentStopReason() }) })) {
    return;
  }

  await waitForScheduledPersistStreamingSnapshot();
  flushStreamingTextChunks();
  mergeStreamingPerformanceSnapshot();
  await persistStreamingSnapshot(true);
  emitStreamingPatch(true);

  if (await stopForAbort({ buildPromptSnapshotJson: () => createPromptSnapshotJson({ stopReason: currentStopReason() }) })) {
    return;
  }

  if (stoppedMessageIds.has(stoppedGenerationKey(input.assistantMessageId, generationId))) {
    generationMetrics.context.stopReason = 'user_stopped';
    const completedAt = await markAssistantStopped(input.space, input.assistantMessageId, generationId, answerText, reasoningText || null, createPromptSnapshotJson({ stopReason: 'user_stopped' }));
    const citations = await persistParsedCitations(completedAt);
    emitMessagePatch({ id: input.assistantMessageId, status: 'stopped', content: answerText, reasoningText: reasoningText || null, completedAt, citations });
    input.onUpdated?.();
    if (answerText) {
      await recordSuccessfulProviderModel(input.space, provider.id, modelId);
    }
    return;
  }

  let finalCitations: AiCitationRecord[] = [];
  const completedAt = new Date().toISOString();
  generationMetrics.counters.finalAnswerChars = answerText.length;
  generationMetrics.counters.finalReasoningChars = reasoningText.length;
  const finalFailureReason = answerText ? null : 'empty_response';
  if (!answerText) {
    setGenerationFailureReason(generationMetrics, finalFailureReason);
  }
  markGenerationMetric(generationMetrics, 'finalPersistStartAt');
  const promptSnapshotJson = createPromptSnapshotJson();
  let finalMessagePersisted = false;
  let queuedDreamJobId: string | null = null;
  let completedThoughtSession: Awaited<ReturnType<typeof recordCompanionThoughtRound>> = null;
  await runWithDatabaseSpace(input.space, async (db) => {
    await db.withTransactionAsync(async () => {
      const current = await updateAssistantMessageForGeneration(db, input.assistantMessageId, generationId, {
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
      finalMessagePersisted = Boolean(current);
      if (current?.status === 'completed') {
        if (companionContextPlan?.selectedOpenLoopId) {
          await markCompanionOpenLoopMentioned(db, {
            id: companionContextPlan.selectedOpenLoopId,
            mentionedAt: completedAt,
            round: companionContextPlan.currentRound,
          });
        }
        if (companionContextPlan?.selectedTemporalAnchorId) {
          await markCompanionTemporalAnchorMentioned(db, {
            id: companionContextPlan.selectedTemporalAnchorId,
            mentionedAt: completedAt,
          });
        }
        if (companionContextPlan) {
          try {
            await processCompanionAssistantRepairTurns(db, {
              assistantMessageId: input.assistantMessageId,
              branchRouteHash: companionBranchRouteHash || hashBranchRoute(branchScopes),
              currentRound: companionContextPlan.currentRound,
              lineageVersion: input.thread.lineageVersion ?? 0,
              now: completedAt,
              space: input.space,
              thread: input.thread,
            });
          } catch {
            // Companion repair projection is recoverable maintenance and must not roll back a valid reply.
          }
        }
        if (input.thread.roleCardId) {
          try {
            const [userRecord, recentMessages] = await Promise.all([
              aiThreadRepository.findMessageById(db, input.userMessage.id),
              aiThreadRepository.listSnapshotCandidateMessages(db, input.thread.id, 20, branchScopes),
            ]);
            if (userRecord) {
              const dream = await registerCompanionDreamRound(db, {
                assistantMessage: current,
                branchRouteHash: companionBranchRouteHash || hashBranchRoute(branchScopes),
                now: completedAt,
                recentMessages,
                space: input.space,
                thread: input.thread,
                userMessage: userRecord,
              });
              queuedDreamJobId = dream.jobId;
              completedThoughtSession = await recordCompanionThoughtRound(db, {
                assistantMessage: current,
                branchRouteHash: companionBranchRouteHash || hashBranchRoute(branchScopes),
                now: completedAt,
                space: input.space,
                thread: input.thread,
                userMessage: userRecord,
              });
            }
          } catch {
            // Dream detection is recoverable and must never roll back a completed reply.
          }
        }
        const memoryIntent = detectMemoryIntent(input.userMessage.content);
        await writeCurrentTurnObservation(db, {
          branchRootMessageId: branchScopes[0]?.branchRootMessageId ?? null,
          branchVersionIndex: branchScopes[0]?.branchVersionIndex ?? null,
          explicitUserAction: memoryIntent.explicitUserAction,
          intent: memoryIntent.intent,
          messageId: input.userMessage.id,
          payload: {
            ...memoryIntent.payload,
            candidateSource: 'assistant-persist-v1',
          },
          space: input.space,
          threadId: input.thread.id,
        });
        const appendedCitations = await buildValidatedAnswerCitations(db, {
          answerText,
          markers: parsedCitationMarkers,
          now: completedAt,
          registry: snippets,
          thread: input.thread,
        });
        const currentRetainedCitations = mode === 'continue'
          ? await revalidateRetainedCitations(db, input.thread, retainedCitations, initialAnswerText, completedAt)
          : [];
        const citations = mode === 'continue'
          ? mergeContinuationCitations(currentRetainedCitations, appendedCitations)
          : appendedCitations;
        if (await isAssistantMessageCurrentGeneration(db, input.assistantMessageId, generationId)) {
          await aiThreadRepository.replaceCitations(db, input.assistantMessageId, citations);
        }
        finalCitations = await aiThreadRepository.listCitations(db, input.assistantMessageId);
        await deliverThoughtReservation(db, {
          branchRouteHash: companionBranchRouteHash || hashBranchRoute(branchScopes),
          messageId: input.assistantMessageId,
          now: completedAt,
          thread: input.thread,
        });
      }
      if (current) {
        await settleGenerationJob(db, {
          completionReason: answerText ? 'completed' : 'empty_response',
          content: answerText,
          errorCode: answerText ? null : 'empty_response',
          generationId,
          now: completedAt,
          reasoning: reasoningText || null,
          state: answerText ? 'completed' : 'failed',
        });
      }
    });
  });
  if (!finalMessagePersisted) {
    return;
  }

  if (stoppedTimeoutGenerationIds.has(stoppedGenerationKey(input.assistantMessageId, generationId))) {
    generationMetrics.context.stopReason = 'timeout_failed';
    const errorMessage = '生成已中断';
    const completedAt = await markAssistantFailed(input.space, input.assistantMessageId, generationId, errorMessage, answerText, reasoningText || null, createPromptSnapshotJson({ stopReason: 'timeout_failed' }));
    emitMessagePatch({ id: input.assistantMessageId, status: 'failed', content: answerText, reasoningText: reasoningText || null, errorMessage, completedAt });
    input.onUpdated?.();
    if (answerText) {
      await recordSuccessfulProviderModel(input.space, provider.id, modelId);
    }
    return;
  }
  markGenerationMetric(generationMetrics, 'finalPersistEndAt');
  markGenerationMetric(generationMetrics, 'generationSettledAt');
  const finalPromptSnapshotJson = createPromptSnapshotJson({ failureReason: finalFailureReason });
  await updateAssistantPromptSnapshot(input.space, input.assistantMessageId, generationId, finalPromptSnapshotJson);
  emitMessagePatch({
    id: input.assistantMessageId,
    status: answerText ? 'completed' : 'failed',
    content: answerText,
    reasoningText: reasoningText || null,
    errorMessage: answerText ? null : 'AI 没有返回可用内容。',
    providerId: provider.id,
    modelId,
    modelSnapshotJson: JSON.stringify({ providerId: provider.id, modelId }),
    promptSnapshotJson: finalPromptSnapshotJson,
    completedAt,
    citations: finalCitations,
  });
  if (answerText) {
    await recordSuccessfulProviderModel(input.space, provider.id, modelId);
    const activeImportSessionId = await runWithDatabaseSpace(input.space, (db) =>
      aiThreadRepository.findActiveContinuityImportSessionIdForBranch(
        db,
        input.thread.id,
        input.assistantMessageId
      )
    );
    if (activeImportSessionId) {
      await onContinuityImportConversationRoundCompleted({
        importSessionId: activeImportSessionId,
        space: input.space,
      });
    }
    await finalizeThreadTitleAfterReply({
      assistantReply: answerText,
      space: input.space,
      thread: input.thread,
      userMessage: input.userMessage,
    });
    void enqueueAiPostReplyTask(input.space, input.thread.id, async () => {
      await maybeGenerateModelThreadTitleAfterReply({
        branchScopes,
        onUpdated: () => emitAiThreadPresentationUpdated(input.space, input.thread.id),
        space: input.space,
        thread: input.thread,
      });
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
    if (input.space === 'personal') {
      const resumeAt = new Date().toISOString();
      await runWithDatabaseSpace(input.space, async (db) => {
        await db.runAsync(`UPDATE companion_runtime_jobs SET nextRunAt = ?, updatedAt = ? WHERE status = 'waiting_model' AND lastErrorCode = 'personal_remote_not_authorized'`, resumeAt, resumeAt);
        await db.runAsync(`UPDATE companion_dream_jobs SET nextRunAt = ?, updatedAt = ? WHERE status = 'waiting_model' AND lastErrorCode = 'personal_remote_not_authorized'`, resumeAt, resumeAt);
        await db.runAsync(`UPDATE companion_thought_jobs SET nextRunAt = ?, updatedAt = ? WHERE status = 'waiting_model' AND lastErrorCode = 'personal_remote_not_authorized'`, resumeAt, resumeAt);
      });
    }
    scheduleCompanionMaintenance({ allowRemoteModelForPersonal: input.space === 'personal', space: input.space });
  }
  if (queuedDreamJobId) scheduleCompanionMaintenance({ allowRemoteModelForPersonal: input.space === 'personal', delayMs: 250, space: input.space });
  activateThoughtSession(completedThoughtSession);
  input.onUpdated?.();
}

export async function recoverInterruptedGeneration(input: {
  decision: 'continue' | 'retry';
  job: AiGenerationJobRecord;
  signal?: AbortSignal;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onTimeout?: () => void;
  onUpdated?: () => void;
}): Promise<void> {
  const snapshot = parseGenerationRequestSnapshot(input.job.requestSnapshotJson);
  if (!snapshot) throw new Error('生成恢复快照无效。');
  const loaded = await runWithDatabaseSpace(input.job.space, async (db) => Promise.all([
    aiThreadRepository.findThreadById(db, input.job.threadId),
    aiThreadRepository.findMessageById(db, input.job.userMessageId),
    aiThreadRepository.findMessageById(db, input.job.assistantMessageId),
  ]));
  const [currentThread, userMessage, assistantMessage] = loaded;
  if (!currentThread || currentThread.space !== input.job.space || currentThread.lineageVersion !== input.job.lineageVersion) {
    throw new Error('会话分支已变化，无法安全恢复生成。');
  }
  if (!userMessage || userMessage.role !== 'user' || userMessage.threadId !== currentThread.id) {
    throw new Error('生成恢复所需的用户消息不存在。');
  }
  if (!assistantMessage || assistantMessage.role !== 'assistant' || assistantMessage.threadId !== currentThread.id) {
    throw new Error('生成恢复所需的回复占位不存在。');
  }
  const recoveryBranchScopes = await runWithDatabaseSpace(input.job.space, (db) =>
    resolveStreamingBranchScopes(db, {
      assistantMessageId: input.job.assistantMessageId,
      userMessageId: input.job.userMessageId,
    })
  );
  if (hashBranchRoute(recoveryBranchScopes) !== input.job.branchRouteHash) {
    throw new Error('会话分支已变化，无法安全恢复生成。');
  }
  if (assistantMessage.status !== 'generating') {
    const terminalState = assistantMessage.status === 'completed'
      ? 'completed'
      : assistantMessage.status === 'failed' ? 'failed' : 'stopped';
    await runWithDatabaseSpace(input.job.space, (db) => settleGenerationJob(db, {
      completionReason: 'message_already_terminal',
      content: assistantMessage.content,
      errorCode: assistantMessage.status === 'failed' ? 'message_already_failed' : null,
      generationId: input.job.generationId,
      now: assistantMessage.completedAt ?? new Date().toISOString(),
      reasoning: assistantMessage.reasoningText,
      state: terminalState,
    }));
    return;
  }

  const frozenThread: AiThreadRecord = { ...currentThread, ...snapshot.thread };
  const generationMetrics = createGenerationMetricsDraft({
    contextType: frozenThread.contextType,
    generationId: input.job.generationId,
    messageId: input.job.assistantMessageId,
    space: input.job.space,
    threadId: input.job.threadId,
  });
  await streamAssistantReply({
    attachments: snapshot.attachments,
    assistantMessageId: input.job.assistantMessageId,
    continuationContext: snapshot.continuationContext ?? undefined,
    continuationInstruction: snapshot.continuationInstruction ?? undefined,
    generationMetrics,
    historyAnchorMessageId: snapshot.historyAnchorMessageId ?? undefined,
    ignoreReasoningDeltas: input.decision === 'continue',
    initialAnswerText: input.decision === 'continue' ? input.job.partialContent : '',
    initialReasoningText: input.decision === 'continue' ? input.job.partialReasoning : null,
    mode: input.decision === 'continue' ? 'continue' : 'replace',
    onMessagePatch: input.onMessagePatch,
    onTimeout: input.onTimeout,
    onUpdated: input.onUpdated,
    requestContentOverride: snapshot.requestContentOverride ?? undefined,
    signal: input.signal,
    space: input.job.space,
    thread: frozenThread,
    userMessage: { id: userMessage.id, content: userMessage.content },
  });
}

export async function stopInterruptedGeneration(job: AiGenerationJobRecord, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await runWithDatabaseSpace(job.space, async (db) => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE ai_messages SET status = 'stopped', errorMessage = ?, completedAt = ?, updatedAt = ?
          WHERE id = ? AND threadId = ? AND status = 'generating'`,
        reason, now, now, job.assistantMessageId, job.threadId,
      );
      await releaseThoughtReservationForMessage(db, job.assistantMessageId, now);
      await settleGenerationJob(db, {
        completionReason: 'recovery_stopped', content: job.partialContent,
        errorCode: 'recovery_stopped', generationId: job.generationId, now,
        reasoning: job.partialReasoning, state: 'stopped',
      });
    });
  });
}

async function loadThreadForGeneration(space: PixorySpace, threadId: string): Promise<AiThreadRecord> {
  const thread = await runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId));
  if (!thread || thread.space !== space) {
    throw new Error('AI thread was not found.');
  }
  return thread;
}

export async function generateReplyAssistSuggestions(
  input: GenerateReplyAssistSuggestionsInput
): Promise<string[]> {
  const thread = await loadThreadForGeneration(input.space, input.threadId);
  const resolvedThreadModel = await resolveThreadChatModel(input.space, thread);
  if (resolvedThreadModel.status !== 'ready') {
    throw new Error(resolvedThreadModel.message);
  }
  if (!resolvedThreadModel.apiKey) {
    throw new Error('当前会话模型还没有可用的 API Key。');
  }

  const transcript = trimReplyAssistTranscript(input.transcript);
  if (transcript.length === 0) {
    throw new Error('当前没有足够的上下文可用于生成帮答。');
  }

  const [cacheSettings, memorySnapshot] = await Promise.all([
    resolvePromptCacheSettings(input.space),
    runWithDatabaseSpace(input.space, async (db) => {
      const [companionMemoryPrefix, stableMemoryPrefix] = await Promise.all([
        buildCompanionMemoryPrefix(db, thread, { branchScopes: input.branchScopes }),
        buildStableMemoryPrefix(db, thread, { branchScopes: input.branchScopes }),
      ]);
      return { companionMemoryPrefix, stableMemoryPrefix };
    }),
  ]);

  const memoryEpoch = [
    'reply_assist',
    thread.id,
    input.mode,
    hashPromptCacheText(memorySnapshot.stableMemoryPrefix).slice(0, 16),
  ].join(':');
  const requestedAt = nowIso();
  const systemPromptSections = [
    [
      '你是 Pixory 的聊天帮答生成器。',
      '你只负责基于当前会话上下文，替用户生成下一条可直接发送的回复候选。',
      '不要解释，不要分析，不要加标题，不要输出编号，不要输出 markdown。',
      '输出必须是 JSON，且字段名只能是 suggestions。',
      '候选必须像用户下一条要发的话，不能像 AI 旁白、总结或说明。',
    ].join('\n'),
    buildReplyAssistRoleContext(thread),
  ].filter(Boolean);
  const stableBlocks = [
    { name: 'stable_app_policy' as const, stable: true, text: systemPromptSections[0] ?? '', version: 1 },
    { name: 'stable_role' as const, stable: true, text: systemPromptSections[1] ?? '', version: 3 },
    { name: 'stable_material_rules' as const, stable: true, text: '', version: 1 },
    { name: 'stable_tool_definitions' as const, stable: true, text: '', version: 1 },
    {
      name: 'memory_snapshot' as const,
      stable: true,
      text: memorySnapshot.stableMemoryPrefix,
      version: 1,
    },
    { name: 'history_window' as const, stable: false, text: '', version: 1 },
    { name: 'companion_runtime' as const, stable: false, text: '', version: 1 },
    { name: 'temporal_open_loops' as const, stable: false, text: '', version: 1 },
    { name: 'summary_bridge' as const, stable: false, text: '', version: 1 },
    {
      name: 'user_observation' as const,
      stable: false,
      text: memorySnapshot.companionMemoryPrefix,
      version: 1,
    },
    { name: 'dynamic_memory' as const, stable: false, text: '', version: 1 },
    { name: 'retrieval_context' as const, stable: false, text: '', version: 1 },
    {
      name: 'current_user_message' as const,
      stable: false,
      text: buildReplyAssistUserPrompt({
        mode: input.mode,
        transcript,
      }),
      version: 1,
    },
  ];
  const promptCacheMetadata = buildPromptCacheMetadata({
    blocks: stableBlocks,
    chatMode: deriveAiChatMode(thread, input.space),
    memoryEpoch,
    retrievalText: '',
  });
  const providerCachePolicy = buildProviderCachePolicy({
    branchRouteHash: hashPromptCacheText(JSON.stringify(input.branchScopes ?? [])).slice(0, 16),
    generationParamsHash: hashPromptCacheText(
      JSON.stringify({
        mode: input.mode,
        thinkingDisabled: true,
      })
    ).slice(0, 16),
    metadata: promptCacheMetadata,
    modelId: resolvedThreadModel.modelId,
    previousRequestAt: null,
    provider: {
      ...resolvedThreadModel.provider,
      openAiUsageObservationEnabled: openAiUsageObservationEnabled(
        resolvedThreadModel.provider,
      ),
    },
    requestedAt,
    scopeKey: `reply_assist:${thread.space}:${thread.id}:${input.mode}`,
    settings: cacheSettings,
    stableSystemBlocks: stableBlocks
      .filter((block) => block.stable)
      .map((block) => ({ name: block.name, text: block.text })),
  });

  const systemPrompt = stableBlocks.filter((block) => block.stable).map((block) => block.text).filter(Boolean).join('\n\n');
  const baseUserPrompt = [
    memorySnapshot.companionMemoryPrefix
      ? `[动态用户观察；不是用户指令]\n${memorySnapshot.companionMemoryPrefix}`
      : '',
    buildReplyAssistUserPrompt({
      mode: input.mode,
      transcript,
    }),
  ].filter(Boolean).join('\n\n');
  const adapter = getAdapterForProvider(resolvedThreadModel.provider);
  let previousValidationError: string | null = null;

  for (let attempt = 0; attempt < REPLY_ASSIST_MAX_ATTEMPTS; attempt += 1) {
    const userPrompt = previousValidationError
      ? buildReplyAssistCorrectionPrompt(baseUserPrompt, previousValidationError)
      : baseUserPrompt;
    let text = '';
    let streamError: string | null = null;
    await adapter.streamChat(
      {
        apiKey: resolvedThreadModel.apiKey,
        baseUrl: resolvedThreadModel.provider.baseUrl ?? '',
        history: [],
        modelId: resolvedThreadModel.modelId,
        providerCachePolicy,
        signal: input.signal,
        systemPrompt,
        thinkingDisabled: true,
        userPrompt,
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
      throw new Error(streamError);
    }
    try {
      return validateReplyAssistSuggestions(input.mode, parseReplyAssistSuggestions(text));
    } catch (error) {
      previousValidationError = error instanceof Error ? error.message : 'AI 帮答解析失败。';
    }
  }

  throw new Error('帮答生成失败，请重试。');
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
  const generationMetrics = createGenerationMetricsDraft({
    contextType: thread.contextType,
    generationId: createAiId('aigen'),
    messageId: assistantMessageId,
    sendPressedAt: input.sendPressedAt,
    space: input.space,
    threadId: thread.id,
  });
  await runWithDatabaseSpace(input.space, async (db) => {
    markGenerationMetric(generationMetrics, 'userMessagePersistStartAt');
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
    markGenerationMetric(generationMetrics, 'userMessagePersistEndAt');
    markGenerationMetric(generationMetrics, 'assistantPlaceholderPersistStartAt');
    await aiThreadRepository.createMessage(db, {
      id: assistantMessageId,
      threadId: thread.id,
      branchRootMessageId: input.branchRootMessageId ?? null,
      branchVersionIndex: input.branchVersionIndex ?? null,
      role: 'assistant',
      status: 'generating',
      content: '',
      promptSnapshotJson: buildGenerationGuardSnapshotJson(generationMetrics),
    });
    markGenerationMetric(generationMetrics, 'assistantPlaceholderPersistEndAt');
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
  input.onCreated?.({
    userMessageId,
    assistantMessageId,
    generationId: generationMetrics.context.generationId,
    thinkingExpected: !thread.thinkingDisabled,
  });
  input.onUpdated?.();
  let persistedAttachments: AiOutgoingAttachment[] = [];
  try {
    persistedAttachments = await persistOutgoingAttachments({
      attachments: input.attachments,
      messageId: userMessageId,
      space: input.space,
      threadId: thread.id,
    });
  } catch (error) {
    const readableError = normalizeAiErrorMessage(error);
    const failureCode = setGenerationFailureReason(generationMetrics, error);
    await markAssistantFailed(
      input.space,
      assistantMessageId,
      generationMetrics.context.generationId,
      readableError,
      '',
      null,
      buildMetricsOnlyPromptSnapshotJson({ failureReason: failureCode, generationMetrics })
    );
    input.onMessagePatch?.({
      generationId: generationMetrics.context.generationId,
      id: assistantMessageId,
      status: 'failed',
      content: '',
      reasoningText: null,
      errorMessage: readableError,
      completedAt: new Date().toISOString(),
    });
    input.onUpdated?.();
    throw error;
  }
  const latestThread = await loadThreadForGeneration(input.space, thread.id);

  await streamAssistantReply({
    attachments: persistedAttachments,
    assistantMessageId,
    generationMetrics,
    getStreamingVisibility: input.getStreamingVisibility,
    onCreated: input.onCreated,
    onMessagePatch: input.onMessagePatch,
    onTimeout: input.onTimeout,
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

  const generationMetrics = createGenerationMetricsDraft({
    contextType: thread.contextType,
    generationId: createAiId('aigen'),
    messageId: input.assistantMessageId,
    sendPressedAt: input.sendPressedAt,
    space: input.space,
    threadId: thread.id,
  });
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
      await aiThreadRepository.updateMessage(db, input.assistantMessageId, {
        status: 'generating',
        content: '',
        reasoningText: null,
        errorMessage: null,
        providerId: null,
        modelId: null,
        modelSnapshotJson: '{}',
        promptSnapshotJson: buildGenerationGuardSnapshotJson(generationMetrics),
        completedAt: null,
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
  const replayAttachments = await loadOutgoingAttachmentsForMessage({
    messageId: userMessage.id,
    space: input.space,
  });
  input.onCreated?.({
    userMessageId: userMessage.id,
    assistantMessageId: input.assistantMessageId,
    generationId: generationMetrics.context.generationId,
    thinkingExpected: !latestThread.thinkingDisabled,
  });

  await streamAssistantReply({
    attachments: replayAttachments,
    assistantMessageId: input.assistantMessageId,
    generationMetrics,
    getStreamingVisibility: input.getStreamingVisibility,
    onCreated: input.onCreated,
    onMessagePatch: input.onMessagePatch,
    onTimeout: input.onTimeout,
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

export async function continueAssistantMessage(input: ContinueAssistantMessageInput): Promise<void> {
  const thread = await runWithDatabaseSpace(input.space, (db) => aiThreadRepository.findThreadById(db, input.threadId));
  if (!thread || thread.space !== input.space) {
    throw new Error('AI thread was not found.');
  }

  const generationMetrics = createGenerationMetricsDraft({
    contextType: thread.contextType,
    generationId: createAiId('aigen'),
    messageId: input.assistantMessageId,
    sendPressedAt: input.sendPressedAt,
    space: input.space,
    threadId: thread.id,
  });
  const continuation = await runWithDatabaseSpace(input.space, async (db) => {
    const assistantMessage = await aiThreadRepository.findMessageById(db, input.assistantMessageId);
    if (!assistantMessage || assistantMessage.threadId !== thread.id || assistantMessage.role !== 'assistant') {
      throw new Error('AI assistant message was not found.');
    }
    if (assistantMessage.status !== 'stopped' && assistantMessage.status !== 'failed') {
      throw new Error('只有已停止或失败的回复可以继续生成。');
    }
    if (!assistantMessage.content.trim()) {
      throw new Error('这条回复还没有可继续的正文。');
    }
    const assistantBranchScopes = await aiThreadRepository.resolveBranchLineage(
      db,
      assistantMessage.branchRootMessageId,
      assistantMessage.branchVersionIndex
    );
    const previousUserMessage = await aiThreadRepository.findPreviousMessageByRole(db, thread.id, input.assistantMessageId, 'user', assistantBranchScopes);
    if (!previousUserMessage) {
      throw new Error('没有可用于继续生成的用户消息。');
    }
    await aiThreadRepository.updateMessage(db, input.assistantMessageId, {
      status: 'generating',
      content: assistantMessage.content,
      reasoningText: assistantMessage.reasoningText,
      errorMessage: null,
      providerId: null,
      modelId: null,
      modelSnapshotJson: '{}',
      promptSnapshotJson: buildGenerationGuardSnapshotJson(generationMetrics),
      completedAt: null,
    });
    await aiThreadRepository.updateThread(db, thread.id, {
      lastMessagePreview: previousUserMessage.content.slice(0, 80),
    });
    await aiThreadRepository.setThreadCurrentBranch(db, {
      branchRootMessageId: assistantMessage.branchRootMessageId,
      branchVersionIndex: assistantMessage.branchVersionIndex,
      threadId: thread.id,
    });
    return {
      initialAnswerText: assistantMessage.content,
      initialReasoningText: assistantMessage.reasoningText,
      userMessage: previousUserMessage,
    };
  });
  const latestThread = await loadThreadForGeneration(input.space, thread.id);
  const replayAttachments = await loadOutgoingAttachmentsForMessage({
    messageId: continuation.userMessage.id,
    space: input.space,
  });
  input.onCreated?.({
    userMessageId: continuation.userMessage.id,
    assistantMessageId: input.assistantMessageId,
    generationId: generationMetrics.context.generationId,
    thinkingExpected: false,
  });
  input.onUpdated?.();

  await streamAssistantReply({
    attachments: replayAttachments,
    assistantMessageId: input.assistantMessageId,
    generationMetrics,
    getStreamingVisibility: input.getStreamingVisibility,
    ignoreReasoningDeltas: true,
    initialAnswerText: continuation.initialAnswerText,
    initialReasoningText: continuation.initialReasoningText,
    mode: 'continue',
    onCreated: input.onCreated,
    onMessagePatch: input.onMessagePatch,
    onTimeout: input.onTimeout,
    onUpdated: input.onUpdated,
    signal: input.signal,
    space: input.space,
    thread: latestThread,
    userMessage: continuation.userMessage,
  });
}

export async function continueAssistantReply(input: ContinueAssistantReplyInput): Promise<void> {
  const thread = await runWithDatabaseSpace(input.space, (db) => aiThreadRepository.findThreadById(db, input.threadId));
  if (!thread || thread.space !== input.space) {
    throw new Error('AI thread was not found.');
  }

  const assistantMessageId = createAiId('aimsg');
  const generationMetrics = createGenerationMetricsDraft({
    contextType: thread.contextType,
    generationId: createAiId('aigen'),
    messageId: assistantMessageId,
    sendPressedAt: input.sendPressedAt,
    space: input.space,
    threadId: thread.id,
  });
  const continuation = await runWithDatabaseSpace(input.space, async (db) => {
    const assistantMessage = await aiThreadRepository.findMessageById(db, input.assistantMessageId);
    if (!assistantMessage || assistantMessage.threadId !== thread.id || assistantMessage.role !== 'assistant') {
      throw new Error('AI assistant message was not found.');
    }
    if (assistantMessage.status !== 'completed') {
      throw new Error('只有已完成的回复可以续答。');
    }
    if (!assistantMessage.content.trim()) {
      throw new Error('这条回复还没有可续答的正文。');
    }
    const assistantBranchScopes = await aiThreadRepository.resolveBranchLineage(
      db,
      assistantMessage.branchRootMessageId,
      assistantMessage.branchVersionIndex
    );
    const previousUserMessage = await aiThreadRepository.findPreviousMessageByRole(
      db,
      thread.id,
      input.assistantMessageId,
      'user',
      assistantBranchScopes
    );
    if (!previousUserMessage) {
      throw new Error('没有可用于续答的用户消息。');
    }
    markGenerationMetric(generationMetrics, 'assistantPlaceholderPersistStartAt');
    await aiThreadRepository.createMessage(db, {
      id: assistantMessageId,
      threadId: thread.id,
      branchRootMessageId: assistantMessage.branchRootMessageId,
      branchVersionIndex: assistantMessage.branchVersionIndex,
      role: 'assistant',
      status: 'generating',
      content: '',
      promptSnapshotJson: buildGenerationGuardSnapshotJsonWithDisplayKind(
        generationMetrics,
        'standalone_assistant',
      ),
    });
    markGenerationMetric(generationMetrics, 'assistantPlaceholderPersistEndAt');
    await aiThreadRepository.setThreadCurrentBranch(db, {
      branchRootMessageId: assistantMessage.branchRootMessageId,
      branchVersionIndex: assistantMessage.branchVersionIndex,
      threadId: thread.id,
    });
    return {
      assistantMessage,
      previousUserMessage,
    };
  });
  const latestThread = await loadThreadForGeneration(input.space, thread.id);
  const replayAttachments = await loadOutgoingAttachmentsForMessage({
    messageId: continuation.previousUserMessage.id,
    space: input.space,
  });
  input.onCreated?.({
    userMessageId: continuation.previousUserMessage.id,
    assistantMessageId,
    generationId: generationMetrics.context.generationId,
    thinkingExpected: !latestThread.thinkingDisabled,
  });
  input.onUpdated?.();

  await streamAssistantReply({
    attachments: replayAttachments,
    assistantMessageId,
    continuationContext: {
      answerText: continuation.assistantMessage.content,
      reasoningText: continuation.assistantMessage.reasoningText,
    },
    continuationInstruction: CONTINUE_ASSISTANT_NEW_REPLY_INSTRUCTION,
    generationMetrics,
    getStreamingVisibility: input.getStreamingVisibility,
    historyAnchorMessageId: input.assistantMessageId,
    mode: 'followup',
    onCreated: input.onCreated,
    onMessagePatch: input.onMessagePatch,
    onTimeout: input.onTimeout,
    onUpdated: input.onUpdated,
    signal: input.signal,
    space: input.space,
    thread: latestThread,
    userMessage: continuation.previousUserMessage,
  });
}

export async function replyToAssistantMessage(
  input: ReplyToAssistantMessageInput,
): Promise<{ userMessageId: string; assistantMessageId: string }> {
  const thread = await runWithDatabaseSpace(input.space, (db) =>
    aiThreadRepository.findThreadById(db, input.threadId),
  );
  if (!thread || thread.space !== input.space) {
    throw new Error("AI thread was not found.");
  }

  const userMessageId = createAiId("aimsg");
  const assistantMessageId = createAiId("aimsg");
  const generationMetrics = createGenerationMetricsDraft({
    contextType: thread.contextType,
    generationId: createAiId("aigen"),
    messageId: assistantMessageId,
    sendPressedAt: input.sendPressedAt,
    space: input.space,
    threadId: thread.id,
  });
  await runWithDatabaseSpace(input.space, async (db) => {
    const assistantMessage = await aiThreadRepository.findMessageById(
      db,
      input.assistantMessageId,
    );
    if (
      !assistantMessage ||
      assistantMessage.threadId !== thread.id ||
      assistantMessage.role !== "assistant"
    ) {
      throw new Error("AI assistant message was not found.");
    }
    if (assistantMessage.status !== "completed") {
      throw new Error("只有已完成的回复可以手动接话。");
    }
    if (!assistantMessage.content.trim()) {
      throw new Error("这条回复还没有可回复的正文。");
    }
    await db.withTransactionAsync(async () => {
      const previousAssistantVersion = await snapshotMessageVersion(
        db,
        assistantMessage,
      );
      const nextBranchVersionIndex = previousAssistantVersion.versionIndex + 1;
      await aiThreadRepository.markVisibleMessagesAfterAsBranch(
        db,
        thread.id,
        input.assistantMessageId,
        input.assistantMessageId,
        previousAssistantVersion.versionIndex,
        assistantMessage,
      );
      markGenerationMetric(generationMetrics, "userMessagePersistStartAt");
      await aiThreadRepository.createMessage(db, {
        id: userMessageId,
        threadId: thread.id,
        branchRootMessageId: input.assistantMessageId,
        branchVersionIndex: nextBranchVersionIndex,
        role: "user",
        status: "completed",
        content: input.content,
        completedAt: new Date().toISOString(),
      });
      markGenerationMetric(generationMetrics, "userMessagePersistEndAt");
      markGenerationMetric(generationMetrics, "assistantPlaceholderPersistStartAt");
      await aiThreadRepository.createMessage(db, {
        id: assistantMessageId,
        threadId: thread.id,
        branchRootMessageId: input.assistantMessageId,
        branchVersionIndex: nextBranchVersionIndex,
        role: "assistant",
        status: "generating",
        content: "",
        promptSnapshotJson: buildGenerationGuardSnapshotJson(generationMetrics),
      });
      markGenerationMetric(generationMetrics, "assistantPlaceholderPersistEndAt");
      await aiThreadRepository.updateThread(db, thread.id, {
        lastMessagePreview: input.content.slice(0, 80),
      });
      await aiThreadRepository.setThreadCurrentBranch(db, {
        branchRootMessageId: input.assistantMessageId,
        branchVersionIndex: nextBranchVersionIndex,
        threadId: thread.id,
      });
    });
  });

  input.onCreated?.({
    userMessageId,
    assistantMessageId,
    generationId: generationMetrics.context.generationId,
    thinkingExpected: !thread.thinkingDisabled,
  });
  input.onUpdated?.();
  let persistedAttachments: AiOutgoingAttachment[] = [];
  try {
    persistedAttachments = await persistOutgoingAttachments({
      attachments: input.attachments,
      messageId: userMessageId,
      space: input.space,
      threadId: thread.id,
    });
  } catch (error) {
    const readableError = normalizeAiErrorMessage(error);
    const failureCode = setGenerationFailureReason(generationMetrics, error);
    await markAssistantFailed(
      input.space,
      assistantMessageId,
      generationMetrics.context.generationId,
      readableError,
      "",
      null,
      buildMetricsOnlyPromptSnapshotJson({
        failureReason: failureCode,
        generationMetrics,
      }),
    );
    input.onMessagePatch?.({
      generationId: generationMetrics.context.generationId,
      id: assistantMessageId,
      status: "failed",
      content: "",
      reasoningText: null,
      errorMessage: readableError,
      completedAt: new Date().toISOString(),
    });
    input.onUpdated?.();
    throw error;
  }

  const latestThread = await loadThreadForGeneration(input.space, thread.id);
  await streamAssistantReply({
    attachments: persistedAttachments,
    assistantMessageId,
    generationMetrics,
    getStreamingVisibility: input.getStreamingVisibility,
    onCreated: input.onCreated,
    onMessagePatch: input.onMessagePatch,
    onTimeout: input.onTimeout,
    onUpdated: input.onUpdated,
    signal: input.signal,
    space: input.space,
    thread: latestThread,
    userMessage: { id: userMessageId, content: input.content },
  });

  return { userMessageId, assistantMessageId };
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
  const generationMetrics = createGenerationMetricsDraft({
    contextType: thread.contextType,
    generationId: createAiId('aigen'),
    messageId: assistantMessageId,
    sendPressedAt: input.sendPressedAt,
    space: input.space,
    threadId: thread.id,
  });
  await runWithDatabaseSpace(input.space, async (db) => {
    const userMessage = await aiThreadRepository.findMessageById(db, input.userMessageId);
    if (!userMessage || userMessage.threadId !== thread.id || userMessage.role !== 'user') {
      throw new Error('AI user message was not found.');
    }
    await db.withTransactionAsync(async () => {
      const previousUserVersion = await snapshotMessageVersion(db, userMessage);
      const nextBranchVersionIndex = previousUserVersion.versionIndex + 1;
      await aiThreadRepository.markVisibleMessagesAfterAsBranch(db, thread.id, input.userMessageId, input.userMessageId, previousUserVersion.versionIndex, userMessage);
      markGenerationMetric(generationMetrics, 'userMessagePersistStartAt');
      await aiThreadRepository.updateMessage(db, input.userMessageId, {
        status: 'completed',
        content,
        errorMessage: null,
        completedAt: new Date().toISOString(),
      });
      markGenerationMetric(generationMetrics, 'userMessagePersistEndAt');
      markGenerationMetric(generationMetrics, 'assistantPlaceholderPersistStartAt');
      await aiThreadRepository.createMessage(db, {
        id: assistantMessageId,
        threadId: thread.id,
        branchRootMessageId: input.userMessageId,
        branchVersionIndex: nextBranchVersionIndex,
        role: 'assistant',
        status: 'generating',
        content: '',
        promptSnapshotJson: buildGenerationGuardSnapshotJson(generationMetrics),
      });
      markGenerationMetric(generationMetrics, 'assistantPlaceholderPersistEndAt');
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

  input.onCreated?.({
    userMessageId: input.userMessageId,
    assistantMessageId,
    generationId: generationMetrics.context.generationId,
    thinkingExpected: !thread.thinkingDisabled,
  });
  input.onUpdated?.();
  const latestThread = await loadThreadForGeneration(input.space, thread.id);
  const replayAttachments = await loadOutgoingAttachmentsForMessage({
    messageId: input.userMessageId,
    space: input.space,
  });

  await streamAssistantReply({
    attachments: replayAttachments,
    assistantMessageId,
    generationMetrics,
    getStreamingVisibility: input.getStreamingVisibility,
    onCreated: input.onCreated,
    onMessagePatch: input.onMessagePatch,
    onTimeout: input.onTimeout,
    onUpdated: input.onUpdated,
    signal: input.signal,
    space: input.space,
    thread: latestThread,
    userMessage: { id: input.userMessageId, content },
  });

  return { userMessageId: input.userMessageId, assistantMessageId };
}

export async function stopStreamingMessage(input: StopStreamingMessageInput): Promise<void> {
  await runWithDatabaseSpace(input.space, async (db) => {
    const current = await aiThreadRepository.findMessageById(db, input.assistantMessageId);
    const generationId = readSnapshotGenerationId(current?.promptSnapshotJson);
    if (!generationId) {
      await aiThreadRepository.updateMessage(db, input.assistantMessageId, {
        status: 'stopped',
        completedAt: new Date().toISOString(),
      });
      return;
    }
    if (input.reason === 'timeout') {
      stoppedTimeoutGenerationIds.add(stoppedGenerationKey(input.assistantMessageId, generationId));
    } else {
      stoppedMessageIds.add(stoppedGenerationKey(input.assistantMessageId, generationId));
    }
    await updateAssistantMessageForGeneration(db, input.assistantMessageId, generationId, {
      status: 'stopped',
      completedAt: new Date().toISOString(),
    });
  });
}

export async function flushStreamingMessageSnapshot(input: FlushStreamingMessageSnapshotInput): Promise<void> {
  await runWithDatabaseSpace(input.space, (db) =>
    updateAssistantMessageForGeneration(db, input.assistantMessageId, input.generationId, {
      content: input.content,
      reasoningText: input.reasoningText ?? null,
    }, { syncFts: false })
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
