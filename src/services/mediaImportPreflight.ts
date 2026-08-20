import {
  MEDIA_IMPORT_IMAGE_MAX_SINGLE_BYTES,
  MEDIA_IMPORT_MAX_FILE_COUNT,
  MEDIA_IMPORT_MAX_TOTAL_BYTES,
  MEDIA_IMPORT_MIN_FREE_STORAGE_BYTES,
  MEDIA_IMPORT_UNKNOWN_SIZE_RESERVE_BYTES,
  MEDIA_IMPORT_VIDEO_MAX_SINGLE_BYTES,
} from '../constants/limits';

export type MediaImportKind = 'image' | 'video';
export type MediaImportPhase = 'before-copy' | 'before-commit';
export type MediaImportSpace = 'normal' | 'personal';

export interface MediaImportPreflightAsset {
  kind: MediaImportKind;
  name: string;
  size?: number | null;
  uri: string;
}

export interface MediaImportPreflightInput {
  assets: readonly MediaImportPreflightAsset[];
  cancelled?: boolean;
  freeBytes: number;
  phase: MediaImportPhase;
  space: MediaImportSpace;
  totalBytesAlreadyCommitted?: number;
}

export type MediaImportPreflightResult =
  | {
      ok: true;
      estimatedTotalBytes: number;
      requiredFreeBytes: number;
    }
  | {
      ok: false;
      code: 'cancelled' | 'count' | 'single_image_bytes' | 'single_video_bytes' | 'total_bytes' | 'storage';
      message: string;
    };

function formatBytes(bytes: number): string {
  const gibibytes = bytes / 1024 / 1024 / 1024;
  if (gibibytes >= 1) {
    return `${Number.isInteger(gibibytes) ? gibibytes : gibibytes.toFixed(1)} GB`;
  }
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function normalizedSize(size: number | null | undefined): number {
  return typeof size === 'number' && Number.isFinite(size) && size >= 0
    ? size
    : MEDIA_IMPORT_UNKNOWN_SIZE_RESERVE_BYTES;
}

export function evaluateMediaImportPreflight(
  input: MediaImportPreflightInput,
): MediaImportPreflightResult {
  if (input.cancelled) {
    return { ok: false, code: 'cancelled', message: '导入已取消，未创建任务或写入数据。' };
  }
  if (input.assets.length > MEDIA_IMPORT_MAX_FILE_COUNT) {
    return {
      ok: false,
      code: 'count',
      message: `单次最多导入 ${MEDIA_IMPORT_MAX_FILE_COUNT} 个文件，请分批处理。`,
    };
  }

  let estimatedTotalBytes = Math.max(0, input.totalBytesAlreadyCommitted ?? 0);
  for (const asset of input.assets) {
    const size = normalizedSize(asset.size);
    const singleLimit = asset.kind === 'image'
      ? MEDIA_IMPORT_IMAGE_MAX_SINGLE_BYTES
      : MEDIA_IMPORT_VIDEO_MAX_SINGLE_BYTES;
    if (size > singleLimit) {
      return {
        ok: false,
        code: asset.kind === 'image' ? 'single_image_bytes' : 'single_video_bytes',
        message: `${asset.name} 超过${asset.kind === 'image' ? '图片' : '视频'}单文件 ${formatBytes(singleLimit)} 限制。`,
      };
    }
    estimatedTotalBytes += size;
  }

  if (estimatedTotalBytes > MEDIA_IMPORT_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      code: 'total_bytes',
      message: `本次导入总大小不能超过 ${formatBytes(MEDIA_IMPORT_MAX_TOTAL_BYTES)}。`,
    };
  }

  const requiredFreeBytes = input.phase === 'before-copy'
    ? estimatedTotalBytes + MEDIA_IMPORT_MIN_FREE_STORAGE_BYTES
    : MEDIA_IMPORT_MIN_FREE_STORAGE_BYTES;
  if (!Number.isFinite(input.freeBytes) || input.freeBytes < requiredFreeBytes) {
    return {
      ok: false,
      code: 'storage',
      message: input.phase === 'before-copy'
        ? `设备剩余空间不足：需要为本次复制和安全余量预留至少 ${formatBytes(requiredFreeBytes)}。`
        : `设备剩余空间不足：导入后必须保留至少 ${formatBytes(MEDIA_IMPORT_MIN_FREE_STORAGE_BYTES)} 安全余量。`,
    };
  }

  return { ok: true, estimatedTotalBytes, requiredFreeBytes };
}
