import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { AiStreamingMessageText, AiStreamingReasoningText } from './AiStreamingMessageText';
import { AiThinkingBlock } from './AiThinkingBlock';
import { AiTypingIndicator } from './AiTypingIndicator';
import { formatAiMessageMinute } from '../../utils/aiTimeFormatters';
import type { AiStreamingMessageIdentity } from '../../ai/aiStreamingMessageStore';
import type { AiMessageAttachmentRecord } from '../../database/repositories/aiThreadRepository';

interface AiMessageBubbleProps {
  message: AiMessageWithCitations;
  assistantAvatar?: {
    avatarEnabled: boolean;
    avatarUri: string | null;
  };
  showAvatar?: boolean;
  space: PixorySpace;
  streaming?: boolean;
  streamingIdentity?: AiStreamingMessageIdentity | null;
  generating?: boolean;
  thinkingDefaultExpanded?: boolean;
  editingMessageId?: string | null;
  favorited?: boolean;
  favoriteDisabledByGeneration?: boolean;
  favoritePending?: boolean;
  pendingActionMessageId?: string | null;
  onCopy: (message: AiMessageWithCitations) => void;
  onEditUser: (messageId: string, content: string) => void;
  onChangeEditDraft?: (content: string) => void;
  onSubmitEdit: (messageId: string, content: string) => void;
  onCancelEdit: () => void;
  onRegenerate: (messageId: string) => void;
  onSelectVersion: (messageId: string, versionIndex: number) => void;
  onToggleFavorite?: (message: AiMessageWithCitations) => void;
  onThinkingExpandedChange?: (messageId: string, expanded: boolean) => void;
  onOpenCitation: (citation: AiCitationRecord) => void;
  onAttachmentPress?: (attachment: AiMessageAttachmentRecord) => void;
}

function InlineStreamingCursor() {
  return <Text style={styles.inlineStreamingCursor}>▍</Text>;
}

function renderAssistantContentWithCursor(content: string, streaming: boolean) {
  if (!streaming || !content.trim()) {
    return <AiMessageContent content={content} />;
  }
  return <AiMessageContent content={content} streaming={streaming} trailingInline={<InlineStreamingCursor />} />;
}

