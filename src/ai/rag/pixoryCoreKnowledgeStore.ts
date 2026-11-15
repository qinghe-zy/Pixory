import type { SQLiteDatabase } from 'expo-sqlite';

import {
  aiKnowledgeRepository,
  runWithDatabaseSpace,
  type PixorySpace,
} from '../../database';
import type { AiDocumentOwnerType, AiDocumentSourceType } from '../types';
import type {
  IRagStore,
  RagChunk,
  RagDocument,
  RagEmbeddingRecord,
} from '../../plugins/rag';

const EMBEDDING_QUERY_BATCH_SIZE = 400;

interface CoreChunkJoinRow {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  normalizedText: string;
  sourceLabel: string;
  locatorJson: string;
  tokenEstimate: number | null;
  ownerType: AiDocumentOwnerType;
  ownerId: string;
  documentTitle: string;
  documentVersion: string | null;
}

interface CoreEmbeddingJoinRow {
  chunkId: string;
  providerId: string;
  modelId: string;
  dimensions: number;
  vectorJson: string;
}

export interface PixoryCoreKnowledgeStoreOptions {
  providerId?: string | null;
  modelId?: string | null;
}

function safeJsonParse<T>(jsonText: string | null | undefined, fallback: T): T {
  if (!jsonText) {
    return fallback;
  }
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    return fallback;
  }
}

function parseFiniteVector(vectorJson: string): number[] {
  const parsed = safeJsonParse<unknown>(vectorJson, []);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }
  for (let i = 0; i < parsed.length; i += 1) {
    const item = parsed[i];
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      return [];
    }
  }
  return parsed as number[];
}

function mapChunkRow(row: CoreChunkJoinRow): RagChunk {
  const locator = safeJsonParse<Record<string, unknown>>(row.locatorJson, {});
  return {
    id: row.id,
    documentId: row.documentId,
    chunkIndex: row.chunkIndex,
    text: row.text,
    normalizedText: row.normalizedText,
    locator,
    tokenEstimate: row.tokenEstimate ?? undefined,
    metadata: {
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      title: row.documentTitle,
      sourceLabel: row.sourceLabel,
      version: row.documentVersion,
    },
  };
}

function matchesExtraFilter(
  metadata: Record<string, unknown> | undefined,
  filter?: Record<string, unknown>
): boolean {
  if (!filter) {
    return true;
  }
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) {
      continue;
    }
    if (key === 'ownerType' || key === 'ownerId') {
      continue;
    }
    if (!metadata || metadata[key] !== value) {
      return false;
    }
  }
  return true;
}

/**
 * Pixory 核心知识库单一事实源存储适配器 (PixoryCoreKnowledgeStore)
 * 直接读写宿主权威 SQLite 表 (`ai_documents` / `ai_chunks` / `ai_embeddings`)，
 * 利用 `idx_ai_chunks_owner` 与 `idx_ai_embeddings_chunk` 索引按 space + owner 精确隔离检索，
 * 彻底消除 `pixory_rag_${space}_*` 重复表冗余与同步漂移。
 */
export class PixoryCoreKnowledgeStore implements IRagStore {
  public readonly id: string;
  public readonly kind = 'store' as const;

  constructor(
    private readonly space: PixorySpace,
    private readonly options: PixoryCoreKnowledgeStoreOptions = {}
  ) {
    this.id = `store:pixory-core:${space}`;
  }

  private async withScopedTransaction<T>(task: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
    return runWithDatabaseSpace(this.space, async (db) => {
      if (typeof db.withTransactionAsync === 'function') {
        let result!: T;
        await db.withTransactionAsync(async () => {
          result = await task(db);
        });
        return result;
      }
      return task(db);
    });
  }

