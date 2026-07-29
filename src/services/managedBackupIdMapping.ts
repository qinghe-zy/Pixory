import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type ManagedLogicalIdMaps = Map<string, Map<string, string>>;

const MESSAGE_KEYS = new Set([
  'assistantMessageId', 'branchRootMessageId', 'currentBranchRootMessageId', 'currentRootMessageId', 'deliveredMessageId', 'endMessageId',
  'evidenceMessageId',
  'historyAnchorMessageId', 'lastCheckedAssistantMessageId', 'lastConsolidatedMessageId',
  'importAnchorMessageId', 'importedBranchRootMessageId', 'lastCompressedMessageId', 'lastMessageId', 'messageId', 'originalMessageId', 'parentMessageId',
  'preImportBranchRootMessageId',
  'reconcileSourceMessageId', 'reservationMessageId', 'resolutionEvidenceMessageId', 'sourceEndMessageId',
  'sourceMessageId', 'sourceStartMessageId', 'startMessageId', 'userMessageId',
]);
const THREAD_KEYS = new Set(['boundThreadId', 'sourceThreadId', 'targetThreadId', 'threadId']);
const ROLE_KEYS = new Set(['roleCardId']);
const DOCUMENT_KEYS = new Set(['documentId']);
const CHUNK_KEYS = new Set(['chunkId']);
const PROVIDER_KEYS = new Set(['providerId']);
const KNOWLEDGE_BASE_KEYS = new Set(['boundKnowledgeBaseId', 'knowledgeBaseId']);
const DECLARED_REFERENCE_TABLES: Record<string, string> = {
  'ai_generation_jobs.generationId': 'ai_generation_ids',
  'ai_thread_memory_jobs.lastCompressedMessageId': 'ai_messages',
  'ai_threads.currentBranchRootMessageId': 'ai_messages',
  'companion_diaries.currentVersionId': 'companion_diary_versions',
  'memory_lineage_meta.currentRootMessageId': 'ai_messages',
  'ai_memories.reconcileSourceMessageId': 'ai_messages',
  'ai_memories.supersededByMemoryId': 'ai_memories',
  'ai_continuity_import_sessions.preImportBranchRootMessageId': 'ai_messages',
  'ai_continuity_import_sessions.importedBranchRootMessageId': 'ai_messages',
  'ai_continuity_import_sessions.importAnchorMessageId': 'ai_messages',
};
const DECLARED_ARRAY_REFERENCE_TABLES: Record<string, string> = {
  'ai_thread_summary_segments.sourceSegmentIds': 'ai_thread_summary_segments',
  'memory_events.evidenceIds': 'memory_evidence',
  'memory_relational_states.evidenceIds': 'memory_evidence',
};
const MEMORY_AGGREGATE_TABLES: Record<string, string> = {
  claim: 'memory_claims',
  episode: 'memory_episodes',
  import: 'memory_profiles',
  relation: 'memory_relational_states',
};
const DECLARED_JSON_ENTITY_TABLES: Record<string, Record<string, string>> = {
  'memory_events.payloadJson': {
    claim: 'memory_claims',
    episode: 'memory_episodes',
    profile: 'memory_profiles',
    relation: 'memory_relational_states',
  },
};
const DECLARED_JSON_ENTITY_STRING_ARRAY_TABLES: Record<string, Record<string, Record<string, string>>> = {
  'memory_events.payloadJson': {
    episode: {
      sourceClaimIdsJson: 'memory_claims',
      sourceMessageIdsJson: 'ai_messages',
    },
    profile: {
      sourceClaimIdsJson: 'memory_claims',
      sourceMessageIdsJson: 'ai_messages',
    },
    relation: {
      evidenceIdsJson: 'memory_evidence',
    },
  },
};

function mapped(maps: ManagedLogicalIdMaps, table: string, value: unknown): unknown {
  return typeof value === 'string' ? maps.get(table)?.get(value) ?? value : value;
}

function jobTable(contextTable: string): string | null {
  if (contextTable === 'companion_dreams') return 'companion_dream_jobs';
  if (contextTable === 'companion_thoughts') return 'companion_thought_jobs';
  if (contextTable === 'ai_generation_events') return 'ai_generation_jobs';
  return null;
}

function eventTable(contextTable: string): string | null {
  if (contextTable.startsWith('companion_thought')) return 'companion_thought_events';
  if (contextTable === 'memory_outbox') return 'memory_events';
  return null;
}

function remapArray(value: unknown, maps: ManagedLogicalIdMaps, table: string): unknown {
  return Array.isArray(value) ? value.map((item) => mapped(maps, table, item)) : value;
}

