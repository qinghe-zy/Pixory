import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository } from '../../database/repositories/aiThreadRepository';
import type { PixorySpace } from '../../database/db';
import type { AiThreadRecord } from '../types';
import { hashBranchRoute } from '../context/conversationCoverage';
import { applyAffectEvent, initialCompanionAffectState, type AffectPolicyEvent } from './companionAffectPolicy';
import { listVisibleCompanionEvents } from './companionEventRepository';
import type { CompanionEventRecord } from './companionTypes';
import {
  companionProjectionPolicyVersion,
  findCompanionProjection,
  listCompanionRepairs,
  saveCompanionProjection,
  updateCompanionRepair,
  upsertAffectiveObservation,
  upsertCompanionRepair,
  type CompanionProjectionSnapshotRecord,
} from './companionProjectionRepository';
import { applyRelationshipEvent, initialRelationshipProjection, type RelationshipProjection } from './companionRelationshipPolicy';
import { createRepairDraft } from './companionRepairService';
import { planCompanionStance } from './companionStancePlanner';
import { parseCompanionJsonObject } from './companionRuntimeValidation';
import { appendCompanionEvent } from './companionEventRepository';
import { applyRepairAssistantTurn } from './companionRepairService';
import { hashCompanionMessageVersion, hashCompanionText } from './companionRuntimeValidation';
import { enqueueCompanionRuntimeJob } from './companionEventRepository';
import { eventsAfterLatestCompanionReset } from './companionResetPolicy';

function policyEvent(event: CompanionEventRecord): AffectPolicyEvent {
  return { category: event.category, confidence: event.confidence, intensity: event.intensity, sincerity: event.sincerity, speechMode: event.speechMode, subtype: event.subtype };
}

function eventEvidenceText(event: CompanionEventRecord): string {
  const evidence = parseCompanionJsonObject(event.evidenceSpanJson);
  return typeof evidence?.text === 'string' ? evidence.text : '';
}

function replayRelationship(events: CompanionEventRecord[]): RelationshipProjection {
  return events.reduce((state, event) => applyRelationshipEvent(state, policyEvent(event)), initialRelationshipProjection());
}

async function adoptedBranchHash(db: SQLiteDatabase, thread: AiThreadRecord): Promise<string> {
  if (!thread.currentBranchRootMessageId || !thread.currentBranchVersionIndex) return hashBranchRoute([]);
  const scopes = await aiThreadRepository.resolveBranchLineage(db, thread.currentBranchRootMessageId, thread.currentBranchVersionIndex);
  return hashBranchRoute(scopes);
}

export async function rebuildRoleRelationshipBase(db: SQLiteDatabase, input: {
  space: PixorySpace; roleCardId: string; now: string;
}): Promise<CompanionProjectionSnapshotRecord> {
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM ai_threads WHERE space = ? AND roleCardId = ?', input.space, input.roleCardId);
  const events: CompanionEventRecord[] = [];
  const unresolvedRepairIds: string[] = [];
  for (const row of rows) {
    const thread = await aiThreadRepository.findThreadById(db, row.id);
    if (!thread) continue;
    const route = await adoptedBranchHash(db, thread);
    const scope = { branchRouteHash: route, lineageVersion: thread.lineageVersion ?? 0, space: input.space, threadId: thread.id };
    const visible = eventsAfterLatestCompanionReset(await listVisibleCompanionEvents(db, scope));
    events.push(...visible);
    const visibleIds = new Set(visible.map((event) => event.id));
    const repairs = await listCompanionRepairs(db, scope);
    unresolvedRepairIds.push(...repairs.filter((repair) => visibleIds.has(repair.sourceEventId)).map((repair) => repair.id));
  }
  events.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const relationship = events.reduce(
    (state, event) => applyRelationshipEvent(state, policyEvent(event)),
    { ...initialRelationshipProjection(), unresolvedRepairIds: [...new Set(unresolvedRepairIds)] },
  );
  const affect = initialCompanionAffectState();
  const stance = planCompanionStance({ affect, currentEvents: [], relationship, unresolvedRepair: relationship.unresolvedRepairIds.length > 0 });
  return saveCompanionProjection(db, {
    affect,
    basedOnEventSequence: events.length,
    branchRouteHash: '',
    lineageVersion: 0,
    policyVersion: companionProjectionPolicyVersion(),
    relationship,
    roleCardId: input.roleCardId,
    scopeType: 'role_base',
    space: input.space,
    stance,
    threadId: null,
  });
}

