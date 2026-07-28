import { runWithDatabaseSpace } from '../../database';
import { createTimestamp } from '../../database/utils';
import type { MemorySpace } from './memoryTypes';

interface MemoryIndexOutboxRow {
  id: string;
  aggregateId: string | null;
  taskType: 'memory_embedding_upsert' | 'memory_delete_indexes';
}

const INDEX_TASK_TYPES = ['memory_embedding_upsert', 'memory_delete_indexes'] as const;

export async function drainMemoryIndexOutbox(input: {
  space: MemorySpace;
  limit?: number;
}): Promise<{ completed: number; retried: number }> {
  const limit = Math.max(1, Math.min(100, input.limit ?? 32));
  const rows = await runWithDatabaseSpace(input.space, async (db) => {
    let claimed: MemoryIndexOutboxRow[] = [];
    await db.withTransactionAsync(async () => {
      claimed = await db.getAllAsync<MemoryIndexOutboxRow>(
        `SELECT memory_outbox.id, memory_outbox.taskType, memory_events.aggregateId
         FROM memory_outbox
         LEFT JOIN memory_events ON memory_events.id = memory_outbox.eventId
         WHERE memory_outbox.space = ?
           AND memory_outbox.taskType IN (?, ?)
           AND (
             memory_outbox.status IN ('pending', 'retry')
             OR (memory_outbox.status = 'running' AND memory_outbox.leaseUntil <= ?)
           )
           AND memory_outbox.nextRunAt <= ?
         ORDER BY memory_outbox.createdAt ASC
         LIMIT ?`,
        input.space,
        INDEX_TASK_TYPES[0],
        INDEX_TASK_TYPES[1],
        createTimestamp(),
        createTimestamp(),
        limit
      );
      if (claimed.length > 0) {
        await db.runAsync(
          `UPDATE memory_outbox
           SET status = 'running', leaseUntil = ?, updatedAt = ?
           WHERE id IN (${claimed.map(() => '?').join(', ')})
             AND (
               status IN ('pending', 'retry')
               OR (status = 'running' AND leaseUntil <= ?)
             )`,
          new Date(Date.now() + 60_000).toISOString(),
          createTimestamp(),
          ...claimed.map((row) => row.id),
          createTimestamp()
        );
      }
    });
    return claimed;
  });

  let completed = 0;
  let retried = 0;
  for (const row of rows) {
    try {
      await runWithDatabaseSpace(input.space, async (db) => {
        if (row.aggregateId) {
          // Memory embeddings are disabled for v1 retrieval. Removing an old
          // vector keeps the rebuildable index honest until generation is enabled.
          await db.runAsync(
            'DELETE FROM memory_embeddings WHERE claimId = ? AND space = ?',
            row.aggregateId,
            input.space
          );
        }
        await db.runAsync(
          `UPDATE memory_outbox
           SET status = 'done', leaseUntil = NULL, lastError = NULL, updatedAt = ?
           WHERE id = ? AND status = 'running'`,
          createTimestamp(),
          row.id
        );
      });
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'memory_index_outbox_failed';
      await runWithDatabaseSpace(input.space, (db) => db.runAsync(
        `UPDATE memory_outbox
         SET status = 'retry', retryCount = retryCount + 1, leaseUntil = NULL,
             nextRunAt = ?, lastError = ?, updatedAt = ?
         WHERE id = ?`,
        new Date(Date.now() + 5 * 60_000).toISOString(),
        message,
        createTimestamp(),
        row.id
      ));
      retried += 1;
    }
  }
  return { completed, retried };
}

export const MemoryIndexOutboxService = {
  drain: drainMemoryIndexOutbox,
};
