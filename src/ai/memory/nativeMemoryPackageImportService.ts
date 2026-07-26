import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../../database';
import type { AiMessageRecord } from '../../database/repositories/aiThreadRepository';
import { createTimestamp } from '../../database/utils';
import { MemoryFacade } from './memoryFacade';
import { nativeClaimToMemoryInput, type NativeMemoryPackage } from './nativeMemoryPackage';

function createImportId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeRole(value: unknown): 'user' | 'assistant' | null {
  return value === 'user' || value === 'assistant' ? value : null;
}

function mapImportedMessage(row: Record<string, unknown>): {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
} | null {
  const role = safeRole(row.role);
  const content = typeof row.content === 'string' ? row.content.trim() : '';
  if (!role || !content) {
    return null;
  }
  return {
    content: content.slice(0, 12000),
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
    role,
  };
}

async function recordNativeImportIdMap(
  db: SQLiteDatabase,
  input: {
    packageId: string;
    sourceType: 'episode' | 'relation' | 'profile';
    sourceId: string;
    targetType: 'episode' | 'relation' | 'profile';
    targetId: string;
  }
): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO memory_import_id_map
     (packageId, sourceType, sourceId, targetType, targetId, sourceHash, importedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.packageId,
    input.sourceType,
    input.sourceId,
    input.targetType,
    input.targetId,
    input.packageId,
    createTimestamp()
  );
}

async function createNativeImportMessageProjection(
  db: SQLiteDatabase,
  input: {
    package: NativeMemoryPackage;
    rawText: string;
    space: PixorySpace;
    threadId: string;
  },
  messages: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string | null }>
): Promise<{
  importRoot: AiMessageRecord;
  session: Awaited<ReturnType<typeof aiThreadRepository.createContinuityImportSession>>;
}> {
  let output: {
    importRoot: AiMessageRecord;
    session: Awaited<ReturnType<typeof aiThreadRepository.createContinuityImportSession>>;
  } | null = null;
  await db.withTransactionAsync(async () => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread || thread.space !== input.space) {
      throw new Error('AI thread was not found.');
    }
    const session = await aiThreadRepository.createContinuityImportSession(db, {
      containsCompressedContinuity: input.package.summaries.length > 0,
      id: createImportId('aiimport'),
      memoryReviewStatus: 'pending',
      parsedMessageCount: messages.length,
      rawDocumentHash: input.package.packageId,
      rawDocumentText: input.rawText,
      remoteModelConsent: false,
      reviewGateState: 'not_required',
      rollbackState: 'available',
      sourceKind: 'pixory_native_markdown',
      sourcePlatform: 'Pixory',
      space: input.space,
      status: 'imported',
      threadId: input.threadId,
    });
    const now = createTimestamp();
    const importRoot = await aiThreadRepository.createSyntheticContinuityImportRoot(db, {
      createdAt: now,
      id: createImportId('aimsg'),
      importSessionId: session.id,
      threadId: input.threadId,
    });
    await aiThreadRepository.updateContinuityImportSession(db, session.id, {
      importedBranchRootMessageId: importRoot.id,
      importedBranchVersionIndex: 1,
      importBranchRootKind: 'continuity_import_root',
    });
    for (const [index, message] of messages.entries()) {
      await aiThreadRepository.createContinuityImportMessage(db, {
        branchRootMessageId: importRoot.id,
        branchVersionIndex: 1,
        completedAt: message.createdAt ?? now,
        content: message.content,
        continuityImportSessionId: session.id,
        continuitySyntheticKind: null,
        id: createImportId(`aimsg${index}`),
        role: message.role,
        status: 'completed',
        threadId: input.threadId,
      });
    }
    await aiThreadRepository.setThreadCurrentBranch(db, {
      branchRootMessageId: importRoot.id,
      branchVersionIndex: 1,
      threadId: input.threadId,
    });
    await db.runAsync(
      `INSERT OR IGNORE INTO memory_import_id_map
       (packageId, sourceType, sourceId, targetType, targetId, sourceHash, importedAt)
       VALUES (?, 'package', ?, 'import_session', ?, ?, ?)`,
      input.package.packageId,
      input.package.packageId,
      session.id,
      input.package.packageId,
      now
    );
    output = { importRoot, session };
  });
  if (!output) {
    throw new Error('native_memory_import_session_create_failed');
  }
  return output;
}

