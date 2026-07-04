import {
  aiProviderRepository,
  settingsRepository,
  runWithDatabaseSpace,
  type AiProviderModelRecord,
  type AiProviderRecord,
  type PixorySpace,
} from '../database';
import { BUILT_IN_PROVIDERS } from './aiConstants';
import { hashPromptCacheText } from './aiPromptCache';
import { builtInModelsForProvider } from './providerRegistry';
import {
  getProviderApiKey,
  getProviderApiKeyForSpace,
  hasProviderApiKeyForSpace,
  setProviderApiKey,
  setProviderApiKeyForSpace,
} from './secureAiSettingsService';
import type { AiProviderAdapter } from './providers/base';
import { normalizeBaseUrl } from './providers/base';
import { claudeProvider } from './providers/claudeProvider';
import { geminiProvider } from './providers/geminiProvider';
import { openAiCompatibleProvider } from './providers/openAiCompatibleProvider';
import { classifyAiProviderError, toUserProviderErrorMessage } from './aiProviderErrorClassifier';
import type { AiProviderProtocol, AiProviderType } from './types';

function createTimestamp(): string {
  return new Date().toISOString();
}

function adapterForProtocol(protocol: AiProviderProtocol): AiProviderAdapter {
  if (protocol === 'gemini') {
    return geminiProvider;
  }
  if (protocol === 'anthropic') {
    return claudeProvider;
  }
  return openAiCompatibleProvider;
}

function builtInProviderRecord(providerType: AiProviderType): AiProviderRecord | null {
  const preset = BUILT_IN_PROVIDERS.find((provider) => provider.providerType === providerType);
  if (!preset) {
    return null;
  }
  const now = createTimestamp();
  const providerId = preset.providerType;
  const models = builtInModelsForProvider(providerId, preset.providerType);
  const defaultChatModel = models.find((model) => model.supportsChat)?.modelId ?? null;
  const defaultEmbeddingModel = models.find((model) => model.supportsEmbedding)?.modelId ?? null;
  return {
    id: providerId,
    providerType: preset.providerType,
    displayName: preset.displayName,
    baseUrl: preset.baseUrl,
    embeddingBaseUrl: null,
    protocol: preset.protocol,
    chatEnabled: preset.chatEnabled,
    embeddingEnabled: preset.embeddingEnabled,
    visionEnabled: preset.visionEnabled,
    defaultChatModelId: defaultChatModel,
    defaultEmbeddingModelId: defaultEmbeddingModel,
    keyUpdatedAt: null,
    lastVerifiedAt: null,
    lastVerifyMessage: null,
    lastVerifyStatus: null,
    verifyFingerprint: null,
    createdAt: now,
    updatedAt: now,
  };
}

function syncedModelRecord(provider: AiProviderRecord, modelId: string): AiProviderModelRecord {
  const now = createTimestamp();
  const builtIn = builtInModelsForProvider(provider.id, provider.providerType).find((model) => model.modelId === modelId);
  return {
    id: `${provider.id}:${modelId}`,
    providerId: provider.id,
    modelId,
    displayName: builtIn?.displayName ?? modelId,
    supportsChat: builtIn?.supportsChat ?? true,
    supportsEmbedding: builtIn?.supportsEmbedding ?? false,
    supportsThinking: builtIn?.supportsThinking ?? false,
    supportsVision: builtIn?.supportsVision ?? false,
    supportsTools: builtIn?.supportsTools ?? false,
    contextWindowTokens: builtIn?.contextWindowTokens,
    labels: builtIn?.labels ?? [],
    source: 'synced',
    createdAt: now,
    updatedAt: now,
  };
}

