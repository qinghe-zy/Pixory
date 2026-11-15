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
import { settingsRepository } from '../../database/repositories/settingsRepository';
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
        title: '开启关怀通知',
        message: 'Pixory 需要通知权限，以便在应用关闭后准时接收主动问候与关怀。',
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

function isWithinDndTime(now: Date, dndStart: string, dndEnd: string): boolean {
  try {
    const [startH, startM] = dndStart.split(':').map((v) => parseInt(v, 10) || 0);
    const [endH, endM] = dndEnd.split(':').map((v) => parseInt(v, 10) || 0);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch {
    return false;
  }
}

/**
 * 安全格式化并发送伴侣系统通知（尊重通知管理、防窥脱敏与夜间勿扰偏好）
 */
export async function postCompanionNotificationSafely(
  space: PixorySpace,
  threadId: string,
  companionTitle: string,
  content: string
): Promise<boolean> {
  if (space === 'personal') return false;
  if (Platform.OS !== 'android') return false;

  try {
    const db = await initDatabase(space);
    const settings = await settingsRepository.getNotificationSettings(db);
    if (!settings.enabled) return false;

    if (settings.dndEnabled && isWithinDndTime(new Date(), settings.dndStart, settings.dndEnd)) {
      return false;
    }

    const effectiveTitle = settings.showAvatar ? (companionTitle || '新消息') : '新消息';
    const effectiveContent = settings.showContent ? (content || '给你发送了一条新消息') : '你收到了一条新消息';

    return await postCompanionNotification(threadId, effectiveTitle, effectiveContent);
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
  // 隐私铁律：后台 Headless 闹钟仅允许处理 normal 空间，严禁接触 personal 空间数据库或发通知
  const space: PixorySpace = 'normal';
  if ((space as string) === 'personal') return;

  if (jobId.startsWith('im_staged_')) {
    const threadId = jobId.replace('im_staged_', '').trim();
    if (!threadId) return;

    const now = Date.now();

    try {
      const [{ getThreadLivingState, revealPendingMessages }, heartbeatModule] = await Promise.all([
        import('../repository/imThreadRepository'),
        import('../heartbeat/globalHeartbeatEngine').catch(() => null),
      ]);
      const heartbeatEngine = heartbeatModule?.GlobalHeartbeatEngine?.shared;
      const isOpen =
        typeof heartbeatEngine?.isThreadActivelyOpen === 'function'
          ? heartbeatEngine.isThreadActivelyOpen(space, threadId)
          : false;

      const livingState = await getThreadLivingState(space, threadId).catch(() => null);
      const revealedCount = await revealPendingMessages(space, threadId, now, livingState, {
        incrementUnread: !isOpen,
      });

      if (revealedCount > 0) {
        heartbeatEngine?.notifyListeners?.(threadId, space);

        if (!isOpen) {
          try {
            const db = await initDatabase(space);
            const threadRow = await db.getFirstAsync<{ title?: string; lastMessagePreview?: string }>(
              'SELECT title, lastMessagePreview FROM ai_threads WHERE id = ?',
              [threadId]
            );
            const companionTitle = threadRow?.title || '新消息';
            const cleanPreview = formatImPreviewText(
              threadRow?.lastMessagePreview || '给你发送了一条新消息',
              '给你发送了一条新消息'
            ).slice(0, 80);
            await postCompanionNotificationSafely(space, threadId, companionTitle, cleanPreview);
          } catch {}
        }
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
