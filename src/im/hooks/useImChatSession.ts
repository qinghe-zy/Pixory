import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, LayoutAnimation, Share } from 'react-native';
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
  insertImMessage,
  clearImThreadHistory,
  getThreadLivingState,
  updateThreadLivingState,
  cancelStagedMessages,
  revealPendingMessages,
} from '../repository/imThreadRepository';
import {
  getImThreadSettings,
  updateImThreadSettings,
  updateRoleAvatar,
  exportImThreadMessages,
  importImThreadMessages,
  type ImThreadSettings,
} from '../repository/imSettingsRepository';
import { useImGlobalSettings } from '../services/imCompanionPreferences';
import { VisibilityTicker, BurstMessageDispatcher } from '../engine/burstDispatcher';
import { InputAggregator } from '../engine/inputAggregator';
import { TagAwareStreamParser } from '../engine/tagAwareStreamParser';
import { advanceLivingState } from '../engine/imAgencyEngine';
import { parseStatusTag, parseHeartbeatTag, validateHeartbeatConsistency } from '../engine/imTagParser';
import { buildChatPayload, buildShadowCompactionPayload } from '../engine/imContextBuilder';
import { streamClient } from '../../core/llm-transport/streamClient';
import { getActiveProviderConfig } from '../../core/llm-transport/secureApiKey';
import { retrieveRelevantMemories } from '../../core/memory/zeroVectorRetriever';
import { memoryRepository } from '../../core/memory/memoryRepository';
import { imMessageRollback } from '../engine/imMessageRollback';

export interface UseImChatSessionOptions {
  space: PixorySpace;
  threadId: string;
  roleCardId?: string;
  initialRoleName?: string;
  initialRoleAvatarUri?: string | null;
}

