/**
 * IM Background Stream & Interrupted Reply Recovery Service
 * (伴侣后台脱钩流式守护与杀后台断联补回服务)
 *
 * 核心职责：
 * 1. 管理全局会话级 AbortController 表，使页面退出 (Unmount) 或退至后台不会中断正在生成的伴侣回复；
 * 2. 仅在用户主动抢占操作（发新消息、发图、修改重发、清空聊天）时精确熔断当前流；
 * 3. 当系统强杀进程导致“用户已发消息但伴侣未完成回复”时，下次启动由 GlobalHeartbeatEngine 静默补回，
 *    无需通知权限亦 100% 落库并点亮未读红点。
 */

import { initDatabase, type PixorySpace } from '../../database';
import { streamClient } from '../../core/llm-transport/streamClient';
import { getActiveProviderConfig } from '../../core/llm-transport/secureApiKey';
import type { CompanionMemoryRecord, MemoryRecallCandidate } from '../../core/memory/memoryTypes';
import {
  getVisibleImMessages,
  getContextMessagesFromAnchor,
  consumeThreadPendingDiaryHook,
  insertImMessage,
  updateThreadLivingState,
  savePendingPing,
  revealPendingMessages,
} from '../repository/imThreadRepository';
import { buildChatPayload } from '../engine/imContextBuilder';
import { parseStatusTag, parsePingTag } from '../engine/imTagParser';
import { stripMetaTags } from '../engine/tagAwareStreamParser';
import { advanceLivingState } from '../engine/imAgencyEngine';
import { planFallbackProactivePing } from '../engine/imProactiveFallbackPlanner';
import { resolveCompanionRolePrompt, type CompanionRoleCardSnapshot } from '../engine/imRolePromptResolver';
import { scheduleProactivePingAlarm } from './imNotificationManager';
import { isWakeupInFlight, cancelAllWakeupsForSpace } from './imWakeupGenerationService';
import { GlobalHeartbeatEngine } from '../heartbeat/globalHeartbeatEngine';
import { resolveStickerLabel } from '../../components/emoji/StickerSemanticResolver';
import type { ImMessage, ImCompanionLivingState } from '../types';

const BR_SPLIT_REGEX = /\[br\]/i;
const RECOVERY_TIMEOUT_MS = 40000;

const activeStreams = new Map<string, AbortController>();
const detachedRevealTimers = new Map<string, ReturnType<typeof setTimeout>>();
const recoveryBackoffMap = new Map<string, { attempts: number; nextRetryAt: number }>();

function makeStreamKey(space: PixorySpace, threadId: string): string {
  return `${space}:${threadId}`;
}

export function cancelDetachedReveal(space: PixorySpace, threadId: string): void {
  const key = makeStreamKey(space, threadId);
  const existingTimer = detachedRevealTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
    detachedRevealTimers.delete(key);
  }
}

export function scheduleDetachedReveal(
  space: PixorySpace,
  threadId: string,
  targetVisibleAt: number | null | undefined,
  getLivingState?: () => ImCompanionLivingState | null | undefined
): void {
  const key = makeStreamKey(space, threadId);
  cancelDetachedReveal(space, threadId);

  const waitRevealMs = Math.max(80, (targetVisibleAt ?? Date.now()) - Date.now() + 120);
  const timer = setTimeout(() => {
    detachedRevealTimers.delete(key);
    if (
      space === 'personal' &&
      typeof GlobalHeartbeatEngine.shared.isPersonalSpaceUnlocked === 'function' &&
      !GlobalHeartbeatEngine.shared.isPersonalSpaceUnlocked()
    ) {
      return;
    }
    const incrementUnread =
      typeof GlobalHeartbeatEngine.shared.isThreadActivelyOpen === 'function'
        ? !GlobalHeartbeatEngine.shared.isThreadActivelyOpen(space, threadId)
        : true;
    void revealPendingMessages(space, threadId, Date.now(), getLivingState?.(), {
      incrementUnread,
    })
      .then(() => {
        GlobalHeartbeatEngine.shared.notifyListeners(threadId, space);
      })
      .catch(() => {});
  }, waitRevealMs);

  detachedRevealTimers.set(key, timer);
}

