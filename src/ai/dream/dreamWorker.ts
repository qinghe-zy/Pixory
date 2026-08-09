import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../../database';
import { callMemoryMaintenanceModel } from '../aiMemoryMaintenanceModelService';
import { normalizeProviderUsage } from '../aiProviderUsage';
import { hashCompanionMessageVersion, hashCompanionText } from '../companion/companionRuntimeValidation';
import { hashBranchRoute } from '../context/conversationCoverage';
import { DREAM_CLASSIFICATION_JSON_SCHEMA, DREAM_GENERATION_JSON_SCHEMA, dreamIntentProbability, parseDreamClassification, parseDreamGeneration, shouldSelectDream } from './dreamPolicy';
import { dreamRepository, type DreamJobRecord, type DreamRecord } from './dreamRepository';
import { emitDreamRuntimeNotice } from './dreamRuntimeEvents';
import { buildDreamConversationSnapshot } from '../companion/companionConversationSnapshotService';
import { buildDreamClassificationPrompt, buildDreamGenerationPrompt } from './dreamPromptService';

const activeControllers = new Map<string, { controller: AbortController; space: PixorySpace }>();
function addMs(value: string, ms: number) { return new Date(new Date(value).getTime() + ms).toISOString(); }

async function validateSourceInDb(db: SQLiteDatabase, job: DreamJobRecord) {
    const [thread, seed, scene] = await Promise.all([aiThreadRepository.findThreadById(db, job.threadId), dreamRepository.findSeed(db, job.seedId), dreamRepository.findScene(db, job.sceneId)]);
    if (!thread || !seed || !scene) return null;
    const branchScopes = thread.currentBranchRootMessageId && thread.currentBranchVersionIndex != null ? await aiThreadRepository.resolveBranchLineage(db, thread.currentBranchRootMessageId, thread.currentBranchVersionIndex) : [];
    if (hashBranchRoute(branchScopes) !== job.branchRouteHash || (thread.lineageVersion ?? 0) !== job.lineageVersion) return null;
    const messages = await aiThreadRepository.findMessagesByIds(db, job.sourceMessageIds, branchScopes);
    if (messages.length !== job.sourceMessageIds.length || messages.some((message) => message.status !== 'completed' || (message.role !== 'user' && message.role !== 'assistant'))) return null;
    const byId = new Map(messages.map((message) => [message.id, message]));
    const ordered = job.sourceMessageIds.map((id) => byId.get(id)).filter(Boolean) as typeof messages;
    const hashes = ordered.map((message) => hashCompanionMessageVersion({ branchRootMessageId: message.branchRootMessageId, branchVersionIndex: message.branchVersionIndex, completedAt: message.completedAt, content: message.content, id: message.id, role: message.role, status: message.status, updatedAt: message.updatedAt }));
    const sourceHash = hashCompanionText(job.sourceMessageIds.map((id, index) => `${id}:${hashes[index]}`).join('\u001F'));
    return sourceHash === job.sourceSnapshotHash && sourceHash === seed.sourceSnapshotHash ? { messages: ordered, scene, seed, thread } : null;
}

async function validateSource(space: PixorySpace, job: DreamJobRecord) {
  return runWithDatabaseSpace(space, (db) => validateSourceInDb(db, job));
}

async function recordUsage(space: PixorySpace, job: DreamJobRecord, model: Awaited<ReturnType<typeof callMemoryMaintenanceModel>>, now: string) {
  if (!model.providerProtocol || !model.rawUsage) return;
  const usage = normalizeProviderUsage(model.providerProtocol, model.rawUsage);
  await runWithDatabaseSpace(space, (db) => dreamRepository.recordUsage(db, {
    completionTokens: usage.completionTokens,
    id: job.id,
    now,
    phase: job.phase,
    promptTokens: usage.totalPromptTokens ?? usage.promptTokens,
  }));
}

