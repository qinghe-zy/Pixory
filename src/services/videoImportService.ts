import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import {
  assetRepository,
  backgroundTaskRepository,
  groupRepository,
  imageRepository,
  importBatchRepository,
  ipRepository,
  runWithDatabaseSpace,
  tagRepository,
  type BackgroundTaskRecord,
  type ImageAssetRecord,
  type ImportBatchRecord,
  type PixorySpace,
  type TagRecord,
} from '../database';
import { normalizeOptionalText } from '../database/utils';
import {
  ensureAppDirectories,
  ensureLocalDirectory,
  generateInternalFilename,
  getFileInfo,
  getOriginalsDir,
  getTempDir,
  getThumbnailsDir,
  joinStoragePath,
} from './fileStorageService';
import {
  addNativeCopyProgressListener,
  copyUriToFileWithProgress,
  createNativeVideoThumbnail,
  getNativeVideoMetadata,
  saveNativeVideoToMediaStore,
  computeFileSha256,
  type NativeCopyProgressEvent,
} from '../native/pixoryMediaModule';
import { deleteMediaStoreAssetsWithConfirmation } from './mediaSourceDeletionService';
import { sortPickedAssetsByCreationTime } from './mediaImportOrderService';
import type { MediaPickerSource, VideoImportNamingMode } from '../database/repositories/settingsRepository';
import type { DuplicateImportDecision } from './imageImportService';
import type { ImageImportSourceMode } from '../database/repositories/settingsRepository';
import {
  resolvePickedAssetImportMode,
  toMoveDeletionNotice,
  type MoveDeletionNotice,
} from './mediaImportSourcePolicy';
import { assertPersonalTaskActive, type PersonalTaskToken } from './personalTaskToken';

const VIDEO_IMPORT_PROGRESS_WRITE_INTERVAL_MS = 750;

export interface PickedVideoAsset {
  uri: string;
  assetId?: string | null;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  sourceKind?: MediaPickerSource;
  sourceOrder?: number | null;
}

export interface PickVideosForImportResult {
  canceled: boolean;
  pickedAssets: PickedVideoAsset[];
}

export interface VideoImportError {
  sourceUri: string;
  originalFilename: string;
  message: string;
  skipped?: boolean;
}

export interface ImportedVideoResult {
  pendingSourceDeletionAssetId: string | null;
  sourceDeletionNotice: MoveDeletionNotice | null;
  video: ImageAssetRecord;
  tags: TagRecord[];
}

export interface ImportVideosToIpResult {
  task: BackgroundTaskRecord | null;
  importBatch: ImportBatchRecord | null;
  importedVideos: ImportedVideoResult[];
  successCount: number;
  skippedCount: number;
  failedCount: number;
  errors: VideoImportError[];
  skippedItems: VideoImportError[];
}

interface ImportSingleVideoParams {
  space: PixorySpace;
  db: SQLiteDatabase;
  taskId: string;
  ipId: number;
  importBatchId: number | null;
  groupIds: number[];
  tags: TagRecord[];
  note?: string | null;
  isFavorite?: boolean;
  pickedAsset: PickedVideoAsset;
  videoImportNamingMode: VideoImportNamingMode;
  imageImportSourceMode: ImageImportSourceMode;
  deferSourceDeletion: boolean;
  duplicateDecision?: DuplicateImportDecision;
  progressWriter: VideoImportProgressWriter;
  taskToken?: PersonalTaskToken | null;
}

interface VideoImportProgressWriter {
  finishCopy(): Promise<void>;
  handleProgress(event: NativeCopyProgressEvent): void;
  startCopy(): void;
}

class DuplicateVideoImportSkippedError extends Error {
  skipped = true;

  constructor(message: string) {
    super(message);
    this.name = 'DuplicateVideoImportSkippedError';
  }
}

function isDuplicateVideoImportSkippedError(error: unknown): error is DuplicateVideoImportSkippedError {
  return error instanceof DuplicateVideoImportSkippedError || Boolean((error as { skipped?: boolean } | null)?.skipped);
}

function getFileNameFromUri(fileUri: string): string {
  const [cleanUri] = fileUri.split('?');
  return cleanUri.split('/').pop() ?? 'video.mp4';
}

function getExtension(filename: string): string {
  const match = /\.[A-Za-z0-9]+$/.exec(filename);
  return match ? match[0].toLowerCase() : '.mp4';
}

