import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../../database';
import { MemoryFacade } from './memoryFacade';
import { detectMemoryIntent, type MemoryIntentObservation } from './memoryIntentDetector';
import {
  consumeCurrentTurnObservation,
  listPendingCurrentTurnObservations,
  parseObservationPayload,
  writeCurrentTurnObservation,
} from './memoryCurrentTurnRepository';
import type {
  MemoryClaimCandidate,
  MemoryCurrentTurnObservation,
  MemoryScopeType,
} from './memoryTypes';
import { resolveMemoryIntentTargetClaimIds } from './memoryRetrievalService';

export interface LocalFastExtractorInput {
  space: PixorySpace;
  threadId: string;
  messageId: string;
  messageContent: string;
  branchRootMessageId?: string | null;
  branchVersionIndex?: number | null;
  reasoningText?: string | null;
  thinking?: string | null;
}

export interface LocalFastExtractionResult {
  observation: MemoryCurrentTurnObservation;
  candidates: MemoryClaimCandidate[];
  writtenClaimCount: number;
}

function isClearlyNonFactual(text: string): boolean {
  return /开玩笑|哈哈|如果|假设|引用|据说|可能吧|也许|角色扮演/u.test(text);
}

function candidate(
  partial: Pick<MemoryClaimCandidate, 'predicate' | 'valueDisplay' | 'valueNormalized'> & Partial<MemoryClaimCandidate>
): MemoryClaimCandidate {
  return {
    actor: 'user',
    confidenceBand: partial.confidenceBand ?? 'medium',
    confidenceRaw: partial.confidenceRaw ?? 0.7,
    importance: partial.importance ?? 30,
    kind: partial.kind ?? 'state',
    polarity: partial.polarity ?? 'positive',
    scopeId: partial.scopeId ?? null,
    scopeType: partial.scopeType ?? 'thread',
    speechMode: partial.speechMode ?? 'asserted',
    stability: partial.stability ?? 'short',
    ...partial,
  };
}

export function extractLocalClaimCandidates(
  message: string,
  defaultScope: { scopeType: MemoryScopeType; scopeId: string | null } = { scopeId: null, scopeType: 'thread' }
): MemoryClaimCandidate[] {
  const normalized = message.replace(/\s+/gu, ' ').trim();
  if (normalized.length < 4 || isClearlyNonFactual(normalized)) {
    return [];
  }
  const result: MemoryClaimCandidate[] = [];
  const push = (item: MemoryClaimCandidate): void => {
    const meaningful = item.valueNormalized.length >= 2 || /[\u4e00-\u9fff]/u.test(item.valueNormalized);
    if (result.length < 6 && meaningful && item.valueNormalized.length <= 180) {
      result.push(item);
    }
  };

  for (const match of normalized.matchAll(/(?:请记住|记住|以后默认|之后默认)([^。！？!?]{2,120})/gu)) {
    const value = (match[1] ?? '').trim();
    push(candidate({
      confidenceBand: 'high',
      confidenceRaw: 0.92,
      importance: 90,
      kind: 'state',
      predicate: 'preference.communication',
      scopeId: defaultScope.scopeId,
      scopeType: defaultScope.scopeType,
      speechMode: 'corrected',
      stability: 'permanent',
      valueDisplay: value,
      valueNormalized: value,
    }));
  }

  for (const match of normalized.matchAll(/我(?:喜欢|偏好|希望|习惯|通常|一般)([^。！？!?]{1,120})/gu)) {
    const value = (match[1] ?? '').trim();
    push(candidate({
      importance: 70,
      kind: 'state',
      predicate: 'preference.general',
      scopeId: defaultScope.scopeId,
      scopeType: defaultScope.scopeType,
      stability: 'long',
      valueDisplay: `我${match[0].slice(1)}`,
      valueNormalized: value,
    }));
  }

  for (const match of normalized.matchAll(/(?:我有|我养了|我住在|我叫|我是)([^。！？!?]{1,120})/gu)) {
    const value = (match[1] ?? '').trim();
    push(candidate({
      importance: 70,
      kind: 'state',
      predicate: 'fact.identity',
      scopeId: defaultScope.scopeId,
      scopeType: defaultScope.scopeType,
      stability: 'long',
      valueDisplay: match[0].trim(),
      valueNormalized: value,
    }));
  }

  const pushSafety = (value: string, display: string): void => {
    push(candidate({
      confidenceBand: 'low',
      confidenceRaw: 0.75,
      importance: 100,
      kind: 'state',
      predicate: 'boundary.safety',
      safetyState: 'safety_pending',
      scopeId: defaultScope.scopeId,
      scopeType: defaultScope.scopeType,
      speechMode: 'asserted',
      stability: 'permanent',
      valueDisplay: display.trim(),
      valueNormalized: value,
    }));
  };
  for (const match of normalized.matchAll(/我(?:对)?([^。！？!?]{1,80})过敏/gu)) {
    pushSafety((match[1] ?? '').trim(), match[0]);
  }
  for (const match of normalized.matchAll(/我(?:忌口|不能吃|过敏于)([^。！？!?]{1,100})/gu)) {
    pushSafety((match[1] ?? '').trim(), match[0]);
  }
  for (const match of normalized.matchAll(/不要给我([^。！？!?]{1,100})/gu)) {
    pushSafety((match[1] ?? '').trim(), match[0]);
  }

  return result;
}

function observationPayload(
  intent: MemoryIntentObservation,
  targets: Array<{
    canonicalClaimId: string;
    predicate: string;
    scopeType: string;
    scopeId: string | null;
  }>
): Record<string, unknown> {
  return {
    ...intent.payload,
    candidateSource: 'local-fast-v1',
    targets,
  };
}

