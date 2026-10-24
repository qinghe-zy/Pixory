import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import React, { useCallback, useLayoutEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Image, LayoutAnimation, Linking, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';

import type { PixorySpace } from '../../database';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { useAiHistoryLongMessageFoldingPreference, useChatTypographyPreferences } from '../../services/aiChatPreferences';
import { detectStandaloneArtifactCandidate, isExecutableSandboxCode } from '../../services/sandbox/sandboxDetector';
import { parseStreamingArtifactSegments } from '../../services/sandbox/streamingArtifactSplitter';
import { aiLightColors, aiLightDisplayFont } from './aiLightTheme';
import { AiInlineFeedback } from './AiInlineFeedback';
import { AiMathBlock } from './AiMathBlock';
import { AiSpoilerText } from './AiSpoilerText';
import { AiLinkPreviewCard } from './AiLinkPreviewCard';
import { AiSandboxArtifactCard } from './AiSandboxArtifactCard';
import { AiSandboxArtifactViewfinder } from './AiSandboxArtifactViewfinder';

type MarkdownTableAlignment = 'left' | 'center' | 'right' | null;
type ReferenceLinks = Map<string, { title?: string; url: string }>;
type Footnotes = Map<string, { index: number; text: string }>;

type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string; level: number }
  | { type: 'list'; items: Array<{ marker: string; text: string; checked?: boolean; nestLevel: number }> }
  | { type: 'definitionList'; items: Array<{ term: string; definitions: string[] }> }
  | { type: 'footnote'; index: number; label: string; text: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string; language?: string }
  | { type: 'table'; rows: string[][]; alignments: MarkdownTableAlignment[] }
  | { type: 'image'; alt: string; uri: string }
  | { type: 'hr' }
  | { type: 'math'; math: string }
  | { type: 'linkCard'; url: string };

interface ParsedMarkdownContent {
  blocks: MarkdownBlock[];
  footnotes: Footnotes;
  referenceLinks: ReferenceLinks;
}

export interface AiMessageContentProps {
  content: string;
  trailingInline?: ReactNode;
  streaming?: boolean;
  variant?: 'assistant' | 'user';
  isLatestMessage?: boolean;
  isDeepHistory?: boolean;
  disableFolding?: boolean;
  defaultExpanded?: boolean;
  space?: PixorySpace;
  isSandboxModalOpen?: boolean;
  messageId?: string;
  onAnchorShift?: (offsetDelta: number) => void;
  onOpenSandbox?: (params: {
    code: string;
    language?: string;
    title?: string;
    initialTab?: 'preview' | 'code';
    messageId?: string;
  }) => void;
  onRequestTweak?: (params: { code: string; language?: string; title?: string }) => void;
}

function isFence(line: string): boolean {
  return line.trim().startsWith('```');
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+\S/.test(line.trim());
}

function isListLine(line: string): boolean {
  return /^(\s*)([-*]|\d+\.)\s+\S/.test(line);
}

function isQuoteLine(line: string): boolean {
  return line.trim().startsWith('>');
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes('|') && trimmed.split('|').filter((cell) => cell.trim()).length >= 2;
}

function isHorizontalRule(line: string): boolean {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function isDefinitionLine(line: string): boolean {
  return /^\s{0,3}:\s+\S/.test(line);
}

function isMathBlockStart(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed === '$$' ||
    trimmed === '\\[' ||
    /^\$\$(.+?)\$\$$/.test(trimmed) ||
    /^\\\[([\s\S]+?)\\\]$/.test(trimmed) ||
    trimmed.startsWith('$$') ||
    trimmed.startsWith('\\[')
  );
}

