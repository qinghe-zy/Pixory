import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../../database';
import type { AiMessageRecord } from '../../database/repositories/aiThreadRepository';
import type { AiThreadRecord } from '../types';
import { hashCompanionMessageVersion } from '../companion/companionRuntimeValidation';
import { DREAM_POLICY_VERSION, detectDreamIntent, detectManualDreamRequest, deterministicDreamRoll, dreamFrequencyAllowed, shouldPrepruneDream } from './dreamPolicy';
import { dreamRepository, type DreamSeedRecord } from './dreamRepository';
import { emitDreamRuntimeNotice } from './dreamRuntimeEvents';
import { scheduleCompanionMaintenance } from '../companion/companionMaintenanceQueue';
import { buildDreamConversationSnapshot, pairCompletedConversationRounds } from '../companion/companionConversationSnapshotService';
import { hashBranchRoute } from '../context/conversationCoverage';

function versionHash(message: AiMessageRecord): string {
  return hashCompanionMessageVersion({ branchRootMessageId: message.branchRootMessageId, branchVersionIndex: message.branchVersionIndex, completedAt: message.completedAt, content: message.content, id: message.id, role: message.role, status: message.status, updatedAt: message.updatedAt });
}
function snapshot(messages: AiMessageRecord[], triggerMessageIds: string[]): {
  focusIds: string[];
  ids: string[];
  hashes: string[];
  hash: string;
} {
  const frozen = buildDreamConversationSnapshot({
    maxSourceCharacters: 18_000,
    messages,
    roundLimit: 20,
    triggerMessageIds,
  });
  return {
    focusIds: frozen.focusMessages.map((message) => message.id),
    hash: frozen.sourceSnapshotHash,
    hashes: frozen.sourceMessageVersionHashes,
    ids: frozen.sourceMessageIds,
  };
}

export async function registerCompanionDreamRound(db: SQLiteDatabase, input: {
  space: PixorySpace; thread: AiThreadRecord; branchRouteHash: string; recentMessages: AiMessageRecord[];
  userMessage: AiMessageRecord; assistantMessage: AiMessageRecord; now: string;
}): Promise<{ jobId: string | null; seed: DreamSeedRecord | null }> {
  if (!input.thread.roleCardId || input.userMessage.status !== 'completed' || input.assistantMessage.status !== 'completed') return { jobId: null, seed: null };
  const registered = await dreamRepository.registerRound(db, { assistantMessageId: input.assistantMessage.id, assistantMessageVersionHash: versionHash(input.assistantMessage), branchRouteHash: input.branchRouteHash, now: input.now, roleCardId: input.thread.roleCardId, space: input.space, threadId: input.thread.id, userMessageId: input.userMessage.id, userMessageVersionHash: versionHash(input.userMessage) });
  if (!registered.inserted) return { jobId: null, seed: null };
  const combinedText = `${input.userMessage.content}\n${input.assistantMessage.content}`;
  const detected = detectDreamIntent(combinedText);
  const active = await dreamRepository.findActiveScene(db, { branchRouteHash: input.branchRouteHash, lineageVersion: input.thread.lineageVersion ?? 0, roleCardId: input.thread.roleCardId, space: input.space, threadId: input.thread.id });
  if (detected.closing) { if (active) await dreamRepository.closeScene(db, active.id, input.now); return { jobId: null, seed: null }; }
  if (!detected.candidate) return { jobId: null, seed: null };
  const source = snapshot(input.recentMessages, [input.userMessage.id, input.assistantMessage.id]);
  const scene = await dreamRepository.upsertScene(db, { branchRouteHash: input.branchRouteHash, evidenceMessageIds: source.focusIds, lineageVersion: input.thread.lineageVersion ?? 0, now: input.now, roleCardId: input.thread.roleCardId, sourceSnapshotHash: source.hash, space: input.space, state: detected.sceneState, threadId: input.thread.id });
  if (await dreamRepository.findSeedForScene(db, scene.id)) return { jobId: null, seed: null };
  const key = `dream-seed:${input.space}:${input.thread.roleCardId}:${scene.id}`; const roll = deterministicDreamRoll(key);
  // A clear sleep-quality/product topic has a proven zero trigger probability, so it never spends a classifier call.
  const provenUpperBound = detected.intent === 'sleep_topic' ? 0 : undefined;
  const decision = !dreamFrequencyAllowed(registered.counter) ? 'frequency_blocked' : shouldPrepruneDream(roll, false, provenUpperBound) ? 'prepruned' : 'classifying';
  const seed = await dreamRepository.createSeed(db, { branchRouteHash: input.branchRouteHash, decision, idempotencyKey: key, lineageVersion: input.thread.lineageVersion ?? 0, manual: false, policyVersion: DREAM_POLICY_VERSION, roleCardId: input.thread.roleCardId, roleSnapshotJson: input.thread.roleSnapshotJson, roll, sceneId: scene.id, sourceMessageIds: source.ids, sourceMessageVersionHashes: source.hashes, sourceSnapshotHash: source.hash, space: input.space, threadId: input.thread.id, now: input.now });
  if (decision !== 'classifying') return { jobId: null, seed };
  const job = await dreamRepository.createJob(db, { now: input.now, phase: 'classifying', seed });
  emitDreamRuntimeNotice({ jobId: job.id, threadId: input.thread.id, type: 'generating' });
  return { jobId: job.id, seed };
}

