import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { setLatestAssistantBubbleContentWidth } from '../../ai/aiStreamingBubbleWidthRegistry';
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
import { AiVersionStepper } from './AiVersionStepper';
import { formatAiFullMinute } from '../../utils/aiTimeFormatters';
import type { AiStreamingMessageIdentity } from '../../ai/aiStreamingMessageStore';
import type { AiMessageAttachmentRecord } from '../../database/repositories/aiThreadRepository';
import type { AiTailSegmentEdge } from '../../ai/aiStreamingTailRenderContract';

interface AiMessageBubbleProps {
  message: AiMessageWithCitations;
  replyActionMode?: 'continue' | 'reply';
  assistantAvatar?: {
    avatarEnabled: boolean;
    avatarUri: string | null;
  };
  assistantDisplayName?: string | null;
  assistantBubbleEdge?: AiTailSegmentEdge;
  showAvatar?: boolean;
  showUserAvatar?: boolean;
  userProfile?: {
    avatarEnabled: boolean;
    avatarUri: string | null;
    nickname: string | null;
  };
  space: PixorySpace;
  streaming?: boolean;
  streamingIdentity?: AiStreamingMessageIdentity | null;
  generating?: boolean;
  thinkingExpected?: boolean;
  thinkingDefaultExpanded?: boolean;
  disableShadow?: boolean;
  displayName?: string;
  editingMessageId?: string | null;
  initialEditDraft?: string | null;
  favorited?: boolean;
  favoriteDisabledByGeneration?: boolean;
  favoritePending?: boolean;
  hideCitations?: boolean;
  hideFooterActions?: boolean;
  showActionButtons?: boolean;
  pendingActionMessageId?: string | null;
  onCopy: (message: AiMessageWithCitations) => void;
  onEditUser: (messageId: string, customDraft?: string) => void;
  onChangeEditDraft?: (content: string) => void;
  onSubmitEdit: (messageId: string, content: string) => void;
  onCancelEdit: () => void;
  onContinue: (messageId: string) => void;
  onContinueReply: (messageId: string) => void;
  onReplyToAssistant: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onSelectVersion: (messageId: string, versionIndex: number) => void;
  onToggleFavorite?: (message: AiMessageWithCitations) => void;
  onLongPress?: (message: AiMessageWithCitations, pageX: number, pageY: number) => void;
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

type AiMessageFooterActionsProps = {
  message: AiMessageWithCitations;
  replyActionMode?: 'continue' | 'reply';
  favorited?: boolean;
  favoriteDisabledByGeneration?: boolean;
  favoritePending?: boolean;
  generating?: boolean;
  pendingActionMessageId?: string | null;
  showActionButtons?: boolean;
  onCopy: (message: AiMessageWithCitations) => void;
  onContinue: (messageId: string) => void;
  onContinueReply: (messageId: string) => void;
  onReplyToAssistant: (messageId: string) => void;
  onEditUser: (messageId: string, customDraft?: string) => void;
  onRegenerate: (messageId: string) => void;
  onOpenCitation: (citation: AiCitationRecord) => void;
  onSelectVersion: (messageId: string, versionIndex: number) => void;
  onToggleFavorite?: (message: AiMessageWithCitations) => void;
};

export function AiMessageFooterActions({
  favoriteDisabledByGeneration = false,
  favorited = false,
  favoritePending = false,
  generating = false,
  message,
  replyActionMode = 'continue',
  pendingActionMessageId = null,
  showActionButtons = true,
  onCopy,
  onContinue,
  onContinueReply,
  onReplyToAssistant,
  onEditUser,
  onRegenerate,
  onSelectVersion,
  onToggleFavorite,
}: AiMessageFooterActionsProps) {
  const isUser = message.role === 'user';
  const actionPending = pendingActionMessageId === message.id;
  const assistantActionTargetsLatestVersion = message.versionIndex === message.versionTotal;
  const canCopy = Boolean((message.content || message.errorMessage || '').trim());
  const canEdit = isUser && !generating && !actionPending && message.versionIndex === message.versionTotal;
  const canContinue = !isUser && assistantActionTargetsLatestVersion && !generating && !actionPending && Boolean(message.content.trim()) && (message.status === 'failed' || message.status === 'stopped');
  const canContinueReply = !isUser && assistantActionTargetsLatestVersion && !generating && !actionPending && replyActionMode === 'continue' && Boolean(message.content.trim()) && message.status === 'completed';
  const canReplyToAssistant = !isUser && assistantActionTargetsLatestVersion && !generating && !actionPending && replyActionMode === 'reply' && Boolean(message.content.trim()) && message.status === 'completed';
  const canRegenerate = !isUser && !generating && !actionPending && (message.status === 'completed' || message.status === 'failed' || message.status === 'stopped');
  const canFavorite = !isUser && !favoriteDisabledByGeneration && !favoritePending && !actionPending && Boolean(onToggleFavorite);
  const textReplyActionLabel = replyActionMode === 'reply' ? '回复' : '续答';

  function selectVersion(offset: -1 | 1) {
    const nextVersionIndex = Math.min(message.versionTotal, Math.max(1, message.versionIndex + offset));
    if (nextVersionIndex !== message.versionIndex) {
      onSelectVersion(message.id, nextVersionIndex);
    }
  }

  return (
    <View style={[styles.actionRow, isUser ? styles.userActionRow : styles.assistantActionRow]}>
      {showActionButtons ? (
        <Pressable
          accessibilityLabel="复制消息"
          accessibilityRole="button"
          disabled={!canCopy}
          hitSlop={8}
          onPress={() => onCopy(message)}
          style={({ pressed }) => [styles.messageActionButton, !canCopy && styles.disabledAction, pressed && canCopy && styles.pressed]}
        >
          <Ionicons color={aiLightColors.muted} name="copy-outline" size={15} />
        </Pressable>
      ) : null}
      {showActionButtons && !isUser ? (
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
      {showActionButtons && !isUser ? (
        <Pressable
          accessibilityLabel="继续生成回复"
          accessibilityRole="button"
          disabled={!canContinue}
          hitSlop={8}
          onPress={() => onContinue(message.id)}
          style={({ pressed }) => [styles.messageActionButton, !canContinue && styles.disabledAction, pressed && canContinue && styles.pressed]}
        >
          <Ionicons color={aiLightColors.muted} name="play-forward-outline" size={15} />
        </Pressable>
      ) : null}
      {showActionButtons && !isUser ? (
        <Pressable
          accessibilityLabel={textReplyActionLabel}
          accessibilityRole="button"
          disabled={!canContinueReply && !canReplyToAssistant}
          hitSlop={8}
          onPress={() => {
            if (canReplyToAssistant) {
              onReplyToAssistant(message.id);
              return;
            }
            onContinueReply(message.id);
          }}
          style={({ pressed }) => [
            styles.continueReplyActionButton,
            !canContinueReply && !canReplyToAssistant && styles.disabledAction,
            pressed && (canContinueReply || canReplyToAssistant) && styles.pressed,
          ]}
        >
          <Text style={styles.continueReplyActionText}>{textReplyActionLabel}</Text>
        </Pressable>
      ) : null}
      {showActionButtons && isUser ? (
        <Pressable
          accessibilityLabel="重写消息"
          accessibilityRole="button"
          disabled={!canEdit}
          hitSlop={8}
          onPress={() => onEditUser(message.id)}
          style={({ pressed }) => [styles.messageActionButton, !canEdit && styles.disabledAction, pressed && canEdit && styles.pressed]}
        >
          <Ionicons color={aiLightColors.muted} name="create-outline" size={15} />
        </Pressable>
      ) : showActionButtons ? (
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
      ) : null}
      {message.versionTotal > 1 ? (
        <AiVersionStepper
          currentIndex={message.versionIndex}
          nextAccessibilityLabel="下一版消息"
          onNext={() => selectVersion(1)}
          onPrevious={() => selectVersion(-1)}
          previousAccessibilityLabel="上一版消息"
          total={message.versionTotal}
        />
      ) : null}
    </View>
  );
}

function AiMessageBubbleComponent({
  assistantBubbleEdge,
  assistantAvatar,
  assistantDisplayName = null,
  generating = false,
  message,
  replyActionMode = 'continue',
  showAvatar = true,
  showUserAvatar = false,
  space,
  streaming = false,
  streamingIdentity = null,
  userProfile,
  disableShadow = false,
  displayName,
  editingMessageId = null,
  initialEditDraft = null,
  favorited = false,
  favoriteDisabledByGeneration = false,
  favoritePending = false,
  hideCitations = false,
  hideFooterActions = false,
  showActionButtons = false,
  pendingActionMessageId = null,
  thinkingExpected = false,
  thinkingDefaultExpanded = false,
  onCopy,
  onCancelEdit,
  onChangeEditDraft,
  onEditUser,
  onContinue,
  onContinueReply,
  onReplyToAssistant,
  onOpenCitation,
  onRegenerate,
  onSelectVersion,
  onToggleFavorite,
  onLongPress,
  onThinkingExpandedChange,
  onSubmitEdit,
  onAttachmentPress,
}: AiMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isFailed = message.status === 'failed';
  const content = message.content || (streaming ? '正在生成...' : isFailed ? message.errorMessage ?? '生成失败' : message.status === 'stopped' ? '已停止' : '');
  const showAssistantAvatar = !isUser && showAvatar && assistantAvatar?.avatarEnabled;
  const showUserAvatarHeader = isUser && showUserAvatar && userProfile?.avatarEnabled;
  const assistantHeaderVisible = !isUser && showAvatar && assistantAvatar?.avatarEnabled;
  const userHeaderVisible = isUser && showUserAvatar && userProfile?.avatarEnabled;
  const editing = editingMessageId === message.id;
  const actionPending = pendingActionMessageId === message.id;
  const canRegenerate = !isUser && !generating && !actionPending && (message.status === 'completed' || message.status === 'failed' || message.status === 'stopped');
  const messageTimestamp = message.completedAt ?? message.updatedAt ?? message.createdAt;
  const headerTime = formatAiFullMinute(messageTimestamp);
  const assistantName = assistantDisplayName?.trim() || 'AI';
  const userName = userProfile?.nickname?.trim() || '我';
  const assistantTerminal =
    message.status === 'completed' ||
    message.status === 'failed' ||
    message.status === 'stopped';
  const hasReasoningText = Boolean(message.reasoningText?.trim());
  const thinkingActive = Boolean(
    thinkingExpected && (message.status === 'generating' || message.status === 'queued'),
  );
  const waitingForFirstToken =
    generating && !message.content.trim() && !thinkingActive;
  const shouldRenderThinking =
    !isUser &&
    (thinkingActive ||
      (hasReasoningText &&
        (thinkingExpected ||
          (message.status !== 'generating' && message.status !== 'queued'))));
  const footerActionsVisible =
    !hideFooterActions &&
    ((showActionButtons && !isUser && assistantTerminal) ||
      message.versionTotal > 1);
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

  const assistantHasBody =
    !isUser &&
    (editing ||
      Boolean(content.trim()) ||
      waitingForFirstToken ||
      Boolean(message.errorMessage?.trim()) ||
      (!hideCitations && message.citations.length > 0));
  // User bubble is only rendered when there is visible text or the message is being edited.
  // Without this guard, sending an image with no text would show an empty bubble shell.
  const userHasBody = isUser && (editing || Boolean(displayContent));
  const shouldRenderBubble = userHasBody || assistantHasBody;
  const [editDraft, setEditDraft] = useState('');
  const [copyFeedbackVisible, setCopyFeedbackVisible] = useState(false);
  const copyFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (editing) {
      setEditDraft(initialEditDraft ?? displayContent);
    }
  }, [editing, displayContent, initialEditDraft]);

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
      <View style={[styles.messageStack, isUser ? styles.userStack : styles.assistantStack]}>
        {assistantHeaderVisible ? (
          <View style={[styles.headerRow, styles.assistantHeaderRow]}>
            {showAssistantAvatar ? (
              <View style={styles.avatar}>
                {assistantAvatar?.avatarUri ? (
                  <SecureImage contentFit="cover" space={space} style={styles.avatarImage} uri={assistantAvatar.avatarUri} />
                ) : (
                  <Ionicons color={aiLightColors.primary} name="sparkles-outline" size={metrics.iconSizeSm} />
                )}
              </View>
            ) : null}
            <View style={[styles.headerMeta, styles.assistantHeaderMeta]}>
              <Text numberOfLines={1} style={styles.headerName}>{assistantName}</Text>
              {headerTime ? <Text numberOfLines={1} style={styles.headerTime}>{headerTime}</Text> : null}
            </View>
          </View>
        ) : null}
        {userHeaderVisible ? (
          <View style={[styles.headerRow, styles.userHeaderRow]}>
            <View style={[styles.headerMeta, styles.userHeaderMeta]}>
              <Text numberOfLines={1} style={styles.headerName}>{userName}</Text>
              {headerTime ? <Text numberOfLines={1} style={styles.headerTime}>{headerTime}</Text> : null}
            </View>
            {showUserAvatarHeader ? (
              <View style={styles.avatar}>
                {userProfile?.avatarUri ? (
                  <SecureImage contentFit="cover" space={space} style={styles.avatarImage} uri={userProfile.avatarUri} />
                ) : (
                  <Ionicons color={aiLightColors.muted} name="person-outline" size={metrics.iconSizeSm} />
                )}
              </View>
            ) : null}
          </View>
        ) : null}
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
        {shouldRenderThinking ? (
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
                thinkingActive={thinkingActive}
              />
            ) : (
              <AiThinkingBlock
                completedAt={message.completedAt}
                createdAt={message.createdAt}
                defaultExpanded={thinkingDefaultExpanded}
                onExpandedChange={(expanded) => onThinkingExpandedChange?.(message.id, expanded)}
                reasoningText={message.reasoningText}
                status={message.status}
                thinkingActive={thinkingActive}
              />
            )}
          </View>
        ) : null}
        {copyFeedbackVisible ? <AiInlineFeedback message="已复制" tone="success" /> : null}
        {shouldRenderBubble ? (
          <Pressable
            accessibilityHint={editing ? undefined : '长按打开消息操作'}
            delayLongPress={500}
            onLongPress={
              editing || !onLongPress
                ? undefined
                : (event) =>
                    onLongPress(
                      message,
                      event.nativeEvent.pageX,
                      event.nativeEvent.pageY,
                    )
            }
            style={[
              styles.bubble,
              isUser
                ? styles.userBubble
                : [
                    styles.assistantBubble,
                    (assistantBubbleEdge === "first" ||
                      assistantBubbleEdge === "middle") &&
                      styles.assistantBubbleOpenBottom,
                    (assistantBubbleEdge === "middle" ||
                      assistantBubbleEdge === "last") &&
                      styles.assistantBubbleOpenTop,
                  ],
              isFailed && styles.failedBubble,
            ]}
          >
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
                {displayContent ? <Text selectable={false} style={[styles.content, styles.userText]}>{displayContent}</Text> : null}
              </View>
            ) : (
              <View
                onLayout={(event) => {
                  if (!isUser) {
                    setLatestAssistantBubbleContentWidth(
                      event.nativeEvent.layout.width,
                    );
                  }
                }}
                style={styles.assistantContentMeasure}
              >
                {streaming && streamingIdentity ? (
                  <AiStreamingMessageText identity={streamingIdentity} initialContent={message.content} />
                ) : waitingForFirstToken ? (
                  <AiTypingIndicator />
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
              </View>
            )}
            {!isUser && !hideCitations ? (
              <AiCitationList citations={message.citations} onOpenCitation={onOpenCitation} />
            ) : null}
          </Pressable>
        ) : null}
        {footerActionsVisible ? (
          <AiMessageFooterActions
            favoriteDisabledByGeneration={favoriteDisabledByGeneration}
            favorited={favorited}
            favoritePending={favoritePending}
            generating={generating}
            message={message}
            pendingActionMessageId={pendingActionMessageId}
            showActionButtons={showActionButtons}
            onCopy={(targetMessage) => {
              onCopy(targetMessage);
              setCopyFeedbackVisible(true);
              if (copyFeedbackTimeoutRef.current) {
                clearTimeout(copyFeedbackTimeoutRef.current);
              }
              copyFeedbackTimeoutRef.current = setTimeout(() => {
                setCopyFeedbackVisible(false);
                copyFeedbackTimeoutRef.current = null;
              }, 1400);
            }}
            onContinue={onContinue}
            onContinueReply={onContinueReply}
            onReplyToAssistant={onReplyToAssistant}
            onEditUser={onEditUser}
            onRegenerate={onRegenerate}
            onOpenCitation={onOpenCitation}
            replyActionMode={replyActionMode}
            onSelectVersion={onSelectVersion}
            onToggleFavorite={onToggleFavorite}
          />
        ) : null}
      </View>
    </View>
  );
}

