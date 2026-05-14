import {
  aiProviderRepository,
  runWithDatabaseSpace,
  type AiProviderModelRecord,
  type AiProviderRecord,
  type PixorySpace,
} from '../database';
import { BUILT_IN_PROVIDERS } from './aiConstants';
import { builtInModelsForProvider } from './providerRegistry';
import { getProviderApiKey, hasProviderApiKey, setProviderApiKey } from './secureAiSettingsService';
import type { AiProviderAdapter } from './providers/base';
import { claudeProvider } from './providers/claudeProvider';
import { geminiProvider } from './providers/geminiProvider';
import { openAiCompatibleProvider } from './providers/openAiCompatibleProvider';
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
    protocol: preset.protocol,
    chatEnabled: preset.chatEnabled,
    embeddingEnabled: preset.embeddingEnabled,
    visionEnabled: preset.visionEnabled,
    defaultChatModelId: defaultChatModel,
    defaultEmbeddingModelId: defaultEmbeddingModel,
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

export async function saveProviderApiKey(providerId: string, apiKey: string): Promise<void> {
  await setProviderApiKey(providerId, apiKey);
}

export async function getSavedProviderApiKey(providerId: string): Promise<string | null> {
  return getProviderApiKey(providerId);
}

export async function saveProviderBaseUrl(space: PixorySpace, providerId: string, baseUrl: string | null): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiProviderRepository.updateProviderBaseUrl(db, providerId, baseUrl?.trim() || null));
}

export async function saveProviderDefaultModels(
  space: PixorySpace,
  providerId: string,
  defaults: { defaultChatModelId?: string | null; defaultEmbeddingModelId?: string | null }
): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiProviderRepository.updateProviderDefaults(db, providerId, defaults));
}

export async function selectProvider(space: PixorySpace, providerId: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiProviderRepository.updateProviderDefaults(db, providerId, {}));
}

export async function saveManualChatModel(space: PixorySpace, providerId: string, modelId: string): Promise<void> {
  const trimmedModelId = modelId.trim();
  if (!trimmedModelId) {
    throw new Error('请输入模型 ID。');
  }
  const provider = await runWithDatabaseSpace(space, (db) => aiProviderRepository.findProviderById(db, providerId));
  if (!provider) {
    throw new Error('AI provider is not configured.');
  }
  await runWithDatabaseSpace(space, async (db) => {
    await aiProviderRepository.upsertModels(db, provider.id, [manualModelRecord(provider, trimmedModelId)]);
    await aiProviderRepository.updateProviderDefaults(db, provider.id, { defaultChatModelId: trimmedModelId });
  });
}

export async function testProvider(providerId: string, space: PixorySpace = 'normal'): Promise<void> {
  const provider = await runWithDatabaseSpace(space, (db) => aiProviderRepository.findProviderById(db, providerId));
  if (!provider) {
    throw new Error('AI provider is not configured.');
  }
  const apiKey = await getProviderApiKey(providerId);
  if (!apiKey) {
    throw new Error('请先填写 API key。');
  }
  await adapterForProtocol(provider.protocol).testConnection({
    apiKey,
    baseUrl: provider.baseUrl ?? '',
  });
}

export async function syncProviderModels(providerId: string, space: PixorySpace = 'normal'): Promise<{ synced: number; fallback: number }> {
  const provider = await runWithDatabaseSpace(space, (db) => aiProviderRepository.findProviderById(db, providerId));
  if (!provider) {
    throw new Error('AI provider is not configured.');
  }
  const apiKey = await getProviderApiKey(providerId);
  const fallbackModels = builtInModelsForProvider(provider.id, provider.providerType);
  if (!apiKey) {
    await runWithDatabaseSpace(space, (db) => aiProviderRepository.upsertModels(db, provider.id, fallbackModels));
    return { synced: 0, fallback: fallbackModels.length };
  }

  try {
    const modelIds = await adapterForProtocol(provider.protocol).listModels({
      apiKey,
      baseUrl: provider.baseUrl ?? '',
    });
    const syncedModels = modelIds.map((modelId) => syncedModelRecord(provider, modelId));
    await runWithDatabaseSpace(space, (db) =>
      aiProviderRepository.upsertModels(db, provider.id, syncedModels.length > 0 ? syncedModels : fallbackModels)
    );
    return { synced: syncedModels.length, fallback: syncedModels.length > 0 ? 0 : fallbackModels.length };
  } catch {
    await runWithDatabaseSpace(space, (db) => aiProviderRepository.upsertModels(db, provider.id, fallbackModels));
    return { synced: 0, fallback: fallbackModels.length };
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
        provider,
        hasApiKey: await hasProviderApiKey(provider.id),
        models: await aiProviderRepository.listModels(db, provider.id),
      }))
    );
  });
}

export function getAdapterForProvider(provider: AiProviderRecord): AiProviderAdapter {
  return adapterForProtocol(provider.protocol);
}
