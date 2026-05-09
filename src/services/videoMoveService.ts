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

export interface MoveVideosToIpParams {
  space?: PixorySpace;
  videoIds: number[];
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

export async function moveVideosToIp({ space = 'normal', targetIpId, videoIds }: MoveVideosToIpParams): Promise<{ movedCount: number; createdVideoIds: number[] }> {
  const uniqueVideoIds = [...new Set(videoIds.filter((videoId) => Number.isInteger(videoId) && videoId > 0))];
  if (uniqueVideoIds.length === 0) {
    return { movedCount: 0, createdVideoIds: [] };
  }

  return runWithDatabaseSpace(space, async (db) => {
    const targetIp = await ipRepository.findById(db, targetIpId);
    if (!targetIp) {
      throw new Error('只能移动到另一个已有 IP。');
    }

    const createdVideoIds: number[] = [];
    const sourceVideoIds: number[] = [];

    await db.withTransactionAsync(async () => {
      for (const videoId of uniqueVideoIds) {
        const sourceVideo = await imageRepository.findById(db, videoId, { includeDeleted: false, mediaType: 'video' });
        if (!sourceVideo) {
          continue;
        }
        if (targetIpId !== sourceVideo.ipId) {
          // ok
        } else {
          throw new Error('目标 IP 必须是另一个已有 IP。');
        }

        const sourceGroups = await imageRepository.findGroupsByImageId(db, sourceVideo.id);
        const targetGroups = await Promise.all(sourceGroups.map((group) => resolveTargetGroup(db, targetIpId, group)));
        const tagNames = (await tagRepository.findByImageId(db, sourceVideo.id)).map((tag) => tag.name);
        const internalFilename = generateInternalFilename(sourceVideo.originalFilename);
        const coverFilename = sourceVideo.coverThumbnailFileUri?.split('/').pop() ?? `${internalFilename.replace(/\.[A-Za-z0-9]+$/, '')}_cover.jpg`;
        const originalDestinationDir = `${joinStoragePath(getOriginalsDir(space), `ip_${targetIpId}`)}/`;
        const thumbnailDestinationDir = `${joinStoragePath(getThumbnailsDir(space), `ip_${targetIpId}`)}/`;
        await ensureLocalDirectory(originalDestinationDir);
        await ensureLocalDirectory(thumbnailDestinationDir);
        const originalDestinationUri = buildDestinationPath(getOriginalsDir(space), targetIpId, internalFilename);
        const thumbnailDestinationUri = sourceVideo.thumbnailFileUri
          ? buildDestinationPath(getThumbnailsDir(space), targetIpId, coverFilename)
          : null;
        const coverDestinationUri = sourceVideo.coverThumbnailFileUri
          ? buildDestinationPath(getThumbnailsDir(space), targetIpId, coverFilename)
          : thumbnailDestinationUri;

        await copyLocalFile(sourceVideo.originalFileUri, originalDestinationUri);
        if (sourceVideo.thumbnailFileUri && thumbnailDestinationUri) {
          await copyLocalFile(sourceVideo.thumbnailFileUri, thumbnailDestinationUri);
        }
        if (sourceVideo.coverThumbnailFileUri && coverDestinationUri && coverDestinationUri !== thumbnailDestinationUri) {
          await copyLocalFile(sourceVideo.coverThumbnailFileUri, coverDestinationUri);
        }

        const createdVideo: ImageAssetRecord = await imageRepository.create(db, {
          ...sourceVideo,
          ipId: targetIpId,
          importBatchId: null,
          groupId: targetGroups[0]?.id ?? null,
          groupIds: targetGroups.map((group) => group.id),
          originalFileUri: originalDestinationUri,
          thumbnailFileUri: thumbnailDestinationUri,
          coverThumbnailFileUri: coverDestinationUri,
          internalFilename,
          deletedAt: null,
        });
        await tagRepository.setImageTags(db, createdVideo.id, tagNames);
        createdVideoIds.push(createdVideo.id);
        sourceVideoIds.push(sourceVideo.id);
      }

      await imageRepository.softDeleteMany(db, sourceVideoIds);
    });

    return { movedCount: sourceVideoIds.length, createdVideoIds };
  });
}
