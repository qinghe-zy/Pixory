import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiChatComposer } from '../components/ai/AiChatComposer';
import { AiMessageBubble } from '../components/ai/AiMessageBubble';
import { AppScreen } from '../components/AppScreen';
import {
  createThreadFromContext,
  getCurrentChatModelLabel,
  listThreadMessages,
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

interface AiChatScreenProps {
  space: PixorySpace;
  contextType: AiContextType;
  contextTitle?: string;
  boundIpId?: number;
  boundKnowledgeBaseId?: string;
  includeIpDocuments?: boolean;
  threadId?: string;
  onBack: () => void;
  onOpenSessionConfig: () => void;
  onOpenSource: (documentId: string, title: string, locator?: AiDocumentReaderLocator) => void;
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
}: AiChatScreenProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;
  const resolvedContextTitle = contextTitle ?? (contextType === 'ip' ? 'IP 对话' : contextType === 'knowledge_base' ? '知识库对话' : '普通聊天');
  const messageScrollRef = useRef<ScrollView | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadId ?? null);
  const [messages, setMessages] = useState<AiMessageWithCitations[]>([]);
  const [composerText, setComposerText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [editingUserMessageId, setEditingUserMessageId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  const [modelLabel, setModelLabel] = useState('');
  const thinking = generating;
  const citations = messages.some((message) => message.citations.length > 0);
  const latestAssistantMessage = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant'), [messages]);

  const scrollToLatestMessage = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      messageScrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const reloadMessages = useCallback(
    async (targetThreadId: string | null = activeThreadId) => {
      if (!targetThreadId) {
        return;
      }
      const nextMessages = await listThreadMessages(space, targetThreadId);
      setMessages(nextMessages);
    },
    [activeThreadId, space]
  );

  const reloadModelLabel = useCallback(
    async (targetThreadId: string | null = activeThreadId) => {
      const label = await getCurrentChatModelLabel(space, targetThreadId);
      setModelLabel(label);
    },
    [activeThreadId, space]
  );

  useEffect(() => {
    setActiveThreadId(threadId ?? null);
    setEditingUserMessageId(null);
  }, [threadId]);

  useEffect(() => {
    void reloadMessages(threadId ?? activeThreadId);
  }, [activeThreadId, reloadMessages, threadId]);

  useEffect(() => {
    void reloadModelLabel(threadId ?? activeThreadId);
  }, [activeThreadId, reloadModelLabel, threadId]);

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
    void reloadModelLabel(thread.id);
    return thread.id;
  }

  async function handleSend() {
    if (editingUserMessageId) {
      await handleRewrite();
      return;
    }
    const content = composerText.trim();
    if (!content || generating) {
      return;
    }
    setComposerText('');
    setGenerating(true);
    setErrorMessage(null);
    try {
      const nextThreadId = await ensureThread();
      await sendUserMessage({
        content,
        onCreated: ({ assistantMessageId }) => {
          setActiveAssistantId(assistantMessageId);
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
    try {
      await rewriteUserMessage({
        content,
        onCreated: ({ assistantMessageId }) => {
          setActiveAssistantId(assistantMessageId);
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
    setErrorMessage(null);
  }

  function openCitation(citation: AiCitationRecord) {
    if (citation.sourceType === 'document_chunk') {
      onOpenSource(citation.sourceId, citation.label, citation.locator as AiDocumentReaderLocator);
      return;
    }
    onOpenSource(citation.sourceId, citation.label, citation.locator as AiDocumentReaderLocator);
  }

  return (
    <AppScreen
      backgroundVariant="search"
      contentStyle={[styles.screenContent, { paddingTop: statusBarHeight + layout.pageTopOffset }]}
    >
      <View style={styles.header}>
        <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Ionicons color={colors.text.heading} name="chevron-back" size={22} />
        </Pressable>
        <View style={styles.titleBlock}>
          <View style={styles.titleLine}>
            <Text numberOfLines={1} style={styles.title}>
              {resolvedContextTitle}
            </Text>
            {thinking ? <View style={styles.liveDot} /> : null}
          </View>
          {modelLabel ? (
            <Text numberOfLines={1} style={styles.modelSubtitle}>
              {modelLabel}
            </Text>
          ) : null}
        </View>
        <Pressable accessibilityLabel="会话设置" accessibilityRole="button" onPress={onOpenSessionConfig} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Ionicons color={colors.text.heading} name="options-outline" size={20} />
        </Pressable>
      </View>

      <ScrollView
        ref={messageScrollRef}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollToLatestMessage()}
        onLayout={() => scrollToLatestMessage(false)}
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
                message={message}
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
              <Ionicons color={colors.primary.active} name="sparkles-outline" size={28} />
              <Text style={styles.emptyTitle}>开始对话</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.composerPanel, keyboardBottomInset ? { marginBottom: keyboardBottomInset } : null]}>
        <AiChatComposer
          generating={generating}
          editing={Boolean(editingUserMessageId)}
          onChangeText={setComposerText}
          onCancelEdit={() => {
            setEditingUserMessageId(null);
            setComposerText('');
          }}
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
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    gap: rhythm.listCardGap,
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  composerPanel: {
    backgroundColor: colors.overlay.softSurface,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: spacing[2],
    ...shadows.none,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 52,
  },
  pressed: {
    opacity: 0.78,
  },
  roundButton: {
    alignItems: 'center',
    backgroundColor: colors.overlay.softSurface,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  titleBlock: {
    alignItems: 'center',
    flex: 1,
    gap: 1,
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
    fontSize: 18,
    lineHeight: 24,
    maxWidth: '90%',
  },
  modelSubtitle: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    maxWidth: '92%',
    textAlign: 'center',
  },
  liveDot: {
    backgroundColor: colors.primary.active,
    borderRadius: radius.pill,
    height: 7,
    width: 7,
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
    paddingTop: spacing[2],
  },
  emptyState: {
    alignItems: 'center',
    gap: rhythm.cardContentGap,
    paddingTop: spacing[12],
  },
  emptyTitle: {
    ...typography.textStyles.emptyTitle,
    textAlign: 'center',
  },
});
