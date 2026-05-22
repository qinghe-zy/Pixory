import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SecureImage } from '../SecureImage';
import type { AiMessageWithCitations } from '../../ai/aiChatService';
import type { AiCitationRecord } from '../../ai/types';
import type { PixorySpace } from '../../database';
import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { AiCitationList } from './AiCitationList';
import { aiLightColors } from './aiLightTheme';
import { AiThinkingBlock } from './AiThinkingBlock';

interface AiMessageBubbleProps {
  message: AiMessageWithCitations;
  assistantAvatar?: {
    avatarEnabled: boolean;
    avatarUri: string | null;
  };
  space: PixorySpace;
  streaming?: boolean;
  generating?: boolean;
  onCopy: (message: AiMessageWithCitations) => void;
  onEditUser: (messageId: string, content: string) => void;
  onRegenerate: (messageId: string) => void;
  onOpenCitation: (citation: AiCitationRecord) => void;
}

export function AiMessageBubble({
  assistantAvatar,
  generating = false,
  message,
  space,
  streaming = false,
  onCopy,
  onEditUser,
  onOpenCitation,
  onRegenerate,
}: AiMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isFailed = message.status === 'failed';
  const content = message.content || (streaming ? '正在生成...' : isFailed ? message.errorMessage ?? '生成失败' : message.status === 'stopped' ? '已停止' : '');
  const showAssistantAvatar = !isUser && assistantAvatar?.avatarEnabled;
  const canCopy = Boolean((message.content || message.errorMessage || '').trim());
  const canEdit = isUser && !generating;
  const canRegenerate = !isUser && !generating && (message.status === 'completed' || message.status === 'failed' || message.status === 'stopped');

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
            <AiThinkingBlock label={message.modelSnapshotJson.includes('reasoning') ? '思路' : '摘要'} reasoningText={message.reasoningText} />
          </View>
        ) : null}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.content, isUser ? styles.userText : styles.assistantText]}>{content}</Text>
          {!isUser ? <AiCitationList citations={message.citations} onOpenCitation={onOpenCitation} /> : null}
        </View>
        <View style={[styles.actionRow, isUser ? styles.userActionRow : styles.assistantActionRow]}>
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
        </View>
      </View>
    </View>
  );
}

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
  thinkingWrap: {
    maxWidth: '100%',
    paddingHorizontal: spacing[1],
  },
  actionRow: {
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
  disabledAction: {
    opacity: 0.36,
  },
  pressed: {
    opacity: 0.78,
  },
});
