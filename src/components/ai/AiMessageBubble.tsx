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
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.content, isUser ? styles.userText : styles.assistantText]}>{content}</Text>
        {isUser ? (
          <Pressable accessibilityLabel="重写" accessibilityRole="button" onPress={() => onEditUser(message.id, message.content)} style={({ pressed }) => [styles.userActionButton, pressed && styles.pressed]}>
            <Ionicons color={colors.text.inverse} name="create-outline" size={15} />
          </Pressable>
        ) : (
          <>
            <AiThinkingBlock label={message.modelSnapshotJson.includes('reasoning') ? '思路' : '摘要'} reasoningText={message.reasoningText} />
            <AiCitationList citations={message.citations} onOpenCitation={onOpenCitation} />
            {canRegenerate ? (
              <Pressable accessibilityLabel="刷新回复" accessibilityRole="button" onPress={() => onRegenerate(message.id)} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                <Ionicons color={colors.primary.active} name="refresh-outline" size={16} />
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    gap: rhythm.cardContentGap,
    maxWidth: '88%',
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
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: rhythm.microGap,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  userActionButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderColor: colors.overlay.heroSurface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: 'center',
    opacity: 0.86,
    width: 28,
  },
  pressed: {
    opacity: 0.78,
  },
});
