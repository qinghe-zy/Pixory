import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image, Linking, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors, aiLightDisplayFont } from './aiLightTheme';
import { AiInlineFeedback } from './AiInlineFeedback';
import { AiMathBlock } from './AiMathBlock';
import { AiSpoilerText } from './AiSpoilerText';
import { AiLinkPreviewCard } from './AiLinkPreviewCard';

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

interface AiMessageContentProps {
  content: string;
  trailingInline?: ReactNode;
  streaming?: boolean;
  variant?: 'assistant' | 'user';
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
const ESCAPED_MARKDOWN_TOKEN_PATTERN = /^\\([\\`*_[\]{}()#+\-.!|<>~])/;
const INLINE_TOKEN_PATTERN = /(<(?:span|font|kbd|sup|sub)[^>]*>[\s\S]*?<\/(?:span|font|kbd|sup|sub)>|<br\s*\/?>|\\[\\`*_[\]{}()#+\-.!|<>~]|\[\^[^\]]+\]|\[[^\]]+\]\(https?:\/\/[^\s)]+(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)|\[[^\]]+\]\[[^\]]*\]|<https?:\/\/[^>\s]+>|<[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}>|`[^`]+`|\$[^$]+\$|\|\|[^|]+\|\||==[^=]+==|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_)/gi;
const SAFE_INLINE_COLOR_PATTERN = /^(#[0-9A-F]{3}(?:[0-9A-F]{3})?|rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|[a-z]+)$/i;
const UNSAFE_COLOR_VALUE_PATTERN = /url|var|expression|calc|attr|;/i;
const RICH_HTML_BLOCK_TAG_PATTERN = /<(address|article|aside|blockquote|canvas|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|output|p|pre|section|style|summary|table|tbody|td|tfoot|th|thead|tr|ul)\b[\s\S]*?>/i;
const RICH_HTML_INLINE_STYLE_PATTERN = /<(span|font|em|strong|b|i|u|s|mark|small)\b[^>]*(style|face|size)=/i;
const RICH_HTML_LEGACY_FONT_PATTERN = /<font\b[^>]*(face|size)=/i;
const RICH_HTML_STYLE_FEATURE_PATTERN = /\b(font-size|font-family|font-style|text-decoration|text-shadow|opacity|border|border-radius|padding|margin|letter-spacing|text-transform|display|white-space)\s*:|(?:linear-gradient|radial-gradient|repeating-linear-gradient)\s*\(/i;
const RICH_HTML_CODE_LANGUAGE_PATTERN = /^(html?|xhtml)$/i;
const RICH_HTML_CODE_START_PATTERN = /^\s*(?:<!doctype\s+html\b|<html\b|<body\b|<(?:div|section|article|main|table|style)\b)/i;
const RICH_HTML_WHOLE_CONTENT_PATTERN = /^\s*(?:<!doctype\s+html\b|<html\b|<body\b|<(?:address|article|aside|blockquote|div|main|section|style|table)\b)/i;
const MESSAGE_RENDER_CACHE_MAX_CONTENT_LENGTH = 30000;
const MARKDOWN_PARSE_CACHE_LIMIT = 120;
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

    if (trimmed === '$$' || /^\$\$(.+?)\$\$$/.test(trimmed)) {
      const mathMatch = /^\$\$(.+?)\$\$$/.exec(trimmed);
      if (mathMatch && mathMatch[1]) {
        blocks.push({ type: 'math', math: mathMatch[1] });
        index += 1;
        continue;
      } else if (trimmed === '$$') {
        const mathLines: string[] = [];
        index += 1;
        while (index < lines.length && lines[index]?.trim() !== '$$') {
          mathLines.push(lines[index] ?? '');
          index += 1;
        }
        if (index < lines.length) {
          index += 1;
        }
        blocks.push({ type: 'math', math: mathLines.join('\n') });
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
      if (!nextLine.trim() || parseReferenceDefinition(nextLine) || parseFootnoteDefinition(nextLine) || isFence(nextLine) || isHeading(nextLine) || isHorizontalRule(nextLine) || isImageMarkdownLine(nextLine) || isListLine(nextLine) || isQuoteLine(nextLine) || isDefinitionLine(lines[index + 1] ?? '') || (isTableLine(nextLine) && isTableSeparator(lines[index + 1] ?? ''))) {
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
html,body{margin:0;padding:0;background:transparent;color:${aiLightColors.ink};font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.55;overflow:hidden;word-break:break-word;overflow-wrap:anywhere}
*{box-sizing:border-box;max-width:100%}
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

function AiRichHtmlBlock({ html }: { html: string }) {
  const [height, setHeight] = useState(() => getCachedRichHtmlHeight(html));
  const richHtmlDocument = useMemo(() => buildRichHtmlDocument(html), [html]);

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
    </View>
  );
}

function renderInlineText(text: string, style: StyleProp<TextStyle>, onLinkPress: (url: string) => void, referenceLinks: ReferenceLinks, footnotes: Footnotes): ReactNode {
  INLINE_TOKEN_PATTERN.lastIndex = 0;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  function renderPlain(part: string, key: string): ReactNode {
    return <Text key={key} style={style}>{part}</Text>;
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
    if (part.startsWith('$') && part.endsWith('$') && part.length > 1) {
      return <Text key={key} style={[styles.inlineCode, { color: aiLightColors.primary, fontFamily: 'serif' }]}>{part.slice(1, -1)}</Text>;
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
      nodes.push(renderPlain(text.slice(cursor, match.index), `plain-${tokenIndex}`));
      tokenIndex += 1;
    }
    nodes.push(renderToken(token, `token-${tokenIndex}`));
    tokenIndex += 1;
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    nodes.push(renderPlain(text.slice(cursor), `plain-${tokenIndex}`));
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

export function AiMessageContent({ content, trailingInline, streaming = false, variant = 'assistant' }: AiMessageContentProps) {
  const [copiedBlockKey, setCopiedBlockKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderWholeRichHtml = shouldRenderWholeRichHtml(content);
  const shouldParseMarkdown = variant === 'assistant' && !streaming && !renderWholeRichHtml;
  const parsedMarkdown = useMemo(
    () => (shouldParseMarkdown ? getCachedMarkdownContent(content) : null),
    [content, shouldParseMarkdown]
  );

  function clearFeedbackTimer() {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    return clearFeedbackTimer;
  }, []);

  if (variant === 'user') {
    return <Text selectable style={[styles.body, styles.userText]}>{content}</Text>;
  }

  if (streaming) {
    return <Text selectable style={[styles.body, styles.assistantText]}>{content}{trailingInline ?? null}</Text>;
  }
  if (renderWholeRichHtml) {
    return (
      <View style={styles.wrap}>
        <AiRichHtmlBlock html={content} key={getMessageRenderCacheKey(content)} />
        {trailingInline ? (
          <Text style={[styles.body, styles.assistantText]}>
            {trailingInline}
          </Text>
        ) : null}
      </View>
    );
  }
  const { blocks, footnotes, referenceLinks } = parsedMarkdown ?? getCachedMarkdownContent(content);

  const trailingTargetIndex = trailingInline
    ? blocks.reduce((targetIndex, block, index) => (block.type === 'hr' || block.type === 'image' ? targetIndex : index), -1)
    : -1;

  async function copyCodeBlock(blockKey: string, code: string) {
    try {
      await Clipboard.setStringAsync(code);
      setCopiedBlockKey(blockKey);
      setFeedback({ message: '代码已复制', tone: 'success' });
      clearFeedbackTimer();
      feedbackTimeoutRef.current = setTimeout(() => {
        setFeedback(null);
        feedbackTimeoutRef.current = null;
      }, 1600);
    } catch {
      setFeedback({ message: '复制失败', tone: 'error' });
    }
  }

  async function openSafeLink(url: string) {
    if (!isSafeLinkUrl(url)) {
      setFeedback({ message: '不支持打开该链接', tone: 'error' });
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setFeedback({ message: '链接打开失败', tone: 'error' });
    }
  }

  return (
    <View style={styles.wrap}>
      {feedback ? <AiInlineFeedback message={feedback.message} tone={feedback.tone} /> : null}
      {blocks.map((block, index) => {
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
                  <Text style={[styles.body, styles.assistantText, styles.listText]}>
                    {renderInlineText(item.text, [styles.body, styles.assistantText], openSafeLink, referenceLinks, footnotes)}
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
              <Text style={[styles.body, styles.quoteText]}>
                {renderInlineText(block.text, [styles.body, styles.quoteText], openSafeLink, referenceLinks, footnotes)}
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
          return <AiMathBlock key={key} math={block.math} />;
        }
        if (block.type === 'linkCard') {
          return <AiLinkPreviewCard key={key} url={block.url} />;
        }
        if (block.type === 'image') {
          return <AiMarkdownImage alt={block.alt} key={key} uri={block.uri} />;
        }
        if (block.type === 'code') {
          if (shouldRenderHtmlCodeBlock(block)) {
            return <AiRichHtmlBlock html={block.text} key={`${key}-${getMessageRenderCacheKey(block.text)}`} />;
          }
          return (
            <View key={key} style={styles.codeBlock}>
              <View style={styles.codeHeader}>
                <Text numberOfLines={1} style={styles.codeLanguage}>{block.language ?? 'code'}</Text>
                <Pressable
                  accessibilityLabel="复制代码块"
                  accessibilityRole="button"
                  hitSlop={spacing[2]}
                  onPress={() => void copyCodeBlock(key, block.text)}
                  style={({ pressed }) => [styles.codeCopyButton, pressed && styles.pressed]}
                >
                  <Ionicons color={aiLightColors.onDark} name={copiedBlockKey === key ? 'checkmark' : 'copy-outline'} size={14} />
                </Pressable>
              </View>
              <Text style={styles.codeText}>
                {block.text || ' '}
                {appendTrailingInline ? trailingInline : null}
              </Text>
            </View>
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
          return <AiRichHtmlBlock html={block.text} key={`${key}-${getMessageRenderCacheKey(block.text)}`} />;
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: rhythm.microGap,
    maxWidth: '100%',
  },
  body: {
    ...typography.textStyles.body,
    lineHeight: 22,
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
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
  },
  smallHeading: {
    fontSize: typography.size.body,
    lineHeight: 22,
  },
  inlineCode: {
    ...typography.textStyles.caption,
    backgroundColor: aiLightColors.surface,
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
    flex: 1,
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
    borderLeftColor: aiLightColors.primary,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing[2],
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
    width: '100%',
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
  codeText: {
    ...typography.textStyles.caption,
    color: aiLightColors.onDark,
    fontFamily: typography.family.mono,
    lineHeight: 20,
  },
  tableBlock: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    overflow: 'hidden',
    width: '100%',
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
    width: '100%',
  },
  richHtmlWebView: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.78,
  },
});
