import type { IRagComponent } from './core/lifecycle';
import type {
  ContextBudget,
  IngestResult,
  PromptContextResult,
  RagDocument,
  RagSearchOptions,
  RagSnippet,
} from './types';

/**
 * 统一 RAG 驱动接口契约 (Universal RAG Provider Contract)
 * 任何成熟方案（本地混合闭环、Dify、FastGPT、LlamaIndex 等）只要实现此接口，
 * 即可一键插入 RagHub 中作为全局引擎生效。
 */
export interface IRagProvider extends IRagComponent {
  readonly kind: 'provider';

  /** 1. 知识库摄入：自动分块、向量化并索引 */
  ingest(document: RagDocument): Promise<IngestResult>;

  /** 2. 批量知识库摄入 */
  ingestBatch?(documents: RagDocument[]): Promise<IngestResult[]>;

  /** 3. 文档删除：删除文档及其关联的所有切片与向量索引 */
  delete(documentId: string): Promise<boolean>;

  /** 4. 混合/语义检索：根据 query 召回最相关切片 */
  search(query: string, options?: RagSearchOptions): Promise<RagSnippet[]>;

  /** 5. 上下文与引用装配：将切片组装为带引用角标与预算限制的 Prompt 上下文 */
  buildContext(snippets: RagSnippet[], budget?: ContextBudget): PromptContextResult;
}
