import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SecureImage } from '../SecureImage';
import type { AiMessageWithCitations } from '../../ai/aiChatService';
import type { AiCitationRecord } from '../../ai/types';
import type { PixorySpace } from '../../database';
import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { AiCitationList } from './AiCitationList';
import { aiLightColors } from './aiLightTheme';
import { AiInlineFeedback } from './AiInlineFeedback';
import { AiMessageContent } from './AiMessageContent';
import { AiThinkingBlock } from './AiThinkingBlock';
import { AiTypingIndicator } from './AiTypingIndicator';

interface AiMessageBubbleProps {
  message: AiMessageWithCitations;
  assistantAvatar?: {
    avatarEnabled: boolean;
    avatarUri: string | null;
  };
  showAvatar?: boolean;
  space: PixorySpace;
  streaming?: boolean;
  generating?: boolean;
  editingMessageId?: string | null;
  onCopy: (message: AiMessageWithCitations) => void;
  onEditUser: (messageId: string, content: string) => void;
  onChangeEditDraft?: (content: string) => void;
  onSubmitEdit: (messageId: string, content: string) => void;
  onCancelEdit: () => void;
  onRegenerate: (messageId: string) => void;
  onSelectVersion: (messageId: string, versionIndex: number) => void;
  onOpenCitation: (citation: AiCitationRecord) => void;
}

