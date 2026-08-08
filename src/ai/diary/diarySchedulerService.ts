import { Platform } from 'react-native';

import { getDatabase, runWithDatabaseSpace, type PixorySpace } from '../../database';
import { diaryRepository, type RoleDiaryJobRecord } from './diaryRepository';
import { beijingDiaryDayBounds, beijingDiaryDate, decideDiaryTrigger, DIARY_TIME_ZONE, type DiaryTriggerKind } from './diaryTypes';
import { cancelDiaryAlarm, scheduleDiaryAlarm } from '../../native/pixoryMediaModule';
import { generateRoleDiary } from './diaryGenerationService';
import type { AiBranchScope, AiMessageRecord } from '../../database/repositories/aiThreadRepository';
import { aiThreadRepository, settingsRepository } from '../../database';
import { buildDiaryConversationSnapshot } from '../companion/companionConversationSnapshotService';
import { hashDiaryJobContextSnapshot } from './diarySnapshotContract';

const STALE_GENERATING_JOB_MS = 15 * 60 * 1_000;
const dueRunsBySpace = new Map<PixorySpace, Promise<void>>();

export interface ScheduleDiaryJobInput {
  space: PixorySpace;
  roleCardId: string;
  diaryDate: string;
  triggerKind: DiaryTriggerKind | 'manual' | 'wake';
  scheduledFor: string;
  sourceThreadId: string | null;
  sourceBranchRouteJson: string;
  sourceMessagesJson: string;
  sourceSummarySnapshot: string | null;
  sourceSystemPromptSnapshot: string | null;
  roleSnapshotJson: string;
  jobContextSnapshotHash: string;
}

function jobIdempotencyKey(input: ScheduleDiaryJobInput): string {
  if (input.triggerKind === 'manual') {
    return [input.roleCardId, input.diaryDate, input.triggerKind, input.jobContextSnapshotHash, input.scheduledFor].join(':');
  }
  if (input.triggerKind !== 'wake') {
    return [input.roleCardId, input.diaryDate, 'automatic'].join(':');
  }
  return [input.roleCardId, input.diaryDate, input.triggerKind, diaryWakeSlot(input.scheduledFor), snapshotHash(input.sourceBranchRouteJson)].join(':');
}

export async function scheduleDiaryJob(input: ScheduleDiaryJobInput): Promise<RoleDiaryJobRecord> {
  const job = await runWithDatabaseSpace(input.space, (db) => diaryRepository.createOrReuseJob(db, {
    id: `diary-job:${jobIdempotencyKey(input)}`,
    roleCardId: input.roleCardId,
    diaryDate: input.diaryDate,
    triggerKind: input.triggerKind,
    scheduledFor: input.scheduledFor,
    sourceThreadId: input.sourceThreadId,
    sourceBranchRouteJson: input.sourceBranchRouteJson,
    sourceMessagesJson: input.sourceMessagesJson,
    sourceSummarySnapshot: input.sourceSummarySnapshot,
    sourceSystemPromptSnapshot: input.sourceSystemPromptSnapshot,
    roleSnapshotJson: input.roleSnapshotJson,
    jobContextSnapshotHash: input.jobContextSnapshotHash,
    status: 'pending',
    idempotencyKey: jobIdempotencyKey(input),
  }));

  if (Platform.OS === 'android' && input.space === 'normal' && Date.parse(job.scheduledFor) > Date.now()) {
    try {
      await scheduleDiaryAlarm(Date.parse(job.scheduledFor), job.id);
    } catch {
      // The durable SQLite job is reconciled on the next app foreground.
    }
  }
  return job;
}

function diaryWakeSlot(value: string): string {
  const date = new Date(value);
  return `${beijingDiaryDate(date)}:${Math.floor(date.getTime() / (10 * 60 * 1_000))}`;
}

async function cancelNativeDiaryAlarms(space: PixorySpace, jobIds: string[]): Promise<void> {
  if (Platform.OS !== 'android' || space !== 'normal' || jobIds.length === 0) {
    return;
  }
  await Promise.all(jobIds.map(async (jobId) => {
    try {
      await cancelDiaryAlarm(jobId);
    } catch {
      // The cancelled database task remains the source of truth.
    }
  }));
}

