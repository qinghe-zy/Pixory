import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors, aiLightDisplayFont } from '../components/ai/aiLightTheme';
import { listAiHistoryThreads } from '../ai/aiChatService';
import { listRecentMaterials } from '../ai/aiDocumentService';
import type { AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import type { AiDocumentRecord } from '../database/repositories/aiKnowledgeRepository';
import { layout, radius, rhythm, spacing, typography } from '../design/tokens';
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
    tint: aiLightColors.coral,
    icon: 'chatbubble-ellipses-outline',
    iconColor: aiLightColors.onDark,
  },
  {
    title: '问问某个 IP',
    tint: aiLightColors.card,
    icon: 'albums-outline',
    iconColor: aiLightColors.coralActive,
  },
  {
    title: '连接知识库',
    tint: aiLightColors.surface,
    icon: 'library-outline',
    iconColor: aiLightColors.coralActive,
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
  const startHandlers = [onStartNormalChat, onStartIpChat, onStartKnowledgeBase];
  const [recentThreads, setRecentThreads] = useState<AiThreadHistoryItem[]>([]);
  const [recentMaterials, setRecentMaterials] = useState<AiDocumentRecord[]>([]);
  const spaceLabel = space === 'personal' ? '私密空间' : undefined;

  useEffect(() => {
    let isMounted = true;
    void listAiHistoryThreads({ limit: 3, space }).then((items) => {
      if (isMounted) {
        setRecentThreads(items);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [space]);

  useEffect(() => {
    let isMounted = true;
    void listRecentMaterials(space).then((items) => {
      if (isMounted) {
        setRecentMaterials(items);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [space]);

  return (
    <AiLightScaffold
      contentContainerStyle={styles.screenContent}
      footer={footer}
      rightAction={(
        <Pressable accessibilityLabel="打开 AI 设置" accessibilityRole="button" onPress={onOpenProviderSettings} style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.ink} name="settings-outline" size={20} />
        </Pressable>
      )}
      scrollable
      subtitle={spaceLabel}
      title="AI 工作台"
    >
      <View style={styles.hero}>
        {space === 'personal' ? <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>私密空间</Text>
        </View> : null}
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
        <SectionTitle actionLabel="管理" title="最近材料" onPress={onOpenMaterials} />
        <Pressable accessibilityRole="button" onPress={onOpenMaterials} style={({ pressed }) => [styles.recentCard, styles.materialCard, pressed && styles.pressed]}>
          <View style={styles.threadIcon}>
            <Ionicons color={aiLightColors.coralActive} name="document-text-outline" size={24} />
          </View>
          <View style={styles.threadCopy}>
            <Text numberOfLines={1} style={styles.threadTitle}>
              {recentMaterials[0]?.title ?? '知识库材料'}
            </Text>
            <Text numberOfLines={2} style={styles.threadDescription}>
              {recentMaterials.length ? recentMaterials.slice(0, 3).map((item) => item.title).join(' / ') : '导入 TXT、Markdown、PDF、DOCX 或从 IP 生成材料'}
            </Text>
          </View>
          <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={20} />
        </Pressable>
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
                <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={20} />
              </Pressable>
            ))
          ) : (
            <Pressable accessibilityRole="button" onPress={onStartNormalChat} style={({ pressed }) => [styles.emptyRecentRow, pressed && styles.pressed]}>
              <View style={styles.threadIcon}>
                <Ionicons color={aiLightColors.coralActive} name="chatbubble-ellipses-outline" size={24} />
              </View>
              <View style={styles.threadCopy}>
                <Text style={styles.threadTitle}>普通聊天</Text>
                <Text style={styles.threadDescription}>暂无最近会话</Text>
              </View>
              <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={20} />
            </Pressable>
          )}
        </View>
      </View>
    </AiLightScaffold>
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
          <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={18} />
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
    return aiLightColors.coralActive;
  }
  if (contextType === 'knowledge_base') {
    return aiLightColors.coralActive;
  }
  return aiLightColors.coralActive;
}

function backgroundForContext(contextType: AiThreadHistoryItem['contextType']) {
  if (contextType === 'ip') {
    return aiLightColors.card;
  }
  if (contextType === 'knowledge_base') {
    return aiLightColors.surface;
  }
  return aiLightColors.canvas;
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
    gap: rhythm.entryCardGap,
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  hero: {
    gap: rhythm.cardContentGap,
  },
  topAction: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
  },
  statusDot: {
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  statusText: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '500',
  },
  entryRow: {
    flexDirection: 'row',
    gap: rhythm.compactGridGap,
  },
  entry: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 116,
    borderRadius: radius.md,
    padding: spacing[3],
  },
  pressed: {
    opacity: 0.78,
  },
  entryIcon: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(250, 249, 245, 0.7)',
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
    color: aiLightColors.ink,
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  entryArrow: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
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
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontWeight: '400',
    fontSize: 20,
    lineHeight: 28,
  },
  sectionUnderline: {
    backgroundColor: aiLightColors.coral,
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
    color: aiLightColors.muted,
  },
  recentCard: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: spacing[4],
  },
  materialCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 84,
    paddingVertical: spacing[3],
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
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  threadIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
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
    color: aiLightColors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  threadDescription: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  threadTime: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedSoft,
  },
});
