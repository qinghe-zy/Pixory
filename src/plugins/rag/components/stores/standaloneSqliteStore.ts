import type { IRagStore } from './types';
import type { RagChunk, RagDocument, RagEmbeddingRecord } from '../../types';

export interface ISqliteDatabaseConnection {
  execAsync?(sql: string): Promise<void>;
  runAsync?(sql: string, ...args: unknown[]): Promise<{ changes: number }>;
  getAllAsync?<T>(sql: string, ...args: unknown[]): Promise<T[]>;
  withTransactionAsync?: (task: () => Promise<void>) => Promise<void>;
  runInTransaction?<T>(task: (conn: ISqliteDatabaseConnection) => Promise<T>): Promise<T>;
}

const SQLITE_IN_CLAUSE_BATCH_SIZE = 400;

export interface SqliteStoreOptions {
  tablePrefix?: string;
}

function safeJsonParse<T>(jsonStr: string | null | undefined, fallback: T): T {
  if (!jsonStr) return fallback;
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

/**
 * 独立 SQLite 存储驱动 (StandaloneSqliteStore)
 * 自包含独立的物理表命名空间（默认 plugin_rag_*），绝对不污染宿主已有业务表。
 */
export class StandaloneSqliteStore implements IRagStore {
  public readonly id = 'store:sqlite';
  public readonly kind = 'store' as const;

  private prefix: string;
  private initialized = false;

  constructor(
    private db: ISqliteDatabaseConnection,
    options: SqliteStoreOptions = {}
  ) {
    this.prefix = options.tablePrefix ?? 'plugin_rag';
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    const docTable = `${this.prefix}_documents`;
    const chunkTable = `${this.prefix}_chunks`;
    const embedTable = `${this.prefix}_embeddings`;

    const ddl = `
      CREATE TABLE IF NOT EXISTS ${docTable} (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        sourceType TEXT,
        metadataJson TEXT NOT NULL DEFAULT '{}',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ${chunkTable} (
        id TEXT PRIMARY KEY NOT NULL,
        documentId TEXT NOT NULL,
        chunkIndex INTEGER NOT NULL,
        text TEXT NOT NULL,
        normalizedText TEXT NOT NULL,
        locatorJson TEXT NOT NULL DEFAULT '{}',
        tokenEstimate INTEGER,
        metadataJson TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (documentId) REFERENCES ${docTable}(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ${embedTable} (
        chunkId TEXT PRIMARY KEY NOT NULL,
        vectorJson TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        modelId TEXT,
        FOREIGN KEY (chunkId) REFERENCES ${chunkTable}(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_${this.prefix}_chunks_doc
        ON ${chunkTable}(documentId, chunkIndex);
    `;

    if (typeof this.db.execAsync === 'function') {
      await this.db.execAsync(ddl);
    }
    this.initialized = true;
  }

  private async withWriteTransaction<T>(task: (conn: ISqliteDatabaseConnection) => Promise<T>): Promise<T> {
    if (typeof this.db.runInTransaction === 'function') {
      return this.db.runInTransaction(task);
    }
    if (typeof this.db.withTransactionAsync === 'function') {
      let result!: T;
      await this.db.withTransactionAsync(async () => {
        result = await task(this.db);
      });
      return result;
    }
    if (typeof this.db.execAsync === 'function') {
      await this.db.execAsync('BEGIN IMMEDIATE');
      try {
        const result = await task(this.db);
        await this.db.execAsync('COMMIT');
        return result;
      } catch (error) {
        await this.db.execAsync('ROLLBACK').catch(() => {});
        throw error;
      }
    }
    return task(this.db);
  }

  private async deleteChunksOnConnection(conn: ISqliteDatabaseConnection, documentId: string): Promise<void> {
    if (typeof conn.runAsync !== 'function') return;
    const chunkTable = `${this.prefix}_chunks`;
    const embedTable = `${this.prefix}_embeddings`;
    await conn.runAsync(
      `DELETE FROM ${embedTable} WHERE chunkId IN (SELECT id FROM ${chunkTable} WHERE documentId = ?)`,
      documentId
    );
    await conn.runAsync(`DELETE FROM ${chunkTable} WHERE documentId = ?`, documentId);
  }

  public async saveDocument(doc: RagDocument): Promise<void> {
    await this.init();
    const docTable = `${this.prefix}_documents`;
    const now = new Date().toISOString();
    const sql = `
      INSERT OR REPLACE INTO ${docTable} (id, title, content, sourceType, metadataJson, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    if (typeof this.db.runAsync === 'function') {
      await this.db.runAsync(
        sql,
        doc.id,
        doc.title,
        doc.content,
        doc.sourceType ?? 'text',
        JSON.stringify(doc.metadata ?? {}),
        doc.createdAt ?? now,
        now
      );
    }
  }

  public async getDocument(id: string): Promise<RagDocument | null> {
    await this.init();
    const docTable = `${this.prefix}_documents`;
    if (typeof this.db.getAllAsync === 'function') {
      const rows = await this.db.getAllAsync<any>(
        `SELECT id, title, content, sourceType, metadataJson, createdAt, updatedAt FROM ${docTable} WHERE id = ?`,
        id
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        content: row.content,
        sourceType: row.sourceType,
        metadata: safeJsonParse<Record<string, unknown>>(row.metadataJson, {}),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }
    return null;
  }

  public async listDocuments(filter?: Record<string, unknown>): Promise<RagDocument[]> {
    await this.init();
    const docTable = `${this.prefix}_documents`;
    if (typeof this.db.getAllAsync === 'function') {
      const rows = await this.db.getAllAsync<any>(
        `SELECT id, title, content, sourceType, metadataJson, createdAt, updatedAt FROM ${docTable} ORDER BY updatedAt DESC`
      );
      const docs = rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        sourceType: r.sourceType,
        metadata: safeJsonParse<Record<string, unknown>>(r.metadataJson, {}),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
      if (!filter || Object.keys(filter).length === 0) return docs;
      return docs.filter((d: any) =>
        Object.entries(filter).every(([k, v]) => d.metadata?.[k] === v)
      );
    }
    return [];
  }

  public async deleteDocument(id: string): Promise<boolean> {
    await this.init();
    const docTable = `${this.prefix}_documents`;
    if (typeof this.db.runAsync !== 'function') {
      return false;
    }
    return this.withWriteTransaction(async (conn) => {
      if (typeof conn.runAsync !== 'function') return false;
      await this.deleteChunksOnConnection(conn, id);
      const res = await conn.runAsync(`DELETE FROM ${docTable} WHERE id = ?`, id);
      return typeof res?.changes === 'number' ? res.changes > 0 : true;
    });
  }

  public async saveChunks(chunks: RagChunk[]): Promise<void> {
    await this.init();
    if (chunks.length === 0 || typeof this.db.runAsync !== 'function') return;
    const chunkTable = `${this.prefix}_chunks`;
    await this.withWriteTransaction(async (conn) => {
      if (typeof conn.runAsync !== 'function') return;
      for (const c of chunks) {
        await conn.runAsync(
          `INSERT OR REPLACE INTO ${chunkTable} (id, documentId, chunkIndex, text, normalizedText, locatorJson, tokenEstimate, metadataJson)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          c.id,
          c.documentId,
          c.chunkIndex,
          c.text,
          c.normalizedText ?? c.text.toLowerCase().trim(),
          JSON.stringify(c.locator ?? {}),
          c.tokenEstimate ?? Math.ceil(c.text.length / 2),
          JSON.stringify(c.metadata ?? {})
        );
      }
    });
  }

  public async getChunksByDocument(documentId: string): Promise<RagChunk[]> {
    await this.init();
    const chunkTable = `${this.prefix}_chunks`;
    if (typeof this.db.getAllAsync === 'function') {
      const rows = await this.db.getAllAsync<any>(
        `SELECT id, documentId, chunkIndex, text, normalizedText, locatorJson, tokenEstimate, metadataJson
         FROM ${chunkTable} WHERE documentId = ? ORDER BY chunkIndex ASC`,
        documentId
      );
      return rows.map((r: any) => ({
        id: r.id,
        documentId: r.documentId,
        chunkIndex: r.chunkIndex,
        text: r.text,
        normalizedText: r.normalizedText,
        locator: safeJsonParse<Record<string, unknown>>(r.locatorJson, {}),
        tokenEstimate: r.tokenEstimate,
        metadata: safeJsonParse<Record<string, unknown>>(r.metadataJson, {}),
      }));
    }
    return [];
  }

  public async getAllChunks(filter?: Record<string, unknown>): Promise<RagChunk[]> {
    await this.init();
    const chunkTable = `${this.prefix}_chunks`;
    if (typeof this.db.getAllAsync === 'function') {
      const rows = await this.db.getAllAsync<any>(
        `SELECT id, documentId, chunkIndex, text, normalizedText, locatorJson, tokenEstimate, metadataJson FROM ${chunkTable}`
      );
      const chunks = rows.map((r: any) => ({
        id: r.id,
        documentId: r.documentId,
        chunkIndex: r.chunkIndex,
        text: r.text,
        normalizedText: r.normalizedText,
        locator: safeJsonParse<Record<string, unknown>>(r.locatorJson, {}),
        tokenEstimate: r.tokenEstimate,
        metadata: safeJsonParse<Record<string, unknown>>(r.metadataJson, {}),
      }));
      if (!filter || Object.keys(filter).length === 0) return chunks;
      return chunks.filter((c: any) =>
        Object.entries(filter).every(([k, v]) => c.metadata?.[k] === v)
      );
    }
    return [];
  }

  public async deleteChunksByDocument(documentId: string): Promise<void> {
    await this.init();
    if (typeof this.db.runAsync === 'function') {
      await this.withWriteTransaction((conn) => this.deleteChunksOnConnection(conn, documentId));
    }
  }

  public async saveEmbeddings(embeddings: RagEmbeddingRecord[]): Promise<void> {
    await this.init();
    const valid = embeddings.filter((e) => Array.isArray(e.vector) && e.vector.length > 0);
    if (valid.length === 0 || typeof this.db.runAsync !== 'function') return;
    const embedTable = `${this.prefix}_embeddings`;
    await this.withWriteTransaction(async (conn) => {
      if (typeof conn.runAsync !== 'function') return;
      for (const e of valid) {
        await conn.runAsync(
          `INSERT OR REPLACE INTO ${embedTable} (chunkId, vectorJson, dimensions, modelId) VALUES (?, ?, ?, ?)`,
          e.chunkId,
          JSON.stringify(e.vector),
          e.dimensions > 0 ? e.dimensions : e.vector.length,
          e.modelId ?? 'default'
        );
      }
    });
  }

  public async getEmbeddings(chunkIds?: string[], modelId?: string): Promise<RagEmbeddingRecord[]> {
    await this.init();
    const embedTable = `${this.prefix}_embeddings`;
    if (typeof this.db.getAllAsync === 'function') {
      const rows: any[] = [];
      const modelClause = modelId ? ' WHERE modelId = ?' : '';
      const modelParams = modelId ? [modelId] : [];
      if (!chunkIds || chunkIds.length === 0) {
        rows.push(
          ...(await this.db.getAllAsync<any>(
            `SELECT chunkId, vectorJson, dimensions, modelId FROM ${embedTable}${modelClause}`,
            ...modelParams
          ))
        );
      } else {
        for (let offset = 0; offset < chunkIds.length; offset += SQLITE_IN_CLAUSE_BATCH_SIZE) {
          const batch = chunkIds.slice(offset, offset + SQLITE_IN_CLAUSE_BATCH_SIZE);
          const placeholders = batch.map(() => '?').join(', ');
          const whereClause = ` WHERE chunkId IN (${placeholders})${modelId ? ' AND modelId = ?' : ''}`;
          rows.push(
            ...(await this.db.getAllAsync<any>(
              `SELECT chunkId, vectorJson, dimensions, modelId FROM ${embedTable}${whereClause}`,
              ...batch,
              ...modelParams
            ))
          );
        }
      }
      return rows.map((r: any) => ({
        chunkId: r.chunkId,
        vector: safeJsonParse<number[]>(r.vectorJson, []),
        dimensions: r.dimensions,
        modelId: r.modelId,
      }));
    }
    return [];
  }

  public async deleteEmbeddingsByChunkIds(chunkIds: string[]): Promise<void> {
    await this.init();
    const embedTable = `${this.prefix}_embeddings`;
    if (chunkIds.length === 0 || typeof this.db.runAsync !== 'function') return;
    await this.withWriteTransaction(async (conn) => {
      if (typeof conn.runAsync !== 'function') return;
      for (let offset = 0; offset < chunkIds.length; offset += SQLITE_IN_CLAUSE_BATCH_SIZE) {
        const batch = chunkIds.slice(offset, offset + SQLITE_IN_CLAUSE_BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(', ');
        await conn.runAsync(`DELETE FROM ${embedTable} WHERE chunkId IN (${placeholders})`, ...batch);
      }
    });
  }
}
