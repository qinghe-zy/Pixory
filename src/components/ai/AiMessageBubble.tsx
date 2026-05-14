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
  onRetry: (messageId: string) => void;
}

export function AiMessageBubble({ message, streaming = false, onOpenCitation, onRetry }: AiMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isFailed = message.status === 'failed';
  const content = message.content || (streaming ? '正在生成...' : isFailed ? message.errorMessage ?? '生成失败' : '');

  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.content, isUser ? styles.userText : styles.assistantText]}>{content}</Text>
        {!isUser ? (
          <>
            <AiThinkingBlock label={message.modelSnapshotJson.includes('reasoning') ? '思考过程' : '思考摘要'} reasoningText={message.reasoningText} />
            <AiCitationList citations={message.citations} onOpenCitation={onOpenCitation} />
            {streaming ? <Text style={styles.meta}>stream · thinking</Text> : null}
            {isFailed ? (
              <Pressable accessibilityRole="button" onPress={() => onRetry(message.id)} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                <Ionicons color={colors.primary.active} name="refresh-outline" size={16} />
                <Text style={styles.retryText}>重试</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
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
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
  meta: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
  retryButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  pressed: {
    opacity: 0.78,
  },
  retryText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
});