function remapBranchScopeId(value: string, maps: ManagedLogicalIdMaps): string {
  const match = /^(.*):(\d+)$/.exec(value);
  if (!match || !match[1]) return value;
  return `${String(mapped(maps, 'ai_messages', match[1]))}:${match[2]}`;
}

function remapEntityId(value: unknown, maps: ManagedLogicalIdMaps, table: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const entity = value as Record<string, unknown>;
  if (typeof entity.id !== 'string') return entity;
  const sourceId = entity.id;
  const targetId = String(mapped(maps, table, sourceId));
  const output: Record<string, unknown> = { ...entity, id: targetId };
  if (table === 'memory_claims' && typeof output.canonicalClaimId === 'string') {
    output.canonicalClaimId = appendManagedRestoreCollisionSuffix(output.canonicalClaimId, sourceId, targetId);
  }
  return output;
}

function remapJsonStringArray(value: unknown, maps: ManagedLogicalIdMaps, table: string): unknown {
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? JSON.stringify(remapArray(parsed, maps, table)) : value;
  } catch {
    return value;
  }
}

export function createMappedLogicalId(packageId: string, table: string, sourceId: string, salt = 0): string {
  const digest = bytesToHex(sha256(utf8ToBytes(`${packageId}\u001F${table}\u001F${sourceId}\u001F${salt}`)));
  return `mbk_${digest.slice(0, 32)}`;
}

export function appendManagedRestoreCollisionSuffix(value: string, sourceId: string, targetId: string): string {
  return sourceId === targetId ? value : `${value}:managed-restore:${targetId.slice(-12)}`;
}

export function remapManagedLogicalReferences(
  value: unknown,
  maps: ManagedLogicalIdMaps,
  contextTable: string,
): unknown {
  if (Array.isArray(value)) return value.map((item) => remapManagedLogicalReferences(item, maps, contextTable));
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    const declaredReferenceTable = DECLARED_REFERENCE_TABLES[`${contextTable}.${key}`];
    const declaredArrayReferenceTable = DECLARED_ARRAY_REFERENCE_TABLES[`${contextTable}.${key}`];
    if (declaredReferenceTable) output[key] = mapped(maps, declaredReferenceTable, item);
    else if (declaredArrayReferenceTable) output[key] = remapArray(item, maps, declaredArrayReferenceTable);
    else if (MESSAGE_KEYS.has(key)) output[key] = mapped(maps, 'ai_messages', item);
    else if (THREAD_KEYS.has(key)) output[key] = mapped(maps, 'ai_threads', item);
    else if (ROLE_KEYS.has(key)) output[key] = mapped(maps, 'ai_role_cards', item);
    else if (DOCUMENT_KEYS.has(key)) output[key] = mapped(maps, 'ai_documents', item);
    else if (CHUNK_KEYS.has(key)) output[key] = mapped(maps, 'ai_chunks', item);
    else if (PROVIDER_KEYS.has(key)) output[key] = mapped(maps, 'ai_providers', item);
    else if (KNOWLEDGE_BASE_KEYS.has(key)) output[key] = mapped(maps, 'ai_knowledge_bases', item);
    else if (key === 'claimId' || key === 'supersededByClaimId' || key === 'supersedesClaimId') output[key] = mapped(maps, 'memory_claims', item);
    else if (key === 'supersededByMemoryId') output[key] = mapped(maps, 'ai_memories', item);
    else if (key === 'repairId') output[key] = mapped(maps, 'companion_repairs', item);
    else if (key === 'sceneId') output[key] = mapped(maps, 'companion_dream_scenes', item);
    else if (key === 'seedId') output[key] = mapped(maps, 'companion_dream_seeds', item);
    else if (key === 'diaryId') output[key] = mapped(maps, 'companion_diaries', item);
    else if (key === 'generationId') output[key] = mapped(maps, 'ai_generation_ids', item);
    else if (key === 'jobId' && jobTable(contextTable)) output[key] = mapped(maps, jobTable(contextTable)!, item);
    else if (key === 'eventId' && eventTable(contextTable)) output[key] = mapped(maps, eventTable(contextTable)!, item);
    else if (key === 'sourceEventId') output[key] = mapped(maps, 'companion_events', item);
    else if (key === 'sourceMessageIds' || key === 'evidenceMessageIds') output[key] = remapArray(item, maps, 'ai_messages');
    else if (key === 'sourceSegmentIds') output[key] = remapArray(item, maps, 'ai_thread_summary_segments');
    else if (key === 'evidenceIds') output[key] = remapArray(item, maps, 'memory_evidence');
    else if (key === 'sourceClaimIds' || key === 'targetClaimIds') output[key] = remapArray(item, maps, 'memory_claims');
    else if (key === 'eventIds' && eventTable(contextTable)) output[key] = remapArray(item, maps, eventTable(contextTable)!);
    else if (key === 'targetRecordId' && contextTable === 'ai_continuity_import_effects') {
      const targetTable = source.effectType === 'profile_upsert' ? 'ai_user_profiles'
        : typeof source.effectType === 'string' && source.effectType.startsWith('memory_') ? 'ai_memories' : null;
      output[key] = targetTable ? mapped(maps, targetTable, item) : item;
    }
    else output[key] = remapManagedLogicalReferences(item, maps, contextTable);
  }
  if (typeof source.scopeType === 'string' && typeof source.scopeId === 'string') {
    const scopeTable = source.scopeType === 'role' ? 'ai_role_cards'
      : source.scopeType === 'thread' ? 'ai_threads'
        : source.scopeType === 'knowledge_base' ? 'ai_knowledge_bases' : null;
    if (source.scopeType === 'branch') output.scopeId = remapBranchScopeId(source.scopeId, maps);
    else if (scopeTable) output.scopeId = mapped(maps, scopeTable, source.scopeId);
  }
  if (typeof source.ownerType === 'string' && typeof source.ownerId === 'string') {
    const ownerTable = source.ownerType === 'thread' ? 'ai_threads'
      : source.ownerType === 'knowledge_base' ? 'ai_knowledge_bases' : null;
    if (ownerTable) output.ownerId = mapped(maps, ownerTable, source.ownerId);
  }
  if (typeof source.subjectType === 'string' && typeof source.subjectId === 'string') {
    const subjectTable = source.subjectType === 'role' ? 'ai_role_cards'
      : source.subjectType === 'thread' ? 'ai_threads' : null;
    if (subjectTable) output.subjectId = mapped(maps, subjectTable, source.subjectId);
  }
  if (typeof source.sourceType === 'string' && typeof source.sourceId === 'string') {
    const sourceTable = source.sourceType === 'document_chunk' ? 'ai_chunks'
      : source.sourceType === 'message' ? 'ai_messages'
        : source.sourceType === 'attachment' ? 'ai_message_attachments' : null;
    if (sourceTable) output.sourceId = mapped(maps, sourceTable, source.sourceId);
  }
  if (typeof source.aggregateType === 'string' && typeof source.aggregateId === 'string') {
    const aggregateTable = MEMORY_AGGREGATE_TABLES[source.aggregateType] ?? null;
    if (aggregateTable) output.aggregateId = mapped(maps, aggregateTable, source.aggregateId);
  }
  return output;
}

