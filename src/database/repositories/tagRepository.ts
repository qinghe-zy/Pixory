import type { CountRow, CreateTagInput, TagRecord, TagUsageItem, TagUsageItemRow, UpdateTagInput } from '../types';
import { buildUpdateStatement, createTimestamp, mapTagUsageItemRow, requireNonEmptyText } from '../utils';
import type { SQLiteDatabase } from 'expo-sqlite';

function normalizeTagNames(tagNames: string[]): string[] {
  const deduped = new Map<string, string>();

  for (const rawTagName of tagNames) {
    const tagName = rawTagName.trim();
    if (!tagName) {
      continue;
    }

    const lookupKey = tagName.toLowerCase();
    if (!deduped.has(lookupKey)) {
      deduped.set(lookupKey, tagName);
    }
  }

  return [...deduped.values()];
}

function buildInClause(ids: number[]): { placeholders: string; values: number[] } {
  const values = [...new Set(ids)];

  if (values.length === 0) {
    throw new Error('Expected at least one id.');
  }

  return {
    placeholders: values.map(() => '?').join(', '),
    values,
  };
}

async function getOrCreateTag(db: SQLiteDatabase, name: string): Promise<TagRecord> {
  const normalizedName = requireNonEmptyText(name, 'Tag name');
  const existing = await db.getFirstAsync<TagRecord>(
    'SELECT * FROM tags WHERE name = ? COLLATE NOCASE LIMIT 1',
    normalizedName
  );

  if (existing) {
    return existing;
  }

  const now = createTimestamp();

  try {
    const result = await db.runAsync(
      'INSERT INTO tags (name, createdAt, updatedAt) VALUES (?, ?, ?)',
      normalizedName,
      now,
      now
    );
    const created = await db.getFirstAsync<TagRecord>('SELECT * FROM tags WHERE id = ?', result.lastInsertRowId);

    if (!created) {
      throw new Error(`Tag ${result.lastInsertRowId} was created but could not be reloaded.`);
    }

    return created;
  } catch (error) {
    const concurrent = await db.getFirstAsync<TagRecord>(
      'SELECT * FROM tags WHERE name = ? COLLATE NOCASE LIMIT 1',
      normalizedName
    );

    if (concurrent) {
      return concurrent;
    }

    throw error;
  }
}

async function touchImagesAfterTagChange(db: SQLiteDatabase, imageIds: number[]): Promise<void> {
  if (imageIds.length === 0) {
    return;
  }

  const now = createTimestamp();
  const imageInClause = buildInClause(imageIds);

  await db.runAsync(
    `UPDATE image_assets SET updatedAt = ? WHERE id IN (${imageInClause.placeholders})`,
    now,
    ...imageInClause.values
  );

  const parents = await db.getAllAsync<{ ipId: number; groupId: number | null }>(
    `SELECT DISTINCT image_assets.ipId, image_groups.groupId
     FROM image_assets
     LEFT JOIN image_groups ON image_groups.imageAssetId = image_assets.id
     WHERE image_assets.id IN (${imageInClause.placeholders})`,
    ...imageInClause.values
  );

  const ipIds = [...new Set(parents.map((parent) => parent.ipId))];
  const groupIds = [...new Set(parents.map((parent) => parent.groupId).filter((groupId): groupId is number => groupId != null))];

  if (ipIds.length > 0) {
    const ipInClause = buildInClause(ipIds);
    await db.runAsync(
      `UPDATE ips SET updatedAt = ? WHERE id IN (${ipInClause.placeholders})`,
      now,
      ...ipInClause.values
    );
  }

  if (groupIds.length > 0) {
    const groupInClause = buildInClause(groupIds);
    await db.runAsync(
      `UPDATE groups SET updatedAt = ? WHERE id IN (${groupInClause.placeholders})`,
      now,
      ...groupInClause.values
    );
  }
}

