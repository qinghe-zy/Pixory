/**
 * Pure JavaScript Base64 encoder/decoder
 * Safe for React Native / Hermes / Node.js environments without relying on global btoa/atob
 */

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function arrayBufferToBase64(
  input: ArrayBuffer | ArrayBufferView,
  byteOffset?: number,
  byteLength?: number
): string {
  let bytes: Uint8Array;
  if (ArrayBuffer.isView(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else if (byteOffset !== undefined || byteLength !== undefined) {
    bytes = new Uint8Array(input, byteOffset ?? 0, byteLength ?? (input.byteLength - (byteOffset ?? 0)));
  } else {
    bytes = new Uint8Array(input);
  }

  const len = bytes.length;
  let base64 = '';

  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    base64 += BASE64_CHARS[b0 >> 2];
    base64 += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    base64 += i + 1 < len ? BASE64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    base64 += i + 2 < len ? BASE64_CHARS[b2 & 63] : '=';
  }

  return base64;
}
