import type { SQLiteDatabase } from 'expo-sqlite';

import {
  groupRepository,
  imageRepository,
  ipRepository,
  runWithDatabaseSpace,
  tagRepository,
  type GroupRecord,
  type ImageAssetRecord,
  type PixorySpace,
} from '../database';
import {
  copyLocalFile,
  ensureLocalDirectory,
  generateInternalFilename,
  getOriginalsDir,
  getThumbnailsDir,
  joinStoragePath,
} from './fileStorageService';

export interface MoveAssetsToIpParams {
  space?: PixorySpace;
  assetIds: number[];
  targetIpId: number;
}

export interface MoveVideosToIpParams {
  space?: PixorySpace;
  videoIds: number[];
  targetIpId: number;
}

export interface MoveImagesToIpParams {
  space?: PixorySpace;
  imageIds: number[];
  targetIpId: number;
}

async function resolveTargetGroup(db: SQLiteDatabase, targetIpId: number, sourceGroup: GroupRecord): Promise<GroupRecord> {
  const existingGroup = await groupRepository.findByIpIdAndName(db, targetIpId, sourceGroup.name);
  if (existingGroup) {
    return existingGroup;
  }

  return groupRepository.create(db, {
    ipId: targetIpId,
    name: sourceGroup.name,
    type: sourceGroup.type,
    sortOrder: sourceGroup.sortOrder,
    isPinned: sourceGroup.isPinned,
    description: sourceGroup.description,
  });
}

function buildDestinationPath(baseDir: string, ipId: number, internalFilename: string): string {
  return joinStoragePath(`${joinStoragePath(baseDir, `ip_${ipId}`)}/`, internalFilename);
}

async function moveAssetsToIpInternal({
  space = 'normal',
  targetIpId,
  assetIds,
}: MoveAssetsToIpParams): Promise<{ movedCount: number; createdAssetIds: number[] }> {
  const uniqueAssetIds = [...new Set(assetIds.filter((assetId) => Number.isInteger(assetId) && assetId > 0))];
  if (uniqueAssetIds.length === 0) {
    return { movedCount: 0, createdAssetIds: [] };
  }

  return runWithDatabaseSpace(space, async (db) => {
    const targetIp = await ipRepository.findById(db, targetIpId);
    if (!targetIp) {
      throw new Error('只能移动到另一个已有 IP。');
    }

    const createdAssetIds: number[] = [];
    const sourceAssetIds: number[] = [];

    for (const assetId of uniqueAssetIds) {
      const sourceAsset = await imageRepository.findById(db, assetId, { includeDeleted: false, mediaType: 'all' });
      if (!sourceAsset) {
        continue;
      }
      if (targetIpId === sourceAsset.ipId) {
        throw new Error('目标 IP 必须是另一个已有 IP。');
      }

      const sourceGroups = await imageRepository.findGroupsByImageId(db, sourceAsset.id);
      const targetGroups = await Promise.all(sourceGroups.map((group) => resolveTargetGroup(db, targetIpId, group)));
      const tagNames = (await tagRepository.findByImageId(db, sourceAsset.id)).map((tag) => tag.name);
      const internalFilename = generateInternalFilename(sourceAsset.originalFilename);
      const originalDestinationDir = `${joinStoragePath(getOriginalsDir(space), `ip_${targetIpId}`)}/`;
      const thumbnailDestinationDir = `${joinStoragePath(getThumbnailsDir(space), `ip_${targetIpId}`)}/`;
      await ensureLocalDirectory(originalDestinationDir);
      await ensureLocalDirectory(thumbnailDestinationDir);
      const originalDestinationUri = buildDestinationPath(getOriginalsDir(space), targetIpId, internalFilename);
      const thumbnailFilename = sourceAsset.thumbnailFileUri?.split('/').pop() ?? null;
      const coverFilename = sourceAsset.coverThumbnailFileUri?.split('/').pop() ?? `${internalFilename.replace(/\.[A-Za-z0-9]+$/, '')}_cover.jpg`;
      const thumbnailDestinationUri = thumbnailFilename
        ? buildDestinationPath(getThumbnailsDir(space), targetIpId, thumbnailFilename)
        : null;
      const coverDestinationUri = sourceAsset.coverThumbnailFileUri
        ? buildDestinationPath(getThumbnailsDir(space), targetIpId, coverFilename)
        : thumbnailDestinationUri;

      await copyLocalFile(sourceAsset.originalFileUri, originalDestinationUri);
      if (sourceAsset.thumbnailFileUri && thumbnailDestinationUri) {
        await copyLocalFile(sourceAsset.thumbnailFileUri, thumbnailDestinationUri);
      }
      if (sourceAsset.coverThumbnailFileUri && coverDestinationUri && coverDestinationUri !== thumbnailDestinationUri) {
        await copyLocalFile(sourceAsset.coverThumbnailFileUri, coverDestinationUri);
      }

      const createdAsset: ImageAssetRecord = await imageRepository.create(db, {
        ...sourceAsset,
        ipId: targetIpId,
        importBatchId: null,
        groupId: targetGroups[0]?.id ?? null,
        groupIds: targetGroups.map((group) => group.id),
        originalFileUri: originalDestinationUri,
        thumbnailFileUri: thumbnailDestinationUri,
        coverThumbnailFileUri: coverDestinationUri,
        internalFilename,
        deletedAt: null,
        sourceOrder: sourceAsset.sourceOrder,
      });
      await tagRepository.setImageTags(db, createdAsset.id, tagNames);
      createdAssetIds.push(createdAsset.id);
      sourceAssetIds.push(sourceAsset.id);
    }

    if (sourceAssetIds.length > 0) {
      await imageRepository.softDeleteMany(db, sourceAssetIds);
    }

    return { movedCount: sourceAssetIds.length, createdAssetIds };
  });
}

export async function moveAssetsToIp(params: MoveAssetsToIpParams): Promise<{ movedCount: number; createdAssetIds: number[] }> {
  return moveAssetsToIpInternal(params);
}

export async function moveVideosToIp({ space = 'normal', targetIpId, videoIds }: MoveVideosToIpParams): Promise<{ movedCount: number; createdVideoIds: number[] }> {
  const result = await moveAssetsToIpInternal({ space, targetIpId, assetIds: videoIds });
  return { movedCount: result.movedCount, createdVideoIds: result.createdAssetIds };
}

export async function moveImagesToIp({ space = 'normal', targetIpId, imageIds }: MoveImagesToIpParams): Promise<{ movedCount: number; createdImageIds: number[] }> {
  const result = await moveAssetsToIpInternal({ space, targetIpId, assetIds: imageIds });
  return { movedCount: result.movedCount, createdImageIds: result.createdAssetIds };
}
