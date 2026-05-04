import type {
  GlobalGroupListItem,
  GlobalGroupListItemRow,
  GroupRecord,
  GroupRow,
  GroupListItem,
  GroupListItemRow,
  ImageAssetRecord,
  ImageAssetRow,
  ImageDetailRecord,
  ImageDetailRow,
  ImageListItem,
  ImageListItemRow,
  IpDetailRecord,
  IpListItem,
  IpListItemRow,
  IpRecord,
  IpRow,
  TagUsageItem,
  TagUsageItemRow,
} from './types';

export type SqlValue = number | string | null;

export function createTimestamp(): string {
  return new Date().toISOString();
}

export function normalizeOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function requireNonEmptyText(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} cannot be empty.`);
  }

  return trimmed;
}

export function booleanToSqlite(value: boolean): number {
  return value ? 1 : 0;
}

export function sqliteToBoolean(value: number): boolean {
  return value === 1;
}

export function mapImageAssetRow(row: ImageAssetRow): ImageAssetRecord {
  return {
    ...row,
    isFavorite: sqliteToBoolean(row.isFavorite),
  };
}

export function mapImageListItemRow(row: ImageListItemRow): ImageListItem {
  return {
    ...mapImageAssetRow(row),
    ipName: row.ipName,
    groupName: row.groupName,
    groupCount: row.groupCount ?? 0,
    tagCount: row.tagCount ?? 0,
  };
}

export function mapImageDetailRow(row: ImageDetailRow): ImageDetailRecord {
  return {
    ...mapImageAssetRow(row),
    ipName: row.ipName,
    groupName: row.groupName,
    groupType: row.groupType,
    groupCount: row.groupCount ?? 0,
  };
}

export function mapIpRow(row: IpRow): IpRecord {
  return {
    ...row,
    isFavorite: sqliteToBoolean(row.isFavorite),
  };
}

export function mapIpListItemRow(row: IpListItemRow): IpListItem {
  return {
    ...mapIpRow(row),
    imageCount: row.imageCount ?? 0,
    groupCount: row.groupCount ?? 0,
    coverThumbnailFileUri: row.coverThumbnailFileUri ?? null,
  };
}

export function mapIpDetailRow(
  row: IpRow & {
    imageCount: number;
    groupCount: number;
    tagCount: number;
    recentUpdatedAt: string | null;
  }
): IpDetailRecord {
  return {
    ...mapIpRow(row),
    imageCount: row.imageCount ?? 0,
    groupCount: row.groupCount ?? 0,
    tagCount: row.tagCount ?? 0,
    recentUpdatedAt: row.recentUpdatedAt ?? row.updatedAt,
  };
}

export function mapGroupRow(row: GroupRow): GroupRecord {
  return {
    ...row,
    isPinned: sqliteToBoolean(row.isPinned),
    description: row.description ?? null,
  };
}

export function mapGroupListItemRow(row: GroupListItemRow): GroupListItem {
  const group = mapGroupRow(row);
  return {
    ...group,
    imageCount: row.imageCount ?? 0,
    recentUpdatedAt: row.recentUpdatedAt ?? row.updatedAt,
    coverThumbnailFileUri: row.coverThumbnailFileUri ?? null,
  };
}

export function mapGlobalGroupListItemRow(row: GlobalGroupListItemRow): GlobalGroupListItem {
  return {
    ...mapGroupListItemRow(row),
    ipName: row.ipName,
  };
}

export function mapTagUsageItemRow(row: TagUsageItemRow): TagUsageItem {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    imageCount: row.imageCount ?? 0,
    lastUsedAt: row.lastUsedAt ?? null,
  };
}

export function buildUpdateStatement(
  updates: Record<string, SqlValue | undefined>
): { setClause: string; values: SqlValue[] } {
  const entries = Object.entries(updates).filter(
    (entry): entry is [string, SqlValue] => entry[1] !== undefined
  );

  return {
    setClause: entries.map(([column]) => `${column} = ?`).join(', '),
    values: entries.map(([, value]) => value),
  };
}
