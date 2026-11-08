import { initDatabase, type PixorySpace } from '../../database';
import { voiceRepository } from '../../database/repositories/voiceRepository';
import type { ImMessage } from '../types';

export type ImRelationshipPreset =
  | 'close_friend'
  | 'romantic'
  | 'friend'
  | 'mentor'
  | 'childhood_sweetheart'
  | 'rival_partner'
  | 'natural'
  | 'sweet'
  | 'partner'
  | 'gentle'
  | 'custom';

export type ImReplyStyleGear =
  | 'balanced'
  | 'empathetic'
  | 'playful'
  | 'tsundere'
  | 'concise'
  | 'lively'
  | 'clingy_sweet'
  | 'concise_cool';

export type ImProactiveFrequencyGear =
  | 'balanced'
  | 'frequent'
  | 'calm'
  | 'silent'
  | 'quiet'
  | 'standard'
  | 'clingy';

export type ImBubbleSkinPreset =
  | 'wechat_green'
  | 'warm_amber'
  | 'mist_blue'
  | 'rose_quartz'
  | 'ink_mono'
  | (string & {});

export interface ImCompanionMilestone {
  id: string;
  label: string;
  dateKey: string;
}

export interface ImCompanionPersonalization {
  userNickname?: string | null;
  companionCallName?: string | null;
  userPersonaNote?: string | null;
  relationshipPreset?: ImRelationshipPreset | null;
  customRelationshipNote?: string | null;
  replyStyleGear?: ImReplyStyleGear | null;
  proactiveFrequencyGear?: ImProactiveFrequencyGear | null;
  bubbleSkinPreset?: ImBubbleSkinPreset | null;
  wallpaperScrimOpacity?: number | null;
  milestones?: ImCompanionMilestone[];
}

