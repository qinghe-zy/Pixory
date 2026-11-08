import { useCallback, useEffect, useRef, useState } from 'react';
import { ragHub } from '../instance';
import type {
  ContextBudget,
  IngestResult,
  PromptContextResult,
  RagDocument,
  RagSearchMode,
  RagSearchOptions,
  RagSnippet,
} from '../types';

export interface UseRagSearchOptions extends RagSearchOptions {
  autoSearch?: boolean;
  debounceMs?: number;
  initialQuery?: string;
  budget?: ContextBudget;
}

export interface UseRagSearchResult {
  query: string;
  setQuery: (q: string) => void;
  data: RagSnippet[];
  context: PromptContextResult | null;
  /** 四大核心交互状态 (UX Feedback States) */
  isLoading: boolean;
  isEmpty: boolean;
  isSuccess: boolean;
  error: Error | null;
  /** 手动触发搜索与容灾恢复 */
  search: (overrideQuery?: string) => Promise<RagSnippet[]>;
  retry: () => Promise<RagSnippet[]>;
  clear: () => void;
}

/**
 * 遵循 UX 4 态标准 (Loading/Empty/Error/Success) 与 React 最佳实践的高性能 RAG 搜索 Hook
 *
 * 规范遵循：
 * 1. UX Feedback: 显式提供 isLoading, isEmpty, error, isSuccess 四态及 retry 故障恢复能力。
 * 2. React Best Practices: 竞态时序防护 (Race Condition Guard)，组件卸载时丢弃过期 Promise，杜绝状态错乱。
 */
export function useRagSearch(options: UseRagSearchOptions = {}): UseRagSearchResult {
  const [query, setQuery] = useState(options.initialQuery ?? '');
  const [data, setData] = useState<RagSnippet[]>([]);
  const [context, setContext] = useState<PromptContextResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 竞态防御：跟踪最新的请求 ID，避免慢请求覆盖快请求
  const latestRequestId = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const executeSearch = useCallback(
    async (searchQuery: string): Promise<RagSnippet[]> => {
      const q = searchQuery.trim();
      if (!q) {
        if (isMountedRef.current) {
          setData([]);
          setContext(null);
          setIsLoading(false);
          setHasSearched(false);
          setError(null);
        }
        return [];
      }

      const requestId = ++latestRequestId.current;
      setIsLoading(true);
      setError(null);

      try {
        const snippets = await ragHub.search(q, {
          topK: options.topK ?? 5,
          mode: options.mode ?? 'hybrid',
          filter: options.filter,
          minScore: options.minScore,
          vectorWeight: options.vectorWeight,
          keywordWeight: options.keywordWeight,
          timeoutMs: options.timeoutMs,
        });

        // 仅在当前请求依然是最新的且组件未卸载时才应用状态
        if (isMountedRef.current && requestId === latestRequestId.current) {
          setData(snippets);
          setContext(ragHub.buildContext(snippets, options.budget));
          setHasSearched(true);
          setIsLoading(false);
        }
        return snippets;
      } catch (err) {
        if (isMountedRef.current && requestId === latestRequestId.current) {
          const formattedError = err instanceof Error ? err : new Error(String(err));
          setError(formattedError);
          setIsLoading(false);
          setHasSearched(true);
        }
        return [];
      }
    },
    [
      options.topK,
      options.mode,
      options.filter,
      options.minScore,
      options.vectorWeight,
      options.keywordWeight,
      options.timeoutMs,
      options.budget,
    ]
  );

  const search = useCallback(
    (overrideQuery?: string) => {
      const targetQuery = overrideQuery !== undefined ? overrideQuery : query;
      return executeSearch(targetQuery);
    },
    [executeSearch, query]
  );

  const retry = useCallback(() => executeSearch(query), [executeSearch, query]);

  const clear = useCallback(() => {
    latestRequestId.current++;
    setQuery('');
    setData([]);
    setContext(null);
    setIsLoading(false);
    setHasSearched(false);
    setError(null);
  }, []);

  // 自动响应搜索（可选防抖）
  useEffect(() => {
    if (!options.autoSearch) return;

    const timer = setTimeout(() => {
      executeSearch(query);
    }, options.debounceMs ?? 300);

    return () => clearTimeout(timer);
  }, [query, options.autoSearch, options.debounceMs, executeSearch]);

  const isEmpty = hasSearched && !isLoading && data.length === 0;
  const isSuccess = hasSearched && !isLoading && !error;

  return {
    query,
    setQuery,
    data,
    context,
    isLoading,
    isEmpty,
    isSuccess,
    error,
    search,
    retry,
    clear,
  };
}

export interface UseRagIngestResult {
  isLoading: boolean;
  isSuccess: boolean;
  error: Error | null;
  lastResult: IngestResult | null;
  ingest: (doc: RagDocument) => Promise<IngestResult | null>;
  reset: () => void;
}

/**
 * 知识库摄入 Hook，提供可观测的加载、成功与错误重试状态
 */
export function useRagIngest(): UseRagIngestResult {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastResult, setLastResult] = useState<IngestResult | null>(null);

  const ingest = useCallback(async (doc: RagDocument): Promise<IngestResult | null> => {
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);

    try {
      const result = await ragHub.ingest(doc);
      setIsLoading(false);
      setIsSuccess(true);
      setLastResult(result);
      return result;
    } catch (err) {
      const formattedError = err instanceof Error ? err : new Error(String(err));
      setError(formattedError);
      setIsLoading(false);
      setIsSuccess(false);
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setIsLoading(false);
    setIsSuccess(false);
    setError(null);
    setLastResult(null);
  }, []);

  return {
    isLoading,
    isSuccess,
    error,
    lastResult,
    ingest,
    reset,
  };
}
