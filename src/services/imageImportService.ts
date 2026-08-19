import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Image, Platform } from 'react-native';

import { groupRepository, imageRepository, importBatchRepository, ipRepository, runWithDatabaseSpace, tagRepository } from '../database';
import type { ImageAssetRecord, ImportBatchRecord, PixorySpace, TagRecord } from '../database';
import { normalizeOptionalText } from '../database/utils';
import {
  copyOriginalToAppStorage,
  deleteLocalFile,
  ensureAppDirectories,
  generateInternalFilename,
  getFileInfo,
} from './fileStorageService';
import { generateThumbnail } from './thumbnailService';
import { devLog } from '../utils/dev';
import { assertPersonalTaskActive, type PersonalTaskToken } from './personalTaskToken';
import { computeFileSha256, computeImageDHash } from '../native/pixoryMediaModule';
import type { ImageImportSourceMode, MediaPickerSource } from '../database/repositories/settingsRepository';
import { deleteMediaStoreAssetsWithConfirmation } from './mediaSourceDeletionService';
import { sortPickedAssetsByCreationTime } from './mediaImportOrderService';
import {
  resolvePickedAssetImportMode,
  toMoveDeletionNotice,
  type MoveDeletionNotice,
} from './mediaImportSourcePolicy';

export interface PickedImageAsset extends ImagePicker.ImagePickerAsset {
  sourceKind?: MediaPickerSource;
  sourceOrder?: number | null;
}
export type DuplicateImportDecision = 'importAll' | 'skipExact' | 'skipSimilar' | 'cancelImport';

export interface PickImagesForImportResult {
  canceled: boolean;
  pickedAssets: PickedImageAsset[];
}

export interface ImportImagesToIpParams {
  space?: PixorySpace;
  ipId: number;
  groupId?: number | null;
  groupIds?: number[];
  tagNames?: string[];
  note?: string | null;
  isFavorite?: boolean;
  templateKey?: string | null;
  pickedAssets: PickedImageAsset[];
  duplicateDecision?: DuplicateImportDecision;
  imageImportSourceMode?: ImageImportSourceMode;
  deferSourceDeletion?: boolean;
  taskToken?: PersonalTaskToken | null;
  onProgress?: (current: number, total: number) => void;
}

export interface BuildImageAssetFromPickedFileParams {
  space?: PixorySpace;
  ipId: number;
  importBatchId?: number | null;
  groupId?: number | null;
  groupIds?: number[];
  note?: string | null;
  isFavorite?: boolean;
  pickedAsset: PickedImageAsset;
  duplicateDecision?: DuplicateImportDecision;
  imageImportSourceMode?: ImageImportSourceMode;
  deferSourceDeletion?: boolean;
  taskToken?: PersonalTaskToken | null;
}

export interface ImportSingleImageParams {
  space?: PixorySpace;
  ipId: number;
  importBatchId?: number | null;
  groupId?: number | null;
  groupIds?: number[];
  tagNames?: string[];
  note?: string | null;
  isFavorite?: boolean;
  pickedAsset: PickedImageAsset;
  duplicateDecision?: DuplicateImportDecision;
  imageImportSourceMode?: ImageImportSourceMode;
  deferSourceDeletion?: boolean;
  taskToken?: PersonalTaskToken | null;
}

export interface PendingImageAssetImport {
  space: PixorySpace;
  ipId: number;
  importBatchId: number | null;
  sourceOrder: number | null;
  groupId: number | null;
  groupIds: number[];
  sourceUri: string;
  originalFilename: string;
  internalFilename: string;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
  sourceAssetId: string | null;
  duplicateDecision: DuplicateImportDecision;
  imageImportSourceMode: ImageImportSourceMode;
  deferSourceDeletion: boolean;
  isFavorite: boolean;
  note: string | null;
  taskToken?: PersonalTaskToken | null;
}

export interface ImportedImageResult {
  image: ImageAssetRecord;
  pendingSourceDeletionAssetId: string | null;
  sourceDeletionNotice: MoveDeletionNotice | null;
  tags: TagRecord[];
}

