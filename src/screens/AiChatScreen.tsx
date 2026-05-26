import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Easing, FlatList, type NativeScrollEvent, type NativeSyntheticEvent, PermissionsAndroid, Platform, Pressable, StatusBar, StyleSheet, Text, type ViewToken, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiChatComposer, type AiComposerAttachment } from '../components/ai/AiChatComposer';
import { AiChatErrorBanner } from '../components/ai/AiChatErrorBanner';
import { AiComprehensiveRecordDrawer } from '../components/ai/AiComprehensiveRecordDrawer';
import type { AiVoiceInputState } from '../components/ai/AiVoiceInputStatus';
import { aiLightColors, aiLightDisplayFont } from '../components/ai/aiLightTheme';
import { AiMemoryCaptureNotice } from '../components/ai/AiMemoryCaptureNotice';
import { AiMessageBubble } from '../components/ai/AiMessageBubble';
import { AiScrollToLatestButton } from '../components/ai/AiScrollToLatestButton';
import { AppScreen } from '../components/AppScreen';
import { recognizeSpeech } from '../native/pixoryMediaModule';
import { deleteMemory, dismissMemoryCapture, listRecentMemoryCaptures, markMemoryInaccurate, replaceRecentMemoryCaptures, updateMemoryContent, type MemoryCaptureNoticeItem } from '../ai/aiMemoryService';
import {
  createThreadFromContext,
  deleteAiThreads,
  getCurrentChatModelLabel,
  listThreadMessages,
  loadThreadTitle,
  loadThreadAvatarConfig,
  listAiHistoryThreads,
  regenerateAssistantMessage,
  renameAiThread,
  rewriteUserMessage,
  sendUserMessage,
  stopStreamingMessage,
  type AiMessageWithCitations,
  type AiStreamingMessagePatch,
} from '../ai/aiChatService';
import {
  getActiveBranchForNextMessageFromVisibleMessages,
  getSelectedMessageVersionIndex as resolveSelectedMessageVersionIndex,
  messageMatchesSelectedBranchPath,
} from '../ai/aiBranching';
import {
  createComposerEntranceRun,
  isCurrentComposerEntranceRun,
  shouldStartComposerEntrance,
  type ComposerEntranceReason,
  type ComposerEntranceRun,
} from '../ai/aiComposerEntrancePolicy';
import type { AiCitationRecord, AiContextType } from '../ai/types';
import type { AiDocumentReaderLocator } from '../ai/readers/readerTypes';
import type { AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import { layout, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

const MESSAGE_BOTTOM_LOCK_THRESHOLD = 120;
const CHAT_MESSAGE_PAGE_SIZE = 60;
const COMPOSER_ENTRANCE_DURATION_MS = 500;
const INLINE_EDIT_VISIBILITY_SCROLL_DELAYS_MS = [80, 320];
const INLINE_EDIT_SCROLL_RETRY_DELAY_MS = 120;
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

function getAiChatGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) {
    return '今天想聊点什么？';
  }
  if (hour < 18) {
    return '现在想聊点什么？';
  }
  return '今晚想聊点什么？';
}

const STARTER_SUGGESTIONS = ['整理这段资料', '帮我发散想法', '总结当前设定'] as const;

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

function findLatestAssistantMessage(messages: AiMessageWithCitations[]): AiMessageWithCitations | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index];
    }
  }
  return undefined;
}

