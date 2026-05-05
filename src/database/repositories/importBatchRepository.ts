import { getDatabase } from '../db';
import type {
  CreateImportBatchInput,
  ImportBatchRecord,
  ImportBatchRow,
  ImportBatchSummary,
  ImportBatchSummaryRow,
  UpdateImportBatchInput,
} from '../types';
import { buildUpdateStatement, createTimestamp, normalizeOptionalText, requireNonEmptyText } from '../utils';

function mapImportBatchRow(row: ImportBatchRow): ImportBatchRecord {
  return {
    ...row,
    templateKey: row.templateKey ?? null,
    completedAt: row.completedAt ?? null,
  };
}

function mapImportBatchSummaryRow(row: ImportBatchSummaryRow): ImportBatchSummary {
  return {
    ...mapImportBatchRow(row),
    ipName: row.ipName,
    activeCount: row.activeCount ?? 0,
    organizedCount: row.organizedCount ?? 0,
    ungroupedCount: row.ungroupedCount ?? 0,
    untaggedCount: row.untaggedCount ?? 0,
    noNoteCount: row.noNoteCount ?? 0,
    suspectedDuplicateCount: row.suspectedDuplicateCount ?? 0,
  };
}

const IMPORT_BATCH_SUMMARY_SELECT = `
  SELECT
    import_batches.*,
    ips.name AS ipName,
    COUNT(image_assets.id) AS activeCount,
    SUM(CASE
      WHEN EXISTS (SELECT 1 FROM image_groups WHERE image_groups.imageAssetId = image_assets.id)
      THEN 1 ELSE 0 END
    ) AS organizedCount,
    SUM(CASE
      WHEN NOT EXISTS (SELECT 1 FROM image_groups WHERE image_groups.imageAssetId = image_assets.id)
      THEN 1 ELSE 0 END
    ) AS ungroupedCount,
    SUM(CASE
      WHEN NOT EXISTS (SELECT 1 FROM image_tags WHERE image_tags.imageAssetId = image_assets.id)
      THEN 1 ELSE 0 END
    ) AS untaggedCount,
    SUM(CASE
      WHEN image_assets.note IS NULL
      THEN 1 ELSE 0 END
    ) AS noNoteCount,
    (
      SELECT COALESCE(SUM(duplicate_groups.duplicateCount), 0)
      FROM (
        SELECT COUNT(*) AS duplicateCount
        FROM image_assets AS duplicate_assets
        WHERE duplicate_assets.importBatchId = import_batches.id
          AND duplicate_assets.deletedAt IS NULL
        GROUP BY duplicate_assets.width, duplicate_assets.height, duplicate_assets.fileSize
        HAVING COUNT(*) > 1
      ) AS duplicate_groups
    ) AS suspectedDuplicateCount
  FROM import_batches
  INNER JOIN ips ON ips.id = import_batches.ipId
  LEFT JOIN image_assets ON image_assets.importBatchId = import_batches.id AND image_assets.deletedAt IS NULL
`;

export const importBatchRepository = {
  async create(input: CreateImportBatchInput): Promise<ImportBatchRecord> {
    const db = await getDatabase();
    const now = createTimestamp();
    const fallbackName = `导入批次 ${now.slice(0, 10)}`;
    const result = await db.runAsync(
      `INSERT INTO import_batches (
        ipId,
        name,
        templateKey,
        totalCount,
        successCount,
        failedCount,
        createdAt,
        updatedAt,
        completedAt
      ) VALUES (?, ?, ?, ?, 0, 0, ?, ?, NULL)`,
      input.ipId,
      requireNonEmptyText(input.name ?? fallbackName, 'Import batch name'),
      normalizeOptionalText(input.templateKey) ?? null,
      input.totalCount ?? 0,
      now,
      now
    );

    const record = await this.findById(result.lastInsertRowId);
    if (!record) {
      throw new Error(`Import batch ${result.lastInsertRowId} was created but could not be reloaded.`);
    }

    return record;
  },

  async update(id: number, input: UpdateImportBatchInput): Promise<ImportBatchRecord | null> {
    const updates = buildUpdateStatement({
      name: input.name !== undefined ? requireNonEmptyText(input.name, 'Import batch name') : undefined,
      templateKey: normalizeOptionalText(input.templateKey),
      totalCount: input.totalCount,
      successCount: input.successCount,
      failedCount: input.failedCount,
      completedAt: input.completedAt,
      updatedAt: createTimestamp(),
    });

    if (!updates.setClause) {
      return this.findById(id);
    }

    const db = await getDatabase();
    const result = await db.runAsync(
      `UPDATE import_batches SET ${updates.setClause} WHERE id = ?`,
      ...updates.values,
      id
    );

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  },

  async complete(id: number, successCount: number, failedCount: number): Promise<ImportBatchRecord | null> {
    return this.update(id, {
      successCount,
      failedCount,
      completedAt: createTimestamp(),
    });
  },

  async findById(id: number): Promise<ImportBatchRecord | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ImportBatchRow>('SELECT * FROM import_batches WHERE id = ?', id);
    return row ? mapImportBatchRow(row) : null;
  },

  async findSummaryById(id: number): Promise<ImportBatchSummary | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ImportBatchSummaryRow>(
      `${IMPORT_BATCH_SUMMARY_SELECT}
       WHERE import_batches.id = ?
       GROUP BY import_batches.id`,
      id
    );

    return row ? mapImportBatchSummaryRow(row) : null;
  },

  async findRecentByIpId(ipId: number, limit = 5): Promise<ImportBatchSummary[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ImportBatchSummaryRow>(
      `${IMPORT_BATCH_SUMMARY_SELECT}
       WHERE import_batches.ipId = ?
       GROUP BY import_batches.id
       ORDER BY import_batches.createdAt DESC, import_batches.id DESC
       LIMIT ?`,
      ipId,
      limit
    );

    return rows.map(mapImportBatchSummaryRow);
  },

  async findByIpId(ipId: number, limit = 20): Promise<ImportBatchSummary[]> {
    return this.findRecentByIpId(ipId, limit);
  },
};

export default importBatchRepository;
