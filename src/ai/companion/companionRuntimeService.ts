import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../../database';
import type { AiBranchScope } from '../../database/repositories/aiThreadRepository';
import type { AiThreadRecord } from '../types';
import { hashBranchRoute } from '../context/conversationCoverage';
import { deriveCompanionTraceId } from './companionDiagnostics';
import { observeCompanionEvents } from './companionEventObserver';
import { COMPANION_EVENT_POLICY_VERSION } from './companionEventPolicy';
import {
  appendCompanionEvent,
  enqueueCompanionRuntimeJob,
  recordCompanionContextTrace,
  listCompanionOpenLoops,
  listVisibleCompanionEvents,
  transitionCompanionOpenLoop,
  upsertCompanionOpenLoop,
  upsertCompanionTemporalAnchor,
  type CompanionOpenLoopRecord,
  type CompanionTemporalAnchorRecord,
} from './companionEventRepository';
import { buildOpenLoopDraft } from './companionOpenLoopService';
import { parseTemporalPhrases, resolveCompanionTimeZone } from './companionTemporalService';
import type { CompanionEventRecord, CompanionObservedMessage, CompanionOpenLoopKind } from './companionTypes';
import { isCompanionAwarenessEnabled } from './companionSettingsService';

export interface ObserveCompanionCurrentTurnResult {
  branchRouteHash: string;
  events: CompanionEventRecord[];
  temporalAnchors: CompanionTemporalAnchorRecord[];
  openLoops: CompanionOpenLoopRecord[];
  diagnosticCandidateCount: number;
  observerDurationMs: number;
  enrichmentQueued: boolean;
}

function toObservedMessage(message: Awaited<ReturnType<typeof aiThreadRepository.findMessageById>>): CompanionObservedMessage | null {
  if (!message) return null;
  return {
    branchRootMessageId: message.branchRootMessageId,
    branchVersionIndex: message.branchVersionIndex,
    completedAt: message.completedAt,
    content: message.content,
    id: message.id,
    role: message.role,
    status: message.status,
    updatedAt: message.updatedAt,
  };
}

function shouldQueueEnrichment(result: ReturnType<typeof observeCompanionEvents>): boolean {
  return result.diagnostic.some((candidate) => candidate.needsEnrichment)
    || result.accepted.some((candidate) => (
      candidate.needsEnrichment
      && (candidate.category === 'relationship' || candidate.category === 'user_affect')
    ));
}

function roleSubject(thread: AiThreadRecord): { subjectType: 'role' | 'thread'; subjectId: string } {
  return thread.roleCardId
    ? { subjectId: thread.roleCardId, subjectType: 'role' }
    : { subjectId: thread.id, subjectType: 'thread' };
}

