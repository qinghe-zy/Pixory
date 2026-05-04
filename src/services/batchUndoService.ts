import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '../database/db';
import type { ImageAssetRow } from '../database/types';
import { booleanToSqlite, createTimestamp, mapImageAssetRow, requireNonEmptyText } from '../database/utils';

interface BatchUndoImageState {
  id: number;
  groupId: number | null;
  groupIds: number[];
  tagNames: string[];
  isFavorite: boolean;
  note: string | null;
  deletedAt: string | null;
}

export interface BatchUndoSnapshot {
  images: BatchUndoImageState[];
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

export async function captureBatchUndoSnapshot(imageIds: number[]): Promise<BatchUndoSnapshot> {
  const uniqueIds = [...new Set(imageIds)];
  if (uniqueIds.length === 0) {
    return { images: [] };
  }

  const db = await getDatabase();
  const inClause = buildInClause(uniqueIds);
  const [imageRows, groupRows, tagRows] = await Promise.all([
    db.getAllAsync<ImageAssetRow>(
      `SELECT * FROM image_assets WHERE id IN (${inClause.placeholders})`,
      ...inClause.values
    ),
    db.getAllAsync<{ imageAssetId: number; groupId: number }>(
      `SELECT imageAssetId, groupId FROM image_groups WHERE imageAssetId IN (${inClause.placeholders})`,
      ...inClause.values
    ),
    db.getAllAsync<{ imageAssetId: number; name: string }>(
      `SELECT image_tags.imageAssetId, tags.name
       FROM image_tags
       INNER JOIN tags ON tags.id = image_tags.tagId
       WHERE image_tags.imageAssetId IN (${inClause.placeholders})`,
      ...inClause.values
    ),
  ]);
  const groupIdsByImage = new Map<number, number[]>();
  const tagNamesByImage = new Map<number, string[]>();

  for (const row of groupRows) {
    groupIdsByImage.set(row.imageAssetId, [...(groupIdsByImage.get(row.imageAssetId) ?? []), row.groupId]);
  }

  for (const row of tagRows) {
    tagNamesByImage.set(row.imageAssetId, [...(tagNamesByImage.get(row.imageAssetId) ?? []), row.name]);
  }

  return {
    images: imageRows.map((row) => {
      const image = mapImageAssetRow(row);
      return {
        id: image.id,
        groupId: image.groupId,
        groupIds: groupIdsByImage.get(image.id) ?? [],
        tagNames: tagNamesByImage.get(image.id) ?? [],
        isFavorite: image.isFavorite,
        note: image.note,
        deletedAt: image.deletedAt,
      };
    }),
  };
}

async function getOrCreateTagId(db: SQLiteDatabase, name: string): Promise<number> {
  const normalizedName = requireNonEmptyText(name, 'Tag name');
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM tags WHERE name = ? COLLATE NOCASE LIMIT 1',
    normalizedName
  );

  if (existing) {
    return existing.id;
  }

  const now = createTimestamp();
  const result = await db.runAsync(
    'INSERT INTO tags (name, createdAt, updatedAt) VALUES (?, ?, ?)',
    normalizedName,
    now,
    now
  );
  return result.lastInsertRowId;
}

export async function restoreBatchUndoSnapshot(snapshot: BatchUndoSnapshot): Promise<number> {
  if (snapshot.images.length === 0) {
    return 0;
  }

  const db = await getDatabase();
  const now = createTimestamp();

  await db.withTransactionAsync(async () => {
    for (const image of snapshot.images) {
      await db.runAsync(
        `UPDATE image_assets
         SET groupId = ?, isFavorite = ?, note = ?, deletedAt = ?, updatedAt = ?
         WHERE id = ?`,
        image.groupId,
        booleanToSqlite(image.isFavorite),
        image.note,
        image.deletedAt,
        now,
        image.id
      );

      await db.runAsync('DELETE FROM image_groups WHERE imageAssetId = ?', image.id);
      for (const groupId of image.groupIds) {
        await db.runAsync(
          'INSERT OR IGNORE INTO image_groups (imageAssetId, groupId, createdAt) VALUES (?, ?, ?)',
          image.id,
          groupId,
          now
        );
      }

      await db.runAsync('DELETE FROM image_tags WHERE imageAssetId = ?', image.id);
      for (const tagName of image.tagNames) {
        const tagId = await getOrCreateTagId(db, tagName);
        await db.runAsync(
          'INSERT OR IGNORE INTO image_tags (imageAssetId, tagId, createdAt) VALUES (?, ?, ?)',
          image.id,
          tagId,
          now
        );
      }
    }
  });

  return snapshot.images.length;
}