function formatMessageMinute(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function AiMessageBubbleComponent({
  assistantAvatar,
  generating = false,
  message,
  showAvatar = true,
  space,
  streaming = false,
  editingMessageId = null,
  onCopy,
  onCancelEdit,
  onChangeEditDraft,
  onEditUser,
  onOpenCitation,
  onRegenerate,
  onSelectVersion,
  onSubmitEdit,
}: AiMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isFailed = message.status === 'failed';
  const content = message.content || (streaming ? '正在生成...' : isFailed ? message.errorMessage ?? '生成失败' : message.status === 'stopped' ? '已停止' : '');
  const waitingForFirstToken = streaming && !message.content.trim();
  const showAssistantAvatar = !isUser && showAvatar && assistantAvatar?.avatarEnabled;
  const canCopy = Boolean((message.content || message.errorMessage || '').trim());
  const editing = editingMessageId === message.id;
  const canEdit = isUser && !generating && message.versionIndex === message.versionTotal;
  const canRegenerate = !isUser && !generating && (message.status === 'completed' || message.status === 'failed' || message.status === 'stopped');
  const messageTime = formatMessageMinute(message.completedAt ?? message.updatedAt);
  const [editDraft, setEditDraft] = useState(message.content);
  const [copyFeedbackVisible, setCopyFeedbackVisible] = useState(false);
  const streamingCursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (editing) {
      setEditDraft(message.content);
    }
  }, [editing, message.content]);

  useEffect(() => {
    if (!streaming) {
      streamingCursorOpacity.setValue(1);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(streamingCursorOpacity, { duration: 520, toValue: 0.2, useNativeDriver: true }),
        Animated.timing(streamingCursorOpacity, { duration: 520, toValue: 1, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [streaming, streamingCursorOpacity]);

  function updateEditDraft(nextDraft: string) {
    setEditDraft(nextDraft);
    onChangeEditDraft?.(nextDraft);
  }

  function selectVersion(offset: -1 | 1) {
    const nextVersionIndex = Math.min(message.versionTotal, Math.max(1, message.versionIndex + offset));
    if (nextVersionIndex !== message.versionIndex) {
      onSelectVersion(message.id, nextVersionIndex);
    }
  }

  return (
    <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
      {showAssistantAvatar ? (
        <View style={styles.avatar}>
          {assistantAvatar.avatarUri ? (
            <SecureImage contentFit="cover" space={space} style={styles.avatarImage} uri={assistantAvatar.avatarUri} />
          ) : (
            <Ionicons color={aiLightColors.coral} name="sparkles-outline" size={metrics.iconSizeSm} />
          )}
        </View>
      ) : null}
      <View style={[styles.messageStack, isUser ? styles.userStack : styles.assistantStack]}>
        {!isUser ? (
          <View style={styles.thinkingWrap}>
            <AiThinkingBlock
              completedAt={message.completedAt}
              createdAt={message.createdAt}
              reasoningText={message.reasoningText}
              status={message.status}
            />
          </View>
        ) : null}
        {copyFeedbackVisible ? <AiInlineFeedback message="已复制" tone="success" /> : null}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble, isFailed && styles.failedBubble]}>
          {editing ? (
            <View style={styles.inlineEditor}>
              <TextInput
                autoFocus
                cursorColor={aiLightColors.onDark}
                multiline
                onChangeText={updateEditDraft}
                placeholder="重写这条消息"
                placeholderTextColor={aiLightColors.mutedSoft}
                selectionColor={aiLightColors.onDark}
                style={styles.inlineEditorInput}
                textAlignVertical="top"
                value={editDraft}
              />
              <View style={styles.inlineEditorActions}>
                <Pressable accessibilityLabel="取消重写" accessibilityRole="button" onPress={onCancelEdit} style={({ pressed }) => [styles.inlineEditorButton, pressed && styles.pressed]}>
                  <Text style={styles.inlineEditorButtonText}>取消</Text>
                </Pressable>
                <Pressable accessibilityLabel="提交重写" accessibilityRole="button" disabled={!editDraft.trim()} onPress={() => onSubmitEdit(message.id, editDraft)} style={({ pressed }) => [styles.inlineEditorButton, styles.inlineEditorPrimary, !editDraft.trim() && styles.disabledAction, pressed && editDraft.trim() && styles.pressed]}>
                  <Text style={[styles.inlineEditorButtonText, styles.inlineEditorPrimaryText]}>发送</Text>
                </Pressable>
              </View>
            </View>
          ) : isUser ? (
            <Text style={[styles.content, styles.userText]}>{content}</Text>
          ) : (
            <>
              {waitingForFirstToken ? <AiTypingIndicator /> : <AiMessageContent content={content} />}
              {isFailed && message.content.trim() && message.errorMessage ? <Text style={styles.errorText}>{message.errorMessage}</Text> : null}
              {isFailed && canRegenerate ? (
                <Pressable accessibilityRole="button" onPress={() => onRegenerate(message.id)} style={({ pressed }) => [styles.inlineRetryButton, pressed && styles.pressed]}>
                  <Ionicons color={aiLightColors.coralActive} name="refresh-outline" size={15} />
                  <Text style={styles.inlineRetryText}>重试</Text>
                </Pressable>
              ) : null}
              {streaming && !waitingForFirstToken ? <Animated.Text style={[styles.streamingCursor, { opacity: streamingCursorOpacity }]}>▌</Animated.Text> : null}
            </>
          )}
          {!isUser ? <AiCitationList citations={message.citations} onOpenCitation={onOpenCitation} /> : null}
        </View>
        <View style={[styles.actionRow, isUser ? styles.userActionRow : styles.assistantActionRow]}>
          <Pressable
            accessibilityLabel="复制消息"
            accessibilityRole="button"
            disabled={!canCopy}
            hitSlop={8}
            onPress={() => {
              onCopy(message);
              setCopyFeedbackVisible(true);
              setTimeout(() => setCopyFeedbackVisible(false), 1400);
            }}
            style={({ pressed }) => [styles.messageActionButton, !canCopy && styles.disabledAction, pressed && canCopy && styles.pressed]}
          >
            <Ionicons color={aiLightColors.muted} name="copy-outline" size={15} />
          </Pressable>
          {isUser ? (
            <Pressable
              accessibilityLabel="重写消息"
              accessibilityRole="button"
              disabled={!canEdit}
              hitSlop={8}
              onPress={() => onEditUser(message.id, message.content)}
              style={({ pressed }) => [styles.messageActionButton, !canEdit && styles.disabledAction, pressed && canEdit && styles.pressed]}
            >
              <Ionicons color={aiLightColors.muted} name="create-outline" size={15} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel="重新生成回复"
              accessibilityRole="button"
              disabled={!canRegenerate}
              hitSlop={8}
              onPress={() => onRegenerate(message.id)}
              style={({ pressed }) => [styles.messageActionButton, !canRegenerate && styles.disabledAction, pressed && canRegenerate && styles.pressed]}
            >
              <Ionicons color={aiLightColors.muted} name="refresh-outline" size={15} />
            </Pressable>
          )}
          {message.versionTotal > 1 ? (
            <View style={styles.versionControl}>
              <Pressable
                accessibilityLabel="上一版消息"
                accessibilityRole="button"
                disabled={message.versionIndex <= 1}
                hitSlop={8}
                onPress={() => selectVersion(-1)}
                style={({ pressed }) => [styles.versionButton, message.versionIndex <= 1 && styles.disabledAction, pressed && message.versionIndex > 1 && styles.pressed]}
              >
                <Ionicons color={aiLightColors.muted} name="chevron-back" size={14} />
              </Pressable>
              <Text style={styles.versionText}>{message.versionIndex}/{message.versionTotal}</Text>
              <Pressable
                accessibilityLabel="下一版消息"
                accessibilityRole="button"
                disabled={message.versionIndex >= message.versionTotal}
                hitSlop={8}
                onPress={() => selectVersion(1)}
                style={({ pressed }) => [styles.versionButton, message.versionIndex >= message.versionTotal && styles.disabledAction, pressed && message.versionIndex < message.versionTotal && styles.pressed]}
              >
                <Ionicons color={aiLightColors.muted} name="chevron-forward" size={14} />
              </Pressable>
            </View>
          ) : null}
          {messageTime ? <Text style={styles.messageTime}>{messageTime}</Text> : null}
        </View>
      </View>
    </View>
  );
}

export const AiMessageBubble = memo(AiMessageBubbleComponent);

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    maxWidth: '100%',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
    gap: rhythm.inlineGap,
    justifyContent: 'flex-start',
  },
  messageStack: {
    gap: rhythm.microGap,
    maxWidth: '88%',
  },
  userStack: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  assistantStack: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: metrics.minTouchSize,
    justifyContent: 'center',
    overflow: 'hidden',
    width: metrics.minTouchSize,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  bubble: {
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  userBubble: {
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.lg,
    borderTopRightRadius: radius.sm,
  },
  assistantBubble: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  failedBubble: {
    borderColor: aiLightColors.coral,
  },
  content: {
    ...typography.textStyles.body,
    lineHeight: 22,
  },
  userText: {
    color: aiLightColors.onDark,
  },
  assistantText: {
    color: aiLightColors.ink,
  },
  streamingCursor: {
    ...typography.textStyles.body,
    color: aiLightColors.coralActive,
  },
  errorText: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  inlineRetryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  inlineRetryText: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '700',
  },
  thinkingWrap: {
    maxWidth: '100%',
    paddingHorizontal: spacing[1],
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[1],
  },
  userActionRow: {
    justifyContent: 'flex-end',
  },
  assistantActionRow: {
    justifyContent: 'flex-start',
  },
  messageActionButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  versionControl: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 28,
    paddingHorizontal: spacing[1],
  },
  versionButton: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 22,
  },
  versionText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  messageTime: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    minHeight: 28,
    paddingHorizontal: spacing[1],
    textAlignVertical: 'center',
  },
  inlineEditor: {
    gap: rhythm.microGap,
    minWidth: 220,
  },
  inlineEditorInput: {
    ...typography.textStyles.body,
    color: aiLightColors.onDark,
    lineHeight: 22,
    maxHeight: 132,
    minHeight: 44,
    padding: 0,
  },
  inlineEditorActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'flex-end',
  },
  inlineEditorButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: spacing[3],
    paddingVertical: 0,
  },
  inlineEditorPrimary: {
    backgroundColor: aiLightColors.onDark,
    borderColor: aiLightColors.onDark,
  },
  inlineEditorButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.onDark,
    fontWeight: '700',
    textAlign: 'center',
  },
  inlineEditorPrimaryText: {
    color: aiLightColors.coral,
  },
  disabledAction: {
    opacity: 0.36,
  },
  pressed: {
    opacity: 0.78,
  },
});
