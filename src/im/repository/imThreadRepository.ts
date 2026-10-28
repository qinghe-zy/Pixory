import { initDatabase, type PixorySpace } from '../../database';
import type { ImMessage, ImThread, ImThreadListItem, ImCompanionLivingState } from '../types';

interface RawThreadRow {
  id: string;
  space: 'normal' | 'personal';
  roleCardId: string | null;
  title: string;
  chat_mode: string;
  lastMessagePreview: string | null;
  isPinned: number;
  living_state_json?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawMessageRow {
  id: string;
  threadId: string;
  burst_group_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: string;
  delivery_status?: string | null;
  visible_at: number | null;
  createdAt: string;
}

function mapThreadRow(row: RawThreadRow): ImThread {
  let livingState: ImCompanionLivingState | null = null;
  if (row.living_state_json) {
    try {
      livingState = JSON.parse(row.living_state_json);
    } catch {}
  }
  return {
    id: row.id,
    space: row.space,
    roleCardId: row.roleCardId ?? '',
    title: row.title,
    chatMode: 'im',
    lastMessagePreview: row.lastMessagePreview,
    isPinned: Boolean(row.isPinned),
    livingState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 从日记小卡片消息内容或创建时间中提取日期 Key (YYYY-MM-DD)
 */
export function extractDiaryCardDate(content: string, createdAt?: string): string | null {
  if (!content) return null;
  if (
    !content.startsWith('{"type":"diary_card"') &&
    !content.startsWith('{"diaryDate":') &&
    !content.startsWith('{"diaryId":')
  ) {
    return null;
  }
  try {
    const data = JSON.parse(content);
    if (data.diaryDate) return String(data.diaryDate);
    if (data.diaryId) {
      const match = String(data.diaryId).match(/\d{4}-\d{2}-\d{2}/);
      if (match) return match[0];
      return String(data.diaryId);
    }
  } catch {}
  return createdAt ? createdAt.slice(0, 10) : null;
}

function mapMessageRow(row: RawMessageRow): ImMessage {
  let type: import('../types').ImMessageType = 'text';
  let content = row.content;
  let imageUri: string | null = null;
  let boundIpName: string | null = null;

  if (row.role === 'system') {
    type = 'system_notice';
  } else if (row.content && (row.content.startsWith('{"type":"diary_card"') || row.content.startsWith('{"diaryDate":') || row.content.startsWith('{"diaryId":'))) {
    type = 'diary_card';
  } else if (row.content && row.content.startsWith('{"imageUri":')) {
    try {
      const parsed = JSON.parse(row.content);
      type = 'image';
      imageUri = parsed.imageUri ?? null;
      boundIpName = parsed.boundIpName ?? null;
      content = parsed.text ?? '[图片]';
    } catch {
      // 容错保持普通文本
    }
  }

  return {
    id: row.id,
    threadId: row.threadId,
    burstGroupId: row.burst_group_id,
    role: row.role,
    content,
    type,
    imageUri,
    boundIpName,
    status: row.status === 'failed' ? 'failed' : 'sent',
    deliveryStatus: (row.delivery_status as any) || 'delivered',
    visibleAt: row.visible_at,
    createdAt: row.createdAt,
  };
}

/**
 * 获取或创建唯一 1:1 伴侣 IM 会话
 *
 * 物理防重入：同一空间下单个角色卡严格对应唯一个 IM 会话。
 * 并发安全：利用数据库 idx_ai_threads_unique_im_role 唯一索引，遇锁碰撞时兜底读取已创建实例。
 */
export async function getOrCreateImThread(
  space: PixorySpace,
  roleCardId: string,
  options?: { defaultTitle?: string }
): Promise<ImThread & { avatarUri?: string | null }> {
  const db = await initDatabase(space);

  // 1. 查询对应角色卡的真实信息与首条打招呼问候语
  const roleCard = await db.getFirstAsync<{
    name: string;
    avatarUri: string | null;
    avatarEnabled: number | null;
    firstMessage: string | null;
  }>(
    `SELECT name, avatarUri, avatarEnabled, firstMessage FROM ai_role_cards WHERE id = ? LIMIT 1;`,
    [roleCardId]
  );
  const roleName = roleCard?.name?.trim();
  const avatarUri = roleCard && roleCard.avatarEnabled !== 0 ? roleCard.avatarUri : null;
  const initialTitle = options?.defaultTitle?.trim() || roleName || '伴侣会话';

  const existing = await db.getFirstAsync<RawThreadRow>(
    `SELECT id, space, roleCardId, title, chat_mode, lastMessagePreview, isPinned, createdAt, updatedAt
     FROM ai_threads
     WHERE chat_mode = 'im' AND roleCardId = ? AND space = ?
     LIMIT 1;`,
    [roleCardId, space]
  );

  if (existing) {
    const thread = mapThreadRow(existing);
    if (roleName && (thread.title === '伴侣会话' || thread.title !== roleName)) {
      thread.title = roleName;
      void db.runAsync(`UPDATE ai_threads SET title = ? WHERE id = ?;`, [roleName, thread.id]);
    }
    return { ...thread, avatarUri };
  }

  const now = new Date().toISOString();
  const threadId = `im_th_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const initialGreeting = roleCard?.firstMessage?.trim() || null;

  try {
    await db.runAsync(
      `INSERT INTO ai_threads (
        id, space, contextType, title, roleCardId, chat_mode, lastMessagePreview, isPinned, createdAt, updatedAt
      ) VALUES (?, ?, 'normal', ?, ?, 'im', ?, 0, ?, ?);`,
      [threadId, space, initialTitle, roleCardId, initialGreeting, now, now]
    );

    // 若角色配置了开场白，新会话自动预置 AI 第一条问候气泡
    if (initialGreeting) {
      const msgId = `im_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.runAsync(
        `INSERT INTO ai_messages (
          id, threadId, role, content, status, visible_at, createdAt
        ) VALUES (?, ?, 'assistant', ?, 'sent', NULL, ?);`,
        [msgId, threadId, initialGreeting, now]
      );
    }

    return {
      id: threadId,
      space,
      roleCardId,
      title: initialTitle,
      avatarUri,
      chatMode: 'im',
      lastMessagePreview: initialGreeting,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error: any) {
    // 若并发创建触发唯一索引约束，重新查询已存在的会话
    if (String(error?.message || '').includes('UNIQUE') || String(error?.message || '').includes('constraint')) {
      const fallback = await db.getFirstAsync<RawThreadRow>(
        `SELECT id, space, roleCardId, title, chat_mode, lastMessagePreview, isPinned, createdAt, updatedAt
         FROM ai_threads
         WHERE chat_mode = 'im' AND roleCardId = ? AND space = ?
         LIMIT 1;`,
        [roleCardId, space]
      );
      if (fallback) {
        return { ...mapThreadRow(fallback), avatarUri };
      }
    }
    throw error;
  }
}

/**
 * 依据 Thread ID 获取单个 IM 会话
 */
export async function getImThreadById(
  space: PixorySpace,
  threadId: string
): Promise<ImThread | null> {
  const db = await initDatabase(space);
  const row = await db.getFirstAsync<RawThreadRow>(
    `SELECT id, space, roleCardId, title, chat_mode, lastMessagePreview, isPinned, createdAt, updatedAt
     FROM ai_threads
     WHERE id = ? AND chat_mode = 'im'
     LIMIT 1;`,
    [threadId]
  );
  return row ? mapThreadRow(row) : null;
}

/**
 * 查询伴侣通讯录会话列表
 * - 默认全量呈现在通讯录中，按最接近聊天降序排列，未聊过的沉底
 * - 若指定 onlyChatted: true，则仅返回已开启对话且有聊天记录的角色
 */
export async function listImThreads(
  space: PixorySpace,
  options?: { onlyChatted?: boolean }
): Promise<ImThreadListItem[]> {
  const db = await initDatabase(space);
  interface ImContactRow {
    roleCardId: string;
    roleName: string | null;
    avatarUri: string | null;
    avatarEnabled: number | null;
    firstMessage: string | null;
    roleUpdatedAt: string;
    threadId: string | null;
    threadTitle: string | null;
    lastMessagePreview: string | null;
    isPinned: number | null;
    threadUpdatedAt: string | null;
    lastChatAt: string | null;
  }

  // 伴侣通讯录核心查询：
  // 1. 以 ai_role_cards 为基准，所有角色卡（角色库角色与已添加角色）默认全量呈现
  // 2. 统计各角色在 IM 短聊以及长聊中的最新聊天消息时间戳（lastChatAt）
  // 3. 排序策略：置顶优先 > 聊过且最近聊过的优先（随着最接近聊天降序排列） > 未聊过的按添加/更新时间倒序
  // 4. 联合查询兜底孤儿会话，确保历史数据不丢失
  const rows = await db.getAllAsync<ImContactRow>(
    `SELECT * FROM (
       SELECT
         r.id AS roleCardId,
         r.name AS roleName,
         r.avatarUri AS avatarUri,
         r.avatarEnabled AS avatarEnabled,
         r.firstMessage AS firstMessage,
         r.updatedAt AS roleUpdatedAt,
         t.id AS threadId,
         t.title AS threadTitle,
         t.lastMessagePreview AS lastMessagePreview,
         COALESCE(t.isPinned, 0) AS isPinned,
         t.updatedAt AS threadUpdatedAt,
         COALESCE(
           im_msg.lastImMsgAt,
           CASE WHEN t.lastMessagePreview IS NOT NULL THEN t.updatedAt ELSE NULL END,
           role_act.lastChatAt
         ) AS lastChatAt
       FROM ai_role_cards r
       LEFT JOIN ai_threads t
         ON t.roleCardId = r.id
         AND t.chat_mode = 'im'
         AND t.space = r.space
       LEFT JOIN (
         SELECT
           threadId,
           MAX(COALESCE(completedAt, createdAt)) AS lastImMsgAt
         FROM ai_messages
         WHERE role IN ('user', 'assistant')
         GROUP BY threadId
       ) im_msg ON im_msg.threadId = t.id
       LEFT JOIN (
         SELECT
           th.roleCardId AS roleCardId,
           MAX(COALESCE(m.completedAt, m.createdAt, th.updatedAt)) AS lastChatAt
         FROM ai_threads th
         INNER JOIN ai_messages m
           ON m.threadId = th.id AND m.role IN ('user', 'assistant')
         WHERE th.space = ? AND th.archivedAt IS NULL AND th.roleCardId IS NOT NULL
         GROUP BY th.roleCardId
       ) role_act ON role_act.roleCardId = r.id
       WHERE r.space = ? AND r.archivedAt IS NULL

       UNION ALL

       SELECT
         t.roleCardId AS roleCardId,
         NULL AS roleName,
         NULL AS avatarUri,
         NULL AS avatarEnabled,
         NULL AS firstMessage,
         t.updatedAt AS roleUpdatedAt,
         t.id AS threadId,
         t.title AS threadTitle,
         t.lastMessagePreview AS lastMessagePreview,
         COALESCE(t.isPinned, 0) AS isPinned,
         t.updatedAt AS threadUpdatedAt,
         COALESCE(im_msg_orphan.lastImMsgAt, t.updatedAt) AS lastChatAt
       FROM ai_threads t
       LEFT JOIN (
         SELECT
           threadId,
           MAX(COALESCE(completedAt, createdAt)) AS lastImMsgAt
         FROM ai_messages
         WHERE role IN ('user', 'assistant')
         GROUP BY threadId
       ) im_msg_orphan ON im_msg_orphan.threadId = t.id
       WHERE t.chat_mode = 'im' AND t.space = ?
         AND (t.roleCardId IS NULL OR t.roleCardId NOT IN (SELECT id FROM ai_role_cards WHERE space = ? AND archivedAt IS NULL))
     )
     ORDER BY
       isPinned DESC,
       (lastChatAt IS NULL) ASC,
       lastChatAt DESC,
       roleUpdatedAt DESC,
       roleName ASC;`,
    [space, space, space, space]
  );

  const items: ImThreadListItem[] = rows.map((row) => {
    const displayTitle = row.roleName?.trim() || (row.threadTitle !== '伴侣会话' ? row.threadTitle : '') || '伴侣';
    const effectiveAvatar = row.avatarEnabled !== 0 ? row.avatarUri : null;
    const hasThread = Boolean(row.threadId);
    const hasRealChat = Boolean(row.lastChatAt && (hasThread || row.lastMessagePreview));
    const lastPreview = hasThread && row.lastMessagePreview
      ? row.lastMessagePreview
      : (row.firstMessage?.trim() || '点击开启伴侣对话');

    return {
      id: row.threadId || `contact-${row.roleCardId}`,
      space,
      roleCardId: row.roleCardId || '',
      title: displayTitle,
      avatarUri: effectiveAvatar,
      lastMessagePreview: lastPreview,
      lastMessageAt: hasRealChat ? (row.lastChatAt || row.threadUpdatedAt || null) : null,
      updatedAt: row.lastChatAt || row.threadUpdatedAt || row.roleUpdatedAt,
      isPinned: Boolean(row.isPinned),
    };
  });

  if (options?.onlyChatted) {
    return items.filter((item) => item.lastMessageAt != null && !item.id.startsWith('contact-'));
  }

  return items;
}

/**
 * 清空聊天记录 (Soft Reset 契约)
 *
 * 物理清空该会话下的所有消息，但保留 thread 实体及 1:1 绑定关系不变，确保路由引用永不断裂。
 */
export async function clearImThreadHistory(space: PixorySpace, threadId: string): Promise<void> {
  const db = await initDatabase(space);
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ai_messages WHERE threadId = ?;`, [threadId]);
    await db.runAsync(
      `UPDATE ai_threads SET lastMessagePreview = NULL, updatedAt = ? WHERE id = ? AND chat_mode = 'im';`,
      [now, threadId]
    );
  });
}

/**
 * 彻底物理删除 IM 会话
 */
export async function deleteImThread(space: PixorySpace, threadId: string): Promise<void> {
  const db = await initDatabase(space);
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ai_messages WHERE threadId = ?;`, [threadId]);
    await db.runAsync(`DELETE FROM ai_threads WHERE id = ? AND chat_mode = 'im';`, [threadId]);
  });
}

