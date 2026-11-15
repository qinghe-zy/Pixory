const RASTER_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'heic',
  'heif',
]);

const IMAGE_MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/x-ms-bmp': 'image/bmp',
  'image/bmp': 'image/bmp',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
  'image/heic': 'image/heic',
  'image/heif': 'image/heif',
  'image/svg+xml': 'image/svg+xml',
};

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
};

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/svg+xml': 'svg',
};

export interface AttachmentKindOptions {
  /**
   * SVG is an XML text format unsupported as `input_image` by major vision LLMs,
   * so vision-enabled chat flows keep SVG as a document unless `includeSvg: true`
   * is explicitly requested (e.g., preview fallbacks or File Transfer).
   */
  includeSvg?: boolean;
}

export function extractSafeFileNameFromUri(uri: string, fallback = 'attachment'): string {
  const cleanUri = uri.trim().split(/[?#]/)[0] ?? '';
  const rawName = cleanUri.split(/[\\/]/).pop()?.trim();
  if (!rawName) {
    return fallback;
  }
  try {
    return decodeURIComponent(rawName) || fallback;
  } catch {
    return rawName;
  }
}

function extractLowerExtension(candidate?: string | null): string {
  if (!candidate) {
    return '';
  }
  const clean = candidate.trim().split(/[?#]/)[0] ?? '';
  const lastDotIndex = clean.lastIndexOf('.');
  if (lastDotIndex < 0 || lastDotIndex === clean.length - 1) {
    return '';
  }
  return clean.slice(lastDotIndex + 1).trim().toLowerCase();
}

function normalizeRawMimeType(mimeType?: string | null): string {
  if (!mimeType) {
    return '';
  }
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function isRasterImageAsset(
  input: {
    mimeType?: string | null;
    name?: string | null;
    uri?: string | null;
  },
  options: AttachmentKindOptions = {},
): boolean {
  const includeSvg = Boolean(options.includeSvg);
  const mime = normalizeRawMimeType(input.mimeType);

  if (mime === 'image/svg+xml') {
    return includeSvg;
  }
  if (mime.startsWith('image/')) {
    return true;
  }

  const candidates = [
    input.name ?? '',
    input.uri ? extractSafeFileNameFromUri(input.uri, '') : '',
  ];

  for (const candidate of candidates) {
    const ext = extractLowerExtension(candidate);
    if (!ext) {
      continue;
    }
    if (ext === 'svg') {
      return includeSvg;
    }
    if (RASTER_IMAGE_EXTENSIONS.has(ext)) {
      return true;
    }
  }

  return false;
}

export function resolveAttachmentKind(
  mimeType: string | null | undefined,
  name: string | null | undefined,
  uri?: string | null,
  options?: AttachmentKindOptions,
): 'image' | 'document' {
  return isRasterImageAsset({ mimeType, name, uri }, options) ? 'image' : 'document';
}

export function normalizeImageMimeType(
  mimeType: string | null | undefined,
  name?: string | null,
  uri?: string | null,
): string {
  const rawMime = normalizeRawMimeType(mimeType);
  if (rawMime.startsWith('image/')) {
    return IMAGE_MIME_ALIASES[rawMime] ?? rawMime;
  }

  const candidates = [
    name ?? '',
    uri ? extractSafeFileNameFromUri(uri, '') : '',
  ];
  for (const candidate of candidates) {
    const ext = extractLowerExtension(candidate);
    const mapped = IMAGE_MIME_BY_EXTENSION[ext];
    if (mapped) {
      return mapped;
    }
  }

  return 'image/jpeg';
}

export function resolveImageFileExtension(
  mimeType?: string | null,
  name?: string | null,
  uri?: string | null,
): string {
  const normalizedMime = normalizeImageMimeType(mimeType, name, uri);
  if (IMAGE_EXTENSION_BY_MIME[normalizedMime]) {
    return IMAGE_EXTENSION_BY_MIME[normalizedMime];
  }

  for (const candidate of [name ?? '', uri ? extractSafeFileNameFromUri(uri, '') : '']) {
    const ext = extractLowerExtension(candidate);
    if (ext && (RASTER_IMAGE_EXTENSIONS.has(ext) || ext === 'svg')) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  }

  return 'jpg';
}

export function containsBinaryNullOrGarbledText(text: string): boolean {
  if (!text) {
    return false;
  }
  if (text.includes('\u0000')) {
    return true;
  }

  const sample = text.length > 4096 ? text.slice(0, 4096) : text;
  if (sample.length === 0) {
    return false;
  }

  let replacementCount = 0;
  let controlCount = 0;

  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);
    if (code === 0xfffd) {
      replacementCount += 1;
      continue;
    }
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      controlCount += 1;
    }
  }

  const replacementRatio = replacementCount / sample.length;
  const controlRatio = controlCount / sample.length;

  if (replacementCount >= 8 && replacementRatio > 0.05) {
    return true;
  }
  if (controlCount >= 6 && controlRatio > 0.02) {
    return true;
  }
  return sample.length >= 16 && replacementRatio + controlRatio > 0.15;
}
