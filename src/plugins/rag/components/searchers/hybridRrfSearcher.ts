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
export const DEFAULT_MIN_COSINE_SIMILARITY = 0.25;
const BM25_SATURATION_K = 1.2;

function saturateBm25Score(rawScore: number): number {
  if (!Number.isFinite(rawScore) || rawScore <= 0) {
    return 0;
  }
  return rawScore / (rawScore + BM25_SATURATION_K);
}

/**
 * 工业级双轨混合检索器 (Hybrid RRF Searcher)
 * 采用归一化倒数排名融合 (Normalized Reciprocal Rank Fusion)，输出严格落于 [0, 1]，
 * 支持向量维度/模型一致性校验、最小余弦门限，以及毫秒级超时降级。
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
    const minScore = options?.minScore ?? 0;
    const minCosineSimilarity = options?.minCosineSimilarity ?? DEFAULT_MIN_COSINE_SIMILARITY;

    // 1. BM25 关键词检索 (纯本地内存，微秒级)并归一化至 [0, 1)
    const bm25Scorer = new Bm25Scorer(chunks);
    const keywordRanked = bm25Scorer.score(query).map((item) => ({
      chunk: item.chunk,
      score: saturateBm25Score(item.score),
    }));

    // 如果指定仅关键词检索或没有向量模型，直接返回
    if (mode === 'keyword' || !embedder) {
      const filtered = keywordRanked.filter((item) => item.score >= minScore).slice(0, topK);
      return this.formatSnippets(filtered, 'keyword');
    }

    // 2. 向量语义检索 (带维度/模型校验、最小余弦门限、超时控制与降级)
    let vectorRanked: Array<{ chunk: RagChunk; score: number }> = [];
    try {
      vectorRanked = await this.performVectorSearch(
        query,
        chunks,
        store,
        embedder,
        timeoutMs,
        minCosineSimilarity,
        options?.queryVector
      );
    } catch {
      // 向量计算异常或超时，自动无感降级为关键词检索
      const filtered = keywordRanked.filter((item) => item.score >= minScore).slice(0, topK);
      return this.formatSnippets(filtered, 'keyword');
    }

    // 如果指定仅向量检索，或混合检索仅有向量命中而无关键词命中，直接保留真实相似度分数（不虚高膨胀）
    if (mode === 'vector' || (vectorRanked.length > 0 && keywordRanked.length === 0)) {
      const filtered = vectorRanked.filter((item) => item.score >= minScore).slice(0, topK);
      return this.formatSnippets(filtered, 'vector');
    }

    // 仅关键词命中且无有效向量召回时，直接返回饱和归一化后的 BM25 结果
    if (vectorRanked.length === 0) {
      const filtered = keywordRanked.filter((item) => item.score >= minScore).slice(0, topK);
      return this.formatSnippets(filtered, 'keyword');
    }

    // 3. 归一化 RRF 倒数排名融合 (Hybrid Mode，严格归一化至 [0, 1])
    const rrfScores = new Map<string, { chunk: RagChunk; score: number; hits: number }>();
    const vectorWeight = Math.max(0, options?.vectorWeight ?? 1.0);
    const keywordWeight = Math.max(0, options?.keywordWeight ?? 1.0);
    const maxPossibleRrf = (vectorWeight + keywordWeight) / (RRF_CONSTANT + 1);
    if (maxPossibleRrf <= 0) {
      return [];
    }

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

    const sortedMerged = Array.from(rrfScores.values())
      .map((item) => ({
        ...item,
        score: Math.min(1, item.score / maxPossibleRrf),
      }))
      .sort((a, b) => b.score - a.score);

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
    timeoutMs: number,
    minCosineSimilarity: number,
    precomputedQueryVector?: number[]
  ): Promise<Array<{ chunk: RagChunk; score: number }>> {
    const chunkIds = chunks.map((c) => c.id);
    // 先检查本地是否存在可用向量，避免无向量知识库触发无意义的外发 Query Embedding 请求
    const rawEmbeddings = await store.getEmbeddings(chunkIds);
    const expectedModelId = embedder.modelId;
    const validEmbeddings = rawEmbeddings.filter((emb) => {
      if (!Array.isArray(emb.vector) || emb.vector.length === 0) {
        return false;
      }
      if (emb.dimensions && emb.dimensions !== emb.vector.length) {
        return false;
      }
      if (
        expectedModelId
        && emb.modelId
        && emb.modelId !== 'default'
        && emb.modelId !== expectedModelId
      ) {
        return false;
      }
      return true;
    });
    if (validEmbeddings.length === 0) {
      return [];
    }

    const queryVector = Array.isArray(precomputedQueryVector) && precomputedQueryVector.length > 0
      ? precomputedQueryVector
      : await this.withTimeout(embedder.embedQuery(query), timeoutMs);
    if (!Array.isArray(queryVector) || queryVector.length === 0) {
      return [];
    }

    const chunkMap = new Map(chunks.map((c) => [c.id, c]));
    const results: Array<{ chunk: RagChunk; score: number }> = [];

    for (const emb of validEmbeddings) {
      if (emb.vector.length !== queryVector.length) {
        continue;
      }
      const chunk = chunkMap.get(emb.chunkId);
      if (!chunk) continue;
      const sim = cosineSimilarity(queryVector, emb.vector);
      if (sim >= minCosineSimilarity) {
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