export interface ImportedImageVerificationResult {
  imageId: number;
  originalFileUri: string;
  thumbnailFileUri: string | null;
  originalExists: boolean;
  thumbnailExists: boolean;
  originalSize: number | null;
  thumbnailSize: number | null;
  originalSizeValid: boolean;
  thumbnailSizeValid: boolean;
  databaseRecordFound: boolean;
  imageTagsReadback: TagRecord[];
  allChecksPassed: boolean;
}

export interface VerifyImportedImageFilesResult {
  verifiedCount: number;
  failedCount: number;
  items: ImportedImageVerificationResult[];
}

export interface ImageImportError {
  sourceUri: string;
  originalFilename: string;
  message: string;
  skipped?: boolean;
}

export interface ImportImagesToIpResult {
  successCount: number;
  skippedCount: number;
  failedCount: number;
  importBatch: ImportBatchRecord | null;
  importedImages: ImportedImageResult[];
  errors: ImageImportError[];
  skippedItems: ImageImportError[];
}

class DuplicateImportSkippedError extends Error {
  skipped = true;

  constructor(message: string) {
    super(message);
    this.name = 'DuplicateImportSkippedError';
  }
}

function isDuplicateImportSkippedError(error: unknown): error is DuplicateImportSkippedError {
  return error instanceof DuplicateImportSkippedError || Boolean((error as { skipped?: boolean } | null)?.skipped);
}

export interface ImageImportDevelopmentCheckResult {
  canceled: boolean;
  ipId: number;
  createdDevelopmentIp: boolean;
  result: ImportImagesToIpResult;
  verification: VerifyImportedImageFilesResult;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function extractFilenameFromUri(fileUri: string): string {
  const [cleanUri] = fileUri.split('?');
  return cleanUri.split('/').pop() ?? '';
}

function getExtensionFromFilename(filename: string): string | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  return match ? match[1].toLowerCase() : null;
}

function buildFallbackFilename(pickedAsset: PickedImageAsset): string {
  const sourceFilename = extractFilenameFromUri(pickedAsset.uri);
  if (sourceFilename) {
    return sourceFilename;
  }

  const mimeExtension =
    Object.entries(MIME_BY_EXTENSION).find(([, mimeType]) => mimeType === pickedAsset.mimeType)?.[0] ??
    'jpg';

  return `imported-image.${mimeExtension}`;
}

function resolvePickedAssetId(assetId: string | null | undefined): string | null {
  return typeof assetId === 'string' && assetId.trim() ? assetId : null;
}

function resolveMimeType(pickedAsset: PickedImageAsset, filename: string): string {
  if (pickedAsset.mimeType?.trim()) {
    return pickedAsset.mimeType.trim().toLowerCase();
  }

  const extension = getExtensionFromFilename(filename);
  if (extension && MIME_BY_EXTENSION[extension]) {
    return MIME_BY_EXTENSION[extension];
  }

  return 'image/jpeg';
}

function normalizeTagNames(tagNames?: string[]): string[] {
  if (!tagNames?.length) {
    return [];
  }

  const dedupedNames = new Map<string, string>();

  for (const rawTagName of tagNames) {
    const normalizedTagName = rawTagName.trim();
    if (!normalizedTagName) {
      continue;
    }

    const tagKey = normalizedTagName.toLowerCase();
    if (!dedupedNames.has(tagKey)) {
      dedupedNames.set(tagKey, normalizedTagName);
    }
  }

  return [...dedupedNames.values()];
}

function normalizeGroupIds(groupIds?: number[]): number[] {
  if (!groupIds?.length) {
    return [];
  }

  return [...new Set(groupIds.filter((groupId) => Number.isInteger(groupId) && groupId > 0))];
}

async function ensureImportTargetExists(db: SQLiteDatabase, ipId: number, groupIds?: number[]): Promise<void> {
  const ipRecord = await ipRepository.findById(db, ipId);
  if (!ipRecord) {
    throw new Error(`Target IP ${ipId} does not exist.`);
  }

  for (const groupId of normalizeGroupIds(groupIds)) {
    const groupRecord = await groupRepository.findById(db, groupId);
    if (!groupRecord) {
      throw new Error(`Target group ${groupId} does not exist.`);
    }

    if (groupRecord.ipId !== ipId) {
      throw new Error(`Group ${groupId} does not belong to IP ${ipId}.`);
    }
  }
}

