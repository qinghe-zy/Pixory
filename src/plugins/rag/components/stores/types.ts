import type { IRagComponent } from '../../core/lifecycle';
import type { RagChunk, RagDocument, RagEmbeddingRecord } from '../../types';

export interface IRagStore extends IRagComponent {
  readonly kind: 'store';

  // 文档操作
  saveDocument(doc: RagDocument): Promise<void>;
  getDocument(id: string): Promise<RagDocument | null>;
  listDocuments(filter?: Record<string, unknown>): Promise<RagDocument[]>;
  deleteDocument(id: string): Promise<boolean>;

  // 切片操作
  saveChunks(chunks: RagChunk[]): Promise<void>;
  getChunksByDocument(documentId: string): Promise<RagChunk[]>;
  getAllChunks(filter?: Record<string, unknown>): Promise<RagChunk[]>;
  deleteChunksByDocument(documentId: string): Promise<void>;

  // 向量操作
  saveEmbeddings(embeddings: RagEmbeddingRecord[]): Promise<void>;
  getEmbeddings(chunkIds?: string[]): Promise<RagEmbeddingRecord[]>;
  deleteEmbeddingsByChunkIds(chunkIds: string[]): Promise<void>;
}
