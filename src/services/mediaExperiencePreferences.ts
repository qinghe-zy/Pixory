import * as FileSystem from 'expo-file-system/legacy';

export type VideoOrientationPreference = 'portrait' | 'landscape' | 'system';
export type ImageReaderMode = 'horizontal-ltr' | 'horizontal-rtl' | 'vertical-continuous';
export type ImageFitMode = 'contain' | 'width' | 'original';

export interface VideoPlayerPreferences {
  speed: number;
  holdSpeed: number;
  orientationPreference: VideoOrientationPreference;
  lockedByDefault: boolean;
}

export interface ImageViewerPreferences {
  readerMode: ImageReaderMode;
  fitMode: ImageFitMode;
  showFilmstrip: boolean;
}

const PREFERENCE_DIR = `${FileSystem.documentDirectory ?? ''}pixory/preferences/`;
const VIDEO_PLAYER_PREFERENCES_URI = `${PREFERENCE_DIR}videoPlayerPreferences.json`;
const IMAGE_VIEWER_PREFERENCES_URI = `${PREFERENCE_DIR}imageViewerPreferences.json`;

export const DEFAULT_VIDEO_PLAYER_PREFERENCES: VideoPlayerPreferences = {
  speed: 1,
  holdSpeed: 3,
  orientationPreference: 'portrait',
  lockedByDefault: false,
};

export const DEFAULT_IMAGE_VIEWER_PREFERENCES: ImageViewerPreferences = {
  readerMode: 'horizontal-ltr',
  fitMode: 'contain',
  showFilmstrip: false,
};

async function ensurePreferenceDir() {
  if (!FileSystem.documentDirectory) {
    return;
  }
  await FileSystem.makeDirectoryAsync(PREFERENCE_DIR, { intermediates: true }).catch(() => undefined);
}

async function readPreferenceFile<T>(uri: string, defaults: T): Promise<T> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return defaults;
    }
    const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
    return { ...defaults, ...JSON.parse(content) } as T;
  } catch {
    return defaults;
  }
}

async function writePreferenceFile(uri: string, value: unknown) {
  if (!FileSystem.documentDirectory) {
    return;
  }
  await ensurePreferenceDir();
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(value), { encoding: FileSystem.EncodingType.UTF8 });
}

export async function loadVideoPlayerPreferences(): Promise<VideoPlayerPreferences> {
  return readPreferenceFile(VIDEO_PLAYER_PREFERENCES_URI, DEFAULT_VIDEO_PLAYER_PREFERENCES);
}

export async function saveVideoPlayerPreferences(input: Partial<VideoPlayerPreferences>): Promise<void> {
  const current = await loadVideoPlayerPreferences();
  await writePreferenceFile(VIDEO_PLAYER_PREFERENCES_URI, { ...current, ...input });
}

export async function loadImageViewerPreferences(): Promise<ImageViewerPreferences> {
  return readPreferenceFile(IMAGE_VIEWER_PREFERENCES_URI, DEFAULT_IMAGE_VIEWER_PREFERENCES);
}

export async function saveImageViewerPreferences(input: Partial<ImageViewerPreferences>): Promise<void> {
  const current = await loadImageViewerPreferences();
  await writePreferenceFile(IMAGE_VIEWER_PREFERENCES_URI, { ...current, ...input });
}
