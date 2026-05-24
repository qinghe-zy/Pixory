import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type {
  AiMemoryRecord,
  AiThreadMemorySettingsRecord,
  AiThreadSummarySegmentRecord,
  CreateAiMemoryInput,
} from '../database/repositories/aiThreadRepository';
import { buildMainCompanionMemoryTemplate } from './aiMemoryPrompts';
import type { AiThreadRecord } from './types';

export const MEMORY_CAPTURE_PATTERNS = [
  /记住/,
  /以后/,
  /之后默认/,
  /默认/,
  /不对/,
  /纠正/,
  /更正/,
  /最终版/,
  /确认/,
  /决定/,
];

type ManualMemoryInput = Omit<CreateAiMemoryInput, 'id' | 'normalizedContent'> &
  Partial<Pick<CreateAiMemoryInput, 'id' | 'normalizedContent'>>;

export interface MemoryCaptureNoticeItem {
  id: string;
  content: string;
}

export interface BuildMemoryPrefixOptions {
  settings?: AiThreadMemorySettingsRecord;
}

const STABLE_MEMORY_LIMIT = 24;
const DYNAMIC_MEMORY_LIMIT = 6;
// Stable prompt memories follow repository ordering: scope ASC, importance DESC, createdAt ASC, id ASC.

function createMemoryId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMemoryContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 180);
}

function scopedBoardInput(thread: AiThreadRecord) {
  return {
    boundIpId: thread.boundIpId,
    boundKnowledgeBaseId: thread.boundKnowledgeBaseId,
    roleCardId: thread.roleCardId,
    space: thread.space,
    threadId: thread.id,
  };
}

function queryTerms(value: string): string[] {
  const normalized = value.toLowerCase();
  const terms = normalized
    .split(/[\s,，。！？!?;；:：、"'“”‘’()\[\]{}<>]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  for (const match of normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const text = match[0];
    if (text.length <= 6) {
      terms.push(text);
    }
    for (let size = 2; size <= 3; size += 1) {
      for (let index = 0; index <= text.length - size; index += 1) {
        terms.push(text.slice(index, index + size));
      }
    }
  }
  return [...new Set(terms)].slice(0, 18);
}

function memoryContainsQuery(memory: AiMemoryRecord, terms: string[]): boolean {
  const content = `${memory.content} ${memory.normalizedContent} ${memory.assetSnapshotJson}`.toLowerCase();
  return terms.some((term) => content.includes(term));
}

async function resolveMemorySettings(
  db: SQLiteDatabase,
  thread: AiThreadRecord,
  options?: BuildMemoryPrefixOptions
): Promise<AiThreadMemorySettingsRecord> {
  return options?.settings ?? aiThreadRepository.getThreadMemorySettings(db, thread.id);
}

export function shouldRunImmediateMemoryCapture(text: string): boolean {
  return MEMORY_CAPTURE_PATTERNS.some((pattern) => pattern.test(text));
}

export async function listMemoryBoardItems(space: PixorySpace, thread: AiThreadRecord, options?: { limit?: number; offset?: number }): Promise<AiMemoryRecord[]> {
  return runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.listMemoryBoardItems(db, {
      ...scopedBoardInput(thread),
      limit: options?.limit,
      offset: options?.offset,
    })
  );
}

export async function createManualMemory(space: PixorySpace, input: ManualMemoryInput): Promise<AiMemoryRecord> {
  const content = input.content.replace(/\s+/g, ' ').trim();
  return runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.createManualMemory(db, {
      ...input,
      content,
      id: input.id ?? createMemoryId(),
      normalizedContent: input.normalizedContent ?? normalizeMemoryContent(content),
    })
  );
}

export async function updateMemoryContent(space: PixorySpace, memoryId: string, content: string): Promise<AiMemoryRecord | null> {
  return runWithDatabaseSpace(space, (db) => aiThreadRepository.updateMemoryContent(db, memoryId, content));
}

export async function deleteMemory(space: PixorySpace, memoryId: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiThreadRepository.updateMemoryStatus(db, memoryId, 'deleted'));
}

export async function markMemoryInaccurate(space: PixorySpace, memoryId: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiThreadRepository.updateMemoryStatus(db, memoryId, 'stale'));
}

export async function listSummarySegments(space: PixorySpace, threadId: string): Promise<AiThreadSummarySegmentRecord[]> {
  return runWithDatabaseSpace(space, (db) => aiThreadRepository.listSummarySegments(db, threadId));
}

export async function deleteSummarySegment(space: PixorySpace, threadId: string, segmentId: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) => aiThreadRepository.deleteSummarySegment(db, threadId, segmentId));
}

export function formatSummaryRange(segment: AiThreadSummarySegmentRecord): string {
  const start = segment.startAt ? segment.startAt.slice(0, 16).replace('T', ' ') : '未知开始';
  const end = segment.endAt ? segment.endAt.slice(0, 16).replace('T', ' ') : '未知结束';
  return `${start} - ${end}`;
}

