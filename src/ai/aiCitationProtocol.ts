import { sha256 } from '@noble/hashes/sha2.js';

import type { AiCitationSourceType } from './types';

export interface CitationRegistryEntry {
  refId: string;
  sourceType: AiCitationSourceType;
  sourceId: string;
  chunkId: string;
  label: string;
  excerpt: string;
  locator: Record<string, unknown>;
  sourceExcerptHash: string;
  documentVersion: string | null;
}

export interface ParsedCitationMarker {
  refId: string;
  markerAt: number;
  claimStart: number;
  claimEnd: number;
}

const MARKER_PREFIX = '[[cite:';

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function hashCitationExcerpt(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value.normalize('NFKC').replace(/\s+/g, ' ').trim())));
}

function longestMarkerPrefixSuffix(value: string): number {
  const max = Math.min(value.length, MARKER_PREFIX.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (value.endsWith(MARKER_PREFIX.slice(0, length))) return length;
  }
  return 0;
}

function claimRange(text: string, end: number): { claimStart: number; claimEnd: number } {
  const prefix = text.slice(0, end);
  const boundary = Math.max(
    prefix.lastIndexOf('。'), prefix.lastIndexOf('！'), prefix.lastIndexOf('？'),
    prefix.lastIndexOf('. '), prefix.lastIndexOf('! '), prefix.lastIndexOf('? '),
    prefix.lastIndexOf('\n'),
  );
  let start = boundary < 0 ? 0 : boundary + 1;
  while (start < end && /\s/u.test(text[start] ?? '')) start += 1;
  let claimEnd = end;
  while (claimEnd > start && /\s/u.test(text[claimEnd - 1] ?? '')) claimEnd -= 1;
  return { claimEnd, claimStart: start };
}

export class CitationMarkerStreamParser {
  private buffer = '';
  private visibleText: string;
  private readonly markers: ParsedCitationMarker[] = [];

  constructor(initialVisibleText = '') {
    this.visibleText = initialVisibleText;
  }

  push(delta: string): string {
    this.buffer += delta;
    let emitted = '';
    while (this.buffer) {
      const markerStart = this.buffer.indexOf(MARKER_PREFIX);
      if (markerStart < 0) {
        const heldLength = longestMarkerPrefixSuffix(this.buffer);
        const safe = heldLength > 0 ? this.buffer.slice(0, -heldLength) : this.buffer;
        emitted += safe;
        this.visibleText += safe;
        this.buffer = heldLength > 0 ? this.buffer.slice(-heldLength) : '';
        break;
      }
      if (markerStart > 0) {
        const safe = this.buffer.slice(0, markerStart);
        emitted += safe;
        this.visibleText += safe;
        this.buffer = this.buffer.slice(markerStart);
      }
      const markerEnd = this.buffer.indexOf(']]', MARKER_PREFIX.length);
      if (markerEnd < 0) break;
      const refId = this.buffer.slice(MARKER_PREFIX.length, markerEnd).trim();
      const at = this.visibleText.length;
      if (/^S[1-9]\d*$/u.test(refId)) {
        this.markers.push({ markerAt: at, refId, ...claimRange(this.visibleText, at) });
      }
      this.buffer = this.buffer.slice(markerEnd + 2);
    }
    return emitted;
  }

  finish(): { visibleTail: string; markers: ParsedCitationMarker[]; text: string } {
    let visibleTail = '';
    if (this.buffer && !this.buffer.startsWith(MARKER_PREFIX)) {
      const heldLength = longestMarkerPrefixSuffix(this.buffer);
      visibleTail = heldLength > 0 ? this.buffer.slice(0, -heldLength) : this.buffer;
      this.visibleText += visibleTail;
    }
    this.buffer = '';
    return { markers: [...this.markers], text: this.visibleText, visibleTail };
  }
}

function lexicalUnits(value: string): Set<string> {
  const normalized = value.normalize('NFKC').toLowerCase();
  const units = new Set(normalized.match(/[a-z0-9]{3,}|[\p{Script=Han}]{2}/gu) ?? []);
  const han = [...normalized.replace(/[^\p{Script=Han}]/gu, '')];
  for (let index = 0; index < han.length - 1; index += 1) units.add(`${han[index]}${han[index + 1]}`);
  return units;
}

export function hasCitationLexicalSupport(claim: string, excerpt: string): boolean {
  const claimUnits = lexicalUnits(claim);
  const excerptUnits = lexicalUnits(excerpt);
  if (claimUnits.size === 0 || excerptUnits.size === 0) return false;
  let overlap = 0;
  for (const unit of claimUnits) if (excerptUnits.has(unit)) overlap += 1;
  return overlap >= Math.min(2, claimUnits.size) || overlap / claimUnits.size >= 0.2;
}

export function buildCitationRegistry<T extends {
  chunkId: string;
  sourceType?: AiCitationSourceType;
  sourceId?: string;
  label: string;
  text: string;
  locator: Record<string, unknown>;
  documentVersion?: string | null;
}>(snippets: T[]): Array<T & CitationRegistryEntry> {
  return snippets.map((snippet, index) => ({
    ...snippet,
    chunkId: snippet.chunkId,
    documentVersion: snippet.documentVersion ?? null,
    excerpt: snippet.text,
    label: snippet.label,
    locator: snippet.locator,
    refId: `S${index + 1}`,
    sourceExcerptHash: hashCitationExcerpt(snippet.text),
    sourceId: snippet.sourceId ?? snippet.chunkId,
    sourceType: snippet.sourceType ?? 'document_chunk',
  }));
}

export function citationRegistryPrompt(entries: CitationRegistryEntry[]): string {
  if (!entries.length) return '';
  return [
    '引用规则：每个资料片段有稳定引用 ID。只有回答中的某个句子确实依据该片段时，才在该句末尾紧跟隐藏标记 [[cite:S1]]；未使用的片段不要标记；不要输出不存在的 ID。',
    ...entries.map((entry) => `[${entry.refId}] ${entry.label}\n${entry.excerpt}`),
  ].join('\n\n');
}
