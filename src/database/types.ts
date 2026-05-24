import type { PixorySpace } from './db';

export type {
  AiBoundaryMode,
  AiCitationRecord,
  AiCitationSourceType,
  AiContextType,
  AiDocumentOwnerType,
  AiDocumentSourceType,
  AiDocumentStatus,
  AiMessageRole,
  AiMessageStatus,
  AiMemorySourceKind,
  AiModelCapabilities,
  AiModelSource,
  AiProviderModelRecord,
  AiProviderProtocol,
  AiProviderRecord,
  AiProviderType,
  AiReplyPreference,
  AiRoleCardRecord,
  AiRoleInstructionWeight,
  AiThreadRecord,
} from '../ai/types';

export interface IpRecord {
  id: number;
  name: string;
  description: string | null;
  isFavorite: boolean;
  coverImageAssetId: number | null;
  coverBlurEnabled: boolean | null;
  coverBlurRadius: number | null;
  deletedAt: string | null;
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
  coverImageAssetId?: number | null;
  coverBlurEnabled?: boolean | null;
  coverBlurRadius?: number | null;
}

export interface IpRow extends Omit<IpRecord, 'isFavorite' | 'coverBlurEnabled'> {
  isFavorite: number;
  coverBlurEnabled: number | null;
}

export type IpLibraryFilter = 'all' | 'recent' | 'favorite';

export interface IpLibraryQuery {
  searchText?: string;
  filter?: IpLibraryFilter;
}

export interface IpListItem extends IpRecord {
  imageCount: number;
  videoCount: number;
  groupCount: number;
  totalBytes: number;
  coverThumbnailFileUri: string | null;
  coverSource: 'custom' | 'default';
}

export interface IpListItemRow extends IpRow {
  imageCount: number;
  videoCount: number;
  groupCount: number;
  totalBytes: number | null;
  coverThumbnailFileUri: string | null;
  coverSource: 'custom' | 'default' | null;
}

export interface GroupRecord {
  id: number;
  ipId: number;
  name: string;
  type: string;
  sortOrder: number;
  isPinned: boolean;
  coverImageAssetId: number | null;
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
  coverImageAssetId?: number | null;
  description?: string | null;
}

export interface UpdateGroupInput {
  ipId?: number;
  name?: string;
  type?: string;
  sortOrder?: number;
  isPinned?: boolean;
  coverImageAssetId?: number | null;
  description?: string | null;
}

export interface IpDetailRecord extends IpRecord {
  imageCount: number;
  videoCount: number;
  groupCount: number;
  tagCount: number;
  totalBytes: number;
  recentUpdatedAt: string;
  coverThumbnailFileUri: string | null;
  coverSource: 'custom' | 'default';
}

export interface ImageListItem extends ImageAssetRecord {
  ipName: string;
  groupName: string | null;
  groupCount: number;
  tagCount: number;
  tagNames: string[];
}

export interface ImageListItemRow extends ImageAssetRow {
  ipName: string;
  groupName: string | null;
  groupCount: number;
  tagCount: number;
  tagNames: string | null;
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
  coverSource: 'custom' | 'default';
}

export interface GroupListItemRow extends GroupRow {
  imageCount: number;
  recentUpdatedAt: string | null;
  coverThumbnailFileUri: string | null;
  coverSource: 'custom' | 'default' | null;
  ipCoverBlurEnabled: number | null;
  ipCoverBlurRadius: number | null;
}

export interface GlobalGroupListItem extends GroupListItem {
  ipName: string;
  ipCoverBlurEnabled: boolean | null;
  ipCoverBlurRadius: number | null;
}

export interface GlobalGroupListItemRow extends GroupListItemRow {
  ipName: string;
}

export interface ImageAssetRecord {
  id: number;
  ipId: number;
  importBatchId: number | null;
  groupId: number | null;
  mediaType: AssetMediaType;
  originalFileUri: string;
  thumbnailFileUri: string | null;
  coverThumbnailFileUri: string | null;
  originalFilename: string;
  internalFilename: string;
  width: number;
  height: number;
  durationMs: number | null;
  mimeType: string;
  fileSize: number;
  isFavorite: boolean;
  note: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastViewedAt: string | null;
  lastPlaybackPositionMs: number | null;
  previewStatus: AssetPreviewStatus;
  contentHash: string | null;
  visualHash: string | null;
}

export type AssetMediaType = 'image' | 'video';
export type AssetPreviewStatus = 'ready' | 'pending' | 'failed';
export type AssetMediaTypeFilter = AssetMediaType | 'all';

export interface CreateImageAssetInput {
  ipId: number;
  importBatchId?: number | null;
  groupId?: number | null;
  groupIds?: number[];
  mediaType?: AssetMediaType;
  originalFileUri: string;
  thumbnailFileUri?: string | null;
  coverThumbnailFileUri?: string | null;
  originalFilename: string;
  internalFilename: string;
  width: number;
  height: number;
  durationMs?: number | null;
  mimeType: string;
  fileSize: number;
  isFavorite?: boolean;
  note?: string | null;
  deletedAt?: string | null;
  lastViewedAt?: string | null;
  lastPlaybackPositionMs?: number | null;
  previewStatus?: AssetPreviewStatus;
  contentHash?: string | null;
  visualHash?: string | null;
}