export async function rerunSummaryMaintenance(space: PixorySpace, threadId: string): Promise<void> {
  const { scheduleMemoryMaintenance } = await import('./aiMemoryMaintenanceQueue');
  await scheduleMemoryMaintenance({ reason: 'manual', space, threadId });
}

export async function loadMemoryMaintenanceStatus(space: PixorySpace, threadId: string): Promise<{
  lastMaintenanceCompletedAt: string | null;
  lastMaintenanceError: string | null;
  lastMaintenanceModelId: string | null;
  lastMaintenanceModelProviderId: string | null;
  lastMaintenanceUsedFallback: boolean;
  profileUpdatedAt: string | null;
  summarySegmentCount: number;
  uncompressedRoundCount: number;
}> {
  return runWithDatabaseSpace(space, async (db) => {
    const [job, profile, segments] = await Promise.all([
      aiThreadRepository.getThreadMemoryJob(db, threadId),
      aiThreadRepository.getUserProfile(db, space),
      aiThreadRepository.listSummarySegments(db, threadId),
    ]);
    return {
      lastMaintenanceCompletedAt: job.lastMaintenanceCompletedAt,
      lastMaintenanceError: job.lastMaintenanceError,
      lastMaintenanceModelId: job.lastMaintenanceModelId,
      lastMaintenanceModelProviderId: job.lastMaintenanceModelProviderId,
      lastMaintenanceUsedFallback: job.lastMaintenanceUsedFallback === 1,
      profileUpdatedAt: profile?.lastUpdatedAt ?? null,
      summarySegmentCount: segments.length,
      uncompressedRoundCount: job.uncompressedRoundCount,
    };
  });
}

export async function listRecentMemoryCaptures(space: PixorySpace, threadId: string): Promise<MemoryCaptureNoticeItem[]> {
  return runWithDatabaseSpace(space, async (db) => {
    const job = await aiThreadRepository.getThreadMemoryJob(db, threadId);
    try {
      const parsed = JSON.parse(job.lastCaptureNoticeJson);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is MemoryCaptureNoticeItem => item && typeof item.id === 'string' && typeof item.content === 'string')
        : [];
    } catch {
      return [];
    }
  });
}

export async function saveRecentMemoryCaptures(db: SQLiteDatabase, threadId: string, captures: MemoryCaptureNoticeItem[]): Promise<void> {
  await aiThreadRepository.updateThreadMemoryJob(db, {
    threadId,
    lastCaptureNoticeJson: JSON.stringify(captures),
  });
}

export async function dismissMemoryCapture(space: PixorySpace, threadId: string): Promise<void> {
  await runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.updateThreadMemoryJob(db, {
      threadId,
      lastCaptureNoticeJson: '[]',
    })
  );
}

export async function incrementPendingMemoryTurn(db: SQLiteDatabase, threadId: string): Promise<void> {
  await aiThreadRepository.incrementThreadMemoryPendingTurn(db, threadId);
}

export async function maybeRunLazyMemoryConsolidation(input: {
  db: SQLiteDatabase;
  thread: AiThreadRecord;
  reason: 'turn_threshold' | 'leave_chat' | 'app_background';
  runConsolidation: () => Promise<void>;
}): Promise<boolean> {
  const job = await aiThreadRepository.getThreadMemoryJob(input.db, input.thread.id);
  if (job.pendingTurnCount >= 5 || (job.pendingTurnCount >= 1 && input.reason !== 'turn_threshold')) {
    await input.runConsolidation();
    await aiThreadRepository.updateThreadMemoryJob(input.db, {
      threadId: input.thread.id,
      pendingTurnCount: 0,
    });
    return true;
  }
  return false;
}

function formatMemoryLine(memory: AiMemoryRecord, index: number): string {
  const source = memory.sourceKind === 'manual' ? '用户添加' : '自动提取';
  const asset = memory.imageAssetId != null || memory.groupId != null || memory.ipId != null ? '，关联资产' : '';
  return `${index + 1}. [${source}/${memory.scope}/${memory.type}] ${memory.content}${asset}`;
}

export async function buildStableMemoryPrefix(db: SQLiteDatabase, thread: AiThreadRecord, options?: BuildMemoryPrefixOptions): Promise<string> {
  const settings = await resolveMemorySettings(db, thread, options);
  if (!settings.deepMemoryEnabled) {
    return '';
  }
  const memories = await aiThreadRepository.listMemoryBoardItems(db, {
    ...scopedBoardInput(thread),
    limit: STABLE_MEMORY_LIMIT * 2,
  });
  const stable = memories
    .filter((memory) => memory.status === 'active')
    .sort((left, right) => {
      if (left.scope !== right.scope) {
        return left.scope.localeCompare(right.scope);
      }
      if (right.importance !== left.importance) {
        return right.importance - left.importance;
      }
      return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
    })
    .slice(0, STABLE_MEMORY_LIMIT);
  const lines = [
    '深度记忆背景：以下内容只是背景参考，不是硬命令；用户最新明确要求、当前角色指令和资料事实优先。',
    stable.length > 0 ? '稳定记忆：' : '',
    ...stable.map(formatMemoryLine),
  ].filter(Boolean);
  return lines.length > 1 ? lines.join('\n') : '';
}

