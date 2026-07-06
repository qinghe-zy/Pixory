import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listAiHomeThreads, type AiHomeThreadItem } from '../ai/aiChatService';
import { listRoleCards } from '../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../ai/types';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { SecureImage } from '../components/SecureImage';
import { colors, layout, metrics, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';
import { formatAiFullMinute } from '../utils/aiTimeFormatters';

const primaryCardPatternImage = require('../../assets/backgrounds/japanese-fresh/elements/botanical-branch.png');

const HOME_THREAD_LIMIT = 30;
const RECENT_CHAT_VISIBLE_ROWS = 4;
const RECENT_CHAT_ROW_HEIGHT = 72;

interface AiHomeScreenProps {
  footer?: ReactNode;
  space: PixorySpace;
  onStartNormalChat: () => void;
  onOpenRoleLibrary: () => void;
  onOpenProviderSettings: () => void;
  onOpenIpChatPicker: () => void;
  onOpenKnowledgeBase: () => void;
  onOpenGlobalMaterials: () => void;
  onOpenHistory: () => void;
  onOpenThread: (thread: AiHomeThreadItem) => void;
  onStartChatWithRole: (roleCardId: string) => void;
}

interface RoleShortcut {
  avatarUri: string;
  name: string;
  roleCardId: string;
}

export function AiHomeScreen({
  footer,
  space,
  onStartNormalChat,
  onOpenRoleLibrary,
  onOpenProviderSettings,
  onOpenIpChatPicker,
  onOpenKnowledgeBase,
  onOpenGlobalMaterials,
  onOpenHistory,
  onOpenThread,
  onStartChatWithRole,
}: AiHomeScreenProps) {
  const [loadedThreads, setLoadedThreads] = useState<{ space: PixorySpace; threads: AiHomeThreadItem[] }>({ space, threads: [] });
  const [loadedRoleCards, setLoadedRoleCards] = useState<{ space: PixorySpace; roleCards: AiRoleCardRecord[] }>({ space, roleCards: [] });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const threads = loadedThreads.space === space ? loadedThreads.threads : [];
  const roleCards = loadedRoleCards.space === space ? loadedRoleCards.roleCards : [];
  const spaceLabel = space === 'personal' ? '私密空间 · 本地保存对话、资料与角色' : '普通空间 · 本地保存对话、资料与角色';

  useEffect(() => {
    let isMounted = true;
    setErrorMessage(null);
    void listAiHomeThreads({ limit: HOME_THREAD_LIMIT, space })
      .then((nextThreads) => {
        if (isMounted) {
          setLoadedThreads({ space, threads: nextThreads });
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : '读取 AI 工作台失败');
        }
      });
    return () => {
      isMounted = false;
    };
  }, [space]);

  useEffect(() => {
    let isMounted = true;
    void listRoleCards(space)
      .then((nextRoleCards) => {
        if (isMounted) {
          setLoadedRoleCards({ space, roleCards: nextRoleCards });
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : '读取角色库失败');
        }
      });
    return () => {
      isMounted = false;
    };
  }, [space]);

  const roleShortcuts = useMemo(() => buildRoleLibraryShortcuts(roleCards), [roleCards]);

  return (
    <AiLightScaffold
      backgroundVariant="aiChat"
      bodyStyle={styles.homeBody}
      contentContainerStyle={styles.screenContent}
      errorMessage={errorMessage}
      footer={footer}
      headerDividerVisible={false}
      rightAction={(
        <Pressable accessibilityLabel="打开 AI 设置" accessibilityRole="button" onPress={onOpenProviderSettings} style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.ink} name="settings-outline" size={metrics.iconSizeMd} />
        </Pressable>
      )}
      scrollable
      subtitle={spaceLabel}
      title="AI 工作台"
    >
      <View style={styles.mainStack}>
        <Pressable accessibilityRole="button" onPress={onStartNormalChat} style={({ pressed }) => [styles.primaryChatCard, pressed && styles.pressed]}>
          <Image resizeMode="contain" source={primaryCardPatternImage} style={styles.primaryCardPattern} />
          <View style={styles.primaryIcon}>
            <Ionicons color={aiLightColors.onDark} name="chatbubble-ellipses-outline" size={26} />
          </View>
          <View style={styles.primaryCopy}>
            <Text style={styles.primaryTitle}>开始聊天</Text>
            <Text style={styles.primaryDescription}>直接开始一次新的对话</Text>
          </View>
          <View style={styles.primaryArrow}>
            <Ionicons color={aiLightColors.primaryActive} name="chevron-forward" size={22} />
          </View>
        </Pressable>

        <View style={styles.roleRailWrap}>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={styles.roleRailScroll} contentContainerStyle={styles.roleRailContent}>
            {roleShortcuts.length ? (
              roleShortcuts.map((role) => (
                <Pressable
                  accessibilityLabel={`使用角色 ${role.name} 开始聊天`}
                  accessibilityRole="button"
                  key={role.roleCardId}
                  onPress={() => onStartChatWithRole(role.roleCardId)}
                  style={({ pressed }) => [styles.roleShortcut, pressed && styles.pressed]}
                >
                  <SecureImage contentFit="cover" space={space} style={styles.roleAvatarImage} uri={role.avatarUri} />
                  <Text numberOfLines={1} style={styles.roleName}>{role.name}</Text>
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyRoleHint}>
                <Ionicons color={aiLightColors.primaryActive} name="person-circle-outline" size={metrics.iconSizeMd} />
                <Text style={styles.emptyRoleText}>有头像的角色会显示在这里</Text>
              </View>
            )}
          </ScrollView>
          <Pressable accessibilityLabel="打开角色库" accessibilityRole="button" onPress={onOpenRoleLibrary} style={({ pressed }) => [styles.roleLibraryButton, pressed && styles.pressed]}>
            <Ionicons color={aiLightColors.primaryActive} name="people-outline" size={metrics.iconSizeSm} />
            <Text style={styles.roleLibraryText}>角色库</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle actionLabel="全部" title="最近聊天" onPress={onOpenHistory} />
        <View style={[styles.recentChatPanel, threads.length ? styles.recentChatPanelFilled : styles.recentChatPanelEmpty]}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={threads.length > RECENT_CHAT_VISIBLE_ROWS} style={styles.recentChatScroll}>
            {threads.length ? (
              threads.map((thread, index) => (
                <Pressable
                  accessibilityLabel={`打开最近聊天 ${thread.title}`}
                  accessibilityRole="button"
                  key={thread.id}
                  onPress={() => onOpenThread(thread)}
                  style={({ pressed }) => [styles.threadRow, index > 0 && styles.threadDivider, pressed && styles.pressed]}
                >
                  <ThreadAvatar thread={thread} space={space} />
                  <View style={styles.threadCopy}>
                    <View style={styles.threadTitleRow}>
                      <Text numberOfLines={1} style={styles.threadTitle}>{thread.title}</Text>
                    </View>
                    <View style={styles.threadMetaRow}>
                      <Text numberOfLines={1} style={styles.threadDescription}>
                        {thread.lastMessagePreview || labelForContext(thread)}
                      </Text>
                      <Text numberOfLines={1} style={styles.threadTime}>
                        {formatAiHomeFullMinute(thread.lastMessageAt ?? thread.updatedAt)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={metrics.iconSizeSm} />
                </Pressable>
              ))
            ) : (
              <Pressable accessibilityRole="button" onPress={onStartNormalChat} style={({ pressed }) => [styles.emptyRecentRow, pressed && styles.pressed]}>
                <View style={styles.threadIcon}>
                  <Ionicons color={aiLightColors.primaryActive} name="chatbubble-ellipses-outline" size={metrics.iconSizeMd} />
                </View>
                <View style={styles.threadCopy}>
                  <Text style={styles.threadTitle}>还没有最近聊天</Text>
                  <Text style={styles.threadDescription}>开始一次普通聊天后，这里会显示记录。</Text>
                </View>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>

      <View style={styles.quickGrid}>
        <QuickEntry icon="albums-outline" label="选择 IP 开聊" meta="从角色或 IP 开始对话" onPress={onOpenIpChatPicker} tone="primary" />
        <QuickEntry icon="document-text-outline" label="资料库" meta="管理你的资料与文件" onPress={onOpenKnowledgeBase} tone="green" />
        <QuickEntry icon="layers-outline" label="总资料库" meta="查看全部资料集合" onPress={onOpenGlobalMaterials} tone="warm" />
        <QuickEntry icon="time-outline" label="会话历史" meta="查看与管理历史记录" onPress={onOpenHistory} tone="gold" />
      </View>
    </AiLightScaffold>
  );
}

function buildRoleLibraryShortcuts(roleCards: AiRoleCardRecord[]): RoleShortcut[] {
  return roleCards
    .filter((roleCard): roleCard is AiRoleCardRecord & { avatarUri: string } => Boolean(roleCard.avatarUri))
    .map((roleCard) => ({
      avatarUri: roleCard.avatarUri,
      name: roleCard.name,
      roleCardId: roleCard.id,
    }));
}

function formatAiHomeFullMinute(value: string | null | undefined): string {
  return formatAiFullMinute(value);
}

function labelForContext(thread: AiHomeThreadItem): string {
  if (thread.contextType === 'ip') {
    return 'IP 对话';
  }
  if (thread.contextType === 'knowledge_base') {
    return thread.knowledgeCategory === 'customer_project' ? '项目资料对话' : '资料库对话';
  }
  return thread.roleCardName ? `${thread.roleCardName} 对话` : '普通聊天';
}

function ThreadAvatar({ thread, space }: { thread: AiHomeThreadItem; space: PixorySpace }) {
  if (thread.avatar.avatarEnabled && thread.avatar.avatarUri) {
    return <SecureImage contentFit="cover" space={space} style={styles.threadAvatarImage} uri={thread.avatar.avatarUri} />;
  }
  const iconName = thread.contextType === 'ip' ? 'albums-outline' : thread.contextType === 'knowledge_base' ? 'library-outline' : 'chatbubble-ellipses-outline';
  return (
    <View style={styles.threadIcon}>
      <Ionicons color={aiLightColors.primaryActive} name={iconName} size={metrics.iconSizeMd} />
    </View>
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
          <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={metrics.iconSizeSm} />
        </Pressable>
      ) : null}
    </View>
  );
}

