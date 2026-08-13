import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository, runWithDatabaseSpace, type AiThreadRecord, type PixorySpace } from '../database';
import type { AiBranchScope, AiMessagePageCursor } from '../database/repositories/aiThreadRepository';
import { hashBranchRoute } from './context/conversationCoverage';
import { loadThreadMessagePageAroundAnchorInDatabase, loadThreadMessagePageInDatabase, type AiMessageWithCitations } from './aiChatService';

export interface AiAdoptedThreadRouteSnapshot {
  branchScopes: AiBranchScope[];
  baseMessageCount: number;
  hasEarlierMessages: boolean;
  lineageVersion: number;
  messages: AiMessageWithCitations[];
  olderCursor: AiMessagePageCursor | null;
  routeHash: string;
  selectedVersionByMessageId: Record<string, number>;
  thread: AiThreadRecord;
  threadId: string;
}

export interface LoadAdoptedThreadRouteSnapshotInput {
  anchorMessageId?: string;
  branchScopes?: AiBranchScope[];
  limit: number;
  space: PixorySpace;
  threadId: string;
}

function selectionMapForScopes(branchScopes: AiBranchScope[]): Record<string, number> {
  return branchScopes.reduce<Record<string, number>>((selection, scope) => {
    selection[scope.branchRootMessageId] = scope.branchVersionIndex;
    return selection;
  }, {});
}

async function loadPersistedBranchScopes(
  db: SQLiteDatabase,
  thread: AiThreadRecord,
): Promise<AiBranchScope[]> {
  if (!thread.currentBranchRootMessageId || thread.currentBranchVersionIndex == null) {
    return [];
  }
  const branchScopes = await aiThreadRepository.resolveBranchLineage(
    db,
    thread.currentBranchRootMessageId,
    thread.currentBranchVersionIndex,
  );
  if (branchScopes.length === 0) {
    throw new Error('The adopted AI branch route is no longer valid.');
  }
  return branchScopes;
}

/** Resolves the persisted adopted route without reading message payloads. */
export async function loadPersistedAdoptedThreadBranchScopes(
  space: PixorySpace,
  threadId: string,
): Promise<AiBranchScope[] | null> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread || thread.space !== space) {
      return null;
    }
    return loadPersistedBranchScopes(db, thread);
  });
}

export async function loadAdoptedThreadRouteSnapshot(
  input: LoadAdoptedThreadRouteSnapshotInput,
): Promise<AiAdoptedThreadRouteSnapshot | null> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, input.threadId);
    if (!thread || thread.space !== input.space) {
      return null;
    }
    // Resolve branch scopes first (sequential to avoid concurrent statement
    // conflicts on the same expo-sqlite connection).
    let branchScopes: AiBranchScope[];
    try {
      branchScopes = input.branchScopes ?? await loadPersistedBranchScopes(db, thread);
    } catch {
      // Persisted route no longer valid – fall back to main trunk.
      branchScopes = [];
    }
    const selectedVersionByMessageId = selectionMapForScopes(branchScopes);
    const page = input.anchorMessageId
      ? await loadThreadMessagePageAroundAnchorInDatabase(db, input.threadId, {
        anchorMessageId: input.anchorMessageId,
        branchScopes,
        limit: input.limit,
        selectedVersionByMessageId,
      })
      : await loadThreadMessagePageInDatabase(db, input.threadId, {
        branchScopes,
        limit: input.limit,
        selectedVersionByMessageId,
      });
    return {
      branchScopes,
      baseMessageCount: page.baseMessageCount,
      hasEarlierMessages: page.hasEarlierMessages,
      lineageVersion: thread.lineageVersion ?? 0,
      messages: page.messages,
      olderCursor: page.olderCursor,
      routeHash: hashBranchRoute(branchScopes),
      selectedVersionByMessageId,
      thread,
      threadId: input.threadId,
    };
  });
}

/**
 * Prefetches are intentionally short lived, but a branch can still be adopted
 * between tap and mount. Check its lineage marker before rendering cached data.
 */
export async function isAdoptedThreadRouteSnapshotCurrent(
  snapshot: AiAdoptedThreadRouteSnapshot,
): Promise<boolean> {
  return runWithDatabaseSpace(snapshot.thread.space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, snapshot.threadId);
    return Boolean(
      thread
      && thread.space === snapshot.thread.space
      && (thread.lineageVersion ?? 0) === snapshot.lineageVersion
      && thread.updatedAt === snapshot.thread.updatedAt,
    );
  });
}
