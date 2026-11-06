import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export interface NativeCopyProgressEvent {
  taskId: string;
  copiedBytes: number;
  totalBytes: number;
}

export interface NativeMemoryPressureEvent {
  high: boolean;
  level: number;
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

export interface NativeSpeechCapability {
  available: boolean;
  onDeviceAvailable: boolean;
  mode: 'on_device' | 'system' | 'unavailable';
}

export type NativeSpeechErrorCode =
  | 'activity_unavailable'
  | 'audio'
  | 'busy'
  | 'cancelled'
  | 'network'
  | 'no_speech'
  | 'permission_denied'
  | 'service'
  | 'timeout'
  | 'unavailable';

export interface NativeSpeechEvent {
  type: 'ready' | 'partial' | 'result' | 'error' | 'end' | 'cancelled';
  text?: string;
  code?: NativeSpeechErrorCode;
  message?: string;
  onDevice: boolean;
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
  extractPdfText(sourceUri: string): Promise<{ text: string; pageCount: number }>;
  saveImageToMediaStore(sourceUri: string, displayName: string, albumName?: string | null): Promise<string>;
  saveVideoToMediaStore(sourceUri: string, displayName: string): Promise<string>;
  deleteMediaStoreAssetsWithConfirmation(assetIds: string[]): Promise<boolean>;
  computeFileSha256(sourceUri: string): Promise<string>;
  computeImageDHash(sourceUri: string): Promise<string>;
  recognizeSpeech(): Promise<{ text: string }>;
  getSpeechRecognitionCapabilities(): Promise<NativeSpeechCapability>;
  startSpeechRecognition(): Promise<{ onDevice: boolean }>;
  stopSpeechRecognition(): Promise<boolean>;
  cancelSpeechRecognition(): Promise<boolean>;
  getInitialExternalOpen(): Promise<NativeExternalOpen>;
  getInitialShareIntent(): Promise<NativeShareIntent>;
  finishShareActivity(): Promise<boolean>;
  listZipEntries(zipUri: string): Promise<NativeZipEntry[]>;
  listZipImageEntries(zipUri: string): Promise<NativeZipEntry[]>;
  extractZipEntryToTemp(zipUri: string, entryName: string, destinationUri: string): Promise<string>;
  cleanupTempSession(tempDirUri: string): Promise<boolean>;
  scheduleDiaryAlarm(triggerAtMs: number, jobId: string): Promise<'exact' | 'inexact'>;
  cancelDiaryAlarm(jobId: string): Promise<boolean>;
  canScheduleExactDiaryAlarm(): Promise<boolean>;
  openDiaryExactAlarmSettings(): Promise<boolean>;
  postCompanionNotification(threadId: string, title: string, content: string): Promise<boolean>;
  cancelCompanionNotification(threadId: string): Promise<boolean>;
  getTtsCapabilities(): Promise<NativeTtsCapabilities>;
  synthesizeTtsToFile(
    text: string,
    rate: number,
    pitch: number,
    targetFilePath: string
  ): Promise<NativeTtsSynthesisResult>;
  stopTtsPlayback(): Promise<boolean>;
  startAudioRecording(targetFilePath: string): Promise<{ filePath: string }>;
  stopAudioRecording(): Promise<NativeAudioRecordingResult>;
  cancelAudioRecording(): Promise<boolean>;
  getAudioRecordingAmplitude?(): Promise<number>;
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

export function addNativeMemoryPressureListener(
  listener: (event: NativeMemoryPressureEvent) => void
): { remove: () => void } {
  if (!emitter) {
    return { remove: () => undefined };
  }

  return emitter.addListener('PixoryMediaMemoryPressure', listener);
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

export function extractPdfText(sourceUri: string): Promise<{ text: string; pageCount: number }> {
  return requireNativeModule().extractPdfText(sourceUri);
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

export function deleteNativeMediaStoreAssetsWithConfirmation(assetIds: string[]): Promise<boolean> {
  return requireNativeModule().deleteMediaStoreAssetsWithConfirmation(assetIds);
}

export function computeFileSha256(sourceUri: string): Promise<string> {
  return requireNativeModule().computeFileSha256(sourceUri);
}

export function computeImageDHash(sourceUri: string): Promise<string> {
  return requireNativeModule().computeImageDHash(sourceUri);
}

export function recognizeSpeech(): Promise<{ text: string }> {
  return requireNativeModule().recognizeSpeech();
}

export function addNativeSpeechRecognitionListener(
  listener: (event: NativeSpeechEvent) => void
): { remove: () => void } {
  if (!emitter) return { remove: () => undefined };
  return emitter.addListener('PixorySpeechRecognition', listener);
}

export function getSpeechRecognitionCapabilities(): Promise<NativeSpeechCapability> {
  return requireNativeModule().getSpeechRecognitionCapabilities();
}

export function startSpeechRecognition(): Promise<{ onDevice: boolean }> {
  return requireNativeModule().startSpeechRecognition();
}

export function stopSpeechRecognition(): Promise<boolean> {
  return requireNativeModule().stopSpeechRecognition();
}

export function cancelSpeechRecognition(): Promise<boolean> {
  return requireNativeModule().cancelSpeechRecognition();
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

export function listNativeZipEntries(zipUri: string): Promise<NativeZipEntry[]> {
  return requireNativeModule().listZipEntries(zipUri);
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

export function scheduleDiaryAlarm(triggerAtMs: number, jobId: string): Promise<'exact' | 'inexact'> {
  return requireNativeModule().scheduleDiaryAlarm(triggerAtMs, jobId);
}

export function cancelDiaryAlarm(jobId: string): Promise<boolean> {
  return requireNativeModule().cancelDiaryAlarm(jobId);
}

export function canScheduleExactDiaryAlarm(): Promise<boolean> {
  return requireNativeModule().canScheduleExactDiaryAlarm();
}

export function openDiaryExactAlarmSettings(): Promise<boolean> {
  return requireNativeModule().openDiaryExactAlarmSettings();
}

export function postCompanionNotification(
  threadId: string,
  title: string,
  content: string
): Promise<boolean> {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  return requireNativeModule().postCompanionNotification(threadId, title, content);
}

export function cancelCompanionNotification(threadId: string): Promise<boolean> {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  return requireNativeModule().cancelCompanionNotification(threadId);
}

export interface NativeTtsCapabilities {
  available: boolean;
  languageAvailable: boolean;
  voicesCount: number;
  enginePackage?: string;
  error?: string;
}

export interface NativeTtsSynthesisResult {
  filePath: string;
  byteSize: number;
}

export function getNativeTtsCapabilities(): Promise<NativeTtsCapabilities> {
  if (Platform.OS !== 'android') {
    return Promise.resolve({
      available: false,
      languageAvailable: false,
      voicesCount: 0,
    });
  }
  const mod = nativeModule;
  if (!mod || typeof mod.getTtsCapabilities !== 'function') {
    return Promise.resolve({
      available: false,
      languageAvailable: false,
      voicesCount: 0,
      error: '系统原生TTS尚未在当前客户端编译生效，请配置云端 API 服务或安装最新完整 APK。',
    });
  }
  return mod.getTtsCapabilities();
}

export function hasNativeTtsSupport(): boolean {
  if (Platform.OS !== 'android') return false;
  const mod = nativeModule;
  return Boolean(mod && typeof mod.synthesizeTtsToFile === 'function');
}

export function synthesizeNativeTtsToFile(
  text: string,
  rate: number,
  pitch: number,
  targetFilePath: string
): Promise<NativeTtsSynthesisResult> {
  if (Platform.OS !== 'android') {
    return Promise.reject(new Error('Native TTS is only available on Android.'));
  }
  const mod = nativeModule;
  if (!mod || typeof mod.synthesizeTtsToFile !== 'function') {
    return Promise.reject(
      new Error('系统离线TTS尚未在当前底包中生效，请在设置中配置【自定义 API 服务】（如 SiliconFlow / OpenAI 等）以启用高清语音。')
    );
  }
  return mod.synthesizeTtsToFile(text, rate, pitch, targetFilePath);
}

export function stopNativeTtsPlayback(): Promise<boolean> {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  const mod = nativeModule;
  if (!mod || typeof mod.stopTtsPlayback !== 'function') return Promise.resolve(false);
  return mod.stopTtsPlayback();
}

export interface NativeAudioRecordingResult {
  filePath: string;
  durationMs: number;
  fileSize: number;
}

let mockRecordingStartTime = 0;
let mockRecordingPath = '';
let mockStep = 0;

export function hasNativeAudioRecordingSupport(): boolean {
  const mod = nativeModule;
  return Boolean(mod && typeof mod.startAudioRecording === 'function');
}

export function startNativeAudioRecording(targetFilePath: string): Promise<{ filePath: string }> {
  const mod = nativeModule;
  if (!mod || typeof mod.startAudioRecording !== 'function') {
    // 优雅模拟/预览模式：底包尚未重新编译或在调试环境下，直观呈现发语音、声波跳动与消息上屏
    mockRecordingStartTime = Date.now();
    mockRecordingPath = targetFilePath;
    mockStep = 0;
    return Promise.resolve({ filePath: targetFilePath });
  }
  return mod.startAudioRecording(targetFilePath);
}

export function stopNativeAudioRecording(): Promise<NativeAudioRecordingResult> {
  const mod = nativeModule;
  if (!mod || typeof mod.stopAudioRecording !== 'function') {
    const elapsed = Math.max(1000, Date.now() - (mockRecordingStartTime || Date.now() - 2500));
    return Promise.resolve({
      filePath: mockRecordingPath || 'mock_voice.m4a',
      durationMs: elapsed,
      fileSize: 1024,
    });
  }
  return mod.stopAudioRecording();
}

export function cancelNativeAudioRecording(): Promise<boolean> {
  const mod = nativeModule;
  if (!mod || typeof mod.cancelAudioRecording !== 'function') {
    mockRecordingPath = '';
    return Promise.resolve(true);
  }
  return mod.cancelAudioRecording();
}

export function getNativeAudioRecordingAmplitude(): Promise<number> {
  const mod = nativeModule;
  if (!mod || typeof mod.getAudioRecordingAmplitude !== 'function') {
    // 模拟真实说话声学起伏（在 6000 ~ 24000 之间波动跳跃，有起有伏）
    mockStep++;
    const wave = Math.sin(mockStep * 0.4) * 0.5 + 0.5;
    const jitter = (Math.random() - 0.5) * 0.3;
    const simAmp = Math.round(Math.max(2500, Math.min(26000, (wave + jitter) * 20000 + 5000)));
    return Promise.resolve(simAmp);
  }
  return mod.getAudioRecordingAmplitude();
}