/**
 * 渲染快车道：查询当前已显影的会话消息（按时间倒序）
 *
 * 规则：visible_at IS NULL (即时消息) OR visible_at <= Date.now() (到期显影)
 * 单日日记卡片唯一性：同一天只呈现最新一张日记小信封，历史多余卡片在后台自动清理。
 */
export async function getVisibleImMessages(
  space: PixorySpace,
  threadId: string,
  limit: number = 50
): Promise<ImMessage[]> {
  const db = await initDatabase(space);
  const nowMs = Date.now();
  const rows = await db.getAllAsync<RawMessageRow>(
    `SELECT id, threadId, burst_group_id, role, content, status, delivery_status, visible_at, createdAt
     FROM ai_messages
     WHERE threadId = ? AND (visible_at IS NULL OR visible_at <= ?) AND (delivery_status IS NULL OR delivery_status != 'cancelled')
     ORDER BY createdAt DESC, rowid DESC
     LIMIT ?;`,
    [threadId, nowMs, limit]
  );

  const seenDiaryDates = new Set<string>();
  const duplicateCardIds: string[] = [];
  const filteredRows: RawMessageRow[] = [];

  for (const row of rows) {
    const dateKey = extractDiaryCardDate(row.content, row.createdAt);
    if (dateKey) {
      if (seenDiaryDates.has(dateKey)) {
        duplicateCardIds.push(row.id);
        continue;
      }
      seenDiaryDates.add(dateKey);
    }
    filteredRows.push(row);
  }

  if (duplicateCardIds.length > 0) {
    void db.runAsync(
      `DELETE FROM ai_messages WHERE id IN (${duplicateCardIds.map(() => '?').join(',')});`,
      duplicateCardIds
    ).catch(() => {});
  }

  return filteredRows.map(mapMessageRow);
}

