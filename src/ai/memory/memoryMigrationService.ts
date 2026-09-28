import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import type { AiMemoryRecord } from '../../database/repositories/aiThreadRepository';
import { MemoryFacade } from './memoryFacade';

function legacyPredicate(memory: AiMemoryRecord): string {
  if (memory.type === 'preference') {
    return 'preference.general';
  }
  if (memory.type === 'instruction') {
    return 'preference.communication';
  }
  if (memory.type === 'decision') {
    return 'decision';
  }
  if (memory.type === 'task') {
    return 'task';
  }
  return memory.type === 'correction' ? 'fact.identity' : 'fact.identity';
}

export async function migrateLegacyMemoriesToV1(space: PixorySpace): Promise<number> {
  const legacy = await runWithDatabaseSpace(space, async (db) => {
    const rows = await db.getAllAsync<AiMemoryRecord>(
      `SELECT *
       FROM ai_memories
       WHERE space = ? AND status IN ('active', 'stale')
       ORDER BY createdAt ASC`,
      space
    );
    const existing = await db.getAllAsync<{ sourceMessageId: string | null }>(
      `SELECT sourceMessageId
       FROM memory_claims
       WHERE space = ? AND sourceKind = 'import'`,
      space
    );
    const importedSourceIds = new Set(existing.map((row) => row.sourceMessageId).filter(Boolean));
    return rows.filter((row) => !importedSourceIds.has(row.id));
  });

  let migrated = 0;
  for (const memory of legacy) {
    try {
      await MemoryFacade.createClaim({
        actor: 'user',
        confidenceBand: memory.sourceKind === 'manual' ? 'high' : 'medium',
        confidenceRaw: memory.confidence,
        importance: Math.max(0, Math.min(100, memory.importance * 20)),
        kind: memory.type === 'task' ? 'task' : memory.type === 'decision' ? 'state' : 'state',
        lane: memory.status === 'active' && memory.sourceKind === 'manual' ? 'confirmed' : 'working',
        manualLocked: memory.sourceKind === 'manual',
        predicate: legacyPredicate(memory),
        scopeId: memory.scopeId,
        scopeType: memory.scope,
        sourceKind: 'import',
        sourceMessageId: memory.id,
        space,
        speechMode: memory.type === 'correction' ? 'corrected' : 'asserted',
        stability: memory.sourceKind === 'manual' ? 'permanent' : 'short',
        status: memory.status === 'stale' ? 'stale' : memory.sourceKind === 'manual' ? 'confirmed' : 'committed',
        subjectDisplay: '用户',
        subjectEntityId: 'user',
        valueDisplay: memory.content,
        valueNormalized: memory.normalizedContent,
        id: `mclaim_legacy_${memory.id}`,
        extractorVersion: 'legacy-adapter-v1',
      }, { actorId: 'migration', source: 'legacy_shadow_projection' });
      migrated += 1;
    } catch {
      // A conflicting legacy row is retained in the old table and can be reviewed manually.
    }
  }
  return migrated;
}

export const MemoryMigrationService = {
  migrateLegacyMemoriesToV1,
};
