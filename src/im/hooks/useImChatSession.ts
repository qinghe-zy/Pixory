import { useState, useEffect, useCallback, useRef } from 'react';
import { LayoutAnimation, Share, Platform, ToastAndroid } from 'react-native';
import { voiceService } from '../../voice/voiceService';
import { asrService } from '../../voice/asrService';
import { runWithDatabaseSpace } from '../../database';

export interface ImSessionDialogState {
  visible: boolean;
  title: string;
  message?: string;
  danger?: boolean;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string | null;
  tertiaryLabel?: string;
  onTertiary?: () => void;
  actionLayout?: 'stack' | 'horizontal' | 'primaryThenSplit';
}
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import type { PixorySpace } from '../../database';
import { initDatabase, settingsRepository } from '../../database';
import type { ImMessage, ImCompanionLivingState } from '../types';
import type { SelectedIpImagePayload } from '../components/modals/ImIpAssetPickerModal';
import {
  getVisibleImMessages,
  getContextMessagesFromAnchor,
  insertImMessage,
  clearImThreadHistory,
  clearImThreadFullState,
  getThreadLivingState,
  updateThreadLivingState,
  cancelStagedMessages,
  revealPendingMessages,
  getNextPendingVisibleAt,
  getNextPendingVisibleRow,
  getThreadPacingState,
  peekThreadPendingDiaryHook,
  ackThreadPendingDiaryHook,
  consumeThreadPendingDiaryHook,
  setThreadPendingDiaryHook,
  savePendingPing,
  clearPendingPing,
  markImThreadRead,
  getThreadUnreadCount,
  updateImMessageContent,
  updateImMessageVoice,
  deleteImMessage,
} from '../repository/imThreadRepository';
import {
  evaluateProactivePacing,
} from '../heartbeat/proactivePacingGuard';
import {
  getImThreadSettings,
  updateImThreadSettings,
  updateRoleAvatar,
  exportImThreadMessages,
  importImThreadMessages,
  type ImThreadSettings,
} from '../repository/imSettingsRepository';
import { useImGlobalSettings } from '../services/imCompanionPreferences';
import { CustomStickerService } from '../../components/emoji/customStickerService';
import { VisibilityTicker, BurstMessageDispatcher } from '../engine/burstDispatcher';
import { GlobalHeartbeatEngine } from '../heartbeat/globalHeartbeatEngine';
import { InputAggregator } from '../engine/inputAggregator';
import { TagAwareStreamParser, sanitizeThoughtForUi } from '../engine/tagAwareStreamParser';
import { advanceLivingState } from '../engine/imAgencyEngine';
import {
  buildDefaultLivingState,
  shouldSeedOrRefreshLivingState,
  planFallbackProactivePing,
} from '../engine/imProactiveFallbackPlanner';
import { resolveCompanionRolePrompt } from '../engine/imRolePromptResolver';
import {
  parseStatusTag,
  parseHeartbeatTag,
  validateHeartbeatConsistency,
  parseNudgeTag,
  parsePingTag,
  parseStickerTag,
  parseDocumentTag,
  parseDocumentPatchTag,
} from '../engine/imTagParser';
import {
  buildChatPayload,
  buildShadowCompactionPayload,
  computeMidEpochDeltaFacts,
  estimateImTokens,
} from '../engine/imContextBuilder';
import { analyzeUserStyle, buildStyleEntrainmentPrompt } from '../engine/styleEntrainment';
import { detectRepetitiveStarters, detectExcessiveQuestions } from '../engine/humanizeOutputGate';
import { extractJsonObject } from '../../core/utils/jsonParser';
import type { FourDCompactionResult } from '../../core/memory/memoryTypes';
import { streamClient } from '../../core/llm-transport/streamClient';
import { getActiveProviderConfig, getMemoryModelProviderConfig } from '../../core/llm-transport/secureApiKey';
import { retrieveRelevantMemories } from '../../core/memory/zeroVectorRetriever';
import { memoryRepository, extractImmediateFactsFromUserText } from '../../core/memory/memoryRepository';
import { classifyTurnMemoryIntent } from '../../core/memory/memoryIntentClassifier';
import { extractMemoryMutationsWithMemoryModel } from '../../core/memory/memoryModelExtractor';
import { MemoryExtractionBatcher } from '../../core/memory/memoryExtractionBatcher';
import { runDailyMemoryMetabolism } from '../../core/memory/memoryMetabolismService';
import { resolveEffectiveDnd } from '../heartbeat/imDndGuard';
import { imUsageTelemetry } from '../services/imUsageTelemetry';
import { imMessageRollback } from '../engine/imMessageRollback';
import { epochLockstepCoordinator } from '../engine/epochLockstepCoordinator';
import { imEpochRepository } from '../repository/imEpochRepository';
import { planBurstShape, type BurstShape } from '../engine/burstShapePlanner';
import { buildEffectiveRecallQuery, filterCooldownRecalledMemories } from '../engine/recallQueryBuilder';
import { extractCommitmentFromUserText } from '../engine/commitmentExtractor';
import {
  detectSituationalDelay,
  parseProactiveDecision,
  buildProactivePromptDirective,
} from '../engine/proactiveTimingEvaluator';
import {
  scheduleStagedMessageAlarm,
  cancelStagedMessageAlarm,
  scheduleProactivePingAlarm,
  cancelProactivePingAlarm,
} from '../services/imNotificationManager';
import {
  registerActiveStream,
  unregisterActiveStream,
  abortActiveStream,
  scheduleDetachedReveal,
} from '../services/imBackgroundStreamService';
import { cancelInFlightWakeup } from '../services/imWakeupGenerationService';

const EMOJI_DETECTION_REGEX = /\p{Extended_Pictographic}/u;
const VOICE_PREFIX_STRIP_REGEX =
  /^[\[【]\s*(?:VOICE|语音)\s*(?:[:：]|\]\s*[:：]?)\s*([^\]】\n]+?)(?:[\]】]|$)/i;

export interface UseImChatSessionOptions {
  space: PixorySpace;
  threadId: string;
  roleCardId?: string;
  initialRoleName?: string;
  initialRoleAvatarUri?: string | null;
}

// 记录今日已执行记忆代谢的角色卡与空间，避免组件频繁重挂载触发重复 SQL 运算
const metabolismRunCache = new Set<string>();

