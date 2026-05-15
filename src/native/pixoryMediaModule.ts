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
  rotation?: number;
  mimeType: string | null;
  fileSize: number;
}

export interface NativeExternalOpen {
  hasOpen: boolean;
  action?: string | null;
  uri?: string;
  mimeType?: string | null;
  name?: string | null;
  fileSize?: number | null;
}

export interface NativeShareItem {
  uri: string;
  mimeType?: string | null;
  name?: string | null;
  size?: number | null;
}

export interface NativeShareIntent {
  hasShare: boolean;
  action?: string | null;
  mimeType?: string | null;
  items: NativeShareItem[];
}

export interface NativeIntentEvent {
  kind: 'share' | 'externalOpen' | 'unknown';
  shareIntent?: NativeShareIntent;
  externalOpen?: NativeExternalOpen;
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
  copyFileToSafWithProgress(
    sourceUri: string,
    destinationDirUri: string,
    displayName: string,
    mimeType?: string | null,
    options?: { taskId?: string | null }
  ): Promise<NativeCopyResult>;
  getVideoMetadata(sourceUri: string): Promise<NativeVideoMetadata>;
  createVideoThumbnail(sourceUri: string, destinationUri: string): Promise<NativeCopyResult>;
  getPdfPageCount(sourceUri: string): Promise<number>;
  renderPdfPageToFile(sourceUri: string, pageIndex: number, destinationUri: string, width: number): Promise<NativeCopyResult>;
  saveImageToMediaStore(sourceUri: string, displayName: string, albumName?: string | null): Promise<string>;
  saveVideoToMediaStore(sourceUri: string, displayName: string): Promise<string>;
  computeFileSha256(sourceUri: string): Promise<string>;
  computeImageDHash(sourceUri: string): Promise<string>;
  getInitialExternalOpen(): Promise<NativeExternalOpen>;
  getInitialShareIntent(): Promise<NativeShareIntent>;
  finishShareActivity(): Promise<boolean>;
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

export function addNativeIntentListener(
  listener: (event: NativeIntentEvent) => void
): { remove: () => void } {
  if (!emitter) {
    return { remove: () => undefined };
  }

  return emitter.addListener('PixoryMediaIntentReceived', listener);
}

export function copyUriToFileWithProgress(
  sourceUri: string,
  destinationUri: string,
  taskId?: string | null
): Promise<NativeCopyResult> {
  return requireNativeModule().copyUriToFileWithProgress(sourceUri, destinationUri, { taskId: taskId ?? null });
}

export function copyFileToSafWithProgress(
  sourceUri: string,
  destinationDirUri: string,
  displayName: string,
  mimeType?: string | null,
  taskId?: string | null
): Promise<NativeCopyResult> {
  return requireNativeModule().copyFileToSafWithProgress(sourceUri, destinationDirUri, displayName, mimeType ?? null, { taskId: taskId ?? null });
}

export function getNativeVideoMetadata(sourceUri: string): Promise<NativeVideoMetadata> {
  return requireNativeModule().getVideoMetadata(sourceUri);
}

export function createNativeVideoThumbnail(sourceUri: string, destinationUri: string): Promise<NativeCopyResult> {
  return requireNativeModule().createVideoThumbnail(sourceUri, destinationUri);
}

export function getPdfPageCount(sourceUri: string): Promise<number> {
  return requireNativeModule().getPdfPageCount(sourceUri);
}

export function renderPdfPageToFile(
  sourceUri: string,
  pageIndex: number,
  destinationUri: string,
  width: number
): Promise<NativeCopyResult> {
  return requireNativeModule().renderPdfPageToFile(sourceUri, pageIndex, destinationUri, width);
}

export function saveNativeImageToMediaStore(
  sourceUri: string,
  displayName: string,
  albumName?: string | null
): Promise<string> {
  return requireNativeModule().saveImageToMediaStore(sourceUri, displayName, albumName ?? null);
}

export function saveNativeVideoToMediaStore(sourceUri: string, displayName: string): Promise<string> {
  return requireNativeModule().saveVideoToMediaStore(sourceUri, displayName);
}

export function computeFileSha256(sourceUri: string): Promise<string> {
  return requireNativeModule().computeFileSha256(sourceUri);
}

export function computeImageDHash(sourceUri: string): Promise<string> {
  return requireNativeModule().computeImageDHash(sourceUri);
}

export function getInitialExternalOpen(): Promise<NativeExternalOpen> {
  return requireNativeModule().getInitialExternalOpen();
}

export function getInitialShareIntent(): Promise<NativeShareIntent> {
  return requireNativeModule().getInitialShareIntent();
}

export function finishNativeShareActivity(): Promise<boolean> {
  return requireNativeModule().finishShareActivity();
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
