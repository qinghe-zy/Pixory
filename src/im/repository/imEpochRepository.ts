import { initDatabase, type PixorySpace } from '../../database';

export interface ImEpochStateRow {
  thread_id: string;
  space: PixorySpace;
  role_card_id: string;
  epoch_version: number;
  active_anchor_msg_id: string | null;
  active_slot_json: string;
  active_summary_json: string;
  active_core_facts_json: string;
  staged_next_anchor_msg_id: string | null;
  staged_evict_end_msg_id: string | null;
  staged_slot_json: string | null;
  staged_summary_json: string | null;
  staged_core_facts_json: string | null;
  last_telemetry_json?: string | null;
  evicted_up_to_turn: number;
  updated_at: number;
}

const TABLE_CREATE_SQL = `
CREATE TABLE IF NOT EXISTS ai_im_epoch_states (
  thread_id TEXT NOT NULL,
  space TEXT NOT NULL,
  role_card_id TEXT NOT NULL,
  epoch_version INTEGER NOT NULL DEFAULT 1,
  active_anchor_msg_id TEXT DEFAULT NULL,
  active_slot_json TEXT DEFAULT '{}',
  active_summary_json TEXT DEFAULT '{}',
  active_core_facts_json TEXT DEFAULT '[]',
  staged_next_anchor_msg_id TEXT DEFAULT NULL,
  staged_evict_end_msg_id TEXT DEFAULT NULL,
  staged_slot_json TEXT DEFAULT NULL,
  staged_summary_json TEXT DEFAULT NULL,
  staged_core_facts_json TEXT DEFAULT NULL,
  last_telemetry_json TEXT DEFAULT NULL,
  evicted_up_to_turn INTEGER DEFAULT -1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (thread_id, space)
);
`;

const initializedSpaces = new Set<string>();

async function ensureTableInitialized(db: any, space: string) {
  if (!initializedSpaces.has(space)) {
    await db.execAsync(TABLE_CREATE_SQL);
    try {
      await db.execAsync("ALTER TABLE ai_im_epoch_states ADD COLUMN active_core_facts_json TEXT DEFAULT '[]';");
    } catch {}
    try {
      await db.execAsync("ALTER TABLE ai_im_epoch_states ADD COLUMN staged_core_facts_json TEXT DEFAULT NULL;");
    } catch {}
    try {
      await db.execAsync("ALTER TABLE ai_im_epoch_states ADD COLUMN last_telemetry_json TEXT DEFAULT NULL;");
    } catch {}
    initializedSpaces.add(space);
  }
}

