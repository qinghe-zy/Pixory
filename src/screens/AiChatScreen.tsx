import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AiChatComposer } from '../components/ai/AiChatComposer';
import { AiMessageBubble } from '../components/ai/AiMessageBubble';
import { AppScreen } from '../components/AppScreen';
import {
  createThreadFromContext,
  listThreadMessages,
  retryAssistantMessage,
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
  const resolvedContextTitle = contextTitle ?? (contextType === 'ip' ? 'IP 对话' : contextType === 'knowledge_base' ? '知识库对话' : '普通聊天');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadId ?? null);
  const [messages, setMessages] = useState<AiMessageWithCitations[]>([]);
  const [composerText, setComposerText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const thinking = generating;
  const citations = messages.some((message) => message.citations.length > 0);
  const failedAssistantMessage = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant' && message.status === 'failed'), [messages]);

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

  useEffect(() => {
    setActiveThreadId(threadId ?? null);
  }, [threadId]);

  useEffect(() => {
    void reloadMessages(threadId ?? activeThreadId);
  }, [activeThreadId, reloadMessages, threadId]);

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
    return thread.id;
  }

  async function handleSend() {
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

  async function handleStop() {
    if (!activeAssistantId) {
      setGenerating(false);
      return;
    }
    await stopStreamingMessage({ assistantMessageId: activeAssistantId, space });
    setGenerating(false);
    await reloadMessages();
  }

  async function handleRetry(messageId?: string) {
    const targetMessageId = messageId ?? failedAssistantMessage?.id;
    if (!targetMessageId || !activeThreadId) {
      return;
    }
    await retryAssistantMessage({ assistantMessageId: targetMessageId, space, threadId: activeThreadId });
    await reloadMessages(activeThreadId);
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
      contentStyle={styles.screenContent}
      footer={
        <AiChatComposer
          generating={generating}
          onChangeText={setComposerText}
          onRetry={() => {
            void handleRetry();
          }}
          onSend={() => {
            void handleSend();
          }}
          onStop={() => {
            void handleStop();
          }}
          retryAvailable={Boolean(failedAssistantMessage)}
          value={composerText}
        />
      }
      footerStyle={styles.footer}
      scrollable
    >
      <View style={styles.header}>
        <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Ionicons color={colors.text.heading} name="chevron-back" size={22} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={styles.title}>
            {resolvedContextTitle}
          </Text>
          {thinking ? <View style={styles.liveDot} /> : null}
        </View>
        <Pressable accessibilityLabel="会话设置" accessibilityRole="button" onPress={onOpenSessionConfig} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
          <Ionicons color={colors.text.heading} name="options-outline" size={20} />
        </Pressable>
      </View>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      {citations ? null : null}

      <View style={styles.messageList}>
        {messages.length ? (
          messages.map((message) => (
            <AiMessageBubble
              key={message.id}
              message={message}
              onOpenCitation={openCitation}
              onRetry={(messageId) => {
                void handleRetry(messageId);
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
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: rhythm.listCardGap,
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[2],
  },
  footer: {
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
    flexDirection: 'row',
    gap: rhythm.microGap,
    justifyContent: 'center',
  },
  title: {
    ...typography.textStyles.navTitle,
    fontSize: 18,
    lineHeight: 24,
    maxWidth: '90%',
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
