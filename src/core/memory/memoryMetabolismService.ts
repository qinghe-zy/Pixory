import type { SQLiteDatabase } from 'expo-sqlite';
import type { CompanionMemoryRecord } from './memoryTypes';

function parseJsonArray(str: string | null | undefined): string[] {
  if (!str) return [];
  try {
    const val = JSON.parse(str);
    return Array.isArray(val) ? val : [];
  } catch {
    return [];
  }
}

/**
 * 伴侣记忆睡眠新陈代谢引擎 (MemoryMetabolismService)
 *
 * 核心职责：
 * 1. L3 瞬态层到期硬擦除（过期承诺/待办 48h 后静默软删）；
 * 2. L2 僵尸记忆修剪（满 14 天、零命中、非置顶且重要度 <= 6 的日常琐事软删）；
 * 3. L1 临时状态槽位降级（超 21 天未更新的 user_mood / current_topic 清空）；
 * 4. FTS5 全文索引同步瘦身；
 * 5. 内存倒排表同实体碎片坍缩（Episode Folding：5 条旧经历折叠为 1 条长期事实）。
 */

export async function foldStaleEpisodesToFact(
  db: SQLiteDatabase,
  roleCardId: string,
  space: string,
  fourteenDaysAgoMs: number,
  nowMs: number,
  lightModelConsolidator: (episodes: CompanionMemoryRecord[]) => Promise<string | null>
): Promise<boolean> {
  const staleRows = await db.getAllAsync<any>(
    `SELECT * FROM ai_companion_memories
     WHERE role_card_id = ? AND space = ?
       AND tier = 'L2_EPISODE'
       AND deleted_at IS NULL
       AND is_pinned = 0
       AND created_at < ?
     ORDER BY created_at ASC;`,
    [roleCardId, space, fourteenDaysAgoMs]
  );

  if (!staleRows || staleRows.length < 5) {
    return false;
  }

  // 在内存中解析每条记录的 entities 数组，构建 Map<entityKey, episodes[]> 倒排表
  const entityMap = new Map<string, CompanionMemoryRecord[]>();

  for (const row of staleRows) {
    const entities = parseJsonArray(row.entities);
    const triggers = parseJsonArray(row.trigger_keywords);
    const record: CompanionMemoryRecord = {
      id: row.id,
      roleCardId: row.role_card_id,
      space: row.space,
      tier: row.tier,
      category: row.category,
      content: row.content,
      triggerKeywords: triggers,
      entities,
      importance: row.importance,
      hitCount: row.hit_count,
      isPinned: Boolean(row.is_pinned),
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      sourceMode: row.source_mode || 'im',
      expiresAt: row.expires_at ?? null,
      supersededBy: row.superseded_by ?? null,
      deletedAt: row.deleted_at ?? null,
      confidence: row.confidence ?? 0.85,
    };

    // 若存在实体则按每个实体分别归集；若无实体则回退取 triggerKeywords[0] 或 category
    const keys = entities.length > 0 ? entities : [triggers[0] || row.category || 'general'];
    for (const key of keys) {
      if (!key) continue;
      const list = entityMap.get(key) || [];
      list.push(record);
      entityMap.set(key, list);
    }
  }

  // 寻找首个达到 >= 5 条旧经历的实体键
  let targetKey: string | null = null;
  let targetEpisodes: CompanionMemoryRecord[] = [];
  for (const [key, list] of entityMap.entries()) {
    if (list.length >= 5) {
      targetKey = key;
      targetEpisodes = list.slice(0, 8); // 取前 5~8 条合并
      break;
    }
  }

  if (!targetKey || targetEpisodes.length < 5) {
    return false;
  }

  // 调用归纳合并函数
  const consolidatedContent = await lightModelConsolidator(targetEpisodes).catch(() => null);
  if (!consolidatedContent || !consolidatedContent.trim()) {
    return false;
  }

  const newFactId = `mem_fact_fold_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const mergedTriggers = Array.from(
    new Set(targetEpisodes.flatMap((e) => e.triggerKeywords).concat(targetKey))
  );
  const targetIds = targetEpisodes.map((e) => e.id);

  await db.withTransactionAsync(async () => {
    // 1. 写入新折叠生成的 L2_FACT
    await db.runAsync(
      `INSERT INTO ai_companion_memories
       (id, role_card_id, space, tier, category, content, trigger_keywords, entities, importance, hit_count, is_pinned, created_at, last_accessed_at, source_mode, confidence)
       VALUES (?, ?, ?, 'L2_FACT', ?, ?, ?, ?, 8, 1, 0, ?, ?, 'consolidation', 0.95);`,
      [
        newFactId,
        roleCardId,
        space,
        targetEpisodes[0].category || 'user_preference',
        consolidatedContent.trim(),
        JSON.stringify(mergedTriggers),
        JSON.stringify([targetKey]),
        nowMs,
        nowMs,
      ]
    );

    // 2. 将原旧 Episode 标记为已被新 Fact 替代 (superseded_by) 并软删除
    for (const oldId of targetIds) {
      await db.runAsync(
        `UPDATE ai_companion_memories
         SET superseded_by = ?, deleted_at = ?
         WHERE id = ?;`,
        [newFactId, nowMs, oldId]
      );
    }

    // 3. 同步更新 FTS5 索引
    await db.runAsync(
      `INSERT INTO ai_companion_memories_fts (memory_id, content, trigger_keywords)
       VALUES (?, ?, ?);`,
      [newFactId, consolidatedContent.trim(), mergedTriggers.join(' ')]
    );
    for (const oldId of targetIds) {
      await db.runAsync(`DELETE FROM ai_companion_memories_fts WHERE memory_id = ?;`, [oldId]);
    }
  });

  return true;
}

export async function runDailyMemoryMetabolism(
  db: SQLiteDatabase,
  roleCardId: string,
  space: string,
  nowMsOrIso: string | number = Date.now(),
  lightModelConsolidator?: (episodes: CompanionMemoryRecord[]) => Promise<string | null>
): Promise<void> {
  const nowMs = typeof nowMsOrIso === 'number' ? nowMsOrIso : new Date(nowMsOrIso).getTime();
  const fourteenDaysAgoMs = nowMs - 14 * 24 * 3600 * 1000;
  const twentyOneDaysAgoMs = nowMs - 21 * 24 * 3600 * 1000;

  // 1. 先执行同实体碎片坍缩 (Episode Folding)：将多条关联旧经历原子凝聚为 L2_FACT
  if (lightModelConsolidator) {
    try {
      await foldStaleEpisodesToFact(
        db,
        roleCardId,
        space,
        fourteenDaysAgoMs,
        nowMs,
        lightModelConsolidator
      );
    } catch {}
  }

  await db.withTransactionAsync(async () => {
    // 2. 清理已过期的短期记忆与一次性待办 (L3 瞬态层硬擦除)
    await db.runAsync(
      `UPDATE ai_companion_memories
       SET deleted_at = ?
       WHERE role_card_id = ? AND space = ?
         AND deleted_at IS NULL
         AND expires_at IS NOT NULL AND expires_at < ?;`,
      [nowMs, roleCardId, space, nowMs]
    );

    // 3. 修剪孤立僵尸记忆：创建满 14 天、从未被召回命中 (hit_count = 0)、非置顶且重要度 <= 6 的零散琐事
    await db.runAsync(
      `UPDATE ai_companion_memories
       SET deleted_at = ?
       WHERE role_card_id = ? AND space = ?
         AND deleted_at IS NULL
         AND is_pinned = 0
         AND hit_count = 0
         AND importance <= 6
         AND created_at < ?;`,
      [nowMs, roleCardId, space, fourteenDaysAgoMs]
    );

    // 4. 降级长期未更新的 L1 临时状态槽位（超 21 天未变动的 user_mood / current_topic）
    try {
      await db.runAsync(
        `DELETE FROM ai_companion_memories
         WHERE role_card_id = ? AND space = ?
           AND tier = 'L1_SLOT'
           AND category IN ('user_mood', 'current_topic')
           AND COALESCE(last_accessed_at, created_at) < ?;`,
        [roleCardId, space, twentyOneDaysAgoMs]
      );
    } catch {}

    // 5. 同步清理 FTS5 全文索引中的已软删记录
    try {
      await db.runAsync(
        `DELETE FROM ai_companion_memories_fts
         WHERE memory_id IN (
           SELECT id FROM ai_companion_memories
           WHERE role_card_id = ? AND space = ? AND deleted_at IS NOT NULL
         );`,
        [roleCardId, space]
      );
    } catch {}
  });
}
