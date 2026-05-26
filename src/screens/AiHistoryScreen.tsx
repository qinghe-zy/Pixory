import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppActionSheet, type AppActionSheetItem } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { AiLightChip } from '../components/ai/AiLightChip';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { archiveAiThread, deleteAiThreads, listAiHistoryThreads, moveAiThreadsBetweenSpaces, renameAiThread, unarchiveAiThread } from '../ai/aiChatService';
import type { AiThreadHistoryFilter, AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import { radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';
import { formatAiHistoryMinute } from '../utils/aiTimeFormatters';

interface AiHistoryScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onOpenThread: (thread: AiThreadHistoryItem) => void;
}

const FILTERS: Array<{ key: AiThreadHistoryFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'normal', label: '普通聊天' },
  { key: 'ip', label: 'IP 聊天' },
  { key: 'knowledge_base', label: '知识库' },
  { key: 'customer_project', label: '项目' },
  { key: 'archived', label: '已归档' },
];
const ARCHIVE_ACTION_WIDTH = 96;
const ARCHIVE_SWIPE_THRESHOLD = 72;

function historyGroupLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '更早';
  }
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - startOfDate) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) {
    return '今天';
  }
  if (diffDays === 1) {
    return '昨天';
  }
  if (diffDays <= 7) {
    return '过去 7 天';
  }
  if (diffDays <= 30) {
    return '过去 30 天';
  }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
}

