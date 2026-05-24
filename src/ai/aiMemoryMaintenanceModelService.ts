import {
  aiProviderRepository,
  runWithDatabaseSpace,
  settingsRepository,
  type AiProviderRecord,
  type PixorySpace,
} from '../database';
import type { AiThreadRecord } from './types';
import { ensureBuiltInProviders, getAdapterForProvider } from './aiProviderService';
import { getProviderApiKey } from './secureAiSettingsService';

export type MemoryMaintenanceStatus = 'ready' | 'follow_chat' | 'local_fallback' | 'error';

export interface ResolvedMemoryMaintenanceModel {
  mode: 'auto' | 'follow_chat' | 'deepseek_flash' | 'custom';
  providerId: string | null;
  providerName: string;
  modelId: string | null;
  modelName: string;
  hasApiKey: boolean;
  status: MemoryMaintenanceStatus;
  statusText: string;
  lastTestAt: string | null;
  lastTestMessage: string | null;
  lastTestStatus: string | null;
}

export interface MemoryMaintenanceModelCallResult {
  error: string | null;
  modelId: string | null;
  providerId: string | null;
  status: MemoryMaintenanceStatus;
  text: string | null;
  usedRemote: boolean;
}

export function localMemoryMaintenanceResult(): MemoryMaintenanceModelCallResult {
  return { error: null, modelId: null, providerId: null, status: 'local_fallback', text: null, usedRemote: false };
}

export interface ResolvedMemoryMaintenanceModelWithProvider extends ResolvedMemoryMaintenanceModel {
  provider: AiProviderRecord | null;
  apiKey: string | null;
}

function fallbackModel(input?: {
  lastTestAt?: string | null;
  lastTestMessage?: string | null;
  lastTestStatus?: string | null;
}): ResolvedMemoryMaintenanceModelWithProvider {
  return {
    apiKey: null,
    hasApiKey: false,
    lastTestAt: input?.lastTestAt ?? null,
    lastTestMessage: input?.lastTestMessage ?? null,
    lastTestStatus: input?.lastTestStatus ?? null,
    mode: 'auto',
    modelId: null,
    modelName: '未启用远程维护',
    provider: null,
    providerId: null,
    providerName: '本地',
    status: 'local_fallback',
    statusText: '未配置远程维护模型，摘要压缩和画像维护不会调用远程模型',
  };
}

function appendLastTestState<T extends ResolvedMemoryMaintenanceModelWithProvider>(
  resolved: T,
  settings: Awaited<ReturnType<typeof settingsRepository.getMemoryMaintenanceSettings>>
): T {
  const currentProviderId = resolved.providerId;
  const currentModelId = resolved.modelId;
  const currentBaseUrlHash = hashMaintenanceBaseUrl(resolved.provider?.baseUrl ?? '');
  const hasStoredFingerprint =
    settings.memoryMaintenanceTestedProviderId != null ||
    settings.memoryMaintenanceTestedModelId != null ||
    settings.memoryMaintenanceTestedBaseUrlHash != null;
  const testMatchesCurrentConfig = hasStoredFingerprint
    ? settings.memoryMaintenanceTestedProviderId === currentProviderId &&
      settings.memoryMaintenanceTestedModelId === currentModelId &&
      settings.memoryMaintenanceTestedBaseUrlHash === currentBaseUrlHash
    : true;
  return {
    ...resolved,
    lastTestAt: settings.memoryMaintenanceLastTestAt,
    lastTestMessage: testMatchesCurrentConfig
      ? settings.memoryMaintenanceLastTestMessage
      : settings.memoryMaintenanceLastTestAt
        ? '模型配置已变更，请重新测试记忆模型'
        : settings.memoryMaintenanceLastTestMessage,
    lastTestStatus: testMatchesCurrentConfig ? settings.memoryMaintenanceLastTestStatus : null,
  };
}

function hashMaintenanceBaseUrl(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return null;
  }
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
  }
  return String(hash >>> 0);
}

function errorMessageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : '远程记忆维护模型调用失败';
}

async function resolveProvider(space: PixorySpace, providerId?: string | null): Promise<AiProviderRecord | null> {
  if (!providerId) {
    return null;
  }
  return runWithDatabaseSpace(space, (db) => aiProviderRepository.findProviderById(db, providerId));
}