const OPTIONAL_MARKDOWN_TITLE_PATTERN = String.raw`(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;
const IMAGE_MARKDOWN_LINE_PATTERN = new RegExp(String.raw`^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|file:\/\/[^\s)]+|content:\/\/[^\s)]+)${OPTIONAL_MARKDOWN_TITLE_PATTERN}\)\s*$`);
const IMAGE_MARKDOWN_TOKEN_PATTERN = new RegExp(String.raw`!\[([^\]]*)\]\((https?:\/\/[^\s)]+|file:\/\/[^\s)]+|content:\/\/[^\s)]+)${OPTIONAL_MARKDOWN_TITLE_PATTERN}\)`, 'g');
const DIRECT_LINK_TOKEN_PATTERN = new RegExp(String.raw`^\[([^\]]+)\]\((https?:\/\/[^\s)]+)${OPTIONAL_MARKDOWN_TITLE_PATTERN}\)$`);
const REFERENCE_LINK_DEFINITION_PATTERN = /^\s{0,3}\[([^\]]+)\]:\s*<?(https?:\/\/[^>\s]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/;
const REFERENCE_LINK_TOKEN_PATTERN = /^\[([^\]]+)\]\[([^\]]*)\]$/;
const FOOTNOTE_DEFINITION_PATTERN = /^\s{0,3}\[\^([^\]]+)\]:\s+(.+)$/;
const FOOTNOTE_TOKEN_PATTERN = /^\[\^([^\]]+)\]$/;
const AUTO_LINK_TOKEN_PATTERN = /^<(https?:\/\/[^>\s]+)>$/i;
const EMAIL_AUTO_LINK_TOKEN_PATTERN = /^<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>$/i;
const HTML_INLINE_TOKEN_PATTERN = /^<(span|font|kbd|sup|sub)[^>]*>([\s\S]*?)<\/\1>$/i;
const HTML_BREAK_TOKEN_PATTERN = /^<br\s*\/?>$/i;
const ESCAPED_MARKDOWN_TOKEN_PATTERN = /^\\([\\`*_[\]{}()#+\-.!|<>~])$/;
const INLINE_TOKEN_PATTERN = /(<(?:span|font|kbd|sup|sub)[^>]*>[\s\S]*?<\/(?:span|font|kbd|sup|sub)>|<br\s*\/?>|\\\([^\n]+?\\\)|\\[\\`*_[\]{}()#+\-.!|<>~]|\[\^[^\]]+\]|\[[^\]]+\]\(https?:\/\/[^\s)]+(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)|\[[^\]]+\]\[[^\]]*\]|<https?:\/\/[^>\s]+>|<[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}>|`[^`]+`|\$[^$]+\$|\|\|[^|]+\|\||==[^=]+==|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_)/gi;
const HAS_ANY_MARKDOWN_TRIGGER = /[*_~`|=<>$#\[\\\]]|^\s*[-+]\s|^\s*\d+\.\s|^\s*>/m;
const SAFE_INLINE_COLOR_PATTERN = /^(#[0-9A-F]{3}(?:[0-9A-F]{3})?|rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|[a-z]+)$/i;
const UNSAFE_COLOR_VALUE_PATTERN = /url|var|expression|calc|attr|;/i;
const RICH_HTML_BLOCK_TAG_PATTERN = /<\/?(address|article|aside|blockquote|canvas|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|output|p|pre|section|style|summary|table|tbody|td|tfoot|th|thead|tr|ul)\b[\s\S]*?>/i;
const RICH_HTML_INLINE_STYLE_PATTERN = /<(span|font|em|strong|b|i|u|s|mark|small)\b[^>]*(style|face|size)=/i;
const RICH_HTML_LEGACY_FONT_PATTERN = /<font\b[^>]*(face|size)=/i;
const RICH_HTML_STYLE_FEATURE_PATTERN = /\b(font-size|font-family|font-style|text-decoration|text-shadow|opacity|border|border-radius|padding|margin|letter-spacing|text-transform|display|white-space)\s*:|(?:linear-gradient|radial-gradient|repeating-linear-gradient)\s*\(/i;
const RICH_HTML_CODE_LANGUAGE_PATTERN = /^(html?|xhtml)$/i;
const RICH_HTML_CODE_START_PATTERN = /^\s*(?:<!doctype\s+html\b|<html\b|<body\b|<(?:div|section|article|main|table|style)\b)/i;
const RICH_HTML_WHOLE_CONTENT_PATTERN = /^\s*(?:<!doctype\s+html\b|<html\b|<body\b|<(?:address|article|aside|blockquote|div|main|section|style|table)\b)/i;
const MESSAGE_RENDER_CACHE_MAX_CONTENT_LENGTH = 30000;
const MARKDOWN_PARSE_CACHE_LIMIT = 300;
const RICH_HTML_HEIGHT_CACHE_LIMIT = 120;
const RICH_HTML_MIN_HEIGHT = 28;
const RICH_HTML_INITIAL_HEIGHT = 80;
const RICH_HTML_HEIGHT_UPDATE_EPSILON = 1;

const markdownParseCache = new Map<string, ParsedMarkdownContent>();
const richHtmlHeightCache = new Map<string, number>();

function trimMapToLimit<TKey, TValue>(map: Map<TKey, TValue>, limit: number) {
  while (map.size > limit) {
    const oldestEntry = map.keys().next();
    if (oldestEntry.done) {
      return;
    }
    map.delete(oldestEntry.value);
  }
}

function formatInlineMath(math: string): string {
  return math
    .replace(/\\left|\\right/g, '')
    .replace(/([a-zA-Z0-9])\\(log|ln|sin|cos|tan|min|max|det|exp)\b/g, '$1 $2')
    .replace(/\\(log|ln|sin|cos|tan|min|max|det|exp)\b/g, '$1')
    .replace(/\\le(q)?\b/g, '≤')
    .replace(/\\ge(q)?\b/g, '≥')
    .replace(/\\ne(q)?\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\pm\b/g, '±')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\delta\b/g, 'δ')
    .replace(/\\hbar\b/g, 'ℏ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\lambda\b/g, 'λ')
    .replace(/\\omega\b/g, 'ω')
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³')
    .replace(/\^n\b/g, 'ⁿ')
    .replace(/\\([,;! ]|\s)/g, ' ')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\mathit\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .trim();
}

function shouldCacheMessageRenderContent(content: string): boolean {
  return content.length <= MESSAGE_RENDER_CACHE_MAX_CONTENT_LENGTH;
}

function getMessageRenderCacheKey(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash = Math.imul(hash ^ content.charCodeAt(index), 16777619);
  }
  return `${content.length}:${(hash >>> 0).toString(36)}`;
}

function isImageMarkdownLine(line: string): boolean {
  return IMAGE_MARKDOWN_LINE_PATTERN.test(line.trim());
}

function parseImageMarkdown(line: string): { alt: string; uri: string } | null {
  const match = IMAGE_MARKDOWN_LINE_PATTERN.exec(line.trim());
  return match ? { alt: match[1].trim(), uri: match[2] } : null;
}

function appendParagraphBlocksWithImages(blocks: MarkdownBlock[], text: string) {
  IMAGE_MARKDOWN_TOKEN_PATTERN.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = IMAGE_MARKDOWN_TOKEN_PATTERN.exec(text)) !== null) {
    const precedingText = text.slice(cursor, match.index);
    if (precedingText.trim()) {
      blocks.push({ type: 'paragraph', text: precedingText });
    }
    blocks.push({ type: 'image', alt: match[1].trim(), uri: match[2] });
    cursor = match.index + match[0].length;
  }
  const trailingText = text.slice(cursor);
  if (cursor === 0 || trailingText.trim()) {
    blocks.push({ type: 'paragraph', text: trailingText });
  }
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.map((cell) => cell.trim());
}

function parseTableAlignments(line: string): MarkdownTableAlignment[] {
  return parseTableRow(line).map((cell) => {
    const trimmed = cell.trim();
    const starts = trimmed.startsWith(':');
    const ends = trimmed.endsWith(':');
    if (starts && ends) {
      return 'center';
    }
    if (ends) {
      return 'right';
    }
    if (starts) {
      return 'left';
    }
    return null;
  });
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeFootnoteLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseReferenceDefinition(line: string): { label: string; title?: string; url: string } | null {
  const match = REFERENCE_LINK_DEFINITION_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  return {
    label: normalizeReferenceLabel(match[1]),
    url: match[2],
  };
}

function collectReferenceLinks(lines: string[]): ReferenceLinks {
  const referenceLinks: ReferenceLinks = new Map();
  for (const line of lines) {
    const definition = parseReferenceDefinition(line);
    if (definition) {
      referenceLinks.set(definition.label, { title: definition.title, url: definition.url });
    }
  }
  return referenceLinks;
}

function parseFootnoteDefinition(line: string): { label: string; text: string } | null {
  const match = FOOTNOTE_DEFINITION_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  return {
    label: normalizeFootnoteLabel(match[1]),
    text: match[2].trim(),
  };
}

function collectFootnotes(lines: string[]): Footnotes {
  const footnotes: Footnotes = new Map();
  for (const line of lines) {
    const definition = parseFootnoteDefinition(line);
    if (definition && !footnotes.has(definition.label)) {
      footnotes.set(definition.label, {
        index: footnotes.size + 1,
        text: definition.text,
      });
    }
  }
  return footnotes;
}

function parseMarkdownContent(content: string): ParsedMarkdownContent {
  if (!HAS_ANY_MARKDOWN_TRIGGER.test(content)) {
    const normalized = content.replace(/\r\n/g, '\n').trim();
    const paragraphs = normalized.split(/\n{2,}/);
    const blocks: MarkdownBlock[] = paragraphs
      .map((p) => p.trim())
      .filter(Boolean)
      .map((text) => ({ type: 'paragraph', text }));
    return {
      blocks: blocks.length ? blocks : [{ type: 'paragraph', text: content }],
      footnotes: new Map(),
      referenceLinks: new Map(),
    };
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const referenceLinks = collectReferenceLinks(lines);
  const footnotes = collectFootnotes(lines);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (parseReferenceDefinition(line)) {
      index += 1;
      continue;
    }

    const footnote = parseFootnoteDefinition(line);
    if (footnote) {
      blocks.push({
        index: footnotes.get(footnote.label)?.index ?? footnotes.size + 1,
        label: footnote.label,
        text: footnote.text,
        type: 'footnote',
      });
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const language = trimmed.replace(/^```/, '').trim() || undefined;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !isFence(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: 'code', text: codeLines.join('\n'), language });
      continue;
    }

    if (trimmed === '$$' || /^\$\$(.+?)\$\$$/.test(trimmed) || trimmed.startsWith('$$')) {
      const mathMatch = /^\$\$(.+?)\$\$$/.exec(trimmed);
      if (mathMatch && mathMatch[1]) {
        blocks.push({ type: 'math', math: mathMatch[1].trim() });
        index += 1;
        continue;
      } else {
        const mathLines: string[] = [];
        const firstLine = trimmed.slice(2).trim();
        if (firstLine) {
          mathLines.push(firstLine);
        }
        index += 1;
        while (index < lines.length) {
          const nextTrimmed = (lines[index] ?? '').trim();
          if (nextTrimmed === '$$') {
            index += 1;
            break;
          }
          if (nextTrimmed.endsWith('$$') && nextTrimmed.length > 2) {
            mathLines.push((lines[index] ?? '').slice(0, (lines[index] ?? '').lastIndexOf('$$')).trim());
            index += 1;
            break;
          }
          mathLines.push(lines[index] ?? '');
          index += 1;
        }
        blocks.push({ type: 'math', math: mathLines.join('\n').trim() });
        continue;
      }
    }

    if (trimmed === '\\[' || /^\\\[([\s\S]+?)\\\]$/.test(trimmed) || trimmed.startsWith('\\[')) {
      const mathMatch = /^\\\[([\s\S]+?)\\\]$/.exec(trimmed);
      if (mathMatch && mathMatch[1]) {
        blocks.push({ type: 'math', math: mathMatch[1].trim() });
        index += 1;
        continue;
      } else {
        const mathLines: string[] = [];
        const firstLine = trimmed.slice(2).trim();
        if (firstLine) {
          mathLines.push(firstLine);
        }
        index += 1;
        while (index < lines.length) {
          const nextTrimmed = (lines[index] ?? '').trim();
          if (nextTrimmed === '\\]') {
            index += 1;
            break;
          }
          if (nextTrimmed.endsWith('\\]') && nextTrimmed.length > 2) {
            mathLines.push((lines[index] ?? '').slice(0, (lines[index] ?? '').lastIndexOf('\\]')).trim());
            index += 1;
            break;
          }
          mathLines.push(lines[index] ?? '');
          index += 1;
        }
        blocks.push({ type: 'math', math: mathLines.join('\n').trim() });
        continue;
      }
    }

    if (isHeading(line)) {
      const match = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      blocks.push({ type: 'heading', level: match?.[1].length ?? 1, text: match?.[2] ?? trimmed });
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (isImageMarkdownLine(line)) {
      const image = parseImageMarkdown(line);
      if (image) {
        blocks.push({ type: 'image', alt: image.alt, uri: image.uri });
        index += 1;
        continue;
      }
    }

    if (isListLine(line)) {
      const items: Array<{ marker: string; text: string; checked?: boolean; nestLevel: number }> = [];
      while (index < lines.length && isListLine(lines[index] ?? '')) {
        const item = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[index] ?? '');
        if (item) {
          const task = /^\[(x|X| )\]\s+(.*)$/.exec(item[3]);
          const indent = item[1].length;
          items.push({
            checked: task ? task[1].toLowerCase() === 'x' : undefined,
            marker: task ? (task[1].toLowerCase() === 'x' ? '☑' : '☐') : item[2].match(/\d+\./) ? item[2] : '•',
            nestLevel: Math.min(3, Math.floor(indent / 2)),
            text: task?.[2] ?? item[3],
          });
        }
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    if (isQuoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isQuoteLine(lines[index] ?? '')) {
        quoteLines.push((lines[index] ?? '').trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n') });
      continue;
    }

    if (isDefinitionLine(lines[index + 1] ?? '')) {
      const items: Array<{ term: string; definitions: string[] }> = [];
      while (index < lines.length && lines[index]?.trim() && isDefinitionLine(lines[index + 1] ?? '')) {
        const term = lines[index]?.trim() ?? '';
        index += 1;
        const definitions: string[] = [];
        while (index < lines.length && isDefinitionLine(lines[index] ?? '')) {
          definitions.push((lines[index] ?? '').replace(/^\s{0,3}:\s+/, '').trim());
          index += 1;
        }
        items.push({ definitions, term });
      }
      blocks.push({ type: 'definitionList', items });
      continue;
    }

    if (isTableLine(line) && isTableSeparator(lines[index + 1] ?? '')) {
      const rows: string[][] = [parseTableRow(line)];
      const separatorLine = lines[index + 1] ?? '';
      index += 2;
      while (index < lines.length && isTableLine(lines[index] ?? '')) {
        rows.push(parseTableRow(lines[index] ?? ''));
        index += 1;
      }
      blocks.push({ alignments: parseTableAlignments(separatorLine), rows, type: 'table' });
      continue;
    }

    if (isRenderableHttpUrl(trimmed) && trimmed === line.trim() && !trimmed.includes(' ')) {
      blocks.push({ type: 'linkCard', url: trimmed });
      index += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index] ?? '';
      if (!nextLine.trim() || parseReferenceDefinition(nextLine) || parseFootnoteDefinition(nextLine) || isFence(nextLine) || isHeading(nextLine) || isHorizontalRule(nextLine) || isImageMarkdownLine(nextLine) || isListLine(nextLine) || isQuoteLine(nextLine) || isDefinitionLine(lines[index + 1] ?? '') || (isTableLine(nextLine) && isTableSeparator(lines[index + 1] ?? '')) || isMathBlockStart(nextLine)) {
        break;
      }
      paragraphLines.push(nextLine);
      index += 1;
    }
    appendParagraphBlocksWithImages(blocks, paragraphLines.join('\n'));
  }

  return { blocks: blocks.length ? blocks : [{ type: 'paragraph', text: content }], footnotes, referenceLinks };
}

