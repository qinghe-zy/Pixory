import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { MEDIA_IMPORT_FILE_CONCURRENCY } from '../constants/limits';
import { settleFileTasksWithConcurrency } from './boundedFileConcurrency';

export type MediaFileKind = 'image' | 'video';

export interface PickedMediaFile {
  assetId: null;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  sourceKind: 'files';
  temporaryInput: boolean;
  uri: string;
}

export interface PickMediaFilesResult {
  canceled: boolean;
  pickedFiles: PickedMediaFile[];
}

export async function pickMediaFilesForImport(kind: MediaFileKind): Promise<PickMediaFilesResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: kind === 'image' ? 'image/*' : 'video/*',
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return { canceled: true, pickedFiles: [] };
  }

  return {
    canceled: false,
    pickedFiles: result.assets.map((asset) => ({
      assetId: null,
      fileName: asset.name,
      fileSize: asset.size ?? null,
      mimeType: asset.mimeType ?? null,
      sourceKind: 'files',
      temporaryInput: Boolean(FileSystem.cacheDirectory && asset.uri.startsWith(FileSystem.cacheDirectory)),
      uri: asset.uri,
    })),
  };
}

export async function cleanupTemporaryMediaInputs(
  assets: ReadonlyArray<{ temporaryInput?: boolean; uri: string }>,
): Promise<void> {
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    return;
  }
  const ownedUris = [...new Set(
    assets
      .filter((asset) => asset.temporaryInput && asset.uri.startsWith(cacheDirectory))
      .map((asset) => asset.uri),
  )];
  await settleFileTasksWithConcurrency(
    ownedUris,
    MEDIA_IMPORT_FILE_CONCURRENCY,
    async (uri) => {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    },
  );
}
