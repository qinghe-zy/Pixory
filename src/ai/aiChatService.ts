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
  type AiThreadRecord,
  type PixorySpace,
} from '../database';
import type { AiMessageRecord, AiMessageVersionRecord, AiThreadHistoryFilter, AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import { DEFAULT_AI_ROLE_PROMPT, MATERIAL_SESSION_RULES, STRICT_MATERIAL_RULES } from './aiConstants';
import { getAdapterForProvider, ensureBuiltInProviders } from './aiProviderService';
import { buildMaterialBoundPrompt, buildNormalChatPrompt } from './promptBuilder';
import { retrieveForThread } from './aiRetrievalService';
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
  boundaryMode?: AiBoundaryMode;
}

export interface SendUserMessageInput {
  space: PixorySpace;
  threadId: string;
  content: string;
  onCreated?: (ids: { userMessageId: string; assistantMessageId: string }) => void;
  onUpdated?: () => void;
}

export interface RetryAssistantMessageInput {
  space: PixorySpace;
  threadId: string;
  assistantMessageId: string;
  onUpdated?: () => void;
}

export interface RewriteUserMessageInput {
  space: PixorySpace;
  threadId: string;
  userMessageId: string;
  content: string;
  onCreated?: (ids: { userMessageId: string; assistantMessageId: string }) => void;
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
}

