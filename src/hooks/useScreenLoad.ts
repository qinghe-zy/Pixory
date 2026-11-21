import { InteractionManager } from 'react-native';
import { useEffect, useRef, useState, type DependencyList } from 'react';

import { createPagedRequestGate } from './pagedRequestGate';

interface UseScreenLoadOptions<T> {
  formatError?: (error: unknown) => string;
  initialData?: T;
  deferUntilInteractions?: boolean;
  keepPreviousData?: boolean;
}

const MAX_SCREEN_DATA_CACHE_ENTRIES = 32;
const screenDataCache = new Map<string, unknown>();

function peekScreenDataCacheEntry<T>(key: string): T | undefined {
  return screenDataCache.get(key) as T | undefined;
}

function touchScreenDataCacheEntry(key: string): void {
  const entry = screenDataCache.get(key);
  if (entry !== undefined) {
    screenDataCache.delete(key);
    screenDataCache.set(key, entry);
  }
}

function setScreenDataCacheEntry<T>(key: string, value: T): void {
  if (screenDataCache.has(key)) {
    screenDataCache.delete(key);
  }
  screenDataCache.set(key, value);
  while (screenDataCache.size > MAX_SCREEN_DATA_CACHE_ENTRIES) {
    const oldestKey = screenDataCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    screenDataCache.delete(oldestKey);
  }
}

export function clearScreenLoadCache(predicate?: (key: string) => boolean): void {
  if (!predicate) {
    screenDataCache.clear();
    return;
  }
  for (const key of Array.from(screenDataCache.keys())) {
    if (predicate(key)) {
      screenDataCache.delete(key);
    }
  }
}

export function useScreenLoad<T>(
  loader: () => Promise<T>,
  deps: DependencyList,
  options?: UseScreenLoadOptions<T>
) {
  const isMountedRef = useRef(true);
  const requestGateRef = useRef(createPagedRequestGate('screen-load'));
  const loaderRef = useRef(loader);
  const formatErrorRef = useRef(options?.formatError);
  const deferUntilInteractionsRef = useRef(options?.deferUntilInteractions);
  const keepPreviousDataRef = useRef(options?.keepPreviousData);
  // Keep the current deps key in a ref so the load callback always reads the latest key.
  const cacheKeyRef = useRef(JSON.stringify(deps));

  const [data, setData] = useState<T | undefined>(() => {
    const key = cacheKeyRef.current;
    const cached = peekScreenDataCacheEntry<T>(key);
    if (cached !== undefined) {
      touchScreenDataCacheEntry(key);
      return cached;
    }
    return options?.initialData;
  });
  const [isLoading, setIsLoading] = useState(() => !peekScreenDataCacheEntry(cacheKeyRef.current));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Keep refs in sync every render (no hook rules violation — these are plain assignments).
  loaderRef.current = loader;
  formatErrorRef.current = options?.formatError;
  deferUntilInteractionsRef.current = options?.deferUntilInteractions;
  keepPreviousDataRef.current = options?.keepPreviousData;
  cacheKeyRef.current = JSON.stringify(deps);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestGateRef.current.invalidate();
    };
  }, []);

  useEffect(() => {
    const cacheKey = cacheKeyRef.current;
    const keepPreviousData = keepPreviousDataRef.current;
    const request = requestGateRef.current.beginRequest();

    // Reset stale cross-key data immediately when cache misses and keepPreviousData is off.
    const cachedNow = peekScreenDataCacheEntry<T>(cacheKey);
    if (cachedNow === undefined && !keepPreviousData) {
      setData(undefined);
      setIsLoading(true);
    } else if (cachedNow !== undefined) {
      touchScreenDataCacheEntry(cacheKey);
      setData(cachedNow);
      setIsLoading(false);
    }
    setErrorMessage(null);

    let interactionHandle: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;

    const run = async () => {
      try {
        let nextData: T;
        if (deferUntilInteractionsRef.current) {
          nextData = await new Promise<T>((resolve, reject) => {
            interactionHandle = InteractionManager.runAfterInteractions(() => {
              if (!isMountedRef.current || !requestGateRef.current.isCurrent(request)) {
                reject(new Error('cancelled'));
                return;
              }
              loaderRef.current().then(resolve).catch(reject);
            });
          });
        } else {
          nextData = await loaderRef.current();
        }
        if (isMountedRef.current && requestGateRef.current.isCurrent(request)) {
          setScreenDataCacheEntry(cacheKey, nextData);
          setData(nextData);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'cancelled') {
          return;
        }
        if (isMountedRef.current && requestGateRef.current.isCurrent(request)) {
          console.error(error);
          const message = formatErrorRef.current
            ? formatErrorRef.current(error)
            : error instanceof Error
              ? error.message
              : '未知错误';
          setErrorMessage(message);
        }
      } finally {
        if (isMountedRef.current && requestGateRef.current.isCurrent(request)) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      interactionHandle?.cancel();
      requestGateRef.current.invalidate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, ...deps]);

  const reload = () => {
    setReloadKey((current) => current + 1);
  };

  return {
    data,
    isLoading,
    errorMessage,
    reload,
    setData,
  };
}
