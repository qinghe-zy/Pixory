import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  assetRepository,
  backgroundTaskRepository,
  groupRepository,
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
} from '../native/pixoryMediaModule';

export interface PickedVideoAsset {
  uri: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
}

export interface PickVideosForImportResult {
  canceled: boolean;
  pickedAssets: PickedVideoAsset[];
}

export interface VideoImportError {
  sourceUri: string;
  originalFilename: string;
  message: string;
}

export interface ImportedVideoResult {
  video: ImageAssetRecord;
  tags: TagRecord[];
}

export interface ImportVideosToIpResult {
  task: BackgroundTaskRecord | null;
  importBatch: ImportBatchRecord | null;
  importedVideos: ImportedVideoResult[];
  successCount: number;
  failedCount: number;
  errors: VideoImportError[];
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
}

const VIDEO_MIME_TYPES = ['video/*'];

function getFileNameFromUri(fileUri: string): string {
  const [cleanUri] = fileUri.split('?');
  return cleanUri.split('/').pop() ?? 'video.mp4';
}

function getExtension(filename: string): string {
  const match = /\.[A-Za-z0-9]+$/.exec(filename);
  return match ? match[0].toLowerCase() : '.mp4';
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

function buildFallbackFilename(asset: PickedVideoAsset): string {
  return asset.fileName?.trim() || getFileNameFromUri(asset.uri) || 'video.mp4';
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
}: ImportSingleVideoParams): Promise<ImportedVideoResult> {
  const originalFilename = buildFallbackFilename(pickedAsset);
  const internalFilename = generateInternalFilename(originalFilename.endsWith(getExtension(originalFilename)) ? originalFilename : `${originalFilename}.mp4`);
  const { coverUri, originalUri, tempUri } = await buildVideoPaths(space, ipId, internalFilename);
  let createdVideoId: number | null = null;

  try {
    await backgroundTaskRepository.update(db, taskId, {
      status: 'copying',
      currentLabel: originalFilename,
      totalBytes: pickedAsset.fileSize ?? null,
    });
    await copyUriToFileWithProgress(pickedAsset.uri, tempUri, taskId);
    const copiedInfo = await getFileInfo(tempUri);
    if (!copiedInfo.exists || copiedInfo.isDirectory || (copiedInfo.size ?? 0) <= 0) {
      throw new Error('视频复制后文件不可用。');
    }

    await backgroundTaskRepository.update(db, taskId, {
      status: 'verifying',
      completedBytes: copiedInfo.size ?? 0,
      currentLabel: originalFilename,
    });
    await FileSystem.moveAsync({ from: tempUri, to: originalUri });
    const originalInfo = await getFileInfo(originalUri);
    if (!originalInfo.exists || originalInfo.isDirectory || (originalInfo.size ?? 0) <= 0) {
      throw new Error('视频移动到 originals 后文件不可用。');
    }

    const metadata = await getNativeVideoMetadata(originalUri);
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

    await backgroundTaskRepository.update(db, taskId, {
      status: 'writingDatabase',
      currentLabel: originalFilename,
    });
    const createdVideo = await assetRepository.createVideo(db, {
      ipId,
      importBatchId,
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
      isFavorite,
      note: normalizeOptionalText(note) ?? null,
      previewStatus,
    });
    createdVideoId = createdVideo.id;
    await tagRepository.replaceImageTags(db, createdVideo.id, tags.map((tag) => tag.id));

    return {
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

export async function pickVideosForImport(): Promise<PickVideosForImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: false,
    multiple: true,
    type: VIDEO_MIME_TYPES,
  });

  if (result.canceled) {
    return {
      canceled: true,
      pickedAssets: [],
    };
  }

  return {
    canceled: false,
    pickedAssets: result.assets.map((asset) => ({
      uri: asset.uri,
      fileName: asset.name ?? getFileNameFromUri(asset.uri),
      mimeType: asset.mimeType ?? null,
      fileSize: asset.size ?? null,
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
}): Promise<ImportVideosToIpResult> {
  const space = params.space ?? 'normal';
  await ensureAppDirectories(space);

  return runWithDatabaseSpace(space, async (db) => {
    const groupIds = normalizeGroupIds(params.groupIds);
    await ensureImportTargetExists(db, params.ipId, groupIds);

    if (params.pickedAssets.length === 0) {
      return {
        task: null,
        importBatch: null,
        importedVideos: [],
        successCount: 0,
        failedCount: 0,
        errors: [],
      };
    }

    const task = await backgroundTaskRepository.create(db, {
      type: 'video-import',
      space,
      title: params.title ?? '导入视频',
      totalCount: params.pickedAssets.length,
      currentLabel: '准备导入视频',
    });
    const progressSubscription = addNativeCopyProgressListener((event) => {
      if (event.taskId !== task.id) {
        return;
      }
      void backgroundTaskRepository.update(db, task.id, {
        status: 'copying',
        completedBytes: event.copiedBytes,
        totalBytes: event.totalBytes > 0 ? event.totalBytes : null,
      });
    });

    const importBatch = await importBatchRepository.create(db, {
      ipId: params.ipId,
      name: `${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}视频导入`,
      totalCount: params.pickedAssets.length,
    });
    const tags = await resolveTags(db, params.tagNames);
    const importedVideos: ImportedVideoResult[] = [];
    const errors: VideoImportError[] = [];

    try {
      for (const pickedAsset of params.pickedAssets) {
        try {
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
          });
          importedVideos.push(importedVideo);
          await importBatchRepository.createItem(db, {
            importBatchId: importBatch.id,
            sourcePath: pickedAsset.uri,
            originalFilename: buildFallbackFilename(pickedAsset),
            status: 'success',
            imageAssetId: importedVideo.video.id,
          });
          await backgroundTaskRepository.update(db, task.id, {
            successCount: importedVideos.length,
            failedCount: errors.length,
          });
        } catch (error) {
          const importError = {
            sourceUri: pickedAsset.uri,
            originalFilename: buildFallbackFilename(pickedAsset),
            message: error instanceof Error ? error.message : '未知视频导入错误。',
          };
          errors.push(importError);
          await importBatchRepository.createItem(db, {
            importBatchId: importBatch.id,
            sourcePath: pickedAsset.uri,
            originalFilename: importError.originalFilename,
            status: 'failed',
            reason: importError.message,
          });
          await backgroundTaskRepository.update(db, task.id, {
            successCount: importedVideos.length,
            failedCount: errors.length,
            errorMessage: importError.message,
          });
        }
      }

      const completedBatch = await importBatchRepository.complete(db, importBatch.id, importedVideos.length, errors.length);
      const completedTask = await backgroundTaskRepository.update(db, task.id, {
        status: errors.length > 0 && importedVideos.length === 0 ? 'failed' : 'completed',
        successCount: importedVideos.length,
        failedCount: errors.length,
        resultJson: JSON.stringify({ importBatchId: importBatch.id, importedVideoIds: importedVideos.map((item) => item.video.id) }),
      });

      return {
        task: completedTask ?? task,
        importBatch: completedBatch ?? importBatch,
        importedVideos,
        successCount: importedVideos.length,
        failedCount: errors.length,
        errors,
      };
    } finally {
      progressSubscription.remove();
    }
  });
}

export async function saveVideoToSystemAlbum(videoUri: string, displayName: string): Promise<string> {
  return saveNativeVideoToMediaStore(videoUri, displayName);
}
