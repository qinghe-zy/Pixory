import type { SQLiteDatabase } from 'expo-sqlite';
import {
  buildEntityCooccurrenceGraph,
  computeGraphStats,
  extractLightEntitiesFromText,
  normalizeGraphEntity,
} from './memoryEntityGraphService';
import {
  invalidateRoleMemoryPrefetch,
  type PrefetchSpace,
} from './memoryPrefetchService';
import { compute2GramJaccardSimilarity } from './memoryScorer';
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

function rowToCompanionMemory(row: any): CompanionMemoryRecord {
  return {
    id: row.id,
    roleCardId: row.role_card_id,
    space: row.space === 'personal' ? 'personal' : 'normal',
    tier: row.tier,
    category: row.category,
    content: row.content,
    triggerKeywords: parseJsonArray(row.trigger_keywords),
    entities: parseJsonArray(row.entities),
    importance: Number.isFinite(row.importance) ? row.importance : 5,
    hitCount: Number.isFinite(row.hit_count) ? row.hit_count : 0,
    isPinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    sourceMode: row.source_mode || 'im',
    expiresAt: row.expires_at ?? null,
    supersededBy: row.superseded_by ?? null,
    deletedAt: row.deleted_at ?? null,
    confidence: row.confidence ?? 0.85,
  };
}

function toPrefetchSpace(space: string): PrefetchSpace {
  return space === 'personal' ? 'personal' : 'normal';
}

export interface MemoryGraphHealthReport {
  roleCardId: string;
  space: PrefetchSpace;
  totalActiveL2: number;
  orphanEntitiesBackfilled: number;
  ftsBackfilled: number;
  duplicatesMerged: number;
  clustersCompiled: number;
  entityNodeCount: number;
  entityEdgeCount: number;
  totalHits: number;
  activeArcCount: number;
  topEntities: Array<{ entity: string; degree: number; memoryCount: number }>;
  inspectedAt: number;
}

/**
 * 纯函数决定论簇归纳摘要（零 LLM 延迟兜底）：去重合并同实体下多条零散经历为高密度事实
 */
export function buildDeterministicClusterSummary(
  entityKey: string,
  episodes: CompanionMemoryRecord[]
): string {
  const uniqueClauses: string[] = [];
  for (const ep of episodes) {
    const cleaned = (ep.content || '')
      .replace(/^\[?\d{4}-\d{2}-\d{2}\]?\s*(?:手账纪事[:：]\s*)?/, '')
      .trim();
    if (!cleaned) continue;
    const isRedundant = uniqueClauses.some(
      (existing) => compute2GramJaccardSimilarity(existing, cleaned) >= 0.72
    );
    if (!isRedundant) {
      uniqueClauses.push(cleaned);
    }
    if (uniqueClauses.length >= 4) break;
  }
  if (uniqueClauses.length === 0) return '';
  const body = uniqueClauses.join('；');
  const label = entityKey.trim();
  const synthesized = label ? `关于「${label}」的累计脉络：${body}` : body;
  return synthesized.length > 220 ? `${synthesized.slice(0, 217)}...` : synthesized;
}

/**
 * 生产环境默认合并器：当未传入外部轻量大模型归纳函数时，自动启用确定性去重折叠器
 */
export async function defaultHybridEpisodeConsolidator(
  episodes: CompanionMemoryRecord[],
  entityHint: string = ''
): Promise<string | null> {
  if (!episodes || episodes.length === 0) return null;
  const fallbackEntity =
    entityHint ||
    episodes[0].entities[0] ||
    episodes[0].triggerKeywords[0] ||
    episodes[0].category ||
    '';
  const summary = buildDeterministicClusterSummary(fallbackEntity, episodes);
  return summary || null;
}