export function remapManagedJsonReferences(
  value: unknown,
  maps: ManagedLogicalIdMaps,
  context: { column: string; row: Record<string, unknown>; table: string },
): unknown {
  const logicalKey = context.column.endsWith('Json') ? context.column.slice(0, -4) : context.column;
  const wrapped = remapManagedLogicalReferences({ [logicalKey]: value }, maps, context.table) as Record<string, unknown>;
  const remapped = wrapped[logicalKey];
  if (!remapped || typeof remapped !== 'object' || Array.isArray(remapped)) return remapped;
  let output = { ...(remapped as Record<string, unknown>) };
  const entityRules = DECLARED_JSON_ENTITY_TABLES[`${context.table}.${context.column}`];
  if (entityRules) {
    for (const [key, table] of Object.entries(entityRules)) {
      if (!(key in output)) continue;
      let entity = remapEntityId(output[key], maps, table);
      if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
        const entityOutput = { ...(entity as Record<string, unknown>) };
        const stringArrayRules = DECLARED_JSON_ENTITY_STRING_ARRAY_TABLES[`${context.table}.${context.column}`]?.[key] ?? {};
        for (const [field, referencedTable] of Object.entries(stringArrayRules)) {
          if (field in entityOutput) {
            entityOutput[field] = remapJsonStringArray(entityOutput[field], maps, referencedTable);
          }
        }
        entity = entityOutput;
      }
      output[key] = entity;
    }
    const aggregateTable = typeof context.row.aggregateType === 'string'
      ? MEMORY_AGGREGATE_TABLES[context.row.aggregateType]
      : null;
    if (aggregateTable && typeof output.id === 'string') {
      output = remapEntityId(output, maps, aggregateTable) as Record<string, unknown>;
    }
  }
  if (
    context.table === 'ai_continuity_import_effects'
    && (context.column === 'beforeStateJson' || context.column === 'afterStateJson')
  ) {
    const targetTable = context.row.effectType === 'profile_upsert'
      ? 'ai_user_profiles'
      : typeof context.row.effectType === 'string' && context.row.effectType.startsWith('memory_')
        ? 'ai_memories'
        : null;
    if (targetTable) output = remapEntityId(output, maps, targetTable) as Record<string, unknown>;
  }
  return output;
}
