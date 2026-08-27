import { InteractionManager } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createPagedRequestGate } from './pagedRequestGate';

export interface PagedLoadResult<TItem, TMeta> {
  items: TItem[];
  hasMore: boolean;
  meta?: TMeta;
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
}

const pagedScreenCache = new Map<string, PagedScreenData<any, any>>();

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
  const cached = pagedScreenCache.get(options.requestKey) as PagedScreenData<TItem, TMeta> | undefined;
  const [data, setData] = useState<PagedScreenData<TItem, TMeta>>(
    cached || {
    requestKey: options.requestKey,
    items: [],
    hasMore: false,
    meta: options.initialMeta,
  });
  const dataRef = useRef(data);
  const [isLoading, setIsLoading] = useState(!cached);
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
    const currentCached = pagedScreenCache.get(options.requestKey) as PagedScreenData<TItem, TMeta> | undefined;
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

    const run = async () => {
      try {
        const next = optionsRef.current.deferUntilInteractions
          ? await new Promise<PagedLoadResult<TItem, TMeta>>((resolve, reject) => {
              InteractionManager.runAfterInteractions(() => {
                loaderRef.current(0, optionsRef.current.initialMeta).then(resolve).catch(reject);
              });
            })
          : await loaderRef.current(0, optionsRef.current.initialMeta);
        if (!isMountedRef.current || !gate.isCurrent(request)) {
          return;
        }
        const nextData = {
          requestKey: request.requestKey,
          items: next.items,
          hasMore: next.hasMore,
          meta: next.meta ?? optionsRef.current.initialMeta,
        };
        dataRef.current = nextData;
        pagedScreenCache.set(request.requestKey, nextData);
        setData(nextData);
      } catch (error) {
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
    return () => gate.invalidate();
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
          pagedScreenCache.set(request.requestKey, merged);
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
    isLoading: isCurrentRequest ? isLoading : true,
    isLoadingMore: isCurrentRequest ? isLoadingMore : false,
    errorMessage: isCurrentRequest ? errorMessage : null,
    loadMore,
    reload,
    setData,
  };
}
