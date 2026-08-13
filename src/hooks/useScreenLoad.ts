import { InteractionManager } from 'react-native';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { createPagedRequestGate } from './pagedRequestGate';

interface UseScreenLoadOptions<T> {
  formatError?: (error: unknown) => string;
  initialData?: T;
  deferUntilInteractions?: boolean;
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
  const [data, setData] = useState<T | undefined>(options?.initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  useEffect(() => {
    formatErrorRef.current = options?.formatError;
    deferUntilInteractionsRef.current = options?.deferUntilInteractions;
  }, [options?.deferUntilInteractions, options?.formatError]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestGateRef.current.invalidate();
    };
  }, []);

  const load = useCallback(async () => {
    const request = requestGateRef.current.beginRequest();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextData = deferUntilInteractionsRef.current
        ? await new Promise<T>((resolve, reject) => {
            InteractionManager.runAfterInteractions(() => {
              loaderRef.current().then(resolve).catch(reject);
            });
          })
        : await loaderRef.current();
      if (isMountedRef.current && requestGateRef.current.isCurrent(request)) {
        setData(nextData);
      }
      return nextData;
    } catch (error) {
      if (isMountedRef.current && requestGateRef.current.isCurrent(request)) {
        console.error(error);
        const message = formatErrorRef.current
          ? formatErrorRef.current(error)
          : error instanceof Error
            ? error.message
            : '未知错误';
        setErrorMessage(message);
      }
      return undefined;
    } finally {
      if (isMountedRef.current && requestGateRef.current.isCurrent(request)) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => requestGateRef.current.invalidate();
  }, [load, reloadKey, ...deps]);

  const reload = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  return {
    data,
    isLoading,
    errorMessage,
    reload,
    setData,
  };
}
