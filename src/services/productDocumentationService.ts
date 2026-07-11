import * as FileSystem from 'expo-file-system/legacy';

import { PRODUCT_MANUAL_MARKDOWN } from '../content/productManualMarkdown';
import { ensureLocalDirectory, getAiDocumentsDir, joinStoragePath } from './fileStorageService';

const PRODUCT_DOC_ASSET_BASE_URL = 'https://mist01.com/';
const PRODUCT_DOC_ASSET_PUBLIC_PREFIX = 'assets/';
const PRODUCT_DOC_ASSET_SOURCE_PREFIX = 'docs/assets/';
const PRODUCT_DOC_ASSET_PATH_PATTERN = /\(((?:docs\/)?assets\/[^)\s]+)\)/g;
const PRODUCT_DOC_ASSET_CACHE_DIR_NAME = 'product_documentation_assets_v2';

let cachedProductDocumentationMarkdown: string | null = null;
let productDocumentationMarkdownPromise: Promise<string> | null = null;

function normalizeProductDocumentationMarkdown(markdown: string): string {
  return markdown.replace(PRODUCT_DOC_ASSET_PATH_PATTERN, (_match, relativePath: string) => {
    return `(${getAssetRemoteUri(relativePath)})`;
  });
}

function extractProductDocumentationAssetPaths(markdown: string): string[] {
  return Array.from(markdown.matchAll(PRODUCT_DOC_ASSET_PATH_PATTERN), (match) => match[1]).filter(
    (path, index, paths) => paths.indexOf(path) === index
  );
}

function getProductDocumentationAssetsDir(): string {
  return joinStoragePath(getAiDocumentsDir('normal'), PRODUCT_DOC_ASSET_CACHE_DIR_NAME);
}

function getCachedAssetFileName(relativePath: string): string {
  return relativePath.replace(/^docs\//, '').replace(/[^A-Za-z0-9._-]+/g, '__');
}

function getCachedAssetUri(relativePath: string): string {
  return joinStoragePath(getProductDocumentationAssetsDir(), getCachedAssetFileName(relativePath));
}

function getAssetRemoteUri(relativePath: string): string {
  return `${PRODUCT_DOC_ASSET_BASE_URL}${getPublicAssetPath(relativePath)}`;
}

function getPublicAssetPath(relativePath: string): string {
  if (relativePath.startsWith(PRODUCT_DOC_ASSET_SOURCE_PREFIX)) {
    return `${PRODUCT_DOC_ASSET_PUBLIC_PREFIX}${relativePath.slice(PRODUCT_DOC_ASSET_SOURCE_PREFIX.length)}`;
  }

  return relativePath;
}

function getAssetMimeType(relativePath: string): string {
  const extension = relativePath.split('.').pop()?.toLowerCase() ?? '';
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/png';
  }
}

function getHeaderValue(
  headers: Record<string, string> | undefined,
  key: string
): string | null {
  if (!headers) {
    return null;
  }

  const normalizedKey = key.toLowerCase();
  for (const [headerKey, headerValue] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === normalizedKey) {
      return headerValue;
    }
  }

  return null;
}

async function ensureProductDocumentationAssetCached(relativePath: string): Promise<string | null> {
  const assetUri = getCachedAssetUri(relativePath);
  const existing = await FileSystem.getInfoAsync(assetUri);
  if (existing.exists && !existing.isDirectory && (existing.size ?? 0) > 0) {
    return assetUri;
  }

  const assetsDir = getProductDocumentationAssetsDir();
  await ensureLocalDirectory(assetsDir);

  const tempUri = `${assetUri}.download`;
  await FileSystem.deleteAsync(tempUri, { idempotent: true });

  try {
    const downloadResult = await FileSystem.downloadAsync(getAssetRemoteUri(relativePath), tempUri);
    const contentType = getHeaderValue(downloadResult.headers, 'content-type');
    if (downloadResult.status !== 200) {
      throw new Error(
        `Unexpected status ${String(downloadResult.status)} while downloading ${relativePath}`
      );
    }
    if (!contentType?.toLowerCase().startsWith('image/')) {
      throw new Error(
        `Unexpected content type ${contentType ?? 'unknown'} while downloading ${relativePath}`
      );
    }
    const downloaded = await FileSystem.getInfoAsync(tempUri);
    if (!downloaded.exists || downloaded.isDirectory || (downloaded.size ?? 0) <= 0) {
      throw new Error(`Downloaded product documentation asset is empty: ${relativePath}`);
    }
    await FileSystem.deleteAsync(assetUri, { idempotent: true });
    await FileSystem.moveAsync({ from: tempUri, to: assetUri });
    return assetUri;
  } catch (error) {
    await FileSystem.deleteAsync(tempUri, { idempotent: true });
    console.warn('Pixory product documentation asset prefetch failed.', {
      asset: relativePath,
      error: error instanceof Error ? error.message : 'unknown error',
    });
    return null;
  }
}

async function buildCachedAssetDataUri(relativePath: string): Promise<string | null> {
  const cachedUri = await ensureProductDocumentationAssetCached(relativePath);
  if (!cachedUri) {
    return null;
  }

  const base64 = await FileSystem.readAsStringAsync(cachedUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!base64) {
    return null;
  }

  return `data:${getAssetMimeType(relativePath)};base64,${base64}`;
}

async function buildProductDocumentationMarkdownWithCachedAssets(): Promise<string> {
  const replacements = new Map<string, string>();
  const assetPaths = extractProductDocumentationAssetPaths(PRODUCT_MANUAL_MARKDOWN);

  await Promise.all(
    assetPaths.map(async (relativePath) => {
      const dataUri = await buildCachedAssetDataUri(relativePath);
      replacements.set(relativePath, dataUri ?? getAssetRemoteUri(relativePath));
    })
  );

  return PRODUCT_MANUAL_MARKDOWN.replace(PRODUCT_DOC_ASSET_PATH_PATTERN, (_match, relativePath: string) => {
    return `(${replacements.get(relativePath) ?? getAssetRemoteUri(relativePath)})`;
  });
}

const normalizedProductDocumentationMarkdown = normalizeProductDocumentationMarkdown(
  PRODUCT_MANUAL_MARKDOWN
);

async function resolveProductDocumentationMarkdown(): Promise<string> {
  try {
    const markdown = await buildProductDocumentationMarkdownWithCachedAssets();
    cachedProductDocumentationMarkdown = markdown;
    return markdown;
  } catch (error) {
    console.warn('Pixory product documentation markdown fallback to remote assets.', {
      error: error instanceof Error ? error.message : 'unknown error',
    });
    cachedProductDocumentationMarkdown = normalizedProductDocumentationMarkdown;
    return normalizedProductDocumentationMarkdown;
  }
}

export async function prefetchProductDocumentationAssets(): Promise<void> {
  await getProductDocumentationMarkdown();
}

export async function getProductDocumentationMarkdown(): Promise<string> {
  if (cachedProductDocumentationMarkdown) {
    return cachedProductDocumentationMarkdown;
  }

  if (!productDocumentationMarkdownPromise) {
    productDocumentationMarkdownPromise = resolveProductDocumentationMarkdown().finally(() => {
      productDocumentationMarkdownPromise = null;
    });
  }

  return productDocumentationMarkdownPromise;
}

export function getPreloadedProductDocumentationMarkdown(): string {
  return cachedProductDocumentationMarkdown ?? normalizedProductDocumentationMarkdown;
}
