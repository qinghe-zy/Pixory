import { getDatabase } from '../db';
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

async function getOrCreateTag(name: string): Promise<TagRecord> {
  const db = await getDatabase();
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
    `SELECT DISTINCT ipId, groupId
     FROM image_assets
     WHERE id IN (${imageInClause.placeholders})`,
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
  async create(input: CreateTagInput): Promise<TagRecord> {
    const db = await getDatabase();
    const now = createTimestamp();
    const name = requireNonEmptyText(input.name, 'Tag name');

    const result = await db.runAsync(
      'INSERT INTO tags (name, createdAt, updatedAt) VALUES (?, ?, ?)',
      name,
      now,
      now
    );

    const record = await this.findById(result.lastInsertRowId);
    if (!record) {
      throw new Error(`Tag ${result.lastInsertRowId} was created but could not be reloaded.`);
    }

    return record;
  },

  async update(id: number, input: UpdateTagInput): Promise<TagRecord | null> {
    const db = await getDatabase();
    const updates = buildUpdateStatement({
      name: input.name !== undefined ? requireNonEmptyText(input.name, 'Tag name') : undefined,
      updatedAt: createTimestamp(),
    });

    if (!updates.setClause) {
      return this.findById(id);
    }

    const result = await db.runAsync(
      `UPDATE tags SET ${updates.setClause} WHERE id = ?`,
      ...updates.values,
      id
    );

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  },

  async findById(id: number): Promise<TagRecord | null> {
    const db = await getDatabase();
    return db.getFirstAsync<TagRecord>('SELECT * FROM tags WHERE id = ?', id);
  },

  async findAll(): Promise<TagRecord[]> {
    const db = await getDatabase();
    return db.getAllAsync<TagRecord>('SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC, id ASC');
  },

  async findByName(name: string): Promise<TagRecord | null> {
    const db = await getDatabase();
    return db.getFirstAsync<TagRecord>(
      'SELECT * FROM tags WHERE name = ? COLLATE NOCASE LIMIT 1',
      requireNonEmptyText(name, 'Tag name')
    );
  },

  async count(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM tags');
    return row?.count ?? 0;
  },

  async countByIpId(ipId: number): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<CountRow>(
      `SELECT COUNT(DISTINCT image_tags.tagId) AS count
       FROM image_tags
       INNER JOIN image_assets ON image_assets.id = image_tags.imageAssetId
       WHERE image_assets.ipId = ? AND image_assets.deletedAt IS NULL`,
      ipId
    );
    return row?.count ?? 0;
  },

  async findUsageOverview(): Promise<TagUsageItem[]> {
    const db = await getDatabase();
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

  async findUsageOverviewByIpId(ipId: number): Promise<TagUsageItem[]> {
    const db = await getDatabase();
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

  async replaceImageTags(imageAssetId: number, tagIds: number[]): Promise<void> {
    const db = await getDatabase();
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

  async setImageTags(imageAssetId: number, tagNames: string[]): Promise<TagRecord[]> {
    const normalizedTagNames = normalizeTagNames(tagNames);
    const resolvedTags: TagRecord[] = [];

    try {
      for (const tagName of normalizedTagNames) {
        resolvedTags.push(await getOrCreateTag(tagName));
      }

      await this.replaceImageTags(
        imageAssetId,
        resolvedTags.map((tag) => tag.id)
      );

      return this.findByImageId(imageAssetId);
    } catch (error) {
      console.error('Pixory tagRepository.setImageTags failed.', {
        imageAssetId,
        tagNames: normalizedTagNames,
        error,
      });
      throw error;
    }
  },

  async addTagsToImages(imageIds: number[], tagNames: string[]): Promise<TagRecord[]> {
    const uniqueImageIds = [...new Set(imageIds)];
    const normalizedTagNames = normalizeTagNames(tagNames);

    if (uniqueImageIds.length === 0 || normalizedTagNames.length === 0) {
      return [];
    }

    const resolvedTags: TagRecord[] = [];
    for (const tagName of normalizedTagNames) {
      resolvedTags.push(await getOrCreateTag(tagName));
    }

    const db = await getDatabase();
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

  async findByImageId(imageAssetId: number): Promise<TagRecord[]> {
    const db = await getDatabase();
    return db.getAllAsync<TagRecord>(
      `SELECT tags.*
       FROM tags
       INNER JOIN image_tags ON image_tags.tagId = tags.id
       WHERE image_tags.imageAssetId = ?
       ORDER BY tags.name COLLATE NOCASE ASC, tags.id ASC`,
      imageAssetId
    );
  },
};

export default tagRepository;