function getCachedMarkdownContent(content: string): ParsedMarkdownContent {
  if (!shouldCacheMessageRenderContent(content)) {
    return parseMarkdownContent(content);
  }
  const cached = markdownParseCache.get(content);
  if (cached) {
    markdownParseCache.delete(content);
    markdownParseCache.set(content, cached);
    return cached;
  }
  const parsed = parseMarkdownContent(content);
  markdownParseCache.set(content, parsed);
  trimMapToLimit(markdownParseCache, MARKDOWN_PARSE_CACHE_LIMIT);
  return parsed;
}

export function prewarmMarkdownContent(content: string): void {
  if (!shouldCacheMessageRenderContent(content) || !content.trim()) {
    return;
  }
  if (markdownParseCache.has(content)) {
    return;
  }
  setTimeout(() => {
    try {
      getCachedMarkdownContent(content);
    } catch {
      // Safe background prewarm error absorption
    }
  }, 0);
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  return getCachedMarkdownContent(content).blocks;
}

function isSafeLinkUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(url);
}

function isRenderableHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function stripInlineHtmlText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function sanitizeInlineColor(part: string): string | undefined {
  const colorMatch = part.match(/color:\s*([^"';]+)|color=(?:"|')([^"']+)/i);
  const rawColor = colorMatch ? (colorMatch[1] || colorMatch[2])?.trim() : undefined;
  if (!rawColor || rawColor.length > 40 || UNSAFE_COLOR_VALUE_PATTERN.test(rawColor)) {
    return undefined;
  }
  return SAFE_INLINE_COLOR_PATTERN.test(rawColor) ? rawColor : undefined;
}

function sanitizeInlineFontWeight(part: string): TextStyle['fontWeight'] | undefined {
  const weightMatch = part.match(/font-weight:\s*(bold|700|600)/i);
  return weightMatch ? (weightMatch[1].toLowerCase() === 'bold' ? '700' : weightMatch[1] as TextStyle['fontWeight']) : undefined;
}

function shouldRenderRichHtml(html: string): boolean {
  return RICH_HTML_BLOCK_TAG_PATTERN.test(html) || RICH_HTML_LEGACY_FONT_PATTERN.test(html) || (RICH_HTML_INLINE_STYLE_PATTERN.test(html) && RICH_HTML_STYLE_FEATURE_PATTERN.test(html));
}

function shouldRenderWholeRichHtml(html: string): boolean {
  return RICH_HTML_WHOLE_CONTENT_PATTERN.test(html) && shouldRenderRichHtml(html);
}

function shouldRenderHtmlCodeBlock(block: Extract<MarkdownBlock, { type: 'code' }>): boolean {
  if (isExecutableSandboxCode(block.text, block.language)) {
    return false;
  }
  const language = block.language?.trim() ?? '';
  if (RICH_HTML_CODE_LANGUAGE_PATTERN.test(language)) {
    return shouldRenderRichHtml(block.text);
  }
  return !language && RICH_HTML_CODE_START_PATTERN.test(block.text) && shouldRenderRichHtml(block.text);
}

function sanitizeRichHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[\s\S]*?>/gi, '')
    .replace(/<link\b[\s\S]*?>/gi, '')
    .replace(/@import\s+(?:url\([^\)]*\)|"[^"]*"|'[^']*'|[^;]+);?/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]+)/gi, '')
    .replace(/\s+(src|srcset|poster)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/url\([^\)]*\)/gi, 'none');
}

function buildRichHtmlDocument(html: string): string {
  const safeHtml = sanitizeRichHtml(html);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
html,body{margin:0;padding:0;background:transparent;color:${aiLightColors.ink};font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.55;overflow:visible;word-break:break-word;overflow-wrap:anywhere}
#pixory-rich-html-root{padding-bottom:4px} *{box-sizing:border-box;max-width:100%}
div,section,article,header,footer,main,p,blockquote,pre,ul,ol,li,table,thead,tbody,tr,th,td{max-width:100%}
p{margin:0 0 0.65em}
table{border-collapse:collapse;display:table;width:100%}
th,td{overflow-wrap:anywhere;word-break:break-word}
pre{white-space:pre-wrap;overflow-wrap:anywhere}
code,kbd{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
a{color:${aiLightColors.primaryActive};text-decoration:none}
img,video{height:auto;max-width:100%}
</style>
</head>
<body>
<div id="pixory-rich-html-root">${safeHtml}</div>
<script>
(function(){
  var root = document.getElementById('pixory-rich-html-root');
  function postHeight(){
    if(!root || !window.ReactNativeWebView){ return; }
    var rect = root.getBoundingClientRect();
    var height = Math.ceil(Math.max(rect.height, root.scrollHeight));
    window.ReactNativeWebView.postMessage(String(height));
  }
  postHeight();
  setTimeout(postHeight, 50);
  setTimeout(postHeight, 180);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(postHeight).observe(root);
  }
  window.addEventListener('load', postHeight);
})();
</script>
</body>
</html>`;
}

function getCachedRichHtmlHeight(html: string): number {
  if (!shouldCacheMessageRenderContent(html)) {
    return RICH_HTML_INITIAL_HEIGHT;
  }
  const cacheKey = getMessageRenderCacheKey(html);
  const cached = richHtmlHeightCache.get(cacheKey);
  if (cached && Number.isFinite(cached) && cached > 0) {
    richHtmlHeightCache.delete(cacheKey);
    richHtmlHeightCache.set(cacheKey, cached);
    return cached;
  }
  return RICH_HTML_INITIAL_HEIGHT;
}

function setCachedRichHtmlHeight(html: string, height: number) {
  if (!shouldCacheMessageRenderContent(html)) {
    return;
  }
  if (!Number.isFinite(height) || height <= 0) {
    return;
  }
  const cacheKey = getMessageRenderCacheKey(html);
  richHtmlHeightCache.set(cacheKey, Math.max(RICH_HTML_MIN_HEIGHT, Math.ceil(height)));
  trimMapToLimit(richHtmlHeightCache, RICH_HTML_HEIGHT_CACHE_LIMIT);
}

function AiRichHtmlBlock({
  html,
  onOpenSandbox,
}: {
  html: string;
  onOpenSandbox?: (params: { code: string; language?: string; title?: string }) => void;
}) {
  const [height, setHeight] = useState(() => getCachedRichHtmlHeight(html));
  const richHtmlDocument = useMemo(() => buildRichHtmlDocument(html), [html]);
  const canRunSandbox = useMemo(() => {
    if (!onOpenSandbox) return false;
    // 只有自包含可执行沙箱结构或完整复合卡片/表格才展示沙箱运行按钮，避免普通彩色字句误弹
    return (
      isExecutableSandboxCode(html) ||
      /<(table|canvas|svg)\b/i.test(html) ||
      /<!doctype\s+html|<html\b|<body\b/i.test(html)
    );
  }, [html, onOpenSandbox]);

  useEffect(() => {
    setHeight(getCachedRichHtmlHeight(html));
  }, [html]);

  return (
    <View style={[styles.richHtmlBlock, { height: Math.max(RICH_HTML_MIN_HEIGHT, height) }]}>
      <WebView
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        bounces={false}
        domStorageEnabled={false}
        javaScriptCanOpenWindowsAutomatically={false}
        javaScriptEnabled
        mixedContentMode="never"
        onMessage={(event) => {
          const nextHeight = Number(event.nativeEvent.data);
          if (Number.isFinite(nextHeight) && nextHeight > 0) {
            const measuredHeight = Math.max(RICH_HTML_MIN_HEIGHT, Math.ceil(nextHeight));
            setCachedRichHtmlHeight(html, measuredHeight);
            setHeight((currentHeight) => {
              if (Math.abs(currentHeight - measuredHeight) <= RICH_HTML_HEIGHT_UPDATE_EPSILON) {
                return currentHeight;
              }
              return measuredHeight;
            });
          }
        }}
        onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
        originWhitelist={['about:blank']}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        source={{ html: richHtmlDocument, baseUrl: 'about:blank' }}
        style={styles.richHtmlWebView}
      />
      {canRunSandbox ? (
        <Pressable
          accessibilityLabel="在沙箱中运行"
          accessibilityRole="button"
          hitSlop={spacing[2]}
          onPress={() => onOpenSandbox?.({ code: html, language: 'html' })}
          style={({ pressed }) => [styles.richHtmlRunButton, pressed && styles.pressed]}
        >
          <Ionicons color="#059669" name="play-outline" size={12} />
          <Text style={styles.richHtmlRunText}>运行</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const HAS_INLINE_MARKDOWN_TRIGGER = /[*_~`|=<>$\[\\]/;

function renderInlineText(text: string, style: StyleProp<TextStyle>, onLinkPress: (url: string) => void, referenceLinks: ReferenceLinks, footnotes: Footnotes): ReactNode {
  if (!HAS_INLINE_MARKDOWN_TRIGGER.test(text)) {
    return text;
  }
  INLINE_TOKEN_PATTERN.lastIndex = 0;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  function renderPlain(part: string, _key: string): ReactNode {
    return part;
  }

  function renderSafeInlineHtmlToken(part: string, key: string): ReactNode | null {
    const htmlBreak = part.match(HTML_BREAK_TOKEN_PATTERN);
    if (htmlBreak) {
      return <Text key={key} style={style}>{'\n'}</Text>;
    }

    const htmlInline = part.match(HTML_INLINE_TOKEN_PATTERN);
    if (!htmlInline) {
      return null;
    }

    const tagName = htmlInline[1].toLowerCase();
    const innerText = stripInlineHtmlText(htmlInline[2]);

    if (tagName === 'span' || tagName === 'font') {
      const safeColor = sanitizeInlineColor(part);
      const safeFontWeight = sanitizeInlineFontWeight(part);
      return <Text key={key} style={[style, safeColor ? { color: safeColor } : undefined, safeFontWeight ? { fontWeight: safeFontWeight } : undefined]}>{innerText}</Text>;
    }

    const htmlStyle = tagName === 'kbd' ? styles.kbdText : tagName === 'sup' ? styles.supText : styles.subText;
    return <Text key={key} style={[style, htmlStyle]}>{innerText}</Text>;
  }

  function renderToken(part: string, key: string): ReactNode {
    if (part.startsWith('\\(') && part.endsWith('\\)') && part.length > 2) {
      const mathContent = formatInlineMath(part.slice(2, -2).trim());
      return <Text key={key} style={[style, styles.inlineMath]}>{mathContent}</Text>;
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 1) {
      const mathContent = formatInlineMath(part.slice(1, -1).trim());
      return <Text key={key} style={[style, styles.inlineMath]}>{mathContent}</Text>;
    }
    const escaped = part.match(ESCAPED_MARKDOWN_TOKEN_PATTERN);
    if (escaped) {
      return <Text key={key} style={style}>{escaped[1]}</Text>;
    }
    const htmlToken = renderSafeInlineHtmlToken(part, key);
    if (htmlToken) {
      return htmlToken;
    }
    const footnoteToken = part.match(FOOTNOTE_TOKEN_PATTERN);
    if (footnoteToken) {
      const footnote = footnotes.get(normalizeFootnoteLabel(footnoteToken[1]));
      return (
        <Text key={key} style={[style, styles.supText, styles.footnoteMarker]}>
          [{footnote?.index ?? footnoteToken[1]}]
        </Text>
      );
    }
    const autoLink = part.match(AUTO_LINK_TOKEN_PATTERN);
    if (autoLink) {
      return (
        <Text key={key} onPress={() => onLinkPress(autoLink[1])} style={[style, styles.linkText]}>
          {autoLink[1]}
        </Text>
      );
    }
    const emailAutoLink = part.match(EMAIL_AUTO_LINK_TOKEN_PATTERN);
    if (emailAutoLink) {
      const mailtoUrl = `mailto:${emailAutoLink[1]}`;
      return (
        <Text key={key} onPress={() => onLinkPress(mailtoUrl)} style={[style, styles.linkText]}>
          {emailAutoLink[1]}
        </Text>
      );
    }
    const referenceLink = part.match(REFERENCE_LINK_TOKEN_PATTERN);
    if (referenceLink) {
      const label = normalizeReferenceLabel(referenceLink[2] || referenceLink[1]);
      const reference = referenceLinks.get(label);
      if (reference) {
        return (
          <Text key={key} onPress={() => onLinkPress(reference.url)} style={[style, styles.linkText]}>
            {referenceLink[1]}
          </Text>
        );
      }
    }
    const link = part.match(DIRECT_LINK_TOKEN_PATTERN);
    if (link) {
      return (
        <Text key={key} onPress={() => onLinkPress(link[2])} style={[style, styles.linkText]}>
          {link[1]}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      const rawCode = part.slice(1, -1);
      const inlineHtml = rawCode.match(HTML_INLINE_TOKEN_PATTERN);
      if (inlineHtml) {
        return renderSafeInlineHtmlToken(rawCode, key);
      }
      return <Text key={key} style={styles.inlineCode}>{rawCode}</Text>;
    }

    if (part.startsWith('||') && part.endsWith('||') && part.length > 3) {
      return <AiSpoilerText key={key} text={part.slice(2, -2)} textStyle={style} />;
    }
    if (part.startsWith('==') && part.endsWith('==') && part.length > 3) {
      return <Text key={key} style={[style, styles.highlightText]}>{part.slice(2, -2)}</Text>;
    }
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <Text key={key} style={[style, styles.boldText]}>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return <Text key={key} style={[style, styles.strikeText]}>{part.slice(2, -2)}</Text>;
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <Text key={key} style={[style, styles.italicText]}>{part.slice(1, -1)}</Text>;
    }
    return renderPlain(part, key);
  }

  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN_PATTERN.exec(text)) !== null) {
    const token = match[0];
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
      tokenIndex += 1;
    }
    nodes.push(renderToken(token, `token-${tokenIndex}`));
    tokenIndex += 1;
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

