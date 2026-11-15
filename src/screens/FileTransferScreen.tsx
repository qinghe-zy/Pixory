import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { validateAiChatAttachments } from '../ai/aiAttachmentPolicy';
import {
  listFavoriteAssistantMessageKeys,
  toggleAssistantMessageFavorite,
  type AiMessageWithCitations,
} from '../ai/aiChatService';
import { mergeOrderedMessagePages } from '../ai/aiMessagePageMerge';
import { shouldShowScrollToLatest } from '../ai/aiScrollToLatestPolicy';
import { consumeThreadMessagePrefetch } from '../ai/aiThreadMessagePrefetch';
import { beijingDiaryDate } from '../ai/diary/diaryTypes';
import {
  deleteFileTransferMessages,
  FILE_TRANSFER_PAGE_SIZE,
  isManagedThreadAttachmentUri,
  loadFileTransferMessagePage,
  loadFileTransferUserProfile,
  sendFileTransferMessage,
  toFileTransferUserErrorMessage,
  type FileTransferUserProfile,
} from '../ai/fileTransferService';
import { FILE_TRANSFER_THREAD_ID } from '../ai/systemAssistant/capabilityProfile';
import { AppScreen } from '../components/AppScreen';
import { useToast } from '../components/AppToast';
import { SecureImage } from '../components/SecureImage';
import { AiChatComposer, type AiComposerAttachment } from '../components/ai/AiChatComposer';
import { AiChatErrorBanner } from '../components/ai/AiChatErrorBanner';
import { AiMessageBubble } from '../components/ai/AiMessageBubble';
import { AiScrollToLatestButton } from '../components/ai/AiScrollToLatestButton';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { ImDocumentMinimalViewer } from '../components/document/ImDocumentMinimalViewer';
import type { PixorySpace } from '../database';
import type {
  AiMessageAttachmentRecord,
  AiMessagePageCursor,
} from '../database/repositories/aiThreadRepository';
import {
  colors,
  layout,
  metrics,
  radius,
  rhythm,
  shadows,
  spacing,
  typography,
} from '../design/tokens';
import { exportDocumentToShare } from '../im/utils/documentExport';
import {
  extractSafeFileNameFromUri,
  normalizeImageMimeType,
  resolveAttachmentKind,
} from '../utils/attachmentKind';
import { rememberImageDimensions } from '../utils/chatImageSizing';
import { FILE_TRANSFER_AVATAR } from '../utils/fileTransferAvatar';

export interface FileTransferScreenProps {
  space: PixorySpace;
  isFocused?: boolean;
  searchTargetMessageId?: string;
  searchTargetKey?: string;
  onBack: () => void;
  onOpenSource?: (documentId: string, title: string) => void;
}

type VisibleTimelineItem =
  | {
      type: 'dateSeparator';
      id: string;
      dateKey: string;
      label: string;
    }
  | {
      type: 'message';
      id: string;
      message: AiMessageWithCitations;
      showUserAvatar: boolean;
    };

const FILE_TRANSFER_ASSISTANT_AVATAR = { avatarEnabled: false, avatarUri: null } as const;
const SYSTEM_BADGE_BACKGROUND = 'rgba(0, 0, 0, 0.08)'; // Matches AiChatScreen headerSystemBadge neutral tint

function buildFileTransferFavoriteKey(
  space: PixorySpace,
  message: Pick<AiMessageWithCitations, 'id' | 'versionIndex'>,
): string {
  return `${space}|${message.id}|[]|${message.versionIndex ?? 1}`;
}

function formatDateSeparator(dateKey: string): string {
  if (dateKey === beijingDiaryDate(new Date())) {
    return '今天';
  }
  if (dateKey === beijingDiaryDate(new Date(Date.now() - 24 * 60 * 60 * 1_000))) {
    return '昨天';
  }
  return dateKey;
}

function buildOptimisticTransferMessage(input: {
  id: string;
  content: string;
  createdAt: string;
  attachments: AiComposerAttachment[];
}): AiMessageWithCitations {
  return {
    attachments: input.attachments.map((attachment) => ({
      createdAt: input.createdAt,
      documentId: null,
      fileSize: attachment.size ?? null,
      id: attachment.id,
      kind: attachment.kind,
      localUri: attachment.uri,
      messageId: input.id,
      mimeType: attachment.mimeType ?? null,
      name: attachment.name,
      threadId: FILE_TRANSFER_THREAD_ID,
    })),
    branchRootMessageId: null,
    branchVersionIndex: null,
    citations: [],
    completedAt: input.createdAt,
    continuityImportSessionId: null,
    continuitySyntheticKind: null,
    content: input.content,
    createdAt: input.createdAt,
    errorMessage: null,
    id: input.id,
    messageVersions: [],
    modelId: null,
    modelSnapshotJson: '',
    promptSnapshotJson: '',
    providerId: null,
    reasoningText: null,
    role: 'user',
    status: 'completed',
    threadId: FILE_TRANSFER_THREAD_ID,
    updatedAt: input.createdAt,
    versionIndex: 1,
    versionTotal: 1,
  };
}