async function getOrCreateTag(db: SQLiteDatabase, name: string): Promise<TagRecord> {
  const existingTag = await tagRepository.findByName(db, name);
  if (existingTag) {
    return existingTag;
  }

  try {
    return await tagRepository.create(db, { name });
  } catch (error) {
    const concurrentTag = await tagRepository.findByName(db, name);
    if (concurrentTag) {
      return concurrentTag;
    }

    throw error;
  }
}

async function resolveTags(db: SQLiteDatabase, tagNames?: string[]): Promise<TagRecord[]> {
  const normalizedTagNames = normalizeTagNames(tagNames);
  if (normalizedTagNames.length === 0) {
    return [];
  }

  const resolvedTags: TagRecord[] = [];

  for (const tagName of normalizedTagNames) {
    resolvedTags.push(await getOrCreateTag(db, tagName));
  }

  return resolvedTags;
}

async function cleanupFailedImport(
  db: SQLiteDatabase,
  createdImageId: number | null,
  originalFileUri: string | null,
  thumbnailFileUri: string | null
): Promise<void> {
  const cleanupTasks: Array<Promise<void>> = [];

  if (createdImageId !== null) {
    cleanupTasks.push(
      (async () => {
        await db.runAsync('DELETE FROM image_assets WHERE id = ?', createdImageId);
      })()
    );
  }

  if (thumbnailFileUri) {
    cleanupTasks.push(deleteLocalFile(thumbnailFileUri));
  }

  if (originalFileUri) {
    cleanupTasks.push(deleteLocalFile(originalFileUri));
  }

  const cleanupResults = await Promise.allSettled(cleanupTasks);
  for (const cleanupResult of cleanupResults) {
    if (cleanupResult.status === 'rejected') {
      console.warn('Pixory import cleanup failed:', cleanupResult.reason);
    }
  }
}

function formatImportError(pickedAsset: PickedImageAsset, error: unknown): ImageImportError {
  const originalFilename = pickedAsset.fileName?.trim() || buildFallbackFilename(pickedAsset);
  const message = error instanceof Error ? error.message : 'Unknown import error.';

  return {
    sourceUri: pickedAsset.uri,
    originalFilename,
    message,
    skipped: isDuplicateImportSkippedError(error),
  };
}