export async function observeCompanionCurrentTurn(input: {
  space: PixorySpace;
  thread: AiThreadRecord;
  userMessageId: string;
  branchScopes?: AiBranchScope[];
  now?: string;
  timeZone?: string | null;
}): Promise<ObserveCompanionCurrentTurnResult> {
  const branchRouteHash = hashBranchRoute(input.branchScopes);
  const startedAt = Date.now();
  if (!(await isCompanionAwarenessEnabled(input.space))) {
    return { branchRouteHash, diagnosticCandidateCount: 0, enrichmentQueued: false, events: [], observerDurationMs: Date.now() - startedAt, openLoops: [], temporalAnchors: [] };
  }
  const message = await runWithDatabaseSpace(input.space, (db) => aiThreadRepository.findMessageById(db, input.userMessageId));
  const observed = toObservedMessage(message);
  if (!observed || observed.role !== 'user' || observed.status !== 'completed' || message?.threadId !== input.thread.id) {
    return { branchRouteHash, diagnosticCandidateCount: 0, enrichmentQueued: false, events: [], observerDurationMs: Date.now() - startedAt, openLoops: [], temporalAnchors: [] };
  }
  const observation = observeCompanionEvents({
    branchRouteHash,
    lineageVersion: input.thread.lineageVersion ?? 0,
    message: observed,
  });
  const now = input.now ?? new Date().toISOString();
  const timeZone = resolveCompanionTimeZone(input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const subject = roleSubject(input.thread);
  const events: CompanionEventRecord[] = [];
  const temporalAnchors: CompanionTemporalAnchorRecord[] = [];
  const openLoops: CompanionOpenLoopRecord[] = [];
  const enrichmentQueued = shouldQueueEnrichment(observation);

  await runWithDatabaseSpace(input.space, async (db) => {
    await db.withTransactionAsync(async () => {
      for (const candidate of observation.accepted) {
        const { event } = await appendCompanionEvent(db, {
          branchRootMessageId: observed.branchRootMessageId,
          branchRouteHash,
          branchVersionIndex: observed.branchVersionIndex,
          candidate,
          lineageVersion: input.thread.lineageVersion ?? 0,
          roleCardId: input.thread.roleCardId,
          sourceMessageId: observed.id,
          space: input.space,
          subjectId: subject.subjectId,
          subjectType: subject.subjectType,
          threadId: input.thread.id,
        });
        events.push(event);
        if (candidate.category === 'boundary' && candidate.payload.dismissOpenLoops === true) {
          const [visibleEvents, activeLoops] = await Promise.all([
            listVisibleCompanionEvents(db, { branchRouteHash, lineageVersion: input.thread.lineageVersion ?? 0, space: input.space, threadId: input.thread.id }),
            listCompanionOpenLoops(db, { branchRouteHash, lineageVersion: input.thread.lineageVersion ?? 0, space: input.space, statuses: ['open'], threadId: input.thread.id }),
          ]);
          const visibleIds = new Set(visibleEvents.map((item) => item.id));
          for (const loop of activeLoops.filter((item) => visibleIds.has(item.sourceEventId))) {
            await transitionCompanionOpenLoop(db, { id: loop.id, resolutionEvidenceMessageId: observed.id, status: 'dismissed' });
          }
        }
        if (candidate.category === 'commitment' && (candidate.subtype === 'completed' || candidate.subtype === 'cancelled')) {
          const [visibleEvents, activeLoops] = await Promise.all([
            listVisibleCompanionEvents(db, { branchRouteHash, lineageVersion: input.thread.lineageVersion ?? 0, space: input.space, threadId: input.thread.id }),
            listCompanionOpenLoops(db, { branchRouteHash, lineageVersion: input.thread.lineageVersion ?? 0, space: input.space, statuses: ['open'], threadId: input.thread.id }),
          ]);
          const visibleIds = new Set(visibleEvents.map((item) => item.id));
          const target = activeLoops.find((item) => visibleIds.has(item.sourceEventId));
          if (target) {
            await transitionCompanionOpenLoop(db, {
              id: target.id,
              resolutionEvidenceMessageId: observed.id,
              status: candidate.subtype === 'completed' ? 'resolved' : 'dismissed',
            });
          }
        }
        if (candidate.category !== 'commitment' && candidate.category !== 'temporal') continue;
        if (candidate.category === 'commitment' && candidate.subtype !== 'created') continue;
        const parsedAnchors = parseTemporalPhrases(observed.content, { now, timeZone });
        for (const parsed of parsedAnchors) {
          const anchor = await upsertCompanionTemporalAnchor(db, {
            branchRouteHash,
            confidence: candidate.confidence,
            idempotencyKey: `anchor:${event.id}:${parsed.parserVersion}:${parsed.sourceStart}:${parsed.sourceEnd}`,
            lineageVersion: input.thread.lineageVersion ?? 0,
            parsed,
            roleCardId: input.thread.roleCardId,
            sourceEventId: event.id,
            sourceMessageId: observed.id,
            space: input.space,
            threadId: input.thread.id,
          });
          temporalAnchors.push(anchor);
        }
        if (candidate.category === 'commitment') {
          const kindValue = typeof candidate.payload.kind === 'string' ? candidate.payload.kind : 'weak';
          const firstAnchor = temporalAnchors[0] ?? null;
          const kind: CompanionOpenLoopKind = firstAnchor?.anchorType === 'recurrence'
            ? 'recurring'
            : kindValue === 'result_wait'
              ? 'result_wait'
              : firstAnchor
                ? 'deadline'
                : 'weak';
          const loopPolicy = buildOpenLoopDraft({
            deadlineAt: firstAnchor?.endAtUtc ?? null,
            kind,
            now,
            recurrenceRule: firstAnchor?.recurrenceRule ?? null,
          });
          const topicText = typeof candidate.payload.commitmentText === 'string'
            ? candidate.payload.commitmentText.slice(0, 160)
            : candidate.evidence.text.slice(0, 160);
          openLoops.push(await upsertCompanionOpenLoop(db, {
            anchorId: firstAnchor?.id ?? null,
            branchRouteHash,
            eventId: event.id,
            idempotencyKey: `loop:${event.id}`,
            lineageVersion: input.thread.lineageVersion ?? 0,
            loop: loopPolicy,
            roleCardId: input.thread.roleCardId,
            sourceMessageId: observed.id,
            space: input.space,
            threadId: input.thread.id,
            topicText,
          }));
        }
      }
      if (enrichmentQueued) {
        await enqueueCompanionRuntimeJob(db, {
          branchRouteHash,
          idempotencyKey: `event-enrichment:${observed.id}:${observed.updatedAt}:${branchRouteHash}`,
          jobType: 'event_enrichment',
          lineageVersion: input.thread.lineageVersion ?? 0,
          nextRunAt: now,
          payload: {
            branchRootMessageId: observed.branchRootMessageId,
            branchVersionIndex: observed.branchVersionIndex,
            messageVersionHash: observation.accepted[0]?.evidence.messageVersionHash
              ?? observation.diagnostic[0]?.evidence.messageVersionHash,
            roleCardId: input.thread.roleCardId,
            sourceMessageIds: [observed.id],
            subjectId: subject.subjectId,
            subjectType: subject.subjectType,
          },
          sourceMessageId: observed.id,
          space: input.space,
          threadId: input.thread.id,
        });
      }
      await recordCompanionContextTrace(db, {
        branchRouteHash,
        createdAt: now,
        diagnosticCandidateCount: observation.diagnostic.length,
        eventCount: observation.accepted.length,
        id: deriveCompanionTraceId({ branchRouteHash, lineageVersion: input.thread.lineageVersion ?? 0, sourceMessageId: observed.id, space: input.space, threadId: input.thread.id }),
        lineageVersion: input.thread.lineageVersion ?? 0,
        observerDurationMs: Date.now() - startedAt,
        optionalCandidateCount: openLoops.length,
        policyVersion: COMPANION_EVENT_POLICY_VERSION,
        reasonCodes: observation.diagnostic.map((candidate) => candidate.diagnosticReason ?? 'diagnostic'),
        sourceMessageId: observed.id,
        space: input.space,
        threadId: input.thread.id,
      });
    });
  });
  return {
    branchRouteHash,
    diagnosticCandidateCount: observation.diagnostic.length,
    enrichmentQueued,
    events,
    observerDurationMs: Date.now() - startedAt,
    openLoops,
    temporalAnchors,
  };
}

export const CompanionRuntimeService = { observeCurrentTurn: observeCompanionCurrentTurn };