function AiChatStarterHints({ onPickSuggestion }: { onPickSuggestion: (value: string) => void }) {
  return (
    <View style={styles.starterWrap}>
      <Text style={styles.starterGreeting}>{getAiChatGreeting()}</Text>
      <View style={styles.starterSuggestions}>
        {STARTER_SUGGESTIONS.map((suggestion) => (
          <Pressable
            accessibilityRole="button"
            key={suggestion}
            onPress={() => onPickSuggestion(suggestion)}
            style={({ pressed }) => [styles.starterChip, pressed && styles.pressed]}
          >
            <Text style={styles.starterChipText}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface AiChatScreenProps {
  space: PixorySpace;
  contextType: AiContextType;
  contextTitle?: string;
  boundIpId?: number;
  boundKnowledgeBaseId?: string;
  composerEntranceKey?: string;
  composerEntranceReason?: ComposerEntranceReason;
  includeIpDocuments?: boolean;
  threadId?: string;
  onOpenHistory: () => void;
  onOpenRoleLibrary: () => void;
  onOpenGlobalMaterials: () => void;
  onOpenSessionConfig: (threadId: string) => void;
  onOpenMemoryBoard: (threadId: string) => void;
  onNewChat: () => void;
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
  composerEntranceKey,
  composerEntranceReason = 'replace_current',
  includeIpDocuments = false,
  threadId,
  onOpenHistory,
  onOpenRoleLibrary,
  onOpenGlobalMaterials,
  onOpenSessionConfig,
  onOpenMemoryBoard,
  onNewChat,
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
  const latestVisibleRef = useRef(true);
  const inlineEditSafeVisibleMessageIdsRef = useRef(new Set<string>());
  const inlineEditViewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 82 });
  const handleInlineEditViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: ViewToken<VisibleMessageItem>[] }) => {
    inlineEditSafeVisibleMessageIdsRef.current = new Set(
      viewableItems
        .filter((item) => item.isViewable && item.item?.message?.id)
        .map((item) => item.item.message.id)
    );
  });
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
  const inlineEditVisibilityTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const voiceResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedComposerEntranceKeysRef = useRef(new Set<string>());
  const previousComposerEntranceKeyRef = useRef<string | undefined>(undefined);
  const composerEntranceRunRef = useRef<ComposerEntranceRun | null>(null);
  const shouldPrimeComposerEntrance = shouldStartComposerEntrance({
    nextRouteKey: composerEntranceKey,
    playedRouteKeys: playedComposerEntranceKeysRef.current,
    previousRouteKey: previousComposerEntranceKeyRef.current,
    reason: composerEntranceReason,
  });
  const composerEntranceProgress = useRef(new Animated.Value(shouldPrimeComposerEntrance ? 0 : 1)).current;
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
  const [pendingMessageActionId, setPendingMessageActionId] = useState<string | null>(null);
  const [selectedVersionByMessageId, setSelectedVersionByMessageId] = useState<Record<string, number>>({});
  const [modelLabel, setModelLabel] = useState('');
  const [displayTitle, setDisplayTitle] = useState(resolvedContextTitle);
  const [avatarConfig, setAvatarConfig] = useState({ avatarEnabled: false, avatarUri: null as string | null });
  const [memoryCaptures, setMemoryCaptures] = useState<MemoryCaptureNoticeItem[]>([]);
  const [voiceState, setVoiceState] = useState<AiVoiceInputState>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [latestVisible, setLatestVisible] = useState(true);
  const [composerPanelHeight, setComposerPanelHeight] = useState(0);
  const [recentThreads, setRecentThreads] = useState<AiThreadHistoryItem[]>([]);
  const [newChatFeedbackVisible, setNewChatFeedbackVisible] = useState(false);
  const [recordDrawerVisible, setRecordDrawerVisible] = useState(false);
  const editingUserMessageIdRef = useRef<string | null>(null);
  const thinking = generating;
  const inlineEditingActive = Boolean(editingUserMessageId);
  const composerEntranceTranslateY = composerEntranceProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [spacing[7], 0],
  });
  const composerEntranceStyle = {
    opacity: composerEntranceProgress,
    transform: [{ translateY: composerEntranceTranslateY }],
  };
  const latestAssistantMessage = useMemo(() => findLatestAssistantMessage(messages), [messages]);
  const messagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);

  function getSelectedMessageVersionIndex(messageId: string, versionTotal: number): number {
    return resolveSelectedMessageVersionIndex(selectedVersionByMessageId, messageId, versionTotal);
  }

  function getBoundMessageVersionIndex(message: AiMessageWithCitations, previousMessage?: AiMessageWithCitations): number {
    if (
      message.role === 'assistant' &&
      !message.branchRootMessageId &&
      previousMessage?.role === 'user'
    ) {
      const selectedUserVersionIndex = selectedVersionByMessageId[previousMessage.id];
      if (selectedUserVersionIndex && selectedUserVersionIndex <= message.versionTotal) {
        return selectedUserVersionIndex;
      }
    }
    return getSelectedMessageVersionIndex(message.id, message.versionTotal);
  }

  function messageMatchesSelectedBranch(message: AiMessageWithCitations): boolean {
    return messageMatchesSelectedBranchPath(message, messagesById, selectedVersionByMessageId);
  }

  const visibleMessages = useMemo(
    () =>
      messages.filter(messageMatchesSelectedBranch).map((message, index, filteredMessages) => {
        const selectedVersionIndex = getBoundMessageVersionIndex(message, filteredMessages[index - 1]);
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
      const latestAssistant = findLatestAssistantMessage(visibleMessages);
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
    const nextLatestVisible = contentOffset.y <= MESSAGE_BOTTOM_LOCK_THRESHOLD;
    userScrolledAwayFromBottomRef.current = !nextLatestVisible;
    if (latestVisibleRef.current !== nextLatestVisible) {
      latestVisibleRef.current = nextLatestVisible;
      setLatestVisible(nextLatestVisible);
    }
  }, []);

  const followLatestMessage = useCallback((animated = true) => {
    userScrolledAwayFromBottomRef.current = false;
    latestVisibleRef.current = true;
    setLatestVisible(true);
    scrollToLatestMessage(animated, true);
  }, [scrollToLatestMessage]);

  const handleComposerHeightChange = useCallback(() => {
    if (editingUserMessageIdRef.current) {
      return;
    }
    scrollToLatestMessage(false);
  }, [scrollToLatestMessage]);

  function clearInlineEditVisibilityTimeouts() {
    inlineEditVisibilityTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    inlineEditVisibilityTimeoutsRef.current = [];
  }

  function clearVoiceResetTimeout() {
    if (voiceResetTimeoutRef.current) {
      clearTimeout(voiceResetTimeoutRef.current);
      voiceResetTimeoutRef.current = null;
    }
  }

  function scrollInlineEditMessageIntoView(messageId: string) {
    if (editingUserMessageIdRef.current !== messageId) {
      return;
    }
    if (inlineEditSafeVisibleMessageIdsRef.current.has(messageId)) {
      return;
    }
    const index = invertedMessageItems.findIndex((item) => item.message.id === messageId);
    if (index < 0) {
      return;
    }
    messageListRef.current?.scrollToIndex({
      animated: true,
      index,
      viewPosition: 0.42,
    });
  }

  function retryInlineEditScrollToIndex(info: { averageItemLength: number; index: number }) {
    const failedMessageId = invertedMessageItems[info.index]?.message.id;
    if (
      !failedMessageId ||
      editingUserMessageIdRef.current !== failedMessageId ||
      inlineEditSafeVisibleMessageIdsRef.current.has(failedMessageId)
    ) {
      return;
    }
    messageListRef.current?.scrollToOffset({
      animated: true,
      offset: Math.max(0, info.averageItemLength * info.index),
    });
    inlineEditVisibilityTimeoutsRef.current.push(
      setTimeout(() => scrollInlineEditMessageIntoView(failedMessageId), INLINE_EDIT_SCROLL_RETRY_DELAY_MS)
    );
  }

  function scheduleInlineEditVisibility(messageId: string) {
    clearInlineEditVisibilityTimeouts();
    inlineEditVisibilityTimeoutsRef.current = INLINE_EDIT_VISIBILITY_SCROLL_DELAYS_MS.map((delay) =>
      setTimeout(() => scrollInlineEditMessageIntoView(messageId), delay)
    );
  }

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

  function getActiveBranchForNextMessage(): { branchRootMessageId: string; branchVersionIndex: number } | null {
    return getActiveBranchForNextMessageFromVisibleMessages(visibleMessages, selectedVersionByMessageId);
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
        latestVisibleRef.current = true;
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
        latestVisibleRef.current = true;
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
    setRecentThreads(await listAiHistoryThreads({ limit: 15, space }));
  }, [space]);

  async function renameRecentThread(thread: AiThreadHistoryItem, title: string) {
    await renameAiThread(space, thread.id, title);
    await reloadRecentThreads();
    if (thread.id === activeThreadIdRef.current) {
      applyDisplayTitle(title);
    }
  }

  async function deleteRecentThread(thread: AiThreadHistoryItem) {
    await deleteAiThreads(space, [thread.id]);
    await reloadRecentThreads();
    if (thread.id === activeThreadIdRef.current) {
      onNewChat();
    }
  }

  useEffect(() => {
    const nextThreadId = threadId ?? null;
    activeThreadIdRef.current = nextThreadId;
    setActiveThreadId(nextThreadId);
    clearInlineEditVisibilityTimeouts();
    inlineEditSafeVisibleMessageIdsRef.current = new Set();
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
    latestVisibleRef.current = true;
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
      clearInlineEditVisibilityTimeouts();
      cancelGenerationAction();
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      activeStreamGenerationRef.current += 1;
      clearVoiceResetTimeout();
      if (newChatFeedbackTimeoutRef.current) {
        clearTimeout(newChatFeedbackTimeoutRef.current);
        newChatFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const shouldStart = shouldStartComposerEntrance({
      nextRouteKey: composerEntranceKey,
      playedRouteKeys: playedComposerEntranceKeysRef.current,
      previousRouteKey: previousComposerEntranceKeyRef.current,
      reason: composerEntranceReason,
    });
    previousComposerEntranceKeyRef.current = composerEntranceKey;
    if (!composerEntranceKey || !shouldStart) {
      composerEntranceRunRef.current = null;
      composerEntranceProgress.setValue(1);
      return;
    }

    const run = createComposerEntranceRun(composerEntranceKey);
    composerEntranceRunRef.current = run;

    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotionEnabled) => {
        if (cancelled || !isCurrentComposerEntranceRun(composerEntranceRunRef.current, run.key, run.token)) {
          return;
        }
        playedComposerEntranceKeysRef.current.add(composerEntranceKey);
        if (reduceMotionEnabled) {
          composerEntranceProgress.setValue(1);
          return;
        }
        composerEntranceProgress.setValue(0);
        Animated.timing(composerEntranceProgress, {
          duration: COMPOSER_ENTRANCE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }).start();
      })
      .catch(() => {
        if (cancelled || !isCurrentComposerEntranceRun(composerEntranceRunRef.current, run.key, run.token)) {
          return;
        }
        playedComposerEntranceKeysRef.current.add(composerEntranceKey);
        composerEntranceProgress.setValue(1);
      });

    return () => {
      cancelled = true;
      composerEntranceRunRef.current = null;
      composerEntranceProgress.stopAnimation();
    };
  }, [composerEntranceKey, composerEntranceProgress, composerEntranceReason]);

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
              onNewChat();
              void stopCurrentGeneration({ reloadAfterStop: false }).catch(() => undefined);
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
      const activeBranch = getActiveBranchForNextMessage();
      await sendUserMessage({
        branchRootMessageId: activeBranch?.branchRootMessageId,
        branchVersionIndex: activeBranch?.branchVersionIndex,
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
    const targetThreadId = activeThreadId;
    setPendingMessageActionId(userMessageId);
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
      setPendingMessageActionId(null);
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

  async function stopCurrentGeneration({ reloadAfterStop }: { reloadAfterStop: boolean }) {
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
    if (reloadAfterStop && screenMountedRef.current) {
      await reloadMessages(targetThreadId);
    }
  }

  async function handleStop() {
    await stopCurrentGeneration({ reloadAfterStop: true });
  }

  async function handleRegenerate(messageId?: string) {
    const targetMessageId = messageId ?? latestAssistantMessage?.id;
    if (!targetMessageId || !activeThreadId) {
      return;
    }
    const targetThreadId = activeThreadId;
    const actionToken = beginGenerationAction();
    if (!actionToken) {
      return;
    }
    return handleConfirmedRegenerate(targetThreadId, targetMessageId, actionToken);
  }

  async function handleConfirmedRegenerate(targetThreadId: string, targetMessageId: string, actionToken: number) {
    setPendingMessageActionId(targetMessageId);
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
      setPendingMessageActionId(null);
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
    scheduleInlineEditVisibility(messageId);
  }

  function cancelInlineEdit() {
    clearInlineEditVisibilityTimeouts();
    editingUserMessageIdRef.current = null;
    setEditingUserMessageId(null);
  }

  async function handleVoiceInput() {
    try {
      clearVoiceResetTimeout();
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
    clearVoiceResetTimeout();
    voiceResetTimeoutRef.current = setTimeout(() => {
      setVoiceState('idle');
      voiceResetTimeoutRef.current = null;
    }, 1200);
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
            pendingActionMessageId={pendingMessageActionId}
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
      pendingMessageActionId,
      space,
    ]
  );

  return (
    <AppScreen
      backgroundColor={aiLightColors.canvas}
      contentStyle={styles.drawerHost}
    >
      <View style={[styles.screenContent, { paddingTop: statusBarHeight + layout.pageTopOffset }]}>
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
        initialNumToRender={10}
        keyboardDismissMode={inlineEditingActive ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        keyExtractor={messageKeyExtractor}
        maxToRenderPerBatch={8}
        removeClippedSubviews={Platform.OS === 'android'}
        windowSize={11}
        ListEmptyComponent={invertedMessageItems.length === 0 ? (
          <AiChatStarterHints onPickSuggestion={setComposerText} />
        ) : null}
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
        onViewableItemsChanged={handleInlineEditViewableItemsChangedRef.current}
        onScrollToIndexFailed={retryInlineEditScrollToIndex}
        renderItem={renderMessageItem}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.messageScroller}
        contentContainerStyle={styles.messageScrollContent}
        viewabilityConfig={inlineEditViewabilityConfigRef.current}
      />

      <AiScrollToLatestButton bottomOffset={composerPanelHeight + spacing[4]} visible={!latestVisible && !inlineEditingActive} onPress={() => followLatestMessage()} />

      {inlineEditingActive ? null : (
        <Animated.View onLayout={(event) => setComposerPanelHeight(event.nativeEvent.layout.height)} style={[styles.composerPanel, composerEntranceStyle]}>
          {contextTrimNotice ? <Text style={styles.contextTrimNotice}>较早的部分对话可能不会被本次回复参考。</Text> : null}
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
            onAddDocumentAttachment={() => void pickChatDocuments()}
            onAddImageAttachment={() => void pickChatImages()}
            onAddVideoAttachment={() => void pickChatVideos()}
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
        </Animated.View>
      )}
      </View>
      <AiComprehensiveRecordDrawer
        activeThreadId={activeThreadId}
        recentThreads={recentThreads}
        visible={recordDrawerVisible}
        onClose={() => setRecordDrawerVisible(false)}
        onNewChat={() => {
          setRecordDrawerVisible(false);
          handleNewChatPress();
        }}
        onOpenRoleLibrary={() => {
          setRecordDrawerVisible(false);
          onOpenRoleLibrary();
        }}
        onOpenHistory={() => {
          setRecordDrawerVisible(false);
          onOpenHistory();
        }}
        onOpenGlobalMaterials={() => {
          setRecordDrawerVisible(false);
          onOpenGlobalMaterials();
        }}
        onOpenThread={(thread) => {
          setRecordDrawerVisible(false);
          onOpenThread(thread);
        }}
        onRenameThread={(thread, title) => renameRecentThread(thread, title)}
        onDeleteThread={(thread) => deleteRecentThread(thread)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  drawerHost: {
    flex: 1,
    gap: 0,
    paddingHorizontal: 0,
  },
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
  starterWrap: {
    alignItems: 'center',
    flex: 1,
    gap: rhythm.inlineGap,
    justifyContent: 'flex-end',
    paddingBottom: spacing[8],
    paddingHorizontal: spacing[2],
  },
  starterGreeting: {
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontSize: 28,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 36,
    opacity: 0.78,
    textAlign: 'center',
  },
  starterSuggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.microGap,
    justifyContent: 'center',
  },
  starterChip: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  starterChipText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
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