const FileTransferStarterCard = memo(function FileTransferStarterCard({
  onPickPhotos,
  onPickDocs,
  onPasteClipboard,
}: {
  onPickPhotos: () => void;
  onPickDocs: () => void;
  onPasteClipboard: () => void;
}) {
  return (
    <View style={styles.starterWrap}>
      <View style={styles.fileTransferStarterCard}>
        <ExpoImage
          accessibilityLabel="文件传输助手头像"
          contentFit="cover"
          source={FILE_TRANSFER_AVATAR}
          style={styles.starterAvatarImage}
        />
        <View style={styles.starterCardHeader}>
          <View style={styles.starterTitleRow}>
            <Text style={styles.starterCardTitle}>文件传输助手</Text>
            <View style={styles.starterSystemBadge}>
              <Text style={styles.starterSystemBadgeText}>系统</Text>
            </View>
          </View>
          <Text style={styles.starterCardSubtitle}>
            随时保存、收集和跨端流转文字、图片与各类文件
          </Text>
        </View>

        <View style={styles.starterFeatureList}>
          <View style={styles.starterFeatureRow}>
            <Ionicons color={aiLightColors.ink} name="flash-outline" size={16} />
            <Text style={styles.starterFeatureText}>
              即发即存：纯本地即时存储，无需等待回复，零模型消耗
            </Text>
          </View>
          <View style={styles.starterFeatureRow}>
            <Ionicons color={aiLightColors.ink} name="folder-outline" size={16} />
            <Text style={styles.starterFeatureText}>
              全格式支持：照片、视频、PDF、文档、安装包与压缩包
            </Text>
          </View>
          <View style={styles.starterFeatureRow}>
            <Ionicons color={aiLightColors.ink} name="shield-checkmark-outline" size={16} />
            <Text style={styles.starterFeatureText}>
              安全隔离：独立本地数据管理，随时批量清理
            </Text>
          </View>
        </View>

        <View style={styles.starterActionPills}>
          <Pressable
            accessibilityLabel="发送照片与视频"
            accessibilityRole="button"
            hitSlop={spacing[2]}
            onPress={onPickPhotos}
            style={({ pressed }) => [styles.starterActionBtn, pressed && styles.pressed]}
          >
            <Ionicons color={aiLightColors.ink} name="images-outline" size={16} />
            <Text style={styles.starterActionBtnText}>发送照片与视频</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="发送本地文件"
            accessibilityRole="button"
            hitSlop={spacing[2]}
            onPress={onPickDocs}
            style={({ pressed }) => [styles.starterActionBtn, pressed && styles.pressed]}
          >
            <Ionicons color={aiLightColors.ink} name="document-attach-outline" size={16} />
            <Text style={styles.starterActionBtnText}>发送本地文件</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="粘贴剪贴板内容"
            accessibilityRole="button"
            hitSlop={spacing[2]}
            onPress={onPasteClipboard}
            style={({ pressed }) => [styles.starterActionBtn, pressed && styles.pressed]}
          >
            <Ionicons color={aiLightColors.ink} name="clipboard-outline" size={16} />
            <Text style={styles.starterActionBtnText}>粘贴剪贴板内容</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

export function FileTransferScreen({
  space,
  isFocused = true,
  searchTargetMessageId,
  searchTargetKey,
  onBack,
  onOpenSource,
}: FileTransferScreenProps) {
  const insets = useSafeAreaInsets();
  const initialBottomInsetRef = useRef(insets.bottom);
  const statusBarHeight =
    Platform.OS === 'android'
      ? Math.max(StatusBar.currentHeight ?? 0, insets.top)
      : insets.top;
  const mainBottomPadding =
    initialBottomInsetRef.current + layout.pageBottomOffset - spacing[2];

  const { showToast } = useToast();

  const screenMountedRef = useRef(true);
  const lastSpaceRef = useRef(space);
  const activeSpaceRef = useRef(space);
  const messageListRef = useRef<FlatList<VisibleTimelineItem> | null>(null);
  const messagesRef = useRef<AiMessageWithCitations[]>([]);
  const pendingSendIdsRef = useRef<Set<string>>(new Set());
  const deletedMessageIdsRef = useRef<Set<string>>(new Set());
  const deletedSendTokensRef = useRef<Set<string>>(new Set());
  const composerTextRef = useRef('');
  const pendingAttachmentsRef = useRef<AiComposerAttachment[]>([]);
  const invertedItemsLengthRef = useRef(0);
  const olderCursorRef = useRef<AiMessagePageCursor | null>(null);
  const composerShellHeightRef = useRef(0);
  const loadRequestSeqRef = useRef(0);
  const isLoadingEarlierRef = useRef(false);
  const sendingRef = useRef(false);
  const batchActionPendingRef = useRef(false);
  const searchHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const appliedSearchKeyRef = useRef<string | null>(null);

  const [messages, setMessages] = useState<AiMessageWithCitations[]>([]);
  const [hasEarlierMessages, setHasEarlierMessages] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingHintVisible, setLoadingHintVisible] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRetryKind, setErrorRetryKind] = useState<'load_earlier' | 'send' | null>(null);

  const [composerText, setComposerText] = useState('');
  const [composerClearSignal, setComposerClearSignal] = useState(0);
  const [pendingAttachments, setPendingAttachments] = useState<AiComposerAttachment[]>([]);
  const [pendingSendVersion, setPendingSendVersion] = useState(0);
  const [composerShellHeight, setComposerShellHeight] = useState(0);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const showScrollToLatestRef = useRef(false);

  const [userProfile, setUserProfile] = useState<FileTransferUserProfile>({
    avatarUri: null,
    nickname: null,
  });

  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [isBatchBusy, setIsBatchBusy] = useState(false);
  const isMultiSelectModeRef = useRef(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());

  const [searchHighlightMessageId, setSearchHighlightMessageId] = useState<string | null>(null);

  const [favoriteStateByKey, setFavoriteStateByKey] = useState<Record<string, boolean>>({});

  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [docViewerState, setDocViewerState] = useState<{
    visible: boolean;
    title: string;
    uri?: string;
    content?: string;
    mode?: 'clean' | 'diff';
  } | null>(null);

  const commitMessages = useCallback(
    (
      updater:
        | AiMessageWithCitations[]
        | ((current: AiMessageWithCitations[]) => AiMessageWithCitations[]),
    ) => {
      const next = typeof updater === 'function' ? updater(messagesRef.current) : updater;
      messagesRef.current = next;
      setMessages(next);
    },
    [],
  );

  useEffect(() => {
    isMultiSelectModeRef.current = isMultiSelectMode;
  }, [isMultiSelectMode]);

  useEffect(() => {
    if (lastSpaceRef.current === space) {
      return;
    }
    lastSpaceRef.current = space;
    activeSpaceRef.current = space;
    olderCursorRef.current = null;
    appliedSearchKeyRef.current = null;
    pendingSendIdsRef.current.clear();
    deletedMessageIdsRef.current.clear();
    deletedSendTokensRef.current.clear();
    composerTextRef.current = '';
    pendingAttachmentsRef.current = [];
    sendingRef.current = false;
    batchActionPendingRef.current = false;
    isLoadingEarlierRef.current = false;
    composerShellHeightRef.current = 0;
    if (searchHighlightTimeoutRef.current) {
      clearTimeout(searchHighlightTimeoutRef.current);
      searchHighlightTimeoutRef.current = null;
    }
    if (scrollRetryTimerRef.current) {
      clearTimeout(scrollRetryTimerRef.current);
      scrollRetryTimerRef.current = null;
    }
    if (scrollFrameRef.current != null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    commitMessages([]);
    setComposerText('');
    setComposerClearSignal((current) => current + 1);
    setPendingAttachments([]);
    setPendingSendVersion((current) => current + 1);
    setComposerShellHeight(0);
    setLoadingEarlier(false);
    setPreviewImageUri(null);
    setDocViewerState(null);
    setUserProfile({ avatarUri: null, nickname: null });
    setErrorMessage(null);
    setErrorRetryKind(null);
    setLoadError(null);
    setSearchHighlightMessageId(null);
    showScrollToLatestRef.current = false;
    setShowScrollToLatest(false);
    setFavoriteStateByKey({});
    setIsMultiSelectMode(false);
    setIsBatchBusy(false);
    setSelectedMessageIds(new Set());
  }, [commitMessages, space]);

  useEffect(() => {
    if (space === 'personal' && !isFocused) {
      setPreviewImageUri(null);
      setDocViewerState(null);
    }
  }, [isFocused, space]);

  const handleComposerShellHeightChange = useCallback((nextHeight: number) => {
    const rounded = Math.ceil(nextHeight);
    if (rounded === composerShellHeightRef.current) {
      return;
    }
    composerShellHeightRef.current = rounded;
    setComposerShellHeight(rounded);
  }, []);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    if (!loadingInitial || messages.length > 0) {
      setLoadingHintVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      if (screenMountedRef.current) {
        setLoadingHintVisible(true);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [loadingInitial, messages.length]);

  useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
      if (searchHighlightTimeoutRef.current) {
        clearTimeout(searchHighlightTimeoutRef.current);
      }
      if (scrollRetryTimerRef.current) {
        clearTimeout(scrollRetryTimerRef.current);
      }
      if (scrollFrameRef.current != null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMultiSelectMode) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsMultiSelectMode(false);
      setSelectedMessageIds(new Set());
      return true;
    });
    return () => sub.remove();
  }, [isMultiSelectMode]);

  const applyLoadedPage = useCallback((page: {
    messages: AiMessageWithCitations[];
    hasEarlierMessages: boolean;
    olderCursor: AiMessagePageCursor | null;
  }, options?: { preserveLocalAdditions?: boolean }) => {
    const filteredPage = page.messages.filter(
      (message) => !deletedMessageIdsRef.current.has(message.id),
    );
    let nextMessages = filteredPage;
    if (options?.preserveLocalAdditions && messagesRef.current.length > 0) {
      const pageById = new Map(filteredPage.map((message) => [message.id, message]));
      const localToPreserve = messagesRef.current.filter(
        (message) =>
          !deletedMessageIdsRef.current.has(message.id) &&
          (!pageById.has(message.id) || !pendingSendIdsRef.current.has(message.id)),
      );
      nextMessages = mergeOrderedMessagePages(filteredPage, localToPreserve);
    }
    messagesRef.current = nextMessages;
    olderCursorRef.current = page.olderCursor;
    setMessages(nextMessages);
    setHasEarlierMessages(page.hasEarlierMessages);
    setLoadError(null);
  }, []);

  const loadInitialMessages = useCallback(async () => {
    const targetSpace = space;
    const requestSeq = ++loadRequestSeqRef.current;
    setLoadError(null);
    const hasSearchTarget = Boolean(searchTargetMessageId);
    if (!hasSearchTarget) {
      try {
        const prefetched = await consumeThreadMessagePrefetch(targetSpace, FILE_TRANSFER_THREAD_ID);
        if (
          prefetched &&
          screenMountedRef.current &&
          activeSpaceRef.current === targetSpace &&
          loadRequestSeqRef.current === requestSeq
        ) {
          applyLoadedPage({
            messages: prefetched.messages,
            hasEarlierMessages: prefetched.hasEarlierMessages,
            olderCursor: prefetched.olderCursor,
          }, { preserveLocalAdditions: true });
          setLoadingInitial(false);
          return;
        }
      } catch {
        // Prefetch misses fall back to direct repository query.
      }
    }

    try {
      const page = await loadFileTransferMessagePage(targetSpace, {
        anchorMessageId: searchTargetMessageId ?? undefined,
        limit: FILE_TRANSFER_PAGE_SIZE,
      });
      if (
        !screenMountedRef.current ||
        activeSpaceRef.current !== targetSpace ||
        loadRequestSeqRef.current !== requestSeq
      ) {
        return;
      }
      applyLoadedPage(page, { preserveLocalAdditions: !hasSearchTarget });
    } catch (error) {
      if (
        !screenMountedRef.current ||
        activeSpaceRef.current !== targetSpace ||
        loadRequestSeqRef.current !== requestSeq
      ) {
        return;
      }
      setLoadError(toFileTransferUserErrorMessage(error, '记录加载失败，请重试。'));
    } finally {
      if (
        screenMountedRef.current &&
        activeSpaceRef.current === targetSpace &&
        loadRequestSeqRef.current === requestSeq
      ) {
        setLoadingInitial(false);
      }
    }
  }, [applyLoadedPage, searchTargetMessageId, space]);

  useEffect(() => {
    setLoadingInitial(true);
    void loadInitialMessages();
  }, [loadInitialMessages]);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    void loadFileTransferUserProfile(space)
      .then((profile) => {
        if (!cancelled && screenMountedRef.current) {
          setUserProfile(profile);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isFocused, space]);

  const timelineState = useMemo(() => {
    const forwardItems: VisibleTimelineItem[] = [];
    let previousDateKey: string | null = null;

    for (const message of messages) {
      const dateKey = beijingDiaryDate(message.createdAt);
      if (dateKey !== previousDateKey) {
        forwardItems.push({
          type: 'dateSeparator',
          id: `date-separator-${dateKey}`,
          dateKey,
          label: formatDateSeparator(dateKey),
        });
        previousDateKey = dateKey;
      }
      forwardItems.push({
        type: 'message',
        id: message.id,
        message,
        showUserAvatar: message.role === 'user',
      });
    }

    const invertedItems = forwardItems.slice().reverse();
    const invertedIndexById = new Map<string, number>();
    invertedItems.forEach((item, index) => {
      if (item.type === 'message') {
        invertedIndexById.set(item.message.id, index);
      }
    });

    return {
      invertedItems,
      invertedIndexById,
    };
  }, [messages]);

  const { invertedItems, invertedIndexById } = timelineState;
  const latestMessageId = messages[messages.length - 1]?.id ?? null;

  useEffect(() => {
    invertedItemsLengthRef.current = invertedItems.length;
  }, [invertedItems.length]);

  const favoriteKeyByMessageId = useMemo(() => {
    void pendingSendVersion;
    const next = new Map<string, string>();
    for (const message of messages) {
      // Defer favorite lookups until optimistic inserts finish persisting so reads never race writes.
      if (pendingSendIdsRef.current.has(message.id)) {
        continue;
      }
      next.set(message.id, buildFileTransferFavoriteKey(space, message));
    }
    return next;
  }, [messages, pendingSendVersion, space]);

  const favoriteKeysSignature = useMemo(
    () => Array.from(favoriteKeyByMessageId.values()).join('\u001f'),
    [favoriteKeyByMessageId],
  );

  useEffect(() => {
    const keys = favoriteKeysSignature ? favoriteKeysSignature.split('\u001f') : [];
    if (keys.length === 0) {
      setFavoriteStateByKey((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    let cancelled = false;
    void listFavoriteAssistantMessageKeys({ favoriteKeys: keys, space })
      .then((favoritedKeys) => {
        if (cancelled || !screenMountedRef.current) return;
        const nextState: Record<string, boolean> = {};
        favoritedKeys.forEach((key) => {
          nextState[key] = true;
        });
        setFavoriteStateByKey(nextState);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [favoriteKeysSignature, space]);

  useEffect(() => {
    if (!searchTargetMessageId) {
      appliedSearchKeyRef.current = null;
      return;
    }
    const targetKey = `${searchTargetMessageId}:${searchTargetKey ?? 'default'}`;
    if (appliedSearchKeyRef.current === targetKey) {
      return;
    }
    const index = invertedIndexById.get(searchTargetMessageId);
    if (index == null) {
      return;
    }
    appliedSearchKeyRef.current = targetKey;
    setSearchHighlightMessageId(searchTargetMessageId);
    if (searchHighlightTimeoutRef.current) {
      clearTimeout(searchHighlightTimeoutRef.current);
    }
    searchHighlightTimeoutRef.current = setTimeout(() => {
      if (screenMountedRef.current) {
        setSearchHighlightMessageId(null);
      }
    }, 2400);
    requestAnimationFrame(() => {
      messageListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    });
  }, [invertedIndexById, searchTargetKey, searchTargetMessageId]);

  const scrollToLatest = useCallback((animated = false) => {
    showScrollToLatestRef.current = false;
    setShowScrollToLatest(false);
    messageListRef.current?.scrollToOffset({ animated, offset: 0 });
  }, []);

  const handleLoadEarlier = useCallback(() => {
    const targetSpace = space;
    const beforeCursor = olderCursorRef.current;
    if (!beforeCursor || isLoadingEarlierRef.current) {
      return;
    }
    isLoadingEarlierRef.current = true;
    setLoadingEarlier(true);
    void loadFileTransferMessagePage(targetSpace, {
      beforeCursor,
      limit: FILE_TRANSFER_PAGE_SIZE,
    })
      .then((page) => {
        if (
          !screenMountedRef.current ||
          activeSpaceRef.current !== targetSpace ||
          olderCursorRef.current !== beforeCursor
        ) {
          return;
        }
        const filteredOlder = page.messages.filter(
          (message) => !deletedMessageIdsRef.current.has(message.id),
        );
        const merged = mergeOrderedMessagePages(filteredOlder, messagesRef.current);
        messagesRef.current = merged;
        olderCursorRef.current = page.olderCursor;
        setHasEarlierMessages(page.hasEarlierMessages);
        setMessages(merged);
      })
      .catch((error) => {
        if (screenMountedRef.current && activeSpaceRef.current === targetSpace) {
          setErrorRetryKind('load_earlier');
          setErrorMessage(toFileTransferUserErrorMessage(error, '加载更早记录失败，请重试。'));
        }
      })
      .finally(() => {
        isLoadingEarlierRef.current = false;
        if (screenMountedRef.current) {
          setLoadingEarlier(false);
        }
      });
  }, [space]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const nextShow = shouldShowScrollToLatest(offsetY);
    showScrollToLatestRef.current = nextShow;
    setShowScrollToLatest((prev) => (prev === nextShow ? prev : nextShow));
  }, []);

  const handlePasteClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && text.trim()) {
        setComposerText((current) => (current ? `${current}\n${text.trim()}` : text.trim()));
        showToast('已粘贴剪贴板内容');
      } else {
        showToast('剪贴板中没有文字内容');
      }
    } catch (err) {
      console.warn('Failed to read clipboard:', err);
      showToast('无法读取剪贴板内容');
    }
  }, [showToast]);

  const appendPickedAttachments = useCallback((picked: AiComposerAttachment[]) => {
    const next = [...pendingAttachmentsRef.current, ...picked];
    const validation = validateAiChatAttachments(next);
    if (!validation.ok) {
      setErrorRetryKind(null);
      setErrorMessage(validation.message);
      return;
    }
    pendingAttachmentsRef.current = next;
    setErrorRetryKind(null);
    setErrorMessage(null);
    setPendingAttachments(next);
  }, []);

  const handleComposerTextChange = useCallback((nextText: string) => {
    composerTextRef.current = nextText;
    setComposerText(nextText);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    const next = pendingAttachmentsRef.current.filter((attachment) => attachment.id !== id);
    pendingAttachmentsRef.current = next;
    setPendingAttachments(next);
  }, []);

  const pickImages = useCallback(async () => {
    const targetSpace = space;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('需要相册权限才能上传图片。');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
        quality: 1,
      });
      if (
        result.canceled ||
        !screenMountedRef.current ||
        activeSpaceRef.current !== targetSpace
      ) {
        return;
      }
      const picked = result.assets.map<AiComposerAttachment>((asset, index) => {
        rememberImageDimensions(asset.uri, asset.width, asset.height);
        const resolvedName =
          asset.fileName?.trim() || extractSafeFileNameFromUri(asset.uri, `image-${index + 1}`);
        return {
          id: `image-${Date.now()}-${index}-${asset.uri}`,
          kind: 'image',
          mimeType: normalizeImageMimeType(asset.mimeType, resolvedName, asset.uri),
          name: resolvedName,
          size: asset.fileSize ?? null,
          uri: asset.uri,
        };
      });
      appendPickedAttachments(picked);
    } catch (error) {
      if (screenMountedRef.current && activeSpaceRef.current === targetSpace) {
        setErrorRetryKind(null);
        setErrorMessage(toFileTransferUserErrorMessage(error, '选择图片失败'));
      }
    }
  }, [appendPickedAttachments, space]);

  const pickDocuments = useCallback(async () => {
    const targetSpace = space;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: '*/*',
      });
      if (
        result.canceled ||
        !screenMountedRef.current ||
        activeSpaceRef.current !== targetSpace
      ) {
        return;
      }
      const picked = result.assets.map<AiComposerAttachment>((asset, index) => {
        const resolvedName =
          asset.name?.trim() || extractSafeFileNameFromUri(asset.uri, `document-${index + 1}`);
        const kind = resolveAttachmentKind(asset.mimeType, resolvedName, asset.uri, {
          includeSvg: true,
        });
        if (kind === 'image') {
          Image.getSize(
            asset.uri,
            (width, height) => {
              rememberImageDimensions(asset.uri, width, height);
            },
            () => undefined,
          );
        }
        return {
          id: `${kind}-${Date.now()}-${index}-${asset.uri}`,
          kind,
          mimeType:
            kind === 'image'
              ? normalizeImageMimeType(asset.mimeType, resolvedName, asset.uri)
              : (asset.mimeType ?? null),
          name: resolvedName,
          size: asset.size ?? null,
          uri: asset.uri,
        };
      });
      appendPickedAttachments(picked);
    } catch (error) {
      if (screenMountedRef.current && activeSpaceRef.current === targetSpace) {
        setErrorRetryKind(null);
        setErrorMessage(toFileTransferUserErrorMessage(error, '选择文档失败'));
      }
    }
  }, [appendPickedAttachments, space]);

  const handleSend = useCallback(async () => {
    if (sendingRef.current) {
      return;
    }
    const targetSpace = space;
    const typedText = composerTextRef.current.trim();
    const attachments = pendingAttachmentsRef.current;
    if (!typedText && attachments.length === 0) {
      return;
    }

    sendingRef.current = true;
    const messageId = `ftmsg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sendToken = `${targetSpace}:${messageId}`;
    const createdAt = new Date().toISOString();
    const optimisticMessage = buildOptimisticTransferMessage({
      id: messageId,
      content: typedText,
      createdAt,
      attachments,
    });

    composerTextRef.current = '';
    pendingAttachmentsRef.current = [];
    setComposerText('');
    setComposerClearSignal((current) => current + 1);
    setPendingAttachments([]);
    setErrorRetryKind(null);
    setErrorMessage(null);
    pendingSendIdsRef.current.add(messageId);
    setPendingSendVersion((current) => current + 1);
    commitMessages((current) => [...current, optimisticMessage]);

    if (showScrollToLatestRef.current) {
      if (scrollFrameRef.current != null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        if (screenMountedRef.current && activeSpaceRef.current === targetSpace) {
          scrollToLatest(false);
        }
      });
    }

    try {
      const persistedMessage = await sendFileTransferMessage(targetSpace, {
        attachments,
        content: typedText,
        createdAt,
        messageId,
      });
      pendingSendIdsRef.current.delete(messageId);
      setPendingSendVersion((current) => current + 1);
      if (
        deletedSendTokensRef.current.has(sendToken) ||
        deletedMessageIdsRef.current.has(messageId)
      ) {
        deletedSendTokensRef.current.delete(sendToken);
        void deleteFileTransferMessages(targetSpace, [messageId]).catch(() => undefined);
        return;
      }
      if (!screenMountedRef.current || activeSpaceRef.current !== targetSpace) {
        return;
      }
      commitMessages((current) => {
        const exists = current.some((item) => item.id === messageId);
        return exists
          ? current.map((item) => (item.id === messageId ? persistedMessage : item))
          : [...current, persistedMessage];
      });
    } catch (error) {
      pendingSendIdsRef.current.delete(messageId);
      setPendingSendVersion((current) => current + 1);
      deletedSendTokensRef.current.delete(sendToken);
      if (!screenMountedRef.current || activeSpaceRef.current !== targetSpace) {
        return;
      }
      commitMessages((current) => current.filter((item) => item.id !== messageId));
      if (typedText) {
        setComposerText((current) => {
          const restored = current.trim() ? `${typedText}\n${current}` : typedText;
          composerTextRef.current = restored;
          return restored;
        });
      }
      if (attachments.length > 0) {
        const nextAttachments = [...attachments, ...pendingAttachmentsRef.current];
        pendingAttachmentsRef.current = nextAttachments;
        setPendingAttachments(nextAttachments);
      }
      setErrorRetryKind('send');
      setErrorMessage(toFileTransferUserErrorMessage(error, '发送失败，请重试'));
    } finally {
      sendingRef.current = false;
    }
  }, [commitMessages, scrollToLatest, space]);

  const toggleMultiSelectMessage = useCallback((messageId: string) => {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const handleDeleteMessages = useCallback(
    async (idsToDelete: string[]): Promise<boolean> => {
      if (idsToDelete.length === 0) return false;
      const targetSpace = space;
      const deleteSet = new Set(idsToDelete);
      const previousById = new Map(
        messagesRef.current
          .filter((item) => deleteSet.has(item.id))
          .map((item) => [item.id, item] as const),
      );
      idsToDelete.forEach((id) => {
        deletedMessageIdsRef.current.add(id);
        if (pendingSendIdsRef.current.has(id)) {
          deletedSendTokensRef.current.add(`${targetSpace}:${id}`);
        }
      });
      try {
        // Await DB deletion first so the favoriteKeysSignature effect does not trigger
        // a concurrent listFavoriteAssistantMessageKeys read while the transaction is active.
        await deleteFileTransferMessages(targetSpace, idsToDelete);
        if (!screenMountedRef.current || activeSpaceRef.current !== targetSpace) {
          return true;
        }
        commitMessages((current) => current.filter((m) => !deleteSet.has(m.id)));
        return true;
      } catch (error) {
        idsToDelete.forEach((id) => {
          deletedSendTokensRef.current.delete(`${targetSpace}:${id}`);
          if (activeSpaceRef.current === targetSpace) {
            deletedMessageIdsRef.current.delete(id);
          }
        });
        if (!screenMountedRef.current || activeSpaceRef.current !== targetSpace) {
          return false;
        }
        const restored = Array.from(previousById.values());
        if (restored.length > 0) {
          commitMessages((current) => mergeOrderedMessagePages(current, restored));
        }
        setErrorRetryKind(null);
        setErrorMessage(toFileTransferUserErrorMessage(error, '删除消息失败'));
        return false;
      }
    },
    [commitMessages, space],
  );

  const handleBatchDeleteSelected = useCallback(() => {
    if (selectedMessageIds.size === 0 || batchActionPendingRef.current) return;
    const targetSpace = space;
    const count = selectedMessageIds.size;
    const ids = Array.from(selectedMessageIds);
    Alert.alert('批量删除消息', `确定要删除选中的 ${count} 条消息吗？相关附件也将被移除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          if (
            batchActionPendingRef.current ||
            !screenMountedRef.current ||
            activeSpaceRef.current !== targetSpace
          ) {
            return;
          }
          batchActionPendingRef.current = true;
          setIsBatchBusy(true);
          void handleDeleteMessages(ids)
            .then((deleted) => {
              if (deleted && screenMountedRef.current && activeSpaceRef.current === targetSpace) {
                setIsMultiSelectMode(false);
                setSelectedMessageIds(new Set());
                showToast(`已删除 ${count} 条消息`);
              }
            })
            .finally(() => {
              batchActionPendingRef.current = false;
              if (screenMountedRef.current) {
                setIsBatchBusy(false);
              }
            });
        },
      },
    ]);
  }, [handleDeleteMessages, selectedMessageIds, showToast, space]);

  const handleBatchFavoriteSelected = useCallback(() => {
    if (selectedMessageIds.size === 0 || batchActionPendingRef.current) return;
    const targetSpace = space;
    batchActionPendingRef.current = true;
    setIsBatchBusy(true);
    const selectedSet = new Set(selectedMessageIds);
    void (async () => {
      try {
        const targets = messagesRef.current.filter((m) => selectedSet.has(m.id));
        const persistedTargets = targets.filter((m) => !pendingSendIdsRef.current.has(m.id));
        if (persistedTargets.length === 0) {
          if (screenMountedRef.current && activeSpaceRef.current === targetSpace) {
            showToast('消息仍在保存中，请稍后再收藏');
          }
          return;
        }
        let succeededCount = 0;
        for (const msg of persistedTargets) {
          if (!screenMountedRef.current || activeSpaceRef.current !== targetSpace) {
            break;
          }
          const key =
            favoriteKeyByMessageId.get(msg.id) ?? buildFileTransferFavoriteKey(targetSpace, msg);
          try {
            await toggleAssistantMessageFavorite({
              branchScopes: [],
              favorited: true,
              messageId: msg.id,
              messageVersionIndex: msg.versionIndex ?? 1,
              space: targetSpace,
              threadId: FILE_TRANSFER_THREAD_ID,
            });
            succeededCount += 1;
            if (screenMountedRef.current && activeSpaceRef.current === targetSpace) {
              setFavoriteStateByKey((prev) => ({ ...prev, [key]: true }));
            }
          } catch {
            // Count partial successes below and surface user feedback.
          }
        }
        if (!screenMountedRef.current || activeSpaceRef.current !== targetSpace) return;
        if (succeededCount === 0) {
          setErrorRetryKind(null);
          setErrorMessage('批量收藏失败，请稍后重试');
        } else {
          setIsMultiSelectMode(false);
          setSelectedMessageIds(new Set());
          if (succeededCount < persistedTargets.length || persistedTargets.length < targets.length) {
            showToast(`已收藏 ${succeededCount}/${targets.length} 条消息`);
          } else {
            showToast(`已收藏 ${succeededCount} 条消息`);
          }
        }
      } finally {
        batchActionPendingRef.current = false;
        if (screenMountedRef.current) {
          setIsBatchBusy(false);
        }
      }
    })();
  }, [favoriteKeyByMessageId, selectedMessageIds, showToast, space]);

  const handleMessageLongPress = useCallback(
    (message: AiMessageWithCitations) => {
      Keyboard.dismiss();
      if (isMultiSelectModeRef.current) {
        toggleMultiSelectMessage(message.id);
        return;
      }
      setIsMultiSelectMode(true);
      setSelectedMessageIds(new Set([message.id]));
    },
    [toggleMultiSelectMessage],
  );

  const handleNoop = useCallback(() => undefined, []);

  const assertManagedUriOrNotify = useCallback(
    (targetSpace: PixorySpace, uri: string): boolean => {
      if (!isManagedThreadAttachmentUri(targetSpace, uri)) {
        setErrorRetryKind(null);
        setErrorMessage('无法访问不受信任或跨空间的文件路径');
        return false;
      }
      return true;
    },
    [],
  );

  const handleCancelMultiSelect = useCallback(() => {
    setIsMultiSelectMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedMessageIds((current) => {
      if (current.size === messagesRef.current.length) {
        return new Set();
      }
      return new Set(messagesRef.current.map((m) => m.id));
    });
  }, []);

  const handleDismissError = useCallback(() => {
    setErrorMessage(null);
    setErrorRetryKind(null);
  }, []);

  const handleRetryError = useCallback(() => {
    if (loadError) {
      void loadInitialMessages();
      return;
    }
    if (errorRetryKind === 'send') {
      void handleSend();
      return;
    }
    if (errorRetryKind === 'load_earlier') {
      handleLoadEarlier();
    }
  }, [errorRetryKind, handleLoadEarlier, handleSend, loadError, loadInitialMessages]);

  const handleAddImageAttachment = useCallback(() => {
    void pickImages();
  }, [pickImages]);

  const handleAddDocumentAttachment = useCallback(() => {
    void pickDocuments();
  }, [pickDocuments]);

  const handlePasteClipboardAction = useCallback(() => {
    void handlePasteClipboard();
  }, [handlePasteClipboard]);

  const handleComposerSend = useCallback(() => {
    void handleSend();
  }, [handleSend]);

  const handleScrollToLatestAnimated = useCallback(() => {
    scrollToLatest(true);
  }, [scrollToLatest]);

  const handleClosePreview = useCallback(() => {
    setPreviewImageUri(null);
  }, []);

  const handleCloseDocViewer = useCallback(() => {
    setDocViewerState(null);
  }, []);

  const handleExportDocViewer = useCallback(() => {
    if (!docViewerState) {
      return;
    }
    if (docViewerState.uri && !assertManagedUriOrNotify(space, docViewerState.uri)) {
      return;
    }
    void exportDocumentToShare({
      content: docViewerState.content,
      title: docViewerState.title,
      uri: docViewerState.uri,
    });
  }, [assertManagedUriOrNotify, docViewerState, space]);

  const bubbleUserProfile = useMemo(
    () => ({
      avatarEnabled: true,
      avatarUri: userProfile.avatarUri,
      nickname: userProfile.nickname,
    }),
    [userProfile.avatarUri, userProfile.nickname],
  );

  const handleAttachmentPress = useCallback(
    (attachment: AiMessageAttachmentRecord) => {
      if (attachment.localUri && !assertManagedUriOrNotify(activeSpaceRef.current, attachment.localUri)) {
        return;
      }
      if (attachment.kind === 'document') {
        if (attachment.documentId && onOpenSource) {
          onOpenSource(attachment.documentId, attachment.name);
        } else if (attachment.localUri) {
          setDocViewerState({
            visible: true,
            title: attachment.name,
            uri: attachment.localUri,
            content: '',
            mode: 'clean',
          });
        }
      } else if (attachment.kind === 'image' && attachment.localUri) {
        setPreviewImageUri(attachment.localUri);
      }
    },
    [assertManagedUriOrNotify, onOpenSource],
  );

  const handleOpenDocument = useCallback(
    (target: { uri?: string; title?: string; content?: string | Uint8Array; mode?: 'clean' | 'diff' }) => {
      if (target.uri && !assertManagedUriOrNotify(activeSpaceRef.current, target.uri)) {
        return;
      }
      if (
        target.uri &&
        target.content === undefined &&
        resolveAttachmentKind(undefined, target.title ?? '', target.uri, { includeSvg: true }) === 'image'
      ) {
        setPreviewImageUri(target.uri);
        return;
      }
      setDocViewerState({
        visible: true,
        title: target.title ?? '文档',
        uri: target.uri,
        content: typeof target.content === 'string' ? target.content : '',
        mode: target.mode,
      });
    },
    [assertManagedUriOrNotify],
  );

  const renderMessageItem = useCallback(
    ({ item, index }: { item: VisibleTimelineItem; index: number }) => {
      if (item.type === 'dateSeparator') {
        return <Text style={styles.dateSeparator}>{item.label}</Text>;
      }

      const { message } = item;
      const favKey = favoriteKeyByMessageId.get(message.id);
      const favorited = favKey ? Boolean(favoriteStateByKey[favKey]) : false;

      return (
        <View
          style={[
            styles.messageItemRow,
            searchHighlightMessageId === message.id && styles.searchHighlightWrap,
          ]}
        >
          {isMultiSelectMode ? (
            <Pressable
              accessibilityLabel={selectedMessageIds.has(message.id) ? '取消选择' : '选择此条消息'}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selectedMessageIds.has(message.id) }}
              hitSlop={spacing[2]}
              onPress={() => toggleMultiSelectMessage(message.id)}
              style={styles.multiSelectCheckCircle}
            >
              <Ionicons
                color={
                  selectedMessageIds.has(message.id)
                    ? aiLightColors.primaryActive
                    : colors.border.default
                }
                name={selectedMessageIds.has(message.id) ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
              />
            </Pressable>
          ) : null}
          <Pressable
            disabled={!isMultiSelectMode}
            onLongPress={
              isMultiSelectMode ? () => toggleMultiSelectMessage(message.id) : undefined
            }
            onPress={isMultiSelectMode ? () => toggleMultiSelectMessage(message.id) : undefined}
            style={styles.messageItemBubbleSlot}
          >
            <View pointerEvents={isMultiSelectMode ? 'none' : 'auto'}>
              <AiMessageBubble
                assistantAvatar={FILE_TRANSFER_ASSISTANT_AVATAR}
                favorited={favorited}
                favoriteDisabledByGeneration={false}
                generating={false}
                isDeepHistory={index >= 8}
                isLatestMessage={message.id === latestMessageId}
                message={message}
                onAttachmentPress={handleAttachmentPress}
                onCancelEdit={handleNoop}
                onContinue={handleNoop}
                onContinueReply={handleNoop}
                onCopy={handleNoop}
                onEditUser={handleNoop}
                onLongPress={handleMessageLongPress}
                onOpenCitation={handleNoop}
                onOpenDocument={handleOpenDocument}
                onRegenerate={handleNoop}
                onReplyToAssistant={handleNoop}
                onSelectVersion={handleNoop}
                onSubmitEdit={handleNoop}
                showActionButtons={false}
                showAvatar={false}
                showUserAvatar={item.showUserAvatar}
                space={space}
                userProfile={bubbleUserProfile}
              />
            </View>
          </Pressable>
        </View>
      );
    },
    [
      bubbleUserProfile,
      favoriteKeyByMessageId,
      favoriteStateByKey,
      handleAttachmentPress,
      handleMessageLongPress,
      handleNoop,
      handleOpenDocument,
      isMultiSelectMode,
      latestMessageId,
      searchHighlightMessageId,
      selectedMessageIds,
      space,
      toggleMultiSelectMessage,
    ],
  );

  const listExtraData = useMemo(
    () => ({
      bubbleUserProfile,
      favoriteStateByKey,
      isMultiSelectMode,
      latestMessageId,
      searchHighlightMessageId,
      selectedMessageIds,
    }),
    [
      bubbleUserProfile,
      favoriteStateByKey,
      isMultiSelectMode,
      latestMessageId,
      searchHighlightMessageId,
      selectedMessageIds,
    ],
  );

  const effectiveComposerHeight = composerShellHeight;

  return (
    <AppScreen
      backgroundColor={aiLightColors.canvas}
      contentStyle={[styles.host, { paddingBottom: mainBottomPadding }]}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardAvoidingHost}>
        <View style={[styles.screenContent, { paddingTop: statusBarHeight + spacing[1.5] }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerSideLeft}>
              {isMultiSelectMode ? (
                <Pressable
                  accessibilityLabel="取消多选"
                  accessibilityRole="button"
                  hitSlop={spacing[1]}
                  onPress={handleCancelMultiSelect}
                  style={({ pressed }) => [styles.headerTextBtn, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={styles.headerCancelText}>取消</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel="返回"
                  accessibilityRole="button"
                  hitSlop={spacing[1]}
                  onPress={onBack}
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                >
                  <Ionicons color={aiLightColors.ink} name="chevron-back" size={metrics.iconSizeMd + 2} />
                </Pressable>
              )}
            </View>

            <View style={styles.titleBlock}>
              <View style={styles.titleLine}>
                <Text numberOfLines={1} style={styles.title}>
                  {isMultiSelectMode
                    ? selectedMessageIds.size > 0
                      ? `已选择 ${selectedMessageIds.size} 项`
                      : '选择消息'
                    : '文件传输助手'}
                </Text>
                {!isMultiSelectMode ? (
                  <View style={styles.headerSystemBadge}>
                    <Text style={styles.headerSystemBadgeText}>系统</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.headerSideRight}>
              {isMultiSelectMode ? (
                <Pressable
                  accessibilityLabel={
                    selectedMessageIds.size === messages.length && messages.length > 0
                      ? '取消全选'
                      : '全选'
                  }
                  accessibilityRole="button"
                  hitSlop={spacing[1]}
                  onPress={handleToggleSelectAll}
                  style={({ pressed }) => [styles.headerTextBtn, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={styles.headerSelectAllText}>
                    {selectedMessageIds.size === messages.length && messages.length > 0
                      ? '取消全选'
                      : '全选'}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.iconBtn} />
              )}
            </View>
          </View>

          {/* Error Banner */}
          {errorMessage || loadError ? (
            <AiChatErrorBanner
              message={errorMessage ?? loadError ?? ''}
              onDismiss={loadError ? undefined : handleDismissError}
              onRetry={loadError || errorRetryKind ? handleRetryError : undefined}
            />
          ) : null}

          {/* Message List */}
          <View style={styles.messageArea}>
            <FlatList
              ref={messageListRef}
              data={invertedItems}
              extraData={listExtraData}
              inverted
              initialNumToRender={12}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => item.id}
              maxToRenderPerBatch={10}
              removeClippedSubviews={false}
              windowSize={11}
              ListFooterComponent={
                hasEarlierMessages ? (
                  <Pressable
                    accessibilityLabel="加载更早消息"
                    accessibilityRole="button"
                    accessibilityState={{ busy: loadingEarlier, disabled: loadingEarlier }}
                    disabled={loadingEarlier}
                    hitSlop={spacing[2]}
                    onPress={handleLoadEarlier}
                    style={({ pressed }) => [
                      styles.loadEarlierButton,
                      loadingEarlier && styles.loadEarlierButtonDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {loadingEarlier ? (
                      <ActivityIndicator color={aiLightColors.muted} size="small" />
                    ) : (
                      <Ionicons color={aiLightColors.muted} name="chevron-up" size={metrics.iconSizeSm} />
                    )}
                    <Text style={styles.loadEarlierText}>
                      {loadingEarlier ? '正在加载...' : '加载更早消息'}
                    </Text>
                  </Pressable>
                ) : null
              }
              onScroll={handleScroll}
              onScrollToIndexFailed={(info) => {
                messageListRef.current?.scrollToOffset({
                  offset: Math.max(0, info.averageItemLength * info.index),
                  animated: false,
                });
                if (scrollRetryTimerRef.current) {
                  clearTimeout(scrollRetryTimerRef.current);
                }
                scrollRetryTimerRef.current = setTimeout(() => {
                  scrollRetryTimerRef.current = null;
                  if (screenMountedRef.current && info.index < invertedItemsLengthRef.current) {
                    messageListRef.current?.scrollToIndex({
                      index: info.index,
                      animated: true,
                      viewPosition: 0.5,
                    });
                  }
                }, 80);
              }}
              renderItem={renderMessageItem}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              style={styles.messageScroller}
              contentContainerStyle={styles.messageScrollContent}
            />

            {invertedItems.length === 0 && loadingHintVisible && !errorMessage && !loadError ? (
              <View pointerEvents="none" style={styles.loadingStateOverlay}>
                <ActivityIndicator color={aiLightColors.muted} size="small" />
                <Text style={styles.loadingStateText}>正在加载记录...</Text>
              </View>
            ) : null}

            {invertedItems.length === 0 && !loadingInitial && !loadError ? (
              <View style={styles.starterOverlay}>
                <FileTransferStarterCard
                  onPasteClipboard={handlePasteClipboardAction}
                  onPickDocs={handleAddDocumentAttachment}
                  onPickPhotos={handleAddImageAttachment}
                />
              </View>
            ) : null}
          </View>

          {/* Bottom Bar: keep AiChatComposer mounted across multi-select toggle so draft text and height never reset */}
          <View style={styles.bottomFooterContainer}>
            <View
              importantForAccessibility={isMultiSelectMode ? 'no-hide-descendants' : 'auto'}
              pointerEvents={isMultiSelectMode ? 'none' : 'auto'}
              style={[styles.composerPanel, isMultiSelectMode && styles.composerPanelHidden]}
            >
              <AiChatComposer
                attachments={pendingAttachments}
                clearSignal={composerClearSignal}
                generating={false}
                hideModelIcon
                hideReplyAssist
                onAddDocumentAttachment={handleAddDocumentAttachment}
                onAddImageAttachment={handleAddImageAttachment}
                onChangeText={handleComposerTextChange}
                onComposerShellHeightChange={handleComposerShellHeightChange}
                onRemoveAttachment={handleRemoveAttachment}
                onReplyAssist={handleNoop}
                onSend={handleComposerSend}
                onStop={handleNoop}
                onVoiceInput={handleNoop}
                placeholder="发送文字、链接或备忘..."
                replyAssistDisabled
                space={space}
                value={composerText}
                voiceAvailable={false}
              />
              <View pointerEvents="none" style={styles.composerBottomMask} />
            </View>

            {isMultiSelectMode ? (
              <View style={[styles.multiSelectActionBar, styles.multiSelectActionBarOverlay]}>
                <Pressable
                  accessibilityLabel="删除所选消息"
                  accessibilityRole="button"
                  accessibilityState={{ busy: isBatchBusy, disabled: selectedMessageIds.size === 0 || isBatchBusy }}
                  disabled={selectedMessageIds.size === 0 || isBatchBusy}
                  onPress={handleBatchDeleteSelected}
                  style={({ pressed }) => [
                    styles.multiSelectActionBtn,
                    (selectedMessageIds.size === 0 || isBatchBusy) && styles.multiSelectActionBtnDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    color={
                      selectedMessageIds.size === 0 || isBatchBusy
                        ? colors.text.placeholder
                        : colors.semantic.danger
                    }
                    name="trash-outline"
                    size={metrics.iconSizeMd}
                  />
                  <Text
                    style={[
                      styles.multiSelectActionBtnText,
                      {
                        color:
                          selectedMessageIds.size === 0 || isBatchBusy
                            ? colors.text.placeholder
                            : colors.semantic.danger,
                      },
                    ]}
                  >
                    {isBatchBusy ? '处理中...' : `删除 (${selectedMessageIds.size})`}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityLabel="收藏所选消息"
                  accessibilityRole="button"
                  accessibilityState={{ busy: isBatchBusy, disabled: selectedMessageIds.size === 0 || isBatchBusy }}
                  disabled={selectedMessageIds.size === 0 || isBatchBusy}
                  onPress={handleBatchFavoriteSelected}
                  style={({ pressed }) => [
                    styles.multiSelectActionBtn,
                    (selectedMessageIds.size === 0 || isBatchBusy) && styles.multiSelectActionBtnDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    color={
                      selectedMessageIds.size === 0 || isBatchBusy
                        ? colors.text.placeholder
                        : aiLightColors.primaryActive
                    }
                    name="bookmark-outline"
                    size={metrics.iconSizeMd}
                  />
                  <Text
                    style={[
                      styles.multiSelectActionBtnText,
                      {
                        color:
                          selectedMessageIds.size === 0 || isBatchBusy
                            ? colors.text.placeholder
                            : aiLightColors.primaryActive,
                      },
                    ]}
                  >
                    {`收藏 (${selectedMessageIds.size})`}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <AiScrollToLatestButton
            bottomOffset={effectiveComposerHeight + spacing[3] + spacing[1.5]}
            generating={false}
            onPress={handleScrollToLatestAnimated}
            visible={showScrollToLatest && !isMultiSelectMode}
          />
        </View>
      </KeyboardAvoidingView>

      <Modal
        accessibilityViewIsModal
        animationType="fade"
        onRequestClose={handleClosePreview}
        statusBarTranslucent
        transparent
        visible={Boolean(previewImageUri)}
      >
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            accessibilityLabel="关闭图片预览背景"
            accessibilityRole="button"
            onPress={handleClosePreview}
            style={styles.previewModalBackdrop}
          >
            {previewImageUri ? (
              <SecureImage
                accessibilityLabel="预览中的图片"
                contentFit="contain"
                space={space}
                style={styles.previewModalImage}
                uri={previewImageUri}
              />
            ) : null}
            <Pressable
              accessibilityLabel="关闭图片预览"
              accessibilityRole="button"
              onPress={handleClosePreview}
              style={[styles.previewModalCloseBtn, { top: Math.max(statusBarHeight, spacing[5]) + spacing[5] }]}
            >
              <Ionicons color={colors.text.inverse} name="close" size={spacing[6]} />
            </Pressable>
          </Pressable>
        </View>
      </Modal>

      <ImDocumentMinimalViewer
        content={docViewerState?.content}
        documentTitle={docViewerState?.title}
        documentUri={docViewerState?.uri}
        initialMode={docViewerState?.mode}
        onClose={handleCloseDocViewer}
        onExport={handleExportDocViewer}
        space={space}
        visible={Boolean(docViewerState?.visible)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    gap: 0,
    paddingHorizontal: 0,
  },
  keyboardAvoidingHost: {
    flex: 1,
  },
  screenContent: {
    flex: 1,
    gap: 0,
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: spacing[2],
    minHeight: metrics.minTouchSize,
  },
  headerSideLeft: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minWidth: spacing[12] + spacing[4],
  },
  headerSideRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: spacing[12] + spacing[4],
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: metrics.minTouchSize,
    minWidth: metrics.minTouchSize,
  },
  headerTextBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: metrics.minTouchSize,
    minWidth: metrics.minTouchSize,
    paddingHorizontal: spacing[1],
  },
  headerCancelText: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    fontWeight: typography.weight.medium,
  },
  headerSelectAllText: {
    ...typography.textStyles.body,
    color: aiLightColors.primaryActive,
    fontWeight: typography.weight.medium,
  },
  pressed: {
    opacity: 0.72,
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
    color: aiLightColors.ink,
    fontSize: typography.textStyles.body.fontSize,
    fontWeight: typography.textStyles.body.fontWeight,
    lineHeight: typography.textStyles.body.lineHeight,
    maxWidth: '90%',
  },
  headerSystemBadge: {
    backgroundColor: SYSTEM_BADGE_BACKGROUND,
    borderRadius: radius.xs,
    marginLeft: spacing[1.5],
    paddingHorizontal: spacing[1],
    paddingVertical: 1, // Preserves compact optical badge height inline with nav title
  },
  headerSystemBadgeText: {
    color: aiLightColors.muted,
    fontSize: typography.textStyles.brandSubtitle.fontSize,
    fontWeight: typography.weight.semibold,
  },
  messageArea: {
    flex: 1,
  },
  messageScroller: {
    flex: 1,
  },
  messageScrollContent: {
    flexGrow: 1,
    // Row spacing lives on item styles instead of container gap to prevent Android Fabric Yoga clone crashes on inverted FlatList updates.
    paddingBottom: spacing[3],
    paddingTop: spacing[2],
  },
  starterOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  starterWrap: {
    alignItems: 'center',
    flex: 1,
    gap: rhythm.inlineGap,
    justifyContent: 'flex-end',
    paddingBottom: spacing[8],
    paddingHorizontal: spacing[2],
  },
  fileTransferStarterCard: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    maxWidth: 360, // Matches existing FileTransfer starter card width constraint
    padding: spacing[5],
    width: '100%',
    ...shadows.sm,
  },
  starterAvatarImage: {
    borderRadius: radius.lg,
    height: 56, // Starter card avatar size beyond 48dp spacing scale
    width: 56, // Starter card avatar size beyond 48dp spacing scale
  },
  starterCardHeader: {
    alignItems: 'center',
    gap: spacing[1],
  },
  starterTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1.5],
  },
  starterCardTitle: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
  },
  starterSystemBadge: {
    backgroundColor: SYSTEM_BADGE_BACKGROUND,
    borderRadius: radius.xs,
    paddingHorizontal: spacing[1],
    paddingVertical: 2, // Preserves compact badge optical height inside starter title
  },
  starterSystemBadgeText: {
    color: aiLightColors.muted,
    fontSize: typography.textStyles.brandSubtitle.fontSize,
    fontWeight: typography.weight.semibold,
  },
  starterCardSubtitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    textAlign: 'center',
  },
  starterFeatureList: {
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.md,
    gap: spacing[2],
    padding: spacing[3],
    width: '100%',
  },
  starterFeatureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  starterFeatureText: {
    ...typography.textStyles.micro,
    color: aiLightColors.ink,
    flex: 1,
    lineHeight: spacing[4],
  },
  starterActionPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    justifyContent: 'center',
    marginTop: spacing[1],
    width: '100%',
  },
  starterActionBtn: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  starterActionBtnText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: typography.weight.medium,
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
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[3],
  },
  loadEarlierButtonDisabled: {
    opacity: 0.6,
  },
  loadingStateOverlay: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loadingStateText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  loadEarlierText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: typography.weight.semibold,
  },
  dateSeparator: {
    ...typography.textStyles.micro,
    alignSelf: 'center',
    color: aiLightColors.muted,
    marginVertical: spacing[1.5],
    paddingVertical: spacing[1],
  },
  searchHighlightWrap: {
    backgroundColor: aiLightColors.primarySoft,
    borderColor: aiLightColors.primary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[1],
  },
  messageItemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginVertical: spacing[1.5],
    width: '100%',
  },
  multiSelectCheckCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: metrics.minTouchSize,
    minWidth: metrics.minTouchSize,
    paddingLeft: spacing[1],
    paddingRight: spacing[2],
  },
  messageItemBubbleSlot: {
    flex: 1,
    minWidth: 0,
  },
  bottomFooterContainer: {
    position: 'relative',
  },
  multiSelectActionBarOverlay: {
    bottom: 0,
    left: -layout.pagePaddingHorizontal,
    position: 'absolute',
    right: -layout.pagePaddingHorizontal,
    top: 0,
    zIndex: 2,
  },
  multiSelectActionBar: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderTopColor: colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'android' ? spacing[3] : spacing[5],
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingVertical: spacing[3],
  },
  multiSelectActionBtn: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[1.5],
    justifyContent: 'center',
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  multiSelectActionBtnDisabled: {
    opacity: 0.4,
  },
  multiSelectActionBtnText: {
    ...typography.textStyles.body,
    fontWeight: typography.weight.medium,
  },
  composerPanel: {
    backgroundColor: 'transparent',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingBottom: spacing[3],
    paddingTop: 0,
    ...shadows.none,
  },
  composerPanelHidden: {
    opacity: 0,
  },
  composerBottomMask: {
    backgroundColor: aiLightColors.canvas,
    bottom: -160,
    height: 160,
    left: -layout.pagePaddingHorizontal,
    position: 'absolute',
    right: -layout.pagePaddingHorizontal,
  },
  previewModalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.9)', // Full-screen lightbox dim scrim matching AiChatScreen
    flex: 1,
  },
  previewModalImage: {
    flex: 1,
  },
  previewModalCloseBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', // Translucent pill over full-screen lightbox image
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: metrics.minTouchSize,
    minWidth: metrics.minTouchSize,
    padding: spacing[2],
    position: 'absolute',
    right: spacing[5],
  },
});
