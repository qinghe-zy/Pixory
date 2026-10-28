import { initDatabase, type PixorySpace } from '../../database/index';
import type {
  CompanionMemoryRecord,
  CompanionMemoryTier,
  FourDCompactionResult,
} from './memoryTypes';

interface RawMemoryRow {
  id: string;
  role_card_id: string;
  space: 'normal' | 'personal';
  tier: CompanionMemoryTier;
  category: string;
  content: string;
  trigger_keywords: string | null;
  entities: string | null;
  importance: number;
  hit_count: number;
  is_pinned: number;
  created_at: number;
  last_accessed_at: number;
  source_mode: string;
}

function parseJsonArray(str: string | null): string[] {
  if (!str) return [];
  try {
    const val = JSON.parse(str);
    return Array.isArray(val) ? val : [];
  } catch {
    return [];
  }
}

function mapRow(row: RawMemoryRow): CompanionMemoryRecord {
  return {
    id: row.id,
    roleCardId: row.role_card_id,
    space: row.space,
    tier: row.tier,
    category: row.category,
    content: row.content,
    triggerKeywords: parseJsonArray(row.trigger_keywords),
    entities: parseJsonArray(row.entities),
    importance: row.importance,
    hitCount: row.hit_count,
    isPinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    sourceMode: row.source_mode ?? 'im',
  };
}

