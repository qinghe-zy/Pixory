import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { deleteRoleCards, listRoleCards } from '../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../ai/types';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiRoleLibraryItem } from '../components/ai/AiRoleLibraryItem';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import type { PixorySpace } from '../database';
import { radius, rhythm, spacing, typography } from '../design/tokens';
import { globalScrollState } from '../utils/scrollState';

interface AiRoleLibraryScreenProps {
  space: PixorySpace;
  mode?: 'library' | 'apply_to_thread';
  onBack: () => void;
  onCreateRole: () => void;
  onImportRole: () => void;
  onOpenRoleDetail: (roleCardId: string) => void;
  onStartChatWithRole: (roleCardId: string) => Promise<void> | void;
  onStartImChat?: (card: AiRoleCardRecord) => Promise<void> | void;
  onApplyRoleToThread?: (roleCardId: string) => Promise<void> | void;
}

type RoleCategoryFilter = 'all' | 'manual' | 'imported';
type RoleViewMode = 'waterfall' | 'list';

export function AiRoleLibraryScreen({
  space,
  mode = 'library',
  onBack,
  onCreateRole,
  onImportRole,
  onOpenRoleDetail,
  onStartChatWithRole,
  onStartImChat,
  onApplyRoleToThread,
}: AiRoleLibraryScreenProps) {
  const [cards, setCards] = useState<AiRoleCardRecord[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);
  const [chatChoiceCard, setChatChoiceCard] = useState<AiRoleCardRecord | null>(null);

  const [viewMode, setViewMode] = useState<RoleViewMode>('waterfall');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<RoleCategoryFilter>('all');

  const loadCards = useCallback(async () => {
    const nextCards = await listRoleCards(space);
    setCards(nextCards);
  }, [space]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => {
      setStatus(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [status]);

  const toggleSelected = useCallback((card: AiRoleCardRecord) => {
    if (globalScrollState.isScrolling) return;
    setSelectedCardIds((current) =>
      current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id]
    );
  }, []);

  const startChat = useCallback(async (card: AiRoleCardRecord) => {
    if (mode === 'apply_to_thread' && onApplyRoleToThread) {
      setBusyRoleId(card.id);
      setStatus(null);
      try {
        await onApplyRoleToThread(card.id);
      } catch (error) {
        setStatus(error instanceof Error ? `应用角色失败：${error.message}` : '应用角色失败');
      } finally {
        setBusyRoleId(null);
      }
      return;
    }

    if (!onStartImChat) {
      setBusyRoleId(card.id);
      try {
        await onStartChatWithRole(card.id);
      } finally {
        setBusyRoleId(null);
      }
      return;
    }

    // 打开系统统一的黑白底部操作抽屉 AppActionSheet
    setChatChoiceCard(card);
  }, [mode, onApplyRoleToThread, onStartChatWithRole, onStartImChat]);

  const handlePressCard = useCallback((card: AiRoleCardRecord) => {
    if (selectedCardIds.length) {
      toggleSelected(card);
      return;
    }
    onOpenRoleDetail(card.id);
  }, [selectedCardIds, toggleSelected, onOpenRoleDetail]);

  const handleStartChat = useCallback((card: AiRoleCardRecord) => {
    if (busyRoleId) return;
    void startChat(card);
  }, [busyRoleId, startChat]);

  async function deleteSelectedCards() {
    const ids = selectedCardIds;
    if (!ids.length) {
      setDeleteConfirmVisible(false);
      return;
    }
    const count = await deleteRoleCards(space, ids);
    setSelectedCardIds([]);
    setDeleteConfirmVisible(false);
    setStatus(`已删除 ${count} 张角色卡。`);
    await loadCards();
  }

  // 过滤后的卡片集合
  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      // 1. 分类筛选
      if (categoryFilter === 'manual' && card.sourceType && card.sourceType !== 'pixory_manual') {
        return false;
      }
      if (categoryFilter === 'imported' && (!card.sourceType || card.sourceType === 'pixory_manual')) {
        return false;
      }
      // 2. 检索词筛选
      if (!searchQuery.trim()) {
        return true;
      }
      const q = searchQuery.trim().toLowerCase();
      const nameMatch = card.name.toLowerCase().includes(q);
      const descMatch = (card.description || '').toLowerCase().includes(q);
      const promptMatch = (card.prompt || '').toLowerCase().includes(q);
      const tagMatch = (card.tags || []).some((t) => t.toLowerCase().includes(q));
      return nameMatch || descMatch || promptMatch || tagMatch;
    });
  }, [cards, categoryFilter, searchQuery]);

  // 瀑布流双列均分
  const leftColumnCards = useMemo(
    () => filteredCards.filter((_, idx) => idx % 2 === 0),
    [filteredCards]
  );
  const rightColumnCards = useMemo(
    () => filteredCards.filter((_, idx) => idx % 2 === 1),
    [filteredCards]
  );

  const manualCount = useMemo(
    () => cards.filter((c) => !c.sourceType || c.sourceType === 'pixory_manual').length,
    [cards]
  );
  const importedCount = useMemo(
    () => cards.filter((c) => c.sourceType && c.sourceType !== 'pixory_manual').length,
    [cards]
  );

  const selectionFooter = selectedCardIds.length ? (
    <View style={styles.dockContainer}>
      <View style={styles.dockBadge}>
        <Text style={styles.dockBadgeText}>
          已选 <Text style={styles.dockBadgeBold}>{selectedCardIds.length}</Text> 张
        </Text>
      </View>
      <View style={styles.dockActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedCardIds([])}
          style={({ pressed }) => [styles.dockCancelBtn, pressed && styles.pressed]}
        >
          <Text style={styles.dockCancelText}>取消</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDeleteConfirmVisible(true)}
          style={({ pressed }) => [styles.dockDeleteBtn, pressed && styles.pressed]}
        >
          <Ionicons color="#FFFFFF" name="trash-outline" size={14} />
          <Text style={styles.dockDeleteText}>删除</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  const headerRightActions = (
    <View style={styles.headerActions}>
      <Pressable
        accessibilityLabel="切换视图"
        accessibilityRole="button"
        hitSlop={spacing[2]}
        onPress={() => setViewMode((prev) => (prev === 'waterfall' ? 'list' : 'waterfall'))}
        style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
      >
        <Ionicons
          color={aiLightColors.ink}
          name={viewMode === 'waterfall' ? 'list-outline' : 'grid-outline'}
          size={20}
        />
      </Pressable>

      <Pressable
        accessibilityLabel="新建角色"
        accessibilityRole="button"
        hitSlop={spacing[2]}
        onPress={onCreateRole}
        style={({ pressed }) => [
          styles.headerIconButton,
          styles.headerAddButton,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons color={aiLightColors.primaryActive} name="add-outline" size={22} />
      </Pressable>
    </View>
  );

  return (
    <AiLightScaffold
      contentContainerStyle={viewMode === 'list' ? styles.listScreenContainer : styles.waterfallScreenContainer}
      footer={selectionFooter}
      onBack={onBack}
      rightAction={headerRightActions}
      scrollable
      subtitle={mode === 'apply_to_thread' ? '选择角色应用到当前会话' : `共 ${cards.length} 位陪伴伙伴`}
      title="角色库"
    >
      {/* 状态通知 */}
      {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}

      {/* 嵌入式搜索与分类筛选栏 */}
      {cards.length > 0 ? (
        <View style={styles.filterSection}>
          <View style={styles.searchBar}>
            <Ionicons color={aiLightColors.muted} name="search-outline" size={16} />
            <TextInput
              onChangeText={setSearchQuery}
              placeholder="搜索角色名、设定或标签..."
              placeholderTextColor={aiLightColors.muted}
              style={styles.searchInput}
              value={searchQuery}
            />
            {searchQuery.length > 0 ? (
              <Pressable hitSlop={spacing[2]} onPress={() => setSearchQuery('')}>
                <Ionicons color={aiLightColors.muted} name="close-circle" size={16} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.categoryPillRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCategoryFilter('all')}
              style={[
                styles.categoryPill,
                categoryFilter === 'all' && styles.categoryPillActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  categoryFilter === 'all' && styles.categoryPillTextActive,
                ]}
              >
                全部 {cards.length}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setCategoryFilter('manual')}
              style={[
                styles.categoryPill,
                categoryFilter === 'manual' && styles.categoryPillActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  categoryFilter === 'manual' && styles.categoryPillTextActive,
                ]}
              >
                自建 {manualCount}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setCategoryFilter('imported')}
              style={[
                styles.categoryPill,
                categoryFilter === 'imported' && styles.categoryPillActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  categoryFilter === 'imported' && styles.categoryPillTextActive,
                ]}
              >
                导入 {importedCount}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* 角色卡集合渲染 */}
      {cards.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons color={aiLightColors.mutedSoft} name="people-outline" size={56} />
          <Text style={styles.emptyTitle}>还没有角色</Text>
          <Text style={styles.emptyMeta}>创建或导入角色卡后，可以在这里直接开聊。</Text>
          <View style={styles.emptyActions}>
            <Pressable accessibilityRole="button" onPress={onCreateRole} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
              <Text style={styles.actionButtonText}>新建角色</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onImportRole} style={({ pressed }) => [styles.actionButton, styles.outlineButton, pressed && styles.pressed]}>
              <Text style={[styles.actionButtonText, styles.outlineButtonText]}>导入角色卡</Text>
            </Pressable>
          </View>
        </View>
      ) : filteredCards.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons color={aiLightColors.mutedSoft} name="search-outline" size={48} />
          <Text style={styles.emptyTitle}>未找到匹配的角色</Text>
          <Text style={styles.emptyMeta}>换个关键词或切换分类试试。</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSearchQuery('');
              setCategoryFilter('all');
            }}
            style={({ pressed }) => [styles.actionButton, styles.outlineButton, pressed && styles.pressed]}
          >
            <Text style={[styles.actionButtonText, styles.outlineButtonText]}>清除搜索与筛选</Text>
          </Pressable>
        </View>
      ) : viewMode === 'waterfall' ? (
        /* 双列瀑布流模式 */
        <View style={styles.waterfallGrid}>
          <View style={styles.waterfallColumn}>
            {leftColumnCards.map((card) => (
              <AiRoleLibraryItem
                actionLabel={mode === 'apply_to_thread' ? '应用' : undefined}
                card={card}
                key={card.id}
                layoutMode="waterfall"
                onLongPress={toggleSelected}
                onPress={handlePressCard}
                onStartChat={handleStartChat}
                selected={selectedCardIds.includes(card.id)}
                selectionMode={selectedCardIds.length > 0}
                space={space}
              />
            ))}
          </View>
          <View style={styles.waterfallColumn}>
            {rightColumnCards.map((card) => (
              <AiRoleLibraryItem
                actionLabel={mode === 'apply_to_thread' ? '应用' : undefined}
                card={card}
                key={card.id}
                layoutMode="waterfall"
                onLongPress={toggleSelected}
                onPress={handlePressCard}
                onStartChat={handleStartChat}
                selected={selectedCardIds.includes(card.id)}
                selectionMode={selectedCardIds.length > 0}
                space={space}
              />
            ))}
          </View>
        </View>
      ) : (
        /* 列表模式：严格不加左右边框，全宽通栏伸展，信息横向充分利用 */
        <View style={styles.list}>
          {filteredCards.map((card) => (
            <AiRoleLibraryItem
              actionLabel={mode === 'apply_to_thread' ? '应用' : undefined}
              card={card}
              key={card.id}
              layoutMode="list"
              onLongPress={toggleSelected}
              onPress={handlePressCard}
              onStartChat={handleStartChat}
              selected={selectedCardIds.includes(card.id)}
              selectionMode={selectedCardIds.length > 0}
              space={space}
            />
          ))}
        </View>
      )}

      {/* 统一黑白底部操作抽屉：选择对话模式 */}
      <AppActionSheet
        cancelLabel="取消"
        closeOnSelect
        items={[
          {
            key: 'im',
            label: '即时短聊 (IM)',
            meta: '日常即时对话与微伴侣互动',
            icon: 'chatbubble-ellipses-outline',
            onPress: () => {
              if (chatChoiceCard && onStartImChat) {
                void onStartImChat(chatChoiceCard);
              }
            },
          },
          {
            key: 'chat',
            label: '深度长聊 (剧情)',
            meta: '长文本剧情对话与角色专属指令',
            icon: 'sparkles-outline',
            onPress: () => {
              if (chatChoiceCard) {
                void onStartChatWithRole(chatChoiceCard.id);
              }
            },
          },
        ]}
        message="选择你喜欢的交流模式开启新对话"
        onClose={() => setChatChoiceCard(null)}
        title={chatChoiceCard ? `开启与【${chatChoiceCard.name}】的对话` : '开启对话'}
        visible={Boolean(chatChoiceCard)}
      />

      {/* 统一黑白弹窗：批量删除角色卡 */}
      <AppDialog
        appearance="opaqueMonochrome"
        danger
        message={`将删除 ${selectedCardIds.length} 张已保存角色卡。已有聊天记录会保留当时的角色快照。`}
        onClose={() => setDeleteConfirmVisible(false)}
        onPrimary={() => {
          void deleteSelectedCards();
        }}
        primaryDisabled={!selectedCardIds.length}
        primaryLabel="确认删除"
        secondaryLabel="取消"
        title="删除所选角色卡？"
        visible={deleteConfirmVisible}
      />
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  waterfallScreenContainer: {
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[8],
  },
  listScreenContainer: {
    paddingHorizontal: 0,
    paddingBottom: spacing[8],
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1.5],
  },
  headerIconButton: {
    alignItems: 'center',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  headerAddButton: {
    borderColor: aiLightColors.primary,
  },
  filterSection: {
    gap: spacing[2],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[1],
  },
  searchBar: {
    alignItems: 'center',
    backgroundColor: aiLightColors.underlaySurface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    height: 36,
    paddingHorizontal: spacing[3],
  },
  searchInput: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    flex: 1,
    height: '100%',
    padding: 0,
  },
  categoryPillRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  categoryPill: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  categoryPillActive: {
    backgroundColor: aiLightColors.primarySoft,
  },
  categoryPillText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  categoryPillTextActive: {
    color: aiLightColors.primaryActive,
    fontWeight: '600',
  },
  // 列表模式：全宽无左右边框
  list: {
    width: '100%',
  },
  // 瀑布流网格
  waterfallGrid: {
    flexDirection: 'row',
    gap: spacing[2],
    width: '100%',
  },
  waterfallColumn: {
    flex: 1,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    paddingHorizontal: spacing[2],
  },
  emptyState: {
    alignItems: 'center',
    gap: rhythm.inlineGap,
    paddingVertical: spacing[10],
  },
  emptyTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    fontSize: 16,
  },
  emptyMeta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    textAlign: 'center',
  },
  emptyActions: {
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    marginTop: spacing[3],
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.ink,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing[4],
  },
  actionButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.onDark,
    fontWeight: '600',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderColor: aiLightColors.ink,
    borderWidth: StyleSheet.hairlineWidth,
  },
  outlineButtonText: {
    color: aiLightColors.ink,
  },
  dockContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  dockBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
  },
  dockBadgeText: {
    color: '#4B5563',
    fontSize: 12,
  },
  dockBadgeBold: {
    color: '#111827',
    fontWeight: '700',
  },
  dockActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  dockCancelBtn: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  dockCancelText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
  },
  dockDeleteBtn: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  dockDeleteText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.78,
  },
});
