import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  MemoryClaimRecord,
  MemoryConfidenceBand,
  MemorySpace,
} from './memoryTypes';
import type { AiBranchScope } from '../../database/repositories/aiThreadRepository';
import type { AiThreadRecord } from '../types';
import type { MemoryIntentObservation } from './memoryIntentDetector';

export const RETRIEVAL_SCORER_VERSION = 'retrieval-v1';
export const MEMORY_RETRIEVAL_MAX_CANDIDATES = 20;
export const MEMORY_RETRIEVAL_MAX_INJECTED = 6;
export const MEMORY_RETRIEVAL_THRESHOLD = 0.55;

function resolveCalibratedConfidence(
  confidenceCalibrated: number | null | undefined,
  confidenceBand: MemoryConfidenceBand
): number {
  if (confidenceCalibrated != null && Number.isFinite(confidenceCalibrated)) {
    return Math.max(0, Math.min(1, confidenceCalibrated));
  }
  return confidenceBand === 'high' ? 0.95 : confidenceBand === 'medium' ? 0.7 : 0.35;
}

export interface RetrievalScoreInput {
  lexical: number;
  semantic: number;
  temporalFit: number;
  continuityFit: number;
  importance: number;
  confidenceCalibrated: number | null;
  confidenceBand: MemoryConfidenceBand;
  stalePenalty: number;
  conflictPenalty: number;
  redundancyPenalty: number;
}

export interface RetrievalScoreResult {
  value: number;
  embeddingAvailable: boolean;
}

export function scoreMemoryClaim(
  input: RetrievalScoreInput,
  options: { embeddingAvailable: boolean }
): RetrievalScoreResult {
  const calibratedConfidence = resolveCalibratedConfidence(input.confidenceCalibrated, input.confidenceBand);
  const semantic = options.embeddingAvailable ? input.semantic : 0;
  const lexicalWeight = options.embeddingAvailable ? 0.30 : 0.40;
  const temporalWeight = options.embeddingAvailable ? 0.15 : 0.20;
  const continuityWeight = options.embeddingAvailable ? 0.15 : 0.20;
  const value = lexicalWeight * input.lexical
    + 0.20 * semantic
    + temporalWeight * input.temporalFit
    + continuityWeight * input.continuityFit
    + 0.10 * input.importance
    + 0.10 * calibratedConfidence
    - 0.40 * input.stalePenalty
    - 0.50 * input.conflictPenalty
    - 0.25 * input.redundancyPenalty;
  return {
    embeddingAvailable: options.embeddingAvailable,
    value: Math.max(0, Math.min(1, value)),
  };
}

export function shouldAdmitMemoryCandidate(
  input: Pick<RetrievalScoreInput, 'lexical' | 'semantic'>,
  options: { embeddingAvailable: boolean }
): boolean {
  if (input.lexical > 0) {
    return true;
  }
  return options.embeddingAvailable && input.semantic >= 0.45;
}

