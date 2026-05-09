import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  CountRow,
  CreateIpInput,
  IpDetailRecord,
  IpLibraryQuery,
  IpListItem,
  IpListItemRow,
  IpRecord,
  IpRow,
  UpdateIpInput,
} from '../types';
import {
  booleanToSqlite,
  buildUpdateStatement,
  createTimestamp,
  mapIpDetailRow,
  mapIpListItemRow,
  mapIpRow,
  normalizeOptionalText,
  requireNonEmptyText,
} from '../utils';

const IP_LIBRARY_SELECT = `
  SELECT
    ips.id,
    ips.name,
    ips.description,
    ips.isFavorite,
    ips.coverImageAssetId,
    ips.coverBlurEnabled,
    ips.coverBlurRadius,
    ips.deletedAt,
    ips.createdAt,
    ips.updatedAt,
    COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL AND image_assets.mediaType = 'image' THEN image_assets.id END) AS imageCount,
    COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL AND image_assets.mediaType = 'video' THEN image_assets.id END) AS videoCount,
    COUNT(DISTINCT groups.id) AS groupCount,
    COALESCE(SUM(DISTINCT CASE WHEN image_assets.deletedAt IS NULL THEN image_assets.fileSize ELSE 0 END), 0) AS totalBytes,
    COALESCE(
      (
        SELECT customCover.thumbnailFileUri
        FROM image_assets AS customCover
        WHERE customCover.id = ips.coverImageAssetId
          AND customCover.ipId = ips.id
          AND customCover.deletedAt IS NULL
        LIMIT 1
      ),
      (
        SELECT defaultCover.thumbnailFileUri
        FROM image_assets AS defaultCover
        WHERE defaultCover.ipId = ips.id
          AND defaultCover.deletedAt IS NULL
        ORDER BY defaultCover.updatedAt DESC, defaultCover.id DESC
        LIMIT 1
      )
    ) AS coverThumbnailFileUri,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM image_assets AS customCover
        WHERE customCover.id = ips.coverImageAssetId
          AND customCover.ipId = ips.id
          AND customCover.deletedAt IS NULL
      )
      THEN 'custom'
      ELSE 'default'
    END AS coverSource
  FROM ips
  LEFT JOIN image_assets ON image_assets.ipId = ips.id
  LEFT JOIN groups ON groups.ipId = ips.id
`;

const IP_DETAIL_SELECT = `
  SELECT
    ips.id,
    ips.name,
    ips.description,
    ips.isFavorite,
    ips.coverImageAssetId,
    ips.coverBlurEnabled,
    ips.coverBlurRadius,
    ips.deletedAt,
    ips.createdAt,
    ips.updatedAt,
    COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL AND image_assets.mediaType = 'image' THEN image_assets.id END) AS imageCount,
    COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL AND image_assets.mediaType = 'video' THEN image_assets.id END) AS videoCount,
    COUNT(DISTINCT groups.id) AS groupCount,
    COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL THEN image_tags.tagId END) AS tagCount,
    COALESCE(SUM(DISTINCT CASE WHEN image_assets.deletedAt IS NULL THEN image_assets.fileSize ELSE 0 END), 0) AS totalBytes,
    MAX(
      MAX(
        COALESCE(image_assets.updatedAt, ips.updatedAt),
        COALESCE(groups.updatedAt, ips.updatedAt),
        ips.updatedAt
      )
    ) AS recentUpdatedAt
    ,
    COALESCE(
      (
        SELECT customCover.thumbnailFileUri
        FROM image_assets AS customCover
        WHERE customCover.id = ips.coverImageAssetId
          AND customCover.ipId = ips.id
          AND customCover.deletedAt IS NULL
        LIMIT 1
      ),
      (
        SELECT defaultCover.thumbnailFileUri
        FROM image_assets AS defaultCover
        WHERE defaultCover.ipId = ips.id
          AND defaultCover.deletedAt IS NULL
        ORDER BY defaultCover.updatedAt DESC, defaultCover.id DESC
        LIMIT 1
      )
    ) AS coverThumbnailFileUri,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM image_assets AS customCover
        WHERE customCover.id = ips.coverImageAssetId
          AND customCover.ipId = ips.id
          AND customCover.deletedAt IS NULL
      )
      THEN 'custom'
      ELSE 'default'
    END AS coverSource
  FROM ips
  LEFT JOIN groups ON groups.ipId = ips.id
  LEFT JOIN image_assets ON image_assets.ipId = ips.id
  LEFT JOIN image_tags ON image_tags.imageAssetId = image_assets.id
`;