export async function rebuildCompanionProjection(db: SQLiteDatabase, input: {
  space: PixorySpace; thread: AiThreadRecord; branchRouteHash: string; lineageVersion: number;
  currentMessageId: string; currentRound: number; now: string;
}): Promise<CompanionProjectionSnapshotRecord> {
  await db.runAsync(
    `UPDATE companion_affective_observations SET status = 'expired', updatedAt = ?
     WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ? AND status = 'active'
       AND (expiresAt <= ? OR expiresAfterRound <= ?)`,
    input.now, input.space, input.thread.id, input.branchRouteHash, input.lineageVersion, input.now, input.currentRound,
  );
  const scope = { branchRouteHash: input.branchRouteHash, lineageVersion: input.lineageVersion, space: input.space, threadId: input.thread.id };
  const events = eventsAfterLatestCompanionReset(await listVisibleCompanionEvents(db, scope));
  const existingRepairs = await listCompanionRepairs(db, scope);
  const knownRepairEventIds = new Set(existingRepairs.map((repair) => repair.sourceEventId));
  for (const event of events) {
    if (event.category === 'user_affect') {
      await upsertAffectiveObservation(db, {
        branchRouteHash: input.branchRouteHash,
        confidence: event.confidence,
        expiresAfterRound: input.currentRound + 8,
        expiresAt: new Date(new Date(input.now).getTime() + 6 * 60 * 60 * 1000).toISOString(),
        label: event.subtype,
        lineageVersion: input.lineageVersion,
        roleCardId: input.thread.roleCardId,
        sourceEventId: event.id,
        sourceMessageId: event.sourceMessageId,
        sourceMessageVersionHash: event.sourceMessageVersionHash,
        space: input.space,
        threadId: input.thread.id,
      });
    }
    if ((event.category === 'boundary' || event.category === 'correction') && !knownRepairEventIds.has(event.id)) {
      await upsertCompanionRepair(db, {
        branchRouteHash: input.branchRouteHash,
        draft: createRepairDraft({
          category: event.category,
          evidenceText: eventEvidenceText(event),
          sourceEventId: event.id,
          sourceMessageId: event.sourceMessageId,
          subtype: event.subtype,
        }),
        lineageVersion: input.lineageVersion,
        roleCardId: input.thread.roleCardId,
        sourceMessageVersionHash: event.sourceMessageVersionHash,
        space: input.space,
        threadId: input.thread.id,
      });
    }
  }
  const activeRepairs = await listCompanionRepairs(db, scope);
  const activeRepairIds = activeRepairs.filter((repair) => events.some((event) => event.id === repair.sourceEventId)).map((repair) => repair.id);
  const roleBase = input.thread.roleCardId
    ? await rebuildRoleRelationshipBase(db, { now: input.now, roleCardId: input.thread.roleCardId, space: input.space })
    : null;
  let affect = initialCompanionAffectState();
  let relationship = roleBase?.relationship ?? initialRelationshipProjection();
  relationship = { ...relationship, unresolvedRepairIds: activeRepairIds };
  for (const event of events) {
    affect = applyAffectEvent(affect, policyEvent(event), {
      stage: relationship.stage,
      trust: relationship.trust,
      unresolvedRupture: activeRepairIds.length > 0,
    });
    if (!roleBase) relationship = applyRelationshipEvent(relationship, policyEvent(event));
  }
  relationship = { ...relationship, atmosphere: activeRepairIds.length > 0 ? 'repairing' : relationship.atmosphere, unresolvedRepairIds: activeRepairIds };
  const currentEvents = events.filter((event) => event.sourceMessageId === input.currentMessageId).map(policyEvent);
  const stance = planCompanionStance({ affect, currentEvents, relationship, unresolvedRepair: activeRepairIds.length > 0 });
  return saveCompanionProjection(db, {
    affect,
    basedOnEventSequence: Math.max(0, ...events.map((event) => event.eventSequence)),
    branchRouteHash: input.branchRouteHash,
    lineageVersion: input.lineageVersion,
    policyVersion: companionProjectionPolicyVersion(),
    relationship,
    roleCardId: input.thread.roleCardId,
    scopeType: input.thread.roleCardId ? 'branch_overlay' : 'thread',
    space: input.space,
    stance,
    threadId: input.thread.id,
  });
}

export async function findCurrentCompanionProjection(db: SQLiteDatabase, input: {
  space: PixorySpace; thread: AiThreadRecord; branchRouteHash: string; lineageVersion: number;
}): Promise<CompanionProjectionSnapshotRecord | null> {
  return findCompanionProjection(db, {
    branchRouteHash: input.branchRouteHash,
    lineageVersion: input.lineageVersion,
    roleCardId: input.thread.roleCardId,
    scopeType: input.thread.roleCardId ? 'branch_overlay' : 'thread',
    space: input.space,
    threadId: input.thread.id,
  });
}

