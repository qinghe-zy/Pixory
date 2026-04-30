import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

import { getDatabase, groupRepository, imageRepository, ipRepository, tagRepository } from '../database';
import type { ImageAssetRecord, TagRecord } from '../database';
import { normalizeOptionalText } from '../database/utils';
import {
  copyOriginalToAppStorage,
  deleteLocalFile,
  ensureAppDirectories,
  generateInternalFilename,
  getFileInfo,
} from './fileStorageService';
import { generateThumbnail } from './thumbnailService';

export type PickedImageAsset = ImagePicker.ImagePickerAsset;

export interface PickImagesForImportResult {
  canceled: boolean;
  pickedAssets: PickedImageAsset[];
}

export interface ImportImagesToIpParams {
  ipId: number;
  groupId?: number | null;
  tagNames?: string[];
  note?: string | null;
  isFavorite?: boolean;
  pickedAssets: PickedImageAsset[];
}

export interface BuildImageAssetFromPickedFileParams {
  ipId: number;
  groupId?: number | null;
  note?: string | null;
  isFavorite?: boolean;
  pickedAsset: PickedImageAsset;
}

export interface ImportSingleImageParams {
  ipId: number;
  groupId?: number | null;
  tagNames?: string[];
  note?: string | null;
  isFavorite?: boolean;
  pickedAsset: PickedImageAsset;
}

export interface PendingImageAssetImport {
  ipId: number;
  groupId: number | null;
  sourceUri: string;
  originalFilename: string;
  internalFilename: string;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
  isFavorite: boolean;
  note: string | null;
}

export interface ImportedImageResult {
  image: ImageAssetRecord;
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
}