export interface UpdateImageAssetInput {
  ipId?: number;
  importBatchId?: number | null;
  groupId?: number | null;
  groupIds?: number[];
  mediaType?: AssetMediaType;
  originalFileUri?: string;
  thumbnailFileUri?: string | null;
  coverThumbnailFileUri?: string | null;
  originalFilename?: string;
  internalFilename?: string;
  width?: number;
  height?: number;
  durationMs?: number | null;
  mimeType?: string;
  fileSize?: number;
  isFavorite?: boolean;
  note?: string | null;
  deletedAt?: string | null;
  lastViewedAt?: string | null;
  lastPlaybackPositionMs?: number | null;
  previewStatus?: AssetPreviewStatus;
  contentHash?: string | null;
  visualHash?: string | null;
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
  mediaType?: AssetMediaTypeFilter;
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

export type ImageSortOrder =
  | 'createdAtDesc'
  | 'createdAtAsc'
  | 'updatedAtDesc'
  | 'updatedAtAsc'
  | 'lastViewedAtDesc'
  | 'lastViewedAtAsc'
  | 'deletedAtDesc'
  | 'filenameAsc'
  | 'filenameDesc'
  | 'fileSizeDesc'
  | 'fileSizeAsc';
export type ImageAspectRatioFilter = 'landscape' | 'portrait' | 'square' | 'panorama';

export interface ImageListQueryOptions extends ImageAssetQueryOptions {
  favoritesOnly?: boolean;
  ungroupedOnly?: boolean;
  untaggedOnly?: boolean;
  recentlyViewedOnly?: boolean;
  ipId?: number;
  ipIds?: number[];
  importBatchId?: number;
  groupId?: number;
  groupIds?: number[];
  tagId?: number;
  tagIds?: number[];
  mimeType?: string;
  aspectRatio?: ImageAspectRatioFilter;
  minFileSize?: number;
  maxFileSize?: number;
  searchText?: string;
  orderBy?: ImageSortOrder;
}

export interface DuplicateImageGroup {
  key: string;
  kind: 'exact' | 'similar';
  confidence: 'exact' | 'review';
  contentHash: string | null;
  visualHash: string | null;
  images: ImageListItem[];
}

export interface NeedsOrganizingScope {
  ipId?: number;
  importBatchId?: number | null;
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

export type ImportBatchItemStatus = 'success' | 'failed' | 'skipped';

export interface ImportBatchItemRecord {
  id: number;
  importBatchId: number;
  sourcePath: string;
  originalFilename: string;
  status: ImportBatchItemStatus;
  imageAssetId: number | null;
  reason: string | null;
  createdAt: string;
}

export interface ImportBatchItemRow extends ImportBatchItemRecord {}

export interface CreateImportBatchItemInput {
  importBatchId: number;
  sourcePath: string;
  originalFilename: string;
  status: ImportBatchItemStatus;
  imageAssetId?: number | null;
  reason?: string | null;
}

export interface ImportBatchItemStatusCount {
  status: ImportBatchItemStatus;
  count: number;
}

export interface ImportTemplateRecord {
  key: string;
  name: string;
  groupName: string;
  tags: string[];
  note: string;
  isFavorite: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImportTemplateRow extends Omit<ImportTemplateRecord, 'tags' | 'isFavorite'> {
  tagsJson: string;
  isFavorite: number;
}

export interface CreateImportTemplateInput {
  name: string;
  groupName: string;
  tags?: string[];
  note?: string;
  isFavorite?: boolean;
}

export interface UpdateImportTemplateInput {
  name?: string;
  groupName?: string;
  tags?: string[];
  note?: string;
  isFavorite?: boolean;
}

export interface SuspectedDuplicateGroup {
  key: string;
  width: number;
  height: number;
  fileSize: number;
  images: ImageListItem[];
}

export interface IpOrganizationProgress {
  totalCount: number;
  organizedCount: number;
  organizationPercent: number;
  ungroupedCount: number;
  untaggedCount: number;
  recentImportUnorganizedCount: number;
}

export type BackgroundTaskStatus =
  | 'pending'
  | 'preparing'
  | 'copying'
  | 'verifying'
  | 'generatingPreview'
  | 'writingDatabase'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BackgroundTaskType =
  | 'image-import'
  | 'video-import'
  | 'package-import'
  | 'archive-temp-read'
  | 'duplicate-scan'
  | 'backup'
  | 'restore'
  | 'ip-space-migration'
  | 'trash-clear';

export interface BackgroundTaskRecord {
  id: string;
  type: BackgroundTaskType;
  space: PixorySpace;
  status: BackgroundTaskStatus;
  title: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  totalBytes: number | null;
  completedBytes: number;
  currentLabel: string | null;
  errorMessage: string | null;
  resultJson: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateBackgroundTaskInput {
  id?: string;
  type: BackgroundTaskType;
  space: PixorySpace;
  status?: BackgroundTaskStatus;
  title: string;
  totalCount?: number;
  totalBytes?: number | null;
  currentLabel?: string | null;
}

export interface UpdateBackgroundTaskInput {
  status?: BackgroundTaskStatus;
  title?: string;
  totalCount?: number;
  successCount?: number;
  failedCount?: number;
  totalBytes?: number | null;
  completedBytes?: number;
  currentLabel?: string | null;
  errorMessage?: string | null;
  resultJson?: string | null;
  completedAt?: string | null;
}