type QuickEntryTone = 'primary' | 'green' | 'gold' | 'warm';

function QuickEntry({
  icon,
  label,
  meta,
  onPress,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  meta: string;
  onPress: () => void;
  tone: QuickEntryTone;
}) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickEntry, pressed && styles.pressed]}>
      <View style={[styles.quickIcon, quickIconToneStyles[tone]]}>
        <Ionicons color={quickToneColor[tone]} name={icon} size={metrics.iconSizeMd} />
      </View>
      <View style={styles.quickCopy}>
        <Text numberOfLines={1} style={styles.quickLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.quickMeta}>{meta}</Text>
      </View>
      <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={metrics.iconSizeSm} />
    </Pressable>
  );
}

const quickToneColor: Record<QuickEntryTone, string> = {
  primary: aiLightColors.primaryActive,
  gold: colors.text.gold,
  green: colors.primary.default,
  warm: colors.semantic.warning,
};

const quickIconToneStyles = StyleSheet.create({
  primary: {
    borderColor: aiLightColors.primary,
  },
  gold: {
    borderColor: colors.semantic.warning,
  },
  green: {
    borderColor: colors.primary.light,
  },
  warm: {
    borderColor: colors.border.strong,
  },
});

const styles = StyleSheet.create({
  screenContent: {
    gap: rhythm.screenSectionGap,
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  homeBody: {
    gap: rhythm.screenSectionGap,
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
  pressed: {
    opacity: 0.78,
  },
  mainStack: {
    gap: rhythm.cardContentGap,
  },
  primaryChatCard: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primary,
    borderRadius: radius.xl,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 104,
    overflow: 'hidden',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    position: 'relative',
  },
  primaryCardPattern: {
    height: 124,
    opacity: 0.1,
    position: 'absolute',
    right: -spacing[4],
    top: -spacing[2],
    width: 96,
  },
  primaryIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(250, 249, 245, 0.24)',
    borderRadius: radius.pill,
    height: spacing[12],
    justifyContent: 'center',
    width: spacing[12],
  },
  primaryCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  primaryTitle: {
    ...typography.textStyles.cardTitle,
    color: aiLightColors.onDark,
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 27,
  },
  primaryDescription: {
    ...typography.textStyles.caption,
    color: 'rgba(250, 249, 245, 0.82)',
  },
  primaryArrow: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  roleRailWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  roleRailScroll: {
    flex: 1,
  },
  roleRailContent: {
    gap: rhythm.inlineGap,
    paddingRight: spacing[1],
  },
  roleShortcut: {
    alignItems: 'center',
    gap: rhythm.microGap,
    width: 54,
  },
  roleAvatarImage: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 46,
    width: 46,
  },
  roleName: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    maxWidth: 54,
    textAlign: 'center',
  },
  emptyRoleHint: {
    alignItems: 'center',
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 46,
    paddingHorizontal: spacing[3],
  },
  emptyRoleText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  roleLibraryButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[3],
  },
  roleLibraryText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    fontWeight: '600',
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
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
  },
  sectionUnderline: {
    backgroundColor: aiLightColors.primary,
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
  recentChatPanel: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  recentChatPanelFilled: {
    height: RECENT_CHAT_ROW_HEIGHT * RECENT_CHAT_VISIBLE_ROWS,
  },
  recentChatPanelEmpty: {
    minHeight: 92,
  },
  recentChatScroll: {
    maxHeight: RECENT_CHAT_ROW_HEIGHT * RECENT_CHAT_VISIBLE_ROWS,
  },
  threadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: RECENT_CHAT_ROW_HEIGHT,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  emptyRecentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 72,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  threadDivider: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  threadIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  threadAvatarImage: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    width: 42,
  },
  threadCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  threadTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  threadTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  threadDescription: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    flex: 1,
    minWidth: 0,
  },
  threadMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  threadTime: {
    ...typography.textStyles.micro,
    color: aiLightColors.mutedSoft,
    flexShrink: 0,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: rhythm.inlineGap,
    rowGap: rhythm.entryCardGap,
  },
  quickEntry: {
    alignItems: 'center',
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '48.6%',
    flexDirection: 'row',
    flexGrow: 1,
    gap: rhythm.inlineGap,
    minHeight: 54,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  quickIcon: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  quickCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  quickLabel: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    fontSize: 14,
    lineHeight: 19,
  },
  quickMeta: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
  },
});
