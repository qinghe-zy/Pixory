import * as SecureStore from 'expo-secure-store';

import type { PixorySpace } from '../database';
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

function secureStoreKeyForThreadProvider(space: PixorySpace, threadId: string, providerId: string): string {
  return `pixory.ai.threadProviderKey.${space}.${threadId}.${providerId}`;
}

export function threadProviderApiKeyRef(space: PixorySpace, threadId: string, providerId: string): string {
  return `${space}:${threadId}:${providerId}`;
}

export async function setThreadProviderApiKey(
  space: PixorySpace,
  threadId: string,
  providerId: string,
  apiKey: string
): Promise<string | null> {
  const trimmed = apiKey.trim();
  const key = secureStoreKeyForThreadProvider(space, threadId, providerId);
  if (!trimmed) {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
  await SecureStore.setItemAsync(key, trimmed);
  return threadProviderApiKeyRef(space, threadId, providerId);
}

export async function getThreadProviderApiKey(
  space: PixorySpace,
  threadId: string,
  providerId: string
): Promise<string | null> {
  return SecureStore.getItemAsync(secureStoreKeyForThreadProvider(space, threadId, providerId));
}

export async function deleteThreadProviderApiKey(
  space: PixorySpace,
  threadId: string,
  providerId: string
): Promise<void> {
  await SecureStore.deleteItemAsync(secureStoreKeyForThreadProvider(space, threadId, providerId));
}

export async function hasThreadProviderApiKey(
  space: PixorySpace,
  threadId: string,
  providerId: string
): Promise<boolean> {
  return Boolean(await getThreadProviderApiKey(space, threadId, providerId));
}
