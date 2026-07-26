import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { PixorySpace } from '../../database';
import { createTimestamp } from '../../database/utils';
import type { AiThreadRecord } from '../types';
import type { MemoryClaimInput } from './memoryTypes';

export const NATIVE_MEMORY_PACKAGE_PROTOCOL = 'pixory-memory-package';
export const NATIVE_MEMORY_PACKAGE_SCHEMA_VERSION = 2;

export interface NativeMemoryPackage {
  protocol: typeof NATIVE_MEMORY_PACKAGE_PROTOCOL;
  schemaVersion: 2;
  packageId: string;
  exporterVersion: string;
  sourceSpace: PixorySpace;
  createdAt: string;
  thread: Record<string, unknown> | null;
  messages: Array<Record<string, unknown>>;
  branchRoutes: Array<Record<string, unknown>>;
  memoryEvents: Array<Record<string, unknown>>;
  claims: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  episodes: Array<Record<string, unknown>>;
  relationalStates: Array<Record<string, unknown>>;
  profiles: Array<Record<string, unknown>>;
  summaries: Array<Record<string, unknown>>;
  tombstones: Array<Record<string, unknown>>;
  idMap: Array<Record<string, unknown>>;
}

function hashPackage(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}

function toRecordArray(rows: unknown[]): Array<Record<string, unknown>> {
  return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
}

function stripSensitiveMessageFields(row: Record<string, unknown>): Record<string, unknown> {
  return {
    branchRootMessageId: row.branchRootMessageId ?? null,
    branchVersionIndex: row.branchVersionIndex ?? null,
    content: typeof row.content === 'string' ? row.content : '',
    createdAt: row.createdAt ?? null,
    id: row.id ?? null,
    role: row.role ?? null,
    status: row.status ?? null,
  };
}

export async function buildNativeMemoryPackage(
  db: SQLiteDatabase,
  input: {
    space: PixorySpace;
    thread: AiThreadRecord | null;
    branchScopes?: Array<{ branchRootMessageId: string; branchVersionIndex: number }>;
    exporterVersion?: string;
  }
): Promise<NativeMemoryPackage> {
  const createdAt = createTimestamp();
  const [messages, events, claims, evidence, episodes, relations, profiles, summaries, tombstones] = await Promise.all([
    input.thread
      ? db.getAllAsync<Record<string, unknown>>(
        `SELECT id, role, status, content, createdAt, branchRootMessageId, branchVersionIndex
         FROM ai_messages WHERE threadId = ? AND role IN ('user', 'assistant')
         ORDER BY createdAt ASC`,
        input.thread.id
      )
      : Promise.resolve([]),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM memory_events WHERE space = ? ORDER BY projectionVersion ASC, eventVersion ASC', input.space),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM memory_claims WHERE space = ? ORDER BY updatedAt ASC', input.space),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM memory_evidence WHERE space = ? ORDER BY createdAt ASC', input.space),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM memory_episodes WHERE space = ? ORDER BY updatedAt ASC', input.space),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM memory_relational_states WHERE space = ? ORDER BY updatedAt ASC', input.space),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM memory_profiles WHERE space = ? ORDER BY updatedAt ASC', input.space),
    input.thread
      ? db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM ai_thread_summary_segments WHERE threadId = ? ORDER BY startAt ASC',
        input.thread.id
      )
      : Promise.resolve([]),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM memory_deletion_certificates WHERE space = ? ORDER BY createdAt ASC', input.space),
  ]);
  const branchRoutes = input.branchScopes?.map((scope) => ({ ...scope })) ?? [];
  const packageSeed = [
    input.space,
    input.thread?.id ?? 'none',
    createdAt,
    messages.map((row) => row.id).join(','),
    claims.map((row) => row.id).join(','),
  ].join('\u001F');
  const packageId = `pkg_${hashPackage(packageSeed).slice(0, 32)}`;
  return {
    branchRoutes,
    claims: toRecordArray(claims),
    createdAt,
    episodes: toRecordArray(episodes),
    evidence: toRecordArray(evidence),
    exporterVersion: input.exporterVersion ?? 'pixory-memory-v2',
    idMap: [],
    memoryEvents: toRecordArray(events),
    messages: messages.map(stripSensitiveMessageFields),
    packageId,
    profiles: toRecordArray(profiles),
    protocol: NATIVE_MEMORY_PACKAGE_PROTOCOL,
    relationalStates: toRecordArray(relations),
    schemaVersion: NATIVE_MEMORY_PACKAGE_SCHEMA_VERSION,
    sourceSpace: input.space,
    summaries: toRecordArray(summaries),
    thread: input.thread
      ? {
        boundIpId: input.thread.boundIpId,
        boundKnowledgeBaseId: input.thread.boundKnowledgeBaseId,
        contextType: input.thread.contextType,
        currentBranchRootMessageId: input.thread.currentBranchRootMessageId,
        currentBranchVersionIndex: input.thread.currentBranchVersionIndex,
        id: input.thread.id,
        roleCardId: input.thread.roleCardId,
        title: input.thread.title,
      }
      : null,
    tombstones: toRecordArray(tombstones),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseNativeMemoryPackage(text: string): NativeMemoryPackage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  if (parsed.protocol !== NATIVE_MEMORY_PACKAGE_PROTOCOL || parsed.schemaVersion !== NATIVE_MEMORY_PACKAGE_SCHEMA_VERSION) {
    return null;
  }
  const arrayFields = ['messages', 'branchRoutes', 'memoryEvents', 'claims', 'evidence', 'episodes', 'relationalStates', 'profiles', 'summaries', 'tombstones', 'idMap'];
  if (
    typeof parsed.packageId !== 'string'
    || (parsed.sourceSpace !== 'normal' && parsed.sourceSpace !== 'personal')
    || arrayFields.some((field) => !Array.isArray(parsed[field]))
  ) {
    return null;
  }
  return {
    branchRoutes: toRecordArray(parsed.branchRoutes as unknown[]),
    claims: toRecordArray(parsed.claims as unknown[]),
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : createTimestamp(),
    episodes: toRecordArray(parsed.episodes as unknown[]),
    evidence: toRecordArray(parsed.evidence as unknown[]),
    exporterVersion: typeof parsed.exporterVersion === 'string' ? parsed.exporterVersion : 'unknown',
    idMap: toRecordArray(parsed.idMap as unknown[]),
    memoryEvents: toRecordArray(parsed.memoryEvents as unknown[]),
    messages: toRecordArray(parsed.messages as unknown[]),
    packageId: parsed.packageId,
    profiles: toRecordArray(parsed.profiles as unknown[]),
    protocol: NATIVE_MEMORY_PACKAGE_PROTOCOL,
    relationalStates: toRecordArray(parsed.relationalStates as unknown[]),
    schemaVersion: 2,
    sourceSpace: parsed.sourceSpace,
    summaries: toRecordArray(parsed.summaries as unknown[]),
    thread: isRecord(parsed.thread) ? parsed.thread : null,
    tombstones: toRecordArray(parsed.tombstones as unknown[]),
  };
}