export async function processCompanionAssistantRepairTurns(db: SQLiteDatabase, input: {
  space: PixorySpace;
  thread: AiThreadRecord;
  assistantMessageId: string;
  branchRouteHash: string;
  lineageVersion: number;
  currentRound: number;
  now: string;
}): Promise<{ verified: number; violated: number }> {
  const message = await aiThreadRepository.findMessageById(db, input.assistantMessageId);
  if (!message || message.threadId !== input.thread.id || message.role !== 'assistant' || message.status !== 'completed') return { verified: 0, violated: 0 };
  const scope = { branchRouteHash: input.branchRouteHash, lineageVersion: input.lineageVersion, space: input.space, threadId: input.thread.id };
  const [visibleEvents, repairs] = await Promise.all([listVisibleCompanionEvents(db, scope), listCompanionRepairs(db, scope)]);
  const events = eventsAfterLatestCompanionReset(visibleEvents);
  const visibleIds = new Set(events.map((event) => event.id));
  const observedMessage = {
    branchRootMessageId: message.branchRootMessageId,
    branchVersionIndex: message.branchVersionIndex,
    completedAt: message.completedAt,
    content: message.content,
    id: message.id,
    role: message.role,
    status: message.status,
    updatedAt: message.updatedAt,
  } as const;
  const messageVersionHash = hashCompanionMessageVersion(observedMessage);
  let verified = 0;
  let violated = 0;
  for (const repair of repairs.filter((item) => visibleIds.has(item.sourceEventId) && item.lastCheckedAssistantMessageId !== message.id)) {
    if (repair.semanticReviewRequired) {
      if (repair.state === 'acknowledged') continue;
      await enqueueCompanionRuntimeJob(db, {
        branchRouteHash: input.branchRouteHash,
        idempotencyKey: `repair-verification:${repair.id}:${message.id}:${messageVersionHash}`,
        jobType: 'event_enrichment',
        lineageVersion: input.lineageVersion,
        nextRunAt: input.now,
        payload: {
          assistantMessageVersionHash: messageVersionHash,
          currentRound: input.currentRound,
          mode: 'repair_verification',
          repairId: repair.id,
          sourceMessageIds: [message.id],
        },
        sourceMessageId: message.id,
        space: input.space,
        threadId: input.thread.id,
      });
      await updateCompanionRepair(db, {
        id: repair.id,
        lastCheckedAssistantMessageId: message.id,
        passedRelevantTurns: repair.passedRelevantTurns,
        state: 'acknowledged',
        violationCount: repair.violationCount,
      });
      continue;
    }
    const next = applyRepairAssistantTurn(repair, message.content);
    await updateCompanionRepair(db, {
      id: repair.id,
      lastCheckedAssistantMessageId: message.id,
      passedRelevantTurns: next.passedRelevantTurns,
      resolutionEvidenceMessageId: next.state === 'verified' ? message.id : null,
      state: next.state,
      violationCount: next.violationCount,
    });
    if (next.state === repair.state) continue;
    const subtype = next.state === 'verified' ? 'repair_confirmed' : next.violationCount > repair.violationCount ? 'boundary_violation' : null;
    if (!subtype) continue;
    if (subtype === 'repair_confirmed') verified += 1;
    else violated += 1;
    const category = subtype === 'repair_confirmed' ? 'relationship' : 'assistant';
    await appendCompanionEvent(db, {
      branchRootMessageId: message.branchRootMessageId,
      branchRouteHash: input.branchRouteHash,
      branchVersionIndex: message.branchVersionIndex,
      candidate: {
        category,
        confidence: 1,
        diagnosticReason: null,
        effectiveNow: false,
        evidence: { end: message.content.length, messageId: message.id, messageVersionHash, start: 0, text: message.content.slice(0, 240) },
        extractorVersion: 'companion-repair-verifier-v1',
        intensity: 1,
        needsEnrichment: false,
        payload: { repairId: repair.id },
        semanticKey: hashCompanionText([repair.id, message.id, messageVersionHash, subtype].join('\u001F')),
        sincerity: 1,
        speechMode: 'asserted',
        subtype,
      },
      lineageVersion: input.lineageVersion,
      roleCardId: input.thread.roleCardId,
      sourceMessageId: message.id,
      space: input.space,
      subjectId: input.thread.roleCardId ?? input.thread.id,
      subjectType: input.thread.roleCardId ? 'role' : 'thread',
      threadId: input.thread.id,
    });
  }
  await rebuildCompanionProjection(db, {
    branchRouteHash: input.branchRouteHash,
    currentMessageId: message.id,
    currentRound: input.currentRound,
    lineageVersion: input.lineageVersion,
    now: input.now,
    space: input.space,
    thread: input.thread,
  });
  return { verified, violated };
}

export const CompanionProjectionEngine = { findCurrent: findCurrentCompanionProjection, processAssistantRepairs: processCompanionAssistantRepairTurns, rebuild: rebuildCompanionProjection, rebuildRoleBase: rebuildRoleRelationshipBase };
