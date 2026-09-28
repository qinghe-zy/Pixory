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
  sourceSystemPromptSnapshot: string | null;
  effectiveSourceSnapshotHash: string;
  jobContextSnapshotHash: string | null;
  status: 'current' | 'superseded';
  createdAt: string;
  supersededAt: string | null;
}

export interface RoleDiaryVersionGroup {
  diary: RoleDiaryRecord;
  versions: RoleDiaryVersionRecord[];
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
  sourceSystemPromptSnapshot: string | null;
  roleSnapshotJson: string;
  jobContextSnapshotHash: string;
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

interface RoleDiaryVersionRow extends Omit<RoleDiaryVersionRecord, 'effectiveSourceSnapshotHash'> {
  sourceSnapshotHash: string;
}

interface RoleDiaryJobRow extends Omit<RoleDiaryJobRecord, 'jobContextSnapshotHash'> {
  sourceSnapshotHash: string;
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

function mapDiaryVersionRow(row: RoleDiaryVersionRow): RoleDiaryVersionRecord {
  const { sourceSnapshotHash, ...version } = row;
  return { ...version, effectiveSourceSnapshotHash: sourceSnapshotHash };
}

function mapDiaryJobRow(row: RoleDiaryJobRow): RoleDiaryJobRecord {
  const { sourceSnapshotHash, ...job } = row;
  return { ...job, jobContextSnapshotHash: sourceSnapshotHash };
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
    const row = await db.getFirstAsync<RoleDiaryVersionRow>(
      `SELECT version.* FROM companion_diary_versions version
       JOIN companion_diaries diary ON diary.currentVersionId = version.id
       WHERE diary.id = ?`,
      diaryIdValue,
    );
    return row ? mapDiaryVersionRow(row) : null;
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

  async listVersionGroupsForRole(
    db: SQLiteDatabase,
    roleCardId: string,
  ): Promise<RoleDiaryVersionGroup[]> {
    const diaries = await diaryRepository.listCurrentDiariesForRole(db, roleCardId);
    const rows = await db.getAllAsync<RoleDiaryVersionRow>(
      `SELECT version.*
       FROM companion_diary_versions version
       JOIN companion_diaries diary ON diary.id = version.diaryId
       WHERE diary.roleCardId = ?
         AND diary.status IN ('ready_pending_presentation', 'ready')
       ORDER BY diary.diaryDate DESC, diary.updatedAt DESC, version.versionNumber ASC`,
      roleCardId,
    );
    const versionsByDiaryId = new Map<string, RoleDiaryVersionRecord[]>();
    for (const row of rows) {
      const version = mapDiaryVersionRow(row);
      const versions = versionsByDiaryId.get(version.diaryId) ?? [];
      versions.push(version);
      versionsByDiaryId.set(version.diaryId, versions);
    }
    return diaries.map((diary) => ({
      diary,
      versions: versionsByDiaryId.get(diary.id) ?? [],
    }));
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

  async findVersionEntryById(
    db: SQLiteDatabase,
    versionId: string,
  ): Promise<{ diary: RoleDiaryRecord; version: RoleDiaryVersionRecord } | null> {
    const version = await db.getFirstAsync<RoleDiaryVersionRow>(
      'SELECT * FROM companion_diary_versions WHERE id = ?',
      versionId,
    );
    if (!version) {
      return null;
    }
    const diary = await diaryRepository.findCurrentDiaryById(db, version.diaryId);
    return diary ? { diary, version: mapDiaryVersionRow(version) } : null;
  },

  async findDiaryVersion(
    db: SQLiteDatabase,
    diaryIdValue: string,
    versionId?: string,
  ): Promise<{ diary: RoleDiaryRecord; version: RoleDiaryVersionRecord } | null> {
    const diary = await diaryRepository.findCurrentDiaryById(db, diaryIdValue);
    if (!diary) {
      return null;
    }
    const row = versionId
      ? await db.getFirstAsync<RoleDiaryVersionRow>(
        'SELECT * FROM companion_diary_versions WHERE id = ? AND diaryId = ?',
        versionId,
        diaryIdValue,
      )
      : await db.getFirstAsync<RoleDiaryVersionRow>(
        'SELECT * FROM companion_diary_versions WHERE id = ?',
        diary.currentVersionId,
      );
    return row ? { diary, version: mapDiaryVersionRow(row) } : null;
  },

  async findSourceJobForVersion(
    db: SQLiteDatabase,
    versionId: string,
  ): Promise<RoleDiaryJobRecord | null> {
    const row = await db.getFirstAsync<RoleDiaryJobRow>(
      `SELECT job.*
       FROM companion_diary_versions version
       JOIN companion_diaries diary ON diary.id = version.diaryId
       JOIN companion_diary_jobs job
         ON job.roleCardId = diary.roleCardId
        AND job.diaryDate = diary.diaryDate
        AND job.sourceSnapshotHash = version.jobContextSnapshotHash
       WHERE version.id = ? AND job.status = 'completed'
       ORDER BY ABS(julianday(job.createdAt) - julianday(version.createdAt)) ASC
       LIMIT 1`,
      versionId,
    );
    return row ? mapDiaryJobRow(row) : null;
  },

  async permanentlyDeleteVersions(
    db: SQLiteDatabase,
    versionIds: string[],
  ): Promise<{ deletedCount: number; removedDiaryIds: string[] }> {
    const uniqueIds = [...new Set(versionIds)];
    if (uniqueIds.length === 0 || uniqueIds.length !== versionIds.length) {
      throw new Error('所选日记版本已发生变化，请刷新后重试。');
    }

    const placeholders = uniqueIds.map(() => '?').join(', ');
    let deletedCount = 0;
    const removedDiaryIds: string[] = [];
    await db.withExclusiveTransactionAsync(async (txn) => {
      const selected = await txn.getAllAsync<{ id: string; diaryId: string }>(
        `SELECT id, diaryId FROM companion_diary_versions WHERE id IN (${placeholders})`,
        ...uniqueIds,
      );
      if (selected.length !== uniqueIds.length) {
        throw new Error('所选日记版本已发生变化，请刷新后重试。');
      }

      const affectedDiaryIds = [...new Set(selected.map((version) => version.diaryId))];
      const deletion = await txn.runAsync(
        `DELETE FROM companion_diary_versions WHERE id IN (${placeholders})`,
        ...uniqueIds,
      );
      deletedCount = Number(deletion.changes ?? 0);
      const now = createTimestamp();

      for (const diaryIdValue of affectedDiaryIds) {
        const latest = await txn.getFirstAsync<Pick<RoleDiaryVersionRow, 'id'>>(
          `SELECT id FROM companion_diary_versions
           WHERE diaryId = ?
           ORDER BY versionNumber DESC
           LIMIT 1`,
          diaryIdValue,
        );
        if (!latest) {
          await txn.runAsync(
            `DELETE FROM companion_artifact_chat_states
             WHERE artifactKind = 'diary' AND artifactGroupId = ?`,
            diaryIdValue,
          );
          await txn.runAsync('DELETE FROM companion_diaries WHERE id = ?', diaryIdValue);
          removedDiaryIds.push(diaryIdValue);
          continue;
        }

        await txn.runAsync(
          `UPDATE companion_diary_versions
           SET status = 'superseded', supersededAt = COALESCE(supersededAt, ?)
           WHERE diaryId = ?`,
          now,
          diaryIdValue,
        );
        await txn.runAsync(
          `UPDATE companion_diary_versions
           SET status = 'current', supersededAt = NULL
           WHERE id = ?`,
          latest.id,
        );
        await txn.runAsync(
          `UPDATE companion_diaries
           SET currentVersionId = ?, updatedAt = ?
           WHERE id = ?`,
          latest.id,
          now,
          diaryIdValue,
        );
      }
    });
    return { deletedCount, removedDiaryIds };
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
    input: Omit<RoleDiaryRecord, 'id' | 'currentVersionId' | 'createdAt' | 'updatedAt' | 'contextOptIn' | 'sourceMessageIds' | 'sourceSnapshotHash'> & {
      body: string;
      effectiveSourceSnapshotHash: string;
      jobContextSnapshotHash: string;
      pageLayoutJson?: string | null;
      generationModelSnapshotJson?: string;
      sourceMessageIdsJson?: string;
      sourceSummarySnapshot?: string | null;
      sourceSystemPromptSnapshot?: string | null;
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
      const latestVersion = await txn.getFirstAsync<{ maxVersion: number }>(
        'SELECT COALESCE(MAX(versionNumber), 0) AS maxVersion FROM companion_diary_versions WHERE diaryId = ?',
        id,
      );
      const versionNumber = Number(latestVersion?.maxVersion ?? 0) + 1;
      const versionId = `${id}:v${versionNumber}`;

      if (!existing) {
        await txn.runAsync(
          `INSERT INTO companion_diaries (
            id, roleCardId, diaryDate, currentVersionId, themeKey, bodyFontKey, status,
            sourceThreadId, sourceBranchRouteJson, sourceSnapshotHash, contextOptIn, createdAt, updatedAt
          ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          id,
          input.roleCardId,
          input.diaryDate,
          input.themeKey,
          input.bodyFontKey,
          input.status,
          input.sourceThreadId,
          input.sourceBranchRouteJson,
          input.effectiveSourceSnapshotHash,
          now,
          now,
        );
      }
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
          sourceMessageIdsJson, sourceSummarySnapshot, sourceSystemPromptSnapshot,
          sourceSnapshotHash, jobContextSnapshotHash, status, createdAt, supersededAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, NULL)`,
        versionId, id, versionNumber, input.body, input.pageLayoutJson ?? null,
        input.generationModelSnapshotJson ?? '{}', input.sourceMessageIdsJson ?? '[]',
        input.sourceSummarySnapshot ?? null, input.sourceSystemPromptSnapshot ?? null,
        input.effectiveSourceSnapshotHash, input.jobContextSnapshotHash, now,
      );
      await txn.runAsync(
        `UPDATE companion_diaries
         SET currentVersionId = ?, themeKey = ?, bodyFontKey = ?, status = ?,
             sourceThreadId = ?, sourceBranchRouteJson = ?, sourceSnapshotHash = ?, updatedAt = ?
         WHERE id = ?`,
        versionId,
        input.themeKey,
        input.bodyFontKey,
        input.status,
        input.sourceThreadId,
        input.sourceBranchRouteJson,
        input.effectiveSourceSnapshotHash,
        now,
        id,
      );
      const savedVersion = await txn.getFirstAsync<RoleDiaryVersionRow>(
        'SELECT * FROM companion_diary_versions WHERE id = ?',
        versionId,
      );
      version = savedVersion ? mapDiaryVersionRow(savedVersion) : null;
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
        sourceMessagesJson, sourceSummarySnapshot, sourceSystemPromptSnapshot, roleSnapshotJson, sourceSnapshotHash,
        status, idempotencyKey, attemptCount, nextRunAt, errorMessage, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)
      ON CONFLICT(idempotencyKey) DO NOTHING`,
      input.id, input.roleCardId, input.diaryDate, input.triggerKind, input.scheduledFor,
      input.sourceThreadId, input.sourceBranchRouteJson, input.sourceMessagesJson,
      input.sourceSummarySnapshot, input.sourceSystemPromptSnapshot, input.roleSnapshotJson, input.jobContextSnapshotHash,
      input.status, input.idempotencyKey, now, now,
    );
    const job = await db.getFirstAsync<RoleDiaryJobRow>(
      'SELECT * FROM companion_diary_jobs WHERE idempotencyKey = ?',
      input.idempotencyKey,
    );
    if (!job) {
      throw new Error('角色日记任务写入失败。');
    }
    return mapDiaryJobRow(job);
  },

  async findJobById(db: SQLiteDatabase, jobId: string): Promise<RoleDiaryJobRecord | null> {
    const row = await db.getFirstAsync<RoleDiaryJobRow>('SELECT * FROM companion_diary_jobs WHERE id = ?', jobId);
    return row ? mapDiaryJobRow(row) : null;
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
