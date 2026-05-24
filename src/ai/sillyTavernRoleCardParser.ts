import type { AiRoleCardSourceType } from './types';

export type SillyTavernImportSourceType = AiRoleCardSourceType;

export interface NormalizedSillyTavernRoleCard {
  name: string;
  description: string | null;
  prompt: string;
  firstMessage: string | null;
  alternateGreetings: string[];
  tags: string[];
  sourceType: SillyTavernImportSourceType;
  sourceJson: string;
  sourceVersion: 'v1' | 'v2' | 'v3';
  creator: string | null;
  characterVersion: string | null;
  worldBookEntryCount: number;
  worldBookMergedCharacterCount: number;
  worldBookTruncated: boolean;
  warnings: string[];
}

export type SillyTavernParseErrorCode =
  | 'unsupported_file'
  | 'invalid_png'
  | 'missing_chara'
  | 'invalid_base64'
  | 'invalid_json'
  | 'unsupported_spec'
  | 'missing_role_content';

export type SillyTavernParseResult =
  | { ok: true; normalized: NormalizedSillyTavernRoleCard }
  | { ok: false; code: SillyTavernParseErrorCode; message: string };

type JsonRecord = Record<string, unknown>;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const MAX_PNG_BASE64_LENGTH = 24_000_000;
const MAX_CHARA_BASE64_LENGTH = 2_000_000;
const MAX_WORLD_BOOK_CHARS = 5000;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ROLE_CONTENT_KEYS = [
  'name',
  'description',
  'first_mes',
  'personality',
  'scenario',
  'system_prompt',
  'post_history_instructions',
  'mes_example',
  'alternate_greetings',
  'character_book',
] as const;

function error(code: SillyTavernParseErrorCode, message: string): SillyTavernParseResult {
  return { ok: false, code, message };
}

function invalidBase64(message: string): SillyTavernParseResult {
  return { ok: false, code: 'invalid_base64', message };
}

function invalidJson(message: string): SillyTavernParseResult {
  return { ok: false, code: 'invalid_json', message };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => stringField(item)).filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function appendSection(parts: string[], title: string, content: string): void {
  const trimmed = content.trim();
  if (!trimmed) {
    return;
  }
  parts.push(`## ${title}\n${trimmed}`);
}

function safeSourceJson(raw: JsonRecord): string | null {
  try {
    return JSON.stringify(raw);
  } catch {
    return null;
  }
}

function detectPayload(
  raw: JsonRecord
): { data: JsonRecord; version: 'v1' | 'v2' | 'v3'; sourceType: SillyTavernImportSourceType } | null {
  const spec = stringField(raw.spec);
  if ((spec === 'chara_card_v2' || spec === 'chara_card_v3') && isRecord(raw.data)) {
    return {
      data: raw.data,
      version: spec === 'chara_card_v3' ? 'v3' : 'v2',
      sourceType: spec === 'chara_card_v3' ? 'sillytavern_json_v3' : 'sillytavern_json_v2',
    };
  }

  if (ROLE_CONTENT_KEYS.some((key) => hasOwn(raw, key))) {
    return { data: raw, version: 'v1', sourceType: 'tavern_json_v1' };
  }

  return null;
}

function labelWorldBookEntry(entry: JsonRecord): string {
  const name = stringField(entry.name);
  const comment = stringField(entry.comment);
  if (name && comment && name !== comment) {
    return `${name} - ${comment}`;
  }
  return name || comment;
}