async function failOrRetry(space: PixorySpace, job: DreamJobRecord, workerId: string, now: string, code: string) {
  const terminal = job.attemptCount >= job.maxAttempts;
  await runWithDatabaseSpace(space, async (db) => {
    if (terminal) await dreamRepository.releaseQuota(db, job, now);
    await dreamRepository.transitionJob(db, { errorCode: code, id: job.id, nextRunAt: addMs(now, Math.min(6, job.attemptCount) * 60 * 60 * 1000), now, status: terminal ? 'failed' : 'retry', workerId });
    if (terminal) await dreamRepository.updateSeed(db, { decision: 'failed', id: job.seedId, now });
  });
  if (terminal) emitDreamRuntimeNotice({ jobId: job.id, threadId: job.threadId, type: 'failed' });
  return terminal ? 'failed' as const : 'failed' as const;
}

async function waitForModel(space: PixorySpace, job: DreamJobRecord, workerId: string, now: string, code: string): Promise<void> {
  await runWithDatabaseSpace(space, async (db) => {
    await dreamRepository.releaseQuota(db, job, now);
    await dreamRepository.transitionJob(db, {
      errorCode: code,
      id: job.id,
      nextRunAt: addMs(now, 24 * 60 * 60 * 1000),
      now,
      status: 'waiting_model',
      workerId,
    });
  });
  emitDreamRuntimeNotice({ jobId: job.id, threadId: job.threadId, type: 'failed' });
}

