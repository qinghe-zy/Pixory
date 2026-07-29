import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../../database';
import { hashBranchRoute } from '../context/conversationCoverage';
import { appendCompanionEvent } from './companionEventRepository';
import { rebuildCompanionProjection } from './companionProjectionEngine';
import { COMPANION_RUNTIME_RESET_SUBTYPE } from './companionResetPolicy';
import { hashCompanionMessageVersion, hashCompanionText } from './companionRuntimeValidation';

export interface CompanionManagementItem {
  id: string;
  kind: 'anchor' | 'loop' | 'repair';
  title: string;
  detail: string;
  createdAt: string;
}

export async function listCompanionManagementItems(
  space: PixorySpace,
  threadId: string,
): Promise<{ roleCardId: string | null; items: CompanionManagementItem[] }> {
  return runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread) return { roleCardId: null, items: [] };
    const scopes = thread.currentBranchRootMessageId && thread.currentBranchVersionIndex != null
      ? await aiThreadRepository.resolveBranchLineage(db, thread.currentBranchRootMessageId, thread.currentBranchVersionIndex)
      : [];
    const route = hashBranchRoute(scopes);
    const [anchors, loops, repairs] = await Promise.all([
      db.getAllAsync<Record<string, unknown>>(
        `SELECT id, rawText, startAtUtc, createdAt FROM companion_temporal_anchors
         WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ? AND status = 'active'
         ORDER BY createdAt DESC`,
        space, threadId, route, thread.lineageVersion ?? 0,
      ),
      db.getAllAsync<Record<string, unknown>>(
        `SELECT id, topicText, kind, createdAt FROM companion_open_loops
         WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ? AND status = 'open'
         ORDER BY createdAt DESC`,
        space, threadId, route, thread.lineageVersion ?? 0,
      ),
      db.getAllAsync<Record<string, unknown>>(
        `SELECT id, constraintText, subtype, createdAt FROM companion_repairs
         WHERE space = ? AND threadId = ? AND branchRouteHash = ? AND lineageVersion = ?
           AND state IN ('constrained', 'acknowledged', 'observing', 'violated')
         ORDER BY createdAt DESC`,
        space, threadId, route, thread.lineageVersion ?? 0,
      ),
    ]);
    const items = [
      ...repairs.map((row) => ({ id: String(row.id), kind: 'repair' as const, title: '待遵守的边界', detail: String(row.constraintText), createdAt: String(row.createdAt) })),
      ...loops.map((row) => ({ id: String(row.id), kind: 'loop' as const, title: '待跟进的话题', detail: String(row.topicText), createdAt: String(row.createdAt) })),
      ...anchors.map((row) => ({ id: String(row.id), kind: 'anchor' as const, title: '时间锚点', detail: String(row.rawText), createdAt: String(row.createdAt) })),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return { items, roleCardId: thread.roleCardId };
  });
}

export async function dismissCompanionManagementItem(
  space: PixorySpace,
  item: Pick<CompanionManagementItem, 'id' | 'kind'>,
): Promise<void> {
  await runWithDatabaseSpace(space, async (db) => {
    const now = new Date().toISOString();
    if (item.kind === 'anchor') {
      await db.runAsync(`UPDATE companion_temporal_anchors SET status = 'cancelled', updatedAt = ? WHERE id = ?`, now, item.id);
    } else if (item.kind === 'loop') {
      await db.runAsync(`UPDATE companion_open_loops SET status = 'dismissed', updatedAt = ? WHERE id = ?`, now, item.id);
    } else {
      await db.runAsync(`UPDATE companion_repairs SET state = 'dismissed', updatedAt = ? WHERE id = ?`, now, item.id);
    }
  });
}

