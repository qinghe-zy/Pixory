import { getDatabase } from '../db';
import { ipRepository } from './ipRepository';
import type {
  CountRow,
  CreateImageAssetInput,
  ImageAssetQueryOptions,
  ImageAssetRecord,
  ImageAssetRow,
  ImageDetailRecord,
  ImageDetailRow,
  ImageListQueryOptions,
  ImageListItem,
  ImageListItemRow,
  GroupRecord,
  GroupRow,
  IpOrganizationProgress,
  NeedsOrganizingScope,
  SuspectedDuplicateGroup,
  SumRow,
  UpdateImageAssetInput,
} from '../types';
import {
  booleanToSqlite,
  buildUpdateStatement,
  createTimestamp,
  mapImageAssetRow,
  mapGroupRow,
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

function buildOrderByClause(orderBy?: ImageListQueryOptions['orderBy']): string {
  if (orderBy === 'lastViewedAtDesc') {
    return 'ORDER BY image_assets.lastViewedAt DESC, image_assets.id DESC';
  }

  if (orderBy === 'deletedAtDesc') {
    return 'ORDER BY image_assets.deletedAt DESC, image_assets.id DESC';
  }

  return 'ORDER BY image_assets.createdAt DESC, image_assets.id DESC';
}

function buildImageListQueryParts(
  baseClauses: string[],
  baseValues: Array<number | string>,
  options?: ImageListQueryOptions
): { whereClause: string; values: Array<number | string>; orderByClause: string } {
  const clauses = [...baseClauses];
  const values = [...baseValues];
  const deletedFilter = buildDeletedFilter('image_assets', options);

  if (deletedFilter) {
    clauses.push(deletedFilter);
  }

  if (options?.favoritesOnly) {
    clauses.push('image_assets.isFavorite = 1');
  }

  if (options?.ungroupedOnly) {
    clauses.push(
      'image_assets.groupId IS NULL AND NOT EXISTS (SELECT 1 FROM image_groups AS ungrouped_groups WHERE ungrouped_groups.imageAssetId = image_assets.id)'
    );
  }

  if (options?.untaggedOnly) {
    clauses.push('NOT EXISTS (SELECT 1 FROM image_tags AS untagged_tags WHERE untagged_tags.imageAssetId = image_assets.id)');
  }

  if (options?.recentlyViewedOnly) {
    clauses.push('image_assets.lastViewedAt IS NOT NULL');
  }

  if (options?.ipId != null) {
    clauses.push('image_assets.ipId = ?');
    values.push(options.ipId);
  }

  if (options?.importBatchId != null) {
    clauses.push('image_assets.importBatchId = ?');
    values.push(options.importBatchId);
  }

  if (options?.groupId != null) {
    clauses.push(
      'EXISTS (SELECT 1 FROM image_groups AS filter_groups WHERE filter_groups.imageAssetId = image_assets.id AND filter_groups.groupId = ?)'
    );
    values.push(options.groupId);
  }

  if (options?.tagId != null) {
    clauses.push(
      'EXISTS (SELECT 1 FROM image_tags AS filter_tags WHERE filter_tags.imageAssetId = image_assets.id AND filter_tags.tagId = ?)'
    );
    values.push(options.tagId);
  }

  if (options?.mimeType) {
    clauses.push('image_assets.mimeType = ?');
    values.push(options.mimeType);
  }

  if (options?.aspectRatio === 'landscape') {
    clauses.push('image_assets.width > image_assets.height AND image_assets.width * 1.0 / image_assets.height < 2.2');
  }

  if (options?.aspectRatio === 'portrait') {
    clauses.push('image_assets.height > image_assets.width AND image_assets.height * 1.0 / image_assets.width < 2.2');
  }

  if (options?.aspectRatio === 'square') {
    clauses.push('ABS(image_assets.width - image_assets.height) <= MAX(image_assets.width, image_assets.height) * 0.08');
  }

  if (options?.aspectRatio === 'panorama') {
    clauses.push('MAX(image_assets.width * 1.0 / image_assets.height, image_assets.height * 1.0 / image_assets.width) >= 2.2');
  }

  if (options?.minFileSize != null) {
    clauses.push('image_assets.fileSize >= ?');
    values.push(options.minFileSize);
  }

  if (options?.maxFileSize != null) {
    clauses.push('image_assets.fileSize <= ?');
    values.push(options.maxFileSize);
  }

  const searchText = options?.searchText?.trim();
  if (searchText) {
    clauses.push(
      `(image_assets.originalFilename LIKE ? OR image_assets.note LIKE ? OR ips.name LIKE ? OR EXISTS (
        SELECT 1
        FROM image_tags AS search_image_tags
        INNER JOIN tags AS search_tags ON search_tags.id = search_image_tags.tagId
        WHERE search_image_tags.imageAssetId = image_assets.id
          AND search_tags.name LIKE ?
      ) OR EXISTS (
        SELECT 1
        FROM image_groups AS search_image_groups
        INNER JOIN groups AS search_groups ON search_groups.id = search_image_groups.groupId
        WHERE search_image_groups.imageAssetId = image_assets.id
          AND search_groups.name LIKE ?
      ))`
    );
    const likeValue = `%${searchText}%`;
    values.push(likeValue, likeValue, likeValue, likeValue, likeValue);
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
    orderByClause: buildOrderByClause(options?.orderBy),
  };
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

async function touchParentRecordsByGroupIds(db: SQLiteDatabase, ipIds: number[], groupIds: number[]): Promise<void> {
  const now = createTimestamp();
  const uniqueIpIds = [...new Set(ipIds)];
  const uniqueGroupIds = [...new Set(groupIds)];

  if (uniqueIpIds.length > 0) {
    const inClause = buildInClause(uniqueIpIds);
    await db.runAsync(
      `UPDATE ips SET updatedAt = ? WHERE id IN (${inClause.placeholders})`,
      now,
      ...inClause.values
    );
  }

  if (uniqueGroupIds.length > 0) {
    const inClause = buildInClause(uniqueGroupIds);
    await db.runAsync(
      `UPDATE groups SET updatedAt = ? WHERE id IN (${inClause.placeholders})`,
      now,
      ...inClause.values
    );
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

function normalizeGroupIds(groupIds: number[]): number[] {
  return [...new Set(groupIds.filter((groupId) => Number.isInteger(groupId) && groupId > 0))];
}

async function ensureGroupsBelongToIp(groupIds: number[], ipId: number): Promise<void> {
  const uniqueGroupIds = normalizeGroupIds(groupIds);

  for (const groupId of uniqueGroupIds) {
    await ensureGroupBelongsToIp(groupId, ipId);
  }
}

async function loadGroupIdsByImageIds(db: SQLiteDatabase, imageIds: number[]): Promise<Map<number, number[]>> {
  if (imageIds.length === 0) {
    return new Map();
  }

  const inClause = buildInClause(imageIds);
  const rows = await db.getAllAsync<{ imageAssetId: number; groupId: number }>(
    `SELECT imageAssetId, groupId
     FROM image_groups
     WHERE imageAssetId IN (${inClause.placeholders})`,
    ...inClause.values
  );
  const grouped = new Map<number, number[]>();

  for (const row of rows) {
    grouped.set(row.imageAssetId, [...(grouped.get(row.imageAssetId) ?? []), row.groupId]);
  }

  return grouped;
}

async function replaceImageGroupsInTransaction(
  db: SQLiteDatabase,
  imageId: number,
  groupIds: number[],
  createdAt: string
): Promise<void> {
  const uniqueGroupIds = normalizeGroupIds(groupIds);
  const primaryGroupId = uniqueGroupIds[0] ?? null;

  await db.runAsync('DELETE FROM image_groups WHERE imageAssetId = ?', imageId);

  for (const groupId of uniqueGroupIds) {
    await db.runAsync(
      'INSERT OR IGNORE INTO image_groups (imageAssetId, groupId, createdAt) VALUES (?, ?, ?)',
      imageId,
      groupId,
      createdAt
    );
  }

  await db.runAsync('UPDATE image_assets SET groupId = ? WHERE id = ?', primaryGroupId, imageId);
}

const IMAGE_WITH_RELATIONS_SELECT = `
  SELECT
    image_assets.*,
    ips.name AS ipName,
    (
      SELECT GROUP_CONCAT(groups.name, '、')
      FROM image_groups
      INNER JOIN groups ON groups.id = image_groups.groupId
      WHERE image_groups.imageAssetId = image_assets.id
      ORDER BY groups.type ASC, groups.sortOrder ASC, groups.updatedAt DESC, groups.id DESC
    ) AS groupName,
    CASE
      WHEN (SELECT COUNT(*) FROM image_groups WHERE image_groups.imageAssetId = image_assets.id) = 1
      THEN (
        SELECT groups.type
        FROM image_groups
        INNER JOIN groups ON groups.id = image_groups.groupId
        WHERE image_groups.imageAssetId = image_assets.id
        LIMIT 1
      )
      ELSE NULL
    END AS groupType,
    (SELECT COUNT(*) FROM image_groups WHERE image_groups.imageAssetId = image_assets.id) AS groupCount
  FROM image_assets
  INNER JOIN ips ON ips.id = image_assets.ipId
`;

const IMAGE_LIST_SELECT = `
  SELECT
    image_assets.*,
    ips.name AS ipName,
    (
      SELECT CASE
        WHEN COUNT(*) > 1 THEN COUNT(*) || ' 个分组'
        ELSE MAX(groups.name)
      END
      FROM image_groups
      INNER JOIN groups ON groups.id = image_groups.groupId
      WHERE image_groups.imageAssetId = image_assets.id
    ) AS groupName,
    (SELECT COUNT(*) FROM image_groups WHERE image_groups.imageAssetId = image_assets.id) AS groupCount,
    (SELECT COUNT(DISTINCT image_tags.tagId) FROM image_tags WHERE image_tags.imageAssetId = image_assets.id) AS tagCount
  FROM image_assets
  INNER JOIN ips ON ips.id = image_assets.ipId
`;

export const imageRepository = {
  async create(input: CreateImageAssetInput): Promise<ImageAssetRecord> {
    const db = await getDatabase();
    const now = createTimestamp();
    const groupIds = normalizeGroupIds(input.groupIds ?? (input.groupId != null ? [input.groupId] : []));
    await ensureGroupsBelongToIp(groupIds, input.ipId);
    const primaryGroupId = groupIds[0] ?? null;

    const result = await db.runAsync(
      `INSERT INTO image_assets (
        ipId,
        importBatchId,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.ipId,
      input.importBatchId ?? null,
      primaryGroupId,
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

    if (groupIds.length > 0) {
      for (const groupId of groupIds) {
        await db.runAsync(
          'INSERT OR IGNORE INTO image_groups (imageAssetId, groupId, createdAt) VALUES (?, ?, ?)',
          result.lastInsertRowId,
          groupId,
          now
        );
      }
    }

    await touchParentRecords(input.ipId, primaryGroupId);

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

    const nextGroupIds =
      input.groupIds !== undefined
        ? normalizeGroupIds(input.groupIds)
        : input.groupId !== undefined
          ? normalizeGroupIds(input.groupId != null ? [input.groupId] : [])
          : null;
    const nextPrimaryGroupId = nextGroupIds ? nextGroupIds[0] ?? null : input.groupId;
    const nextIpId = input.ipId ?? current.ipId;

    if (nextGroupIds) {
      await ensureGroupsBelongToIp(nextGroupIds, nextIpId);
    } else if (nextPrimaryGroupId != null) {
      await ensureGroupBelongsToIp(nextPrimaryGroupId, nextIpId);
    }

    const updates = buildUpdateStatement({
      ipId: input.ipId,
      importBatchId: input.importBatchId,
      groupId: nextPrimaryGroupId,
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

    if (!updates.setClause && !nextGroupIds) {
      return current;
    }

    let changedCount = 0;
    await db.withTransactionAsync(async () => {
      if (updates.setClause) {
        const result = await db.runAsync(
          `UPDATE image_assets SET ${updates.setClause} WHERE id = ?`,
          ...updates.values,
          id
        );
        changedCount = result.changes;
      } else {
        await db.runAsync('UPDATE image_assets SET updatedAt = ? WHERE id = ?', createTimestamp(), id);
        changedCount = 1;
      }

      if (nextGroupIds) {
        await replaceImageGroupsInTransaction(db, id, nextGroupIds, createTimestamp());
      }
    });

    if (changedCount === 0) {
      return null;
    }

    const nextGroupId = nextGroupIds ? nextGroupIds[0] ?? null : input.groupId !== undefined ? input.groupId : current.groupId;
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

  async findByIpId(ipId: number, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const queryParts = buildImageListQueryParts(['image_assets.ipId = ?'], [ipId], options);
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       ${queryParts.whereClause}
       GROUP BY image_assets.id
       ${queryParts.orderByClause}`,
      ...queryParts.values
    );

    return rows.map(mapImageListItemRow);
  },

  async findByImportBatchId(importBatchId: number, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const queryParts = buildImageListQueryParts(['image_assets.importBatchId = ?'], [importBatchId], options);
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       ${queryParts.whereClause}
       GROUP BY image_assets.id
       ${queryParts.orderByClause}`,
      ...queryParts.values
    );

    return rows.map(mapImageListItemRow);
  },

  async findFiltered(options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const queryParts = buildImageListQueryParts([], [], options);
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       ${queryParts.whereClause}
       GROUP BY image_assets.id
       ${queryParts.orderByClause}`,
      ...queryParts.values
    );

    return rows.map(mapImageListItemRow);
  },

  async findByIds(ids: number[], options?: ImageAssetQueryOptions): Promise<ImageListItem[]> {
    if (ids.length === 0) {
      return [];
    }

    const db = await getDatabase();
    const inClause = buildInClause(ids);
    const deletedFilter = buildDeletedFilter('image_assets', options);
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.id IN (${inClause.placeholders})${deletedFilter ? ` AND ${deletedFilter}` : ''}
       GROUP BY image_assets.id
       ORDER BY image_assets.createdAt DESC, image_assets.id DESC`,
      ...inClause.values
    );

    return rows.map(mapImageListItemRow);
  },

  async findByGroupId(groupId: number, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const queryParts = buildImageListQueryParts(
      ['EXISTS (SELECT 1 FROM image_groups AS filter_groups WHERE filter_groups.imageAssetId = image_assets.id AND filter_groups.groupId = ?)'],
      [groupId],
      options
    );
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       ${queryParts.whereClause}
       GROUP BY image_assets.id
       ${queryParts.orderByClause}`,
      ...queryParts.values
    );

    return rows.map(mapImageListItemRow);
  },

  async findByTagId(tagId: number, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const queryParts = buildImageListQueryParts([], [], {
      ...options,
      tagId,
    });
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       ${queryParts.whereClause}
       GROUP BY image_assets.id
       ${queryParts.orderByClause}`,
      ...queryParts.values
    );

    return rows.map(mapImageListItemRow);
  },

  async findFavorites(options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const queryParts = buildImageListQueryParts([], [], {
      ...options,
      favoritesOnly: true,
    });
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       ${queryParts.whereClause}
       GROUP BY image_assets.id
       ${queryParts.orderByClause}`,
      ...queryParts.values
    );

    return rows.map(mapImageListItemRow);
  },

  async findRecentViewed(limit = 60): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.deletedAt IS NULL AND image_assets.lastViewedAt IS NOT NULL
       GROUP BY image_assets.id
       ORDER BY image_assets.lastViewedAt DESC, image_assets.id DESC
       LIMIT ?`,
      limit
    );

    return rows.map(mapImageListItemRow);
  },

  async findDeleted(): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.deletedAt IS NOT NULL
       GROUP BY image_assets.id
       ORDER BY image_assets.deletedAt DESC, image_assets.id DESC`
    );

    return rows.map(mapImageListItemRow);
  },

  async findDeletedByIpId(ipId: number): Promise<ImageListItem[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.deletedAt IS NOT NULL AND image_assets.ipId = ?
       GROUP BY image_assets.id
       ORDER BY image_assets.deletedAt DESC, image_assets.id DESC`,
      ipId
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

  async findGroupsByImageId(imageId: number): Promise<GroupRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GroupRow>(
      `SELECT groups.*
       FROM groups
       INNER JOIN image_groups ON image_groups.groupId = groups.id
       WHERE image_groups.imageAssetId = ?
       ORDER BY groups.isPinned DESC, groups.type ASC, groups.sortOrder ASC, image_groups.createdAt ASC, groups.id ASC`,
      imageId
    );

    return rows.map(mapGroupRow);
  },

  async countNeedsOrganizing(scope?: number | NeedsOrganizingScope): Promise<number> {
    const normalizedScope = typeof scope === 'number' ? { ipId: scope } : scope;
    const db = await getDatabase();
    const clauses = [
      'image_assets.deletedAt IS NULL',
      `(NOT EXISTS (SELECT 1 FROM image_groups WHERE image_groups.imageAssetId = image_assets.id)
        OR NOT EXISTS (SELECT 1 FROM image_tags WHERE image_tags.imageAssetId = image_assets.id)
        OR image_assets.note IS NULL)`,
    ];
    const values: number[] = [];

    if (normalizedScope?.ipId != null) {
      clauses.push('image_assets.ipId = ?');
      values.push(normalizedScope.ipId);
    }

    if (normalizedScope?.importBatchId != null) {
      clauses.push('image_assets.importBatchId = ?');
      values.push(normalizedScope.importBatchId);
    }

    const row = await db.getFirstAsync<CountRow>(
      `SELECT COUNT(*) AS count FROM image_assets WHERE ${clauses.join(' AND ')}`,
      ...values
    );
    return row?.count ?? 0;
  },

  async getOrganizationProgress(ipId: number): Promise<IpOrganizationProgress> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      totalCount: number;
      organizedCount: number;
      ungroupedCount: number;
      untaggedCount: number;
      recentImportUnorganizedCount: number;
    }>(
      `SELECT
        COUNT(*) AS totalCount,
        SUM(CASE
          WHEN EXISTS (SELECT 1 FROM image_groups WHERE image_groups.imageAssetId = image_assets.id)
           AND EXISTS (SELECT 1 FROM image_tags WHERE image_tags.imageAssetId = image_assets.id)
           AND image_assets.note IS NOT NULL
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
          WHEN image_assets.importBatchId IS NOT NULL
           AND image_assets.createdAt >= datetime('now', '-14 days')
           AND (
             NOT EXISTS (SELECT 1 FROM image_groups WHERE image_groups.imageAssetId = image_assets.id)
             OR NOT EXISTS (SELECT 1 FROM image_tags WHERE image_tags.imageAssetId = image_assets.id)
             OR image_assets.note IS NULL
           )
          THEN 1 ELSE 0 END
        ) AS recentImportUnorganizedCount
       FROM image_assets
       WHERE image_assets.ipId = ? AND image_assets.deletedAt IS NULL`,
      ipId
    );
    const totalCount = row?.totalCount ?? 0;
    const organizedCount = row?.organizedCount ?? 0;

    return {
      totalCount,
      organizedCount,
      organizationPercent: totalCount > 0 ? Math.round((organizedCount / totalCount) * 100) : 100,
      ungroupedCount: row?.ungroupedCount ?? 0,
      untaggedCount: row?.untaggedCount ?? 0,
      recentImportUnorganizedCount: row?.recentImportUnorganizedCount ?? 0,
    };
  },

  async findNeedsOrganizing(scope?: NeedsOrganizingScope | number): Promise<ImageListItem[]> {
    const normalizedScope = typeof scope === 'number' ? { ipId: scope } : scope;
    const clauses = [
      'image_assets.deletedAt IS NULL',
      `(NOT EXISTS (SELECT 1 FROM image_groups WHERE image_groups.imageAssetId = image_assets.id)
        OR NOT EXISTS (SELECT 1 FROM image_tags WHERE image_tags.imageAssetId = image_assets.id)
        OR image_assets.note IS NULL)`,
    ];
    const values: number[] = [];

    if (normalizedScope?.ipId != null) {
      clauses.push('image_assets.ipId = ?');
      values.push(normalizedScope.ipId);
    }

    if (normalizedScope?.importBatchId != null) {
      clauses.push('image_assets.importBatchId = ?');
      values.push(normalizedScope.importBatchId);
    }

    const db = await getDatabase();
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE ${clauses.join(' AND ')}
       GROUP BY image_assets.id
       ORDER BY image_assets.createdAt ASC, image_assets.id ASC`,
      ...values
    );

    return rows.map(mapImageListItemRow);
  },

  async findSuspectedDuplicateGroupsByImportBatchId(importBatchId: number): Promise<SuspectedDuplicateGroup[]> {
    const images = await this.findByImportBatchId(importBatchId);
    const groups = new Map<string, ImageListItem[]>();

    for (const image of images) {
      const key = `${image.width}x${image.height}:${image.fileSize}`;
      groups.set(key, [...(groups.get(key) ?? []), image]);
    }

    return [...groups.entries()]
      .map(([key, duplicateImages]) => ({
        key,
        width: duplicateImages[0]?.width ?? 0,
        height: duplicateImages[0]?.height ?? 0,
        fileSize: duplicateImages[0]?.fileSize ?? 0,
        images: duplicateImages,
      }))
      .filter((group) => group.images.length > 1)
      .sort((left, right) => right.images.length - left.images.length || right.fileSize - left.fileSize);
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
      groupIds?: number[];
      note?: string | null;
      isFavorite?: boolean;
    }
  ): Promise<ImageAssetRecord | null> {
    const current = await this.findById(id, { includeDeleted: true });
    if (!current) {
      return null;
    }

    if (input.groupIds !== undefined) {
      await ensureGroupsBelongToIp(input.groupIds, current.ipId);
    } else if (input.groupId != null) {
      await ensureGroupBelongsToIp(input.groupId, current.ipId);
    }

    try {
      return this.update(id, {
        originalFilename: input.originalFilename,
        groupId: input.groupId,
        groupIds: input.groupIds,
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
    return this.setImageGroups(id, groupId != null ? [groupId] : []);
  },

  async setImageGroups(id: number, groupIds: number[]): Promise<ImageAssetRecord | null> {
    const current = await this.findById(id, { includeDeleted: true });
    if (!current) {
      return null;
    }

    const nextGroupIds = normalizeGroupIds(groupIds);
    await ensureGroupsBelongToIp(nextGroupIds, current.ipId);
    const db = await getDatabase();
    const previousGroupIds = await loadGroupIdsByImageIds(db, [id]);
    const now = createTimestamp();

    try {
      await db.withTransactionAsync(async () => {
        await replaceImageGroupsInTransaction(db, id, nextGroupIds, now);
        await db.runAsync('UPDATE image_assets SET updatedAt = ? WHERE id = ?', now, id);
        await touchParentRecordsByGroupIds(
          db,
          [current.ipId],
          [...(previousGroupIds.get(id) ?? []), ...nextGroupIds]
        );
      });

      return this.findById(id, { includeDeleted: true });
    } catch (error) {
      console.error('Pixory imageRepository.setImageGroups failed.', {
        imageId: id,
        groupIds: nextGroupIds,
        error,
      });
      throw error;
    }
  },

  async findGroupIdsByImageId(imageId: number): Promise<number[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ groupId: number }>(
      'SELECT groupId FROM image_groups WHERE imageAssetId = ? ORDER BY createdAt ASC, groupId ASC',
      imageId
    );
    return rows.map((row) => row.groupId);
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

  async touchLastViewedAt(id: number): Promise<ImageAssetRecord | null> {
    const db = await getDatabase();
    const viewedAt = createTimestamp();
    const result = await db.runAsync(
      'UPDATE image_assets SET lastViewedAt = ? WHERE id = ? AND deletedAt IS NULL',
      viewedAt,
      id
    );

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
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

    const nextGroupIds = groupId != null ? [groupId] : [];
    await ensureGroupsBelongToIp(nextGroupIds, ipIds[0]);

    const db = await getDatabase();
    const now = createTimestamp();
    const inClause = buildInClause(currentImages.map((image) => image.id));
    const previousGroupIds = await loadGroupIdsByImageIds(db, currentImages.map((image) => image.id));

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

        for (const image of currentImages) {
          await replaceImageGroupsInTransaction(db, image.id, nextGroupIds, now);
        }

        const parentRecords = [
          ...currentImages.map((image) => ({ ipId: image.ipId, groupId: image.groupId })),
          ...currentImages.map((image) => ({ ipId: image.ipId, groupId })),
        ];
        await touchManyParentRecords(db, parentRecords);
        await touchParentRecordsByGroupIds(
          db,
          ipIds,
          [...previousGroupIds.values()].flat().concat(nextGroupIds)
        );
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

  async addManyToGroup(imageIds: number[], groupId: number): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(imageIds);
    if (currentImages.length === 0) {
      return 0;
    }

    const ipIds = [...new Set(currentImages.map((image) => image.ipId))];
    if (ipIds.length !== 1) {
      throw new Error('Batch group update requires all images to belong to the same IP.');
    }

    await ensureGroupBelongsToIp(groupId, ipIds[0]);

    const db = await getDatabase();
    const now = createTimestamp();
    let changedCount = 0;

    try {
      await db.withTransactionAsync(async () => {
        for (const image of currentImages) {
          const result = await db.runAsync(
            'INSERT OR IGNORE INTO image_groups (imageAssetId, groupId, createdAt) VALUES (?, ?, ?)',
            image.id,
            groupId,
            now
          );
          changedCount += result.changes;

          if (image.groupId == null) {
            await db.runAsync('UPDATE image_assets SET groupId = ?, updatedAt = ? WHERE id = ?', groupId, now, image.id);
          } else {
            await db.runAsync('UPDATE image_assets SET updatedAt = ? WHERE id = ?', now, image.id);
          }
        }

        await touchParentRecordsByGroupIds(db, ipIds, [groupId]);
      });

      return changedCount;
    } catch (error) {
      console.error('Pixory imageRepository.addManyToGroup failed.', {
        imageIds: currentImages.map((image) => image.id),
        groupId,
        error,
      });
      throw error;
    }
  },

  async removeManyFromGroup(imageIds: number[], groupId: number): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(imageIds);
    if (currentImages.length === 0) {
      return 0;
    }

    const db = await getDatabase();
    const now = createTimestamp();
    const previousGroupIds = await loadGroupIdsByImageIds(db, currentImages.map((image) => image.id));
    let changedCount = 0;

    try {
      await db.withTransactionAsync(async () => {
        for (const image of currentImages) {
          const existingGroupIds = previousGroupIds.get(image.id) ?? [];
          const nextGroupIds = existingGroupIds.filter((item) => item !== groupId);
          const deleteResult = await db.runAsync(
            'DELETE FROM image_groups WHERE imageAssetId = ? AND groupId = ?',
            image.id,
            groupId
          );
          changedCount += deleteResult.changes;
          await db.runAsync(
            'UPDATE image_assets SET groupId = ?, updatedAt = ? WHERE id = ?',
            nextGroupIds[0] ?? null,
            now,
            image.id
          );
        }

        await touchParentRecordsByGroupIds(
          db,
          [...new Set(currentImages.map((image) => image.ipId))],
          [groupId]
        );
      });

      return changedCount;
    } catch (error) {
      console.error('Pixory imageRepository.removeManyFromGroup failed.', {
        imageIds: currentImages.map((image) => image.id),
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

  async updateManyNote(imageIds: number[], note: string | null): Promise<number> {
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
           SET note = ?, updatedAt = ?
           WHERE id IN (${inClause.placeholders})`,
          normalizeOptionalText(note) ?? null,
          now,
          ...inClause.values
        );
        changedCount = updateResult.changes;

        await touchManyParentRecords(db, currentImages);
      });

      return changedCount;
    } catch (error) {
      console.error('Pixory imageRepository.updateManyNote failed.', {
        imageIds: inClause.values,
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

  async restoreMany(imageIds: number[]): Promise<number> {
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
           SET deletedAt = NULL, updatedAt = ?
           WHERE id IN (${inClause.placeholders}) AND deletedAt IS NOT NULL`,
          now,
          ...inClause.values
        );
        changedCount = updateResult.changes;

        await touchManyParentRecords(db, currentImages);
      });

      for (const ipId of [...new Set(currentImages.map((image) => image.ipId))]) {
        await ipRepository.restoreById(ipId);
      }

      return changedCount;
    } catch (error) {
      console.error('Pixory imageRepository.restoreMany failed.', {
        imageIds: inClause.values,
        error,
      });
      throw error;
    }
  },

  async deletePermanentlyMany(imageIds: number[]): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(imageIds);
    if (currentImages.length === 0) {
      return 0;
    }

    const db = await getDatabase();
    const inClause = buildInClause(currentImages.map((image) => image.id));

    try {
      let changedCount = 0;
      await db.withTransactionAsync(async () => {
        const deleteResult = await db.runAsync(
          `DELETE FROM image_assets WHERE id IN (${inClause.placeholders})`,
          ...inClause.values
        );
        changedCount = deleteResult.changes;

        await touchManyParentRecords(db, currentImages);
      });

      return changedCount;
    } catch (error) {
      console.error('Pixory imageRepository.deletePermanentlyMany failed.', {
        imageIds: inClause.values,
        error,
      });
      throw error;
    }
  },

  async countFavorites(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<CountRow>(
      'SELECT COUNT(*) AS count FROM image_assets WHERE deletedAt IS NULL AND isFavorite = 1'
    );
    return row?.count ?? 0;
  },

  async countDeleted(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<CountRow>(
      'SELECT COUNT(*) AS count FROM image_assets WHERE deletedAt IS NOT NULL'
    );
    return row?.count ?? 0;
  },

  async sumFileSize(options?: ImageAssetQueryOptions): Promise<number> {
    const db = await getDatabase();
    const deletedFilter = buildDeletedFilter('', options);
    const row = await db.getFirstAsync<SumRow>(
      `SELECT COALESCE(SUM(fileSize), 0) AS totalBytes FROM image_assets${deletedFilter ? ` WHERE ${deletedFilter}` : ''}`
    );
    return row?.totalBytes ?? 0;
  },
};

export default imageRepository;