export async function cancelPendingDiaryJobs(space: PixorySpace): Promise<void> {
  const jobIds = await runWithDatabaseSpace(space, (db) => diaryRepository.cancelPendingJobs(db));
  await cancelNativeDiaryAlarms(space, jobIds);
}

export function resolveDiarySessionStartedAt(messages: AiMessageRecord[], quietGapMs = 10 * 60 * 1_000): string | null {
  if (messages.length === 0) {
    return null;
  }
  let start = messages.length - 1;
  while (start > 0) {
    const current = new Date(messages[start].completedAt ?? messages[start].createdAt).getTime();
    const previous = new Date(messages[start - 1].completedAt ?? messages[start - 1].createdAt).getTime();
    if (current - previous > quietGapMs) {
      break;
    }
    start -= 1;
  }
  return messages[start].completedAt ?? messages[start].createdAt;
}

function snapshotHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/** Captures the source immediately, before a delayed background task can run. */
export async function prepareAndScheduleDiaryJob(input: {
  space: PixorySpace;
  threadId: string;
  diaryDate: string;
  triggerKind: DiaryTriggerKind | 'manual';
  scheduledFor: string;
  branchScopes: AiBranchScope[];
}): Promise<RoleDiaryJobRecord> {
  const snapshot: ScheduleDiaryJobInput = await runWithDatabaseSpace(input.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread?.roleCardId) {
      throw new Error('当前会话没有角色卡，无法生成角色日记。');
    }
    const candidates = await aiThreadRepository.listSnapshotCandidateMessages(db, thread.id, 30, input.branchScopes);
    const conversationSnapshot = buildDiaryConversationSnapshot({
      diaryDate: input.diaryDate,
      maxSourceCharacters: 24_000,
      messages: candidates,
      roundLimit: 30,
    });
    const sourceMessagesJson = JSON.stringify(conversationSnapshot.sourceMessages);
    const sourceBranchRouteJson = JSON.stringify(input.branchScopes);
    const jobContextSnapshotHash = hashDiaryJobContextSnapshot({
      branchRouteJson: sourceBranchRouteJson,
      conversationSnapshotHash: conversationSnapshot.sourceSnapshotHash,
      roleCardId: thread.roleCardId,
      roleSnapshotJson: thread.roleSnapshotJson,
      summarySnapshot: thread.summary,
      systemPromptSnapshot: thread.systemPrompt,
    });
    return {
      space: input.space,
      roleCardId: thread.roleCardId,
      diaryDate: input.diaryDate,
      triggerKind: input.triggerKind,
      scheduledFor: input.scheduledFor,
      sourceThreadId: thread.id,
      sourceBranchRouteJson,
      sourceMessagesJson,
      sourceSummarySnapshot: thread.summary,
      sourceSystemPromptSnapshot: thread.systemPrompt,
      roleSnapshotJson: thread.roleSnapshotJson,
      jobContextSnapshotHash,
    };
  });
  return scheduleDiaryJob(snapshot);
}

/** Schedules a durable wake-up that snapshots source only when it is due. */
export async function scheduleDiaryWakeup(input: {
  space: PixorySpace;
  threadId: string;
  scheduledFor: string;
  branchScopes: AiBranchScope[];
}): Promise<RoleDiaryJobRecord> {
  const now = new Date();
  const snapshot: ScheduleDiaryJobInput = await runWithDatabaseSpace(input.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread?.roleCardId) {
      throw new Error('当前会话没有角色卡，无法安排角色日记。');
    }
    const latest = (await aiThreadRepository.listRecentCompletedNonSystemMessages(db, thread.id, 1, input.branchScopes)).at(-1);
    return {
      space: input.space,
      roleCardId: thread.roleCardId,
      diaryDate: beijingDiaryDate(now),
      triggerKind: 'wake',
      scheduledFor: input.scheduledFor,
      sourceThreadId: thread.id,
      sourceBranchRouteJson: JSON.stringify(input.branchScopes),
      sourceMessagesJson: '[]',
      sourceSummarySnapshot: thread.summary,
      sourceSystemPromptSnapshot: thread.systemPrompt,
      roleSnapshotJson: thread.roleSnapshotJson,
      jobContextSnapshotHash: hashDiaryJobContextSnapshot({
        branchRouteJson: JSON.stringify(input.branchScopes),
        conversationSnapshotHash: latest?.id ?? 'no-message',
        roleCardId: thread.roleCardId,
        roleSnapshotJson: thread.roleSnapshotJson,
        summarySnapshot: thread.summary,
        systemPromptSnapshot: thread.systemPrompt,
      }),
    };
  });
  const idempotencyKey = jobIdempotencyKey(snapshot);
  const cancelledJobIds = await runWithDatabaseSpace(input.space, (db) =>
    diaryRepository.cancelPendingWakeupsForRole(db, snapshot.roleCardId, idempotencyKey),
  );
  await cancelNativeDiaryAlarms(input.space, cancelledJobIds);
  return scheduleDiaryJob(snapshot);
}

