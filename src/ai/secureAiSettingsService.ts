import * as SecureStore from 'expo-secure-store';

import { secureStoreKeyForProvider } from './aiConstants';

export async function setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    await deleteProviderApiKey(providerId);
    return;
  }
  await SecureStore.setItemAsync(secureStoreKeyForProvider(providerId), trimmed);
}

export async function getProviderApiKey(providerId: string): Promise<string | null> {
  return SecureStore.getItemAsync(secureStoreKeyForProvider(providerId));
}

export async function deleteProviderApiKey(providerId: string): Promise<void> {
  await SecureStore.deleteItemAsync(secureStoreKeyForProvider(providerId));
}

export async function hasProviderApiKey(providerId: string): Promise<boolean> {
  return Boolean(await getProviderApiKey(providerId));
}
