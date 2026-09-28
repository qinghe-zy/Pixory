import type { AiRoleCardRecord } from './types';

type JsonRecord = Record<string, unknown>;

export interface SillyTavernRoleCardExportInput {
  card: Pick<
    AiRoleCardRecord,
    | 'name'
    | 'description'
    | 'prompt'
    | 'firstMessage'
    | 'alternateGreetings'
    | 'sourceJson'
    | 'tags'
  >;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DEFAULT_PIXEL_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const STRUCTURED_PROMPT_SECTION_MAP: Record<string, keyof SillyTavernCardData> = {
  '角色描述': 'description',
  '性格': 'personality',
  '场景': 'scenario',
  '系统提示': 'system_prompt',
  '历史后指令': 'post_history_instructions',
  '对话示例': 'mes_example',
  '附加设定': 'description',
};

interface SillyTavernCardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  tags: string[];
  creator: string;
  character_version: string;
  alternate_greetings: string[];
  character_book?: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function readSourceData(sourceJson: string | null | undefined): JsonRecord | null {
  if (!sourceJson?.trim()) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(sourceJson);
    if (!isRecord(parsed)) {
      return null;
    }
    const data = isRecord(parsed.data) ? parsed.data : parsed;
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

function parseStructuredPrompt(prompt: string): Partial<SillyTavernCardData> {
  const sections: Partial<SillyTavernCardData> = {};
  const matches = [...prompt.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^## |\s*$)/gm)];
  for (const match of matches) {
    const title = match[1]?.trim() ?? '';
    const content = match[2]?.trim() ?? '';
    const key = STRUCTURED_PROMPT_SECTION_MAP[title];
    if (!key || !content) {
      continue;
    }
    if (key === 'description' && sections.description) {
      sections.description = `${sections.description}\n\n${content}`;
      continue;
    }
    if (key !== 'alternate_greetings' && key !== 'tags') {
      sections[key] = content as never;
    }
  }
  return sections;
}

function hasStructuredPromptSections(sections: Partial<SillyTavernCardData>): boolean {
  return Boolean(
    sections.description ||
    sections.personality ||
    sections.scenario ||
    sections.system_prompt ||
    sections.post_history_instructions ||
    sections.mes_example
  );
}

function buildSillyTavernCardData(card: SillyTavernRoleCardExportInput['card']): SillyTavernCardData {
  const sourceData = readSourceData(card.sourceJson);
  const promptSections = parseStructuredPrompt(card.prompt);
  const hasSourceData = Boolean(sourceData);
  const hasStructuredPrompt = hasStructuredPromptSections(promptSections);
  const fallbackPrompt = !hasSourceData && !hasStructuredPrompt ? card.prompt.trim() : '';
  const firstMessage = card.firstMessage?.trim() || stringField(sourceData?.first_mes);
  const alternateGreetings = uniqueStrings([
    ...stringArray(sourceData?.alternate_greetings),
    ...card.alternateGreetings,
  ]);
  const data: SillyTavernCardData = {
    name: stringField(sourceData?.name) || card.name.trim() || '未命名角色',
    description: stringField(sourceData?.description) || promptSections.description || card.description?.trim() || fallbackPrompt || '',
    personality: stringField(sourceData?.personality) || promptSections.personality || '',
    scenario: stringField(sourceData?.scenario) || promptSections.scenario || '',
    first_mes: firstMessage,
    mes_example: stringField(sourceData?.mes_example) || promptSections.mes_example || '',
    creator_notes: stringField(sourceData?.creator_notes) || card.description?.trim() || '',
    system_prompt: stringField(sourceData?.system_prompt) || promptSections.system_prompt || fallbackPrompt,
    post_history_instructions: stringField(sourceData?.post_history_instructions) || promptSections.post_history_instructions || '',
    tags: uniqueStrings([...stringArray(sourceData?.tags), ...card.tags]),
    creator: stringField(sourceData?.creator),
    character_version: stringField(sourceData?.character_version) || stringField(sourceData?.version),
    alternate_greetings: alternateGreetings,
  };
  if (sourceData && Object.prototype.hasOwnProperty.call(sourceData, 'character_book')) {
    data.character_book = sourceData.character_book;
  }
  return data;
}

export function buildSillyTavernRoleCardJson(input: SillyTavernRoleCardExportInput): JsonRecord {
  const data = buildSillyTavernCardData(input.card);
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data,
    name: data.name,
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    first_mes: data.first_mes,
    mes_example: data.mes_example,
    creatorcomment: data.creator_notes,
    avatar: 'none',
    chat: `${data.name} - exported`,
    talkativeness: 0.5,
    fav: false,
    tags: data.tags,
  };
}

function utf8Bytes(value: string): number[] {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    const char = encoded[index];
    if (char === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return bytes;
}

function bytesToBase64(bytes: ArrayLike<number>): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b1 = bytes[index] ?? 0;
    const b2 = bytes[index + 1] ?? 0;
    const b3 = bytes[index + 2] ?? 0;
    const triple = (b1 << 16) | (b2 << 8) | b3;
    result += BASE64_ALPHABET[(triple >> 18) & 63];
    result += BASE64_ALPHABET[(triple >> 12) & 63];
    result += index + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : '=';
    result += index + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : '=';
  }
  return result;
}

function base64Value(char: string): number {
  return BASE64_ALPHABET.indexOf(char);
}

function base64ToBytes(base64: string): number[] {
  const normalized = base64.replace(/\s/g, '');
  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const c1 = normalized[index];
    const c2 = normalized[index + 1];
    const c3 = normalized[index + 2] ?? '=';
    const c4 = normalized[index + 3] ?? '=';
    const v1 = base64Value(c1);
    const v2 = base64Value(c2);
    const v3 = c3 === '=' ? 0 : base64Value(c3);
    const v4 = c4 === '=' ? 0 : base64Value(c4);
    const triple = (v1 << 18) | (v2 << 12) | (v3 << 6) | v4;
    bytes.push((triple >> 16) & 255);
    if (c3 !== '=') {
      bytes.push((triple >> 8) & 255);
    }
    if (c4 !== '=') {
      bytes.push(triple & 255);
    }
  }
  return bytes;
}

