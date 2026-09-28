import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';

import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository } from '../database';
import { ensureAppDirectories, getFileInfo, getTempDir } from './fileStorageService';
import { importImagesToIp, verifyImportedImageFiles, type PickedImageAsset } from './imageImportService';

const REGRESSION_SOURCE_ASSETS = [
  {
    module: require('../../assets/icon.png'),
    fileName: 'final_regression_01_icon.png',
  },
  {
    module: require('../../assets/adaptive-icon.png'),
    fileName: 'final_regression_02_adaptive.png',
  },
  {
    module: require('../../assets/splash-icon.png'),
    fileName: 'final_regression_03_splash.png',
  },
  {
    module: require('../../assets/favicon.png'),
    fileName: 'final_regression_04_favicon.png',
  },
] as const;

export interface FinalRegressionDatasetResult {
  timestamp: string;
  ipId: number;
  ipName: string;
  groupAId: number;
  groupAName: string;
  groupBId: number;
  groupBName: string;
  imageIds: number[];
  verification: Awaited<ReturnType<typeof verifyImportedImageFiles>>;
}

export interface FinalRegressionImageSnapshot {
  imageId: number;
  originalFilename: string;
  groupId: number | null;
  groupName: string | null;
  tagNames: string[];
  note: string | null;
  isFavorite: boolean;
  originalFileUri: string;
  thumbnailFileUri: string | null;
  originalExists: boolean;
  thumbnailExists: boolean;
  originalSize: number | null;
  thumbnailSize: number | null;
  deletedAt: string | null;
}

export interface FinalRegressionStateResult {
  ipId: number;
  ipName: string;
  groupNames: string[];
  totalCount: number;
  activeCount: number;
  deletedCount: number;
  imageSnapshots: FinalRegressionImageSnapshot[];
}

function buildTimestamp(): string {
  return `${Date.now()}`;
}

function resolveBundledImageSource(moduleId: number): { uri: string; width: number; height: number } {
  const source = Image.resolveAssetSource(moduleId);

  if (!source?.uri) {
    throw new Error('Bundled regression image source is unavailable.');
  }

  return {
    uri: source.uri,
    width: source.width ?? 0,
    height: source.height ?? 0,
  };
}

async function materializeRegressionSourceFile(sourceUri: string, destinationUri: string): Promise<void> {
  if (sourceUri.startsWith('http://') || sourceUri.startsWith('https://')) {
    await FileSystem.downloadAsync(sourceUri, destinationUri);
    return;
  }

  await FileSystem.copyAsync({
    from: sourceUri,
    to: destinationUri,
  });
}

async function buildPickedRegressionAssets(timestamp: string): Promise<PickedImageAsset[]> {
  await ensureAppDirectories();
  const tempDir = getTempDir();
  const pickedAssets: PickedImageAsset[] = [];

  for (const asset of REGRESSION_SOURCE_ASSETS) {
    const bundledSource = resolveBundledImageSource(asset.module);
    const tempFileUri = `${tempDir}${timestamp}_${asset.fileName}`;
    await materializeRegressionSourceFile(bundledSource.uri, tempFileUri);

    const fileInfo = await getFileInfo(tempFileUri);
    pickedAssets.push({
      assetId: null,
      base64: null,
      duration: null,
      exif: null,
      fileName: asset.fileName,
      fileSize: fileInfo.size ?? undefined,
      height: bundledSource.height,
      mimeType: 'image/png',
      type: 'image',
      uri: tempFileUri,
      width: bundledSource.width,
    });
  }

  return pickedAssets;
}

export async function createFinalRegressionDataset(): Promise<FinalRegressionDatasetResult> {
  const timestamp = buildTimestamp();
  const ipName = `FinalRegressionIP_${timestamp}`;
  const groupAName = `FinalGroupA_${timestamp}`;
  const groupBName = `FinalGroupB_${timestamp}`;
  const pickedAssets = await buildPickedRegressionAssets(timestamp);

  const { groupA, groupB, ip } = await runWithDatabaseSpace('normal', async (db) => {
    const ip = await ipRepository.create(db, {
      name: ipName,
      description: 'Dev-only final regression dataset.',
    });
    const groupA = await groupRepository.create(db, {
      ipId: ip.id,
      name: groupAName,
      type: 'custom',
      description: 'Final regression group A',
    });
    const groupB = await groupRepository.create(db, {
      ipId: ip.id,
      name: groupBName,
      type: 'custom',
      description: 'Final regression group B',
    });
    return { groupA, groupB, ip };
  });

  const importResult = await importImagesToIp({
    ipId: ip.id,
    groupId: groupA.id,
    tagNames: ['tagA', 'tagB'],
    note: 'final regression note',
    isFavorite: true,
    pickedAssets,
  });

  if (importResult.failedCount > 0 || importResult.successCount < 4) {
    throw new Error(
      `Final regression dataset import is incomplete. success=${importResult.successCount}, failed=${importResult.failedCount}`
    );
  }

  const verification = await verifyImportedImageFiles(importResult.importedImages);
  const failedVerification = verification.items.find((item) => !item.allChecksPassed);
  if (failedVerification) {
    throw new Error(`Final regression dataset verification failed for image ${failedVerification.imageId}.`);
  }

  return {
    timestamp,
    ipId: ip.id,
    ipName,
    groupAId: groupA.id,
    groupAName,
    groupBId: groupB.id,
    groupBName,
    imageIds: importResult.importedImages.map((item) => item.image.id),
    verification,
  };
}

export async function readLatestFinalRegressionState(): Promise<FinalRegressionStateResult | null> {
  return runWithDatabaseSpace('normal', async (db) => {
    const regressionIp = (await ipRepository.findAll(db)).find((item) => item.name.startsWith('FinalRegressionIP_'));
    if (!regressionIp) {
      return null;
    }

    const [groups, images] = await Promise.all([
      groupRepository.findByIpId(db, regressionIp.id),
      imageRepository.findByIpId(db, regressionIp.id, { includeDeleted: true }),
    ]);
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

    const imageSnapshots = await Promise.all(
      images.map(async (image) => {
        const [tags, originalFile, thumbnailFile] = await Promise.all([
          tagRepository.findByImageId(db, image.id),
          getFileInfo(image.originalFileUri),
          image.thumbnailFileUri ? getFileInfo(image.thumbnailFileUri) : Promise.resolve(null),
        ]);

        return {
          imageId: image.id,
          originalFilename: image.originalFilename,
          groupId: image.groupId,
          groupName: image.groupId != null ? groupNameById.get(image.groupId) ?? null : null,
          tagNames: tags.map((tag) => tag.name),
          note: image.note,
          isFavorite: image.isFavorite,
          originalFileUri: image.originalFileUri,
          thumbnailFileUri: image.thumbnailFileUri,
          originalExists: originalFile.exists && !originalFile.isDirectory,
          thumbnailExists: image.thumbnailFileUri ? Boolean(thumbnailFile?.exists && !thumbnailFile.isDirectory) : true,
          originalSize: originalFile.size,
          thumbnailSize: thumbnailFile?.size ?? null,
          deletedAt: image.deletedAt,
        } satisfies FinalRegressionImageSnapshot;
      })
    );

    return {
      ipId: regressionIp.id,
      ipName: regressionIp.name,
      groupNames: groups.map((group) => group.name),
      totalCount: imageSnapshots.length,
      activeCount: imageSnapshots.filter((image) => image.deletedAt == null).length,
      deletedCount: imageSnapshots.filter((image) => image.deletedAt != null).length,
      imageSnapshots,
    };
  });
}
