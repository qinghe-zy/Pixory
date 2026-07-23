import * as DocumentPicker from 'expo-document-picker';

export type MediaFileKind = 'image' | 'video';

export interface PickedMediaFile {
  assetId: null;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  sourceKind: 'files';
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
      uri: asset.uri,
    })),
  };
}
