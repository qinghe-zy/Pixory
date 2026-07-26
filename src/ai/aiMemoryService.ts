import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type {
  AiBranchScope,
  AiMemoryRecord,
  AiThreadMemorySettingsRecord,
  AiThreadSummarySegmentRecord,
  CreateAiMemoryInput,
} from '../database/repositories/aiThreadRepository';
import { buildMainCompanionMemoryTemplate } from './aiMemoryPrompts';
import type { AiThreadRecord } from './types';
import { compileMemoryUsageContract } from './memory/contextCompiler';
import { retrieveMemoryClaims } from './memory/memoryRetrievalService';
import { MemoryFacade } from './memory/memoryFacade';
import { resolveCalibratedConfidence } from './memory/memoryTypes';
import type { MemoryClaimRecord } from './memory/memoryTypes';
import { migrateLegacyMemoriesToV1 } from './memory/memoryMigrationService';
import { buildRelationalStateText } from './memory/memoryRelationalStateService';

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
  kind?: 'added' | 'updated' | 'staled' | 'conflict' | 'local_fallback';
  sourceMessageId?: string | null;
}

export interface BuildMemoryPrefixOptions {
  branchScopes?: AiBranchScope[];
  settings?: AiThreadMemorySettingsRecord;
}

const STABLE_MEMORY_LIMIT = 24;
const DYNAMIC_MEMORY_LIMIT = 6;
// Stable prompt memories use local scope priority before importance and creation time.

function createMemoryId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMemoryContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 180);
}

function mapV1ClaimToLegacyMemory(claim: MemoryClaimRecord): AiMemoryRecord {
  const scope = claim.scopeType === 'branch' ? 'thread' : claim.scopeType;
  const type: AiMemoryRecord['type'] = claim.predicate.startsWith('preference.')
    ? 'preference'
    : claim.predicate === 'decision'
      ? 'decision'
      : claim.predicate === 'task'
        ? 'task'
        : claim.predicate === 'commitment'
          ? 'instruction'
          : claim.speechMode === 'corrected'
            ? 'correction'
            : 'fact';
  return {
    assetSnapshotJson: '{}',
    confidence: resolveCalibratedConfidence(claim.confidenceCalibrated, claim.confidenceBand),
    content: claim.valueDisplay,
    createdAt: claim.createdAt,
    deletedAt: claim.deletedAt,
    groupId: null,
    id: claim.id,
    imageAssetId: null,
    importance: Math.max(1, Math.min(5, Math.round(claim.importance / 20))),
    ipId: scope === 'ip' && claim.scopeId ? Number(claim.scopeId) : null,
    lastReconciledAt: null,
    lastUsedAt: claim.lastUsedAt,
    mergeReason: claim.status === 'conflicted' ? '新版记忆存在冲突，回答前必须澄清。' : null,
    normalizedContent: claim.valueNormalized,
    reconcileSourceMessageId: null,
    space: claim.space,
    scope,
    scopeId: claim.scopeId,
    sourceKind: claim.sourceKind === 'manual' ? 'manual' : 'auto',
    sourceMessageId: claim.sourceMessageId,
    status: claim.status === 'stale' ? 'stale' : claim.status === 'deleted' ? 'deleted' : 'active',
    supersededByMemoryId: claim.supersededByClaimId,
    type,
    updatedAt: claim.updatedAt,
    mergedAt: null,
    memoryLane: claim.lane,
    memoryVersion: claim.version,
  };
}