async function applyAtomicEpisodeClusterFold(
  db: SQLiteDatabase,
  roleCardId: string,
  space: string,
  targetKey: string,
  targetEpisodes: CompanionMemoryRecord[],
  consolidatedContent: string,
  nowMs: number,
  sourceMode: string
): Promise<string> {
  const newFactId = `mem_fact_fold_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
  const mergedTriggers = Array.from(
    new Set(targetEpisodes.flatMap((e) => e.triggerKeywords).concat(targetKey))
  ).slice(0, 16);
  const mergedEntities = Array.from(
    new Set(
      [targetKey]
        .concat(targetEpisodes.flatMap((e) => e.entities))
        .map((e) => e.replace(/^entity:/, '').trim())
        .filter(Boolean)
    )
  ).slice(0, 8);
  const targetIds = targetEpisodes.map((e) => e.id);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO ai_companion_memories
       (id, role_card_id, space, tier, category, content, trigger_keywords, entities, importance, hit_count, is_pinned, created_at, last_accessed_at, source_mode, confidence)
       VALUES (?, ?, ?, 'L2_FACT', ?, ?, ?, ?, 8, 1, 0, ?, ?, ?, 0.95);`,
      [
        newFactId,
        roleCardId,
        space,
        targetEpisodes[0].category || 'user_preference',
        consolidatedContent.trim(),
        JSON.stringify(mergedTriggers),
        JSON.stringify(mergedEntities.length > 0 ? mergedEntities : [targetKey]),
        nowMs,
        nowMs,
        sourceMode,
      ]
    );

    for (const oldId of targetIds) {
      await db.runAsync(
        `UPDATE ai_companion_memories
         SET superseded_by = ?, deleted_at = ?
         WHERE id = ?;`,
        [newFactId, nowMs, oldId]
      );
    }

    await db.runAsync(
      `INSERT INTO ai_companion_memories_fts (memory_id, content, trigger_keywords)
       VALUES (?, ?, ?);`,
      [newFactId, consolidatedContent.trim(), mergedTriggers.join(' ')]
    );
    for (const oldId of targetIds) {
      await db.runAsync(`DELETE FROM ai_companion_memories_fts WHERE memory_id = ?;`, [oldId]);
    }
  });

  invalidateRoleMemoryPrefetch(toPrefetchSpace(space), roleCardId);
  return newFactId;
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
       AND superseded_by IS NULL
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
    const record = rowToCompanionMemory(row);
    const keys =
      record.entities.length > 0
        ? record.entities
        : [record.triggerKeywords[0] || row.category || 'general'];
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
      targetEpisodes = list.slice(0, 8);
      break;
    }
  }

  if (!targetKey || targetEpisodes.length < 5) {
    return false;
  }

  const consolidatedContent = await lightModelConsolidator(targetEpisodes).catch(() => null);
  if (!consolidatedContent || !consolidatedContent.trim()) {
    return false;
  }

  await applyAtomicEpisodeClusterFold(
    db,
    roleCardId,
    space,
    targetKey,
    targetEpisodes,
    consolidatedContent,
    nowMs,
    'consolidation'
  );

  return true;
}

/**
 * 事件驱动实时实体簇知识编译 (Event-Driven Knowledge Compilation)
 *
 * 当某实体名下累积 >= 4 条零散情景记忆时，在手账收割或健康巡检时即时提炼并折叠为长期 L2_FACT，
 * 并通过 superseded_by 软替代旧经历、同步 FTS5、淘汰预热缓存。
 */
