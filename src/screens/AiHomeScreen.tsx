import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { listAiHistoryThreads } from '../ai/aiChatService';
import { listRecentMaterials } from '../ai/aiDocumentService';
import type { AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import type { AiDocumentRecord } from '../database/repositories/aiKnowledgeRepository';
import { layout, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

const primaryCardPatternImage = require('../../assets/backgrounds/japanese-fresh/elements/botanical-branch.png');

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
      backgroundVariant="aiChat"
      contentContainerStyle={styles.screenContent}
      footer={footer}
      headerDividerVisible={false}
      rightAction={(
        <Pressable accessibilityLabel="打开 AI 设置" accessibilityRole="button" onPress={onOpenProviderSettings} style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.ink} name="settings-outline" size={20} />
        </Pressable>
      )}
      scrollable
      subtitle={spaceLabel}
      title="AI 工作台"
    >
      {space === 'personal' ? (
        <View style={styles.hero}>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>私密空间</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.actionStack}>
        <Pressable accessibilityRole="button" onPress={onStartNormalChat} style={({ pressed }) => [styles.primaryChatCard, pressed && styles.pressed]}>
          <Image resizeMode="contain" source={primaryCardPatternImage} style={styles.primaryCardPattern} />
          <View style={styles.primaryIcon}>
            <Ionicons color={aiLightColors.onDark} name="chatbubble-ellipses-outline" size={34} />
          </View>
          <View style={styles.primaryCopy}>
            <Text style={styles.primaryTitle}>开始聊天</Text>
            <Text style={styles.primaryDescription}>直接开始一次新的对话</Text>
          </View>
          <View style={styles.primaryArrow}>
            <Ionicons color={aiLightColors.coralActive} name="chevron-forward" size={26} />
          </View>
        </Pressable>

        <View style={styles.secondaryActionRow}>
          <SecondaryAction
            description="带着 IP 资料聊"
            icon="albums-outline"
            onPress={onStartIpChat}
            title="问问某个 IP"
          />
          <SecondaryAction
            description="引用材料回答"
            icon="library-outline"
            onPress={onStartKnowledgeBase}
            title="连接知识库"
          />
        </View>
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

interface SecondaryActionProps {
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress: () => void;
}

function SecondaryAction({ description, icon, onPress, title }: SecondaryActionProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
      <View style={styles.secondaryIcon}>
        <Ionicons color={aiLightColors.coralActive} name={icon} size={20} />
      </View>
      <View style={styles.secondaryCopy}>
        <Text numberOfLines={1} style={styles.secondaryTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.secondaryDescription}>{description}</Text>
      </View>
      <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={19} />
    </Pressable>
  );
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
    gap: rhythm.screenSectionGap,
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
  pressed: {
    opacity: 0.78,
  },
  actionStack: {
    gap: rhythm.inlineGap,
  },
  primaryChatCard: {
    alignItems: 'center',
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.xxl,
    flexDirection: 'row',
    gap: spacing[5],
    minHeight: 142,
    overflow: 'hidden',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[6],
    position: 'relative',
  },
  primaryCardPattern: {
    height: 152,
    opacity: 0.1,
    position: 'absolute',
    right: -spacing[4],
    top: -spacing[1],
    width: 112,
  },
  primaryIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(250, 249, 245, 0.24)',
    borderRadius: radius.pill,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  primaryCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  primaryTitle: {
    ...typography.textStyles.cardTitle,
    color: aiLightColors.onDark,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 31,
  },
  primaryDescription: {
    ...typography.textStyles.body,
    color: 'rgba(250, 249, 245, 0.82)',
    fontSize: 15,
    lineHeight: 22,
  },
  primaryArrow: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: rhythm.compactGridGap,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 86,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  secondaryIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  secondaryCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  secondaryTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    fontSize: 14,
    lineHeight: 19,
  },
  secondaryDescription: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontSize: 11,
    lineHeight: 15,
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
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  sectionUnderline: {
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.pill,
    height: 3,
    width: 24,
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
