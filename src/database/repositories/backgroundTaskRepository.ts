import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  BackgroundTaskRecord,
  CreateBackgroundTaskInput,
  UpdateBackgroundTaskInput,
} from '../types';
import { buildUpdateStatement, createTimestamp, normalizeOptionalText, requireNonEmptyText } from '../utils';

function createTaskId(type: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${type}_${timestamp}_${random}`;
}

function mapTaskRow(row: BackgroundTaskRecord): BackgroundTaskRecord {
  return {
    ...row,
    totalBytes: row.totalBytes ?? null,
    currentLabel: row.currentLabel ?? null,
    errorMessage: row.errorMessage ?? null,
    resultJson: row.resultJson ?? null,
    completedAt: row.completedAt ?? null,
  };
}

export const backgroundTaskRepository = {
  async create(db: SQLiteDatabase, input: CreateBackgroundTaskInput): Promise<BackgroundTaskRecord> {
    const now = createTimestamp();
    const id = input.id ?? createTaskId(input.type);
    await db.runAsync(
      `INSERT INTO background_tasks (
        id,
        type,
        space,
        status,
        title,
        totalCount,
        successCount,
        failedCount,
        totalBytes,
        completedBytes,
        currentLabel,
        errorMessage,
        resultJson,
        createdAt,
        updatedAt,
        completedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, NULL, NULL, ?, ?, NULL)`,
      id,
      input.type,
      input.space,
      input.status ?? 'pending',
      requireNonEmptyText(input.title, 'Background task title'),
      input.totalCount ?? 0,
      input.totalBytes ?? null,
      normalizeOptionalText(input.currentLabel) ?? null,
      now,
      now
    );

    const task = await this.findById(db, id);
    if (!task) {
      throw new Error(`Background task ${id} was created but could not be reloaded.`);
    }
    return task;
  },

  async update(db: SQLiteDatabase, id: string, input: UpdateBackgroundTaskInput): Promise<BackgroundTaskRecord | null> {
    const now = createTimestamp();
    const completedAt =
      input.completedAt !== undefined
        ? input.completedAt
        : input.status === 'completed' || input.status === 'failed' || input.status === 'cancelled'
          ? now
          : undefined;
    const updates = buildUpdateStatement({
      status: input.status,
      title: input.title !== undefined ? requireNonEmptyText(input.title, 'Background task title') : undefined,
      totalCount: input.totalCount,
      successCount: input.successCount,
      failedCount: input.failedCount,
      totalBytes: input.totalBytes,
      completedBytes: input.completedBytes,
      currentLabel: normalizeOptionalText(input.currentLabel),
      errorMessage: normalizeOptionalText(input.errorMessage),
      resultJson: normalizeOptionalText(input.resultJson),
      completedAt,
      updatedAt: now,
    });

    if (!updates.setClause) {
      return this.findById(db, id);
    }

    const result = await db.runAsync(
      `UPDATE background_tasks SET ${updates.setClause} WHERE id = ?`,
      ...updates.values,
      id
    );
    if (result.changes === 0) {
      return null;
    }

    return this.findById(db, id);
  },

  async findById(db: SQLiteDatabase, id: string): Promise<BackgroundTaskRecord | null> {
    const row = await db.getFirstAsync<BackgroundTaskRecord>('SELECT * FROM background_tasks WHERE id = ?', id);
    return row ? mapTaskRow(row) : null;
  },

  async findRecent(db: SQLiteDatabase, space: 'normal' | 'personal', limit = 10): Promise<BackgroundTaskRecord[]> {
    const rows = await db.getAllAsync<BackgroundTaskRecord>(
      `SELECT * FROM background_tasks
       WHERE space = ?
       ORDER BY updatedAt DESC, createdAt DESC
       LIMIT ?`,
      space,
      limit
    );
    return rows.map(mapTaskRow);
  },
};

export default backgroundTaskRepository;