function getImageDimensions(fileUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      fileUri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

async function resolveDimensionsForPickedAsset(
  pickedAsset: PickedImageAsset,
  originalFilename: string
): Promise<{ width: number; height: number }> {
  if (pickedAsset.width > 0 && pickedAsset.height > 0) {
    return {
      width: pickedAsset.width,
      height: pickedAsset.height,
    };
  }

  try {
    return await getImageDimensions(pickedAsset.uri);
  } catch {
    throw new Error(`Picked image dimensions are unavailable for ${originalFilename}.`);
  }
}

async function performSingleImageImport(
  db: SQLiteDatabase,
  pendingImageAsset: PendingImageAssetImport,
  resolvedTags: TagRecord[]
): Promise<ImportedImageResult> {
  assertPersonalTaskActive(pendingImageAsset.taskToken);
  let originalFileUri: string | null = null;
  let thumbnailFileUri: string | null = null;
  let createdImageId: number | null = null;

  try {
    originalFileUri = await copyOriginalToAppStorage(
      pendingImageAsset.sourceUri,
      pendingImageAsset.ipId,
      pendingImageAsset.internalFilename,
      pendingImageAsset.space
    );
    assertPersonalTaskActive(pendingImageAsset.taskToken);

    const originalFileInfo = await getFileInfo(originalFileUri);
    const contentHash = await computeFileSha256(originalFileUri);
    const visualHash = await computeImageDHash(originalFileUri).catch(() => null);
    const shouldSkip = await shouldSkipDuplicateImport(db, pendingImageAsset, contentHash, visualHash);
    if (shouldSkip) {
      await deleteLocalFile(originalFileUri);
      originalFileUri = null;
      throw new DuplicateImportSkippedError(shouldSkip);
    }

    thumbnailFileUri = await generateThumbnail(
      originalFileUri,
      pendingImageAsset.ipId,
      pendingImageAsset.internalFilename,
      pendingImageAsset.space
    );
    assertPersonalTaskActive(pendingImageAsset.taskToken);

    const createdImage = await imageRepository.create(db, {
      ipId: pendingImageAsset.ipId,
      importBatchId: pendingImageAsset.importBatchId,
      sourceOrder: pendingImageAsset.sourceOrder,
      groupId: pendingImageAsset.groupId,
      groupIds: pendingImageAsset.groupIds,
      originalFileUri,
      thumbnailFileUri,
      originalFilename: pendingImageAsset.originalFilename,
      internalFilename: pendingImageAsset.internalFilename,
      width: pendingImageAsset.width,
      height: pendingImageAsset.height,
      mimeType: pendingImageAsset.mimeType,
      fileSize: originalFileInfo.size ?? pendingImageAsset.fileSize,
      contentHash,
      visualHash,
      isFavorite: pendingImageAsset.isFavorite,
      note: pendingImageAsset.note,
    });
    assertPersonalTaskActive(pendingImageAsset.taskToken);
    createdImageId = createdImage.id;

    await tagRepository.replaceImageTags(db,
      createdImage.id,
      resolvedTags.map((tag) => tag.id)
    );

    const persistedImageRecord = await imageRepository.findById(db, createdImage.id, { includeDeleted: true });
    const persistedImageTags = await tagRepository.findByImageId(db, createdImage.id);

    devLog('Pixory import persisted image asset:', {
      imageAssetId: createdImage.id,
      fileSize: createdImage.fileSize,
      width: createdImage.width,
      height: createdImage.height,
      mimeType: createdImage.mimeType,
      databaseRecordFound: Boolean(persistedImageRecord),
      tagCount: persistedImageTags.length,
    });

    let sourceDeletionNotice: MoveDeletionNotice | null = null;
    let pendingSourceDeletionAssetId: string | null = null;
    if (pendingImageAsset.imageImportSourceMode === 'move') {
      if (pendingImageAsset.deferSourceDeletion && pendingImageAsset.sourceAssetId) {
        pendingSourceDeletionAssetId = pendingImageAsset.sourceAssetId;
      } else if (pendingImageAsset.deferSourceDeletion) {
        sourceDeletionNotice = toMoveDeletionNotice(false);
      } else {
        let sourceDeleted = false;
        try {
          sourceDeleted = await deleteImportedSourceAsset(pendingImageAsset);
        } catch (error) {
          devLog('Pixory source image deletion was not completed:', error);
        }
        sourceDeletionNotice = toMoveDeletionNotice(sourceDeleted);
      }
    }

    return {
      image: createdImage,
      pendingSourceDeletionAssetId,
      sourceDeletionNotice,
      tags: resolvedTags,
    };
  } catch (error) {
    await cleanupFailedImport(db, createdImageId, originalFileUri, thumbnailFileUri);
    throw error;
  }
}

async function shouldSkipDuplicateImport(
  db: SQLiteDatabase,
  pendingImageAsset: PendingImageAssetImport,
  contentHash: string | null,
  visualHash: string | null
): Promise<string | null> {
  if (pendingImageAsset.duplicateDecision === 'cancelImport') {
    return '用户取消导入。';
  }

  const skipExact = pendingImageAsset.duplicateDecision === 'skipExact' || pendingImageAsset.duplicateDecision === 'skipSimilar';
  if (skipExact && contentHash) {
    const exactMatches = await imageRepository.findByContentHash(db, contentHash, { mediaType: 'all' });
    if (exactMatches.length > 0) {
      return '已跳过精确重复素材。';
    }
  }

  const skipSimilar = pendingImageAsset.duplicateDecision === 'skipSimilar';
  if (skipSimilar && visualHash) {
    const similarMatches = await imageRepository.findByVisualHash(db, visualHash);
    if (similarMatches.length > 0) {
      return '已跳过相似图片。';
    }
  }

  return null;
}

export async function deleteImportedSourceAsset(pendingImageAsset: PendingImageAssetImport): Promise<boolean> {
  if (!pendingImageAsset.sourceAssetId) {
    return false;
  }

  return deleteMediaStoreAssetsWithConfirmation([pendingImageAsset.sourceAssetId]);
}

export async function pickImagesForImport(
  imageImportSourceMode: ImageImportSourceMode = 'copy'
): Promise<PickImagesForImportResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Media library permission is required to import images.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
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
    pickedAssets: orderedAssets
      .filter((asset) => asset.type === 'image' || asset.type == null)
      .map((asset, index) => ({ ...asset, sourceKind: 'album', sourceOrder: index + 1 })),
  };
}