export interface ImThreadSettings {
  backgroundImageUri?: string | null;
  nudgeText?: string | null;
  contextWindowN?: number;
  heartbeatEnabled?: boolean;
  proactiveEnabled?: boolean;
  providerId?: string | null;
  modelId?: string | null;
  dndOverrideEnabled?: boolean | null;
  dndStartTime?: string | null;
  dndEndTime?: string | null;
  personalization?: ImCompanionPersonalization | null;
  showThoughtBubble?: boolean;
  voiceReplyEnabled?: boolean;
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
    dnd_override_enabled: number | null;
    dnd_start_time: string | null;
    dnd_end_time: string | null;
    im_settings_json: string | null;
  }>(
    `SELECT background_image_uri, nudge_text, context_window_n, heartbeat_enabled, proactive_enabled, providerId, modelId,
            dnd_override_enabled, dnd_start_time, dnd_end_time, im_settings_json
     FROM ai_threads WHERE id = ? LIMIT 1;`,
    [threadId]
  );

  let personalization: ImCompanionPersonalization | null = null;
  let showThoughtBubble = true;
  let voiceReplyEnabled = true;
  if (row?.im_settings_json) {
    try {
      const parsed = JSON.parse(row.im_settings_json);
      if (parsed && typeof parsed.personalization === 'object') {
        personalization = parsed.personalization;
      }
      if (parsed && typeof parsed.showThoughtBubble === 'boolean') {
        showThoughtBubble = parsed.showThoughtBubble;
      }
      if (parsed && typeof parsed.voiceReplyEnabled === 'boolean') {
        voiceReplyEnabled = parsed.voiceReplyEnabled;
      }
    } catch {}
  }

  return {
    backgroundImageUri: row?.background_image_uri ?? null,
    nudgeText: row?.nudge_text ?? '的小脑袋',
    contextWindowN: row?.context_window_n ?? 20,
    heartbeatEnabled: row?.heartbeat_enabled !== 0,
    proactiveEnabled: row?.proactive_enabled !== 0,
    providerId: row?.providerId ?? null,
    modelId: row?.modelId ?? null,
    dndOverrideEnabled: row?.dnd_override_enabled !== null && row?.dnd_override_enabled !== undefined ? row.dnd_override_enabled === 1 : null,
    dndStartTime: row?.dnd_start_time ?? null,
    dndEndTime: row?.dnd_end_time ?? null,
    personalization,
    showThoughtBubble,
    voiceReplyEnabled,
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
  if (settings.dndOverrideEnabled !== undefined) {
    fields.push('dnd_override_enabled = ?');
    values.push(settings.dndOverrideEnabled === null ? null : (settings.dndOverrideEnabled ? 1 : 0));
  }
  if (settings.dndStartTime !== undefined) {
    fields.push('dnd_start_time = ?');
    values.push(settings.dndStartTime);
  }
  if (settings.dndEndTime !== undefined) {
    fields.push('dnd_end_time = ?');
    values.push(settings.dndEndTime);
  }
  if (
    settings.personalization !== undefined ||
    settings.showThoughtBubble !== undefined ||
    settings.voiceReplyEnabled !== undefined
  ) {
    const existingRow = await db.getFirstAsync<{ im_settings_json: string | null }>(
      'SELECT im_settings_json FROM ai_threads WHERE id = ? LIMIT 1;',
      [threadId]
    );
    let parsedSettings: Record<string, any> = {};
    if (existingRow?.im_settings_json) {
      try {
        parsedSettings = JSON.parse(existingRow.im_settings_json) || {};
      } catch {}
    }
    if (settings.personalization !== undefined) {
      parsedSettings.personalization = settings.personalization;
    }
    if (settings.showThoughtBubble !== undefined) {
      parsedSettings.showThoughtBubble = settings.showThoughtBubble;
    }
    if (settings.voiceReplyEnabled !== undefined) {
      parsedSettings.voiceReplyEnabled = settings.voiceReplyEnabled;
    }
    fields.push('im_settings_json = ?');
    values.push(JSON.stringify(parsedSettings));
  }

  if (fields.length > 0) {
    values.push(threadId);
    await db.runAsync(`UPDATE ai_threads SET ${fields.join(', ')} WHERE id = ?;`, values);
  }

  // 同步更新 voice_bindings 表，彻底消除专属相处定制与侧栏设置的开关状态脱节
  if (settings.voiceReplyEnabled !== undefined) {
    try {
      const existingBinding = await voiceRepository.getBinding(db, 'thread_im', threadId);
      if (existingBinding?.voiceBubbleEnabled !== settings.voiceReplyEnabled) {
        await voiceRepository.setBinding(db, {
          scopeType: 'thread_im',
          scopeId: threadId,
          presetId: existingBinding?.presetId ?? null,
          rateOverride: existingBinding?.rateOverride ?? null,
          pitchOverride: existingBinding?.pitchOverride ?? null,
          voiceBubbleEnabled: settings.voiceReplyEnabled,
          autoReadEnabled: existingBinding?.autoReadEnabled ?? null,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // 容错降级
    }
  }
}

/**
 * 批量更新当前空间下所有伴聊会话的模型语音回复开关
 * 聊天设置中「一键开启/关闭所有会话语音回复」核心复用此接口
 */
export async function setVoiceReplyEnabledForAll(
  space: PixorySpace,
  enabled: boolean
): Promise<number> {
  const db = await initDatabase(space);
  const rows = await db.getAllAsync<{ id: string; im_settings_json: string | null }>(
    'SELECT id, im_settings_json FROM ai_threads;'
  );
  let updatedCount = 0;
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      let parsedSettings: Record<string, any> = {};
      if (row.im_settings_json) {
        try {
          parsedSettings = JSON.parse(row.im_settings_json) || {};
        } catch {}
      }
      parsedSettings.voiceReplyEnabled = enabled;
      await db.runAsync(
        'UPDATE ai_threads SET im_settings_json = ? WHERE id = ?;',
        [JSON.stringify(parsedSettings), row.id]
      );
      updatedCount++;
    }
    // 同步批量更新 voice_bindings 中的所有伴聊会话开关，确保状态绝对统一
    try {
      await db.runAsync(
        `UPDATE voice_bindings
         SET voice_bubble_enabled = ?, updated_at = ?
         WHERE scope_type = 'thread_im';`,
        [enabled ? 1 : 0, new Date().toISOString()]
      );
    } catch {
      // 容错降级
    }
  });
  return updatedCount;
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