export async function reconcileDiaryJobs(space: PixorySpace): Promise<RoleDiaryJobRecord[]> {
  const db = await getDatabase(space);
  const now = new Date().toISOString();
  await diaryRepository.recoverStaleGeneratingJobs(
    db,
    new Date(Date.now() - STALE_GENERATING_JOB_MS).toISOString(),
  );
  return db.getAllAsync<RoleDiaryJobRecord>(
    `SELECT *, sourceSnapshotHash AS jobContextSnapshotHash FROM companion_diary_jobs
     WHERE (status IN ('pending', 'due') AND scheduledFor <= ? AND (nextRunAt IS NULL OR nextRunAt <= ?))
        OR (status = 'failed' AND nextRunAt IS NOT NULL AND nextRunAt <= ?)
     ORDER BY scheduledFor ASC`,
    now, now, now,
  );
}

export async function runDueDiaryJobs(space: PixorySpace): Promise<void> {
  if (suspendedDiarySpaces.has(space)) return;
  const existing = dueRunsBySpace.get(space);
  if (existing) {
    return existing;
  }
  const task = (async () => {
    const jobs = await reconcileDiaryJobs(space);
    for (const job of jobs) {
      await runDiaryJob(space, job.id);
    }
  })();
  dueRunsBySpace.set(space, task);
  void task.then(
    () => {
      if (dueRunsBySpace.get(space) === task) {
        dueRunsBySpace.delete(space);
      }
    },
    () => {
      if (dueRunsBySpace.get(space) === task) {
        dueRunsBySpace.delete(space);
      }
    },
  );
  return task;
}

function parseBranchScopes(value: string): AiBranchScope[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is AiBranchScope =>
          Boolean(item)
          && typeof item === 'object'
          && typeof (item as AiBranchScope).branchRootMessageId === 'string'
          && typeof (item as AiBranchScope).branchVersionIndex === 'number'
        )
      : [];
  } catch {
    return [];
  }
}

function parseSnapshotMessages(value: string): AiMessageRecord[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is AiMessageRecord => Boolean(item) && typeof item === 'object'
          && typeof (item as AiMessageRecord).id === 'string'
          && typeof (item as AiMessageRecord).content === 'string')
      : [];
  } catch {
    return [];
  }
}

const suspendedDiarySpaces = new Set<PixorySpace>(['personal']);
const diaryRuntimeTasks = new Map<PixorySpace, Set<Promise<void>>>();
const diaryRuntimeControllers = new Map<PixorySpace, Set<AbortController>>();

function assertDiaryRuntimeActive(space: PixorySpace, signal?: AbortSignal): void {
  if (suspendedDiarySpaces.has(space) || signal?.aborted) throw new Error('Diary runtime is suspended.');
}