function AiMarkdownImage({ alt, uri }: { alt: string; uri: string }) {
  const [loadFailed, setLoadFailed] = useState(false);
  if (loadFailed) {
    return (
      <View style={styles.imageFallback}>
        <Ionicons color={aiLightColors.muted} name="image-outline" size={16} />
        <Text style={styles.imageFallbackText}>{alt || '图片无法预览'}</Text>
      </View>
    );
  }
  return (
    <View style={styles.imageBlock}>
      <Image onError={() => setLoadFailed(true)} resizeMode="cover" source={{ uri }} style={styles.markdownImage} />
      {alt ? <Text numberOfLines={2} style={styles.imageCaption}>{alt}</Text> : null}
    </View>
  );
}

const EMPTY_STREAMING_BLOCKS: readonly string[] = Object.freeze([]);

interface FrozenStreamingParagraphsProps {
  blocks: readonly string[];
}

const FrozenStreamingParagraphs = React.memo(
  function FrozenStreamingParagraphs({ blocks }: FrozenStreamingParagraphsProps) {
    return (
      <>
        {blocks.map((block, index) => (
          <Text
            key={`streaming-frozen-${index}`}
            selectable={false}
            style={[styles.body, styles.assistantText, styles.streamingBlockGap]}
          >
            {block}
          </Text>
        ))}
      </>
    );
  },
  (prev, next) => {
    if (prev.blocks === next.blocks) return true;
    if (prev.blocks.length !== next.blocks.length) return false;
    for (let i = 0; i < prev.blocks.length; i++) {
      if (prev.blocks[i] !== next.blocks[i]) return false;
    }
    return true;
  }
);

interface AiCodeBlockViewProps {
  accessibilityLabel?: string;
  code: string;
  language?: string;
  style?: StyleProp<ViewStyle>;
  trailingInline?: ReactNode;
  streaming?: boolean;
  onFeedback?: (message: string, tone: 'success' | 'error' | 'info') => void;
  onOpenSandbox?: (params: { code: string; language?: string; title?: string }) => void;
  onRequestTweak?: (params: { code: string; language?: string; title?: string }) => void;
}