function writeUInt32BE(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function asciiBytes(value: string): number[] {
  return value.split('').map((char) => char.charCodeAt(0) & 255);
}

function crc32(bytes: number[]): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: number[]): number[] {
  const typeBytes = asciiBytes(type);
  return [
    ...writeUInt32BE(data.length),
    ...typeBytes,
    ...data,
    ...writeUInt32BE(crc32([...typeBytes, ...data])),
  ];
}

export function buildSillyTavernRoleCardPngBase64(input: SillyTavernRoleCardExportInput & { basePngBase64?: string | null }): string {
  const json = JSON.stringify(buildSillyTavernRoleCardJson(input));
  const charaBase64 = bytesToBase64(utf8Bytes(json));
  const textChunk = pngChunk('tEXt', [...asciiBytes('chara'), 0, ...asciiBytes(charaBase64)]);
  let baseBytes = base64ToBytes(input.basePngBase64 || DEFAULT_PIXEL_BASE64);
  let iendOffset = findIendOffset(baseBytes);
  if (iendOffset <= 0) {
    baseBytes = base64ToBytes(DEFAULT_PIXEL_BASE64);
    iendOffset = findIendOffset(baseBytes);
  }
  const outputBytes = [...baseBytes.slice(0, iendOffset), ...textChunk, ...baseBytes.slice(iendOffset)];
  return bytesToBase64(outputBytes);
}

function findIendOffset(bytes: number[]): number {
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000 + bytes[offset + 2] * 0x100 + bytes[offset + 3];
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === 'IEND') {
      return offset;
    }
    offset += 12 + length;
  }
  return -1;
}
