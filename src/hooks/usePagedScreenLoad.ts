import { InteractionManager } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createPagedRequestGate } from './pagedRequestGate';

export interface PagedLoadResult<TItem, TMeta> {
  items: TItem[];
  hasMore: boolean;
  meta?: TMeta;
  totalCount?: number;
}

interface UsePagedScreenLoadOptions<TItem, TMeta> {
  requestKey: string;
  initialMeta: TMeta;
  getItemKey: (item: TItem) => string | number;
  formatError?: (error: unknown) => string;
  onLoadMoreError?: (error: unknown) => void;
  deferUntilInteractions?: boolean;
}

interface PagedScreenData<TItem, TMeta> {
  requestKey: string;
  items: TItem[];
  hasMore: boolean;
  meta: TMeta;
  totalCount?: number;
}

const MAX_PAGED_SCREEN_CACHE_ENTRIES = 24;
const pagedScreenCache = new Map<string, PagedScreenData<unknown, unknown>>();

function peekPagedScreenCacheEntry<TItem, TMeta>(key: string): PagedScreenData<TItem, TMeta> | undefined {
  return pagedScreenCache.get(key) as PagedScreenData<TItem, TMeta> | undefined;
}

function touchPagedScreenCacheEntry(key: string): void {
  const entry = pagedScreenCache.get(key);
  if (entry !== undefined) {
    pagedScreenCache.delete(key);
    pagedScreenCache.set(key, entry);
  }
}

function getPagedScreenCacheEntry<TItem, TMeta>(key: string): PagedScreenData<TItem, TMeta> | undefined {
  const entry = peekPagedScreenCacheEntry<TItem, TMeta>(key);
  touchPagedScreenCacheEntry(key);
  return entry;
}

function setPagedScreenCacheEntry<TItem, TMeta>(key: string, value: PagedScreenData<TItem, TMeta>): void {
  if (pagedScreenCache.has(key)) {
    pagedScreenCache.delete(key);
  }
  pagedScreenCache.set(key, value);
  while (pagedScreenCache.size > MAX_PAGED_SCREEN_CACHE_ENTRIES) {
    const oldestKey = pagedScreenCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    pagedScreenCache.delete(oldestKey);
  }
}

export function clearPagedScreenCache(predicate?: (key: string) => boolean): void {
  if (!predicate) {
    pagedScreenCache.clear();
    return;
  }
  for (const key of Array.from(pagedScreenCache.keys())) {
    if (predicate(key)) {
      pagedScreenCache.delete(key);
    }
  }
}

