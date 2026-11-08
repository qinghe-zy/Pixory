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

export interface RagSearchOptions {
  topK?: number;
  mode?: RagSearchMode;
  filter?: Record<string, unknown>;
  minScore?: number;
  vectorWeight?: number;
  keywordWeight?: number;
  timeoutMs?: number;
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
