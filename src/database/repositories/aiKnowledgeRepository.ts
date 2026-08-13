import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  AiDocumentOwnerType,
  AiDocumentSourceType,
  AiDocumentStatus,
} from '../types';
import type { PixorySpace } from '../db';
import { createTimestamp, normalizeOptionalText } from '../utils';

export interface AiKnowledgeBaseRecord {
  id: string;
  space: PixorySpace;
  name: string;
  category: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AiDocumentRecord {
  id: string;
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  sourceType: AiDocumentSourceType;
  title: string;
  originalFilename: string | null;
  localUri: string | null;
  mimeType: string | null;
  fileSize: number | null;
  parserStatus: AiDocumentStatus;
  parserError: string | null;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChunkRecord {
  id: string;
  documentId: string;
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  chunkIndex: number;
  text: string;
  normalizedText: string;
  sourceLabel: string;
  locatorJson: string;
  tokenEstimate: number | null;
  createdAt: string;
}

export interface AiEmbeddingRecord {
  id: string;
  chunkId: string;
  providerId: string;
  modelId: string;
  dimensions: number;
  vectorJson: string;
  createdAt: string;
}

export interface CreateKnowledgeBaseInput {
  id: string;
  space: PixorySpace;
  name: string;
  category?: string;
  description?: string | null;
}

export interface CreateDocumentInput {
  id: string;
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  sourceType: AiDocumentSourceType;
  title: string;
  originalFilename?: string | null;
  localUri?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  parserStatus?: AiDocumentStatus;
  metadataJson?: string;
}

export interface UpdateDocumentContentInput {
  documentId: string;
  title?: string;
  localUri?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  parserStatus?: AiDocumentStatus;
  metadataJson?: string;
}

export interface DocumentListQuery {
  space: PixorySpace;
  ownerType?: AiDocumentOwnerType;
  ownerId?: string;
  status?: AiDocumentStatus;
}

export interface ReplaceChunkInput {
  id: string;
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  chunkIndex: number;
  text: string;
  normalizedText: string;
  sourceLabel: string;
  locatorJson?: string;
  tokenEstimate?: number | null;
}

export interface KeywordChunkQuery {
  space: PixorySpace;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  keyword: string;
  limit?: number;
}

export interface ReplaceEmbeddingInput {
  id: string;
  chunkId: string;
  providerId: string;
  modelId: string;
  dimensions: number;
  vectorJson: string;
}

export interface CopyDocumentWithChunksInput {
  document: AiDocumentRecord;
  chunks: AiChunkRecord[];
  embeddings: AiEmbeddingRecord[];
  targetSpace: PixorySpace;
  targetLocalUri: string | null;
}

function makeInClause(values: string[]): string {
  return values.map(() => '?').join(', ');
}

const EMBEDDING_WRITE_BATCH_SIZE = 100;

function chunkItems<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export const aiKnowledgeRepository = {
  async createKnowledgeBase(db: SQLiteDatabase, input: CreateKnowledgeBaseInput): Promise<AiKnowledgeBaseRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_knowledge_bases (
        id,
        space,
        name,
        category,
        description,
        createdAt,
        updatedAt,
        archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      input.id,
      input.space,
      input.name,
      input.category ?? 'general',
      normalizeOptionalText(input.description) ?? null,
      now,
      now
    );
    const row = await db.getFirstAsync<AiKnowledgeBaseRecord>('SELECT * FROM ai_knowledge_bases WHERE id = ?', input.id);
    if (!row) {
      throw new Error(`AI knowledge base ${input.id} was created but could not be reloaded.`);
    }
    return row;
  },

  async listKnowledgeBases(db: SQLiteDatabase, space: PixorySpace): Promise<AiKnowledgeBaseRecord[]> {
    return db.getAllAsync<AiKnowledgeBaseRecord>(
      `SELECT * FROM ai_knowledge_bases
       WHERE space = ? AND archivedAt IS NULL
       ORDER BY updatedAt DESC, name ASC`,
      space
    );
  },

  async deleteKnowledgeBase(db: SQLiteDatabase, space: PixorySpace, knowledgeBaseId: string): Promise<number> {
    const documents = await this.listDocuments(db, {
      ownerId: knowledgeBaseId,
      ownerType: 'knowledge_base',
      space,
    });
    for (const document of documents) {
      await this.deleteDocument(db, document.id);
    }
    await db.runAsync(
      `UPDATE ai_threads
       SET boundKnowledgeBaseId = NULL, updatedAt = ?
       WHERE space = ? AND boundKnowledgeBaseId = ?`,
      createTimestamp(),
      space,
      knowledgeBaseId
    );
    const result = await db.runAsync(
      'DELETE FROM ai_knowledge_bases WHERE id = ? AND space = ?',
      knowledgeBaseId,
      space
    );
    return result.changes;
  },

  async createDocument(db: SQLiteDatabase, input: CreateDocumentInput): Promise<AiDocumentRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_documents (
        id,
        space,
        ownerType,
        ownerId,
        sourceType,
        title,
        originalFilename,
        localUri,
        mimeType,
        fileSize,
        parserStatus,
        parserError,
        metadataJson,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      input.id,
      input.space,
      input.ownerType,
      input.ownerId,
      input.sourceType,
      input.title,
      input.originalFilename ?? null,
      input.localUri ?? null,
      input.mimeType ?? null,
      input.fileSize ?? null,
      input.parserStatus ?? 'pending',
      input.metadataJson ?? '{}',
      now,
      now
    );
    const row = await db.getFirstAsync<AiDocumentRecord>('SELECT * FROM ai_documents WHERE id = ?', input.id);
    if (!row) {
      throw new Error(`AI document ${input.id} was created but could not be reloaded.`);
    }
    return row;
  },