export const imEpochRepository = {
  async getOrCreateState(space: PixorySpace, threadId: string, roleCardId: string): Promise<ImEpochStateRow> {
    const db = await initDatabase(space);
    await ensureTableInitialized(db, space);

    const existing = await db.getFirstAsync<ImEpochStateRow>(
      `SELECT * FROM ai_im_epoch_states WHERE thread_id = ? AND space = ?;`,
      [threadId, space]
    );

    if (existing) {
      // 伴侣换乘自愈保护：同一个 Thread 切换了不同伴侣角色卡时自愈重置世代
      if (roleCardId && existing.role_card_id && existing.role_card_id !== roleCardId) {
        await this.resetEpochOnRoleChange(space, threadId, roleCardId);
        return this.getOrCreateState(space, threadId, roleCardId);
      }
      return existing;
    }

    const now = Date.now();
    await db.runAsync(
      `INSERT INTO ai_im_epoch_states (
        thread_id, space, role_card_id, epoch_version,
        active_anchor_msg_id, active_slot_json, active_summary_json, active_core_facts_json,
        staged_next_anchor_msg_id, staged_evict_end_msg_id, staged_slot_json, staged_summary_json, staged_core_facts_json,
        evicted_up_to_turn, updated_at
      ) VALUES (?, ?, ?, 1, NULL, '{}', '{}', '[]', NULL, NULL, NULL, NULL, NULL, -1, ?);`,
      [threadId, space, roleCardId || 'default', now]
    );

    return {
      thread_id: threadId,
      space,
      role_card_id: roleCardId || 'default',
      epoch_version: 1,
      active_anchor_msg_id: null,
      active_slot_json: '{}',
      active_summary_json: '{}',
      active_core_facts_json: '[]',
      staged_next_anchor_msg_id: null,
      staged_evict_end_msg_id: null,
      staged_slot_json: null,
      staged_summary_json: null,
      staged_core_facts_json: null,
      evicted_up_to_turn: -1,
      updated_at: now,
    };
  },

  async updateActiveAnchor(space: PixorySpace, threadId: string, anchorId: string | null): Promise<void> {
    const db = await initDatabase(space);
    await ensureTableInitialized(db, space);
    await db.runAsync(
      `UPDATE ai_im_epoch_states
       SET active_anchor_msg_id = ?,
           staged_next_anchor_msg_id = NULL,
           staged_evict_end_msg_id = NULL,
           staged_slot_json = NULL,
           staged_summary_json = NULL,
           staged_core_facts_json = NULL,
           updated_at = ?
       WHERE thread_id = ? AND space = ?;`,
      [anchorId, Date.now(), threadId, space]
    );
  },

  async updateActiveCoreFacts(space: PixorySpace, threadId: string, coreFactsJson: string): Promise<void> {
    const db = await initDatabase(space);
    await ensureTableInitialized(db, space);
    await db.runAsync(
      `UPDATE ai_im_epoch_states
       SET active_core_facts_json = ?,
           updated_at = ?
       WHERE thread_id = ? AND space = ?;`,
      [coreFactsJson || '[]', Date.now(), threadId, space]
    );
  },

  /**
   * 阶段 1：预提炼结果落盘至 Staged 预备槽
   * 采用 (epoch_version, active_anchor_msg_id) 双重指纹乐观锁，严防异步任务在会话清空或跳锚后写脏数据
   */
  async saveStagedPreCompaction(params: {
    space: PixorySpace;
    threadId: string;
    expectedEpochVersion: number;
    expectedAnchorMsgId: string | null;
    nextAnchorMsgId: string;
    evictEndMsgId: string;
    slotJson: string;
    summaryJson: string;
    coreFactsJson?: string | null;
  }): Promise<boolean> {
    const db = await initDatabase(params.space);
    await ensureTableInitialized(db, params.space);
    const result = await db.runAsync(
      `UPDATE ai_im_epoch_states
       SET staged_next_anchor_msg_id = ?,
           staged_evict_end_msg_id = ?,
           staged_slot_json = ?,
           staged_summary_json = ?,
           staged_core_facts_json = ?,
           updated_at = ?
       WHERE thread_id = ? AND space = ?
         AND epoch_version = ?
         AND (
           active_anchor_msg_id = ?
           OR (active_anchor_msg_id IS NULL AND ? IS NULL)
         );`,
      [
        params.nextAnchorMsgId,
        params.evictEndMsgId,
        params.slotJson,
        params.summaryJson,
        params.coreFactsJson ?? null,
        Date.now(),
        params.threadId,
        params.space,
        params.expectedEpochVersion,
        params.expectedAnchorMsgId,
        params.expectedAnchorMsgId,
      ]
    );
    return (result?.changes ?? 0) > 0;
  },

  /**
   * 阶段 2：原子锁步跃迁 (Atomic Lockstep Flip)
   * 在单一事务中将 staged_* 晋升为 active_*，锚点推至新位置，并记录已滑出回合边界
   */
  async commitStagedEpochLockstep(
    space: PixorySpace,
    threadId: string,
    roleCardId: string,
    evictedTurnIndex: number
  ): Promise<ImEpochStateRow> {
    const db = await initDatabase(space);
    await ensureTableInitialized(db, space);
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE ai_im_epoch_states
         SET active_anchor_msg_id = staged_next_anchor_msg_id,
             active_slot_json = COALESCE(staged_slot_json, active_slot_json),
             active_summary_json = COALESCE(staged_summary_json, active_summary_json),
             active_core_facts_json = COALESCE(staged_core_facts_json, active_core_facts_json),
             staged_next_anchor_msg_id = NULL,
             staged_evict_end_msg_id = NULL,
             staged_slot_json = NULL,
             staged_summary_json = NULL,
             staged_core_facts_json = NULL,
             evicted_up_to_turn = ?,
             epoch_version = epoch_version + 1,
             updated_at = ?
         WHERE thread_id = ? AND space = ? AND staged_next_anchor_msg_id IS NOT NULL;`,
        [evictedTurnIndex, Date.now(), threadId, space]
      );
    });
    return this.getOrCreateState(space, threadId, roleCardId);
  },

  /**
   * 会话清空时重置世代，递增版本号使在途异步提炼任务自然失效
   */
  async resetEpochOnClear(space: PixorySpace, threadId: string): Promise<void> {
    const db = await initDatabase(space);
    await ensureTableInitialized(db, space);
    await db.runAsync(
      `UPDATE ai_im_epoch_states
       SET epoch_version = epoch_version + 1,
           active_anchor_msg_id = NULL,
           active_slot_json = '{}',
           active_summary_json = '{}',
           active_core_facts_json = '[]',
           staged_next_anchor_msg_id = NULL,
           staged_evict_end_msg_id = NULL,
           staged_slot_json = NULL,
           staged_summary_json = NULL,
           staged_core_facts_json = NULL,
           evicted_up_to_turn = -1,
           updated_at = ?
       WHERE thread_id = ? AND space = ?;`,
      [Date.now(), threadId, space]
    );
  },

  async resetEpochOnRoleChange(space: PixorySpace, threadId: string, newRoleCardId: string): Promise<void> {
    const db = await initDatabase(space);
    await ensureTableInitialized(db, space);
    await db.runAsync(
      `UPDATE ai_im_epoch_states
       SET role_card_id = ?,
           epoch_version = epoch_version + 1,
           active_anchor_msg_id = NULL,
           active_slot_json = '{}',
           active_summary_json = '{}',
           active_core_facts_json = '[]',
           staged_next_anchor_msg_id = NULL,
           staged_evict_end_msg_id = NULL,
           staged_slot_json = NULL,
           staged_summary_json = NULL,
           staged_core_facts_json = NULL,
           evicted_up_to_turn = -1,
           updated_at = ?
       WHERE thread_id = ? AND space = ?;`,
      [newRoleCardId, Date.now(), threadId, space]
    );
  },

  /**
   * 锚点校验与自愈 (Anchor Self-Healing)
   * 当历史消息被删除或截断后调用：核验 active_anchor_msg_id 是否仍然存在于 ai_messages 中。
   * 若锚点消息已被删除，重置锚点为 null，杜绝野指针与前缀断裂
   */
  async verifyAndHealAnchor(space: PixorySpace, threadId: string): Promise<string | null> {
    const db = await initDatabase(space);
    await ensureTableInitialized(db, space);
    const state = await db.getFirstAsync<{ active_anchor_msg_id: string | null }>(
      `SELECT active_anchor_msg_id FROM ai_im_epoch_states WHERE thread_id = ? AND space = ?;`,
      [threadId, space]
    );
    if (!state?.active_anchor_msg_id) return null;

    const exists = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM ai_messages WHERE id = ? AND threadId = ? LIMIT 1;`,
      [state.active_anchor_msg_id, threadId]
    );

    if (!exists) {
      // 锚点被删除，自愈重置
      await db.runAsync(
        `UPDATE ai_im_epoch_states
         SET active_anchor_msg_id = NULL,
             staged_next_anchor_msg_id = NULL,
             staged_evict_end_msg_id = NULL,
             staged_slot_json = NULL,
             staged_summary_json = NULL,
             epoch_version = epoch_version + 1,
             updated_at = ?
         WHERE thread_id = ? AND space = ?;`,
        [Date.now(), threadId, space]
      );
      return null;
    }

    return state.active_anchor_msg_id;
  },

  async saveTelemetry(space: PixorySpace, threadId: string, telemetryJson: string): Promise<void> {
    try {
      const db = await initDatabase(space);
      await ensureTableInitialized(db, space);
      await db.runAsync(
        'UPDATE ai_im_epoch_states SET last_telemetry_json = ? WHERE thread_id = ? AND space = ?;',
        [telemetryJson, threadId, space]
      );
    } catch {}
  },

  async loadTelemetry(space: PixorySpace, threadId: string): Promise<string | null> {
    try {
      const db = await initDatabase(space);
      await ensureTableInitialized(db, space);
      const row = await db.getFirstAsync<{ last_telemetry_json?: string | null }>(
        'SELECT last_telemetry_json FROM ai_im_epoch_states WHERE thread_id = ? AND space = ?;',
        [threadId, space]
      );
      return row?.last_telemetry_json ?? null;
    } catch {
      return null;
    }
  },
};
