import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AiThreadHistoryItem } from '../../database/repositories/aiThreadRepository';
import { metrics, radius, rhythm, shadows, spacing, typography } from '../../design/tokens';
import { formatAiHistoryMinute } from '../../utils/aiTimeFormatters';
import { aiLightColors } from './aiLightTheme';

interface AiComprehensiveRecordDrawerProps {
  visible: boolean;
  recentThreads: AiThreadHistoryItem[];
  activeThreadId?: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onOpenHistory: () => void;
  onOpenThread: (thread: AiThreadHistoryItem) => void;
}

export function AiComprehensiveRecordDrawer({
  visible,
  recentThreads,
  activeThreadId = null,
  onClose,
  onNewChat,
  onOpenHistory,
  onOpenThread,
}: AiComprehensiveRecordDrawerProps) {
  if (!visible) {
    return null;
  }

  const visibleRecents = recentThreads.filter((thread) => thread.id !== activeThreadId).slice(0, 15);

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Pressable accessibilityLabel="关闭综合记录" accessibilityRole="button" onPress={onClose} style={styles.scrim} />
      <View style={styles.drawer}>
        <Text style={styles.brand}>Pixory AI</Text>
        <View style={styles.primaryActions}>
          <DrawerAction icon="add-circle-outline" label="新聊天" onPress={onNewChat} tone="accent" />
          <DrawerAction icon="chatbubbles-outline" label="历史记录" onPress={onOpenHistory} />
        </View>
        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>最近</Text>
        <ScrollView contentContainerStyle={styles.recentList} showsVerticalScrollIndicator={false} style={styles.recentScroller}>
          {visibleRecents.length ? (
            visibleRecents.map((thread) => (
              <Pressable
                accessibilityRole="button"
                key={thread.id}
                onPress={() => onOpenThread(thread)}
                style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={styles.recentTitle}>
                  {thread.title}
                </Text>
                <Text numberOfLines={1} style={styles.recentMeta}>
                  {thread.lastMessagePreview ?? `上次聊天 ${formatAiHistoryMinute(thread.lastMessageAt ?? thread.updatedAt)}`}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyText}>暂无最近会话</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function DrawerAction({
  icon,
  label,
  onPress,
  tone = 'default',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'accent';
}) {
  const color = tone === 'accent' ? aiLightColors.coralActive : aiLightColors.ink;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
      <Ionicons color={color} name={icon} size={metrics.iconSizeMd} />
      <Text style={[styles.actionLabel, tone === 'accent' && styles.actionLabelAccent]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 20,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24, 23, 21, 0.28)',
  },
  drawer: {
    backgroundColor: aiLightColors.canvas,
    borderBottomRightRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    flexShrink: 1,
    gap: rhythm.screenSectionGap,
    maxHeight: '100%',
    paddingBottom: spacing[5],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[10],
    width: '86%',
    ...shadows.floating,
  },
  brand: {
    ...typography.textStyles.pageTitle,
    color: aiLightColors.ink,
  },
  primaryActions: {
    gap: rhythm.cardContentGap,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: metrics.minTouchSize,
  },
  actionLabel: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  actionLabelAccent: {
    color: aiLightColors.coralActive,
    fontWeight: '700',
  },
  divider: {
    backgroundColor: aiLightColors.hairline,
    height: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.muted,
  },
  recentScroller: {
    flex: 1,
  },
  recentList: {
    gap: rhythm.inlineGap,
    paddingBottom: spacing[8],
  },
  recentRow: {
    borderRadius: radius.md,
    gap: rhythm.microGap,
    paddingVertical: spacing[1],
  },
  recentTitle: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  recentMeta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  emptyText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  pressed: {
    opacity: 0.72,
  },
});