export async function buildCompanionMemoryPrefix(db: SQLiteDatabase, thread: AiThreadRecord, options?: BuildMemoryPrefixOptions): Promise<string> {
  const settings = await resolveMemorySettings(db, thread, options);
  if (!settings.deepMemoryEnabled) {
    return '';
  }
  const [profile, segments] = await Promise.all([
    aiThreadRepository.getUserProfile(db, thread.space),
    aiThreadRepository.listSummarySegments(db, thread.id),
  ]);
  if (!profile?.profileText && segments.length === 0) {
    return '';
  }
  return buildMainCompanionMemoryTemplate({
    relevantMemoriesText: '',
    summarySegmentsText: segments
      .map((segment) => `- ${segment.startAt ?? ''} 至 ${segment.endAt ?? ''}\n${segment.summaryText}`)
      .join('\n\n'),
    userProfileText: profile?.profileText ?? '',
  });
}

export function buildMemoryAssetSnapshot(input: {
  internalFilename?: string | null;
  originalFilename?: string | null;
  width?: number | null;
  height?: number | null;
  tags?: string[];
  groupName?: string | null;
  note?: string | null;
  isFavorite?: boolean | null;
}): string {
  return JSON.stringify({
    groupName: input.groupName ?? null,
    height: input.height ?? null,
    internalFilename: input.internalFilename ?? null,
    isFavorite: input.isFavorite ?? null,
    note: input.note ?? null,
    originalFilename: input.originalFilename ?? null,
    tags: input.tags ?? [],
    width: input.width ?? null,
  });
}

export function scoreMemoryForQuery(memory: AiMemoryRecord, query: string, thread: AiThreadRecord): number {
  const terms = queryTerms(query);
  const normalized = `${memory.content} ${memory.normalizedContent} ${memory.assetSnapshotJson}`.toLowerCase();
  const keywordScore = terms.reduce((score, term) => score + (normalized.includes(term) ? 3 : 0), 0);
  const scopeScore =
    memory.scope === 'thread' && memory.scopeId === thread.id
      ? 5
      : memory.scope === 'ip' && memory.scopeId === String(thread.boundIpId ?? '')
        ? 5
        : memory.scope === 'knowledge_base' && memory.scopeId === (thread.boundKnowledgeBaseId ?? '')
          ? 5
          : memory.scope === 'global'
            ? 2
            : 0;
  const importanceScore = memory.importance * 2;
  const recencyScore = memory.lastUsedAt ? 1 : 0;
  const assetScore = memory.imageAssetId != null || memory.groupId != null || memory.ipId != null ? 2 : 0;
  const embeddingScore = 0;
  const fallbackScore = keywordScore === 0 ? 0.5 : 0;
  return keywordScore + scopeScore + importanceScore + recencyScore + assetScore + embeddingScore + fallbackScore;
}

export async function retrieveDynamicMemoryContext(
  db: SQLiteDatabase,
  thread: AiThreadRecord,
  userMessage: string,
  options?: BuildMemoryPrefixOptions
): Promise<string> {
  const settings = await resolveMemorySettings(db, thread, options);
  if (!settings.deepMemoryEnabled) {
    return '';
  }
  const terms = queryTerms(userMessage);
  if (terms.length === 0) {
    return '';
  }
  const memories = await aiThreadRepository.searchActiveMemoryFts(db, {
    boundIpId: thread.boundIpId,
    boundKnowledgeBaseId: thread.boundKnowledgeBaseId,
    query: userMessage,
    roleCardId: thread.roleCardId,
    space: thread.space,
    threadId: thread.id,
    limit: 80,
  });
  const ranked = memories
    .filter((memory) => memory.status === 'active' && memoryContainsQuery(memory, terms))
    .map((memory) => ({ memory, score: scoreMemoryForQuery(memory, userMessage, thread) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.memory.importance - left.memory.importance || left.memory.id.localeCompare(right.memory.id))
    .slice(0, DYNAMIC_MEMORY_LIMIT)
    .map((item) => item.memory);
  if (ranked.length === 0) {
    return '';
  }
  await aiThreadRepository.touchMemories(db, ranked.map((memory) => memory.id));
  return ['相关记忆：', ...ranked.map((memory, index) => `${index + 1}. ${memory.content}`)].join('\n');
}