export function useImChatSession({
  space,
  threadId,
  roleCardId,
  initialRoleName,
  initialRoleAvatarUri,
}: UseImChatSessionOptions) {
  const [messages, setMessages] = useState<ImMessage[]>([]);
  const [subText, setSubText] = useState<string | null>(null);
  const [userAvatarUri, setUserAvatarUri] = useState<string | null>(null);
  const [companionName, setCompanionName] = useState<string>(initialRoleName || '伴侣');
  const [companionAvatarUri, setCompanionAvatarUri] = useState<string | null>(initialRoleAvatarUri || null);
  const [rolePrompt, setRolePrompt] = useState<string>('你是一个温柔体贴、元气满满的专属 AI 伴侣。');
  const [livingState, setLivingState] = useState<ImCompanionLivingState | null>(null);
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
  const inputDraftRef = useRef<string>('');

  const messagesRef = useRef<ImMessage[]>(messages);
  messagesRef.current = messages;

  const tickerRef = useRef<VisibilityTicker | null>(null);
  const dispatcherRef = useRef<BurstMessageDispatcher | null>(null);
  const aggregatorRef = useRef<InputAggregator | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadThreadSettings = useCallback(async () => {
    try {
      const s = await getImThreadSettings(space, threadId);
      setThreadSettings(s);
      const state = await getThreadLivingState(space, threadId);
      if (state) setLivingState(state);
    } catch {
      // 容错静默
    }
  }, [space, threadId]);

  useEffect(() => {
    void loadThreadSettings();
  }, [loadThreadSettings]);

  const handleUpdateSettings = useCallback(
    async (patch: Partial<ImThreadSettings>) => {
      setThreadSettings((prev) => ({ ...prev, ...patch }));
      await updateImThreadSettings(space, threadId, patch);
    },
    [space, threadId]
  );

  const reloadMessages = useCallback(async () => {
    try {
      await revealPendingMessages(space, threadId);
      const items = await getVisibleImMessages(space, threadId, 100);
      setMessages(items.reverse());
    } catch {
      // 容错静默
    }
  }, [space, threadId]);

  // 初始化 Ticker & Dispatcher
  useEffect(() => {
    const ticker = new VisibilityTicker(threadId, space);
    const dispatcher = new BurstMessageDispatcher(threadId, space);
    tickerRef.current = ticker;
    dispatcherRef.current = dispatcher;

    const unsubscribeReveal = ticker.subscribe(() => {
      void reloadMessages();
    });
    const unsubscribeIdle = ticker.subscribeIdle(() => {
      if (!isStreamingRef.current) {
        setSubText(null);
      }
    });

    return () => {
      unsubscribeReveal();
      unsubscribeIdle();
      ticker.dispose();
      abortControllerRef.current?.abort();
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
          }>(
            `SELECT name, avatarUri, avatarEnabled, prompt FROM ai_role_cards WHERE id = ? LIMIT 1;`,
            [roleCardId]
          );
          if (role) {
            if (role.name) setCompanionName(role.name);
            if (role.avatarEnabled !== 0 && role.avatarUri) setCompanionAvatarUri(role.avatarUri);
            if (role.prompt?.trim()) setRolePrompt(role.prompt.trim());
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

  // 核心大模型流式回复分发器
  const triggerAiResponse = useCallback(
    async (userInput: string, imageBase64?: string | null) => {
      if (!dispatcherRef.current) return;
      const dispatcher = dispatcherRef.current;
      const ticker = tickerRef.current;

      // 1. 打断上一轮流、截断未显影气泡并取消预埋信封 (Zero-fork Guarantee)
      abortControllerRef.current?.abort();
      await imMessageRollback.cancelFuturePendingBubbles(threadId, space);
      await cancelStagedMessages(space, threadId);
      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;
      isStreamingRef.current = true;

      setSubText('对方正在输入...');
      dispatcher.beginBurst();

      const isOccupied = Boolean(
        livingStateRef.current &&
        (livingStateRef.current.activityLoad === 'occupied' || livingStateRef.current.deviceAccess === 'limited')
      );

      try {
        const provider = await getActiveProviderConfig(
          space,
          threadSettings.providerId,
          threadSettings.modelId
        );
        if (!provider?.apiKey) {
          // 无 Key 时的拟真温情兜底
          setTimeout(async () => {
            await dispatcher.dispatchSentence(
              `我收到啦！[BR]你刚才说的“${userInput.slice(0, 15)}”真有意思~ (提示：在设置中配置 API Key 即可开启完整大模型心跳陪伴)`,
              ticker || undefined,
              { isOccupied }
            );
            await reloadMessages();
            setSubText(null);
          }, 600);
          return;
        }

        // 2. 召回 Top 3 记忆候选 (耗时 < 1.5ms)
        const recalled = roleCardId
          ? await retrieveRelevantMemories(roleCardId, space, userInput, 3)
          : [];

        // 3. 读取 L1 画像与摘要
        const slots = roleCardId
          ? await memoryRepository.listMemories(roleCardId, space, 'L1_SLOT')
          : [];
        const summaries = roleCardId
          ? await memoryRepository.listMemories(roleCardId, space, 'L1_SUMMARY')
          : [];
        const l1Summary = summaries[0] ?? null;

        const effectiveModelId = threadSettings.modelId || provider.modelId;
        const effectiveProviderId = threadSettings.providerId || provider.providerId;

        // 4. 四区装填 (注入伴侣自知觉 Living State 锚点与多模态图片)
        const payload = buildChatPayload(
          {
            rolePrompt,
            roleName: companionName,
            l1Slots: slots,
            l1Summary,
            historyMessages: messagesRef.current,
            recalledMemories: recalled,
            livingState: livingStateRef.current || undefined,
            windowN: threadSettings.contextWindowN || 20,
            currentImageBase64: imageBase64,
          },
          userInput
        );

        // 5. 边收边切分发流 (思考标签隐形过滤与非流式整句呈现)
        const parser = new TagAwareStreamParser();
        let fullRawResponse = '';
        const textStream = streamClient.streamText(payload, {
          providerId: effectiveProviderId,
          modelId: effectiveModelId,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          abortSignal: abortCtrl.signal,
        });

        for await (const chunk of textStream) {
          fullRawResponse += chunk;
          const sentences = parser.feed(chunk);
          if (parser.isThinking()) {
            setSubText('对方正在思考...');
          } else {
            setSubText('对方正在输入...');
          }
          for (const s of sentences) {
            await dispatcher.dispatchSentence(s, ticker || undefined, { isOccupied });
            await reloadMessages();
          }
        }

        const trailing = parser.flush();
        for (const s of trailing) {
          await dispatcher.dispatchSentence(s, ticker || undefined, { isOccupied });
          await reloadMessages();
        }

        // 6. 解析伴侣生活状态机推进 [STATUS: ...] 并持久化 SQLite
        const statusUpdate = parseStatusTag(fullRawResponse);
        let updatedLiving: ImCompanionLivingState | undefined;
        if (statusUpdate) {
          updatedLiving = advanceLivingState(livingStateRef.current || undefined, statusUpdate);
          setLivingState(updatedLiving);
          void updateThreadLivingState(space, threadId, updatedLiving);
        }

        // 7. 解析预埋心跳气泡 [HEARTBEAT: ...] 并执行 ScriptCommit 出站自洽守卫
        const heartbeat = parseHeartbeatTag(fullRawResponse);
        if (heartbeat) {
          const currentOrNewState = updatedLiving || livingStateRef.current;
          const consistentHb = currentOrNewState
            ? validateHeartbeatConsistency(heartbeat, currentOrNewState)
            : heartbeat;
          if (
            consistentHb &&
            threadSettings.heartbeatEnabled !== false &&
            globalSettings.globalHeartbeatEnabled !== false
          ) {
            void dispatcher.dispatchStagedHeartbeat(consistentHb.message, consistentHb.delayMs);
          }
        }

        // 6. 异步检测水位线步进压缩 (N+Δ 水位)
        if (messagesRef.current.length >= 24 && roleCardId) {
          void (async () => {
            try {
              const compPayload = buildShadowCompactionPayload({
                rolePrompt,
                l1Slots: slots,
                l1Summary,
                historyMessages: messagesRef.current,
              });
              let compRaw = '';
              for await (const chunk of streamClient.streamText(compPayload, {
                providerId: provider.providerId,
                modelId: provider.modelId,
                baseUrl: provider.baseUrl,
                apiKey: provider.apiKey || undefined,
              })) {
                compRaw += chunk;
              }
              const jsonMatch = compRaw.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                await memoryRepository.applyCompaction(roleCardId, space, parsed);
              }
            } catch {
              // 压缩失败容错静默
            }
          })();
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          // 出错时提示
          await dispatcher.dispatchSentence('网络开小差了，稍后再试一次吧~', ticker || undefined);
          await reloadMessages();
        }
      } finally {
        isStreamingRef.current = false;
        if (!tickerRef.current?.isRevealing()) {
          setSubText(null);
        }
      }
    },
    [threadId, space, roleCardId, rolePrompt, companionName, reloadMessages]
  );

  // 初始化输入聚合器 (支持全局自定义延时与输入框空探测)
  useEffect(() => {
    const waitMs = (globalSettings.debounceWaitSec || 2) * 1000;
    aggregatorRef.current = new InputAggregator(
      (combinedText) => {
        void triggerAiResponse(combinedText);
      },
      waitMs,
      () => inputDraftRef.current.trim().length === 0
    );

    return () => {
      aggregatorRef.current?.cancel();
    };
  }, [triggerAiResponse, globalSettings.debounceWaitSec]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // 若当前为修改消息重发，先截断目标消息及之后的所有历史记录
    if (editingMessageRef.current) {
      const targetMsg = editingMessageRef.current;
      editingMessageRef.current = null;
      setFillDraftText(null);
      await imMessageRollback.truncateAfterMessage(threadId, targetMsg.createdAt, space);
      await reloadMessages();
    }

    // 阶段 A: 0ms 瞬时同步熔断（掐灭旧流、停止未来时钟、清空未显影气泡）
    abortControllerRef.current?.abort();
    tickerRef.current?.stop();
    void imMessageRollback.cancelFuturePendingBubbles(threadId, space);

    const userMsg: ImMessage = {
      id: `im_msg_${Date.now()}_u`,
      threadId,
      role: 'user',
      content: trimmed,
      status: 'sent',
      visibleAt: null,
      createdAt: new Date().toISOString(),
    };

    void insertImMessage(space, userMsg).then(() => {
      setMessages((prev) => [...prev, userMsg]);
      aggregatorRef.current?.push(trimmed);
    });
  };

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('提示', '请允许访问相机');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled && res.assets[0]?.uri) {
      // 0ms 熔断
      abortControllerRef.current?.abort();
      tickerRef.current?.stop();
      await imMessageRollback.cancelFuturePendingBubbles(threadId, space);

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
      // 0ms 熔断
      abortControllerRef.current?.abort();
      tickerRef.current?.stop();
      await imMessageRollback.cancelFuturePendingBubbles(threadId, space);

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

  const handleFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (!res.canceled && res.assets[0]) {
      handleSend(`[文件] ${res.assets[0].name} (${Math.round((res.assets[0].size || 0) / 1024)} KB)`);
    }
  };

  const handleIpSend = async (payload: SelectedIpImagePayload) => {
    // 0ms 熔断
    abortControllerRef.current?.abort();
    tickerRef.current?.stop();
    await imMessageRollback.cancelFuturePendingBubbles(threadId, space);

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
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
  };

  const handleEditResend = (msg: ImMessage) => {
    editingMessageRef.current = msg;
    setFillDraftText(msg.content);
    setActionMenuVisible(false);
  };

  const handleClear = () => {
    Alert.alert('清空记录', '确定清空聊天记录吗？此操作不可撤销', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: async () => {
          await clearImThreadHistory(space, threadId);
          setMessages([]);
        },
      },
    ]);
  };

  const handleNudge = useCallback(async () => {
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
      await Share.share({ title: `${companionName} 聊天记录备份`, message: jsonStr });
    } catch {
      // 容错静默
    }
  }, [space, threadId, companionName]);

  const handleImportHistory = useCallback(async () => {
    try {
      const doc = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (!doc.canceled && doc.assets[0]?.uri) {
        const text = await FileSystem.readAsStringAsync(doc.assets[0].uri);
        const count = await importImThreadMessages(space, threadId, text);
        await reloadMessages();
        Alert.alert('导入成功', `成功导入 ${count} 条聊天记录`);
      }
    } catch (e: any) {
      Alert.alert('导入失败', e.message || '文件格式不正确');
    }
  }, [space, threadId, reloadMessages]);

  const handleDraftChange = useCallback((text: string) => {
    inputDraftRef.current = text;
  }, []);

  return {
    messages,
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
    handleSend,
    handleCamera,
    handlePhoto,
    handleFile,
    handleIpSend,
    handleLongPress,
    handleClear,
    handleNudge,
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
    fillDraftText,
    reloadMessages,
  };
}
