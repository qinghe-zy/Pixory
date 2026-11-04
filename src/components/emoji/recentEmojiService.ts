/**
 * 独立解耦最近使用表情 LRU 算法与存储服务 (Emoji Recent LRU Service)
 *
 * 核心指标：
 * 1. 严格容纳 14 个表情项（对应 2 行 × 7 列栅格）；
 * 2. 动静统一记录，最近使用无论为动态还是静态，一律提升置顶；
 * 3. 超过 14 个时按 LRU 策略淘汰末尾最久未使用的项；
 * 4. 本地持久化保存与快速内存读写。
 */

import * as SecureStore from 'expo-secure-store';
import type { AnyEmojiItem, AnimatedEmojiItem, StaticEmojiItem } from './types';
import { ANIMATED_EMOJIS, STATIC_EMOJIS } from './emojiCatalog';

const RECENT_STORAGE_KEY = 'pixory_recent_emojis_lru_v2';
export const MAX_RECENT_COUNT = 14;

let memoryCache: AnyEmojiItem[] | null = null;
let isHydrated = false;

// O(1) 索引映射表，避免高频数组遍历 (js-index-maps)
const ANIMATED_MAP = new Map<string, AnyEmojiItem>(ANIMATED_EMOJIS.map((a) => [a.id, a]));
const STATIC_MAP = new Map<string, AnyEmojiItem>(STATIC_EMOJIS.map((s) => [s.id, s]));

interface SerializedRecentItem {
  id: string;
  type: string;
  name?: string;
  animatedUri?: string;
  char?: string;
  width?: number;
  height?: number;
}

function serializeItem(item: AnyEmojiItem): SerializedRecentItem {
  if (item.type === 'animated') {
    const anim = item as AnimatedEmojiItem;
    return {
      id: anim.id,
      type: anim.type,
      name: anim.name,
      animatedUri: anim.animatedUri,
      width: anim.width,
      height: anim.height,
    };
  }
  if (item.type === 'static') {
    const stat = item as StaticEmojiItem;
    return {
      id: stat.id,
      type: stat.type,
      name: stat.name,
      char: stat.char,
    };
  }
  return { id: item.id, type: item.type, name: item.name };
}

function deserializeItem(raw: SerializedRecentItem): AnyEmojiItem | null {
  if (raw.type === 'animated') {
    const builtin = ANIMATED_MAP.get(raw.id);
    if (builtin) return builtin;
    // 自定义/导入动态表情水合恢复
    if (raw.animatedUri) {
      return {
        id: raw.id,
        type: 'animated',
        name: raw.name || '表情',
        animatedUri: raw.animatedUri,
        width: raw.width || 140,
        height: raw.height || 140,
      } as AnimatedEmojiItem;
    }
    return null;
  }
  if (raw.type === 'static') {
    const builtin = STATIC_MAP.get(raw.id);
    if (builtin) return builtin;
    if (raw.char) {
      return {
        id: raw.id,
        type: 'static',
        name: raw.name || raw.char,
        char: raw.char,
      } as StaticEmojiItem;
    }
    return null;
  }
  return null;
}

export const EmojiRecentService = {
  /**
   * 获取最近使用的 14 个表情（支持内存缓存与本地冷启动水合）
   */
  async getRecentEmojis(): Promise<AnyEmojiItem[]> {
    if (isHydrated && memoryCache) {
      return memoryCache;
    }

    try {
      const stored = await SecureStore.getItemAsync(RECENT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { id: string; type: string }[];
        const restored: AnyEmojiItem[] = [];
        for (const item of parsed) {
          const match = deserializeItem(item);
          if (match && !restored.some((r) => r.id === match.id)) {
            restored.push(match);
          }
        }
        // 实事求是：真实发送了几个就展示几个，最多 14 个 (2 行)，绝不用假数据强行填满
        memoryCache = restored.slice(0, MAX_RECENT_COUNT);
        isHydrated = true;
        return memoryCache;
      }
    } catch {
      // 容错保护
    }

    // 初始状态下未发过任何表情，返回空列表，完全不渲染最近使用
    memoryCache = [];
    isHydrated = true;
    return memoryCache;
  },

  /**
   * 记录使用表情（LRU 置顶并淘汰末尾）
   */
  async recordRecent(item: AnyEmojiItem): Promise<AnyEmojiItem[]> {
    const current = await this.getRecentEmojis();
    // 过滤掉已有项（若存在则置顶）
    const filtered = current.filter((r) => r.id !== item.id);
    const updated = [item, ...filtered].slice(0, MAX_RECENT_COUNT);

    memoryCache = updated;

    try {
      const serialized = updated.map(serializeItem);
      await SecureStore.setItemAsync(RECENT_STORAGE_KEY, JSON.stringify(serialized));
    } catch {
      // 容错保护
    }

    return updated;
  },

  /**
   * 清空最近使用
   */
  async resetRecent(): Promise<AnyEmojiItem[]> {
    memoryCache = [];
    try {
      await SecureStore.deleteItemAsync(RECENT_STORAGE_KEY);
    } catch {}
    return memoryCache;
  },
};
