import { initDatabase, type PixorySpace } from '../../database';
import type { ImMessage, ImThread, ImThreadListItem, ImCompanionLivingState } from '../types';
import { isGoodnightMessage, shouldExpireGoodnightEnvelope } from '../heartbeat/imDndGuard';

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
 * 序列化 IM 文档消息载荷接口
 */
export interface SerializedImDocumentPayload {
  type: 'document';
  title: string;
  uri: string;
  casUri: string;
  casHash?: string;
  size?: number;
  mimeType?: string;
  format?: string;
  hasRevisions?: boolean;
  baseMsgId?: string;
  derivedFromMsgId?: string;
  diffSummary?: string;
  tocSkeleton?: Array<{ blockId: string; previewText: string }>;
  text: string;
  content?: string;
}

export function serializeImDocumentMessage(message: ImMessage): {
  rawContent: string;
  cleanPreview: string;
} {
  const docMeta = message.metadata?.document ?? {};
  const title = docMeta.title || message.content || '未命名文档.md';
  const effectiveUri = docMeta.casUri || docMeta.uri || '';

  const payload: SerializedImDocumentPayload = {
    type: 'document',
    title,
    uri: effectiveUri,
    casUri: effectiveUri,
    casHash: docMeta.casHash,
    size: typeof docMeta.sizeBytes === 'number' ? docMeta.sizeBytes : (typeof docMeta.size === 'number' ? docMeta.size : 0),
    mimeType: docMeta.mimeType,
    format: docMeta.format || title.split('.').pop()?.toLowerCase(),
    hasRevisions: Boolean(docMeta.hasRevisions),
    baseMsgId: docMeta.baseMsgId,
    derivedFromMsgId: docMeta.derivedFromMsgId,
    diffSummary: docMeta.diffSummary,
    tocSkeleton: docMeta.tocSkeleton,
    text: title,
    content: typeof docMeta.content === 'string' ? docMeta.content : undefined,
  };

  return {
    rawContent: JSON.stringify(payload),
    cleanPreview: `[文档] ${title}`,
  };
}

