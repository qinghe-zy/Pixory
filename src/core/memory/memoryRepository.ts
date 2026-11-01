import { initDatabase, type PixorySpace } from '../../database/index';
import type {
  CompanionMemoryRecord,
  CompanionMemoryTier,
  FourDCompactionResult,
} from './memoryTypes';
import {
  shouldAdmitToLongTermMemory,
  calculateMemorySimilarity,
} from './memorySieveGatekeeper';

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
  expires_at?: number | null;
  superseded_by?: string | null;
  deleted_at?: number | null;
  confidence?: number | null;
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
    expiresAt: row.expires_at ?? null,
    supersededBy: row.superseded_by ?? null,
    deletedAt: row.deleted_at ?? null,
    confidence: row.confidence ?? 0.85,
  };
}

const IMMEDIATE_FACT_RULES: Array<{
  regex: RegExp;
  category: string;
  format: (m: RegExpMatchArray) => { content: string; entities: string[]; triggers: string[] } | null;
}> = [
  {
    regex: /(?:我叫|我的名字是|你可以叫我|以后叫我)\s*([\u4e00-\u9fa5A-Za-z0-9]{1,10})/,
    category: 'user_identity',
    format: (m) => {
      const name = m[1].trim();
      if (!name || /^(什么|谁|哈哈|笨蛋)$/.test(name)) return null;
      return {
        content: `用户的称呼/名字是「${name}」`,
        entities: [name],
        triggers: ['名字', '称呼', name],
      };
    },
  },
  {
    regex: /我对\s*([\u4e00-\u9fa5A-Za-z]{1,10})\s*过敏/,
    category: 'user_taboo',
    format: (m) => {
      const item = m[1].trim();
      return {
        content: `用户对${item}过敏（饮食/生活禁忌）`,
        entities: [item],
        triggers: [item, '过敏', '禁忌', '不能吃'],
      };
    },
  },
  {
    regex: /(?:我)?(?:平时|从来|一直)?(?:不吃|最讨厌吃|吃不了|忌口)\s*([\u4e00-\u9fa5A-Za-z]{1,10})/,
    category: 'user_preference',
    format: (m) => {
      const food = m[1].trim();
      if (/^(饭|东西|了|呀|啊)$/.test(food)) return null;
      return {
        content: `用户饮食忌口：不吃${food}`,
        entities: [food],
        triggers: [food, '不吃', '忌口', '吃什么', '外卖', '点餐'],
      };
    },
  },
  {
    regex: /(?:我)?(?:最喜欢吃|超爱吃|特别喜欢吃|最爱喝|最喜欢喝)\s*([\u4e00-\u9fa5A-Za-z]{1,12})/,
    category: 'user_preference',
    format: (m) => {
      const food = m[1].trim();
      return {
        content: `用户喜欢的饮食：${food}`,
        entities: [food],
        triggers: [food, '喜欢吃', '爱吃', '喜欢喝', '吃什么', '美食'],
      };
    },
  },
  {
    regex: /我家(?:养了只|的)?(猫|猫咪|小猫|狗|小狗|狗狗|鹦鹉|仓鼠|兔子)(?:名字)?叫\s*([\u4e00-\u9fa5A-Za-z0-9]{1,10})/,
    category: 'user_pet',
    format: (m) => {
      const petType = m[1].trim();
      const petName = m[2].trim();
      return {
        content: `用户养了${petType}，名字叫「${petName}」`,
        entities: [petName, petType],
        triggers: [petName, petType, '宠物', '毛孩子', '主子'],
      };
    },
  },
  {
    regex: /我的生日是\s*([0-9一二三四五六七八九十农历月日号./-]{3,14})/,
    category: 'user_identity',
    format: (m) => {
      const bday = m[1].trim();
      return {
        content: `用户的生日是 ${bday}`,
        entities: ['生日'],
        triggers: ['生日', bday],
      };
    },
  },
];

export function extractImmediateFactsFromUserText(userText: string): Array<{
  category: string;
  content: string;
  entities: string[];
  triggers: string[];
}> {
  if (!userText || userText.trim().length < 3) return [];
  const results: Array<{ category: string; content: string; entities: string[]; triggers: string[] }> = [];
  for (const rule of IMMEDIATE_FACT_RULES) {
    const match = userText.match(rule.regex);
    if (match) {
      const formatted = rule.format(match);
      if (formatted) {
        results.push({ category: rule.category, ...formatted });
      }
    }
  }
  return results;
}