export async function buildImageAssetFromPickedFile(
  params: BuildImageAssetFromPickedFileParams
): Promise<PendingImageAssetImport> {
  const { groupId, groupIds, ipId, isFavorite, note, pickedAsset } = params;
  const normalizedGroupIds = normalizeGroupIds(groupIds ?? (groupId != null ? [groupId] : []));

  if (!pickedAsset.uri?.trim()) {
    throw new Error('Picked image URI is missing.');
  }

  if (pickedAsset.type && pickedAsset.type !== 'image') {
    throw new Error(`Unsupported picked asset type: ${pickedAsset.type}.`);
  }

  const originalFilename = pickedAsset.fileName?.trim() || buildFallbackFilename(pickedAsset);
  const fileSize = pickedAsset.fileSize ?? 0;
  const { width, height } = await resolveDimensionsForPickedAsset(pickedAsset, originalFilename);
  const sourceAssetId = resolvePickedAssetId(pickedAsset.assetId);
  const imageImportSourceMode = resolvePickedAssetImportMode(
    pickedAsset.sourceKind ?? 'album',
    params.imageImportSourceMode ?? 'copy'
  );

  return {
    space: params.space ?? 'normal',
    ipId,
    importBatchId: params.importBatchId ?? null,
    sourceOrder: pickedAsset.sourceOrder ?? null,
    groupId: normalizedGroupIds[0] ?? null,
    groupIds: normalizedGroupIds,
    sourceUri: pickedAsset.uri,
    originalFilename,
    internalFilename: generateInternalFilename(originalFilename),
    width,
    height,
    mimeType: resolveMimeType(pickedAsset, originalFilename),
    fileSize,
    sourceAssetId,
    duplicateDecision: params.duplicateDecision ?? 'importAll',
    imageImportSourceMode,
    deferSourceDeletion: params.deferSourceDeletion ?? false,
    isFavorite: Boolean(isFavorite),
    note: normalizeOptionalText(note) ?? null,
    taskToken: params.taskToken ?? null,
  };
}

export async function importSingleImage(
  params: ImportSingleImageParams
): Promise<ImportedImageResult> {
  const space = params.space ?? 'normal';
  assertPersonalTaskActive(params.taskToken);
  return runWithDatabaseSpace(space, async (db) => {
  const { groupId, ipId, pickedAsset } = params;
  const groupIds = normalizeGroupIds(params.groupIds ?? (groupId != null ? [groupId] : []));
  await ensureImportTargetExists(db, ipId, groupIds);
  await ensureAppDirectories(space);

  const resolvedTags = await resolveTags(db, params.tagNames);
  assertPersonalTaskActive(params.taskToken);
  const pendingImageAsset = await buildImageAssetFromPickedFile({
    ipId,
    space,
    importBatchId: params.importBatchId ?? null,
    groupId,
    groupIds,
    note: params.note,
    isFavorite: params.isFavorite,
    pickedAsset,
    duplicateDecision: params.duplicateDecision,
    imageImportSourceMode: params.imageImportSourceMode,
    deferSourceDeletion: params.deferSourceDeletion,
    taskToken: params.taskToken ?? null,
  });

  return performSingleImageImport(db, pendingImageAsset, resolvedTags);
  });
}

