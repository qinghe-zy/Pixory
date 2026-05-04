export interface IpRecord {
  id: number;
  name: string;
  description: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIpInput {
  name: string;
  description?: string | null;
  isFavorite?: boolean;
}

export interface UpdateIpInput {
  name?: string;
  description?: string | null;
  isFavorite?: boolean;
}

export interface IpRow extends Omit<IpRecord, 'isFavorite'> {
  isFavorite: number;
}

export type IpLibraryFilter = 'all' | 'recent' | 'favorite';

export interface IpLibraryQuery {
  searchText?: string;
  filter?: IpLibraryFilter;
}

export interface IpListItem extends IpRecord {
  imageCount: number;
  groupCount: number;
  coverThumbnailFileUri: string | null;
}

export interface IpListItemRow extends IpRow {
  imageCount: number;
  groupCount: number;
  coverThumbnailFileUri: string | null;
}

export interface GroupRecord {
  id: number;
  ipId: number;
  name: string;
  type: string;
  sortOrder: number;
  isPinned: boolean;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupRow extends Omit<GroupRecord, 'isPinned'> {
  isPinned: number;
}

export interface CreateGroupInput {
  ipId: number;
  name: string;
  type?: string;
  sortOrder?: number;
  isPinned?: boolean;
  description?: string | null;
}

export interface UpdateGroupInput {
  ipId?: number;
  name?: string;
  type?: string;
  sortOrder?: number;
  isPinned?: boolean;
  description?: string | null;
}

export interface IpDetailRecord extends IpRecord {
  imageCount: number;
  groupCount: number;
  tagCount: number;
  recentUpdatedAt: string;
}

export interface ImageListItem extends ImageAssetRecord {
  ipName: string;
  groupName: string | null;
  groupCount: number;
  tagCount: number;
}

export interface ImageListItemRow extends ImageAssetRow {
  ipName: string;
  groupName: string | null;
  groupCount: number;
  tagCount: number;
}

export interface ImageDetailRecord extends ImageAssetRecord {
  ipName: string;
  groupName: string | null;
  groupType: string | null;
  groupCount: number;
}

export interface ImageDetailRow extends ImageAssetRow {
  ipName: string;
  groupName: string | null;
  groupType: string | null;
  groupCount: number;
}

export interface GroupListItem extends GroupRecord {
  imageCount: number;
  recentUpdatedAt: string;
  coverThumbnailFileUri: string | null;
}

export interface GroupListItemRow extends GroupRow {
  imageCount: number;
  recentUpdatedAt: string | null;
  coverThumbnailFileUri: string | null;
}

export interface GlobalGroupListItem extends GroupListItem {
  ipName: string;
}

export interface GlobalGroupListItemRow extends GroupListItemRow {
  ipName: string;
}

export interface ImageAssetRecord {
  id: number;
  ipId: number;
  importBatchId: number | null;
  groupId: number | null;
  originalFileUri: string;
  thumbnailFileUri: string | null;
  originalFilename: string;
  internalFilename: string;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
  isFavorite: boolean;
  note: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastViewedAt: string | null;
}

export interface CreateImageAssetInput {
  ipId: number;
  importBatchId?: number | null;
  groupId?: number | null;
  groupIds?: number[];
  originalFileUri: string;
  thumbnailFileUri?: string | null;
  originalFilename: string;
  internalFilename: string;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
  isFavorite?: boolean;
  note?: string | null;
  deletedAt?: string | null;
  lastViewedAt?: string | null;
}

export interface UpdateImageAssetInput {
  ipId?: number;
  importBatchId?: number | null;
  groupId?: number | null;
  groupIds?: number[];
  originalFileUri?: string;
  thumbnailFileUri?: string | null;
  originalFilename?: string;
  internalFilename?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  fileSize?: number;
  isFavorite?: boolean;
  note?: string | null;
  deletedAt?: string | null;
  lastViewedAt?: string | null;
}

export interface TagRecord {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTagInput {
  name: string;
}

export interface UpdateTagInput {
  name?: string;
}

export interface ImageAssetQueryOptions {
  includeDeleted?: boolean;
}

export interface ImageAssetRow extends Omit<ImageAssetRecord, 'isFavorite'> {
  isFavorite: number;
}

export interface CountRow {
  count: number;
}

export interface SumRow {
  totalBytes: number | null;
}

export interface AppSettingRecord {
  key: string;
  value: string | null;
  updatedAt: string;
}

export type ImageSortOrder = 'createdAtDesc' | 'lastViewedAtDesc' | 'deletedAtDesc';

export interface ImageListQueryOptions extends ImageAssetQueryOptions {
  favoritesOnly?: boolean;
  ungroupedOnly?: boolean;
  untaggedOnly?: boolean;
  recentlyViewedOnly?: boolean;
  ipId?: number;
  importBatchId?: number;
  groupId?: number;
  tagId?: number;
  mimeType?: string;
  minFileSize?: number;
  maxFileSize?: number;
  searchText?: string;
  orderBy?: ImageSortOrder;
}

export interface GlobalSearchResult {
  ips: IpListItem[];
  groups: GlobalGroupListItem[];
  tags: TagUsageItem[];
  images: ImageListItem[];
}

export interface TagUsageItem extends TagRecord {
  imageCount: number;
  lastUsedAt: string | null;
}

export interface TagUsageItemRow extends TagRecord {
  imageCount: number;
  lastUsedAt: string | null;
}

export interface ImportBatchRecord {
  id: number;
  ipId: number;
  name: string;
  templateKey: string | null;
  totalCount: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ImportBatchRow extends ImportBatchRecord {}

export interface CreateImportBatchInput {
  ipId: number;
  name?: string;
  templateKey?: string | null;
  totalCount?: number;
}

export interface UpdateImportBatchInput {
  name?: string;
  templateKey?: string | null;
  totalCount?: number;
  successCount?: number;
  failedCount?: number;
  completedAt?: string | null;
}

export interface ImportBatchSummary extends ImportBatchRecord {
  ipName: string;
  activeCount: number;
  organizedCount: number;
  ungroupedCount: number;
  untaggedCount: number;
  noNoteCount: number;
  suspectedDuplicateCount: number;
}

export interface ImportBatchSummaryRow extends ImportBatchRow {
  ipName: string;
  activeCount: number;
  organizedCount: number;
  ungroupedCount: number;
  untaggedCount: number;
  noNoteCount: number;
  suspectedDuplicateCount: number;
}

export interface IpOrganizationProgress {
  totalCount: number;
  organizedCount: number;
  organizationPercent: number;
  ungroupedCount: number;
  untaggedCount: number;
  recentImportUnorganizedCount: number;
}
