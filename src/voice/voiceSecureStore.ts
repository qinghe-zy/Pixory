import * as SecureStore from 'expo-secure-store';
import type { PixorySpace } from '../database';

function secureStoreKeyForPreset(space: PixorySpace, presetId: string): string {
  return `pixory.voice.presetKey.${space}.${presetId}`;
}

export async function setVoicePresetApiKey(space: PixorySpace, presetId: string, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  const key = secureStoreKeyForPreset(space, presetId);
  if (!trimmed) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, trimmed);

  // 若为 mimo 预设系列，同步镜像到 mimo-global 共享密匙槽
  if (presetId.startsWith('mimo-') || presetId === 'custom-openai-compat') {
    try {
      await SecureStore.setItemAsync(secureStoreKeyForPreset(space, 'mimo-global'), trimmed);
      await SecureStore.setItemAsync(`pixory.voice.globalKey.${space}`, trimmed);
    } catch {}
  }
}

export async function getVoicePresetApiKey(space: PixorySpace, presetId: string): Promise<string | null> {
  const key = secureStoreKeyForPreset(space, presetId);
  const direct = await SecureStore.getItemAsync(key);
  if (direct) return direct;

  // 若为 mimo 预设系列，联动 mimo-global 通用密匙
  if (presetId.startsWith('mimo-')) {
    const mimoKey = await SecureStore.getItemAsync(secureStoreKeyForPreset(space, 'mimo-global'));
    if (mimoKey) return mimoKey;
  }

  // 兜底检查通用自定义 API 密钥与全局密钥
  const customKey = await SecureStore.getItemAsync(secureStoreKeyForPreset(space, 'custom-openai-compat'));
  if (customKey) return customKey;

  const globalKey = await SecureStore.getItemAsync(`pixory.voice.globalKey.${space}`);
  return globalKey;
}

export async function deleteVoicePresetApiKey(space: PixorySpace, presetId: string): Promise<void> {
  const key = secureStoreKeyForPreset(space, presetId);
  await SecureStore.deleteItemAsync(key);
}

export async function hasVoicePresetApiKey(space: PixorySpace, presetId: string): Promise<boolean> {
  const key = await getVoicePresetApiKey(space, presetId);
  return Boolean(key);
}