export interface ImportImagesToIpResult {
  successCount: number;
  failedCount: number;
  importedImages: ImportedImageResult[];
  errors: ImageImportError[];
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

async function ensureImportTargetExists(ipId: number, groupId?: number | null): Promise<void> {
  const ipRecord = await ipRepository.findById(ipId);
  if (!ipRecord) {
    throw new Error(`Target IP ${ipId} does not exist.`);
  }

  if (groupId == null) {
    return;
  }

  const groupRecord = await groupRepository.findById(groupId);
  if (!groupRecord) {
    throw new Error(`Target group ${groupId} does not exist.`);
  }

  if (groupRecord.ipId !== ipId) {
    throw new Error(`Group ${groupId} does not belong to IP ${ipId}.`);
  }
}

async function getOrCreateTag(name: string): Promise<TagRecord> {
  const existingTag = await tagRepository.findByName(name);
  if (existingTag) {
    return existingTag;
  }

  try {
    return await tagRepository.create({ name });
  } catch (error) {
    const concurrentTag = await tagRepository.findByName(name);
    if (concurrentTag) {
      return concurrentTag;
    }

    throw error;
  }
}

async function resolveTags(tagNames?: string[]): Promise<TagRecord[]> {
  const normalizedTagNames = normalizeTagNames(tagNames);
  if (normalizedTagNames.length === 0) {
    return [];
  }

  const resolvedTags: TagRecord[] = [];

  for (const tagName of normalizedTagNames) {
    resolvedTags.push(await getOrCreateTag(tagName));
  }

  return resolvedTags;
}

async function cleanupFailedImport(
  createdImageId: number | null,
  originalFileUri: string | null,
  thumbnailFileUri: string | null
): Promise<void> {
  const cleanupTasks: Array<Promise<void>> = [];

  if (createdImageId !== null) {
    cleanupTasks.push(
      (async () => {
        const db = await getDatabase();
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
  pendingImageAsset: PendingImageAssetImport,
  resolvedTags: TagRecord[]
): Promise<ImportedImageResult> {
  let originalFileUri: string | null = null;
  let thumbnailFileUri: string | null = null;
  let createdImageId: number | null = null;

  try {
    originalFileUri = await copyOriginalToAppStorage(
      pendingImageAsset.sourceUri,
      pendingImageAsset.ipId,
      pendingImageAsset.internalFilename
    );

    const originalFileInfo = await getFileInfo(originalFileUri);
    thumbnailFileUri = await generateThumbnail(
      originalFileUri,
      pendingImageAsset.ipId,
      pendingImageAsset.internalFilename
    );

    const createdImage = await imageRepository.create({
      ipId: pendingImageAsset.ipId,
      groupId: pendingImageAsset.groupId,
      originalFileUri,
      thumbnailFileUri,
      originalFilename: pendingImageAsset.originalFilename,
      internalFilename: pendingImageAsset.internalFilename,
      width: pendingImageAsset.width,
      height: pendingImageAsset.height,
      mimeType: pendingImageAsset.mimeType,
      fileSize: originalFileInfo.size ?? pendingImageAsset.fileSize,
      isFavorite: pendingImageAsset.isFavorite,
      note: pendingImageAsset.note,
    });
    createdImageId = createdImage.id;

    await tagRepository.replaceImageTags(
      createdImage.id,
      resolvedTags.map((tag) => tag.id)
    );

    const persistedImageRecord = await imageRepository.findById(createdImage.id, { includeDeleted: true });
    const persistedImageTags = await tagRepository.findByImageId(createdImage.id);

    console.log('Pixory import persisted image asset:', {
      imageAssetId: createdImage.id,
      originalFileUri: createdImage.originalFileUri,
      thumbnailFileUri: createdImage.thumbnailFileUri,
      fileSize: createdImage.fileSize,
      width: createdImage.width,
      height: createdImage.height,
      mimeType: createdImage.mimeType,
      imageAssetsWriteResult: persistedImageRecord,
      imageTagsWriteResult: persistedImageTags,
    });

    return {
      image: createdImage,
      tags: resolvedTags,
    };
  } catch (error) {
    await cleanupFailedImport(createdImageId, originalFileUri, thumbnailFileUri);
    throw error;
  }
}

export async function pickImagesForImport(): Promise<PickImagesForImportResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Media library permission is required to import images.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    allowsEditing: false,
    quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });

  if (result.canceled) {
    return {
      canceled: true,
      pickedAssets: [],
    };
  }

  return {
    canceled: false,
    pickedAssets: result.assets.filter((asset) => asset.type === 'image' || asset.type == null),
  };
}

export async function buildImageAssetFromPickedFile(
  params: BuildImageAssetFromPickedFileParams
): Promise<PendingImageAssetImport> {
  const { groupId, ipId, isFavorite, note, pickedAsset } = params;

  if (!pickedAsset.uri?.trim()) {
    throw new Error('Picked image URI is missing.');
  }

  if (pickedAsset.type && pickedAsset.type !== 'image') {
    throw new Error(`Unsupported picked asset type: ${pickedAsset.type}.`);
  }

  const originalFilename = pickedAsset.fileName?.trim() || buildFallbackFilename(pickedAsset);
  const fileSize = pickedAsset.fileSize ?? 0;
  const { width, height } = await resolveDimensionsForPickedAsset(pickedAsset, originalFilename);

  return {
    ipId,
    groupId: groupId ?? null,
    sourceUri: pickedAsset.uri,
    originalFilename,
    internalFilename: generateInternalFilename(originalFilename),
    width,
    height,
    mimeType: resolveMimeType(pickedAsset, originalFilename),
    fileSize,
    isFavorite: Boolean(isFavorite),
    note: normalizeOptionalText(note) ?? null,
  };
}

export async function importSingleImage(
  params: ImportSingleImageParams
): Promise<ImportedImageResult> {
  const { groupId, ipId, pickedAsset } = params;
  await ensureImportTargetExists(ipId, groupId);
  await ensureAppDirectories();

  const resolvedTags = await resolveTags(params.tagNames);
  const pendingImageAsset = await buildImageAssetFromPickedFile({
    ipId,
    groupId,
    note: params.note,
    isFavorite: params.isFavorite,
    pickedAsset,
  });

  return performSingleImageImport(pendingImageAsset, resolvedTags);
}

export async function importImagesToIp(
  params: ImportImagesToIpParams
): Promise<ImportImagesToIpResult> {
  await ensureImportTargetExists(params.ipId, params.groupId);
  await ensureAppDirectories();

  if (params.pickedAssets.length === 0) {
    return {
      successCount: 0,
      failedCount: 0,
      importedImages: [],
      errors: [],
    };
  }

  const resolvedTags = await resolveTags(params.tagNames);
  const importedImages: ImportedImageResult[] = [];
  const errors: ImageImportError[] = [];

  for (const pickedAsset of params.pickedAssets) {
    try {
      const pendingImageAsset = await buildImageAssetFromPickedFile({
        ipId: params.ipId,
        groupId: params.groupId,
        note: params.note,
        isFavorite: params.isFavorite,
        pickedAsset,
      });
      importedImages.push(await performSingleImageImport(pendingImageAsset, resolvedTags));
    } catch (error) {
      errors.push(formatImportError(pickedAsset, error));
    }
  }

  return {
    successCount: importedImages.length,
    failedCount: errors.length,
    importedImages,
    errors,
  };
}

export async function verifyImportedImageFiles(
  importedImages: ImportedImageResult[]
): Promise<VerifyImportedImageFilesResult> {
  const items: ImportedImageVerificationResult[] = [];

  for (const importedImage of importedImages) {
    const imageRecord = importedImage.image;
    const originalFileInfo = await getFileInfo(imageRecord.originalFileUri);
    const thumbnailFileInfo = imageRecord.thumbnailFileUri
      ? await getFileInfo(imageRecord.thumbnailFileUri)
      : null;
    const databaseRecord = await imageRepository.findById(imageRecord.id, { includeDeleted: true });
    const imageTagsReadback = await tagRepository.findByImageId(imageRecord.id);

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

    console.log('Pixory imported image verification:', verificationItem);
    items.push(verificationItem);
  }

  return {
    verifiedCount: items.filter((item) => item.allChecksPassed).length,
    failedCount: items.filter((item) => !item.allChecksPassed).length,
    items,
  };
}

export async function runImageImportDevelopmentCheck(): Promise<ImageImportDevelopmentCheckResult> {
  await ensureAppDirectories();

  const existingIps = await ipRepository.findAll();
  let createdDevelopmentIp = false;
  let targetIpId = existingIps[0]?.id;

  if (!targetIpId) {
    const developmentIp = await ipRepository.create({
      name: 'Development Import Check',
      description: 'Temporary local IP used to manually verify the import service chain.',
    });
    targetIpId = developmentIp.id;
    createdDevelopmentIp = true;
  }

  const pickResult = await pickImagesForImport();
  if (pickResult.canceled) {
    return {
      canceled: true,
      ipId: targetIpId,
      createdDevelopmentIp,
      result: {
        successCount: 0,
        failedCount: 0,
        importedImages: [],
        errors: [],
      },
      verification: {
        verifiedCount: 0,
        failedCount: 0,
        items: [],
      },
    };
  }

  console.log('Pixory import development check picked images:', {
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

  console.log('Pixory import development check summary:', {
    pickedImageCount: pickResult.pickedAssets.length,
    successCount: result.successCount,
    failedCount: result.failedCount,
    errors: result.errors,
    importedImages: result.importedImages.map((item) => ({
      imageAssetId: item.image.id,
      originalFileUri: item.image.originalFileUri,
      thumbnailFileUri: item.image.thumbnailFileUri,
      fileSize: item.image.fileSize,
      width: item.image.width,
      height: item.image.height,
      mimeType: item.image.mimeType,
      imageAssetsWriteResult: item.image,
      imageTagsWriteResult: item.tags,
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
