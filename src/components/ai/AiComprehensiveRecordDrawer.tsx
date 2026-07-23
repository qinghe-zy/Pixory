import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppDialog } from '../AppDialog';
import type { AiThreadHistoryItem } from '../../database/repositories/aiThreadRepository';
import { metrics, radius, rhythm, shadows, spacing, typography } from '../../design/tokens';
import { formatAiHistoryMinute } from '../../utils/aiTimeFormatters';
import { aiLightColors } from './aiLightTheme';

const DRAWER_WIDTH_RATIO = 0.86;
const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * DRAWER_WIDTH_RATIO;
const SWIPE_CLOSE_THRESHOLD = DRAWER_WIDTH * 0.35;

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
  const [mounted, setMounted] = useState(false);
  const [actionThread, setActionThread] = useState<AiThreadHistoryItem | null>(null);
  const [renameThread, setRenameThread] = useState<AiThreadHistoryItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteThread, setDeleteThread] = useState<AiThreadHistoryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const drawerTranslateX = useRef(new Animated.Value(0)).current;
  const drawerAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  function startDrawerAnimation(
    animation: Animated.CompositeAnimation,
    onFinished?: () => void,
  ) {
    drawerAnimationRef.current?.stop();
    drawerAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (!finished) {
        return;
      }
      drawerAnimationRef.current = null;
      onFinished?.();
    });
  }

  // Mount / unmount with animation
  useEffect(() => {
    if (visible) {
      setMounted(true);
      drawerTranslateX.setValue(0);
      startDrawerAnimation(Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 28,
          stiffness: 260,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(scrimOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]));
    } else {
      drawerTranslateX.setValue(0);
      startDrawerAnimation(Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(scrimOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]), () => {
        setMounted(false);
      });
    }
  }, [visible]);

  // Swipe-left-to-close pan responder on the drawer panel
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) && gs.dx < 0,
      onPanResponderMove: (_evt, gs) => {
        const clampedDx = Math.min(0, gs.dx);
        drawerTranslateX.setValue(clampedDx);
        // Fade scrim proportionally
        const progress = 1 + clampedDx / DRAWER_WIDTH;
        scrimOpacity.setValue(Math.max(0, progress));
      },
      onPanResponderRelease: (_evt, gs) => {
        if (gs.dx < -SWIPE_CLOSE_THRESHOLD || gs.vx < -0.5) {
          // Close from the dragged position without double-counting translate values.
          slideAnim.setValue(Math.max(-DRAWER_WIDTH, Math.min(0, gs.dx)));
          drawerTranslateX.setValue(0);
          startDrawerAnimation(Animated.parallel([
            Animated.timing(slideAnim, {
              toValue: -DRAWER_WIDTH,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(scrimOpacity, {
              toValue: 0,
              duration: 160,
              useNativeDriver: true,
            }),
          ]), () => {
            setMounted(false);
            onClose();
          });
        } else {
          // Snap back open
          Animated.parallel([
            Animated.spring(drawerTranslateX, {
              toValue: 0,
              damping: 24,
              stiffness: 280,
              useNativeDriver: true,
            }),
            Animated.timing(scrimOpacity, {
              toValue: 1,
              duration: 100,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(drawerTranslateX, {
          toValue: 0,
          damping: 24,
          stiffness: 280,
          useNativeDriver: true,
        }).start();
        Animated.timing(scrimOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  if (!mounted && !visible) {
    return null;
  }

  const visibleRecents = recentThreads.slice(0, 15);

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
      setStatusText('已移入回收站。');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '移入回收站失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View pointerEvents="box-none" style={styles.overlay}>
        {/* Animated scrim */}
        <Animated.View
          pointerEvents="none"
          style={[styles.scrimBase, { opacity: scrimOpacity }]}
        />
        <Pressable
          accessibilityLabel="关闭综合记录"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrimTouchable}
        />
        {/* Animated sliding drawer */}
        <Animated.View
          style={[
            styles.drawer,
            {
              transform: [
                {
                  translateX: Animated.add(slideAnim, drawerTranslateX),
                },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
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
              visibleRecents.map((thread) => {
                const isActiveThread = thread.id === activeThreadId;
                const lastChatTime = formatAiHistoryMinute(thread.lastMessageAt ?? thread.updatedAt);
                return (
                  <View key={thread.id} style={styles.recentItem}>
                    <Pressable
                      accessibilityHint="长按可重命名或移入回收站"
                      accessibilityRole="button"
                      onLongPress={() => openRecentActionPopover(thread)}
                      onPress={() => {
                        if (actionThread || deleteThread) {
                          setActionThread(null);
                          setDeleteThread(null);
                          return;
                        }
                        if (isActiveThread) {
                          return;
                        }
                        onOpenThread(thread);
                      }}
                      style={({ pressed }) => [
                        styles.recentRow,
                        (isActiveThread || actionThread?.id === thread.id) && styles.recentRowActive,
                        pressed && !isActiveThread && styles.pressed,
                      ]}
                    >
                      <View style={styles.recentTitleRow}>
                        <Text numberOfLines={1} style={styles.recentTitle}>
                          {thread.title}
                        </Text>
                        <Text numberOfLines={1} style={styles.recentTime}>{lastChatTime}</Text>
                      </View>
                      <View style={styles.recentMetaRow}>
                        <Text numberOfLines={1} style={styles.recentMeta}>
                          {thread.lastMessagePreview ?? '暂无消息'}
                        </Text>
                        {isActiveThread ? <Text style={styles.currentThreadBadge}>当前聊天</Text> : null}
                      </View>
                      {actionThread?.id === thread.id ? (
                        <View style={styles.recentActionPopover}>
                          <Pressable accessibilityLabel="重命名最近会话" accessibilityRole="button" onPress={() => startRenameThread(thread)} style={({ pressed }) => [styles.recentActionButton, pressed && styles.pressed]}>
                            <Ionicons color={aiLightColors.ink} name="create-outline" size={16} />
                            <Text style={styles.recentActionText}>重命名</Text>
                          </Pressable>
                          <View style={styles.recentActionDivider} />
                          <Pressable accessibilityLabel="移入回收站最近会话" accessibilityRole="button" onPress={() => startDeleteThread(thread)} style={({ pressed }) => [styles.recentActionButton, pressed && styles.pressed]}>
                            <Ionicons color={aiLightColors.primaryActive} name="trash-outline" size={16} />
                            <Text style={[styles.recentActionText, styles.recentActionDangerText]}>回收站</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </Pressable>
                    {deleteThread?.id === thread.id ? (
                      <View style={styles.recentDeleteConfirm}>
                        <Text numberOfLines={2} style={styles.recentDeleteText}>
                          将「{thread.title}」移入回收站？
                        </Text>
                        <View style={styles.recentDeleteActions}>
                          <Pressable accessibilityLabel="确认移入回收站最近会话" accessibilityRole="button" disabled={busy} onPress={confirmDeleteThread} style={({ pressed }) => [styles.recentDeleteButton, busy && styles.disabled, pressed && !busy && styles.pressed]}>
                            <Text style={styles.recentDeleteButtonText}>{busy ? '移入中' : '移入回收站'}</Text>
                          </Pressable>
                          <Pressable accessibilityLabel="取消移入回收站最近会话" accessibilityRole="button" disabled={busy} onPress={() => setDeleteThread(null)} style={({ pressed }) => [styles.recentCancelButton, busy && styles.disabled, pressed && !busy && styles.pressed]}>
                            <Text style={styles.recentCancelButtonText}>取消</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyText}>暂无最近会话</Text>
            )}
          </ScrollView>
        </Animated.View>
      </View>
      <AppDialog
        accent="ai"
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
          cursorColor={aiLightColors.primaryActive}
          onChangeText={setRenameValue}
          placeholder="输入新的会话标题"
          placeholderTextColor={aiLightColors.muted}
          selectionColor={aiLightColors.primaryActive}
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
  const color = tone === 'accent' ? aiLightColors.primaryActive : aiLightColors.ink;
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
  scrimBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24, 23, 21, 0.28)',
  },
  scrimTouchable: {
    ...StyleSheet.absoluteFillObject,
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
    width: DRAWER_WIDTH,
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
    color: aiLightColors.primaryActive,
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
    minHeight: metrics.minTouchSize,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  recentRowActive: {
    backgroundColor: aiLightColors.surface,
  },
  recentTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  recentTitle: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    flex: 1,
    minWidth: 0,
  },
  recentTime: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    flexShrink: 0,
    opacity: 0.58,
  },
  recentMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  currentThreadBadge: {
    ...typography.textStyles.caption,
    alignSelf: 'center',
    color: aiLightColors.primaryActive,
    flexShrink: 0,
    fontWeight: '700',
  },
  recentMeta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    flex: 1,
    minWidth: 0,
  },
  emptyText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  statusText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
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
    color: aiLightColors.primaryActive,
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
    backgroundColor: aiLightColors.primaryActive,
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
