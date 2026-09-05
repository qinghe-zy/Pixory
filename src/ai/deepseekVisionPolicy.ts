import type { AiProviderModelRecord } from './types';

export const DEEPSEEK_OFFICIAL_VISION_MODEL_ID = 'deepseek-v4-flash-vision-exp' as const;
export const DEEPSEEK_VISION_INLINE_BODY_LIMIT_BYTES = 48 * 1024 * 1024;
export const DEEPSEEK_VISION_SINGLE_IMAGE_LIMIT_BYTES = 32 * 1024 * 1024;
export const DEEPSEEK_VISION_SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export function isOfficialDeepSeekVisionModel(modelId: string | null | undefined): boolean {
  return modelId?.trim().toLowerCase() === DEEPSEEK_OFFICIAL_VISION_MODEL_ID;
}

export function supportsDeepSeekVision(input: { modelId: string; model?: Pick<AiProviderModelRecord, 'supportsVision'> | null }): boolean {
  return isOfficialDeepSeekVisionModel(input.modelId) || input.model?.supportsVision === true;
}

export function assertDeepSeekVisionRequest(input: { modelId: string; model?: Pick<AiProviderModelRecord, 'supportsVision'> | null; imageSizes: number[]; requestBodyBytes?: number }): void {
  if (!supportsDeepSeekVision(input)) throw new Error('当前 DeepSeek 模型不支持图片，请切换到 deepseek-v4-flash-vision-exp。');
  if (input.imageSizes.some((size) => !Number.isFinite(size) || size < 0 || size > DEEPSEEK_VISION_SINGLE_IMAGE_LIMIT_BYTES)) throw new Error('图片超过 DeepSeek 视觉模型单图 32 MiB 限制。');
  if (typeof input.requestBodyBytes === 'number' && input.requestBodyBytes > DEEPSEEK_VISION_INLINE_BODY_LIMIT_BYTES) throw new Error('图片请求超过 DeepSeek 视觉模型 48 MiB 请求体限制。');
}

export function isSupportedDeepSeekVisionMimeType(mimeType: string | null | undefined): boolean {
  return DEEPSEEK_VISION_SUPPORTED_MIME_TYPES.includes((mimeType ?? '').trim().toLowerCase() as typeof DEEPSEEK_VISION_SUPPORTED_MIME_TYPES[number]);
}

function decodeBase64Prefix(base64: string, maxBytes = 16): number[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const normalized = base64.replace(/\s/g, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of normalized) {
    if (character === '=') break;
    const value = alphabet.indexOf(character);
    if (value < 0) return [];
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff); if (bytes.length >= maxBytes) break; }
  }
  return bytes;
}

function base64StartsWith(base64: string, bytes: number[]): boolean {
  const decoded = decodeBase64Prefix(base64, Math.max(12, bytes.length));
  return bytes.every((byte, index) => decoded[index] === byte);
}

function base64ContainsAt(base64: string, offset: number, text: string): boolean {
  const decoded = decodeBase64Prefix(base64, offset + text.length);
  return text.split('').every((character, index) => decoded[offset + index] === character.charCodeAt(0));
}

export function matchesDeepSeekVisionSignature(mimeType: string | null | undefined, base64Data: string): boolean {
  const mime = (mimeType ?? '').trim().toLowerCase();
  if (mime === 'image/jpeg') return base64StartsWith(base64Data, [0xff, 0xd8, 0xff]);
  if (mime === 'image/png') return base64StartsWith(base64Data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === 'image/gif') return base64StartsWith(base64Data, [0x47, 0x49, 0x46, 0x38]);
  if (mime === 'image/webp') return base64StartsWith(base64Data, [0x52, 0x49, 0x46, 0x46]) && base64ContainsAt(base64Data, 8, 'WEBP');
  return false;
}

export function assertDeepSeekVisionAttachment(input: { mimeType?: string | null; size?: number | null; base64Data: string }): void {
  if (!isSupportedDeepSeekVisionMimeType(input.mimeType)) throw new Error('DeepSeek 视觉模型仅支持 JPEG、PNG、GIF 和 WebP 图片。');
  assertDeepSeekVisionRequest({ modelId: DEEPSEEK_OFFICIAL_VISION_MODEL_ID, imageSizes: [input.size ?? -1] });
  if (!matchesDeepSeekVisionSignature(input.mimeType, input.base64Data)) throw new Error('图片文件格式与声明类型不一致，已停止发送。');
}

export function assertDeepSeekInlineRequestBodyBytes(requestBodyBytes: number): void {
  if (!Number.isFinite(requestBodyBytes) || requestBodyBytes > DEEPSEEK_VISION_INLINE_BODY_LIMIT_BYTES) throw new Error('图片请求超过 DeepSeek 视觉模型 48 MiB 请求体限制。');
}
