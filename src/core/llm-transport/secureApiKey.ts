import * as SecureStore from 'expo-secure-store';
import { initDatabase, type PixorySpace } from '../../database/index';
import { settingsRepository } from '../../database/repositories/settingsRepository';

export interface ActiveProviderConfig {
  providerId: string;
  modelId: string;
  baseUrl: string;
  protocol: 'openai_compatible' | 'gemini' | 'anthropic';
  apiKey: string | null;
  promptCacheEnabled: boolean;
}

export interface MemoryModelConfig extends ActiveProviderConfig {
  mode: 'custom' | 'deepseek_flash' | 'follow_chat' | 'auto';
  isSameAsChatModel: boolean;
}

export function normalizeProviderModelId(
  modelId: string | null | undefined,
  baseUrl?: string | null
): string {
  const trimmed = modelId?.trim();
  if (!trimmed) return 'deepseek-v4-flash';

  const isDeepSeekEndpoint = Boolean(
    baseUrl && (baseUrl.includes('api.deepseek.com') || baseUrl.toLowerCase().includes('deepseek'))
  );

  if (isDeepSeekEndpoint && (trimmed === 'deepseek-chat' || trimmed === 'deepseek-reasoner')) {
    return 'deepseek-v4-flash';
  }

  return trimmed;
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
  const cacheSettings = await settingsRepository.getAiPromptCacheSettings(db).catch(() => ({
    enabled: true,
    disabledProviderIds: [] as string[],
  }));

  type ProviderRow = {
    id: string;
    baseUrl: string;
    protocol: string;
    defaultChatModelId: string | null;
  };

  let chosenRow: ProviderRow | null = null;
  let chosenApiKey: string | null = null;

  // 1. 若配置了专属 Provider，优先尝试直连并读取 Key
  if (preferredProviderId) {
    const candidate = await db.getFirstAsync<ProviderRow>(
      `SELECT id, baseUrl, protocol, defaultChatModelId
       FROM ai_providers
       WHERE id = ?
       LIMIT 1;`,
      [preferredProviderId]
    );
    if (candidate) {
      const key = await readProviderApiKey(space, candidate.id);
      if (key) {
        chosenRow = candidate;
        chosenApiKey = key;
      } else {
        // 暂存为备选
        chosenRow = candidate;
      }
    }
  }

  // 2. 若专属 Provider 未配 Key，尝试查找设置中的全局默认 Provider
  if (!chosenApiKey) {
    try {
      const defaultProviderId = await settingsRepository.getDefaultAiProviderId(db);
      if (defaultProviderId && defaultProviderId !== preferredProviderId) {
        const candidate = await db.getFirstAsync<ProviderRow>(
          `SELECT id, baseUrl, protocol, defaultChatModelId
           FROM ai_providers
           WHERE id = ? AND chatEnabled = 1
           LIMIT 1;`,
          [defaultProviderId]
        );
        if (candidate) {
          const key = await readProviderApiKey(space, candidate.id);
          if (key) {
            chosenRow = candidate;
            chosenApiKey = key;
          }
        }
      }
    } catch {}
  }

  // 3. 若仍无可用 Key，扫描所有已激活且支持 chat 的 Provider，选出第一个拥有有效 API Key 的服务商
  if (!chosenApiKey) {
    const activeProviders = await db.getAllAsync<ProviderRow>(
      `SELECT id, baseUrl, protocol, defaultChatModelId
       FROM ai_providers
       WHERE chatEnabled = 1
       ORDER BY (lastVerifiedAt IS NOT NULL) DESC, createdAt ASC`
    );

    for (const row of activeProviders) {
      const key = await readProviderApiKey(space, row.id);
      if (key) {
        chosenRow = row;
        chosenApiKey = key;
        break;
      }
    }

    // 4. 若所有 Provider 均未配 Key，且前面未获得任何 row，则取第一个 row 作为无 Key 占位
    if (!chosenRow && activeProviders.length > 0) {
      chosenRow = activeProviders[0];
    }
  }

  if (!chosenRow) {
    return null;
  }

  // 5. 模型解析：优先使用传入的 preferredModelId，其次 defaultChatModelId，再其次查询该 Provider 支持 chat 的模型
  let rawModelId = preferredModelId || chosenRow.defaultChatModelId;
  if (!rawModelId) {
    const modelRow = await db.getFirstAsync<{ modelId: string }>(
      'SELECT modelId FROM ai_provider_models WHERE providerId = ? AND supportsChat = 1 LIMIT 1',
      chosenRow.id
    );
    rawModelId = modelRow?.modelId || 'deepseek-v4-flash';
  }

  const modelId = normalizeProviderModelId(rawModelId, chosenRow.baseUrl);

  // 6. 确定最终 apiKey
  const apiKey = chosenApiKey || (await readProviderApiKey(space, chosenRow.id));

  const protocol = (
    chosenRow.protocol === 'gemini' || chosenRow.protocol === 'anthropic'
      ? chosenRow.protocol
      : 'openai_compatible'
  ) as 'openai_compatible' | 'gemini' | 'anthropic';

  const promptCacheEnabled = Boolean(
    cacheSettings.enabled && !cacheSettings.disabledProviderIds.includes(chosenRow.id)
  );

  return {
    providerId: chosenRow.id,
    modelId,
    baseUrl: chosenRow.baseUrl,
    protocol,
    apiKey,
    promptCacheEnabled,
  };
}