function areAiMessageBubblePropsEqual(previous: AiMessageBubbleProps, next: AiMessageBubbleProps): boolean {
  return (
    previous.message === next.message &&
    previous.replyActionMode === next.replyActionMode &&
    previous.assistantBubbleEdge === next.assistantBubbleEdge &&
    previous.space === next.space &&
    previous.streaming === next.streaming &&
    previous.streamingIdentity?.generationId === next.streamingIdentity?.generationId &&
    previous.streamingIdentity?.messageId === next.streamingIdentity?.messageId &&
    previous.generating === next.generating &&
    previous.thinkingExpected === next.thinkingExpected &&
    previous.thinkingDefaultExpanded === next.thinkingDefaultExpanded &&
    previous.favorited === next.favorited &&
    previous.favoriteDisabledByGeneration === next.favoriteDisabledByGeneration &&
    previous.favoritePending === next.favoritePending &&
    previous.hideCitations === next.hideCitations &&
    previous.hideFooterActions === next.hideFooterActions &&
    previous.showActionButtons === next.showActionButtons &&
    previous.pendingActionMessageId === next.pendingActionMessageId &&
    previous.showAvatar === next.showAvatar &&
    previous.showUserAvatar === next.showUserAvatar &&
    previous.editingMessageId === next.editingMessageId &&
    previous.assistantDisplayName === next.assistantDisplayName &&
    previous.assistantAvatar?.avatarEnabled === next.assistantAvatar?.avatarEnabled &&
    previous.assistantAvatar?.avatarUri === next.assistantAvatar?.avatarUri &&
    previous.userProfile?.avatarEnabled === next.userProfile?.avatarEnabled &&
    previous.userProfile?.avatarUri === next.userProfile?.avatarUri &&
    previous.userProfile?.nickname === next.userProfile?.nickname
  );
}

