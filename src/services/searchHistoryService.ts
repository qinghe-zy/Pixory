import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

import type { PixorySpace } from '../database';

export interface SearchHistoryItem {
  id: string;
  keyword: string;
  timestamp: number;
}

const MAX_SEARCH_HISTORY_ITEMS = 2000;

function getHistoryFileUri(space: PixorySpace) {
  return `${FileSystem.documentDirectory}pixory_global_search_history_${space}.json`;
}

function normalizeHistoryItem(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export async function loadSearchHistory(space: PixorySpace): Promise<SearchHistoryItem[]> {
  const uri = getHistoryFileUri(space);
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      return [];
    }
    const rawValue = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Migrate old format (string[]) to new format (object[])
    return parsed
      .map((item) => {
        if (typeof item === 'string') {
          return {
            id: Crypto.randomUUID(),
            keyword: item,
            timestamp: Date.now(),
          };
        }
        return item as SearchHistoryItem;
      })
      .filter((item) => Boolean(item && typeof item.keyword === 'string' && item.keyword.trim()))
      .slice(0, MAX_SEARCH_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

async function saveSearchHistory(space: PixorySpace, items: SearchHistoryItem[]): Promise<void> {
  const uri = getHistoryFileUri(space);
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(items));
}

export async function addSearchHistoryItem(space: PixorySpace, value: string): Promise<SearchHistoryItem[]> {
  const normalized = normalizeHistoryItem(value);
  if (!normalized) {
    return loadSearchHistory(space);
  }

  const current = await loadSearchHistory(space);
  // Remove existing duplicates
  const filtered = current.filter((item) => item.keyword !== normalized);
  
  const newItem: SearchHistoryItem = {
    id: Crypto.randomUUID(),
    keyword: normalized,
    timestamp: Date.now(),
  };

  const next = [newItem, ...filtered].slice(0, MAX_SEARCH_HISTORY_ITEMS);
  await saveSearchHistory(space, next);
  return next;
}

export async function removeSearchHistoryItem(space: PixorySpace, id: string): Promise<SearchHistoryItem[]> {
  const current = await loadSearchHistory(space);
  const next = current.filter((item) => item.id !== id);
  await saveSearchHistory(space, next);
  return next;
}

export async function clearSearchHistory(space: PixorySpace): Promise<void> {
  const uri = getHistoryFileUri(space);
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(uri);
    }
  } catch {
    // Ignore errors
  }
}

export async function batchDeleteSearchHistory(space: PixorySpace, ids: string[]): Promise<SearchHistoryItem[]> {
  const current = await loadSearchHistory(space);
  const idSet = new Set(ids);
  const next = current.filter((item) => !idSet.has(item.id));
  await saveSearchHistory(space, next);
  return next;
}

export async function deleteSearchHistoryByTimeRange(space: PixorySpace, startMs: number, endMs: number): Promise<SearchHistoryItem[]> {
  const current = await loadSearchHistory(space);
  const next = current.filter((item) => item.timestamp < startMs || item.timestamp > endMs);
  await saveSearchHistory(space, next);
  return next;
}