function manualModelRecord(provider: AiProviderRecord, modelId: string): AiProviderModelRecord {
  const now = createTimestamp();
  return {
    id: `${provider.id}:${modelId}`,
    providerId: provider.id,
    modelId,
    displayName: modelId,
    supportsChat: true,
    supportsEmbedding: false,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: false,
    contextWindowTokens: undefined,
    labels: ['Chat', 'Manual'],
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

function verifiedLabels(labels: string[]): string[] {
  return labels.includes('Verified') ? labels : [...labels, 'Verified'];
}

async function buildSuccessfulModelRecord(
  space: PixorySpace,
  providerId: string,
  provider: AiProviderRecord,
  trimmedModelId: string
): Promise<AiProviderModelRecord> {
  const builtIn = builtInModelsForProvider(provider.id, provider.providerType).find((model) => model.modelId === trimmedModelId);
  if (builtIn) {
    return {
      ...builtIn,
      labels: verifiedLabels(builtIn.labels),
      source: 'built_in',
      updatedAt: createTimestamp(),
    };
  }
  const existingModel = await runWithDatabaseSpace(space, (db) => aiProviderRepository.findModel(db, providerId, trimmedModelId));
  if (existingModel) {
    return {
      ...existingModel,
      source: existingModel.source,
      labels: verifiedLabels(existingModel.labels),
      updatedAt: createTimestamp(),
    };
  }
  const baseRecord = syncedModelRecord(provider, trimmedModelId);
  return {
    ...baseRecord,
    labels: verifiedLabels(baseRecord.labels),
    source: 'synced',
    updatedAt: createTimestamp(),
  };
}

async function loadProviderAndModel(space: PixorySpace, providerId: string, modelId: string): Promise<{
  existingModel: AiProviderModelRecord | null;
  provider: AiProviderRecord;
}> {
  const [provider, existingModel] = await runWithDatabaseSpace(space, async (db) => Promise.all([
    aiProviderRepository.findProviderById(db, providerId),
    aiProviderRepository.findModel(db, providerId, modelId),
  ]));
  if (!provider) {
    throw new Error('AI provider is not configured.');
  }
  return { existingModel, provider };
}

function manualEmbeddingModelRecord(provider: AiProviderRecord, modelId: string): AiProviderModelRecord {
  const now = createTimestamp();
  return {
    id: `${provider.id}:${modelId}`,
    providerId: provider.id,
    modelId,
    displayName: modelId,
    supportsChat: false,
    supportsEmbedding: true,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: false,
    contextWindowTokens: undefined,
    labels: ['Embedding', 'Manual'],
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensureBuiltInProviders(space: PixorySpace): Promise<void> {
  await runWithDatabaseSpace(space, async (db) => {
    for (const preset of BUILT_IN_PROVIDERS) {
      const provider = builtInProviderRecord(preset.providerType);
      if (!provider) {
        continue;
      }
      await aiProviderRepository.upsertProvider(db, provider);
      await aiProviderRepository.upsertModels(db, provider.id, builtInModelsForProvider(provider.id, provider.providerType));
    }
  });
}

async function saveProviderApiKeyAndTimestamp(providerId: string, apiKey: string, space?: PixorySpace): Promise<void> {
  const previousApiKey = space ? await getProviderApiKeyForSpace(space, providerId) : await getProviderApiKey(providerId);
  if (space) {
    await setProviderApiKeyForSpace(space, providerId, apiKey);
  } else {
    await setProviderApiKey(providerId, apiKey);
  }
  if (space && previousApiKey !== apiKey.trim()) {
    await runWithDatabaseSpace(space, (db) => aiProviderRepository.updateProviderKeyUpdatedAt(db, providerId, createTimestamp()));
  }
}

export async function saveProviderApiKey(providerId: string, apiKey: string, space?: PixorySpace): Promise<void> {
  await saveProviderApiKeyAndTimestamp(providerId, apiKey, space);
}

export async function saveProviderApiKeyForSpace(space: PixorySpace, providerId: string, apiKey: string): Promise<void> {
  await saveProviderApiKeyAndTimestamp(providerId, apiKey, space);
}

export async function getSavedProviderApiKey(providerId: string, space: PixorySpace = 'normal'): Promise<string | null> {
  return getProviderApiKeyForSpace(space, providerId);
}

export async function saveProviderBaseUrl(space: PixorySpace, providerId: string, baseUrl: string | null): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiProviderRepository.updateProviderBaseUrl(db, providerId, baseUrl ? normalizeBaseUrl(baseUrl) || null : null));
}

export async function saveProviderEmbeddingBaseUrl(space: PixorySpace, providerId: string, embeddingBaseUrl: string | null): Promise<void> {
  await runWithDatabaseSpace(space, (db) =>
    aiProviderRepository.updateProviderEmbeddingBaseUrl(db, providerId, embeddingBaseUrl?.trim() || null)
  );
}

export async function saveProviderDefaultModels(
  space: PixorySpace,
  providerId: string,
  defaults: { defaultChatModelId?: string | null; defaultEmbeddingModelId?: string | null }
): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiProviderRepository.updateProviderDefaults(db, providerId, defaults));
}