function buildLibraryQuery(query?: IpLibraryQuery): { sql: string; values: Array<number | string> } {
  const values: Array<number | string> = [];
  const whereClauses: string[] = ['ips.deletedAt IS NULL'];
  const normalizedSearchText = query?.searchText?.trim();
  const filter = query?.filter ?? 'all';

  if (normalizedSearchText) {
    const likeValue = `%${normalizedSearchText}%`;
    whereClauses.push(
      "(ips.name LIKE ? COLLATE NOCASE OR COALESCE(ips.description, '') LIKE ? COLLATE NOCASE)"
    );
    values.push(likeValue, likeValue);
  }

  if (filter === 'favorite') {
    whereClauses.push('ips.isFavorite = 1');
  }

  const whereStatement = whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const orderBy =
    filter === 'all'
      ? ' ORDER BY ips.name COLLATE NOCASE ASC, ips.updatedAt DESC, ips.id DESC'
      : ' ORDER BY ips.updatedAt DESC, ips.id DESC';

  return {
    sql: `${IP_LIBRARY_SELECT}${whereStatement} GROUP BY ips.id${orderBy}`,
    values,
  };
}

export const ipRepository = {
  async create(db: SQLiteDatabase, input: CreateIpInput): Promise<IpRecord> {
    const now = createTimestamp();
    const name = requireNonEmptyText(input.name, 'IP name');
    const description = normalizeOptionalText(input.description) ?? null;

    const result = await db.runAsync(
      'INSERT INTO ips (name, description, isFavorite, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      name,
      description,
      booleanToSqlite(Boolean(input.isFavorite)),
      now,
      now
    );

    const record = await this.findById(db, result.lastInsertRowId);
    if (!record) {
      throw new Error(`IP ${result.lastInsertRowId} was created but could not be reloaded.`);
    }

    return record;
  },

  async update(db: SQLiteDatabase, id: number, input: UpdateIpInput): Promise<IpRecord | null> {
    const updates = buildUpdateStatement({
      name: input.name !== undefined ? requireNonEmptyText(input.name, 'IP name') : undefined,
      description: normalizeOptionalText(input.description),
      isFavorite: input.isFavorite !== undefined ? booleanToSqlite(input.isFavorite) : undefined,
      coverImageAssetId: input.coverImageAssetId,
      coverBlurEnabled: input.coverBlurEnabled === undefined ? undefined : input.coverBlurEnabled == null ? null : booleanToSqlite(input.coverBlurEnabled),
      coverBlurRadius: input.coverBlurRadius,
      updatedAt: createTimestamp(),
    });

    if (!updates.setClause) {
      return this.findById(db, id);
    }

    const result = await db.runAsync(
      `UPDATE ips SET ${updates.setClause} WHERE id = ?`,
      ...updates.values,
      id
    );

    if (result.changes === 0) {
      return null;
    }

    return this.findById(db, id);
  },

  async findById(db: SQLiteDatabase, id: number): Promise<IpRecord | null> {
    const row = await db.getFirstAsync<IpRow>('SELECT * FROM ips WHERE id = ? AND deletedAt IS NULL', id);
    return row ? mapIpRow(row) : null;
  },

  async findByName(db: SQLiteDatabase, name: string): Promise<IpRecord | null> {
    const row = await db.getFirstAsync<IpRow>(
      'SELECT * FROM ips WHERE name = ? COLLATE NOCASE AND deletedAt IS NULL ORDER BY updatedAt DESC, id DESC LIMIT 1',
      requireNonEmptyText(name, 'IP name')
    );
    return row ? mapIpRow(row) : null;
  },

  async findAll(db: SQLiteDatabase): Promise<IpRecord[]> {
    const rows = await db.getAllAsync<IpRow>('SELECT * FROM ips WHERE deletedAt IS NULL ORDER BY updatedAt DESC, id DESC');
    return rows.map(mapIpRow);
  },

  async findAllIncludingDeleted(db: SQLiteDatabase): Promise<IpRecord[]> {
    const rows = await db.getAllAsync<IpRow>('SELECT * FROM ips ORDER BY deletedAt IS NULL DESC, updatedAt DESC, id DESC');
    return rows.map(mapIpRow);
  },

  async findLibraryItems(db: SQLiteDatabase, query?: IpLibraryQuery): Promise<IpListItem[]> {
    const builtQuery = buildLibraryQuery(query);
    const rows = await db.getAllAsync<IpListItemRow>(builtQuery.sql, ...builtQuery.values);
    return rows.map(mapIpListItemRow);
  },

  async findLibraryItemById(db: SQLiteDatabase, id: number): Promise<IpListItem | null> {
    const row = await db.getFirstAsync<IpListItemRow>(
      `${IP_LIBRARY_SELECT} WHERE ips.id = ? AND ips.deletedAt IS NULL GROUP BY ips.id`,
      id
    );
    return row ? mapIpListItemRow(row) : null;
  },

  async findDetailById(db: SQLiteDatabase, id: number): Promise<IpDetailRecord | null> {
    const row = await db.getFirstAsync<
      IpRow & {
        imageCount: number;
        videoCount: number;
        groupCount: number;
        tagCount: number;
        totalBytes: number | null;
        recentUpdatedAt: string | null;
        coverThumbnailFileUri: string | null;
        coverSource: 'custom' | 'default' | null;
      }
    >(`${IP_DETAIL_SELECT} WHERE ips.id = ? AND ips.deletedAt IS NULL GROUP BY ips.id`, id);
    return row ? mapIpDetailRow(row) : null;
  },

  async setCoverImage(db: SQLiteDatabase, ipId: number, imageAssetId: number): Promise<IpRecord | null> {
    const image = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM image_assets WHERE id = ? AND ipId = ? AND deletedAt IS NULL',
      imageAssetId,
      ipId
    );
    if (!image) {
      throw new Error('只能选择当前 IP 下未删除的图片作为封面。');
    }

    return this.update(db, ipId, { coverImageAssetId: imageAssetId });
  },

  async clearCoverImage(db: SQLiteDatabase, ipId: number): Promise<IpRecord | null> {
    return this.update(db, ipId, { coverImageAssetId: null });
  },

  async setCoverBlurEnabled(db: SQLiteDatabase, ipId: number, enabled: boolean): Promise<IpRecord | null> {
    return this.update(db, ipId, { coverBlurEnabled: enabled });
  },

  async setCoverBlurRadius(db: SQLiteDatabase, ipId: number, radius: number): Promise<IpRecord | null> {
    const normalizedRadius = Math.max(0, Math.min(12, Math.round(radius)));
    return this.update(db, ipId, { coverBlurRadius: normalizedRadius });
  },

  async count(db: SQLiteDatabase): Promise<number> {
    const row = await db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM ips WHERE deletedAt IS NULL');
    return row?.count ?? 0;
  },

  async softDeleteById(db: SQLiteDatabase, id: number): Promise<{ ipDeletedCount: number; imageDeletedCount: number }> {
    const now = createTimestamp();
    let ipDeletedCount = 0;
    let imageDeletedCount = 0;

    await db.withTransactionAsync(async () => {
      const ipResult = await db.runAsync(
        'UPDATE ips SET deletedAt = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
        now,
        now,
        id
      );
      ipDeletedCount = ipResult.changes;

      const imageResult = await db.runAsync(
        'UPDATE image_assets SET deletedAt = ?, updatedAt = ? WHERE ipId = ? AND deletedAt IS NULL',
        now,
        now,
        id
      );
      imageDeletedCount = imageResult.changes;
    });

    return { ipDeletedCount, imageDeletedCount };
  },

  async restoreById(db: SQLiteDatabase, id: number): Promise<number> {
    const result = await db.runAsync(
      'UPDATE ips SET deletedAt = NULL, updatedAt = ? WHERE id = ? AND deletedAt IS NOT NULL',
      createTimestamp(),
      id
    );
    return result.changes;
  },

  async deletePermanentlyById(db: SQLiteDatabase, id: number): Promise<{ ipDeletedCount: number; imageDeletedCount: number; groupDeletedCount: number; importBatchDeletedCount: number }> {
    let ipDeletedCount = 0;
    let imageDeletedCount = 0;
    let groupDeletedCount = 0;
    let importBatchDeletedCount = 0;

    await db.withTransactionAsync(async () => {
      const imageResult = await db.runAsync('DELETE FROM image_assets WHERE ipId = ?', id);
      imageDeletedCount = imageResult.changes;

      const groupResult = await db.runAsync('DELETE FROM groups WHERE ipId = ?', id);
      groupDeletedCount = groupResult.changes;

      const importBatchResult = await db.runAsync('DELETE FROM import_batches WHERE ipId = ?', id);
      importBatchDeletedCount = importBatchResult.changes;

      const ipResult = await db.runAsync('DELETE FROM ips WHERE id = ?', id);
      ipDeletedCount = ipResult.changes;
    });

    return { ipDeletedCount, imageDeletedCount, groupDeletedCount, importBatchDeletedCount };
  },

  async deleteById(db: SQLiteDatabase, id: number): Promise<number> {
    const imageCountRow = await db.getFirstAsync<CountRow>(
      'SELECT COUNT(*) AS count FROM image_assets WHERE ipId = ?',
      id
    );

    if ((imageCountRow?.count ?? 0) > 0) {
      throw new Error('此 IP 下仍有图片记录，请先将图片移入回收站并清空回收站后再删除 IP。');
    }

    const result = await db.runAsync('DELETE FROM ips WHERE id = ?', id);
    return result.changes;
  },
};

export default ipRepository;
