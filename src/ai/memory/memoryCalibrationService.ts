import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import { resolveCalibratedConfidence, type MemoryClaimRecord } from './memoryTypes';
import { MemoryFacade } from './memoryFacade';

export const MEMORY_CONFIDENCE_PRIORS = {
  high: 0.95,
  medium: 0.7,
  low: 0.35,
} as const;

export function deriveConfidenceBand(input: {
  manualLocked?: boolean;
  speechMode: MemoryClaimRecord['speechMode'];
  directEvidenceCount: number;
  hasConflict: boolean;
  hasCompleteSubjectAndScope: boolean;
}): MemoryClaimRecord['confidenceBand'] {
  if (
    input.manualLocked
    || (
      input.speechMode === 'corrected'
      && input.directEvidenceCount >= 1
      && !input.hasConflict
    )
    || (
      input.speechMode === 'asserted'
      && input.directEvidenceCount >= 2
      && input.hasCompleteSubjectAndScope
      && !input.hasConflict
    )
  ) {
    return 'high';
  }
  if (
    input.speechMode === 'asserted'
    && input.directEvidenceCount >= 1
    && input.hasCompleteSubjectAndScope
    && !input.hasConflict
  ) {
    return 'medium';
  }
  return 'low';
}

export function canAutoPromoteToConfirmed(claim: MemoryClaimRecord): boolean {
  return claim.confidenceBand === 'high'
    && claim.importance >= 60
    && !['joke', 'quoted', 'hypothetical', 'roleplay', 'uncertain'].includes(claim.speechMode)
    && claim.safetyState !== 'safety_pending'
    && claim.status !== 'conflicted'
    && !claim.manualLocked;
}

function isProtectedFromCapacityEviction(claim: MemoryClaimRecord): boolean {
  return claim.manualLocked
    || claim.safetyState !== 'none'
    || claim.speechMode === 'corrected'
    || claim.sourceKind === 'manual';
}

export async function runMemoryLifecycleMaintenance(
  space: PixorySpace,
  options: { now?: string; maxClaimsPerScope?: number } = {}
): Promise<{ staled: number; evicted: number; promoted: number }> {
  const now = options.now ? Date.parse(options.now) : Date.now();
  const maxClaimsPerScope = options.maxClaimsPerScope ?? 64;
  let staled = 0;
  let evicted = 0;
  let promoted = 0;
  const claims = await runWithDatabaseSpace(space, (db) =>
    db.getAllAsync<MemoryClaimRecord>(
      `SELECT * FROM memory_claims
       WHERE space = ? AND status IN ('tentative', 'committed', 'confirmed', 'conflicted')
       ORDER BY updatedAt ASC`,
      space
    )
  );
  for (const claim of claims) {
    const ageDays = Math.max(0, (now - Date.parse(claim.updatedAt)) / 86_400_000);
    if (
      claim.lane === 'working'
      && claim.kind === 'state'
      && ageDays >= 14
      && !claim.manualLocked
      && claim.safetyState === 'none'
    ) {
      await MemoryFacade.staleClaim({ claimId: claim.id, space }, {
        commandId: `lifecycle:stale:${claim.id}:${claim.version}`,
        source: 'memory_lifecycle',
        expectedVersion: claim.version,
      }).catch(() => undefined);
      staled += 1;
      continue;
    }
    if (claim.lane === 'working' && canAutoPromoteToConfirmed(claim)) {
      await MemoryFacade.confirmClaim({ claimId: claim.id, space }, {
        commandId: `lifecycle:promote:${claim.id}:${claim.version}`,
        source: 'memory_lifecycle',
        expectedVersion: claim.version,
      }).catch(() => undefined);
      promoted += 1;
    }
  }

  const grouped = new Map<string, MemoryClaimRecord[]>();
  for (const claim of claims.filter((item) => item.lane === 'confirmed' && item.status === 'confirmed')) {
    const key = [claim.space, claim.scopeType, claim.scopeId ?? '∅'].join('\u001F');
    const list = grouped.get(key) ?? [];
    list.push(claim);
    grouped.set(key, list);
  }
  for (const list of grouped.values()) {
    if (list.length <= maxClaimsPerScope) {
      continue;
    }
    const keepCount = Math.max(1, Math.floor(maxClaimsPerScope * 0.8));
    const evictable = list
      .filter((claim) => !isProtectedFromCapacityEviction(claim))
      .sort((left, right) => {
        const leftScore = (left.lastUsedAt ? 1 : 0) + left.importance / 100 + resolveCalibratedConfidence(left.confidenceCalibrated, left.confidenceBand);
        const rightScore = (right.lastUsedAt ? 1 : 0) + right.importance / 100 + resolveCalibratedConfidence(right.confidenceCalibrated, right.confidenceBand);
        return leftScore - rightScore || left.updatedAt.localeCompare(right.updatedAt);
      });
    for (const claim of evictable.slice(0, Math.max(0, list.length - keepCount))) {
      await MemoryFacade.staleClaim({ claimId: claim.id, space }, {
        commandId: `lifecycle:capacity:${claim.id}:${claim.version}`,
        source: 'memory_lifecycle',
        expectedVersion: claim.version,
      }).catch(() => undefined);
      evicted += 1;
    }
  }
  return { evicted, promoted, staled };
}

export const MemoryCalibrationService = {
  canAutoPromoteToConfirmed,
  deriveConfidenceBand,
  runMemoryLifecycleMaintenance,
};