const AiCodeBlockView = React.memo(function AiCodeBlockView({
  accessibilityLabel = '复制代码块',
  code,
  language,
  style,
  trailingInline,
  streaming = false,
  onFeedback,
  onOpenSandbox,
  onRequestTweak,
}: AiCodeBlockViewProps) {
  const [copied, setCopied] = useState(false);
  const [codeExpanded, setCodeExpanded] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSandbox = useMemo(() => isExecutableSandboxCode(code, language), [code, language]);
  const isGenerating = streaming;
  const codeLines = useMemo(() => countMessageLines(code), [code]);
  const shouldFoldCode = codeLines > 12 && !streaming;
  const displayCode = shouldFoldCode && !codeExpanded
    ? code.split('\n').slice(0, 8).join('\n')
    : code;

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      onFeedback?.('代码已复制', 'success');
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 1600);
    } catch {
      onFeedback?.('复制失败', 'error');
    }
  }

  return (
    <View style={[styles.codeBlock, style]}>
      <View style={styles.codeHeader}>
        <Text numberOfLines={1} style={styles.codeLanguage}>{language ?? (isSandbox ? 'html' : 'code')}</Text>
        <View style={styles.codeHeaderActions}>
          {isSandbox && isGenerating ? (
            <View style={styles.codeGeneratingBadge}>
              <ActivityIndicator color={aiLightColors.onDark} size={11} />
              <Text style={styles.codeGeneratingText}>生成中</Text>
            </View>
          ) : isSandbox ? (
            <>
              <Pressable
                accessibilityLabel="运行沙箱"
                accessibilityRole="button"
                hitSlop={spacing[2]}
                onPress={() => onOpenSandbox?.({ code, language })}
                style={({ pressed }) => [styles.sandboxActionButton, pressed && styles.pressed]}
              >
                <Ionicons color="#34D399" name="play-outline" size={13} />
                <Text style={styles.sandboxActionTextRun}>运行</Text>
              </Pressable>
              {onRequestTweak ? (
                <Pressable
                  accessibilityLabel="微调代码"
                  accessibilityRole="button"
                  hitSlop={spacing[2]}
                  onPress={() => onRequestTweak({ code, language })}
                  style={({ pressed }) => [styles.sandboxActionButton, pressed && styles.pressed]}
                >
                  <Ionicons color={aiLightColors.onDark} name="code-slash-outline" size={13} />
                  <Text style={styles.sandboxActionTextTweak}>微调</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            hitSlop={spacing[2]}
            onPress={() => void handleCopy()}
            style={({ pressed }) => [styles.codeCopyButton, pressed && styles.pressed]}
          >
            <Ionicons color={aiLightColors.onDark} name={copied ? 'checkmark' : 'copy-outline'} size={14} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.codeText}>
        {displayCode || ' '}
        {trailingInline}
      </Text>
      {shouldFoldCode ? (
        <Pressable
          accessibilityLabel={codeExpanded ? '收起代码' : `展开全部代码 · ${codeLines} 行`}
          accessibilityRole="button"
          hitSlop={spacing[2]}
          onPress={() => setCodeExpanded((prev) => !prev)}
          style={({ pressed }) => [styles.codeExpandBar, pressed && styles.pressed]}
        >
          <Text style={styles.codeExpandText}>
            {codeExpanded ? '收起代码' : `展开全部代码 · ${codeLines} 行`}
          </Text>
          <Ionicons
            color={aiLightColors.onDark}
            name={codeExpanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            style={{ opacity: 0.6 }}
          />
        </Pressable>
      ) : null}
    </View>
  );
});

function splitStreamingParagraphs(content: string): string[] {
  const fenceMatches = content.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 === 1) {
    const lastFenceIndex = content.lastIndexOf('```');
    const beforeFence = content.slice(0, lastFenceIndex);
    const fromFence = content.slice(lastFenceIndex);
    const beforeBlocks = beforeFence.split(/\n{2,}/).filter(Boolean);
    if (beforeBlocks.length > 0) {
      return [...beforeBlocks, fromFence];
    }
    return [content];
  }
  const blocks = content.split(/\n{2,}/).filter(Boolean);
  return blocks.length > 0 ? blocks : [''];
}

export function countMessageLines(text: string): number {
  if (!text) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

export function hasComplexMarkdownStructure(blocks: MarkdownBlock[], text: string): boolean {
  if (shouldRenderWholeRichHtml(text)) return true;
  let markdownStructureCount = 0;
  for (const block of blocks) {
    if (block.type === 'code' || block.type === 'table' || block.type === 'math' || block.type === 'image') {
      markdownStructureCount += 2;
    } else if (
      block.type === 'list' ||
      block.type === 'quote' ||
      block.type === 'definitionList' ||
      block.type === 'heading'
    ) {
      markdownStructureCount += 1;
    }
    if (markdownStructureCount >= 2) return true;
  }
  return markdownStructureCount >= 1 || blocks.length >= 6;
}

export function shouldFoldAiHistoryMessage(params: {
  variant?: 'assistant' | 'user';
  streaming?: boolean;
  isLatestMessage?: boolean;
  isFoldingEnabled?: boolean;
  lineCount: number;
  hasComplexMarkdown: boolean;
  isDeepHistory?: boolean;
  disableFolding?: boolean;
}): boolean {
  if (
    params.disableFolding ||
    params.variant === 'user' ||
    params.streaming ||
    params.isLatestMessage ||
    !params.isFoldingEnabled
  ) {
    return false;
  }
  const lineThreshold = params.isDeepHistory ? 10 : 14;
  return params.lineCount > lineThreshold && params.hasComplexMarkdown;
}

export function AiMessageContent(props: AiMessageContentProps) {
  let { content } = props;
  const { trailingInline, streaming = false, variant = 'assistant' } = props;

  let cleanContent = content;
  if (cleanContent.includes('<system_action')) {
    const match = cleanContent.match(/<system_action[^>]*?(?:\/>|>|$)/);
    if (match) {
      cleanContent = cleanContent.replace(match[0], '').trim();
    }
  }
  if (cleanContent.includes('<active_artifact_context>')) {
    cleanContent = cleanContent.replace(/<active_artifact_context>[\s\S]*?<\/active_artifact_context>/g, '').trim();
  }

  // 纯文本极致 Fast-Path：非流式且未包含任何 Markdown 语法触发符时，直接走单层原生 Text
  const { fontSize, lineHeight, letterSpacing, paragraphSpacing } = useChatTypographyPreferences(props.space);
  const isPlainText = !streaming && !HAS_ANY_MARKDOWN_TRIGGER.test(cleanContent);
  if (isPlainText) {
    return (
      <Text style={[styles.body, variant === 'user' ? styles.userText : styles.assistantText, { fontSize, lineHeight, letterSpacing }]}>
        {cleanContent}
        {trailingInline}
      </Text>
    );
  }

  return <AiComplexMessageContent {...props} content={cleanContent} />;
}

function AiComplexMessageContent(props: AiMessageContentProps) {
  let { content } = props;
  const {
    trailingInline,
    streaming = false,
    variant = 'assistant',
    isLatestMessage = false,
    isDeepHistory = false,
    disableFolding = false,
    defaultExpanded = false,
    isSandboxModalOpen = false,
    messageId,
    onAnchorShift,
    onOpenSandbox,
    onRequestTweak,
  } = props;

  const { fontSize, lineHeight, letterSpacing, paragraphSpacing } = useChatTypographyPreferences(props.space);

  const prevIsLatestRef = useRef(isLatestMessage);
  useEffect(() => {
    if (prevIsLatestRef.current && !isLatestMessage) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    prevIsLatestRef.current = isLatestMessage;
  }, [isLatestMessage]);

  const [degradedArtifactKeys, setDegradedArtifactKeys] = useState<Record<string, boolean>>({});

  if (content.includes('<system_action')) {
    const match = content.match(/<system_action[^>]*?(?:\/>|>|$)/);
    if (match) {
      content = content.replace(match[0], '').trim();
    }
  }
  if (content.includes('<active_artifact_context>')) {
    content = content.replace(/<active_artifact_context>[\s\S]*?<\/active_artifact_context>/g, '').trim();
  }

  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const [manuallyExpanded, setManuallyExpanded] = useState(defaultExpanded);
  const cardRef = useRef<View>(null);
  const cardAnchorRef = useRef<{ y: number; revision: number } | null>(null);
  const toggleRevisionRef = useRef(0);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFoldingEnabled] = useAiHistoryLongMessageFoldingPreference();
  const lineCount = useMemo(() => countMessageLines(content), [content]);

  const handleFeedback = useCallback((message: string, tone: 'success' | 'error' | 'info') => {
    setFeedback({ message, tone });
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
      feedbackTimeoutRef.current = null;
    }, 1600);
  }, []);

  useEffect(() => {
    setManuallyExpanded(defaultExpanded);
  }, [isLatestMessage, content, defaultExpanded]);

  useLayoutEffect(() => {
    const anchor = cardAnchorRef.current;
    if (!anchor) return;
    cardRef.current?.measureInWindow((_x, y) => {
      if (cardAnchorRef.current !== anchor || anchor.revision !== toggleRevisionRef.current) return;
      cardAnchorRef.current = null;
      const delta = anchor.y - y;
      if (Number.isFinite(delta) && Math.abs(delta) >= 1) {
        onAnchorShift?.(delta);
      }
    });
  }, [manuallyExpanded, onAnchorShift]);

  useEffect(() => () => {
    toggleRevisionRef.current += 1;
    cardAnchorRef.current = null;
  }, [content]);

  function handleToggleExpanded(nextExpanded: boolean) {
    const revision = ++toggleRevisionRef.current;
    const toggle = (y?: number) => {
      if (revision !== toggleRevisionRef.current) return;
      let targetY = y;
      if (!nextExpanded && targetY != null && targetY < 80) {
        targetY = 80;
      }
      cardAnchorRef.current = targetY == null ? null : { y: targetY, revision };
      setManuallyExpanded(nextExpanded);
    };
    if (onAnchorShift && cardRef.current) {
      cardRef.current.measureInWindow((_x, y) => toggle(y));
    } else {
      toggle();
    }
  }

  const renderWholeRichHtml = useMemo(() => shouldRenderWholeRichHtml(content), [content]);
  const wholeHtmlArtifactCandidate = useMemo(() => {
    return renderWholeRichHtml ? detectStandaloneArtifactCandidate(content, 'html') : null;
  }, [content, renderWholeRichHtml]);
  const shouldParseMarkdown = variant === 'assistant' && !streaming && !renderWholeRichHtml;
  const parsedMarkdown = useMemo(
    () => (shouldParseMarkdown ? getCachedMarkdownContent(content) : null),
    [content, shouldParseMarkdown]
  );
  const streamingBlocks = useMemo(() => (streaming ? splitStreamingParagraphs(content) : EMPTY_STREAMING_BLOCKS), [content, streaming]);

  function clearFeedbackTimer() {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    return clearFeedbackTimer;
  }, []);

  const lastPrewarmedContentRef = useRef('');
  useEffect(() => {
    if (!streaming || variant !== 'assistant') {
      return;
    }
    const timer = setTimeout(() => {
      if (content && content.length > 20 && content !== lastPrewarmedContentRef.current) {
        lastPrewarmedContentRef.current = content;
        prewarmMarkdownContent(content);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [content, streaming, variant]);

  if (variant === 'user') {
    return <Text selectable={false} style={[styles.body, styles.userText]}>{content}</Text>;
  }

  if (streaming) {
    const parsed = parseStreamingArtifactSegments(content, streaming);

    if (parsed.hasArtifact) {
      if (parsed.status === 'pending_sniff') {
        // 微缓冲挂起阶段（<60 字符，未换行）：先展示前置文本，暂缓渲染代码块，杜绝黑白块闪烁
        return (
          <View style={styles.streamingWrap}>
            {parsed.preText ? (
              <Text selectable={false} style={[styles.body, styles.assistantText]}>
                {parsed.preText}
              </Text>
            ) : null}
            {trailingInline ?? null}
          </View>
        );
      }

      if (parsed.artifact && !degradedArtifactKeys['streaming-artifact']) {
        const { preText, artifact, postText } = parsed;
        const isReady = artifact.status === 'ready';

        return (
          <View style={styles.streamingWrap}>
            {/* 1. 前置引导文：正常打字流式输出 */}
            {preText ? (
              <Text selectable={false} style={[styles.body, styles.assistantText, styles.streamingBlockGap]}>
                {preText}
              </Text>
            ) : null}

            {/* 2. 原位极光骨架取景框：构建期纯原生 0 WebView 极光扫弦，闭合就绪后揭开画面 */}
            <AiSandboxArtifactViewfinder
              code={artifact.code}
              id={messageId ? `${messageId}-streaming-artifact` : 'streaming-artifact'}
              isSandboxModalOpen={isSandboxModalOpen}
              language={artifact.language}
              lineCount={artifact.lineCount}
              messageId={messageId}
              onDegradeToCodeBlock={() =>
                setDegradedArtifactKeys((prev) => ({ ...prev, 'streaming-artifact': true }))
              }
              onOpenSandbox={onOpenSandbox}
              streaming={!isReady}
              title={artifact.title}
            />

            {/* 3. 后续说明文字：代码闭合瞬间即保留光标，并在取景框下方平滑流式续流 */}
            {isReady && (postText || trailingInline) ? (
              <Text selectable={false} style={[styles.body, styles.assistantText]}>
                {postText}
                {trailingInline ?? null}
              </Text>
            ) : null}
          </View>
        );
      }
    }

    const hasFrozen = streamingBlocks.length > 1;
    const frozenBlocks = hasFrozen ? streamingBlocks.slice(0, -1) : EMPTY_STREAMING_BLOCKS;
    const tailBlock = streamingBlocks[streamingBlocks.length - 1] ?? '';
    const tailIndex = streamingBlocks.length - 1;

    return (
      <View style={styles.streamingWrap}>
        {hasFrozen ? <FrozenStreamingParagraphs blocks={frozenBlocks} /> : null}
        <Text
          key={`streaming-${tailIndex}`}
          selectable={false}
          style={[styles.body, styles.assistantText]}
        >
          {tailBlock}
          {trailingInline ?? null}
        </Text>
      </View>
    );
  }
  if (renderWholeRichHtml) {
    // 独立可运行制品：天然具备 72dp 白卡收拢态，绝不进入长文代码块折叠流程
    if (wholeHtmlArtifactCandidate && !degradedArtifactKeys['single-html']) {
      return isLatestMessage ? (
        <AiSandboxArtifactViewfinder
          code={wholeHtmlArtifactCandidate.code}
          id={messageId ? `${messageId}-single-html` : 'single-html'}
          isSandboxModalOpen={isSandboxModalOpen}
          language={wholeHtmlArtifactCandidate.language}
          lineCount={wholeHtmlArtifactCandidate.lineCount}
          messageId={messageId}
          onDegradeToCodeBlock={() =>
            setDegradedArtifactKeys((prev) => ({ ...prev, 'single-html': true }))
          }
          onOpenSandbox={onOpenSandbox}
          title={wholeHtmlArtifactCandidate.title}
        />
      ) : (
        <AiSandboxArtifactCard
          code={wholeHtmlArtifactCandidate.code}
          id={messageId ? `${messageId}-single-html` : 'single-html'}
          isSandboxModalOpen={isSandboxModalOpen}
          language={wholeHtmlArtifactCandidate.language}
          lineCount={wholeHtmlArtifactCandidate.lineCount}
          messageId={messageId}
          onDegradeToCodeBlock={() =>
            setDegradedArtifactKeys((prev) => ({ ...prev, 'single-html': true }))
          }
          onOpenSandbox={onOpenSandbox}
          title={wholeHtmlArtifactCandidate.title}
        />
      );
    }

    const isEligibleForFolding = shouldFoldAiHistoryMessage({
      variant,
      streaming,
      isLatestMessage,
      isFoldingEnabled,
      lineCount,
      hasComplexMarkdown: true,
      isDeepHistory,
      disableFolding,
    });
    const isFolded = isEligibleForFolding && !manuallyExpanded;
    const canRunSandbox = Boolean(onOpenSandbox) && (
      isExecutableSandboxCode(content) ||
      /<(table|canvas|svg)\b/i.test(content) ||
      /<!doctype\s+html|<html\b|<body\b/i.test(content)
    );

    return (
      <View ref={cardRef} style={[styles.foldedOuter, isFolded && styles.foldedCardShell]}>
        <View style={[styles.wrap, isFolded && styles.foldedViewport]}>
          {isFolded ? (
            <View style={styles.codeBlock}>
              <View style={styles.codeHeader}>
                <Text numberOfLines={1} style={styles.codeLanguage}>html</Text>
                {canRunSandbox ? (
                  <Pressable
                    accessibilityLabel="运行沙箱"
                    accessibilityRole="button"
                    hitSlop={spacing[2]}
                    onPress={() => onOpenSandbox?.({ code: content, language: 'html', messageId })}
                    style={({ pressed }) => [styles.sandboxActionButton, pressed && styles.pressed]}
                  >
                    <Ionicons color="#34D399" name="play-outline" size={13} />
                    <Text style={styles.sandboxActionTextRun}>运行</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text numberOfLines={8} style={styles.codeText}>
                {content.trim().split('\n').slice(0, 8).join('\n')}
              </Text>
            </View>
          ) : (
            <AiRichHtmlBlock html={content} key={getMessageRenderCacheKey(content)} onOpenSandbox={onOpenSandbox} />
          )}
          {trailingInline ? (
            <Text style={[styles.body, styles.assistantText]}>
              {trailingInline}
            </Text>
          ) : null}
          {isFolded ? (
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.85)', '#FFFFFF']}
              style={styles.foldedFadeBottom}
            />
          ) : null}
        </View>
        {isFolded ? (
          <View style={styles.foldedControlBar}>
            <View style={styles.foldedInfo}>
              <Ionicons color={aiLightColors.muted} name="code-working-outline" size={12} />
              <Text style={styles.foldedInfoText}>{`HTML 长文 · ${lineCount} 行`}</Text>
            </View>
            <View style={styles.foldedActions}>
              {canRunSandbox ? (
                <Pressable
                  accessibilityLabel="运行沙箱"
                  accessibilityRole="button"
                  hitSlop={spacing[2]}
                  onPress={() => onOpenSandbox?.({ code: content, language: 'html', messageId })}
                  style={({ pressed }) => [styles.foldedRunButton, pressed && styles.pressed]}
                >
                  <Ionicons color="#059669" name="play" size={12} />
                  <Text style={styles.foldedRunButtonText}>运行</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel="展开阅读全文"
                accessibilityRole="button"
                hitSlop={spacing[2]}
                onPress={() => handleToggleExpanded(true)}
                style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
              >
                <Text style={styles.expandButtonText}>展开阅读全文</Text>
                <Ionicons color={aiLightColors.muted} name="chevron-down" size={12} />
              </Pressable>
            </View>
          </View>
        ) : isEligibleForFolding && manuallyExpanded ? (
          <View style={styles.expandedControlBar}>
            <View style={styles.expandedInfo}>
              <Ionicons color={aiLightColors.muted} name="code-working-outline" size={12} />
              <Text style={styles.expandedInfoText}>{`HTML 长文 · ${lineCount} 行（已展开）`}</Text>
            </View>
            <Pressable
              accessibilityLabel="收起长文"
              accessibilityRole="button"
              hitSlop={spacing[2]}
              onPress={() => handleToggleExpanded(false)}
              style={({ pressed }) => [styles.collapseButton, pressed && styles.pressed]}
            >
              <Text style={styles.collapseButtonText}>收起</Text>
              <Ionicons color={aiLightColors.muted} name="chevron-up" size={12} />
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }
  const { blocks, footnotes, referenceLinks } = parsedMarkdown ?? getCachedMarkdownContent(content);
  const hasComplex = useMemo(() => hasComplexMarkdownStructure(blocks, content), [blocks, content]);

  // 计算有效视觉行数：独立可运行制品呈现为 ~50dp 小卡片，在折叠决策中仅按 2 行估算，
  // 彻底防止因 300 行制品代码将包含简短文字说明的消息误判为超长长文而触发折叠！
  const effectiveLineCount = useMemo(() => {
    let effective = 0;
    for (const block of blocks) {
      if (block.type === 'code' && detectStandaloneArtifactCandidate(block.text, block.language)) {
        effective += 2;
      } else if (
        block.type === 'paragraph' ||
        block.type === 'code' ||
        block.type === 'heading' ||
        block.type === 'quote'
      ) {
        effective += countMessageLines(block.text) || 1;
      } else if (block.type === 'list') {
        effective += block.items.length;
      } else if (block.type === 'table') {
        effective += block.rows.length + 1;
      } else {
        effective += 2;
      }
    }
    return effective;
  }, [blocks]);

  const isEligibleForFolding = shouldFoldAiHistoryMessage({
    variant,
    streaming,
    isLatestMessage,
    isFoldingEnabled,
    lineCount: effectiveLineCount,
    hasComplexMarkdown: hasComplex,
    isDeepHistory,
    disableFolding,
  });
  const isFolded = isEligibleForFolding && !manuallyExpanded;

  // Virtual Slicing: when folded, only pass the first ~14 lines of blocks to React Native
  // to prevent instantiating hundreds of native views and StaticLayout computations!
  const renderedBlocks = useMemo(() => {
    if (!isFolded) return blocks;
    const subset: MarkdownBlock[] = [];
    let linesAccumulated = 0;
    for (const block of blocks) {
      switch (block.type) {
        case 'paragraph': {
          const lines = countMessageLines(block.text) || 1;
          const remainingLines = Math.max(1, 14 - linesAccumulated);
          const slicedText = lines > remainingLines ? block.text.split('\n').slice(0, remainingLines).join('\n') : block.text;
          subset.push({ ...block, text: slicedText });
          linesAccumulated += Math.min(lines, remainingLines);
          break;
        }
        case 'heading':
        case 'quote': {
          const lines = countMessageLines(block.text) || 1;
          subset.push(block);
          linesAccumulated += lines;
          break;
        }
        case 'code': {
          // 独立可运行制品呈现为 4px 小卡片，绝不截断代码文本破坏其自包含性
          if (detectStandaloneArtifactCandidate(block.text, block.language)) {
            subset.push(block);
            linesAccumulated += 2;
            break;
          }
          const lines = countMessageLines(block.text);
          const remainingLines = Math.max(2, 14 - linesAccumulated);
          const slicedText = lines > remainingLines ? block.text.split('\n').slice(0, remainingLines).join('\n') : block.text;
          subset.push({ ...block, text: slicedText });
          linesAccumulated += Math.min(lines + 2, remainingLines);
          break;
        }
        case 'table': {
          const remainingRows = Math.max(2, 14 - linesAccumulated);
          const slicedRows = block.rows.slice(0, remainingRows);
          subset.push({ ...block, rows: slicedRows });
          linesAccumulated += slicedRows.length + 1;
          break;
        }
        case 'list': {
          const remainingItems = Math.max(1, 14 - linesAccumulated);
          const slicedItems = block.items.slice(0, remainingItems);
          subset.push({ ...block, items: slicedItems });
          linesAccumulated += slicedItems.length;
          break;
        }
        default:
          subset.push(block);
          linesAccumulated += 2;
          break;
      }
      if (linesAccumulated >= 14) break;
    }
    return subset;
  }, [blocks, isFolded]);

  const trailingTargetIndex = trailingInline
    ? renderedBlocks.reduce((targetIndex, block, index) => (block.type === 'hr' || block.type === 'image' ? targetIndex : index), -1)
    : -1;

  async function openSafeLink(url: string) {
    if (!isSafeLinkUrl(url)) {
      setFeedback({ message: '不支持打开该链接', tone: 'error' });
      clearFeedbackTimer();
      feedbackTimeoutRef.current = setTimeout(() => {
        setFeedback(null);
        feedbackTimeoutRef.current = null;
      }, 1600);
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setFeedback({ message: '链接打开失败', tone: 'error' });
      clearFeedbackTimer();
      feedbackTimeoutRef.current = setTimeout(() => {
        setFeedback(null);
        feedbackTimeoutRef.current = null;
      }, 1600);
    }
  }

  let viewfinderMountedInMessage = false;

  return (
    <View ref={cardRef} style={[styles.foldedOuter, isFolded && styles.foldedCardShell]}>
      <View style={[styles.wrap, isFolded && styles.foldedViewport, { gap: paragraphSpacing }]}>
        {feedback ? <AiInlineFeedback message={feedback.message} tone={feedback.tone} /> : null}
        {renderedBlocks.map((block, index) => {
          const key = `${block.type}-${index}`;
          const appendTrailingInline = trailingInline && index === trailingTargetIndex;
          if (block.type === 'heading') {
            return (
              <Text key={key} style={[styles.heading, block.level > 2 && styles.smallHeading]}>
                {renderInlineText(block.text, [styles.heading, block.level > 2 && styles.smallHeading], openSafeLink, referenceLinks, footnotes)}
                {appendTrailingInline ? trailingInline : null}
              </Text>
            );
          }
          if (block.type === 'list') {
            return (
              <View key={key} style={styles.list}>
                {block.items.map((item, itemIndex) => (
                  <View key={`${key}-${itemIndex}`} style={[styles.listItem, item.nestLevel > 0 && { paddingLeft: item.nestLevel * spacing[3] }]}>
                    <Text style={styles.listMarker}>{item.marker}</Text>
                    <Text style={[styles.body, styles.assistantText, styles.listText, { fontSize, lineHeight, letterSpacing }]}>
                      {renderInlineText(item.text, [styles.body, styles.assistantText, { fontSize, lineHeight, letterSpacing }], openSafeLink, referenceLinks, footnotes)}
                      {appendTrailingInline && itemIndex === block.items.length - 1 ? trailingInline : null}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }
          if (block.type === 'definitionList') {
            return (
              <View key={key} style={styles.definitionList}>
                {block.items.map((item, itemIndex) => (
                  <View key={`${key}-${itemIndex}`} style={styles.definitionItem}>
                    <Text style={styles.definitionTerm}>
                      {renderInlineText(item.term, [styles.definitionTerm], openSafeLink, referenceLinks, footnotes)}
                    </Text>
                    {item.definitions.map((definition, definitionIndex) => (
                      <Text key={`${key}-${itemIndex}-${definitionIndex}`} style={styles.definitionText}>
                        {renderInlineText(definition, [styles.definitionText], openSafeLink, referenceLinks, footnotes)}
                        {appendTrailingInline && itemIndex === block.items.length - 1 && definitionIndex === item.definitions.length - 1 ? trailingInline : null}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            );
          }
          if (block.type === 'quote') {
            return (
              <View key={key} style={styles.quote}>
                <Text style={[styles.body, styles.quoteText, { fontSize, lineHeight, letterSpacing }]}>
                  {renderInlineText(block.text, [styles.body, styles.quoteText, { fontSize, lineHeight, letterSpacing }], openSafeLink, referenceLinks, footnotes)}
                  {appendTrailingInline ? trailingInline : null}
                </Text>
              </View>
            );
          }
          if (block.type === 'footnote') {
            return (
              <View key={key} style={styles.footnote}>
                <Text style={styles.footnoteMarker}>{`[${block.index}]`}</Text>
                <Text style={styles.footnoteText}>
                  {renderInlineText(block.text, [styles.footnoteText], openSafeLink, referenceLinks, footnotes)}
                  {appendTrailingInline ? trailingInline : null}
                </Text>
              </View>
            );
          }
          if (block.type === 'hr') {
            return <View key={key} style={styles.horizontalRule} />;
          }
          if (block.type === 'math') {
            if (isFolded) {
              return (
                <View key={key} style={styles.codeBlock}>
                  <Text style={[styles.body, styles.inlineMath]}>{formatInlineMath(block.math)}</Text>
                </View>
              );
            }
            return <AiMathBlock key={key} math={block.math} />;
          }
          if (block.type === 'linkCard') {
            return <AiLinkPreviewCard key={key} url={block.url} />;
          }
          if (block.type === 'image') {
            return <AiMarkdownImage alt={block.alt} key={key} uri={block.uri} />;
          }
          if (block.type === 'code') {
            const candidate = detectStandaloneArtifactCandidate(block.text, block.language);
            if (candidate && !degradedArtifactKeys[key]) {
              if (isLatestMessage && !viewfinderMountedInMessage) {
                viewfinderMountedInMessage = true;
                return (
                  <AiSandboxArtifactViewfinder
                    code={candidate.code}
                    id={messageId ? `${messageId}-${key}` : key}
                    isSandboxModalOpen={isSandboxModalOpen}
                    key={key}
                    language={candidate.language}
                    lineCount={candidate.lineCount}
                    messageId={messageId}
                    onDegradeToCodeBlock={() =>
                      setDegradedArtifactKeys((prev) => ({ ...prev, [key]: true }))
                    }
                    onOpenSandbox={onOpenSandbox}
                    title={candidate.title}
                  />
                );
              }
              return (
                <AiSandboxArtifactCard
                  code={candidate.code}
                  id={messageId ? `${messageId}-${key}` : key}
                  isSandboxModalOpen={isSandboxModalOpen}
                  key={key}
                  language={candidate.language}
                  lineCount={candidate.lineCount}
                  messageId={messageId}
                  onDegradeToCodeBlock={() =>
                    setDegradedArtifactKeys((prev) => ({ ...prev, [key]: true }))
                  }
                  onOpenSandbox={onOpenSandbox}
                  title={candidate.title}
                />
              );
            }

            if (isFolded) {
              const isExecutable = isExecutableSandboxCode(block.text, block.language);
              return (
                <View key={key} style={styles.codeBlock}>
                  <View style={styles.codeHeader}>
                    <Text numberOfLines={1} style={styles.codeLanguage}>{block.language ?? (isExecutable ? 'html' : 'code')}</Text>
                    {isExecutable ? (
                      <Pressable
                        accessibilityLabel="运行沙箱"
                        accessibilityRole="button"
                        hitSlop={spacing[2]}
                        onPress={() => onOpenSandbox?.({ code: block.text, language: block.language, messageId })}
                        style={({ pressed }) => [styles.sandboxActionButton, pressed && styles.pressed]}
                      >
                        <Ionicons color="#34D399" name="play-outline" size={13} />
                        <Text style={styles.sandboxActionTextRun}>运行</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Text numberOfLines={8} style={styles.codeText}>
                    {block.text}
                    {appendTrailingInline ? trailingInline : null}
                  </Text>
                </View>
              );
            }

            if (shouldRenderHtmlCodeBlock(block)) {
              return <AiRichHtmlBlock html={block.text} key={`${key}-${getMessageRenderCacheKey(block.text)}`} onOpenSandbox={onOpenSandbox} />;
            }
            return (
              <AiCodeBlockView
                accessibilityLabel="复制代码块"
                code={block.text}
                key={key}
                language={block.language}
                onFeedback={handleFeedback}
                onOpenSandbox={onOpenSandbox}
                onRequestTweak={onRequestTweak}
                streaming={streaming}
                style={styles.codeBlock}
                trailingInline={appendTrailingInline ? trailingInline : null}
              />
            );
          }
          if (block.type === 'table') {
            return (
              <View key={key} style={styles.tableBlock}>
                {block.rows.map((row, rowIndex) => (
                  <View key={`${key}-${rowIndex}`} style={[styles.tableRow, rowIndex === 0 && styles.tableHeaderRow]}>
                    {row.map((cell, cellIndex) => (
                      <Text
                        key={`${key}-${rowIndex}-${cellIndex}`}
                        style={[
                          styles.tableCell,
                          block.alignments[cellIndex] === 'center' && styles.tableCellCenter,
                          block.alignments[cellIndex] === 'right' && styles.tableCellRight,
                          rowIndex === 0 && styles.tableHeaderCell,
                        ]}
                      >
                        {renderInlineText(cell, [styles.tableCell, rowIndex === 0 && styles.tableHeaderCell], openSafeLink, referenceLinks, footnotes)}
                        {appendTrailingInline && rowIndex === block.rows.length - 1 && cellIndex === row.length - 1 ? trailingInline : null}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            );
          }
          if (shouldRenderRichHtml(block.text)) {
            return <AiRichHtmlBlock html={block.text} key={`${key}-${getMessageRenderCacheKey(block.text)}`} onOpenSandbox={onOpenSandbox} />;
          }
          return (
            <Text key={key} style={[styles.body, styles.assistantText]}>
              {renderInlineText(block.text, [styles.body, styles.assistantText], openSafeLink, referenceLinks, footnotes)}
              {appendTrailingInline ? trailingInline : null}
            </Text>
          );
        })}
        {trailingInline && trailingTargetIndex < 0 ? (
          <Text style={[styles.body, styles.assistantText]}>
            {trailingInline}
          </Text>
        ) : null}
        {isFolded ? (
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.85)', '#FFFFFF']}
            style={styles.foldedFadeBottom}
          />
        ) : null}
      </View>
      {isFolded ? (
        <View style={styles.foldedControlBar}>
          <View style={styles.foldedInfo}>
            <Ionicons color={aiLightColors.muted} name="document-text-outline" size={12} />
            <Text style={styles.foldedInfoText}>{`Markdown 长文 · ${lineCount} 行`}</Text>
          </View>
          <View style={styles.foldedActions}>
            {(() => {
              const firstExecutableCodeBlock = blocks.find(
                (b): b is Extract<MarkdownBlock, { type: 'code' }> =>
                  b.type === 'code' && isExecutableSandboxCode(b.text, b.language)
              );
              if (firstExecutableCodeBlock && onOpenSandbox) {
                return (
                  <Pressable
                    accessibilityLabel="运行沙箱"
                    accessibilityRole="button"
                    hitSlop={spacing[2]}
                    onPress={() =>
                      onOpenSandbox({
                        code: firstExecutableCodeBlock.text,
                        language: firstExecutableCodeBlock.language,
                        messageId,
                      })
                    }
                    style={({ pressed }) => [styles.foldedRunButton, pressed && styles.pressed]}
                  >
                    <Ionicons color="#059669" name="play" size={12} />
                    <Text style={styles.foldedRunButtonText}>运行</Text>
                  </Pressable>
                );
              }
              return null;
            })()}
            <Pressable
              accessibilityLabel="展开阅读全文"
              accessibilityRole="button"
              hitSlop={spacing[2]}
              onPress={() => handleToggleExpanded(true)}
              style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
            >
              <Text style={styles.expandButtonText}>展开阅读全文</Text>
              <Ionicons color={aiLightColors.muted} name="chevron-down" size={12} />
            </Pressable>
          </View>
        </View>
      ) : isEligibleForFolding && manuallyExpanded ? (
        <View style={styles.expandedControlBar}>
          <View style={styles.expandedInfo}>
            <Ionicons color={aiLightColors.muted} name="document-text-outline" size={12} />
            <Text style={styles.expandedInfoText}>{`Markdown 长文 · ${lineCount} 行（已展开）`}</Text>
          </View>
          <Pressable
            accessibilityLabel="收起长文"
            accessibilityRole="button"
            hitSlop={spacing[2]}
            onPress={() => handleToggleExpanded(false)}
            style={({ pressed }) => [styles.collapseButton, pressed && styles.pressed]}
          >
            <Text style={styles.collapseButtonText}>收起</Text>
            <Ionicons color={aiLightColors.muted} name="chevron-up" size={12} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    maxWidth: '100%',
  },
  streamingWrap: {
    maxWidth: '100%',
  },
  streamingBlockGap: {
    marginBottom: 10,
  },
  body: {
    ...typography.textStyles.body,
    fontSize: 15,
    lineHeight: 24,
  },
  assistantText: {
    color: aiLightColors.ink,
  },
  userText: {
    color: aiLightColors.onDark,
  },
  heading: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    marginTop: spacing[1.5],
  },
  smallHeading: {
    fontSize: typography.size.body,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: spacing[1],
  },
  inlineMath: {
    fontFamily: 'serif',
    color: aiLightColors.primaryActive,
  },
  inlineCode: {
    ...typography.textStyles.caption,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    color: aiLightColors.primaryActive,
    fontFamily: typography.family.mono,
    lineHeight: 22,
  },
  boldText: {
    fontWeight: '700',
  },
  italicText: {
    fontStyle: 'italic',
  },
  highlightText: {
    backgroundColor: aiLightColors.primarySoft,
  },
  strikeText: {
    textDecorationLine: 'line-through',
  },
  linkText: {
    color: aiLightColors.primaryActive,
  },
  kbdText: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: typography.family.mono,
    paddingHorizontal: spacing[1],
  },
  supText: {
    fontSize: typography.size.micro,
    lineHeight: 14,
  },
  subText: {
    fontSize: typography.size.micro,
    lineHeight: 24,
  },
  footnote: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  footnoteMarker: {
    color: aiLightColors.primaryActive,
    fontWeight: '700',
  },
  footnoteText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    flex: 1,
    lineHeight: 20,
  },
  list: {
    gap: rhythm.microGap,
  },
  listItem: {
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  listMarker: {
    ...typography.textStyles.body,
    color: aiLightColors.muted,
    lineHeight: 22,
    minWidth: spacing[4],
  },
  listText: {
    flexShrink: 1,
  },
  definitionList: {
    gap: rhythm.microGap,
  },
  definitionItem: {
    gap: rhythm.microGap,
  },
  definitionTerm: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    fontWeight: '600',
    lineHeight: 22,
  },
  definitionText: {
    ...typography.textStyles.body,
    borderLeftColor: aiLightColors.primary,
    borderLeftWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.muted,
    lineHeight: 22,
    paddingLeft: spacing[2],
  },
  quote: {
    borderLeftColor: aiLightColors.primaryActive,
    borderLeftWidth: 3,
    borderRadius: 1.5,
    marginVertical: spacing[1],
    paddingLeft: 10,
  },
  quoteText: {
    color: aiLightColors.muted,
  },
  horizontalRule: {
    backgroundColor: aiLightColors.hairline,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing[2],
    width: '100%',
  },
  imageBlock: {
    gap: rhythm.microGap,
    maxWidth: '100%',
  },
  markdownImage: {
    aspectRatio: 16 / 10,
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.md,
    maxWidth: '100%',
    width: 260,
  },
  imageCaption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  imageFallback: {
    alignItems: 'center',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  imageFallbackText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    flex: 1,
  },
  codeBlock: {
    backgroundColor: aiLightColors.dark,
    borderRadius: radius.md,
    gap: rhythm.microGap,
    maxWidth: '100%',
    overflow: 'hidden',
    padding: spacing[2],
  },
  codeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  codeLanguage: {
    ...typography.textStyles.micro,
    color: aiLightColors.onDark,
    fontFamily: typography.family.mono,
    opacity: 0.72,
  },
  codeCopyButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    height: spacing[6],
    justifyContent: 'center',
    width: spacing[6],
  },
  codeHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  codeGeneratingBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  codeGeneratingText: {
    ...typography.textStyles.micro,
    color: aiLightColors.onDark,
    opacity: 0.85,
  },
  sandboxActionButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sandboxActionTextRun: {
    ...typography.textStyles.micro,
    color: '#34D399',
    fontWeight: '600',
  },
  sandboxActionTextTweak: {
    ...typography.textStyles.micro,
    color: aiLightColors.onDark,
    fontWeight: '500',
  },
  codeText: {
    ...typography.textStyles.caption,
    color: aiLightColors.onDark,
    fontFamily: typography.family.mono,
    lineHeight: 21,
  },
  codeExpandBar: {
    alignItems: 'center',
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    marginTop: spacing[1],
    paddingTop: spacing[2],
  },
  codeExpandText: {
    ...typography.textStyles.micro,
    color: aiLightColors.onDark,
    opacity: 0.6,
  },
  tableBlock: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableHeaderRow: {
    backgroundColor: aiLightColors.surface,
  },
  tableCell: {
    ...typography.textStyles.caption,
    borderColor: aiLightColors.hairline,
    borderRightWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  tableHeaderCell: {
    fontWeight: '600',
  },
  tableCellCenter: {
    textAlign: 'center',
  },
  tableCellRight: {
    textAlign: 'right',
  },
  richHtmlBlock: {
    backgroundColor: 'transparent',
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  richHtmlRunButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 6,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: 'absolute',
    right: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    top: 6,
    zIndex: 10,
  },
  richHtmlRunText: {
    color: '#111827',
    fontSize: 11,
    fontWeight: '600',
  },
  richHtmlWebView: {
    backgroundColor: 'transparent',
  },
  foldedOuter: {
    maxWidth: '100%',
    width: '100%',
  },
  foldedCardShell: {
    backgroundColor: 'rgba(0, 0, 0, 0.015)',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingBottom: spacing[2],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
  },
  foldedViewport: {
    maxHeight: 280,
    overflow: 'hidden',
    position: 'relative',
  },
  foldedFadeBottom: {
    bottom: 0,
    height: 56,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  foldedControlBar: {
    alignItems: 'center',
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[2],
    paddingBottom: 2,
    paddingTop: spacing[2],
  },
  foldedInfo: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing[1],
  },
  foldedInfoText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  foldedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  foldedRunButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 3,
  },
  foldedRunButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  expandButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: spacing[1],
    paddingVertical: 2,
  },
  expandButtonText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  expandedControlBar: {
    alignItems: 'center',
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[2],
    paddingBottom: spacing[1],
    paddingTop: spacing[2],
  },
  expandedInfo: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing[1],
  },
  expandedInfoText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  collapseButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: spacing[1],
    paddingVertical: 2,
  },
  collapseButtonText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  pressed: {
    opacity: 0.78,
  },
});