export async function runDreamJob(input: { space: PixorySpace; jobId: string; now?: string; allowRemoteModelForPersonal?: boolean; assertActive?: () => void }): Promise<'completed'|'deferred'|'failed'|'skipped'> {
  input.assertActive?.();
  const now = input.now ?? new Date().toISOString(); const workerId = `dream-${hashCompanionText(`${input.jobId}:${now}`).slice(0, 12)}`;
  const job = await runWithDatabaseSpace(input.space, (db) => dreamRepository.acquireJob(db, { id: input.jobId, leaseUntil: addMs(now, 5 * 60 * 1000), now, workerId }));
  input.assertActive?.();
  if (!job) return 'skipped';
  if (input.space === 'personal' && input.allowRemoteModelForPersonal !== true) {
    await waitForModel(input.space, job, workerId, now, 'personal_remote_not_authorized');
    return 'deferred';
  }
  const source = await validateSource(input.space, job); input.assertActive?.(); if (!source) {
    await runWithDatabaseSpace(input.space, async (db) => { await dreamRepository.releaseQuota(db, job, now); await dreamRepository.transitionJob(db, { errorCode: 'source_changed', id: job.id, now, status: 'failed', workerId }); await dreamRepository.updateSeed(db, { decision: 'failed', id: job.seedId, now }); });
    emitDreamRuntimeNotice({ jobId: job.id, threadId: job.threadId, type: 'failed' }); return 'failed';
  }
  if (job.phase === 'generating' && !source.seed.manual && !job.quotaReserved) {
    const reserved = await runWithDatabaseSpace(input.space, (db) => dreamRepository.reserveQuota(db, job, now));
    if (!reserved) {
      await runWithDatabaseSpace(input.space, async (db) => {
        await dreamRepository.transitionJob(db, { errorCode: 'frequency_blocked', id: job.id, now, status: 'failed', workerId });
        await dreamRepository.updateSeed(db, { decision: 'frequency_blocked', id: job.seedId, now });
      });
      emitDreamRuntimeNotice({ jobId: job.id, threadId: job.threadId, type: 'failed' });
      return 'failed';
    }
  }
  const controller = new AbortController(); activeControllers.set(job.id, { controller, space: input.space });
  try {
    const frozenSourceIds = new Set(job.sourceMessageIds);
    const triggerMessageIds = source.scene.evidenceMessageIds.filter((id) => frozenSourceIds.has(id));
    if (triggerMessageIds.length === 0 && source.messages.at(-1)) {
      triggerMessageIds.push(source.messages.at(-1)!.id);
    }
    const conversationSnapshot = buildDreamConversationSnapshot({
      maxSourceCharacters: 18_000,
      messages: source.messages,
      roundLimit: 20,
      triggerMessageIds,
    });
    if (job.phase === 'classifying') {
      const prompt = buildDreamClassificationPrompt(conversationSnapshot);
      const model = await callMemoryMaintenanceModel({
        maxOutputTokens: 220,
        responseFormat: 'json_object',
        responseJsonSchema: DREAM_CLASSIFICATION_JSON_SCHEMA,
        signal: controller.signal,
        space: input.space,
        thinkingDisabled: true,
        systemPrompt: prompt.systemPrompt,
        thread: source.thread,
        userPrompt: prompt.userPrompt,
      });
      input.assertActive?.();
      await recordUsage(input.space, job, model, now);
      if (!model.text) {
        if (!model.usedRemote && !model.error) {
          await waitForModel(input.space, job, workerId, now, 'model_unavailable');
          return 'deferred';
        }
        return failOrRetry(input.space, job, workerId, now, 'provider_failed');
      }
      const classification = parseDreamClassification(model.text, new Set(conversationSnapshot.focusMessages.map((message) => message.id))); if (!classification) return failOrRetry(input.space, job, workerId, now, 'invalid_classification');
      if (!shouldSelectDream(source.seed.roll, classification)) { await runWithDatabaseSpace(input.space, async (db) => { await dreamRepository.updateSeed(db, { classification, decision: 'rejected', id: source.seed.id, now, probability: dreamIntentProbability[classification.intentType] }); await dreamRepository.transitionJob(db, { id: job.id, now, status: 'completed', workerId }); }); return 'completed'; }
      const reserved = await runWithDatabaseSpace(input.space, async (db) => { const ok = await dreamRepository.reserveQuota(db, job, now); if (ok) { await dreamRepository.updateSeed(db, { classification, decision: 'selected', id: source.seed.id, now, probability: dreamIntentProbability[classification.intentType] }); await dreamRepository.transitionJob(db, { id: job.id, nextRunAt: now, now, phase: 'generating', resetAttemptCount: true, status: 'pending', workerId }); } else { await dreamRepository.updateSeed(db, { decision: 'frequency_blocked', id: source.seed.id, now }); await dreamRepository.transitionJob(db, { errorCode: 'frequency_blocked', id: job.id, now, status: 'completed', workerId }); } return ok; });
      if (reserved) emitDreamRuntimeNotice({ jobId: job.id, threadId: job.threadId, type: 'generating' }); return 'completed';
    }
    emitDreamRuntimeNotice({ jobId: job.id, threadId: job.threadId, type: 'generating' });
    const prompt = buildDreamGenerationPrompt({
      // The thread snapshot is part of the source session that created the
      // durable job. A later role-card edit must not mutate retry output.
      roleVoice: source.thread.roleSnapshotJson,
      snapshot: conversationSnapshot,
    });
    const model = await callMemoryMaintenanceModel({ maxOutputTokens: 320, responseFormat: 'json_object', responseJsonSchema: DREAM_GENERATION_JSON_SCHEMA, signal: controller.signal, space: input.space, thinkingDisabled: true, systemPrompt: prompt.systemPrompt, thread: source.thread, userPrompt: prompt.userPrompt });
    input.assertActive?.();
    await recordUsage(input.space, job, model, now);
    if (!model.text) {
      if (!model.usedRemote && !model.error) {
        await waitForModel(input.space, job, workerId, now, 'model_unavailable');
        return 'deferred';
      }
      return failOrRetry(input.space, job, workerId, now, 'provider_failed');
    }
    const generated = parseDreamGeneration(model.text); if (!generated) return failOrRetry(input.space, job, workerId, now, 'invalid_generation');
    const dream = await runWithDatabaseSpace(input.space, async (db) => {
      let committed: Awaited<ReturnType<typeof dreamRepository.complete>> = null;
      await db.withTransactionAsync(async () => {
        const freshSource = await validateSourceInDb(db, job);
        if (!freshSource) {
          await dreamRepository.releaseQuota(db, job, now);
          await dreamRepository.transitionJob(db, { errorCode: 'source_changed', id: job.id, now, status: 'failed', workerId });
          await dreamRepository.updateSeed(db, { decision: 'failed', id: job.seedId, now });
          return;
        }
        committed = await dreamRepository.complete(db, { body: generated.body, job, now, seed: freshSource.seed, title: generated.title, workerId });
      });
      return committed as unknown as DreamRecord | null;
    });
    if (!dream) {
      emitDreamRuntimeNotice({ jobId: job.id, threadId: job.threadId, type: 'failed' });
      return 'failed';
    }
    emitDreamRuntimeNotice({ dreamId: dream.id, jobId: job.id, threadId: job.threadId, type: 'completed' });
    return 'completed';
  } finally { activeControllers.delete(job.id); }
}

