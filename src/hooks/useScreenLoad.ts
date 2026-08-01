import { InteractionManager } from 'react-native';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

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
  const loaderRef = useRef(loader);
  const formatErrorRef = useRef(options?.formatError);
  const [data, setData] = useState<T | undefined>(options?.initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  useEffect(() => {
    formatErrorRef.current = options?.formatError;
  }, [options?.formatError]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextData = options?.deferUntilInteractions
        ? await new Promise<T>((resolve, reject) => {
            InteractionManager.runAfterInteractions(() => {
              loaderRef.current().then(resolve).catch(reject);
            });
          })
        : await loaderRef.current();
      if (isMountedRef.current) {
        setData(nextData);
      }
      return nextData;
    } catch (error) {
      console.error(error);
      if (isMountedRef.current) {
        const message = formatErrorRef.current
          ? formatErrorRef.current(error)
          : error instanceof Error
            ? error.message
            : '未知错误';
        setErrorMessage(message);
      }
      return undefined;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
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
