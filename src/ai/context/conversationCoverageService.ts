import type { SQLiteDatabase } from 'expo-sqlite';

import {
  aiThreadRepository,
  type AiBranchScope,
} from '../../database/repositories/aiThreadRepository';
import type { AiThreadRecord } from '../types';
import {
  buildConversationCoveragePlan,
  hashBranchRoute,
  type CompiledConversationCoverage,
} from './conversationCoverage';

export interface CompileConversationCoverageInput {
  thread: Pick<AiThreadRecord, 'id' | 'space' | 'lineageVersion'>;
  anchorMessageId: string;
  historyRoundLimit: number;
  branchScopes?: AiBranchScope[];
}

export async function compileConversationCoverage(
  db: SQLiteDatabase,
  input: CompileConversationCoverageInput,
): Promise<CompiledConversationCoverage> {
  const branchRouteHash = hashBranchRoute(input.branchScopes);
  const [messages, summarySegments] = await Promise.all([
    aiThreadRepository.listCompletedNonSystemMessagesBefore(
      db,
      input.thread.id,
      input.anchorMessageId,
      input.branchScopes,
    ),
    aiThreadRepository.listSummarySegments(db, input.thread.id, input.branchScopes),
  ]);
  if (input.thread.id === 'pixory-system-assistant') {
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

  const compiled = buildConversationCoveragePlan({
    branchRouteHash,
    historyRoundLimit: input.historyRoundLimit,
    lineageVersion: input.thread.lineageVersion ?? 0,
    messages,
    summarySegments,
    threadId: input.thread.id,
  });
  if (!compiled.plan.coverageComplete || compiled.plan.uncoveredMessageIds.length > 0) {
    throw new Error('Conversation coverage is incomplete.');
  }
  return compiled;
}

export const ConversationCoverageService = {
  compile: compileConversationCoverage,
};
