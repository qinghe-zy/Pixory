import { getDatabase } from '../db';
import type {
  CountRow,
  CreateImageAssetInput,
  ImageAssetQueryOptions,
  ImageAssetRecord,
  ImageAssetRow,
  ImageDetailRecord,
  ImageDetailRow,
  ImageListItem,
  ImageListItemRow,
  UpdateImageAssetInput,
} from '../types';
import {
  booleanToSqlite,
  buildUpdateStatement,
  createTimestamp,
  mapImageAssetRow,
  mapImageDetailRow,
  mapImageListItemRow,
  normalizeOptionalText,
  requireNonEmptyText,
} from '../utils';
import type { SQLiteDatabase } from 'expo-sqlite';

function buildDeletedFilter(columnPrefix = '', options?: ImageAssetQueryOptions): string {
  const column = columnPrefix ? `${columnPrefix}.deletedAt` : 'deletedAt';
  return options?.includeDeleted ? '' : `${column} IS NULL`;
}

function buildInClause(ids: number[]): { placeholders: string; values: number[] } {
  const values = [...new Set(ids)];

  if (values.length === 0) {
    throw new Error('Expected at least one image id.');
  }

  return {
    placeholders: values.map(() => '?').join(', '),
    values,
  };
}

async function loadImagesByIds(ids: number[]): Promise<ImageAssetRecord[]> {
  const db = await getDatabase();
  const inClause = buildInClause(ids);
  const rows = await db.getAllAsync<ImageAssetRow>(
    `SELECT * FROM image_assets WHERE id IN (${inClause.placeholders})`,
    ...inClause.values
  );

  return rows.map(mapImageAssetRow);
}

async function touchParentRecords(ipId: number, groupId?: number | null): Promise<void> {
  const db = await getDatabase();
  const now = createTimestamp();

  await db.runAsync('UPDATE ips SET updatedAt = ? WHERE id = ?', now, ipId);

  if (groupId != null) {
    await db.runAsync('UPDATE groups SET updatedAt = ? WHERE id = ?', now, groupId);
  }
}

async function touchManyParentRecords(
  db: SQLiteDatabase,
  records: Array<Pick<ImageAssetRecord, 'ipId' | 'groupId'>>
): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const now = createTimestamp();
  const ipIds = [...new Set(records.map((record) => record.ipId))];
  const groupIds = [...new Set(records.map((record) => record.groupId).filter((groupId): groupId is number => groupId != null))];

  if (ipIds.length > 0) {
    const inClause = buildInClause(ipIds);
    await db.runAsync(
      `UPDATE ips SET updatedAt = ? WHERE id IN (${inClause.placeholders})`,
      now,
      ...inClause.values
    );
  }

  if (groupIds.length > 0) {
    const inClause = buildInClause(groupIds);
    await db.runAsync(
      `UPDATE groups SET updatedAt = ? WHERE id IN (${inClause.placeholders})`,
      now,
      ...inClause.values
    );
  }
}

async function ensureGroupBelongsToIp(groupId: number, ipId: number): Promise<void> {
  const db = await getDatabase();
  const group = await db.getFirstAsync<{ id: number; ipId: number }>('SELECT id, ipId FROM groups WHERE id = ?', groupId);

  if (!group) {
    throw new Error(`Group ${groupId} does not exist.`);
  }

  if (group.ipId !== ipId) {
    throw new Error(`Group ${groupId} does not belong to IP ${ipId}.`);
  }
}

const IMAGE_WITH_RELATIONS_SELECT = `
  SELECT
    image_assets.*,
    ips.name AS ipName,
    groups.name AS groupName,
    groups.type AS groupType
  FROM image_assets
  INNER JOIN ips ON ips.id = image_assets.ipId
  LEFT JOIN groups ON groups.id = image_assets.groupId
`;

