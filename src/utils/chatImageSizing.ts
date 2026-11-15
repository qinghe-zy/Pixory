export interface ChatImageDimensions {
  width: number;
  height: number;
}

export interface ChatImageBounds {
  maxWidth?: number;
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;
  minAspectRatio?: number;
  maxAspectRatio?: number;
  fallbackWidth?: number;
  fallbackHeight?: number;
}

const DEFAULT_MAX_WIDTH = 220;
const DEFAULT_MAX_HEIGHT = 280;
const DEFAULT_MIN_WIDTH = 96;
const DEFAULT_MIN_HEIGHT = 84;
const DEFAULT_MIN_ASPECT_RATIO = 0.45;
const DEFAULT_MAX_ASPECT_RATIO = 2.2;
const DEFAULT_FALLBACK_WIDTH = 180;
const DEFAULT_FALLBACK_HEIGHT = 135;

const MAX_DIMENSION_CACHE_ENTRIES = 500;
const imageDimensionCache = new Map<string, ChatImageDimensions>();

function isValidDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function setBoundedCacheEntry(key: string, value: ChatImageDimensions): void {
  if (imageDimensionCache.has(key)) {
    imageDimensionCache.delete(key);
  }
  imageDimensionCache.set(key, value);
  while (imageDimensionCache.size > MAX_DIMENSION_CACHE_ENTRIES) {
    const oldestKey = imageDimensionCache.keys().next().value;
    if (typeof oldestKey !== 'string') {
      break;
    }
    imageDimensionCache.delete(oldestKey);
  }
}

export function rememberImageDimensions(
  uri: string | null | undefined,
  width: number | null | undefined,
  height: number | null | undefined,
): void {
  const key = uri?.trim();
  if (!key || !isValidDimension(width) || !isValidDimension(height)) {
    return;
  }
  setBoundedCacheEntry(key, {
    width: Math.round(width),
    height: Math.round(height),
  });
}

export function getCachedImageDimensions(
  uri: string | null | undefined,
): ChatImageDimensions | null {
  const key = uri?.trim();
  if (!key) {
    return null;
  }
  const existing = imageDimensionCache.get(key);
  if (!existing) {
    return null;
  }
  // Refresh LRU recency on hit
  imageDimensionCache.delete(key);
  imageDimensionCache.set(key, existing);
  return existing;
}

export function copyCachedImageDimensions(
  fromUri: string | null | undefined,
  toUri: string | null | undefined,
): void {
  const sourceKey = fromUri?.trim();
  const targetKey = toUri?.trim();
  if (!sourceKey || !targetKey || sourceKey === targetKey) {
    return;
  }
  const existing = getCachedImageDimensions(sourceKey);
  if (existing) {
    setBoundedCacheEntry(targetKey, existing);
  }
}

export function clearImageDimensionsCache(): void {
  imageDimensionCache.clear();
}

export function computeBoundedImageDimensions(
  naturalWidth: number | null | undefined,
  naturalHeight: number | null | undefined,
  bounds: ChatImageBounds = {},
): ChatImageDimensions {
  const maxWidth = bounds.maxWidth ?? DEFAULT_MAX_WIDTH;
  const maxHeight = bounds.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const minWidth = Math.min(bounds.minWidth ?? DEFAULT_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(bounds.minHeight ?? DEFAULT_MIN_HEIGHT, maxHeight);
  const minAspectRatio = bounds.minAspectRatio ?? DEFAULT_MIN_ASPECT_RATIO;
  const maxAspectRatio = bounds.maxAspectRatio ?? DEFAULT_MAX_ASPECT_RATIO;
  const fallbackWidth = clamp(bounds.fallbackWidth ?? DEFAULT_FALLBACK_WIDTH, minWidth, maxWidth);
  const fallbackHeight = clamp(bounds.fallbackHeight ?? DEFAULT_FALLBACK_HEIGHT, minHeight, maxHeight);

  if (!isValidDimension(naturalWidth) || !isValidDimension(naturalHeight)) {
    return {
      width: Math.round(fallbackWidth),
      height: Math.round(fallbackHeight),
    };
  }

  const rawRatio = naturalWidth / naturalHeight;
  const clampedRatio = clamp(rawRatio, minAspectRatio, maxAspectRatio);

  let width = maxWidth;
  let height = width / clampedRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * clampedRatio;
  }

  if (width < minWidth) {
    width = minWidth;
    height = Math.min(maxHeight, width / clampedRatio);
  }

  if (height < minHeight) {
    height = minHeight;
    width = Math.min(maxWidth, height * clampedRatio);
  }

  return {
    width: Math.round(clamp(width, minWidth, maxWidth)),
    height: Math.round(clamp(height, minHeight, maxHeight)),
  };
}