export function buildProviderVerifyFingerprint(input: {
  keyUpdatedAt: string | null;
  modelId: string | null;
  normalizedBaseUrl: string;
  providerId: string;
}): string {
  return hashPromptCacheText([input.normalizedBaseUrl, input.providerId, input.modelId ?? '', input.keyUpdatedAt ?? ''].join('\n'));
}

function providerVerifyStatus(provider: AiProviderRecord): AiProviderRecord['lastVerifyStatus'] {
  if (!provider.defaultChatModelId) {
    return 'untested';
  }
  const fingerprint = buildProviderVerifyFingerprint({
    keyUpdatedAt: provider.keyUpdatedAt,
    modelId: provider.defaultChatModelId,
    normalizedBaseUrl: normalizeBaseUrl(provider.baseUrl ?? ''),
    providerId: provider.id,
  });
  if (provider.verifyFingerprint && provider.verifyFingerprint !== fingerprint) {
    return 'changed';
  }
  return provider.lastVerifyStatus ?? 'untested';
}

function withTimeoutSignal(ms: number): { cancel: () => void; signal: AbortSignal } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { cancel: () => clearTimeout(timer), signal: controller.signal };
}

export async function selectProvider(space: PixorySpace, providerId: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) => settingsRepository.setDefaultAiProviderId(db, providerId));
}

export async function getDefaultChatProviderId(space: PixorySpace): Promise<string | null> {
  return runWithDatabaseSpace(space, (db) => settingsRepository.getDefaultAiProviderId(db));
}

export async function saveManualChatModel(space: PixorySpace, providerId: string, modelId: string): Promise<void> {
  const trimmedModelId = modelId.trim();
  if (!trimmedModelId) {
    throw new Error('请输入模型 ID。');
  }
  const { existingModel, provider } = await loadProviderAndModel(space, providerId, trimmedModelId);
  if (existingModel && !existingModel.supportsChat) {
    throw new Error('该模型已存在，但当前没有标记为聊天模型。');
  }
  await runWithDatabaseSpace(space, async (db) => {
    if (!existingModel || existingModel.source === 'manual') {
      await aiProviderRepository.upsertModels(db, provider.id, [manualModelRecord(provider, trimmedModelId)]);
    }
    await aiProviderRepository.updateProviderDefaults(db, provider.id, { defaultChatModelId: trimmedModelId });
  });
}

export async function saveManualChatModelCandidate(space: PixorySpace, providerId: string, modelId: string): Promise<void> {
  const trimmedModelId = modelId.trim();
  if (!trimmedModelId) {
    throw new Error('请输入模型 ID。');
  }
  const { existingModel, provider } = await loadProviderAndModel(space, providerId, trimmedModelId);
  if (existingModel) {
    if (!existingModel.supportsChat) {
      throw new Error('该模型已存在，但当前没有标记为聊天模型。');
    }
    if (existingModel.source !== 'manual') {
      return;
    }
  }
  await runWithDatabaseSpace(space, (db) => aiProviderRepository.upsertModels(db, provider.id, [manualModelRecord(provider, trimmedModelId)]));
}

