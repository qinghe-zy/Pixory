import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiChatComposer, type AiComposerAttachment } from '../components/ai/AiChatComposer';
import { aiChatDisplayFont, aiChatLightColors } from '../components/ai/aiChatLightTheme';
import { AiMessageBubble } from '../components/ai/AiMessageBubble';
import { AppActionSheet, type AppActionSheetItem } from '../components/AppActionSheet';
import { AppScreen } from '../components/AppScreen';
import {
  createThreadFromContext,
  getCurrentChatModelLabel,
  listThreadMessages,
  loadThreadTitle,
  loadThreadAvatarConfig,
  regenerateAssistantMessage,
  rewriteUserMessage,
  sendUserMessage,
  stopStreamingMessage,
  type AiMessageWithCitations,
} from '../ai/aiChatService';
import type { AiCitationRecord, AiContextType } from '../ai/types';
import type { AiDocumentReaderLocator } from '../ai/readers/readerTypes';
import { colors, layout, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

const MESSAGE_BOTTOM_LOCK_THRESHOLD = 48;

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

interface AiChatScreenProps {
  space: PixorySpace;
  contextType: AiContextType;
  contextTitle?: string;
  boundIpId?: number;
  boundKnowledgeBaseId?: string;
  includeIpDocuments?: boolean;
  threadId?: string;
  onBack: () => void;
  onOpenSessionConfig: (threadId: string) => void;
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
  onBack,
  onOpenSessionConfig,
  onOpenSource,
  onOpenIpSource,
  onOpenImageSource,
  onThreadReady,
  onThreadTitleChange,
}: AiChatScreenProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;
  const resolvedContextTitle = contextTitle ?? (contextType === 'ip' ? 'IP 对话' : contextType === 'knowledge_base' ? '知识库对话' : '普通聊天');
  const messageScrollRef = useRef<ScrollView | null>(null);
  const userScrolledAwayFromBottomRef = useRef(false);
  const displayTitleRef = useRef(resolvedContextTitle);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadId ?? null);
  const [messages, setMessages] = useState<AiMessageWithCitations[]>([]);
  const [composerText, setComposerText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [editingUserMessageId, setEditingUserMessageId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<AiComposerAttachment[]>([]);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  const [modelLabel, setModelLabel] = useState('');
  const [displayTitle, setDisplayTitle] = useState(resolvedContextTitle);
  const [avatarConfig, setAvatarConfig] = useState({ avatarEnabled: false, avatarUri: null as string | null });
  const thinking = generating;
  const citations = messages.some((message) => message.citations.length > 0);
  const latestAssistantMessage = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant'), [messages]);
  const attachmentSheetItems = useMemo<AppActionSheetItem[]>(
    () => [
      { key: 'image', label: '上传图片', icon: 'image-outline', onPress: () => void pickChatImages() },
      { key: 'video', label: '上传视频', icon: 'videocam-outline', onPress: () => void pickChatVideos() },
      { key: 'document', label: '上传文档', icon: 'document-text-outline', onPress: () => void pickChatDocuments() },
    ],
    []
  );

  const scrollToLatestMessage = useCallback((animated = true, force = false) => {
    if (!force && userScrolledAwayFromBottomRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      messageScrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    userScrolledAwayFromBottomRef.current = distanceFromBottom > MESSAGE_BOTTOM_LOCK_THRESHOLD;
  }, []);

  const followLatestMessage = useCallback((animated = true) => {
    userScrolledAwayFromBottomRef.current = false;
    scrollToLatestMessage(animated, true);
  }, [scrollToLatestMessage]);

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
    async (targetThreadId: string | null = activeThreadId) => {
      if (!targetThreadId) {
        return;
      }
      const nextMessages = await listThreadMessages(space, targetThreadId);
      setMessages(nextMessages);
      void loadThreadTitle(space, targetThreadId).then((title) => {
        if (title) {
          applyDisplayTitle(title);
        }
      });
    },
    [activeThreadId, applyDisplayTitle, space]
  );

  const reloadThreadTitle = useCallback(
    async (targetThreadId: string | null = activeThreadId) => {
      if (!targetThreadId) {
        applyDisplayTitle(resolvedContextTitle);
        return;
      }
      const title = await loadThreadTitle(space, targetThreadId);
      if (title) {
        applyDisplayTitle(title);
      }
    },
    [activeThreadId, applyDisplayTitle, resolvedContextTitle, space]
  );

  const reloadModelLabel = useCallback(
    async (targetThreadId: string | null = activeThreadId) => {
      const label = await getCurrentChatModelLabel(space, targetThreadId);
      setModelLabel(label);
    },
    [activeThreadId, space]
  );

  const reloadAvatarConfig = useCallback(
    async (targetThreadId: string | null = activeThreadId) => {
      if (!targetThreadId) {
        setAvatarConfig({ avatarEnabled: false, avatarUri: null });
        return;
      }
      setAvatarConfig(await loadThreadAvatarConfig(space, targetThreadId));
    },
    [activeThreadId, space]
  );

  useEffect(() => {
    setActiveThreadId(threadId ?? null);
    setEditingUserMessageId(null);
    setPendingAttachments([]);
    applyDisplayTitle(contextTitle ?? (contextType === 'ip' ? 'IP 对话' : contextType === 'knowledge_base' ? '知识库对话' : '普通聊天'));
  }, [applyDisplayTitle, contextTitle, contextType, threadId]);

  useEffect(() => {
    void reloadMessages(threadId ?? activeThreadId);
  }, [activeThreadId, reloadMessages, threadId]);

  useEffect(() => {
    void reloadModelLabel(threadId ?? activeThreadId);
  }, [activeThreadId, reloadModelLabel, threadId]);

  useEffect(() => {
    void reloadAvatarConfig(threadId ?? activeThreadId);
  }, [activeThreadId, reloadAvatarConfig, threadId]);

  useEffect(() => {
    void reloadThreadTitle(threadId ?? activeThreadId);
  }, [activeThreadId, reloadThreadTitle, threadId]);

  useEffect(() => {
    scrollToLatestMessage(messages.length > 1);
  }, [messages, scrollToLatestMessage]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardBottomInset(Math.max(0, event.endCoordinates.height - insets.bottom));
      scrollToLatestMessage();
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardBottomInset(0);
      scrollToLatestMessage();
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, scrollToLatestMessage]);

  async function ensureThread(): Promise<string> {
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
    setActiveThreadId(thread.id);
    onThreadReady?.(thread.id);
    void reloadModelLabel(thread.id);
    void reloadAvatarConfig(thread.id);
    return thread.id;
  }

  async function handleOpenSessionConfig() {
    try {
      const nextThreadId = await ensureThread();
      onOpenSessionConfig(nextThreadId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法打开会话设置');
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
    if (editingUserMessageId) {
      await handleRewrite();
      return;
    }
    const typedText = composerText.trim();
    const attachments = pendingAttachments;
    const content = buildChatMessageContent(typedText, attachments);
    if ((!typedText && !attachments.length) || generating) {
      return;
    }
    setComposerText('');
    setPendingAttachments([]);
    setGenerating(true);
    setErrorMessage(null);
    followLatestMessage();
    try {
      const nextThreadId = await ensureThread();
      await sendUserMessage({
        content,
        onCreated: ({ assistantMessageId }) => {
          setActiveAssistantId(assistantMessageId);
          followLatestMessage();
          void reloadMessages(nextThreadId);
        },
        onUpdated: () => {
          void reloadMessages(nextThreadId);
        },
        space,
        threadId: nextThreadId,
      });
      await reloadMessages(nextThreadId);
    } catch (error) {
      setComposerText(typedText);
      setPendingAttachments(attachments);
      setErrorMessage(error instanceof Error ? error.message : '发送失败');
    } finally {
      setGenerating(false);
      setActiveAssistantId(null);
    }
  }

  async function handleRewrite() {
    const content = composerText.trim();
    if (!content || generating || !activeThreadId || !editingUserMessageId) {
      return;
    }
    const userMessageId = editingUserMessageId;
    setComposerText('');
    setEditingUserMessageId(null);
    setGenerating(true);
    setErrorMessage(null);
    followLatestMessage();
    try {
      await rewriteUserMessage({
        content,
        onCreated: ({ assistantMessageId }) => {
          setActiveAssistantId(assistantMessageId);
          followLatestMessage();
          void reloadMessages(activeThreadId);
        },
        onUpdated: () => {
          void reloadMessages(activeThreadId);
        },
        space,
        threadId: activeThreadId,
        userMessageId,
      });
      await reloadMessages(activeThreadId);
    } catch (error) {
      setComposerText(content);
      setEditingUserMessageId(userMessageId);
      setErrorMessage(error instanceof Error ? error.message : '重写失败');
    } finally {
      setGenerating(false);
      setActiveAssistantId(null);
    }
  }

  async function handleStop() {
    if (!activeAssistantId) {
      setGenerating(false);
      return;
    }
    await stopStreamingMessage({ assistantMessageId: activeAssistantId, space });
    setGenerating(false);
    await reloadMessages();
  }

  async function handleRegenerate(messageId?: string) {
    const targetMessageId = messageId ?? latestAssistantMessage?.id;
    if (!targetMessageId || !activeThreadId) {
      return;
    }
    setGenerating(true);
    setActiveAssistantId(targetMessageId);
    setErrorMessage(null);
    followLatestMessage();
    try {
      await regenerateAssistantMessage({
        assistantMessageId: targetMessageId,
        onUpdated: () => {
          void reloadMessages(activeThreadId);
        },
        space,
        threadId: activeThreadId,
      });
      await reloadMessages(activeThreadId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '刷新失败');
    } finally {
      setGenerating(false);
      setActiveAssistantId(null);
    }
  }

  function handleEditUserMessage(messageId: string, content: string) {
    if (generating) {
      return;
    }
    setEditingUserMessageId(messageId);
    setComposerText(content);
    setPendingAttachments([]);
    setErrorMessage(null);
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

  return (
    <AppScreen
      backgroundColor={aiChatLightColors.canvas}
      contentStyle={[styles.screenContent, { paddingTop: statusBarHeight + layout.pageTopOffset }]}
    >
      <View style={styles.header}>
        <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Ionicons color={aiChatLightColors.ink} name="chevron-back" size={20} />
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
          <Ionicons color={aiChatLightColors.ink} name="options-outline" size={18} />
        </Pressable>
      </View>

      <ScrollView
        ref={messageScrollRef}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollToLatestMessage()}
        onLayout={() => scrollToLatestMessage(false, true)}
        onScroll={handleMessageScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.messageScroller}
        contentContainerStyle={styles.messageScrollContent}
      >
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {citations ? null : null}

        <View style={styles.messageList}>
          {messages.length ? (
            messages.map((message) => (
              <AiMessageBubble
                key={message.id}
                assistantAvatar={avatarConfig}
                generating={generating}
                message={message}
                space={space}
                onCopy={(targetMessage) => {
                  void copyMessageContent(targetMessage);
                }}
                onEditUser={handleEditUserMessage}
                onOpenCitation={openCitation}
                onRegenerate={(messageId) => {
                  void handleRegenerate(messageId);
                }}
                streaming={generating && message.id === activeAssistantId}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyGlyph}>
                <Ionicons color={aiChatLightColors.onDark} name="sparkles-outline" size={22} />
              </View>
              <Text style={styles.emptyTitle}>开始对话</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.composerPanel, keyboardBottomInset ? { marginBottom: keyboardBottomInset } : null]}>
        <AiChatComposer
          attachments={pendingAttachments}
          generating={generating}
          editing={Boolean(editingUserMessageId)}
          onAddAttachment={() => setAttachmentSheetVisible(true)}
          onChangeText={setComposerText}
          onCancelEdit={() => {
            setEditingUserMessageId(null);
            setComposerText('');
            setPendingAttachments([]);
          }}
          onRemoveAttachment={(id) => setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id))}
          onRetry={() => {
            void handleRegenerate();
          }}
          onSend={() => {
            void handleSend();
          }}
          onStop={() => {
            void handleStop();
          }}
          retryAvailable={Boolean(latestAssistantMessage) && !generating}
          value={composerText}
        />
      </View>
      <AppActionSheet
        items={attachmentSheetItems}
        onClose={() => setAttachmentSheetVisible(false)}
        title="添加附件"
        visible={attachmentSheetVisible}
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
    backgroundColor: aiChatLightColors.canvas,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingBottom: spacing[3],
    paddingTop: spacing[2],
    ...shadows.none,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: aiChatLightColors.hairline,
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
    backgroundColor: aiChatLightColors.canvas,
    borderColor: aiChatLightColors.hairline,
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
    color: aiChatLightColors.ink,
    fontFamily: aiChatDisplayFont,
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 26,
    maxWidth: '90%',
  },
  modelSubtitle: {
    ...typography.textStyles.caption,
    color: aiChatLightColors.muted,
    maxWidth: '92%',
    textAlign: 'center',
  },
  liveDot: {
    backgroundColor: aiChatLightColors.coral,
    borderRadius: radius.pill,
    height: spacing[1.5],
    width: spacing[1.5],
  },
  error: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
    textAlign: 'center',
  },
  messageScroller: {
    flex: 1,
  },
  messageScrollContent: {
    flexGrow: 1,
    paddingBottom: spacing[4],
  },
  messageList: {
    gap: rhythm.listCardGap,
    paddingTop: spacing[3],
  },
  emptyState: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: aiChatLightColors.dark,
    borderRadius: radius.lg,
    gap: rhythm.cardContentGap,
    marginTop: spacing[12],
    maxWidth: 280,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[6],
  },
  emptyGlyph: {
    alignItems: 'center',
    backgroundColor: aiChatLightColors.coral,
    borderRadius: radius.md,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  emptyTitle: {
    ...typography.textStyles.emptyTitle,
    color: aiChatLightColors.onDark,
    fontFamily: aiChatDisplayFont,
    fontWeight: '400',
    textAlign: 'center',
  },
});
