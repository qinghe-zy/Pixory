import { ipRepository } from './ipRepository';
import type {
  CountRow,
  CreateImageAssetInput,
  ImageAssetQueryOptions,
  AssetMediaTypeFilter,
  ImageAssetRecord,
  ImageAssetRow,
  ImageDetailRecord,
  ImageDetailRow,
  ImageListQueryOptions,
  ImageListItem,
  ImageListItemRow,
  DuplicateImageGroup,
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

const VISUAL_HASH_REVIEW_DISTANCE_THRESHOLD = 6;

function buildDeletedFilter(columnPrefix = '', options?: ImageAssetQueryOptions): string {
  const filters: string[] = [];
  const deletedColumn = columnPrefix ? `${columnPrefix}.deletedAt` : 'deletedAt';
  const mediaTypeColumn = columnPrefix ? `${columnPrefix}.mediaType` : 'mediaType';
  const mediaType = resolveMediaTypeFilter(options?.mediaType);

  if (!options?.includeDeleted) {
    filters.push(`${deletedColumn} IS NULL`);
  }

  if (mediaType !== 'all') {
    filters.push(`${mediaTypeColumn} = '${mediaType}'`);
  }

  return filters.join(' AND ');
}

function resolveMediaTypeFilter(mediaType?: AssetMediaTypeFilter): AssetMediaTypeFilter {
  return mediaType ?? 'image';
}

function buildOrderByClause(orderBy?: ImageListQueryOptions['orderBy']): string {
  if (orderBy === 'createdAtAsc') {
    return 'ORDER BY image_assets.createdAt ASC, image_assets.id ASC';
  }

  if (orderBy === 'updatedAtDesc') {
    return 'ORDER BY image_assets.updatedAt DESC, image_assets.id DESC';
  }

  if (orderBy === 'updatedAtAsc') {
    return 'ORDER BY image_assets.updatedAt ASC, image_assets.id ASC';
  }

  if (orderBy === 'lastViewedAtDesc') {
    return 'ORDER BY image_assets.lastViewedAt DESC, image_assets.id DESC';
  }

  if (orderBy === 'lastViewedAtAsc') {
    return 'ORDER BY image_assets.lastViewedAt ASC, image_assets.id ASC';
  }

  if (orderBy === 'sourceOrderAsc') {
    return 'ORDER BY image_assets.sourceOrder ASC, image_assets.createdAt ASC, image_assets.id ASC';
  }

  if (orderBy === 'sourceOrderDesc') {
    return 'ORDER BY image_assets.sourceOrder DESC, image_assets.createdAt DESC, image_assets.id DESC';
  }

  if (orderBy === 'deletedAtDesc') {
    return 'ORDER BY image_assets.deletedAt DESC, image_assets.id DESC';
  }

  if (orderBy === 'filenameAsc') {
    return 'ORDER BY image_assets.originalFilename COLLATE NOCASE ASC, image_assets.id ASC';
  }

  if (orderBy === 'filenameDesc') {
    return 'ORDER BY image_assets.originalFilename COLLATE NOCASE DESC, image_assets.id DESC';
  }

  if (orderBy === 'fileSizeDesc') {
    return 'ORDER BY image_assets.fileSize DESC, image_assets.id DESC';
  }

  if (orderBy === 'fileSizeAsc') {
    return 'ORDER BY image_assets.fileSize ASC, image_assets.id ASC';
  }

  return 'ORDER BY image_assets.createdAt DESC, image_assets.id DESC';
}

function parseBase36CodeSegment(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 36);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildImageAssetSearchCodeExpression(searchText: string): { clause: string; values: number[] } | null {
  const upperSearchText = searchText.toUpperCase().trim();
  const match = /^PX-([0-9A-Z]+)(?:-([0-9A-Z]+))?(?:-(\d+)X(\d+))?$/.exec(upperSearchText);

  if (!match) {
    return null;
  }

  const ipId = parseBase36CodeSegment(match[1]);
  const imageId = parseBase36CodeSegment(match[2]);
  const clauses: string[] = [];
  const values: number[] = [];

  if (ipId != null) {
    clauses.push('image_assets.ipId = ?');
    values.push(ipId);
  }

  if (imageId != null) {
    clauses.push('image_assets.id = ?');
    values.push(imageId);
  }

  if (match[3] && match[4]) {
    clauses.push('image_assets.width = ? AND image_assets.height = ?');
    values.push(Number(match[3]), Number(match[4]));
  }

  return clauses.length > 0 ? { clause: `(${clauses.join(' AND ')})`, values } : null;
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

  if (options?.ipIds && options.ipIds.length > 0) {
    const ipInClause = buildInClause(options.ipIds);
    clauses.push(`image_assets.ipId IN (${ipInClause.placeholders})`);
    values.push(...ipInClause.values);
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

  if (options?.groupIds && options.groupIds.length > 0) {
    const groupInClause = buildInClause(options.groupIds);
    clauses.push(
      `EXISTS (SELECT 1 FROM image_groups AS filter_groups WHERE filter_groups.imageAssetId = image_assets.id AND filter_groups.groupId IN (${groupInClause.placeholders}))`
    );
    values.push(...groupInClause.values);
  }

  if (options?.tagId != null) {
    clauses.push(
      'EXISTS (SELECT 1 FROM image_tags AS filter_tags WHERE filter_tags.imageAssetId = image_assets.id AND filter_tags.tagId = ?)'
    );
    values.push(options.tagId);
  }

  if (options?.tagIds && options.tagIds.length > 0) {
    const tagInClause = buildInClause(options.tagIds);
    clauses.push(
      `EXISTS (SELECT 1 FROM image_tags AS filter_tags WHERE filter_tags.imageAssetId = image_assets.id AND filter_tags.tagId IN (${tagInClause.placeholders}))`
    );
    values.push(...tagInClause.values);
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
    const codeExpression = buildImageAssetSearchCodeExpression(searchText);
    const searchClauses = [
      `image_assets.originalFilename LIKE ?`,
      `image_assets.note LIKE ?`,
      `ips.name LIKE ?`,
      `EXISTS (
        SELECT 1
        FROM image_tags AS search_image_tags
        INNER JOIN tags AS search_tags ON search_tags.id = search_image_tags.tagId
        WHERE search_image_tags.imageAssetId = image_assets.id
          AND search_tags.name LIKE ?
      )`,
      `EXISTS (
        SELECT 1
        FROM image_groups AS search_image_groups
        INNER JOIN groups AS search_groups ON search_groups.id = search_image_groups.groupId
        WHERE search_image_groups.imageAssetId = image_assets.id
          AND search_groups.name LIKE ?
      )`,
    ];
    if (codeExpression) {
      searchClauses.push(codeExpression.clause);
    }
    clauses.push(`(${searchClauses.join(' OR ')})`);
    const likeValue = `%${searchText}%`;
    values.push(likeValue, likeValue, likeValue, likeValue, likeValue);
    if (codeExpression) {
      values.push(...codeExpression.values);
    }
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
    orderByClause: buildOrderByClause(options?.orderBy ?? (options?.importBatchId != null ? 'sourceOrderAsc' : undefined)),
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

function isVisualHash(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{16}$/i.test(value);
}

function countBits(value: number): number {
  let count = 0;
  let next = value;
  while (next > 0) {
    count += next & 1;
    next >>= 1;
  }
  return count;
}

function getVisualHashDistance(left: string | null | undefined, right: string | null | undefined): number | null {
  if (!isVisualHash(left) || !isVisualHash(right)) {
    return null;
  }

  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftNibble = Number.parseInt(left[index], 16);
    const rightNibble = Number.parseInt(right[index], 16);
    distance += countBits(leftNibble ^ rightNibble);
  }

  return distance;
}

function belongsToVisualGroup(image: ImageListItem, groupImages: ImageListItem[]): boolean {
  return groupImages.some((groupImage) => {
    const distance = getVisualHashDistance(image.visualHash, groupImage.visualHash);
    return distance != null && distance <= VISUAL_HASH_REVIEW_DISTANCE_THRESHOLD;
  });
}

async function loadImagesByIds(db: SQLiteDatabase, ids: number[]): Promise<ImageAssetRecord[]> {
  const inClause = buildInClause(ids);
  const rows = await db.getAllAsync<ImageAssetRow>(
    `SELECT * FROM image_assets WHERE id IN (${inClause.placeholders})`,
    ...inClause.values
  );

  return rows.map(mapImageAssetRow);
}

async function touchParentRecords(db: SQLiteDatabase, ipId: number, groupId?: number | null): Promise<void> {
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

async function ensureGroupBelongsToIp(db: SQLiteDatabase, groupId: number, ipId: number): Promise<void> {
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

async function ensureGroupsBelongToIp(db: SQLiteDatabase, groupIds: number[], ipId: number): Promise<void> {
  const uniqueGroupIds = normalizeGroupIds(groupIds);

  for (const groupId of uniqueGroupIds) {
    await ensureGroupBelongsToIp(db, groupId, ipId);
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
    (SELECT COUNT(DISTINCT image_tags.tagId) FROM image_tags WHERE image_tags.imageAssetId = image_assets.id) AS tagCount,
    (
      SELECT GROUP_CONCAT(tags.name, char(31))
      FROM image_tags
      INNER JOIN tags ON tags.id = image_tags.tagId
      WHERE image_tags.imageAssetId = image_assets.id
      ORDER BY tags.name COLLATE NOCASE ASC, tags.id ASC
    ) AS tagNames
  FROM image_assets
  INNER JOIN ips ON ips.id = image_assets.ipId
`;

export const imageRepository = {
  async create(db: SQLiteDatabase, input: CreateImageAssetInput): Promise<ImageAssetRecord> {
    const now = createTimestamp();
    const groupIds = normalizeGroupIds(input.groupIds ?? (input.groupId != null ? [input.groupId] : []));
    await ensureGroupsBelongToIp(db, groupIds, input.ipId);
    const primaryGroupId = groupIds[0] ?? null;

    const result = await db.runAsync(
      `INSERT INTO image_assets (
        ipId,
        importBatchId,
        sourceOrder,
        groupId,
        mediaType,
        originalFileUri,
        thumbnailFileUri,
        coverThumbnailFileUri,
        originalFilename,
        internalFilename,
        width,
        height,
        durationMs,
        mimeType,
        fileSize,
        isFavorite,
        note,
        deletedAt,
        createdAt,
        updatedAt,
        lastViewedAt,
        lastPlaybackPositionMs,
        previewStatus,
        contentHash,
        visualHash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.ipId,
      input.importBatchId ?? null,
      input.sourceOrder ?? null,
      primaryGroupId,
      input.mediaType ?? 'image',
      requireNonEmptyText(input.originalFileUri, 'Original file URI'),
      normalizeOptionalText(input.thumbnailFileUri) ?? null,
      normalizeOptionalText(input.coverThumbnailFileUri) ?? null,
      requireNonEmptyText(input.originalFilename, 'Original filename'),
      requireNonEmptyText(input.internalFilename, 'Internal filename'),
      input.width,
      input.height,
      input.durationMs ?? null,
      requireNonEmptyText(input.mimeType, 'MIME type'),
      input.fileSize,
      booleanToSqlite(input.isFavorite ?? false),
      normalizeOptionalText(input.note) ?? null,
      input.deletedAt ?? null,
      now,
      now,
      input.lastViewedAt ?? null,
      input.lastPlaybackPositionMs ?? null,
      input.previewStatus ?? 'ready',
      normalizeOptionalText(input.contentHash) ?? null,
      normalizeOptionalText(input.visualHash) ?? null
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

    await touchParentRecords(db, input.ipId, primaryGroupId);

    const record = await this.findById(db, result.lastInsertRowId, {
      includeDeleted: true,
      mediaType: input.mediaType ?? 'image',
    });
    if (!record) {
      throw new Error(`Image asset ${result.lastInsertRowId} was created but could not be reloaded.`);
    }

    return record;
  },

  async update(db: SQLiteDatabase, id: number, input: UpdateImageAssetInput): Promise<ImageAssetRecord | null> {
    const current = await this.findById(db, id, {
      includeDeleted: true,
      mediaType: input.mediaType ?? 'image',
    });
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
      await ensureGroupsBelongToIp(db, nextGroupIds, nextIpId);
    } else if (nextPrimaryGroupId != null) {
      await ensureGroupBelongsToIp(db, nextPrimaryGroupId, nextIpId);
    }

    const updates = buildUpdateStatement({
      ipId: input.ipId,
      importBatchId: input.importBatchId,
      sourceOrder: input.sourceOrder,
      groupId: nextPrimaryGroupId,
      mediaType: input.mediaType,
      originalFileUri:
        input.originalFileUri !== undefined
          ? requireNonEmptyText(input.originalFileUri, 'Original file URI')
          : undefined,
      thumbnailFileUri: normalizeOptionalText(input.thumbnailFileUri),
      coverThumbnailFileUri: normalizeOptionalText(input.coverThumbnailFileUri),
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
      durationMs: input.durationMs,
      mimeType: input.mimeType !== undefined ? requireNonEmptyText(input.mimeType, 'MIME type') : undefined,
      fileSize: input.fileSize,
      isFavorite: input.isFavorite !== undefined ? booleanToSqlite(input.isFavorite) : undefined,
      note: normalizeOptionalText(input.note),
      deletedAt: input.deletedAt,
      lastViewedAt: input.lastViewedAt,
      lastPlaybackPositionMs: input.lastPlaybackPositionMs,
      previewStatus: input.previewStatus,
      contentHash: normalizeOptionalText(input.contentHash),
      visualHash: normalizeOptionalText(input.visualHash),
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
    await touchParentRecords(db, nextIpId, nextGroupId);

    if (current.ipId !== nextIpId || current.groupId !== nextGroupId) {
      await touchParentRecords(db, current.ipId, current.groupId);
    }

    return this.findById(db, id, { includeDeleted: true, mediaType: input.mediaType ?? current.mediaType });
  },

  async findById(db: SQLiteDatabase, id: number, options?: ImageAssetQueryOptions): Promise<ImageAssetRecord | null> {
    const deletedFilter = buildDeletedFilter('', options);
    const row = await db.getFirstAsync<ImageAssetRow>(
      `SELECT * FROM image_assets WHERE id = ?${deletedFilter ? ` AND ${deletedFilter}` : ''}`,
      id
    );

    return row ? mapImageAssetRow(row) : null;
  },

  async findAll(db: SQLiteDatabase, options?: ImageAssetQueryOptions): Promise<ImageAssetRecord[]> {
    const deletedFilter = buildDeletedFilter('', options);
    const rows = await db.getAllAsync<ImageAssetRow>(
      `SELECT * FROM image_assets${deletedFilter ? ` WHERE ${deletedFilter}` : ''} ORDER BY updatedAt DESC, id DESC`
    );

    return rows.map(mapImageAssetRow);
  },

  async findRecentByIpId(db: SQLiteDatabase, ipId: number, limit = 6, options?: ImageAssetQueryOptions): Promise<ImageListItem[]> {
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.ipId = ? AND ${buildDeletedFilter('image_assets', options)}
       GROUP BY image_assets.id
       ORDER BY image_assets.createdAt DESC, image_assets.id DESC
       LIMIT ?`,
      ipId,
      limit
    );

    return rows.map(mapImageListItemRow);
  },

  async findByIpId(db: SQLiteDatabase, ipId: number, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
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

  async findByImportBatchId(db: SQLiteDatabase, importBatchId: number, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
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

  async findFiltered(db: SQLiteDatabase, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
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

  async findByIds(db: SQLiteDatabase, ids: number[], options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    if (ids.length === 0) {
      return [];
    }
    const inClause = buildInClause(ids);
    const deletedFilter = buildDeletedFilter('image_assets', options);
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.id IN (${inClause.placeholders})${deletedFilter ? ` AND ${deletedFilter}` : ''}
       GROUP BY image_assets.id
       ${buildOrderByClause(options?.orderBy)}`,
      ...inClause.values
    );

    return rows.map(mapImageListItemRow);
  },

  async findByGroupId(db: SQLiteDatabase, groupId: number, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
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

  async findByTagId(db: SQLiteDatabase, tagId: number, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
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

  async findFavorites(db: SQLiteDatabase, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
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

  async findRecentViewed(db: SQLiteDatabase, limit = 60, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    const queryParts = buildImageListQueryParts(['image_assets.lastViewedAt IS NOT NULL'], [], {
      ...options,
      orderBy: options?.orderBy ?? 'lastViewedAtDesc',
    });
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       ${queryParts.whereClause}
       GROUP BY image_assets.id
       ${queryParts.orderByClause}
       LIMIT ?`,
      ...queryParts.values,
      limit
    );

    return rows.map(mapImageListItemRow);
  },

  async findDeleted(db: SQLiteDatabase, options?: ImageAssetQueryOptions): Promise<ImageListItem[]> {
    const mediaFilter = options?.mediaType === 'all' ? '' : ` AND image_assets.mediaType = '${options?.mediaType ?? 'image'}'`;
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.deletedAt IS NOT NULL${mediaFilter}
       GROUP BY image_assets.id
       ORDER BY image_assets.deletedAt DESC, image_assets.id DESC`
    );

    return rows.map(mapImageListItemRow);
  },

  async findDeletedByIpId(db: SQLiteDatabase, ipId: number, options?: ImageAssetQueryOptions): Promise<ImageListItem[]> {
    const mediaFilter = options?.mediaType === 'all' ? '' : ` AND image_assets.mediaType = '${options?.mediaType ?? 'image'}'`;
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE image_assets.deletedAt IS NOT NULL${mediaFilter} AND image_assets.ipId = ?
       GROUP BY image_assets.id
       ORDER BY image_assets.deletedAt DESC, image_assets.id DESC`,
      ipId
    );

    return rows.map(mapImageListItemRow);
  },

  async findDetailById(db: SQLiteDatabase, id: number, options?: ImageAssetQueryOptions): Promise<ImageDetailRecord | null> {
    const deletedFilter = buildDeletedFilter('image_assets', options);
    const row = await db.getFirstAsync<ImageDetailRow>(
      `${IMAGE_WITH_RELATIONS_SELECT}
       WHERE image_assets.id = ?${deletedFilter ? ` AND ${deletedFilter}` : ''}`,
      id
    );

    return row ? mapImageDetailRow(row) : null;
  },

  async findGroupsByImageId(db: SQLiteDatabase, imageId: number): Promise<GroupRecord[]> {
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

  async countNeedsOrganizing(db: SQLiteDatabase, scope?: number | NeedsOrganizingScope): Promise<number> {
    const normalizedScope = typeof scope === 'number' ? { ipId: scope } : scope;
    const clauses = [
      'image_assets.deletedAt IS NULL',
      "image_assets.mediaType = 'image'",
      'NOT EXISTS (SELECT 1 FROM image_groups WHERE image_groups.imageAssetId = image_assets.id)',
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

  async getOrganizationProgress(db: SQLiteDatabase, ipId: number): Promise<IpOrganizationProgress> {
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
           )
          THEN 1 ELSE 0 END
        ) AS recentImportUnorganizedCount
       FROM image_assets
       WHERE image_assets.ipId = ? AND image_assets.deletedAt IS NULL AND image_assets.mediaType = 'image'`,
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

  async findNeedsOrganizing(db: SQLiteDatabase, scope?: NeedsOrganizingScope | number): Promise<ImageListItem[]> {
    const normalizedScope = typeof scope === 'number' ? { ipId: scope } : scope;
    const clauses = [
      'image_assets.deletedAt IS NULL',
      "image_assets.mediaType = 'image'",
      'NOT EXISTS (SELECT 1 FROM image_groups WHERE image_groups.imageAssetId = image_assets.id)',
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
    const orderByClause = normalizedScope?.importBatchId != null
      ? 'ORDER BY image_assets.sourceOrder ASC, image_assets.createdAt ASC, image_assets.id ASC'
      : 'ORDER BY image_assets.createdAt ASC, image_assets.id ASC';
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       WHERE ${clauses.join(' AND ')}
       GROUP BY image_assets.id
       ${orderByClause}`,
      ...values
    );

    return rows.map(mapImageListItemRow);
  },

  async findSuspectedDuplicateGroupsByImportBatchId(db: SQLiteDatabase, importBatchId: number): Promise<SuspectedDuplicateGroup[]> {
    const images = await this.findByImportBatchId(db, importBatchId);
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

  async findByContentHash(db: SQLiteDatabase, contentHash: string, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    const normalizedHash = normalizeOptionalText(contentHash);
    if (!normalizedHash) {
      return [];
    }

    const queryParts = buildImageListQueryParts(['image_assets.contentHash = ?'], [normalizedHash], {
      ...options,
      mediaType: options?.mediaType ?? 'all',
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

  async findByVisualHash(db: SQLiteDatabase, visualHash: string, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    const normalizedHash = normalizeOptionalText(visualHash);
    if (!isVisualHash(normalizedHash)) {
      return [];
    }

    const queryParts = buildImageListQueryParts(["image_assets.visualHash IS NOT NULL", "image_assets.mediaType = 'image'"], [], options);
    const rows = await db.getAllAsync<ImageListItemRow>(
      `${IMAGE_LIST_SELECT}
       ${queryParts.whereClause}
       GROUP BY image_assets.id
       ${queryParts.orderByClause}`,
      ...queryParts.values
    );

    return rows
      .map(mapImageListItemRow)
      .filter((image) => {
        const distance = getVisualHashDistance(normalizedHash, image.visualHash);
        return distance != null && distance <= VISUAL_HASH_REVIEW_DISTANCE_THRESHOLD;
      });
  },

  async findExactDuplicateGroups(db: SQLiteDatabase, options?: ImageListQueryOptions): Promise<DuplicateImageGroup[]> {
    const images = await this.findFiltered(db, {
      ...options,
      includeDeleted: false,
      mediaType: options?.mediaType ?? 'all',
    });
    const groups = new Map<string, ImageListItem[]>();

    for (const image of images) {
      if (!image.contentHash) {
        continue;
      }
      groups.set(image.contentHash, [...(groups.get(image.contentHash) ?? []), image]);
    }

    return [...groups.entries()]
      .filter(([, duplicateImages]) => duplicateImages.length > 1)
      .map(([key, duplicateImages]) => ({
        key,
        kind: 'exact' as const,
        confidence: 'exact' as const,
        contentHash: key,
        visualHash: null,
        images: duplicateImages,
      }))
      .sort((left, right) => right.images.length - left.images.length || left.key.localeCompare(right.key));
  },

  async findSimilarImageGroups(db: SQLiteDatabase, options?: ImageListQueryOptions): Promise<DuplicateImageGroup[]> {
    const images = await this.findFiltered(db, {
      ...options,
      includeDeleted: false,
      mediaType: 'image',
    });
    const groups: ImageListItem[][] = [];

    for (const image of images) {
      if (!isVisualHash(image.visualHash)) {
        continue;
      }
      const existingGroup = groups.find((groupImages) => belongsToVisualGroup(image, groupImages));
      if (existingGroup) {
        existingGroup.push(image);
      } else {
        groups.push([image]);
      }
    }

    return groups
      .filter((duplicateImages) => duplicateImages.length > 1)
      .map((duplicateImages) => ({
        key: duplicateImages[0]?.visualHash ?? 'similar',
        kind: 'similar' as const,
        confidence: 'review' as const,
        contentHash: null,
        visualHash: duplicateImages[0]?.visualHash ?? null,
        images: duplicateImages,
      }))
      .sort((left, right) => right.images.length - left.images.length || left.key.localeCompare(right.key));
  },

  async findAssetsMissingDuplicateHashes(db: SQLiteDatabase, limit = 50): Promise<ImageAssetRecord[]> {
    const rows = await db.getAllAsync<ImageAssetRow>(
      `SELECT *
       FROM image_assets
       WHERE deletedAt IS NULL
         AND (
           contentHash IS NULL
           OR (mediaType = 'image' AND visualHash IS NULL)
         )
       ORDER BY updatedAt ASC, id ASC
       LIMIT ?`,
      limit
    );

    return rows.map(mapImageAssetRow);
  },

  async updateDuplicateHashes(
    db: SQLiteDatabase,
    id: number,
    hashes: { contentHash?: string | null; visualHash?: string | null }
  ): Promise<ImageAssetRecord | null> {
    const updates = buildUpdateStatement({
      contentHash: normalizeOptionalText(hashes.contentHash),
      visualHash: normalizeOptionalText(hashes.visualHash),
      updatedAt: createTimestamp(),
    });

    if (!updates.setClause) {
      return this.findById(db, id, { includeDeleted: true, mediaType: 'all' });
    }

    const result = await db.runAsync(
      `UPDATE image_assets SET ${updates.setClause} WHERE id = ?`,
      ...updates.values,
      id
    );
    if (result.changes === 0) {
      return null;
    }

    return this.findById(db, id, { includeDeleted: true, mediaType: 'all' });
  },

  async softDelete(db: SQLiteDatabase, id: number): Promise<ImageAssetRecord | null> {
    const affectedCount = await this.softDeleteMany(db, [id]);
    if (affectedCount === 0) {
      return null;
    }

    return this.findById(db, id, { includeDeleted: true });
  },

  async count(db: SQLiteDatabase, options?: ImageAssetQueryOptions): Promise<number> {
    const deletedFilter = buildDeletedFilter('', options);
    const row = await db.getFirstAsync<CountRow>(
      `SELECT COUNT(*) AS count FROM image_assets${deletedFilter ? ` WHERE ${deletedFilter}` : ''}`
    );
    return row?.count ?? 0;
  },

  async updateMetadata(db: SQLiteDatabase,
    id: number,
    input: {
      originalFilename?: string;
      groupId?: number | null;
      groupIds?: number[];
      note?: string | null;
      isFavorite?: boolean;
    }
  ): Promise<ImageAssetRecord | null> {
    const current = await this.findById(db, id, { includeDeleted: true, mediaType: 'all' });
    if (!current) {
      return null;
    }

    if (input.groupIds !== undefined) {
      await ensureGroupsBelongToIp(db, input.groupIds, current.ipId);
    } else if (input.groupId != null) {
      await ensureGroupBelongsToIp(db, input.groupId, current.ipId);
    }

    try {
      return this.update(db, id, {
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

  async updateGroup(db: SQLiteDatabase, id: number, groupId: number | null): Promise<ImageAssetRecord | null> {
    return this.setImageGroups(db, id, groupId != null ? [groupId] : []);
  },

  async setImageGroups(db: SQLiteDatabase, id: number, groupIds: number[]): Promise<ImageAssetRecord | null> {
    const current = await this.findById(db, id, { includeDeleted: true });
    if (!current) {
      return null;
    }

    const nextGroupIds = normalizeGroupIds(groupIds);
    await ensureGroupsBelongToIp(db, nextGroupIds, current.ipId);
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

      return this.findById(db, id, { includeDeleted: true });
    } catch (error) {
      console.error('Pixory imageRepository.setImageGroups failed.', {
        imageId: id,
        groupIds: nextGroupIds,
        error,
      });
      throw error;
    }
  },

  async findGroupIdsByImageId(db: SQLiteDatabase, imageId: number): Promise<number[]> {
    const rows = await db.getAllAsync<{ groupId: number }>(
      'SELECT groupId FROM image_groups WHERE imageAssetId = ? ORDER BY createdAt ASC, groupId ASC',
      imageId
    );
    return rows.map((row) => row.groupId);
  },

  async updateFavorite(db: SQLiteDatabase, id: number, isFavorite: boolean): Promise<ImageAssetRecord | null> {
    try {
      return this.update(db, id, {
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

  async touchLastViewedAt(db: SQLiteDatabase, id: number): Promise<ImageAssetRecord | null> {
    const viewedAt = createTimestamp();
    const result = await db.runAsync(
      'UPDATE image_assets SET lastViewedAt = ? WHERE id = ? AND deletedAt IS NULL',
      viewedAt,
      id
    );

    if (result.changes === 0) {
      return null;
    }

    return this.findById(db, id);
  },

  async clearRecentViewed(db: SQLiteDatabase): Promise<number> {
    const result = await db.runAsync(
      'UPDATE image_assets SET lastViewedAt = NULL WHERE deletedAt IS NULL AND lastViewedAt IS NOT NULL'
    );

    return result.changes;
  },

  async updateManyGroup(db: SQLiteDatabase, imageIds: number[], groupId: number | null): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(db, imageIds);
    if (currentImages.length === 0) {
      return 0;
    }

    const ipIds = [...new Set(currentImages.map((image) => image.ipId))];
    if (ipIds.length !== 1) {
      throw new Error('Batch group move requires all images to belong to the same IP.');
    }

    const nextGroupIds = groupId != null ? [groupId] : [];
    await ensureGroupsBelongToIp(db, nextGroupIds, ipIds[0]);
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

  async addManyToGroup(db: SQLiteDatabase, imageIds: number[], groupId: number): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(db, imageIds);
    if (currentImages.length === 0) {
      return 0;
    }

    const ipIds = [...new Set(currentImages.map((image) => image.ipId))];
    if (ipIds.length !== 1) {
      throw new Error('Batch group update requires all images to belong to the same IP.');
    }

    await ensureGroupBelongsToIp(db, groupId, ipIds[0]);
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

  async removeManyFromGroup(db: SQLiteDatabase, imageIds: number[], groupId: number): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(db, imageIds);
    if (currentImages.length === 0) {
      return 0;
    }
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

  async updateManyFavorite(db: SQLiteDatabase, imageIds: number[], isFavorite: boolean): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(db, imageIds);
    if (currentImages.length === 0) {
      return 0;
    }
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

  async updateManyNote(db: SQLiteDatabase, imageIds: number[], note: string | null): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(db, imageIds);
    if (currentImages.length === 0) {
      return 0;
    }
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

  async softDeleteMany(db: SQLiteDatabase, imageIds: number[]): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(db, imageIds);
    if (currentImages.length === 0) {
      return 0;
    }
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

  async restoreMany(db: SQLiteDatabase, imageIds: number[]): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(db, imageIds);
    if (currentImages.length === 0) {
      return 0;
    }
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
        await ipRepository.restoreById(db, ipId);
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

  async deletePermanentlyMany(db: SQLiteDatabase, imageIds: number[]): Promise<number> {
    if (imageIds.length === 0) {
      return 0;
    }

    const currentImages = await loadImagesByIds(db, imageIds);
    if (currentImages.length === 0) {
      return 0;
    }
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

  async countFavorites(db: SQLiteDatabase): Promise<number> {
    const row = await db.getFirstAsync<CountRow>(
      "SELECT COUNT(*) AS count FROM image_assets WHERE deletedAt IS NULL AND mediaType = 'image' AND isFavorite = 1"
    );
    return row?.count ?? 0;
  },

  async countDeleted(db: SQLiteDatabase): Promise<number> {
    const row = await db.getFirstAsync<CountRow>(
      "SELECT COUNT(*) AS count FROM image_assets WHERE deletedAt IS NOT NULL AND mediaType = 'image'"
    );
    return row?.count ?? 0;
  },

  async countRecentViewed(db: SQLiteDatabase): Promise<number> {
    const row = await db.getFirstAsync<CountRow>(
      "SELECT COUNT(*) AS count FROM image_assets WHERE deletedAt IS NULL AND mediaType = 'image' AND lastViewedAt IS NOT NULL"
    );
    return row?.count ?? 0;
  },

  async sumFileSize(db: SQLiteDatabase, options?: ImageAssetQueryOptions): Promise<number> {
    const deletedFilter = buildDeletedFilter('', options);
    const row = await db.getFirstAsync<SumRow>(
      `SELECT COALESCE(SUM(fileSize), 0) AS totalBytes FROM image_assets${deletedFilter ? ` WHERE ${deletedFilter}` : ''}`
    );
    return row?.totalBytes ?? 0;
  },
};

export default imageRepository;
