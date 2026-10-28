import { initDatabase, type PixorySpace } from '../../database';
import type { ImMessage } from '../types';

export interface ImThreadSettings {
  backgroundImageUri?: string | null;
  nudgeText?: string | null;
  contextWindowN?: number;
  heartbeatEnabled?: boolean;
  proactiveEnabled?: boolean;
  providerId?: string | null;
  modelId?: string | null;
}

export async function getImThreadSettings(
  space: PixorySpace,
  threadId: string
): Promise<ImThreadSettings> {
  const db = await initDatabase(space);
  const row = await db.getFirstAsync<{
    background_image_uri: string | null;
    nudge_text: string | null;
    context_window_n: number | null;
    heartbeat_enabled: number | null;
    proactive_enabled: number | null;
    providerId: string | null;
    modelId: string | null;
  }>(
    `SELECT background_image_uri, nudge_text, context_window_n, heartbeat_enabled, proactive_enabled, providerId, modelId
     FROM ai_threads WHERE id = ? LIMIT 1;`,
    [threadId]
  );

  return {
    backgroundImageUri: row?.background_image_uri ?? null,
    nudgeText: row?.nudge_text ?? '的小脑袋',
    contextWindowN: row?.context_window_n ?? 20,
    heartbeatEnabled: row?.heartbeat_enabled !== 0,
    proactiveEnabled: row?.proactive_enabled !== 0,
    providerId: row?.providerId ?? null,
    modelId: row?.modelId ?? null,
  };
}

export async function updateImThreadSettings(
  space: PixorySpace,
  threadId: string,
  settings: ImThreadSettings
): Promise<void> {
  const db = await initDatabase(space);
  const fields: string[] = [];
  const values: any[] = [];

  if (settings.backgroundImageUri !== undefined) {
    fields.push('background_image_uri = ?');
    values.push(settings.backgroundImageUri);
  }
  if (settings.nudgeText !== undefined) {
    fields.push('nudge_text = ?');
    values.push(settings.nudgeText);
  }
  if (settings.contextWindowN !== undefined) {
    fields.push('context_window_n = ?');
    values.push(settings.contextWindowN);
  }
  if (settings.heartbeatEnabled !== undefined) {
    fields.push('heartbeat_enabled = ?');
    values.push(settings.heartbeatEnabled ? 1 : 0);
  }
  if (settings.proactiveEnabled !== undefined) {
    fields.push('proactive_enabled = ?');
    values.push(settings.proactiveEnabled ? 1 : 0);
  }
  if (settings.providerId !== undefined) {
    fields.push('providerId = ?');
    values.push(settings.providerId);
  }
  if (settings.modelId !== undefined) {
    fields.push('modelId = ?');
    values.push(settings.modelId);
  }

  if (fields.length > 0) {
    values.push(threadId);
    await db.runAsync(`UPDATE ai_threads SET ${fields.join(', ')} WHERE id = ?;`, values);
  }
}

export async function updateRoleAvatar(
  space: PixorySpace,
  roleCardId: string,
  avatarUri: string | null
): Promise<void> {
  const db = await initDatabase(space);
  await db.runAsync(
    `UPDATE ai_role_cards SET avatarUri = ?, avatarEnabled = ? WHERE id = ?;`,
    [avatarUri, avatarUri ? 1 : 0, roleCardId]
  );
}

export async function searchImMessages(
  space: PixorySpace,
  threadId: string,
  query: string
): Promise<Array<{ id: string; role: string; content: string; createdAt: string }>> {
  if (!query.trim()) return [];
  const db = await initDatabase(space);
  const pattern = `%${query.trim()}%`;
  const now = Date.now();
  return db.getAllAsync<{ id: string; role: string; content: string; createdAt: string }>(
    `SELECT id, role, content, createdAt
     FROM ai_messages
     WHERE threadId = ? AND content LIKE ? AND (visible_at IS NULL OR visible_at <= ?)
     ORDER BY createdAt DESC
     LIMIT 50;`,
    [threadId, pattern, now]
  );
}

export async function exportImThreadMessages(
  space: PixorySpace,
  threadId: string,
  companionName: string
): Promise<string> {
  const db = await initDatabase(space);
  const now = Date.now();
  const rows = await db.getAllAsync<{ id: string; role: string; content: string; createdAt: string }>(
    `SELECT id, role, content, createdAt
     FROM ai_messages
     WHERE threadId = ? AND (visible_at IS NULL OR visible_at <= ?)
     ORDER BY createdAt ASC;`,
    [threadId, now]
  );
  return JSON.stringify(
    {
      version: 'pixory_im_backup_v1',
      threadId,
      companionName,
      exportedAt: new Date().toISOString(),
      messages: rows,
    },
    null,
    2
  );
}

export async function importImThreadMessages(
  space: PixorySpace,
  threadId: string,
  jsonString: string
): Promise<number> {
  const parsed = JSON.parse(jsonString);
  if (!Array.isArray(parsed.messages)) {
    throw new Error('导入文件格式不合法：缺少 messages 数组');
  }

  const db = await initDatabase(space);
  let count = 0;
  await db.withTransactionAsync(async () => {
    for (const m of parsed.messages) {
      if (!m.id || !m.role || !m.content) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO ai_messages (
          id, threadId, role, content, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, 'completed', ?, ?);`,
        [m.id, threadId, m.role, m.content, m.createdAt || new Date().toISOString(), new Date().toISOString()]
      );
      count += 1;
    }
  });

  return count;
}