  async findDocumentById(db: SQLiteDatabase, documentId: string): Promise<AiDocumentRecord | null> {
    return db.getFirstAsync<AiDocumentRecord>('SELECT * FROM ai_documents WHERE id = ?', documentId);
  },

  async updateDocumentStatus(
    db: SQLiteDatabase,
    documentId: string,
    status: AiDocumentStatus,
    parserError?: string | null
  ): Promise<AiDocumentRecord | null> {
    await db.runAsync(
      `UPDATE ai_documents
       SET parserStatus = ?, parserError = ?, updatedAt = ?
       WHERE id = ?`,
      status,
      normalizeOptionalText(parserError) ?? null,
      createTimestamp(),
      documentId
    );
    return db.getFirstAsync<AiDocumentRecord>('SELECT * FROM ai_documents WHERE id = ?', documentId);
  },

  async updateDocumentContent(db: SQLiteDatabase, input: UpdateDocumentContentInput): Promise<AiDocumentRecord | null> {
    await db.runAsync(
      `UPDATE ai_documents
       SET title = COALESCE(?, title),
           localUri = ?,
           mimeType = ?,
           fileSize = ?,
           parserStatus = COALESCE(?, parserStatus),
           parserError = NULL,
           metadataJson = COALESCE(?, metadataJson),
           updatedAt = ?
       WHERE id = ?`,
      normalizeOptionalText(input.title) ?? null,
      input.localUri ?? null,
      input.mimeType ?? null,
      input.fileSize ?? null,
      input.parserStatus ?? null,
      input.metadataJson ?? null,
      createTimestamp(),
      input.documentId
    );
    return db.getFirstAsync<AiDocumentRecord>('SELECT * FROM ai_documents WHERE id = ?', input.documentId);
  },