function createVideoImportProgressWriter(db: SQLiteDatabase, taskId: string): VideoImportProgressWriter {
  let acceptingProgress = false;
  let lastQueuedAt = 0;
  let pendingEvent: NativeCopyProgressEvent | null = null;
  let writeChain = Promise.resolve();

  function queuePendingProgress(force = false) {
    if (!pendingEvent || (!force && Date.now() - lastQueuedAt < VIDEO_IMPORT_PROGRESS_WRITE_INTERVAL_MS)) {
      return;
    }

    const event = pendingEvent;
    pendingEvent = null;
    lastQueuedAt = Date.now();
    writeChain = writeChain
      .then(async () => {
        await backgroundTaskRepository.update(db, taskId, {
          status: 'copying',
          completedBytes: event.copiedBytes,
          totalBytes: event.totalBytes > 0 ? event.totalBytes : null,
        });
      })
      .catch((error) => {
        console.warn('Pixory video import progress update failed.', error);
      });
  }

  return {
    startCopy() {
      acceptingProgress = true;
    },
    handleProgress(event) {
      if (!acceptingProgress) {
        return;
      }
      pendingEvent = event;
      queuePendingProgress();
    },
    async finishCopy() {
      acceptingProgress = false;
      queuePendingProgress(true);
      await writeChain;
    },
  };
}

function resolvePickedVideoAssetId(assetId: string | null | undefined): string | null {
  return typeof assetId === 'string' && assetId.trim() ? assetId : null;
}

function normalizeGroupIds(groupIds?: number[]): number[] {
  if (!groupIds?.length) {
    return [];
  }
  return [...new Set(groupIds.filter((groupId) => Number.isInteger(groupId) && groupId > 0))];
}

function normalizeTagNames(tagNames?: string[]): string[] {
  if (!tagNames?.length) {
    return [];
  }
  const deduped = new Map<string, string>();
  for (const tagName of tagNames) {
    const prepared = tagName.trim();
    if (prepared) {
      deduped.set(prepared.toLowerCase(), prepared);
    }
  }
  return [...deduped.values()];
}

async function ensureImportTargetExists(db: SQLiteDatabase, ipId: number, groupIds: number[]): Promise<void> {
  const ip = await ipRepository.findById(db, ipId);
  if (!ip) {
    throw new Error(`Target IP ${ipId} does not exist.`);
  }

  for (const groupId of groupIds) {
    const group = await groupRepository.findById(db, groupId);
    if (!group || group.ipId !== ipId) {
      throw new Error(`Group ${groupId} does not belong to IP ${ipId}.`);
    }
  }
}

async function resolveTags(db: SQLiteDatabase, tagNames?: string[]): Promise<TagRecord[]> {
  const tags: TagRecord[] = [];
  for (const tagName of normalizeTagNames(tagNames)) {
    const existing = await tagRepository.findByName(db, tagName);
    tags.push(existing ?? (await tagRepository.create(db, { name: tagName })));
  }
  return tags;
}

function buildFallbackFilename(asset: PickedVideoAsset, videoImportNamingMode: VideoImportNamingMode = 'preserveOriginal'): string {
  if (videoImportNamingMode === 'generated') {
    return `video-${Date.now()}${getExtension(asset.fileName || getFileNameFromUri(asset.uri) || 'video.mp4')}`;
  }
  return asset.fileName?.trim() || getFileNameFromUri(asset.uri) || 'video.mp4';
}

function formatVideoImportError(
  pickedAsset: PickedVideoAsset,
  error: unknown,
  videoImportNamingMode: VideoImportNamingMode
): VideoImportError {
  return {
    sourceUri: pickedAsset.uri,
    originalFilename: buildFallbackFilename(pickedAsset, videoImportNamingMode),
    message: error instanceof Error ? error.message : '未知视频导入错误。',
    skipped: isDuplicateVideoImportSkippedError(error),
  };
}

async function shouldSkipVideoDuplicateImport(
  db: SQLiteDatabase,
  duplicateDecision: DuplicateImportDecision | undefined,
  contentHash: string | null
): Promise<string | null> {
  if (duplicateDecision === 'cancelImport') {
    return '用户取消导入。';
  }

  const skipExact = duplicateDecision === 'skipExact' || duplicateDecision === 'skipSimilar';
  if (!skipExact || !contentHash) {
    return null;
  }

  const exactMatches = await imageRepository.findByContentHash(db, contentHash, { mediaType: 'all' });
  return exactMatches.length > 0 ? '已跳过精确重复视频。' : null;
}