async function listV1MemoryBoardItems(
  db: SQLiteDatabase,
  thread: AiThreadRecord,
  options?: { limit?: number; offset?: number; status?: AiMemoryRecord['status'] | 'all' }
): Promise<AiMemoryRecord[]> {
  const statusClause = options?.status === 'stale'
    ? `AND c.status = 'stale'`
    : options?.status === 'all'
      ? ''
      : `AND c.status NOT IN ('deleted', 'suppressed', 'superseded')`;
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT c.*
     FROM memory_claims c
     WHERE c.space = ?
       ${statusClause}
       AND (
         (c.scopeType = 'thread' AND c.scopeId = ?)
         OR (c.scopeType = 'role' AND c.scopeId = ?)
         OR (c.scopeType = 'ip' AND c.scopeId = ?)
         OR (c.scopeType = 'knowledge_base' AND c.scopeId = ?)
         OR c.scopeType = 'global'
       )
     ORDER BY c.lane ASC, c.importance DESC, c.updatedAt DESC
     LIMIT ? OFFSET ?`,
    thread.space,
    thread.id,
    thread.roleCardId,
    thread.boundIpId == null ? null : String(thread.boundIpId),
    thread.boundKnowledgeBaseId,
    options?.limit ?? 80,
    options?.offset ?? 0
  );
  return rows.map((row) => mapV1ClaimToLegacyMemory(row as unknown as MemoryClaimRecord));
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

export async function listMemoryBoardItems(space: PixorySpace, thread: AiThreadRecord, options?: { limit?: number; offset?: number; status?: AiMemoryRecord['status'] | 'all' }): Promise<AiMemoryRecord[]> {
  const initialV1Items = await runWithDatabaseSpace(space, (db) => listV1MemoryBoardItems(db, thread, options));
  if (initialV1Items.length > 0 || options?.status === 'stale' || options?.status === 'all') {
    return initialV1Items;
  }
  const migrated = await migrateLegacyMemoriesToV1(space);
  if (migrated > 0) {
    const migratedV1Items = await runWithDatabaseSpace(space, (db) => listV1MemoryBoardItems(db, thread, options));
    if (migratedV1Items.length > 0) {
      return migratedV1Items;
    }
  }
  return runWithDatabaseSpace(space, (db) =>
    aiThreadRepository.listMemoryBoardItems(db, {
      ...scopedBoardInput(thread),
      limit: options?.limit,
      offset: options?.offset,
      status: options?.status,
    })
  );
}

export async function createManualMemory(space: PixorySpace, input: ManualMemoryInput): Promise<AiMemoryRecord> {
  const content = input.content.replace(/\s+/g, ' ').trim();
  const claim = await MemoryFacade.createClaim({
    actor: 'user',
    confidenceBand: 'high',
    confidenceRaw: 1,
    importance: 90,
    kind: 'state',
    lane: 'confirmed',
    manualLocked: true,
    predicate: input.type === 'preference'
      ? 'preference.general'
      : input.type === 'instruction'
        ? 'preference.communication'
        : input.type === 'decision'
          ? 'decision'
          : 'fact.identity',
    scopeId: input.scopeId,
    scopeType: input.scope,
    sourceKind: 'manual',
    space,
    speechMode: 'corrected',
    stability: 'permanent',
    subjectDisplay: '用户',
    subjectEntityId: 'user',
    valueDisplay: content,
    valueNormalized: input.normalizedContent ?? normalizeMemoryContent(content),
  }, { actorId: 'user', source: 'memory_board' });
  return mapV1ClaimToLegacyMemory(claim);
}

export async function updateMemoryContent(space: PixorySpace, memoryId: string, content: string, expectedVersion?: number): Promise<AiMemoryRecord | null> {
  if (memoryId.startsWith('mclaim_')) {
    const current = await runWithDatabaseSpace(space, (db) =>
      db.getFirstAsync<Record<string, unknown>>('SELECT * FROM memory_claims WHERE id = ?', memoryId)
    );
    if (!current) {
      return null;
    }
    const claim = await MemoryFacade.editClaim({
      claimId: memoryId,
      patch: {
        kind: current.kind as MemoryClaimRecord['kind'],
        predicate: String(current.predicate),
        scopeId: (current.scopeId as string | null) ?? null,
        scopeType: current.scopeType as MemoryClaimRecord['scopeType'],
        space,
        valueDisplay: content.trim(),
        valueNormalized: normalizeMemoryContent(content),
      },
      space,
    }, { actorId: 'user', expectedVersion, source: 'memory_board' });
    return mapV1ClaimToLegacyMemory(claim);
  }
  return runWithDatabaseSpace(space, (db) => aiThreadRepository.updateMemoryContent(db, memoryId, content));
}

export async function deleteMemory(space: PixorySpace, memoryId: string, expectedVersion?: number): Promise<void> {
  if (memoryId.startsWith('mclaim_')) {
    await MemoryFacade.deleteClaim({ claimId: memoryId, space }, { actorId: 'user', expectedVersion, source: 'memory_board' });
    return;
  }
  await runWithDatabaseSpace(space, (db) => aiThreadRepository.updateMemoryStatus(db, memoryId, 'deleted'));
}

export async function confirmMemory(space: PixorySpace, memoryId: string, expectedVersion?: number): Promise<void> {
  if (memoryId.startsWith('mclaim_')) {
    await MemoryFacade.confirmClaim({ claimId: memoryId, space }, {
      actorId: 'user',
      expectedVersion,
      source: 'memory_board',
    });
    return;
  }
  const migrated = await migrateLegacyMemoriesToV1(space);
  if (migrated > 0) {
    const legacy = await runWithDatabaseSpace(space, (db) =>
      db.getFirstAsync<{ id: string }>('SELECT id FROM ai_memories WHERE id = ?', memoryId)
    );
    if (legacy) {
      const claimId = `mclaim_legacy_${memoryId}`;
    await MemoryFacade.confirmClaim({ claimId, space }, {
      actorId: 'user',
      expectedVersion,
        source: 'memory_board',
      }).catch(() => undefined);
    }
  }
}

export async function changeMemoryScope(
  space: PixorySpace,
  memoryId: string,
  scope: AiMemoryRecord['scope'],
  scopeId: string | null,
  expectedVersion?: number
): Promise<AiMemoryRecord | null> {
  if (memoryId.startsWith('mclaim_')) {
    const claim = await MemoryFacade.changeClaimScope({
      claimId: memoryId,
      scopeId,
      scopeType: scope,
      space,
    }, {
      actorId: 'user',
      expectedVersion,
      source: 'memory_board',
    });
    return mapV1ClaimToLegacyMemory(claim);
  }
  await migrateLegacyMemoriesToV1(space);
  const claimId = `mclaim_legacy_${memoryId}`;
  const claim = await MemoryFacade.changeClaimScope({
    claimId,
    scopeId,
    scopeType: scope,
    space,
  }, {
    actorId: 'user',
    expectedVersion,
    source: 'memory_board',
  }).catch(() => null);
  return claim ? mapV1ClaimToLegacyMemory(claim) : null;
}

export async function markMemoryInaccurate(space: PixorySpace, memoryId: string): Promise<void> {
  if (memoryId.startsWith('mclaim_')) {
    await MemoryFacade.suppressClaim({ claimId: memoryId, space }, { actorId: 'user', source: 'memory_board' });
    return;
  }
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
  ordinaryUncompressedRoundCount: number;
  protectedImportRoundCount: number;
}> {
  return runWithDatabaseSpace(space, async (db) => {
    const [job, thread, segments] = await Promise.all([
      aiThreadRepository.getThreadMemoryJob(db, threadId),
      aiThreadRepository.findThreadById(db, threadId),
      aiThreadRepository.listSummarySegments(db, threadId),
    ]);
    const profile = thread ? await aiThreadRepository.getUserProfile(db, space, null, thread.id) : null;
    const activeImportSessionId = await aiThreadRepository.resolveContinuityImportSessionIdForBranchScopes(db, threadId);
    const activeImportSession = activeImportSessionId
      ? await aiThreadRepository.findContinuityImportSessionById(db, activeImportSessionId)
      : null;
    const protectedImportRoundCount = activeImportSession
      && activeImportSession.rollbackState === 'available'
      && activeImportSession.reviewGateState !== 'rolled_back'
      ? Math.min(job.uncompressedRoundCount, Math.max(0, activeImportSession.parsedMessageCount))
      : 0;
    const ordinaryUncompressedRoundCount = Math.max(0, job.uncompressedRoundCount - protectedImportRoundCount);
    return {
      lastMaintenanceCompletedAt: job.lastMaintenanceCompletedAt,
      lastMaintenanceError: job.lastMaintenanceError,
      lastMaintenanceModelId: job.lastMaintenanceModelId,
      lastMaintenanceModelProviderId: job.lastMaintenanceModelProviderId,
      lastMaintenanceUsedFallback: job.lastMaintenanceUsedFallback === 1,
      profileUpdatedAt: profile?.lastUpdatedAt ?? null,
      summarySegmentCount: segments.length,
      uncompressedRoundCount: job.uncompressedRoundCount,
      ordinaryUncompressedRoundCount,
      protectedImportRoundCount,
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

export async function replaceRecentMemoryCaptures(space: PixorySpace, threadId: string, captures: MemoryCaptureNoticeItem[]): Promise<void> {
  await runWithDatabaseSpace(space, (db) => saveRecentMemoryCaptures(db, threadId, captures));
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

function shouldInjectMemoryIntoPrompt(memory: AiMemoryRecord): boolean {
  return memory.scope !== 'global' || memory.sourceKind === 'manual';
}

function getMemoryPromptPriority(memory: AiMemoryRecord, thread: AiThreadRecord): number {
  if (memory.scope === 'thread' && memory.scopeId === thread.id) {
    return 5;
  }
  if (memory.scope === 'ip' && thread.boundIpId != null && memory.scopeId === String(thread.boundIpId)) {
    return 4;
  }
  if (memory.scope === 'knowledge_base' && thread.boundKnowledgeBaseId && memory.scopeId === thread.boundKnowledgeBaseId) {
    return 3;
  }
  if (memory.scope === 'role' && memory.scopeId === thread.roleCardId) {
    return 2;
  }
  if (memory.scope === 'global' && memory.sourceKind === 'manual') {
    return 1;
  }
  return 0;
}

export async function buildStableMemoryPrefix(db: SQLiteDatabase, thread: AiThreadRecord, options?: BuildMemoryPrefixOptions): Promise<string> {
  const settings = await resolveMemorySettings(db, thread, options);
  if (!settings.deepMemoryEnabled) {
    return '';
  }
  // Stable prefixes must come from the v1 ledger. Reading the legacy board here
  // would allow stale pre-migration rows to bypass lane/status/conflict policy.
  const memories = await listV1MemoryBoardItems(db, thread, {
    limit: STABLE_MEMORY_LIMIT * 2,
  });
  const stable = memories
    .filter((memory) => memory.status === 'active' && shouldInjectMemoryIntoPrompt(memory))
    .map((memory) => ({ memory, priority: getMemoryPromptPriority(memory, thread) }))
    .filter((item) => item.priority > 0)
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }
      if (right.memory.importance !== left.memory.importance) {
        return right.memory.importance - left.memory.importance;
      }
      return left.memory.createdAt.localeCompare(right.memory.createdAt) || left.memory.id.localeCompare(right.memory.id);
    })
    .slice(0, STABLE_MEMORY_LIMIT)
    .map((item) => item.memory);
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
  const [profiles, segments, relationalStateText] = await Promise.all([
    aiThreadRepository.getUserProfiles(db, thread.space, { boundIpId: thread.boundIpId, boundThreadId: thread.id }),
    aiThreadRepository.listSummarySegments(db, thread.id, options?.branchScopes),
    buildRelationalStateText({ db, space: thread.space, threadId: thread.id }),
  ]);
  const globalProfile = profiles.find((p) => p.boundIpId == null && p.boundThreadId == null);
  const projectProfile = profiles.find((p) => p.boundIpId != null && p.boundThreadId == null);
  const threadProfile = profiles.find((p) => p.boundThreadId === thread.id);
  if (!globalProfile?.profileText && !projectProfile?.profileText && !threadProfile?.profileText && segments.length === 0 && !relationalStateText) {
    return '';
  }
  return buildMainCompanionMemoryTemplate({
    relevantMemoriesText: relationalStateText,
    summarySegmentsText: segments
      .map((segment) => `- ${segment.startAt ?? ''} 至 ${segment.endAt ?? ''}\n${segment.summaryText}`)
      .join('\n\n'),
    userProfileText: globalProfile?.profileText ?? '',
    projectProfileText: projectProfile?.profileText ?? '',
    threadProfileText: threadProfile?.profileText ?? '',
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
      ? 10
      : memory.scope === 'ip' && thread.boundIpId != null && memory.scopeId === String(thread.boundIpId)
        ? 10
        : memory.scope === 'knowledge_base' && thread.boundKnowledgeBaseId && memory.scopeId === thread.boundKnowledgeBaseId
          ? 10
          : memory.scope === 'global'
            ? 0.5
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
  try {
    const v1Claims = await retrieveMemoryClaims(db, {
      embeddingAvailable: false,
      limit: DYNAMIC_MEMORY_LIMIT,
      query: userMessage,
      space: thread.space,
      thread,
    });
    if (v1Claims.length > 0) {
      await MemoryFacade.touchClaims(
        thread.space,
        v1Claims.map((item) => item.claim.id)
      );
      return compileMemoryUsageContract(v1Claims);
    }
  } catch {
    // Legacy memory FTS remains the safe fallback during migration or on older databases.
  }
  const memories = await aiThreadRepository.searchActiveMemoryFts(db, {
    branchScopes: options?.branchScopes,
    boundIpId: thread.boundIpId,
    boundKnowledgeBaseId: thread.boundKnowledgeBaseId,
    query: userMessage,
    roleCardId: thread.roleCardId,
    space: thread.space,
    threadId: thread.id,
    limit: 80,
  });
  const ranked = memories
    .filter((memory) => memory.status === 'active' && shouldInjectMemoryIntoPrompt(memory) && memoryContainsQuery(memory, terms))
    .map((memory) => ({ memory, priority: getMemoryPromptPriority(memory, thread), score: scoreMemoryForQuery(memory, userMessage, thread) }))
    .filter((item) => item.priority > 0 && item.score > 0)
    .sort((left, right) => right.priority - left.priority || right.score - left.score || right.memory.importance - left.memory.importance || left.memory.id.localeCompare(right.memory.id))
    .slice(0, DYNAMIC_MEMORY_LIMIT)
    .map((item) => item.memory);
  if (ranked.length === 0) {
    return '';
  }
  await aiThreadRepository.touchMemories(db, ranked.map((memory) => memory.id));
  return ['相关记忆：', ...ranked.map((memory, index) => `${index + 1}. ${memory.content}`)].join('\n');
}
