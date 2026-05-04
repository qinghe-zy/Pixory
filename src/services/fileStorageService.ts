import * as FileSystem from 'expo-file-system/legacy';

const APP_STORAGE_ROOT_DIR_NAME = 'pixory';
const ORIGINALS_DIR_NAME = 'originals';
const THUMBNAILS_DIR_NAME = 'thumbnails';
const EXPORTS_DIR_NAME = 'exports';
const TEMP_DIR_NAME = 'temp';
const PROFILE_DIR_NAME = 'profile';

export interface ManagedFileInfo {
  uri: string;
  exists: boolean;
  isDirectory: boolean;
  size: number | null;
  modificationTime: number | null;
  name: string;
  extension: string | null;
}

export interface FileStorageDevelopmentCheckResult {
  appStorageRoot: string;
  directories: Array<{
    key: 'originals' | 'thumbnails' | 'exports' | 'temp';
    uri: string;
    exists: boolean;
  }>;
  sampleOriginalDestination: string;
  sampleThumbnailDestination: string;
}

function getDocumentDirectoryOrThrow(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('Expo document directory is unavailable on this platform.');
  }

  return FileSystem.documentDirectory;
}

function normalizeDirectoryUri(directoryUri: string): string {
  return directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
}

function getAppStorageRootDir(): string {
  return normalizeDirectoryUri(`${getDocumentDirectoryOrThrow()}${APP_STORAGE_ROOT_DIR_NAME}`);
}

function joinPath(baseDir: string, childName: string): string {
  return `${normalizeDirectoryUri(baseDir)}${childName}`;
}

function buildIpScopedDir(baseDir: string, ipId: number): string {
  return normalizeDirectoryUri(joinPath(baseDir, `ip_${ipId}`));
}

function getFileNameFromUri(fileUri: string): string {
  const [cleanUri] = fileUri.split('?');
  return cleanUri.split('/').pop() ?? '';
}

function getSafeExtension(filename: string): string {
  const match = /\.[A-Za-z0-9]+$/.exec(filename.trim());
  return match ? match[0].toLowerCase() : '.bin';
}

function getFileStem(filename: string): string {
  const extension = getSafeExtension(filename);

  if (extension === '.bin' && !filename.toLowerCase().endsWith('.bin')) {
    return filename;
  }

  return filename.slice(0, Math.max(0, filename.length - extension.length));
}

function sanitizeFileStem(filename: string): string {
  const normalized = getFileStem(filename)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'asset';
}

async function ensureDirectoryExists(directoryUri: string): Promise<void> {
  const normalizedDir = normalizeDirectoryUri(directoryUri);
  const info = await FileSystem.getInfoAsync(normalizedDir);

  if (info.exists && !info.isDirectory) {
    throw new Error(`Expected a directory but found a file at ${normalizedDir}`);
  }

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(normalizedDir, { intermediates: true });
  }
}

async function ensureSourceFileExists(sourceUri: string): Promise<void> {
  const fileInfo = await FileSystem.getInfoAsync(sourceUri);

  if (!fileInfo.exists || fileInfo.isDirectory) {
    throw new Error(`Source file is unavailable: ${sourceUri}`);
  }
}

function isAndroidContentUri(fileUri: string): boolean {
  return fileUri.startsWith('content://');
}