async function deleteImportedSourceVideoAsset(pickedAsset: PickedVideoAsset): Promise<boolean> {
  const sourceAssetId = resolvePickedVideoAssetId(pickedAsset.assetId);
  if (!sourceAssetId) {
    return false;
  }

  return deleteMediaStoreAssetsWithConfirmation([sourceAssetId]);
}

async function buildVideoPaths(space: PixorySpace, ipId: number, internalFilename: string) {
  const tempDir = `${joinStoragePath(getTempDir(space), 'importing')}/`;
  const originalsDir = `${joinStoragePath(getOriginalsDir(space), `ip_${ipId}`)}/`;
  const thumbnailsDir = `${joinStoragePath(getThumbnailsDir(space), `ip_${ipId}`)}/`;
  await ensureLocalDirectory(tempDir);
  await ensureLocalDirectory(originalsDir);
  await ensureLocalDirectory(thumbnailsDir);

  const coverFilename = internalFilename.replace(/\.[A-Za-z0-9]+$/, '') + '_cover.jpg';
  return {
    tempUri: joinStoragePath(tempDir, `${Date.now()}_${internalFilename}`),
    originalUri: joinStoragePath(originalsDir, internalFilename),
    coverUri: joinStoragePath(thumbnailsDir, coverFilename),
  };
}

async function importSingleVideo({
  db,
  groupIds,
  importBatchId,
  ipId,
  isFavorite,
  note,
  pickedAsset,
  space,
  tags,
  taskId,
  videoImportNamingMode,
  imageImportSourceMode,
  deferSourceDeletion,
  duplicateDecision,
  progressWriter,
  taskToken,
}: ImportSingleVideoParams): Promise<ImportedVideoResult> {
  assertPersonalTaskActive(taskToken);
  const originalFilename = buildFallbackFilename(pickedAsset, videoImportNamingMode);
  const effectiveImportSourceMode = resolvePickedAssetImportMode(
    pickedAsset.sourceKind ?? 'album',
    imageImportSourceMode
  );
  const internalFilename = generateInternalFilename(originalFilename.endsWith(getExtension(originalFilename)) ? originalFilename : `${originalFilename}.mp4`);
  const { coverUri, originalUri, tempUri } = await buildVideoPaths(space, ipId, internalFilename);
  let createdVideoId: number | null = null;

  try {
    await backgroundTaskRepository.update(db, taskId, {
      status: 'copying',
      currentLabel: originalFilename,
      totalBytes: pickedAsset.fileSize ?? null,
    });
    progressWriter.startCopy();
    try {
      await copyUriToFileWithProgress(pickedAsset.uri, tempUri, taskId);
    } finally {
      await progressWriter.finishCopy();
    }
    assertPersonalTaskActive(taskToken);
    const copiedInfo = await getFileInfo(tempUri);
    if (!copiedInfo.exists || copiedInfo.isDirectory || (copiedInfo.size ?? 0) <= 0) {
      throw new Error('视频复制后文件不可用。');
    }

    await backgroundTaskRepository.update(db, taskId, {
      status: 'verifying',
      completedBytes: copiedInfo.size ?? 0,
      currentLabel: originalFilename,
    });
    const contentHash = await computeFileSha256(tempUri);
    assertPersonalTaskActive(taskToken);
    const shouldSkip = await shouldSkipVideoDuplicateImport(db, duplicateDecision, contentHash);
    if (shouldSkip) {
      throw new DuplicateVideoImportSkippedError(shouldSkip);
    }

    await FileSystem.moveAsync({ from: tempUri, to: originalUri });
    const originalInfo = await getFileInfo(originalUri);
    if (!originalInfo.exists || originalInfo.isDirectory || (originalInfo.size ?? 0) <= 0) {
      throw new Error('视频移动到 originals 后文件不可用。');
    }

    const metadata = await getNativeVideoMetadata(originalUri);
    assertPersonalTaskActive(taskToken);
    let coverThumbnailFileUri: string | null = null;
    let previewStatus: 'ready' | 'failed' = 'ready';
    try {
      await backgroundTaskRepository.update(db, taskId, {
        status: 'generatingPreview',
        currentLabel: originalFilename,
      });
      const cover = await createNativeVideoThumbnail(originalUri, coverUri);
      coverThumbnailFileUri = cover.uri || coverUri;
    } catch {
      previewStatus = 'failed';
    }
    assertPersonalTaskActive(taskToken);

    await backgroundTaskRepository.update(db, taskId, {
      status: 'writingDatabase',
      currentLabel: originalFilename,
    });
    const createdVideo = await assetRepository.createVideo(db, {
      ipId,
      importBatchId,
      sourceOrder: pickedAsset.sourceOrder ?? null,
      groupId: groupIds[0] ?? null,
      groupIds,
      originalFileUri: originalUri,
      thumbnailFileUri: coverThumbnailFileUri,
      coverThumbnailFileUri,
      originalFilename,
      internalFilename,
      width: metadata.width,
      height: metadata.height,
      durationMs: metadata.durationMs,
      mimeType: metadata.mimeType ?? pickedAsset.mimeType ?? 'video/mp4',
      fileSize: originalInfo.size ?? metadata.fileSize ?? pickedAsset.fileSize ?? 0,
      contentHash,
      visualHash: null,
      isFavorite,
      note: normalizeOptionalText(note) ?? null,
      previewStatus,
    });
    assertPersonalTaskActive(taskToken);
    createdVideoId = createdVideo.id;
    await tagRepository.replaceImageTags(db, createdVideo.id, tags.map((tag) => tag.id));
    assertPersonalTaskActive(taskToken);

    let sourceDeletionNotice: MoveDeletionNotice | null = null;
    let pendingSourceDeletionAssetId: string | null = null;
    if (effectiveImportSourceMode === 'move') {
      const sourceAssetId = resolvePickedVideoAssetId(pickedAsset.assetId);
      if (deferSourceDeletion && sourceAssetId) {
        pendingSourceDeletionAssetId = sourceAssetId;
      } else if (deferSourceDeletion) {
        sourceDeletionNotice = toMoveDeletionNotice(false);
      } else {
        let sourceDeleted = false;
        try {
          sourceDeleted = await deleteImportedSourceVideoAsset(pickedAsset);
        } catch (error) {
          console.warn('Pixory source video deletion was not completed:', error);
        }
        sourceDeletionNotice = toMoveDeletionNotice(sourceDeleted);
      }
    }

    return {
      pendingSourceDeletionAssetId,
      sourceDeletionNotice,
      video: createdVideo,
      tags,
    };
  } catch (error) {
    if (createdVideoId != null) {
      await db.runAsync('DELETE FROM image_assets WHERE id = ?', createdVideoId);
    }
    await FileSystem.deleteAsync(tempUri, { idempotent: true });
    await FileSystem.deleteAsync(originalUri, { idempotent: true });
    await FileSystem.deleteAsync(coverUri, { idempotent: true });
    throw error;
  }
}

