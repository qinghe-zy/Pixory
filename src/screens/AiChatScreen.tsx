import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import type { AiContextType } from '../ai/types';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiChatScreenProps {
  space: PixorySpace;
  contextType: AiContextType;
  contextTitle?: string;
  threadId?: number;
  onBack: () => void;
  onOpenSessionConfig: () => void;
  onOpenSource: (documentId: number, title: string) => void;
}

export function AiChatScreen({ space, contextType, contextTitle, threadId, onBack, onOpenSessionConfig, onOpenSource }: AiChatScreenProps) {
  const resolvedContextTitle = contextTitle ?? (contextType === 'ip' ? 'IP 对话' : contextType === 'knowledge_base' ? '知识库对话' : '普通聊天');
  const streamStatus = 'stream 准备中';
  const thinkingState = 'thinking 待生成';
  const citationsState = 'citations 将在命中材料后显示';
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      onBack={onBack}
      rightAction={
        <Pressable accessibilityRole="button" onPress={onOpenSessionConfig} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
          <Ionicons color={colors.primary.active} name="options-outline" size={18} />
          <Text style={styles.headerButtonText}>会话设置</Text>
        </Pressable>
      }
      scrollable
      subtitle={`${spaceLabel} · ${streamStatus}`}
      title={resolvedContextTitle}
    >
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>本地上下文</Text>
        <Text style={styles.noticeText}>当前会话会绑定 contextTitle、模型快照和引用片段；图片内容不会被读取或识别。</Text>
        {threadId != null ? <Text style={styles.meta}>Thread #{threadId}</Text> : null}
      </View>

      <View style={styles.messageList}>
        <View style={styles.assistantBubble}>
          <Text style={styles.assistantLabel}>{thinkingState}</Text>
          <Text style={styles.messageText}>配置模型与资料后，这里会显示流式回答、推理摘要和来源引用。</Text>
        </View>
        <View style={styles.citationPanel}>
          <View style={styles.citationHeader}>
            <Ionicons color={colors.primary.active} name="document-text-outline" size={18} />
            <Text style={styles.citationTitle}>引用来源</Text>
          </View>
          <Text style={styles.citationText}>{citationsState}</Text>
          <Pressable accessibilityRole="button" onPress={() => onOpenSource(0, '材料预览')} style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}>
            <Text style={styles.sourceButtonText}>打开材料预览</Text>
            <Ionicons color={colors.primary.active} name="chevron-forward" size={16} />
          </Pressable>
        </View>
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
  messageList: {
    gap: rhythm.listCardGap,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    maxWidth: '92%',
    padding: spacing[4],
  },
  assistantLabel: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  messageText: {
    ...typography.textStyles.body,
  },
  citationPanel: {
    backgroundColor: colors.background.secondary,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  citationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  citationTitle: {
    ...typography.textStyles.bodyStrong,
  },
  citationText: {
    ...typography.textStyles.caption,
  },
  sourceButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  sourceButtonText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
});