export async function detectAndCreateManualDreamRequest(input: { space: PixorySpace; threadId: string; userMessageId: string; branchRouteHash: string; recentMessages: AiMessageRecord[]; now?: string }): Promise<DreamSeedRecord | null> {
  const now = input.now ?? new Date().toISOString();
  return runWithDatabaseSpace(input.space, async (db) => {
    const [thread, message] = await Promise.all([aiThreadRepository.findThreadById(db, input.threadId), aiThreadRepository.findMessageById(db, input.userMessageId)]);
    if (!thread?.roleCardId || !message || message.role !== 'user' || message.status !== 'completed' || !detectManualDreamRequest(message.content)) return null;
    const source = snapshot([...input.recentMessages, message], [message.id]);
    let scene = await dreamRepository.upsertScene(db, { branchRouteHash: input.branchRouteHash, evidenceMessageIds: source.focusIds, lineageVersion: thread.lineageVersion ?? 0, now, roleCardId: thread.roleCardId, sourceSnapshotHash: source.hash, space: input.space, state: 'dream_active', threadId: thread.id });
    const existing = await dreamRepository.findSeedForScene(db, scene.id);
    if (existing?.manual) return existing;
    if (existing) {
      await dreamRepository.closeScene(db, scene.id, now);
      scene = await dreamRepository.upsertScene(db, { branchRouteHash: input.branchRouteHash, evidenceMessageIds: source.focusIds, lineageVersion: thread.lineageVersion ?? 0, now: new Date(new Date(now).getTime() + 1).toISOString(), roleCardId: thread.roleCardId, sourceSnapshotHash: source.hash, space: input.space, state: 'dream_active', threadId: thread.id });
    }
    const key = `manual-dream:${input.space}:${thread.id}:${message.id}:${versionHash(message)}`;
    const seed = await dreamRepository.createSeed(db, { branchRouteHash: input.branchRouteHash, decision: 'awaiting_confirmation', idempotencyKey: key, lineageVersion: thread.lineageVersion ?? 0, manual: true, policyVersion: DREAM_POLICY_VERSION, roleCardId: thread.roleCardId, roleSnapshotJson: thread.roleSnapshotJson, roll: deterministicDreamRoll(key), sceneId: scene.id, sourceMessageIds: source.ids, sourceMessageVersionHashes: source.hashes, sourceSnapshotHash: source.hash, space: input.space, threadId: thread.id, now });
    emitDreamRuntimeNotice({ seedId: seed.id, threadId: thread.id, type: 'manual_confirmation' }); return seed;
  });
}

export async function confirmManualDream(space: PixorySpace, seedId: string, accepted: boolean): Promise<string | null> {
  const now = new Date().toISOString();
  return runWithDatabaseSpace(space, async (db) => {
    const seed = await dreamRepository.findSeed(db, seedId); if (!seed || !seed.manual || seed.decision !== 'awaiting_confirmation') return null;
    if (!accepted) { await dreamRepository.updateSeed(db, { decision: 'cancelled', id: seed.id, now }); return null; }
    await dreamRepository.updateSeed(db, { decision: 'selected', id: seed.id, now });
    const job = await dreamRepository.createJob(db, { now, phase: 'generating', seed: { ...seed, decision: 'selected' } });
    emitDreamRuntimeNotice({ jobId: job.id, threadId: seed.threadId, type: 'generating' });
    scheduleCompanionMaintenance({ allowRemoteModelForPersonal: space === 'personal', delayMs: 0, space });
    return job.id;
  });
}

