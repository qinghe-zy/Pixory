import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiBranchScope, AiMessageRecord } from '../database/repositories/aiThreadRepository';
import { buildCompressionPrompt, buildSummaryMergePrompt } from './aiMemoryPrompts';
import { callMemoryMaintenanceModel } from './aiMemoryMaintenanceModelService';
import type { AiThreadRecord } from './types';
import { localMemoryMaintenanceResult, type MemoryMaintenanceModelCallResult } from './aiMemoryMaintenanceModelService';

export const UNCOMPRESSED_ROUND_THRESHOLD = 50;
export const COMPRESS_OLDEST_ROUND_COUNT = 20;
export const SUMMARY_SEGMENT_LIMIT = 5;
export const PRESERVE_LATEST_SEGMENT_COUNT = 2;
const UNCOMPRESSED_MESSAGE_SCAN_LIMIT = (UNCOMPRESSED_ROUND_THRESHOLD + COMPRESS_OLDEST_ROUND_COUNT + 5) * 2;

interface CompleteRound {
  user: AiMessageRecord;
  assistant: AiMessageRecord;
}

export interface MemoryMaintenanceStepResult {
  error: string | null;
  modelId: string | null;
  providerId: string | null;
  usedFallback: boolean;
  usedRemote: boolean;
}

function stepResultFromModel(modelResult: MemoryMaintenanceModelCallResult, usedFallback: boolean): MemoryMaintenanceStepResult {
  return {
    error: modelResult.error,
    modelId: modelResult.modelId,
    providerId: modelResult.providerId,
    usedFallback,
    usedRemote: modelResult.usedRemote,
  };
}

export function emptyMaintenanceStepResult(): MemoryMaintenanceStepResult {
  return { error: null, modelId: null, providerId: null, usedFallback: false, usedRemote: false };
}

function createAiMemoryId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function pairCompletedRounds(messages: AiMessageRecord[]): CompleteRound[] {
  const rounds: CompleteRound[] = [];
  let pendingUser: AiMessageRecord | null = null;
  for (const message of messages) {
    if (message.role === 'user') {
      pendingUser = message;
      continue;
    }
    if (message.role === 'assistant' && pendingUser) {
      rounds.push({ assistant: message, user: pendingUser });
      pendingUser = null;
    }
  }
  return rounds;
}

function truncateLocalSummary(text: string, limit = 1800): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function buildLocalCompressionSummary(conversation: string): string {
  return `本地轻量摘要：${truncateLocalSummary(conversation)}`;
}

function buildLocalMergedSummary(summaries: string): string {
  return `本地轻量合并摘要：${truncateLocalSummary(summaries, 2200)}`;
}

function remoteFallbackError(error: string | null): string | null {
  return error ? `remote_failed_used_local_fallback: ${error}` : null;
}

function formatRounds(rounds: CompleteRound[]): string {
  return rounds
    .flatMap((round) => [
      `用户（${round.user.completedAt ?? round.user.createdAt}）：${round.user.content}`,
      `AI（${round.assistant.completedAt ?? round.assistant.createdAt}）：${round.assistant.content}`,
    ])
    .join('\n\n');
}

async function loadThreadOrReturn(db: SQLiteDatabase, threadId: string): Promise<AiThreadRecord | null> {
  return aiThreadRepository.findThreadById(db, threadId);
}

