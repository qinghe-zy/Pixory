import type { SQLiteDatabase } from 'expo-sqlite';
import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import type { MemorySpace } from './memoryTypes';
import { hasCitationLexicalSupport } from '../aiCitationProtocol';

export interface MemoryClaimFeedbackRecord {
  claimId: string;
  space: MemorySpace;
  injectedCount: number;
  usedCount: number;
  lastInjectedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getMemoryFeedbackBatch(
  db: SQLiteDatabase,
  space: MemorySpace,
  claimIds: string[]
): Promise<Map<string, { injectedCount: number; usedCount: number }>> {
  const result = new Map<string, { injectedCount: number; usedCount: number }>();
  if (claimIds.length === 0) {
    return result;
  }
  try {
    const placeholders = claimIds.map(() => '?').join(', ');
    const rows = await db.getAllAsync<{ claimId: string; injectedCount: number; usedCount: number }>(
      `SELECT claimId, injectedCount, usedCount
       FROM memory_claim_feedback
       WHERE space = ? AND claimId IN (${placeholders})`,
      space,
      ...claimIds
    );
    for (const row of rows) {
      result.set(row.claimId, {
        injectedCount: Number(row.injectedCount ?? 0),
        usedCount: Number(row.usedCount ?? 0),
      });
    }
  } catch {
    // If feedback table is missing or fails, return empty map safely
  }
  return result;
}

export async function recordMemoryUsageFeedback(
  space: PixorySpace,
  input: {
    injectedClaimIds: string[];
    adoptedClaimIds: string[];
    now?: string;
  }
): Promise<void> {
  if (input.injectedClaimIds.length === 0) {
    return;
  }
  const now = input.now ?? new Date().toISOString();
  const adoptedSet = new Set(input.adoptedClaimIds);

  await runWithDatabaseSpace(space, async (db) => {
    await db.withTransactionAsync(async () => {
      for (const claimId of input.injectedClaimIds) {
        const isAdopted = adoptedSet.has(claimId);
        if (isAdopted) {
          await db.runAsync(
            `INSERT INTO memory_claim_feedback (
               claimId, space, injectedCount, usedCount, lastInjectedAt, lastUsedAt, createdAt, updatedAt
             ) VALUES (?, ?, 1, 1, ?, ?, ?, ?)
             ON CONFLICT(claimId) DO UPDATE SET
               injectedCount = memory_claim_feedback.injectedCount + 1,
               usedCount = memory_claim_feedback.usedCount + 1,
               lastInjectedAt = excluded.lastInjectedAt,
               lastUsedAt = excluded.lastUsedAt,
               updatedAt = excluded.updatedAt`,
            claimId,
            space,
            now,
            now,
            now,
            now
          );
        } else {
          await db.runAsync(
            `INSERT INTO memory_claim_feedback (
               claimId, space, injectedCount, usedCount, lastInjectedAt, lastUsedAt, createdAt, updatedAt
             ) VALUES (?, ?, 1, 0, ?, NULL, ?, ?)
             ON CONFLICT(claimId) DO UPDATE SET
               injectedCount = memory_claim_feedback.injectedCount + 1,
               lastInjectedAt = excluded.lastInjectedAt,
               updatedAt = excluded.updatedAt`,
            claimId,
            space,
            now,
            now,
            now
          );
        }
      }
    });
  });
}

export function inspectClaimAdoption(
  answerText: string,
  claimDisplay: string,
  claimNormalized?: string
): boolean {
  if (!answerText || !claimDisplay) {
    return false;
  }
  if (claimNormalized && answerText.toLowerCase().includes(claimNormalized.toLowerCase())) {
    return true;
  }
  return hasCitationLexicalSupport(claimDisplay, answerText);
}

export async function recordAssistantReplyFeedback(
  space: PixorySpace,
  input: {
    answerText: string;
    injectedClaimIds: string[];
    now?: string;
  }
): Promise<void> {
  const { answerText, injectedClaimIds } = input;
  if (!injectedClaimIds || injectedClaimIds.length === 0 || !answerText) {
    return;
  }
  await runWithDatabaseSpace(space, async (db) => {
    try {
      const placeholders = injectedClaimIds.map(() => '?').join(', ');
      const claimRows = await db.getAllAsync<{ id: string; valueDisplay: string; valueNormalized: string }>(
        `SELECT id, valueDisplay, valueNormalized FROM memory_claims WHERE space = ? AND id IN (${placeholders})`,
        space,
        ...injectedClaimIds
      );
      const adoptedClaimIds: string[] = [];
      for (const claim of claimRows) {
        if (inspectClaimAdoption(answerText, claim.valueDisplay, claim.valueNormalized)) {
          adoptedClaimIds.push(claim.id);
        }
      }
      const now = input.now ?? new Date().toISOString();
      const adoptedSet = new Set(adoptedClaimIds);
      await db.withTransactionAsync(async () => {
        for (const claimId of injectedClaimIds) {
          const isAdopted = adoptedSet.has(claimId);
          if (isAdopted) {
            await db.runAsync(
              `INSERT INTO memory_claim_feedback (
                 claimId, space, injectedCount, usedCount, lastInjectedAt, lastUsedAt, createdAt, updatedAt
               ) VALUES (?, ?, 1, 1, ?, ?, ?, ?)
               ON CONFLICT(claimId) DO UPDATE SET
                 injectedCount = memory_claim_feedback.injectedCount + 1,
                 usedCount = memory_claim_feedback.usedCount + 1,
                 lastInjectedAt = excluded.lastInjectedAt,
                 lastUsedAt = excluded.lastUsedAt,
                 updatedAt = excluded.updatedAt`,
              claimId,
              space,
              now,
              now,
              now,
              now
            );
          } else {
            await db.runAsync(
              `INSERT INTO memory_claim_feedback (
                 claimId, space, injectedCount, usedCount, lastInjectedAt, lastUsedAt, createdAt, updatedAt
               ) VALUES (?, ?, 1, 0, ?, NULL, ?, ?)
               ON CONFLICT(claimId) DO UPDATE SET
                 injectedCount = memory_claim_feedback.injectedCount + 1,
                 lastInjectedAt = excluded.lastInjectedAt,
                 updatedAt = excluded.updatedAt`,
              claimId,
              space,
              now,
              now,
              now
            );
          }
        }
      });
    } catch {
      // Feedback recording is non-blocking and safe
    }
  });
}

export const MemoryFeedbackService = {
  getMemoryFeedbackBatch,
  inspectClaimAdoption,
  recordAssistantReplyFeedback,
  recordMemoryUsageFeedback,
};