export const tagRepository = {
  async create(db: SQLiteDatabase, input: CreateTagInput): Promise<TagRecord> {
    const now = createTimestamp();
    const name = requireNonEmptyText(input.name, 'Tag name');

    const result = await db.runAsync(
      'INSERT INTO tags (name, createdAt, updatedAt) VALUES (?, ?, ?)',
      name,
      now,
      now
    );

    const record = await this.findById(db, result.lastInsertRowId);
    if (!record) {
      throw new Error(`Tag ${result.lastInsertRowId} was created but could not be reloaded.`);
    }

    return record;
  },

  async update(db: SQLiteDatabase, id: number, input: UpdateTagInput): Promise<TagRecord | null> {
    const updates = buildUpdateStatement({
      name: input.name !== undefined ? requireNonEmptyText(input.name, 'Tag name') : undefined,
      updatedAt: createTimestamp(),
    });

    if (!updates.setClause) {
      return this.findById(db, id);
    }

    const result = await db.runAsync(
      `UPDATE tags SET ${updates.setClause} WHERE id = ?`,
      ...updates.values,
      id
    );

    if (result.changes === 0) {
      return null;
    }

    return this.findById(db, id);
  },

  async findById(db: SQLiteDatabase, id: number): Promise<TagRecord | null> {
    return db.getFirstAsync<TagRecord>('SELECT * FROM tags WHERE id = ?', id);
  },

  async findAll(db: SQLiteDatabase): Promise<TagRecord[]> {
    return db.getAllAsync<TagRecord>('SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC, id ASC');
  },

  async findByName(db: SQLiteDatabase, name: string): Promise<TagRecord | null> {
    return db.getFirstAsync<TagRecord>(
      'SELECT * FROM tags WHERE name = ? COLLATE NOCASE LIMIT 1',
      requireNonEmptyText(name, 'Tag name')
    );
  },

  async count(db: SQLiteDatabase): Promise<number> {
    const row = await db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM tags');
    return row?.count ?? 0;
  },

  async countByIpId(db: SQLiteDatabase, ipId: number): Promise<number> {
    const row = await db.getFirstAsync<CountRow>(
      `SELECT COUNT(DISTINCT image_tags.tagId) AS count
       FROM image_tags
       INNER JOIN image_assets ON image_assets.id = image_tags.imageAssetId
       WHERE image_assets.ipId = ? AND image_assets.deletedAt IS NULL`,
      ipId
    );
    return row?.count ?? 0;
  },

  async findUsageOverview(db: SQLiteDatabase): Promise<TagUsageItem[]> {
    const rows = await db.getAllAsync<TagUsageItemRow>(
      `SELECT
         tags.*,
         COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL THEN image_tags.imageAssetId END) AS imageCount,
         MAX(CASE WHEN image_assets.deletedAt IS NULL THEN COALESCE(image_assets.lastViewedAt, image_assets.updatedAt) END) AS lastUsedAt
       FROM tags
       LEFT JOIN image_tags ON image_tags.tagId = tags.id
       LEFT JOIN image_assets ON image_assets.id = image_tags.imageAssetId
       GROUP BY tags.id
       ORDER BY tags.name COLLATE NOCASE ASC, tags.id ASC`
    );

    return rows.map(mapTagUsageItemRow);
  },

  async findUsageOverviewByIpId(db: SQLiteDatabase, ipId: number): Promise<TagUsageItem[]> {
    const rows = await db.getAllAsync<TagUsageItemRow>(
      `SELECT
         tags.*,
         COUNT(DISTINCT image_assets.id) AS imageCount,
         MAX(COALESCE(image_assets.lastViewedAt, image_assets.updatedAt)) AS lastUsedAt
       FROM tags
       INNER JOIN image_tags ON image_tags.tagId = tags.id
       INNER JOIN image_assets ON image_assets.id = image_tags.imageAssetId
       WHERE image_assets.ipId = ? AND image_assets.deletedAt IS NULL
       GROUP BY tags.id
       ORDER BY tags.name COLLATE NOCASE ASC, tags.id ASC`,
      ipId
    );

    return rows.map(mapTagUsageItemRow);
  },

  async findRecentlyUsed(db: SQLiteDatabase, limit = 8): Promise<TagUsageItem[]> {
    const rows = await db.getAllAsync<TagUsageItemRow>(
      `SELECT
         tags.*,
         COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL THEN image_tags.imageAssetId END) AS imageCount,
         MAX(CASE WHEN image_assets.deletedAt IS NULL THEN COALESCE(image_assets.updatedAt, image_assets.createdAt) END) AS lastUsedAt
       FROM tags
       INNER JOIN image_tags ON image_tags.tagId = tags.id
       INNER JOIN image_assets ON image_assets.id = image_tags.imageAssetId
       WHERE image_assets.deletedAt IS NULL
       GROUP BY tags.id
       ORDER BY lastUsedAt DESC, imageCount DESC, tags.name COLLATE NOCASE ASC
       LIMIT ?`,
      limit
    );

    return rows.map(mapTagUsageItemRow);
  },

  async replaceImageTags(db: SQLiteDatabase, imageAssetId: number, tagIds: number[]): Promise<void> {
    const uniqueTagIds = [...new Set(tagIds)];
    const createdAt = createTimestamp();

    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM image_tags WHERE imageAssetId = ?', imageAssetId);

      for (const tagId of uniqueTagIds) {
        await db.runAsync(
          'INSERT INTO image_tags (imageAssetId, tagId, createdAt) VALUES (?, ?, ?)',
          imageAssetId,
          tagId,
          createdAt
        );
      }

      await touchImagesAfterTagChange(db, [imageAssetId]);
    });
  },

  async setImageTags(db: SQLiteDatabase, imageAssetId: number, tagNames: string[]): Promise<TagRecord[]> {
    const normalizedTagNames = normalizeTagNames(tagNames);
    const resolvedTags: TagRecord[] = [];

    try {
      for (const tagName of normalizedTagNames) {
        resolvedTags.push(await getOrCreateTag(db, tagName));
      }

      await this.replaceImageTags(db,
        imageAssetId,
        resolvedTags.map((tag) => tag.id)
      );

      return this.findByImageId(db, imageAssetId);
    } catch (error) {
      console.error('Pixory tagRepository.setImageTags failed.', {
        imageAssetId,
        tagNames: normalizedTagNames,
        error,
      });
      throw error;
    }
  },

  async addTagsToImages(db: SQLiteDatabase, imageIds: number[], tagNames: string[]): Promise<TagRecord[]> {
    const uniqueImageIds = [...new Set(imageIds)];
    const normalizedTagNames = normalizeTagNames(tagNames);

    if (uniqueImageIds.length === 0 || normalizedTagNames.length === 0) {
      return [];
    }

    const resolvedTags: TagRecord[] = [];
    for (const tagName of normalizedTagNames) {
      resolvedTags.push(await getOrCreateTag(db, tagName));
    }
    const createdAt = createTimestamp();

    try {
      await db.withTransactionAsync(async () => {
        for (const imageId of uniqueImageIds) {
          for (const tag of resolvedTags) {
            await db.runAsync(
              'INSERT OR IGNORE INTO image_tags (imageAssetId, tagId, createdAt) VALUES (?, ?, ?)',
              imageId,
              tag.id,
              createdAt
            );
          }
        }

        await touchImagesAfterTagChange(db, uniqueImageIds);
      });

      return resolvedTags;
    } catch (error) {
      console.error('Pixory tagRepository.addTagsToImages failed.', {
        imageIds: uniqueImageIds,
        tagNames: normalizedTagNames,
        error,
      });
      throw error;
    }
  },

  async findByImageId(db: SQLiteDatabase, imageAssetId: number): Promise<TagRecord[]> {
    return db.getAllAsync<TagRecord>(
      `SELECT tags.*
       FROM tags
       INNER JOIN image_tags ON image_tags.tagId = tags.id
       WHERE image_tags.imageAssetId = ?
       ORDER BY tags.name COLLATE NOCASE ASC, tags.id ASC`,
      imageAssetId
    );
  },

  async deleteById(db: SQLiteDatabase, id: number): Promise<number> {
    const affectedImages = await db.getAllAsync<{ imageAssetId: number }>(
      'SELECT imageAssetId FROM image_tags WHERE tagId = ?',
      id
    );
    const affectedImageIds = affectedImages.map((image) => image.imageAssetId);
    let changedCount = 0;

    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM image_tags WHERE tagId = ?', id);
      const result = await db.runAsync('DELETE FROM tags WHERE id = ?', id);
      changedCount = result.changes;
      await touchImagesAfterTagChange(db, affectedImageIds);
    });

    return changedCount;
  },

  async deleteMany(db: SQLiteDatabase, ids: number[]): Promise<number> {
    const tagIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (tagIds.length === 0) {
      return 0;
    }
    const tagInClause = buildInClause(tagIds);
    const affectedImages = await db.getAllAsync<{ imageAssetId: number }>(
      `SELECT DISTINCT imageAssetId FROM image_tags WHERE tagId IN (${tagInClause.placeholders})`,
      ...tagInClause.values
    );
    const affectedImageIds = affectedImages.map((image) => image.imageAssetId);
    let changedCount = 0;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `DELETE FROM image_tags WHERE tagId IN (${tagInClause.placeholders})`,
        ...tagInClause.values
      );
      const result = await db.runAsync(
        `DELETE FROM tags WHERE id IN (${tagInClause.placeholders})`,
        ...tagInClause.values
      );
      changedCount = result.changes;
      await touchImagesAfterTagChange(db, affectedImageIds);
    });

    return changedCount;
  },
};

export default tagRepository;