export async function recordSuccessfulProviderModel(space: PixorySpace, providerId: string, modelId: string): Promise<void> {
  const trimmedModelId = modelId.trim();
  if (!trimmedModelId) {
    return;
  }
  const provider = await runWithDatabaseSpace(space, (db) => aiProviderRepository.findProviderById(db, providerId));
  if (!provider) {
    return;
  }
  const successfulModelRecord = await buildSuccessfulModelRecord(space, providerId, provider, trimmedModelId);
  await runWithDatabaseSpace(space, (db) => aiProviderRepository.upsertModels(db, provider.id, [successfulModelRecord]));
}

export async function saveManualEmbeddingModel(space: PixorySpace, providerId: string, modelId: string): Promise<void> {
  const trimmedModelId = modelId.trim();
  if (!trimmedModelId) {
    throw new Error('请输入 Embedding 模型 ID。');
  }
  const { existingModel, provider } = await loadProviderAndModel(space, providerId, trimmedModelId);
  if (existingModel && !existingModel.supportsEmbedding) {
    throw new Error('该模型已存在，但当前没有标记为 Embedding 模型。');
  }
  await runWithDatabaseSpace(space, async (db) => {
    if (!existingModel || existingModel.source === 'manual') {
      await aiProviderRepository.upsertModels(db, provider.id, [manualEmbeddingModelRecord(provider, trimmedModelId)]);
    }
    await aiProviderRepository.updateProviderDefaults(db, provider.id, { defaultEmbeddingModelId: trimmedModelId });
  });
}

export async function deleteProviderModel(space: PixorySpace, providerId: string, modelId: string): Promise<void> {
  const [provider, model] = await runWithDatabaseSpace(space, async (db) => Promise.all([
    aiProviderRepository.findProviderById(db, providerId),
    aiProviderRepository.findModel(db, providerId, modelId),
  ]));
  if (!provider || !model) {
    throw new Error('模型不存在或已被删除。');
  }
  const builtInModelIds = new Set(builtInModelsForProvider(providerId, provider.providerType).map((item) => item.modelId));
  if (builtInModelIds.has(modelId)) {
    throw new Error('内置模型不能删除。');
  }
  await runWithDatabaseSpace(space, (db) => aiProviderRepository.deleteProviderModelAndCleanup(db, providerId, modelId));
}

export async function deleteProviderModels(
  space: PixorySpace,
  models: Array<{ providerId: string; modelId: string }>
): Promise<number> {
  let deletedCount = 0;
  const uniqueModels = Array.from(
    new Map(models.map((item) => [`${item.providerId}:${item.modelId}`, item] as const)).values()
  );
  for (const model of uniqueModels) {
    try {
      await deleteProviderModel(space, model.providerId, model.modelId);
      deletedCount += 1;
    } catch {
      // Keep batch deletion best-effort so one protected or stale model does not block the rest.
    }
  }
  return deletedCount;
}

export async function deleteProviderModelsByProvider(space: PixorySpace, providerId: string): Promise<number> {
  const provider = await runWithDatabaseSpace(space, (db) => aiProviderRepository.findProviderById(db, providerId));
  if (!provider) {
    throw new Error('模型来源不存在或已被删除。');
  }
  const protectedModelIds = new Set(
    builtInModelsForProvider(providerId, provider.providerType).map((model) => model.modelId)
  );
  const models = await runWithDatabaseSpace(space, (db) => aiProviderRepository.listModels(db, providerId));
  const deletableModels = models
    .filter((model) => !protectedModelIds.has(model.modelId))
    .map((model) => ({ providerId, modelId: model.modelId }));
  return deleteProviderModels(space, deletableModels);
}

