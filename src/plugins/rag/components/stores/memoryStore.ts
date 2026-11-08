import type { IRagStore } from './types';
import type { RagChunk, RagDocument, RagEmbeddingRecord } from '../../types';

/**
 * 纯内存存储引擎 (MemoryRagStore)
 * 零依赖、零配置，极速运行，适用于测试用例、临时会话或纯前端无持久化场景
 */
export class MemoryRagStore implements IRagStore {
  public readonly id = 'store:memory';
  public readonly kind = 'store' as const;

  private documents = new Map<string, RagDocument>();
  private chunks = new Map<string, RagChunk>();
  private embeddings = new Map<string, RagEmbeddingRecord>();

  public async saveDocument(doc: RagDocument): Promise<void> {
    this.documents.set(doc.id, {
      ...doc,
      updatedAt: new Date().toISOString(),
      createdAt: doc.createdAt ?? new Date().toISOString(),
    });
  }

  public async getDocument(id: string): Promise<RagDocument | null> {
    return this.documents.get(id) ?? null;
  }

  public async listDocuments(filter?: Record<string, unknown>): Promise<RagDocument[]> {
    const all = Array.from(this.documents.values());
    if (!filter || Object.keys(filter).length === 0) {
      return all;
    }
    return all.filter((doc) => {
      if (!doc.metadata) return false;
      return Object.entries(filter).every(([key, val]) => doc.metadata?.[key] === val);
    });
  }

  public async deleteDocument(id: string): Promise<boolean> {
    const exists = this.documents.delete(id);
    await this.deleteChunksByDocument(id);
    return exists;
  }

  public async saveChunks(chunks: RagChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, {
        ...chunk,
        normalizedText: chunk.normalizedText ?? chunk.text.toLowerCase().trim(),
      });
    }
  }

  public async getChunksByDocument(documentId: string): Promise<RagChunk[]> {
    return Array.from(this.chunks.values())
      .filter((c) => c.documentId === documentId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  public async getAllChunks(filter?: Record<string, unknown>): Promise<RagChunk[]> {
    const all = Array.from(this.chunks.values());
    if (!filter || Object.keys(filter).length === 0) {
      return all;
    }
    return all.filter((chunk) => {
      if (!chunk.metadata) return false;
      return Object.entries(filter).every(([key, val]) => chunk.metadata?.[key] === val);
    });
  }

  public async deleteChunksByDocument(documentId: string): Promise<void> {
    const toDeleteChunkIds: string[] = [];
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.documentId === documentId) {
        toDeleteChunkIds.push(id);
      }
    }
    for (const id of toDeleteChunkIds) {
      this.chunks.delete(id);
      this.embeddings.delete(id);
    }
  }

  public async saveEmbeddings(embeddings: RagEmbeddingRecord[]): Promise<void> {
    for (const emb of embeddings) {
      this.embeddings.set(emb.chunkId, emb);
    }
  }

  public async getEmbeddings(chunkIds?: string[]): Promise<RagEmbeddingRecord[]> {
    if (!chunkIds || chunkIds.length === 0) {
      return Array.from(this.embeddings.values());
    }
    const result: RagEmbeddingRecord[] = [];
    for (const id of chunkIds) {
      const found = this.embeddings.get(id);
      if (found) {
        result.push(found);
      }
    }
    return result;
  }

  public async deleteEmbeddingsByChunkIds(chunkIds: string[]): Promise<void> {
    for (const id of chunkIds) {
      this.embeddings.delete(id);
    }
  }

  public async dispose(): Promise<void> {
    this.documents.clear();
    this.chunks.clear();
    this.embeddings.clear();
  }
}
