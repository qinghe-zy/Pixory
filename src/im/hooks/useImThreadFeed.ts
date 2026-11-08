import { useState, useCallback, useEffect, useMemo } from 'react';
import type { PixorySpace } from '../../database';
import type { ImThreadListItem } from '../types';
import {
  listImThreads,
  getOrCreateImThread,
  setImThreadPinned,
  setImThreadFolded,
  setImThreadHidden,
  clearImThreadHistory,
} from '../repository/imThreadRepository';
import { buildImThreadFeed, type ImFeedResult } from '../utils/buildImThreadFeed';

export interface UseImThreadFeedResult extends ImFeedResult {
  threads: ImThreadListItem[];
  initialLoading: boolean;
  refresh: () => Promise<void>;
  togglePin: (thread: ImThreadListItem) => Promise<void>;
  toggleFold: (thread: ImThreadListItem) => Promise<void>;
  hideFromList: (thread: ImThreadListItem) => Promise<void>;
  clearHistory: (thread: ImThreadListItem) => Promise<void>;
}

export function useImThreadFeed(
  space: PixorySpace,
  refreshTrigger?: number
): UseImThreadFeedResult {
  const [threads, setThreads] = useState<ImThreadListItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchThreads = useCallback(async () => {
    try {
      const items = await listImThreads(space, { onlyChatted: true });
      setThreads(items);
    } catch (err) {
      console.warn('[useImThreadFeed] listImThreads failed:', err);
    } finally {
      setInitialLoading(false);
    }
  }, [space]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads, refreshTrigger]);

  const { displayItems, foldedList } = useMemo(() => {
    return buildImThreadFeed(threads);
  }, [threads]);

  // 辅助函数：确保 contact- 占位行先落库创建真实实体
  const resolveRealThreadId = useCallback(
    async (thread: ImThreadListItem): Promise<string> => {
      if (thread.id.startsWith('contact-')) {
        const created = await getOrCreateImThread(space, thread.roleCardId, {
          defaultTitle: thread.title,
        });
        return created.id;
      }
      return thread.id;
    },
    [space]
  );

  const togglePin = useCallback(
    async (thread: ImThreadListItem) => {
      const targetPinned = !thread.isPinned;
      // 乐观更新
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, isPinned: targetPinned } : t))
      );
      try {
        const realId = await resolveRealThreadId(thread);
        await setImThreadPinned(space, realId, targetPinned);
        await fetchThreads();
      } catch (err) {
        console.warn('[useImThreadFeed] togglePin failed, rolling back:', err);
        await fetchThreads();
      }
    },
    [fetchThreads, resolveRealThreadId, space]
  );

  const toggleFold = useCallback(
    async (thread: ImThreadListItem) => {
      const targetFolded = !thread.isFolded;
      // 乐观更新：即刻在本地状态中生效，折叠列表与主列表同步即刻刷新！
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, isFolded: targetFolded } : t))
      );
      try {
        const realId = await resolveRealThreadId(thread);
        await setImThreadFolded(space, realId, targetFolded);
        await fetchThreads();
      } catch (err) {
        console.warn('[useImThreadFeed] toggleFold failed, rolling back:', err);
        await fetchThreads();
      }
    },
    [fetchThreads, resolveRealThreadId, space]
  );

  const hideFromList = useCallback(
    async (thread: ImThreadListItem) => {
      // 乐观更新：从列表立即隐藏
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, isHiddenFromList: true } : t))
      );
      try {
        const realId = await resolveRealThreadId(thread);
        await setImThreadHidden(space, realId, true);
        await fetchThreads();
      } catch (err) {
        console.warn('[useImThreadFeed] hideFromList failed, rolling back:', err);
        await fetchThreads();
      }
    },
    [fetchThreads, resolveRealThreadId, space]
  );

  const clearHistory = useCallback(
    async (thread: ImThreadListItem) => {
      // 乐观清空预览与未读
      setThreads((prev) =>
        prev.map((t) =>
          t.id === thread.id
            ? { ...t, lastMessagePreview: null, unreadCount: 0 }
            : t
        )
      );
      try {
        if (!thread.id.startsWith('contact-')) {
          await clearImThreadHistory(space, thread.id);
        }
        await fetchThreads();
      } catch (err) {
        console.warn('[useImThreadFeed] clearHistory failed, rolling back:', err);
        await fetchThreads();
      }
    },
    [fetchThreads, space]
  );

  return {
    threads,
    displayItems,
    foldedList,
    initialLoading,
    refresh: fetchThreads,
    togglePin,
    toggleFold,
    hideFromList,
    clearHistory,
  };
}
