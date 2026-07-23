import type {
  ImageImportSourceMode,
  MediaPickerSource,
} from '../database/repositories/settingsRepository';

export interface MoveDeletionNotice {
  message: '导入成功，原文件未删除';
  sourceDeleted: false;
}

export function resolvePickedAssetImportMode(
  sourceKind: MediaPickerSource,
  requestedMode: ImageImportSourceMode
): ImageImportSourceMode {
  return sourceKind === 'files' ? 'copy' : requestedMode;
}

export function toMoveDeletionNotice(sourceDeleted: boolean): MoveDeletionNotice | null {
  return sourceDeleted
    ? null
    : {
        message: '导入成功，原文件未删除',
        sourceDeleted: false,
      };
}