async function executeDiaryJob(space: PixorySpace, jobId: string, signal: AbortSignal): Promise<void> {
  assertDiaryRuntimeActive(space, signal);
  const db = await getDatabase(space);
  assertDiaryRuntimeActive(space, signal);
  const job = await diaryRepository.claimJobForRun(db, jobId);
  if (!job) {
    return;
  }
  if (!job.sourceThreadId) {
    await diaryRepository.updateJobStatus(db, jobId, { status: 'failed', errorMessage: '日记来源会话已不可用。' });
    return;
  }
  if (job.triggerKind === 'wake') {
    try {
      assertDiaryRuntimeActive(space, signal);
      const thread = await aiThreadRepository.findThreadById(db, job.sourceThreadId);
      if (!thread?.roleCardId) {
        throw new Error('日记来源会话已不存在。');
      }
      const now = new Date();
      if ((await settingsRepository.getValue(db, 'AI_ROLE_DIARY_ENABLED')) === 'false') {
        await diaryRepository.updateJobStatus(db, jobId, { status: 'cancelled' });
        return;
      }
      const today = beijingDiaryDate(now);
      const todayBounds = beijingDiaryDayBounds(today);
      const branchScopes = parseBranchScopes(job.sourceBranchRouteJson);
      const [dayMessages, recentMessages] = await Promise.all([
        aiThreadRepository.listCompletedMessagesInDateRange(db, thread.id, todayBounds.startIso, todayBounds.endIso, branchScopes),
        aiThreadRepository.listRecentCompletedNonSystemMessages(db, thread.id, 80, branchScopes),
      ]);
      const sessionStartedAt = resolveDiarySessionStartedAt(recentMessages);
      const diaryDateToCheck = sessionStartedAt && beijingDiaryDate(sessionStartedAt) !== today
        ? beijingDiaryDate(sessionStartedAt)
        : today;
      const hasCompletedAutomaticDiary = await diaryRepository.hasCompletedAutomaticDiary(
        db,
        thread.roleCardId,
        diaryDateToCheck,
      );
      const latestMessage = recentMessages.at(-1) ?? null;
      const latestAt = latestMessage?.completedAt ?? latestMessage?.createdAt ?? null;
      const isRecentContinuation = Boolean(latestAt)
        && now.getTime() - new Date(latestAt as string).getTime() <= 10 * 60 * 1_000;
      const decision = decideDiaryTrigger({
        now,
        hasCurrentDiary: hasCompletedAutomaticDiary,
        hasDayChat: dayMessages.length > 0 || (isRecentContinuation && beijingDiaryDate(latestAt as string) !== today),
        isSessionActive: false,
        lastInteractionAt: latestAt,
        lastRealInteractionAt: latestAt,
        sessionStartedAt,
      });
      if (decision.kind !== 'none' && decision.kind !== 'show_manual_hint') {
        const generation = await prepareAndScheduleDiaryJob({
          space,
          threadId: thread.id,
          diaryDate: decision.diaryDate,
          triggerKind: decision.kind,
          scheduledFor: now.toISOString(),
          branchScopes,
        });
        await runDiaryJob(space, generation.id, signal);
      }
      await diaryRepository.updateJobStatus(db, jobId, { status: 'completed' });
      const needsLateFollowUp = decision.kind === 'none'
        && Boolean(latestAt)
        && now.getTime() - new Date(latestAt as string).getTime() <= 10 * 60 * 1_000
        && isLateNightContinuation(now, sessionStartedAt);
      await scheduleDiaryWakeup({
        space,
        threadId: thread.id,
        scheduledFor: needsLateFollowUp ? new Date(now.getTime() + 10 * 60 * 1_000).toISOString() : nextDiaryWakeupAt(now),
        branchScopes,
      });
    } catch (error) {
      await diaryRepository.updateJobStatus(db, jobId, { status: 'failed', errorMessage: error instanceof Error ? error.message : '角色日记唤醒失败。' });
    }
    return;
  }
  try {
    const thread = await aiThreadRepository.findThreadById(db, job.sourceThreadId);
    if (!thread) {
      throw new Error('日记来源会话已不存在。');
    }
    await generateRoleDiary({
      space,
      thread,
      diaryDate: job.diaryDate,
      triggerKind: job.triggerKind,
      branchScopes: parseBranchScopes(job.sourceBranchRouteJson),
      sourceBranchRouteJson: job.sourceBranchRouteJson,
      jobContextSnapshotHash: job.jobContextSnapshotHash,
      sourceSummarySnapshot: job.sourceSummarySnapshot,
      sourceSystemPromptSnapshot: job.sourceSystemPromptSnapshot,
      sourceMessages: parseSnapshotMessages(job.sourceMessagesJson),
      roleSnapshotJson: job.roleSnapshotJson,
      roleCardId: job.roleCardId,
      signal,
    });
    assertDiaryRuntimeActive(space, signal);
    await diaryRepository.updateJobStatus(db, jobId, { status: 'completed' });
  } catch (error) {
    if (signal.aborted || suspendedDiarySpaces.has(space)) {
      await diaryRepository.updateJobStatus(db, jobId, {
        status: 'failed',
        errorMessage: 'Diary generation was suspended.',
        nextRunAt: new Date().toISOString(),
      });
      return;
    }
    const latest = await diaryRepository.findJobById(db, jobId);
    const exhausted = (latest?.attemptCount ?? job.attemptCount + 1) >= 3;
    const message = error instanceof Error ? error.message : '角色日记生成失败。';
    await diaryRepository.updateJobStatus(db, jobId, {
      status: 'failed',
      errorMessage: message,
      nextRunAt: exhausted ? null : new Date(Date.now() + 15 * 60 * 1_000).toISOString(),
    });
  }
}

