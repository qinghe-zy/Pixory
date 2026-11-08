import { PromptContextBuilder } from '../components/context/contextBuilder';
import { HybridRrfSearcher, type IHybridSearcher } from '../components/searchers/hybridRrfSearcher';
import { RecursiveTextSplitter } from '../components/splitters/recursiveSplitter';
import { MemoryRagStore } from '../components/stores/memoryStore';
import type { IRagEmbedder } from '../components/embedders/types';
import type { ITextSplitter } from '../components/splitters/types';
import type { IRagStore } from '../components/stores/types';
import type { IRagProvider } from '../provider';
import type {
  ContextBudget,
  IngestResult,
  PromptContextResult,
  RagDocument,
  RagEmbeddingRecord,
  RagSearchOptions,
  RagSnippet,
} from '../types';

export interface LocalHybridRagProviderOptions {
  id?: string;
  store?: IRagStore;
  splitter?: ITextSplitter;
  embedder?: IRagEmbedder;
  searcher?: IHybridSearcher;
}

/**
 * 内置本地混合闭环驱动 (LocalHybridRagProvider)
 * 组合了语义递归分块器、自洽存储、BM25 + 向量 RRF 倒数排名融合检索器，
 * 纯端侧零外部依赖运行，形成完整的本地 RAG 闭环。
 */
export class LocalHybridRagProvider implements IRagProvider {
  public readonly id: string;
  public readonly kind = 'provider' as const;

  public readonly store: IRagStore;
  public readonly splitter: ITextSplitter;
  public readonly embedder?: IRagEmbedder;
  public readonly searcher: IHybridSearcher;

  constructor(options: LocalHybridRagProviderOptions = {}) {
    this.id = options.id ?? 'provider:local-hybrid';
    this.store = options.store ?? new MemoryRagStore();
    this.splitter = options.splitter ?? new RecursiveTextSplitter();
    this.embedder = options.embedder;
    this.searcher = options.searcher ?? new HybridRrfSearcher();
  }

  public async init(): Promise<void> {
    if (typeof this.store.init === 'function') {
      await this.store.init();
    }
  }

  public async dispose(): Promise<void> {
    if (typeof this.store.dispose === 'function') {
      await this.store.dispose();
    }
  }

  public async ingest(document: RagDocument): Promise<IngestResult> {
    const startTime = Date.now();

    // 1. 保存文档元数据
    await this.store.saveDocument(document);

    // 2. 切分语义分块
    const chunks = this.splitter.splitText(document.content, document.id);
    // 注入文档标题及元数据至切片中以备溯源
    for (const c of chunks) {
      c.metadata = {
        ...document.metadata,
        title: document.title,
      };
    }
    await this.store.saveChunks(chunks);

    // 3. 向量化（如果配置了 Embedder）
    let embeddedCount = 0;
    if (this.embedder && chunks.length > 0) {
      try {
        const texts = chunks.map((c) => c.text);
        const vectors = await this.embedder.embedBatch(texts);
        const embeddings: RagEmbeddingRecord[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const vector = vectors[i];
          if (chunk && vector) {
            embeddings.push({
              chunkId: chunk.id,
              vector,
              dimensions: this.embedder.dimensions,
            });
          }
        }
        await this.store.saveEmbeddings(embeddings);
        embeddedCount = embeddings.length;
      } catch {
        // 向量化异常时安全降级，不阻塞文档成功摄入
      }
    }

    return {
      documentId: document.id,
      chunkCount: chunks.length,
      embeddedCount,
      durationMs: Date.now() - startTime,
    };
  }

  public async ingestBatch(documents: RagDocument[]): Promise<IngestResult[]> {
    const results: IngestResult[] = [];
    for (const doc of documents) {
      results.push(await this.ingest(doc));
    }
    return results;
  }

  public async delete(documentId: string): Promise<boolean> {
    return this.store.deleteDocument(documentId);
  }

  public async search(query: string, options?: RagSearchOptions): Promise<RagSnippet[]> {
    const chunks = await this.store.getAllChunks(options?.filter);
    if (chunks.length === 0) {
      return [];
    }

    return this.searcher.search(query, chunks, this.store, this.embedder, options);
  }

  public buildContext(snippets: RagSnippet[], budget?: ContextBudget): PromptContextResult {
    return PromptContextBuilder.buildContext(snippets, budget);
  }
}
