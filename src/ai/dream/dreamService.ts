import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../../database';
import type { AiMessageRecord } from '../../database/repositories/aiThreadRepository';
import type { AiThreadRecord } from '../types';
import { hashCompanionMessageVersion, hashCompanionText } from '../companion/companionRuntimeValidation';
import { DREAM_POLICY_VERSION, detectDreamIntent, detectManualDreamRequest, deterministicDreamRoll, dreamFrequencyAllowed, shouldPrepruneDream } from './dreamPolicy';
import { dreamRepository, type DreamSeedRecord } from './dreamRepository';
import { emitDreamRuntimeNotice } from './dreamRuntimeEvents';
import { scheduleCompanionMaintenance } from '../companion/companionMaintenanceQueue';

function versionHash(message: AiMessageRecord): string {
  return hashCompanionMessageVersion({ branchRootMessageId: message.branchRootMessageId, branchVersionIndex: message.branchVersionIndex, completedAt: message.completedAt, content: message.content, id: message.id, role: message.role, status: message.status, updatedAt: message.updatedAt });
}
function snapshot(messages: AiMessageRecord[]): { ids: string[]; hashes: string[]; hash: string } {
  const eligible = messages.filter((message) => message.status === 'completed' && (message.role === 'user' || message.role === 'assistant')).slice(-20);
  const ids = eligible.map((message) => message.id); const hashes = eligible.map(versionHash);
  return { hash: hashCompanionText(ids.map((id, index) => `${id}:${hashes[index]}`).join('\u001F')), hashes, ids };
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
  const source = snapshot(input.recentMessages);
  const scene = await dreamRepository.upsertScene(db, { branchRouteHash: input.branchRouteHash, evidenceMessageIds: source.ids, lineageVersion: input.thread.lineageVersion ?? 0, now: input.now, roleCardId: input.thread.roleCardId, sourceSnapshotHash: source.hash, space: input.space, state: detected.sceneState, threadId: input.thread.id });
  if (await dreamRepository.findSeedForScene(db, scene.id)) return { jobId: null, seed: null };
  const key = `dream-seed:${input.space}:${input.thread.roleCardId}:${scene.id}`; const roll = deterministicDreamRoll(key);
  // A clear sleep-quality/product topic has a proven zero trigger probability, so it never spends a classifier call.
  const provenUpperBound = detected.intent === 'sleep_topic' ? 0 : undefined;
  const decision = !dreamFrequencyAllowed(registered.counter) ? 'frequency_blocked' : shouldPrepruneDream(roll, false, provenUpperBound) ? 'prepruned' : 'classifying';
  const seed = await dreamRepository.createSeed(db, { branchRouteHash: input.branchRouteHash, decision, idempotencyKey: key, lineageVersion: input.thread.lineageVersion ?? 0, manual: false, policyVersion: DREAM_POLICY_VERSION, roleCardId: input.thread.roleCardId, roll, sceneId: scene.id, sourceMessageIds: source.ids, sourceMessageVersionHashes: source.hashes, sourceSnapshotHash: source.hash, space: input.space, threadId: input.thread.id, now: input.now });
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
    const source = snapshot(input.recentMessages);
    let scene = await dreamRepository.upsertScene(db, { branchRouteHash: input.branchRouteHash, evidenceMessageIds: source.ids, lineageVersion: thread.lineageVersion ?? 0, now, roleCardId: thread.roleCardId, sourceSnapshotHash: source.hash, space: input.space, state: 'dream_active', threadId: thread.id });
    const existing = await dreamRepository.findSeedForScene(db, scene.id);
    if (existing?.manual) return existing;
    if (existing) {
      await dreamRepository.closeScene(db, scene.id, now);
      scene = await dreamRepository.upsertScene(db, { branchRouteHash: input.branchRouteHash, evidenceMessageIds: source.ids, lineageVersion: thread.lineageVersion ?? 0, now: new Date(new Date(now).getTime() + 1).toISOString(), roleCardId: thread.roleCardId, sourceSnapshotHash: source.hash, space: input.space, state: 'dream_active', threadId: thread.id });
    }
    const key = `manual-dream:${input.space}:${thread.id}:${message.id}:${versionHash(message)}`;
    const seed = await dreamRepository.createSeed(db, { branchRouteHash: input.branchRouteHash, decision: 'awaiting_confirmation', idempotencyKey: key, lineageVersion: thread.lineageVersion ?? 0, manual: true, policyVersion: DREAM_POLICY_VERSION, roleCardId: thread.roleCardId, roll: deterministicDreamRoll(key), sceneId: scene.id, sourceMessageIds: source.ids, sourceMessageVersionHashes: source.hashes, sourceSnapshotHash: source.hash, space: input.space, threadId: thread.id, now });
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

export const dreamService = { confirmManual: confirmManualDream, detectManualRequest: detectAndCreateManualDreamRequest, registerRound: registerCompanionDreamRound };