export const memoryRepository = {
  async listCoreProfileFacts(
    roleCardId: string,
    space: PixorySpace,
    limit: number = 8
  ): Promise<CompanionMemoryRecord[]> {
    if (!roleCardId) return [];
    const db = await initDatabase(space);
    const now = Date.now();
    const rows = await db.getAllAsync<RawMemoryRow>(
      `SELECT * FROM ai_companion_memories
       WHERE role_card_id = ? AND space = ?
         AND deleted_at IS NULL
         AND superseded_by IS NULL
         AND (expires_at IS NULL OR expires_at > ?)
         AND (is_pinned = 1 OR (tier IN ('L2_FACT', 'L2_EPISODE', 'L2_EPISODIC') AND importance >= 7))
       ORDER BY is_pinned DESC, importance DESC, last_accessed_at DESC
       LIMIT ?;`,
      roleCardId,
      space,
      now,
      limit
    );
    return rows.map(mapRow);
  },

  async harvestImmediateUserFacts(
    roleCardId: string,
    space: PixorySpace,
    userText: string
  ): Promise<number> {
    if (!roleCardId) return 0;
    const extracted = extractImmediateFactsFromUserText(userText);
    if (extracted.length === 0) return 0;

    await this.applyCompaction(roleCardId, space, {
      l2_memory_mutations: extracted.map((item) => ({
        op: 'ADD' as const,
        tier: 'L2_FACT' as const,
        category: item.category,
        content: item.content,
        importance: 8,
        entities: item.entities,
        expanded_triggers: item.triggers,
      })),
    });
    return extracted.length;
  },

  async listMemories(
    roleCardId: string,
    space: PixorySpace,
    tier?: CompanionMemoryTier
  ): Promise<CompanionMemoryRecord[]> {
    const db = await initDatabase(space);
    const now = Date.now();
    let query =
      'SELECT * FROM ai_companion_memories WHERE role_card_id = ? AND space = ? AND deleted_at IS NULL AND superseded_by IS NULL AND (expires_at IS NULL OR expires_at > ?)';
    const params: any[] = [roleCardId, space, now];
    if (tier === 'L2_EPISODIC') {
      query += " AND tier IN ('L2_EPISODIC', 'L2_FACT', 'L2_EPISODE')";
    } else if (tier) {
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
       (id, role_card_id, space, tier, category, content, trigger_keywords, entities, importance, hit_count, is_pinned, created_at, last_accessed_at, source_mode, expires_at, superseded_by, deleted_at, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         category = excluded.category,
         content = excluded.content,
         trigger_keywords = excluded.trigger_keywords,
         entities = excluded.entities,
         importance = excluded.importance,
         hit_count = excluded.hit_count,
         is_pinned = excluded.is_pinned,
         last_accessed_at = excluded.last_accessed_at,
         expires_at = excluded.expires_at,
         superseded_by = excluded.superseded_by,
         deleted_at = excluded.deleted_at,
         confidence = excluded.confidence;`,
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
      memory.sourceMode,
      memory.expiresAt ?? null,
      memory.supersededBy ?? null,
      memory.deletedAt ?? null,
      memory.confidence ?? 0.85
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

    // 1. 更新 L1 剧情连续性摘要 (仅当传入时更新)
    if (compaction.episodic_continuity) {
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
    }

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

    // 3. 变更 L2 长期记忆（分流为 L2_FACT 原子设定 与 L2_EPISODE 情节事件，并排重裂变）
    const existingL2 = await this.listMemories(roleCardId, space, 'L2_EPISODIC');

    for (const l2 of compaction.l2_memory_mutations || []) {
      if (l2.op === 'ADD') {
        // 门禁检查：过滤瞬态生理动作、闲聊垫话与临时物流垃圾记忆
        const admission = shouldAdmitToLongTermMemory({
          content: l2.content,
          tier: l2.tier,
          category: l2.category,
          entities: l2.entities,
          importance: l2.importance,
        });

        if (!admission.admit) {
          // 拒绝垃圾记忆入库，避免污染长期画像
          continue;
        }

        const effectiveContent = admission.sanitizedContent || l2.content;
        const triggers = l2.expanded_triggers || [];
        const entities = l2.entities || [];
        const rawTier = l2.tier;

        // 启发式判定: 事实设定 (L2_FACT) vs 剧情事件 (L2_EPISODE)
        const isFact =
          rawTier === 'L2_FACT' ||
          (rawTier !== 'L2_EPISODE' &&
            Boolean(
              l2.category?.includes('fact') ||
              l2.category?.includes('preference') ||
              l2.category?.includes('setting') ||
              l2.category?.includes('profile') ||
              /^(用户|伴侣|TA)(养了|喜欢|讨厌|是|有|对.*过敏|习惯)/.test(effectiveContent)
            ));
        const effectiveCategory = l2.category || (isFact ? 'fact_attribute' : 'episodic_event');

        if (isFact) {
          // L2_FACT: 仅当具有共同实体且 (同类别 或 触发词重叠度 >= 0.6) 或 语义相似度 >= 0.75 时才做 UPDATE 归并
          const matched = existingL2.find((ex) => {
            if (ex.tier !== 'L2_FACT' && ex.tier !== 'L2_EPISODIC') return false;

            if (calculateMemorySimilarity(ex.content, effectiveContent) >= 0.75) {
              return true;
            }

            const hasCommonEntity =
              entities.length > 0 && ex.entities.some((e) => entities.includes(e));
            if (!hasCommonEntity) return false;

            if (ex.category && ex.category === effectiveCategory) return true;

            if (triggers.length > 0 && ex.triggerKeywords.length > 0) {
              const setA = new Set(triggers.map((t) => t.toLowerCase()));
              const setB = new Set(ex.triggerKeywords.map((t) => t.toLowerCase()));
              let common = 0;
              for (const t of setA) {
                if (setB.has(t)) common += 1;
              }
              const union = new Set([...setA, ...setB]).size;
              return union > 0 && common / union >= 0.6;
            }
            return false;
          });

          if (matched) {
            const mergedTriggers = [...new Set([...matched.triggerKeywords, ...triggers])];
            const mergedEntities = [...new Set([...matched.entities, ...entities])];
            await this.saveMemory(
              {
                ...matched,
                content: effectiveContent,
                triggerKeywords: mergedTriggers,
                entities: mergedEntities,
                importance: Math.max(matched.importance, l2.importance ?? 5),
                lastAccessedAt: now,
                expiresAt: admission.expiresAt !== undefined ? admission.expiresAt : matched.expiresAt,
              },
              space
            );
          } else {
            const memId = `mem_fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await this.saveMemory(
              {
                id: memId,
                roleCardId,
                space,
                tier: 'L2_FACT',
                category: effectiveCategory,
                content: effectiveContent,
                triggerKeywords: triggers,
                entities,
                importance: l2.importance ?? 6,
                hitCount: 0,
                isPinned: false,
                createdAt: now,
                lastAccessedAt: now,
                sourceMode: 'im',
                expiresAt: admission.expiresAt ?? null,
                confidence: l2.confidence ?? 0.85,
              },
              space
            );
          }
        } else {
          // L2_EPISODE: 剧情经历，保留完整历史脉络！严禁因实体相同覆盖历史！
          // 仅当与已有情节内容高度重复 (语义相似度 >= 0.8) 时做幂等合并，其余一律追加 (APPEND)
          const duplicateEpisode = existingL2.find((ex) => {
            if (ex.tier !== 'L2_EPISODE') return false;
            if (ex.content === effectiveContent) return true;
            return calculateMemorySimilarity(ex.content, effectiveContent) >= 0.8;
          });

          if (duplicateEpisode) {
            const mergedTriggers = [...new Set([...duplicateEpisode.triggerKeywords, ...triggers])];
            const mergedEntities = [...new Set([...duplicateEpisode.entities, ...entities])];
            await this.saveMemory(
              {
                ...duplicateEpisode,
                triggerKeywords: mergedTriggers,
                entities: mergedEntities,
                importance: Math.max(duplicateEpisode.importance, l2.importance ?? 5),
                lastAccessedAt: now,
                expiresAt: admission.expiresAt !== undefined ? admission.expiresAt : duplicateEpisode.expiresAt,
              },
              space
            );
          } else {
            const memId = `mem_ep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await this.saveMemory(
              {
                id: memId,
                roleCardId,
                space,
                tier: 'L2_EPISODE',
                category: effectiveCategory,
                content: effectiveContent,
                triggerKeywords: triggers,
                entities,
                importance: l2.importance ?? 5,
                hitCount: 0,
                isPinned: false,
                createdAt: now,
                lastAccessedAt: now,
                sourceMode: 'im',
                expiresAt: admission.expiresAt ?? null,
                confidence: l2.confidence ?? 0.85,
              },
              space
            );
          }
        }
      } else if (l2.op === 'SUPERSEDE') {
        // 偏好演进替代：将旧记忆标记为 superseded_by 并插入新记忆
        const admission = shouldAdmitToLongTermMemory({
          content: l2.content,
          tier: l2.tier,
          category: l2.category,
          entities: l2.entities,
          importance: l2.importance,
        });
        if (!admission.admit) continue;

        const effectiveContent = admission.sanitizedContent || l2.content;
        const newMemId = `mem_fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newRecord: CompanionMemoryRecord = {
          id: newMemId,
          roleCardId,
          space,
          tier: l2.tier || 'L2_FACT',
          category: l2.category || 'user_preference',
          content: effectiveContent,
          triggerKeywords: l2.expanded_triggers || [],
          entities: l2.entities || [],
          importance: l2.importance ?? 7,
          hitCount: 0,
          isPinned: false,
          createdAt: now,
          lastAccessedAt: now,
          sourceMode: 'im',
          expiresAt: admission.expiresAt ?? null,
          confidence: l2.confidence ?? 0.9,
        };

        if (l2.targetId) {
          await this.supersedeMemory(space, l2.targetId, newRecord);
        } else {
          await this.saveMemory(newRecord, space);
        }
      }
    }
  },

  async listCompanionMemoryBook(
    roleCardId: string,
    space: PixorySpace,
    filter: 'all' | 'fact' | 'slot' | 'episode' = 'all',
    query?: string
  ): Promise<CompanionMemoryRecord[]> {
    if (!roleCardId) return [];
    const db = await initDatabase(space);
    let sql =
      'SELECT * FROM ai_companion_memories WHERE role_card_id = ? AND space = ? AND deleted_at IS NULL AND superseded_by IS NULL';
    const params: any[] = [roleCardId, space];

    if (filter === 'fact') {
      sql += " AND tier = 'L2_FACT'";
    } else if (filter === 'slot') {
      sql += " AND tier = 'L1_SLOT'";
    } else if (filter === 'episode') {
      sql += " AND tier IN ('L2_EPISODE', 'L2_EPISODIC')";
    }

    if (query && query.trim()) {
      sql += ' AND (content LIKE ? OR category LIKE ?)';
      params.push(`%${query.trim()}%`, `%${query.trim()}%`);
    }

    sql += ' ORDER BY is_pinned DESC, importance DESC, last_accessed_at DESC;';
    const rows = await db.getAllAsync<RawMemoryRow>(sql, ...params);
    return rows.map(mapRow);
  },

  async createManualMemory(
    space: PixorySpace,
    roleCardId: string,
    item: {
      content: string;
      category?: string;
      tier?: CompanionMemoryTier;
      isPinned?: boolean;
      expiresAt?: number | null;
    }
  ): Promise<CompanionMemoryRecord> {
    const now = Date.now();
    const memId = `mem_manual_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const tier = item.tier || 'L2_FACT';
    const category = item.category || 'user_custom';
    const record: CompanionMemoryRecord = {
      id: memId,
      roleCardId,
      space,
      tier,
      category,
      content: item.content.trim(),
      triggerKeywords: [item.content.trim().slice(0, 8)],
      entities: [],
      importance: 8,
      hitCount: 0,
      isPinned: Boolean(item.isPinned),
      createdAt: now,
      lastAccessedAt: now,
      sourceMode: 'manual',
      expiresAt: item.expiresAt ?? null,
      confidence: 1.0,
    };
    await this.saveMemory(record, space);
    return record;
  },

  async updateMemoryContent(
    space: PixorySpace,
    id: string,
    newContent: string
  ): Promise<void> {
    const db = await initDatabase(space);
    const now = Date.now();
    await db.runAsync(
      'UPDATE ai_companion_memories SET content = ?, last_accessed_at = ? WHERE id = ?',
      newContent.trim(),
      now,
      id
    );
    await db.runAsync('UPDATE ai_companion_memories_fts SET content = ? WHERE memory_id = ?', newContent.trim(), id);
  },

  async togglePinMemory(
    space: PixorySpace,
    id: string
  ): Promise<boolean> {
    const db = await initDatabase(space);
    const row = await db.getFirstAsync<{ is_pinned: number }>(
      'SELECT is_pinned FROM ai_companion_memories WHERE id = ?',
      id
    );
    const nextState = row?.is_pinned ? 0 : 1;
    await db.runAsync(
      'UPDATE ai_companion_memories SET is_pinned = ?, last_accessed_at = ? WHERE id = ?',
      nextState,
      Date.now(),
      id
    );
    return nextState === 1;
  },

  async softDeleteMemory(
    space: PixorySpace,
    id: string
  ): Promise<void> {
    const db = await initDatabase(space);
    await db.runAsync(
      'UPDATE ai_companion_memories SET deleted_at = ? WHERE id = ?',
      Date.now(),
      id
    );
  },

  async restoreSoftDeletedMemory(
    space: PixorySpace,
    id: string
  ): Promise<void> {
    const db = await initDatabase(space);
    await db.runAsync(
      'UPDATE ai_companion_memories SET deleted_at = NULL WHERE id = ?',
      id
    );
  },

  async supersedeMemory(
    space: PixorySpace,
    oldId: string,
    newRecord: CompanionMemoryRecord
  ): Promise<void> {
    const db = await initDatabase(space);
    await this.saveMemory(newRecord, space);
    await db.runAsync(
      'UPDATE ai_companion_memories SET superseded_by = ? WHERE id = ?',
      newRecord.id,
      oldId
    );
  },
};
