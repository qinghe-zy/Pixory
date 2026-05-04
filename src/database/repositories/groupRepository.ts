import { getDatabase } from '../db';
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

async function touchIpUpdatedAt(ipId: number): Promise<void> {
  const db = await getDatabase();
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
  async create(input: CreateGroupInput): Promise<GroupRecord> {
    const db = await getDatabase();
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

    await touchIpUpdatedAt(input.ipId);

    const record = await this.findById(result.lastInsertRowId);
    if (!record) {
      throw new Error(`Group ${result.lastInsertRowId} was created but could not be reloaded.`);
    }

    return record;
  },

  async update(id: number, input: UpdateGroupInput): Promise<GroupRecord | null> {
    const db = await getDatabase();
    const current = await this.findById(id);
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

    await touchIpUpdatedAt(input.ipId ?? current.ipId);
    if (input.ipId && input.ipId !== current.ipId) {
      await touchIpUpdatedAt(current.ipId);
    }

    return this.findById(id);
  },

  async findById(id: number): Promise<GroupRecord | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<GroupRow>('SELECT * FROM groups WHERE id = ?', id);
    return row ? mapGroupRow(row) : null;
  },

  async findAll(): Promise<GroupRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GroupRow>(
      'SELECT * FROM groups ORDER BY ipId ASC, isPinned DESC, sortOrder ASC, updatedAt DESC, id DESC'
    );
    return rows.map(mapGroupRow);
  },

  async findByIpId(ipId: number): Promise<GroupRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GroupRow>(
      'SELECT * FROM groups WHERE ipId = ? ORDER BY isPinned DESC, type ASC, sortOrder ASC, updatedAt DESC, id DESC',
      ipId
    );
    return rows.map(mapGroupRow);
  },

  async findByIpIdAndName(ipId: number, name: string): Promise<GroupRecord | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<GroupRow>(
      'SELECT * FROM groups WHERE ipId = ? AND name = ? COLLATE NOCASE LIMIT 1',
      ipId,
      requireNonEmptyText(name, 'Group name')
    );
    return row ? mapGroupRow(row) : null;
  },

  async findOverviewByIpId(ipId: number): Promise<GroupListItem[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GroupListItemRow>(
      `${GROUP_OVERVIEW_SELECT} WHERE groups.ipId = ? GROUP BY groups.id ORDER BY groups.isPinned DESC, imageCount DESC, groups.type ASC, groups.sortOrder ASC, groups.updatedAt DESC, groups.id DESC`,
      ipId
    );
    return rows.map(mapGroupListItemRow);
  },

  async findOverview(): Promise<GlobalGroupListItem[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GlobalGroupListItemRow>(
      `${GROUP_OVERVIEW_SELECT} GROUP BY groups.id ORDER BY groups.isPinned DESC, imageCount DESC, groups.type ASC, groups.sortOrder ASC, groups.updatedAt DESC, groups.id DESC`
    );
    return rows.map(mapGlobalGroupListItemRow);
  },

  async count(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM groups');
    return row?.count ?? 0;
  },

  async deleteById(id: number): Promise<number> {
    const db = await getDatabase();
    const current = await this.findById(id);
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

  async updatePinned(id: number, isPinned: boolean): Promise<GroupRecord | null> {
    return this.update(id, { isPinned });
  },
};

export default groupRepository;