export const memoryRepository = {
  async listMemories(
    roleCardId: string,
    space: PixorySpace,
    tier?: CompanionMemoryTier
  ): Promise<CompanionMemoryRecord[]> {
    const db = await initDatabase(space);
    let query =
      'SELECT * FROM ai_companion_memories WHERE role_card_id = ? AND space = ?';
    const params: any[] = [roleCardId, space];
    if (tier) {
      query += ' AND tier = ?';
      params.push(tier);
    }
    query += ' ORDER BY is_pinned DESC, importance DESC, last_accessed_at DESC';
    const rows = await db.getAllAsync<RawMemoryRow>(query, ...params);
    return rows.map(mapRow);
  },

  async saveMemory(
    memory: CompanionMemoryRecord,
    space: PixorySpace
  ): Promise<void> {
    const db = await initDatabase(space);
    const triggersJson = JSON.stringify(memory.triggerKeywords || []);
    const entitiesJson = JSON.stringify(memory.entities || []);
    await db.runAsync(
      `INSERT INTO ai_companion_memories 
       (id, role_card_id, space, tier, category, content, trigger_keywords, entities, importance, hit_count, is_pinned, created_at, last_accessed_at, source_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         category = excluded.category,
         content = excluded.content,
         trigger_keywords = excluded.trigger_keywords,
         entities = excluded.entities,
         importance = excluded.importance,
         hit_count = excluded.hit_count,
         is_pinned = excluded.is_pinned,
         last_accessed_at = excluded.last_accessed_at;`,
      memory.id,
      memory.roleCardId,
      space,
      memory.tier,
      memory.category,
      memory.content,
      triggersJson,
      entitiesJson,
      memory.importance,
      memory.hitCount,
      memory.isPinned ? 1 : 0,
      memory.createdAt,
      memory.lastAccessedAt,
      memory.sourceMode
    );

    // 同步 FTS 索引
    await db.runAsync('DELETE FROM ai_companion_memories_fts WHERE memory_id = ?', memory.id);
    await db.runAsync(
      'INSERT INTO ai_companion_memories_fts (memory_id, content, trigger_keywords) VALUES (?, ?, ?)',
      memory.id,
      memory.content,
      (memory.triggerKeywords || []).join(' ')
    );
  },

  async deleteMemory(id: string, space: PixorySpace): Promise<void> {
    const db = await initDatabase(space);
    await db.runAsync('DELETE FROM ai_companion_memories WHERE id = ?', id);
    await db.runAsync('DELETE FROM ai_companion_memories_fts WHERE memory_id = ?', id);
  },

  async recordHits(ids: string[], space: PixorySpace): Promise<void> {
    if (ids.length === 0) return;
    const db = await initDatabase(space);
    const now = Date.now();
    for (const id of ids) {
      await db.runAsync(
        'UPDATE ai_companion_memories SET hit_count = hit_count + 1, last_accessed_at = ? WHERE id = ?',
        now,
        id
      );
    }
  },

  async applyCompaction(
    roleCardId: string,
    space: PixorySpace,
    compaction: FourDCompactionResult
  ): Promise<void> {
    const db = await initDatabase(space);
    const now = Date.now();

    // 1. 更新 L1 剧情连续性摘要
    const summaryId = `summary_${roleCardId}_${space}`;
    const summaryContent = JSON.stringify(compaction.episodic_continuity);
    await this.saveMemory(
      {
        id: summaryId,
        roleCardId,
        space,
        tier: 'L1_SUMMARY',
        category: 'continuity_summary',
        content: summaryContent,
        triggerKeywords: [],
        entities: [],
        importance: 10,
        hitCount: 0,
        isPinned: true,
        createdAt: now,
        lastAccessedAt: now,
        sourceMode: 'im',
      },
      space
    );

    // 2. 变更 L1 画像槽位
    for (const slot of compaction.l1_slot_mutations || []) {
      const slotId = `slot_${roleCardId}_${slot.slot}`;
      if (slot.op === 'DELETE') {
        await this.deleteMemory(slotId, space);
      } else {
        await this.saveMemory(
          {
            id: slotId,
            roleCardId,
            space,
            tier: 'L1_SLOT',
            category: slot.slot,
            content: slot.value,
            triggerKeywords: [],
            entities: [],
            importance: 8,
            hitCount: 0,
            isPinned: true,
            createdAt: now,
            lastAccessedAt: now,
            sourceMode: 'im',
          },
          space
        );
      }
    }

    // 3. 变更 L2 长期原子事实 (具备实体与触发词 Jaccard 相似度排重归并机制，防记忆克隆膨胀)
    const existingL2 = await this.listMemories(roleCardId, space, 'L2_EPISODIC');

    for (const l2 of compaction.l2_memory_mutations || []) {
      if (l2.op === 'ADD') {
        const triggers = l2.expanded_triggers || [];
        const entities = l2.entities || [];

        // 寻找是否存在具有相同实体或触发词重叠度 >= 0.4 的已有记录
        const matched = existingL2.find((ex) => {
          const hasCommonEntity =
            entities.length > 0 &&
            ex.entities.some((e) => entities.includes(e));
          if (hasCommonEntity) return true;

          // 计算触发词 Jaccard 相似度
          if (triggers.length > 0 && ex.triggerKeywords.length > 0) {
            const setA = new Set(triggers.map((t) => t.toLowerCase()));
            const setB = new Set(ex.triggerKeywords.map((t) => t.toLowerCase()));
            let common = 0;
            for (const t of setA) {
              if (setB.has(t)) common += 1;
            }
            const union = new Set([...setA, ...setB]).size;
            return union > 0 && common / union >= 0.4;
          }
          return false;
        });

        if (matched) {
          // 降级为 UPDATE：合并触发词与实体，刷新内容
          const mergedTriggers = [...new Set([...matched.triggerKeywords, ...triggers])];
          const mergedEntities = [...new Set([...matched.entities, ...entities])];
          await this.saveMemory(
            {
              ...matched,
              content: l2.content,
              triggerKeywords: mergedTriggers,
              entities: mergedEntities,
              importance: Math.max(matched.importance, l2.importance ?? 5),
              lastAccessedAt: now,
            },
            space
          );
        } else {
          // 真正新增
          const memId = `mem_l2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await this.saveMemory(
            {
              id: memId,
              roleCardId,
              space,
              tier: 'L2_EPISODIC',
              category: 'episodic_fact',
              content: l2.content,
              triggerKeywords: triggers,
              entities,
              importance: l2.importance ?? 5,
              hitCount: 0,
              isPinned: false,
              createdAt: now,
              lastAccessedAt: now,
              sourceMode: 'im',
            },
            space
          );
        }
      }
    }
  },
};