export function useImChatSession({
  space,
  threadId,
  roleCardId,
  initialRoleName,
  initialRoleAvatarUri,
}: UseImChatSessionOptions) {
  const [messages, setMessages] = useState<ImMessage[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [initialUnreadCount, setInitialUnreadCount] = useState<number>(0);
  const [subText, setSubText] = useState<string | null>(null);
  const [userAvatarUri, setUserAvatarUri] = useState<string | null>(null);
  const [companionName, setCompanionName] = useState<string>(initialRoleName || '角色');
  const [companionAvatarUri, setCompanionAvatarUri] = useState<string | null>(initialRoleAvatarUri || null);
  const [rolePrompt, setRolePrompt] = useState<string>('你是一个真实自然、富有共情力的专属对话角色。');
  const roleSnapshotRef = useRef<any>(null);
  const [livingState, setLivingState] = useState<ImCompanionLivingState | null>(null);
  const [sessionDialog, setSessionDialog] = useState<ImSessionDialogState | null>(null);
  const closeSessionDialog = useCallback(() => {
    setSessionDialog(null);
  }, []);
  const livingStateRef = useRef<ImCompanionLivingState | null>(null);
  livingStateRef.current = livingState;
  const [ipModalVisible, setIpModalVisible] = useState(false);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [activeMessageForMenu, setActiveMessageForMenu] = useState<ImMessage | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number }>({ x: 180, y: 320 });
  const [fillDraftText, setFillDraftText] = useState<string | null>(null);
  const editingMessageRef = useRef<ImMessage | null>(null);
  const isStreamingRef = useRef(false);

  const { settings: globalSettings } = useImGlobalSettings(space);
  const [threadSettings, setThreadSettings] = useState<ImThreadSettings>({
    nudgeText: '的小脑袋',
    contextWindowN: 20,
    heartbeatEnabled: true,
    proactiveEnabled: true,
  });
  const threadSettingsRef = useRef<ImThreadSettings>(threadSettings);
  threadSettingsRef.current = threadSettings;
  const globalSettingsRef = useRef(globalSettings);
  globalSettingsRef.current = globalSettings;
  const inputDraftRef = useRef<string>('');

  const messagesRef = useRef<ImMessage[]>(messages);
  messagesRef.current = messages;

  const anchorMessageIdRef = useRef<string | undefined>(undefined);
  const personaAnchorRef = useRef<string | null>(null);
  const lastInterruptedDraftRef = useRef<string | null>(null);
  const typingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const tickerRef = useRef<VisibilityTicker | null>(null);
  const dispatcherRef = useRef<BurstMessageDispatcher | null>(null);
  const aggregatorRef = useRef<InputAggregator | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleStageRef = useRef<number>(0);
  const scheduleInactivityAutoReplyRef = useRef<(delayMs?: number) => void>(() => {});
  const hasAutoRepliedInRoundRef = useRef<boolean>(false);
  const recentBurstShapesRef = useRef<BurstShape[]>([]);
  const recentlyRecalledMemoriesRef = useRef<Set<string>>(new Set());
  const inFlightThoughtMsgRef = useRef<ImMessage | null>(null);

  const loadThreadSettings = useCallback(async () => {
    try {
      const s = await getImThreadSettings(space, threadId);
      if (isMountedRef.current) {
        setThreadSettings(s);
        if (s.personalization?.companionCallName?.trim()) {
          setCompanionName(s.personalization.companionCallName.trim());
        }
      }
      const state = await getThreadLivingState(space, threadId);
      const now = Date.now();
      if (shouldSeedOrRefreshLivingState(state, now)) {
        const seeded = buildDefaultLivingState(now, state);
        livingStateRef.current = seeded;
        if (isMountedRef.current) {
          setLivingState(seeded);
        }
        void updateThreadLivingState(space, threadId, seeded);
      } else if (state) {
        livingStateRef.current = state;
        if (isMountedRef.current) {
          setLivingState(state);
        }
      }
    } catch {
      // 容错静默
    }
  }, [space, threadId]);

  useEffect(() => {
    void loadThreadSettings();
    void CustomStickerService.hydrateCustomStickers(space);
    if (roleCardId) {
      const todayKey = `${space}:${roleCardId}:${new Date().toDateString()}`;
      if (!metabolismRunCache.has(todayKey)) {
        metabolismRunCache.add(todayKey);
        void initDatabase(space).then((db) => {
          void runDailyMemoryMetabolism(db, roleCardId, space, Date.now()).catch(() => {});
        });
      }
    }
  }, [loadThreadSettings, space, roleCardId]);

  const handleUpdateSettings = useCallback(
    async (patch: Partial<ImThreadSettings>) => {
      setThreadSettings((prev) => {
        const next = { ...prev, ...patch };
        threadSettingsRef.current = next;
        return next;
      });
      await updateImThreadSettings(space, threadId, patch);

      const effectiveName =
        patch.personalization?.companionCallName?.trim() ||
        threadSettingsRef.current.personalization?.companionCallName?.trim() ||
        companionName;
      if (patch.personalization?.companionCallName !== undefined) {
        setCompanionName(effectiveName);
      }

      if (patch.personalization !== undefined && roleSnapshotRef.current) {
        const { rolePrompt: resolvedPrompt, personaAnchor } = resolveCompanionRolePrompt(
          roleSnapshotRef.current,
          effectiveName,
          patch.personalization
        );
        personaAnchorRef.current = personaAnchor;
        setRolePrompt(resolvedPrompt);
      }
    },
    [space, threadId, companionName, initialRoleName]
  );

  const reloadMessages = useCallback(async () => {
    try {
      const mounted = isMountedRef.current;
      await revealPendingMessages(space, threadId, Date.now(), livingStateRef.current, {
        incrementUnread: !mounted && !GlobalHeartbeatEngine.shared.isThreadActivelyOpen(space, threadId),
      });
      if (!isMountedRef.current) {
        GlobalHeartbeatEngine.shared.notifyListeners(threadId, space);
        return;
      }
      void markImThreadRead(space, threadId);
      const items = await getVisibleImMessages(space, threadId, 120);
      const reversed = items.reverse();
      if (isMountedRef.current) {
        // 在途思考气泡防冲刷：若前台正在进行深度思考，SQLite 列表覆盖前将内存在途气泡安全追加至末尾
        const inFlight = inFlightThoughtMsgRef.current;
        if (inFlight && !reversed.some((m) => m.id === inFlight.id)) {
          setMessages([...reversed, inFlight]);
        } else {
          setMessages(reversed);
        }
        setIsInitialLoading(false);
      }
    } catch {
      if (isMountedRef.current) {
        setIsInitialLoading(false);
      }
    }
  }, [space, threadId]);

  // 初始化 Ticker & Dispatcher & 全局心跳同步（切页/退后台不中断流式生成）
  useEffect(() => {
    isMountedRef.current = true;
    anchorMessageIdRef.current = undefined;
    GlobalHeartbeatEngine.shared.markThreadOpen(space, threadId);
    void getThreadUnreadCount(space, threadId).then((unread) => {
      if (isMountedRef.current && unread > 0) {
        setInitialUnreadCount(unread);
      }
      void markImThreadRead(space, threadId);
    });

    const ticker = new VisibilityTicker(threadId, space);
    const dispatcher = new BurstMessageDispatcher(threadId, space);
    tickerRef.current = ticker;
    dispatcherRef.current = dispatcher;

    const unsubscribeReveal = ticker.subscribe(() => {
      void reloadMessages();
    });
    const unsubscribeIdle = ticker.subscribeIdle(() => {
      if (!isStreamingRef.current && isMountedRef.current) {
        setSubText(null);
      }
    });

    const unsubscribeGlobalHeartbeat = GlobalHeartbeatEngine.shared.subscribe((tId, s) => {
      if (tId === threadId && s === space) {
        void reloadMessages();
      }
    });

    return () => {
      isMountedRef.current = false;
      GlobalHeartbeatEngine.shared.markThreadClosed(space, threadId);
      unsubscribeReveal();
      unsubscribeIdle();
      unsubscribeGlobalHeartbeat();
      ticker.dispose();
      // 页面卸载时刷新批处理记忆提炼
      MemoryExtractionBatcher.shared.flushKey(`${space}:${roleCardId || threadId}`);
      // 注意：故意不在此处调用 abortControllerRef.current?.abort()！
      // 允许正在进行的伴侣回复在退出页面或切至后台后静默写完落库并推送未读红点。
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      if (typingDebounceTimerRef.current) {
        clearTimeout(typingDebounceTimerRef.current);
        typingDebounceTimerRef.current = null;
      }
      // 离线短时挂念 (Detached Linger):
      // 若当前开启了主动问候且在普通空间，且距最后一次发言不足 2 分钟，安排 45s~75s 后的离线短挂念
      if (
        space === 'normal' &&
        threadSettingsRef.current.proactiveEnabled !== false &&
        globalSettingsRef.current.globalHeartbeatEnabled !== false
      ) {
        const lastMsg = messagesRef.current[messagesRef.current.length - 1];
        const lastMsgTime = lastMsg?.createdAt ? Date.parse(lastMsg.createdAt) : 0;
        if (Date.now() - lastMsgTime < 120000) {
          const lingerDelay = 45000 + Math.floor(Math.random() * 30000);
          const targetAt = Date.now() + lingerDelay;
          void savePendingPing(space, threadId, targetAt, '离线短追念');
          void scheduleProactivePingAlarm(threadId, targetAt, space);
        }
      }
    };
  }, [threadId, space, reloadMessages]);

  // 加载用户信息、角色卡人设与初始消息
  useEffect(() => {
    void (async () => {
      try {
        const db = await initDatabase(space);
        const myAvatar = await settingsRepository.getProfileAvatarUri(db);
        if (myAvatar) setUserAvatarUri(myAvatar);

        if (roleCardId) {
          const role = await db.getFirstAsync<{
            name: string;
            avatarUri: string | null;
            avatarEnabled: number | null;
            prompt: string | null;
            description: string | null;
            sourceJson: string | null;
          }>(
            `SELECT name, avatarUri, avatarEnabled, prompt, description, sourceJson FROM ai_role_cards WHERE id = ? LIMIT 1;`,
            [roleCardId]
          );
          if (role) {
            roleSnapshotRef.current = role;
            const { rolePrompt: resolvedPrompt, companionName: resolvedName, personaAnchor } =
              resolveCompanionRolePrompt(role, companionName, threadSettingsRef.current?.personalization);
            personaAnchorRef.current = personaAnchor;
            if (role.name) setCompanionName(resolvedName);
            if (role.avatarEnabled !== 0 && role.avatarUri) setCompanionAvatarUri(role.avatarUri);
            setRolePrompt(resolvedPrompt);
          }
        }
      } catch {
        // 容错静默
      }
    })();
  }, [space, roleCardId]);

  useEffect(() => {
    void reloadMessages();
  }, [reloadMessages]);

  const createThoughtHandlers = useCallback(() => {
    let activeThought: {
      id: string;
      startTime: number;
      content: string;
      lastSyncTime: number;
    } | null = null;
    let persistedThoughtId: string | null = null;

    const onThoughtProgress = (chunk: string, fullThought: string) => {
      const showThought = threadSettingsRef.current.showThoughtBubble !== false;
      const cleanThought = sanitizeThoughtForUi(fullThought, { isFinal: false });
      if (!cleanThought) return;

      if (!activeThought) {
        const thoughtId = `msg_thought_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        activeThought = {
          id: thoughtId,
          startTime: Date.now(),
          content: cleanThought,
          lastSyncTime: Date.now(),
        };
        const initialThoughtMsg: ImMessage = {
          id: thoughtId,
          threadId,
          role: 'assistant',
          content: cleanThought,
          type: 'thought',
          status: 'sent',
          deliveryStatus: 'delivered',
          visibleAt: null,
          metadata: {
            isThinking: true,
            durationSeconds: 0,
            isCollapsed: false,
          },
          createdAt: new Date().toISOString(),
        };
        inFlightThoughtMsgRef.current = initialThoughtMsg;
        if (showThought && isMountedRef.current) {
          setMessages((prev) => [...prev, initialThoughtMsg]);
        }
      } else {
        activeThought.content = cleanThought;
        const now = Date.now();
        if (now - activeThought.lastSyncTime >= 50) {
          activeThought.lastSyncTime = now;
          const currentId = activeThought.id;
          if (inFlightThoughtMsgRef.current && inFlightThoughtMsgRef.current.id === currentId) {
            inFlightThoughtMsgRef.current = { ...inFlightThoughtMsgRef.current, content: cleanThought };
          }
          if (showThought && isMountedRef.current) {
            setMessages((prev) =>
              prev.map((m) => (m.id === currentId ? { ...m, content: cleanThought } : m))
            );
          }
        }
      }
    };

    const onThoughtCompleted = async (fullThought: string) => {
      const showThought = threadSettingsRef.current.showThoughtBubble !== false;
      const cleanThought = sanitizeThoughtForUi(fullThought, { isFinal: true });
      if (!activeThought) {
        if (!cleanThought || cleanThought.trim().length === 0) return;
        activeThought = {
          id: `msg_thought_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          startTime: Date.now(),
          content: cleanThought,
          lastSyncTime: Date.now(),
        };
      }
      const targetId = activeThought.id;
      if (!cleanThought || cleanThought.trim().length === 0) {
        inFlightThoughtMsgRef.current = null;
        if (isMountedRef.current) {
          setMessages((prev) => prev.filter((m) => m.id !== targetId));
        }
        activeThought = null;
        return;
      }
      const durationMs = Date.now() - activeThought.startTime;
      const durationSeconds = Math.max(1, Math.round(durationMs / 1000));
      const finalThoughtMsg: ImMessage = {
        id: targetId,
        threadId,
        role: 'assistant',
        content: cleanThought,
        type: 'thought',
        status: 'sent',
        deliveryStatus: 'delivered',
        visibleAt: null,
        metadata: {
          isThinking: false,
          durationSeconds,
          isCollapsed: true, // 思考完成立马闭合
        },
        createdAt: new Date().toISOString(),
      };
      await insertImMessage(space, finalThoughtMsg);
      persistedThoughtId = targetId;
      inFlightThoughtMsgRef.current = null;
      if (showThought && isMountedRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m.id === targetId ? finalThoughtMsg : m))
        );
      }
      activeThought = null;
    };

    const rollbackThought = async () => {
      // 关键防丢失铁律：如果思考已经完成并落库 (persistedThoughtId 存在)，严禁在流异常或中断时回滚删除！
      if (persistedThoughtId) {
        return;
      }
      // 防抹杀铁律：若在途思考已产出实质内容，绝不当作空白废弃，自动转由 finalizeThoughtOnError 安全落库沉淀
      if (activeThought && activeThought.content.trim().length > 0) {
        await finalizeThoughtOnError(false);
        return;
      }
      const targetId = activeThought?.id;
      if (!targetId) return;
      activeThought = null;
      inFlightThoughtMsgRef.current = null;
      if (isMountedRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== targetId));
      }
    };

    const finalizeThoughtOnError = async (isAborted: boolean = false) => {
      if (persistedThoughtId) return;
      if (!activeThought) return;
      const targetId = activeThought.id;
      // 只有思考内容完全为空时，才安全清理过滤；只要产生了有效文字，即使遇到异常或中断也必须落库保留
      if (activeThought.content.trim().length === 0) {
        activeThought = null;
        inFlightThoughtMsgRef.current = null;
        if (isMountedRef.current) {
          setMessages((prev) => prev.filter((m) => m.id !== targetId));
        }
        return;
      }
      const durationMs = Date.now() - activeThought.startTime;
      const durationSeconds = Math.max(1, Math.round(durationMs / 1000));
      const finalThoughtMsg: ImMessage = {
        id: targetId,
        threadId,
        role: 'assistant',
        content: activeThought.content,
        type: 'thought',
        status: 'sent',
        deliveryStatus: 'delivered',
        visibleAt: null,
        metadata: {
          isThinking: false,
          durationSeconds,
          isCollapsed: true,
        },
        createdAt: new Date().toISOString(),
      };
      await insertImMessage(space, finalThoughtMsg);
      persistedThoughtId = targetId;
      inFlightThoughtMsgRef.current = null;
      if (threadSettingsRef.current.showThoughtBubble !== false && isMountedRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m.id === targetId ? finalThoughtMsg : m))
        );
      }
      activeThought = null;
    };

    const discardIncompleteCurrentAttempt = async () => {
      // 若当前尝试已将思考落库到了 SQLite，但在正文对白吐出前发生流中断，
      // 在透明重试下一轮前，安全从 SQLite 和界面中撤销此未结题思考，确保全新生成无重影
      if (persistedThoughtId) {
        const pId = persistedThoughtId;
        persistedThoughtId = null;
        activeThought = null;
        inFlightThoughtMsgRef.current = null;
        try {
          await imMessageRollback.deleteMessage(pId, space);
        } catch {}
        if (isMountedRef.current) {
          setMessages((prev) => prev.filter((m) => m.id !== pId));
        }
        return;
      }
      if (activeThought || inFlightThoughtMsgRef.current) {
        const targetId = activeThought?.id || inFlightThoughtMsgRef.current?.id;
        activeThought = null;
        inFlightThoughtMsgRef.current = null;
        if (targetId && isMountedRef.current) {
          setMessages((prev) => prev.filter((m) => m.id !== targetId));
        }
      }
    };

    return {
      onThoughtProgress,
      onThoughtCompleted,
      rollbackThought,
      finalizeThoughtOnError,
      discardIncompleteCurrentAttempt,
      hasPersistedThought: () => Boolean(persistedThoughtId),
    };
  }, [space, threadId]);

  const triggerProactiveFollowup = useCallback(async (stage: 1 | 2 | 3 = 1) => {
    if (isStreamingRef.current) return;
    if (
      livingStateRef.current?.activityLoad === 'sleeping' ||
      livingStateRef.current?.deviceAccess === 'away'
    ) {
      return;
    }

    let registeredCtrl: AbortController | null = null;
    let finalizeThoughtOnError: ((isAborted?: boolean) => Promise<void>) | null = null;
    let rollbackThoughtOnError: (() => Promise<void>) | null = null;
    let lastDispatchedMsg: ImMessage | null = null;
    let caughtAbort = false;
    try {
      const provider = await getActiveProviderConfig(
        space,
        threadSettingsRef.current.providerId,
        threadSettingsRef.current.modelId
      );
      if (!provider?.apiKey) return;

      const effectiveModelId = threadSettingsRef.current.modelId || provider.modelId;
      const effectiveProviderId = threadSettingsRef.current.providerId || provider.providerId;
      const windowN = threadSettingsRef.current.contextWindowN || 20;

      const [slots, summaries, coreFacts, epochState] = await Promise.all([
        roleCardId ? memoryRepository.listMemories(roleCardId, space, 'L1_SLOT') : Promise.resolve([]),
        roleCardId ? memoryRepository.listMemories(roleCardId, space, 'L1_SUMMARY') : Promise.resolve([]),
        roleCardId ? memoryRepository.listCoreProfileFacts(roleCardId, space, 8) : Promise.resolve([]),
        imEpochRepository.getOrCreateState(space, threadId, roleCardId || 'default'),
      ]);
      const l1Summary = summaries[0] ?? null;
      const activeAnchorId = epochState.active_anchor_msg_id || anchorMessageIdRef.current;
      const fullHistory = await getContextMessagesFromAnchor(
        space,
        threadId,
        activeAnchorId,
        Math.max(180, windowN * 6)
      ).catch(() => messagesRef.current);
      const effectiveHistory = fullHistory.length > 0 ? fullHistory : messagesRef.current;

      // 提取最后一条用户发言，检测情境化时长
      const recentUserMsg = [...effectiveHistory].reverse().find((m) => m.role === 'user');
      const situational = recentUserMsg ? detectSituationalDelay(recentUserMsg.content) : null;

      // 如果处于 Stage 1 且检测到开会/洗澡等情境，智能直接预埋延时信封与闹钟，不打扰当前！
      if (stage === 1 && situational) {
        const nextTime = Date.now() + situational.delayMs;
        const stagedMsg: ImMessage = {
          id: `staged_${Date.now()}_situational`,
          threadId,
          role: 'assistant',
          content: situational.suggestedHook || `${companionName} 挂念着你呢~`,
          type: 'text',
          status: 'sent',
          deliveryStatus: 'staged',
          visibleAt: nextTime,
          createdAt: new Date().toISOString(),
        };
        await insertImMessage(space, stagedMsg);
        await scheduleStagedMessageAlarm(threadId, nextTime, space);
        idleStageRef.current = 2;
        return;
      }

      const promptDirective = buildProactivePromptDirective(stage, companionName, recentUserMsg?.content);

      const payload = buildChatPayload(
        {
          rolePrompt,
          roleName: companionName,
          l1Slots: slots,
          l1Summary,
          coreFacts,
          epochSlotJson: epochState.active_slot_json,
          epochSummaryJson: epochState.active_summary_json,
          historyMessages: effectiveHistory,
          livingState: livingStateRef.current || undefined,
          windowN,
          anchorMessageId: activeAnchorId,
          voiceReplyEnabled: threadSettingsRef.current?.voiceReplyEnabled !== false,
        },
        promptDirective
      );

      isStreamingRef.current = true;
      if (isMountedRef.current) {
        setSubText('对方正在输入...');
      }

      const thoughtHandlers = createThoughtHandlers();
      finalizeThoughtOnError = thoughtHandlers.finalizeThoughtOnError;
      rollbackThoughtOnError = thoughtHandlers.rollbackThought;
      const { onThoughtProgress, onThoughtCompleted } = thoughtHandlers;
      const parser = new TagAwareStreamParser({
        onThoughtProgress,
        onThoughtCompleted,
        onDocumentStreamProgress: (evt) => {
          if (isMountedRef.current) {
            if (evt.status === 'streaming') {
              const headingInfo = evt.latestHeading ? ` · ${evt.latestHeading}` : '';
              setSubText(`正在起草文档: ${evt.title}${headingInfo}`);
            } else if (evt.status === 'compiling') {
              setSubText(`正在排版导出: ${evt.title}...`);
            }
          }
        },
      });
      let fullRaw = '';
      const dispatcher = dispatcherRef.current;
      const ticker = tickerRef.current;

      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;
      registeredCtrl = abortCtrl;
      registerActiveStream(space, threadId, abortCtrl);

      const stream = streamClient.streamText(payload, {
        providerId: effectiveProviderId,
        modelId: effectiveModelId,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        protocol: provider.protocol,
        supportsThinking: provider.supportsThinking,
        abortSignal: abortCtrl.signal,
      });

      lastDispatchedMsg = null;
      for await (const chunk of stream) {
        fullRaw += chunk;
        const trimmedRaw = fullRaw.trim();
        if (
          trimmedRaw.startsWith('[PASS]') ||
          trimmedRaw.startsWith('[STAGE_FOLLOWUP') ||
          trimmedRaw.startsWith('[STAGE_')
        ) {
          continue;
        }
        const sentences = parser.feed(chunk);
        if (isMountedRef.current) {
          if (parser.isThinking()) {
            setSubText(threadSettingsRef.current.showThoughtBubble !== false ? '对方正在思考...' : '对方正在输入...');
          } else {
            setSubText('对方正在输入...');
          }
        }
        let dispatchedAny = false;
        for (const s of sentences) {
          if (!s.includes('[PASS]') && !s.includes('[STAGE_FOLLOWUP:')) {
            const m = await dispatcher?.dispatchSentence(s, isMountedRef.current ? (ticker || undefined) : undefined);
            if (m) {
              lastDispatchedMsg = m;
              dispatchedAny = true;
            }
          }
        }
        if (dispatchedAny && isMountedRef.current) {
          await reloadMessages();
        }
      }

      // 决策解析
      const decision = parseProactiveDecision(fullRaw);

      if (decision.action === 'pass' || !lastDispatchedMsg) {
        // AI 自主判定当前不宜打扰或未产生有效对白发言，彻底回滚思考气泡保持体贴留白，杜绝幽灵思考气泡
        await thoughtHandlers.rollbackThought();
        idleStageRef.current = 3;
        return;
      }

      if (decision.action === 'stage_future' && decision.stagedText && decision.stagedDelayMs) {
        const nextTime = Date.now() + decision.stagedDelayMs;
        const stagedMsg: ImMessage = {
          id: `staged_${Date.now()}_ai_future`,
          threadId,
          role: 'assistant',
          content: decision.stagedText,
          type: 'text',
          status: 'sent',
          deliveryStatus: 'staged',
          visibleAt: nextTime,
          createdAt: new Date().toISOString(),
        };
        await insertImMessage(space, stagedMsg);
        await scheduleStagedMessageAlarm(threadId, nextTime, space);
        idleStageRef.current = 3;
        return;
      }

      if (decision.action === 'immediate_reply') {
        const trailing = parser.flush();
        let dispatchedTrailing = false;
        for (const s of trailing) {
          if (!s.includes('[PASS]') && !s.includes('[STAGE_FOLLOWUP:')) {
            const m = await dispatcher?.dispatchSentence(s, isMountedRef.current ? (ticker || undefined) : undefined);
            if (m) {
              lastDispatchedMsg = m;
              dispatchedTrailing = true;
            }
          }
        }
        if (dispatchedTrailing && isMountedRef.current) {
          await reloadMessages();
        }

        const rawHasPatch = /\[(?:DOCUMENT_PATCH|DOC_PATCH):/i.test(fullRaw);
        const patchTag = parseDocumentPatchTag(fullRaw);
        if (patchTag && dispatcher) {
          try {
            const docMsg = await dispatcher.dispatchDocumentPatch(
              patchTag,
              isMountedRef.current ? (ticker || undefined) : undefined
            );
            lastDispatchedMsg = docMsg;
            if (isMountedRef.current) {
              await reloadMessages();
            }
          } catch {
            // 失败补偿：派发轻量解释气泡，消除“说改好却无卡片”的假成功割裂感
            const fallbackMsg = await dispatcher.dispatchSentence(
              '哎呀，刚才排版工具卡了一下未能生成修订文件，原文档安全未受影响，让我再试一次吧',
              isMountedRef.current ? (ticker || undefined) : undefined
            );
            if (fallbackMsg) lastDispatchedMsg = fallbackMsg;
            if (isMountedRef.current) {
              await reloadMessages();
            }
          }
        } else if (rawHasPatch && dispatcher && !parseDocumentTag(fullRaw)) {
          // 意图生成补丁但中途残缺中断
          const fallbackMsg = await dispatcher.dispatchSentence(
            '排版修补传输中断了，未生成新的修改版卡片，原文档保持不变，请随时让我重试~',
            isMountedRef.current ? (ticker || undefined) : undefined
          );
          if (fallbackMsg) lastDispatchedMsg = fallbackMsg;
          if (isMountedRef.current) {
            await reloadMessages();
          }
        } else {
          const docTag = parseDocumentTag(fullRaw);
          if (docTag && dispatcher) {
            const docMsg = await dispatcher.dispatchDocument(
              { title: docTag.title, uri: docTag.uri, content: docTag.content },
              isMountedRef.current ? (ticker || undefined) : undefined
            );
            lastDispatchedMsg = docMsg;
            if (isMountedRef.current) {
              await reloadMessages();
            }
          }
        }

        const stickerTag = parseStickerTag(fullRaw);
        if (stickerTag && dispatcher) {
          const stickerRes = await dispatcher.dispatchSticker(
            stickerTag.emotion,
            isMountedRef.current ? (ticker || undefined) : undefined,
            { personaStyle: threadSettingsRef.current?.personalization?.replyStyleGear || undefined }
          );
          if (stickerRes.dispatched && stickerRes.message) {
            lastDispatchedMsg = stickerRes.message;
            if (isMountedRef.current) {
              await reloadMessages();
            }
          }
        } else if (dispatcher) {
          dispatcher.advanceTurnWithoutSticker();
        }

        const aiNudge = decision.nudgeAction ? { action: decision.nudgeAction } : parseNudgeTag(fullRaw);
        if (aiNudge) {
          if (isMountedRef.current) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          const cleanSuffix = aiNudge.action.startsWith('的') ? aiNudge.action.slice(1).trim() : aiNudge.action;
          const noticeMsg: ImMessage = {
            id: `notice_${Date.now()}_ai_nudge`,
            threadId,
            role: 'system',
            content: `${companionName} 拍了拍你的${cleanSuffix}`,
            type: 'system_notice',
            status: 'sent',
            deliveryStatus: 'delivered',
            visibleAt: Date.now(),
            createdAt: new Date().toISOString(),
          };
          await insertImMessage(space, noticeMsg);
          if (isMountedRef.current) {
            await reloadMessages();
          }
        }

        const statusUpdate = parseStatusTag(fullRaw);
        if (statusUpdate) {
          const updatedLiving = advanceLivingState(livingStateRef.current || undefined, statusUpdate);
          livingStateRef.current = updatedLiving;
          if (isMountedRef.current) {
            setLivingState(updatedLiving);
          }
          void updateThreadLivingState(space, threadId, updatedLiving);
        }

        if (!isMountedRef.current && lastDispatchedMsg) {
          scheduleDetachedReveal(space, threadId, lastDispatchedMsg.visibleAt, () => livingStateRef.current);
        }

        if (stage === 1) {
          idleStageRef.current = 1;
          if (isMountedRef.current) {
            if (decision.nextFollowupMs === 0) {
              idleStageRef.current = 3;
              return;
            }
            // Stage 2: 保持约 35s ~ 50s 间隔，持续抛出低负担互动
            const nextWaitMs = decision.nextFollowupMs && decision.nextFollowupMs > 0
              ? decision.nextFollowupMs
              : 35000 + Math.floor(Math.random() * 15000);
            scheduleInactivityAutoReplyRef.current(nextWaitMs);
          }
        } else if (stage === 2) {
          idleStageRef.current = 2;
          if (isMountedRef.current) {
            if (decision.nextFollowupMs === 0) {
              idleStageRef.current = 3;
              return;
            }
            // Stage 3: 保持约 60s ~ 90s 间隔，体贴留白并衔接后台
            const nextWaitMs = decision.nextFollowupMs && decision.nextFollowupMs > 0
              ? decision.nextFollowupMs
              : 60000 + Math.floor(Math.random() * 30000);
            scheduleInactivityAutoReplyRef.current(nextWaitMs);
          }
        } else {
          idleStageRef.current = 3;
        }
      }
    } catch (err: any) {
      caughtAbort = Boolean(
        registeredCtrl?.signal.aborted ||
        err?.name === 'AbortError' ||
        /abort|cancel/i.test(err?.message || '')
      );
    } finally {
      if (finalizeThoughtOnError) {
        const wasAborted = caughtAbort || Boolean(registeredCtrl?.signal.aborted);
        await finalizeThoughtOnError(wasAborted);
      }
      if (registeredCtrl) {
        unregisterActiveStream(space, threadId, registeredCtrl);
      }
      isStreamingRef.current = false;
      if (isMountedRef.current && !tickerRef.current?.isRevealing()) {
        setSubText(null);
      }
    }
  }, [
    space,
    threadId,
    roleCardId,
    rolePrompt,
    companionName,
    reloadMessages,
  ]);

  const scheduleInactivityAutoReply = useCallback((customDelayMs?: number) => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    const freq = threadSettingsRef.current.personalization?.proactiveFrequencyGear;
    if (
      !isMountedRef.current ||
      freq === 'silent' ||
      threadSettingsRef.current.proactiveEnabled === false ||
      globalSettingsRef.current.globalHeartbeatEnabled === false ||
      idleStageRef.current >= 3
    ) {
      return;
    }

    let delayMs = customDelayMs;
    if (delayMs === undefined) {
      if (freq === 'frequent' || freq === 'clingy') {
        delayMs = 10000 + Math.floor(Math.random() * 6000); // 粘人模式 10s ~ 16s
      } else if (freq === 'calm' || freq === 'quiet') {
        delayMs = 45000 + Math.floor(Math.random() * 30000); // 克制模式 45s ~ 75s
      } else {
        delayMs = 18000 + Math.floor(Math.random() * 10000); // 适中推荐 18s ~ 28s (拟真留白，告别机械急催)
      }
    }

    inactivityTimerRef.current = setTimeout(async () => {
      // 草稿避让守卫：若用户正在输入框编辑草稿，绝不抢话！
      if (!isMountedRef.current || isStreamingRef.current || inputDraftRef.current.trim().length > 0) return;
      const msgs = messagesRef.current;
      if (msgs.length === 0) return;
      const lastDialogue = [...msgs].reverse().find((m) => m.role === 'user' || m.role === 'assistant');
      if (lastDialogue && lastDialogue.role !== 'assistant') return;

      // 72h 静默休眠守卫：若达到72h上限，静默不打扰
      const pacingState = await getThreadPacingState(space, threadId).catch(() => ({ consecutiveUnreplied: 0, lastUserInteractionAt: null }));
      const pacingDecision = evaluateProactivePacing(
        pacingState.consecutiveUnreplied,
        pacingState.lastUserInteractionAt,
        Date.now()
      );
      if (!pacingDecision.allowHeartbeat) return;

      // 仅避让前台正在进行的打字气泡显影 (revealing)，绝不被后台远期预埋闹钟 (staged) 阻断前台即刻续聊！
      if (tickerRef.current?.isRevealing()) {
        scheduleInactivityAutoReply(1500);
        return;
      }
      const nextPendingRow = await getNextPendingVisibleRow(space, threadId);
      if (nextPendingRow && nextPendingRow.deliveryStatus === 'revealing' && nextPendingRow.visibleAt > Date.now()) {
        const waitRemain = Math.max(500, nextPendingRow.visibleAt - Date.now());
        scheduleInactivityAutoReply(waitRemain + 1000);
        return;
      }

      const nextStage = (idleStageRef.current + 1) as 1 | 2 | 3;
      void triggerProactiveFollowup(nextStage);
    }, delayMs);
  }, [space, threadId, triggerProactiveFollowup]);

  scheduleInactivityAutoReplyRef.current = scheduleInactivityAutoReply;

  // 核心大模型流式回复分发器（支持切页/退后台脱钩连续落盘）
  const triggerAiResponse = useCallback(
    async (userInput: string, imageBase64?: string | null, isRetryPrompt?: boolean) => {
      const dispatcher = dispatcherRef.current ?? new BurstMessageDispatcher(threadId, space);
      dispatcher.voiceReplyEnabled = threadSettingsRef.current?.voiceReplyEnabled !== false;
      const ticker = tickerRef.current;

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      idleStageRef.current = 0;
      hasAutoRepliedInRoundRef.current = false;

      // 1. 打断上一轮流、截断未显影气泡并取消预埋信封/唤醒锁 (Zero-fork Guarantee)
      abortControllerRef.current?.abort();
      abortActiveStream(space, threadId);
      cancelInFlightWakeup(space, threadId);
      await imMessageRollback.cancelFuturePendingBubbles(threadId, space);
      await cancelStagedMessages(space, threadId);
      void cancelStagedMessageAlarm(threadId);
      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;
      registerActiveStream(space, threadId, abortCtrl);
      isStreamingRef.current = true;

      if (isMountedRef.current) {
        setSubText('对方正在输入...');
      }
      dispatcher.beginBurst();

      const isOccupied = Boolean(
        livingStateRef.current &&
        (livingStateRef.current.activityLoad === 'occupied' || livingStateRef.current.deviceAccess === 'limited')
      );

      let followupDelayToSchedule: number | null | undefined = null;
      let finalizeThoughtOnError: ((isAborted?: boolean) => Promise<void>) | null = null;
      let rollbackThoughtOnError: (() => Promise<void>) | null = null;
      let discardIncompleteCurrentAttemptOnError: (() => Promise<void>) | null = null;
      let hasPersistedThoughtFn: (() => boolean) | null = null;
      let parserInstance: TagAwareStreamParser | null = null;
      let lastDispatchedMsg: ImMessage | null = null;
      let caughtAbort = false;

      const emitStreamErrorNotice = async (hasThought: boolean) => {
        if (caughtAbort || abortCtrl.signal.aborted) return;
        const noticeContent = hasThought
          ? '连接中断，未收到回复'
          : '连接暂时不稳定，未收到回复';
        const errorNotice: ImMessage = {
          id: `notice_${Date.now()}_net_err`,
          threadId,
          role: 'system',
          content: noticeContent,
          type: 'system_notice',
          status: 'sent',
          deliveryStatus: 'delivered',
          visibleAt: Date.now(),
          createdAt: new Date().toISOString(),
        };
        await insertImMessage(space, errorNotice);
        if (isMountedRef.current) {
          await reloadMessages();
        }
      };

      try {
        const provider = await getActiveProviderConfig(
          space,
          threadSettingsRef.current.providerId,
          threadSettingsRef.current.modelId
        );
        if (!provider?.apiKey) {
          // 无 Key 时的拟真温情兜底
          setTimeout(async () => {
            await dispatcher.dispatchSentence(
              `我收到啦！[BR]你刚才说的“${userInput.slice(0, 15)}”真有意思~[BR]小贴士：在设置中配置 API Key 即可开启完整大模型即时对话`,
              isMountedRef.current ? (ticker || undefined) : undefined,
              { isOccupied }
            );
            await reloadMessages();
            if (isMountedRef.current) {
              setSubText(null);
            }
          }, 600);
          return;
        }

        // 2. 双路意图识别与复合召回查询强化构建
        const intentProfile = classifyTurnMemoryIntent(userInput);

        // 主动命令遗忘处理：清空防抖提炼队列并软删除最近 10 分钟非钢印瞬态记忆
        if (intentProfile.intent === 'FORGET_REQUEST' && roleCardId) {
          MemoryExtractionBatcher.shared.clearKey(`${space}:${roleCardId || threadId}`);
          await memoryRepository.softDeleteRecentTransientMemories(roleCardId, space).catch(() => {});
        }

        const recallQuery = buildEffectiveRecallQuery({
          currentUserInput: userInput,
          recentMessages: messagesRef.current,
          recentlyRecalledIds: recentlyRecalledMemoriesRef.current,
        });

        // 3. 异步并行召回 Top 4 情境记忆、L1 槽位/摘要、常驻核心设定、世代锚点与昨日手账钩子 (async-parallel)
        const [rawRecalled, slots, summaries, coreFacts, epochState, pendingDiaryHook] = await Promise.all([
          roleCardId ? retrieveRelevantMemories(roleCardId, space, recallQuery, 4, intentProfile) : Promise.resolve([]),
          roleCardId ? memoryRepository.listMemories(roleCardId, space, 'L1_SLOT') : Promise.resolve([]),
          roleCardId ? memoryRepository.listMemories(roleCardId, space, 'L1_SUMMARY') : Promise.resolve([]),
          roleCardId ? memoryRepository.listCoreProfileFacts(roleCardId, space, 8) : Promise.resolve([]),
          imEpochRepository.getOrCreateState(space, threadId, roleCardId || 'default'),
          peekThreadPendingDiaryHook(space, threadId).catch(() => null),
        ]);
        const recalled = filterCooldownRecalledMemories(rawRecalled, recentlyRecalledMemoriesRef.current, 3);
        for (const r of recalled) {
          recentlyRecalledMemoriesRef.current.add(r.id);
        }
        if (recentlyRecalledMemoriesRef.current.size > 15) {
          recentlyRecalledMemoriesRef.current = new Set([...recentlyRecalledMemoriesRef.current].slice(-8));
        }
        const l1Summary = summaries[0] ?? null;

        const effectiveModelId = threadSettingsRef.current.modelId || provider.modelId;
        const effectiveProviderId = threadSettingsRef.current.providerId || provider.providerId;
        const windowN = threadSettingsRef.current.contextWindowN || 20;

        // 读取锚点起全量已显影历史，防止连发 [BR] 多气泡把 active_anchor_msg_id 挤出 LIMIT 100 导致压缩失效
        const anchorLoadedHistory = await getContextMessagesFromAnchor(
          space,
          threadId,
          epochState.active_anchor_msg_id,
          Math.max(200, windowN * 6)
        ).catch(() => messagesRef.current);
        const contextHistory = anchorLoadedHistory.length > 0 ? anchorLoadedHistory : messagesRef.current;

        // 4. 双阶段世代锁步评估 (带动态参数与 SQLite 世代快照隔离 + 全量四维记忆回写)
        const lockstep = await epochLockstepCoordinator.evaluateAndAssemble(
          space,
          threadId,
          roleCardId || 'default',
          windowN,
          contextHistory,
          async (evictingSlice, prevSlot, prevSumm) => {
            try {
              const compPayload = buildShadowCompactionPayload({
                rolePrompt,
                l1Slots: slots,
                l1Summary,
                coreFacts,
                historyMessages: evictingSlice,
                windowN,
                epochSlotJson: prevSlot,
                epochSummaryJson: prevSumm,
              });
              const memProvider = await getMemoryModelProviderConfig(space);
              const compProviderConfig = memProvider || provider;
              const compModel = memProvider ? memProvider.modelId : effectiveModelId;
              const compProviderId = memProvider ? memProvider.providerId : effectiveProviderId;

              let compRaw = '';
              try {
                const compRes = await streamClient.completeText(compPayload, {
                  providerId: compProviderId,
                  modelId: compModel,
                  baseUrl: compProviderConfig.baseUrl,
                  apiKey: compProviderConfig.apiKey || undefined,
                  temperature: 0.1,
                });
                compRaw = compRes.text;
              } catch {
                for await (const chunk of streamClient.streamText(compPayload, {
                  providerId: effectiveProviderId,
                  modelId: effectiveModelId,
                  baseUrl: provider.baseUrl,
                  apiKey: provider.apiKey || undefined,
                })) {
                  compRaw += chunk;
                }
              }
              const parsed = extractJsonObject<FourDCompactionResult>(compRaw);
              if (!parsed) return null;

              if (roleCardId) {
                // 阶段 1 预提炼隔离：仅提炼 L2，禁止覆写持久层 L1 破坏活跃世代前缀缓存
                await memoryRepository.applyCompaction(roleCardId, space, parsed, { skipL1: true });
              }

              let mergedSlotJson = prevSlot;
              if (parsed.l1_slot_mutations && parsed.l1_slot_mutations.length > 0) {
                try {
                  const existingSlots = JSON.parse(prevSlot || '{}');
                  for (const mut of parsed.l1_slot_mutations) {
                    if (mut.op === 'DELETE') {
                      delete existingSlots[mut.slot];
                    } else {
                      existingSlots[mut.slot] = mut.value;
                    }
                  }
                  mergedSlotJson = JSON.stringify(existingSlots);
                } catch {
                  mergedSlotJson = prevSlot;
                }
              }

              return {
                slotJson: mergedSlotJson,
                summaryJson: parsed.episodic_continuity ? JSON.stringify(parsed.episodic_continuity) : prevSumm,
                l2Mutations: parsed.l2_memory_mutations,
              };
            } catch {
              return null;
            }
          },
          coreFacts
        );
        anchorMessageIdRef.current = lockstep.activeAnchorMessageId || undefined;

        // 阶段 2 跃迁同步：当世代原子翻转时，将 committed 的活跃槽位与摘要安全同步到持久层 L1 表中
        if (lockstep.didStepEpoch && roleCardId) {
          imEpochRepository.getOrCreateState(space, threadId, roleCardId).then(async (committed) => {
            if (committed.active_slot_json && committed.active_slot_json !== '{}') {
              try {
                const sObj = JSON.parse(committed.active_slot_json);
                for (const [k, v] of Object.entries(sObj)) {
                  if (typeof v === 'string') {
                    await memoryRepository.saveMemory({
                      id: `slot_${roleCardId}_${space}_${k}`,
                      roleCardId,
                      space,
                      tier: 'L1_SLOT',
                      category: k,
                      content: v,
                      triggerKeywords: [k],
                      entities: [],
                      importance: 10,
                      confidence: 1.0,
                      hitCount: 0,
                      isPinned: true,
                      createdAt: Date.now(),
                      lastAccessedAt: Date.now(),
                      sourceMode: 'im',
                    }, space, { alreadySieved: true });
                  }
                }
              } catch {}
            }
            if (committed.active_summary_json && committed.active_summary_json !== '{}') {
              try {
                await memoryRepository.saveMemory({
                  id: `summary_${roleCardId}_${space}`,
                  roleCardId,
                  space,
                  tier: 'L1_SUMMARY',
                  category: 'continuity_summary',
                  content: committed.active_summary_json,
                  triggerKeywords: [],
                  entities: [],
                  importance: 10,
                  confidence: 1.0,
                  hitCount: 0,
                  isPinned: true,
                  createdAt: Date.now(),
                  lastAccessedAt: Date.now(),
                  sourceMode: 'im',
                }, space, { alreadySieved: true });
              } catch {}
            }
          }).catch(() => {});
        }

        // 计算跨世代增量事实 (< 90 tokens)
        const midEpochDeltaFacts = computeMidEpochDeltaFacts(coreFacts, lockstep.activeCoreFactsJson);

        // 手账日记情境共振：当涉及日记追问或钩子时，装填最新日记实况
        let diaryContext: { diaryDate: string; title: string; content: string; moodTag?: string | null } | null = null;
        if (intentProfile.intent === 'DIARY_INQUIRY' || pendingDiaryHook || /(日记|手账|那篇|写了什么|你记的)/.test(userInput)) {
          try {
            const { getCompanionDiaries } = await import('../diary/repository/imDiaryRepository');
            const diaries = await getCompanionDiaries(space, threadId, 1);
            if (diaries && diaries.length > 0) {
              const d = diaries[0];
              diaryContext = {
                diaryDate: d.diaryDate,
                title: d.title,
                content: d.content,
                moodTag: d.moodTag,
              };
            }
          } catch {}
        }

        // 拟人度反机械质检与语气趋同分析
        const recentUserMsgs = contextHistory.filter((m) => m.role === 'user');
        const userStyle = analyzeUserStyle(recentUserMsgs);
        const styleEntrainmentNotice = buildStyleEntrainmentPrompt(userInput, userStyle);

        const recentAssistantBubbles = contextHistory
          .filter((m) => m.role === 'assistant')
          .map((m) => m.content);
        const starterNotice = detectRepetitiveStarters(recentAssistantBubbles);
        const questionNotice = detectExcessiveQuestions(recentAssistantBubbles);
        const diversityNotice = [starterNotice, questionNotice].filter(Boolean).join('\n') || null;

        // 动态规划本轮回复气泡形态 (单条/双条/连发/长段随性切换)
        const burstPlan = planBurstShape({
          userTextLength: userInput.length,
          hourOfDay: new Date().getHours(),
          load: livingStateRef.current?.activityLoad,
          recentShapes: recentBurstShapesRef.current,
        });
        recentBurstShapesRef.current = [...recentBurstShapesRef.current.slice(-3), burstPlan.shape];

        // 5. 五层不间断上下文装填 (Layer 1~5)
        const payload = buildChatPayload(
          {
            rolePrompt,
            roleName: companionName,
            l1Slots: slots,
            l1Summary,
            coreFacts,
            epochSlotJson: lockstep.activeSlotJson,
            epochSummaryJson: lockstep.activeSummaryJson,
            epochCoreFactsJson: lockstep.activeCoreFactsJson,
            midEpochDeltaFacts,
            milestones: threadSettingsRef.current.personalization?.milestones,
            evictedUpToTurn: lockstep.evictedUpToTurn,
            historyMessages: contextHistory,
            recalledMemories: recalled,
            livingState: livingStateRef.current || undefined,
            windowN,
            anchorMessageId: anchorMessageIdRef.current,
            currentImageBase64: imageBase64,
            voiceReplyEnabled: threadSettingsRef.current?.voiceReplyEnabled !== false,
            interruptedDraft: lastInterruptedDraftRef.current,
            pendingDiaryHook,
            diaryContext,
            personaAnchor: personaAnchorRef.current,
            styleEntrainmentNotice,
            diversityNotice,
            burstShapeHint: burstPlan.hint,
            retryWithoutReThinking: Boolean(isRetryPrompt),
          },
          userInput
        );
        lastInterruptedDraftRef.current = null;

        // 7. 边收边切分发流 (脱钩保护：即使退出页面或退至后台也继续写完落库)
        let thoughtHandlers = createThoughtHandlers();
        finalizeThoughtOnError = thoughtHandlers.finalizeThoughtOnError;
        rollbackThoughtOnError = thoughtHandlers.rollbackThought;
        discardIncompleteCurrentAttemptOnError = thoughtHandlers.discardIncompleteCurrentAttempt;
        hasPersistedThoughtFn = thoughtHandlers.hasPersistedThought;
        let parser = new TagAwareStreamParser({
          onThoughtProgress: thoughtHandlers.onThoughtProgress,
          onThoughtCompleted: thoughtHandlers.onThoughtCompleted,
          onDocumentStreamProgress: (evt) => {
            if (isMountedRef.current) {
              if (evt.status === 'streaming') {
                const headingInfo = evt.latestHeading ? ` · ${evt.latestHeading}` : '';
                setSubText(`正在起草文档: ${evt.title}${headingInfo}`);
              } else if (evt.status === 'compiling') {
                setSubText(`正在排版导出: ${evt.title}...`);
              }
            }
          },
        });
        parserInstance = parser;
        let fullRawResponse = '';
        lastDispatchedMsg = null;
        let recordedUsage = false;

        let streamAttempts = 0;
        const maxStreamAttempts = 2;
        while (streamAttempts < maxStreamAttempts) {
          streamAttempts++;
          try {
            fullRawResponse = '';
            const textStream = streamClient.streamText(payload, {
              providerId: effectiveProviderId,
              modelId: effectiveModelId,
              baseUrl: provider.baseUrl,
              apiKey: provider.apiKey,
              protocol: provider.protocol,
              supportsThinking: provider.supportsThinking,
              abortSignal: abortCtrl.signal,
              onUsage: (usage) => {
                recordedUsage = true;
                imUsageTelemetry.recordTurnUsage(space, threadId, usage, effectiveModelId, lockstep.epochVersion);
              },
            });

            for await (const chunk of textStream) {
              fullRawResponse += chunk;
              const sentences = parser.feed(chunk);
              if (isMountedRef.current) {
                if (parser.isThinking()) {
                  setSubText(threadSettingsRef.current.showThoughtBubble !== false ? '对方正在思考...' : '对方正在输入...');
                } else {
                  setSubText('对方正在输入...');
                }
              }
              let dispatchedAny = false;
              for (const s of sentences) {
                const m = await dispatcher.dispatchSentence(
                  s,
                  isMountedRef.current ? (ticker || undefined) : undefined,
                  { isOccupied, userTextLength: userInput.length, useHumanTimeline: true }
                );
                if (m) {
                  lastDispatchedMsg = m;
                  dispatchedAny = true;
                }
              }
              if (dispatchedAny && isMountedRef.current) {
                await reloadMessages();
              }
            }

            const trailing = parser.flush();
            let dispatchedTrailing = false;
            for (const s of trailing) {
              const m = await dispatcher.dispatchSentence(
                s,
                isMountedRef.current ? (ticker || undefined) : undefined,
                { isOccupied, userTextLength: userInput.length, useHumanTimeline: true }
              );
              if (m) {
                lastDispatchedMsg = m;
                dispatchedTrailing = true;
              }
            }
            if (dispatchedTrailing && isMountedRef.current) {
              await reloadMessages();
            }
            break;
          } catch (streamErr: any) {
            const isAborted = Boolean(
              abortCtrl.signal.aborted ||
              streamErr?.name === 'AbortError' ||
              /abort|cancel/i.test(streamErr?.message || '')
            );
            // 零台词透明自愈：只要尚未接收到任何正式对白台词 (!lastDispatchedMsg) 且非用户主动打断 (!isAborted)，
            // 即使中途产生过部分在途思考或握手发生抖动，也在 600ms 后静默重试 1 次（清理 Attempt 1 的半截思考并无感重新拉流）
            if (streamAttempts < maxStreamAttempts && !lastDispatchedMsg && !isAborted) {
              console.warn(`[ImChatSession] Stream error before dialogue on attempt ${streamAttempts}, attempting 1-shot transparent recovery:`, streamErr);
              await new Promise((resolve) => setTimeout(resolve, 600));
              if (!abortCtrl.signal.aborted) {
                // 安全撤销清理 attempt 1 的在途思考残片，避免重连时界面重影或重复存储
                if (discardIncompleteCurrentAttemptOnError) {
                  try {
                    await discardIncompleteCurrentAttemptOnError();
                  } catch {}
                }
                inFlightThoughtMsgRef.current = null;
                fullRawResponse = '';
                if (isMountedRef.current) {
                  setSubText('对方正在输入...');
                }
                thoughtHandlers = createThoughtHandlers();
                finalizeThoughtOnError = thoughtHandlers.finalizeThoughtOnError;
                rollbackThoughtOnError = thoughtHandlers.rollbackThought;
                discardIncompleteCurrentAttemptOnError = thoughtHandlers.discardIncompleteCurrentAttempt;
                hasPersistedThoughtFn = thoughtHandlers.hasPersistedThought;
                parser = new TagAwareStreamParser({
                  onThoughtProgress: thoughtHandlers.onThoughtProgress,
                  onThoughtCompleted: thoughtHandlers.onThoughtCompleted,
                  onDocumentStreamProgress: (evt) => {
                    if (isMountedRef.current) {
                      if (evt.status === 'streaming') {
                        const headingInfo = evt.latestHeading ? ` · ${evt.latestHeading}` : '';
                        setSubText(`正在起草文档: ${evt.title}${headingInfo}`);
                      } else if (evt.status === 'compiling') {
                        setSubText(`正在排版导出: ${evt.title}...`);
                      }
                    }
                  },
                });
                parserInstance = parser;
                continue;
              }
            }
            throw streamErr;
          }
        }

        // 7.4. 文档卡片分发 (新建流与补丁流双轨支持)
        const patchTag = parseDocumentPatchTag(fullRawResponse);
        if (patchTag) {
          const docMsg = await dispatcher.dispatchDocumentPatch(
            patchTag,
            isMountedRef.current ? (ticker || undefined) : undefined
          );
          lastDispatchedMsg = docMsg;
          if (isMountedRef.current) {
            await reloadMessages();
          }
        } else {
          const docTag = parseDocumentTag(fullRawResponse);
          if (docTag) {
            const docMsg = await dispatcher.dispatchDocument(
              { title: docTag.title, uri: docTag.uri, content: docTag.content },
              isMountedRef.current ? (ticker || undefined) : undefined
            );
            lastDispatchedMsg = docMsg;
            if (isMountedRef.current) {
              await reloadMessages();
            }
          }
        }

        // 7.5. 尾锚定大表情贴纸分发 (Tail-Anchor Reordering & Cooldown Hard Gate)
        const stickerTag = parseStickerTag(fullRawResponse);
        if (stickerTag) {
          const stickerRes = await dispatcher.dispatchSticker(
            stickerTag.emotion,
            isMountedRef.current ? (ticker || undefined) : undefined,
            { personaStyle: threadSettingsRef.current?.personalization?.replyStyleGear || undefined }
          );
          if (stickerRes.dispatched && stickerRes.message) {
            lastDispatchedMsg = stickerRes.message;
            if (isMountedRef.current) {
              await reloadMessages();
            }
          } else if (
            stickerRes.reason === 'cooldown_intercepted' &&
            stickerRes.compensationEmoji &&
            lastDispatchedMsg
          ) {
            // 冷却拦截且本轮未发 Emoji 时，无感补偿追加 1 个对应 Unicode Emoji
            const hasEmoji = EMOJI_DETECTION_REGEX.test(lastDispatchedMsg.content);
            if (!hasEmoji) {
              const compensated = `${lastDispatchedMsg.content} ${stickerRes.compensationEmoji}`;
              await updateImMessageContent(space, lastDispatchedMsg.id, compensated);
              lastDispatchedMsg.content = compensated;
              if (isMountedRef.current) {
                await reloadMessages();
              }
            }
          }
        } else {
          dispatcher.advanceTurnWithoutSticker();
        }

        // 7.6. 零正文防哑火哨兵 (Zero-Dialogue Guard)
        // 若流正常结束，模型输出了思考但没有任何对白气泡落地 (lastDispatchedMsg === null)：
        // 绝不伪造任何口语敷衍假消息，诚实完成思考落库并呈送系统重试胶囊
        if (!lastDispatchedMsg) {
          if (finalizeThoughtOnError) {
            await finalizeThoughtOnError(false);
          }
          const hasThought = hasPersistedThoughtFn ? hasPersistedThoughtFn() : false;
          await emitStreamErrorNotice(hasThought);
        }

        // 若大模型接口未返回 include_usage，启用高精度字元 Token 兜底估算，杜绝抽屉显示“待首次生成”
        if (!recordedUsage) {
          const promptChars = payload.map((m) => (typeof m.content === 'string' ? m.content : '')).join('');
          const promptTok = estimateImTokens(promptChars);
          const compTok = estimateImTokens(fullRawResponse);
          const prefixChars = payload.slice(0, 2).map((m) => (typeof m.content === 'string' ? m.content : '')).join('');
          const cachedTok = estimateImTokens(prefixChars);
          imUsageTelemetry.recordTurnUsage(
            space,
            threadId,
            {
              promptTokens: promptTok,
              completionTokens: compTok,
              cachedPromptTokens: cachedTok,
              cacheHitRatio: promptTok > 0 ? cachedTok / promptTok : 0,
            },
            effectiveModelId,
            lockstep.epochVersion
          );
        }

        // 若用户已离开当前聊天窗口，按打字延迟自动将 revealing 显影为 delivered 并点亮会话列表红点
        if (!isMountedRef.current && lastDispatchedMsg) {
          scheduleDetachedReveal(space, threadId, lastDispatchedMsg.visibleAt, () => livingStateRef.current);
        }

        // 成功落地 AI 气泡后确认消费次日手账钩子
        if (lastDispatchedMsg && pendingDiaryHook) {
          ackThreadPendingDiaryHook(space, threadId).catch(() => {});
        }

        // 召回记忆回响验证：若伴侣在对白中自然回响了召回记忆，记录有效命中并加权
        if (roleCardId && recalled && recalled.length > 0 && lastDispatchedMsg) {
          memoryRepository.verifyAndRecordEchoHits(roleCardId, space, recalled, fullRawResponse).catch(() => {});
        }

        // 8~14 仅在正式生成对白成功落地时触发生活状态机、心跳、记忆提取与追问；流失败/零对白时严禁副作用外溢
        if (lastDispatchedMsg) {
          // 8. 解析伴侣生活状态机推进 [STATUS: ...]（若模型未输出但状态已过期，自动按时段刷新）
          const nowAfterReply = Date.now();
          const statusUpdate = parseStatusTag(fullRawResponse);
          let updatedLiving: ImCompanionLivingState | undefined;
          if (statusUpdate) {
            updatedLiving = advanceLivingState(livingStateRef.current || undefined, statusUpdate, nowAfterReply);
            livingStateRef.current = updatedLiving;
            if (isMountedRef.current) {
              setLivingState(updatedLiving);
            }
            void updateThreadLivingState(space, threadId, updatedLiving);
          } else if (shouldSeedOrRefreshLivingState(livingStateRef.current, nowAfterReply)) {
            updatedLiving = buildDefaultLivingState(nowAfterReply, livingStateRef.current);
            livingStateRef.current = updatedLiving;
            if (isMountedRef.current) {
              setLivingState(updatedLiving);
            }
            void updateThreadLivingState(space, threadId, updatedLiving);
          }

          // 9. 解析 AI 主动拍一拍 [NUDGE: ...]
          const aiNudge = parseNudgeTag(fullRawResponse);
          if (aiNudge) {
            if (isMountedRef.current) {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            const cleanSuffix = aiNudge.action.startsWith('的') ? aiNudge.action.slice(1).trim() : aiNudge.action;
            const noticeMsg: ImMessage = {
              id: `notice_${Date.now()}_ai_nudge`,
              threadId,
              role: 'system',
              content: `${companionName} 拍了拍你的${cleanSuffix}`,
              type: 'system_notice',
              status: 'sent',
              deliveryStatus: 'delivered',
              visibleAt: Date.now(),
              createdAt: new Date().toISOString(),
            };
            await insertImMessage(space, noticeMsg);
            if (isMountedRef.current) {
              await reloadMessages();
            }
          }

          // 10. 解析预埋心跳气泡 [HEARTBEAT: ...] 并同步挂载 Android 系统后台闹钟
          const heartbeat = parseHeartbeatTag(fullRawResponse);
          const wasRescuedAsMainDialogue = Boolean(
            heartbeat && lastDispatchedMsg.content.trim() === heartbeat.message.trim()
          );
          if (heartbeat && !wasRescuedAsMainDialogue) {
            const currentOrNewState = updatedLiving || livingStateRef.current;
            const consistentHb = currentOrNewState
              ? validateHeartbeatConsistency(heartbeat, currentOrNewState)
              : heartbeat;
            if (
              consistentHb &&
              threadSettingsRef.current.heartbeatEnabled !== false &&
              globalSettingsRef.current.globalHeartbeatEnabled !== false
            ) {
              const pacingState = await getThreadPacingState(space, threadId).catch(() => ({ consecutiveUnreplied: 0, lastUserInteractionAt: null }));
              const pacingDecision = evaluateProactivePacing(
                pacingState.consecutiveUnreplied,
                pacingState.lastUserInteractionAt,
                nowAfterReply
              );
              if (pacingDecision.allowHeartbeat) {
                // 拟人短周期心跳气泡 (5s~3min)，杜绝被后台长周期退避 (30min~2h) 错误夹断
                const safeDelayMs = Math.max(5000, Math.min(180000, consistentHb.delayMs));
                const hbMsg = await dispatcher.dispatchStagedHeartbeat(
                  consistentHb.message,
                  safeDelayMs,
                  isMountedRef.current ? (ticker || undefined) : undefined
                );
                if (hbMsg.visibleAt) {
                  void scheduleStagedMessageAlarm(threadId, hbMsg.visibleAt, space);
                }
              }
            }
          }

          // 11. 解析预约主动闹钟 [PING: ...]；若模型未显式输出标签，启用三阶退避+情境感知确定性兜底闹钟！
          if (
            threadSettingsRef.current.proactiveEnabled !== false &&
            globalSettingsRef.current.globalHeartbeatEnabled !== false
          ) {
            const effectiveDnd = resolveEffectiveDnd(
              threadSettingsRef.current,
              {
                enabled: globalSettingsRef.current?.globalDndEnabled,
                startTime: globalSettingsRef.current?.globalDndStartTime,
                endTime: globalSettingsRef.current?.globalDndEndTime,
              }
            );
            const explicitPing = parsePingTag(
              fullRawResponse,
              nowAfterReply,
              updatedLiving || livingStateRef.current || undefined,
              effectiveDnd
            );
            const effectivePing =
              explicitPing ||
              planFallbackProactivePing({
                consecutiveUnreplied: 0,
                lastUserInteractionAt: nowAfterReply,
                lastUserText: userInput,
                livingState: updatedLiving || livingStateRef.current,
                now: nowAfterReply,
                dndConfig: effectiveDnd,
                proactiveFrequencyGear: threadSettingsRef.current.personalization?.proactiveFrequencyGear,
              });
            if (effectivePing) {
              await savePendingPing(space, threadId, effectivePing.targetTimestamp, effectivePing.intent);
              void scheduleProactivePingAlarm(threadId, effectivePing.targetTimestamp, space);
            }
          }

          // 12. 真实对话轮次推进：如果本轮触发了世代跃迁，刷新活跃锚点
          if (lockstep.didStepEpoch) {
            anchorMessageIdRef.current = lockstep.activeAnchorMessageId || undefined;
          }

          // 13. 高显著性异步记忆模型提炼 (采用全局防抖批处理器 MemoryExtractionBatcher)
          if (roleCardId && intentProfile.invokeMemoryModel) {
            MemoryExtractionBatcher.shared.enqueue({
              space,
              roleCardId,
              chatProviderId: effectiveProviderId,
              chatModelId: effectiveModelId,
              userMessage: userInput,
              assistantMessage: fullRawResponse,
              existingFacts: coreFacts,
              isTyping: () => Boolean(inputDraftRef.current && inputDraftRef.current.trim().length > 0),
            });
          }

          // 14. 伴侣自主决断追问时钟与情境静默判定 (Ask AI when to followup)
          const situation = detectSituationalDelay(userInput);
          if (situation) {
            // 用户处于开会、洗澡、睡觉等明确离开场景，阻断前台急促追聊
            followupDelayToSchedule = null;
          } else {
            const proactiveDecision = parseProactiveDecision(fullRawResponse);
            if (proactiveDecision.action === 'pass' || proactiveDecision.nextFollowupMs === 0) {
              // AI 决断当前话题自然收束或保持体贴静默
              followupDelayToSchedule = null;
            } else if (proactiveDecision.nextFollowupMs && proactiveDecision.nextFollowupMs > 0) {
              // AI 自主指定了下次追问时间 (如 45s, 1m)
              followupDelayToSchedule = proactiveDecision.nextFollowupMs;
            } else {
              // 常规成功完成，按系统人性化延时进入第一阶段追问观察
              followupDelayToSchedule = undefined;
            }
          }
        } else {
          // 未发出正式台词时，阻断后续追问计划
          followupDelayToSchedule = null;
        }
      } catch (err: any) {
        caughtAbort = Boolean(
          abortCtrl.signal.aborted ||
          err?.name === 'AbortError' ||
          /abort|cancel/i.test(err?.message || '')
        );
        if (!caughtAbort) {
          console.warn('[ImChatSession] Stream error occurred during generation:', err);
          // 1. 紧急抢救：大模型可能在流断开前已吐出台词正文（但未遇到 [BR] 滞留在 parser 内部缓冲区）
          // 在判定失败前，先紧急 flush 冲刷抢救正文！
          if (parserInstance) {
            try {
              const trailing = parserInstance.flush();
              let rescuedAny = false;
              for (const s of trailing) {
                const m = await dispatcher.dispatchSentence(
                  s,
                  isMountedRef.current ? (ticker || undefined) : undefined,
                  { isOccupied, userTextLength: userInput.length, useHumanTimeline: false }
                );
                if (m) {
                  lastDispatchedMsg = m;
                  rescuedAny = true;
                }
              }
              if (rescuedAny && isMountedRef.current) {
                await reloadMessages();
              }
            } catch (flushErr) {
              console.warn('[ImChatSession] Emergency flush on stream error failed:', flushErr);
            }
          }

          // 2. 闭合并安全落库在途思考（杜绝抹杀半截思考成果）
          if (finalizeThoughtOnError) {
            await finalizeThoughtOnError(false);
          }

          // 3. 若依然没有成功发出任何正文台词：
          if (!lastDispatchedMsg) {
            const hasThought = hasPersistedThoughtFn ? hasPersistedThoughtFn() : false;
            await emitStreamErrorNotice(hasThought);
          }
        }
      } finally {
        if (finalizeThoughtOnError) {
          const wasAborted = caughtAbort || Boolean(abortCtrl.signal.aborted);
          await finalizeThoughtOnError(wasAborted);
        }
        unregisterActiveStream(space, threadId, abortCtrl);
        isStreamingRef.current = false;
        if (isMountedRef.current) {
          if (!tickerRef.current?.isRevealing()) {
            setSubText(null);
          }
          if (followupDelayToSchedule !== null) {
            scheduleInactivityAutoReply(followupDelayToSchedule);
          }
        }
      }
    },
    [threadId, space, roleCardId, rolePrompt, companionName, reloadMessages, scheduleInactivityAutoReply]
  );

  const triggerByThreadKeyRef = useRef<Map<string, (userInput: string, imageBase64?: string | null, isRetryPrompt?: boolean) => Promise<void>>>(new Map());
  triggerByThreadKeyRef.current.set(`${space}:${threadId}`, triggerAiResponse);

  // 初始化输入聚合器 (卸载或切换伴侣会话时若存在刚发出尚在 2s 防抖窗内的用户消息，立即精准投递至原会话后台生成！)
  useEffect(() => {
    const boundKey = `${space}:${threadId}`;
    const waitMs = (globalSettings.debounceWaitSec ?? 0) * 1000;
    const agg = new InputAggregator(
      (combinedText) => {
        const targetTrigger = triggerByThreadKeyRef.current.get(boundKey);
        if (targetTrigger) {
          void targetTrigger(combinedText);
        }
      },
      waitMs,
      () => inputDraftRef.current.trim().length === 0
    );
    aggregatorRef.current = agg;

    return () => {
      agg.flush();
    };
  }, [space, threadId, globalSettings.debounceWaitSec]);

  // 统一提取 0ms 用户主动抢占熔断器（消除文本/相机/相册/IP素材四处重复代码）
  const interruptCompanionActivity = useCallback(async (awaitPendingRollback: boolean = false) => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    idleStageRef.current = 0;
    hasAutoRepliedInRoundRef.current = false;

    abortControllerRef.current?.abort();
    abortActiveStream(space, threadId);
    cancelInFlightWakeup(space, threadId);
    tickerRef.current?.stop();
    dispatcherRef.current?.cancelPendingBurst();

    void cancelStagedMessages(space, threadId, 'cancelled_by_user')
      .then((res) => {
        if (res.interruptedDraft && !lastInterruptedDraftRef.current) {
          lastInterruptedDraftRef.current = res.interruptedDraft;
        }
      })
      .catch(() => {});
    void cancelStagedMessageAlarm(threadId);
    void clearPendingPing(space, threadId);
    void cancelProactivePingAlarm(threadId);

    if (awaitPendingRollback) {
      await imMessageRollback.cancelFuturePendingBubbles(threadId, space);
    } else {
      void imMessageRollback.cancelFuturePendingBubbles(threadId, space);
    }
  }, [space, threadId]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // 若当前为修改消息重发，先截断目标消息及之后的所有历史记录
    if (editingMessageRef.current) {
      const targetMsg = editingMessageRef.current;
      editingMessageRef.current = null;
      setFillDraftText(null);
      await imMessageRollback.truncateAfterMessage(threadId, targetMsg.createdAt, space);
      anchorMessageIdRef.current = (await imEpochRepository.verifyAndHealAnchor(space, threadId)) || undefined;
      await reloadMessages();
    }

    await interruptCompanionActivity(false);

    const userMsg: ImMessage = {
      id: `im_msg_${Date.now()}_u`,
      threadId,
      role: 'user',
      content: trimmed,
      status: 'sent',
      visibleAt: null,
      createdAt: new Date().toISOString(),
    };

    // 立即乐观上屏并送入聚合器即刻触发大模型，绝不因 SQLite 磁盘 I/O 阻塞首字时间 (TTFT)
    setMessages((prev) => [...prev, userMsg]);
    aggregatorRef.current?.push(trimmed);
    void insertImMessage(space, userMsg);
  };

  const handleSendVoice = async (voiceData: { audioUri: string; durationMs: number; transcription?: string }) => {
    if (editingMessageRef.current) {
      editingMessageRef.current = null;
      setFillDraftText(null);
    }
    await interruptCompanionActivity(false);

    const initialText = voiceData.transcription?.trim() || '';

    // 防御性拦截任何 mock 虚拟音频路径，绝不上屏与入库任何假气泡语音
    if (!voiceData.audioUri || voiceData.audioUri.includes('mock')) {
      if (initialText) {
        void handleSend(initialText);
      }
      return;
    }

    const voiceMsgId = `im_msg_${Date.now()}_u`;

    // 将录制的临时音频安全复制到 Pixory 用户空间永久语音目录，杜绝系统清理 Cache 或转文字清理导致的音频丢失
    let effectiveAudioUri = voiceData.audioUri;
    try {
      const permanentDir = `${FileSystem.documentDirectory || ''}voice_messages/${space}/`;
      const dirInfo = await FileSystem.getInfoAsync(permanentDir).catch(() => null);
      if (!dirInfo?.exists) {
        await FileSystem.makeDirectoryAsync(permanentDir, { intermediates: true }).catch(() => {});
      }
      const permanentUri = `${permanentDir}${voiceMsgId}.m4a`;
      await FileSystem.copyAsync({ from: voiceData.audioUri, to: permanentUri });
      effectiveAudioUri = permanentUri;
    } catch {
      effectiveAudioUri = voiceData.audioUri;
    }

    const rawVoicePayload = JSON.stringify({
      type: 'voice',
      audioUri: effectiveAudioUri,
      durationMs: voiceData.durationMs,
      transcription: initialText,
      isPlayed: true,
    });

    const userMsg: ImMessage = {
      id: voiceMsgId,
      threadId,
      role: 'user',
      content: rawVoicePayload,
      type: 'voice',
      voice: {
        audioUri: effectiveAudioUri,
        durationMs: voiceData.durationMs,
        transcription: initialText,
        isPlayed: true,
      },
      status: 'sent',
      visibleAt: null,
      createdAt: new Date().toISOString(),
    };

    // 立即乐观上屏并持久化
    setMessages((prev) => [...prev, userMsg]);
    void insertImMessage(space, userMsg);

    if (initialText) {
      aggregatorRef.current?.push(`[语音消息]: ${initialText}`);
      return;
    }

    // 后台静默 ASR 转录并送入大模型，确保伴侣听到并回复
    void (async () => {
      try {
        const text = await asrService.transcribeAudio(effectiveAudioUri, { space, keepFile: true });
        const transcribed = text?.trim() || '';
        if (transcribed) {
          const updatedVoicePayload = JSON.stringify({
            type: 'voice',
            audioUri: effectiveAudioUri,
            durationMs: voiceData.durationMs,
            transcription: transcribed,
            isPlayed: true,
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === voiceMsgId
                ? {
                    ...m,
                    content: updatedVoicePayload,
                    voice: { ...m.voice!, transcription: transcribed },
                  }
                : m
            )
          );
          await updateImMessageVoice(space, voiceMsgId, {
            audioUri: effectiveAudioUri,
            durationMs: voiceData.durationMs,
            transcription: transcribed,
            isPlayed: true,
          }).catch(() => {});
          aggregatorRef.current?.push(`[语音消息]: ${transcribed}`);
        } else {
          aggregatorRef.current?.push('[发送了一条语音消息]');
        }
      } catch {
        aggregatorRef.current?.push('[发送了一条语音消息]');
      }
    })();
  };

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setSessionDialog({
        visible: true,
        title: '提示',
        message: '请允许访问相机',
        primaryLabel: '我知道了',
        secondaryLabel: null,
        onPrimary: closeSessionDialog,
      });
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled && res.assets[0]?.uri) {
      await interruptCompanionActivity(true);

      const msg: ImMessage = {
        id: `im_msg_${Date.now()}_u`,
        threadId,
        role: 'user',
        type: 'image',
        imageUri: res.assets[0].uri,
        content: '[图片]',
        status: 'sent',
        visibleAt: null,
        createdAt: new Date().toISOString(),
      };
      await insertImMessage(space, msg);
      setMessages((prev) => [...prev, msg]);
      void triggerAiResponse('我刚拍了张照片给你看~');
    }
  };

  const handlePhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!res.canceled && res.assets[0]?.uri) {
      await interruptCompanionActivity(true);

      const uri = res.assets[0].uri;
      const msg: ImMessage = {
        id: `im_msg_${Date.now()}_u`,
        threadId,
        role: 'user',
        type: 'image',
        imageUri: uri,
        content: '[图片]',
        status: 'sent',
        visibleAt: null,
        createdAt: new Date().toISOString(),
      };
      await insertImMessage(space, msg);
      setMessages((prev) => [...prev, msg]);

      let base64: string | null = null;
      try {
        base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        // 容错
      }
      void triggerAiResponse('分享了一张照片给你~', base64);
    }
  };

  const handleSendSticker = async (sticker: { id?: string; name: string; animatedUri: string }) => {
    await interruptCompanionActivity(false);

    const msg: ImMessage = {
      id: `im_msg_${Date.now()}_u`,
      threadId,
      role: 'user',
      type: 'sticker',
      imageUri: sticker.animatedUri,
      content: sticker.name,
      metadata: {
        sticker: {
          id: sticker.id || sticker.name,
          name: sticker.name,
          animatedUri: sticker.animatedUri,
        },
      },
      status: 'sent',
      visibleAt: null,
      createdAt: new Date().toISOString(),
    };
    await insertImMessage(space, msg);
    setMessages((prev) => [...prev, msg]);
    void triggerAiResponse(`（对方没有打字，向你发来一张「${sticker.name}」表情贴纸）`);
  };

  const handleFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      if (asset && asset.name) {
        await interruptCompanionActivity(true);

        const { CasBlobStore } = await import('../../services/agent/vfs/casBlobStore');
        const casStore = new CasBlobStore();
        let casHash: string | undefined;
        let casUri = asset.uri;
        let sizeBytes = asset.size || 0;

        try {
          const ingestRes = await casStore.ingestFileUri(asset.uri, space, asset.name);
          if (ingestRes.sizeBytes > 0) {
            casHash = ingestRes.blobHash;
            casUri = ingestRes.casUri;
            sizeBytes = ingestRes.sizeBytes;
          }
        } catch {
          // 容错保持本地缓存 URI
          casUri = asset.uri;
        }

        // 提取骨架概览与统计信息 (tocSkeleton, charCount, pageCount, extractedText)
        let tocSkeleton: Array<{ blockId: string; previewText: string }> | undefined;
        let charCount: number | undefined;
        let pageCount: number | undefined;
        let extractedText: string | undefined;

        const isPdf = /\.pdf$/i.test(asset.name);
        const isDocx = /\.docx$/i.test(asset.name);
        const isPptx = /\.(?:pptx|ppt)$/i.test(asset.name);
        const targetUri = casUri || asset.uri;

        if (isPdf) {
          try {
            const { extractPdfText, getPdfPageCount } = await import('../../native/pixoryMediaModule');
            try {
              pageCount = await getPdfPageCount(targetUri);
            } catch {}
            try {
              const res = await extractPdfText(targetUri);
              if (res?.pageCount && !pageCount) pageCount = res.pageCount;
              if (res?.text) {
                extractedText = res.text;
                charCount = res.text.replace(/[\s\r\n]+/g, '').length;
                const lines = res.text
                  .split(/\r?\n/)
                  .map((l) => l.trim())
                  .filter((l) => l.length > 0 && !/^\d+$/.test(l));
                tocSkeleton = lines.slice(0, 4).map((l, idx) => ({
                  blockId: `[[BLK_PDF_${idx}]]`,
                  previewText: l.slice(0, 24),
                }));
              }
            } catch {}
          } catch {}
        } else if (isDocx) {
          try {
            const { parseDocxText } = await import('../../ai/documentParsers/docxParser');
            const docxRes = await parseDocxText({ fileUri: targetUri, space });
            if (docxRes.text) {
              extractedText = docxRes.text;
              charCount = docxRes.text.replace(/[\s\r\n]+/g, '').length;
              const paragraphs = docxRes.text
                .split(/\n\n+/)
                .map((p) => p.trim())
                .filter(Boolean);
              tocSkeleton = paragraphs.slice(0, 4).map((p, idx) => ({
                blockId: `[[BLK_DOCX_${idx}]]`,
                previewText: p.slice(0, 24),
              }));
            }
          } catch {}
        } else if (isPptx) {
          try {
            const { parsePptx } = await import('../../ai/documentParsers/pptxParser');
            const pptxRes = await parsePptx({ fileUri: targetUri, space });
            if (pptxRes.text) {
              extractedText = pptxRes.text;
              charCount = pptxRes.text.replace(/[\s\r\n]+/g, '').length;
              pageCount = pptxRes.slideCount;
              tocSkeleton = pptxRes.slides.slice(0, 4).map((s) => ({
                blockId: `[[BLK_PPTX_${s.index}]]`,
                previewText: `第${s.index}页: ${s.title.slice(0, 20)}`,
              }));
            }
          } catch {}
        } else {
          try {
            const { DocumentDriverRegistry } = await import('../../services/sandbox/drivers/driverRegistry');
            const { MarkdownDriver } = await import('../../services/sandbox/drivers/markdownDriver');
            const { DocxDriver } = await import('../../services/sandbox/drivers/docxDriver');
            const registry = new DocumentDriverRegistry([new MarkdownDriver(), new DocxDriver()]);
            if (registry.hasDriver(asset.name)) {
              const driver = registry.getDriver(asset.name);
              if (casHash) {
                const rawBytes = await casStore.getBlob(casHash, space);
                if (rawBytes) {
                  const skeletons = await driver.inspectSkeleton(rawBytes);
                  tocSkeleton = skeletons.slice(0, 4).map((s) => ({
                    blockId: s.blockId,
                    previewText: s.previewText.slice(0, 24),
                  }));
                  const totalPreview = skeletons.map((s) => s.previewText).join('');
                  if (totalPreview.length > 0) {
                    charCount = totalPreview.length;
                  }
                }
              }
            }
            if (!extractedText) {
              const text = await FileSystem.readAsStringAsync(targetUri, {
                encoding: FileSystem.EncodingType.UTF8,
              });
              if (text && text.trim().length > 0) {
                extractedText = text;
                charCount = text.replace(/[\s\r\n]+/g, '').length;
                if (!tocSkeleton) {
                  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                  tocSkeleton = lines.slice(0, 4).map((l, idx) => ({
                    blockId: `[[BLK_TXT_${idx}]]`,
                    previewText: l.slice(0, 24),
                  }));
                }
              }
            }
          } catch {}
        }

        const msg: ImMessage = {
          id: `im_msg_${Date.now()}_u`,
          threadId,
          role: 'user',
          type: 'document',
          content: asset.name,
          metadata: {
            document: {
              uri: asset.uri,
              casUri,
              casHash,
              name: asset.name,
              title: asset.name,
              size: sizeBytes,
              sizeBytes,
              charCount,
              pageCount,
              extractedText,
              tocSkeleton,
            },
          },
          status: 'sent',
          visibleAt: null,
          createdAt: new Date().toISOString(),
        };
        await insertImMessage(space, msg);
        setMessages((prev) => [...prev, msg]);
        void triggerAiResponse(`我发给你了一份文档《${asset.name}》，帮我看看。`);
      } else {
        void handleSend(`[文件] ${asset.name} (${Math.round((asset.size || 0) / 1024)} KB)`);
      }
    }
  };

  const handleIpSend = async (payload: SelectedIpImagePayload) => {
    await interruptCompanionActivity(true);

    let firstBase64: string | null = null;
    for (const img of payload.images) {
      const msg: ImMessage = {
        id: `im_msg_${Date.now()}_${img.id}`,
        threadId,
        role: 'user',
        type: 'image',
        imageUri: img.uri,
        boundIpName: payload.ipName,
        content: `[IP素材: ${payload.ipName}]`,
        status: 'sent',
        visibleAt: null,
        createdAt: new Date().toISOString(),
      };
      await insertImMessage(space, msg);
      setMessages((prev) => [...prev, msg]);

      if (!firstBase64 && img.uri) {
        try {
          firstBase64 = await FileSystem.readAsStringAsync(img.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch {
          // 容错
        }
      }
    }
    void triggerAiResponse(`给你分享了【${payload.ipName}】的素材图片~`, firstBase64);
  };

  const handleLongPress = (msg: ImMessage, pageX = 180, pageY = 320) => {
    setActiveMessageForMenu(msg);
    setMenuAnchor({ x: pageX, y: pageY });
    setActionMenuVisible(true);
  };

  const handleDeleteMessage = async (msg: ImMessage) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await imMessageRollback.deleteMessage(msg.id, space);
    anchorMessageIdRef.current = (await imEpochRepository.verifyAndHealAnchor(space, threadId)) || undefined;
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
  };

  const handleEditResend = (msg: ImMessage) => {
    editingMessageRef.current = msg;
    setFillDraftText(msg.content);
    setActionMenuVisible(false);
  };

  const handleToggleVoiceTranscript = useCallback(async (msg: ImMessage) => {
    const isCurrentlyExpanded = Boolean(msg.metadata?.isTranscriptExpanded);
    const nextExpanded = !isCurrentlyExpanded;

    if (!nextExpanded) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                metadata: { ...(m.metadata || {}), isTranscriptExpanded: false },
              }
            : m
        )
      );
      return;
    }

    const existingText =
      msg.voice?.transcription ||
      msg.content.replace(VOICE_PREFIX_STRIP_REGEX, '$1').trim();

    if (existingText) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                metadata: { ...(m.metadata || {}), isTranscriptExpanded: true },
              }
            : m
        )
      );
      return;
    }

    // 缺失转写文本且存在音频文件：标记转写中并异步调取 ASR
    if (msg.voice?.audioUri) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                metadata: {
                  ...(m.metadata || {}),
                  isTranscriptExpanded: true,
                  isTranscribing: true,
                },
              }
            : m
        )
      );

      try {
        const transcribedText = await asrService.transcribeAudio(msg.voice.audioUri, { space });
        const updatedVoice = {
          ...msg.voice,
          transcription: transcribedText || '未能识别到清晰语音',
        };
        await updateImMessageVoice(space, msg.id, updatedVoice);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  voice: updatedVoice,
                  metadata: {
                    ...(m.metadata || {}),
                    isTranscriptExpanded: true,
                    isTranscribing: false,
                  },
                }
              : m
          )
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  metadata: {
                    ...(m.metadata || {}),
                    isTranscriptExpanded: true,
                    isTranscribing: false,
                  },
                }
              : m
          )
        );
        if (Platform.OS === 'android') {
          ToastAndroid.show('转文字失败，请检查网络或配置', ToastAndroid.SHORT);
        }
      }
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                metadata: { ...(m.metadata || {}), isTranscriptExpanded: true },
              }
            : m
        )
      );
    }
  }, [space]);

  const handleSpeakMessage = useCallback(async (msg: ImMessage) => {
    if (!msg.content) return;
    const cleanText = msg.content
      .replace(/\[(STATUS|MOOD|STICKER|HEARTBEAT|VOICE|NUDGE|PING|DOCUMENT|DOC)(?:[:：][^\]]+|\][:：]?[^\]\n]*)?\]?/gi, '')
      .replace(/\[BR\]/g, '\n')
      .trim();
    if (!cleanText) return;

    if (voiceService.isPlaying(msg.id)) {
      await voiceService.stop();
      return;
    }

    try {
      await runWithDatabaseSpace(space, async (db) => {
        await voiceService.speak(
          cleanText,
          {
            db,
            space,
            scopeType: 'thread_im',
            threadId,
          },
          msg.id
        );
      });
    } catch (err: any) {
      if (Platform.OS === 'android') {
        const errorText = err instanceof Error ? err.message : '朗读失败';
        ToastAndroid.show(errorText, ToastAndroid.SHORT);
      }
    }
  }, [space, threadId]);

  const handleRetryMessage = useCallback(async (msg: ImMessage) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await imMessageRollback.deleteMessage(msg.id, space);
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    if (msg.role === 'user') {
      if (msg.type === 'image' && msg.imageUri) {
        let base64: string | null = null;
        try {
          base64 = await FileSystem.readAsStringAsync(msg.imageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch {}
        void triggerAiResponse(msg.content || '给你分享了一张图片', base64);
      } else {
        void handleSend(msg.content);
      }
    } else if (msg.type === 'system_notice') {
      // 避免流控制器并发竞态：微任务延时让出，确保旧流完全终止解除注册后再发起重试
      await new Promise((resolve) => setTimeout(resolve, 60));

      let lastUserIdx = -1;
      for (let i = messagesRef.current.length - 1; i >= 0; i--) {
        if (messagesRef.current[i].role === 'user' && messagesRef.current[i].content) {
          lastUserIdx = i;
          break;
        }
      }
      const lastUser = lastUserIdx !== -1 ? messagesRef.current[lastUserIdx] : null;

      // 原地重试防御：仅当 lastUser 之后存在孤立或中断的 thought 气泡时，才原地清理，严禁误删前序回合的思考记录
      if (lastUserIdx !== -1) {
        const trailingThoughts = messagesRef.current.slice(lastUserIdx + 1).filter((m) => m.type === 'thought');
        for (const t of trailingThoughts) {
          await imMessageRollback.deleteMessage(t.id, space);
        }
        if (trailingThoughts.length > 0) {
          const trailingIds = new Set(trailingThoughts.map((t) => t.id));
          setMessages((prev) => prev.filter((m) => !trailingIds.has(m.id)));
        }
      }
      if (lastUser?.content) {
        let base64: string | null = null;
        if (lastUser.type === 'image' && lastUser.imageUri) {
          try {
            base64 = await FileSystem.readAsStringAsync(lastUser.imageUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } catch {}
        }
        void triggerAiResponse(lastUser.content, base64, true);
      } else {
        void triggerAiResponse('[系统事件: 重试生成上一轮未完成的回复]', null, true);
      }
    } else {
      void triggerAiResponse('继续');
    }
  }, [space, handleSend, triggerAiResponse]);

  const handleClear = useCallback(() => {
    const resetActiveSessionState = async () => {
      aggregatorRef.current?.cancel();
      abortControllerRef.current?.abort();
      abortActiveStream(space, threadId);
      cancelInFlightWakeup(space, threadId);
      tickerRef.current?.stop();
      dispatcherRef.current?.cancelPendingBurst();
      await imEpochRepository.resetEpochOnClear(space, threadId);
      void cancelStagedMessageAlarm(threadId);
      void clearPendingPing(space, threadId);
      void cancelProactivePingAlarm(threadId);
      inFlightThoughtMsgRef.current = null;
      anchorMessageIdRef.current = undefined;
      livingStateRef.current = null;
      setLivingState(null);
      setSubText(null);
      setMessages([]);
    };

    setSessionDialog({
      visible: true,
      title: '清空会话记录',
      message: '请选择清空范围：\n• 清空全部：删除聊天记录，并重置顶栏状态、清空手账日记与专属记忆\n• 仅清空消息：仅删除聊天消息并重置状态，保留日记与记忆',
      actionLayout: 'stack',
      danger: true,
      primaryLabel: '清空全部（含日记与记忆）',
      onPrimary: async () => {
        closeSessionDialog();
        await clearImThreadFullState(space, threadId, roleCardId);
        await resetActiveSessionState();
      },
      secondaryLabel: '取消',
      tertiaryLabel: '仅清空消息',
      onTertiary: async () => {
        closeSessionDialog();
        await clearImThreadHistory(space, threadId);
        await resetActiveSessionState();
      },
    });
  }, [space, threadId, roleCardId, closeSessionDialog]);

  const handleNudge = useCallback(async () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    idleStageRef.current = 0;
    hasAutoRepliedInRoundRef.current = false;
    void cancelStagedMessageAlarm(threadId);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const rawSuffix = (threadSettings.nudgeText || '的小脑袋').trim();
    const cleanSuffix = rawSuffix.startsWith('的') ? rawSuffix.slice(1).trim() : rawSuffix;
    const noticeText = `你拍了拍 ${companionName} 的${cleanSuffix}`;
    const noticeMsg: ImMessage = {
      id: `notice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      threadId,
      role: 'system',
      content: noticeText,
      type: 'system_notice',
      status: 'sent',
      deliveryStatus: 'delivered',
      visibleAt: Date.now(),
      createdAt: new Date().toISOString(),
    };
    await insertImMessage(space, noticeMsg);
    await reloadMessages();

    // 触发大模型被拍回复
    const nudgeEvent = `<NudgeAction user="你" target="${companionName}" action="拍了拍你的${cleanSuffix}"/>`;
    if (aggregatorRef.current) {
      aggregatorRef.current.push(nudgeEvent);
    }
  }, [threadSettings.nudgeText, companionName, threadId, space, reloadMessages]);

  const handleNudgeSelf = useCallback(async () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    idleStageRef.current = 0;
    hasAutoRepliedInRoundRef.current = false;
    void cancelStagedMessageAlarm(threadId);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const noticeText = '你拍了拍自己的小脑袋';
    const noticeMsg: ImMessage = {
      id: `notice_${Date.now()}_self_${Math.random().toString(36).slice(2, 6)}`,
      threadId,
      role: 'system',
      content: noticeText,
      type: 'system_notice',
      status: 'sent',
      deliveryStatus: 'delivered',
      visibleAt: Date.now(),
      createdAt: new Date().toISOString(),
    };
    await insertImMessage(space, noticeMsg);
    await reloadMessages();
  }, [threadId, space, reloadMessages]);

  const handleSetAvatarUri = useCallback(async (uri: string | null) => {
    if (roleCardId) {
      await updateRoleAvatar(space, roleCardId, uri);
    }
    setCompanionAvatarUri(uri);
  }, [space, roleCardId]);

  const handleSetBackgroundUri = useCallback(async (uri: string | null) => {
    await handleUpdateSettings({ backgroundImageUri: uri });
  }, [handleUpdateSettings]);

  const handlePickAvatarFromAlbum = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      await handleSetAvatarUri(res.assets[0].uri);
    }
  }, [handleSetAvatarUri]);

  const handleClearAvatar = useCallback(async () => {
    await handleSetAvatarUri(null);
  }, [handleSetAvatarUri]);

  const handlePickBackgroundFromAlbum = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      await handleSetBackgroundUri(res.assets[0].uri);
    }
  }, [handleSetBackgroundUri]);

  const handleClearBackground = useCallback(async () => {
    await handleSetBackgroundUri(null);
  }, [handleSetBackgroundUri]);

  const handleExportHistory = useCallback(async () => {
    try {
      const jsonStr = await exportImThreadMessages(space, threadId, companionName);
      const parsed = JSON.parse(jsonStr) as { messages?: unknown[] };
      if (!parsed.messages || parsed.messages.length === 0) {
        setSessionDialog({
          visible: true,
          title: '提示',
          message: '当前还没有可导出的聊天记录',
          primaryLabel: '我知道了',
          secondaryLabel: null,
          onPrimary: closeSessionDialog,
        });
        return;
      }
      await Share.share({ title: `${companionName} 聊天记录备份`, message: jsonStr });
    } catch {
      // 容错静默
    }
  }, [space, threadId, companionName, closeSessionDialog]);

  const handleImportHistory = useCallback(async () => {
    try {
      const doc = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (!doc.canceled && doc.assets[0]?.uri) {
        const text = await FileSystem.readAsStringAsync(doc.assets[0].uri);
        const count = await importImThreadMessages(space, threadId, text);
        await reloadMessages();
        setSessionDialog({
          visible: true,
          title: '导入成功',
          message: `成功导入 ${count} 条聊天记录`,
          primaryLabel: '好的',
          secondaryLabel: null,
          onPrimary: closeSessionDialog,
        });
      }
    } catch (e: any) {
      setSessionDialog({
        visible: true,
        title: '导入失败',
        message: e?.message || '文件格式不正确',
        primaryLabel: '我知道了',
        secondaryLabel: null,
        onPrimary: closeSessionDialog,
      });
    }
  }, [space, threadId, reloadMessages, closeSessionDialog]);

  const handleDraftChange = useCallback((text: string) => {
    inputDraftRef.current = text;
    // 草稿感知避让守卫：若用户正在打字，立即清除追聊定时器，绝不抢话！
    if (text.trim().length > 0 && inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (typingDebounceTimerRef.current) {
      clearTimeout(typingDebounceTimerRef.current);
      typingDebounceTimerRef.current = null;
    }
    if (text.trim().length > 0) {
      typingDebounceTimerRef.current = setTimeout(async () => {
        try {
          const res = await cancelStagedMessages(space, threadId, 'cancelled_by_user');
          if (res.interruptedDraft && !lastInterruptedDraftRef.current) {
            lastInterruptedDraftRef.current = res.interruptedDraft;
          }
        } catch {
          // 容错静默
        }
      }, 300);
    }
  }, [space, threadId]);

  const handleStartDiaryResonance = useCallback((dateKey: string, title: string, excerpt: string) => {
    const quoteExcerpt = excerpt.length > 25 ? `${excerpt.slice(0, 25)}...` : excerpt;
    const draft = `翻到了你 ${dateKey} 写的那篇手账，看到你说「${quoteExcerpt}」……`;
    setFillDraftText(draft);
    setThreadPendingDiaryHook(space, threadId, `${dateKey}: ${title} - ${excerpt}`).catch(() => {});
  }, [space, threadId, setFillDraftText]);

  return {
    messages,
    isInitialLoading,
    initialUnreadCount,
    subText,
    livingState,
    userAvatarUri,
    companionName,
    companionAvatarUri,
    threadSettings,
    ipModalVisible,
    setIpModalVisible,
    actionMenuVisible,
    activeMessageForMenu,
    menuAnchor,
    handleActionMenuClose: () => setActionMenuVisible(false),
    handleDeleteMessage,
    handleEditResend,
    handleToggleVoiceTranscript,
    handleSpeakMessage,
    handleRetryMessage,
    handleSend,
    handleSendVoice,
    handleSendSticker,
    handleCamera,
    handlePhoto,
    handleFile,
    handleIpSend,
    handleLongPress,
    handleClear,
    handleNudge,
    handleNudgeSelf,
    handleUpdateSettings,
    handleSetAvatarUri,
    handleSetBackgroundUri,
    handlePickAvatarFromAlbum,
    handleClearAvatar,
    handlePickBackgroundFromAlbum,
    handleClearBackground,
    handleExportHistory,
    handleImportHistory,
    handleDraftChange,
    handleStartDiaryResonance,
    fillDraftText,
    reloadMessages,
    sessionDialog,
    closeSessionDialog,
  };
}