export const AiMessageBubble = memo(AiMessageBubbleComponent, areAiMessageBubblePropsEqual);

const styles = StyleSheet.create({
  messageRow: {
    maxWidth: '100%',
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
  },
  messageStack: {
    gap: rhythm.microGap,
    maxWidth: '94%',
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
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: metrics.minTouchSize,
  },
  assistantHeaderRow: {
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
  },
  userHeaderRow: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  headerMeta: {
    gap: spacing[1],
    minWidth: 0,
  },
  assistantHeaderMeta: {
    alignItems: 'flex-start',
    flex: 1,
  },
  userHeaderMeta: {
    alignItems: 'flex-end',
    maxWidth: '78%',
  },
  headerName: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  headerTime: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  bubble: {
    gap: rhythm.cardContentGap,
    maxWidth: '100%',
    padding: spacing[3],
  },
  userBubble: {
    backgroundColor: aiLightColors.primary,
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
  assistantBubbleOpenBottom: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  assistantBubbleOpenTop: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
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
    color: aiLightColors.onDark,
  },
  assistantText: {
    color: aiLightColors.ink,
  },
  assistantContentMeasure: {
    alignSelf: 'stretch',
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
  continueReplyActionButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  continueReplyActionText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontStyle: 'italic',
    fontWeight: '600',
    textAlign: 'center',
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