  public async saveDocument(doc: RagDocument): Promise<void> {
    const ownerType = doc.metadata?.ownerType as AiDocumentOwnerType | undefined;
    const ownerId = typeof doc.metadata?.ownerId === 'string' ? doc.metadata.ownerId : undefined;
    await this.withScopedTransaction(async (db) => {
      const existing = await aiKnowledgeRepository.findDocumentById(db, doc.id);
      if (existing) {
        if (existing.space !== this.space) {
          throw new Error(`Cross-space document mutation rejected for ${doc.id}`);
        }
        await aiKnowledgeRepository.updateDocumentContent(db, {
          documentId: doc.id,
          metadataJson: doc.metadata ? JSON.stringify(doc.metadata) : undefined,
          title: doc.title,
        });
        return;
      }
      if (!ownerType || !ownerId) {
        return;
      }
      await aiKnowledgeRepository.createDocument(db, {
        id: doc.id,
        metadataJson: JSON.stringify(doc.metadata ?? {}),
        ownerId,
        ownerType,
        parserStatus: 'searchable',
        sourceType: ((doc.sourceType as AiDocumentSourceType | undefined) ?? 'manual_text'),
        space: this.space,
        title: doc.title,
      });
    });
  }

  public async getDocument(id: string): Promise<RagDocument | null> {
    return runWithDatabaseSpace(this.space, async (db) => {
      const row = await aiKnowledgeRepository.findDocumentById(db, id);
      if (!row || row.space !== this.space) {
        return null;
      }
      const chunks = await aiKnowledgeRepository.listChunksByDocumentId(db, id);
      return {
        id: row.id,
        title: row.title,
        content: chunks.map((chunk) => chunk.text).join('\n\n'),
        sourceType: row.sourceType,
        metadata: {
          ...safeJsonParse<Record<string, unknown>>(row.metadataJson, {}),
          ownerType: row.ownerType,
          ownerId: row.ownerId,
          version: row.updatedAt,
        },
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  public async listDocuments(filter?: Record<string, unknown>): Promise<RagDocument[]> {
    const ownerType = typeof filter?.ownerType === 'string' ? (filter.ownerType as AiDocumentOwnerType) : undefined;
    const ownerId = typeof filter?.ownerId === 'string' ? filter.ownerId : undefined;
    return runWithDatabaseSpace(this.space, async (db) => {
      const rows = await aiKnowledgeRepository.listDocuments(db, {
        ownerId,
        ownerType,
        space: this.space,
      });
      return rows
        .map((row) => ({
          id: row.id,
          title: row.title,
          content: '',
          sourceType: row.sourceType,
          metadata: {
            ...safeJsonParse<Record<string, unknown>>(row.metadataJson, {}),
            ownerType: row.ownerType,
            ownerId: row.ownerId,
            version: row.updatedAt,
          },
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }))
        .filter((doc) => matchesExtraFilter(doc.metadata, filter));
    });
  }

  public async deleteDocument(id: string): Promise<boolean> {
    return this.withScopedTransaction(async (db) => {
      const existing = await aiKnowledgeRepository.findDocumentById(db, id);
      if (!existing || existing.space !== this.space) {
        return false;
      }
      const changes = await aiKnowledgeRepository.deleteDocument(db, id);
      return changes > 0;
    });
  }

  public async saveChunks(chunks: RagChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }
    const documentId = chunks[0]!.documentId;
    await runWithDatabaseSpace(this.space, async (db) => {
      const document = await aiKnowledgeRepository.findDocumentById(db, documentId);
      if (!document || document.space !== this.space) {
        return;
      }
      // aiKnowledgeRepository.replaceChunks internally owns its db.withTransactionAsync boundary;
      // do not wrap it in another withScopedTransaction (nested BEGIN fails in SQLite).
      await aiKnowledgeRepository.replaceChunks(
        db,
        documentId,
        chunks.map((chunk) => ({
          id: chunk.id,
          space: this.space,
          ownerType: (chunk.metadata?.ownerType as AiDocumentOwnerType | undefined) ?? document.ownerType,
          ownerId: typeof chunk.metadata?.ownerId === 'string' ? chunk.metadata.ownerId : document.ownerId,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          normalizedText: chunk.normalizedText ?? chunk.text.toLowerCase().trim(),
          sourceLabel: typeof chunk.metadata?.sourceLabel === 'string'
            ? chunk.metadata.sourceLabel
            : `${document.title} · 第 ${chunk.chunkIndex + 1} 段`,
          locatorJson: JSON.stringify(chunk.locator ?? { paragraph: chunk.chunkIndex + 1 }),
          tokenEstimate: chunk.tokenEstimate ?? Math.ceil(chunk.text.length / 2),
        }))
      );
    });
  }

  public async getChunksByDocument(documentId: string): Promise<RagChunk[]> {
    return runWithDatabaseSpace(this.space, async (db) => {
      const rows = await db.getAllAsync<CoreChunkJoinRow>(
        `SELECT ai_chunks.id, ai_chunks.documentId, ai_chunks.chunkIndex,
                ai_chunks.text, ai_chunks.normalizedText, ai_chunks.sourceLabel,
                ai_chunks.locatorJson, ai_chunks.tokenEstimate,
                ai_chunks.ownerType, ai_chunks.ownerId,
                ai_documents.title AS documentTitle, ai_documents.updatedAt AS documentVersion
         FROM ai_chunks
         INNER JOIN ai_documents ON ai_documents.id = ai_chunks.documentId
         WHERE ai_chunks.space = ? AND ai_chunks.documentId = ?
         ORDER BY ai_chunks.chunkIndex ASC`,
        this.space,
        documentId
      );
      return rows.map(mapChunkRow);
    });
  }

  public async getAllChunks(filter?: Record<string, unknown>): Promise<RagChunk[]> {
    const ownerType = typeof filter?.ownerType === 'string' ? (filter.ownerType as AiDocumentOwnerType) : undefined;
    const ownerId = typeof filter?.ownerId === 'string' ? filter.ownerId : undefined;

    return runWithDatabaseSpace(this.space, async (db) => {
      const rows = ownerType && ownerId
        ? await db.getAllAsync<CoreChunkJoinRow>(
            `SELECT ai_chunks.id, ai_chunks.documentId, ai_chunks.chunkIndex,
                    ai_chunks.text, ai_chunks.normalizedText, ai_chunks.sourceLabel,
                    ai_chunks.locatorJson, ai_chunks.tokenEstimate,
                    ai_chunks.ownerType, ai_chunks.ownerId,
                    ai_documents.title AS documentTitle, ai_documents.updatedAt AS documentVersion
             FROM ai_chunks
             INNER JOIN ai_documents ON ai_documents.id = ai_chunks.documentId
             WHERE ai_chunks.space = ?
               AND ai_chunks.ownerType = ?
               AND ai_chunks.ownerId = ?
             ORDER BY ai_chunks.documentId ASC, ai_chunks.chunkIndex ASC`,
            this.space,
            ownerType,
            ownerId
          )
        : await db.getAllAsync<CoreChunkJoinRow>(
            `SELECT ai_chunks.id, ai_chunks.documentId, ai_chunks.chunkIndex,
                    ai_chunks.text, ai_chunks.normalizedText, ai_chunks.sourceLabel,
                    ai_chunks.locatorJson, ai_chunks.tokenEstimate,
                    ai_chunks.ownerType, ai_chunks.ownerId,
                    ai_documents.title AS documentTitle, ai_documents.updatedAt AS documentVersion
             FROM ai_chunks
             INNER JOIN ai_documents ON ai_documents.id = ai_chunks.documentId
             WHERE ai_chunks.space = ?
             ORDER BY ai_chunks.documentId ASC, ai_chunks.chunkIndex ASC`,
            this.space
          );

      return rows
        .map(mapChunkRow)
        .filter((chunk) => matchesExtraFilter(chunk.metadata, filter));
    });
  }

  public async deleteChunksByDocument(documentId: string): Promise<void> {
    await this.withScopedTransaction(async (db) => {
      await db.runAsync(
        `DELETE FROM ai_embeddings
         WHERE chunkId IN (
           SELECT id FROM ai_chunks WHERE space = ? AND documentId = ?
         )`,
        this.space,
        documentId
      );
      await db.runAsync(
        'DELETE FROM ai_chunks WHERE space = ? AND documentId = ?',
        this.space,
        documentId
      );
    });
  }

  public async saveEmbeddings(embeddings: RagEmbeddingRecord[]): Promise<void> {
    const valid = embeddings.filter(
      (emb) => Array.isArray(emb.vector) && emb.vector.length > 0
        && emb.vector.every((value) => typeof value === 'number' && Number.isFinite(value))
    );
    if (valid.length === 0) {
      return;
    }
    const providerId = this.options.providerId ?? 'pixory-core';
    await this.withScopedTransaction(async (db) => {
      await aiKnowledgeRepository.replaceEmbeddings(
        db,
        valid.map((emb) => ({
          id: `aiembed_${emb.chunkId}`,
          chunkId: emb.chunkId,
          providerId,
          modelId: emb.modelId ?? this.options.modelId ?? 'default',
          dimensions: emb.vector.length,
          vectorJson: JSON.stringify(emb.vector),
        }))
      );
    });
  }

  public async getEmbeddings(chunkIds?: string[]): Promise<RagEmbeddingRecord[]> {
    const providerId = this.options.providerId ?? undefined;
    const modelId = this.options.modelId ?? undefined;

    return runWithDatabaseSpace(this.space, async (db) => {
      const rows: CoreEmbeddingJoinRow[] = [];
      const extraClause = [
        providerId ? 'ai_embeddings.providerId = ?' : null,
        modelId ? 'ai_embeddings.modelId = ?' : null,
      ].filter(Boolean).join(' AND ');
      const extraParams = [
        ...(providerId ? [providerId] : []),
        ...(modelId ? [modelId] : []),
      ];

      if (!chunkIds || chunkIds.length === 0) {
        rows.push(
          ...(await db.getAllAsync<CoreEmbeddingJoinRow>(
            `SELECT ai_embeddings.chunkId, ai_embeddings.providerId, ai_embeddings.modelId,
                    ai_embeddings.dimensions, ai_embeddings.vectorJson
             FROM ai_embeddings
             INNER JOIN ai_chunks ON ai_chunks.id = ai_embeddings.chunkId
             WHERE ai_chunks.space = ?${extraClause ? ` AND ${extraClause}` : ''}`,
            this.space,
            ...extraParams
          ))
        );
      } else {
        for (let offset = 0; offset < chunkIds.length; offset += EMBEDDING_QUERY_BATCH_SIZE) {
          const batch = chunkIds.slice(offset, offset + EMBEDDING_QUERY_BATCH_SIZE);
          const placeholders = batch.map(() => '?').join(', ');
          rows.push(
            ...(await db.getAllAsync<CoreEmbeddingJoinRow>(
              `SELECT ai_embeddings.chunkId, ai_embeddings.providerId, ai_embeddings.modelId,
                      ai_embeddings.dimensions, ai_embeddings.vectorJson
               FROM ai_embeddings
               INNER JOIN ai_chunks ON ai_chunks.id = ai_embeddings.chunkId
               WHERE ai_chunks.space = ?
                 AND ai_embeddings.chunkId IN (${placeholders})${extraClause ? ` AND ${extraClause}` : ''}`,
              this.space,
              ...batch,
              ...extraParams
            ))
          );
        }
      }

      const records: RagEmbeddingRecord[] = [];
      for (const row of rows) {
        const vector = parseFiniteVector(row.vectorJson);
        if (vector.length === 0) {
          continue;
        }
        records.push({
          chunkId: row.chunkId,
          vector,
          dimensions: row.dimensions || vector.length,
          modelId: row.modelId,
        });
      }
      return records;
    });
  }

  public async deleteEmbeddingsByChunkIds(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) {
      return;
    }
    await this.withScopedTransaction(async (db) => {
      for (let offset = 0; offset < chunkIds.length; offset += EMBEDDING_QUERY_BATCH_SIZE) {
        const batch = chunkIds.slice(offset, offset + EMBEDDING_QUERY_BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(', ');
        await db.runAsync(
          `DELETE FROM ai_embeddings
           WHERE chunkId IN (${placeholders})
             AND chunkId IN (SELECT id FROM ai_chunks WHERE space = ?)`,
          ...batch,
          this.space
        );
      }
    });
  }
}