export async function compileEntityKnowledgeCluster(
  db: SQLiteDatabase,
  roleCardId: string,
  space: string,
  options: {
    entityHint?: string[];
    nowMs?: number;
    minClusterSize?: number;
    consolidator?: (episodes: CompanionMemoryRecord[], entityKey: string) => Promise<string | null>;
  } = {}
): Promise<number> {
  const nowMs = options.nowMs ?? Date.now();
  const minClusterSize = Math.max(3, options.minClusterSize ?? 4);
  const consolidator = options.consolidator ?? defaultHybridEpisodeConsolidator;

  const episodeRows = await db.getAllAsync<any>(
    `SELECT * FROM ai_companion_memories
     WHERE role_card_id = ? AND space = ?
       AND tier = 'L2_EPISODE'
       AND deleted_at IS NULL
       AND superseded_by IS NULL
       AND is_pinned = 0
     ORDER BY created_at ASC;`,
    [roleCardId, space]
  );

  if (!episodeRows || episodeRows.length < minClusterSize) {
    return 0;
  }

  const hintSet = new Set(
    (options.entityHint || []).map((h) => normalizeGraphEntity(h)).filter(Boolean)
  );
  const clusterMap = new Map<string, { label: string; list: CompanionMemoryRecord[] }>();

  for (const row of episodeRows) {
    const record = rowToCompanionMemory(row);
    const derivedEntities =
      record.entities.length > 0
        ? record.entities
        : extractLightEntitiesFromText(record.content, record.triggerKeywords);

    const seenInRow = new Set<string>();
    for (const rawEntity of derivedEntities) {
      const norm = normalizeGraphEntity(rawEntity);
      if (!norm || seenInRow.has(norm)) continue;
      seenInRow.add(norm);
      const bucket = clusterMap.get(norm) || {
        label: rawEntity.replace(/^entity:/, '').trim() || norm,
        list: [],
      };
      bucket.list.push(record);
      clusterMap.set(norm, bucket);
    }
  }

  const eligibleClusters = Array.from(clusterMap.entries())
    .filter(([, bucket]) => bucket.list.length >= minClusterSize)
    .sort((a, b) => {
      const aHint = hintSet.has(a[0]) ? 1 : 0;
      const bHint = hintSet.has(b[0]) ? 1 : 0;
      if (bHint !== aHint) return bHint - aHint;
      return b[1].list.length - a[1].list.length;
    });

  let compiledCount = 0;
  const consumedIds = new Set<string>();

  for (const [, bucket] of eligibleClusters.slice(0, 3)) {
    const remaining = bucket.list.filter((item) => !consumedIds.has(item.id)).slice(0, 8);
    if (remaining.length < minClusterSize) continue;

    const synthesized = await consolidator(remaining, bucket.label).catch(() => null);
    if (!synthesized || !synthesized.trim()) continue;

    await applyAtomicEpisodeClusterFold(
      db,
      roleCardId,
      space,
      bucket.label,
      remaining,
      synthesized,
      nowMs,
      'knowledge_compile'
    );
    for (const item of remaining) {
      consumedIds.add(item.id);
    }
    compiledCount += 1;
  }

  return compiledCount;
}

/**
 * 伴侣记忆图谱健康巡检与一键自愈 (Graph Health Inspection & Healing)
 *
 * 1. 自动补齐缺失实体的历史记忆记录；
 * 2. 修补丢失的 FTS5 全文索引行；
 * 3. 高相似度（>= 0.80 2-gram Jaccard）同层同类别重复记忆去重替代；
 * 4. 触发实体簇知识编译并计算图谱遥测报告。
 */
