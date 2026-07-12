import type { PixorySpace } from '../database';

export type StreamingPerformanceIdentity = {
  generationId: string;
  messageId: string;
  space: PixorySpace;
  threadId: string;
};

export type StreamingPerformanceSnapshot = {
  detachedTailMergeCount: number;
  detachedTailMergeTotalMs: number;
  firstUiCommitAt: number | null;
  maxUiBacklogAgeMs: number;
  maxUiBacklogChars: number;
  uiCommitCount: number;
  uiVisibleChars: number;
};

const snapshots = new Map<string, StreamingPerformanceSnapshot>();

function keyOf(identity: StreamingPerformanceIdentity): string {
  return `${identity.space}:${identity.threadId}:${identity.messageId}:${identity.generationId}`;
}

function snapshotFor(identity: StreamingPerformanceIdentity): StreamingPerformanceSnapshot {
  const key = keyOf(identity);
  const existing = snapshots.get(key);
  if (existing) return existing;
  const created: StreamingPerformanceSnapshot = {
    detachedTailMergeCount: 0,
    detachedTailMergeTotalMs: 0,
    firstUiCommitAt: null,
    maxUiBacklogAgeMs: 0,
    maxUiBacklogChars: 0,
    uiCommitCount: 0,
    uiVisibleChars: 0,
  };
  snapshots.set(key, created);
  return created;
}

export function recordStreamingUiCommit(input: StreamingPerformanceIdentity & {
  backlogAgeMs: number;
  backlogChars: number;
  visibleChars: number;
}): void {
  const snapshot = snapshotFor(input);
  snapshot.firstUiCommitAt ??= Date.now();
  snapshot.uiCommitCount += 1;
  snapshot.uiVisibleChars = Math.max(snapshot.uiVisibleChars, input.visibleChars);
  snapshot.maxUiBacklogChars = Math.max(snapshot.maxUiBacklogChars, input.backlogChars);
  snapshot.maxUiBacklogAgeMs = Math.max(snapshot.maxUiBacklogAgeMs, input.backlogAgeMs);
}

export function recordDetachedTailMerge(input: StreamingPerformanceIdentity & { elapsedMs: number }): void {
  const snapshot = snapshotFor(input);
  snapshot.detachedTailMergeCount += 1;
  snapshot.detachedTailMergeTotalMs += Math.max(0, input.elapsedMs);
}

export function takeStreamingPerformanceSnapshot(identity: StreamingPerformanceIdentity): StreamingPerformanceSnapshot | null {
  const key = keyOf(identity);
  const snapshot = snapshots.get(key) ?? null;
  snapshots.delete(key);
  return snapshot ? { ...snapshot } : null;
}
