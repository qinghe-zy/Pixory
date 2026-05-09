import type {
  AssetMediaType,
  AssetPreviewStatus,
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

function normalizeMediaType(value: string | null | undefined): AssetMediaType {
  return value === 'video' ? 'video' : 'image';
}

function normalizePreviewStatus(value: string | null | undefined): AssetPreviewStatus {
  return value === 'pending' || value === 'failed' ? value : 'ready';
}

export function mapImageAssetRow(row: ImageAssetRow): ImageAssetRecord {
  return {
    ...row,
    mediaType: normalizeMediaType(row.mediaType),
    coverThumbnailFileUri: row.coverThumbnailFileUri ?? null,
    durationMs: row.durationMs ?? null,
    isFavorite: sqliteToBoolean(row.isFavorite),
    lastPlaybackPositionMs: row.lastPlaybackPositionMs ?? null,
    previewStatus: normalizePreviewStatus(row.previewStatus),
    contentHash: row.contentHash ?? null,
    visualHash: row.visualHash ?? null,
  };
}

export function parseListTagNames(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value.split('\u001F').filter(Boolean);
}

export function mapImageListItemRow(row: ImageListItemRow): ImageListItem {
  return {
    ...mapImageAssetRow(row),
    ipName: row.ipName,
    groupName: row.groupName,
    groupCount: row.groupCount ?? 0,
    tagCount: row.tagCount ?? 0,
    tagNames: parseListTagNames(row.tagNames),
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
    coverImageAssetId: row.coverImageAssetId ?? null,
    coverBlurEnabled: row.coverBlurEnabled == null ? null : sqliteToBoolean(row.coverBlurEnabled),
    coverBlurRadius: row.coverBlurRadius ?? null,
  };
}

export function mapIpListItemRow(row: IpListItemRow): IpListItem {
  return {
    ...mapIpRow(row),
    imageCount: row.imageCount ?? 0,
    videoCount: row.videoCount ?? 0,
    groupCount: row.groupCount ?? 0,
    totalBytes: row.totalBytes ?? 0,
    coverThumbnailFileUri: row.coverThumbnailFileUri ?? null,
    coverSource: row.coverSource === 'custom' ? 'custom' : 'default',
  };
}

export function mapIpDetailRow(
  row: IpRow & {
    imageCount: number;
    videoCount: number;
    groupCount: number;
    tagCount: number;
    totalBytes: number | null;
    recentUpdatedAt: string | null;
    coverThumbnailFileUri: string | null;
    coverSource: 'custom' | 'default' | null;
  }
): IpDetailRecord {
  return {
    ...mapIpRow(row),
    imageCount: row.imageCount ?? 0,
    videoCount: row.videoCount ?? 0,
    groupCount: row.groupCount ?? 0,
    tagCount: row.tagCount ?? 0,
    totalBytes: row.totalBytes ?? 0,
    recentUpdatedAt: row.recentUpdatedAt ?? row.updatedAt,
    coverThumbnailFileUri: row.coverThumbnailFileUri ?? null,
    coverSource: row.coverSource === 'custom' ? 'custom' : 'default',
  };
}

export function mapGroupRow(row: GroupRow): GroupRecord {
  return {
    ...row,
    isPinned: sqliteToBoolean(row.isPinned),
    coverImageAssetId: row.coverImageAssetId ?? null,
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
    coverSource: row.coverSource === 'custom' ? 'custom' : 'default',
  };
}

export function mapGlobalGroupListItemRow(row: GlobalGroupListItemRow): GlobalGroupListItem {
  return {
    ...mapGroupListItemRow(row),
    ipName: row.ipName,
    ipCoverBlurEnabled: row.ipCoverBlurEnabled == null ? null : sqliteToBoolean(row.ipCoverBlurEnabled),
    ipCoverBlurRadius: row.ipCoverBlurRadius ?? null,
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