export function registerActiveStream(
  space: PixorySpace,
  threadId: string,
  controller: AbortController
): void {
  const key = makeStreamKey(space, threadId);
  const existing = activeStreams.get(key);
  if (existing && existing !== controller) {
    existing.abort();
  }
  cancelDetachedReveal(space, threadId);
  activeStreams.set(key, controller);
}

export function unregisterActiveStream(
  space: PixorySpace,
  threadId: string,
  controller: AbortController
): void {
  const key = makeStreamKey(space, threadId);
  if (activeStreams.get(key) === controller) {
    activeStreams.delete(key);
  }
}

export function abortActiveStream(space: PixorySpace, threadId: string): void {
  const key = makeStreamKey(space, threadId);
  const existing = activeStreams.get(key);
  if (existing) {
    existing.abort();
    activeStreams.delete(key);
  }
  cancelDetachedReveal(space, threadId);
  recoveryBackoffMap.delete(key);
}

export function suspendImSpaceStreams(space: PixorySpace): void {
  const prefix = `${space}:`;
  for (const [key, ctrl] of Array.from(activeStreams.entries())) {
    if (key.startsWith(prefix)) {
      ctrl.abort();
      activeStreams.delete(key);
    }
  }
  for (const [key, timer] of Array.from(detachedRevealTimers.entries())) {
    if (key.startsWith(prefix)) {
      clearTimeout(timer);
      detachedRevealTimers.delete(key);
    }
  }
  for (const key of Array.from(recoveryBackoffMap.keys())) {
    if (key.startsWith(prefix)) {
      recoveryBackoffMap.delete(key);
    }
  }
  cancelAllWakeupsForSpace(space);
}

export function isStreamActive(space: PixorySpace, threadId: string): boolean {
  return activeStreams.has(makeStreamKey(space, threadId));
}

interface ThreadRecoveryRow {
  id: string;
  roleCardId: string | null;
  providerId?: string | null;
  modelId?: string | null;
  proactive_enabled?: number | null;
  context_window_n: number | null;
  living_state_json: string | null;
}

/**
 * 补偿生成因系统强杀进程而中断的用户消息回复
 */