async function resolveDefaultChatProvider(space: PixorySpace): Promise<AiProviderRecord | null> {
  return runWithDatabaseSpace(space, async (db) => {
    const providers = await aiProviderRepository.listProviders(db);
    const defaultProviderId = await settingsRepository.getDefaultAiProviderId(db);
    return providers.find((provider) => provider.id === defaultProviderId) ?? providers[0] ?? null;
  });
}

async function resolveDeepSeekFlash(space: PixorySpace): Promise<ResolvedMemoryMaintenanceModelWithProvider | null> {
  const provider = await resolveProvider(space, 'deepseek');
  if (!provider) {
    return null;
  }
  const apiKey = await getProviderApiKey(provider.id);
  return {
    apiKey,
    hasApiKey: Boolean(apiKey),
    lastTestAt: null,
    lastTestMessage: null,
    lastTestStatus: null,
    mode: 'deepseek_flash',
    modelId: 'deepseek-v4-flash',
    modelName: 'DeepSeek V4 Flash',
    provider,
    providerId: provider.id,
    providerName: provider.displayName,
    status: apiKey ? 'ready' : 'local_fallback',
    statusText: apiKey ? '已保存 Key，点击“测试记忆模型”确认链路可用' : '未配置远程维护模型，摘要压缩和画像维护不会调用远程模型',
  };
}

async function resolveFollowChat(space: PixorySpace, thread?: AiThreadRecord | null): Promise<ResolvedMemoryMaintenanceModelWithProvider | null> {
  const provider = thread?.providerId ? await resolveProvider(space, thread.providerId) : await resolveDefaultChatProvider(space);
  if (!provider) {
    return null;
  }
  const modelId = thread?.modelId ?? provider.defaultChatModelId;
  const apiKey = await getProviderApiKey(provider.id);
  return {
    apiKey,
    hasApiKey: Boolean(apiKey),
    lastTestAt: null,
    lastTestMessage: null,
    lastTestStatus: null,
    mode: 'follow_chat',
    modelId,
    modelName: modelId ?? '跟随聊天模型',
    provider,
    providerId: provider.id,
    providerName: provider.displayName,
    status: apiKey && modelId ? 'follow_chat' : 'local_fallback',
    statusText: apiKey && modelId ? '已保存聊天模型配置，点击“测试记忆模型”确认链路可用' : '未配置远程维护模型，摘要压缩和画像维护不会调用远程模型',
  };
}

export async function resolveMemoryMaintenanceModel(
  space: PixorySpace,
  thread?: AiThreadRecord | null
): Promise<ResolvedMemoryMaintenanceModelWithProvider> {
  await ensureBuiltInProviders(space);
  const settings = await runWithDatabaseSpace(space, (db) => settingsRepository.getMemoryMaintenanceSettings(db));
  if (settings.memoryMaintenanceMode === 'custom') {
    const provider = await resolveProvider(space, settings.memoryMaintenanceProviderId);
    const apiKey = provider ? await getProviderApiKey(provider.id) : null;
    return appendLastTestState({
      apiKey,
      hasApiKey: Boolean(apiKey),
      lastTestAt: null,
      lastTestMessage: null,
      lastTestStatus: null,
      mode: 'custom',
      modelId: settings.memoryMaintenanceModelId,
      modelName: settings.memoryMaintenanceModelId ?? '自定义',
      provider,
      providerId: provider?.id ?? null,
      providerName: provider?.displayName ?? '未选择模型商',
      status: provider && settings.memoryMaintenanceModelId && apiKey ? 'ready' : 'error',
      statusText: provider && settings.memoryMaintenanceModelId && apiKey ? '已保存配置，点击“测试记忆模型”确认链路可用' : '缺少模型商、模型 ID 或 API Key',
    }, settings);
  }
  if (settings.memoryMaintenanceMode === 'deepseek_flash') {
    const resolved = await resolveDeepSeekFlash(space);
    return resolved ? appendLastTestState(resolved, settings) : fallbackModel({
      lastTestAt: settings.memoryMaintenanceLastTestAt,
      lastTestMessage: settings.memoryMaintenanceLastTestMessage,
      lastTestStatus: settings.memoryMaintenanceLastTestStatus,
    });
  }
  if (settings.memoryMaintenanceMode === 'follow_chat') {
    const resolved = await resolveFollowChat(space, thread);
    return resolved ? appendLastTestState(resolved, settings) : fallbackModel({
      lastTestAt: settings.memoryMaintenanceLastTestAt,
      lastTestMessage: settings.memoryMaintenanceLastTestMessage,
      lastTestStatus: settings.memoryMaintenanceLastTestStatus,
    });
  }

  const deepSeek = await resolveDeepSeekFlash(space);
  if (deepSeek?.hasApiKey) {
    return appendLastTestState({ ...deepSeek, mode: 'auto' }, settings);
  }
  const followChat = await resolveFollowChat(space, thread);
  if (followChat?.hasApiKey && followChat.modelId) {
    return appendLastTestState({ ...followChat, mode: 'auto' }, settings);
  }
  return fallbackModel({
    lastTestAt: settings.memoryMaintenanceLastTestAt,
    lastTestMessage: settings.memoryMaintenanceLastTestMessage,
    lastTestStatus: settings.memoryMaintenanceLastTestStatus,
  });
}