export async function importNativeMemoryPackage(input: {
  package: NativeMemoryPackage;
  rawText: string;
  space: PixorySpace;
  threadId: string;
}): Promise<{
  importRoot: AiMessageRecord;
  session: Awaited<ReturnType<typeof aiThreadRepository.createContinuityImportSession>>;
  importedMessageCount: number;
  importedClaimCount: number;
  continuityBlockCount: number;
  partial: boolean;
  native: true;
}> {
  const messages = input.package.messages
    .map(mapImportedMessage)
    .filter((message): message is NonNullable<typeof message> => Boolean(message));
  const importedClaims: Array<{ sourceId: string; targetId: string }> = [];
  const result = await runWithDatabaseSpace(input.space, async (db) => {
    const existing = await db.getFirstAsync<{ targetId: string }>(
      `SELECT targetId
       FROM memory_import_id_map
       WHERE packageId = ? AND sourceType = 'package'
       LIMIT 1`,
      input.package.packageId
    );
    if (existing?.targetId) {
      const session = await aiThreadRepository.findContinuityImportSessionById(db, existing.targetId);
      if (session) {
        const importRoot = session.importedBranchRootMessageId
          ? await aiThreadRepository.findMessageById(db, session.importedBranchRootMessageId)
          : null;
        if (importRoot) {
          const accepted = session.memoryReviewStatus === 'accepted';
          return {
            duplicate: accepted,
            importRoot,
            resumed: true as const,
            session,
          };
        }
      }
    }
    const created = await createNativeImportMessageProjection(db, input, messages);
    return {
      duplicate: false as const,
      importRoot: created.importRoot,
      resumed: false as const,
      session: created.session,
    };
  });
  if (result.duplicate) {
    return {
      continuityBlockCount: input.package.summaries.length,
      importedClaimCount: 0,
      importedMessageCount: result.session.parsedMessageCount,
      importRoot: result.importRoot,
      native: true,
      partial: false,
      session: result.session,
    };
  }

  for (const sourceClaim of input.package.claims) {
    const sourceId = typeof sourceClaim.id === 'string' ? sourceClaim.id : null;
    if (!sourceId) continue;
    const claimInput = nativeClaimToMemoryInput(sourceClaim, input.space);
    if (!claimInput) continue;
    const targetId = `mclaim_import_${input.package.packageId.slice(0, 12)}_${sourceId.slice(-20)}`;
    const created = await MemoryFacade.createClaim({
        ...claimInput,
        id: targetId,
        sourceKind: 'import',
        sourceMessageId: null,
      }, {
        actorId: input.package.packageId,
        commandId: `native-import:${input.package.packageId}:${sourceId}`,
        source: 'native_memory_package',
      });
      const sourceStatus = sourceClaim.status;
      if (sourceStatus === 'deleted' || sourceStatus === 'suppressed') {
        if (sourceStatus === 'deleted') {
          await MemoryFacade.deleteClaim({ claimId: created.id, space: input.space }, {
            actorId: input.package.packageId,
            commandId: `native-import-delete:${input.package.packageId}:${sourceId}`,
            source: 'native_memory_package',
          });
        } else {
          await MemoryFacade.suppressClaim({ claimId: created.id, space: input.space }, {
            actorId: input.package.packageId,
            commandId: `native-import-suppress:${input.package.packageId}:${sourceId}`,
            source: 'native_memory_package',
          });
        }
      } else if (sourceStatus === 'stale' || sourceClaim.lane === 'archive') {
        await MemoryFacade.staleClaim({ claimId: created.id, space: input.space }, {
          actorId: input.package.packageId,
          commandId: `native-import-stale:${input.package.packageId}:${sourceId}`,
          source: 'native_memory_package',
        });
      } else if (sourceStatus === 'conflicted') {
        await MemoryFacade.conflictClaim({ claimId: created.id, space: input.space, reason: 'native package preserved conflicted state' }, {
          actorId: input.package.packageId,
          commandId: `native-import-conflict:${input.package.packageId}:${sourceId}`,
          source: 'native_memory_package',
        });
      } else if (
        sourceClaim.status === 'confirmed'
        && sourceClaim.safetyState !== 'safety_pending'
        && !created.manualLocked
      ) {
        await MemoryFacade.confirmClaim({ claimId: created.id, space: input.space }, {
          actorId: input.package.packageId,
          commandId: `native-import-confirm:${input.package.packageId}:${sourceId}`,
          source: 'native_memory_package',
        });
      }
    importedClaims.push({ sourceId, targetId: created.id });
  }
  const acceptedSession = await runWithDatabaseSpace(input.space, async (db) => {
    const claimMap = new Map(importedClaims.map((item) => [item.sourceId, item.targetId]));
    const projection = await db.getFirstAsync<{ projectionVersion: number }>(
      'SELECT projectionVersion FROM memory_projection_meta WHERE space = ?',
      input.space
    );
    const projectionVersion = Number(projection?.projectionVersion ?? 0);
    for (const claim of importedClaims) {
      await db.runAsync(
        `INSERT OR IGNORE INTO memory_import_id_map
         (packageId, sourceType, sourceId, targetType, targetId, sourceHash, importedAt)
         VALUES (?, 'claim', ?, 'claim', ?, ?, ?)`,
        input.package.packageId,
        claim.sourceId,
        claim.targetId,
        input.package.packageId,
        createTimestamp()
      );
    }
    // Episodes, relational states, and profiles are projections, not model input.
    // Import them deterministically after claims so source claim references can be
    // remapped to the newly created claim ids.
    for (const sourceEpisode of input.package.episodes) {
      if (typeof sourceEpisode.id !== 'string' || typeof sourceEpisode.title !== 'string' || typeof sourceEpisode.summaryText !== 'string') {
        continue;
      }
      const sourceScopeType = typeof sourceEpisode.scopeType === 'string' ? sourceEpisode.scopeType : 'thread';
      const scopeType = sourceScopeType === 'global' || sourceScopeType === 'role' || sourceScopeType === 'ip' || sourceScopeType === 'knowledge_base' || sourceScopeType === 'thread'
        ? sourceScopeType
        : 'thread';
      const scopeId = scopeType === 'thread'
        ? input.threadId
        : typeof sourceEpisode.scopeId === 'string' ? sourceEpisode.scopeId : null;
      const sourceClaimIds = Array.isArray(sourceEpisode.sourceClaimIdsJson)
        ? sourceEpisode.sourceClaimIdsJson
        : typeof sourceEpisode.sourceClaimIdsJson === 'string'
          ? (() => { try { return JSON.parse(sourceEpisode.sourceClaimIdsJson); } catch { return []; } })()
          : [];
      const mappedClaimIds = Array.isArray(sourceClaimIds)
        ? sourceClaimIds.filter((id): id is string => typeof id === 'string').map((id) => claimMap.get(id) ?? id)
        : [];
      const episodeId = `mepisode_import_${input.package.packageId.slice(0, 12)}_${sourceEpisode.id.slice(-20)}`;
      const createdAt = typeof sourceEpisode.createdAt === 'string' ? sourceEpisode.createdAt : createTimestamp();
      await MemoryFacade.upsertEpisode({
        archivedAt: null,
        branchRootMessageId: null,
        branchVersionIndex: null,
        confidenceBand: sourceEpisode.confidenceBand === 'high' || sourceEpisode.confidenceBand === 'low' ? sourceEpisode.confidenceBand : 'medium',
        createdAt,
        deletedAt: null,
        endMessageId: null,
        id: episodeId,
        importance: Math.max(0, Math.min(100, Number(sourceEpisode.importance ?? 30))),
        lane: sourceEpisode.lane === 'confirmed' || sourceEpisode.lane === 'archive' ? sourceEpisode.lane : 'working',
        projectionVersion,
        scopeId,
        scopeType,
        sourceClaimIdsJson: JSON.stringify(mappedClaimIds),
        sourceMessageIdsJson: '[]',
        space: input.space,
        startMessageId: null,
        status: sourceEpisode.status === 'closed' || sourceEpisode.status === 'archived' ? sourceEpisode.status : 'active',
        summaryText: sourceEpisode.summaryText.slice(0, 4000),
        title: sourceEpisode.title.slice(0, 200),
        updatedAt: typeof sourceEpisode.updatedAt === 'string' ? sourceEpisode.updatedAt : createdAt,
        validFrom: typeof sourceEpisode.validFrom === 'string' ? sourceEpisode.validFrom : null,
        validTo: typeof sourceEpisode.validTo === 'string' ? sourceEpisode.validTo : null,
      }, {
        actorId: input.package.packageId,
        commandId: `native-import-episode:${input.package.packageId}:${sourceEpisode.id}`,
        source: 'native_memory_package',
      });
      await recordNativeImportIdMap(db, {
        packageId: input.package.packageId,
        sourceId: sourceEpisode.id,
        sourceType: 'episode',
        targetId: episodeId,
        targetType: 'episode',
      });
    }
    for (const sourceRelation of input.package.relationalStates) {
      if (typeof sourceRelation.id !== 'string' || typeof sourceRelation.metric !== 'string' || typeof sourceRelation.subjectEntityId !== 'string') {
        continue;
      }
      const metric = sourceRelation.metric === 'affinity'
        || sourceRelation.metric === 'trust'
        || sourceRelation.metric === 'tension'
        || sourceRelation.metric === 'familiarity'
        ? sourceRelation.metric
        : 'familiarity';
      const scopeType = sourceRelation.scopeType === 'role' || sourceRelation.scopeType === 'ip' || sourceRelation.scopeType === 'knowledge_base'
        ? sourceRelation.scopeType
        : 'thread';
      const scopeId = scopeType === 'thread'
        ? input.threadId
        : typeof sourceRelation.scopeId === 'string' ? sourceRelation.scopeId : null;
      const createdAt = typeof sourceRelation.createdAt === 'string' ? sourceRelation.createdAt : createTimestamp();
      const relationId = `mrelation_import_${input.package.packageId.slice(0, 12)}_${sourceRelation.id.slice(-20)}`;
      await MemoryFacade.upsertRelationalState({
        createdAt,
        decayHalfLifeDays: Math.max(0.1, Number(sourceRelation.decayHalfLifeDays ?? 30)),
        evidenceIdsJson: typeof sourceRelation.evidenceIdsJson === 'string' ? sourceRelation.evidenceIdsJson : '[]',
        id: relationId,
        lastEvidenceAt: typeof sourceRelation.lastEvidenceAt === 'string' ? sourceRelation.lastEvidenceAt : null,
        metric,
        projectionVersion,
        scopeId,
        scopeType,
        signalWeight: Math.max(0, Number(sourceRelation.signalWeight ?? 0)),
        space: input.space,
        subjectEntityId: sourceRelation.subjectEntityId.slice(0, 200),
        updatedAt: typeof sourceRelation.updatedAt === 'string' ? sourceRelation.updatedAt : createdAt,
        value: Math.max(-1, Math.min(1, Number(sourceRelation.value ?? 0))),
        version: 1,
      }, {
        actorId: input.package.packageId,
        commandId: `native-import-relation:${input.package.packageId}:${sourceRelation.id}`,
        source: 'native_memory_package',
      });
      await recordNativeImportIdMap(db, {
        packageId: input.package.packageId,
        sourceId: sourceRelation.id,
        sourceType: 'relation',
        targetId: relationId,
        targetType: 'relation',
      });
    }
    for (const sourceProfile of input.package.profiles) {
      if (typeof sourceProfile.id !== 'string' || typeof sourceProfile.profileJson !== 'string' || typeof sourceProfile.profileText !== 'string') {
        continue;
      }
      const scopeType = sourceProfile.scopeType === 'role' || sourceProfile.scopeType === 'ip' || sourceProfile.scopeType === 'knowledge_base'
        ? sourceProfile.scopeType
        : 'thread';
      const scopeId = scopeType === 'thread'
        ? input.threadId
        : typeof sourceProfile.scopeId === 'string' ? sourceProfile.scopeId : null;
      const sourceClaimIdsJson = typeof sourceProfile.sourceClaimIdsJson === 'string' ? JSON.stringify(
        (() => {
          try {
            const ids = JSON.parse(sourceProfile.sourceClaimIdsJson);
            return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').map((id) => claimMap.get(id) ?? id) : [];
          } catch {
            return [];
          }
        })()
      ) : '[]';
      const createdAt = typeof sourceProfile.createdAt === 'string' ? sourceProfile.createdAt : createTimestamp();
      const profileId = `mprofile_import_${input.package.packageId.slice(0, 12)}_${sourceProfile.id.slice(-20)}`;
      await MemoryFacade.upsertProfile({
        createdAt,
        id: profileId,
        profileJson: sourceProfile.profileJson.slice(0, 20000),
        profileText: sourceProfile.profileText.slice(0, 8000),
        projectionVersion,
        scopeId,
        scopeType,
        sourceClaimIdsJson,
        sourceMessageIdsJson: typeof sourceProfile.sourceMessageIdsJson === 'string' ? sourceProfile.sourceMessageIdsJson : '[]',
        space: input.space,
        updatedAt: typeof sourceProfile.updatedAt === 'string' ? sourceProfile.updatedAt : createdAt,
        version: 1,
      }, {
        actorId: input.package.packageId,
        commandId: `native-import-profile:${input.package.packageId}:${sourceProfile.id}`,
        source: 'native_memory_package',
      });
      await recordNativeImportIdMap(db, {
        packageId: input.package.packageId,
        sourceId: sourceProfile.id,
        sourceType: 'profile',
        targetId: profileId,
        targetType: 'profile',
      });
    }
    await aiThreadRepository.markContinuityImportReviewAccepted(db, result.session.id);
    return aiThreadRepository.findContinuityImportSessionById(db, result.session.id);
  });
  return {
    continuityBlockCount: input.package.summaries.length,
    importedClaimCount: importedClaims.length,
    importedMessageCount: result.session.parsedMessageCount,
    importRoot: result.importRoot,
    native: true,
    partial: false,
    session: acceptedSession ?? result.session,
  };
}

export const NativeMemoryPackageImportService = {
  import: importNativeMemoryPackage,
};