export function nativeClaimToMemoryInput(
  claim: Record<string, unknown>,
  space: PixorySpace
): MemoryClaimInput | null {
  if (
    typeof claim.id !== 'string'
    || typeof claim.canonicalClaimId !== 'string'
    || typeof claim.predicate !== 'string'
    || typeof claim.valueNormalized !== 'string'
    || typeof claim.valueDisplay !== 'string'
    || typeof claim.scopeType !== 'string'
    || typeof claim.kind !== 'string'
  ) {
    return null;
  }
  return {
    actor: claim.actor === 'companion' || claim.actor === 'joint' ? claim.actor : 'user',
    canonicalClaimId: claim.canonicalClaimId,
    confidenceBand: claim.confidenceBand === 'high' || claim.confidenceBand === 'low' ? claim.confidenceBand : 'medium',
    confidenceCalibrated: typeof claim.confidenceCalibrated === 'number' ? claim.confidenceCalibrated : null,
    confidenceRaw: typeof claim.confidenceRaw === 'number' ? claim.confidenceRaw : 0.7,
    id: claim.id,
    importance: typeof claim.importance === 'number' ? claim.importance : 30,
    kind: claim.kind === 'episode' || claim.kind === 'task' || claim.kind === 'commitment' || claim.kind === 'relational_signal'
      ? claim.kind
      : 'state',
    lane: claim.lane === 'confirmed' || claim.lane === 'archive' ? claim.lane : 'working',
    manualLocked: claim.manualLocked === true || claim.manualLocked === 1,
    ontologyVersion: typeof claim.ontologyVersion === 'string' ? claim.ontologyVersion : 'ontology-v1',
    polarity: claim.polarity === 'negative' || claim.polarity === 'unknown' ? claim.polarity : 'positive',
    predicate: claim.predicate,
    scopeId: typeof claim.scopeId === 'string' ? claim.scopeId : null,
    scopeType: claim.scopeType as MemoryClaimInput['scopeType'],
    sourceKind: 'import',
    sourceMessageId: typeof claim.sourceMessageId === 'string' ? claim.sourceMessageId : null,
    space,
    speechMode: claim.speechMode === 'corrected' ? 'corrected' : 'asserted',
    stability: claim.stability === 'permanent' || claim.stability === 'long' || claim.stability === 'ephemeral'
      ? claim.stability
      : 'short',
    subjectDisplay: typeof claim.subjectDisplay === 'string' ? claim.subjectDisplay : '用户',
    subjectEntityId: typeof claim.subjectEntityId === 'string' ? claim.subjectEntityId : 'user',
    validFrom: typeof claim.validFrom === 'string' ? claim.validFrom : null,
    validPrecision: claim.validPrecision === 'exact' || claim.validPrecision === 'day' || claim.validPrecision === 'month' || claim.validPrecision === 'relative'
      ? claim.validPrecision
      : 'unknown',
    validTo: typeof claim.validTo === 'string' ? claim.validTo : null,
    valueDisplay: claim.valueDisplay,
    valueNormalized: claim.valueNormalized,
  };
}

export const NativeMemoryPackage = {
  build: buildNativeMemoryPackage,
  parse: parseNativeMemoryPackage,
  toMemoryInput: nativeClaimToMemoryInput,
};