export async function resetCompanionRoleRuntime(space: PixorySpace, roleCardId: string): Promise<void> {
  await runWithDatabaseSpace(space, async (db) => {
    const now = new Date().toISOString();
    const threads = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM ai_threads WHERE space = ? AND roleCardId = ?',
      space,
      roleCardId,
    );
    await db.withTransactionAsync(async () => {
      for (const { id: threadId } of threads) {
        const thread = await aiThreadRepository.findThreadById(db, threadId);
        if (!thread) continue;
        const currentScopes = thread.currentBranchRootMessageId && thread.currentBranchVersionIndex != null
          ? await aiThreadRepository.resolveBranchLineage(db, thread.currentBranchRootMessageId, thread.currentBranchVersionIndex)
          : [];
        const currentRoute = hashBranchRoute(currentScopes);
        const routeSources = await db.getAllAsync<{
          branchRouteHash: string;
          lineageVersion: number;
          sourceMessageId: string;
          branchRootMessageId: string | null;
          branchVersionIndex: number | null;
        }>(
          `SELECT branchRouteHash, lineageVersion, sourceMessageId, branchRootMessageId, branchVersionIndex
           FROM companion_events WHERE space = ? AND threadId = ? AND status = 'active'
           ORDER BY eventSequence DESC`,
          space,
          threadId,
        );
        const latestByRoute = new Map<string, typeof routeSources[number]>();
        for (const source of routeSources) {
          const key = `${source.branchRouteHash}\u001F${source.lineageVersion}`;
          if (!latestByRoute.has(key)) latestByRoute.set(key, source);
        }
        if (![...latestByRoute.values()].some((source) => source.branchRouteHash === currentRoute && source.lineageVersion === (thread.lineageVersion ?? 0))) {
          const latest = (await aiThreadRepository.listRecentCompletedNonSystemMessages(db, threadId, 1, currentScopes)).at(-1);
          if (latest) {
            latestByRoute.set(`${currentRoute}\u001F${thread.lineageVersion ?? 0}`, {
              branchRootMessageId: latest.branchRootMessageId,
              branchRouteHash: currentRoute,
              branchVersionIndex: latest.branchVersionIndex,
              lineageVersion: thread.lineageVersion ?? 0,
              sourceMessageId: latest.id,
            });
          }
        }
        for (const source of latestByRoute.values()) {
          const message = await aiThreadRepository.findMessageById(db, source.sourceMessageId);
          if (!message || message.status !== 'completed') continue;
          const messageVersionHash = hashCompanionMessageVersion(message);
          await appendCompanionEvent(db, {
            branchRootMessageId: source.branchRootMessageId,
            branchRouteHash: source.branchRouteHash,
            branchVersionIndex: source.branchVersionIndex,
            candidate: {
              category: 'relationship',
              confidence: 1,
              diagnosticReason: null,
              effectiveNow: false,
              evidence: { end: 0, messageId: message.id, messageVersionHash, start: 0, text: '' },
              extractorVersion: 'companion-user-reset-v1',
              intensity: 0,
              needsEnrichment: false,
              payload: { resetAt: now },
              semanticKey: hashCompanionText([roleCardId, threadId, source.branchRouteHash, COMPANION_RUNTIME_RESET_SUBTYPE, now].join('\u001F')),
              sincerity: 1,
              speechMode: 'asserted',
              subtype: COMPANION_RUNTIME_RESET_SUBTYPE,
            },
            createdAt: now,
            lineageVersion: source.lineageVersion,
            roleCardId,
            sourceMessageId: message.id,
            space,
            subjectId: roleCardId,
            subjectType: 'role',
            threadId,
          });
        }
      }
      const threadIds = threads.map((thread) => thread.id);
      if (threadIds.length === 0) return;
      const placeholders = threadIds.map(() => '?').join(',');
      await db.runAsync(`UPDATE companion_affective_observations SET status = 'expired', updatedAt = ? WHERE threadId IN (${placeholders}) AND status = 'active'`, now, ...threadIds);
      await db.runAsync(`UPDATE companion_repairs SET state = 'dismissed', updatedAt = ? WHERE threadId IN (${placeholders}) AND state != 'dismissed'`, now, ...threadIds);
      await db.runAsync(`UPDATE companion_open_loops SET status = 'dismissed', updatedAt = ? WHERE threadId IN (${placeholders}) AND status = 'open'`, now, ...threadIds);
      await db.runAsync(`UPDATE companion_temporal_anchors SET status = 'cancelled', updatedAt = ? WHERE threadId IN (${placeholders}) AND status = 'active'`, now, ...threadIds);
      await db.runAsync(`UPDATE companion_runtime_jobs SET status = 'cancelled', leaseOwner = NULL, leaseUntil = NULL, completedAt = ?, updatedAt = ? WHERE threadId IN (${placeholders}) AND status IN ('pending', 'running', 'retry', 'waiting_model')`, now, now, ...threadIds);
      await db.runAsync(`DELETE FROM companion_projection_snapshots WHERE space = ? AND (roleCardId = ? OR threadId IN (${placeholders}))`, space, roleCardId, ...threadIds);
    });

    for (const { id: threadId } of threads) {
      const thread = await aiThreadRepository.findThreadById(db, threadId);
      if (!thread) continue;
      const scopes = thread.currentBranchRootMessageId && thread.currentBranchVersionIndex != null
        ? await aiThreadRepository.resolveBranchLineage(db, thread.currentBranchRootMessageId, thread.currentBranchVersionIndex)
        : [];
      const latest = (await aiThreadRepository.listRecentCompletedNonSystemMessages(db, threadId, 1, scopes)).at(-1);
      if (!latest) continue;
      const round = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM companion_role_round_receipts WHERE threadId = ?', threadId);
      await rebuildCompanionProjection(db, {
        branchRouteHash: hashBranchRoute(scopes),
        currentMessageId: latest.id,
        currentRound: Number(round?.count ?? 0),
        lineageVersion: thread.lineageVersion ?? 0,
        now,
        space,
        thread,
      });
    }
  });
}

export async function clearCompanionRoleRuntime(space: PixorySpace, roleCardId: string): Promise<void> {
  await runWithDatabaseSpace(space, async (db) => {
    const threads = await db.getAllAsync<{ id: string }>('SELECT id FROM ai_threads WHERE space = ? AND roleCardId = ?', space, roleCardId);
    const ids = threads.map((thread) => thread.id);
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await db.withTransactionAsync(async () => {
      await db.runAsync(`DELETE FROM companion_projection_snapshots WHERE space = ? AND (roleCardId = ? OR threadId IN (${placeholders}))`, space, roleCardId, ...ids);
      await db.runAsync(`DELETE FROM companion_runtime_jobs WHERE threadId IN (${placeholders})`, ...ids);
      await db.runAsync(`DELETE FROM companion_repairs WHERE threadId IN (${placeholders})`, ...ids);
      await db.runAsync(`DELETE FROM companion_affective_observations WHERE threadId IN (${placeholders})`, ...ids);
      await db.runAsync(`DELETE FROM companion_open_loops WHERE threadId IN (${placeholders})`, ...ids);
      await db.runAsync(`DELETE FROM companion_temporal_anchors WHERE threadId IN (${placeholders})`, ...ids);
      await db.runAsync(`DELETE FROM companion_events WHERE threadId IN (${placeholders})`, ...ids);
    });
  });
}

export const companionManagementService = {
  clearRole: clearCompanionRoleRuntime,
  dismiss: dismissCompanionManagementItem,
  list: listCompanionManagementItems,
  resetRole: resetCompanionRoleRuntime,
};
