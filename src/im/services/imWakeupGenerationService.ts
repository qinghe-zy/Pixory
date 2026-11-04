/**
 * IM Companion Wakeup Generation Service (伴侣预约主动唤醒与后台静默生成服务)
 *
 * 核心职责：
 * 1. 解耦于任何特定 UI 组件的后台/离线追平静默生成（无需通知权限亦 100% 落库执行）；
 * 2. 处理 Android Headless Alarm / GlobalHeartbeatEngine 触发的主动唤醒与杀后台补偿；
 * 3. 作息感知自钳位：Headless 深夜唤醒 (23:30 ~ 07:00) 顺延至次晨 07:30，前台补偿则智能恢复；
 * 4. 完整装填五层连续记忆快照 (Layer 1~5)，修复 baseUrl/apiKey 透传与并发幂等互斥；
 * 5. 生成结果落盘 ai_messages，递增未读红点计数并自动接力下一阶梯退避闹钟。
 */

import { initDatabase, type PixorySpace } from '../../database';
import { streamClient } from '../../core/llm-transport/streamClient';
import { getActiveProviderConfig } from '../../core/llm-transport/secureApiKey';
import type { CompanionMemoryRecord, MemoryRecallCandidate } from '../../core/memory/memoryTypes';
import {
  getPendingPing,
  clearPendingPing,
  postponePendingPing,
  savePendingPing,
  getVisibleImMessages,
  getContextMessagesFromAnchor,
  consumeThreadPendingDiaryHook,
  insertImMessage,
  updateThreadLivingState,
} from '../repository/imThreadRepository';
import type { ImCompanionPersonalization } from '../repository/imSettingsRepository';
import { resolveEffectiveDnd, DEFAULT_DND_CONFIG, type EffectiveDndConfig } from '../heartbeat/imDndGuard';
import { HIBERNATION_CUTOFF_MS } from '../heartbeat/proactivePacingGuard';
import { buildChatPayload } from '../engine/imContextBuilder';
import { parseStatusTag, parsePingTag } from '../engine/imTagParser';
import { stripMetaTags } from '../engine/tagAwareStreamParser';
import { sanitizeCompanionBubble } from '../engine/humanizeOutputGate';
import { advanceLivingState } from '../engine/imAgencyEngine';
import { isTimeInSleepPeriod, getNextMorning730 } from '../engine/naturalTimeParser';
import { planFallbackProactivePing } from '../engine/imProactiveFallbackPlanner';
import { resolveCompanionRolePrompt, type CompanionRoleCardSnapshot } from '../engine/imRolePromptResolver';
import { scheduleProactivePingAlarm } from './imNotificationManager';
import { GlobalHeartbeatEngine } from '../heartbeat/globalHeartbeatEngine';
import type { ImMessage, ImCompanionLivingState } from '../types';

export { resolveCompanionRolePrompt };

// 模块级提升的分句正则常量 (js-hoist-regexp)
const BR_SPLIT_REGEX = /\[br\s*\/?\]|<\/?br\s*\/?>/i;
const THINK_BLOCK_MATCH_REGEX = /<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/i;
const THINK_BLOCK_STRIP_REGEX = /<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi;
const HEADLESS_GENERATION_TIMEOUT_MS = 35000;

// 并发唤醒互斥锁与用户抢占取消表
const inFlightWakeups = new Map<string, AbortController>();

export function cancelInFlightWakeup(space: PixorySpace, threadId: string): void {
  const key = `${space}:${threadId}`;
  const ctrl = inFlightWakeups.get(key);
  if (ctrl) {
    ctrl.abort();
    inFlightWakeups.delete(key);
  }
}

export function cancelAllWakeupsForSpace(space: PixorySpace): void {
  const prefix = `${space}:`;
  for (const [key, ctrl] of Array.from(inFlightWakeups.entries())) {
    if (key.startsWith(prefix)) {
      ctrl.abort();
      inFlightWakeups.delete(key);
    }
  }
}

