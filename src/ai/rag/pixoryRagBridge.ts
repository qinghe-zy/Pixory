import {
  LocalHybridRagProvider,
  RecursiveTextSplitter,
  StandaloneSqliteStore,
  type ISqliteDatabaseConnection,
  type RagSnippet,
} from '../../plugins/rag';
import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import type { AiCitationSourceType, AiDocumentOwnerType } from '../types';
import type { RetrieveForThreadInput, RetrievedSnippet, RetrievalMode } from '../aiRetrievalService';
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

// 缓存不同空间的 RAG 引擎单例，避免重复初始化
const engineCache = new Map<PixorySpace, LocalHybridRagProvider>();
const syncedOwnerCache = new Set<string>();

/**
 * 为指定空间构造基于 SQLite 的数据库连接代理
 * 确保 normal 与 personal 空间的物理数据库隔离
 */
function createSpaceSqliteConnection(space: PixorySpace): ISqliteDatabaseConnection {
  return {
    execAsync: (sql) => runWithDatabaseSpace(space, (db) => db.execAsync(sql)),
    runAsync: (sql, ...args) => runWithDatabaseSpace(space, (db) => (db.runAsync as any)(sql, ...args)),
    getAllAsync: (sql, ...args) => runWithDatabaseSpace(space, (db) => (db.getAllAsync as any)(sql, ...args)),
  };
}

/**
 * 获取指定空间的 RAG 引擎实例
 */
export async function getRagEngineForSpace(space: PixorySpace): Promise<LocalHybridRagProvider> {
  const cached = engineCache.get(space);
  if (cached) {
    return cached;
  }

  const connection = createSpaceSqliteConnection(space);
  const store = new StandaloneSqliteStore(connection, {
    tablePrefix: `pixory_rag_${space}`,
  });
  await store.init();

  // 动态尝试获取 Embedding 模型配置（若用户未配置则返回 undefined，自动降级纯 BM25）
  const embedder = await resolvePixoryEmbedder(space);
  const splitter = new RecursiveTextSplitter({ chunkSize: 800, chunkOverlap: 120 });

  const engine = new LocalHybridRagProvider({
    id: `provider:pixory-${space}`,
    store,
    splitter,
    embedder,
  });

  engineCache.set(space, engine);
  return engine;
}

/**
 * 清理指定空间引擎缓存（例如当用户在设置页修改了 Embedding 配置时）
 */
export function invalidateRagEngineCache(space?: PixorySpace): void {
  if (space) {
    engineCache.delete(space);
    for (const key of syncedOwnerCache) {
      if (key.startsWith(`${space}:`)) {
        syncedOwnerCache.delete(key);
      }
    }
  } else {
    engineCache.clear();
    syncedOwnerCache.clear();
  }
}

/**
 * 1. 同步文档至 RAG 插件
 * 捕获所有潜在异常，保证文档主流程永不阻塞
 */
export async function syncDocumentToRag(
  space: PixorySpace,
  doc: SyncDocumentInput
): Promise<void> {
  try {
    if (!doc.content || !doc.content.trim()) return;
    const engine = await getRagEngineForSpace(space);
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
 * 2. 从 RAG 插件中删除文档
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
 * 3. 伴聊会话统一 RAG 检索入口
 * 输出完全兼容既有 RetrievedSnippet 结构
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

    // 针对指定 ownerType 与 ownerId 进行切片过滤，设定 minScore 门槛过滤单虚词弱相关
    const rawSnippets = await engine.search(query, {
      topK: limit,
      minScore: 0.5,
      filter: {
        ownerType: input.ownerType,
        ownerId: input.ownerId,
      },
      mode: input.tier === 'keyword' ? 'keyword' : 'hybrid',
    });

    if (rawSnippets.length === 0) {
      // 触发存量历史文档后台静默回填（非阻塞，保证当前轮次零延迟直接走 Legacy 兜底）
      backfillOwnerDocumentsToRag(input.space, input.ownerType, input.ownerId).catch(() => {});
      return null;
    }

    const snippets: RetrievedSnippet[] = rawSnippets.map((s) => ({
      chunkId: s.chunkId,
      sourceType: (s.metadata?.ownerType === 'memory' ? 'image_note' : 'document_chunk') as AiCitationSourceType,
      sourceId: s.documentId,
      label: s.documentTitle,
      text: s.text,
      locator: (s.locator ?? {}) as Record<string, unknown>,
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
 */
export async function syncMemoryToRag(
  space: PixorySpace,
  memory: SyncMemoryInput
): Promise<void> {
  try {
    if (!memory.content || !memory.content.trim()) return;
    const engine = await getRagEngineForSpace(space);
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
 * 5. 跨记忆检索 (BM25 + RRF)
 */
export async function searchMemoriesWithRag(
  space: PixorySpace,
  query: string,
  limit = 5
): Promise<RagSnippet[]> {
  try {
    const engine = await getRagEngineForSpace(space);
    return await engine.search(query, {
      topK: limit,
      filter: { ownerType: 'memory' },
    });
  } catch {
    return [];
  }
}

/**
 * 6. 存量历史文档自动回填（按需延迟同步）
 * 当检索未命中新 RAG 时，可异步从已有文档切片中回填至 RAG 独立索引，实现无缝平滑升级
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
  syncedOwnerCache.add(cacheKey);

  try {
    return await runWithDatabaseSpace(space, async (db) => {
      const docs = await db.getAllAsync<{ id: string; title: string; updatedAt: string }>(
        `SELECT id, title, updated_at as updatedAt FROM ai_documents\n` +
        `WHERE space = ? AND owner_type = ? AND owner_id = ?\n` +
        `AND parser_status IN ('parsed', 'chunked', 'searchable', 'embedding_pending', 'embedding_ready')`,
        space,
        ownerType,
        ownerId
      );

      if (docs.length === 0) return 0;

      let syncedCount = 0;
      for (const doc of docs) {
        const chunks = await db.getAllAsync<{ text: string }>(
          `SELECT text FROM ai_chunks WHERE space = ? AND document_id = ? ORDER BY chunk_index ASC`,
          space,
          doc.id
        );
        const content = chunks.map((c) => c.text).join('\n\n');
        if (content.trim()) {
          await syncDocumentToRag(space, {
            id: doc.id,
            title: doc.title,
            content,
            ownerType,
            ownerId,
            version: doc.updatedAt,
          });
          syncedCount++;
        }
      }
      return syncedCount;
    });
  } catch {
    return 0;
  }
}