function extractJsonObject(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  return first >= 0 && last > first ? text.slice(first, last + 1) : text.trim();
}

export async function callMemoryMaintenanceModel(input: {
  space: PixorySpace;
  thread?: AiThreadRecord | null;
  systemPrompt: string;
  userPrompt: string;
}): Promise<MemoryMaintenanceModelCallResult> {
  try {
    const resolved = await resolveMemoryMaintenanceModel(input.space, input.thread);
    if (!resolved.provider || !resolved.modelId || !resolved.apiKey || resolved.status === 'local_fallback') {
      return { error: null, modelId: resolved.modelId, providerId: resolved.providerId, status: resolved.status, text: null, usedRemote: false };
    }
    let text = '';
    let streamError: string | null = null;
    await getAdapterForProvider(resolved.provider).streamChat(
      {
        apiKey: resolved.apiKey,
        baseUrl: resolved.provider.baseUrl ?? '',
        history: [],
        modelId: resolved.modelId,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
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
      return { error: streamError, modelId: resolved.modelId, providerId: resolved.providerId, status: 'error', text: null, usedRemote: true };
    }
    return { error: null, modelId: resolved.modelId, providerId: resolved.providerId, status: resolved.status, text: text.trim() || null, usedRemote: true };
  } catch (error) {
    return { error: errorMessageFromUnknown(error), modelId: null, providerId: null, status: 'error', text: null, usedRemote: false };
  }
}

export async function testMemoryMaintenanceModel(space: PixorySpace, thread?: AiThreadRecord | null): Promise<ResolvedMemoryMaintenanceModel> {
  const resolved = await resolveMemoryMaintenanceModel(space, thread);
  let status: MemoryMaintenanceStatus = resolved.status;
  let message = resolved.statusText;
  try {
    if (!resolved.provider || !resolved.modelId || !resolved.apiKey || resolved.status === 'local_fallback') {
      status = 'local_fallback';
      message = '未配置远程模型，使用本地轻量整理';
    } else {
      let text = '';
      let streamError: string | null = null;
      await getAdapterForProvider(resolved.provider).streamChat(
        {
          apiKey: resolved.apiKey,
          baseUrl: resolved.provider.baseUrl ?? '',
          history: [],
          modelId: resolved.modelId,
          systemPrompt: '你是 Pixory 的记忆维护模型连通性测试器。',
          userPrompt: '请只输出 {"ok":true}',
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
      const parsed = JSON.parse(extractJsonObject(text)) as { ok?: unknown };
      if (parsed.ok !== true) {
        throw new Error('模型未返回预期 JSON。');
      }
      status = resolved.status === 'follow_chat' ? 'follow_chat' : 'ready';
      message = status === 'follow_chat'
        ? `测试通过：${resolved.providerName} · ${resolved.modelName} 可复用聊天模型 API Key`
        : `测试通过：${resolved.providerName} · ${resolved.modelName} 可用于记忆整理`;
    }
  } catch (error) {
    status = 'error';
    message = `测试失败：${error instanceof Error ? error.message : 'API Key 无效或模型不可用'}`;
  }
  const testedAt = new Date().toISOString();
  await runWithDatabaseSpace(space, (db) =>
    settingsRepository.updateMemoryMaintenanceSettings(db, {
      memoryMaintenanceLastTestAt: testedAt,
      memoryMaintenanceLastTestMessage: message,
      memoryMaintenanceLastTestStatus: status,
      memoryMaintenanceTestedBaseUrlHash: hashMaintenanceBaseUrl(resolved.provider?.baseUrl ?? ''),
      memoryMaintenanceTestedModelId: resolved.modelId,
      memoryMaintenanceTestedProviderId: resolved.providerId,
    })
  );
  return { ...resolved, lastTestAt: testedAt, lastTestMessage: message, lastTestStatus: status, status, statusText: message };
}
