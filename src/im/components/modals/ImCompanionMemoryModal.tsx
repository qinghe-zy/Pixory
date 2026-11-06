import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PixorySpace } from '../../../database';
import { memoryRepository } from '../../../core/memory/memoryRepository';
import type { CompanionMemoryRecord, CompanionMemoryTier } from '../../../core/memory/memoryTypes';
import { colors } from '../../../design/tokens/colors';
import { rhythm } from '../../../design/tokens/rhythm';
import { spacing } from '../../../design/tokens/spacing';
import { metrics } from '../../../design/tokens/metrics';
import { radius } from '../../../design/tokens/radius';
import { shadows } from '../../../design/tokens/shadows';

export interface ImCompanionMemoryModalProps {
  visible: boolean;
  space: PixorySpace;
  roleCardId: string;
  companionName: string;
  onClose: () => void;
  onMemoryMutated?: () => void;
}

type FilterTab = 'all' | 'fact' | 'slot' | 'episode';

interface MemoryCardItemProps {
  item: CompanionMemoryRecord;
  onTogglePin: (item: CompanionMemoryRecord) => void;
  onEdit: (item: CompanionMemoryRecord) => void;
  onDelete: (item: CompanionMemoryRecord) => void;
}

const MemoryCardItem = React.memo(function MemoryCardItem({
  item,
  onTogglePin,
  onEdit,
  onDelete,
}: MemoryCardItemProps) {
  const isFact = item.tier === 'L2_FACT';
  const isSlot = item.tier === 'L1_SLOT';
  const tierLabel = isFact ? '核心设定' : isSlot ? '近期状态' : '共同回忆';

  let expiryStr: string | null = null;
  if (item.expiresAt) {
    const d = new Date(item.expiresAt);
    expiryStr = `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} 到期`;
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.tagGroup}>
          <View style={[styles.tierBadge, isFact && styles.tierBadgeFact, isSlot && styles.tierBadgeSlot]}>
            <Text style={styles.tierText}>{tierLabel}</Text>
          </View>
          {item.category && item.category !== 'user_custom' && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
          )}
          {expiryStr && (
            <View style={styles.expiryBadge}>
              <Ionicons color={colors.text.secondary} name="time-outline" size={11} />
              <Text style={styles.expiryText}>{expiryStr}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          accessibilityLabel={item.isPinned ? '取消置顶' : '置顶'}
          accessibilityRole="button"
          onPress={() => onTogglePin(item)}
          style={styles.iconBtn}
        >
          <Ionicons
            color={item.isPinned ? colors.text.gold : colors.text.secondary}
            name={item.isPinned ? 'star' : 'star-outline'}
            size={18}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.cardContent}>{item.content}</Text>

      <View style={styles.cardFooter}>
        <Text style={styles.dateText}>
          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
        </Text>
        <View style={styles.footerActions}>
          <TouchableOpacity
            accessibilityLabel="编辑记忆"
            accessibilityRole="button"
            onPress={() => onEdit(item)}
            style={styles.actionBtn}
          >
            <Ionicons color={colors.text.secondary} name="pencil-outline" size={16} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="删除记忆"
            accessibilityRole="button"
            onPress={() => onDelete(item)}
            style={styles.actionBtn}
          >
            <Ionicons color={colors.semantic.danger} name="trash-outline" size={16} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

export function ImCompanionMemoryModal({
  visible,
  space,
  roleCardId,
  companionName,
  onClose,
  onMemoryMutated,
}: ImCompanionMemoryModalProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [memories, setMemories] = useState<CompanionMemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletedUndoItem, setDeletedUndoItem] = useState<{ id: string; content: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索防抖 (150ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 150);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // 组件卸载时清理撤销定时器
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  // 新增/编辑弹窗状态
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingMemory, setEditingMemory] = useState<CompanionMemoryRecord | null>(null);
  const [inputContent, setInputContent] = useState('');

  const loadMemories = useCallback(async () => {
    if (!roleCardId) return;
    setLoading(true);
    try {
      const list = await memoryRepository.listCompanionMemoryBook(
        roleCardId,
        space,
        activeTab,
        debouncedQuery
      );
      setMemories(list);
    } catch {
      // 容错
    } finally {
      setLoading(false);
    }
  }, [roleCardId, space, activeTab, debouncedQuery]);

  useEffect(() => {
    if (visible) {
      void loadMemories();
    }
  }, [visible, loadMemories]);

  const handleTogglePin = useCallback(async (item: CompanionMemoryRecord) => {
    await memoryRepository.togglePinMemory(space, item.id);
    void loadMemories();
    onMemoryMutated?.();
  }, [space, loadMemories, onMemoryMutated]);

  const handleSoftDelete = useCallback((item: CompanionMemoryRecord) => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    void memoryRepository.softDeleteMemory(space, item.id);
    setDeletedUndoItem({ id: item.id, content: item.content });
    setMemories((prev) => prev.filter((m) => m.id !== item.id));
    onMemoryMutated?.();

    undoTimerRef.current = setTimeout(() => {
      setDeletedUndoItem(null);
    }, 5000);
  }, [space, onMemoryMutated]);

  const handleUndoDelete = useCallback(async () => {
    if (!deletedUndoItem) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    await memoryRepository.restoreSoftDeletedMemory(space, deletedUndoItem.id);
    setDeletedUndoItem(null);
    void loadMemories();
    onMemoryMutated?.();
  }, [deletedUndoItem, space, loadMemories, onMemoryMutated]);

  const handleSaveEdit = async () => {
    const text = inputContent.trim();
    if (!text) return;

    if (editingMemory) {
      await memoryRepository.updateMemoryContent(space, editingMemory.id, text);
    } else {
      await memoryRepository.createManualMemory(space, roleCardId, {
        content: text,
        tier: 'L2_FACT',
        category: 'user_custom',
        isPinned: false,
      });
    }

    setEditModalVisible(false);
    setEditingMemory(null);
    setInputContent('');
    void loadMemories();
    onMemoryMutated?.();
  };

  const openAddModal = () => {
    setEditingMemory(null);
    setInputContent('');
    setEditModalVisible(true);
  };

  const openEditModal = (item: CompanionMemoryRecord) => {
    setEditingMemory(item);
    setInputContent(item.content);
    setEditModalVisible(true);
  };

  const renderLoadingState = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator color={colors.primary.default} size="small" />
      <Text style={styles.loadingText}>正在调取记忆数据...</Text>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="bookmark-outline" size={48} color={colors.text.tertiary} />
      <Text style={styles.emptyTitle}>还没有专属默契</Text>
      <Text style={styles.emptyDesc}>
        聊天中提到你们的喜好、忌口、亲友或重要约定，会经由记忆系统自动沉淀到这里。
      </Text>
      <TouchableOpacity
        accessibilityLabel="手动添加第一条记忆"
        accessibilityRole="button"
        onPress={openAddModal}
        style={styles.emptyBtn}
      >
        <Ionicons name="add" size={18} color={colors.text.inverse} />
        <Text style={styles.emptyBtnText}>手动添加一条</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMemoryItem = useCallback(
    ({ item }: { item: CompanionMemoryRecord }) => (
      <MemoryCardItem
        item={item}
        onDelete={handleSoftDelete}
        onEdit={openEditModal}
        onTogglePin={handleTogglePin}
      />
    ),
    [handleSoftDelete, handleTogglePin]
  );

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              accessibilityLabel="关闭"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.headerCloseBtn}
            >
              <Ionicons name="close" size={24} color={colors.text.title} />
            </TouchableOpacity>
            <Text numberOfLines={1} style={styles.headerTitle}>
              与 {companionName} 的专属记忆
            </Text>
            <TouchableOpacity
              accessibilityLabel="记一条"
              accessibilityRole="button"
              onPress={openAddModal}
              style={styles.headerAddBtn}
            >
              <Ionicons name="add" size={20} color={colors.text.title} />
              <Text style={styles.headerAddText}>记一条</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={styles.searchRow}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color={colors.text.secondary} style={styles.searchIcon} />
              <TextInput
                onChangeText={setSearchQuery}
                placeholder="搜索偏好、雷区、约定..."
                placeholderTextColor={colors.text.placeholder}
                style={styles.searchInput}
                value={searchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <Ionicons name="close-circle" size={16} color={colors.text.secondary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Filter Tabs */}
          <View style={styles.tabsRow}>
            {[
              { key: 'all', label: '全部' },
              { key: 'fact', label: '核心设定' },
              { key: 'slot', label: '近期状态' },
              { key: 'episode', label: '共同回忆' },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key as FilterTab)}
                style={[styles.tabChip, activeTab === tab.key && styles.tabChipActive]}
              >
                <Text style={[styles.tabChipText, activeTab === tab.key && styles.tabChipTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* List */}
          <FlatList
            contentContainerStyle={memories.length === 0 ? styles.emptyListContent : styles.listContent}
            data={memories}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={loading ? renderLoadingState : renderEmptyState}
            renderItem={renderMemoryItem}
          />

          {/* Undo Toast */}
          {deletedUndoItem && (
            <View style={styles.undoToast}>
              <Text numberOfLines={1} style={styles.undoToastText}>
                已移除记忆「{deletedUndoItem.content}」
              </Text>
              <TouchableOpacity onPress={() => void handleUndoDelete()} style={styles.undoBtn}>
                <Text style={styles.undoBtnText}>撤销 (5s)</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Edit / Add Modal */}
          <Modal
            animationType="fade"
            onRequestClose={() => {
              setEditModalVisible(false);
              setEditingMemory(null);
            }}
            statusBarTranslucent
            transparent
            visible={editModalVisible}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
            >
              <View style={styles.editOverlay}>
                <Pressable
                  accessibilityLabel="关闭弹窗"
                  onPress={() => {
                    setEditModalVisible(false);
                    setEditingMemory(null);
                  }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.editCard}>
                  <Text style={styles.editTitle}>
                    {editingMemory ? '编辑专属记忆' : '添加专属记忆'}
                  </Text>
                  <TextInput
                    autoFocus
                    multiline
                    numberOfLines={4}
                    onChangeText={setInputContent}
                    placeholder="例如：忌口不吃香菜、常喝温开水、下周三下午有重要面试..."
                    placeholderTextColor={colors.text.placeholder}
                    style={styles.editInput}
                    value={inputContent}
                  />
                  <View style={styles.editActionRow}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditModalVisible(false);
                        setEditingMemory(null);
                      }}
                      style={styles.editCancelBtn}
                    >
                      <Text style={styles.editCancelText}>取消</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => void handleSaveEdit()} style={styles.editConfirmBtn}>
                      <Text style={styles.editConfirmText}>保存落盘</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay.scrim,
    justifyContent: 'flex-end',
  },
  container: {
    height: '88%',
    backgroundColor: colors.background.page,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 24,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  headerCloseBtn: {
    width: metrics.minTouchSize,
    height: metrics.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.title,
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: metrics.minTouchSize,
    height: metrics.minTouchSize,
    justifyContent: 'center',
  },
  headerAddText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.title,
    marginLeft: 2,
  },
  searchRow: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  searchBar: {
    height: metrics.searchHeight,
    backgroundColor: colors.background.input,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    ...shadows.xs,
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  clearSearchBtn: {
    padding: 4,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    gap: rhythm.microGap,
  },
  tabChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.background.tag,
    marginRight: 6,
  },
  tabChipActive: {
    backgroundColor: colors.primary.default,
  },
  tabChipText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  tabChipTextActive: {
    color: colors.text.inverse,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: spacing[4],
    gap: rhythm.listCardGap,
    paddingBottom: 40,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.md,
    padding: metrics.cardPadding,
    ...shadows.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  tagGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  tierBadge: {
    backgroundColor: colors.support.mint100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  tierBadgeFact: {
    backgroundColor: '#F3F4F6',
  },
  tierBadgeSlot: {
    backgroundColor: '#EBF5FF',
  },
  tierText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.title,
  },
  categoryBadge: {
    backgroundColor: colors.background.tag,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  categoryText: {
    fontSize: 10,
    color: colors.text.secondary,
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.semantic.warningBackground,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    gap: 3,
  },
  expiryText: {
    fontSize: 10,
    color: colors.semantic.warning,
  },
  iconBtn: {
    width: metrics.minTouchSize,
    height: metrics.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.body,
    marginBottom: spacing[2],
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
  dateText: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    width: metrics.minTouchSize,
    height: metrics.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[8],
    gap: spacing[2],
  },
  loadingText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.title,
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing[5],
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary.default,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    gap: 6,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.inverse,
  },
  undoToast: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: '#1F2937',
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.md,
  },
  undoToastText: {
    flex: 1,
    color: '#F9FAFB',
    fontSize: 13,
    marginRight: 12,
  },
  undoBtn: {
    minHeight: 32,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  undoBtnText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
  },
  editOverlay: {
    flex: 1,
    backgroundColor: colors.overlay.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
  },
  editCard: {
    width: '100%',
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    padding: spacing[5],
    ...shadows.md,
  },
  editTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.title,
    marginBottom: spacing[3],
  },
  editInput: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    padding: spacing[3],
    fontSize: 14,
    color: colors.text.primary,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: spacing[4],
  },
  editActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[3],
  },
  editCancelBtn: {
    minWidth: 64,
    minHeight: metrics.minTouchSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editCancelText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  editConfirmBtn: {
    backgroundColor: colors.primary.default,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    minHeight: metrics.minTouchSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editConfirmText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.inverse,
  },
});
