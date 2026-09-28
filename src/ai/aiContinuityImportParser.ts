import type { AiContinuityImportSourceKind } from './aiContinuityImportTypes';

export interface ParsedContinuityTranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string | null;
}

export interface ParsedContinuityBlock {
  kind:
    | 'relationship_summary'
    | 'psychology'
    | 'biological_state'
    | 'state_continuity_summary'
    | 'compressed_history'
    | 'memory_candidates'
    | 'unknown';
  title: string;
  content: string;
}

export interface ParsedContinuityImportDocument {
  mode: AiContinuityImportSourceKind;
  messages: ParsedContinuityTranscriptMessage[];
  blocks: ParsedContinuityBlock[];
  rawText: string;
  containsCompressedContinuity: boolean;
  partial: boolean;
  sourcePlatform?: string | null;
  formatVersion?: string | null;
  nativePayload?: {
    branch?: Record<string, unknown> | null;
    messages?: ParsedContinuityTranscriptMessage[];
    summary?: Record<string, unknown> | null;
    memories?: Record<string, unknown>[] | null;
  };
}

const INLINE_ROLE_LABELS: Record<string, ParsedContinuityTranscriptMessage['role']> = {
  assistant: 'assistant',
  system: 'system',
  user: 'user',
  助手: 'assistant',
  用户: 'user',
  系统: 'system',
};

const EXTERNAL_SECTION_TITLES = [
  'Metadata',
  'Relationship Continuity',
  'Psychological Background',
  'Biological Or Physical State',
  'State Continuity Summary',
  'Long-Term Memory Candidates',
  'Compressed History',
  'Chat Transcript',
  '元数据',
  '关系连续性',
  '关系背景',
  '心理背景',
  '生物或身体状态',
  '生理或身体状态',
  '状态连续摘要',
  '长期记忆候选',
  '压缩历史',
  '聊天记录',
];

function normalizeHeadingTitle(value: string): string {
  return value.replace(/^#+\s*/, '').replace(/[:：]\s*$/, '').trim();
}

function classifyBlockKind(title: string): ParsedContinuityBlock['kind'] {
  const normalized = title.trim().toLowerCase();
  if (normalized.includes('relationship') || title.includes('关系')) {
    return 'relationship_summary';
  }
  if (
    normalized.includes('psychology')
    || normalized.includes('psychological')
    || title.includes('心理')
  ) {
    return 'psychology';
  }
  if (
    normalized.includes('biological')
    || normalized.includes('physical')
    || title.includes('生物')
    || title.includes('生理')
    || title.includes('身体')
  ) {
    return 'biological_state';
  }
  if (
    normalized.includes('state continuity')
    || normalized.includes('state summary')
    || title.includes('状态连续')
    || title.includes('状态摘要')
    || title.includes('场景连续')
  ) {
    return 'state_continuity_summary';
  }
  if (
    normalized.includes('compressed')
    || normalized.includes('history')
    || title.includes('压缩历史')
    || title.includes('历史压缩')
    || title.includes('早期历史')
  ) {
    return 'compressed_history';
  }
  if (normalized.includes('memory') || title.includes('记忆')) {
    return 'memory_candidates';
  }
  return 'unknown';
}

export function detectContinuityImportMode(text: string): { mode: AiContinuityImportSourceKind } {
  if (/^# Pixory Role Continuity Export/m.test(text) && /- Source:\s*pixory-native/i.test(text)) {
    return { mode: 'pixory_native_markdown' };
  }
  if (/^#|^##/m.test(text)) {
    return { mode: 'external_markdown' };
  }
  return { mode: 'external_text' };
}

function parseTranscriptLines(lines: string[]): ParsedContinuityTranscriptMessage[] {
  return lines.flatMap((line) => {
    const match = parseInlineTranscriptLine(line);
    if (!match) {
      return [];
    }
    return [{
      role: match.role,
      content: match.content,
      createdAt: null,
    }];
  });
}

function normalizeInlineRoleLabel(label: string): ParsedContinuityTranscriptMessage['role'] | null {
  return INLINE_ROLE_LABELS[label.trim().toLowerCase()] ?? INLINE_ROLE_LABELS[label.trim()] ?? null;
}

function parseInlineTranscriptLine(line: string): {
  role: ParsedContinuityTranscriptMessage['role'];
  content: string;
} | null {
  const match = /^\s*([A-Za-z\u4E00-\u9FFF]+)\s*[:：]\s*(.+?)\s*$/.exec(line);
  if (!match) {
    return null;
  }
  const role = normalizeInlineRoleLabel(match[1]);
  if (!role) {
    return null;
  }
  return {
    role,
    content: match[2].trim(),
  };
}

function parseInlineTranscriptRoleStart(line: string): ParsedContinuityTranscriptMessage['role'] | null {
  const match = /^\s*([A-Za-z\u4E00-\u9FFF]+)\s*[:：]\s*$/.exec(line);
  if (!match) {
    return null;
  }
  return normalizeInlineRoleLabel(match[1]);
}

function transcriptSectionPriority(title: string): number {
  const normalized = title.trim().toLowerCase();
  if (
    normalized.includes('chat transcript')
    || normalized.includes('transcript')
    || title.includes('聊天记录')
    || title.includes('全量聊天上下文')
    || title.includes('聊天上下文')
  ) {
    return 2;
  }
  if (
    normalized.includes('continue')
    || normalized.includes('previous round')
    || title.includes('续聊')
    || title.includes('上一轮')
  ) {
    return 1;
  }
  return 0;
}

function isTranscriptSectionTitle(title: string): boolean {
  return transcriptSectionPriority(title) > 0;
}

function isSkippableFallbackSection(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return (
    normalized.startsWith('native ')
    || normalized === 'export metadata'
    || title === '原生连续性元数据'
    || title === '导出元数据'
  );
}

function normalizeLooseSectionTitle(value: string): string {
  return value.replace(/[:：]\s*$/, '').trim();
}

function isExternalSectionTitle(value: string): boolean {
  const normalized = normalizeLooseSectionTitle(value).toLowerCase();
  return EXTERNAL_SECTION_TITLES.some((title) => title.toLowerCase() === normalized);
}

function parseLooseSectionHeading(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || /^#{1,6}\s+/.test(trimmed) || /^[-*]\s+/.test(trimmed) || /^```/.test(trimmed)) {
    return null;
  }
  if (!isExternalSectionTitle(trimmed)) {
    return null;
  }
  return normalizeLooseSectionTitle(trimmed);
}

