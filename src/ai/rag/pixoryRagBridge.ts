import {
  LocalHybridRagProvider,
  RecursiveTextSplitter,
  SpaceScopedRagHub,
  StandaloneSqliteStore,
  type IRagEmbedder,
  type ISqliteDatabaseConnection,
  type RagSnippet,
} from '../../plugins/rag';
import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import type { AiCitationSourceType, AiDocumentOwnerType } from '../types';
import type { RetrieveForThreadInput, RetrievedSnippet, RetrievalMode } from '../aiRetrievalService';
import { PixoryCoreKnowledgeStore } from './pixoryCoreKnowledgeStore';
import { resolvePixoryEmbedder } from './pixoryRagEmbedder';

export interface SyncDocumentInput {
  id: string;
  title: string;
  content: string;
  ownerType: AiDocumentOwnerType | 'memory';
  ownerId: string;
  version?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SyncMemoryInput {
  id: string;
  content: string;
  roleCardId?: string | null;
  category?: string;
  tier?: string;
  metadata?: Record<string, unknown>;
}

const QUERY_EMBEDDING_TIMEOUT_MS = 250;
const DOCUMENT_RAG_MIN_SCORE = 0.25;

// 文档/知识库/IP 单一事实源中枢：严格按 normal / personal 分域隔离，personal 默认 Fail-Closed 禁止远程 Provider
const documentRagHub = new SpaceScopedRagHub<PixorySpace>(new Set<PixorySpace>(['personal']));
const legacyMemoryRagHub = new SpaceScopedRagHub<PixorySpace>(new Set<PixorySpace>(['personal']));

const docEngineInitializedSpaces = new Set<PixorySpace>();
const memoryEngineInitializedSpaces = new Set<PixorySpace>();
const syncedOwnerCache = new Set<string>();
const inflightOwnerBackfills = new Map<string, Promise<number>>();

function createSpaceSqliteConnection(space: PixorySpace): ISqliteDatabaseConnection {
  return {
    execAsync: (sql) => runWithDatabaseSpace(space, (db) => db.execAsync(sql)),
    runAsync: (sql, ...args) => runWithDatabaseSpace(space, (db) => (db.runAsync as any)(sql, ...args)),
    getAllAsync: (sql, ...args) => runWithDatabaseSpace(space, (db) => (db.getAllAsync as any)(sql, ...args)),
    runInTransaction: async (task) => runWithDatabaseSpace(space, async (db) => {
      const scopedConn: ISqliteDatabaseConnection = {
        execAsync: (sql) => db.execAsync(sql),
        runAsync: (sql, ...args) => (db.runAsync as any)(sql, ...args),
        getAllAsync: (sql, ...args) => (db.getAllAsync as any)(sql, ...args),
      };
      if (typeof db.withTransactionAsync === 'function') {
        let result!: Awaited<ReturnType<typeof task>>;
        await db.withTransactionAsync(async () => {
          result = await task(scopedConn);
        });
        return result;
      }
      if (typeof db.execAsync === 'function') {
        await db.execAsync('BEGIN IMMEDIATE');
        try {
          const result = await task(scopedConn);
          await db.execAsync('COMMIT');
          return result;
        } catch (error) {
          await db.execAsync('ROLLBACK').catch(() => {});
          throw error;
        }
      }
      return task(scopedConn);
    }),
  };
}

function createPrecomputedVectorEmbedder(
  queryVector: number[],
  modelId?: string | null
): IRagEmbedder {
  return {
    id: 'embedder:precomputed-query',
    kind: 'embedder',
    dimensions: queryVector.length,
    modelId: modelId ?? undefined,
    embedQuery: async () => queryVector,
    embedBatch: async (texts) => texts.map(() => queryVector),
  };
}

export function getDocumentRagHub(): SpaceScopedRagHub<PixorySpace> {
  return documentRagHub;
}

/**
 * 获取指定空间的文档/知识库 RAG 引擎实例（直连 ai_documents / ai_chunks / ai_embeddings 单一事实源）
 */
export async function getRagEngineForSpace(space: PixorySpace): Promise<LocalHybridRagProvider> {
  if (docEngineInitializedSpaces.has(space)) {
    return documentRagHub.getActiveProvider(space) as LocalHybridRagProvider;
  }

  const embedder = await resolvePixoryEmbedder(space);
  const store = new PixoryCoreKnowledgeStore(space, {
    modelId: embedder?.modelId ?? null,
    providerId: embedder && 'providerId' in embedder ? String((embedder as { providerId?: string }).providerId ?? '') || null : null,
  });
  const splitter = new RecursiveTextSplitter({ chunkSize: 800, chunkOverlap: 120 });

  const engine = new LocalHybridRagProvider({
    id: `provider:pixory-core-${space}`,
    store,
    splitter,
    embedder,
  });

  documentRagHub.registerAndActivateProvider(space, engine);
  docEngineInitializedSpaces.add(space);
  return engine;
}

async function getLegacyMemoryEngineForSpace(space: PixorySpace): Promise<LocalHybridRagProvider> {
  if (memoryEngineInitializedSpaces.has(space)) {
    return legacyMemoryRagHub.getActiveProvider(space) as LocalHybridRagProvider;
  }

  const connection = createSpaceSqliteConnection(space);
  const store = new StandaloneSqliteStore(connection, {
    tablePrefix: `pixory_rag_${space}`,
  });
  await store.init();

  const embedder = await resolvePixoryEmbedder(space);
  const splitter = new RecursiveTextSplitter({ chunkSize: 800, chunkOverlap: 120 });
  const engine = new LocalHybridRagProvider({
    id: `provider:pixory-legacy-memory-${space}`,
    store,
    splitter,
    embedder,
  });

  legacyMemoryRagHub.registerAndActivateProvider(space, engine);
  memoryEngineInitializedSpaces.add(space);
  return engine;
}

/**
 * 清理指定空间引擎缓存（例如当用户在设置页修改了 Embedding 配置时）
 */
export function invalidateRagEngineCache(space?: PixorySpace): void {
  if (space) {
    docEngineInitializedSpaces.delete(space);
    memoryEngineInitializedSpaces.delete(space);
    void documentRagHub.disposeSpace(space);
    void legacyMemoryRagHub.disposeSpace(space);
    invalidateOwnerRagCache(space);
  } else {
    docEngineInitializedSpaces.clear();
    memoryEngineInitializedSpaces.clear();
    void documentRagHub.disposeAll();
    void legacyMemoryRagHub.disposeAll();
    syncedOwnerCache.clear();
    inflightOwnerBackfills.clear();
  }
}

/**
 * 清理指定空间/所有者的 RAG 缓存状态
 */
export function invalidateOwnerRagCache(
  space: PixorySpace,
  ownerType?: AiDocumentOwnerType,
  ownerId?: string
): void {
  if (ownerType && ownerId) {
    const key = `${space}:${ownerType}:${ownerId}`;
    syncedOwnerCache.delete(key);
    inflightOwnerBackfills.delete(key);
    return;
  }
  const prefix = ownerType ? `${space}:${ownerType}:` : `${space}:`;
  for (const key of syncedOwnerCache) {
    if (key.startsWith(prefix)) {
      syncedOwnerCache.delete(key);
    }
  }
  for (const key of inflightOwnerBackfills.keys()) {
    if (key.startsWith(prefix)) {
      inflightOwnerBackfills.delete(key);
    }
  }
}

export const invalidateOwnerSyncCache = invalidateOwnerRagCache;

/**
 * 1. 同步文档至 RAG 插件
 * 主库 `ai_documents`/`ai_chunks`/`ai_embeddings` 已为单一事实源：
 * 若文档已在主库落盘，仅刷新所有者缓存而不再向 `pixory_rag_${space}_*` 重复写双份表或重复切片。
 */
export async function syncDocumentToRag(
  space: PixorySpace,
  doc: SyncDocumentInput
): Promise<void> {
  try {
    if (!doc.content || !doc.content.trim()) {
      return;
    }
    if (doc.ownerType !== 'memory') {
      invalidateOwnerRagCache(space, doc.ownerType, doc.ownerId);
    }
    const engine = await getRagEngineForSpace(space);
    const existing = await engine.store.getDocument(doc.id);
    if (existing) {
      return;
    }
    await engine.ingest({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      metadata: {
        ...doc.metadata,
        ownerType: doc.ownerType,
        ownerId: doc.ownerId,
        version: doc.version ?? new Date().toISOString(),
      },
    });
  } catch {
    // 静默兜底，不中断主业务
  }
}

/**
 * 2. 从 RAG 插件中清理文档索引（幂等，若主库已删则直接安全退出）
 */
export async function deleteDocumentFromRag(
  space: PixorySpace,
  documentId: string
): Promise<void> {
  try {
    const engine = await getRagEngineForSpace(space);
    await engine.delete(documentId);
  } catch {
    // 静默兜底
  }
}

/**
 * 3. 伴聊会话文档/知识库/IP 统一 RAG 检索入口（直读主库单一事实源 + 空间隔离）
 */
export async function retrieveForThreadWithRag(
  input: RetrieveForThreadInput
): Promise<{
  mode: RetrievalMode;
  partial: boolean;
  snippets: RetrievedSnippet[];
  timedOut: boolean;
} | null> {
  try {
    if (input.includeDocumentChunks === false) {
      return null;
    }

    const query = input.query.trim();
    if (!query) {
      return null;
    }

    const engine = await getRagEngineForSpace(input.space);
    const limit = input.limit ?? 6;
    const filter = {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
    };
    const searchOptions = {
      topK: limit,
      minScore: DOCUMENT_RAG_MIN_SCORE,
      minCosineSimilarity: DOCUMENT_RAG_MIN_SCORE,
      timeoutMs: QUERY_EMBEDDING_TIMEOUT_MS,
      filter,
      mode: input.tier === 'keyword' ? ('keyword' as const) : ('hybrid' as const),
    };

    let rawSnippets: RagSnippet[];
    const hasCustomQueryVector = Array.isArray(input.queryVector) && input.queryVector.length > 0;
    const hasCustomProviderOverride = Boolean(input.embeddingProviderId && input.embeddingModelId);

    if (input.tier === 'keyword') {
      rawSnippets = await engine.search(query, searchOptions);
    } else if (hasCustomQueryVector) {
      const store = new PixoryCoreKnowledgeStore(input.space, {
        modelId: input.embeddingModelId ?? null,
        providerId: input.embeddingProviderId ?? null,
      });
      const chunks = await store.getAllChunks(filter);
      const precomputedEmbedder = createPrecomputedVectorEmbedder(input.queryVector!, input.embeddingModelId);
      rawSnippets = chunks.length > 0
        ? await engine.searcher.search(query, chunks, store, precomputedEmbedder, searchOptions)
        : [];
    } else if (hasCustomProviderOverride) {
      const customEmbedder = await resolvePixoryEmbedder(input.space, {
        modelId: input.embeddingModelId,
        providerId: input.embeddingProviderId,
      });
      const store = new PixoryCoreKnowledgeStore(input.space, {
        modelId: input.embeddingModelId ?? null,
        providerId: input.embeddingProviderId ?? null,
      });
      const chunks = await store.getAllChunks(filter);
      rawSnippets = chunks.length > 0
        ? await engine.searcher.search(query, chunks, store, customEmbedder, searchOptions)
        : [];
    } else {
      rawSnippets = await engine.search(query, searchOptions);
    }

    if (rawSnippets.length === 0) {
      return null;
    }

    const snippets: RetrievedSnippet[] = rawSnippets.map((s) => ({
      chunkId: s.chunkId,
      sourceType: (s.metadata?.ownerType === 'memory' ? 'image_note' : 'document_chunk') as AiCitationSourceType,
      sourceId: s.documentId,
      label: typeof s.metadata?.sourceLabel === 'string' ? s.metadata.sourceLabel : s.documentTitle,
      text: s.text,
      locator: (s.locator ?? { chunkId: s.chunkId }) as Record<string, unknown>,
      score: s.score,
      documentVersion: (s.metadata?.version as string) ?? null,
    }));

    const isVectorMatched = rawSnippets.some((s) => s.matchType === 'vector' || s.matchType === 'hybrid');

    return {
      mode: isVectorMatched ? 'hybrid' : 'keyword',
      partial: false,
      snippets,
      timedOut: false,
    };
  } catch {
    // 发生异常时返回 null，通知上层无缝退回 Legacy 检索
    return null;
  }
}

/**
 * 4. 同步记忆事实（Claims / Facts）至 RAG 插件
 * @deprecated 历史兼容接口，长聊记忆已迁至 V2 `ai_memory_fts` + `memoryRetrievalService` 链路，伴聊记忆独立使用 `zeroVectorRetriever`。仅保留给历史集成测试与向后兼容调用，请勿在新建长聊或伴聊链路中调用。
 */
export async function syncMemoryToRag(
  space: PixorySpace,
  memory: SyncMemoryInput
): Promise<void> {
  try {
    if (!memory.content || !memory.content.trim()) return;
    const engine = await getLegacyMemoryEngineForSpace(space);
    await engine.ingest({
      id: `mem_${memory.id}`,
      title: `记忆·${memory.category ?? '事实'}`,
      content: memory.content,
      metadata: {
        ...memory.metadata,
        ownerType: 'memory',
        ownerId: memory.roleCardId ?? 'global',
        tier: memory.tier,
        category: memory.category,
      },
    });
  } catch {
    // 静默兜底
  }
}

/**
 * 5. 跨记忆检索
 * @deprecated 历史兼容接口，长聊记忆已迁至 V2 `ai_memory_fts` + `memoryRetrievalService` 链路，伴聊记忆独立使用 `zeroVectorRetriever`。仅保留给历史集成测试与向后兼容调用，请勿在新建长聊或伴聊链路中调用。
 */
export async function searchMemoriesWithRag(
  space: PixorySpace,
  query: string,
  limit = 5
): Promise<RagSnippet[]> {
  try {
    const engine = await getLegacyMemoryEngineForSpace(space);
    return await engine.search(query, {
      topK: limit,
      minScore: 0,
      filter: { ownerType: 'memory' },
    });
  } catch {
    return [];
  }
}

/**
 * 6. 单一事实源模式下确认历史文档可读状态并去重并发回填请求（不双写副本，错误不污染缓存）
 */
export async function backfillOwnerDocumentsToRag(
  space: PixorySpace,
  ownerType: AiDocumentOwnerType,
  ownerId: string
): Promise<number> {
  const cacheKey = `${space}:${ownerType}:${ownerId}`;
  if (syncedOwnerCache.has(cacheKey)) {
    return 0;
  }

  const existingInflight = inflightOwnerBackfills.get(cacheKey);
  if (existingInflight) {
    return existingInflight;
  }

  const task = (async (): Promise<number> => {
    try {
      const verifiedCount = await runWithDatabaseSpace(space, async (db) => {
        const docs = await db.getAllAsync<{ id: string; title: string; updatedAt: string }>(
          `SELECT id, title, updatedAt FROM ai_documents
           WHERE space = ? AND ownerType = ? AND ownerId = ?
             AND parserStatus IN ('parsed', 'chunked', 'searchable', 'embedding_pending', 'embedding_ready')`,
          space,
          ownerType,
          ownerId
        );
        return docs.length;
      });
      syncedOwnerCache.add(cacheKey);
      return verifiedCount;
    } catch {
      return 0;
    } finally {
      inflightOwnerBackfills.delete(cacheKey);
    }
  })();

  inflightOwnerBackfills.set(cacheKey, task);
  return task;
}