export async function importImagesToIp(
  params: ImportImagesToIpParams
): Promise<ImportImagesToIpResult> {
  const space = params.space ?? 'normal';
  assertPersonalTaskActive(params.taskToken);
  return runWithDatabaseSpace(space, async (db) => {
  const groupIds = normalizeGroupIds(params.groupIds ?? (params.groupId != null ? [params.groupId] : []));
  await ensureImportTargetExists(db, params.ipId, groupIds);
  await ensureAppDirectories(space);

  if (params.pickedAssets.length === 0) {
    return {
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      importBatch: null,
      importedImages: [],
      errors: [],
      skippedItems: [],
    };
  }

  const importBatch = await importBatchRepository.create(db, {
    ipId: params.ipId,
    name: `${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}导入`,
    templateKey: params.templateKey,
    totalCount: params.pickedAssets.length,
  });
  assertPersonalTaskActive(params.taskToken);
  const resolvedTags = await resolveTags(db, params.tagNames);
  const importedImages: ImportedImageResult[] = [];
  const errors: ImageImportError[] = [];
  const skippedItems: ImageImportError[] = [];
  let skippedCount = 0;
  let currentIndex = 0;

  for (const pickedAsset of params.pickedAssets) {
    currentIndex++;
    params.onProgress?.(currentIndex, params.pickedAssets.length);
    let pendingImageAsset: PendingImageAssetImport | null = null;
    try {
      pendingImageAsset = await buildImageAssetFromPickedFile({
        ipId: params.ipId,
        space,
        importBatchId: importBatch.id,
        groupId: params.groupId,
        groupIds,
        note: params.note,
        isFavorite: params.isFavorite,
        pickedAsset,
        duplicateDecision: params.duplicateDecision,
        imageImportSourceMode: params.imageImportSourceMode,
        deferSourceDeletion: params.deferSourceDeletion,
        taskToken: params.taskToken ?? null,
      });
      const importedImage = await performSingleImageImport(db, pendingImageAsset, resolvedTags);
      importedImages.push(importedImage);
      await importBatchRepository.createItem(db, {
        importBatchId: importBatch.id,
        sourcePath: pendingImageAsset.sourceUri,
        originalFilename: pendingImageAsset.originalFilename,
        status: 'success',
        imageAssetId: importedImage.image.id,
      });
    } catch (error) {
      const formattedError = formatImportError(pickedAsset, error);
      if (formattedError.skipped) {
        skippedCount += 1;
        skippedItems.push(formattedError);
        await importBatchRepository.createItem(db, {
          importBatchId: importBatch.id,
          sourcePath: pendingImageAsset?.sourceUri ?? pickedAsset.uri,
          originalFilename: pendingImageAsset?.originalFilename ?? formattedError.originalFilename,
          status: 'skipped',
          reason: formattedError.message,
        });
      } else {
        errors.push(formattedError);
        await importBatchRepository.createItem(db, {
          importBatchId: importBatch.id,
          sourcePath: pendingImageAsset?.sourceUri ?? pickedAsset.uri,
          originalFilename: pendingImageAsset?.originalFilename ?? formattedError.originalFilename,
          status: 'failed',
          reason: formattedError.message,
        });
      }
    }
  }

  const completedBatch = await importBatchRepository.complete(db, importBatch.id, importedImages.length, errors.length);

  return {
    successCount: importedImages.length,
    skippedCount,
    failedCount: errors.length,
    importBatch: completedBatch ?? importBatch,
    importedImages,
    errors,
    skippedItems,
  };
  });
}

