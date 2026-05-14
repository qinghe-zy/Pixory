import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '../components/AppScreen';
import { listRecentMaterials } from '../ai/aiDocumentService';
import { listAiHistoryThreads } from '../ai/aiChatService';
import type { AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import type { AiDocumentRecord } from '../database/repositories/aiKnowledgeRepository';
import { colors, layout, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiHomeScreenProps {
  footer?: ReactNode;
  space: PixorySpace;
  onStartNormalChat: () => void;
  onStartIpChat: () => void;
  onStartKnowledgeBase: () => void;
  onOpenHistory: () => void;
  onOpenThread: (thread: AiThreadHistoryItem) => void;
  onOpenMaterials: () => void;
  onOpenProviderSettings: () => void;
}

const START_ENTRIES = [
  {
    title: '开始普通聊天',
    tint: colors.primary.weak,
    icon: 'chatbubble-ellipses-outline',
    iconColor: colors.primary.active,
  },
  {
    title: '问问某个 IP',
    tint: colors.support.lilac100,
    icon: 'albums-outline',
    iconColor: colors.support.lilac300,
  },
  {
    title: '连接知识库',
    tint: colors.support.sky100,
    icon: 'library-outline',
    iconColor: colors.support.sky300,
  },
] as const;

export function AiHomeScreen({
  footer,
  space,
  onStartNormalChat,
  onStartIpChat,
  onStartKnowledgeBase,
  onOpenHistory,
  onOpenThread,
  onOpenMaterials,
  onOpenProviderSettings,
}: AiHomeScreenProps) {
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const startHandlers = [onStartNormalChat, onStartIpChat, onStartKnowledgeBase];
  const [recentMaterials, setRecentMaterials] = useState<AiDocumentRecord[]>([]);
  const [recentThreads, setRecentThreads] = useState<AiThreadHistoryItem[]>([]);

  useEffect(() => {
    let isMounted = true;
    void listRecentMaterials(space).then((items) => {
      if (isMounted) {
        setRecentMaterials(items);
      }
    });
    void listAiHistoryThreads({ limit: 3, space }).then((items) => {
      if (isMounted) {
        setRecentThreads(items);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [space]);

  return (
    <AppScreen
      backgroundVariant="search"
      contentStyle={styles.screenContent}
      footer={footer}
      scrollable
    >
      <View style={styles.hero}>
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>P</Text>
            </View>
            <Text style={styles.brandName}>Pixory</Text>
          </View>
          <Pressable accessibilityLabel="打开 AI 设置" accessibilityRole="button" onPress={onOpenProviderSettings} style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}>
            <Ionicons color={colors.text.heading} name="settings-outline" size={22} />
          </Pressable>
        </View>

        <View style={styles.heroBody}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>AI 工作台</Text>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{spaceLabel}</Text>
            </View>
          </View>

          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.heroVisual}>
            <View style={styles.orbitWide} />
            <View style={styles.orbitTall} />
            <View style={styles.cube}>
              <Text style={styles.cubeText}>AI</Text>
            </View>
            <View style={styles.sparkSmall}>
              <Ionicons color={colors.primary.light} name="sparkles" size={13} />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.entryRow}>
        {START_ENTRIES.map((entry, index) => (
          <Pressable
            accessibilityRole="button"
            key={entry.title}
            onPress={startHandlers[index]}
            style={({ pressed }) => [styles.entry, { backgroundColor: entry.tint }, pressed && styles.pressed]}
          >
            <View style={styles.entryIcon}>
              <Ionicons color={entry.iconColor} name={entry.icon} size={30} />
            </View>
            <View style={styles.entryFooter}>
              <Text numberOfLines={2} style={styles.entryTitle}>{entry.title}</Text>
              <View style={styles.entryArrow}>
                <Ionicons color={entry.iconColor} name="chevron-forward" size={20} />
              </View>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <SectionTitle actionLabel="查看全部" title="最近继续" onPress={onOpenHistory} />
        <View style={styles.recentCard}>
          {recentThreads.length ? (
            recentThreads.map((thread, index) => (
              <Pressable
                accessibilityRole="button"
                key={thread.id}
                onPress={() => onOpenThread(thread)}
                style={({ pressed }) => [styles.threadRow, index > 0 && styles.threadDivider, pressed && styles.pressed]}
              >
                <View style={[styles.threadIcon, { backgroundColor: backgroundForContext(thread.contextType) }]}>
                  <Ionicons color={colorForContext(thread.contextType)} name={iconForContext(thread.contextType)} size={24} />
                </View>
                <View style={styles.threadCopy}>
                  <Text numberOfLines={1} style={styles.threadTitle}>
                    {thread.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.threadDescription}>
                    {thread.lastMessagePreview ?? '继续'}
                  </Text>
                </View>
                <Text style={styles.threadTime}>{formatRecentTime(thread.updatedAt)}</Text>
                <Ionicons color={colors.text.tertiary} name="chevron-forward" size={20} />
              </Pressable>
            ))
          ) : (
            <Pressable accessibilityRole="button" onPress={onStartNormalChat} style={({ pressed }) => [styles.emptyRecentRow, pressed && styles.pressed]}>
              <View style={styles.threadIcon}>
                <Ionicons color={colors.primary.active} name="chatbubble-ellipses-outline" size={24} />
              </View>
              <View style={styles.threadCopy}>
                <Text style={styles.threadTitle}>普通聊天</Text>
                <Text style={styles.threadDescription}>暂无最近会话</Text>
              </View>
              <Ionicons color={colors.text.tertiary} name="chevron-forward" size={20} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle title="知识库与资料" />
        <Pressable accessibilityRole="button" onPress={onOpenMaterials} style={({ pressed }) => [styles.materialCard, pressed && styles.pressed]}>
          <View style={styles.materialMain}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.materialArt}>
              <View style={styles.folderBack} />
              <View style={styles.folderFront}>
                <Ionicons color={colors.primary.active} name="document-text-outline" size={32} />
                <View style={styles.materialPlus}>
                  <Ionicons color={colors.text.inverse} name="add" size={22} />
                </View>
              </View>
            </View>
            <View style={styles.materialCopy}>
              <Text style={styles.materialTitle}>给 AI 添加资料</Text>
            </View>
            <View style={styles.materialArrow}>
              <Ionicons color={colors.primary.active} name="arrow-forward" size={24} />
            </View>
          </View>

          <View style={styles.materialRecent}>
            <Ionicons color={colors.text.tertiary} name="time-outline" size={18} />
            <Text numberOfLines={1} style={styles.materialRecentText}>
              {recentMaterials.length ? `最近添加：${recentMaterials.slice(0, 3).map((item) => item.title).join(' / ')}` : '暂无资料'}
            </Text>
            <Ionicons color={colors.text.tertiary} name="chevron-forward" size={18} />
          </View>
        </Pressable>
      </View>

    </AppScreen>
  );
}

interface SectionTitleProps {
  actionLabel?: string;
  title: string;
  onPress?: () => void;
}

function SectionTitle({ actionLabel, title, onPress }: SectionTitleProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleBlock}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionUnderline} />
      </View>
      {actionLabel && onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons color={colors.text.tertiary} name="chevron-forward" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

function iconForContext(contextType: AiThreadHistoryItem['contextType']): keyof typeof Ionicons.glyphMap {
  if (contextType === 'ip') {
    return 'albums-outline';
  }
  if (contextType === 'knowledge_base') {
    return 'library-outline';
  }
  return 'chatbubble-ellipses-outline';
}

function colorForContext(contextType: AiThreadHistoryItem['contextType']) {
  if (contextType === 'ip') {
    return colors.support.lilac300;
  }
  if (contextType === 'knowledge_base') {
    return colors.primary.active;
  }
  return colors.primary.active;
}

function backgroundForContext(contextType: AiThreadHistoryItem['contextType']) {
  if (contextType === 'ip') {
    return colors.support.lilac100;
  }
  if (contextType === 'knowledge_base') {
    return colors.primary.weak;
  }
  return colors.background.tag;
}

function formatRecentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

const styles = StyleSheet.create({
  screenContent: {
    gap: rhythm.screenSectionGap,
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  hero: {
    gap: rhythm.screenSectionGap,
    paddingTop: spacing[5],
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: colors.primary.active,
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  brandMarkText: {
    color: colors.text.inverse,
    fontFamily: typography.family.brand,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 28,
  },
  brandName: {
    ...typography.textStyles.sectionTitle,
    fontSize: 22,
    lineHeight: 28,
  },
  topAction: {
    alignItems: 'center',
    backgroundColor: colors.overlay.softSurface,
    borderRadius: radius.pill,
    height: 52,
    justifyContent: 'center',
    width: 52,
    ...shadows.xs,
  },
  heroBody: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 174,
  },
  heroCopy: {
    flex: 1,
    gap: rhythm.cardContentGap,
    paddingRight: spacing[2],
  },
  heroTitle: {
    ...typography.textStyles.brandLogo,
    fontSize: 42,
    lineHeight: 50,
  },
  heroText: {
    ...typography.textStyles.body,
    color: colors.text.secondary,
    fontSize: 15,
    lineHeight: 22,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.overlay.softSurface,
    borderColor: colors.primary.light,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
  },
  statusDot: {
    backgroundColor: colors.primary.active,
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  statusText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '500',
  },
  heroVisual: {
    alignItems: 'center',
    height: 150,
    justifyContent: 'center',
    width: 128,
  },
  orbitWide: {
    borderColor: colors.support.sky300,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 54,
    opacity: 0.5,
    position: 'absolute',
    transform: [{ rotate: '-16deg' }],
    width: 124,
  },
  orbitTall: {
    borderColor: colors.primary.light,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 102,
    opacity: 0.35,
    position: 'absolute',
    transform: [{ rotate: '64deg' }],
    width: 52,
  },
  cube: {
    alignItems: 'center',
    backgroundColor: colors.support.sky100,
    borderColor: colors.background.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    height: 82,
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
    width: 82,
    ...shadows.sm,
  },
  cubeText: {
    color: colors.primary.active,
    fontFamily: typography.family.display,
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
  },
  sparkSmall: {
    position: 'absolute',
    right: spacing[1],
    top: spacing[1],
  },
  entryRow: {
    flexDirection: 'row',
    gap: rhythm.compactGridGap,
  },
  entry: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 128,
    borderRadius: radius.md,
    padding: spacing[3],
    ...shadows.xs,
  },
  pressed: {
    opacity: 0.78,
  },
  entryIcon: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.overlay.softSurface,
    borderRadius: radius.md,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  entryFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: rhythm.microGap,
    justifyContent: 'space-between',
  },
  entryTitle: {
    ...typography.textStyles.bodyStrong,
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  entryArrow: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
    ...shadows.xs,
  },
  section: {
    gap: rhythm.cardContentGap,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitleBlock: {
    gap: rhythm.microGap,
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
    fontSize: 20,
    lineHeight: 28,
  },
  sectionUnderline: {
    backgroundColor: colors.primary.active,
    borderRadius: radius.pill,
    height: 4,
    width: 26,
  },
  sectionAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingLeft: spacing[2],
    paddingVertical: spacing[1],
  },
  sectionActionText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  recentCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: spacing[4],
    ...shadows.xs,
  },
  threadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 76,
  },
  emptyRecentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 84,
  },
  threadDivider: {
    borderTopColor: colors.border.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  threadIcon: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  threadCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  threadTitle: {
    ...typography.textStyles.bodyStrong,
    fontSize: 16,
    lineHeight: 22,
  },
  threadDescription: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  threadTime: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
  },
  materialCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
    ...shadows.xs,
  },
  materialMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 110,
  },
  materialArt: {
    height: 96,
    width: 112,
  },
  folderBack: {
    backgroundColor: colors.support.sky100,
    borderRadius: radius.sm,
    height: 54,
    left: spacing[3],
    position: 'absolute',
    top: spacing[1],
    transform: [{ rotate: '-8deg' }],
    width: 40,
  },
  folderFront: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.lg,
    bottom: 0,
    height: 70,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    width: 88,
    ...shadows.sm,
  },
  materialPlus: {
    alignItems: 'center',
    backgroundColor: colors.primary.active,
    borderRadius: radius.pill,
    bottom: -8,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    right: -8,
    width: 38,
  },
  materialCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  materialTitle: {
    ...typography.textStyles.sectionTitle,
    fontSize: 18,
    lineHeight: 25,
  },
  materialArrow: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    justifyContent: 'center',
    width: 52,
    ...shadows.xs,
  },
  materialRecent: {
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 48,
    paddingHorizontal: spacing[3],
  },
  materialRecentText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    flex: 1,
  },
});