  async listDocuments(db: SQLiteDatabase, query: DocumentListQuery): Promise<AiDocumentRecord[]> {
    const clauses = ['space = ?'];
    const values: string[] = [query.space];
    if (query.ownerType) {
      clauses.push('ownerType = ?');
      values.push(query.ownerType);
    }
    if (query.ownerId) {
      clauses.push('ownerId = ?');
      values.push(query.ownerId);
    }
    if (query.status) {
      clauses.push('parserStatus = ?');
      values.push(query.status);
    }
    return db.getAllAsync<AiDocumentRecord>(
      `SELECT * FROM ai_documents
       WHERE ${clauses.join(' AND ')}
       ORDER BY updatedAt DESC, title ASC`,
      ...values
    );
  },

  async listRecentDocuments(db: SQLiteDatabase, space: PixorySpace, limit = 6): Promise<AiDocumentRecord[]> {
    return db.getAllAsync<AiDocumentRecord>(
      `SELECT * FROM ai_documents
       WHERE space = ?
       ORDER BY updatedAt DESC, createdAt DESC
       LIMIT ?`,
      space,
      limit
    );
  },

  async deleteDocument(db: SQLiteDatabase, documentId: string): Promise<number> {
    await db.runAsync(
      `DELETE FROM ai_message_citations
       WHERE sourceType = 'document_chunk'
         AND (
           sourceId = ?
           OR sourceId IN (SELECT id FROM ai_chunks WHERE documentId = ?)
         )`,
      documentId,
      documentId
    );
    await db.runAsync('DELETE FROM ai_chunks WHERE documentId = ?', documentId);
    const result = await db.runAsync('DELETE FROM ai_documents WHERE id = ?', documentId);
    return result.changes;
  },

