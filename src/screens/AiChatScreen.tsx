import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AiChatComposer } from '../components/ai/AiChatComposer';
import { AiMessageBubble } from '../components/ai/AiMessageBubble';
import { ScreenScaffold } from '../components/ScreenScaffold';
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
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
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
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const thinkingStatus = generating ? 'thinking 生成中' : 'thinking 待命';
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
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
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
      onBack={onBack}
      rightAction={
        <Pressable accessibilityRole="button" onPress={onOpenSessionConfig} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
          <Ionicons color={colors.primary.active} name="options-outline" size={18} />
          <Text style={styles.headerButtonText}>会话设置</Text>
        </Pressable>
      }
      scrollable
      subtitle={`${spaceLabel} · ${generating ? 'stream 生成中' : 'stream 就绪'} · ${thinkingStatus}`}
      title={resolvedContextTitle}
    >
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>本地上下文</Text>
        <Text style={styles.noticeText}>当前会话会绑定 contextTitle、模型快照和 citations 引用；图片内容不会被读取或识别。</Text>
        {activeThreadId ? <Text style={styles.meta}>Thread {activeThreadId}</Text> : null}
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </View>

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
            <Ionicons color={colors.primary.active} name="chatbubble-ellipses-outline" size={22} />
            <Text style={styles.emptyTitle}>开始一段本地 AI 会话</Text>
            <Text style={styles.emptyText}>普通聊天不会附加 Pixory 材料规则；IP 与知识库会话会在后续步骤绑定本地上下文和引用。</Text>
          </View>
        )}
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 36,
    paddingHorizontal: spacing[3],
  },
  pressed: {
    opacity: 0.78,
  },
  headerButtonText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  notice: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[4],
  },
  noticeTitle: {
    ...typography.textStyles.sectionTitle,
  },
  noticeText: {
    ...typography.textStyles.body,
    color: colors.text.secondary,
  },
  meta: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
  },
  error: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  messageList: {
    gap: rhythm.listCardGap,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[5],
  },
  emptyTitle: {
    ...typography.textStyles.emptyTitle,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.textStyles.emptyDescription,
    textAlign: 'center',
  },
});