export async function compressOldestThreadRounds(space: PixorySpace, threadId: string, options: { allowRemoteModel?: boolean; branchScopes?: AiBranchScope[] } = {}): Promise<MemoryMaintenanceStepResult> {
  const prepared = await runWithDatabaseSpace(space, async (db) => {
    const thread = await loadThreadOrReturn(db, threadId);
    if (!thread) {
      return null;
    }
    const settings = await aiThreadRepository.getThreadMemorySettings(db, threadId);
    if (!settings.deepMemoryEnabled) {
      return null;
    }
    const job = await aiThreadRepository.getThreadMemoryJob(db, threadId);
    const completedMessageCount = await aiThreadRepository.countCompletedNonSystemMessagesAfter(db, threadId, job.lastCompressedMessageId, options.branchScopes);
    const estimatedRoundCount = Math.floor(completedMessageCount / 2);
    await aiThreadRepository.updateThreadMemoryJob(db, {
      threadId,
      uncompressedRoundCount: estimatedRoundCount,
    });
    if (estimatedRoundCount <= UNCOMPRESSED_ROUND_THRESHOLD) {
      return null;
    }
    const messages = await aiThreadRepository.listCompletedNonSystemMessagesAfter(db, threadId, job.lastCompressedMessageId, UNCOMPRESSED_MESSAGE_SCAN_LIMIT, options.branchScopes);
    const rounds = pairCompletedRounds(messages);
    if (rounds.length <= UNCOMPRESSED_ROUND_THRESHOLD) {
      return null;
    }
    const selectedRounds = rounds.slice(0, COMPRESS_OLDEST_ROUND_COUNT);
    const first = selectedRounds[0];
    const last = selectedRounds[selectedRounds.length - 1];
    return {
      conversation: formatRounds(selectedRounds),
      endAt: last.assistant.completedAt ?? last.assistant.createdAt,
      endMessageId: last.assistant.id,
      roundCount: selectedRounds.length,
      startAt: first.user.completedAt ?? first.user.createdAt,
      startMessageId: first.user.id,
      thread,
      uncompressedRoundCount: estimatedRoundCount,
    };
  });
  if (!prepared) {
    return emptyMaintenanceStepResult();
  }

  const modelResult = options.allowRemoteModel === false
    ? localMemoryMaintenanceResult()
    : await callMemoryMaintenanceModel({
      space,
      systemPrompt: '你是 Pixory 的后台对话记忆压缩器。只输出指定结构。',
      thread: prepared.thread,
      userPrompt: buildCompressionPrompt(prepared.conversation),
    });
  const summaryText = modelResult.text ?? buildLocalCompressionSummary(prepared.conversation);

  await runWithDatabaseSpace(space, async (db) => {
    await aiThreadRepository.createSummarySegment(db, {
      endAt: prepared.endAt,
      endMessageId: prepared.endMessageId,
      id: createAiMemoryId('aisum'),
      kind: 'compressed',
      roundCount: prepared.roundCount,
      sourceSegmentIdsJson: '[]',
      space,
      startAt: prepared.startAt,
      startMessageId: prepared.startMessageId,
      summaryText,
      threadId,
    });
    await aiThreadRepository.updateThreadMemoryJob(db, {
      lastCompressedMessageId: prepared.endMessageId,
      lastMaintenanceError: remoteFallbackError(modelResult.error),
      threadId,
      uncompressedRoundCount: Math.max(0, prepared.uncompressedRoundCount - prepared.roundCount),
    });
  });
  return stepResultFromModel(modelResult, !modelResult.text);
}

export async function maybeMergeSummarySegments(space: PixorySpace, threadId: string, options: { allowRemoteModel?: boolean; branchScopes?: AiBranchScope[] } = {}): Promise<MemoryMaintenanceStepResult> {
  const prepared = await runWithDatabaseSpace(space, async (db) => {
    const thread = await loadThreadOrReturn(db, threadId);
    if (!thread) {
      return null;
    }
    const settings = await aiThreadRepository.getThreadMemorySettings(db, threadId);
    if (!settings.deepMemoryEnabled) {
      return null;
    }
    const segments = await aiThreadRepository.listSummarySegments(db, threadId, options.branchScopes);
    if (segments.length <= SUMMARY_SEGMENT_LIMIT) {
      return null;
    }
    const mergeSegments = segments.slice(0, -PRESERVE_LATEST_SEGMENT_COUNT);
    return {
      endAt: mergeSegments[mergeSegments.length - 1].endAt,
      endMessageId: mergeSegments[mergeSegments.length - 1].endMessageId,
      ids: mergeSegments.map((segment) => segment.id),
      roundCount: mergeSegments.reduce((sum, segment) => sum + segment.roundCount, 0),
      startAt: mergeSegments[0].startAt,
      startMessageId: mergeSegments[0].startMessageId,
      summaries: mergeSegments.map((segment, index) => `摘要${index + 1}（${segment.startAt ?? ''} 至 ${segment.endAt ?? ''}）\n${segment.summaryText}`).join('\n\n'),
      thread,
    };
  });
  if (!prepared) {
    return emptyMaintenanceStepResult();
  }
  const modelResult = options.allowRemoteModel === false
    ? localMemoryMaintenanceResult()
    : await callMemoryMaintenanceModel({
      space,
      systemPrompt: '你是 Pixory 的后台摘要整合器。只输出指定结构。',
      thread: prepared.thread,
      userPrompt: buildSummaryMergePrompt(prepared.summaries),
    });
  const summaryText = modelResult.text ?? buildLocalMergedSummary(prepared.summaries);
  await runWithDatabaseSpace(space, async (db) => {
    await aiThreadRepository.createSummarySegment(db, {
      endAt: prepared.endAt,
      endMessageId: prepared.endMessageId,
      id: createAiMemoryId('aisum'),
      kind: 'merged',
      roundCount: prepared.roundCount,
      sourceSegmentIdsJson: JSON.stringify(prepared.ids),
      space,
      startAt: prepared.startAt,
      startMessageId: prepared.startMessageId,
      summaryText,
      threadId,
    });
    await aiThreadRepository.deleteSummarySegments(db, prepared.ids);
    await aiThreadRepository.updateThreadMemoryJob(db, {
      lastMaintenanceError: remoteFallbackError(modelResult.error),
      threadId,
    });
  });
  return stepResultFromModel(modelResult, !modelResult.text);
}
