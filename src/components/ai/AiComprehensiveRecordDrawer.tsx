import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppDialog } from '../AppDialog';
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
  onOpenRoleLibrary: () => void;
  onOpenHistory: () => void;
  onOpenGlobalMaterials: () => void;
  onOpenThread: (thread: AiThreadHistoryItem) => void;
  onRenameThread?: (thread: AiThreadHistoryItem, title: string) => Promise<void> | void;
  onDeleteThread?: (thread: AiThreadHistoryItem) => Promise<void> | void;
}

export function AiComprehensiveRecordDrawer({
  visible,
  recentThreads,
  activeThreadId = null,
  onClose,
  onNewChat,
  onOpenRoleLibrary,
  onOpenHistory,
  onOpenGlobalMaterials,
  onOpenThread,
  onRenameThread,
  onDeleteThread,
}: AiComprehensiveRecordDrawerProps) {
  const [actionThread, setActionThread] = useState<AiThreadHistoryItem | null>(null);
  const [renameThread, setRenameThread] = useState<AiThreadHistoryItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteThread, setDeleteThread] = useState<AiThreadHistoryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  if (!visible) {
    return null;
  }

  const visibleRecents = recentThreads.filter((thread) => thread.id !== activeThreadId).slice(0, 15);

  function openRecentActionPopover(thread: AiThreadHistoryItem) {
    setStatusText(null);
    setActionThread((current) => current?.id === thread.id ? null : thread);
  }

  function startRenameThread(thread: AiThreadHistoryItem) {
    setActionThread(null);
    setRenameThread(thread);
    setRenameValue(thread.title);
    setStatusText(null);
  }

  function startDeleteThread(thread: AiThreadHistoryItem) {
    setActionThread(null);
    setDeleteThread(thread);
    setStatusText(null);
  }

  async function confirmRenameThread() {
    if (!renameThread || !onRenameThread) {
      return;
    }
    const title = renameValue.trim();
    if (!title) {
      return;
    }
    setBusy(true);
    try {
      await onRenameThread(renameThread, title);
      setRenameThread(null);
      setRenameValue('');
      setStatusText('已重命名会话。');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '重命名失败');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteThread() {
    if (!deleteThread || !onDeleteThread) {
      return;
    }
    setBusy(true);
    try {
      await onDeleteThread(deleteThread);
      setDeleteThread(null);
      setStatusText('已删除会话。');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '删除失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View pointerEvents="box-none" style={styles.overlay}>
        <Pressable accessibilityLabel="关闭综合记录" accessibilityRole="button" onPress={onClose} style={styles.scrim} />
        <View style={styles.drawer}>
          <Text style={styles.brand}>Pixory AI</Text>
          <View style={styles.primaryActions}>
            <DrawerAction icon="add-circle-outline" label="新聊天" onPress={onNewChat} tone="accent" />
            <DrawerAction icon="person-circle-outline" label="角色库" onPress={onOpenRoleLibrary} />
            <DrawerAction icon="chatbubbles-outline" label="历史记录" onPress={onOpenHistory} />
            <DrawerAction icon="folder-open-outline" label="总资料库" onPress={onOpenGlobalMaterials} />
          </View>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>最近</Text>
          {statusText ? <Text accessibilityLiveRegion="polite" style={styles.statusText}>{statusText}</Text> : null}
          <ScrollView contentContainerStyle={styles.recentList} showsVerticalScrollIndicator={false} style={styles.recentScroller}>
            {visibleRecents.length ? (
              visibleRecents.map((thread) => (
                <View key={thread.id} style={styles.recentItem}>
                  <Pressable
                    accessibilityHint="长按可重命名或删除"
                    accessibilityRole="button"
                    onLongPress={() => openRecentActionPopover(thread)}
                    onPress={() => {
                      if (actionThread || deleteThread) {
                        setActionThread(null);
                        setDeleteThread(null);
                        return;
                      }
                      onOpenThread(thread);
                    }}
                    style={({ pressed }) => [styles.recentRow, actionThread?.id === thread.id && styles.recentRowActive, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={1} style={styles.recentTitle}>
                      {thread.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.recentMeta}>
                      {thread.lastMessagePreview ?? `上次聊天 ${formatAiHistoryMinute(thread.lastMessageAt ?? thread.updatedAt)}`}
                    </Text>
                    {actionThread?.id === thread.id ? (
                      <View style={styles.recentActionPopover}>
                        <Pressable accessibilityLabel="重命名最近会话" accessibilityRole="button" onPress={() => startRenameThread(thread)} style={({ pressed }) => [styles.recentActionButton, pressed && styles.pressed]}>
                          <Ionicons color={aiLightColors.ink} name="create-outline" size={16} />
                          <Text style={styles.recentActionText}>重命名</Text>
                        </Pressable>
                        <View style={styles.recentActionDivider} />
                        <Pressable accessibilityLabel="删除最近会话" accessibilityRole="button" onPress={() => startDeleteThread(thread)} style={({ pressed }) => [styles.recentActionButton, pressed && styles.pressed]}>
                          <Ionicons color={aiLightColors.coralActive} name="trash-outline" size={16} />
                          <Text style={[styles.recentActionText, styles.recentActionDangerText]}>删除</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </Pressable>
                  {deleteThread?.id === thread.id ? (
                    <View style={styles.recentDeleteConfirm}>
                      <Text numberOfLines={2} style={styles.recentDeleteText}>
                        删除「{thread.title}」这条会话记录？
                      </Text>
                      <View style={styles.recentDeleteActions}>
                        <Pressable accessibilityLabel="确认删除最近会话" accessibilityRole="button" disabled={busy} onPress={confirmDeleteThread} style={({ pressed }) => [styles.recentDeleteButton, busy && styles.disabled, pressed && !busy && styles.pressed]}>
                          <Text style={styles.recentDeleteButtonText}>{busy ? '删除中' : '删除'}</Text>
                        </Pressable>
                        <Pressable accessibilityLabel="取消删除最近会话" accessibilityRole="button" disabled={busy} onPress={() => setDeleteThread(null)} style={({ pressed }) => [styles.recentCancelButton, busy && styles.disabled, pressed && !busy && styles.pressed]}>
                          <Text style={styles.recentCancelButtonText}>取消</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>暂无最近会话</Text>
            )}
          </ScrollView>
        </View>
      </View>
      <AppDialog
        compactActions
        onClose={() => {
          setRenameThread(null);
          setRenameValue('');
        }}
        onPrimary={confirmRenameThread}
        primaryDisabled={busy || !renameValue.trim()}
        primaryLabel={busy ? '保存中' : '保存'}
        title="重命名会话"
        visible={Boolean(renameThread)}
      >
        <TextInput
          autoFocus
          cursorColor={aiLightColors.coralActive}
          onChangeText={setRenameValue}
          placeholder="输入新的会话标题"
          placeholderTextColor={aiLightColors.muted}
          selectionColor={aiLightColors.coralActive}
          style={styles.renameInput}
          value={renameValue}
        />
      </AppDialog>
    </>
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
    height: '100%',
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
  recentItem: {
    gap: spacing[1],
  },
  recentRow: {
    borderRadius: radius.md,
    gap: rhythm.microGap,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  recentRowActive: {
    backgroundColor: aiLightColors.surface,
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
  statusText: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  recentActionPopover: {
    alignSelf: 'flex-start',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginTop: spacing[1],
    overflow: 'hidden',
    ...shadows.floating,
  },
  recentActionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 36,
    paddingHorizontal: spacing[3],
  },
  recentActionText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '700',
  },
  recentActionDangerText: {
    color: aiLightColors.coralActive,
  },
  recentActionDivider: {
    backgroundColor: aiLightColors.hairline,
    width: StyleSheet.hairlineWidth,
  },
  recentDeleteConfirm: {
    alignSelf: 'stretch',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    marginHorizontal: spacing[2],
    padding: spacing[3],
    ...shadows.floating,
  },
  recentDeleteText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    lineHeight: 20,
  },
  recentDeleteActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  recentDeleteButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.coralActive,
    borderRadius: radius.pill,
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  recentDeleteButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.onDark,
    fontWeight: '700',
  },
  recentCancelButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  recentCancelButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '700',
  },
  renameInput: {
    ...typography.textStyles.body,
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.52,
  },
});