export function isWakeupInFlight(space: PixorySpace, threadId: string): boolean {
  return inFlightWakeups.has(`${space}:${threadId}`);
}

interface ThreadRow {
  id: string;
  roleCardId: string | null;
  providerId?: string | null;
  modelId?: string | null;
  proactive_enabled?: number | null;
  context_window_n: number | null;
  living_state_json: string | null;
  consecutive_unreplied_count: number | null;
  last_user_interaction_at?: number | null;
  dnd_override_enabled?: number | null;
  dnd_start_time?: string | null;
  dnd_end_time?: string | null;
  im_settings_json?: string | null;
}

export async function executeWakeupGeneration(
  space: PixorySpace,
  threadId: string,
  options?: { isHeadless?: boolean; now?: number }
): Promise<boolean> {
  // 隐私边界守卫：私密空间在后台 Headless 或未解锁状态下严禁打开数据库或发起模型请求
  if (space === 'personal') {
    if (options?.isHeadless === true) return false;
    if (
      typeof GlobalHeartbeatEngine.shared.isPersonalSpaceUnlocked === 'function' &&
      !GlobalHeartbeatEngine.shared.isPersonalSpaceUnlocked()
    ) {
      return false;
    }
  }

  const lockKey = `${space}:${threadId}`;
  if (inFlightWakeups.has(lockKey)) {
    return false;
  }

  const now = options?.now || Date.now();
  const ping = await getPendingPing(space, threadId);
  if (!ping || ping.pendingPingAt > now) {
    return false;
  }

  const db = await initDatabase(space);
  const thread = await db.getFirstAsync<ThreadRow>(
    `SELECT id, roleCardId, providerId, modelId, proactive_enabled, context_window_n,
            living_state_json, consecutive_unreplied_count, last_user_interaction_at,
            dnd_override_enabled, dnd_start_time, dnd_end_time, im_settings_json
     FROM ai_threads WHERE id = ? LIMIT 1;`,
    [threadId]
  );

  // 解析会话级免打扰与专属个性化契约
  let effectiveDnd: EffectiveDndConfig = DEFAULT_DND_CONFIG;
  if (thread?.dnd_override_enabled !== null && thread?.dnd_override_enabled !== undefined) {
    effectiveDnd = {
      enabled: Boolean(thread.dnd_override_enabled),
      startTime: thread.dnd_start_time || DEFAULT_DND_CONFIG.startTime,
      endTime: thread.dnd_end_time || DEFAULT_DND_CONFIG.endTime,
      source: 'custom_override',
    };
  }

  let personalization: ImCompanionPersonalization | null = null;
  if (thread?.im_settings_json) {
    try {
      personalization = JSON.parse(thread.im_settings_json);
    } catch {}
  }

  // 1. 作息感知自校准：
  // - 若为后台 Headless 唤醒，或原定闹钟本身落在睡眠期，顺延至次晨醒来时刻；
  // - 若为用户主动打开 App 触发的离线追平 (isHeadless === false) 且原闹钟在白天/傍晚，立即静默补偿生成！
  const isForegroundCatchUp = options?.isHeadless === false;
  if (isTimeInSleepPeriod(now, effectiveDnd) && (!isForegroundCatchUp || isTimeInSleepPeriod(ping.pendingPingAt, effectiveDnd))) {
    const nextMorning = getNextMorning730(now, effectiveDnd);
    await postponePendingPing(space, threadId, nextMorning);
    void scheduleProactivePingAlarm(threadId, nextMorning, space);
    return false;
  }

  if (!thread || thread.proactive_enabled === 0) {
    await clearPendingPing(space, threadId);
    return false;
  }

  // 2. 72小时断连守卫：只有当超过 72 小时无任何互动时，才进入休眠
  const elapsedSinceUser = thread.last_user_interaction_at ? now - thread.last_user_interaction_at : 0;
  if (elapsedSinceUser >= HIBERNATION_CUTOFF_MS) {
    await clearPendingPing(space, threadId);
    return false;
  }

  let livingState: ImCompanionLivingState | undefined;
  if (thread.living_state_json) {
    try {
      livingState = JSON.parse(thread.living_state_json) as ImCompanionLivingState;
    } catch {}
  }

  // 若伴侣处于 sleeping 且当前仍在睡眠窗，顺延至次晨
  if (livingState?.activityLoad === 'sleeping' && (!isForegroundCatchUp || isTimeInSleepPeriod(now, effectiveDnd))) {
    const nextMorning = getNextMorning730(now, effectiveDnd);
    await postponePendingPing(space, threadId, nextMorning);
    void scheduleProactivePingAlarm(threadId, nextMorning, space);
    return false;
  }

  let role: CompanionRoleCardSnapshot | null = null;
  if (thread.roleCardId) {
    role = await db.getFirstAsync<CompanionRoleCardSnapshot>(
      `SELECT name, prompt, description, sourceJson FROM ai_role_cards WHERE id = ? LIMIT 1;`,
      [thread.roleCardId]
    );
  }

  const { rolePrompt, companionName, personaAnchor } = resolveCompanionRolePrompt(role, undefined, personalization);
  const windowN = thread.context_window_n || 20;

  // 3. 并行加载完整五层记忆与世代快照 (async-parallel，容错兼容轻量测试 Mock)
  let epochSlotJson: string | undefined;
  let epochSummaryJson: string | undefined;
  let anchorMessageId: string | undefined;
  let l1Slots: CompanionMemoryRecord[] = [];
  let l1Summary: CompanionMemoryRecord | null = null;
  let coreFacts: CompanionMemoryRecord[] = [];
  let recalledMemories: MemoryRecallCandidate[] = [];
  let pendingDiaryHook: string | null = null;

  try {
    const diaryHookPromise =
      typeof consumeThreadPendingDiaryHook === 'function'
        ? consumeThreadPendingDiaryHook(space, threadId).catch(() => null)
        : Promise.resolve(null);

    if (thread.roleCardId) {
      const [{ imEpochRepository }, { memoryRepository }, { retrieveRelevantMemories }] = await Promise.all([
        import('../repository/imEpochRepository'),
        import('../../core/memory/memoryRepository'),
        import('../../core/memory/zeroVectorRetriever'),
      ]);
      const [epochState, slots, summaries, facts, recalled, diaryHook] = await Promise.all([
        imEpochRepository.getOrCreateState(space, threadId, thread.roleCardId),
        memoryRepository.listMemories(thread.roleCardId, space, 'L1_SLOT'),
        memoryRepository.listMemories(thread.roleCardId, space, 'L1_SUMMARY'),
        memoryRepository.listCoreProfileFacts(thread.roleCardId, space, 8),
        ping.intent ? retrieveRelevantMemories(thread.roleCardId, space, ping.intent, 3) : Promise.resolve([]),
        diaryHookPromise,
      ]);
      epochSlotJson = epochState.active_slot_json;
      epochSummaryJson = epochState.active_summary_json;
      anchorMessageId = epochState.active_anchor_msg_id || undefined;
      l1Slots = slots;
      l1Summary = summaries[0] ?? null;
      coreFacts = facts;
      recalledMemories = recalled;
      pendingDiaryHook = diaryHook;
    } else {
      pendingDiaryHook = await diaryHookPromise;
    }
  } catch {
    // 轻量测试环境无完整表时平滑降级
  }

  let recentMessages: ImMessage[] = [];
  if (anchorMessageId && typeof getContextMessagesFromAnchor === 'function') {
    recentMessages = await getContextMessagesFromAnchor(space, threadId, anchorMessageId, Math.max(windowN * 4, 120)).catch(() => []);
  }
  if (recentMessages.length === 0) {
    recentMessages = (await getVisibleImMessages(space, threadId, Math.max(windowN * 3, 60))).reverse();
  }

  // 若杀后台逾期较久后在深夜补偿白天闹钟，时间锚定为原定闹钟时刻以保持作息逻辑自洽
  const lastMsgTime = recentMessages.length > 0 && recentMessages[recentMessages.length - 1]?.createdAt
    ? (Date.parse(recentMessages[recentMessages.length - 1].createdAt) || 0)
    : 0;
  const effectiveContextNow =
    isForegroundCatchUp && isTimeInSleepPeriod(now) && !isTimeInSleepPeriod(ping.pendingPingAt) && ping.pendingPingAt > lastMsgTime
      ? ping.pendingPingAt
      : now;

  const payload = buildChatPayload(
    {
      rolePrompt,
      roleName: companionName,
      l1Slots,
      l1Summary,
      coreFacts,
      epochSlotJson,
      epochSummaryJson,
      recalledMemories,
      pendingDiaryHook,
      historyMessages: recentMessages,
      livingState,
      now: effectiveContextNow,
      isWakeupPing: true,
      pingIntent: ping.intent,
      milestones: personalization?.milestones,
      windowN,
      anchorMessageId,
      personaAnchor,
    },
    ''
  );

  // 4. 获取会话级 Provider 配置并完整透传 baseUrl + apiKey 调用大模型
  const providerConfig = await getActiveProviderConfig(space, thread.providerId, thread.modelId);
  if (!providerConfig || !providerConfig.apiKey) {
    await clearPendingPing(space, threadId);
    return false;
  }

  let fullRawResponse = '';
  const abortController = new AbortController();
  inFlightWakeups.set(lockKey, abortController);
  const timeoutId = setTimeout(() => abortController.abort(), HEADLESS_GENERATION_TIMEOUT_MS);

  try {
    const stream = streamClient.streamText(payload, {
      providerId: providerConfig.providerId,
      modelId: thread.modelId || providerConfig.modelId,
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey,
      abortSignal: abortController.signal,
    });

    for await (const chunk of stream) {
      fullRawResponse += chunk;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && !inFlightWakeups.has(lockKey)) {
      // 用户主动发消息抢占取消，直接退出不覆盖用户状态
      return false;
    }
    // 离线/弱网保底：若 retryCount < 2，顺延 10 分钟重试
    if (ping.retryCount < 2) {
      const retryAt = now + 10 * 60 * 1000;
      await postponePendingPing(space, threadId, retryAt);
      void scheduleProactivePingAlarm(threadId, retryAt, space);
    } else {
      await clearPendingPing(space, threadId);
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
    inFlightWakeups.delete(lockKey);
  }

  // 5. 解析伴侣状态流转 [STATUS: ...]
  const statusUpdate = parseStatusTag(fullRawResponse);
  let updatedLiving = livingState;
  if (statusUpdate) {
    updatedLiving = advanceLivingState(livingState, statusUpdate, effectiveContextNow);
    void updateThreadLivingState(space, threadId, updatedLiving);
  }

  // 6. 解析新预约的主动闹钟 [PING: ...]
  const nextPing = parsePingTag(fullRawResponse, now, updatedLiving, effectiveDnd);

  // 7. 剥离深度思考块与切分短句气泡并持久化落库
  let thoughtText = '';
  let textWithoutThought = fullRawResponse;
  const thinkMatch = fullRawResponse.match(THINK_BLOCK_MATCH_REGEX);
  if (thinkMatch) {
    thoughtText = thinkMatch[1].trim();
    textWithoutThought = fullRawResponse.replace(THINK_BLOCK_STRIP_REGEX, '');
  }

  const rawSentences = textWithoutThought.split(BR_SPLIT_REGEX);
  const cleanSentences = rawSentences
    .map((s) => sanitizeCompanionBubble(stripMetaTags(s)))
    .filter((s) => s.length > 0 && s !== '[PASS]');

  if (cleanSentences.length === 0 && !thoughtText) {
    await clearPendingPing(space, threadId);
    return false;
  }

  const baseMsgTime = Math.max(effectiveContextNow, lastMsgTime + 1000);
  const burstGroupId = `burst_wakeup_${baseMsgTime}`;

  // 若模型包含了深度思考内容，以独立的思考气泡率先入库（默认闭合）
  if (thoughtText.length > 0) {
    const thoughtMsg: ImMessage = {
      id: `im_msg_${baseMsgTime}_thought_w`,
      threadId,
      burstGroupId,
      role: 'assistant',
      content: thoughtText,
      type: 'thought',
      status: 'sent',
      deliveryStatus: 'delivered',
      visibleAt: null,
      metadata: {
        isThinking: false,
        durationSeconds: 2,
        isCollapsed: true, // 默认单行闭合
      },
      createdAt: new Date(baseMsgTime).toISOString(),
    };
    await insertImMessage(space, thoughtMsg);
  }

  for (let i = 0; i < cleanSentences.length; i++) {
    const sentence = cleanSentences[i];
    const msg: ImMessage = {
      id: `im_msg_${baseMsgTime}_${i}_w`,
      threadId,
      burstGroupId,
      role: 'assistant',
      content: sentence,
      type: 'text',
      status: 'sent',
      deliveryStatus: 'delivered',
      visibleAt: null,
      createdAt: new Date(baseMsgTime + (i + 1) * 500).toISOString(),
    };
    await insertImMessage(space, msg);
  }

  // 8. 递增未回复计数与未读红点计数（若用户当前未停留在该聊天窗口）
  const newUnrepliedCount = (thread.consecutive_unreplied_count ?? 0) + 1;
  const isThreadActivelyOpen =
    typeof GlobalHeartbeatEngine.shared.isThreadActivelyOpen === 'function' &&
    GlobalHeartbeatEngine.shared.isThreadActivelyOpen(space, threadId);
  const unreadDelta = isThreadActivelyOpen ? 0 : cleanSentences.length;

  await db.runAsync(
    `UPDATE ai_threads
     SET consecutive_unreplied_count = ?,
         im_unread_count = COALESCE(im_unread_count, 0) + ?,
         updatedAt = ?
     WHERE id = ?;`,
    [newUnrepliedCount, unreadDelta, new Date(baseMsgTime).toISOString(), threadId]
  );

  // 9. 先清除已完成的本次闹钟，再按模型显式 [PING] 或三阶退避兜底规划器挂载下一轮闹钟
  await clearPendingPing(space, threadId);
  if (typeof savePendingPing === 'function') {
    const effectiveNextPing =
      nextPing ||
      (thread.proactive_enabled !== undefined
        ? planFallbackProactivePing({
            consecutiveUnreplied: newUnrepliedCount,
            lastUserInteractionAt: thread.last_user_interaction_at ?? now,
            livingState: updatedLiving,
            now,
            dndConfig: effectiveDnd,
            proactiveFrequencyGear: personalization?.proactiveFrequencyGear,
          })
        : null);

    if (effectiveNextPing) {
      await savePendingPing(space, threadId, effectiveNextPing.targetTimestamp, effectiveNextPing.intent);
      void scheduleProactivePingAlarm(threadId, effectiveNextPing.targetTimestamp, space);
    }
  }

  // 10. 广播全局心跳事件（刷新会话列表预览与未读红点），并在普通空间且非当前会话窗口时发送系统通知
  GlobalHeartbeatEngine.shared.notifyListeners(threadId, space);
  if (unreadDelta > 0 && space === 'normal') {
    try {
      const { postCompanionNotificationSafely } = await import('./imNotificationManager');
      const previewText = cleanSentences.join(' ').slice(0, 80);
      void postCompanionNotificationSafely(space, threadId, companionName, previewText);
    } catch {}
  }

  return true;
}
