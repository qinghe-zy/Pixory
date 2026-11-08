import { Bm25Scorer } from './bm25';
import { cosineSimilarity } from './cosine';
import type { IRagComponent } from '../../core/lifecycle';
import type { IRagEmbedder } from '../embedders/types';
import type { IRagStore } from '../stores/types';
import type { RagChunk, RagSearchOptions, RagSnippet } from '../../types';

export interface IHybridSearcher extends IRagComponent {
  readonly kind: 'searcher';
  search(
    query: string,
    chunks: RagChunk[],
    store: IRagStore,
    embedder?: IRagEmbedder,
    options?: RagSearchOptions
  ): Promise<RagSnippet[]>;
}

const RRF_CONSTANT = 60; // 工业界通用平滑常数

/**
 * 工业级双轨混合检索器 (Hybrid RRF Searcher)
 * 采用倒数排名融合 (Reciprocal Rank Fusion)，无量纲合并向量距离与 BM25 词频打分，
 * 并支持毫秒级超时检测与无感降级。
 */
export class HybridRrfSearcher implements IHybridSearcher {
  public readonly id = 'searcher:hybrid-rrf';
  public readonly kind = 'searcher' as const;

  public async search(
    query: string,
    chunks: RagChunk[],
    store: IRagStore,
    embedder?: IRagEmbedder,
    options?: RagSearchOptions
  ): Promise<RagSnippet[]> {
    if (chunks.length === 0 || !query.trim()) {
      return [];
    }

    const topK = options?.topK ?? 5;
    const mode = options?.mode ?? 'hybrid';
    const timeoutMs = options?.timeoutMs ?? 2000;

    // 1. BM25 关键词检索 (纯本地内存，微秒级)
    const bm25Scorer = new Bm25Scorer(chunks);
    const keywordRanked = bm25Scorer.score(query);

    // 如果指定仅关键词检索或没有向量模型，直接返回
    if (mode === 'keyword' || !embedder) {
      const minScore = options?.minScore ?? 0;
      const filtered = keywordRanked.filter((item) => item.score >= minScore).slice(0, topK);
      return this.formatSnippets(
        filtered.map((item) => ({ chunk: item.chunk, score: item.score })),
        'keyword'
      );
    }

    // 2. 向量语义检索 (带超时控制与降级)
    let vectorRanked: Array<{ chunk: RagChunk; score: number }> = [];
    try {
      vectorRanked = await this.performVectorSearch(query, chunks, store, embedder, timeoutMs);
    } catch {
      // 向量计算异常或超时，自动无感降级为关键词检索
      const minScore = options?.minScore ?? 0;
      const filtered = keywordRanked.filter((item) => item.score >= minScore).slice(0, topK);
      return this.formatSnippets(
        filtered.map((item) => ({ chunk: item.chunk, score: item.score })),
        'keyword'
      );
    }

    // 如果指定仅向量检索
    if (mode === 'vector') {
      const minScore = options?.minScore ?? 0;
      const filtered = vectorRanked.filter((item) => item.score >= minScore).slice(0, topK);
      return this.formatSnippets(filtered, 'vector');
    }

    // 3. RRF 倒数排名融合 (Hybrid Mode)
    const rrfScores = new Map<string, { chunk: RagChunk; score: number; hits: number }>();
    const vectorWeight = options?.vectorWeight ?? 1.0;
    const keywordWeight = options?.keywordWeight ?? 1.0;

    // 注入向量排名
    vectorRanked.forEach((item, index) => {
      const rank = index + 1;
      const rrf = vectorWeight * (1 / (RRF_CONSTANT + rank));
      const existing = rrfScores.get(item.chunk.id);
      if (existing) {
        existing.score += rrf;
        existing.hits += 1;
      } else {
        rrfScores.set(item.chunk.id, { chunk: item.chunk, score: rrf, hits: 1 });
      }
    });

    // 注入关键词排名
    keywordRanked.forEach((item, index) => {
      const rank = index + 1;
      const rrf = keywordWeight * (1 / (RRF_CONSTANT + rank));
      const existing = rrfScores.get(item.chunk.id);
      if (existing) {
        existing.score += rrf;
        existing.hits += 1;
      } else {
        rrfScores.set(item.chunk.id, { chunk: item.chunk, score: rrf, hits: 1 });
      }
    });

    const sortedMerged = Array.from(rrfScores.values()).sort((a, b) => b.score - a.score);

    const minScore = options?.minScore ?? 0;
    const filtered = sortedMerged.filter((item) => item.score >= minScore).slice(0, topK);

    return filtered.map((item) => ({
      chunkId: item.chunk.id,
      documentId: item.chunk.documentId,
      documentTitle: (item.chunk.metadata?.title as string) ?? item.chunk.documentId,
      text: item.chunk.text,
      score: Number(item.score.toFixed(5)),
      matchType: item.hits > 1 ? 'hybrid' : vectorRanked.some((v) => v.chunk.id === item.chunk.id) ? 'vector' : 'keyword',
      locator: item.chunk.locator,
      metadata: item.chunk.metadata,
    }));
  }

  private async performVectorSearch(
    query: string,
    chunks: RagChunk[],
    store: IRagStore,
    embedder: IRagEmbedder,
    timeoutMs: number
  ): Promise<Array<{ chunk: RagChunk; score: number }>> {
    const chunkIds = chunks.map((c) => c.id);
    const [embeddings, queryVector] = await Promise.all([
      store.getEmbeddings(chunkIds),
      this.withTimeout(embedder.embedQuery(query), timeoutMs),
    ]);

    if (!queryVector || queryVector.length === 0 || embeddings.length === 0) {
      return [];
    }

    const chunkMap = new Map(chunks.map((c) => [c.id, c]));
    const results: Array<{ chunk: RagChunk; score: number }> = [];

    for (const emb of embeddings) {
      const chunk = chunkMap.get(emb.chunkId);
      if (!chunk) continue;
      const sim = cosineSimilarity(queryVector, emb.vector);
      if (sim > 0) {
        results.push({ chunk, score: sim });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return Promise.race([
      promise.finally(() => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      }),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Vector embed timeout')), ms);
      }),
    ]);
  }

  private formatSnippets(
    ranked: Array<{ chunk: RagChunk; score: number }>,
    matchType: 'vector' | 'keyword'
  ): RagSnippet[] {
    return ranked.map((item) => ({
      chunkId: item.chunk.id,
      documentId: item.chunk.documentId,
      documentTitle: (item.chunk.metadata?.title as string) ?? item.chunk.documentId,
      text: item.chunk.text,
      score: Number(item.score.toFixed(4)),
      matchType,
      locator: item.chunk.locator,
      metadata: item.chunk.metadata,
    }));
  }
}
