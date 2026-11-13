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
  loadFileTransferMessagePage,
  loadFileTransferUserProfile,
  sendFileTransferMessage,
  updateFileTransferMessageText,
  type FileTransferUserProfile,
} from '../ai/fileTransferService';
import { FILE_TRANSFER_THREAD_ID } from '../ai/systemAssistant/capabilityProfile';
import { AppScreen } from '../components/AppScreen';
import { useToast } from '../components/AppToast';
import { SecureImage } from '../components/SecureImage';
import { AiChatComposer, type AiComposerAttachment } from '../components/ai/AiChatComposer';
import { AiChatErrorBanner } from '../components/ai/AiChatErrorBanner';
import {
  CopyIcon,
  EditIcon,
  FavoriteStarIcon,
  SelectTextIcon,
} from '../components/ai/AiMessageActionIcons';
import { AiMessageBubble } from '../components/ai/AiMessageBubble';
import {
  AiMessageContextMenu,
  type AiMessageContextMenuAction,
} from '../components/ai/AiMessageContextMenu';
import { AiMessageTextSelectionModal } from '../components/ai/AiMessageTextSelectionModal';
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
import { formatAiMessageMinute } from '../utils/aiTimeFormatters';
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

const FILE_TRANSFER_LIST_ANCHOR_CONFIG = { minIndexForVisible: 0 };

