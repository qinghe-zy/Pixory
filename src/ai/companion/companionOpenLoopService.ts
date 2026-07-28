import type { CompanionOpenLoopKind, CompanionOpenLoopPolicyFields, CompanionOpenLoopStatus } from './companionTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(value: string, days: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('invalid_open_loop_time');
  return new Date(date.getTime() + days * DAY_MS).toISOString();
}

export function buildOpenLoopDraft(input: {
  kind: CompanionOpenLoopKind;
  now: string;
  deadlineAt?: string | null;
  recurrenceRule?: string | null;
  priority?: number;
}): CompanionOpenLoopPolicyFields {
  const expiry = input.kind === 'deadline' && input.deadlineAt
    ? addDays(input.deadlineAt, 7)
    : input.kind === 'result_wait'
      ? addDays(input.now, 30)
      : input.kind === 'weak'
        ? addDays(input.now, 14)
        : null;
  return {
    earliestMentionAt: input.deadlineAt ?? input.now,
    expiresAt: expiry,
    kind: input.kind,
    lastMentionedAt: null,
    lastMentionedRound: null,
    mentionCount: 0,
    priority: input.priority ?? (input.kind === 'deadline' ? 80 : input.kind === 'result_wait' ? 65 : 45),
    recurrenceRule: input.recurrenceRule ?? null,
    status: 'open',
  };
}

export function isOpenLoopEligible(
  loop: CompanionOpenLoopPolicyFields,
  now: string,
  currentRound: number,
): boolean {
  void currentRound;
  if (loop.status !== 'open' || loop.mentionCount >= 2) return false;
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return false;
  if (new Date(loop.earliestMentionAt).getTime() > nowMs) return false;
  if (loop.expiresAt && new Date(loop.expiresAt).getTime() <= nowMs) return false;
  if (loop.lastMentionedAt && nowMs - new Date(loop.lastMentionedAt).getTime() < 7 * DAY_MS) return false;
  return true;
}

export function transitionOpenLoop(
  current: CompanionOpenLoopStatus,
  action: 'resolve' | 'dismiss' | 'expire' | 'supersede' | 'settle_occurrence',
  recurring = false,
): CompanionOpenLoopStatus {
  if (current !== 'open') throw new Error('open_loop_is_terminal');
  if (action === 'settle_occurrence') return recurring ? 'open' : 'resolved';
  if (action === 'resolve') return 'resolved';
  if (action === 'dismiss') return 'dismissed';
  if (action === 'expire') return 'expired';
  return 'superseded';
}

export const CompanionOpenLoopService = { buildDraft: buildOpenLoopDraft, isEligible: isOpenLoopEligible, transition: transitionOpenLoop };