export async function pickVideosForImport(
  imageImportSourceMode: ImageImportSourceMode = 'copy'
): Promise<PickVideosForImportResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Media library permission is required to import videos.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsMultipleSelection: true,
    allowsEditing: false,
    legacy: Platform.OS === 'android' && imageImportSourceMode === 'move',
    quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });

  if (result.canceled) {
    return {
      canceled: true,
      pickedAssets: [],
    };
  }

  const orderedAssets = await sortPickedAssetsByCreationTime(result.assets);
  return {
    canceled: false,
    pickedAssets: orderedAssets.map((asset, index) => ({
      assetId: asset.assetId ?? null,
      uri: asset.uri,
      fileName: asset.fileName ?? getFileNameFromUri(asset.uri),
      mimeType: asset.mimeType ?? 'video/mp4',
      fileSize: asset.fileSize ?? null,
      sourceKind: 'album',
      sourceOrder: index + 1,
    })),
  };
}

export async function importVideosToIp(params: {
  space?: PixorySpace;
  ipId: number;
  groupIds?: number[];
  tagNames?: string[];
  note?: string | null;
  isFavorite?: boolean;
  pickedAssets: PickedVideoAsset[];
  title?: string;
  duplicateDecision?: DuplicateImportDecision;
  imageImportSourceMode?: ImageImportSourceMode;
  deferSourceDeletion?: boolean;
  videoImportNamingMode?: VideoImportNamingMode;
  taskToken?: PersonalTaskToken | null;
  onProgress?: (current: number, total: number) => void;
}): Promise<ImportVideosToIpResult> {
  await activateKeepAwakeAsync();
  try {
    const space = params.space ?? 'normal';
    assertPersonalTaskActive(params.taskToken);
    await ensureAppDirectories(space);

  return runWithDatabaseSpace(space, async (db) => {
    assertPersonalTaskActive(params.taskToken);
    const groupIds = normalizeGroupIds(params.groupIds);
    await ensureImportTargetExists(db, params.ipId, groupIds);

    if (params.pickedAssets.length === 0) {
      return {
        task: null,
        importBatch: null,
        importedVideos: [],
        successCount: 0,
        skippedCount: 0,
        failedCount: 0,
        errors: [],
        skippedItems: [],
      };
    }

    const task = await backgroundTaskRepository.create(db, {
      type: 'video-import',
      space,
      title: params.title ?? '导入视频',
      totalCount: params.pickedAssets.length,
      currentLabel: '准备导入视频',
    });
    const progressWriter = createVideoImportProgressWriter(db, task.id);
    const progressSubscription = addNativeCopyProgressListener((event) => {
      if (event.taskId !== task.id) {
        return;
      }
      progressWriter.handleProgress(event);
    });

    const importBatch = await importBatchRepository.create(db, {
      ipId: params.ipId,
      name: `${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}视频导入`,
      totalCount: params.pickedAssets.length,
    });
    const tags = await resolveTags(db, params.tagNames);
    assertPersonalTaskActive(params.taskToken);
    const importedVideos: ImportedVideoResult[] = [];
    const errors: VideoImportError[] = [];
    const skippedItems: VideoImportError[] = [];
    let skippedCount = 0;
    const videoImportNamingMode = params.videoImportNamingMode ?? 'preserveOriginal';
    const imageImportSourceMode = params.imageImportSourceMode ?? 'copy';

    try {
      let currentIndex = 0;
      for (const pickedAsset of params.pickedAssets) {
        currentIndex++;
        params.onProgress?.(currentIndex, params.pickedAssets.length);
        try {
          assertPersonalTaskActive(params.taskToken);
          const importedVideo = await importSingleVideo({
            db,
            groupIds,
            importBatchId: importBatch.id,
            ipId: params.ipId,
            isFavorite: params.isFavorite,
            note: params.note,
            pickedAsset,
            space,
            tags,
            taskId: task.id,
            duplicateDecision: params.duplicateDecision,
            imageImportSourceMode,
            deferSourceDeletion: params.deferSourceDeletion ?? false,
            videoImportNamingMode,
            progressWriter,
            taskToken: params.taskToken ?? null,
          });
          importedVideos.push(importedVideo);
          await importBatchRepository.createItem(db, {
            importBatchId: importBatch.id,
            sourcePath: pickedAsset.uri,
            originalFilename: buildFallbackFilename(pickedAsset, videoImportNamingMode),
            status: 'success',
            imageAssetId: importedVideo.video.id,
          });
          await backgroundTaskRepository.update(db, task.id, {
            successCount: importedVideos.length,
            failedCount: errors.length,
          });
        } catch (error) {
          const importError = formatVideoImportError(pickedAsset, error, videoImportNamingMode);
          if (importError.skipped) {
            skippedCount += 1;
            skippedItems.push(importError);
          } else {
            errors.push(importError);
          }
          await importBatchRepository.createItem(db, {
            importBatchId: importBatch.id,
            sourcePath: pickedAsset.uri,
            originalFilename: importError.originalFilename,
            status: importError.skipped ? 'skipped' : 'failed',
            reason: importError.message,
          });
          await backgroundTaskRepository.update(db, task.id, {
            successCount: importedVideos.length,
            failedCount: errors.length,
            errorMessage: importError.skipped ? null : importError.message,
          });
        }
      }

      const completedBatch = await importBatchRepository.complete(db, importBatch.id, importedVideos.length, errors.length);
      const completedTask = await backgroundTaskRepository.update(db, task.id, {
        status: errors.length > 0 && importedVideos.length === 0 ? 'failed' : 'completed',
        successCount: importedVideos.length,
        failedCount: errors.length,
        resultJson: JSON.stringify({ importBatchId: importBatch.id, importedVideoIds: importedVideos.map((item) => item.video.id), skippedCount }),
      });

      return {
        task: completedTask ?? task,
        importBatch: completedBatch ?? importBatch,
        importedVideos,
        successCount: importedVideos.length,
        skippedCount,
        failedCount: errors.length,
        errors,
        skippedItems,
      };
    } finally {
      progressSubscription.remove();
    }
  });
  } finally {
    deactivateKeepAwake();
  }
}

export async function saveVideoToSystemAlbum(videoUri: string, displayName: string): Promise<string> {
  return saveNativeVideoToMediaStore(videoUri, displayName);
}
