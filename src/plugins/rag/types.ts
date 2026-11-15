/**
 * 核心领域模型定义 (Core Domain Types)
 * 100% 独立于宿主业务，纯净通用
 */

export interface RagDocument {
  id: string;
  title: string;
  content: string;
  sourceType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface RagChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  normalizedText?: string;
  locator?: Record<string, unknown>;
  tokenEstimate?: number;
  metadata?: Record<string, unknown>;
}

export interface RagEmbeddingRecord {
  chunkId: string;
  vector: number[];
  dimensions: number;
  modelId?: string;
}

export type RagSearchMode = 'vector' | 'keyword' | 'hybrid';

export interface IRagProviderCapabilities {
  /** 是否依赖外部/远程网络服务。true 或未显式声明 false 时，严禁接入 personal 空间。 */
  readonly isRemote?: boolean;
  /** 是否支持双轨混合检索 */
  readonly supportsHybrid?: boolean;
  /** 是否支持按 filter 进行元数据域隔离过滤 */
  readonly supportsMetadataFilter?: boolean;
}

export interface RagSearchOptions {
  topK?: number;
  mode?: RagSearchMode;
  filter?: Record<string, unknown>;
  minScore?: number;
  minCosineSimilarity?: number;
  vectorWeight?: number;
  keywordWeight?: number;
  timeoutMs?: number;
  queryVector?: number[];
}

export interface RagSnippet {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  text: string;
  score: number;
  matchType: RagSearchMode;
  locator?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ContextBudget {
  maxChars?: number;
  maxSnippets?: number;
  headerPrefix?: string;
  /** 可选自定义引用块标题格式化器（默认为 `[1] 《文档标题》`） */
  formatCitationHeader?: (snippet: RagSnippet, refId: string) => string;
}

export interface PromptCitation {
  refId: string;
  chunkId: string;
  documentId: string;
  title: string;
}

export interface PromptContextResult {
  formattedContext: string;
  citations: PromptCitation[];
  totalChars: number;
  snippetCount: number;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  embeddedCount: number;
  durationMs: number;
}
