import type { SQLiteDatabase } from 'expo-sqlite';
import type { CustomStickerRecord, StickerPackRecord } from '../../components/emoji/types';
import type { PixorySpace } from '../db';

interface CustomStickerRow {
  id: string;
  space: string;
  packId: string | null;
  name: string;
  uri: string;
  previewUri: string | null;
  emotionBucket: string | null;
  keywordsJson: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface StickerPackRow {
  id: string;
  space: string;
  name: string;
  coverUri: string | null;
  description: string | null;
  createdAt: number;
  updatedAt: number;
}

function mapStickerRow(row: CustomStickerRow): CustomStickerRecord {
  let keywords: string[] = [];
  if (row.keywordsJson) {
    try {
      keywords = JSON.parse(row.keywordsJson);
    } catch {
      keywords = [];
    }
  }

  return {
    id: row.id,
    space: (row.space === 'personal' ? 'personal' : 'normal'),
    packId: row.packId,
    name: row.name,
    uri: row.uri,
    previewUri: row.previewUri,
    emotionBucket: row.emotionBucket,
    keywords,
    width: row.width,
    height: row.height,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPackRow(row: StickerPackRow): StickerPackRecord {
  return {
    id: row.id,
    space: (row.space === 'personal' ? 'personal' : 'normal'),
    name: row.name,
    coverUri: row.coverUri,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const customStickerRepository = {
  async listCustomStickers(
    db: SQLiteDatabase,
    space: PixorySpace = 'normal',
    packId?: string | null
  ): Promise<CustomStickerRecord[]> {
    let query = 'SELECT * FROM custom_stickers WHERE space = ?';
    const params: (string | number)[] = [space];

    if (packId !== undefined) {
      if (packId === null) {
        query += ' AND packId IS NULL';
      } else {
        query += ' AND packId = ?';
        params.push(packId);
      }
    }

    query += ' ORDER BY sortOrder ASC, createdAt DESC';
    const rows = await db.getAllAsync<CustomStickerRow>(query, ...params);
    return rows.map(mapStickerRow);
  },

  async getCustomStickerById(db: SQLiteDatabase, id: string): Promise<CustomStickerRecord | null> {
    const row = await db.getFirstAsync<CustomStickerRow>(
      'SELECT * FROM custom_stickers WHERE id = ? LIMIT 1',
      id
    );
    return row ? mapStickerRow(row) : null;
  },

  async insertCustomSticker(db: SQLiteDatabase, sticker: CustomStickerRecord): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO custom_stickers (
        id, space, packId, name, uri, previewUri, emotionBucket, keywordsJson, width, height, sortOrder, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sticker.id,
      sticker.space,
      sticker.packId ?? null,
      sticker.name,
      sticker.uri,
      sticker.previewUri ?? null,
      sticker.emotionBucket ?? null,
      JSON.stringify(sticker.keywords || []),
      sticker.width ?? null,
      sticker.height ?? null,
      sticker.sortOrder ?? 0,
      sticker.createdAt,
      sticker.updatedAt
    );
  },

  async batchInsertCustomStickers(db: SQLiteDatabase, stickers: CustomStickerRecord[]): Promise<void> {
    if (stickers.length === 0) return;
    await db.withTransactionAsync(async () => {
      for (const s of stickers) {
        await db.runAsync(
          `INSERT OR REPLACE INTO custom_stickers (
            id, space, packId, name, uri, previewUri, emotionBucket, keywordsJson, width, height, sortOrder, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          s.id,
          s.space,
          s.packId ?? null,
          s.name,
          s.uri,
          s.previewUri ?? null,
          s.emotionBucket ?? null,
          JSON.stringify(s.keywords || []),
          s.width ?? null,
          s.height ?? null,
          s.sortOrder ?? 0,
          s.createdAt,
          s.updatedAt
        );
      }
    });
  },

  async deleteCustomSticker(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync('DELETE FROM custom_stickers WHERE id = ?', id);
  },

  async listStickerPacks(db: SQLiteDatabase, space: PixorySpace = 'normal'): Promise<StickerPackRecord[]> {
    const rows = await db.getAllAsync<StickerPackRow>(
      'SELECT * FROM custom_sticker_packs WHERE space = ? ORDER BY createdAt DESC',
      space
    );
    return rows.map(mapPackRow);
  },

  async insertStickerPack(db: SQLiteDatabase, pack: StickerPackRecord): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO custom_sticker_packs (
        id, space, name, coverUri, description, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      pack.id,
      pack.space,
      pack.name,
      pack.coverUri ?? null,
      pack.description ?? null,
      pack.createdAt,
      pack.updatedAt
    );
  },

  async deleteStickerPack(db: SQLiteDatabase, packId: string): Promise<void> {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM custom_stickers WHERE packId = ?', packId);
      await db.runAsync('DELETE FROM custom_sticker_packs WHERE id = ?', packId);
    });
  },
};