/**
 * 预查下一个即将显影的未来时间戳（供 VisibilityTicker 单定时器使用）
 */
export async function getNextPendingVisibleAt(
  space: PixorySpace,
  threadId: string
): Promise<number | null> {
  const db = await initDatabase(space);
  const nowMs = Date.now();
  const row = await db.getFirstAsync<{ minVisibleAt: number | null }>(
    `SELECT MIN(visible_at) AS minVisibleAt
     FROM ai_messages
     WHERE threadId = ? AND visible_at > ? AND (delivery_status IS NULL OR delivery_status != 'cancelled');`,
    [threadId, nowMs]
  );
  return row?.minVisibleAt ?? null;
}

/**
 * 写入单条 IM 消息并更新会话预览摘要
 */
export async function insertImMessage(
  space: PixorySpace,
  message: ImMessage
): Promise<void> {
  const db = await initDatabase(space);
  let rawContent = message.content;
  let cleanPreview = message.content.replace(/\[BR\]/g, ' ').slice(0, 80);

  if (message.type === 'diary_card') {
    cleanPreview = '[日记已生成]';
  } else if (message.type === 'image') {
    rawContent = JSON.stringify({
      imageUri: message.imageUri,
      boundIpName: message.boundIpName,
      text: message.content || '[图片]',
    });
    cleanPreview = message.boundIpName ? `[图片·${message.boundIpName}]` : '[图片]';
  }

  const deliveryStatus = message.deliveryStatus || 'delivered';

  await db.withTransactionAsync(async () => {
    // 若为日记小卡片，清理该会话下同日期的历史旧卡片，确保单日信封唯一性
    if (message.type === 'diary_card') {
      const dateKey = extractDiaryCardDate(rawContent, message.createdAt);
      if (dateKey) {
        await db.runAsync(
          `DELETE FROM ai_messages
           WHERE threadId = ?
             AND (
               content LIKE ?
               OR content LIKE ?
               OR (
                 (content LIKE '{"type":"diary_card"%' OR content LIKE '{"diaryDate":%' OR content LIKE '{"diaryId":%')
                 AND date(createdAt) = ?
               )
             );`,
          [
            message.threadId,
            `%"diaryDate":"${dateKey}"%`,
            `%"diaryId":"diary_${message.threadId}_${dateKey}"%`,
            dateKey,
          ]
        );
      }
    }

    await db.runAsync(
      `INSERT INTO ai_messages (
        id, threadId, burst_group_id, role, status, delivery_status, content, visible_at, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        message.id,
        message.threadId,
        message.burstGroupId ?? null,
        message.role,
        message.status === 'failed' ? 'failed' : 'completed',
        deliveryStatus,
        rawContent,
        message.visibleAt ?? null,
        message.createdAt,
        message.createdAt,
      ]
    );

    // 只有已可见的消息才立即刷新到会话列表预览
    if (message.visibleAt == null || message.visibleAt <= Date.now()) {
      await db.runAsync(
        `UPDATE ai_threads SET lastMessagePreview = ?, updatedAt = ? WHERE id = ?;`,
        [cleanPreview, message.createdAt, message.threadId]
      );
    }
  });
}

/**
 * 删除单条消息
 */
export async function deleteImMessage(space: PixorySpace, messageId: string): Promise<void> {
  const db = await initDatabase(space);
  await db.runAsync(`DELETE FROM ai_messages WHERE id = ?;`, [messageId]);
}

/**
 * 用户消息编辑重发：截断该时间点之后的所有消息 (时光倒流)
 */
export async function truncateDownstreamMessages(
  space: PixorySpace,
  threadId: string,
  fromCreatedAt: string
): Promise<void> {
  const db = await initDatabase(space);
  await db.runAsync(
    `DELETE FROM ai_messages WHERE threadId = ? AND createdAt >= ?;`,
    [threadId, fromCreatedAt]
  );
}

/**
 * 读取伴侣当前持久化的生活自知觉状态 (Living State)
 */
export async function getThreadLivingState(
  space: PixorySpace,
  threadId: string
): Promise<ImCompanionLivingState | null> {
  const db = await initDatabase(space);
  const row = await db.getFirstAsync<{ living_state_json: string | null }>(
    `SELECT living_state_json FROM ai_threads WHERE id = ? LIMIT 1;`,
    [threadId]
  );
  if (!row?.living_state_json) return null;
  try {
    return JSON.parse(row.living_state_json);
  } catch {
    return null;
  }
}

/**
 * 持久化伴侣生活自知觉状态至 SQLite (ai_threads.living_state_json)
 */
export async function updateThreadLivingState(
  space: PixorySpace,
  threadId: string,
  livingState: ImCompanionLivingState
): Promise<void> {
  const db = await initDatabase(space);
  const jsonStr = JSON.stringify(livingState);
  await db.runAsync(
    `UPDATE ai_threads SET living_state_json = ?, updatedAt = ? WHERE id = ?;`,
    [jsonStr, new Date().toISOString(), threadId]
  );
}

/**
 * 取消当前会话中所有预埋未显影的消息 (Zero-fork Guarantee)
 * 当用户先开口说话时，预埋的心跳消息彻底废弃并清理
 */
export async function cancelStagedMessages(
  space: PixorySpace,
  threadId: string
): Promise<number> {
  const db = await initDatabase(space);
  const result = await db.runAsync(
    `DELETE FROM ai_messages WHERE threadId = ? AND delivery_status = 'staged';`,
    [threadId]
  );
  return result.changes;
}

/**
 * 推进预埋或显影队列状态机为已送达 (revealing/staged -> delivered)
 */
export async function revealPendingMessages(
  space: PixorySpace,
  threadId: string,
  nowMs: number = Date.now()
): Promise<void> {
  const db = await initDatabase(space);
  await db.runAsync(
    `UPDATE ai_messages SET delivery_status = 'delivered' WHERE threadId = ? AND visible_at <= ? AND delivery_status IN ('staged', 'revealing');`,
    [threadId, nowMs]
  );
}
