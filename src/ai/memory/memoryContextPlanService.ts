import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createTimestamp } from '../../database/utils';
import type { AiThreadRecord } from '../types';
import { compileMemoryUsageContract } from './contextCompiler';
import { getMemoryProjectionMeta } from './memoryEventRepository';
import {
  RETRIEVAL_SCORER_VERSION,
  retrieveMemoryClaimsWithDiagnostics,
} from './memoryRetrievalService';

export interface MemoryContextPlan {
  contextPlanId: string;
  projectionVersion: number;
  lineageVersion: number;
  candidateClaimIds: string[];
  selectedEvidenceIds: string[];
  omittedClaimIds: string[];
  segmentHashes: string[];
  retrievalScorerVersion: string;
  cacheTier: 'none' | 'provider_prefix' | 'exact';
  providerCachedTokens: number | null;
  createdAt: string;
}

export interface CompiledMemoryContext {
  context: string;
  plan: MemoryContextPlan;
}

function hashText(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}

function createContextPlanId(input: {
  threadId: string;
  projectionVersion: number;
  lineageVersion: number;
  query: string;
}): string {
  const entropy = `${createTimestamp()}:${Math.random().toString(36).slice(2, 10)}`;
  return `mctx_${hashText([
    input.threadId,
    input.projectionVersion,
    input.lineageVersion,
    hashText(input.query),
    entropy,
  ].join('\u001F')).slice(0, 32)}`;
}

export async function getOrCreateMemoryLineageVersion(
  db: SQLiteDatabase,
  thread: AiThreadRecord
): Promise<number> {
  const now = createTimestamp();
  await db.runAsync(
    `INSERT INTO memory_lineage_meta (
       threadId, currentRootMessageId, currentBranchVersionIndex, lineageVersion, updatedAt
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(threadId) DO NOTHING`,
    thread.id,
    thread.currentBranchRootMessageId,
    thread.currentBranchVersionIndex ?? 0,
    thread.lineageVersion ?? 0,
    now
  );
  const row = await db.getFirstAsync<{ lineageVersion: number }>(
    'SELECT lineageVersion FROM memory_lineage_meta WHERE threadId = ?',
    thread.id
  );
  return Number(row?.lineageVersion ?? thread.lineageVersion ?? 0);
}

export async function compileMemoryContextPlan(
  db: SQLiteDatabase,
  input: {
    thread: AiThreadRecord;
    query: string;
    embeddingAvailable?: boolean;
    excludedClaimIds?: string[];
  }
): Promise<CompiledMemoryContext> {
  const [meta, lineageVersion, retrieval] = await Promise.all([
    getMemoryProjectionMeta(db, input.thread.space),
    getOrCreateMemoryLineageVersion(db, input.thread),
    retrieveMemoryClaimsWithDiagnostics(db, {
      embeddingAvailable: input.embeddingAvailable ?? false,
      excludedClaimIds: input.excludedClaimIds,
      query: input.query,
      space: input.thread.space,
      thread: input.thread,
    }),
  ]);
  const context = compileMemoryUsageContract(retrieval.selected);
  const evidenceIds = [...new Set(retrieval.selected.flatMap((item) => item.evidenceIds))];
  const segmentHashes = retrieval.selected.map((item) => hashText([
    item.claim.id,
    item.claim.version,
    item.claim.status,
    item.claim.valueNormalized,
    item.usage,
  ].join('\u001F')));
  return {
    context,
    plan: {
      cacheTier: context ? 'provider_prefix' : 'none',
      candidateClaimIds: retrieval.candidateClaimIds,
      contextPlanId: createContextPlanId({
        lineageVersion,
        projectionVersion: meta.projectionVersion,
        query: input.query,
        threadId: input.thread.id,
      }),
      createdAt: createTimestamp(),
      lineageVersion,
      omittedClaimIds: retrieval.omittedClaimIds,
      projectionVersion: meta.projectionVersion,
      providerCachedTokens: null,
      retrievalScorerVersion: RETRIEVAL_SCORER_VERSION,
      segmentHashes,
      selectedEvidenceIds: evidenceIds,
    },
  };
}

export function attachProviderUsageToContextPlan(
  plan: MemoryContextPlan,
  providerCachedTokens: number | null
): MemoryContextPlan {
  return {
    ...plan,
    providerCachedTokens,
  };
}

export const MemoryContextPlanService = {
  attachProviderUsage: attachProviderUsageToContextPlan,
  compile: compileMemoryContextPlan,
  getLineageVersion: getOrCreateMemoryLineageVersion,
};