export interface UpdateAiThreadSessionConfigInput {
  space: PixorySpace;
  threadId: string;
  systemPrompt: string;
  boundaryMode: AiBoundaryMode;
  providerId?: string | null;
  modelId?: string | null;
  avatarEnabled?: boolean;
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

export type AiMessageWithCitations = AiMessageRecord & {
  citations: AiCitationRecord[];
  messageVersions: AiMessageVersionRecord[];
  versionIndex: number;
  versionTotal: number;
};

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

export function generateAiThreadTitle(input: { contextTitle: string; firstUserMessage: string; contextType: AiContextType }): string {
  const compact = COMMON_TITLE_PREFIXES.reduce(
    (title, pattern) => title.replace(pattern, ''),
    input.firstUserMessage
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[`*_>#\[\](){}]/g, '')
      .replace(/[。！？!?，,；;：:、]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ).trim().slice(0, 18);
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
  if (thread.contextType === 'normal') {
    return {
      prompt: buildNormalChatPrompt({
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

export async function listThreadMessages(space: PixorySpace, threadId: string): Promise<AiMessageWithCitations[]> {
  return runWithDatabaseSpace(space, async (db) => {
    const messages = await aiThreadRepository.listMessages(db, threadId);
    return Promise.all(
      messages.map(async (message) => {
        const messageVersions = await aiThreadRepository.listMessageVersions(db, message.id);
        return {
          ...message,
          citations: await aiThreadRepository.listCitations(db, message.id),
          messageVersions,
          versionIndex: messageVersions.length + 1,
          versionTotal: messageVersions.length + 1,
        };
      })
    );
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
}): Promise<AiThreadHistoryItem[]> {
  return runWithDatabaseSpace(input.space, (db) => aiThreadRepository.listHistoryItems(db, input.space, input.filter ?? 'all', input.limit ?? 100));
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
    return { thread, roleCardName: roleCard?.name ?? null, avatar: parseThreadAvatarConfig(thread.roleSnapshotJson) };
  });
}

export async function updateAiThreadSessionConfig(input: UpdateAiThreadSessionConfigInput): Promise<AiThreadRecord | null> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread || thread.space !== input.space) {
      return null;
    }
    return aiThreadRepository.updateThread(db, input.threadId, {
      boundaryMode: input.boundaryMode,
      materialRulesSnapshot: thread.contextType === 'normal' ? null : materialRulesForMode(input.boundaryMode),
      modelId: input.modelId,
      providerId: input.providerId,
      roleSnapshotJson:
        input.avatarEnabled == null
          ? thread.roleSnapshotJson
          : patchThreadRoleSnapshot(thread.roleSnapshotJson, { avatarEnabled: input.avatarEnabled }),
      systemPrompt: input.systemPrompt.trim() || getDefaultThreadSystemPrompt(thread.contextType),
    });
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

async function markAssistantFailed(space: PixorySpace, assistantMessageId: string, message: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.updateMessage(db, assistantMessageId, {
      status: 'failed',
      content: '',
      reasoningText: null,
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

function buildChatHistory(messages: AiMessageRecord[], userMessageId: string) {
  const userIndex = messages.findIndex((message) => message.id === userMessageId);
  const previousMessages = userIndex >= 0 ? messages.slice(0, userIndex) : messages;
  return previousMessages
    .filter((message) => message.role !== 'system' && message.status === 'completed')
    .slice(-8)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: message.content,
    }));
}

async function streamAssistantReply(input: {
  space: PixorySpace;
  thread: AiThreadRecord;
  userMessage: Pick<AiMessageRecord, 'id' | 'content'>;
  assistantMessageId: string;
  onUpdated?: () => void;
}): Promise<void> {
  stoppedMessageIds.delete(input.assistantMessageId);
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
      completedAt: null,
    });
    await aiThreadRepository.replaceCitations(db, input.assistantMessageId, []);
  });
  input.onUpdated?.();

  const { provider, modelId, apiKey } = await resolveThreadProvider(input.space, input.thread);
  if (!provider || !modelId) {
    await markAssistantFailed(input.space, input.assistantMessageId, '请先选择可用的 AI provider 和模型。');
    input.onUpdated?.();
    return;
  }
  if (!apiKey) {
    await markAssistantFailed(input.space, input.assistantMessageId, '请先在 AI 设置中填写 API key。');
    input.onUpdated?.();
    return;
  }

  const { prompt, snippets } = await buildPromptForThread(input.thread, input.userMessage.content);
  const messages = await runWithDatabaseSpace(input.space, (db) => aiThreadRepository.listMessages(db, input.thread.id));
  const history = buildChatHistory(messages, input.userMessage.id);

  let answerText = '';
  let reasoningText = '';
  let streamFailed = false;
  const adapter = getAdapterForProvider(provider);

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
          await runWithDatabaseSpace(input.space, (db) =>
            aiThreadRepository.updateMessage(db, input.assistantMessageId, {
              content: answerText,
              reasoningText: reasoningText || null,
            })
          );
          input.onUpdated?.();
        }
        if (event.type === 'error') {
          streamFailed = true;
          await markAssistantFailed(input.space, input.assistantMessageId, event.message);
          input.onUpdated?.();
        }
      }
    );
  } catch (error) {
    streamFailed = true;
    await markAssistantFailed(input.space, input.assistantMessageId, error instanceof Error ? error.message : 'AI 回复失败。');
    input.onUpdated?.();
  }

  if (stoppedMessageIds.has(input.assistantMessageId)) {
    stoppedMessageIds.delete(input.assistantMessageId);
    await runWithDatabaseSpace(input.space, (db) =>
      aiThreadRepository.updateMessage(db, input.assistantMessageId, {
        status: 'stopped',
        content: answerText,
        reasoningText: reasoningText || null,
        completedAt: new Date().toISOString(),
      })
    );
    input.onUpdated?.();
    return;
  }

  if (streamFailed) {
    return;
  }

  await runWithDatabaseSpace(input.space, async (db) => {
    const current = await aiThreadRepository.updateMessage(db, input.assistantMessageId, {
      status: answerText ? 'completed' : 'failed',
      content: answerText,
      reasoningText: reasoningText || null,
      errorMessage: answerText ? null : 'AI 没有返回可用内容。',
      providerId: provider.id,
      modelId,
      modelSnapshotJson: JSON.stringify({ providerId: provider.id, modelId }),
      promptSnapshotJson: JSON.stringify({ system: prompt.system, materialRules: prompt.materialRules ?? null }),
      completedAt: new Date().toISOString(),
    });
    if (current?.status === 'completed' && snippets.length > 0) {
      await aiThreadRepository.replaceCitations(
        db,
        input.assistantMessageId,
        snippets.map((snippet) => ({
          id: createAiId('aicite'),
          sourceType: snippet.sourceType ?? 'document_chunk',
          sourceId: snippet.sourceId ?? snippet.chunkId,
          label: snippet.label,
          locator: snippet.locator,
        }))
      );
    }
  });
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
      titleStatus: thread.titleStatus === 'fallback' ? 'generated' : undefined,
    });
  });
  input.onCreated?.({ userMessageId, assistantMessageId });
  input.onUpdated?.();

  await streamAssistantReply({
    assistantMessageId,
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
    const messages = await aiThreadRepository.listMessages(db, thread.id);
    const assistantIndex = messages.findIndex((message) => message.id === input.assistantMessageId);
    const assistantMessage = messages[assistantIndex];
    if (!assistantMessage || assistantMessage.role !== 'assistant') {
      throw new Error('AI assistant message was not found.');
    }
    const previousUserMessage = [...messages.slice(0, assistantIndex)].reverse().find((message) => message.role === 'user');
    if (!previousUserMessage) {
      throw new Error('没有可用于重新生成的用户消息。');
    }
    const trailingIds = messages.slice(assistantIndex + 1).map((message) => message.id);
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
    const messages = await aiThreadRepository.listMessages(db, thread.id);
    const userIndex = messages.findIndex((message) => message.id === input.userMessageId);
    const userMessage = messages[userIndex];
    if (!userMessage || userMessage.role !== 'user') {
      throw new Error('AI user message was not found.');
    }
    const nextAssistantIndex = messages.findIndex((message, index) => index > userIndex && message.role === 'assistant');
    const nextAssistant = nextAssistantIndex >= 0 ? messages[nextAssistantIndex] : null;
    if (nextAssistant) {
      assistantMessageId = nextAssistant.id;
    }
    const trailingIds = messages
      .slice(nextAssistant ? nextAssistantIndex + 1 : userIndex + 1)
      .map((message) => message.id);
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