function AiMessageBubbleComponent({
  assistantAvatar,
  generating = false,
  message,
  showAvatar = true,
  space,
  streaming = false,
  streamingIdentity = null,
  editingMessageId = null,
  favorited = false,
  favoriteDisabledByGeneration = false,
  favoritePending = false,
  pendingActionMessageId = null,
  thinkingDefaultExpanded = false,
  onCopy,
  onCancelEdit,
  onChangeEditDraft,
  onEditUser,
  onOpenCitation,
  onRegenerate,
  onSelectVersion,
  onToggleFavorite,
  onThinkingExpandedChange,
  onSubmitEdit,
  onAttachmentPress,
}: AiMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isFailed = message.status === 'failed';
  const content = message.content || (streaming ? '正在生成...' : isFailed ? message.errorMessage ?? '生成失败' : message.status === 'stopped' ? '已停止' : '');
  const waitingForFirstToken = generating && !message.content.trim();
  const showAssistantAvatar = !isUser && showAvatar && assistantAvatar?.avatarEnabled;
  const canCopy = Boolean((message.content || message.errorMessage || '').trim());
  const editing = editingMessageId === message.id;
  const actionPending = pendingActionMessageId === message.id;
  const canEdit = isUser && !generating && !actionPending && message.versionIndex === message.versionTotal;
  const canRegenerate = !isUser && !generating && !actionPending && (message.status === 'completed' || message.status === 'failed' || message.status === 'stopped');
  const canFavorite = !isUser && !favoriteDisabledByGeneration && !favoritePending && !actionPending && Boolean(onToggleFavorite);
  const messageTime = formatAiMessageMinute(message.completedAt ?? message.updatedAt);
  const [editDraft, setEditDraft] = useState('');
  const [copyFeedbackVisible, setCopyFeedbackVisible] = useState(false);
  const copyFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const rawContent = message.content;
  let displayContent = rawContent;
  if (isUser) {
    const attachmentMarkerIndex = rawContent.indexOf('\n\n[附件]');
    if (attachmentMarkerIndex !== -1) {
      displayContent = rawContent.slice(0, attachmentMarkerIndex);
    }
    if (displayContent === '请根据以下附件继续对话。') {
      displayContent = '';
    }
  }

  useEffect(() => {
    if (editing) {
      setEditDraft(displayContent);
    }
  }, [editing, displayContent]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
        copyFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

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

  function handleSubmitEdit() {
    let finalDraft = editDraft;
    const attachmentMarkerIndex = rawContent.indexOf('\n\n[附件]');
    if (attachmentMarkerIndex !== -1) {
      finalDraft = `${editDraft}${rawContent.slice(attachmentMarkerIndex)}`;
    } else if (rawContent === '请根据以下附件继续对话。' && !editDraft.trim()) {
      finalDraft = rawContent;
    }
    onSubmitEdit(message.id, finalDraft);
  }

  return (
    <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
      {showAssistantAvatar ? (
        <View style={styles.avatar}>
          {assistantAvatar.avatarUri ? (
            <SecureImage contentFit="cover" space={space} style={styles.avatarImage} uri={assistantAvatar.avatarUri} />
          ) : (
            <Ionicons color={aiLightColors.primary} name="sparkles-outline" size={metrics.iconSizeSm} />
          )}
        </View>
      ) : null}
      <View style={[styles.messageStack, isUser ? styles.userStack : styles.assistantStack]}>
        {message.attachments && message.attachments.length > 0 ? (
          <View style={[styles.attachmentGalleryOuter, !isUser && styles.attachmentGalleryOuterAssistant]}>
            {message.attachments.filter((a) => a.kind === 'image').map((attachment) => (
              <Pressable key={attachment.id} onPress={() => onAttachmentPress?.(attachment)}>
                <SecureImage
                  contentFit="cover"
                  space={space}
                  style={styles.attachmentImageOuter}
                  uri={attachment.localUri}
                />
              </Pressable>
            ))}
            {message.attachments.filter((a) => a.kind === 'document').map((attachment) => (
              <Pressable key={attachment.id} onPress={() => onAttachmentPress?.(attachment)}>
                <View style={styles.attachmentDocumentOuter}>
                  <Ionicons color={aiLightColors.ink} name="document-text-outline" size={24} />
                  <Text numberOfLines={1} style={styles.attachmentDocumentTextOuter}>{attachment.name}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {!isUser ? (
          <View style={styles.thinkingWrap}>
            {streaming && streamingIdentity ? (
              <AiStreamingReasoningText
                completedAt={message.completedAt}
                createdAt={message.createdAt}
                defaultExpanded={thinkingDefaultExpanded}
                identity={streamingIdentity}
                initialReasoningText={message.reasoningText}
                onExpandedChange={(expanded) => onThinkingExpandedChange?.(message.id, expanded)}
                status={message.status}
              />
            ) : (
              <AiThinkingBlock
                completedAt={message.completedAt}
                createdAt={message.createdAt}
                defaultExpanded={thinkingDefaultExpanded}
                onExpandedChange={(expanded) => onThinkingExpandedChange?.(message.id, expanded)}
                reasoningText={message.reasoningText}
                status={message.status}
              />
            )}
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
                <Pressable accessibilityLabel="提交重写" accessibilityRole="button" disabled={!editDraft.trim() && rawContent !== '请根据以下附件继续对话。'} onPress={handleSubmitEdit} style={({ pressed }) => [styles.inlineEditorButton, styles.inlineEditorPrimary, (!editDraft.trim() && rawContent !== '请根据以下附件继续对话。') && styles.disabledAction, pressed && (editDraft.trim() || rawContent === '请根据以下附件继续对话。') && styles.pressed]}>
                  <Text style={[styles.inlineEditorButtonText, styles.inlineEditorPrimaryText]}>发送</Text>
                </Pressable>
              </View>
            </View>
          ) : isUser ? (
            <View style={styles.userContentWrap}>
              {displayContent ? <Text selectable style={[styles.content, styles.userText]}>{displayContent}</Text> : null}
            </View>
          ) : (
            <>
              {waitingForFirstToken ? (
                <AiTypingIndicator />
              ) : streaming && streamingIdentity ? (
                <AiStreamingMessageText identity={streamingIdentity} initialContent={message.content} />
              ) : (
                renderAssistantContentWithCursor(content, streaming)
              )}
              {isFailed && message.content.trim() && message.errorMessage ? <Text style={styles.errorText}>{message.errorMessage}</Text> : null}
              {isFailed && canRegenerate ? (
                <Pressable accessibilityRole="button" onPress={() => onRegenerate(message.id)} style={({ pressed }) => [styles.inlineRetryButton, pressed && styles.pressed]}>
                  <Ionicons color={aiLightColors.primaryActive} name="refresh-outline" size={15} />
                  <Text style={styles.inlineRetryText}>重试</Text>
                </Pressable>
              ) : null}
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
              if (copyFeedbackTimeoutRef.current) {
                clearTimeout(copyFeedbackTimeoutRef.current);
              }
              copyFeedbackTimeoutRef.current = setTimeout(() => {
                setCopyFeedbackVisible(false);
                copyFeedbackTimeoutRef.current = null;
              }, 1400);
            }}
            style={({ pressed }) => [styles.messageActionButton, !canCopy && styles.disabledAction, pressed && canCopy && styles.pressed]}
          >
            <Ionicons color={aiLightColors.muted} name="copy-outline" size={15} />
          </Pressable>
          {!isUser ? (
            <Pressable
              accessibilityLabel={favorited ? '取消收藏 AI 消息' : '收藏 AI 消息'}
              accessibilityRole="button"
              accessibilityState={{ selected: favorited, disabled: !canFavorite }}
              disabled={!canFavorite}
              hitSlop={8}
              onPress={() => onToggleFavorite?.(message)}
              style={({ pressed }) => [styles.messageActionButton, favorited ? styles.favoriteActionButtonActive : null, !canFavorite && styles.disabledAction, pressed && canFavorite && styles.pressed]}
            >
              <Ionicons color={favorited ? aiLightColors.primaryActive : aiLightColors.muted} name={favorited ? 'star' : 'star-outline'} size={15} />
            </Pressable>
          ) : null}
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

function areAiMessageBubblePropsEqual(previous: AiMessageBubbleProps, next: AiMessageBubbleProps): boolean {
  return (
    previous.message === next.message &&
    previous.space === next.space &&
    previous.streaming === next.streaming &&
    previous.streamingIdentity?.generationId === next.streamingIdentity?.generationId &&
    previous.streamingIdentity?.messageId === next.streamingIdentity?.messageId &&
    previous.generating === next.generating &&
    previous.thinkingDefaultExpanded === next.thinkingDefaultExpanded &&
    previous.favorited === next.favorited &&
    previous.favoriteDisabledByGeneration === next.favoriteDisabledByGeneration &&
    previous.favoritePending === next.favoritePending &&
    previous.pendingActionMessageId === next.pendingActionMessageId &&
    previous.showAvatar === next.showAvatar &&
    previous.editingMessageId === next.editingMessageId &&
    previous.assistantAvatar?.avatarEnabled === next.assistantAvatar?.avatarEnabled &&
    previous.assistantAvatar?.avatarUri === next.assistantAvatar?.avatarUri
  );
}

export const AiMessageBubble = memo(AiMessageBubbleComponent, areAiMessageBubblePropsEqual);

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
    maxWidth: '100%',
    padding: spacing[3],
  },
  userBubble: {
    backgroundColor: aiLightColors.chatBubbleUser,
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
    borderColor: aiLightColors.primary,
  },
  content: {
    ...typography.textStyles.body,
    lineHeight: 22,
  },
  inlineStreamingCursor: {
    color: aiLightColors.primaryActive,
    fontWeight: '700',
  },
  userText: {
    color: aiLightColors.ink,
  },
  assistantText: {
    color: aiLightColors.ink,
  },
  errorText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
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
    color: aiLightColors.primaryActive,
    fontWeight: '700',
  },
  thinkingWrap: {
    maxWidth: '98%',
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
  favoriteActionButtonActive: {
    backgroundColor: aiLightColors.primarySoft,
    borderColor: aiLightColors.primary,
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
    color: aiLightColors.primary,
  },
  disabledAction: {
    opacity: 0.36,
  },
  pressed: {
    opacity: 0.78,
  },
  userContentWrap: {
    gap: spacing[2],
  },
  attachmentGalleryOuter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[2],
    justifyContent: 'flex-end',
  },
  attachmentGalleryOuterAssistant: {
    justifyContent: 'flex-start',
  },
  attachmentImageOuter: {
    borderRadius: radius.md,
    height: 120,
    width: 120,
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderWidth: StyleSheet.hairlineWidth,
  },
  attachmentDocumentOuter: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    minWidth: 160,
    maxWidth: 260,
  },
  attachmentDocumentTextOuter: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    flex: 1,
  },
});
