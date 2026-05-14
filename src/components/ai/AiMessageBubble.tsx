import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AiMessageWithCitations } from '../../ai/aiChatService';
import type { AiCitationRecord } from '../../ai/types';
import { colors, radius, rhythm, spacing, typography } from '../../design/tokens';
import { AiCitationList } from './AiCitationList';
import { AiThinkingBlock } from './AiThinkingBlock';

interface AiMessageBubbleProps {
  message: AiMessageWithCitations;
  streaming?: boolean;
  onOpenCitation: (citation: AiCitationRecord) => void;
  onEditUser: (messageId: string, content: string) => void;
  onRegenerate: (messageId: string) => void;
}

export function AiMessageBubble({ message, streaming = false, onEditUser, onOpenCitation, onRegenerate }: AiMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isFailed = message.status === 'failed';
  const canRegenerate = !isUser && !streaming && (message.status === 'completed' || message.status === 'failed' || message.status === 'stopped');
  const content = message.content || (streaming ? '正在生成...' : isFailed ? message.errorMessage ?? '生成失败' : message.status === 'stopped' ? '已停止' : '');

  return (
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
      {isUser ? (
        <View style={styles.userActionRow}>
          <Pressable accessibilityLabel="重写" accessibilityRole="button" onPress={() => onEditUser(message.id, message.content)} style={({ pressed }) => [styles.messageActionButton, pressed && styles.pressed]}>
            <Ionicons color={colors.primary.active} name="create-outline" size={15} />
          </Pressable>
        </View>
      ) : canRegenerate ? (
        <View style={styles.assistantActionRow}>
          <Pressable accessibilityLabel="刷新回复" accessibilityRole="button" onPress={() => onRegenerate(message.id)} style={({ pressed }) => [styles.messageActionButton, pressed && styles.pressed]}>
            <Ionicons color={colors.primary.active} name="refresh-outline" size={16} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  bubble: {
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  userBubble: {
    backgroundColor: colors.primary.default,
    borderRadius: radius.lg,
    borderTopRightRadius: radius.sm,
  },
  assistantBubble: {
    backgroundColor: colors.overlay.softSurface,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
  },
  content: {
    ...typography.textStyles.body,
  },
  userText: {
    color: colors.text.inverse,
  },
  assistantText: {
    color: colors.text.body,
  },
  thinkingWrap: {
    maxWidth: '100%',
    paddingHorizontal: spacing[1],
  },
  userActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: spacing[1],
  },
  assistantActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingLeft: spacing[1],
  },
  messageActionButton: {
    alignItems: 'center',
    backgroundColor: colors.overlay.softSurface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  pressed: {
    opacity: 0.78,
  },
});
