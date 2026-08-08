import type { SQLiteDatabase } from 'expo-sqlite';

import type { DiaryBodyFontKey, DiaryThemeKey, DiaryTriggerKind } from './diaryTypes';
import { createTimestamp, sqliteToBoolean } from '../../database/utils';

export type RoleDiaryStatus = 'generating' | 'ready_pending_presentation' | 'ready' | 'failed';
export type RoleDiaryJobStatus = 'pending' | 'due' | 'generating' | 'completed' | 'failed' | 'cancelled';

export interface RoleDiaryRecord {
  id: string;
  roleCardId: string;
  diaryDate: string;
  currentVersionId: string | null;
  themeKey: DiaryThemeKey;
  bodyFontKey: DiaryBodyFontKey;
  status: RoleDiaryStatus;
  sourceThreadId: string | null;
  sourceBranchRouteJson: string;
  sourceSnapshotHash: string;
  sourceMessageIds: string[];
  contextOptIn: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDiaryVersionRecord {
  id: string;
  diaryId: string;
  versionNumber: number;
  body: string;
  pageLayoutJson: string | null;
  generationModelSnapshotJson: string;
  sourceMessageIdsJson: string;
  sourceSummarySnapshot: string | null;
  sourceSnapshotHash: string;
  status: 'current' | 'superseded';
  createdAt: string;
  supersededAt: string | null;
}

export interface RoleDiaryJobRecord {
  id: string;
  roleCardId: string;
  diaryDate: string;
  triggerKind: DiaryTriggerKind | 'manual' | 'wake';
  scheduledFor: string;
  sourceThreadId: string | null;
  sourceBranchRouteJson: string;
  sourceMessagesJson: string;
  sourceSummarySnapshot: string | null;
  roleSnapshotJson: string;
  sourceSnapshotHash: string;
  status: RoleDiaryJobStatus;
  idempotencyKey: string;
  attemptCount: number;
  nextRunAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RoleDiaryRow extends Omit<RoleDiaryRecord, 'contextOptIn' | 'sourceMessageIds'> {
  contextOptIn: number | null;
  currentSourceMessageIdsJson?: string | null;
}

function parseSourceMessageIds(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function mapDiaryRow(row: RoleDiaryRow): RoleDiaryRecord {
  const { currentSourceMessageIdsJson, ...diary } = row;
  return {
    ...diary,
    sourceMessageIds: parseSourceMessageIds(currentSourceMessageIdsJson),
    contextOptIn: row.contextOptIn == null ? null : sqliteToBoolean(row.contextOptIn),
  };
}

function diaryId(roleCardId: string, diaryDate: string): string {
  return `role-diary:${roleCardId}:${diaryDate}`;
}

export const diaryRepository = {
  async findCurrentDiary(db: SQLiteDatabase, roleCardId: string, diaryDate: string): Promise<RoleDiaryRecord | null> {
    const row = await db.getFirstAsync<RoleDiaryRow>(
      `SELECT diary.*, version.sourceMessageIdsJson AS currentSourceMessageIdsJson
       FROM companion_diaries diary
       LEFT JOIN companion_diary_versions version ON version.id = diary.currentVersionId
       WHERE diary.roleCardId = ? AND diary.diaryDate = ?`,
      roleCardId,
      diaryDate,
    );
    return row ? mapDiaryRow(row) : null;
  },

  async hasCompletedAutomaticDiary(db: SQLiteDatabase, roleCardId: string, diaryDate: string): Promise<boolean> {
    const row = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM companion_diary_jobs
       WHERE roleCardId = ? AND diaryDate = ? AND triggerKind IN (
         'auto_early_evening', 'auto_late_evening', 'auto_idle_monologue'
       ) AND status = 'completed'
       LIMIT 1`,
      roleCardId,
      diaryDate,
    );
    return Boolean(row);
  },

  async findCurrentDiaryForRole(db: SQLiteDatabase, roleCardId: string): Promise<RoleDiaryRecord | null> {
    const row = await db.getFirstAsync<RoleDiaryRow>(
      `SELECT diary.*, version.sourceMessageIdsJson AS currentSourceMessageIdsJson
       FROM companion_diaries diary
       LEFT JOIN companion_diary_versions version ON version.id = diary.currentVersionId
       WHERE diary.roleCardId = ? AND diary.status IN ('ready_pending_presentation', 'ready')
       ORDER BY diary.diaryDate DESC, diary.updatedAt DESC LIMIT 1`,
      roleCardId,
    );
    return row ? mapDiaryRow(row) : null;
  },

  async findCurrentVersion(db: SQLiteDatabase, diaryIdValue: string): Promise<RoleDiaryVersionRecord | null> {
    return db.getFirstAsync<RoleDiaryVersionRecord>(
      `SELECT version.* FROM companion_diary_versions version
       JOIN companion_diaries diary ON diary.currentVersionId = version.id
       WHERE diary.id = ?`,
      diaryIdValue,
    );
  },

  async listCurrentDiariesForRole(db: SQLiteDatabase, roleCardId: string): Promise<RoleDiaryRecord[]> {
    const rows = await db.getAllAsync<RoleDiaryRow>(
      `SELECT diary.*, version.sourceMessageIdsJson AS currentSourceMessageIdsJson
       FROM companion_diaries diary
       LEFT JOIN companion_diary_versions version ON version.id = diary.currentVersionId
       WHERE diary.roleCardId = ? AND diary.status IN ('ready_pending_presentation', 'ready')
       ORDER BY diary.diaryDate DESC, diary.updatedAt DESC`,
      roleCardId,
    );
    return rows.map(mapDiaryRow);
  },

  async listContextOptInDiaryVersionsForRole(
    db: SQLiteDatabase,
    roleCardId: string,
    limit = 3,
  ): Promise<Array<{ diary: RoleDiaryRecord; version: RoleDiaryVersionRecord }>> {
    const rows = await db.getAllAsync<RoleDiaryRow>(
      `SELECT diary.*, version.sourceMessageIdsJson AS currentSourceMessageIdsJson
       FROM companion_diaries diary
       LEFT JOIN companion_diary_versions version ON version.id = diary.currentVersionId
       WHERE diary.roleCardId = ? AND diary.contextOptIn = 1
         AND diary.status IN ('ready_pending_presentation', 'ready')
       ORDER BY diary.diaryDate DESC, diary.updatedAt DESC
       LIMIT ?`,
      roleCardId,
      Math.max(1, limit),
    );
    const diaries = rows.map(mapDiaryRow);
    const entries = await Promise.all(diaries.map(async (diary) => {
      const version = await diaryRepository.findCurrentVersion(db, diary.id);
      return version ? { diary, version } : null;
    }));
    return entries.filter(
      (entry): entry is { diary: RoleDiaryRecord; version: RoleDiaryVersionRecord } => entry != null,
    );
  },

  async findDiaryVersion(db: SQLiteDatabase, diaryIdValue: string): Promise<{ diary: RoleDiaryRecord; version: RoleDiaryVersionRecord } | null> {
    const diary = await diaryRepository.findCurrentDiaryById(db, diaryIdValue);
    if (!diary) {
      return null;
    }
    const version = await diaryRepository.findCurrentVersion(db, diaryIdValue);
    return version ? { diary, version } : null;
  },

  async findCurrentDiaryById(db: SQLiteDatabase, diaryIdValue: string): Promise<RoleDiaryRecord | null> {
    const row = await db.getFirstAsync<RoleDiaryRow>(
      `SELECT diary.*, version.sourceMessageIdsJson AS currentSourceMessageIdsJson
       FROM companion_diaries diary
       LEFT JOIN companion_diary_versions version ON version.id = diary.currentVersionId
       WHERE diary.id = ?`,
      diaryIdValue,
    );
    return row ? mapDiaryRow(row) : null;
  },

  async saveDiaryVersion(
    db: SQLiteDatabase,
    input: Omit<RoleDiaryRecord, 'id' | 'currentVersionId' | 'createdAt' | 'updatedAt' | 'contextOptIn' | 'sourceMessageIds'> & {
      body: string;
      pageLayoutJson?: string | null;
      generationModelSnapshotJson?: string;
      sourceMessageIdsJson?: string;
      sourceSummarySnapshot?: string | null;
    },
  ): Promise<RoleDiaryVersionRecord> {
    const id = diaryId(input.roleCardId, input.diaryDate);
    const now = createTimestamp();
    let version: RoleDiaryVersionRecord | null = null;

    // Use withExclusiveTransactionAsync to get a dedicated connection, preventing
    // "cannot rollback · no transaction is active" errors caused by concurrent
    // withTransactionAsync calls (e.g. memory writes) racing on the shared connection.
    await db.withExclusiveTransactionAsync(async (txn) => {
      const existing = await txn.getFirstAsync<Pick<RoleDiaryRecord, 'currentVersionId'>>(
        'SELECT * FROM companion_diaries WHERE id = ?',
        id,
      );
      const count = await txn.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM companion_diary_versions WHERE diaryId = ?',
        id,
      );
      const versionNumber = (count?.count ?? 0) + 1;
      const versionId = `${id}:v${versionNumber}`;

      if (existing?.currentVersionId) {
        await txn.runAsync(
          `UPDATE companion_diary_versions SET status = 'superseded', supersededAt = ? WHERE id = ?`,
          now,
          existing.currentVersionId,
        );
      }
      await txn.runAsync(
        `INSERT INTO companion_diary_versions (
          id, diaryId, versionNumber, body, pageLayoutJson, generationModelSnapshotJson,
          sourceMessageIdsJson, sourceSummarySnapshot, sourceSnapshotHash, status, createdAt, supersededAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, NULL)`,
        versionId, id, versionNumber, input.body, input.pageLayoutJson ?? null,
        input.generationModelSnapshotJson ?? '{}', input.sourceMessageIdsJson ?? '[]',
        input.sourceSummarySnapshot ?? null, input.sourceSnapshotHash, now,
      );
      await txn.runAsync(
        `INSERT INTO companion_diaries (
          id, roleCardId, diaryDate, currentVersionId, themeKey, bodyFontKey, status,
          sourceThreadId, sourceBranchRouteJson, sourceSnapshotHash, contextOptIn, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(roleCardId, diaryDate) DO UPDATE SET
          currentVersionId = excluded.currentVersionId, themeKey = excluded.themeKey,
          bodyFontKey = excluded.bodyFontKey, status = excluded.status,
          sourceThreadId = excluded.sourceThreadId, sourceBranchRouteJson = excluded.sourceBranchRouteJson,
          sourceSnapshotHash = excluded.sourceSnapshotHash, updatedAt = excluded.updatedAt`,
        id, input.roleCardId, input.diaryDate, versionId, input.themeKey, input.bodyFontKey,
        input.status, input.sourceThreadId, input.sourceBranchRouteJson, input.sourceSnapshotHash, now, now,
      );
      version = await txn.getFirstAsync<RoleDiaryVersionRecord>(
        'SELECT * FROM companion_diary_versions WHERE id = ?',
        versionId,
      );
    });

    if (!version) {
      throw new Error('角色日记版本写入失败。');
    }
    return version;
  },

  async setContextOptIn(db: SQLiteDatabase, diaryIdValue: string, accepted: boolean): Promise<void> {
    await db.runAsync(
      'UPDATE companion_diaries SET contextOptIn = ?, updatedAt = ? WHERE id = ?',
      accepted ? 1 : 0,
      createTimestamp(),
      diaryIdValue,
    );
  },

  async createOrReuseJob(db: SQLiteDatabase, input: Omit<RoleDiaryJobRecord, 'createdAt' | 'updatedAt' | 'attemptCount' | 'errorMessage' | 'nextRunAt'>): Promise<RoleDiaryJobRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO companion_diary_jobs (
        id, roleCardId, diaryDate, triggerKind, scheduledFor, sourceThreadId, sourceBranchRouteJson,
        sourceMessagesJson, sourceSummarySnapshot, roleSnapshotJson, sourceSnapshotHash,
        status, idempotencyKey, attemptCount, nextRunAt, errorMessage, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)
      ON CONFLICT(idempotencyKey) DO NOTHING`,
      input.id, input.roleCardId, input.diaryDate, input.triggerKind, input.scheduledFor,
      input.sourceThreadId, input.sourceBranchRouteJson, input.sourceMessagesJson,
      input.sourceSummarySnapshot, input.roleSnapshotJson, input.sourceSnapshotHash,
      input.status, input.idempotencyKey, now, now,
    );
    const job = await db.getFirstAsync<RoleDiaryJobRecord>(
      'SELECT * FROM companion_diary_jobs WHERE idempotencyKey = ?',
      input.idempotencyKey,
    );
    if (!job) {
      throw new Error('角色日记任务写入失败。');
    }
    return job;
  },

  async findJobById(db: SQLiteDatabase, jobId: string): Promise<RoleDiaryJobRecord | null> {
    return db.getFirstAsync<RoleDiaryJobRecord>('SELECT * FROM companion_diary_jobs WHERE id = ?', jobId);
  },

  async recoverStaleGeneratingJobs(db: SQLiteDatabase, staleBefore: string): Promise<void> {
    const now = createTimestamp();
    await db.runAsync(
      `UPDATE companion_diary_jobs
       SET status = CASE WHEN attemptCount >= 3 THEN 'failed' ELSE 'due' END,
           errorMessage = CASE WHEN attemptCount >= 3 THEN '角色日记生成多次中断，已停止重试。' ELSE NULL END,
           nextRunAt = NULL,
           updatedAt = ?
       WHERE status = 'generating' AND updatedAt <= ?`,
      now,
      staleBefore,
    );
  },

  /** Atomically grants one runner ownership of a due diary job. */
  async claimJobForRun(db: SQLiteDatabase, jobId: string): Promise<RoleDiaryJobRecord | null> {
    const result = await db.runAsync(
      `UPDATE companion_diary_jobs
       SET status = 'generating', attemptCount = attemptCount + 1,
           errorMessage = NULL, updatedAt = ?
       WHERE id = ? AND status IN ('pending', 'due', 'failed') AND attemptCount < 3`,
      createTimestamp(),
      jobId,
    );
    return result.changes > 0 ? diaryRepository.findJobById(db, jobId) : null;
  },

  async cancelPendingJobs(db: SQLiteDatabase): Promise<string[]> {
    const jobs = await db.getAllAsync<Pick<RoleDiaryJobRecord, 'id'>>(
      `SELECT id FROM companion_diary_jobs
       WHERE status IN ('pending', 'due', 'failed')`,
    );
    if (jobs.length === 0) {
      return [];
    }
    await db.runAsync(
      `UPDATE companion_diary_jobs
       SET status = 'cancelled', nextRunAt = NULL, updatedAt = ?
       WHERE status IN ('pending', 'due', 'failed')`,
      createTimestamp(),
    );
    return jobs.map((job) => job.id);
  },

  async cancelPendingWakeupsForRole(
    db: SQLiteDatabase,
    roleCardId: string,
    keepIdempotencyKey: string,
  ): Promise<string[]> {
    const jobs = await db.getAllAsync<Pick<RoleDiaryJobRecord, 'id'>>(
      `SELECT id FROM companion_diary_jobs
       WHERE roleCardId = ? AND triggerKind = 'wake'
         AND idempotencyKey <> ? AND status IN ('pending', 'due', 'failed')`,
      roleCardId,
      keepIdempotencyKey,
    );
    if (jobs.length === 0) {
      return [];
    }
    await db.runAsync(
      `UPDATE companion_diary_jobs
       SET status = 'cancelled', nextRunAt = NULL, updatedAt = ?
       WHERE roleCardId = ? AND triggerKind = 'wake'
         AND idempotencyKey <> ? AND status IN ('pending', 'due', 'failed')`,
      createTimestamp(),
      roleCardId,
      keepIdempotencyKey,
    );
    return jobs.map((job) => job.id);
  },

  async updateJobStatus(
    db: SQLiteDatabase,
    jobId: string,
    input: { status: RoleDiaryJobStatus; errorMessage?: string | null; nextRunAt?: string | null; incrementAttempt?: boolean },
  ): Promise<void> {
    await db.runAsync(
      `UPDATE companion_diary_jobs
       SET status = ?, errorMessage = ?, nextRunAt = ?,
           attemptCount = attemptCount + ?, updatedAt = ?
       WHERE id = ?`,
      input.status,
      input.errorMessage ?? null,
      input.nextRunAt ?? null,
      input.incrementAttempt ? 1 : 0,
      createTimestamp(),
      jobId,
    );
  },
};
