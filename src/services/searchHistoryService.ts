import * as SecureStore from 'expo-secure-store';

import type { PixorySpace } from '../database';

const SEARCH_HISTORY_KEY_PREFIX = 'pixory:global-search-history';
const MAX_SEARCH_HISTORY_ITEMS = 10;

function getSearchHistoryKey(space: PixorySpace) {
  return `${SEARCH_HISTORY_KEY_PREFIX}:${space}`;
}

function normalizeHistoryItem(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export async function loadSearchHistory(space: PixorySpace): Promise<string[]> {
  const rawValue = await SecureStore.getItemAsync(getSearchHistoryKey(space));
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, MAX_SEARCH_HISTORY_ITEMS)
      : [];
  } catch {
    return [];
  }
}

export async function addSearchHistoryItem(space: PixorySpace, value: string): Promise<string[]> {
  const normalized = normalizeHistoryItem(value);
  if (!normalized) {
    return loadSearchHistory(space);
  }

  const current = await loadSearchHistory(space);
  const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, MAX_SEARCH_HISTORY_ITEMS);
  await SecureStore.setItemAsync(getSearchHistoryKey(space), JSON.stringify(next));
  return next;
}

export async function removeSearchHistoryItem(space: PixorySpace, value: string): Promise<string[]> {
  const normalized = normalizeHistoryItem(value);
  const next = (await loadSearchHistory(space)).filter((item) => item !== normalized);
  await SecureStore.setItemAsync(getSearchHistoryKey(space), JSON.stringify(next));
  return next;
}

export async function clearSearchHistory(space: PixorySpace): Promise<void> {
  await SecureStore.deleteItemAsync(getSearchHistoryKey(space));
}
