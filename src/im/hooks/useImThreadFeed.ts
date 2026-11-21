import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { InteractionManager } from 'react-native';
import type { PixorySpace } from '../../database';
import type { ImThreadListItem } from '../types';
import {
  listImThreads,
  getOrCreateImThread,
  setImThreadPinned,
  setImThreadFolded,
  setImThreadHidden,
  clearImThreadHistory,
  markImThreadRead,
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
  markRead: (thread: ImThreadListItem) => Promise<void>;
  markBatchRead: (threads: ImThreadListItem[]) => Promise<void>;
}

export function useImThreadFeed(
  space: PixorySpace,
  refreshTrigger?: number,
  enabled = true
): UseImThreadFeedResult {
  const [threads, setThreads] = useState<ImThreadListItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(enabled);
  const spaceRef = useRef(space);

  useEffect(() => {
    if (spaceRef.current !== space) {
      spaceRef.current = space;
      setThreads([]);
      setInitialLoading(enabled);
    }
  }, [enabled, space]);

  const fetchThreads = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const requestSpace = space;
    try {
      const items = await listImThreads(requestSpace, { onlyChatted: true });
      if (spaceRef.current === requestSpace) {
        setThreads(items);
      }
    } catch (err) {
      console.warn('[useImThreadFeed] listImThreads failed:', err);
    } finally {
      if (spaceRef.current === requestSpace) {
        setInitialLoading(false);
      }
    }
  }, [enabled, space]);

  useEffect(() => {
    if (!enabled) {
      setInitialLoading(false);
      return;
    }
    const interaction = InteractionManager.runAfterInteractions(() => {
      void fetchThreads();
    });
    return () => {
      interaction.cancel();
    };
  }, [enabled, fetchThreads, refreshTrigger]);

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

  const markRead = useCallback(
    async (thread: ImThreadListItem) => {
      // 乐观更新未读计数为 0
      setThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, unreadCount: 0 } : t))
      );
      try {
        const realId = await resolveRealThreadId(thread);
        await markImThreadRead(space, realId);
      } catch (err) {
        console.warn('[useImThreadFeed] markRead failed:', err);
        await fetchThreads();
      }
    },
    [fetchThreads, resolveRealThreadId, space]
  );

  const markBatchRead = useCallback(
    async (targetThreads: ImThreadListItem[]) => {
      const targetIds = new Set(targetThreads.map((t) => t.id));
      setThreads((prev) =>
        prev.map((t) => (targetIds.has(t.id) ? { ...t, unreadCount: 0 } : t))
      );
      try {
        for (const thread of targetThreads) {
          const realId = await resolveRealThreadId(thread);
          await markImThreadRead(space, realId);
        }
      } catch (err) {
        console.warn('[useImThreadFeed] markBatchRead failed:', err);
        await fetchThreads();
      }
    },
    [fetchThreads, resolveRealThreadId, space]
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
    markRead,
    markBatchRead,
  };
}
