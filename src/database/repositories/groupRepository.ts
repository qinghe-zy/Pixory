import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  CountRow,
  CreateGroupInput,
  GlobalGroupListItem,
  GlobalGroupListItemRow,
  GroupListItem,
  GroupListItemRow,
  GroupRecord,
  GroupRow,
  UpdateGroupInput,
} from '../types';
import {
  booleanToSqlite,
  buildUpdateStatement,
  createTimestamp,
  mapGlobalGroupListItemRow,
  mapGroupListItemRow,
  mapGroupRow,
  normalizeOptionalText,
  requireNonEmptyText,
} from '../utils';

async function touchIpUpdatedAt(db: SQLiteDatabase, ipId: number): Promise<void> {
  await db.runAsync('UPDATE ips SET updatedAt = ? WHERE id = ?', createTimestamp(), ipId);
}

const GROUP_OVERVIEW_SELECT = `
  SELECT
    groups.id,
    groups.ipId,
    ips.name AS ipName,
    groups.name,
    groups.type,
    groups.sortOrder,
    groups.isPinned,
    groups.description,
    groups.createdAt,
    groups.updatedAt,
    COUNT(CASE WHEN image_assets.deletedAt IS NULL THEN image_assets.id END) AS imageCount,
    MAX(COALESCE(image_assets.updatedAt, groups.updatedAt)) AS recentUpdatedAt,
    (
      SELECT image_assets.thumbnailFileUri
      FROM image_assets
      INNER JOIN image_groups ON image_groups.imageAssetId = image_assets.id
      WHERE image_groups.groupId = groups.id
        AND image_assets.deletedAt IS NULL
      ORDER BY image_assets.createdAt DESC, image_assets.id DESC
      LIMIT 1
    ) AS coverThumbnailFileUri
  FROM groups
  INNER JOIN ips ON ips.id = groups.ipId
  LEFT JOIN image_groups ON image_groups.groupId = groups.id
  LEFT JOIN image_assets ON image_assets.id = image_groups.imageAssetId
`;