function queryTerms(query: string): string[] {
  const normalized = query.toLocaleLowerCase('zh-CN').replace(/\s+/gu, ' ').trim();
  const terms = normalized
    .split(/[\s,，。！？!?;；:：、"'“”‘’()\[\]{}<>]+/u)
    .filter((term) => term.length >= 2);
  for (const match of normalized.matchAll(/[\u4e00-\u9fff]{2,}/gu)) {
    const text = match[0];
    terms.push(text);
    for (let size = 2; size <= Math.min(3, text.length); size += 1) {
      for (let index = 0; index <= text.length - size; index += 1) {
        terms.push(text.slice(index, index + size));
      }
    }
  }
  return [...new Set(terms)].slice(0, 24);
}

function scopeAllowed(claim: MemoryClaimRecord, thread: AiThreadRecord, branchScopes: AiBranchScope[] = []): boolean {
  if (claim.scopeType === 'thread') {
    return claim.scopeId === thread.id;
  }
  if (claim.scopeType === 'role') {
    return claim.scopeId === thread.roleCardId;
  }
  if (claim.scopeType === 'ip') {
    return thread.boundIpId != null && claim.scopeId === String(thread.boundIpId);
  }
  if (claim.scopeType === 'knowledge_base') {
    return Boolean(thread.boundKnowledgeBaseId && claim.scopeId === thread.boundKnowledgeBaseId);
  }
  if (claim.scopeType === 'branch') {
    return branchScopes.some((scope) => claim.scopeId === `${scope.branchRootMessageId}:${scope.branchVersionIndex}`);
  }
  return claim.scopeType === 'global';
}

export async function resolveMemoryIntentTargetClaimIds(
  db: SQLiteDatabase,
  input: {
    thread: AiThreadRecord;
    observation: MemoryIntentObservation;
    limit?: number;
    branchScopes?: AiBranchScope[];
  }
): Promise<string[]> {
  if (
    (input.observation.intent !== 'forget' && input.observation.intent !== 'correction')
    || !input.observation.targetText
  ) {
    return [];
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM memory_claims
     WHERE space = ? AND status NOT IN ('deleted', 'suppressed', 'superseded', 'stale')
     ORDER BY updatedAt DESC
     LIMIT 64`,
    input.thread.space
  );
  const claims = rows.map(mapClaimRow).filter((claim) => scopeAllowed(claim, input.thread, input.branchScopes));
  const deictic = /(?:这个|这件事|刚才|上条|那件事)/u.test(input.observation.targetText);
  if (deictic) {
    return claims
      .filter((claim) => claim.scopeType === 'thread' && claim.scopeId === input.thread.id)
      .slice(0, 1)
      .map((claim) => claim.id);
  }
  const terms = queryTerms(
    input.observation.targetText
      .replace(/(?:忘掉|忘记|别记|不要记住|清除|删除|纠正|更正|改成|不是|不再|我现在|以后不要)/gu, ' ')
  );
  return claims
    .map((claim) => ({ claim, score: lexicalScore(claim, terms) }))
    .filter((item) => item.score >= 0.25)
    .sort((left, right) => right.score - left.score || right.claim.updatedAt.localeCompare(left.claim.updatedAt))
    .slice(0, input.limit ?? 3)
    .map((item) => item.claim.id);
}

function lexicalScore(claim: MemoryClaimRecord, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }
  const text = `${claim.valueDisplay} ${claim.valueNormalized} ${claim.predicate}`.toLocaleLowerCase('zh-CN');
  const hits = terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
  return Math.min(1, hits / Math.max(2, Math.min(terms.length, 4)));
}

function continuityScore(claim: MemoryClaimRecord, thread: AiThreadRecord): number {
  return claim.scopeType === 'thread' && claim.scopeId === thread.id ? 1
    : claim.scopeType === 'role' && claim.scopeId === thread.roleCardId ? 0.9
      : claim.scopeType === 'ip' ? 0.8
        : 0.5;
}

function importanceScore(claim: MemoryClaimRecord): number {
  return Math.max(0, Math.min(1, claim.importance / 100));
}

function mapClaimRow(row: Record<string, unknown>): MemoryClaimRecord {
  return {
    actor: row.actor as MemoryClaimRecord['actor'],
    canonicalClaimId: String(row.canonicalClaimId),
    confidenceBand: row.confidenceBand as MemoryClaimRecord['confidenceBand'],
    confidenceCalibrated: row.confidenceCalibrated == null ? null : Number(row.confidenceCalibrated),
    confidenceRaw: Number(row.confidenceRaw),
    createdAt: String(row.createdAt),
    deletedAt: (row.deletedAt as string | null) ?? null,
    id: String(row.id),
    importance: Number(row.importance),
    kind: row.kind as MemoryClaimRecord['kind'],
    lane: row.lane as MemoryClaimRecord['lane'],
    lastUsedAt: (row.lastUsedAt as string | null) ?? null,
    manualLocked: Number(row.manualLocked) === 1,
    ontologyVersion: String(row.ontologyVersion),
    polarity: row.polarity as MemoryClaimRecord['polarity'],
    predicate: String(row.predicate),
    projectionVersion: Number(row.projectionVersion),
    rawTimePhrase: (row.rawTimePhrase as string | null) ?? null,
    relatedClaimGroupId: (row.relatedClaimGroupId as string | null) ?? null,
    safetyState: row.safetyState as MemoryClaimRecord['safetyState'],
    schemaVersion: Number(row.schemaVersion),
    scopeId: (row.scopeId as string | null) ?? null,
    scopeType: row.scopeType as MemoryClaimRecord['scopeType'],
    space: row.space as MemorySpace,
    speechMode: row.speechMode as MemoryClaimRecord['speechMode'],
    stability: row.stability as MemoryClaimRecord['stability'],
    status: row.status as MemoryClaimRecord['status'],
    subjectDisplay: String(row.subjectDisplay),
    subjectEntityId: String(row.subjectEntityId),
    supersededByClaimId: (row.supersededByClaimId as string | null) ?? null,
    updatedAt: String(row.updatedAt),
    validFrom: (row.validFrom as string | null) ?? null,
    validPrecision: row.validPrecision as MemoryClaimRecord['validPrecision'],
    validTo: (row.validTo as string | null) ?? null,
    valueDisplay: String(row.valueDisplay),
    valueNormalized: String(row.valueNormalized),
    version: Number(row.version),
    sourceKind: row.sourceKind as MemoryClaimRecord['sourceKind'],
    sourceMessageId: (row.sourceMessageId as string | null) ?? null,
    extractorVersion: String(row.extractorVersion),
  };
}

export interface RetrievedMemoryClaim {
  claim: MemoryClaimRecord;
  score: number;
  certainty: MemoryConfidenceBand;
  usage: 'assert' | 'hedge' | 'ask_before_action' | 'do_not_use';
  evidenceIds: string[];
}

export interface MemoryRetrievalDiagnostics {
  candidateClaimIds: string[];
  omittedClaimIds: string[];
  selected: RetrievedMemoryClaim[];
}

export function shouldRetrieveMemory(query: string): boolean {
  const normalized = query.replace(/\s+/gu, '').trim();
  if (normalized.length < 2) {
    return false;
  }
  if (/^(哈哈|嗯嗯|哦哦|好的|好呀|谢谢|晚安|早安)[。！!？?]*$/u.test(normalized)) {
    return false;
  }
  return queryTerms(query).length > 0;
}

export async function retrieveMemoryClaims(
  db: SQLiteDatabase,
  input: {
    space: MemorySpace;
    thread: AiThreadRecord;
    query: string;
    branchScopes?: AiBranchScope[];
    limit?: number;
    embeddingAvailable?: boolean;
  }
): Promise<RetrievedMemoryClaim[]> {
  return (await retrieveMemoryClaimsWithDiagnostics(db, input)).selected;
}

export async function retrieveMemoryClaimsWithDiagnostics(
  db: SQLiteDatabase,
  input: {
    space: MemorySpace;
    thread: AiThreadRecord;
    query: string;
    branchScopes?: AiBranchScope[];
    limit?: number;
    embeddingAvailable?: boolean;
    excludedClaimIds?: string[];
    includeStale?: boolean;
  }
): Promise<MemoryRetrievalDiagnostics> {
  if (!shouldRetrieveMemory(input.query)) {
    return { candidateClaimIds: [], omittedClaimIds: [], selected: [] };
  }
  const terms = queryTerms(input.query);
  let ftsIds: string[] = [];
  if (terms.length > 0) {
    const ftsQuery = terms.map((term) => `"${term.replace(/"/gu, ' ')}"*`).join(' OR ');
    ftsIds = (await db.getAllAsync<{ id: string }>(
      `SELECT id FROM ai_memory_fts
       WHERE ai_memory_fts MATCH ? AND space = ?
       LIMIT ?`,
      ftsQuery,
      input.space,
      MEMORY_RETRIEVAL_MAX_CANDIDATES * 3
    ).catch(() => [])).map((row) => row.id);
  }
  const rows = ftsIds.length > 0
    ? await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM memory_claims
       WHERE space = ? AND id IN (${ftsIds.map(() => '?').join(', ')})
         AND status NOT IN ('deleted', 'suppressed', 'superseded')
         ${input.includeStale ? '' : `AND status <> 'stale'`}
       ORDER BY importance DESC, updatedAt DESC`,
      input.space,
      ...ftsIds
    )
    : await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM memory_claims
       WHERE space = ? AND status NOT IN ('deleted', 'suppressed', 'superseded')
         ${input.includeStale ? '' : `AND status <> 'stale'`}
       ORDER BY importance DESC, updatedAt DESC
       LIMIT ?`,
      input.space,
      MEMORY_RETRIEVAL_MAX_CANDIDATES * 3
    );
  const embeddingAvailable = input.embeddingAvailable ?? false;
  const grouped = new Set<string>();
  const excluded = new Set(input.excludedClaimIds ?? []);
  const ranked = rows
    .map(mapClaimRow)
    .filter((claim) => scopeAllowed(claim, input.thread, input.branchScopes) && !excluded.has(claim.id))
    .map((claim) => ({
      claim,
      lexical: lexicalScore(claim, terms),
      semantic: 0,
    }))
    .filter((item) => shouldAdmitMemoryCandidate(item, { embeddingAvailable }))
    .map(({ claim, lexical, semantic }) => {
      const score = scoreMemoryClaim({
        conflictPenalty: claim.status === 'conflicted' ? 1 : 0,
        continuityFit: continuityScore(claim, input.thread),
        confidenceBand: claim.confidenceBand,
        confidenceCalibrated: claim.confidenceCalibrated,
        importance: importanceScore(claim),
        lexical,
        redundancyPenalty: grouped.has(claim.canonicalClaimId) ? 1 : 0,
        semantic,
        stalePenalty: claim.status === 'stale' ? 1 : 0,
        temporalFit: claim.validTo && claim.validTo < new Date().toISOString() ? 0 : 1,
      }, { embeddingAvailable });
      return {
        claim,
        evidenceIds: [] as string[],
        score: score.value,
        certainty: claim.confidenceBand,
        usage: claim.safetyState === 'safety_pending'
          ? 'ask_before_action'
          : claim.status === 'conflicted'
            ? 'ask_before_action'
            : claim.confidenceBand === 'high' && claim.status === 'confirmed'
              ? 'assert'
              : claim.confidenceBand === 'low' ? 'hedge' : 'hedge',
      } satisfies RetrievedMemoryClaim;
    })
    .sort((left, right) => right.score - left.score || right.claim.importance - left.claim.importance);
  const candidateClaimIds = ranked.map((item) => item.claim.id);
  const selected = ranked
    .filter((item) => item.score >= MEMORY_RETRIEVAL_THRESHOLD && item.score > 0)
    .filter((item) => {
      if (grouped.has(item.claim.canonicalClaimId)) {
        return false;
      }
      grouped.add(item.claim.canonicalClaimId);
      return true;
    })
    .slice(0, Math.min(input.limit ?? MEMORY_RETRIEVAL_MAX_INJECTED, MEMORY_RETRIEVAL_MAX_INJECTED));
  if (selected.length > 0) {
    const eventRows = await db.getAllAsync<{ aggregateId: string; evidenceIdsJson: string }>(
      `SELECT aggregateId, evidenceIdsJson
       FROM memory_events
       WHERE space = ?
         AND aggregateId IN (${selected.map(() => '?').join(', ')})
       ORDER BY projectionVersion ASC`,
      input.space,
      ...selected.map((item) => item.claim.id)
    );
    const evidenceByClaim = new Map<string, Set<string>>();
    for (const row of eventRows) {
      let ids: unknown = [];
      try {
        ids = JSON.parse(row.evidenceIdsJson);
      } catch {
        ids = [];
      }
      if (!Array.isArray(ids)) {
        continue;
      }
      const set = evidenceByClaim.get(row.aggregateId) ?? new Set<string>();
      ids.filter((id): id is string => typeof id === 'string').forEach((id) => set.add(id));
      evidenceByClaim.set(row.aggregateId, set);
    }
    selected.forEach((item) => {
      item.evidenceIds = [...(evidenceByClaim.get(item.claim.id) ?? [])];
    });
  }
  const selectedIds = new Set(selected.map((item) => item.claim.id));
  return {
    candidateClaimIds,
    omittedClaimIds: candidateClaimIds.filter((id) => !selectedIds.has(id)),
    selected,
  };
}

export function formatMemoryUsageBlock(item: RetrievedMemoryClaim): string {
  return [
    '[MEMORY]',
    `id=${item.claim.id}`,
    `status=${item.claim.status}`,
    `certainty=${item.certainty}`,
    `usage=${item.usage}`,
    `scope=${item.claim.scopeType}:${item.claim.scopeId ?? '∅'}`,
    `validTime=${item.claim.validFrom ?? 'unknown'}..${item.claim.validTo ?? 'open'}`,
    `evidenceIds=${item.evidenceIds.join(',') || 'none'}`,
    `content=${item.claim.valueDisplay}`,
    '[/MEMORY]',
  ].join('\n');
}

export const MemoryRetrievalService = {
  formatMemoryUsageBlock,
  retrieveMemoryClaims,
  retrieveMemoryClaimsWithDiagnostics,
  resolveIntentTargetClaimIds: resolveMemoryIntentTargetClaimIds,
  scoreMemoryClaim,
  shouldAdmitMemoryCandidate,
  shouldRetrieveMemory,
};
