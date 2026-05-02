import { getDatabase } from '../db';
import type {
  CountRow,
  CreateGroupInput,
  GlobalGroupListItem,
  GlobalGroupListItemRow,
  GroupListItem,
  GroupListItemRow,
  GroupRecord,
  UpdateGroupInput,
} from '../types';
import {
  buildUpdateStatement,
  createTimestamp,
  mapGlobalGroupListItemRow,
  mapGroupListItemRow,
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
    groups.description,
    groups.createdAt,
    groups.updatedAt,
    COUNT(CASE WHEN image_assets.deletedAt IS NULL THEN image_assets.id END) AS imageCount,
    MAX(COALESCE(image_assets.updatedAt, groups.updatedAt)) AS recentUpdatedAt,
    (
      SELECT image_assets.thumbnailFileUri
      FROM image_assets
      WHERE image_assets.groupId = groups.id
        AND image_assets.deletedAt IS NULL
      ORDER BY image_assets.createdAt DESC, image_assets.id DESC
      LIMIT 1
    ) AS coverThumbnailFileUri
  FROM groups
  INNER JOIN ips ON ips.id = groups.ipId
  LEFT JOIN image_assets ON image_assets.groupId = groups.id
`;

export const groupRepository = {
  async create(input: CreateGroupInput): Promise<GroupRecord> {
    const db = await getDatabase();
    const now = createTimestamp();
    const name = requireNonEmptyText(input.name, 'Group name');
    const type = input.type ? requireNonEmptyText(input.type, 'Group type') : 'custom';
    const sortOrder = input.sortOrder ?? 0;
    const description = normalizeOptionalText(input.description) ?? null;

    const result = await db.runAsync(
      'INSERT INTO groups (ipId, name, type, sortOrder, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      input.ipId,
      name,
      type,
      sortOrder,
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
    const row = await db.getFirstAsync<GroupRecord>('SELECT * FROM groups WHERE id = ?', id);
    return row ? { ...row, description: row.description ?? null } : null;
  },

  async findAll(): Promise<GroupRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GroupRecord>(
      'SELECT * FROM groups ORDER BY ipId ASC, sortOrder ASC, updatedAt DESC, id DESC'
    );
    return rows.map((row) => ({ ...row, description: row.description ?? null }));
  },

  async findByIpId(ipId: number): Promise<GroupRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GroupRecord>(
      'SELECT * FROM groups WHERE ipId = ? ORDER BY type ASC, sortOrder ASC, updatedAt DESC, id DESC',
      ipId
    );
    return rows.map((row) => ({ ...row, description: row.description ?? null }));
  },

  async findOverviewByIpId(ipId: number): Promise<GroupListItem[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GroupListItemRow>(
      `${GROUP_OVERVIEW_SELECT} WHERE groups.ipId = ? GROUP BY groups.id ORDER BY groups.type ASC, groups.sortOrder ASC, groups.updatedAt DESC, groups.id DESC`,
      ipId
    );
    return rows.map(mapGroupListItemRow);
  },

  async findOverview(): Promise<GlobalGroupListItem[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<GlobalGroupListItemRow>(
      `${GROUP_OVERVIEW_SELECT} GROUP BY groups.id ORDER BY groups.type ASC, groups.sortOrder ASC, groups.updatedAt DESC, groups.id DESC`
    );
    return rows.map(mapGlobalGroupListItemRow);
  },

  async count(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM groups');
    return row?.count ?? 0;
  },
};

export default groupRepository;