const IMAGE_LIST_SELECT = `
  SELECT
    image_assets.*,
    ips.name AS ipName,
    groups.name AS groupName,
    COUNT(DISTINCT image_tags.tagId) AS tagCount
  FROM image_assets
  INNER JOIN ips ON ips.id = image_assets.ipId
  LEFT JOIN groups ON groups.id = image_assets.groupId
  LEFT JOIN image_tags ON image_tags.imageAssetId = image_assets.id
`;

export const imageRepository = {
  async create(input: CreateImageAssetInput): Promise<ImageAssetRecord> {
    const db = await getDatabase();
    const now = createTimestamp();

    const result = await db.runAsync(
      `INSERT INTO image_assets (
        ipId,
        groupId,
        originalFileUri,
        thumbnailFileUri,
        originalFilename,
        internalFilename,
        width,
        height,
        mimeType,
        fileSize,
        isFavorite,
        note,
        deletedAt,
        createdAt,
        updatedAt,
        lastViewedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.ipId,
      input.groupId ?? null,
      requireNonEmptyText(input.originalFileUri, 'Original file URI'),
      normalizeOptionalText(input.thumbnailFileUri) ?? null,
      requireNonEmptyText(input.originalFilename, 'Original filename'),
      requireNonEmptyText(input.internalFilename, 'Internal filename'),
      input.width,
      input.height,
      requireNonEmptyText(input.mimeType, 'MIME type'),
      input.fileSize,
      booleanToSqlite(input.isFavorite ?? false),
      normalizeOptionalText(input.note) ?? null,
      input.deletedAt ?? null,
      now,
      now,
      input.lastViewedAt ?? null
    );

    await touchParentRecords(input.ipId, input.groupId);

    const record = await this.findById(result.lastInsertRowId, { includeDeleted: true });
    if (!record) {
      throw new Error(`Image asset ${result.lastInsertRowId} was created but could not be reloaded.`);
    }

    return record;
  },

  async update(id: number, input: UpdateImageAssetInput): Promise<ImageAssetRecord | null> {
    const db = await getDatabase();
    const current = await this.findById(id, { includeDeleted: true });
    if (!current) {
      return null;
    }

    const updates = buildUpdateStatement({
      ipId: input.ipId,
      groupId: input.groupId,
      originalFileUri:
        input.originalFileUri !== undefined
          ? requireNonEmptyText(input.originalFileUri, 'Original file URI')
          : undefined,
      thumbnailFileUri: normalizeOptionalText(input.thumbnailFileUri),
      originalFilename:
        input.originalFilename !== undefined
          ? requireNonEmptyText(input.originalFilename, 'Original filename')
          : undefined,
      internalFilename:
        input.internalFilename !== undefined
          ? requireNonEmptyText(input.internalFilename, 'Internal filename')
          : undefined,
      width: input.width,
      height: input.height,
      mimeType: input.mimeType !== undefined ? requireNonEmptyText(input.mimeType, 'MIME type') : undefined,
      fileSize: input.fileSize,
      isFavorite: input.isFavorite !== undefined ? booleanToSqlite(input.isFavorite) : undefined,
      note: normalizeOptionalText(input.note),
      deletedAt: input.deletedAt,
      lastViewedAt: input.lastViewedAt,
      updatedAt: createTimestamp(),
    });

    if (!updates.setClause) {
      return current;
    }

    const result = await db.runAsync(
      `UPDATE image_assets SET ${updates.setClause} WHERE id = ?`,
      ...updates.values,
      id
    );

    if (result.changes === 0) {
      return null;
    }

    const nextIpId = input.ipId ?? current.ipId;
    const nextGroupId = input.groupId !== undefined ? input.groupId : current.groupId;
    await touchParentRecords(nextIpId, nextGroupId);

    if (current.ipId !== nextIpId || current.groupId !== nextGroupId) {
      await touchParentRecords(current.ipId, current.groupId);
    }

    return this.findById(id, { includeDeleted: true });
  },

  async findById(id: number, options?: ImageAssetQueryOptions): Promise<ImageAssetRecord | null> {
    const db = await getDatabase();
    const deletedFilter = buildDeletedFilter('', options);
    const row = await db.getFirstAsync<ImageAssetRow>(
      `SELECT * FROM image_assets WHERE id = ?${deletedFilter ? ` AND ${deletedFilter}` : ''}`,
      id
    );

    return row ? mapImageAssetRow(row) : null;
  },

  async findAll(options?: ImageAssetQueryOptions): Promise<ImageAssetRecord[]> {
    const db = await getDatabase();
    const deletedFilter = buildDeletedFilter('', options);
    const rows = await db.getAllAsync<ImageAssetRow>(
      `SELECT * FROM image_assets${deletedFilter ? ` WHERE ${deletedFilter}` : ''} ORDER BY updatedAt DESC, id DESC`
    );

    return rows.map(mapImageAssetRow);
  },

  async findRecentByIpId(ipId: number, limit = 6): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.ipId = ? AND ${buildDeletedFilter('image_assets')}
       GROUP BY image_assets.id
       ORDER BY image_assets.createdAt DESC, image_assets.id DESC
       LIMIT ?`,
      ipId,
      limit
    );

    return rows.map(mapImageListItemRow);
  },

  async findByIpId(ipId: number, options?: ImageAssetQueryOptions): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const deletedFilter = buildDeletedFilter('image_assets', options);
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.ipId = ?${deletedFilter ? ` AND ${deletedFilter}` : ''}
       GROUP BY image_assets.id
       ORDER BY image_assets.createdAt DESC, image_assets.id DESC`,
      ipId
    );

    return rows.map(mapImageListItemRow);
  },

  async findByGroupId(groupId: number, options?: ImageAssetQueryOptions): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const deletedFilter = buildDeletedFilter('image_assets', options);
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.groupId = ?${deletedFilter ? ` AND ${deletedFilter}` : ''}
       GROUP BY image_assets.id
       ORDER BY image_assets.createdAt DESC, image_assets.id DESC`,
      groupId
    );

    return rows.map(mapImageListItemRow);
  },

  async findDetailById(id: number, options?: ImageAssetQueryOptions): Promise<ImageDetailRecord | null> {
    const db = await getDatabase();
    const deletedFilter = buildDeletedFilter('image_assets', options);
    const row = await db.getFirstAsync<ImageDetailRow>(
      `${IMAGE_WITH_RELATIONS_SELECT}
       WHERE image_assets.id = ?${deletedFilter ? ` AND ${deletedFilter}` : ''}`,
      id
    );

    return row ? mapImageDetailRow(row) : null;
  },

  async softDelete(id: number): Promise<ImageAssetRecord | null> {
    const affectedCount = await this.softDeleteMany([id]);
    if (affectedCount === 0) {
      return null;
    }

    return this.findById(id, { includeDeleted: true });
  },

  async count(options?: ImageAssetQueryOptions): Promise<number> {
    const db = await getDatabase();
    const deletedFilter = buildDeletedFilter('', options);
    const row = await db.getFirstAsync<CountRow>(
      `SELECT COUNT(*) AS count FROM image_assets${deletedFilter ? ` WHERE ${deletedFilter}` : ''}`
    );
    return row?.count ?? 0;
  },

  async updateMetadata(
    id: number,
    input: {
      originalFilename?: string;
      groupId?: number | null;
      note?: string | null;
      isFavorite?: boolean;
    }
  ): Promise<ImageAssetRecord | null> {
    const current = await this.findById(id, { includeDeleted: true });
    if (!current) {
      return null;
    }

    if (input.groupId != null) {
      await ensureGroupBelongsToIp(input.groupId, current.ipId);
    }

    try {
      return this.update(id, {
        originalFilename: input.originalFilename,
        groupId: input.groupId,
        note: input.note,
        isFavorite: input.isFavorite,
      });
    } catch (error) {
      console.error('Pixory imageRepository.updateMetadata failed.', {
        imageId: id,
        input,
        error,
      });
      throw error;
    }
  },

  async updateGroup(id: number, groupId: number | null): Promise<ImageAssetRecord | null> {
    const current = await this.findById(id, { includeDeleted: true });
    if (!current) {
      return null;
    }

    if (groupId != null) {
      await ensureGroupBelongsToIp(groupId, current.ipId);
    }

    try {
      return this.update(id, {
        groupId,
      });
    } catch (error) {
      console.error('Pixory imageRepository.updateGroup failed.', {
        imageId: id,
        groupId,
        error,
      });
      throw error;
    }
  },

  async updateFavorite(id: number, isFavorite: boolean): Promise<ImageAssetRecord | null> {
    try {
      return this.update(id, {
        isFavorite,
      });
    } catch (error) {
      console.error('Pixory imageRepository.updateFavorite failed.', {
        imageId: id,
        isFavorite,
        error,
      });
      throw error;
    }
  },

  async updateManyGroup(imageIds: number[], groupId: number | null): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(imageIds);
    if (currentImages.length === 0) {
      return 0;
    }

    const ipIds = [...new Set(currentImages.map((image) => image.ipId))];
    if (ipIds.length !== 1) {
      throw new Error('Batch group move requires all images to belong to the same IP.');
    }

    if (groupId != null) {
      await ensureGroupBelongsToIp(groupId, ipIds[0]);
    }

    const db = await getDatabase();
    const now = createTimestamp();
    const inClause = buildInClause(currentImages.map((image) => image.id));

    try {
      let changedCount = 0;
      await db.withTransactionAsync(async () => {
        const updateResult = await db.runAsync(
          `UPDATE image_assets
           SET groupId = ?, updatedAt = ?
           WHERE id IN (${inClause.placeholders})`,
          groupId,
          now,
          ...inClause.values
        );
        changedCount = updateResult.changes;

        const parentRecords = [
          ...currentImages.map((image) => ({ ipId: image.ipId, groupId: image.groupId })),
          ...currentImages.map((image) => ({ ipId: image.ipId, groupId })),
        ];
        await touchManyParentRecords(db, parentRecords);
      });

      return changedCount;
    } catch (error) {
      console.error('Pixory imageRepository.updateManyGroup failed.', {
        imageIds: inClause.values,
        groupId,
        error,
      });
      throw error;
    }
  },

  async updateManyFavorite(imageIds: number[], isFavorite: boolean): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(imageIds);
    if (currentImages.length === 0) {
      return 0;
    }

    const db = await getDatabase();
    const now = createTimestamp();
    const inClause = buildInClause(currentImages.map((image) => image.id));

    try {
      let changedCount = 0;
      await db.withTransactionAsync(async () => {
        const updateResult = await db.runAsync(
          `UPDATE image_assets
           SET isFavorite = ?, updatedAt = ?
           WHERE id IN (${inClause.placeholders})`,
          booleanToSqlite(isFavorite),
          now,
          ...inClause.values
        );
        changedCount = updateResult.changes;

        await touchManyParentRecords(db, currentImages);
      });

      return changedCount;
    } catch (error) {
      console.error('Pixory imageRepository.updateManyFavorite failed.', {
        imageIds: inClause.values,
        isFavorite,
        error,
      });
      throw error;
    }
  },

  async softDeleteMany(imageIds: number[]): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(imageIds);
    if (currentImages.length === 0) {
      return 0;
    }

    const db = await getDatabase();
    const now = createTimestamp();
    const inClause = buildInClause(currentImages.map((image) => image.id));

    try {
      let changedCount = 0;
      await db.withTransactionAsync(async () => {
        const updateResult = await db.runAsync(
          `UPDATE image_assets
           SET deletedAt = ?, updatedAt = ?
           WHERE id IN (${inClause.placeholders}) AND deletedAt IS NULL`,
          now,
          now,
          ...inClause.values
        );
        changedCount = updateResult.changes;

        await touchManyParentRecords(db, currentImages);
      });

      return changedCount;
    } catch (error) {
      console.error('Pixory imageRepository.softDeleteMany failed.', {
        imageIds: inClause.values,
        error,
      });
      throw error;
    }
  },
};

export default imageRepository;
