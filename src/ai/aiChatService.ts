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
  type AiReplyPreference,
  type AiRoleInstructionWeight,
  type AiThreadRecord,
  type PixorySpace,
} from '../database';
import type { AiMemoryRecord, AiMessageRecord, AiMessageVersionRecord, AiThreadHistoryFilter, AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import { DEFAULT_AI_ROLE_PROMPT, MATERIAL_SESSION_RULES, STRICT_MATERIAL_RULES } from './aiConstants';
import { getAdapterForProvider, ensureBuiltInProviders } from './aiProviderService';
import { buildMaterialBoundPrompt, buildNormalChatPrompt } from './promptBuilder';
import { retrieveForThread } from './aiRetrievalService';
import { trimMessagesToContextBudget } from './aiContextBudget';
import {
  buildCompanionMemoryPrefix,
  buildStableMemoryPrefix,
  retrieveDynamicMemoryContext,
} from './aiMemoryService';
import { scheduleMemoryMaintenance } from './aiMemoryMaintenanceService';
import { getProviderApiKey } from './secureAiSettingsService';
import { verifyPersonalPassword } from '../services/personalSystemService';
import type { AiStreamEvent } from './providers/base';

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
  boundaryMode?: AiBoundaryMode;
}

export interface SendUserMessageInput {
  space: PixorySpace;
  threadId: string;
  content: string;
  onCreated?: (ids: { userMessageId: string; assistantMessageId: string }) => void;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onUpdated?: () => void;
}

export interface RetryAssistantMessageInput {
  space: PixorySpace;
  threadId: string;
  assistantMessageId: string;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onUpdated?: () => void;
}