async function writeCandidates(
  input: LocalFastExtractorInput,
  candidates: MemoryClaimCandidate[]
): Promise<number> {
  let written = 0;
  for (const item of candidates) {
    try {
      await MemoryFacade.createClaim({
        actor: item.actor,
        confidenceBand: item.confidenceBand,
        confidenceRaw: item.confidenceRaw,
        importance: item.importance,
        kind: item.kind,
        lane: 'working',
        polarity: item.polarity,
        predicate: item.predicate,
        safetyState: item.safetyState,
        scopeId: item.scopeId,
        scopeType: item.scopeType,
        sourceKind: 'message',
        sourceMessageId: input.messageId,
        space: input.space,
        speechMode: item.speechMode,
        stability: item.stability,
        subjectDisplay: '用户',
        subjectEntityId: 'user',
        validFrom: item.validFrom,
        validPrecision: item.validPrecision,
        validTo: item.validTo,
        valueDisplay: item.valueDisplay,
        valueNormalized: item.valueNormalized,
        extractorVersion: 'local-fast-v1',
      }, {
        commandId: [
          'local-fast-v1',
          input.messageId,
          item.predicate,
          item.valueNormalized,
        ].join(':'),
        source: 'local_fast_extractor',
      });
      written += 1;
    } catch {
      // A duplicate canonical claim or malformed candidate must not block chat.
    }
  }
  return written;
}

export async function runLocalFastExtraction(input: LocalFastExtractorInput): Promise<LocalFastExtractionResult> {
  // reasoningText/thinking are intentionally accepted only to make the exclusion explicit;
  // neither field is passed to the detector or candidate extractor.
  void input.reasoningText;
  void input.thinking;
  const intent = detectMemoryIntent(input.messageContent);
  const targetResolution = await runWithDatabaseSpace(input.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread) {
      return { ids: [] as string[], targets: [] as Array<{
        canonicalClaimId: string;
        predicate: string;
        scopeType: string;
        scopeId: string | null;
      }> };
    }
    const ids = await resolveMemoryIntentTargetClaimIds(db, {
      observation: intent,
      thread,
    });
    if (ids.length === 0) {
      return { ids, targets: [] };
    }
    const rows = await db.getAllAsync<{
      canonicalClaimId: string;
      predicate: string;
      scopeType: string;
      scopeId: string | null;
    }>(
      `SELECT canonicalClaimId, predicate, scopeType, scopeId
       FROM memory_claims
       WHERE space = ? AND id IN (${ids.map(() => '?').join(', ')})`,
      input.space,
      ...ids
    );
    return { ids, targets: rows };
  });
  const candidates = extractLocalClaimCandidates(input.messageContent, {
    scopeId: input.threadId,
    scopeType: 'thread',
  });
  const observation = await runWithDatabaseSpace(input.space, (db) =>
    writeCurrentTurnObservation(db, {
      branchRootMessageId: input.branchRootMessageId,
      branchVersionIndex: input.branchVersionIndex,
      explicitUserAction: intent.explicitUserAction,
      intent: intent.intent,
      messageId: input.messageId,
      payload: observationPayload(intent, targetResolution.targets),
      space: input.space,
      threadId: input.threadId,
    })
  );
  if (intent.intent === 'forget') {
    for (const claimId of targetResolution.ids) {
      await MemoryFacade.deleteClaim({ claimId, space: input.space }, {
        actorId: 'user',
        commandId: `intent-v1:${input.messageId}:forget:${claimId}`,
        source: 'current_turn_observation',
      });
    }
  } else if (intent.intent === 'correction') {
    for (const claimId of targetResolution.ids) {
      await MemoryFacade.staleClaim({ claimId, space: input.space }, {
        actorId: 'user',
        commandId: `intent-v1:${input.messageId}:correction:${claimId}`,
        source: 'current_turn_observation',
      });
    }
  }
  const writtenClaimCount = await writeCandidates(input, candidates);
  await runWithDatabaseSpace(input.space, (db) =>
    consumeCurrentTurnObservation(db, { id: observation.id, space: input.space })
  );
  return { candidates, observation, writtenClaimCount };
}

export async function drainCurrentTurnMemory(input: {
  space: PixorySpace;
  threadId: string;
  maxDurationMs?: number;
}): Promise<number> {
  const startedAt = Date.now();
  const pending = await runWithDatabaseSpace(input.space, (db) =>
    listPendingCurrentTurnObservations(db, { space: input.space, threadId: input.threadId })
  );
  let processed = 0;
  for (const observation of pending) {
    if (Date.now() - startedAt >= (input.maxDurationMs ?? 20)) {
      break;
    }
    const message = await runWithDatabaseSpace(input.space, (db) =>
      aiThreadRepository.findMessageById(db, observation.messageId)
    );
    if (!message || message.role !== 'user') {
      await runWithDatabaseSpace(input.space, (db) =>
        consumeCurrentTurnObservation(db, { id: observation.id, space: input.space })
      );
      processed += 1;
      continue;
    }
    const payload = parseObservationPayload(observation);
    await runLocalFastExtraction({
      branchRootMessageId: observation.branchRootMessageId,
      branchVersionIndex: observation.branchVersionIndex,
      messageContent: message.content,
      messageId: message.id,
      reasoningText: null,
      space: input.space,
      threadId: input.threadId,
    });
    void payload;
    processed += 1;
  }
  return processed;
}

export function buildLocalMemoryMaintenanceStepResult(): {
  error: null;
  modelId: null;
  providerId: null;
  usedFallback: boolean;
  usedRemote: false;
} {
  return {
    error: null,
    modelId: null,
    providerId: null,
    usedFallback: false,
    usedRemote: false,
  };
}

export const LocalFastExtractor = {
  drain: drainCurrentTurnMemory,
  extract: runLocalFastExtraction,
};