export function AiHistoryScreen({ space, onBack, onOpenThread }: AiHistoryScreenProps) {
  const [filter, setFilter] = useState<AiThreadHistoryFilter>('all');
  const [items, setItems] = useState<AiThreadHistoryItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState(searchText);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<'delete' | 'move' | null>(null);
  const [renameThread, setRenameThread] = useState<AiThreadHistoryItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [actionThread, setActionThread] = useState<AiThreadHistoryItem | null>(null);
  const [deleteThread, setDeleteThread] = useState<AiThreadHistoryItem | null>(null);
  const [swipedThreadId, setSwipedThreadId] = useState<string | null>(null);
  const [personalPassword, setPersonalPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const swipeAnimatedValuesRef = useRef(new Map<string, Animated.Value>());
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const targetSpace: PixorySpace = space === 'normal' ? 'personal' : 'normal';
  const isSelecting = selectedIds.length > 0;
  const selectionFooter = isSelecting ? (
    <View style={styles.selectionFooter}>
      <Text style={styles.selectionText}>已选 {selectedIds.length}</Text>
      <View style={styles.selectionActions}>
        <Pressable accessibilityRole="button" onPress={() => setPendingAction('move')} style={({ pressed }) => [styles.selectionButton, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.coralActive} name={space === 'normal' ? 'lock-closed-outline' : 'lock-open-outline'} size={18} />
          <Text style={styles.selectionButtonText}>{space === 'normal' ? '移入隐私空间' : '移出隐私空间'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setPendingAction('delete')} style={({ pressed }) => [styles.selectionButton, styles.dangerButton, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.coralActive} name="trash-outline" size={18} />
          <Text style={styles.dangerText}>删除</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setSelectedIds([])} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.muted} name="close" size={18} />
        </Pressable>
      </View>
    </View>
  ) : undefined;

  const reload = useCallback(async () => {
    setItems(await listAiHistoryThreads({ filter, searchText: debouncedSearchText, space }));
  }, [debouncedSearchText, filter, space]);
  const actionSheetItems: AppActionSheetItem[] = actionThread
    ? [
        {
          key: 'rename',
          label: '重命名',
          icon: 'create-outline',
          onPress: () => {
            setRenameThread(actionThread);
            setRenameValue(actionThread.title);
          },
        },
        {
          key: 'select',
          label: '多选',
          icon: 'checkmark-circle-outline',
          onPress: () => toggleSelected(actionThread.id),
        },
        {
          key: 'delete',
          label: '删除',
          icon: 'trash-outline',
          danger: true,
          onPress: () => {
            setDeleteThread(actionThread);
            setPendingAction('delete');
          },
        },
      ]
    : [];

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchText(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    setSelectedIds([]);
    setPendingAction(null);
    setPersonalPassword('');
    setSwipedThreadId(null);
    setActionThread(null);
    setDeleteThread(null);
  }, [filter, space]);

  async function toggleArchive(thread: AiThreadHistoryItem) {
    animateSwipe(thread.id, 0);
    setSwipedThreadId(null);
    if (thread.archivedAt) {
      await unarchiveAiThread(space, thread.id);
      setStatus('会话已恢复。');
    } else {
      await archiveAiThread(space, thread.id);
      setStatus('会话已归档。');
    }
    await reload();
  }

  function getSwipeAnimatedValue(threadId: string): Animated.Value {
    let value = swipeAnimatedValuesRef.current.get(threadId);
    if (!value) {
      value = new Animated.Value(0);
      swipeAnimatedValuesRef.current.set(threadId, value);
    }
    return value;
  }

  function animateSwipe(threadId: string, toValue: number) {
    Animated.spring(getSwipeAnimatedValue(threadId), {
      damping: 18,
      stiffness: 180,
      toValue,
      useNativeDriver: true,
    }).start();
  }

  function getThreadSwipeHandlers(thread: AiThreadHistoryItem) {
    const swipeValue = getSwipeAnimatedValue(thread.id);
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
      onPanResponderMove: (_event, gesture) => {
        if (isSelecting) {
          return;
        }
        const next = Math.max(-ARCHIVE_ACTION_WIDTH, Math.min(0, gesture.dx));
        swipeValue.setValue(next);
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx <= -ARCHIVE_SWIPE_THRESHOLD) {
          if (swipedThreadId && swipedThreadId !== thread.id) {
            animateSwipe(swipedThreadId, 0);
          }
          setSwipedThreadId(thread.id);
          animateSwipe(thread.id, -ARCHIVE_ACTION_WIDTH);
          return;
        }
        setSwipedThreadId(null);
        animateSwipe(thread.id, 0);
      },
      onPanResponderTerminate: () => {
        animateSwipe(thread.id, swipedThreadId === thread.id ? -ARCHIVE_ACTION_WIDTH : 0);
      },
    }).panHandlers;
  }

  function toggleSelected(threadId: string) {
    setSelectedIds((current) => current.includes(threadId) ? current.filter((id) => id !== threadId) : [...current, threadId]);
  }

  function handleRowPress(thread: AiThreadHistoryItem) {
    if (isSelecting) {
      toggleSelected(thread.id);
      return;
    }
    if (swipedThreadId) {
      animateSwipe(swipedThreadId, 0);
      setSwipedThreadId(null);
      return;
    }
    onOpenThread(thread);
  }

  async function confirmDeleteSelected() {
    const threadIds = deleteThread ? [deleteThread.id] : selectedIds;
    setBusy(true);
    try {
      const count = await deleteAiThreads(space, threadIds);
      setStatus(`已删除 ${count} 条。`);
      setSelectedIds([]);
      setDeleteThread(null);
      setPendingAction(null);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '删除失败');
    } finally {
      setBusy(false);
    }
  }

  async function confirmMoveSelected() {
    setBusy(true);
    try {
      const count = await moveAiThreadsBetweenSpaces({
        personalPassword,
        sourceSpace: space,
        targetSpace,
        threadIds: selectedIds,
      });
      setStatus(`已移动 ${count} 条。`);
      setSelectedIds([]);
      setPendingAction(null);
      setPersonalPassword('');
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '移动失败');
    } finally {
      setBusy(false);
    }
  }

  async function confirmRenameThread() {
    if (!renameThread) {
      return;
    }
    setBusy(true);
    try {
      await renameAiThread(space, renameThread.id, renameValue);
      setStatus('已重命名聊天。');
      setRenameThread(null);
      setRenameValue('');
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重命名失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AiLightScaffold
        footer={selectionFooter}
        onBack={onBack}
        scrollable
        subtitle={spaceLabel}
        title="历史会话"
      >
        <View style={styles.filterRow}>
          {FILTERS.map((item) => (
            <AiLightChip active={filter === item.key} dense key={item.key} label={item.label} onPress={() => setFilter(item.key)} />
          ))}
        </View>
        <View style={styles.searchBox}>
          <Ionicons color={aiLightColors.mutedSoft} name="search-outline" size={16} />
          <TextInput
            onChangeText={setSearchText}
            placeholder="搜索标题或最近消息"
            placeholderTextColor={aiLightColors.mutedSoft}
            selectionColor={aiLightColors.coral}
            style={styles.searchInput}
            value={searchText}
          />
        </View>
        {status ? <Text style={styles.status}>{status}</Text> : null}

        <View style={[styles.list, styles.threadList]}>
          {items.length ? (
            items.map((thread, index) => {
              const selected = selectedIds.includes(thread.id);
              const swipeTranslateX = getSwipeAnimatedValue(thread.id);
              const swipeActionProgress = Animated.multiply(swipeTranslateX, -1);
              const actionTranslateX = swipeActionProgress.interpolate({
                inputRange: [0, ARCHIVE_ACTION_WIDTH],
                outputRange: [ARCHIVE_ACTION_WIDTH, 0],
                extrapolate: 'clamp',
              });
              const groupLabel = historyGroupLabel(thread.lastMessageAt ?? thread.updatedAt);
              const previousGroupLabel = index > 0 ? historyGroupLabel(items[index - 1].lastMessageAt ?? items[index - 1].updatedAt) : null;
              return (
                <View key={thread.id}>
                  {groupLabel !== previousGroupLabel ? <Text style={styles.groupLabel}>{groupLabel}</Text> : null}
                  <View style={styles.swipeWrap}>
                    {!isSelecting ? (
                      <Animated.View style={[styles.swipeActionClip, { transform: [{ translateX: actionTranslateX }] }]}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            void toggleArchive(thread);
                          }}
                          style={({ pressed }) => [styles.swipeActionSurface, pressed && styles.pressed]}
                        >
                          <Ionicons color={aiLightColors.onDark} name={thread.archivedAt ? 'arrow-undo-outline' : 'archive-outline'} size={17} />
                          <Text style={styles.archiveActionText}>{thread.archivedAt ? '恢复' : '归档'}</Text>
                        </Pressable>
                      </Animated.View>
                    ) : null}
                    <Animated.View
                      {...getThreadSwipeHandlers(thread)}
                      style={[
                        styles.row,
                        selected && styles.selectedRow,
                        {
                          transform: [{ translateX: swipeTranslateX }],
                        },
                      ]}
                    >
                      <View style={styles.rowContent}>
                        <Pressable
                          accessibilityRole="button"
                          onLongPress={() => toggleSelected(thread.id)}
                          onPress={() => handleRowPress(thread)}
                          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                        >
                          <View style={styles.iconWrap}>
                            <Ionicons color={aiLightColors.coralActive} name={selected ? 'checkmark-circle' : iconForContext(thread.contextType)} size={20} />
                          </View>
                          <View style={styles.copy}>
                            <Text numberOfLines={1} style={styles.title}>{thread.title}</Text>
                            <Text numberOfLines={1} style={styles.meta}>
                              {labelForContext(thread)} · 上次聊天 {formatAiHistoryMinute(thread.lastMessageAt ?? thread.updatedAt)}
                            </Text>
                            {thread.lastMessagePreview ? <Text numberOfLines={2} style={styles.preview}>{thread.lastMessagePreview}</Text> : null}
                          </View>
                        </Pressable>
                        {!isSelecting ? (
                          <Pressable
                            accessibilityLabel="会话操作"
                            accessibilityRole="button"
                            onPress={() => setActionThread(thread)}
                            style={({ pressed }) => [styles.rowMenuButton, pressed && styles.pressed]}
                          >
                            <Ionicons color={aiLightColors.muted} name="ellipsis-horizontal" size={18} />
                          </Pressable>
                        ) : null}
                      </View>
                    </Animated.View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.title}>{searchText.trim() ? '没有找到匹配会话' : '没有历史会话'}</Text>
              <Text style={styles.meta}>{searchText.trim() ? '换个关键词试试。' : '开始聊天后，最近会话会出现在这里。'}</Text>
            </View>
          )}
        </View>
      </AiLightScaffold>

      <AppDialog
        danger
        message={`删除 ${deleteThread ? 1 : selectedIds.length} 条聊天记录，并删除这些会话专属的会话资料和应用内资料副本。原始 IP 素材与系统原文件不会被删除。`}
        onClose={() => {
          if (!busy) {
            setPendingAction(null);
            setDeleteThread(null);
          }
        }}
        onPrimary={() => void confirmDeleteSelected()}
        primaryLabel={busy ? '正在删除' : '删除'}
        title="删除聊天记录"
        visible={pendingAction === 'delete'}
      />

      <AppDialog
        message={`${space === 'normal' ? '移入' : '移出'}隐私空间：${selectedIds.length} 条。`}
        onClose={() => {
          if (!busy) {
            setPendingAction(null);
            setPersonalPassword('');
          }
        }}
        onPrimary={() => void confirmMoveSelected()}
        primaryDisabled={busy || (targetSpace === 'personal' && !personalPassword.trim())}
        primaryLabel={busy ? '正在移动' : space === 'normal' ? '移入隐私空间' : '移出隐私空间'}
        title={space === 'normal' ? '移入隐私空间' : '移出隐私空间'}
        visible={pendingAction === 'move'}
      >
        {targetSpace === 'personal' ? (
          <TextInput
            editable={!busy}
            onChangeText={setPersonalPassword}
            placeholder="隐私密码"
            placeholderTextColor={aiLightColors.mutedSoft}
            secureTextEntry
            selectionColor={aiLightColors.coral}
            style={styles.passwordInput}
            value={personalPassword}
          />
        ) : null}
      </AppDialog>

      <AppActionSheet
        items={actionSheetItems}
        onClose={() => setActionThread(null)}
        title={actionThread?.title ?? '会话操作'}
        visible={Boolean(actionThread)}
      />

      <AppDialog
        message="修改后会作为自定义聊天名称显示在最近继续和历史列表。"
        onClose={() => {
          if (!busy) {
            setRenameThread(null);
            setRenameValue('');
          }
        }}
        onPrimary={() => void confirmRenameThread()}
        primaryDisabled={busy || !renameValue.trim()}
        primaryLabel={busy ? '正在保存' : '保存'}
        title="重命名聊天"
        visible={Boolean(renameThread)}
      >
        <TextInput
          editable={!busy}
          onChangeText={setRenameValue}
          placeholder="聊天名称"
          placeholderTextColor={aiLightColors.mutedSoft}
          selectionColor={aiLightColors.coral}
          style={styles.passwordInput}
          value={renameValue}
        />
      </AppDialog>
    </>
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

function labelForContext(thread: AiThreadHistoryItem): string {
  if (thread.contextType === 'ip') {
    return 'IP 聊天';
  }
  if (thread.contextType === 'knowledge_base') {
    return thread.knowledgeCategory === 'customer_project' ? '项目知识库' : '知识库';
  }
  return '普通聊天';
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  list: {
    gap: rhythm.listCardGap,
  },
  threadList: {
    paddingTop: rhythm.listCardGap,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 42,
    paddingHorizontal: spacing[3],
  },
  searchInput: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    flex: 1,
    paddingVertical: 0,
  },
  swipeWrap: {
    overflow: 'hidden',
  },
  groupLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '700',
    paddingBottom: spacing[1],
    paddingHorizontal: spacing[1],
  },
  swipeActionClip: {
    bottom: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    width: ARCHIVE_ACTION_WIDTH,
  },
  swipeActionSurface: {
    alignItems: 'center',
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.lg,
    bottom: 0,
    gap: 2,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: ARCHIVE_ACTION_WIDTH,
  },
  archiveActionText: {
    ...typography.textStyles.micro,
    color: aiLightColors.onDark,
    fontWeight: '600',
  },
  row: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  selectedRow: {
    borderColor: aiLightColors.coral,
  },
  rowContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  rowMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minWidth: 0,
  },
  rowMenuButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  pressed: {
    opacity: 0.78,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  copy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  meta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  preview: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing[4],
  },
  selectionFooter: {
    gap: rhythm.cardContentGap,
  },
  selectionText: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  selectionActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  selectionButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 36,
    paddingHorizontal: spacing[3],
  },
  selectionButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: aiLightColors.card,
  },
  dangerText: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  iconAction: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  passwordInput: {
    ...typography.textStyles.body,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minHeight: 44,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
});
