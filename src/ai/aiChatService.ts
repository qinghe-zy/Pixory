import {
  aiProviderRepository,
  aiThreadRepository,
  runWithDatabaseSpace,
  type AiBoundaryMode,
  type AiCitationRecord,
  type AiContextType,
  type AiThreadRecord,
  type PixorySpace,
} from '../database';
import type { AiMessageRecord } from '../database/repositories/aiThreadRepository';
import { DEFAULT_AI_ROLE_PROMPT, MATERIAL_SESSION_RULES, STRICT_MATERIAL_RULES } from './aiConstants';
import { getAdapterForProvider, ensureBuiltInProviders } from './aiProviderService';
import { buildMaterialBoundPrompt, buildNormalChatPrompt } from './promptBuilder';
import { retrieveForThread } from './aiRetrievalService';
import { getProviderApiKey } from './secureAiSettingsService';
import type { AiStreamEvent } from './providers/base';

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
}

export interface StopStreamingMessageInput {
  space: PixorySpace;
  assistantMessageId: string;
}

const stoppedMessageIds = new Set<string>();

export type AiMessageWithCitations = AiMessageRecord & {
  citations: AiCitationRecord[];
};

function createAiId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${timestamp}_${random}`;
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

function materialRulesForMode(boundaryMode: AiBoundaryMode): string {
  return boundaryMode === 'strict_material' ? STRICT_MATERIAL_RULES : MATERIAL_SESSION_RULES;
}

async function resolveThreadProvider(space: PixorySpace, thread: AiThreadRecord) {
  await ensureBuiltInProviders(space);
  const providers = await runWithDatabaseSpace(space, (db) => aiProviderRepository.listProviders(db));
  const provider = providers.find((item) => item.id === thread.providerId) ?? providers[0] ?? null;
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

async function buildPromptForThread(thread: AiThreadRecord, userMessage: string) {
  if (thread.contextType === 'normal') {
    return {
      prompt: buildNormalChatPrompt({
        systemPrompt: thread.systemPrompt || DEFAULT_AI_ROLE_PROMPT,
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
  const provider = input.providerId
    ? await runWithDatabaseSpace(input.space, (db) => aiProviderRepository.findProviderById(db, input.providerId ?? ''))
    : null;
  const model = provider && input.modelId
    ? await runWithDatabaseSpace(input.space, (db) => aiProviderRepository.findModel(db, provider.id, input.modelId ?? ''))
    : null;

  return runWithDatabaseSpace(input.space, (db) =>
    aiThreadRepository.createThread(db, {
      id: createAiId('aithread'),
      space: input.space,
      contextType: input.contextType,
      boundIpId: input.boundIpId ?? null,
      boundKnowledgeBaseId: input.boundKnowledgeBaseId ?? null,
      includeIpDocuments: input.includeIpDocuments ?? false,
      title: fallbackTitle(input),
      titleStatus: input.title.trim() ? 'custom' : 'fallback',
      providerId: provider?.id ?? input.providerId ?? null,
      modelId: model?.modelId ?? input.modelId ?? null,
      modelSnapshotJson: JSON.stringify(model ?? {}),
      systemPrompt: input.systemPrompt ?? DEFAULT_AI_ROLE_PROMPT,
      materialRulesSnapshot: input.contextType === 'normal' ? null : materialRulesForMode(input.boundaryMode ?? 'free'),
      boundaryMode: input.boundaryMode ?? 'free',
    })
  );
}

export async function listThreadMessages(space: PixorySpace, threadId: string): Promise<AiMessageWithCitations[]> {
  return runWithDatabaseSpace(space, async (db) => {
    const messages = await aiThreadRepository.listMessages(db, threadId);
    return Promise.all(
      messages.map(async (message) => ({
        ...message,
        citations: await aiThreadRepository.listCitations(db, message.id),
      }))
    );
  });
}

async function markAssistantFailed(space: PixorySpace, assistantMessageId: string, message: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.updateMessage(db, assistantMessageId, {
      status: 'failed',
      errorMessage: message,
      completedAt: new Date().toISOString(),
    })
  );
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
      lastMessagePreview: input.content.slice(0, 80),
    });
  });
  input.onCreated?.({ userMessageId, assistantMessageId });
  input.onUpdated?.();

  const { provider, modelId, apiKey } = await resolveThreadProvider(input.space, thread);
  if (!provider || !modelId) {
    await markAssistantFailed(input.space, assistantMessageId, '请先选择可用的 AI provider 和模型。');
    input.onUpdated?.();
    return { userMessageId, assistantMessageId };
  }
  if (!apiKey) {
    await markAssistantFailed(input.space, assistantMessageId, '请先在 AI 设置中填写 API key。');
    input.onUpdated?.();
    return { userMessageId, assistantMessageId };
  }

  const { prompt, snippets } = await buildPromptForThread(thread, input.content);
  const previousMessages = await runWithDatabaseSpace(input.space, (db) => aiThreadRepository.listMessages(db, thread.id));
  const history = previousMessages
    .filter((message) => message.id !== userMessageId && message.role !== 'system' && message.status === 'completed')
    .slice(-8)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: message.content,
    }));

  let answerText = '';
  let reasoningText = '';
  const adapter = getAdapterForProvider(provider);
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
      if (stoppedMessageIds.has(assistantMessageId)) {
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
          aiThreadRepository.updateMessage(db, assistantMessageId, {
            content: answerText,
            reasoningText: reasoningText || null,
          })
        );
        input.onUpdated?.();
      }
      if (event.type === 'error') {
        await markAssistantFailed(input.space, assistantMessageId, event.message);
      }
    }
  );

  if (stoppedMessageIds.has(assistantMessageId)) {
    stoppedMessageIds.delete(assistantMessageId);
    await runWithDatabaseSpace(input.space, (db) =>
      aiThreadRepository.updateMessage(db, assistantMessageId, {
        status: 'stopped',
        content: answerText,
        reasoningText: reasoningText || null,
        completedAt: new Date().toISOString(),
      })
    );
    input.onUpdated?.();
    return { userMessageId, assistantMessageId };
  }

  await runWithDatabaseSpace(input.space, async (db) => {
    const current = await aiThreadRepository.updateMessage(db, assistantMessageId, {
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
        assistantMessageId,
        snippets.map((snippet) => ({
          id: createAiId('aicite'),
          sourceType: 'document_chunk',
          sourceId: snippet.chunkId,
          label: snippet.label,
          locator: snippet.locator,
        }))
      );
    }
  });
  input.onUpdated?.();

  return { userMessageId, assistantMessageId };
}

export async function retryAssistantMessage(input: RetryAssistantMessageInput): Promise<void> {
  await runWithDatabaseSpace(input.space, (db) =>
    aiThreadRepository.updateMessage(db, input.assistantMessageId, {
      status: 'queued',
      errorMessage: null,
    })
  );
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