function parseStructuredTranscriptHeading(line: string): {
  role: ParsedContinuityTranscriptMessage['role'];
  createdAt: string | null;
} | null {
  const match = /^###\s*\d+\.\s*([A-Za-z\u4E00-\u9FFF]+)(?:\s*[·•-]\s*(.+?))?\s*$/.exec(line.trim());
  if (!match) {
    return null;
  }
  const role = normalizeInlineRoleLabel(match[1]);
  if (!role) {
    return null;
  }
  return {
    role,
    createdAt: match[2]?.trim() || null,
  };
}

function parseFencedTextBlock(
  lines: string[],
  startIndex: number
): { content: string; nextIndex: number } | null {
  const opening = /^(`{3,})[^\r\n]*$/.exec(lines[startIndex]?.trim() ?? '');
  if (!opening) {
    return null;
  }
  const fence = opening[1];
  const contentLines: string[] = [];
  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === fence) {
      return {
        content: contentLines.join('\n').trim(),
        nextIndex: index + 1,
      };
    }
    contentLines.push(line);
    index += 1;
  }
  return null;
}

function parseTranscriptSection(lines: string[]): {
  messages: ParsedContinuityTranscriptMessage[];
  residueLines: string[];
} {
  const messages: ParsedContinuityTranscriptMessage[] = [];
  const residueLines: string[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    const structuredHeading = parseStructuredTranscriptHeading(trimmed);
    if (structuredHeading) {
      let nextIndex = index + 1;
      while (nextIndex < lines.length && !lines[nextIndex].trim()) {
        nextIndex += 1;
      }
      const fencedText = parseFencedTextBlock(lines, nextIndex);
      if (fencedText && fencedText.content) {
        messages.push({
          role: structuredHeading.role,
          content: fencedText.content,
          createdAt: structuredHeading.createdAt,
        });
        index = fencedText.nextIndex;
        continue;
      }
    }
    const match = parseInlineTranscriptLine(trimmed);
    if (match) {
      const contentLines = [match.content];
      let nextIndex = index + 1;
      while (nextIndex < lines.length) {
        const nextLine = lines[nextIndex];
        const nextTrimmed = nextLine.trim();
        if (!nextTrimmed) {
          break;
        }
        if (
          parseStructuredTranscriptHeading(nextTrimmed)
          || parseInlineTranscriptLine(nextTrimmed)
          || parseInlineTranscriptRoleStart(nextTrimmed)
        ) {
          break;
        }
        contentLines.push(nextLine);
        nextIndex += 1;
      }
      messages.push({
        role: match.role,
        content: contentLines.join('\n').trim(),
        createdAt: null,
      });
      index = nextIndex;
      continue;
    }
    const multilineRole = parseInlineTranscriptRoleStart(trimmed);
    if (multilineRole) {
      const contentLines: string[] = [];
      let nextIndex = index + 1;
      while (nextIndex < lines.length) {
        const nextLine = lines[nextIndex];
        const nextTrimmed = nextLine.trim();
        if (!nextTrimmed) {
          if (contentLines.length > 0) {
            break;
          }
          nextIndex += 1;
          continue;
        }
        if (
          parseStructuredTranscriptHeading(nextTrimmed)
          || parseInlineTranscriptLine(nextTrimmed)
          || parseInlineTranscriptRoleStart(nextTrimmed)
        ) {
          break;
        }
        contentLines.push(nextLine);
        nextIndex += 1;
      }
      if (contentLines.length > 0) {
        messages.push({
          role: multilineRole,
          content: contentLines.join('\n').trim(),
          createdAt: null,
        });
        index = nextIndex;
        continue;
      }
    }
    residueLines.push(line);
    index += 1;
  }
  return { messages, residueLines };
}

function extractDelimitedContinuityBody(text: string): string {
  const match = /PIXORY-CONTINUITY-BEGIN\s*([\s\S]*?)\s*PIXORY-CONTINUITY-END/i.exec(text);
  return match?.[1]?.trim() ?? text;
}

function normalizeSectionTitleForMetadata(title: string): string {
  return title.trim().toLowerCase();
}

function isMetadataSectionTitle(title: string): boolean {
  const normalized = normalizeSectionTitleForMetadata(title);
  return normalized === 'metadata' || normalized === '元数据';
}

function normalizeContinuityBlockContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return '';
  }
  if (/^(无|none)$/i.test(trimmed)) {
    return '无';
  }
  return trimmed;
}

function parseSectionedContinuityDocument(
  text: string,
  mode: 'external_markdown' | 'external_text'
): ParsedContinuityImportDocument | null {
  const body = extractDelimitedContinuityBody(text);
  const lines = body.split(/\r?\n/);
  const transcriptSections: Array<{
    messages: ParsedContinuityTranscriptMessage[];
    priority: number;
    residueLines: string[];
    title: string;
  }> = [];
  const blocks: ParsedContinuityBlock[] = [];
  let partial = false;
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flushSection = () => {
    if (!currentTitle) {
      currentLines = [];
      return;
    }
    const sectionText = normalizeContinuityBlockContent(currentLines.join('\n'));
    if (!sectionText) {
      currentLines = [];
      return;
    }
    if (isTranscriptSectionTitle(currentTitle)) {
      const parsedTranscript = parseTranscriptSection(currentLines);
      transcriptSections.push({
        title: currentTitle,
        priority: transcriptSectionPriority(currentTitle),
        messages: parsedTranscript.messages,
        residueLines: parsedTranscript.residueLines,
      });
    } else if (!isSkippableFallbackSection(currentTitle) && !isMetadataSectionTitle(currentTitle)) {
      blocks.push({
        kind: classifyBlockKind(currentTitle),
        title: currentTitle,
        content: sectionText,
      });
    }
    currentLines = [];
  };

  for (const rawLine of lines) {
    const markdownHeading = /^##\s+/.test(rawLine) ? normalizeHeadingTitle(rawLine) : null;
    const looseHeading = markdownHeading ? null : parseLooseSectionHeading(rawLine);
    const nextTitle = markdownHeading ?? looseHeading;
    if (nextTitle) {
      flushSection();
      currentTitle = nextTitle;
      continue;
    }
    if (currentTitle) {
      currentLines.push(rawLine);
    }
  }
  flushSection();

  if (transcriptSections.length === 0 && blocks.length === 0) {
    return null;
  }

  const selectedTranscriptPriority = transcriptSections.reduce(
    (max, section) => Math.max(max, section.messages.length > 0 ? section.priority : 0),
    0
  );
  const selectedTranscriptSections = transcriptSections.filter((section) =>
    selectedTranscriptPriority > 0
      ? section.priority === selectedTranscriptPriority
      : section.messages.length > 0 || section.residueLines.length > 0
  );
  const messages = dedupeTranscriptMessages(selectedTranscriptSections.flatMap((section) => section.messages));
  for (const section of selectedTranscriptSections) {
    const residue = section.residueLines.join('\n').trim();
    if (residue) {
      partial = true;
      blocks.push({
        kind: 'unknown',
        title: `${section.title}（未安全还原部分）`,
        content: residue,
      });
    }
  }

  return {
    mode,
    messages,
    blocks,
    rawText: text,
    containsCompressedContinuity: blocks.some((block) => block.kind === 'compressed_history'),
    partial,
    sourcePlatform: extractBulletMetadataValue(body, ['Source Platform', '来源平台']),
    formatVersion: extractBulletMetadataValue(body, ['Format Version', '格式版本']),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBulletMetadataValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const pattern = new RegExp(`^[-*]\\s*${escapeRegExp(label)}\\s*[:：]\\s*(.+)$`, 'im');
    const match = pattern.exec(text);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return null;
}

function dedupeTranscriptMessages(messages: ParsedContinuityTranscriptMessage[]): ParsedContinuityTranscriptMessage[] {
  const deduped: ParsedContinuityTranscriptMessage[] = [];
  for (const message of messages) {
    const previous = deduped[deduped.length - 1];
    if (
      previous
      && previous.role === message.role
      && previous.content === message.content
      && (previous.createdAt ?? null) === (message.createdAt ?? null)
    ) {
      continue;
    }
    deduped.push(message);
  }
  return deduped;
}

function containsCompressedContinuityText(text: string): boolean {
  return /compressed|summary/i.test(text) || /压缩|摘要/.test(text);
}

function parseNativeMessages(text: string): {
  ok: boolean;
  messages: ParsedContinuityTranscriptMessage[];
} {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      return { ok: false, messages: [] };
    }
    const messages: ParsedContinuityTranscriptMessage[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { ok: false, messages: [] };
      }
      const record = item as Record<string, unknown>;
      if (
        (record.role !== 'user' && record.role !== 'assistant' && record.role !== 'system')
        || typeof record.content !== 'string'
      ) {
        return { ok: false, messages: [] };
      }
      messages.push({
        role: record.role,
        content: record.content,
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
      });
    }
    return { ok: true, messages };
  } catch {
    return { ok: false, messages: [] };
  }
}

function parseNativeObjectPayload(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseNativeArrayPayload(text: string): Record<string, unknown>[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  } catch {
    return null;
  }
}

function fileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function parseExternalMarkdown(text: string): ParsedContinuityImportDocument {
  const sectioned = parseSectionedContinuityDocument(text, 'external_markdown');
  if (sectioned) {
    return sectioned;
  }
  const lines = text.split(/\r?\n/);
  const transcriptSections: Array<{
    messages: ParsedContinuityTranscriptMessage[];
    priority: number;
    residueLines: string[];
    title: string;
  }> = [];
  const blocks: ParsedContinuityBlock[] = [];
  let partial = false;
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flushSection = () => {
    if (!currentTitle) {
      currentLines = [];
      return;
    }
    const sectionText = currentLines.join('\n').trim();
    if (!sectionText) {
      currentLines = [];
      return;
    }
    if (isTranscriptSectionTitle(currentTitle)) {
      const parsedTranscript = parseTranscriptSection(currentLines);
      transcriptSections.push({
        title: currentTitle,
        priority: transcriptSectionPriority(currentTitle),
        messages: parsedTranscript.messages,
        residueLines: parsedTranscript.residueLines,
      });
    } else if (!isSkippableFallbackSection(currentTitle)) {
      blocks.push({
        kind: classifyBlockKind(currentTitle),
        title: currentTitle,
        content: sectionText,
      });
    }
    currentLines = [];
  };

  for (const rawLine of lines) {
    if (/^##\s+/.test(rawLine)) {
      flushSection();
      currentTitle = normalizeHeadingTitle(rawLine);
      continue;
    }
    if (currentTitle) {
      currentLines.push(rawLine);
    }
  }
  flushSection();

  const selectedTranscriptPriority = transcriptSections.reduce(
    (max, section) => Math.max(max, section.messages.length > 0 ? section.priority : 0),
    0
  );
  const selectedTranscriptSections = transcriptSections.filter((section) =>
    selectedTranscriptPriority > 0
      ? section.priority === selectedTranscriptPriority
      : section.messages.length > 0 || section.residueLines.length > 0
  );
  const messages = dedupeTranscriptMessages(selectedTranscriptSections.flatMap((section) => section.messages));
  for (const section of selectedTranscriptSections) {
    if (section.residueLines.length > 0) {
      partial = true;
      blocks.push({
        kind: 'unknown',
        title: `${section.title}（未安全还原部分）`,
        content: section.residueLines.join('\n').trim(),
      });
    }
  }

  return {
    mode: 'external_markdown',
    messages,
    blocks,
    rawText: text,
    containsCompressedContinuity: blocks.some((block) => block.kind === 'compressed_history'),
    partial,
    sourcePlatform: extractBulletMetadataValue(text, ['Source Platform', '来源平台']),
    formatVersion: extractBulletMetadataValue(text, ['Format Version', '格式版本']),
  };
}

function parseExternalText(text: string): ParsedContinuityImportDocument {
  const sectioned = parseSectionedContinuityDocument(text, 'external_text');
  if (sectioned) {
    return sectioned;
  }
  const transcript = parseTranscriptSection(extractDelimitedContinuityBody(text).split(/\r?\n/));
  const residue = transcript.residueLines.join('\n').trim();
  return {
    mode: 'external_text',
    messages: transcript.messages,
    blocks: residue
      ? [{
          kind: 'unknown',
          title: '未安全还原部分',
          content: residue,
        }]
      : [],
    rawText: text,
    containsCompressedContinuity: containsCompressedContinuityText(text),
    partial: residue.length > 0,
    sourcePlatform: extractBulletMetadataValue(text, ['Source Platform', '来源平台']),
    formatVersion: extractBulletMetadataValue(text, ['Format Version', '格式版本']),
  };
}

export function parseContinuityImportDocument(input: { fileName: string; text: string }): ParsedContinuityImportDocument {
  const extension = fileExtension(input.fileName);
  const mode = extension === 'txt'
    ? 'external_text'
    : detectContinuityImportMode(input.text).mode;
  if (mode === 'pixory_native_markdown') {
    const messagePayloadMatch = input.text.match(/## Native Message Payload\s+```json\s*([\s\S]*?)```/i);
    const branchPayloadMatch = input.text.match(/## Native Branch Payload\s+```json\s*([\s\S]*?)```/i);
    const summaryPayloadMatch = input.text.match(/## Native Summary Payload\s+```json\s*([\s\S]*?)```/i);
    const memoryPayloadMatch = input.text.match(/## Native Memory Payload\s+```json\s*([\s\S]*?)```/i);
    const parsedMessages = messagePayloadMatch?.[1] ? parseNativeMessages(messagePayloadMatch[1]) : { ok: false, messages: [] };
    const parsedBranch = branchPayloadMatch?.[1] ? parseNativeObjectPayload(branchPayloadMatch[1]) : null;
    const parsedSummary = summaryPayloadMatch?.[1] ? parseNativeObjectPayload(summaryPayloadMatch[1]) : null;
    const parsedMemories = memoryPayloadMatch?.[1] ? parseNativeArrayPayload(memoryPayloadMatch[1]) : null;
    if (parsedMessages.ok && parsedBranch && parsedSummary && parsedMemories) {
      return {
        mode,
        messages: parsedMessages.messages,
        blocks: [],
        rawText: input.text,
        containsCompressedContinuity: false,
        partial: false,
        sourcePlatform: 'Pixory',
        formatVersion: extractBulletMetadataValue(input.text, ['Format Version', '格式版本']),
        nativePayload: {
          branch: parsedBranch,
          messages: parsedMessages.messages,
          summary: parsedSummary,
          memories: parsedMemories,
        },
      };
    }
    return parseExternalMarkdown(input.text);
  }
  if (mode === 'external_markdown') {
    return parseExternalMarkdown(input.text);
  }
  return parseExternalText(input.text);
}
