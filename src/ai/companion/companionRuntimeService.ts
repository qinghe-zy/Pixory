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
import { rebuildCompanionProjection } from './companionProjectionEngine';
import type { CompanionProjectionSnapshotRecord } from './companionProjectionRepository';

export interface ObserveCompanionCurrentTurnResult {
  branchRouteHash: string;
  events: CompanionEventRecord[];
  temporalAnchors: CompanionTemporalAnchorRecord[];
  openLoops: CompanionOpenLoopRecord[];
  diagnosticCandidateCount: number;
  observerDurationMs: number;
  enrichmentQueued: boolean;
  projection: CompanionProjectionSnapshotRecord | null;
  awarenessEnabled: boolean;
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

const OPEN_LOOP_BOILERPLATE_REGEX =
  /今天|明天|后天|早上|上午|中午|下午|晚上|下周[一二三四五六日天]|每周[一二三四五六日天]|\d{1,2}月\d{1,2}日|之后|以后|到时候|别再问|别再提|不要再问|不要再提|不要问|不要提|请别|请勿|麻烦|已经|终于|完成了?|做完了?|搞定了?|结束了?|收到了?|出来了?|有了|不等了?|取消|这事算了|这件?事|这个|那个|那些|不打算继续了?|告诉你|跟你说|再聊|一起|确认|结果|消息|通知|到了/gu;

function extractOpenLoopSubstantiveTokens(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(OPEN_LOOP_BOILERPLATE_REGEX, ' ')
    .replace(/(?:^|\s)[等把我你他她它]/gu, ' ')
    .replace(/[了着过的吧吗呢啊呀事问题]/gu, ' ')
    .replace(/[\s,，。！？!?；;：:“”"'‘’()（）\[\]【】<>、]+/gu, ' ')
    .trim();
  if (!cleaned) {
    return [];
  }
  const tokens = new Set<string>();
  for (const segment of cleaned.split(/\s+/u)) {
    if (!segment) {
      continue;
    }
    for (const word of segment.matchAll(/[a-z0-9]{2,}/gu)) {
      tokens.add(word[0]);
    }
    for (const cjk of segment.matchAll(/[\u4e00-\u9fff]{2,}/gu)) {
      const value = cjk[0];
      tokens.add(value);
      for (let size = 2; size <= 3; size += 1) {
        for (let i = 0; i <= value.length - size; i += 1) {
          tokens.add(value.slice(i, i + size));
        }
      }
    }
  }
  return [...tokens];
}

function scoreOpenLoopTopicOverlap(loopTopicText: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) {
    return 0;
  }
  const topicTokens = new Set(extractOpenLoopSubstantiveTokens(loopTopicText));
  if (topicTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of queryTokens) {
    if (topicTokens.has(token)) {
      overlap += token.length >= 3 ? 2 : 1;
    }
  }
  return overlap;
}

async function listVisibleActiveOpenLoops(
  db: Parameters<typeof listVisibleCompanionEvents>[0],
  input: {
    space: PixorySpace;
    threadId: string;
    branchRouteHash: string;
    lineageVersion: number;
  }
): Promise<CompanionOpenLoopRecord[]> {
  // Execute sequentially inside an active transaction to avoid concurrent queries on one SQLite handle.
  const visibleEvents = await listVisibleCompanionEvents(db, input);
  const activeLoops = await listCompanionOpenLoops(db, {
    ...input,
    statuses: ['open'],
  });
  const visibleIds = new Set(visibleEvents.map((item) => item.id));
  return activeLoops.filter((item) => visibleIds.has(item.sourceEventId));
}

function selectOpenLoopsForBoundaryDismissal(
  visibleActiveLoops: CompanionOpenLoopRecord[],
  queryText: string
): CompanionOpenLoopRecord[] {
  const queryTokens = extractOpenLoopSubstantiveTokens(queryText);
  if (queryTokens.length === 0) {
    return visibleActiveLoops;
  }
  return visibleActiveLoops.filter((loop) => scoreOpenLoopTopicOverlap(loop.topicText, queryTokens) > 0);
}

function selectOpenLoopForSettlement(
  visibleActiveLoops: CompanionOpenLoopRecord[],
  queryText: string
): CompanionOpenLoopRecord | null {
  if (visibleActiveLoops.length === 0) {
    return null;
  }
  const queryTokens = extractOpenLoopSubstantiveTokens(queryText);
  if (queryTokens.length === 0) {
    // Purely anaphoric completion ("已经搞定了" / "收到了") only resolves unambiguously when one open loop exists.
    return visibleActiveLoops.length === 1 ? visibleActiveLoops[0] : null;
  }
  let bestLoop: CompanionOpenLoopRecord | null = null;
  let bestScore = 0;
  for (const loop of visibleActiveLoops) {
    const score = scoreOpenLoopTopicOverlap(loop.topicText, queryTokens);
    if (score > bestScore) {
      bestScore = score;
      bestLoop = loop;
    }
  }
  return bestScore > 0 ? bestLoop : null;
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
  const awarenessEnabled = await isCompanionAwarenessEnabled(input.space);
  const message = await runWithDatabaseSpace(input.space, (db) => aiThreadRepository.findMessageById(db, input.userMessageId));
  const observed = toObservedMessage(message);
  if (!observed || observed.role !== 'user' || observed.status !== 'completed' || message?.threadId !== input.thread.id) {
    return { awarenessEnabled, branchRouteHash, diagnosticCandidateCount: 0, enrichmentQueued: false, events: [], observerDurationMs: Date.now() - startedAt, openLoops: [], projection: null, temporalAnchors: [] };
  }
  const observedSignals = observeCompanionEvents({
    branchRouteHash,
    lineageVersion: input.thread.lineageVersion ?? 0,
    message: observed,
  });
  const observation = awarenessEnabled ? observedSignals : {
    accepted: observedSignals.accepted.filter((candidate) => candidate.category === 'boundary' || candidate.category === 'correction'),
    diagnostic: [],
    speechMode: observedSignals.speechMode,
  };
  const now = input.now ?? new Date().toISOString();
  const timeZone = resolveCompanionTimeZone(input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const subject = roleSubject(input.thread);
  const events: CompanionEventRecord[] = [];
  const temporalAnchors: CompanionTemporalAnchorRecord[] = [];
  const openLoops: CompanionOpenLoopRecord[] = [];
  const enrichmentQueued = awarenessEnabled && shouldQueueEnrichment(observation);
  let projection: CompanionProjectionSnapshotRecord | null = null;

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
          const visibleActiveLoops = await listVisibleActiveOpenLoops(db, {
            branchRouteHash,
            lineageVersion: input.thread.lineageVersion ?? 0,
            space: input.space,
            threadId: input.thread.id,
          });
          const boundaryQuery = typeof candidate.payload.constraint === 'string'
            ? candidate.payload.constraint
            : observed.content;
          for (const loop of selectOpenLoopsForBoundaryDismissal(visibleActiveLoops, boundaryQuery)) {
            await transitionCompanionOpenLoop(db, { id: loop.id, resolutionEvidenceMessageId: observed.id, status: 'dismissed' });
          }
        }
        if (candidate.category === 'commitment' && (candidate.subtype === 'completed' || candidate.subtype === 'cancelled')) {
          const visibleActiveLoops = await listVisibleActiveOpenLoops(db, {
            branchRouteHash,
            lineageVersion: input.thread.lineageVersion ?? 0,
            space: input.space,
            threadId: input.thread.id,
          });
          const settlementQuery = [
            observed.content,
            typeof candidate.payload.commitmentText === 'string' ? candidate.payload.commitmentText : '',
          ].join(' ');
          const target = selectOpenLoopForSettlement(visibleActiveLoops, settlementQuery);
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
      if (awarenessEnabled) {
        const completedMessageCount = await aiThreadRepository.countCompletedNonSystemMessages(db, input.thread.id, input.branchScopes);
        projection = await rebuildCompanionProjection(db, {
          branchRouteHash,
          currentMessageId: observed.id,
          currentRound: Math.floor(completedMessageCount / 2),
          lineageVersion: input.thread.lineageVersion ?? 0,
          now,
          space: input.space,
          thread: input.thread,
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
    awarenessEnabled,
    branchRouteHash,
    diagnosticCandidateCount: observation.diagnostic.length,
    enrichmentQueued,
    events,
    observerDurationMs: Date.now() - startedAt,
    openLoops,
    projection,
    temporalAnchors,
  };
}

export const CompanionRuntimeService = { observeCurrentTurn: observeCompanionCurrentTurn };