export function abortDreamJobsForSpace(space: PixorySpace): void { for (const active of activeControllers.values()) if (active.space === space) active.controller.abort(); }
export async function cancelDreamGeneration(space: PixorySpace, jobId: string): Promise<void> { activeControllers.get(jobId)?.controller.abort(); await runWithDatabaseSpace(space, (db) => dreamRepository.cancelJob(db, jobId)); const job = await runWithDatabaseSpace(space, (db) => dreamRepository.findJob(db, jobId)); if (job) emitDreamRuntimeNotice({ jobId, threadId: job.threadId, type: 'cancelled' }); }

export type DreamRetryResult =
  | { status: 'scheduled'; jobId: string }
  | { status: 'frequency_blocked' }
  | { status: 'not_retryable' };

export async function retryDreamGeneration(space: PixorySpace, jobId: string): Promise<DreamRetryResult> {
  const now = new Date().toISOString();
  const result = await runWithDatabaseSpace(space, async (db): Promise<{ job: DreamJobRecord } | DreamRetryResult> => {
    const current = await dreamRepository.findJob(db, jobId);
    if (!current || (current.status !== 'failed' && current.status !== 'waiting_model')) {
      return { status: 'not_retryable' };
    }
    const seed = await dreamRepository.findSeed(db, current.seedId);
    if (!seed) return { status: 'not_retryable' };
    if (current.phase === 'generating' && !seed.manual && !current.quotaReserved) {
      const reserved = await dreamRepository.reserveQuota(db, current, now);
      if (!reserved) {
        await dreamRepository.transitionJob(db, {
          errorCode: 'frequency_blocked',
          id: current.id,
          now,
          status: 'failed',
        });
        return { status: 'frequency_blocked' };
      }
    }
    await db.runAsync(
      `UPDATE companion_dream_jobs
       SET status = 'pending', attemptCount = 0, cancelRequested = 0, nextRunAt = ?,
           leaseOwner = NULL, leaseUntil = NULL, lastErrorCode = NULL,
           completedAt = NULL, updatedAt = ?
       WHERE id = ? AND status IN ('failed', 'waiting_model')`,
      now,
      now,
      jobId,
    );
    await dreamRepository.updateSeed(db, {
      decision: current.phase === 'classifying' ? 'classifying' : 'selected',
      id: current.seedId,
      now,
    });
    return { job: { ...current, status: 'pending' } };
  });
  if ('status' in result) return result;
  emitDreamRuntimeNotice({ jobId, threadId: result.job.threadId, type: 'generating' });
  const { scheduleCompanionMaintenance } = await import('../companion/companionMaintenanceQueue');
  scheduleCompanionMaintenance({ allowRemoteModelForPersonal: space === 'personal', delayMs: 0, space });
  return { jobId, status: 'scheduled' };
}

export const dreamWorker = { abortSpace: abortDreamJobsForSpace, cancel: cancelDreamGeneration, retry: retryDreamGeneration, run: runDreamJob };