export interface RewriteUserMessageInput {
  space: PixorySpace;
  threadId: string;
  userMessageId: string;
  content: string;
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

export interface UpdateAiThreadSessionConfigInput {
  space: PixorySpace;
  threadId: string;
  systemPrompt: string;
  roleInstructionWeight: AiRoleInstructionWeight;
  replyPreference: AiReplyPreference;
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

const stoppedMessageIds = new Set<string>();

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
  limit?: number;
}

const CHAT_HISTORY_MESSAGE_LIMIT = 30;
const CHAT_MESSAGE_PAGE_SIZE = 60;
const STREAMING_PERSIST_INTERVAL_MS = 120;
const STREAMING_UI_PATCH_INTERVAL_MS = 80;
const DEEP_MEMORY_LIMIT = 5;
const RELATED_HISTORY_LIMIT = 4;

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

function truncateForPrompt(value: string, maxLength: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}...`;
}

function getQueryTerms(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[\s,，。！？!?;；:：、]+/).filter((term) => term.length >= 2))].slice(0, 10);
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

async function loadDeepMemoryContext(db: SQLiteDatabase, thread: AiThreadRecord, userMessage: string): Promise<string> {
  const settings = await aiThreadRepository.getThreadMemorySettings(db, thread.id);
  if (!settings.deepMemoryEnabled) {
    return '';
  }
  const [memories, messages, recentMessages] = await Promise.all([
    aiThreadRepository.searchActiveMemoryFts(db, {
      boundIpId: thread.boundIpId,
      boundKnowledgeBaseId: thread.boundKnowledgeBaseId,
      query: userMessage,
      roleCardId: thread.roleCardId,
      space: thread.space,
      threadId: thread.id,
      limit: 80,
    }),
    aiThreadRepository.searchCompletedMessageFts(db, {
      limit: CHAT_HISTORY_MESSAGE_LIMIT + RELATED_HISTORY_LIMIT + 12,
      query: userMessage,
      threadId: thread.id,
    }),
    aiThreadRepository.listRecentCompletedNonSystemMessages(db, thread.id, CHAT_HISTORY_MESSAGE_LIMIT),
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

async function resolveThreadProvider(space: PixorySpace, thread: AiThreadRecord) {
  await ensureBuiltInProviders(space);
  const providers = await runWithDatabaseSpace(space, (db) => aiProviderRepository.listProviders(db));
  const defaultProviderId = await runWithDatabaseSpace(space, (db) => settingsRepository.getDefaultAiProviderId(db));
  const provider = providers.find((item) => item.id === thread.providerId) ?? providers.find((item) => item.id === defaultProviderId) ?? providers[0] ?? null;
  if (!provider) {
    return { provider: null, modelId: null, apiKey: null };
  }
  const models = await runWithDatabaseSpace(space, (db) => aiProviderRepository.listModels(db, provider.id));
  const modelId = thread.modelId ?? provider.defaultChatModelId ?? models.find((model) => model.supportsChat)?.modelId ?? null;
  return {
    provider,
    modelId,
    apiKey: await getProviderApiKey(provider.id),
  };
}

async function resolveDefaultThreadProvider(space: PixorySpace, providerId?: string | null, modelId?: string | null) {
  const provider = await runWithDatabaseSpace(space, async (db) => {
    if (providerId) {
      return aiProviderRepository.findProviderById(db, providerId);
    }
    const providers = await aiProviderRepository.listProviders(db);
    const defaultProviderId = await settingsRepository.getDefaultAiProviderId(db);
    return providers.find((item) => item.id === defaultProviderId) ?? providers[0] ?? null;
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

async function buildPromptForThread(thread: AiThreadRecord, userMessage: string) {
  const { companionMemoryPrefix, stableMemoryPrefix, dynamicMemoryContext } = await runWithDatabaseSpace(thread.space, async (db) => {
    const memorySettings = await aiThreadRepository.getThreadMemorySettings(db, thread.id);
    return {
      companionMemoryPrefix: await buildCompanionMemoryPrefix(db, thread, { settings: memorySettings }),
      dynamicMemoryContext: await retrieveDynamicMemoryContext(db, thread, userMessage, { settings: memorySettings }),
      stableMemoryPrefix: await buildStableMemoryPrefix(db, thread, { settings: memorySettings }),
    };
  });
  if (thread.contextType === 'normal') {
    return {
      prompt: buildNormalChatPrompt({
        dynamicMemoryContext,
        roleInstructionWeight: thread.roleInstructionWeight,
        replyPreference: thread.replyPreference,
        companionMemoryPrefix,
        stableMemoryPrefix,
        systemPrompt: thread.contextType === 'normal' ? thread.systemPrompt : thread.systemPrompt || DEFAULT_AI_ROLE_PROMPT,
        userMessage,
      }),
      snippets: [],
    };
  }

  const ownerType = thread.contextType === 'ip' ? 'ip' : 'knowledge_base';
  const ownerId = thread.contextType === 'ip' ? String(thread.boundIpId ?? '') : thread.boundKnowledgeBaseId ?? '';
  const retrieval = ownerId
    ? await retrieveForThread({
        space: thread.space,
        ownerType,
        ownerId,
        query: userMessage,
      })
    : { mode: 'keyword' as const, snippets: [] };

  return {
    prompt: buildMaterialBoundPrompt({
      editablePrompt: thread.systemPrompt || DEFAULT_AI_ROLE_PROMPT,
      dynamicMemoryContext,
      roleInstructionWeight: thread.roleInstructionWeight,
      replyPreference: thread.replyPreference,
      companionMemoryPrefix,
      stableMemoryPrefix,
      materialRules: materialRulesForMode(thread.boundaryMode),
      contextSummary: thread.title,
      snippets: retrieval.snippets.map((snippet) => ({ label: snippet.label, text: snippet.text })),
      userMessage,
    }),
    snippets: retrieval.snippets,
  };
}

export async function createThreadFromContext(input: CreateThreadFromContextInput): Promise<AiThreadRecord> {
  await ensureBuiltInProviders(input.space);
  const { provider, model } = await resolveDefaultThreadProvider(input.space, input.providerId, input.modelId);

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
      providerId: provider?.id ?? null,
      modelId: model?.modelId ?? null,
      modelSnapshotJson: JSON.stringify(model ?? {}),
      roleInstructionWeight: input.roleInstructionWeight ?? 'default',
      replyPreference: input.replyPreference ?? 'auto',
      systemPrompt: input.systemPrompt ?? getDefaultThreadSystemPrompt(input.contextType),
      materialRulesSnapshot: input.contextType === 'normal' ? null : materialRulesForMode(input.boundaryMode ?? 'free'),
      boundaryMode: input.boundaryMode ?? 'free',
    })
  );
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
  const { provider, model } = await resolveDefaultThreadProvider(space, thread?.providerId ?? null, thread?.modelId ?? null);
  if (!provider) {
    return '未选择模型';
  }
  const modelName = model?.displayName ?? thread?.modelId ?? provider.defaultChatModelId ?? null;
  return modelName ? `${provider.displayName} · ${modelName}` : provider.displayName;
}

export async function listThreadMessages(space: PixorySpace, threadId: string, options: ListThreadMessagesOptions = {}): Promise<AiMessageWithCitations[]> {
  return runWithDatabaseSpace(space, async (db) => {
    const messages = await aiThreadRepository.listMessages(db, threadId, options.limit);
    const messageIds = messages.map((message) => message.id);
    const [versionsByMessageId, citationsByMessageId] = await Promise.all([
      aiThreadRepository.listMessageVersionsForMessages(db, messageIds),
      aiThreadRepository.listCitationsForMessages(db, messageIds),
    ]);
    return messages.map((message) => {
      const messageVersions = versionsByMessageId[message.id] ?? [];
      return {
        ...message,
        citations: citationsByMessageId[message.id] ?? [],
        messageVersions,
        versionIndex: messageVersions.length + 1,
        versionTotal: messageVersions.length + 1,
      };
    });
  });
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
  if (threadIds.length === 0) {
    return 0;
  }
  return runWithDatabaseSpace(space, async (db) => {
    let deletedCount = 0;
    await db.withTransactionAsync(async () => {
      deletedCount = await aiThreadRepository.deleteThreads(db, threadIds);
    });
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

  await runWithDatabaseSpace(input.targetSpace, async (db) => {
    await db.withTransactionAsync(async () => {
      for (const snapshot of snapshots) {
        await aiThreadRepository.importThread(db, snapshot, input.targetSpace);
      }
    });
  });

  await runWithDatabaseSpace(input.sourceSpace, async (db) => {
    await db.withTransactionAsync(async () => {
      await aiThreadRepository.deleteThreads(db, snapshots.map((snapshot) => snapshot.thread.id));
    });
  });

  return snapshots.length;
}

async function markAssistantFailed(
  space: PixorySpace,
  assistantMessageId: string,
  message: string,
  partialContent = '',
  partialReasoningText: string | null = null
): Promise<void> {
  await runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.updateMessage(db, assistantMessageId, {
      status: 'failed',
      content: partialContent,
      reasoningText: partialReasoningText,
      errorMessage: message,
      completedAt: new Date().toISOString(),
    })
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

async function streamAssistantReply(input: {
  space: PixorySpace;
  thread: AiThreadRecord;
  userMessage: Pick<AiMessageRecord, 'id' | 'content'>;
  assistantMessageId: string;
  onMessagePatch?: (patch: AiStreamingMessagePatch) => void;
  onUpdated?: () => void;
}): Promise<void> {
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

  const { provider, modelId, apiKey } = await resolveThreadProvider(input.space, input.thread);
  if (!provider || !modelId) {
    await markAssistantFailed(input.space, input.assistantMessageId, '请先选择可用的 AI provider 和模型。');
    input.onMessagePatch?.({ id: input.assistantMessageId, status: 'failed', content: '', reasoningText: null, errorMessage: '请先选择可用的 AI provider 和模型。', completedAt: new Date().toISOString() });
    input.onUpdated?.();
    return;
  }
  if (!apiKey) {
    await markAssistantFailed(input.space, input.assistantMessageId, '请先在 AI 设置中填写 API key。');
    input.onMessagePatch?.({ id: input.assistantMessageId, status: 'failed', content: '', reasoningText: null, errorMessage: '请先在 AI 设置中填写 API key。', completedAt: new Date().toISOString() });
    input.onUpdated?.();
    return;
  }

  const { prompt, snippets } = await buildPromptForThread(input.thread, input.userMessage.content);
  const historySource = await runWithDatabaseSpace(input.space, (db) =>
    aiThreadRepository.listRecentCompletedMessagesBefore(db, input.thread.id, input.userMessage.id, CHAT_HISTORY_MESSAGE_LIMIT + 1)
  );
  const contextTrimmedByCount = historySource.length > CHAT_HISTORY_MESSAGE_LIMIT;
  const historyMessages = contextTrimmedByCount ? historySource.slice(1) : historySource;
  const { contextTrimmedByBudget, history } = buildChatHistory(historyMessages, input.userMessage.id);
  const contextTrimmed = contextTrimmedByCount || contextTrimmedByBudget;

  let answerText = '';
  let reasoningText = '';
  let streamFailed = false;
  let lastPersistAt = 0;
  let lastUiPatchAt = 0;
  const adapter = getAdapterForProvider(provider);
  const emitStreamingPatch = (force = false) => {
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
      },
      async (event: AiStreamEvent) => {
        if (stoppedMessageIds.has(input.assistantMessageId)) {
          return;
        }
        if (event.type === 'answer_delta') {
          answerText += event.text;
        }
        if (event.type === 'reasoning_delta') {
          reasoningText += event.text;
        }
        if (event.type === 'answer_delta' || event.type === 'reasoning_delta') {
          emitStreamingPatch();
          await persistStreamingSnapshot();
        }
        if (event.type === 'error') {
          streamFailed = true;
          await markAssistantFailed(input.space, input.assistantMessageId, event.message, answerText, reasoningText || null);
          input.onMessagePatch?.({ id: input.assistantMessageId, status: 'failed', content: answerText, reasoningText: reasoningText || null, errorMessage: event.message, completedAt: new Date().toISOString() });
          input.onUpdated?.();
        }
      }
    );
  } catch (error) {
    streamFailed = true;
    const message = error instanceof Error ? error.message : 'AI 回复失败。';
    await markAssistantFailed(input.space, input.assistantMessageId, message, answerText, reasoningText || null);
    input.onMessagePatch?.({ id: input.assistantMessageId, status: 'failed', content: answerText, reasoningText: reasoningText || null, errorMessage: message, completedAt: new Date().toISOString() });
    input.onUpdated?.();
  }

  await persistStreamingSnapshot(true);
  emitStreamingPatch(true);

  if (stoppedMessageIds.has(input.assistantMessageId)) {
    const completedAt = new Date().toISOString();
    stoppedMessageIds.delete(input.assistantMessageId);
    await runWithDatabaseSpace(input.space, (db) =>
      aiThreadRepository.updateMessage(db, input.assistantMessageId, {
        status: 'stopped',
        content: answerText,
        reasoningText: reasoningText || null,
        completedAt,
      })
    );
    input.onMessagePatch?.({ id: input.assistantMessageId, status: 'stopped', content: answerText, reasoningText: reasoningText || null, completedAt });
    input.onUpdated?.();
    return;
  }

  if (streamFailed) {
    return;
  }

  let finalCitations: AiCitationRecord[] = [];
  const completedAt = new Date().toISOString();
  await runWithDatabaseSpace(input.space, async (db) => {
    const current = await aiThreadRepository.updateMessage(db, input.assistantMessageId, {
      status: answerText ? 'completed' : 'failed',
      content: answerText,
      reasoningText: reasoningText || null,
      errorMessage: answerText ? null : 'AI 没有返回可用内容。',
      providerId: provider.id,
      modelId,
      modelSnapshotJson: JSON.stringify({ providerId: provider.id, modelId }),
      promptSnapshotJson: JSON.stringify({ contextTrimmed, contextTrimmedByBudget, contextTrimmedByCount, system: prompt.system, materialRules: prompt.materialRules ?? null }),
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
    promptSnapshotJson: JSON.stringify({ contextTrimmed, contextTrimmedByBudget, contextTrimmedByCount, system: prompt.system, materialRules: prompt.materialRules ?? null }),
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
    void scheduleMemoryMaintenance({
      assistantMessageId: input.assistantMessageId,
      reason: 'reply_completed',
      space: input.space,
      thread: input.thread,
      threadId: input.thread.id,
      userMessage: input.userMessage,
    });
  }
  input.onUpdated?.();
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
      role: 'user',
      status: 'completed',
      content: input.content,
      completedAt: new Date().toISOString(),
    });
    await aiThreadRepository.createMessage(db, {
      id: assistantMessageId,
      threadId: thread.id,
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
  });
  input.onCreated?.({ userMessageId, assistantMessageId });
  input.onUpdated?.();

  await streamAssistantReply({
    assistantMessageId,
    onMessagePatch: input.onMessagePatch,
    onUpdated: input.onUpdated,
    space: input.space,
    thread,
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
    const previousUserMessage = await aiThreadRepository.findPreviousMessageByRole(db, thread.id, input.assistantMessageId, 'user');
    if (!previousUserMessage) {
      throw new Error('没有可用于重新生成的用户消息。');
    }
    const trailingIds = await aiThreadRepository.listMessageIdsAfter(db, thread.id, input.assistantMessageId);
    await db.withTransactionAsync(async () => {
      await snapshotMessageVersion(db, assistantMessage);
      if (trailingIds.length > 0) {
        await aiThreadRepository.deleteMessagesByIds(db, trailingIds);
      }
      await aiThreadRepository.updateThread(db, thread.id, {
        lastMessagePreview: previousUserMessage.content.slice(0, 80),
      });
    });
    return previousUserMessage;
  });

  await streamAssistantReply({
    assistantMessageId: input.assistantMessageId,
    onMessagePatch: input.onMessagePatch,
    onUpdated: input.onUpdated,
    space: input.space,
    thread,
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

  let assistantMessageId = createAiId('aimsg');
  await runWithDatabaseSpace(input.space, async (db) => {
    const userMessage = await aiThreadRepository.findMessageById(db, input.userMessageId);
    if (!userMessage || userMessage.threadId !== thread.id || userMessage.role !== 'user') {
      throw new Error('AI user message was not found.');
    }
    const nextAssistant = await aiThreadRepository.findNextMessageByRole(db, thread.id, input.userMessageId, 'assistant');
    if (nextAssistant) {
      assistantMessageId = nextAssistant.id;
    }
    const trailingIds = await aiThreadRepository.listMessageIdsAfter(db, thread.id, nextAssistant?.id ?? input.userMessageId);
    await db.withTransactionAsync(async () => {
      await snapshotMessageVersion(db, userMessage);
      if (nextAssistant) {
        await snapshotMessageVersion(db, nextAssistant);
      }
      await aiThreadRepository.updateMessage(db, input.userMessageId, {
        status: 'completed',
        content,
        errorMessage: null,
        completedAt: new Date().toISOString(),
      });
      if (trailingIds.length > 0) {
        await aiThreadRepository.deleteMessagesByIds(db, trailingIds);
      }
      if (!nextAssistant) {
        await aiThreadRepository.createMessage(db, {
          id: assistantMessageId,
          threadId: thread.id,
          role: 'assistant',
          status: 'generating',
          content: '',
        });
      }
      await aiThreadRepository.updateThread(db, thread.id, {
        lastMessagePreview: content.slice(0, 80),
      });
    });
  });

  input.onCreated?.({ userMessageId: input.userMessageId, assistantMessageId });
  input.onUpdated?.();

  await streamAssistantReply({
    assistantMessageId,
    onMessagePatch: input.onMessagePatch,
    onUpdated: input.onUpdated,
    space: input.space,
    thread,
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
