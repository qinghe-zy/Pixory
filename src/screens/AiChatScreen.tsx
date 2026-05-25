import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, type NativeScrollEvent, type NativeSyntheticEvent, PermissionsAndroid, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiChatComposer, type AiComposerAttachment } from '../components/ai/AiChatComposer';
import { AiChatErrorBanner } from '../components/ai/AiChatErrorBanner';
import { AiComprehensiveRecordDrawer } from '../components/ai/AiComprehensiveRecordDrawer';
import type { AiVoiceInputState } from '../components/ai/AiVoiceInputStatus';
import { aiLightColors, aiLightDisplayFont } from '../components/ai/aiLightTheme';
import { AiMemoryCaptureNotice } from '../components/ai/AiMemoryCaptureNotice';
import { AiMessageBubble } from '../components/ai/AiMessageBubble';
import { AiScrollToLatestButton } from '../components/ai/AiScrollToLatestButton';
import { AppActionSheet, type AppActionSheetItem } from '../components/AppActionSheet';
import { AppScreen } from '../components/AppScreen';
import { recognizeSpeech } from '../native/pixoryMediaModule';
import { deleteMemory, dismissMemoryCapture, listRecentMemoryCaptures, markMemoryInaccurate, replaceRecentMemoryCaptures, updateMemoryContent, type MemoryCaptureNoticeItem } from '../ai/aiMemoryService';
import {
  createThreadFromContext,
  getCurrentChatModelLabel,
  listThreadMessages,
  loadThreadTitle,
  loadThreadAvatarConfig,
  listAiHistoryThreads,
  regenerateAssistantMessage,
  rewriteUserMessage,
  sendUserMessage,
  stopStreamingMessage,
  type AiMessageWithCitations,
  type AiStreamingMessagePatch,
} from '../ai/aiChatService';
import type { AiCitationRecord, AiContextType } from '../ai/types';
import type { AiDocumentReaderLocator } from '../ai/readers/readerTypes';
import type { AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import { layout, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

const MESSAGE_BOTTOM_LOCK_THRESHOLD = 48;
const CHAT_MESSAGE_PAGE_SIZE = 60;
// Scroll affordance copy: 回到最新.

const CHAT_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '*/*',
];

function getFileNameFromUri(uri: string, fallback: string): string {
  const rawName = uri.split(/[\\/]/).pop()?.split('?')[0]?.trim();
  return rawName ? decodeURIComponent(rawName) : fallback;
}

function describeAttachmentKind(kind: AiComposerAttachment['kind']): string {
  if (kind === 'image') {
    return '图片';
  }
  if (kind === 'video') {
    return '视频';
  }
  return '文档';
}

function buildChatMessageContent(text: string, attachments: AiComposerAttachment[]): string {
  if (!attachments.length) {
    return text;
  }
  const attachmentLines = attachments.map((attachment) => {
    const type = attachment.mimeType ? `，类型：${attachment.mimeType}` : '';
    return `- ${describeAttachmentKind(attachment.kind)}：${attachment.name}${type}`;
  });
  return [text || '请根据以下附件继续对话。', '', '[附件]', ...attachmentLines].join('\n');
}

function formatDateSeparator(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (startOfDate === startOfToday) {
    return '今天';
  }
  if (startOfDate === startOfToday - 24 * 60 * 60 * 1000) {
    return '昨天';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shouldShowDateSeparator(messages: AiMessageWithCitations[], index: number): boolean {
  if (index <= 0) {
    return true;
  }
  const current = new Date(messages[index]?.createdAt ?? '');
  const previous = new Date(messages[index - 1]?.createdAt ?? '');
  return (
    current.getFullYear() !== previous.getFullYear() ||
    current.getMonth() !== previous.getMonth() ||
    current.getDate() !== previous.getDate()
  );
}

function messageHasContextTrim(message: AiMessageWithCitations): boolean {
  try {
    const snapshot = message.promptSnapshotJson ? JSON.parse(message.promptSnapshotJson) : null;
    return Boolean(snapshot?.contextTrimmedByBudget || snapshot?.contextTrimmedByCount || snapshot?.contextTrimmed);
  } catch {
    return false;
  }
}

type VisibleMessageItem = {
  message: AiMessageWithCitations;
  showAvatar: boolean;
  showDateSeparator: boolean;
};

interface AiChatScreenProps {
  space: PixorySpace;
  contextType: AiContextType;
  contextTitle?: string;
  boundIpId?: number;
  boundKnowledgeBaseId?: string;
  includeIpDocuments?: boolean;
  threadId?: string;
  onOpenHistory: () => void;
  onOpenSessionConfig: (threadId: string) => void;
  onOpenMemoryBoard: (threadId: string) => void;
  onNewChat: () => void;
  onStartNormalChat: () => void;
  onOpenThread: (thread: AiThreadHistoryItem) => void;
  onOpenSource: (documentId: string, title: string, locator?: AiDocumentReaderLocator) => void;
  onOpenIpSource: (ipId: number) => void;
  onOpenImageSource: (imageId: number) => void;
  onThreadReady?: (threadId: string) => void;
  onThreadTitleChange?: (title: string) => void;
}

export function AiChatScreen({
  space,
  contextType,
  contextTitle,
  boundIpId,
  boundKnowledgeBaseId,
  includeIpDocuments = false,
  threadId,
  onOpenHistory,
  onOpenSessionConfig,
  onOpenMemoryBoard,
  onNewChat,
  onStartNormalChat,
  onOpenThread,
  onOpenSource,
  onOpenIpSource,
  onOpenImageSource,
  onThreadReady,
  onThreadTitleChange,
}: AiChatScreenProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;
  const resolvedContextTitle = contextTitle ?? (contextType === 'ip' ? 'IP 对话' : contextType === 'knowledge_base' ? '知识库对话' : '普通聊天');
  const messageListRef = useRef<FlatList<VisibleMessageItem> | null>(null);
  const userScrolledAwayFromBottomRef = useRef(false);
  const isLoadingEarlierRef = useRef(false);
  const displayTitleRef = useRef(resolvedContextTitle);
  const activeThreadIdRef = useRef<string | null>(threadId ?? null);
  const latestRequestRef = useRef({
    avatar: 0,
    memory: 0,
    messages: 0,
    model: 0,
    title: 0,
  });
  const screenMountedRef = useRef(true);
  const streamAbortRef = useRef<AbortController | null>(null);
  const activeStreamGenerationRef = useRef(0);
  const generationBusyRef = useRef(false);
  const generationActionTokenRef = useRef(0);
  const newChatFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadId ?? null);
  const [messages, setMessages] = useState<AiMessageWithCitations[]>([]);
  const [loadedMessageLimit, setLoadedMessageLimit] = useState(CHAT_MESSAGE_PAGE_SIZE);
  const [hasEarlierMessages, setHasEarlierMessages] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [editingUserMessageId, setEditingUserMessageId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<AiComposerAttachment[]>([]);
  const [selectedVersionByMessageId, setSelectedVersionByMessageId] = useState<Record<string, number>>({});
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [modelLabel, setModelLabel] = useState('');
  const [displayTitle, setDisplayTitle] = useState(resolvedContextTitle);
  const [avatarConfig, setAvatarConfig] = useState({ avatarEnabled: false, avatarUri: null as string | null });
  const [memoryCaptures, setMemoryCaptures] = useState<MemoryCaptureNoticeItem[]>([]);
  const [voiceState, setVoiceState] = useState<AiVoiceInputState>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [latestVisible, setLatestVisible] = useState(true);
  const [recentThreads, setRecentThreads] = useState<AiThreadHistoryItem[]>([]);
  const [newChatFeedbackVisible, setNewChatFeedbackVisible] = useState(false);
  const [recordDrawerVisible, setRecordDrawerVisible] = useState(false);
  const editingUserMessageIdRef = useRef<string | null>(null);
  const thinking = generating;
  const inlineEditingActive = Boolean(editingUserMessageId);
  const latestAssistantMessage = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant'), [messages]);
  const visibleMessages = useMemo(
    () =>
      messages.map((message) => {
        const selectedVersionIndex = selectedVersionByMessageId[message.id] ?? message.versionTotal;
        if (selectedVersionIndex >= message.versionTotal) {
          return message.versionIndex === message.versionTotal ? message : { ...message, versionIndex: message.versionTotal };
        }
        const selectedVersion = message.messageVersions.find((version) => version.versionIndex === selectedVersionIndex);
        if (!selectedVersion) {
          return message.versionIndex === message.versionTotal ? message : { ...message, versionIndex: message.versionTotal };
        }
        return {
          ...message,
          content: selectedVersion.content,
          reasoningText: selectedVersion.reasoningText,
          errorMessage: selectedVersion.errorMessage,
          providerId: selectedVersion.providerId,
          modelId: selectedVersion.modelId,
          modelSnapshotJson: selectedVersion.modelSnapshotJson,
          promptSnapshotJson: selectedVersion.promptSnapshotJson,
          citations: selectedVersion.citations,
          createdAt: selectedVersion.messageCreatedAt,
          updatedAt: selectedVersion.messageUpdatedAt,
          completedAt: selectedVersion.messageCompletedAt,
          status: selectedVersion.status,
          versionIndex: selectedVersion.versionIndex,
        };
      }),
    [messages, selectedVersionByMessageId]
  );
  const visibleMessageItems = useMemo<VisibleMessageItem[]>(
    () =>
      visibleMessages.map((message, index) => {
        const previousMessage = visibleMessages[index - 1];
        const showDateSeparator = shouldShowDateSeparator(visibleMessages, index);
        return {
          message,
          showAvatar: message.role === 'assistant' && (showDateSeparator || previousMessage?.role !== 'assistant'),
          showDateSeparator,
        };
      }),
    [visibleMessages]
  );
  const invertedMessageItems = useMemo(
    () => [...visibleMessageItems].reverse(),
    [visibleMessageItems]
  );
  const contextTrimNotice = useMemo(
    () => {
      const latestAssistant = [...visibleMessages].reverse().find((message) => message.role === 'assistant');
      return latestAssistant ? messageHasContextTrim(latestAssistant) : false;
    },
    [visibleMessages]
  );
  const fallbackMemoryCaptures = useMemo(
    () => memoryCaptures.filter((item) => !item.sourceMessageId),
    [memoryCaptures]
  );
  const memoryCapturesBySourceMessageId = useMemo(() => {
    const map = new Map<string, MemoryCaptureNoticeItem[]>();
    for (const item of memoryCaptures) {
      if (!item.sourceMessageId) {
        continue;
      }
      const list = map.get(item.sourceMessageId) ?? [];
      list.push(item);
      map.set(item.sourceMessageId, list);
    }
    return map;
  }, [memoryCaptures]);
  const attachmentSheetItems = useMemo<AppActionSheetItem[]>(
    () => [
      { key: 'image', label: '上传图片', icon: 'image-outline', onPress: () => void pickChatImages() },
      { key: 'video', label: '上传视频', icon: 'videocam-outline', onPress: () => void pickChatVideos() },
      { key: 'document', label: '上传文档', icon: 'document-text-outline', onPress: () => void pickChatDocuments() },
    ],
    []
  );

  function nextRequestId(kind: keyof typeof latestRequestRef.current): number {
    latestRequestRef.current[kind] += 1;
    return latestRequestRef.current[kind];
  }

  function isLatestRequest(kind: keyof typeof latestRequestRef.current, requestId: number, targetThreadId: string | null): boolean {
    return latestRequestRef.current[kind] === requestId && activeThreadIdRef.current === targetThreadId;
  }

  function isCurrentStream(targetThreadId: string, generation: number): boolean {
    return activeStreamGenerationRef.current === generation && activeThreadIdRef.current === targetThreadId;
  }

  function beginStreamingRequest(targetThreadId: string): { controller: AbortController; generation: number } {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    activeStreamGenerationRef.current += 1;
    activeThreadIdRef.current = targetThreadId;
    return { controller, generation: activeStreamGenerationRef.current };
  }

  function beginGenerationAction(): number | null {
    if (generationBusyRef.current) {
      return null;
    }
    generationBusyRef.current = true;
    generationActionTokenRef.current += 1;
    return generationActionTokenRef.current;
  }

  function finishGenerationAction(actionToken: number) {
    if (generationActionTokenRef.current === actionToken) {
      generationBusyRef.current = false;
    }
  }

  function cancelGenerationAction() {
    generationActionTokenRef.current += 1;
    generationBusyRef.current = false;
  }

  function abortActiveStreamingRequest() {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    activeStreamGenerationRef.current += 1;
  }

  const scrollToLatestMessage = useCallback((animated = true, force = false) => {
    if (!force && userScrolledAwayFromBottomRef.current) {
      return;
    }
    messageListRef.current?.scrollToOffset({ animated, offset: 0 });
  }, []);

  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    userScrolledAwayFromBottomRef.current = contentOffset.y > MESSAGE_BOTTOM_LOCK_THRESHOLD;
    setLatestVisible(!userScrolledAwayFromBottomRef.current);
  }, []);

  const followLatestMessage = useCallback((animated = true) => {
    userScrolledAwayFromBottomRef.current = false;
    setLatestVisible(true);
    scrollToLatestMessage(animated, true);
  }, [scrollToLatestMessage]);

  const handleComposerHeightChange = useCallback(() => {
    if (editingUserMessageIdRef.current) {
      return;
    }
    scrollToLatestMessage(false);
  }, [scrollToLatestMessage]);

  function showLatestMessageVersion(messageId: string) {
    setSelectedVersionByMessageId((current) => {
      if (!(messageId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  const applyDisplayTitle = useCallback(
    (title: string) => {
      if (title === displayTitleRef.current) {
        return;
      }
      displayTitleRef.current = title;
      setDisplayTitle(title);
      onThreadTitleChange?.(title);
    },
    [onThreadTitleChange]
  );

  const reloadMessages = useCallback(
    async (targetThreadId: string | null, forceToLatest = false) => {
      const requestId = nextRequestId('messages');
      if (!targetThreadId) {
        setMessages([]);
        setHasEarlierMessages(false);
        setLoadedMessageLimit(CHAT_MESSAGE_PAGE_SIZE);
        setMemoryCaptures([]);
        isLoadingEarlierRef.current = false;
        userScrolledAwayFromBottomRef.current = false;
        setLatestVisible(true);
        return;
      }
      const nextMessages = await listThreadMessages(space, targetThreadId, { limit: loadedMessageLimit });
      if (!isLatestRequest('messages', requestId, targetThreadId)) {
        return;
      }
      setHasEarlierMessages(nextMessages.length >= loadedMessageLimit);
      if (forceToLatest) {
        userScrolledAwayFromBottomRef.current = false;
        setLatestVisible(true);
      }
      setMessages(nextMessages);
      const titleRequestId = nextRequestId('title');
      void loadThreadTitle(space, targetThreadId).then((title) => {
        if (title && isLatestRequest('title', titleRequestId, targetThreadId)) {
          applyDisplayTitle(title);
        }
      });
    },
    [applyDisplayTitle, loadedMessageLimit, space]
  );

  const applyStreamingMessagePatch = useCallback((patch: AiStreamingMessagePatch) => {
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== patch.id) {
          return message;
        }
        return {
          ...message,
          status: patch.status ?? message.status,
          content: patch.content ?? message.content,
          reasoningText: patch.reasoningText === undefined ? message.reasoningText : patch.reasoningText,
          errorMessage: patch.errorMessage === undefined ? message.errorMessage : patch.errorMessage,
          providerId: patch.providerId === undefined ? message.providerId : patch.providerId,
          modelId: patch.modelId === undefined ? message.modelId : patch.modelId,
          modelSnapshotJson: patch.modelSnapshotJson ?? message.modelSnapshotJson,
          promptSnapshotJson: patch.promptSnapshotJson ?? message.promptSnapshotJson,
          createdAt: patch.createdAt ?? message.createdAt,
          completedAt: patch.completedAt === undefined ? message.completedAt : patch.completedAt,
          citations: patch.citations ?? message.citations,
          updatedAt: patch.completedAt ?? new Date().toISOString(),
        };
      })
    );
  }, []);

  const loadEarlierMessages = useCallback(() => {
    isLoadingEarlierRef.current = true;
    setLoadedMessageLimit((current) => current + CHAT_MESSAGE_PAGE_SIZE);
  }, []);

  const reloadThreadTitle = useCallback(
    async (targetThreadId: string | null) => {
      const requestId = nextRequestId('title');
      if (!targetThreadId) {
        applyDisplayTitle(resolvedContextTitle);
        return;
      }
      const title = await loadThreadTitle(space, targetThreadId);
      if (title && isLatestRequest('title', requestId, targetThreadId)) {
        applyDisplayTitle(title);
      }
    },
    [applyDisplayTitle, resolvedContextTitle, space]
  );

  const reloadModelLabel = useCallback(
    async (targetThreadId: string | null) => {
      const requestId = nextRequestId('model');
      const label = await getCurrentChatModelLabel(space, targetThreadId);
      if (!isLatestRequest('model', requestId, targetThreadId)) {
        return;
      }
      setModelLabel(label);
    },
    [space]
  );

  const reloadAvatarConfig = useCallback(
    async (targetThreadId: string | null) => {
      const requestId = nextRequestId('avatar');
      if (!targetThreadId) {
        setAvatarConfig({ avatarEnabled: false, avatarUri: null });
        return;
      }
      const nextAvatarConfig = await loadThreadAvatarConfig(space, targetThreadId);
      if (!isLatestRequest('avatar', requestId, targetThreadId)) {
        return;
      }
      setAvatarConfig(nextAvatarConfig);
    },
    [space]
  );

  const reloadMemoryCaptures = useCallback(
    async (targetThreadId: string | null) => {
      const requestId = nextRequestId('memory');
      if (!targetThreadId) {
        setMemoryCaptures([]);
        return;
      }
      const captures = await listRecentMemoryCaptures(space, targetThreadId);
      if (!isLatestRequest('memory', requestId, targetThreadId)) {
        return;
      }
      setMemoryCaptures(captures);
    },
    [space]
  );

  const reloadRecentThreads = useCallback(async () => {
    setRecentThreads(await listAiHistoryThreads({ limit: 5, space }));
  }, [space]);

  useEffect(() => {
    const nextThreadId = threadId ?? null;
    activeThreadIdRef.current = nextThreadId;
    setActiveThreadId(nextThreadId);
    editingUserMessageIdRef.current = null;
    setEditingUserMessageId(null);
    setSelectedVersionByMessageId({});
    setPendingAttachments([]);
    setLoadedMessageLimit(CHAT_MESSAGE_PAGE_SIZE);
    setHasEarlierMessages(false);
    if (!nextThreadId) {
      setMessages([]);
      setMemoryCaptures([]);
    }
    userScrolledAwayFromBottomRef.current = false;
    setLatestVisible(true);
    applyDisplayTitle(contextTitle ?? (contextType === 'ip' ? 'IP 对话' : contextType === 'knowledge_base' ? '知识库对话' : '普通聊天'));
  }, [applyDisplayTitle, contextTitle, contextType, threadId]);

  useEffect(() => {
    void reloadMessages(threadId ?? null);
  }, [reloadMessages, threadId]);

  useEffect(() => {
    void reloadModelLabel(threadId ?? null);
  }, [reloadModelLabel, threadId]);

  useEffect(() => {
    void reloadAvatarConfig(threadId ?? null);
  }, [reloadAvatarConfig, threadId]);

  useEffect(() => {
    void reloadThreadTitle(threadId ?? null);
  }, [reloadThreadTitle, threadId]);

  useEffect(() => {
    void reloadMemoryCaptures(threadId ?? null);
  }, [reloadMemoryCaptures, threadId]);

  useEffect(() => {
    void reloadRecentThreads();
  }, [reloadRecentThreads, activeThreadId]);

  useEffect(() => {
    if (isLoadingEarlierRef.current) {
      const timeout = setTimeout(() => {
        isLoadingEarlierRef.current = false;
      }, 250);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [messages]);

  useEffect(() => {
    return () => {
      screenMountedRef.current = false;
      cancelGenerationAction();
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      activeStreamGenerationRef.current += 1;
      if (newChatFeedbackTimeoutRef.current) {
        clearTimeout(newChatFeedbackTimeoutRef.current);
        newChatFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  function showNewChatFeedback() {
    if (newChatFeedbackTimeoutRef.current) {
      clearTimeout(newChatFeedbackTimeoutRef.current);
    }
    setNewChatFeedbackVisible(true);
    newChatFeedbackTimeoutRef.current = setTimeout(() => {
      setNewChatFeedbackVisible(false);
      newChatFeedbackTimeoutRef.current = null;
    }, 1400);
  }

  function handleNewChatPress() {
    if (generating) {
      Alert.alert(
        '停止当前回复并新建聊天？',
        '当前已生成内容会保留在原会话。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '停止并新建',
            style: 'destructive',
            onPress: () => {
              setNewChatFeedbackVisible(false);
              void handleStop().finally(() => {
                if (screenMountedRef.current) {
                  onNewChat();
                }
              });
            },
          },
        ]
      );
      return;
    }

    const alreadyBlankNewChat =
      !activeThreadId &&
      messages.length === 0 &&
      composerText.trim().length === 0 &&
      pendingAttachments.length === 0 &&
      !errorMessage;

    if (alreadyBlankNewChat) {
      showNewChatFeedback();
      return;
    }
    setNewChatFeedbackVisible(false);
    onNewChat();
  }

  async function ensureThread(): Promise<string | null> {
    if (!screenMountedRef.current) {
      return null;
    }
    if (activeThreadId) {
      return activeThreadId;
    }
    const thread = await createThreadFromContext({
      boundIpId: boundIpId ?? null,
      boundKnowledgeBaseId: boundKnowledgeBaseId ?? null,
      contextType,
      includeIpDocuments,
      space,
      title: resolvedContextTitle,
    });
    if (!screenMountedRef.current) {
      return null;
    }
    activeThreadIdRef.current = thread.id;
    setActiveThreadId(thread.id);
    onThreadReady?.(thread.id);
    void reloadModelLabel(thread.id);
    void reloadAvatarConfig(thread.id);
    return thread.id;
  }

  async function handleOpenSessionConfig() {
    try {
      const nextThreadId = await ensureThread();
      if (!nextThreadId || !screenMountedRef.current) {
        return;
      }
      onOpenSessionConfig(nextThreadId);
    } catch (error) {
      if (!screenMountedRef.current) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '无法打开会话设置');
    }
  }

  async function onOpenMemoryBoardFromChat() {
    try {
      const nextThreadId = await ensureThread();
      if (!nextThreadId || !screenMountedRef.current) {
        return;
      }
      onOpenMemoryBoard(nextThreadId);
    } catch (error) {
      if (!screenMountedRef.current) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '无法打开记忆管理');
    }
  }

  async function persistMemoryCaptures(nextCaptures: MemoryCaptureNoticeItem[]) {
    if (!activeThreadId) {
      setMemoryCaptures(nextCaptures);
      return;
    }
    setMemoryCaptures(nextCaptures);
    if (nextCaptures.length === 0) {
      await dismissMemoryCapture(space, activeThreadId);
      return;
    }
    await replaceRecentMemoryCaptures(space, activeThreadId, nextCaptures);
  }

  async function onUndoMemoryCapture(targetItems: MemoryCaptureNoticeItem[] = memoryCaptures) {
    if (!activeThreadId) {
      return;
    }
    try {
      const targetIds = new Set(targetItems.map((memory) => memory.id));
      const deletableItems = targetItems.filter((memory) => memory.kind !== 'conflict');
      await Promise.all(deletableItems.map((memory) => deleteMemory(space, memory.id)));
      await persistMemoryCaptures(memoryCaptures.filter((memory) => !targetIds.has(memory.id)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '撤销记忆失败');
    }
  }

  async function onSaveMemoryCapture(memoryId: string, content: string) {
    if (!activeThreadId) {
      return;
    }
    try {
      const memory = await updateMemoryContent(space, memoryId, content);
      const next = memoryCaptures.map((item) => item.id === memoryId ? { ...item, content: memory?.content ?? content } : item);
      await persistMemoryCaptures(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '更新记忆失败');
    }
  }

  async function onMarkMemoryCaptureInaccurate(memoryId: string) {
    if (!activeThreadId) {
      return;
    }
    try {
      await markMemoryInaccurate(space, memoryId);
      const next = memoryCaptures.filter((item) => item.id !== memoryId);
      await persistMemoryCaptures(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '标记记忆失败');
    }
  }

  async function pickChatImages() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('需要相册权限才能上传图片。');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
        quality: 1,
      });
      if (result.canceled) {
        return;
      }
      const picked = result.assets.map<AiComposerAttachment>((asset, index) => ({
        id: `image-${Date.now()}-${index}-${asset.uri}`,
        kind: 'image',
        mimeType: asset.mimeType ?? null,
        name: asset.fileName ?? getFileNameFromUri(asset.uri, `image-${index + 1}`),
        size: asset.fileSize ?? null,
        uri: asset.uri,
      }));
      setPendingAttachments((current) => [...current, ...picked]);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '选择图片失败');
    }
  }

  async function pickChatVideos() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('需要相册权限才能上传视频。');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: true,
        mediaTypes: ['videos'],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
        quality: 1,
      });
      if (result.canceled) {
        return;
      }
      const picked = result.assets.map<AiComposerAttachment>((asset, index) => ({
        id: `video-${Date.now()}-${index}-${asset.uri}`,
        kind: 'video',
        mimeType: asset.mimeType ?? null,
        name: asset.fileName ?? getFileNameFromUri(asset.uri, `video-${index + 1}`),
        size: asset.fileSize ?? null,
        uri: asset.uri,
      }));
      setPendingAttachments((current) => [...current, ...picked]);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '选择视频失败');
    }
  }

  async function pickChatDocuments() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: CHAT_DOCUMENT_TYPES,
      });
      if (result.canceled) {
        return;
      }
      const picked = result.assets.map<AiComposerAttachment>((asset, index) => ({
        id: `document-${Date.now()}-${index}-${asset.uri}`,
        kind: 'document',
        mimeType: asset.mimeType ?? null,
        name: asset.name ?? getFileNameFromUri(asset.uri, `document-${index + 1}`),
        size: asset.size ?? null,
        uri: asset.uri,
      }));
      setPendingAttachments((current) => [...current, ...picked]);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '选择文档失败');
    }
  }

  async function copyMessageContent(message: AiMessageWithCitations) {
    const content = message.content || message.errorMessage || '';
    if (!content.trim()) {
      return;
    }
    await Clipboard.setStringAsync(content);
    setErrorMessage(null);
  }

  async function handleSend() {
    const typedText = composerText.trim();
    const attachments = pendingAttachments;
    const content = buildChatMessageContent(typedText, attachments);
    if ((!typedText && !attachments.length) || generating) {
      return;
    }
    const actionToken = beginGenerationAction();
    if (!actionToken) {
      return;
    }
    setComposerText('');
    setPendingAttachments([]);
    setGenerating(true);
    setErrorMessage(null);
    followLatestMessage();
    let nextThreadId: string | null = null;
    let streamController: AbortController | null = null;
    let streamGeneration = 0;
    try {
      nextThreadId = await ensureThread();
      if (!nextThreadId || !screenMountedRef.current) {
        return;
      }
      const targetThreadId = nextThreadId;
      const streamRequest = beginStreamingRequest(targetThreadId);
      streamController = streamRequest.controller;
      streamGeneration = streamRequest.generation;
      await sendUserMessage({
        content,
        onCreated: ({ assistantMessageId }) => {
          if (!isCurrentStream(targetThreadId, streamGeneration) || streamController?.signal.aborted) {
            return;
          }
          setActiveAssistantId(assistantMessageId);
          followLatestMessage();
          void reloadMessages(targetThreadId);
        },
        onMessagePatch: (patch) => {
          if (!isCurrentStream(targetThreadId, streamGeneration) || streamController?.signal.aborted) {
            return;
          }
          applyStreamingMessagePatch(patch);
        },
        onUpdated: () => {
          if (!isCurrentStream(targetThreadId, streamGeneration) || streamController?.signal.aborted) {
            return;
          }
          void reloadMessages(targetThreadId);
        },
        signal: streamController.signal,
        space,
        threadId: targetThreadId,
      });
      await reloadMessages(targetThreadId);
      await reloadMemoryCaptures(targetThreadId);
    } catch (error) {
      if (!screenMountedRef.current || streamController?.signal.aborted || (nextThreadId && !isCurrentStream(nextThreadId, streamGeneration))) {
        return;
      }
      setComposerText(typedText);
      setPendingAttachments(attachments);
      setErrorMessage(error instanceof Error ? error.message : '发送失败');
    } finally {
      finishGenerationAction(actionToken);
      if (!screenMountedRef.current) {
        return;
      }
      const stillCurrent = nextThreadId && streamGeneration ? isCurrentStream(nextThreadId, streamGeneration) : true;
      if (stillCurrent) {
        setGenerating(false);
        setActiveAssistantId(null);
        if (streamAbortRef.current === streamController) {
          streamAbortRef.current = null;
        }
      }
    }
  }

  function hasLaterMessages(messageId: string): boolean {
    const index = messages.findIndex((message) => message.id === messageId);
    return index >= 0 && index < messages.length - 1;
  }

  function confirmRemovingLaterMessages(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        '移除后续对话？',
        '编辑或重新生成这条早期消息会移除它后面的对话。当前版本会保留被编辑消息的版本记录，但不会保留完整后续分支。',
        [
          { text: '取消', style: 'cancel', onPress: () => resolve(false) },
          { text: '继续', style: 'destructive', onPress: () => resolve(true) },
        ]
      );
    });
  }

  async function handleSubmitInlineRewrite(messageId: string, nextContent: string) {
    const content = nextContent.trim();
    if (!content || generating || !activeThreadId) {
      return;
    }
    const userMessageId = messageId;
    const actionToken = beginGenerationAction();
    if (!actionToken) {
      return;
    }
    if (hasLaterMessages(userMessageId)) {
      const confirmed = await confirmRemovingLaterMessages();
      if (!confirmed) {
        finishGenerationAction(actionToken);
        return;
      }
      if (!screenMountedRef.current) {
        finishGenerationAction(actionToken);
        return;
      }
    }
    const targetThreadId = activeThreadId;
    editingUserMessageIdRef.current = null;
    setEditingUserMessageId(null);
    setGenerating(true);
    setErrorMessage(null);
    followLatestMessage();
    const { controller: streamController, generation: streamGeneration } = beginStreamingRequest(targetThreadId);
    try {
      await rewriteUserMessage({
        content,
        onCreated: ({ assistantMessageId }) => {
          if (!isCurrentStream(targetThreadId, streamGeneration) || streamController.signal.aborted) {
            return;
          }
          setActiveAssistantId(assistantMessageId);
          showLatestMessageVersion(userMessageId);
          showLatestMessageVersion(assistantMessageId);
          followLatestMessage();
          void reloadMessages(targetThreadId);
        },
        onMessagePatch: (patch) => {
          if (!isCurrentStream(targetThreadId, streamGeneration) || streamController.signal.aborted) {
            return;
          }
          applyStreamingMessagePatch(patch);
        },
        onUpdated: () => {
          if (!isCurrentStream(targetThreadId, streamGeneration) || streamController.signal.aborted) {
            return;
          }
          void reloadMessages(targetThreadId);
        },
        signal: streamController.signal,
        space,
        threadId: targetThreadId,
        userMessageId,
      });
      await reloadMessages(targetThreadId);
      await reloadMemoryCaptures(targetThreadId);
    } catch (error) {
      if (streamController.signal.aborted || !isCurrentStream(targetThreadId, streamGeneration)) {
        return;
      }
      editingUserMessageIdRef.current = userMessageId;
      setEditingUserMessageId(userMessageId);
      setErrorMessage(error instanceof Error ? error.message : '重写失败');
    } finally {
      finishGenerationAction(actionToken);
      if (isCurrentStream(targetThreadId, streamGeneration)) {
        setGenerating(false);
        setActiveAssistantId(null);
        if (streamAbortRef.current === streamController) {
          streamAbortRef.current = null;
        }
      }
    }
  }

  async function handleStop() {
    const targetAssistantId = activeAssistantId;
    const targetThreadId = activeThreadIdRef.current;
    cancelGenerationAction();
    abortActiveStreamingRequest();
    setGenerating(false);
    setActiveAssistantId(null);
    if (!targetAssistantId) {
      setGenerating(false);
      return;
    }
    await stopStreamingMessage({ assistantMessageId: targetAssistantId, space });
    await reloadMessages(targetThreadId);
  }

  async function handleRegenerate(messageId?: string) {
    const targetMessageId = messageId ?? latestAssistantMessage?.id;
    if (!targetMessageId || !activeThreadId) {
      return;
    }
    const targetThreadId = activeThreadId;
    if (hasLaterMessages(targetMessageId)) {
      const actionToken = beginGenerationAction();
      if (!actionToken) {
        return;
      }
      const confirmed = await confirmRemovingLaterMessages();
      if (!confirmed) {
        finishGenerationAction(actionToken);
        return;
      }
      if (!screenMountedRef.current) {
        finishGenerationAction(actionToken);
        return;
      }
      return handleConfirmedRegenerate(targetThreadId, targetMessageId, actionToken);
    }
    const actionToken = beginGenerationAction();
    if (!actionToken) {
      return;
    }
    return handleConfirmedRegenerate(targetThreadId, targetMessageId, actionToken);
  }

  async function handleConfirmedRegenerate(targetThreadId: string, targetMessageId: string, actionToken: number) {
    setGenerating(true);
    setActiveAssistantId(targetMessageId);
    setErrorMessage(null);
    showLatestMessageVersion(targetMessageId);
    followLatestMessage();
    const { controller: streamController, generation: streamGeneration } = beginStreamingRequest(targetThreadId);
    try {
      await regenerateAssistantMessage({
        assistantMessageId: targetMessageId,
        onMessagePatch: (patch) => {
          if (!isCurrentStream(targetThreadId, streamGeneration) || streamController.signal.aborted) {
            return;
          }
          applyStreamingMessagePatch(patch);
        },
        onUpdated: () => {
          if (!isCurrentStream(targetThreadId, streamGeneration) || streamController.signal.aborted) {
            return;
          }
          void reloadMessages(targetThreadId);
        },
        signal: streamController.signal,
        space,
        threadId: targetThreadId,
      });
      await reloadMessages(targetThreadId);
      await reloadMemoryCaptures(targetThreadId);
    } catch (error) {
      if (streamController.signal.aborted || !isCurrentStream(targetThreadId, streamGeneration)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '刷新失败');
    } finally {
      finishGenerationAction(actionToken);
      if (isCurrentStream(targetThreadId, streamGeneration)) {
        setGenerating(false);
        setActiveAssistantId(null);
        if (streamAbortRef.current === streamController) {
          streamAbortRef.current = null;
        }
      }
    }
  }

  function handleEditUserMessage(messageId: string, content: string) {
    if (generating) {
      return;
    }
    editingUserMessageIdRef.current = messageId;
    setEditingUserMessageId(messageId);
    setErrorMessage(null);
  }

  function cancelInlineEdit() {
    editingUserMessageIdRef.current = null;
    setEditingUserMessageId(null);
  }

  async function handleVoiceInput() {
    try {
      setVoiceState('listening');
      setVoiceError(null);
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          setVoiceState('error');
          setVoiceError('需要麦克风权限才能进行语音输入。');
          setErrorMessage('需要麦克风权限才能进行语音输入。');
          return;
        }
      }
      setVoiceState('recognizing');
      const result = await recognizeSpeech();
      const recognizedText = result.text.trim();
      if (!recognizedText) {
        setVoiceState('error');
        setVoiceError('没有识别到语音内容。');
        setErrorMessage('没有识别到语音内容。');
        return;
      }
      setComposerText((current) => {
        if (!current.trim()) {
          return recognizedText;
        }
        return `${current}${current.endsWith('\n') ? '' : '\n'}${recognizedText}`;
      });
      setVoiceState('idle');
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '语音识别失败';
      setVoiceState('error');
      setVoiceError(message);
      setErrorMessage(message);
    }
  }

  function handleCancelVoiceInput() {
    setVoiceState('cancelled');
    setTimeout(() => setVoiceState('idle'), 1200);
  }

  function getComposerPlaceholder() {
    if (contextType === 'ip') {
      return '询问这个 IP 的整理、标签或资料';
    }
    if (contextType === 'knowledge_base') {
      return '询问知识库内容';
    }
    return '输入提示或需求';
  }

  function openCitation(citation: AiCitationRecord) {
    if (citation.sourceType === 'document_chunk') {
      onOpenSource(citation.sourceId, citation.label, citation.locator as AiDocumentReaderLocator);
      return;
    }
    if (citation.sourceType === 'ip_metadata') {
      const ipId = typeof citation.locator.ipId === 'number' ? citation.locator.ipId : Number(citation.sourceId);
      if (Number.isFinite(ipId)) {
        onOpenIpSource(ipId);
      }
      return;
    }
    if (citation.sourceType === 'image_note') {
      const imageId = typeof citation.locator.imageId === 'number' ? citation.locator.imageId : Number(citation.sourceId);
      if (Number.isFinite(imageId)) {
        onOpenImageSource(imageId);
      }
    }
  }

  const messageKeyExtractor = useCallback((item: VisibleMessageItem) => item.message.id, []);

  const renderMessageItem = useCallback(
    ({ item }: { item: VisibleMessageItem }) => {
      const { message } = item;
      const inlineMemoryCaptures = memoryCapturesBySourceMessageId.get(message.id) ?? [];
      return (
        <>
          {item.showDateSeparator ? <Text style={styles.dateSeparator}>{formatDateSeparator(message.createdAt)}</Text> : null}
          <AiMessageBubble
            assistantAvatar={avatarConfig}
            editingMessageId={editingUserMessageId}
            generating={generating}
            message={message}
            showAvatar={item.showAvatar}
            space={space}
            onCopy={(targetMessage) => {
              void copyMessageContent(targetMessage);
            }}
            onCancelEdit={cancelInlineEdit}
            onEditUser={handleEditUserMessage}
            onOpenCitation={openCitation}
            onRegenerate={(messageId) => {
              void handleRegenerate(messageId);
            }}
            onSelectVersion={(messageId, versionIndex) => {
              setSelectedVersionByMessageId((current) => ({ ...current, [messageId]: versionIndex }));
            }}
            onSubmitEdit={(messageId, content) => {
              void handleSubmitInlineRewrite(messageId, content);
            }}
            streaming={generating && message.id === activeAssistantId}
          />
          {inlineMemoryCaptures.length > 0 ? (
            <View style={styles.inlineMemoryNotice}>
              <AiMemoryCaptureNotice
                count={inlineMemoryCaptures.length}
                items={inlineMemoryCaptures}
                summary={inlineMemoryCaptures[0]?.content}
                onManage={() => void onOpenMemoryBoardFromChat()}
                onMarkInaccurate={(memoryId) => void onMarkMemoryCaptureInaccurate(memoryId)}
                onSave={(memoryId, content) => void onSaveMemoryCapture(memoryId, content)}
                onUndo={() => void onUndoMemoryCapture(inlineMemoryCaptures)}
              />
            </View>
          ) : null}
        </>
      );
    },
    [
      activeAssistantId,
      avatarConfig,
      cancelInlineEdit,
      copyMessageContent,
      editingUserMessageId,
      generating,
      handleEditUserMessage,
      handleRegenerate,
      handleSubmitInlineRewrite,
      memoryCapturesBySourceMessageId,
      openCitation,
      space,
    ]
  );

  return (
    <AppScreen
      backgroundColor={aiLightColors.canvas}
      contentStyle={[styles.screenContent, { paddingTop: statusBarHeight + layout.pageTopOffset }]}
    >
      <View style={styles.header}>
        <Pressable accessibilityLabel="打开综合记录" accessibilityRole="button" onPress={() => setRecordDrawerVisible(true)} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.ink} name="menu-outline" size={22} />
        </Pressable>
        <View style={styles.titleBlock}>
          <View style={styles.titleLine}>
            <Text numberOfLines={1} style={styles.title}>
              {displayTitle}
            </Text>
            {thinking ? <View style={styles.liveDot} /> : null}
          </View>
          {modelLabel ? (
            <Text numberOfLines={1} style={styles.modelSubtitle}>
              {modelLabel}
            </Text>
          ) : null}
        </View>
        <Pressable accessibilityLabel="会话设置" accessibilityRole="button" onPress={() => void handleOpenSessionConfig()} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.ink} name="options-outline" size={18} />
        </Pressable>
        <Pressable accessibilityLabel="新聊天" accessibilityRole="button" onPress={handleNewChatPress} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.ink} name="add-outline" size={18} />
        </Pressable>
      </View>
      {newChatFeedbackVisible ? (
        <View accessibilityLiveRegion="polite" style={styles.newChatFeedback}>
          <Ionicons color={aiLightColors.coralActive} name="checkmark-circle-outline" size={14} />
          <Text style={styles.newChatFeedbackText}>已在新的空白聊天</Text>
        </View>
      ) : null}

      <FlatList
        ref={messageListRef}
        data={invertedMessageItems}
        inverted
        keyboardDismissMode={inlineEditingActive ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        keyExtractor={messageKeyExtractor}
        ListFooterComponent={
          <>
            {errorMessage ? <AiChatErrorBanner message={errorMessage} onRetry={latestAssistantMessage?.status === 'failed' ? () => void handleRegenerate(latestAssistantMessage.id) : undefined} /> : null}
            {hasEarlierMessages ? (
              <Pressable accessibilityLabel="加载更早消息" accessibilityRole="button" onPress={loadEarlierMessages} style={({ pressed }) => [styles.loadEarlierButton, pressed && styles.pressed]}>
                <Ionicons color={aiLightColors.muted} name="chevron-up" size={15} />
                <Text style={styles.loadEarlierText}>加载更早消息</Text>
              </Pressable>
            ) : null}
          </>
        }
        onScroll={handleMessageScroll}
        renderItem={renderMessageItem}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.messageScroller}
        contentContainerStyle={styles.messageScrollContent}
      />

      {inlineEditingActive ? null : (
        <View style={styles.composerPanel}>
          {contextTrimNotice ? <Text style={styles.contextTrimNotice}>较早的部分对话可能不会被本次回复参考。</Text> : null}
          <AiScrollToLatestButton visible={!latestVisible} onPress={() => followLatestMessage()} />
          {fallbackMemoryCaptures.length > 0 ? (
            <AiMemoryCaptureNotice
              count={fallbackMemoryCaptures.length}
              items={fallbackMemoryCaptures}
              summary={fallbackMemoryCaptures[0]?.content}
              onManage={() => void onOpenMemoryBoardFromChat()}
              onMarkInaccurate={(memoryId) => void onMarkMemoryCaptureInaccurate(memoryId)}
              onSave={(memoryId, content) => void onSaveMemoryCapture(memoryId, content)}
              onUndo={() => void onUndoMemoryCapture(fallbackMemoryCaptures)}
            />
          ) : null}
          <AiChatComposer
            attachments={pendingAttachments}
            generating={generating}
            onAddAttachment={() => setAttachmentSheetVisible(true)}
            onChangeText={setComposerText}
            onComposerHeightChange={handleComposerHeightChange}
            onRemoveAttachment={(id) => setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id))}
            placeholder={getComposerPlaceholder()}
            onSend={() => {
              void handleSend();
            }}
            onStop={() => {
              void handleStop();
            }}
            onVoiceInput={() => {
              void handleVoiceInput();
            }}
            onCancelVoiceInput={handleCancelVoiceInput}
            value={composerText}
            voiceError={voiceError}
            voiceState={voiceState}
          />
        </View>
      )}
      <AppActionSheet
        items={attachmentSheetItems}
        onClose={() => setAttachmentSheetVisible(false)}
        title="添加附件"
        visible={attachmentSheetVisible}
      />
      <AiComprehensiveRecordDrawer
        activeThreadId={activeThreadId}
        recentThreads={recentThreads}
        visible={recordDrawerVisible}
        onClose={() => setRecordDrawerVisible(false)}
        onNewChat={() => {
          setRecordDrawerVisible(false);
          onStartNormalChat();
        }}
        onOpenHistory={() => {
          setRecordDrawerVisible(false);
          onOpenHistory();
        }}
        onOpenThread={(thread) => {
          setRecordDrawerVisible(false);
          onOpenThread(thread);
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    gap: rhythm.cardContentGap,
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  composerPanel: {
    backgroundColor: aiLightColors.canvas,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingBottom: spacing[3],
    paddingTop: spacing[2],
    ...shadows.none,
  },
  contextTrimNotice: {
    ...typography.textStyles.micro,
    alignSelf: 'center',
    color: aiLightColors.muted,
    paddingBottom: spacing[1],
  },
  header: {
    alignItems: 'center',
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: spacing[12],
  },
  pressed: {
    opacity: 0.78,
  },
  roundButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  titleBlock: {
    alignItems: 'center',
    flex: 1,
    gap: rhythm.microGap,
    justifyContent: 'center',
  },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  title: {
    ...typography.textStyles.navTitle,
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 26,
    maxWidth: '90%',
  },
  modelSubtitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    maxWidth: '92%',
    textAlign: 'center',
  },
  newChatFeedback: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: spacing[7],
    paddingHorizontal: spacing[3],
  },
  newChatFeedbackText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '600',
  },
  liveDot: {
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.pill,
    height: spacing[1.5],
    width: spacing[1.5],
  },
  error: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    textAlign: 'center',
  },
  messageScroller: {
    flex: 1,
  },
  messageScrollContent: {
    flexGrow: 1,
    gap: rhythm.listCardGap,
    paddingBottom: spacing[4],
    paddingTop: spacing[3],
  },
  loadEarlierButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 30,
    paddingHorizontal: spacing[3],
  },
  loadEarlierText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '600',
  },
  dateSeparator: {
    ...typography.textStyles.micro,
    alignSelf: 'center',
    color: aiLightColors.muted,
    paddingVertical: spacing[1],
  },
  inlineMemoryNotice: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
  },
});
