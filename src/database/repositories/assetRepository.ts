import type { SQLiteDatabase } from 'expo-sqlite';
import { imageRepository } from './imageRepository';
import type {
  CreateImageAssetInput,
  ImageAssetRecord,
  ImageDetailRecord,
  ImageListItem,
  ImageListQueryOptions,
  UpdateImageAssetInput,
} from '../types';
import { createTimestamp } from '../utils';

export const assetRepository = {
  async createVideo(db: SQLiteDatabase, input: Omit<CreateImageAssetInput, 'mediaType'>): Promise<ImageAssetRecord> {
    return imageRepository.create(db, {
      ...input,
      mediaType: 'video',
    });
  },

  async findVideoById(db: SQLiteDatabase, id: number): Promise<ImageAssetRecord | null> {
    return imageRepository.findById(db, id, { mediaType: 'video' });
  },

  async findVideoDetailById(db: SQLiteDatabase, id: number): Promise<ImageDetailRecord | null> {
    return imageRepository.findDetailById(db, id, { mediaType: 'video' });
  },

  async findVideosByIpId(db: SQLiteDatabase, ipId: number, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    return imageRepository.findByIpId(db, ipId, { ...options, mediaType: 'video' });
  },

  async findQueueVideosByIpId(db: SQLiteDatabase, ipId: number): Promise<ImageListItem[]> {
    return imageRepository.findByIpId(db, ipId, { mediaType: 'video' });
  },

  async findMixedByIpId(db: SQLiteDatabase, ipId: number, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    return imageRepository.findByIpId(db, ipId, { ...options, mediaType: 'all' });
  },

  async findMixedFiltered(db: SQLiteDatabase, options?: ImageListQueryOptions): Promise<ImageListItem[]> {
    return imageRepository.findFiltered(db, { ...options, mediaType: 'all' });
  },

  async updateVideo(db: SQLiteDatabase, id: number, input: Omit<UpdateImageAssetInput, 'mediaType'>): Promise<ImageAssetRecord | null> {
    return imageRepository.update(db, id, { ...input, mediaType: 'video' });
  },

  async updatePlaybackPosition(db: SQLiteDatabase, id: number, positionMs: number): Promise<void> {
    await db.runAsync(
      `UPDATE image_assets
       SET lastPlaybackPositionMs = ?, lastViewedAt = ?, updatedAt = ?
       WHERE id = ? AND mediaType = 'video' AND deletedAt IS NULL`,
      Math.max(0, Math.round(positionMs)),
      createTimestamp(),
      createTimestamp(),
      id
    );
  },
};

export default assetRepository;
