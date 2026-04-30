import { getDatabase } from '../db';
import type { CountRow, CreateTagInput, TagRecord, UpdateTagInput } from '../types';
import { buildUpdateStatement, createTimestamp, requireNonEmptyText } from '../utils';

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
    });
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