export function usePagedScreenLoad<TItem, TMeta>(
  loader: (offset: number, meta: TMeta) => Promise<PagedLoadResult<TItem, TMeta>>,
  options: UsePagedScreenLoadOptions<TItem, TMeta>
) {
  const loaderRef = useRef(loader);
  const optionsRef = useRef(options);
  const gateRef = useRef(createPagedRequestGate(options.requestKey));
  const isMountedRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  // peek without LRU-touch on render; touch in effect only
  const [data, setData] = useState<PagedScreenData<TItem, TMeta>>(() => {
    const cached = peekPagedScreenCacheEntry<TItem, TMeta>(options.requestKey);
    if (cached) {
      touchPagedScreenCacheEntry(options.requestKey);
      return cached;
    }
    return {
      requestKey: options.requestKey,
      items: [],
      hasMore: false,
      meta: options.initialMeta,
    };
  });
  const dataRef = useRef(data);
  const [isLoading, setIsLoading] = useState(!peekPagedScreenCacheEntry(options.requestKey));
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  loaderRef.current = loader;
  optionsRef.current = options;
  gateRef.current.syncRequestKey(options.requestKey);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      gateRef.current.invalidate();
    };
  }, []);

  useEffect(() => {
    const gate = gateRef.current;
    gate.syncRequestKey(options.requestKey);
    const request = gate.beginRequest();
    loadingMoreRef.current = false;
    setIsLoadingMore(false);
    setIsLoading(true);
    setErrorMessage(null);
    const currentCached = getPagedScreenCacheEntry<TItem, TMeta>(options.requestKey);
    const resetData: PagedScreenData<TItem, TMeta> = currentCached || {
      requestKey: options.requestKey,
      items: [],
      hasMore: false,
      meta: optionsRef.current.initialMeta,
    };
    dataRef.current = resetData;
    setData(resetData);
    if (currentCached) {
      setIsLoading(false);
    }

    let interactionHandle: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;

    const run = async () => {
      try {
        let next: PagedLoadResult<TItem, TMeta>;
        if (optionsRef.current.deferUntilInteractions) {
          next = await new Promise<PagedLoadResult<TItem, TMeta>>((resolve, reject) => {
            interactionHandle = InteractionManager.runAfterInteractions(() => {
              if (!isMountedRef.current || !gate.isCurrent(request)) {
                reject(new Error('cancelled'));
                return;
              }
              loaderRef.current(0, optionsRef.current.initialMeta).then(resolve).catch(reject);
            });
          });
        } else {
          next = await loaderRef.current(0, optionsRef.current.initialMeta);
        }
        if (!isMountedRef.current || !gate.isCurrent(request)) {
          return;
        }
        const nextData: PagedScreenData<TItem, TMeta> = {
          requestKey: request.requestKey,
          items: next.items,
          hasMore: next.hasMore,
          meta: next.meta ?? optionsRef.current.initialMeta,
          totalCount: next.totalCount,
        };
        dataRef.current = nextData;
        setPagedScreenCacheEntry(request.requestKey, nextData);
        setData(nextData);
      } catch (error) {
        if (error instanceof Error && error.message === 'cancelled') {
          return;
        }
        if (!isMountedRef.current || !gate.isCurrent(request)) {
          return;
        }
        console.error(error);
        const formatError = optionsRef.current.formatError;
        setErrorMessage(
          formatError
            ? formatError(error)
            : error instanceof Error
              ? error.message
              : '未知错误'
        );
      } finally {
        if (isMountedRef.current && gate.isCurrent(request)) {
          setIsLoading(false);
        }
      }
    };

    void run();
    return () => {
      interactionHandle?.cancel();
      gate.invalidate();
    };
  }, [options.requestKey, reloadKey]);

  const loadMore = useCallback(() => {
    const currentOptions = optionsRef.current;
    const currentData = dataRef.current;
    if (
      loadingMoreRef.current ||
      isLoading ||
      currentData.requestKey !== currentOptions.requestKey ||
      !currentData.hasMore
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    const gate = gateRef.current;
    const request = gate.beginRequest();

    void (async () => {
      try {
        const next = await loaderRef.current(currentData.items.length, currentData.meta);
        if (!isMountedRef.current || !gate.isCurrent(request)) {
          return;
        }
        setData((latest) => {
          if (latest.requestKey !== request.requestKey) {
            return latest;
          }
          const existingKeys = new Set(latest.items.map(currentOptions.getItemKey));
          const appended = next.items.filter((item) => !existingKeys.has(currentOptions.getItemKey(item)));
          const merged = {
            ...latest,
            items: [...latest.items, ...appended],
            hasMore: next.hasMore,
            meta: next.meta ?? latest.meta,
          };
          dataRef.current = merged;
          setPagedScreenCacheEntry(request.requestKey, merged);
          return merged;
        });
      } catch (error) {
        if (isMountedRef.current && gate.isCurrent(request)) {
          currentOptions.onLoadMoreError?.(error);
        }
      } finally {
        if (isMountedRef.current && gate.isCurrent(request)) {
          loadingMoreRef.current = false;
          setIsLoadingMore(false);
        }
      }
    })();
  }, [isLoading]);

  const reload = useCallback(() => {
    gateRef.current.invalidate();
    loadingMoreRef.current = false;
    setReloadKey((current) => current + 1);
  }, []);

  const isCurrentRequest = data.requestKey === options.requestKey;
  return {
    items: isCurrentRequest ? data.items : [],
    hasMore: isCurrentRequest ? data.hasMore : false,
    meta: isCurrentRequest ? data.meta : options.initialMeta,
    totalCount: isCurrentRequest ? data.totalCount : undefined,
    isLoading: isCurrentRequest ? isLoading : true,
    isLoadingMore: isCurrentRequest ? isLoadingMore : false,
    errorMessage: isCurrentRequest ? errorMessage : null,
    loadMore,
    reload,
    setData,
  };
}