function extractWorldBook(data: JsonRecord): {
  text: string;
  count: number;
  truncated: boolean;
  mergedChars: number;
} {
  const book = data.character_book;
  if (!isRecord(book) || !Array.isArray(book.entries)) {
    return { text: '', count: 0, truncated: false, mergedChars: 0 };
  }

  let text = '';
  let count = 0;
  let truncated = false;

  for (const entry of book.entries) {
    if (!isRecord(entry) || entry.enabled === false) {
      continue;
    }

    const content = stringField(entry.content);
    if (!content) {
      continue;
    }

    count += 1;
    const label = labelWorldBookEntry(entry);
    const block = label ? `### ${label}\n${content}` : content;
    const prefix = text ? '\n\n' : '';
    const addition = `${prefix}${block}`;

    if (text.length + addition.length <= MAX_WORLD_BOOK_CHARS) {
      text += addition;
      continue;
    }

    const remaining = MAX_WORLD_BOOK_CHARS - text.length;
    if (remaining > prefix.length) {
      text += `${prefix}${block.slice(0, remaining - prefix.length)}`;
    }
    truncated = true;
    break;
  }

  return { text, count, truncated, mergedChars: text.length };
}

function parseJsonObject(text: string): { ok: true; raw: JsonRecord } | { ok: false; result: SillyTavernParseResult } {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      return { ok: false, result: invalidJson('角色卡 JSON 必须是对象。') };
    }
    return { ok: true, raw: parsed };
  } catch {
    return { ok: false, result: invalidJson('角色卡 JSON 格式无效。') };
  }
}

export function normalizeSillyTavernRoleCard(
  raw: unknown,
  preferredSourceType?: SillyTavernImportSourceType
): SillyTavernParseResult {
  if (!isRecord(raw)) {
    return invalidJson('角色卡 JSON 必须是对象。');
  }

  const detected = detectPayload(raw);
  if (!detected) {
    return error('unsupported_spec', '当前版本支持 V2/V3 角色卡，并兼容常见 V1 字段。');
  }

  const sourceJson = safeSourceJson(raw);
  if (!sourceJson) {
    return invalidJson('角色卡 JSON 无法序列化。');
  }

  const data = detected.data;
  const sourceType = preferredSourceType ?? detected.sourceType;
  const name = stringField(data.name) || '未命名角色';
  const roleDescription = stringField(data.description);
  const creatorNotes = stringField(data.creator_notes);
  const personality = stringField(data.personality);
  const scenario = stringField(data.scenario);
  const systemPrompt = stringField(data.system_prompt);
  const postHistoryInstructions = stringField(data.post_history_instructions);
  const messageExample = stringField(data.mes_example);
  const firstMes = stringField(data.first_mes);
  const alternateGreetings = uniqueStrings([...(firstMes ? [firstMes] : []), ...stringArray(data.alternate_greetings)]);
  const firstMessage = firstMes || alternateGreetings[0] || null;
  const worldBook = extractWorldBook(data);
  const promptParts: string[] = [];

  appendSection(promptParts, '角色描述', roleDescription);
  appendSection(promptParts, '性格', personality);
  appendSection(promptParts, '场景', scenario);
  appendSection(promptParts, '系统提示', systemPrompt);
  appendSection(promptParts, '历史后指令', postHistoryInstructions);
  appendSection(promptParts, '对话示例', messageExample);
  appendSection(promptParts, '附加设定', worldBook.text);

  const prompt = promptParts.join('\n\n');
  if (!prompt.trim() && alternateGreetings.length === 0) {
    return error('missing_role_content', '角色卡缺少可导入的设定内容。');
  }

  return {
    ok: true,
    normalized: {
      name,
      description: creatorNotes || roleDescription || null,
      prompt,
      firstMessage,
      alternateGreetings,
      tags: uniqueStrings(stringArray(data.tags)),
      sourceType,
      sourceJson,
      sourceVersion: detected.version,
      creator: stringField(data.creator) || null,
      characterVersion: stringField(data.character_version) || stringField(data.version) || null,
      worldBookEntryCount: worldBook.count,
      worldBookMergedCharacterCount: worldBook.mergedChars,
      worldBookTruncated: worldBook.truncated,
      warnings: worldBook.truncated ? ['部分附加设定因长度限制未导入'] : [],
    },
  };
}

export function parseSillyTavernJson(text: string): SillyTavernParseResult {
  const parsed = parseJsonObject(text);
  if (!parsed.ok) {
    return parsed.result;
  }
  return normalizeSillyTavernRoleCard(parsed.raw);
}

function removeBase64Whitespace(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
      continue;
    }
    result += char;
  }
  return result;
}