export async function getMemoryModelProviderConfig(
  space: PixorySpace,
  chatProviderId?: string | null,
  chatModelId?: string | null
): Promise<MemoryModelConfig | null> {
  const db = await initDatabase(space);
  const settings = await settingsRepository.getMemoryMaintenanceSettings(db).catch(() => null);
  const mode = settings?.memoryMaintenanceMode || 'auto';

  // 辅助获取当前聊天兜底配置
  const resolveChatFallback = async (): Promise<MemoryModelConfig | null> => {
    const chatCfg = await getActiveProviderConfig(space, chatProviderId, chatModelId);
    if (!chatCfg) return null;
    return {
      ...chatCfg,
      mode: 'follow_chat',
      isSameAsChatModel: true,
    };
  };

  // 1. 自定义模式
  if (mode === 'custom' && settings?.memoryMaintenanceProviderId) {
    const customCfg = await getActiveProviderConfig(
      space,
      settings.memoryMaintenanceProviderId,
      settings.memoryMaintenanceModelId
    );
    if (customCfg && customCfg.apiKey) {
      const isSameAsChat =
        Boolean(chatProviderId && chatProviderId === customCfg.providerId) &&
        Boolean(chatModelId && chatModelId === customCfg.modelId);
      return {
        ...customCfg,
        mode: 'custom',
        isSameAsChatModel: isSameAsChat,
      };
    }
  }

  // 2. 深度优选 Flash (deepseek_flash)
  if (mode === 'deepseek_flash') {
    const dsCfg = await getActiveProviderConfig(space, 'deepseek', 'deepseek-v4-flash');
    if (dsCfg && dsCfg.apiKey) {
      const isSameAsChat =
        Boolean(chatProviderId && chatProviderId === dsCfg.providerId) &&
        Boolean(chatModelId && chatModelId === dsCfg.modelId);
      return {
        ...dsCfg,
        mode: 'deepseek_flash',
        isSameAsChatModel: isSameAsChat,
      };
    }
  }

  // 3. 跟随聊天模型 (follow_chat)
  if (mode === 'follow_chat') {
    return resolveChatFallback();
  }

  // 4. 自动模式 (auto)
  // 优先探测 deepseek Flash 是否具备 Key
  const dsCandidate = await getActiveProviderConfig(space, 'deepseek', 'deepseek-v4-flash');
  if (dsCandidate && dsCandidate.apiKey) {
    const isSameAsChat =
      Boolean(chatProviderId && chatProviderId === dsCandidate.providerId) &&
      Boolean(chatModelId && chatModelId === dsCandidate.modelId);
    return {
      ...dsCandidate,
      mode: 'auto',
      isSameAsChatModel: isSameAsChat,
    };
  }

  // 最终安全回退到聊天模型
  const fallback = await resolveChatFallback();
  if (fallback) {
    return {
      ...fallback,
      mode: 'auto',
      isSameAsChatModel: true,
    };
  }

  return null;
}