async function copyContentUriWithBase64Fallback(sourceUri: string, destinationUri: string): Promise<void> {
  const base64Contents = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await FileSystem.writeAsStringAsync(destinationUri, base64Contents, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function ensureAppDirectories(): Promise<void> {
  const directories = [
    getAppStorageRootDir(),
    getOriginalsDir(),
    getThumbnailsDir(),
    getExportsDir(),
    getTempDir(),
    getProfileDir(),
  ];

  for (const directoryUri of directories) {
    await ensureDirectoryExists(directoryUri);
  }
}

export function getOriginalsDir(): string {
  return normalizeDirectoryUri(joinPath(getAppStorageRootDir(), ORIGINALS_DIR_NAME));
}

export function getThumbnailsDir(): string {
  return normalizeDirectoryUri(joinPath(getAppStorageRootDir(), THUMBNAILS_DIR_NAME));
}

export function getExportsDir(): string {
  return normalizeDirectoryUri(joinPath(getAppStorageRootDir(), EXPORTS_DIR_NAME));
}

export function getTempDir(): string {
  return normalizeDirectoryUri(joinPath(getAppStorageRootDir(), TEMP_DIR_NAME));
}

export function getProfileDir(): string {
  return normalizeDirectoryUri(joinPath(getAppStorageRootDir(), PROFILE_DIR_NAME));
}

export function generateInternalFilename(originalFilename: string): string {
  const safeExtension = getSafeExtension(originalFilename);
  const safeStem = sanitizeFileStem(originalFilename).slice(0, 32);
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const randomSuffix = Math.random().toString(36).slice(2, 8);

  return `${safeStem}_${timestamp}_${randomSuffix}${safeExtension}`;
}

export async function copyOriginalToAppStorage(
  sourceUri: string,
  ipId: number,
  internalFilename: string
): Promise<string> {
  await ensureAppDirectories();
  await ensureSourceFileExists(sourceUri);

  const ipOriginalsDir = buildIpScopedDir(getOriginalsDir(), ipId);
  await ensureDirectoryExists(ipOriginalsDir);

  const destinationUri = joinPath(ipOriginalsDir, internalFilename);
  try {
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destinationUri,
    });
  } catch (error) {
    if (!isAndroidContentUri(sourceUri)) {
      throw error;
    }

    console.warn('Pixory original copyAsync failed for content URI, retrying with base64 fallback.', {
      sourceUri,
      destinationUri,
      error,
    });

    await copyContentUriWithBase64Fallback(sourceUri, destinationUri);
  }

  return destinationUri;
}

export async function copyProfileAvatarToAppStorage(sourceUri: string): Promise<string> {
  await ensureAppDirectories();
  await ensureSourceFileExists(sourceUri);

  const profileDir = getProfileDir();
  await ensureDirectoryExists(profileDir);

  const extension = getSafeExtension(getFileNameFromUri(sourceUri));
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const destinationUri = joinPath(profileDir, `profile_avatar_${timestamp}${extension}`);

  try {
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destinationUri,
    });
  } catch (error) {
    if (!isAndroidContentUri(sourceUri)) {
      throw error;
    }

    console.warn('Pixory avatar copyAsync failed for content URI, retrying with base64 fallback.', {
      sourceUri,
      destinationUri,
      error,
    });

    await copyContentUriWithBase64Fallback(sourceUri, destinationUri);
  }

  return destinationUri;
}

export async function getFileInfo(fileUri: string): Promise<ManagedFileInfo> {
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  const name = getFileNameFromUri(fileInfo.uri);
  const extensionMatch = /\.[A-Za-z0-9]+$/.exec(name);

  return {
    uri: fileInfo.uri,
    exists: fileInfo.exists,
    isDirectory: fileInfo.isDirectory,
    size: fileInfo.exists ? fileInfo.size : null,
    modificationTime: fileInfo.exists ? fileInfo.modificationTime : null,
    name,
    extension: extensionMatch ? extensionMatch[0].toLowerCase() : null,
  };
}

export async function deleteLocalFile(fileUri: string): Promise<void> {
  await FileSystem.deleteAsync(fileUri, { idempotent: true });
}

export async function runFileStorageDevelopmentCheck(): Promise<FileStorageDevelopmentCheckResult> {
  await ensureAppDirectories();

  const originalsDir = getOriginalsDir();
  const thumbnailsDir = getThumbnailsDir();
  const exportsDir = getExportsDir();
  const tempDir = getTempDir();
  const sampleInternalFilename = generateInternalFilename('sample-image.png');

  const directories = await Promise.all(
    [
      { key: 'originals' as const, uri: originalsDir },
      { key: 'thumbnails' as const, uri: thumbnailsDir },
      { key: 'exports' as const, uri: exportsDir },
      { key: 'temp' as const, uri: tempDir },
    ].map(async ({ key, uri }) => {
      const info = await FileSystem.getInfoAsync(uri);
      return {
        key,
        uri,
        exists: info.exists && info.isDirectory,
      };
    })
  );

  return {
    appStorageRoot: getAppStorageRootDir(),
    directories,
    sampleOriginalDestination: `${buildIpScopedDir(originalsDir, 1)}${sampleInternalFilename}`,
    sampleThumbnailDestination: `${buildIpScopedDir(thumbnailsDir, 1)}${sampleInternalFilename.replace(
      /\.png$/,
      '_thumb.png'
    )}`,
  };
}