function base64Value(char: string): number {
  return BASE64_ALPHABET.indexOf(char);
}

function decodeBase64ToBytes(value: string): Uint8Array | null {
  const normalized = removeBase64Whitespace(value);
  if (!normalized) {
    return null;
  }

  const firstPadding = normalized.indexOf('=');
  if (firstPadding >= 0) {
    const paddingCount = normalized.length - firstPadding;
    if (paddingCount > 2 || normalized.length % 4 !== 0) {
      return null;
    }
    for (let index = firstPadding; index < normalized.length; index += 1) {
      if (normalized[index] !== '=') {
        return null;
      }
    }
  } else if (normalized.length % 4 === 1) {
    return null;
  }

  const padded =
    firstPadding >= 0 || normalized.length % 4 === 0
      ? normalized
      : `${normalized}${'='.repeat(4 - (normalized.length % 4))}`;
  const bytes: number[] = [];

  for (let index = 0; index < padded.length; index += 4) {
    const c1 = padded[index];
    const c2 = padded[index + 1];
    const c3 = padded[index + 2];
    const c4 = padded[index + 3];
    if (!c1 || !c2 || !c3 || !c4 || c1 === '=' || c2 === '=') {
      return null;
    }

    const v1 = base64Value(c1);
    const v2 = base64Value(c2);
    const v3 = c3 === '=' ? 0 : base64Value(c3);
    const v4 = c4 === '=' ? 0 : base64Value(c4);
    if (v1 < 0 || v2 < 0 || v3 < 0 || v4 < 0 || (c3 === '=' && c4 !== '=')) {
      return null;
    }

    const triple = (v1 << 18) | (v2 << 12) | (v3 << 6) | v4;
    bytes.push((triple >> 16) & 255);
    if (c3 !== '=') {
      bytes.push((triple >> 8) & 255);
    }
    if (c4 !== '=') {
      bytes.push(triple & 255);
    }
  }

  return new Uint8Array(bytes);
}

function isContinuationByte(byte: number | undefined): byte is number {
  return byte !== undefined && byte >= 128 && byte <= 191;
}

function decodeUtf8(bytes: Uint8Array): string | null {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte <= 127) {
      result += String.fromCharCode(byte);
      continue;
    }

    const second = bytes[index + 1];
    if (byte >= 194 && byte <= 223) {
      if (!isContinuationByte(second)) {
        return null;
      }
      result += String.fromCharCode(((byte & 31) << 6) | (second & 63));
      index += 1;
      continue;
    }

    const third = bytes[index + 2];
    if (byte >= 224 && byte <= 239) {
      if (
        !isContinuationByte(second) ||
        !isContinuationByte(third) ||
        (byte === 224 && second < 160) ||
        (byte === 237 && second >= 160)
      ) {
        return null;
      }
      result += String.fromCharCode(((byte & 15) << 12) | ((second & 63) << 6) | (third & 63));
      index += 2;
      continue;
    }

    const fourth = bytes[index + 3];
    if (byte >= 240 && byte <= 244) {
      if (
        !isContinuationByte(second) ||
        !isContinuationByte(third) ||
        !isContinuationByte(fourth) ||
        (byte === 240 && second < 144) ||
        (byte === 244 && second >= 144)
      ) {
        return null;
      }
      let codePoint = ((byte & 7) << 18) | ((second & 63) << 12) | ((third & 63) << 6) | (fourth & 63);
      codePoint -= 0x10000;
      result += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 1023));
      index += 3;
      continue;
    }

    return null;
  }

  return result;
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000 + bytes[offset + 2] * 0x100 + bytes[offset + 3];
}

function bytesMatchSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) {
    return false;
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      return false;
    }
  }
  return true;
}

function asciiFromBytes(bytes: Uint8Array, start: number, end: number): string {
  let result = '';
  for (let index = start; index < end; index += 1) {
    result += String.fromCharCode(bytes[index]);
  }
  return result;
}

function findNullByte(bytes: Uint8Array, start: number): number {
  for (let index = start; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      return index;
    }
  }
  return -1;
}