export async function verifyCurrentProviderModel(providerId: string, space: PixorySpace = 'normal'): Promise<void> {
  const provider = await runWithDatabaseSpace(space, (db) => aiProviderRepository.findProviderById(db, providerId));
  if (!provider) {
    throw new Error('AI provider is not configured.');
  }
  const apiKey = await getProviderApiKeyForSpace(space, providerId);
  if (!apiKey) {
    throw new Error('请先填写 API key。');
  }
  if (!provider.defaultChatModelId) {
    throw new Error('请先填写或选择模型 ID。');
  }
  const fingerprint = buildProviderVerifyFingerprint({
    keyUpdatedAt: provider.keyUpdatedAt,
    modelId: provider.defaultChatModelId,
    normalizedBaseUrl: normalizeBaseUrl(provider.baseUrl ?? ''),
    providerId: provider.id,
  });
  const timeout = withTimeoutSignal(15000);
  try {
    await adapterForProtocol(provider.protocol).verifyChatCompletion({
      apiKey,
      baseUrl: provider.baseUrl ?? '',
      modelId: provider.defaultChatModelId,
      signal: timeout.signal,
    });
    const now = createTimestamp();
    await runWithDatabaseSpace(space, (db) =>
      aiProviderRepository.updateProviderVerification(db, provider.id, {
        lastVerifiedAt: now,
        lastVerifyMessage: '测试通过',
        lastVerifyStatus: 'ready',
        verifyFingerprint: fingerprint,
      })
    );
    await recordSuccessfulProviderModel(space, provider.id, provider.defaultChatModelId);
  } catch (error) {
    const reason = classifyAiProviderError({ error, fallbackKind: 'unknown' });
    const message = toUserProviderErrorMessage(reason);
    await runWithDatabaseSpace(space, (db) =>
      aiProviderRepository.updateProviderVerification(db, provider.id, {
        lastVerifiedAt: null,
        lastVerifyMessage: message,
        lastVerifyStatus: 'failed',
        verifyFingerprint: fingerprint,
      })
    );
    throw new Error(message);
  } finally {
    timeout.cancel();
  }
}

export async function syncProviderModels(providerId: string, space: PixorySpace = 'normal'): Promise<{ fallback: number; message?: string; synced: number }> {
  const provider = await runWithDatabaseSpace(space, (db) => aiProviderRepository.findProviderById(db, providerId));
  if (!provider) {
    throw new Error('AI provider is not configured.');
  }
  const apiKey = await getProviderApiKeyForSpace(space, providerId);
  const fallbackModels = builtInModelsForProvider(provider.id, provider.providerType);
  if (!apiKey) {
    await runWithDatabaseSpace(space, (db) => aiProviderRepository.upsertModels(db, provider.id, fallbackModels));
    return { synced: 0, fallback: fallbackModels.length };
  }

  try {
    const timeout = withTimeoutSignal(8000);
    let modelIds: string[];
    try {
      modelIds = await adapterForProtocol(provider.protocol).listModels({
        apiKey,
        baseUrl: provider.baseUrl ?? '',
        signal: timeout.signal,
      });
    } finally {
      timeout.cancel();
    }
    const syncedModels = modelIds.map((modelId) => syncedModelRecord(provider, modelId));
    await runWithDatabaseSpace(space, (db) =>
      aiProviderRepository.upsertModels(db, provider.id, syncedModels.length > 0 ? syncedModels : fallbackModels)
    );
    return { synced: syncedModels.length, fallback: syncedModels.length > 0 ? 0 : fallbackModels.length };
  } catch (error) {
    const reason = classifyAiProviderError({ error, fallbackKind: 'unknown' });
    const message = toUserProviderErrorMessage(reason);
    await runWithDatabaseSpace(space, (db) => aiProviderRepository.upsertModels(db, provider.id, fallbackModels));
    return { synced: 0, fallback: fallbackModels.length, message };
  }
}

export async function listProviderCards(space: PixorySpace): Promise<
  Array<{ provider: AiProviderRecord; hasApiKey: boolean; models: AiProviderModelRecord[] }>
> {
  await ensureBuiltInProviders(space);
  return runWithDatabaseSpace(space, async (db) => {
    const providers = await aiProviderRepository.listProviders(db);
    return Promise.all(
      providers.map(async (provider) => ({
        provider: { ...provider, lastVerifyStatus: providerVerifyStatus(provider) },
        hasApiKey: await hasProviderApiKeyForSpace(space, provider.id),
        models: await aiProviderRepository.listModels(db, provider.id),
      }))
    );
  });
}

export function getAdapterForProvider(provider: AiProviderRecord): AiProviderAdapter {
  return adapterForProtocol(provider.protocol);
}