export async function inspectAndHealMemoryGraphHealth(
  db: SQLiteDatabase,
  roleCardId: string,
  space: string,
  nowMs: number = Date.now(),
  options: { applyHealing?: boolean } = { applyHealing: true }
): Promise<MemoryGraphHealthReport> {
  const applyHealing = options.applyHealing !== false;
  let orphanEntitiesBackfilled = 0;
  let ftsBackfilled = 0;
  let duplicatesMerged = 0;
  let clustersCompiled = 0;

  const activeRows = await db.getAllAsync<any>(
    `SELECT * FROM ai_companion_memories
     WHERE role_card_id = ? AND space = ?
       AND deleted_at IS NULL
       AND superseded_by IS NULL
       AND tier IN ('L2_EPISODIC', 'L2_FACT', 'L2_EPISODE')
     ORDER BY is_pinned DESC, importance DESC, hit_count DESC, created_at DESC;`,
    [roleCardId, space]
  );

  let records = (activeRows || []).map(rowToCompanionMemory);

  if (applyHealing && records.length > 0) {
    // 1. 回填孤儿实体记录（例如旧手动创建记忆 entities 为 []）
    const orphanUpdates: Array<{ id: string; entitiesJson: string; entities: string[] }> = [];
    for (const rec of records) {
      if (rec.entities.length === 0) {
        const extracted = extractLightEntitiesFromText(rec.content, rec.triggerKeywords);
        if (extracted.length > 0) {
          orphanUpdates.push({
            id: rec.id,
            entitiesJson: JSON.stringify(extracted),
            entities: extracted,
          });
          rec.entities = extracted;
        }
      }
    }

    if (orphanUpdates.length > 0) {
      await db.withTransactionAsync(async () => {
        for (const upd of orphanUpdates) {
          await db.runAsync(
            `UPDATE ai_companion_memories SET entities = ? WHERE id = ?;`,
            [upd.entitiesJson, upd.id]
          );
        }
      });
      orphanEntitiesBackfilled = orphanUpdates.length;
    }

    // 2. 巡检并修复缺失的 FTS5 索引记录
    try {
      const ftsRows = await db.getAllAsync<{ memory_id: string }>(
        `SELECT memory_id FROM ai_companion_memories_fts;`
      );
      const indexedIds = new Set((ftsRows || []).map((r) => r.memory_id));
      const missingFts = records.filter((rec) => !indexedIds.has(rec.id));
      if (missingFts.length > 0) {
        await db.withTransactionAsync(async () => {
          for (const rec of missingFts) {
            await db.runAsync(
              `INSERT INTO ai_companion_memories_fts (memory_id, content, trigger_keywords)
               VALUES (?, ?, ?);`,
              [rec.id, rec.content, rec.triggerKeywords.join(' ')]
            );
          }
        });
        ftsBackfilled = missingFts.length;
      }
    } catch {}

    // 3. 高相似度同层重复记忆自愈折叠（>= 0.80 2-gram Jaccard）：合并触发词、实体与命中数后再软删冗余副本
    const duplicatePairs: Array<{ winnerId: string; loserId: string }> = [];
    const absorbedIds = new Set<string>();
    const keeperById = new Map<string, CompanionMemoryRecord>();
    const mergedKeepers = new Map<
      string,
      {
        content: string;
        triggers: Set<string>;
        entities: Set<string>;
        hitCount: number;
        lastAccessedAt: number;
      }
    >();
    const maxScan = Math.min(records.length, 150);

    for (let i = 0; i < maxScan; i += 1) {
      const keeper = records[i];
      keeperById.set(keeper.id, keeper);
      if (absorbedIds.has(keeper.id)) continue;
      for (let j = i + 1; j < maxScan; j += 1) {
        const dup = records[j];
        if (absorbedIds.has(dup.id) || dup.isPinned) continue;
        if (keeper.tier !== dup.tier || keeper.category !== dup.category) continue;
        if (compute2GramJaccardSimilarity(keeper.content, dup.content) >= 0.8) {
          absorbedIds.add(dup.id);
          duplicatePairs.push({ winnerId: keeper.id, loserId: dup.id });

          let agg = mergedKeepers.get(keeper.id);
          if (!agg) {
            agg = {
              content: keeper.content,
              triggers: new Set(keeper.triggerKeywords || []),
              entities: new Set(keeper.entities || []),
              hitCount: keeper.hitCount || 0,
              lastAccessedAt: keeper.lastAccessedAt || nowMs,
            };
            mergedKeepers.set(keeper.id, agg);
          }
          for (const kw of dup.triggerKeywords || []) {
            if (kw && kw.trim()) agg.triggers.add(kw.trim());
          }
          for (const ent of dup.entities || []) {
            if (ent && ent.trim()) agg.entities.add(ent.trim());
          }
          agg.hitCount += dup.hitCount || 0;
          agg.lastAccessedAt = Math.max(agg.lastAccessedAt, dup.lastAccessedAt || 0);
        }
      }
    }

    if (duplicatePairs.length > 0) {
      await db.withTransactionAsync(async () => {
        for (const [winnerId, agg] of mergedKeepers.entries()) {
          const nextTriggers = Array.from(agg.triggers);
          const nextEntities = Array.from(agg.entities);
          await db.runAsync(
            `UPDATE ai_companion_memories
             SET trigger_keywords = ?, entities = ?, hit_count = ?, last_accessed_at = ?
             WHERE id = ?;`,
            [
              JSON.stringify(nextTriggers),
              JSON.stringify(nextEntities),
              agg.hitCount,
              agg.lastAccessedAt,
              winnerId,
            ]
          );
          await db.runAsync(
            `DELETE FROM ai_companion_memories_fts WHERE memory_id = ?;`,
            [winnerId]
          );
          await db.runAsync(
            `INSERT INTO ai_companion_memories_fts (memory_id, content, trigger_keywords)
             VALUES (?, ?, ?);`,
            [winnerId, agg.content, nextTriggers.join(' ')]
          );
          const inMem = keeperById.get(winnerId);
          if (inMem) {
            inMem.triggerKeywords = nextTriggers;
            inMem.entities = nextEntities;
            inMem.hitCount = agg.hitCount;
            inMem.lastAccessedAt = agg.lastAccessedAt;
          }
        }
        for (const pair of duplicatePairs) {
          await db.runAsync(
            `UPDATE ai_companion_memories
             SET superseded_by = ?, deleted_at = ?
             WHERE id = ?;`,
            [pair.winnerId, nowMs, pair.loserId]
          );
          await db.runAsync(
            `DELETE FROM ai_companion_memories_fts WHERE memory_id = ?;`,
            [pair.loserId]
          );
        }
      });
      duplicatesMerged = duplicatePairs.length;
    }

    // 4. 触发事件型实体簇知识编译
    clustersCompiled = await compileEntityKnowledgeCluster(db, roleCardId, space, {
      nowMs,
      minClusterSize: 4,
    }).catch(() => 0);

    if (
      orphanEntitiesBackfilled > 0 ||
      ftsBackfilled > 0 ||
      duplicatesMerged > 0 ||
      clustersCompiled > 0
    ) {
      invalidateRoleMemoryPrefetch(toPrefetchSpace(space), roleCardId);
      const refreshedRows = await db.getAllAsync<any>(
        `SELECT * FROM ai_companion_memories
         WHERE role_card_id = ? AND space = ?
           AND deleted_at IS NULL
           AND superseded_by IS NULL
           AND tier IN ('L2_EPISODIC', 'L2_FACT', 'L2_EPISODE')
         ORDER BY created_at DESC;`,
        [roleCardId, space]
      );
      records = (refreshedRows || []).map(rowToCompanionMemory);
    }
  }

  let activeArcCount = 0;
  try {
    const slotRow = await db.getFirstAsync<{ content: string }>(
      `SELECT content FROM ai_companion_memories
       WHERE role_card_id = ? AND space = ? AND tier = 'L1_SLOT' AND category = 'active_arc_ledger' AND deleted_at IS NULL
       LIMIT 1;`,
      [roleCardId, space]
    );
    if (slotRow?.content) {
      const parsed = JSON.parse(slotRow.content);
      if (Array.isArray(parsed)) {
        activeArcCount = parsed.filter((item) => item && item.status !== 'done').length;
      }
    }
  } catch {}

  const graph = buildEntityCooccurrenceGraph(records);
  const stats = computeGraphStats(graph, 5);
  const totalHits = records.reduce((acc, rec) => acc + (rec.hitCount || 0), 0);

  return {
    roleCardId,
    space: toPrefetchSpace(space),
    totalActiveL2: records.length,
    orphanEntitiesBackfilled,
    ftsBackfilled,
    duplicatesMerged,
    clustersCompiled,
    entityNodeCount: stats.nodeCount,
    entityEdgeCount: stats.edgeCount,
    totalHits,
    activeArcCount,
    topEntities: stats.topEntities,
    inspectedAt: nowMs,
  };
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

  // 1. 先执行同实体碎片坍缩 (Episode Folding)：未传入外部大模型函数时自动使用零延迟混合归纳器
  const effectiveConsolidator =
    lightModelConsolidator ??
    ((episodes: CompanionMemoryRecord[]) => defaultHybridEpisodeConsolidator(episodes));
  try {
    await foldStaleEpisodesToFact(
      db,
      roleCardId,
      space,
      fourteenDaysAgoMs,
      nowMs,
      effectiveConsolidator
    );
  } catch {}

  await db.withTransactionAsync(async () => {
    // 2. 清理已过期的短期记忆与一次性待办 (L3 瞬态层硬擦除)
    await db.runAsync(
      `UPDATE ai_companion_memories
       SET deleted_at = ?
       WHERE role_card_id = ? AND space = ?
         AND deleted_at IS NULL
         AND superseded_by IS NULL
         AND expires_at IS NOT NULL AND expires_at < ?;`,
      [nowMs, roleCardId, space, nowMs]
    );

    // 3. 修剪孤立僵尸记忆：创建满 14 天、从未被召回命中 (hit_count = 0)、非置顶且重要度 <= 6 的零散琐事
    await db.runAsync(
      `UPDATE ai_companion_memories
       SET deleted_at = ?
       WHERE role_card_id = ? AND space = ?
         AND deleted_at IS NULL
         AND superseded_by IS NULL
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

  invalidateRoleMemoryPrefetch(toPrefetchSpace(space), roleCardId);
}
