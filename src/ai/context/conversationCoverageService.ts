import type { SQLiteDatabase } from 'expo-sqlite';

import {
  aiThreadRepository,
  type AiBranchScope,
} from '../../database/repositories/aiThreadRepository';
import type { AiThreadRecord } from '../types';
import { readContextWindow, saveContextWindow } from './contextWindowRepository';
import { getConservativeContextBudget } from '../aiContextBudget';
import {
  buildConversationCoveragePlan,
  hashBranchRoute,
  type CompiledConversationCoverage,
} from './conversationCoverage';

export interface CompileConversationCoverageInput {
  thread: Pick<AiThreadRecord, 'id' | 'space' | 'lineageVersion'> & Partial<Pick<AiThreadRecord, 'modelSnapshotJson'>>;
  anchorMessageId: string;
  historyRoundLimit: number;
  branchScopes?: AiBranchScope[];
  contextPlanning?: boolean;
}

export async function compileConversationCoverage(
  db: SQLiteDatabase,
  input: CompileConversationCoverageInput,
): Promise<CompiledConversationCoverage> {
  let result: CompiledConversationCoverage | undefined;
  await db.withExclusiveTransactionAsync(async transaction => { result = await compileInTransaction(transaction, input); });
  if (!result) throw new Error('Conversation planning transaction did not complete.');
  return result;
}

async function compileInTransaction(db: SQLiteDatabase, input: CompileConversationCoverageInput): Promise<CompiledConversationCoverage> {
  const branchRouteHash = hashBranchRoute(input.branchScopes);
  const identity = { space: input.thread.space, threadId: input.thread.id, branchRouteHash, lineageVersion: input.thread.lineageVersion ?? 0 };
  // Expo closes the exclusive connection when this task rejects. Await each
  // read so a failed sibling cannot leave a native statement using that connection.
  const messages = await aiThreadRepository.listCompletedNonSystemMessagesBefore(
    db,
    input.thread.id,
    input.anchorMessageId,
    input.branchScopes,
  );
  const summarySegments = await aiThreadRepository.listSummarySegments(db, input.thread.id, input.branchScopes);
  const previousWindow = await readContextWindow(db, identity);
  if (input.historyRoundLimit === 0) {
    messages.length = 0;
    summarySegments.length = 0;
  } else if (input.thread.id === 'pixory-system-assistant') {
    let startIndex = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(messages[i].promptSnapshotJson || '{}');
        if (parsed?.resetContext === true) {
          startIndex = i;
          break;
        }
      } catch (e) {}
    }
    if (startIndex > 0) {
      messages.splice(0, startIndex);
    }
  }

  // The rollback path rehydrates originals; the final budget planner still
  // records any necessary skeletons/gaps instead of reviving the old truncator.
  if (input.contextPlanning === false) summarySegments.length = 0;

  let modelContextTokens: number | null = null;
  try { modelContextTokens = JSON.parse(input.thread.modelSnapshotJson ?? '{}').contextWindowTokens ?? null; } catch { /* Unknown capacity uses the common conservative budget. */ }
  const compiled = buildConversationCoveragePlan({
    branchRouteHash,
    historyRoundLimit: input.historyRoundLimit,
    lineageVersion: input.thread.lineageVersion ?? 0,
    messages,
    summarySegments,
    threadId: input.thread.id,
    previousWindow: input.contextPlanning === false ? null : previousWindow,
    summaryTokenBudget: Math.floor(getConservativeContextBudget(modelContextTokens) * 0.2),
  });
  if (input.historyRoundLimit !== 0 && input.contextPlanning !== false) await saveContextWindow(db, identity, {
    windowTarget: compiled.plan.windowTarget,
    rawStartMessageId: compiled.plan.rawStartMessageId,
    activeSummaryIds: compiled.activatedSummaryIds ?? compiled.plan.summarySegmentIds,
  });
  return compiled;
}

export const ConversationCoverageService = {
  compile: compileConversationCoverage,
};
