import { getDatabase } from '../db';
import type {
  CountRow,
  CreateIpInput,
  IpDetailRecord,
  IpLibraryQuery,
  IpListItem,
  IpListItemRow,
  IpRecord,
  IpRow,
  UpdateIpInput,
} from '../types';
import {
  booleanToSqlite,
  buildUpdateStatement,
  createTimestamp,
  mapIpDetailRow,
  mapIpListItemRow,
  mapIpRow,
  normalizeOptionalText,
  requireNonEmptyText,
} from '../utils';

const IP_LIBRARY_SELECT = `
  SELECT
    ips.id,
    ips.name,
    ips.description,
    ips.isFavorite,
    ips.createdAt,
    ips.updatedAt,
    COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL THEN image_assets.id END) AS imageCount,
    COUNT(DISTINCT groups.id) AS groupCount
  FROM ips
  LEFT JOIN image_assets ON image_assets.ipId = ips.id
  LEFT JOIN groups ON groups.ipId = ips.id
`;

const IP_DETAIL_SELECT = `
  SELECT
    ips.id,
    ips.name,
    ips.description,
    ips.isFavorite,
    ips.createdAt,
    ips.updatedAt,
    COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL THEN image_assets.id END) AS imageCount,
    COUNT(DISTINCT groups.id) AS groupCount,
    COUNT(DISTINCT CASE WHEN image_assets.deletedAt IS NULL THEN image_tags.tagId END) AS tagCount,
    MAX(
      MAX(
        COALESCE(image_assets.updatedAt, ips.updatedAt),
        COALESCE(groups.updatedAt, ips.updatedAt),
        ips.updatedAt
      )
    ) AS recentUpdatedAt
  FROM ips
  LEFT JOIN groups ON groups.ipId = ips.id
  LEFT JOIN image_assets ON image_assets.ipId = ips.id
  LEFT JOIN image_tags ON image_tags.imageAssetId = image_assets.id
`;

function buildLibraryQuery(query?: IpLibraryQuery): { sql: string; values: Array<number | string> } {
  const values: Array<number | string> = [];
  const whereClauses: string[] = [];
  const normalizedSearchText = query?.searchText?.trim();
  const filter = query?.filter ?? 'all';

  if (normalizedSearchText) {
    const likeValue = `%${normalizedSearchText}%`;
    whereClauses.push(
      "(ips.name LIKE ? COLLATE NOCASE OR COALESCE(ips.description, '') LIKE ? COLLATE NOCASE)"
    );
    values.push(likeValue, likeValue);
  }

  if (filter === 'favorite') {
    whereClauses.push('ips.isFavorite = 1');
  }

  const whereStatement = whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const orderBy =
    filter === 'all'
      ? ' ORDER BY ips.name COLLATE NOCASE ASC, ips.updatedAt DESC, ips.id DESC'
      : ' ORDER BY ips.updatedAt DESC, ips.id DESC';

  return {
    sql: `${IP_LIBRARY_SELECT}${whereStatement} GROUP BY ips.id${orderBy}`,
    values,
  };
}

export const ipRepository = {
  async create(input: CreateIpInput): Promise<IpRecord> {
    const db = await getDatabase();
    const now = createTimestamp();
    const name = requireNonEmptyText(input.name, 'IP name');
    const description = normalizeOptionalText(input.description) ?? null;

    const result = await db.runAsync(
      'INSERT INTO ips (name, description, isFavorite, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      name,
      description,
      booleanToSqlite(Boolean(input.isFavorite)),
      now,
      now
    );

    const record = await this.findById(result.lastInsertRowId);
    if (!record) {
      throw new Error(`IP ${result.lastInsertRowId} was created but could not be reloaded.`);
    }

    return record;
  },

  async update(id: number, input: UpdateIpInput): Promise<IpRecord | null> {
    const db = await getDatabase();
    const updates = buildUpdateStatement({
      name: input.name !== undefined ? requireNonEmptyText(input.name, 'IP name') : undefined,
      description: normalizeOptionalText(input.description),
      isFavorite: input.isFavorite !== undefined ? booleanToSqlite(input.isFavorite) : undefined,
      updatedAt: createTimestamp(),
    });

    if (!updates.setClause) {
      return this.findById(id);
    }

    const result = await db.runAsync(
      `UPDATE ips SET ${updates.setClause} WHERE id = ?`,
      ...updates.values,
      id
    );

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  },

  async findById(id: number): Promise<IpRecord | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<IpRow>('SELECT * FROM ips WHERE id = ?', id);
    return row ? mapIpRow(row) : null;
  },

  async findAll(): Promise<IpRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<IpRow>('SELECT * FROM ips ORDER BY updatedAt DESC, id DESC');
    return rows.map(mapIpRow);
  },

  async findLibraryItems(query?: IpLibraryQuery): Promise<IpListItem[]> {
    const db = await getDatabase();
    const builtQuery = buildLibraryQuery(query);
    const rows = await db.getAllAsync<IpListItemRow>(builtQuery.sql, ...builtQuery.values);
    return rows.map(mapIpListItemRow);
  },

  async findLibraryItemById(id: number): Promise<IpListItem | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<IpListItemRow>(
      `${IP_LIBRARY_SELECT} WHERE ips.id = ? GROUP BY ips.id`,
      id
    );
    return row ? mapIpListItemRow(row) : null;
  },

  async findDetailById(id: number): Promise<IpDetailRecord | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<
      IpRow & {
        imageCount: number;
        groupCount: number;
        tagCount: number;
        recentUpdatedAt: string | null;
      }
    >(`${IP_DETAIL_SELECT} WHERE ips.id = ? GROUP BY ips.id`, id);
    return row ? mapIpDetailRow(row) : null;
  },

  async count(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM ips');
    return row?.count ?? 0;
  },
};

export default ipRepository;
