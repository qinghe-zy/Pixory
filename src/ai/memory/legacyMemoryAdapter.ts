import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import { MemoryFacade } from './memoryFacade';

function hashText(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}

function safeScope(value: unknown): 'global' | 'thread' | 'role' | 'ip' | 'knowledge_base' {
  return value === 'global' || value === 'role' || value === 'ip' || value === 'knowledge_base' ? value : 'thread';
}

export async function importLegacyMemoryPayload(input: {
  packageId: string;
  memories: Array<Record<string, unknown>>;
  space: PixorySpace;
  threadId: string;
}): Promise<number> {
  let imported = 0;
  for (const memory of input.memories) {
    const sourceId = typeof memory.id === 'string' ? memory.id : null;
    const content = typeof memory.content === 'string' ? memory.content.trim() : '';
    if (!sourceId || !content) continue;
    const scopeType = safeScope(memory.scope);
    const scopeId = typeof memory.scopeId === 'string'
      ? memory.scopeId
      : scopeType === 'thread' ? input.threadId : null;
    const confidence = typeof memory.confidence === 'number' ? Math.max(0, Math.min(1, memory.confidence)) : 0.35;
    const manual = memory.sourceKind === 'manual';
    try {
      const claim = await MemoryFacade.createClaim({
        confidenceBand: manual || confidence >= 0.9 ? 'high' : confidence >= 0.6 ? 'medium' : 'low',
        confidenceCalibrated: confidence,
        confidenceRaw: confidence,
        id: `mclaim_legacy_import_${hashText(`${input.packageId}:${sourceId}`).slice(0, 24)}`,
        importance: Math.max(0, Math.min(100, Number(memory.importance ?? 2) * 20)),
        kind: 'state',
        lane: manual ? 'confirmed' : 'working',
        manualLocked: manual,
        predicate: memory.type === 'preference'
          ? 'preference.general'
          : memory.type === 'decision'
            ? 'decision'
            : memory.type === 'instruction'
              ? 'preference.communication'
              : 'fact.identity',
        scopeId,
        scopeType,
        sourceKind: 'import',
        space: input.space,
        speechMode: 'asserted',
        stability: manual ? 'permanent' : 'long',
        subjectDisplay: '用户',
        subjectEntityId: 'user',
        valueDisplay: content,
        valueNormalized: content,
      }, {
        actorId: input.packageId,
        commandId: `legacy-import:${input.packageId}:${sourceId}`,
        source: 'legacy_memory_adapter',
      });
      if (memory.status === 'deleted') {
        await MemoryFacade.deleteClaim({ claimId: claim.id, space: input.space }, {
          actorId: input.packageId,
          commandId: `legacy-import-delete:${input.packageId}:${sourceId}`,
          source: 'legacy_memory_adapter',
        });
      } else if (memory.status === 'stale') {
        await MemoryFacade.staleClaim({ claimId: claim.id, space: input.space }, {
          actorId: input.packageId,
          commandId: `legacy-import-stale:${input.packageId}:${sourceId}`,
          source: 'legacy_memory_adapter',
        });
      }
      await runWithDatabaseSpace(input.space, (db) =>
        db.runAsync(
          `INSERT OR IGNORE INTO memory_import_id_map
           (packageId, sourceType, sourceId, targetType, targetId, sourceHash, importedAt)
           VALUES (?, 'legacy_memory', ?, 'claim', ?, ?, ?)`,
          input.packageId,
          sourceId,
          claim.id,
          hashText(JSON.stringify(memory)),
          new Date().toISOString()
        )
      );
      imported += 1;
    } catch {
      // Existing canonical claims are intentionally not duplicated.
    }
  }
  return imported;
}

export const LegacyMemoryAdapter = {
  import: importLegacyMemoryPayload,
};
