/**
 * 自定义表情制作与压缩包导入核心服务 (Custom Sticker Studio & Importer)
 *
 * 核心能力：
 * 1. 拍照/相册选图 -> 1:1 居中裁剪/约束 -> 本地持久化 -> SQLite入库 -> 实时挂载到AI语义引擎；
 * 2. ZIP 表情压缩包导入 -> 安全解压与防逃逸审查 -> 元数据/文件名智能语义推断 -> 批量持久化 -> 批量注入AI引擎；
 * 3. 伴聊/会话启动水合加载 (hydrateCustomStickers)，全量同步预置萌宠/道具与用户自定义表情到 AI 潜空间；
 * 4. 空间沙盒强隔离 (normal vs personal)。
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { unzip } from 'react-native-zip-archive';

import { getDatabase, type PixorySpace } from '../../database';
import { customStickerRepository } from '../../database/repositories/customStickerRepository';
import {
  ensureAppDirectories,
  ensureLocalDirectory,
  getStickerPacksDir,
  getStickersDir,
  getTempDir,
  joinStoragePath,
} from '../../services/fileStorageService';
import { ALL_COMPANION_STICKERS } from './emojiCatalog';
import {
  registerCustomStickers,
  unregisterCustomSticker,
  resolveBucketFromWord,
  type CoreEmotionBucket,
  type ResolvableStickerItem,
} from './StickerSemanticResolver';
import type { CustomStickerRecord, StickerPackRecord } from './types';

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const MAX_ZIP_STICKER_COUNT = 500;

function generateUid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getFileExtension(uri: string): string {
  const clean = uri.split('?')[0].split('#')[0];
  const lastDot = clean.lastIndexOf('.');
  return lastDot !== -1 ? clean.slice(lastDot).toLowerCase() : '';
}

function getFileNameWithoutExtension(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop() || filename;
  const lastDot = base.lastIndexOf('.');
  return lastDot !== -1 ? base.slice(0, lastDot) : base;
}

export interface CreateStickerOptions {
  name?: string;
  emotionBucket?: CoreEmotionBucket | null;
  keywords?: string[];
  space?: PixorySpace;
}

export interface ZipImportResult {
  success: boolean;
  packId: string;
  packName: string;
  count: number;
  skipped: number;
}

export const CustomStickerService = {
  /**
   * 通过拍照或相册选择制作自定义表情
   */
  async pickAndCreateCustomSticker(
    source: 'camera' | 'library',
    options: CreateStickerOptions = {}
  ): Promise<CustomStickerRecord | null> {
    const space = options.space || 'normal';
    await ensureAppDirectories(space);

    let pickerResult: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error('未获得相机使用权限');
      }
      pickerResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false, // 禁用系统原生有样式冲突的 uCrop 页面
        quality: 0.9,
      });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('未获得相册读取权限');
      }
      pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false, // 禁用系统原生有样式冲突的 uCrop 页面
        quality: 0.9,
      });
    }

    if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
      return null;
    }

    const rawAsset = pickerResult.assets[0];
    const rawUri = rawAsset.uri;

    // 智能计算短边、中心 1:1 正方形安全裁切并缩放至 320x320，彻底根除白底白字看不清保存键的问题
    const w = rawAsset.width || 320;
    const h = rawAsset.height || 320;
    const minDim = Math.max(1, Math.min(w, h));
    const originX = Math.max(0, Math.floor((w - minDim) / 2));
    const originY = Math.max(0, Math.floor((h - minDim) / 2));

    const manipulated = await ImageManipulator.manipulateAsync(
      rawUri,
      [
        { crop: { originX, originY, width: minDim, height: minDim } },
        { resize: { width: 320, height: 320 } },
      ],
      { compress: 0.85, format: ImageManipulator.SaveFormat.PNG }
    );

    const stickersDir = getStickersDir(space);
    await ensureLocalDirectory(stickersDir);

    const stickerId = generateUid('custom');
    const destinationFilename = `${stickerId}.png`;
    const destinationUri = joinStoragePath(stickersDir, destinationFilename);

    await FileSystem.copyAsync({
      from: manipulated.uri,
      to: destinationUri,
    });

    const stickerName = options.name?.trim() || `表情_${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
    const inferredBucket = options.emotionBucket ?? resolveBucketFromWord(stickerName);

    const record: CustomStickerRecord = {
      id: stickerId,
      space,
      packId: null,
      name: stickerName,
      uri: destinationUri,
      previewUri: destinationUri,
      emotionBucket: inferredBucket ?? null,
      keywords: options.keywords || (inferredBucket ? [inferredBucket, stickerName] : [stickerName]),
      width: 320,
      height: 320,
      sortOrder: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const db = await getDatabase(space);
    await customStickerRepository.insertCustomSticker(db, record);

    // 实时挂载到 AI 认知引擎
    registerCustomStickers([
      {
        id: record.id,
        name: record.name,
        animatedUri: record.uri,
        previewUri: record.previewUri || undefined,
        packId: record.packId || undefined,
        width: record.width || 140,
        height: record.height || 140,
        bucket: (record.emotionBucket as CoreEmotionBucket) || 'laugh',
        keywords: record.keywords,
        tags: record.keywords,
      },
    ]);

    return record;
  },

  /**
   * 调起系统文档选择器选取 ZIP 压缩包并批量导入
   */
  async pickAndImportZip(options: { space?: PixorySpace; packName?: string } = {}): Promise<ZipImportResult | null> {
    const docResult = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });

    if (docResult.canceled || !docResult.assets || docResult.assets.length === 0) {
      return null;
    }

    const zipFile = docResult.assets[0];
    const customPackName = options.packName || getFileNameWithoutExtension(zipFile.name);

    return this.importStickerPackFromZip(zipFile.uri, {
      space: options.space,
      packName: customPackName,
    });
  },

  /**
   * 从指定 ZIP 压缩包 URI 解析并持久化表情包
   */
  async importStickerPackFromZip(
    zipUri: string,
    options: { space?: PixorySpace; packName?: string } = {}
  ): Promise<ZipImportResult> {
    const space = options.space || 'normal';
    await ensureAppDirectories(space);

    const tempDir = getTempDir(space);
    const extractSubdirName = generateUid('extract_zip');
    const extractPath = joinStoragePath(tempDir, extractSubdirName);
    await ensureLocalDirectory(extractPath);

    const packId = generateUid('pack');
    const packTargetDir = joinStoragePath(getStickerPacksDir(space), packId);
    await ensureLocalDirectory(packTargetDir);

    try {
      // 1. 解压
      await unzip(zipUri, extractPath);

      // 2. 深度扫描安全与文件列表
      const extractedFiles: string[] = [];
      const scanDir = async (dirUri: string, relativePrefix = '') => {
        const entries = await FileSystem.readDirectoryAsync(dirUri);
        for (const entry of entries) {
          // 防 Zip-Slip 路径逃逸审查
          if (entry.includes('..') || entry.startsWith('.')) continue;

          const fullUri = joinStoragePath(dirUri, entry);
          const relativePath = relativePrefix ? `${relativePrefix}/${entry}` : entry;
          const info = await FileSystem.getInfoAsync(fullUri);

          if (info.isDirectory) {
            await scanDir(fullUri, relativePath);
          } else {
            extractedFiles.push(relativePath);
          }
        }
      };

      await scanDir(extractPath);

      // 3. 读取元数据 (如果有 metadata.json 或 info.json)
      let parsedMetadata: any = null;
      const metaFileName = extractedFiles.find((f) => {
        const lower = f.toLowerCase();
        return lower === 'metadata.json' || lower.endsWith('/metadata.json') || lower === 'info.json' || lower.endsWith('/info.json');
      });

      if (metaFileName) {
        try {
          const metaContent = await FileSystem.readAsStringAsync(joinStoragePath(extractPath, metaFileName));
          parsedMetadata = JSON.parse(metaContent);
        } catch (e) {
          console.warn('Failed to parse sticker pack metadata.json:', e);
        }
      }

      // 4. 过滤有效图片资源
      const imageFiles = extractedFiles.filter((f) => {
        const ext = getFileExtension(f);
        return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
      });

      if (imageFiles.length === 0) {
        throw new Error('压缩包内未找到支持的表情图片文件 (png, jpg, webp, gif)');
      }

      const finalPackName = options.packName || parsedMetadata?.name || '导入表情包';
      let coverUri: string | null = null;
      const stickerRecords: CustomStickerRecord[] = [];
      const resolvableItems: ResolvableStickerItem[] = [];

      let order = 0;
      let skipped = 0;

      for (const relPath of imageFiles.slice(0, MAX_ZIP_STICKER_COUNT)) {
        const ext = getFileExtension(relPath);
        const sourceUri = joinStoragePath(extractPath, relPath);
        const stickerId = generateUid('pack_item');
        const destFilename = `${stickerId}${ext}`;
        const destinationUri = joinStoragePath(packTargetDir, destFilename);

        try {
          await FileSystem.copyAsync({
            from: sourceUri,
            to: destinationUri,
          });

          if (!coverUri) {
            coverUri = destinationUri;
          }

          const rawStem = getFileNameWithoutExtension(relPath);
          const itemMeta = parsedMetadata?.stickers?.find((s: any) => s.file === relPath || s.name === rawStem);

          const itemName = itemMeta?.name || rawStem || `贴纸_${order + 1}`;
          const inferredBucket = itemMeta?.emotion || resolveBucketFromWord(itemName);
          const keywords = itemMeta?.keywords || (inferredBucket ? [inferredBucket, itemName] : [itemName]);

          const record: CustomStickerRecord = {
            id: stickerId,
            space,
            packId,
            name: itemName,
            uri: destinationUri,
            previewUri: destinationUri,
            emotionBucket: inferredBucket ?? null,
            keywords,
            width: 140,
            height: 140,
            sortOrder: order++,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          stickerRecords.push(record);
          resolvableItems.push({
            id: record.id,
            name: record.name,
            animatedUri: record.uri,
            previewUri: record.previewUri || undefined,
            packId: record.packId || undefined,
            width: 140,
            height: 140,
            bucket: (record.emotionBucket as CoreEmotionBucket) || 'laugh',
            keywords: record.keywords,
            tags: record.keywords,
          });
        } catch {
          skipped++;
        }
      }

      const packRecord: StickerPackRecord = {
        id: packId,
        space,
        name: finalPackName,
        coverUri,
        description: parsedMetadata?.description || `共 ${stickerRecords.length} 款表情`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 5. 批量存入 SQLite
      const db = await getDatabase(space);
      await customStickerRepository.insertStickerPack(db, packRecord);
      await customStickerRepository.batchInsertCustomStickers(db, stickerRecords);

      // 6. 批量注册至 AI 认知引擎
      registerCustomStickers(resolvableItems);

      return {
        success: true,
        packId,
        packName: finalPackName,
        count: stickerRecords.length,
        skipped,
      };
    } finally {
      // 清理临时解压目录
      void FileSystem.deleteAsync(extractPath, { idempotent: true }).catch(() => {});
    }
  },

  /**
   * 应用或聊天初始化水合加载：从 SQLite 恢复已持久化的表情并注册进 AI
   */
  async hydrateCustomStickers(space: PixorySpace = 'normal'): Promise<CustomStickerRecord[]> {
    try {
      // 1. 先注入预置的多元伴侣贴纸 (萌宠、道具、手势)
      const presetResolvables: ResolvableStickerItem[] = ALL_COMPANION_STICKERS.map((s) => ({
        id: s.id,
        name: s.name,
        animatedUri: s.animatedUri,
        previewUri: s.previewUri,
        width: s.width || 140,
        height: s.height || 140,
        bucket: (s.emotionBucket as CoreEmotionBucket) || 'laugh',
        keywords: [s.name, s.emotionBucket || ''].filter(Boolean),
        tags: [s.category || 'prop'],
      }));
      registerCustomStickers(presetResolvables);

      // 2. 从数据库查询用户自定义和导入的表情
      const db = await getDatabase(space);
      const records = await customStickerRepository.listCustomStickers(db, space);

      if (records.length > 0) {
        const userResolvables: ResolvableStickerItem[] = records.map((r) => ({
          id: r.id,
          name: r.name,
          animatedUri: r.uri,
          previewUri: r.previewUri || undefined,
          packId: r.packId || undefined,
          width: r.width || 140,
          height: r.height || 140,
          bucket: (r.emotionBucket as CoreEmotionBucket) || 'laugh',
          keywords: r.keywords,
          tags: r.keywords,
        }));
        registerCustomStickers(userResolvables);
      }

      return records;
    } catch (e) {
      console.warn('CustomStickerService: hydrateCustomStickers failed:', e);
      return [];
    }
  },

  /**
   * 删除自定义表情
   */
  async deleteSticker(id: string, space: PixorySpace = 'normal'): Promise<void> {
    const db = await getDatabase(space);
    const existing = await customStickerRepository.getCustomStickerById(db, id);
    if (existing) {
      await customStickerRepository.deleteCustomSticker(db, id);
      unregisterCustomSticker(id);
      void FileSystem.deleteAsync(existing.uri, { idempotent: true }).catch(() => {});
    }
  },
};
