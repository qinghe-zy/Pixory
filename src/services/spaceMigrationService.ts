import * as FileSystem from 'expo-file-system/legacy';

import {
  groupRepository,
  imageRepository,
  ipRepository,
  runWithDatabaseSpace,
  tagRepository,
  type ImageListItem,
  type PixorySpace,
} from '../database';
import { generateInternalFilename, getOriginalsDir, getThumbnailsDir, joinStoragePath, ensureLocalDirectory, copyLocalFile } from './fileStorageService';
import { permanentlyDeleteIp } from './ipDeletionService';
import { verifyPersonalPassword } from './personalSystemService';

export interface MoveIpBetweenSpacesResult {
  sourceSpace: PixorySpace;
  targetSpace: PixorySpace;
  sourceIpId: number;
  targetIpId: number;
  assetCount: number;
  copiedFileCount: number;
}

export async function moveIpBetweenSpaces(params: {
  ipId: number;
  sourceSpace: PixorySpace;
  targetSpace: PixorySpace;
  personalPassword?: string;
}): Promise<MoveIpBetweenSpacesResult> {
  if (params.sourceSpace === params.targetSpace) {
    throw new Error('源空间和目标空间相同。');
  }

  if (params.targetSpace === 'personal') {
    const verified = await verifyPersonalPassword(params.personalPassword ?? '');
    if (!verified.ok) {
      throw new Error(verified.message ?? '隐私密码不正确。');
    }
  }

  const sourceSnapshot = await runWithDatabaseSpace(params.sourceSpace, async (db) => {
    const ip = await ipRepository.findById(db, params.ipId);
    if (!ip) {
      throw new Error('没有找到要迁移的 IP。');
    }
    const groups = await groupRepository.findByIpId(db, params.ipId);
    const assets = await imageRepository.findByIpId(db, params.ipId, { includeDeleted: true, mediaType: 'all' });
    const relations = await Promise.all(
      assets.map(async (asset) => ({
        asset,
        groupIds: await imageRepository.findGroupIdsByImageId(db, asset.id),
        tagNames: (await tagRepository.findByImageId(db, asset.id)).map((tag) => tag.name),
      }))
    );
    return { ip, groups, relations };
  });

  const fileCopies: Array<{ sourceUri: string; destinationUri: string }> = [];
  let copiedFileCount = 0;
  const assetIdMap = new Map<number, number>();
  let targetIpId = 0;

  try {
    await runWithDatabaseSpace(params.targetSpace, async (db) => {
      const createdIp = await ipRepository.create(db, {
        name: sourceSnapshot.ip.name,
        description: sourceSnapshot.ip.description,
        isFavorite: sourceSnapshot.ip.isFavorite,
      });
      targetIpId = createdIp.id;

      const groupIdMap = new Map<number, number>();
      for (const group of sourceSnapshot.groups) {
        const createdGroup = await groupRepository.create(db, {
          ipId: targetIpId,
          name: group.name,
          type: group.type,
          sortOrder: group.sortOrder,
          isPinned: group.isPinned,
          description: group.description,
        });
        groupIdMap.set(group.id, createdGroup.id);
      }

      for (const relation of sourceSnapshot.relations) {
        const asset = relation.asset;
        const nextInternalFilename = generateInternalFilename(asset.originalFilename);
        const originalDestinationDir = `${joinStoragePath(getOriginalsDir(params.targetSpace), `ip_${targetIpId}`)}/`;
        const thumbnailDestinationDir = `${joinStoragePath(getThumbnailsDir(params.targetSpace), `ip_${targetIpId}`)}/`;
        await ensureLocalDirectory(originalDestinationDir);
        await ensureLocalDirectory(thumbnailDestinationDir);

        const originalDestinationUri = joinStoragePath(originalDestinationDir, nextInternalFilename);
        await copyAndVerify(asset.originalFileUri, originalDestinationUri, asset.fileSize);
        fileCopies.push({ sourceUri: asset.originalFileUri, destinationUri: originalDestinationUri });
        copiedFileCount += 1;

        const thumbnailDestinationUri = asset.thumbnailFileUri
          ? joinStoragePath(thumbnailDestinationDir, asset.thumbnailFileUri.split('/').pop() ?? `${nextInternalFilename}_thumb`)
          : null;
        if (asset.thumbnailFileUri && thumbnailDestinationUri) {
          await copyAndVerify(asset.thumbnailFileUri, thumbnailDestinationUri);
          fileCopies.push({ sourceUri: asset.thumbnailFileUri, destinationUri: thumbnailDestinationUri });
          copiedFileCount += 1;
        }

        const coverDestinationUri = asset.coverThumbnailFileUri
          ? joinStoragePath(thumbnailDestinationDir, asset.coverThumbnailFileUri.split('/').pop() ?? `${nextInternalFilename}_cover`)
          : null;
        if (asset.coverThumbnailFileUri && coverDestinationUri && coverDestinationUri !== thumbnailDestinationUri) {
          await copyAndVerify(asset.coverThumbnailFileUri, coverDestinationUri);
          fileCopies.push({ sourceUri: asset.coverThumbnailFileUri, destinationUri: coverDestinationUri });
          copiedFileCount += 1;
        }

        const groupIds = relation.groupIds.map((groupId) => groupIdMap.get(groupId)).filter((groupId): groupId is number => groupId != null);
        const createdAsset = await imageRepository.create(db, {
          mediaType: asset.mediaType,
          ipId: targetIpId,
          groupId: groupIds[0] ?? null,
          groupIds,
          originalFileUri: originalDestinationUri,
          thumbnailFileUri: thumbnailDestinationUri,
          coverThumbnailFileUri: coverDestinationUri ?? thumbnailDestinationUri,
          originalFilename: asset.originalFilename,
          internalFilename: nextInternalFilename,
          width: asset.width,
          height: asset.height,
          durationMs: asset.durationMs,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
          isFavorite: asset.isFavorite,
          note: asset.note,
          previewStatus: asset.previewStatus,
        });
        assetIdMap.set(asset.id, createdAsset.id);

        const tagIds = [];
        for (const tagName of relation.tagNames) {
          const existing = await tagRepository.findByName(db, tagName);
          const tag = existing ?? (await tagRepository.create(db, { name: tagName }));
          tagIds.push(tag.id);
        }
        await tagRepository.replaceImageTags(db, createdAsset.id, tagIds);
      }

      const targetCoverId = sourceSnapshot.ip.coverImageAssetId ? assetIdMap.get(sourceSnapshot.ip.coverImageAssetId) ?? null : null;
      if (targetCoverId != null || sourceSnapshot.ip.coverBlurEnabled != null) {
        await ipRepository.update(db, targetIpId, {
          coverImageAssetId: targetCoverId,
          coverBlurEnabled: sourceSnapshot.ip.coverBlurEnabled,
        });
      }

      const createdAssets = await imageRepository.findByIpId(db, targetIpId, { includeDeleted: true, mediaType: 'all' });
      if (createdAssets.length !== sourceSnapshot.relations.length) {
        throw new Error('目标空间资产数量校验失败，已停止迁移。');
      }
    });

    await permanentlyDeleteIp(params.ipId, params.sourceSpace);

    return {
      sourceSpace: params.sourceSpace,
      targetSpace: params.targetSpace,
      sourceIpId: params.ipId,
      targetIpId,
      assetCount: sourceSnapshot.relations.length,
      copiedFileCount,
    };
  } catch (error) {
    await cleanupCopiedFiles(fileCopies.map((item) => item.destinationUri));
    if (targetIpId > 0) {
      await permanentlyDeleteIp(targetIpId, params.targetSpace).catch(() => undefined);
    }
    throw error;
  }
}

async function copyAndVerify(sourceUri: string, destinationUri: string, expectedSize?: number | null): Promise<void> {
  await copyLocalFile(sourceUri, destinationUri);
  const info = await FileSystem.getInfoAsync(destinationUri);
  if (!info.exists || info.isDirectory) {
    throw new Error('复制后的文件不可用。');
  }
  if (expectedSize != null && expectedSize > 0 && info.size !== expectedSize) {
    throw new Error('复制后的文件大小校验失败。');
  }
}

async function cleanupCopiedFiles(fileUris: string[]): Promise<void> {
  for (const fileUri of fileUris) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
  }
}