export function runDiaryJob(space: PixorySpace, jobId: string, parentSignal?: AbortSignal): Promise<void> {
  if (suspendedDiarySpaces.has(space)) return Promise.resolve();
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const controllers = diaryRuntimeControllers.get(space) ?? new Set<AbortController>();
  controllers.add(controller);
  diaryRuntimeControllers.set(space, controllers);
  const task = executeDiaryJob(space, jobId, controller.signal);
  const tasks = diaryRuntimeTasks.get(space) ?? new Set<Promise<void>>();
  tasks.add(task);
  diaryRuntimeTasks.set(space, tasks);
  void task.finally(() => {
    parentSignal?.removeEventListener('abort', abortFromParent);
    controllers.delete(controller);
    tasks.delete(task);
    if (controllers.size === 0) diaryRuntimeControllers.delete(space);
    if (tasks.size === 0) diaryRuntimeTasks.delete(space);
  }).catch(() => undefined);
  return task;
}

export function resumeDiaryRuntime(space: PixorySpace): void {
  suspendedDiarySpaces.delete(space);
}

export async function suspendDiaryRuntime(space: PixorySpace): Promise<void> {
  suspendedDiarySpaces.add(space);
  for (const controller of diaryRuntimeControllers.get(space) ?? []) controller.abort();
  await Promise.allSettled([
    ...(diaryRuntimeTasks.get(space) ?? []),
    ...(dueRunsBySpace.get(space) ? [dueRunsBySpace.get(space)!] : []),
  ]);
}

function isLateNightContinuation(now: Date, sessionStartedAt: string | null): boolean {
  if (!sessionStartedAt) {
    return false;
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DIARY_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  return hour >= 23 || beijingDiaryDate(sessionStartedAt) !== beijingDiaryDate(now);
}

export function nextBeijingDiaryCheck(now = new Date()): string {
  const date = beijingDiaryDate(now);
  const [year, month, day] = date.split('-').map(Number);
  const today2200 = Date.UTC(year, month - 1, day, 14, 0, 0);
  const nowMs = now.getTime();
  return new Date(nowMs < today2200 ? today2200 : today2200 + 24 * 60 * 60 * 1_000).toISOString();
}

export function nextDiaryWakeupAt(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DIARY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const minutes = hour * 60 + minute;
  if (minutes < 22 * 60) {
    return nextBeijingDiaryCheck(now);
  }
  if (minutes < 22 * 60 + 30) {
    return nextBeijingTimeAt(now, 22, 30);
  }
  if (minutes < 23 * 60 + 50) {
    return new Date(now.getTime() + 10 * 60 * 1_000).toISOString();
  }
  // A session that began before 23:50 may finish after midnight. Keep a
  // short-lived wake-up chain until the quiet-period rule resolves it.
  return new Date(now.getTime() + 10 * 60 * 1_000).toISOString();
}

function nextBeijingTimeAt(now: Date, hour: number, minute: number): string {
  const [year, month, day] = beijingDiaryDate(now).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0)).toISOString();
}

export { DIARY_TIME_ZONE };