export const groupRepository = {
  async create(db: SQLiteDatabase, input: CreateGroupInput): Promise<GroupRecord> {
    const now = createTimestamp();
    const name = requireNonEmptyText(input.name, 'Group name');
    const type = input.type ? requireNonEmptyText(input.type, 'Group type') : 'custom';
    const sortOrder = input.sortOrder ?? 0;
    const isPinned = booleanToSqlite(input.isPinned ?? false);
    const description = normalizeOptionalText(input.description) ?? null;

    const result = await db.runAsync(
      'INSERT INTO groups (ipId, name, type, sortOrder, isPinned, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      input.ipId,
      name,
      type,
      sortOrder,
      isPinned,
      description,
      now,
      now
    );

    await touchIpUpdatedAt(db, input.ipId);

    const record = await this.findById(db, result.lastInsertRowId);
    if (!record) {
      throw new Error(`Group ${result.lastInsertRowId} was created but could not be reloaded.`);
    }

    return record;
  },

  async update(db: SQLiteDatabase, id: number, input: UpdateGroupInput): Promise<GroupRecord | null> {
    const current = await this.findById(db, id);
    if (!current) {
      return null;
    }

    const updates = buildUpdateStatement({
      ipId: input.ipId,
      name: input.name !== undefined ? requireNonEmptyText(input.name, 'Group name') : undefined,
      type: input.type !== undefined ? requireNonEmptyText(input.type, 'Group type') : undefined,
      sortOrder: input.sortOrder,
      isPinned: input.isPinned !== undefined ? booleanToSqlite(input.isPinned) : undefined,
      description: normalizeOptionalText(input.description),
      updatedAt: createTimestamp(),
    });

    if (!updates.setClause) {
      return current;
    }

    const result = await db.runAsync(
      `UPDATE groups SET ${updates.setClause} WHERE id = ?`,
      ...updates.values,
      id
    );

    if (result.changes === 0) {
      return null;
    }

    await touchIpUpdatedAt(db, input.ipId ?? current.ipId);
    if (input.ipId && input.ipId !== current.ipId) {
      await touchIpUpdatedAt(db, current.ipId);
    }

    return this.findById(db, id);
  },

  async findById(db: SQLiteDatabase, id: number): Promise<GroupRecord | null> {
    const row = await db.getFirstAsync<GroupRow>('SELECT * FROM groups WHERE id = ?', id);
    return row ? mapGroupRow(row) : null;
  },

  async findAll(db: SQLiteDatabase): Promise<GroupRecord[]> {
    const rows = await db.getAllAsync<GroupRow>(
      'SELECT * FROM groups ORDER BY ipId ASC, isPinned DESC, sortOrder ASC, updatedAt DESC, id DESC'
    );
    return rows.map(mapGroupRow);
  },

  async findByIpId(db: SQLiteDatabase, ipId: number): Promise<GroupRecord[]> {
    const rows = await db.getAllAsync<GroupRow>(
      'SELECT * FROM groups WHERE ipId = ? ORDER BY isPinned DESC, type ASC, sortOrder ASC, updatedAt DESC, id DESC',
      ipId
    );
    return rows.map(mapGroupRow);
  },

  async findByIpIdAndName(db: SQLiteDatabase, ipId: number, name: string): Promise<GroupRecord | null> {
    const row = await db.getFirstAsync<GroupRow>(
      'SELECT * FROM groups WHERE ipId = ? AND name = ? COLLATE NOCASE LIMIT 1',
      ipId,
      requireNonEmptyText(name, 'Group name')
    );
    return row ? mapGroupRow(row) : null;
  },

  async findOverviewByIpId(db: SQLiteDatabase, ipId: number): Promise<GroupListItem[]> {
    const rows = await db.getAllAsync<GroupListItemRow>(
      `${GROUP_OVERVIEW_SELECT} WHERE groups.ipId = ? GROUP BY groups.id ORDER BY groups.isPinned DESC, imageCount DESC, groups.type ASC, groups.sortOrder ASC, groups.updatedAt DESC, groups.id DESC`,
      ipId
    );
    return rows.map(mapGroupListItemRow);
  },

  async findOverview(db: SQLiteDatabase): Promise<GlobalGroupListItem[]> {
    const rows = await db.getAllAsync<GlobalGroupListItemRow>(
      `${GROUP_OVERVIEW_SELECT} WHERE ips.deletedAt IS NULL GROUP BY groups.id ORDER BY groups.isPinned DESC, imageCount DESC, groups.type ASC, groups.sortOrder ASC, groups.updatedAt DESC, groups.id DESC`
    );
    return rows.map(mapGlobalGroupListItemRow);
  },

  async count(db: SQLiteDatabase): Promise<number> {
    const row = await db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM groups');
    return row?.count ?? 0;
  },

  async deleteById(db: SQLiteDatabase, id: number): Promise<number> {
    const current = await this.findById(db, id);
    if (!current) {
      return 0;
    }

    const now = createTimestamp();
    let changedCount = 0;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE image_assets
         SET groupId = (
           SELECT image_groups.groupId
           FROM image_groups
           WHERE image_groups.imageAssetId = image_assets.id
             AND image_groups.groupId != ?
           ORDER BY image_groups.createdAt ASC, image_groups.groupId ASC
           LIMIT 1
         ),
         updatedAt = ?
         WHERE groupId = ?`,
        id,
        now,
        id
      );
      await db.runAsync('DELETE FROM image_groups WHERE groupId = ?', id);
      const result = await db.runAsync('DELETE FROM groups WHERE id = ?', id);
      changedCount = result.changes;
      await db.runAsync('UPDATE ips SET updatedAt = ? WHERE id = ?', now, current.ipId);
    });

    return changedCount;
  },

  async updatePinned(db: SQLiteDatabase, id: number, isPinned: boolean): Promise<GroupRecord | null> {
    return this.update(db, id, { isPinned });
  },
};

export default groupRepository;
