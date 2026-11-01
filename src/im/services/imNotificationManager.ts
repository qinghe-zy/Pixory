/**
 * IM Companion Notification & Background Alarm Manager (系统通知与后台精准闹钟调度器)
 *
 * 核心职责：
 * 1. Android 13+ POST_NOTIFICATIONS 运行时权限检测与请求；
 * 2. 调度/撤回 Android 系统级精准闹钟 (AlarmManager.setExactAndAllowWhileIdle)，支撑杀进程后的准时唤醒；
 * 3. Headless 后台闹钟处理：到期后将 SQLite 中的 staged 预埋信封晋升为 delivered 显影气泡。
 */

import { Platform, PermissionsAndroid, Linking } from 'react-native';
import { scheduleDiaryAlarm, cancelDiaryAlarm, postCompanionNotification, cancelCompanionNotification } from '../../native/pixoryMediaModule';
import { initDatabase, type PixorySpace } from '../../database/index';
import { formatImPreviewText } from '../utils/formatImPreviewText';

/**
 * 检查当前设备是否已获得系统通知权限
 * Android 12 及以下（API < 33）在安装时即默认授予
 */
export async function checkNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 33) return true;

  try {
    return await PermissionsAndroid.check(
      'android.permission.POST_NOTIFICATIONS' as any
    );
  } catch {
    return false;
  }
}

/**
 * 申请 Android 13+ (API 33+) 运行时通知权限
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 33) return true;

  try {
    const granted = await PermissionsAndroid.request(
      'android.permission.POST_NOTIFICATIONS' as any,
      {
        title: '开启伴侣关怀通知',
        message: 'Pixory 需要通知权限，以便在应用关闭后准时接收伴侣的主动问候与关怀。',
        buttonPositive: '开启',
        buttonNegative: '暂不',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * 跳转至系统应用设置页（供用户手动开启被禁用的通知）
 */
export function openAppNotificationSettings(): void {
  void Linking.openSettings();
}

/**
 * 为特定的伴聊会话调度后台精准闹钟
 * 无论 App 是否被杀，操作系统内核到期时都会唤起闹钟服务
 */
export async function scheduleStagedMessageAlarm(
  threadId: string,
  visibleAtMs: number,
  space: PixorySpace = 'normal'
): Promise<boolean> {
  if (space === 'personal') return false;
  if (Platform.OS !== 'android') return false;
  if (visibleAtMs <= Date.now()) return false;

  try {
    const jobId = `im_staged_${threadId}`;
    const result = await scheduleDiaryAlarm(visibleAtMs, jobId);
    return result === 'exact' || result === 'inexact';
  } catch {
    return false;
  }
}

/**
 * 取消指定会话的未触发短时预埋闹钟（当用户主动发言或进入会话时调用）
 */
export async function cancelStagedMessageAlarm(threadId: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const jobId = `im_staged_${threadId}`;
    return await cancelDiaryAlarm(jobId);
  } catch {
    return false;
  }
}

/**
 * 为特定的伴聊会话调度后台长时预约主动唤醒闹钟 (Tier 2 PING)
 * 隐私铁律：私密空间 (personal) 严禁注册系统后台唤醒闹钟，仅在解锁态内静默追平
 */
export async function scheduleProactivePingAlarm(
  threadId: string,
  targetTimestamp: number,
  space: PixorySpace = 'normal'
): Promise<boolean> {
  if (space === 'personal') return false;
  if (Platform.OS !== 'android') return false;
  if (targetTimestamp <= Date.now()) return false;

  try {
    const jobId = `im_ping_${threadId}`;
    const result = await scheduleDiaryAlarm(targetTimestamp, jobId);
    return result === 'exact' || result === 'inexact';
  } catch {
    return false;
  }
}

/**
 * 取消指定会话的预约主动唤醒闹钟
 */
export async function cancelProactivePingAlarm(threadId: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const jobId = `im_ping_${threadId}`;
    return await cancelDiaryAlarm(jobId);
  } catch {
    return false;
  }
}

/**
 * Headless JS 后台任务处理器：当 AlarmManager 触发时由 Android 系统在后台静默执行
 * 隐私边界铁律：Headless 后台任务仅允许访问普通空间 ('normal')，严禁在锁定态触碰 'personal' 数据库！
 * - im_staged_${threadId}: 将到期的预埋气泡晋升为 delivered 显影状态
 * - im_ping_${threadId}: 调起 executeWakeupGeneration 完成大模型后台生成并写入数据库
 */
export async function handleImAlarmHeadless(jobId: string): Promise<void> {
  const space: PixorySpace = 'normal';

  if (jobId.startsWith('im_staged_')) {
    const threadId = jobId.replace('im_staged_', '').trim();
    if (!threadId) return;

    const now = Date.now();

    try {
      const db = await initDatabase(space);
      // 1. 查找是否存在该会话且已到期的 staged 消息
      const stagedRows = await db.getAllAsync<{ id: string; content: string; visible_at: number }>(
        `SELECT id, content, visible_at FROM ai_messages
         WHERE threadId = ? AND delivery_status = 'staged' AND visible_at <= ?
         ORDER BY visible_at ASC`,
        [threadId, now]
      );

      if (stagedRows.length > 0) {
        // 2. 将预埋消息晋升为已送达显影状态
        await db.runAsync(
          `UPDATE ai_messages
           SET delivery_status = 'delivered', status = 'completed'
           WHERE threadId = ? AND delivery_status = 'staged' AND visible_at <= ?`,
          [threadId, now]
        );

        const lastRow = stagedRows[stagedRows.length - 1];
        const cleanPreview = formatImPreviewText(lastRow.content, '').slice(0, 80);

        // 3. 递增未回复计数、未读红点计数并更新最后一条预览
        await db.runAsync(
          `UPDATE ai_threads
           SET consecutive_unreplied_count = COALESCE(consecutive_unreplied_count, 0) + 1,
               im_unread_count = COALESCE(im_unread_count, 0) + ?,
               lastMessagePreview = ?,
               updatedAt = ?
           WHERE id = ?`,
          [stagedRows.length, cleanPreview, new Date(now).toISOString(), threadId]
        );

        // 4. 发送系统通知（仅普通空间，严格遵守隐私规范）
        try {
          const threadRow = await db.getFirstAsync<{ title?: string }>(
            'SELECT title FROM ai_threads WHERE id = ?',
            [threadId]
          );
          const companionTitle = threadRow?.title || 'AI 伴侣';
          await postCompanionNotification(threadId, companionTitle, cleanPreview);
        } catch {}
      }
    } catch {
      // 空间未初始化或不存在该线程，静默容错
    }
    return;
  }

  if (jobId.startsWith('im_ping_')) {
    const threadId = jobId.replace('im_ping_', '').trim();
    if (!threadId) return;

    const { executeWakeupGeneration } = await import('./imWakeupGenerationService');
    try {
      await executeWakeupGeneration(space, threadId, { isHeadless: true });
    } catch {
      // 静默容错
    }
    return;
  }
}