function getFileNameFromUri(uri: string, fallback: string): string {
  const rawName = uri.split(/[\\/]/).pop()?.split('?')[0]?.trim();
  if (!rawName) {
    return fallback;
  }
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
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

function toUserFacingErrorMessage(error: unknown, fallback: string): string {
  const rawMessage = error instanceof Error ? error.message : '';
  if (/database is locked|finalizeAsync|SQLITE_BUSY|cannot rollback/i.test(rawMessage)) {
    return '本地数据库繁忙，已暂停并保护当前状态，请稍后重试';
  }
  if (/file:\/\/|content:\/\/|\/data\/|Source file is unavailable|ENOENT|EACCES|EPERM/i.test(rawMessage)) {
    return fallback;
  }
  return rawMessage || fallback;
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
  const messageListRef = useRef<FlatList<VisibleTimelineItem> | null>(null);
  const messagesRef = useRef<AiMessageWithCitations[]>([]);
  const pendingAttachmentsRef = useRef<AiComposerAttachment[]>([]);
  const olderCursorRef = useRef<AiMessagePageCursor | null>(null);
  const loadRequestSeqRef = useRef(0);
  const isLoadingEarlierRef = useRef(false);
  const sendingRef = useRef(false);
  const userScrolledAwayRef = useRef(false);
  const searchHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedSearchKeyRef = useRef<string | null>(null);

  const [messages, setMessages] = useState<AiMessageWithCitations[]>([]);
  const [hasEarlierMessages, setHasEarlierMessages] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingHintVisible, setLoadingHintVisible] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [composerText, setComposerText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<AiComposerAttachment[]>([]);
  const [composerPanelHeight, setComposerPanelHeight] = useState(0);
  const [composerShellHeight, setComposerShellHeight] = useState(0);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);

  const [userProfile, setUserProfile] = useState<FileTransferUserProfile>({
    avatarUri: null,
    nickname: null,
  });

  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const isMultiSelectModeRef = useRef(false);
  isMultiSelectModeRef.current = isMultiSelectMode;
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingInitialDraft, setEditingInitialDraft] = useState<string | null>(null);
  const [searchHighlightMessageId, setSearchHighlightMessageId] = useState<string | null>(null);

  const [favoriteStateByKey, setFavoriteStateByKey] = useState<Record<string, boolean>>({});
  const [favoritePendingByKey, setFavoritePendingByKey] = useState<Record<string, boolean>>({});

  const [contextMenuState, setContextMenuState] = useState<{
    anchorX: number;
    anchorY: number;
    messageId: string;
  } | null>(null);
  const [textSelectionState, setTextSelectionState] = useState<{
    messageId: string;
    content: string;
  } | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [docViewerState, setDocViewerState] = useState<{
    visible: boolean;
    title: string;
    uri?: string;
    content?: string;
    mode?: 'clean' | 'diff';
  } | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
  }) => {
    messagesRef.current = page.messages;
    olderCursorRef.current = page.olderCursor;
    setMessages(page.messages);
    setHasEarlierMessages(page.hasEarlierMessages);
    setLoadError(null);
  }, []);

  const loadInitialMessages = useCallback(async () => {
    const requestSeq = ++loadRequestSeqRef.current;
    setLoadError(null);
    const hasSearchTarget = Boolean(searchTargetMessageId);
    if (!hasSearchTarget) {
      try {
        const prefetched = await consumeThreadMessagePrefetch(space, FILE_TRANSFER_THREAD_ID);
        if (prefetched && screenMountedRef.current && loadRequestSeqRef.current === requestSeq) {
          applyLoadedPage({
            messages: prefetched.messages,
            hasEarlierMessages: prefetched.hasEarlierMessages,
            olderCursor: prefetched.olderCursor,
          });
          setLoadingInitial(false);
          return;
        }
      } catch {
        // Prefetch misses fall back to direct repository query.
      }
    }

    try {
      const page = await loadFileTransferMessagePage(space, {
        anchorMessageId: searchTargetMessageId ?? undefined,
        limit: FILE_TRANSFER_PAGE_SIZE,
      });
      if (!screenMountedRef.current || loadRequestSeqRef.current !== requestSeq) return;
      applyLoadedPage(page);
    } catch (error) {
      if (!screenMountedRef.current || loadRequestSeqRef.current !== requestSeq) return;
      setLoadError(toUserFacingErrorMessage(error, '记录加载失败，请重试。'));
    } finally {
      if (screenMountedRef.current && loadRequestSeqRef.current === requestSeq) {
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
    const messagesById = new Map<string, AiMessageWithCitations>();
    let previousDateKey: string | null = null;

    for (const message of messages) {
      messagesById.set(message.id, message);
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
      messagesById,
    };
  }, [messages]);

  const { invertedItems, invertedIndexById, messagesById } = timelineState;
  const latestMessageId = messages[messages.length - 1]?.id ?? null;

  const favoriteKeyByMessageId = useMemo(() => {
    const next = new Map<string, string>();
    for (const message of messages) {
      next.set(message.id, `${space}|${message.id}|main|${message.versionIndex ?? 'current'}`);
    }
    return next;
  }, [messages, space]);

  const favoriteKeysSignature = useMemo(
    () => Array.from(favoriteKeyByMessageId.values()).join('\u001f'),
    [favoriteKeyByMessageId],
  );

  useEffect(() => {
    const keys = favoriteKeysSignature ? favoriteKeysSignature.split('\u001f') : [];
    if (keys.length === 0) {
      setFavoriteStateByKey({});
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
    userScrolledAwayRef.current = false;
    setShowScrollToLatest(false);
    messageListRef.current?.scrollToOffset({ animated, offset: 0 });
  }, []);

  const handleLoadEarlier = useCallback(() => {
    const beforeCursor = olderCursorRef.current;
    if (!beforeCursor || isLoadingEarlierRef.current) {
      return;
    }
    isLoadingEarlierRef.current = true;
    setLoadingEarlier(true);
    void loadFileTransferMessagePage(space, {
      beforeCursor,
      limit: FILE_TRANSFER_PAGE_SIZE,
    })
      .then((page) => {
        if (!screenMountedRef.current || olderCursorRef.current !== beforeCursor) {
          return;
        }
        const merged = mergeOrderedMessagePages(page.messages, messagesRef.current);
        messagesRef.current = merged;
        olderCursorRef.current = page.olderCursor;
        setHasEarlierMessages(page.hasEarlierMessages);
        setMessages(merged);
      })
      .catch((error) => {
        if (screenMountedRef.current) {
          setErrorMessage(toUserFacingErrorMessage(error, '加载更早记录失败，请重试。'));
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
    const showJump = shouldShowScrollToLatest(offsetY);
    userScrolledAwayRef.current = offsetY > 40;
    setShowScrollToLatest(showJump);
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
      setErrorMessage(validation.message);
      return;
    }
    pendingAttachmentsRef.current = next;
    setErrorMessage(null);
    setPendingAttachments(next);
  }, []);

  const pickImages = useCallback(async () => {
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
      appendPickedAttachments(picked);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '选择图片失败');
    }
  }, [appendPickedAttachments]);

  const pickDocuments = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: '*/*',
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
      appendPickedAttachments(picked);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '选择文档失败');
    }
  }, [appendPickedAttachments]);

  const handleSend = useCallback(async () => {
    if (sendingRef.current) {
      return;
    }
    const typedText = composerText.trim();
    const attachments = pendingAttachments;
    if (!typedText && attachments.length === 0) {
      return;
    }

    sendingRef.current = true;
    const messageId = `ftmsg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date().toISOString();
    const optimisticMessage = buildOptimisticTransferMessage({
      id: messageId,
      content: typedText,
      createdAt,
      attachments,
    });

    pendingAttachmentsRef.current = [];
    setComposerText('');
    setPendingAttachments([]);
    setErrorMessage(null);
    setMessages((current) => [...current, optimisticMessage]);

    requestAnimationFrame(() => {
      if (screenMountedRef.current) {
        scrollToLatest(false);
      }
    });

    try {
      const persistedMessage = await sendFileTransferMessage(space, {
        attachments,
        content: typedText,
        createdAt,
        messageId,
      });
      if (!screenMountedRef.current) return;
      setMessages((current) =>
        current.map((item) => (item.id === messageId ? persistedMessage : item)),
      );
    } catch (error) {
      if (!screenMountedRef.current) return;
      setMessages((current) => current.filter((item) => item.id !== messageId));
      if (typedText) {
        setComposerText((current) => (current.trim() ? `${typedText}\n${current}` : typedText));
      }
      if (attachments.length > 0) {
        pendingAttachmentsRef.current = [...attachments, ...pendingAttachmentsRef.current];
        setPendingAttachments((current) => [...attachments, ...current]);
      }
      setErrorMessage(toUserFacingErrorMessage(error, '发送失败，请重试'));
    } finally {
      sendingRef.current = false;
    }
  }, [composerText, pendingAttachments, scrollToLatest, space]);

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

  const handleToggleMessageFavorite = useCallback(
    async (message: AiMessageWithCitations) => {
      const key = favoriteKeyByMessageId.get(message.id);
      if (!key || favoritePendingByKey[key]) {
        return;
      }
      const nextFavorited = !favoriteStateByKey[key];
      setFavoritePendingByKey((current) => ({ ...current, [key]: true }));
      try {
        await toggleAssistantMessageFavorite({
          branchScopes: [],
          favorited: nextFavorited,
          messageId: message.id,
          messageVersionIndex: message.versionIndex ?? 1,
          space,
          threadId: FILE_TRANSFER_THREAD_ID,
        });
        if (!screenMountedRef.current) return;
        setFavoriteStateByKey((current) => ({ ...current, [key]: nextFavorited }));
      } catch (error) {
        if (screenMountedRef.current) {
          setErrorMessage(error instanceof Error ? error.message : '更新消息收藏失败');
        }
      } finally {
        if (screenMountedRef.current) {
          setFavoritePendingByKey((current) => {
            const next = { ...current };
            delete next[key];
            return next;
          });
        }
      }
    },
    [favoriteKeyByMessageId, favoritePendingByKey, favoriteStateByKey, space],
  );

  const handleDeleteMessages = useCallback(
    async (idsToDelete: string[]) => {
      if (idsToDelete.length === 0) return;
      const deleteSet = new Set(idsToDelete);
      const previous = messagesRef.current;
      setMessages((current) => current.filter((m) => !deleteSet.has(m.id)));
      try {
        await deleteFileTransferMessages(space, idsToDelete);
      } catch (error) {
        if (!screenMountedRef.current) return;
        setMessages(previous);
        setErrorMessage(toUserFacingErrorMessage(error, '删除消息失败'));
      }
    },
    [space],
  );

  const handleBatchDeleteSelected = useCallback(() => {
    if (selectedMessageIds.size === 0) return;
    const count = selectedMessageIds.size;
    const ids = Array.from(selectedMessageIds);
    Alert.alert('批量删除消息', `确定要删除选中的 ${count} 条消息吗？相关附件也将被移除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setIsMultiSelectMode(false);
          setSelectedMessageIds(new Set());
          void handleDeleteMessages(ids);
        },
      },
    ]);
  }, [handleDeleteMessages, selectedMessageIds]);

  const handleBatchFavoriteSelected = useCallback(() => {
    if (selectedMessageIds.size === 0) return;
    const idsToFavorite = Array.from(selectedMessageIds);
    void (async () => {
      const targets = messagesRef.current.filter((m) => idsToFavorite.includes(m.id));
      let succeededCount = 0;
      for (const msg of targets) {
        const key = favoriteKeyByMessageId.get(msg.id);
        try {
          await toggleAssistantMessageFavorite({
            branchScopes: [],
            favorited: true,
            messageId: msg.id,
            messageVersionIndex: msg.versionIndex ?? 1,
            space,
            threadId: FILE_TRANSFER_THREAD_ID,
          });
          succeededCount += 1;
          if (key && screenMountedRef.current) {
            setFavoriteStateByKey((prev) => ({ ...prev, [key]: true }));
          }
        } catch {
          // Count partial successes below and surface user feedback.
        }
      }
      if (!screenMountedRef.current) return;
      setIsMultiSelectMode(false);
      setSelectedMessageIds(new Set());
      if (succeededCount === 0) {
        setErrorMessage('批量收藏失败，请稍后重试');
      } else if (succeededCount < targets.length) {
        showToast(`已收藏 ${succeededCount}/${targets.length} 条消息`);
      } else {
        showToast(`已收藏 ${succeededCount} 条消息`);
      }
    })();
  }, [favoriteKeyByMessageId, selectedMessageIds, showToast, space]);

  const handleSubmitEdit = useCallback(
    async (messageId: string, nextContent: string) => {
      const trimmed = nextContent.trim();
      setEditingMessageId(null);
      setEditingInitialDraft(null);
      if (!trimmed) {
        return;
      }
      const previous = messagesRef.current;
      const updatedAt = new Date().toISOString();
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId ? { ...item, content: trimmed, updatedAt } : item,
        ),
      );
      try {
        await updateFileTransferMessageText(space, messageId, trimmed);
      } catch (error) {
        if (!screenMountedRef.current) return;
        setMessages(previous);
        setErrorMessage(toUserFacingErrorMessage(error, '修改消息失败'));
      }
    },
    [space],
  );

  const handleMessageLongPress = useCallback(
    (message: AiMessageWithCitations, pageX: number, pageY: number) => {
      if (isMultiSelectModeRef.current) {
        toggleMultiSelectMessage(message.id);
        return;
      }
      setContextMenuState({
        anchorX: pageX,
        anchorY: pageY,
        messageId: message.id,
      });
    },
    [toggleMultiSelectMessage],
  );

  const handleNoop = useCallback(() => undefined, []);

  const handleAttachmentPress = useCallback(
    (attachment: AiMessageAttachmentRecord) => {
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
    [onOpenSource],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingInitialDraft(null);
  }, []);

  const handleCopyMessage = useCallback(
    (targetMessage: AiMessageWithCitations) => {
      if (targetMessage.content?.trim()) {
        void Clipboard.setStringAsync(targetMessage.content);
        showToast('已复制');
      }
    },
    [showToast],
  );

  const handleEditUser = useCallback((msgId: string, customDraft?: string) => {
    setEditingMessageId(msgId);
    setEditingInitialDraft(customDraft ?? null);
  }, []);

  const handleOpenDocument = useCallback(
    (target: { uri?: string; title?: string; content?: string | Uint8Array; mode?: 'clean' | 'diff' }) => {
      setDocViewerState({
        visible: true,
        title: target.title ?? '文档',
        uri: target.uri,
        content: typeof target.content === 'string' ? target.content : '',
        mode: target.mode,
      });
    },
    [],
  );

  const handleSubmitEditForBubble = useCallback(
    (msgId: string, nextContent: string) => {
      void handleSubmitEdit(msgId, nextContent);
    },
    [handleSubmitEdit],
  );

  const handleToggleFavoriteForBubble = useCallback(
    (targetMessage: AiMessageWithCitations) => {
      void handleToggleMessageFavorite(targetMessage);
    },
    [handleToggleMessageFavorite],
  );

  const renderMessageItem = useCallback(
    ({ item, index }: { item: VisibleTimelineItem; index: number }) => {
      if (item.type === 'dateSeparator') {
        return <Text style={styles.dateSeparator}>{item.label}</Text>;
      }

      const { message } = item;
      const favKey = favoriteKeyByMessageId.get(message.id);
      const favorited = favKey ? Boolean(favoriteStateByKey[favKey]) : false;
      const favoritePending = favKey ? Boolean(favoritePendingByKey[favKey]) : false;

      return (
        <View
          style={[
            searchHighlightMessageId === message.id && styles.searchHighlightWrap,
            isMultiSelectMode && styles.multiSelectRow,
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
            onPress={() => toggleMultiSelectMessage(message.id)}
            style={isMultiSelectMode ? styles.multiSelectBubbleWrap : undefined}
          >
            <AiMessageBubble
              assistantAvatar={{ avatarEnabled: false, avatarUri: null }}
              editingMessageId={editingMessageId}
              favorited={favorited}
              favoriteDisabledByGeneration={false}
              favoritePending={favoritePending}
              generating={false}
              initialEditDraft={editingMessageId === message.id ? editingInitialDraft : null}
              isDeepHistory={index >= 8}
              isLatestMessage={message.id === latestMessageId}
              message={message}
              onAttachmentPress={handleAttachmentPress}
              onCancelEdit={handleCancelEdit}
              onContinue={handleNoop}
              onContinueReply={handleNoop}
              onCopy={handleCopyMessage}
              onEditUser={handleEditUser}
              onLongPress={handleMessageLongPress}
              onOpenCitation={handleNoop}
              onOpenDocument={handleOpenDocument}
              onRegenerate={handleNoop}
              onReplyToAssistant={handleNoop}
              onSelectVersion={handleNoop}
              onSubmitEdit={handleSubmitEditForBubble}
              onToggleFavorite={handleToggleFavoriteForBubble}
              showActionButtons={false}
              showAvatar={false}
              showUserAvatar={item.showUserAvatar}
              space={space}
              userProfile={{
                avatarEnabled: true,
                avatarUri: userProfile.avatarUri,
                nickname: userProfile.nickname,
              }}
            />
          </Pressable>
        </View>
      );
    },
    [
      editingInitialDraft,
      editingMessageId,
      favoriteKeyByMessageId,
      favoritePendingByKey,
      favoriteStateByKey,
      handleAttachmentPress,
      handleCancelEdit,
      handleCopyMessage,
      handleEditUser,
      handleMessageLongPress,
      handleNoop,
      handleOpenDocument,
      handleSubmitEditForBubble,
      handleToggleFavoriteForBubble,
      isMultiSelectMode,
      latestMessageId,
      searchHighlightMessageId,
      selectedMessageIds,
      space,
      toggleMultiSelectMessage,
      userProfile.avatarUri,
      userProfile.nickname,
    ],
  );

  const listExtraData = useMemo(
    () => ({
      editingMessageId,
      favoriteStateByKey,
      isMultiSelectMode,
      latestMessageId,
      searchHighlightMessageId,
      selectedMessageIds,
      userProfile,
    }),
    [
      editingMessageId,
      favoriteStateByKey,
      isMultiSelectMode,
      latestMessageId,
      searchHighlightMessageId,
      selectedMessageIds,
      userProfile,
    ],
  );

  const contextMenuPresentation = useMemo(() => {
    if (!contextMenuState) return null;
    const message = messagesById.get(contextMenuState.messageId);
    if (!message) return null;
    const favKey = favoriteKeyByMessageId.get(message.id);
    const favorited = favKey ? Boolean(favoriteStateByKey[favKey]) : false;
    const favoritePending = favKey ? Boolean(favoritePendingByKey[favKey]) : false;
    const contentText = message.content?.trim() ?? '';

    const actions: AiMessageContextMenuAction[] = [
      {
        disabled: !contentText,
        icon: 'copy-outline',
        key: 'copy',
        label: '复制',
        onPress: () => {
          if (contentText) {
            void Clipboard.setStringAsync(contentText);
            showToast('已复制');
          }
        },
        renderIcon: ({ color, size }) => <CopyIcon color={color} size={size} />,
      },
      {
        disabled: !contentText,
        icon: 'text-outline',
        key: 'select-text',
        label: '选择文本',
        onPress: () => {
          setTextSelectionState({ messageId: message.id, content: message.content });
        },
        renderIcon: ({ color, size }) => <SelectTextIcon color={color} size={size} />,
      },
      {
        disabled: !favKey || favoritePending,
        icon: favorited ? 'star' : 'star-outline',
        key: 'favorite',
        label: favorited ? '取消收藏' : '收藏',
        onPress: () => {
          void handleToggleMessageFavorite(message);
        },
        renderIcon: ({ color, size }) => (
          <FavoriteStarIcon color={color} favorited={favorited} size={size} />
        ),
        selected: favorited,
      },
      {
        disabled: false,
        icon: 'checkbox-outline',
        key: 'multi-select',
        label: '多选',
        onPress: () => {
          Keyboard.dismiss();
          setIsMultiSelectMode(true);
          setSelectedMessageIds(new Set([message.id]));
          setContextMenuState(null);
        },
        renderIcon: ({ color, size }) => (
          <Ionicons color={color} name="checkbox-outline" size={size} />
        ),
      },
    ];

    if (contentText) {
      actions.push({
        disabled: false,
        icon: 'create-outline',
        key: 'edit',
        label: '修改',
        onPress: () => {
          setEditingMessageId(message.id);
          setEditingInitialDraft(null);
        },
        renderIcon: ({ color, size }) => <EditIcon color={color} size={size} />,
      });
    }

    actions.push({
      disabled: false,
      icon: 'trash-outline',
      key: 'delete',
      label: '删除',
      onPress: () => {
        Alert.alert('删除消息', '确定要删除这条消息吗？相关附件也将被移除。', [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: () => {
              void handleDeleteMessages([message.id]);
            },
          },
        ]);
      },
      renderIcon: () => <Ionicons color={colors.semantic.danger} name="trash-outline" size={18} />,
    });

    return {
      actions,
      anchorX: contextMenuState.anchorX,
      anchorY: contextMenuState.anchorY,
      timeLabel: formatAiMessageMinute(message.completedAt ?? message.updatedAt ?? message.createdAt),
    };
  }, [
    contextMenuState,
    favoriteKeyByMessageId,
    favoritePendingByKey,
    favoriteStateByKey,
    handleDeleteMessages,
    handleToggleMessageFavorite,
    messagesById,
    showToast,
  ]);

  const effectiveComposerHeight = composerShellHeight || composerPanelHeight;

  return (
    <AppScreen
      backgroundColor={aiLightColors.canvas}
      contentStyle={[styles.host, { paddingBottom: mainBottomPadding }]}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardAvoidingHost}>
        <View style={[styles.screenContent, { paddingTop: statusBarHeight + spacing[1.5] }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerSide}>
              {isMultiSelectMode ? (
                <Pressable
                  accessibilityLabel="取消多选"
                  accessibilityRole="button"
                  hitSlop={spacing[1]}
                  onPress={() => {
                    setIsMultiSelectMode(false);
                    setSelectedMessageIds(new Set());
                  }}
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.headerCancelText}>取消</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel="返回"
                  accessibilityRole="button"
                  hitSlop={spacing[1]}
                  onPress={onBack}
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                >
                  <Ionicons color={aiLightColors.ink} name="chevron-back" size={22} />
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

            <View style={styles.headerSide}>
              {isMultiSelectMode ? (
                <Pressable
                  accessibilityLabel={
                    selectedMessageIds.size === messages.length && messages.length > 0
                      ? '取消全选'
                      : '全选'
                  }
                  accessibilityRole="button"
                  onPress={() => {
                    if (selectedMessageIds.size === messages.length) {
                      setSelectedMessageIds(new Set());
                    } else {
                      setSelectedMessageIds(new Set(messages.map((m) => m.id)));
                    }
                  }}
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.headerSelectAllText}>
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

          {/* Message List */}
          <View style={styles.messageArea}>
            <FlatList
              ref={messageListRef}
              data={invertedItems}
              extraData={listExtraData}
              inverted
              initialNumToRender={12}
              keyboardDismissMode={
                editingMessageId ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'
              }
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => item.id}
              maintainVisibleContentPosition={FILE_TRANSFER_LIST_ANCHOR_CONFIG}
              maxToRenderPerBatch={10}
              removeClippedSubviews={false}
              windowSize={11}
              ListFooterComponent={
                <>
                  {errorMessage || loadError ? (
                    <AiChatErrorBanner
                      message={errorMessage ?? loadError ?? ''}
                      onDismiss={loadError ? undefined : () => setErrorMessage(null)}
                      onRetry={loadError ? () => void loadInitialMessages() : undefined}
                    />
                  ) : null}
                  {hasEarlierMessages ? (
                    <Pressable
                      accessibilityLabel="加载更早消息"
                      accessibilityRole="button"
                      disabled={loadingEarlier}
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
                        <Ionicons color={aiLightColors.muted} name="chevron-up" size={15} />
                      )}
                      <Text style={styles.loadEarlierText}>
                        {loadingEarlier ? '正在加载...' : '加载更早消息'}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
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
                  if (screenMountedRef.current && info.index < invertedItems.length) {
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

            {invertedItems.length === 0 && !loadingInitial && !errorMessage && !loadError ? (
              <View style={styles.starterOverlay}>
                <FileTransferStarterCard
                  onPasteClipboard={() => void handlePasteClipboard()}
                  onPickDocs={() => void pickDocuments()}
                  onPickPhotos={() => void pickImages()}
                />
              </View>
            ) : null}
          </View>

          {/* Bottom Bar */}
          {isMultiSelectMode ? (
            <View style={styles.multiSelectActionBar}>
              <Pressable
                accessibilityLabel="删除所选消息"
                accessibilityRole="button"
                disabled={selectedMessageIds.size === 0}
                onPress={handleBatchDeleteSelected}
                style={({ pressed }) => [
                  styles.multiSelectActionBtn,
                  selectedMessageIds.size === 0 && styles.multiSelectActionBtnDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  color={
                    selectedMessageIds.size === 0
                      ? colors.text.placeholder
                      : colors.semantic.danger
                  }
                  name="trash-outline"
                  size={20}
                />
                <Text
                  style={[
                    styles.multiSelectActionBtnText,
                    {
                      color:
                        selectedMessageIds.size === 0
                          ? colors.text.placeholder
                          : colors.semantic.danger,
                    },
                  ]}
                >
                  {`删除 (${selectedMessageIds.size})`}
                </Text>
              </Pressable>

              <Pressable
                accessibilityLabel="收藏所选消息"
                accessibilityRole="button"
                disabled={selectedMessageIds.size === 0}
                onPress={handleBatchFavoriteSelected}
                style={({ pressed }) => [
                  styles.multiSelectActionBtn,
                  selectedMessageIds.size === 0 && styles.multiSelectActionBtnDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  color={
                    selectedMessageIds.size === 0
                      ? colors.text.placeholder
                      : aiLightColors.primaryActive
                  }
                  name="bookmark-outline"
                  size={20}
                />
                <Text
                  style={[
                    styles.multiSelectActionBtnText,
                    {
                      color:
                        selectedMessageIds.size === 0
                          ? colors.text.placeholder
                          : aiLightColors.primaryActive,
                    },
                  ]}
                >
                  {`收藏 (${selectedMessageIds.size})`}
                </Text>
              </Pressable>
            </View>
          ) : editingMessageId ? null : (
            <View
              onLayout={(event) => setComposerPanelHeight(event.nativeEvent.layout.height)}
              style={styles.composerPanel}
            >
              <AiChatComposer
                attachments={pendingAttachments}
                generating={false}
                hideModelIcon
                hideReplyAssist
                onAddDocumentAttachment={() => void pickDocuments()}
                onAddImageAttachment={() => void pickImages()}
                onChangeText={setComposerText}
                onComposerShellHeightChange={setComposerShellHeight}
                onRemoveAttachment={(id) =>
                  setPendingAttachments((current) =>
                    current.filter((attachment) => attachment.id !== id),
                  )
                }
                onReplyAssist={() => undefined}
                onSend={() => {
                  void handleSend();
                }}
                onStop={() => undefined}
                onVoiceInput={() => undefined}
                placeholder="发送文字、链接或备忘..."
                replyAssistDisabled
                value={composerText}
                voiceAvailable={false}
              />
              <View pointerEvents="none" style={styles.composerBottomMask} />
            </View>
          )}

          <AiScrollToLatestButton
            bottomOffset={effectiveComposerHeight + spacing[3] + spacing[1.5]}
            generating={false}
            onPress={() => scrollToLatest(true)}
            visible={showScrollToLatest && !editingMessageId && !isMultiSelectMode}
          />
        </View>
      </KeyboardAvoidingView>

      <AiMessageContextMenu
        actions={contextMenuPresentation?.actions ?? []}
        anchorX={contextMenuPresentation?.anchorX ?? 0}
        anchorY={contextMenuPresentation?.anchorY ?? 0}
        onClose={() => setContextMenuState(null)}
        timeLabel={contextMenuPresentation?.timeLabel ?? ''}
        visible={Boolean(contextMenuPresentation)}
      />

      <AiMessageTextSelectionModal
        content={textSelectionState?.content ?? ''}
        onClose={(editedText) => {
          const selection = textSelectionState;
          setTextSelectionState(null);
          if (selection && editedText !== undefined && editedText !== selection.content) {
            setEditingMessageId(selection.messageId);
            setEditingInitialDraft(editedText);
          }
        }}
        visible={textSelectionState !== null}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
        transparent
        visible={Boolean(previewImageUri)}
      >
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.previewModalBackdrop}>
            {previewImageUri ? (
              <SecureImage
                contentFit="contain"
                space={space}
                style={styles.previewModalImage}
                uri={previewImageUri}
              />
            ) : null}
            <Pressable
              accessibilityLabel="关闭图片预览"
              accessibilityRole="button"
              onPress={() => setPreviewImageUri(null)}
              style={[styles.previewModalCloseBtn, { top: Math.max(statusBarHeight, 20) + 20 }]}
            >
              <Ionicons color={colors.text.inverse} name="close" size={24} />
            </Pressable>
          </View>
        </View>
      </Modal>

      <ImDocumentMinimalViewer
        content={docViewerState?.content}
        documentTitle={docViewerState?.title}
        documentUri={docViewerState?.uri}
        initialMode={docViewerState?.mode}
        onClose={() => setDocViewerState(null)}
        onExport={() => {
          if (docViewerState) {
            void exportDocumentToShare({
              content: docViewerState.content,
              title: docViewerState.title,
              uri: docViewerState.uri,
            });
          }
        }}
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
    minHeight: spacing[10],
  },
  headerSide: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  iconBtn: {
    alignItems: 'center',
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  headerCancelText: {
    color: aiLightColors.ink,
    fontSize: 15,
    fontWeight: '500',
  },
  headerSelectAllText: {
    color: aiLightColors.primaryActive,
    fontSize: 15,
    fontWeight: '500',
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
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: radius.xs,
    marginLeft: 6, // Matches AiChatScreen header system badge horizontal separation
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  headerSystemBadgeText: {
    color: '#4A5568',
    fontSize: 10,
    fontWeight: '600',
  },
  messageArea: {
    flex: 1,
  },
  messageScroller: {
    flex: 1,
  },
  messageScrollContent: {
    flexGrow: 1,
    gap: 14, // Matches AiChatScreen messageScrollContent vertical rhythm between bubbles
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
    height: 56,
    width: 56,
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
    backgroundColor: 'rgba(0, 0, 0, 0.08)', // Matches AiChatScreen headerSystemBadge neutral tint
    borderRadius: radius.xs,
    paddingHorizontal: spacing[1],
    paddingVertical: 2, // Preserves compact badge optical height inside starter title
  },
  starterSystemBadgeText: {
    color: aiLightColors.muted,
    fontSize: 10,
    fontWeight: '600',
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
    lineHeight: 16,
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
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  starterActionBtnText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '500',
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
    fontWeight: '600',
  },
  dateSeparator: {
    ...typography.textStyles.micro,
    alignSelf: 'center',
    color: aiLightColors.muted,
    paddingVertical: spacing[1],
  },
  searchHighlightWrap: {
    backgroundColor: aiLightColors.primarySoft,
    borderColor: aiLightColors.primary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[1],
  },
  multiSelectRow: {
    alignItems: 'center',
    flexDirection: 'row',
    width: '100%',
  },
  multiSelectCheckCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: spacing[1],
    paddingRight: spacing[2],
  },
  multiSelectBubbleWrap: {
    flex: 1,
  },
  multiSelectActionBar: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderTopColor: colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'android' ? spacing[3] : spacing[5],
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
    fontWeight: '500',
  },
  composerPanel: {
    backgroundColor: 'transparent',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingBottom: spacing[3],
    paddingTop: 0,
    ...shadows.none,
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
