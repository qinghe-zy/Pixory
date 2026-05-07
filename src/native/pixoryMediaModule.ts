import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export interface NativeCopyProgressEvent {
  taskId: string;
  copiedBytes: number;
  totalBytes: number;
}

export interface NativeCopyResult {
  uri: string;
  size: number;
}

export interface NativeVideoMetadata {
  durationMs: number;
  width: number;
  height: number;
  mimeType: string | null;
  fileSize: number;
}

export interface NativeExternalOpen {
  hasOpen: boolean;
  uri?: string;
  mimeType?: string | null;
  name?: string | null;
}

export interface NativeZipEntry {
  name: string;
  size: number;
}

interface PixoryMediaNativeModule {
  copyUriToFileWithProgress(
    sourceUri: string,
    destinationUri: string,
    options?: { taskId?: string | null }
  ): Promise<NativeCopyResult>;
  getVideoMetadata(sourceUri: string): Promise<NativeVideoMetadata>;
  createVideoThumbnail(sourceUri: string, destinationUri: string): Promise<NativeCopyResult>;
  saveVideoToMediaStore(sourceUri: string, displayName: string): Promise<string>;
  getInitialExternalOpen(): Promise<NativeExternalOpen>;
  listZipImageEntries(zipUri: string): Promise<NativeZipEntry[]>;
  extractZipEntryToTemp(zipUri: string, entryName: string, destinationUri: string): Promise<string>;
  cleanupTempSession(tempDirUri: string): Promise<boolean>;
}

const nativeModule = NativeModules.PixoryMediaModule as PixoryMediaNativeModule | undefined;
const emitter = nativeModule ? new NativeEventEmitter(NativeModules.PixoryMediaModule) : null;

function requireNativeModule(): PixoryMediaNativeModule {
  if (!nativeModule) {
    throw new Error(
      Platform.OS === 'android'
        ? 'Pixory 原生媒体模块不可用，请重新构建 Android 应用。'
        : '当前平台暂不支持该原生媒体能力。'
    );
  }

  return nativeModule;
}

export function addNativeCopyProgressListener(
  listener: (event: NativeCopyProgressEvent) => void
): { remove: () => void } {
  if (!emitter) {
    return { remove: () => undefined };
  }

  return emitter.addListener('PixoryMediaCopyProgress', listener);
}

export function copyUriToFileWithProgress(
  sourceUri: string,
  destinationUri: string,
  taskId?: string | null
): Promise<NativeCopyResult> {
  return requireNativeModule().copyUriToFileWithProgress(sourceUri, destinationUri, { taskId: taskId ?? null });
}

export function getNativeVideoMetadata(sourceUri: string): Promise<NativeVideoMetadata> {
  return requireNativeModule().getVideoMetadata(sourceUri);
}

export function createNativeVideoThumbnail(sourceUri: string, destinationUri: string): Promise<NativeCopyResult> {
  return requireNativeModule().createVideoThumbnail(sourceUri, destinationUri);
}

export function saveNativeVideoToMediaStore(sourceUri: string, displayName: string): Promise<string> {
  return requireNativeModule().saveVideoToMediaStore(sourceUri, displayName);
}

export function getInitialExternalOpen(): Promise<NativeExternalOpen> {
  return requireNativeModule().getInitialExternalOpen();
}

export function listNativeZipImageEntries(zipUri: string): Promise<NativeZipEntry[]> {
  return requireNativeModule().listZipImageEntries(zipUri);
}

export function extractNativeZipEntryToTemp(
  zipUri: string,
  entryName: string,
  destinationUri: string
): Promise<string> {
  return requireNativeModule().extractZipEntryToTemp(zipUri, entryName, destinationUri);
}

export function cleanupNativeTempSession(tempDirUri: string): Promise<boolean> {
  return requireNativeModule().cleanupTempSession(tempDirUri);
}