  async replaceChunks(db: SQLiteDatabase, documentId: string, chunks: ReplaceChunkInput[]): Promise<void> {
    const now = createTimestamp();
    await db.runAsync('DELETE FROM ai_chunks WHERE documentId = ?', documentId);
    for (const chunk of chunks) {
      await db.runAsync(
        `INSERT INTO ai_chunks (
          id,
          documentId,
          space,
          ownerType,
          ownerId,
          chunkIndex,
          text,
          normalizedText,
          sourceLabel,
          locatorJson,
          tokenEstimate,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        chunk.id,
        documentId,
        chunk.space,
        chunk.ownerType,
        chunk.ownerId,
        chunk.chunkIndex,
        chunk.text,
        chunk.normalizedText,
        chunk.sourceLabel,
        chunk.locatorJson ?? '{}',
        chunk.tokenEstimate ?? null,
        now
      );
    }
  },

  async searchChunksByKeyword(db: SQLiteDatabase, query: KeywordChunkQuery): Promise<AiChunkRecord[]> {
    const keyword = `%${query.keyword.trim().toLowerCase()}%`;
    return db.getAllAsync<AiChunkRecord>(
      `SELECT * FROM ai_chunks
       WHERE space = ? AND ownerType = ? AND ownerId = ? AND normalizedText LIKE ?
       ORDER BY chunkIndex ASC
       LIMIT ?`,
      query.space,
      query.ownerType,
      query.ownerId,
      keyword,
      query.limit ?? 8
    );
  },

  async countDocumentsByOwner(db: SQLiteDatabase, input: { space: PixorySpace; ownerType: AiDocumentOwnerType; ownerId: string }): Promise<number> {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM ai_documents
       WHERE space = ? AND ownerType = ? AND ownerId = ?`,
      input.space,
      input.ownerType,
      input.ownerId
    );
    return row?.count ?? 0;
  },

  async listChunksByDocumentId(db: SQLiteDatabase, documentId: string): Promise<AiChunkRecord[]> {
    return db.getAllAsync<AiChunkRecord>(
      `SELECT * FROM ai_chunks
       WHERE documentId = ?
       ORDER BY chunkIndex ASC`,
      documentId
    );
  },

  async listEmbeddingsByChunkIds(db: SQLiteDatabase, chunkIds: string[]): Promise<AiEmbeddingRecord[]> {
    if (chunkIds.length === 0) {
      return [];
    }
    const rows: AiEmbeddingRecord[] = [];
    for (let index = 0; index < chunkIds.length; index += 400) {
      const chunk = chunkIds.slice(index, index + 400);
      rows.push(
        ...(await db.getAllAsync<AiEmbeddingRecord>(
          `SELECT * FROM ai_embeddings
           WHERE chunkId IN (${makeInClause(chunk)})
           ORDER BY createdAt ASC`,
          ...chunk
        ))
      );
    }
    return rows;
  },

  async copyDocumentWithChunks(db: SQLiteDatabase, input: CopyDocumentWithChunksInput): Promise<void> {
    const document = input.document;
    await db.runAsync(
      `INSERT OR REPLACE INTO ai_documents (
        id,
        space,
        ownerType,
        ownerId,
        sourceType,
        title,
        originalFilename,
        localUri,
        mimeType,
        fileSize,
        parserStatus,
        parserError,
        metadataJson,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      document.id,
      input.targetSpace,
      document.ownerType,
      document.ownerId,
      document.sourceType,
      document.title,
      document.originalFilename,
      input.targetLocalUri,
      document.mimeType,
      document.fileSize,
      document.parserStatus,
      document.parserError,
      document.metadataJson,
      document.createdAt,
      document.updatedAt
    );
    await db.runAsync('DELETE FROM ai_chunks WHERE documentId = ?', document.id);
    for (const chunk of input.chunks) {
      await db.runAsync(
        `INSERT OR REPLACE INTO ai_chunks (
          id,
          documentId,
          space,
          ownerType,
          ownerId,
          chunkIndex,
          text,
          normalizedText,
          sourceLabel,
          locatorJson,
          tokenEstimate,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        chunk.id,
        document.id,
        input.targetSpace,
        chunk.ownerType,
        chunk.ownerId,
        chunk.chunkIndex,
        chunk.text,
        chunk.normalizedText,
        chunk.sourceLabel,
        chunk.locatorJson,
        chunk.tokenEstimate,
        chunk.createdAt
      );
    }
    for (const embedding of input.embeddings) {
      await db.runAsync(
        `INSERT OR REPLACE INTO ai_embeddings (
          id,
          chunkId,
          providerId,
          modelId,
          dimensions,
          vectorJson,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        embedding.id,
        embedding.chunkId,
        embedding.providerId,
        embedding.modelId,
        embedding.dimensions,
        embedding.vectorJson,
        embedding.createdAt
      );
    }
  },

  async replaceEmbeddings(db: SQLiteDatabase, chunkEmbeddings: ReplaceEmbeddingInput[]): Promise<void> {
    const now = createTimestamp();
    const latestEmbeddingByKey = new Map<string, ReplaceEmbeddingInput>();
    for (const embedding of chunkEmbeddings) {
      latestEmbeddingByKey.set(
        `${embedding.chunkId}\u0000${embedding.providerId}\u0000${embedding.modelId}`,
        embedding,
      );
    }
    for (const batch of chunkItems([...latestEmbeddingByKey.values()], EMBEDDING_WRITE_BATCH_SIZE)) {
      const deleteTuples = batch.map(() => '(?, ?, ?)').join(', ');
      await db.runAsync(
        `DELETE FROM ai_embeddings
         WHERE (chunkId, providerId, modelId) IN (${deleteTuples})`,
        ...batch.flatMap((item) => [item.chunkId, item.providerId, item.modelId])
      );

      const insertRows = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      await db.runAsync(
        `INSERT INTO ai_embeddings (
          id,
          chunkId,
          providerId,
          modelId,
          dimensions,
          vectorJson,
          createdAt
        ) VALUES ${insertRows}`,
        ...batch.flatMap((item) => [
          item.id,
          item.chunkId,
          item.providerId,
          item.modelId,
          item.dimensions,
          item.vectorJson,
          now,
        ])
      );
    }
  },
};

export default aiKnowledgeRepository;
