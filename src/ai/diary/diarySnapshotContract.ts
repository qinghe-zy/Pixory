import { hashCompanionText } from '../companion/companionRuntimeValidation';

export interface DiaryJobContextSnapshot {
  branchRouteJson: string;
  conversationSnapshotHash: string;
  roleCardId: string;
  roleSnapshotJson: string;
  summarySnapshot: string | null;
  systemPromptSnapshot: string;
}

/** Hashes every immutable input that can change a delayed diary generation. */
export function hashDiaryJobContextSnapshot(input: DiaryJobContextSnapshot): string {
  return hashCompanionText(JSON.stringify({
    branchRouteJson: input.branchRouteJson,
    conversationSnapshotHash: input.conversationSnapshotHash,
    roleCardId: input.roleCardId,
    roleSnapshotJson: input.roleSnapshotJson,
    summarySnapshot: input.summarySnapshot,
    systemPromptSnapshot: input.systemPromptSnapshot,
  }));
}