export async function recoverInterruptedUserReply(
  space: PixorySpace,
  threadId: string,
  now: number = Date.now()
): Promise<boolean> {
  if (
    space === 'personal' &&
    typeof GlobalHeartbeatEngine.shared.isPersonalSpaceUnlocked === 'function' &&
    !GlobalHeartbeatEngine.shared.isPersonalSpaceUnlocked()
  ) {
    return false;
  }

  const key = makeStreamKey(space, threadId);
  if (activeStreams.has(key) || isWakeupInFlight(space, threadId)) {
    return false;
  }

  const backoff = recoveryBackoffMap.get(key);
  if (backoff && now < backoff.nextRetryAt) {
    return false;
  }

  const db = await initDatabase(space);
  const thread = await db.getFirstAsync<ThreadRecoveryRow>(
    `SELECT id, roleCardId, providerId, modelId, proactive_enabled, context_window_n, living_state_json
     FROM ai_threads WHERE id = ? LIMIT 1;`,
    [threadId]
  );
  if (!thread) return false;

  const windowN = thread.context_window_n || 20;
  let anchorMessageId: string | undefined;
  let epochSlotJson: string | undefined;
  let epochSummaryJson: string | undefined;

  try {
    if (thread.roleCardId) {
      const { imEpochRepository } = await import('../repository/imEpochRepository');
      const epochState = await imEpochRepository.getOrCreateState(space, threadId, thread.roleCardId);
      anchorMessageId = epochState.active_anchor_msg_id || undefined;
      epochSlotJson = epochState.active_slot_json;
      epochSummaryJson = epochState.active_summary_json;
    }
  } catch {}

  let historyMessages: ImMessage[] = [];
  if (anchorMessageId && typeof getContextMessagesFromAnchor === 'function') {
    historyMessages = await getContextMessagesFromAnchor(space, threadId, anchorMessageId, Math.max(windowN * 4, 140)).catch(() => []);
  }
  if (historyMessages.length === 0) {
    historyMessages = (await getVisibleImMessages(space, threadId, Math.max(windowN * 3, 80))).reverse();
  }

  const dialogueOnly = historyMessages.filter((m) => m.role === 'user' || m.role === 'assistant');
  if (dialogueOnly.length === 0) return false;

  const tailMsg = dialogueOnly[dialogueOnly.length - 1];
  if (tailMsg.role !== 'user') {
    recoveryBackoffMap.delete(key);
    return false;
  }

  // 防竞态守卫：若用户刚在几秒内发送消息（InputAggregator 防抖窗口内），交由前台会话自然处理
  const tailTimeMs = Date.parse(tailMsg.createdAt) || 0;
  const isActivelyOpen =
    typeof GlobalHeartbeatEngine.shared.isThreadActivelyOpen === 'function' &&
    GlobalHeartbeatEngine.shared.isThreadActivelyOpen(space, threadId);
  const minQuietMs = isActivelyOpen ? 18000 : 5000;
  if (tailTimeMs > 0 && now - tailTimeMs < minQuietMs) {
    return false;
  }

  // 聚合末尾连续未回复的用户气泡作为当前轮输入
  const trailingUserTexts: string[] = [];
  for (let i = dialogueOnly.length - 1; i >= 0; i--) {
    const m = dialogueOnly[i];
    if (m.role === 'user') {
      if (m.type === 'sticker') {
        const label = resolveStickerLabel(m.content, m.metadata?.sticker);
        trailingUserTexts.unshift(`（对方发来「${label}」表情贴纸）`);
      } else if (m.content) {
        trailingUserTexts.unshift(m.content);
      }
    } else {
      break;
    }
  }
  const combinedUserInput = trailingUserTexts.join('\n').trim();
  if (!combinedUserInput) return false;

  const providerConfig = await getActiveProviderConfig(space, thread.providerId, thread.modelId);
  if (!providerConfig || !providerConfig.apiKey) {
    recoveryBackoffMap.set(key, { attempts: 1, nextRetryAt: now + 5 * 60 * 1000 });
    return false;
  }

  let roleRow: CompanionRoleCardSnapshot | null = null;
  if (thread.roleCardId) {
    roleRow = await db.getFirstAsync<CompanionRoleCardSnapshot>(
      `SELECT name, prompt, description, sourceJson FROM ai_role_cards WHERE id = ? LIMIT 1;`,
      [thread.roleCardId]
    );
  }
  const { rolePrompt, companionName, personaAnchor } = resolveCompanionRolePrompt(roleRow);

  let livingState: ImCompanionLivingState | undefined;
  if (thread.living_state_json) {
    try {
      livingState = JSON.parse(thread.living_state_json) as ImCompanionLivingState;
    } catch {}
  }

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
      const [{ memoryRepository, extractImmediateFactsFromUserText }, { retrieveRelevantMemories }] = await Promise.all([
        import('../../core/memory/memoryRepository'),
        import('../../core/memory/zeroVectorRetriever'),
      ]);
      if (extractImmediateFactsFromUserText(combinedUserInput).length > 0) {
        await memoryRepository.harvestImmediateUserFacts(thread.roleCardId, space, combinedUserInput).catch(() => 0);
      }
      const [slots, summaries, facts, recalled, diaryHook] = await Promise.all([
        memoryRepository.listMemories(thread.roleCardId, space, 'L1_SLOT'),
        memoryRepository.listMemories(thread.roleCardId, space, 'L1_SUMMARY'),
        memoryRepository.listCoreProfileFacts(thread.roleCardId, space, 8),
        retrieveRelevantMemories(thread.roleCardId, space, combinedUserInput, 3),
        diaryHookPromise,
      ]);
      l1Slots = slots;
      l1Summary = summaries[0] ?? null;
      coreFacts = facts;
      recalledMemories = recalled;
      pendingDiaryHook = diaryHook;
    } else {
      pendingDiaryHook = await diaryHookPromise;
    }
  } catch {}

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
      historyMessages,
      livingState,
      now,
      windowN,
      anchorMessageId,
      personaAnchor,
    },
    combinedUserInput
  );

  const abortCtrl = new AbortController();
  registerActiveStream(space, threadId, abortCtrl);
  const timeoutId = setTimeout(() => abortCtrl.abort(), RECOVERY_TIMEOUT_MS);

  let fullRawResponse = '';
  try {
    const stream = streamClient.streamText(payload, {
      providerId: providerConfig.providerId,
      modelId: thread.modelId || providerConfig.modelId,
      baseUrl: providerConfig.baseUrl,
      apiKey: providerConfig.apiKey,
      abortSignal: abortCtrl.signal,
    });
    for await (const chunk of stream) {
      fullRawResponse += chunk;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && !activeStreams.has(key)) {
      return false;
    }
    const prevAttempts = backoff?.attempts ?? 0;
    const nextAttempts = prevAttempts + 1;
    const delayMs = nextAttempts >= 3 ? 15 * 60 * 1000 : 2 * 60 * 1000;
    recoveryBackoffMap.set(key, { attempts: nextAttempts, nextRetryAt: now + delayMs });
    return false;
  } finally {
    clearTimeout(timeoutId);
    unregisterActiveStream(space, threadId, abortCtrl);
  }

  recoveryBackoffMap.delete(key);

  const statusUpdate = parseStatusTag(fullRawResponse);
  let updatedLiving = livingState;
  if (statusUpdate) {
    updatedLiving = advanceLivingState(livingState, statusUpdate, now);
    void updateThreadLivingState(space, threadId, updatedLiving);
  }

  const cleanSentences = fullRawResponse
    .split(BR_SPLIT_REGEX)
    .map((s) => stripMetaTags(s))
    .filter((s) => s.length > 0 && s !== '[PASS]');

  if (cleanSentences.length === 0) return false;

  const baseMsgTime = Math.max(now, tailTimeMs + 1000);
  const burstGroupId = `burst_recover_${baseMsgTime}`;
  for (let i = 0; i < cleanSentences.length; i++) {
    const msg: ImMessage = {
      id: `im_msg_${baseMsgTime}_${i}_rec`,
      threadId,
      burstGroupId,
      role: 'assistant',
      content: cleanSentences[i],
      status: 'sent',
      deliveryStatus: 'delivered',
      visibleAt: null,
      createdAt: new Date(baseMsgTime + i * 400).toISOString(),
    };
    await insertImMessage(space, msg);
  }

  const stillOpen =
    typeof GlobalHeartbeatEngine.shared.isThreadActivelyOpen === 'function' &&
    GlobalHeartbeatEngine.shared.isThreadActivelyOpen(space, threadId);
  const unreadDelta = stillOpen ? 0 : cleanSentences.length;
  if (unreadDelta > 0) {
    await db.runAsync(
      `UPDATE ai_threads
       SET im_unread_count = COALESCE(im_unread_count, 0) + ?,
           updatedAt = ?
       WHERE id = ?;`,
      [unreadDelta, new Date(baseMsgTime).toISOString(), threadId]
    );
  }

  // 自动接力预约主动闹钟（模型显式 [PING] 或兜底退避闹钟）
  if (thread.proactive_enabled !== 0 && typeof savePendingPing === 'function') {
    const explicitPing = parsePingTag(fullRawResponse, now, updatedLiving);
    const effectivePing =
      explicitPing ||
      planFallbackProactivePing({
        consecutiveUnreplied: 0,
        lastUserInteractionAt: tailTimeMs || now,
        lastUserText: combinedUserInput,
        livingState: updatedLiving,
        now,
      });
    if (effectivePing) {
      await savePendingPing(space, threadId, effectivePing.targetTimestamp, effectivePing.intent);
      void scheduleProactivePingAlarm(threadId, effectivePing.targetTimestamp, space);
    }
  }

  GlobalHeartbeatEngine.shared.notifyListeners(threadId, space);
  return true;
}