export function tryParseDocumentRowContent(rawContent: string): SerializedImDocumentPayload | null {
  if (!rawContent || !rawContent.startsWith('{') || !rawContent.includes('"document"')) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawContent) as Partial<SerializedImDocumentPayload>;
    if (parsed && parsed.type === 'document' && typeof parsed.title === 'string') {
      const effectiveUri = parsed.casUri || parsed.uri || '';
      return {
        type: 'document',
        title: parsed.title,
        uri: effectiveUri,
        casUri: effectiveUri,
        casHash: parsed.casHash,
        size: typeof parsed.size === 'number' ? parsed.size : 0,
        mimeType: parsed.mimeType,
        format: parsed.format || parsed.title.split('.').pop()?.toLowerCase(),
        hasRevisions: Boolean(parsed.hasRevisions),
        baseMsgId: parsed.baseMsgId,
        derivedFromMsgId: parsed.derivedFromMsgId,
        diffSummary: parsed.diffSummary,
        tocSkeleton: Array.isArray(parsed.tocSkeleton) ? parsed.tocSkeleton : undefined,
        text: parsed.text || parsed.title,
        content: typeof parsed.content === 'string' ? parsed.content : undefined,
      };
    }
  } catch {
    // 非合法文档 JSON，回退至普通文本解析
  }
  return null;
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
  let metadata: Record<string, any> | null = null;
  let voice: import('../types').ImVoiceMetadata | undefined = undefined;

  const docData = tryParseDocumentRowContent(row.content);
  if (docData) {
    type = 'document';
    content = docData.title;
    metadata = { document: docData };
  } else if (row.role === 'system') {
    type = 'system_notice';
  } else if (row.content && row.content.startsWith('{') && (row.content.startsWith('{"type":"voice"') || row.content.includes('"type":"voice"'))) {
    try {
      const parsed = JSON.parse(row.content);
      type = 'voice';
      content = parsed.transcription ?? parsed.text ?? '';
      voice = {
        audioUri: parsed.audioUri ?? '',
        durationMs: parsed.durationMs ?? 1000,
        transcription: parsed.transcription ?? parsed.text ?? '',
        isPlayed: Boolean(parsed.isPlayed),
      };
    } catch {
      // 容错保持普通文本
    }
  } else if (row.content && row.content.startsWith('{"type":"thought"')) {
    try {
      const parsed = JSON.parse(row.content);
      type = 'thought';
      content = parsed.content ?? '';
      metadata = {
        isThinking: false,
        durationSeconds: parsed.durationSeconds ?? 1,
        isCollapsed: parsed.isCollapsed ?? true,
      };
    } catch {
      // 容错保持普通文本
    }
  } else if (row.content && (row.content.startsWith('{"type":"diary_card"') || row.content.startsWith('{"diaryDate":') || row.content.startsWith('{"diaryId":'))) {
    type = 'diary_card';
  } else if (row.content && row.content.startsWith('{"type":"sticker"')) {
    try {
      const parsed = JSON.parse(row.content);
      type = 'sticker';
      imageUri = parsed.imageUri ?? parsed.uri ?? null;
      content = parsed.name ?? parsed.text ?? '[表情]';
    } catch {
      // 容错保持普通文本
    }
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
    voice,
    metadata,
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
  const initialTitle = options?.defaultTitle?.trim() || roleName || '角色会话';

  const existing = await db.getFirstAsync<RawThreadRow>(
    `SELECT id, space, roleCardId, title, chat_mode, lastMessagePreview, isPinned, createdAt, updatedAt
     FROM ai_threads
     WHERE chat_mode = 'im' AND roleCardId = ? AND space = ?
     LIMIT 1;`,
    [roleCardId, space]
  );

  if (existing) {
    const thread = mapThreadRow(existing);
    if (roleName && (thread.title === '角色会话' || thread.title === '伴侣会话' || thread.title !== roleName)) {
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
    unreadCount: number | null;
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
         COALESCE(t.im_unread_count, 0) AS unreadCount,
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
           AND ((delivery_status = 'delivered') OR (delivery_status IS NULL AND visible_at IS NULL))
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
         COALESCE(t.im_unread_count, 0) AS unreadCount,
         t.updatedAt AS threadUpdatedAt,
         COALESCE(im_msg_orphan.lastImMsgAt, t.updatedAt) AS lastChatAt
       FROM ai_threads t
       LEFT JOIN (
         SELECT
           threadId,
           MAX(COALESCE(completedAt, createdAt)) AS lastImMsgAt
         FROM ai_messages
         WHERE role IN ('user', 'assistant')
           AND ((delivery_status = 'delivered') OR (delivery_status IS NULL AND visible_at IS NULL))
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
    const displayTitle = row.roleName?.trim() || (row.threadTitle !== '伴侣会话' && row.threadTitle !== '角色会话' ? row.threadTitle : '') || '角色';
    const effectiveAvatar = row.avatarEnabled !== 0 ? row.avatarUri : null;
    const hasThread = Boolean(row.threadId);
    const hasRealChat = Boolean(row.lastChatAt && (hasThread || row.lastMessagePreview));
    const lastPreview = hasThread && row.lastMessagePreview
      ? row.lastMessagePreview
      : (row.firstMessage?.trim() || '点击开启对话');

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
      unreadCount: row.unreadCount ?? 0,
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
 * 物理清空该会话下的所有消息，并重置顶栏状态与未读计数，但保留 thread 实体及 1:1 绑定关系不变。
 */
export async function clearImThreadHistory(space: PixorySpace, threadId: string): Promise<void> {
  const db = await initDatabase(space);
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ai_messages WHERE threadId = ?;`, [threadId]);
    await db.runAsync(
      `UPDATE ai_threads
       SET lastMessagePreview = NULL,
           im_unread_count = 0,
           consecutive_unreplied_count = 0,
           living_state_json = NULL,
           updatedAt = ?
       WHERE id = ? AND chat_mode = 'im';`,
      [now, threadId]
    );
  });
}

/**
 * 彻底重置 IM 会话全量状态（包含日记、专属记忆簿与顶栏状态）
 */
export async function clearImThreadFullState(
  space: PixorySpace,
  threadId: string,
  roleCardId?: string | null
): Promise<void> {
  const db = await initDatabase(space);
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM ai_messages WHERE threadId = ?;`, [threadId]);
    try {
      await db.runAsync(
        `DELETE FROM ai_companion_diaries WHERE thread_id = ? OR (role_card_id IS NOT NULL AND role_card_id = ?);`,
        [threadId, roleCardId || '__none__']
      );
    } catch {
      // 容错表不存在
    }
    if (roleCardId) {
      try {
        await db.runAsync(
          `DELETE FROM ai_companion_memories_fts WHERE memory_id IN (SELECT id FROM ai_companion_memories WHERE role_card_id = ?);`,
          [roleCardId]
        );
        await db.runAsync(`DELETE FROM ai_companion_memories WHERE role_card_id = ?;`, [roleCardId]);
      } catch {
        // 容错
      }
    }
    await db.runAsync(
      `UPDATE ai_threads
       SET lastMessagePreview = NULL,
           im_unread_count = 0,
           consecutive_unreplied_count = 0,
           living_state_json = NULL,
           updatedAt = ?
       WHERE id = ? AND chat_mode = 'im';`,
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
  const rows = await db.getAllAsync<RawMessageRow>(
    `SELECT id, threadId, burst_group_id, role, content, status, delivery_status, visible_at, createdAt
     FROM ai_messages
     WHERE threadId = ?
       AND (
         (delivery_status = 'delivered')
         OR (delivery_status IS NULL AND visible_at IS NULL)
       )
     ORDER BY createdAt DESC, rowid DESC
     LIMIT ?;`,
    [threadId, limit]
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
 * 连续记忆专用上下文拉取：
 * 若活跃锚点 anchorMsgId 存在且未被删除，精确加载从锚点气泡所在行至今的全部已显影消息（升序），
 * 彻底杜绝因 [BR] 多气泡拆分导致 LIMIT 100 挤丢锚点并诱发假性自愈跳过记忆提炼！
 */
export async function getContextMessagesFromAnchor(
  space: PixorySpace,
  threadId: string,
  anchorMsgId?: string | null,
  fallbackLimit: number = 180
): Promise<ImMessage[]> {
  const db = await initDatabase(space);

  if (anchorMsgId) {
    const anchorRow = await db.getFirstAsync<{ rowid: number }>(
      `SELECT rowid FROM ai_messages WHERE id = ? AND threadId = ? LIMIT 1;`,
      [anchorMsgId, threadId]
    );
    if (anchorRow && anchorRow.rowid > 0) {
      const rows = await db.getAllAsync<RawMessageRow>(
        `SELECT id, threadId, burst_group_id, role, content, status, delivery_status, visible_at, createdAt
         FROM ai_messages
         WHERE threadId = ?
           AND rowid >= ?
           AND (
             (delivery_status = 'delivered')
             OR (delivery_status IS NULL AND visible_at IS NULL)
           )
         ORDER BY createdAt ASC, rowid ASC
         LIMIT 600;`,
        [threadId, anchorRow.rowid]
      );
      if (rows.length > 0) {
        return rows.map(mapMessageRow);
      }
    }
  }

  const descItems = await getVisibleImMessages(space, threadId, Math.max(fallbackLimit, 180));
  return descItems.reverse();
}

/**
 * 预查下一个即将显影的消息行（包含时间戳与状态，供 VisibilityTicker 细分打字与心跳）
 */
export async function getNextPendingVisibleRow(
  space: PixorySpace,
  threadId: string
): Promise<{ visibleAt: number; deliveryStatus: string } | null> {
  const db = await initDatabase(space);
  const nowMs = Date.now();
  const row = await db.getFirstAsync<{ visible_at: number; delivery_status: string }>(
    `SELECT visible_at, delivery_status
     FROM ai_messages
     WHERE threadId = ? AND visible_at > ? AND delivery_status IN ('staged', 'revealing')
     ORDER BY visible_at ASC
     LIMIT 1;`,
    [threadId, nowMs]
  );
  if (!row) return null;
  return { visibleAt: row.visible_at, deliveryStatus: row.delivery_status };
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
     WHERE threadId = ? AND visible_at > ? AND delivery_status IN ('staged', 'revealing');`,
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
  } else if (message.type === 'sticker') {
    rawContent = JSON.stringify({
      type: 'sticker',
      imageUri: message.imageUri,
      name: message.content || '[表情]',
    });
    cleanPreview = message.content ? `[表情] ${message.content}` : '[表情]';
  } else if (message.type === 'image') {
    rawContent = JSON.stringify({
      imageUri: message.imageUri,
      boundIpName: message.boundIpName,
      text: message.content || '[图片]',
    });
    cleanPreview = message.boundIpName ? `[图片·${message.boundIpName}]` : '[图片]';
  } else if (message.type === 'voice') {
    rawContent = JSON.stringify({
      type: 'voice',
      audioUri: message.voice?.audioUri ?? '',
      durationMs: message.voice?.durationMs ?? 1000,
      transcription: message.voice?.transcription ?? message.content,
      isPlayed: Boolean(message.voice?.isPlayed),
    });
    const s = Math.max(1, Math.round((message.voice?.durationMs ?? 1000) / 1000));
    cleanPreview = `[语音 ${s}"]`;
  } else if (message.type === 'thought') {
    rawContent = JSON.stringify({
      type: 'thought',
      content: message.content,
      durationSeconds: message.metadata?.durationSeconds || 1,
      isCollapsed: message.metadata?.isCollapsed ?? true,
    });
    cleanPreview = '[思考过程]';
  } else if (message.type === 'document') {
    const serialized = serializeImDocumentMessage(message);
    rawContent = serialized.rawContent;
    cleanPreview = serialized.cleanPreview;
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

    // 只有已可见的消息才立即刷新到会话列表预览（思考气泡不覆盖会话列表的最后消息预览）
    if (message.type !== 'thought' && (message.visibleAt == null || message.visibleAt <= Date.now())) {
      await db.runAsync(
        `UPDATE ai_threads SET lastMessagePreview = ?, updatedAt = ? WHERE id = ?;`,
        [cleanPreview, message.createdAt, message.threadId]
      );
    }

    // 用户发消息时原子重置未回复计数，并刷新最后用户交互时间戳
    // 注：staged 预埋消息仅在真正送达显影（revealPendingMessages / handleImAlarmHeadless）时才计入未回复轮次，
    // 防止因用户抢先发言取消或过期熔断而误消耗主动关怀配额。
    if (message.role === 'user') {
      try {
        await db.runAsync(
          `UPDATE ai_threads
           SET consecutive_unreplied_count = 0,
               last_user_interaction_at = ?,
               updatedAt = ?
           WHERE id = ?;`,
          [Date.now(), message.createdAt, message.threadId]
        );
      } catch {}
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
 * 当用户先开口说话或打字时，预埋的心跳消息中止，提取未显影正文作为被打断草稿
 */
export async function cancelStagedMessages(
  space: PixorySpace,
  threadId: string,
  reason: 'cancelled_by_user' | 'cancelled_by_state' = 'cancelled_by_user'
): Promise<{ cancelledCount: number; interruptedDraft: string | null }> {
  const db = await initDatabase(space);
  const stagedRow = await db.getFirstAsync<{ content: string }>(
    `SELECT content FROM ai_messages WHERE threadId = ? AND delivery_status = 'staged' LIMIT 1;`,
    [threadId]
  );
  const interruptedDraft = stagedRow?.content?.trim() || null;

  const result = await db.runAsync(
    `UPDATE ai_messages SET delivery_status = ? WHERE threadId = ? AND delivery_status = 'staged';`,
    [reason, threadId]
  );
  return {
    cancelledCount: result.changes,
    interruptedDraft,
  };
}

/**
 * 获取所有存在待显影消息的 threadId（用于全局心跳引擎扫描）
 */
export async function getActiveStagedThreadIds(
  space: PixorySpace
): Promise<string[]> {
  const db = await initDatabase(space);
  const rows = await db.getAllAsync<{ threadId: string }>(
    `SELECT DISTINCT threadId FROM ai_messages WHERE delivery_status IN ('staged', 'revealing') AND visible_at IS NOT NULL;`
  );
  return rows.map((r) => r.threadId);
}

/**
 * 推进预埋或显影队列状态机为已送达 (revealing/staged -> delivered)
 * 具备显影时二次生活自知觉守卫、30分钟 TTL 过期熔断、以及显影时间戳对齐 (防穿越插队)
 */
export async function revealPendingMessages(
  space: PixorySpace,
  threadId: string,
  nowMs: number = Date.now(),
  livingState?: ImCompanionLivingState | null,
  options?: { incrementUnread?: boolean }
): Promise<number> {
  const db = await initDatabase(space);
  const STAGED_STALE_TTL_MS = 12 * 3600 * 1000; // 仅跨半天(12小时)以上的陈旧短心跳作废，防杀后台后数小时内打开无损显影

  const candidateRows = await db.getAllAsync<{
    id: string;
    content: string;
    delivery_status: string | null;
    visible_at: number;
    createdAt: string;
  }>(
    `SELECT id, content, delivery_status, visible_at, createdAt
     FROM ai_messages
     WHERE threadId = ? AND visible_at <= ? AND delivery_status IN ('staged', 'revealing')
     ORDER BY visible_at ASC;`,
    [threadId, nowMs]
  );

  if (candidateRows.length === 0) return 0;

  // 查询用户最后一条真实发言时间，防止旧 staged 心跳穿越到用户新消息后面
  const latestUserRow = await db.getFirstAsync<{ createdAt: string }>(
    `SELECT createdAt FROM ai_messages
     WHERE threadId = ? AND role = 'user'
     ORDER BY createdAt DESC LIMIT 1;`,
    [threadId]
  );
  const latestUserTimeMs = latestUserRow?.createdAt ? (Date.parse(latestUserRow.createdAt) || 0) : 0;

  let revealedCount = 0;
  let revealedStagedCount = 0;
  const isCompanionSleeping =
    livingState?.activityLoad === 'sleeping' ||
    livingState?.deviceAccess === 'away';

  await db.withTransactionAsync(async () => {
    for (const row of candidateRows) {
      const isStaged = row.delivery_status === 'staged';

      if (isStaged) {
        // 若用户在预埋心跳计划时间之后已经先发了新消息，则取消该旧预埋气泡
        if (latestUserTimeMs > row.visible_at) {
          await db.runAsync(
            `UPDATE ai_messages SET delivery_status = 'cancelled_by_user' WHERE id = ?;`,
            [row.id]
          );
          continue;
        }

        // 1. 隔夜晚安熔断与超长陈旧熔断（revealing 正常回复气泡永不熔断！）
        const isGoodnightExpired = shouldExpireGoodnightEnvelope(
          row.content,
          Date.parse(row.createdAt) || nowMs,
          row.visible_at,
          nowMs
        );
        if (nowMs - row.visible_at > STAGED_STALE_TTL_MS || isGoodnightExpired) {
          await db.runAsync(
            `UPDATE ai_messages SET delivery_status = 'expired_ttl' WHERE id = ?;`,
            [row.id]
          );
          continue;
        }

        // 2. 显影时二次生活状态守卫（仅当即时显影且角色熟睡时拦截；若杀后台延迟补显且当时未睡则正常恢复）
        if (isCompanionSleeping && nowMs - row.visible_at < 5 * 60 * 1000) {
          await db.runAsync(
            `UPDATE ai_messages SET delivery_status = 'cancelled_by_state' WHERE id = ?;`,
            [row.id]
          );
          continue;
        }
      }

      // 3. 正常显影：对于杀后台后延迟恢复的气泡，保留其原计划时间点 row.visible_at，确保时间线真实自然
      const createdMs = Date.parse(row.createdAt) || row.visible_at;
      const alignedMs = isStaged ? row.visible_at : Math.max(createdMs, row.visible_at);
      const alignedCreatedAt = new Date(alignedMs).toISOString();
      await db.runAsync(
        `UPDATE ai_messages SET delivery_status = 'delivered', status = 'completed', createdAt = ? WHERE id = ?;`,
        [alignedCreatedAt, row.id]
      );

      // 刷新会话最后一条消息预览
      const cleanPreview = row.content.replace(/\[BR\]/g, ' ').slice(0, 80);
      await db.runAsync(
        `UPDATE ai_threads SET lastMessagePreview = ?, updatedAt = ? WHERE id = ?;`,
        [cleanPreview, alignedCreatedAt, threadId]
      );
      revealedCount += 1;
      if (isStaged) revealedStagedCount += 1;
    }

    if (revealedStagedCount > 0) {
      await db.runAsync(
        `UPDATE ai_threads SET consecutive_unreplied_count = COALESCE(consecutive_unreplied_count, 0) + 1 WHERE id = ?;`,
        [threadId]
      );
    }

    if (options?.incrementUnread && revealedCount > 0) {
      await db.runAsync(
        `UPDATE ai_threads SET im_unread_count = COALESCE(im_unread_count, 0) + ? WHERE id = ?;`,
        [revealedCount, threadId]
      );
    }
  });

  return revealedCount;
}

/**
 * 获取当前伴聊会话的情感退避状态 (连续未回复次数与最后用户交互时间戳)
 */
export async function getThreadPacingState(
  space: PixorySpace,
  threadId: string
): Promise<{ consecutiveUnreplied: number; lastUserInteractionAt: number | null }> {
  const db = await initDatabase(space);
  try {
    const row = await db.getFirstAsync<{
      consecutive_unreplied_count: number | null;
      last_user_interaction_at: number | null;
    }>(
      `SELECT consecutive_unreplied_count, last_user_interaction_at
       FROM ai_threads
       WHERE id = ? LIMIT 1;`,
      [threadId]
    );
    return {
      consecutiveUnreplied: row?.consecutive_unreplied_count ?? 0,
      lastUserInteractionAt: row?.last_user_interaction_at ?? null,
    };
  } catch {
    return { consecutiveUnreplied: 0, lastUserInteractionAt: null };
  }
}

/**
 * 保存手账日记留存的次日未闭合钩子
 */
export async function setThreadPendingDiaryHook(
  space: PixorySpace,
  threadId: string,
  hook: string | null
): Promise<void> {
  const db = await initDatabase(space);
  try {
    await db.runAsync(
      `UPDATE ai_threads SET pending_diary_hook = ? WHERE id = ?;`,
      [hook, threadId]
    );
  } catch {}
}

/**
 * 消费并清空次日手账未闭合话题钩子 (原子取出)
 */
export async function consumeThreadPendingDiaryHook(
  space: PixorySpace,
  threadId: string
): Promise<string | null> {
  const db = await initDatabase(space);
  try {
    const row = await db.getFirstAsync<{ pending_diary_hook: string | null }>(
      `SELECT pending_diary_hook FROM ai_threads WHERE id = ? LIMIT 1;`,
      [threadId]
    );
    const hook = row?.pending_diary_hook?.trim() || null;
    if (hook) {
      await db.runAsync(
        `UPDATE ai_threads SET pending_diary_hook = NULL WHERE id = ?;`,
        [threadId]
      );
    }
    return hook;
  } catch {
    return null;
  }
}

export interface DuePendingPing {
  threadId: string;
  targetTimestamp: number;
  intent: string;
  retryCount: number;
  roleCardId: string | null;
}

/**
 * 落盘预约主动联系闹钟 (Tier 2 PING)
 */
export async function savePendingPing(
  space: PixorySpace,
  threadId: string,
  targetTimestamp: number,
  intent: string
): Promise<void> {
  const db = await initDatabase(space);
  try {
    await db.runAsync(
      `UPDATE ai_threads
       SET pending_ping_at = ?, pending_ping_intent = ?, ping_retry_count = 0
       WHERE id = ?;`,
      [targetTimestamp, intent, threadId]
    );
  } catch {}
}

/**
 * 扫描当前已到期的预约主动闹钟
 */
export async function getDuePendingPings(
  space: PixorySpace,
  now: number = Date.now()
): Promise<DuePendingPing[]> {
  const db = await initDatabase(space);
  try {
    const rows = await db.getAllAsync<{
      id: string;
      pending_ping_at: number;
      pending_ping_intent: string | null;
      ping_retry_count: number | null;
      roleCardId: string | null;
    }>(
      `SELECT id, pending_ping_at, pending_ping_intent, ping_retry_count, roleCardId
       FROM ai_threads
       WHERE pending_ping_at IS NOT NULL AND pending_ping_at <= ?;`,
      [now]
    );
    return rows.map((r) => ({
      threadId: r.id,
      targetTimestamp: r.pending_ping_at,
      intent: r.pending_ping_intent || '',
      retryCount: r.ping_retry_count ?? 0,
      roleCardId: r.roleCardId,
    }));
  } catch {
    return [];
  }
}

/**
 * 查询指定会话的预约主动闹钟
 */
export async function getPendingPing(
  space: PixorySpace,
  threadId: string
): Promise<{ pendingPingAt: number; intent: string; retryCount: number } | null> {
  const db = await initDatabase(space);
  try {
    const row = await db.getFirstAsync<{
      pending_ping_at: number | null;
      pending_ping_intent: string | null;
      ping_retry_count: number | null;
    }>(
      `SELECT pending_ping_at, pending_ping_intent, ping_retry_count
       FROM ai_threads
       WHERE id = ? LIMIT 1;`,
      [threadId]
    );
    if (!row || !row.pending_ping_at) return null;
    return {
      pendingPingAt: row.pending_ping_at,
      intent: row.pending_ping_intent || '',
      retryCount: row.ping_retry_count ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * 清除预约主动联系闹钟（如用户主动发言、或任务已执行完成时）
 */
export async function clearPendingPing(
  space: PixorySpace,
  threadId: string
): Promise<void> {
  const db = await initDatabase(space);
  try {
    await db.runAsync(
      `UPDATE ai_threads
       SET pending_ping_at = NULL, pending_ping_intent = NULL, ping_retry_count = 0
       WHERE id = ?;`,
      [threadId]
    );
  } catch {}
}

/**
 * 顺延预约主动联系闹钟（如网络重试或夜间免打扰对齐次晨）
 */
export async function postponePendingPing(
  space: PixorySpace,
  threadId: string,
  nextTimestamp: number
): Promise<void> {
  const db = await initDatabase(space);
  try {
    await db.runAsync(
      `UPDATE ai_threads
       SET pending_ping_at = ?, ping_retry_count = COALESCE(ping_retry_count, 0) + 1
       WHERE id = ?;`,
      [nextTimestamp, threadId]
    );
  } catch {}
}

/**
 * 清零指定会话的未读红点计数
 */
export async function markImThreadRead(
  space: PixorySpace,
  threadId: string
): Promise<void> {
  const db = await initDatabase(space);
  try {
    await db.runAsync(
      `UPDATE ai_threads SET im_unread_count = 0 WHERE id = ? AND (im_unread_count IS NOT NULL AND im_unread_count > 0);`,
      [threadId]
    );
    if (space === 'normal') {
      const { cancelCompanionNotification } = await import('../../native/pixoryMediaModule');
      void cancelCompanionNotification(threadId);
    }
  } catch {}
}

/**
 * 递增指定会话的未读消息红点计数
 */
export async function incrementImThreadUnread(
  space: PixorySpace,
  threadId: string,
  delta: number = 1
): Promise<void> {
  if (delta <= 0) return;
  const db = await initDatabase(space);
  try {
    await db.runAsync(
      `UPDATE ai_threads SET im_unread_count = COALESCE(im_unread_count, 0) + ? WHERE id = ?;`,
      [delta, threadId]
    );
  } catch {}
}

export async function getThreadUnreadCount(space: PixorySpace, threadId: string): Promise<number> {
  try {
    const db = await initDatabase(space);
    const row = await db.getFirstAsync<{ unread: number }>(
      'SELECT COALESCE(im_unread_count, 0) as unread FROM ai_threads WHERE id = ?;',
      [threadId]
    );
    return row?.unread ?? 0;
  } catch {
    return 0;
  }
}

export async function getTotalImUnreadCount(space: PixorySpace): Promise<number> {
  try {
    const db = await initDatabase(space);
    const row = await db.getFirstAsync<{ total: number }>(
      'SELECT SUM(COALESCE(im_unread_count, 0)) as total FROM ai_threads;'
    );
    return row?.total ?? 0;
  } catch {
    return 0;
  }
}

export interface InterruptedUserThread {
  threadId: string;
  roleCardId: string | null;
  lastUserContent: string;
  lastUserCreatedAt: string;
}

/**
 * 扫描被系统强杀进程导致“用户发了消息但伴侣尚未生成任何回复”的会话（24h 内）
 */
export async function getInterruptedUserThreads(
  space: PixorySpace,
  nowMs: number = Date.now()
): Promise<InterruptedUserThread[]> {
  const db = await initDatabase(space);
  const cutoffIso = new Date(nowMs - 24 * 3600 * 1000).toISOString();
  try {
    const rows = await db.getAllAsync<{
      threadId: string;
      roleCardId: string | null;
      role: string;
      content: string;
      createdAt: string;
    }>(
      `SELECT t.id AS threadId, t.roleCardId AS roleCardId, m.role AS role, m.content AS content, m.createdAt AS createdAt
       FROM ai_threads t
       INNER JOIN ai_messages m ON m.id = (
         SELECT m2.id FROM ai_messages m2
         WHERE m2.threadId = t.id
           AND m2.role IN ('user', 'assistant')
           AND ((m2.delivery_status = 'delivered') OR (m2.delivery_status IS NULL AND m2.visible_at IS NULL))
         ORDER BY m2.createdAt DESC, m2.rowid DESC
         LIMIT 1
       )
       WHERE t.chat_mode = 'im' AND t.space = ?
         AND m.role = 'user'
         AND m.createdAt >= ?
         AND NOT EXISTS (
           SELECT 1 FROM ai_messages mp
           WHERE mp.threadId = t.id AND mp.delivery_status = 'revealing'
         );`,
      [space, cutoffIso]
    );
    return rows.map((r) => ({
      threadId: r.threadId,
      roleCardId: r.roleCardId,
      lastUserContent: r.content,
      lastUserCreatedAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}

/**
 * 更新单条消息的正文内容（用于表情冷却时的 Emoji 补偿等场景）
 */
export async function updateImMessageContent(
  space: PixorySpace,
  messageId: string,
  newContent: string
): Promise<void> {
  const db = await initDatabase(space);
  await db.runAsync(`UPDATE ai_messages SET content = ? WHERE id = ?;`, [newContent, messageId]);
}

/**
 * 更新语音消息音频路径与播放状态
 */
export async function updateImMessageVoice(
  space: PixorySpace,
  messageId: string,
  voice: import('../types').ImVoiceMetadata
): Promise<void> {
  const db = await initDatabase(space);
  const rawContent = JSON.stringify({
    type: 'voice',
    audioUri: voice.audioUri,
    durationMs: voice.durationMs,
    transcription: voice.transcription,
    isPlayed: voice.isPlayed,
  });
  await db.runAsync(`UPDATE ai_messages SET content = ? WHERE id = ?;`, [rawContent, messageId]);
}