function extractTextCharaPayload(data: Uint8Array): string | null {
  const separator = findNullByte(data, 0);
  if (separator <= 0) {
    return null;
  }
  const keyword = asciiFromBytes(data, 0, separator);
  if (keyword !== 'chara') {
    return null;
  }
  return asciiFromBytes(data, separator + 1, data.length);
}

function extractInternationalTextCharaPayload(data: Uint8Array): string | null {
  let offset = findNullByte(data, 0);
  if (offset <= 0) {
    return null;
  }

  const keyword = asciiFromBytes(data, 0, offset);
  if (keyword !== 'chara') {
    return null;
  }

  offset += 1;
  const compressionFlag = data[offset];
  offset += 2;
  if (compressionFlag !== 0 || offset > data.length) {
    return null;
  }

  const languageEnd = findNullByte(data, offset);
  if (languageEnd < 0) {
    return null;
  }

  const translatedEnd = findNullByte(data, languageEnd + 1);
  if (translatedEnd < 0) {
    return null;
  }

  return asciiFromBytes(data, translatedEnd + 1, data.length);
}

function pngSourceTypeForRaw(raw: JsonRecord): SillyTavernImportSourceType | undefined {
  const spec = stringField(raw.spec);
  if (spec === 'chara_card_v3') {
    return 'sillytavern_png_v3';
  }
  if (spec === 'chara_card_v2') {
    return 'sillytavern_png_v2';
  }
  if (ROLE_CONTENT_KEYS.some((key) => hasOwn(raw, key))) {
    return 'tavern_json_v1';
  }
  return undefined;
}

function decodeCharaPayload(payload: string): SillyTavernParseResult {
  if (!payload || payload.length > MAX_CHARA_BASE64_LENGTH) {
    return invalidBase64('角色卡内嵌数据不是有效的 Base64。');
  }

  const jsonBytes = decodeBase64ToBytes(payload);
  if (!jsonBytes) {
    return invalidBase64('角色卡内嵌数据不是有效的 Base64。');
  }

  const jsonText = decodeUtf8(jsonBytes);
  if (jsonText === null) {
    return invalidJson('角色卡内嵌 JSON 不是有效的 UTF-8 文本。');
  }

  const parsed = parseJsonObject(jsonText);
  if (!parsed.ok) {
    return parsed.result;
  }

  return normalizeSillyTavernRoleCard(parsed.raw, pngSourceTypeForRaw(parsed.raw));
}

export function parseSillyTavernPngBase64(base64: string): SillyTavernParseResult {
  if (base64.length > MAX_PNG_BASE64_LENGTH) {
    return error('invalid_png', 'PNG 文件过大，无法安全解析。');
  }

  const pngBytes = decodeBase64ToBytes(base64);
  if (!pngBytes) {
    return invalidBase64('PNG 文件数据不是有效的 Base64。');
  }

  if (!bytesMatchSignature(pngBytes)) {
    return error('invalid_png', '文件不是有效的 PNG 图片。');
  }

  let offset: number = PNG_SIGNATURE.length;
  while (offset < pngBytes.length) {
    if (offset + 12 > pngBytes.length) {
      return error('invalid_png', 'PNG 数据块不完整。');
    }

    const length = readUInt32BE(pngBytes, offset);
    const chunkType = asciiFromBytes(pngBytes, offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (dataEnd < dataStart || crcEnd > pngBytes.length) {
      return error('invalid_png', 'PNG 数据块长度无效。');
    }

    const chunkData = pngBytes.slice(dataStart, dataEnd);
    const payload =
      chunkType === 'tEXt'
        ? extractTextCharaPayload(chunkData)
        : chunkType === 'iTXt'
          ? extractInternationalTextCharaPayload(chunkData)
          : null;

    if (payload !== null) {
      return decodeCharaPayload(payload);
    }

    offset = crcEnd;
    if (chunkType === 'IEND') {
      break;
    }
  }

  return error('missing_chara', 'PNG 中未找到 SillyTavern chara 角色数据。');
}