export async function verifyImportedImageFiles(
  importedImages: ImportedImageResult[],
  space: PixorySpace = 'normal'
): Promise<VerifyImportedImageFilesResult> {
  const items: ImportedImageVerificationResult[] = [];

  await runWithDatabaseSpace(space, async (db) => {
    for (const importedImage of importedImages) {
      const imageRecord = importedImage.image;
      const originalFileInfo = await getFileInfo(imageRecord.originalFileUri);
      const thumbnailFileInfo = imageRecord.thumbnailFileUri
        ? await getFileInfo(imageRecord.thumbnailFileUri)
        : null;
      const databaseRecord = await imageRepository.findById(db, imageRecord.id, { includeDeleted: true });
      const imageTagsReadback = await tagRepository.findByImageId(db, imageRecord.id);

      const verificationItem: ImportedImageVerificationResult = {
        imageId: imageRecord.id,
        originalFileUri: imageRecord.originalFileUri,
        thumbnailFileUri: imageRecord.thumbnailFileUri,
        originalExists: originalFileInfo.exists && !originalFileInfo.isDirectory,
        thumbnailExists: Boolean(thumbnailFileInfo?.exists && !thumbnailFileInfo.isDirectory),
        originalSize: originalFileInfo.size,
        thumbnailSize: thumbnailFileInfo?.size ?? null,
        originalSizeValid: (originalFileInfo.size ?? 0) > 0,
        thumbnailSizeValid: (thumbnailFileInfo?.size ?? 0) > 0,
        databaseRecordFound: Boolean(databaseRecord),
        imageTagsReadback,
        allChecksPassed:
          originalFileInfo.exists &&
          !originalFileInfo.isDirectory &&
          (originalFileInfo.size ?? 0) > 0 &&
          Boolean(thumbnailFileInfo?.exists && !thumbnailFileInfo.isDirectory) &&
          (thumbnailFileInfo?.size ?? 0) > 0 &&
          Boolean(databaseRecord),
      };

      devLog('Pixory imported image verification:', verificationItem);
      items.push(verificationItem);
    }
  });

  return {
    verifiedCount: items.filter((item) => item.allChecksPassed).length,
    failedCount: items.filter((item) => !item.allChecksPassed).length,
    items,
  };
}

export async function runImageImportDevelopmentCheck(): Promise<ImageImportDevelopmentCheckResult> {
  await ensureAppDirectories();

  const { createdDevelopmentIp, targetIpId } = await runWithDatabaseSpace('normal', async (db) => {
    const existingIps = await ipRepository.findAll(db);
    let createdDevelopmentIp = false;
    let targetIpId = existingIps[0]?.id;

    if (!targetIpId) {
      const developmentIp = await ipRepository.create(db, {
        name: 'Development Import Check',
        description: 'Temporary local IP used to manually verify the import service chain.',
      });
      targetIpId = developmentIp.id;
      createdDevelopmentIp = true;
    }

    return { createdDevelopmentIp, targetIpId };
  });

  const pickResult = await pickImagesForImport();
  if (pickResult.canceled) {
    return {
      canceled: true,
      ipId: targetIpId,
      createdDevelopmentIp,
      result: {
        successCount: 0,
        skippedCount: 0,
        failedCount: 0,
        importBatch: null,
        importedImages: [],
        errors: [],
        skippedItems: [],
      },
      verification: {
        verifiedCount: 0,
        failedCount: 0,
        items: [],
      },
    };
  }

  devLog('Pixory import development check picked images:', {
    pickedImageCount: pickResult.pickedAssets.length,
    pickedAssets: pickResult.pickedAssets.map((asset, index) => ({
      index,
      uri: asset.uri,
      fileName: asset.fileName ?? null,
      fileSize: asset.fileSize ?? null,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType ?? null,
      type: asset.type ?? null,
    })),
  });

  const result = await importImagesToIp({
    ipId: targetIpId,
    pickedAssets: pickResult.pickedAssets,
  });
  const verification = await verifyImportedImageFiles(result.importedImages);

  devLog('Pixory import development check summary:', {
    pickedImageCount: pickResult.pickedAssets.length,
    successCount: result.successCount,
    failedCount: result.failedCount,
    errors: result.errors,
    importedImages: result.importedImages.map((item) => ({
      imageAssetId: item.image.id,
      fileSize: item.image.fileSize,
      width: item.image.width,
      height: item.image.height,
      mimeType: item.image.mimeType,
      tagCount: item.tags.length,
    })),
    verification,
  });

  return {
    canceled: false,
    ipId: targetIpId,
    createdDevelopmentIp,
    result,
    verification,
  };
}
