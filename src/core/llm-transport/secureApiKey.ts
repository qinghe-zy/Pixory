import * as SecureStore from 'expo-secure-store';
import { initDatabase, type PixorySpace } from '../../database/index';

export interface ActiveProviderConfig {
  providerId: string;
  modelId: string;
  baseUrl: string;
  apiKey: string | null;
}

export async function readProviderApiKey(
  space: PixorySpace,
  providerId: string
): Promise<string | null> {
  const candidateKeys = [
    `pixory.ai.provider.${space}.${providerId}.apiKey`,
    `pixory.ai.provider.${providerId}.apiKey`,
    `pixory_ai_provider_key_${space}_${providerId}`,
    `pixory_ai_provider_key_${providerId}`,
  ];
  for (const k of candidateKeys) {
    try {
      const val = await SecureStore.getItemAsync(k);
      if (val && val.trim()) return val.trim();
    } catch {}
  }
  return null;
}

export async function getActiveProviderConfig(
  space: PixorySpace,
  preferredProviderId?: string | null,
  preferredModelId?: string | null
): Promise<ActiveProviderConfig | null> {
  const db = await initDatabase(space);

  let providerRow: {
    id: string;
    baseUrl: string;
    defaultChatModelId: string | null;
  } | null = null;

  // 1. 若配置了专属 Provider，优先直连
  if (preferredProviderId) {
    providerRow = await db.getFirstAsync<{
      id: string;
      baseUrl: string;
      defaultChatModelId: string | null;
    }>(
      `SELECT id, baseUrl, defaultChatModelId
       FROM ai_providers
       WHERE id = ?
       LIMIT 1;`,
      [preferredProviderId]
    );
  }

  // 2. 否则查询激活且支持 chat 的首选 Provider
  if (!providerRow) {
    providerRow = await db.getFirstAsync<{
      id: string;
      baseUrl: string;
      defaultChatModelId: string | null;
    }>(
      `SELECT id, baseUrl, defaultChatModelId
       FROM ai_providers
       WHERE chatEnabled = 1
       ORDER BY (lastVerifiedAt IS NOT NULL) DESC, createdAt ASC
       LIMIT 1`
    );
  }

  if (!providerRow) {
    return null;
  }

  // 3. 模型解析：优先使用传入的 preferredModelId，其次 defaultChatModelId，再其次查询该 Provider 支持 chat 的模型
  let modelId = preferredModelId || providerRow.defaultChatModelId;
  if (!modelId) {
    const modelRow = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM ai_models WHERE providerId = ? AND chatEnabled = 1 LIMIT 1',
      providerRow.id
    );
    modelId = modelRow?.id || 'deepseek-chat';
  }

  // 4. 读取密钥（全兼容各种命名规范）
  const apiKey = await readProviderApiKey(space, providerRow.id);

  return {
    providerId: providerRow.id,
    modelId,
    baseUrl: providerRow.baseUrl,
    apiKey,
  };
}