export async function regenerateDreamFromCurrentConversation(input: {
  space: PixorySpace;
  failedJobId: string;
}): Promise<string | null> {
  const now = new Date().toISOString();
  const replacement = await runWithDatabaseSpace(input.space, async (db) => {
    const failedJob = await dreamRepository.findJob(db, input.failedJobId);
    if (!failedJob || failedJob.status !== 'failed' || failedJob.lastErrorCode !== 'source_changed') return null;
    const thread = await aiThreadRepository.findThreadById(db, failedJob.threadId);
    if (!thread?.roleCardId || thread.roleCardId !== failedJob.roleCardId) return null;
    const branchScopes = thread.currentBranchRootMessageId && thread.currentBranchVersionIndex != null
      ? await aiThreadRepository.resolveBranchLineage(db, thread.currentBranchRootMessageId, thread.currentBranchVersionIndex)
      : [];
    const candidates = await aiThreadRepository.listSnapshotCandidateMessages(db, thread.id, 20, branchScopes);
    const latestRound = pairCompletedConversationRounds(candidates).at(-1);
    if (!latestRound) return null;
    const source = snapshot(candidates, latestRound.messages.map((message) => message.id));
    const staleScene = await dreamRepository.findScene(db, failedJob.sceneId);
    if (staleScene?.status === 'active') await dreamRepository.closeScene(db, staleScene.id, now);
    const branchRouteHash = hashBranchRoute(branchScopes);
    const scene = await dreamRepository.upsertScene(db, {
      branchRouteHash,
      evidenceMessageIds: source.focusIds,
      lineageVersion: thread.lineageVersion ?? 0,
      now,
      roleCardId: thread.roleCardId,
      sourceSnapshotHash: source.hash,
      space: input.space,
      state: staleScene?.semanticState === 'closed' ? 'dream_active' : staleScene?.semanticState ?? 'dream_active',
      threadId: thread.id,
    });
    const key = `dream-recover:${input.failedJobId}:${source.hash}`;
    const seed = await dreamRepository.createSeed(db, {
      branchRouteHash,
      decision: 'selected',
      idempotencyKey: key,
      lineageVersion: thread.lineageVersion ?? 0,
      manual: true,
      policyVersion: DREAM_POLICY_VERSION,
      roleCardId: thread.roleCardId,
      roleSnapshotJson: thread.roleSnapshotJson,
      roll: deterministicDreamRoll(key),
      sceneId: scene.id,
      sourceMessageIds: source.ids,
      sourceMessageVersionHashes: source.hashes,
      sourceSnapshotHash: source.hash,
      space: input.space,
      threadId: thread.id,
      now,
    });
    const job = await dreamRepository.createJob(db, { now, phase: 'generating', seed });
    await dreamRepository.transitionJob(db, {
      errorCode: 'replaced_by_current_source',
      id: failedJob.id,
      now,
      status: 'cancelled',
    });
    return job;
  });
  if (!replacement) return null;
  emitDreamRuntimeNotice({ jobId: replacement.id, threadId: replacement.threadId, type: 'generating' });
  scheduleCompanionMaintenance({ allowRemoteModelForPersonal: input.space === 'personal', delayMs: 0, space: input.space });
  return replacement.id;
}

export async function regenerateDreamVersion(input: {
  space: PixorySpace;
  dreamId: string;
}): Promise<string> {
  const now = new Date().toISOString();
  const job = await runWithDatabaseSpace(input.space, async (db) => {
    const dream = await dreamRepository.find(db, input.dreamId);
    if (!dream) {
      throw new Error('梦境版本不存在或已删除。');
    }
    const seed = await dreamRepository.findSeed(db, dream.seedId);
    const thread = await aiThreadRepository.findThreadById(db, dream.sourceThreadId);
    if (!seed || !thread || thread.roleCardId !== dream.roleCardId) {
      throw new Error('梦境来源已不可用，无法重新生成。');
    }
    const key = `dream-version:${dream.id}:${now}`;
    const replacementSeed = await dreamRepository.createSeed(db, {
      branchRouteHash: seed.branchRouteHash,
      decision: 'selected',
      idempotencyKey: key,
      lineageVersion: seed.lineageVersion,
      manual: true,
      policyVersion: seed.policyVersion,
      roleCardId: seed.roleCardId,
      roleSnapshotJson: seed.roleSnapshotJson,
      roll: seed.roll,
      sceneId: seed.sceneId,
      sourceMessageIds: seed.sourceMessageIds,
      sourceMessageVersionHashes: seed.sourceMessageVersionHashes,
      sourceSnapshotHash: seed.sourceSnapshotHash,
      space: seed.space,
      threadId: seed.threadId,
      now,
    });
    return dreamRepository.createJob(db, {
      now,
      phase: 'generating',
      seed: replacementSeed,
      targetVersionGroupId: dream.versionGroupId,
    });
  });
  emitDreamRuntimeNotice({ jobId: job.id, threadId: job.threadId, type: 'generating' });
  scheduleCompanionMaintenance({ allowRemoteModelForPersonal: input.space === 'personal', delayMs: 0, space: input.space });
  return job.id;
}

export const dreamService = { confirmManual: confirmManualDream, detectManualRequest: detectAndCreateManualDreamRequest, regenerateCurrent: regenerateDreamFromCurrentConversation, regenerateVersion: regenerateDreamVersion, registerRound: registerCompanionDreamRound };
