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
import type { MemoryGraphHealthReport } from '../../../core/memory/memoryMetabolismService';
import type { CompanionMemoryRecord, CompanionMemoryTier } from '../../../core/memory/memoryTypes';
import { colors } from '../../../design/tokens/colors';
import { rhythm } from '../../../design/tokens/rhythm';
import { spacing } from '../../../design/tokens/spacing';
import { metrics } from '../../../design/tokens/metrics';
import { radius } from '../../../design/tokens/radius';
import { shadows } from '../../../design/tokens/shadows';
import { typography } from '../../../design/tokens/typography';

export interface ImCompanionMemoryModalProps {
  visible: boolean;
  space: PixorySpace;
  roleCardId: string;
  companionName: string;
  onClose: () => void;
  onMemoryMutated?: () => void;
}

type FilterTab = 'all' | 'fact' | 'slot' | 'episode';

interface HealFeedback {
  text: string;
  isError: boolean;
}

const FILTER_TABS: ReadonlyArray<{ key: FilterTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'fact', label: '核心设定' },
  { key: 'slot', label: '近期状态' },
  { key: 'episode', label: '共同回忆' },
];

const memoryKeyExtractor = (item: CompanionMemoryRecord) => item.id;

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
              <Ionicons color={colors.semantic.warning} name="time-outline" size={11} />
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
  const [listError, setListError] = useState<string | null>(null);
  const [deletedUndoItem, setDeletedUndoItem] = useState<{ id: string; content: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const memoriesReqSeqRef = useRef(0);
  const telemetryReqSeqRef = useRef(0);
  const [healthReport, setHealthReport] = useState<MemoryGraphHealthReport | null>(null);
  const [telemetryStatus, setTelemetryStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [healing, setHealing] = useState(false);
  const [healFeedback, setHealFeedback] = useState<HealFeedback | null>(null);

  // 搜索防抖 (150ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 150);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // 组件卸载时标记失效并清理撤销定时器
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  // 新增/编辑弹窗状态
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingMemory, setEditingMemory] = useState<CompanionMemoryRecord | null>(null);
  const [inputContent, setInputContent] = useState('');
  const [saving, setSaving] = useState(false);

  const loadHealthTelemetry = useCallback(async () => {
    if (!roleCardId) return;
    const reqSeq = ++telemetryReqSeqRef.current;
    setTelemetryStatus('loading');
    try {
      const report = await memoryRepository.runMemoryHealthAndCompile(roleCardId, space, {
        applyHealing: false,
      });
      if (!isMountedRef.current || reqSeq !== telemetryReqSeqRef.current) return;
      setHealthReport(report);
      setTelemetryStatus('ready');
    } catch {
      if (!isMountedRef.current || reqSeq !== telemetryReqSeqRef.current) return;
      setTelemetryStatus('error');
    }
  }, [roleCardId, space]);

  const loadMemories = useCallback(async () => {
    if (!roleCardId) return;
    const reqSeq = ++memoriesReqSeqRef.current;
    setLoading(true);
    setListError(null);
    try {
      const list = await memoryRepository.listCompanionMemoryBook(
        roleCardId,
        space,
        activeTab,
        debouncedQuery
      );
      if (!isMountedRef.current || reqSeq !== memoriesReqSeqRef.current) return;
      setMemories(list);
    } catch {
      if (!isMountedRef.current || reqSeq !== memoriesReqSeqRef.current) return;
      setListError('记忆数据加载失败，请重试');
    } finally {
      if (isMountedRef.current && reqSeq === memoriesReqSeqRef.current) {
        setLoading(false);
      }
    }
  }, [roleCardId, space, activeTab, debouncedQuery]);

  // 切换角色卡或空间时立即清空旧视图状态并作废未落盘异步请求，防止跨角色切换短暂闪现旧记忆
  useEffect(() => {
    memoriesReqSeqRef.current += 1;
    telemetryReqSeqRef.current += 1;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setMemories([]);
    setHealthReport(null);
    setTelemetryStatus('idle');
    setListError(null);
    setHealFeedback(null);
    setDeletedUndoItem(null);
  }, [roleCardId, space]);

  // 仅在弹窗打开或空间/角色切换时拉取一次图谱遥测，避免切换筛选标签或搜索打字触发全表重算
  useEffect(() => {
    if (visible) {
      setHealFeedback(null);
      void loadHealthTelemetry();
    }
  }, [visible, loadHealthTelemetry]);

  useEffect(() => {
    if (visible) {
      void loadMemories();
    }
  }, [visible, loadMemories]);

  const handleHealMemoryGraph = useCallback(async () => {
    if (!roleCardId || healing) return;
    setHealing(true);
    try {
      const report = await memoryRepository.runMemoryHealthAndCompile(roleCardId, space, {
        applyHealing: true,
      });
      if (!isMountedRef.current) return;
      setHealthReport(report);
      setTelemetryStatus('ready');
      const changedCount =
        report.orphanEntitiesBackfilled +
        report.ftsBackfilled +
        report.duplicatesMerged +
        report.clustersCompiled;
      if (changedCount > 0) {
        setHealFeedback({
          text: `补全 ${report.orphanEntitiesBackfilled} 实体 · 归并 ${report.duplicatesMerged} 重复 · 凝练 ${report.clustersCompiled} 脉络`,
          isError: false,
        });
        void loadMemories();
        onMemoryMutated?.();
      } else {
        setHealFeedback({
          text: '图谱结构健康，暂无碎片需整理',
          isError: false,
        });
      }
    } catch {
      if (isMountedRef.current) {
        setHealFeedback({
          text: '记忆巡检暂时不可用，请稍后重试',
          isError: true,
        });
      }
    } finally {
      if (isMountedRef.current) {
        setHealing(false);
      }
    }
  }, [roleCardId, space, healing, loadMemories, onMemoryMutated]);

  const handleTogglePin = useCallback(
    async (item: CompanionMemoryRecord) => {
      try {
        await memoryRepository.togglePinMemory(space, item.id);
        void loadMemories();
        onMemoryMutated?.();
      } catch {
        Alert.alert('操作失败', '无法切换置顶状态，请稍后重试');
      }
    },
    [space, loadMemories, onMemoryMutated]
  );

  const handleSoftDelete = useCallback(
    (item: CompanionMemoryRecord) => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      setMemories((prev) => prev.filter((m) => m.id !== item.id));
      void memoryRepository
        .softDeleteMemory(space, item.id)
        .then(() => {
          if (!isMountedRef.current) return;
          setDeletedUndoItem({ id: item.id, content: item.content });
          onMemoryMutated?.();
          void loadHealthTelemetry();
          undoTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setDeletedUndoItem(null);
            }
          }, 5000);
        })
        .catch(() => {
          if (!isMountedRef.current) return;
          void loadMemories();
          Alert.alert('删除失败', '无法移除该条记忆，请稍后重试');
        });
    },
    [space, loadMemories, loadHealthTelemetry, onMemoryMutated]
  );

  const handleUndoDelete = useCallback(async () => {
    if (!deletedUndoItem) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const targetId = deletedUndoItem.id;
    setDeletedUndoItem(null);
    try {
      await memoryRepository.restoreSoftDeletedMemory(space, targetId);
      void loadMemories();
      void loadHealthTelemetry();
      onMemoryMutated?.();
    } catch {
      Alert.alert('恢复失败', '无法撤销移除操作，请刷新后重试');
    }
  }, [deletedUndoItem, space, loadMemories, loadHealthTelemetry, onMemoryMutated]);

  const openAddModal = useCallback(() => {
    setEditingMemory(null);
    setInputContent('');
    setEditModalVisible(true);
  }, []);

  const openEditModal = useCallback((item: CompanionMemoryRecord) => {
    setEditingMemory(item);
    setInputContent(item.content);
    setEditModalVisible(true);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    if (saving) return;
    setEditModalVisible(false);
    setEditingMemory(null);
  }, [saving]);

  const handleSaveEdit = useCallback(async () => {
    const text = inputContent.trim();
    if (!text || saving) return;

    setSaving(true);
    try {
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

      if (!isMountedRef.current) return;
      setEditModalVisible(false);
      setEditingMemory(null);
      setInputContent('');
      void loadMemories();
      void loadHealthTelemetry();
      onMemoryMutated?.();
    } catch {
      Alert.alert('保存失败', '写入专属记忆失败，请稍后重试');
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  }, [inputContent, saving, editingMemory, space, roleCardId, loadMemories, loadHealthTelemetry, onMemoryMutated]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setActiveTab('all');
  }, []);

  const renderLoadingState = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator color={colors.primary.default} size="small" />
      <Text style={styles.loadingText}>正在调取记忆数据...</Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="alert-circle-outline" size={44} color={colors.semantic.danger} />
      <Text style={styles.emptyTitle}>读取记忆失败</Text>
      <Text style={styles.emptyDesc}>{listError}</Text>
      <TouchableOpacity
        accessibilityLabel="重新加载记忆"
        accessibilityRole="button"
        onPress={() => void loadMemories()}
        style={styles.emptyBtn}
      >
        <Ionicons name="refresh-outline" size={18} color={colors.text.inverse} />
        <Text style={styles.emptyBtnText}>重新加载</Text>
      </TouchableOpacity>
    </View>
  );

  const isFilteredEmpty = activeTab !== 'all' || debouncedQuery.length > 0;

  const renderEmptyState = () => {
    if (listError) {
      return renderErrorState();
    }
    if (isFilteredEmpty) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={44} color={colors.text.tertiary} />
          <Text style={styles.emptyTitle}>未找到匹配的记忆</Text>
          <Text style={styles.emptyDesc}>
            当前筛选分类或搜索词下暂无结果，可重置筛选查看全部记忆。
          </Text>
          <TouchableOpacity
            accessibilityLabel="重置筛选条件"
            accessibilityRole="button"
            onPress={handleResetFilters}
            style={styles.emptyBtn}
          >
            <Ionicons name="refresh-outline" size={18} color={colors.text.inverse} />
            <Text style={styles.emptyBtnText}>重置筛选条件</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
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
  };

  const renderMemoryItem = useCallback(
    ({ item }: { item: CompanionMemoryRecord }) => (
      <MemoryCardItem
        item={item}
        onDelete={handleSoftDelete}
        onEdit={openEditModal}
        onTogglePin={handleTogglePin}
      />
    ),
    [handleSoftDelete, openEditModal, handleTogglePin]
  );

  const canSaveEdit = inputContent.trim().length > 0 && !saving;

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
              与 {(companionName || '').trim() || 'TA'} 的专属记忆
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
                <TouchableOpacity
                  accessibilityLabel="清空搜索关键词"
                  accessibilityRole="button"
                  onPress={handleClearSearch}
                  style={styles.clearSearchBtn}
                >
                  <Ionicons name="close-circle" size={16} color={colors.text.secondary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Filter Tabs */}
          <View accessibilityRole="tablist" style={styles.tabsRow}>
            {FILTER_TABS.map((tab) => {
              const selected = activeTab === tab.key;
              return (
                <TouchableOpacity
                  accessibilityLabel={tab.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.tabChip, selected && styles.tabChipActive]}
                >
                  <Text style={[styles.tabChipText, selected && styles.tabChipTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Memory Graph Telemetry & Healing Strip */}
          {roleCardId ? (
            <View style={styles.telemetryStrip}>
              {healthReport ? (
                <View style={styles.telemetryStatsRow}>
                  <View style={styles.telemetryMetric}>
                    <Text style={styles.telemetryValue}>
                      {healthReport.entityNodeCount}/{healthReport.entityEdgeCount}
                    </Text>
                    <Text style={styles.telemetryLabel}>图谱点边</Text>
                  </View>
                  <View style={styles.telemetryDivider} />
                  <View style={styles.telemetryMetric}>
                    <Text style={styles.telemetryValue}>{healthReport.totalHits}</Text>
                    <Text style={styles.telemetryLabel}>回响命中</Text>
                  </View>
                  <View style={styles.telemetryDivider} />
                  <View style={styles.telemetryMetric}>
                    <Text style={styles.telemetryValue}>{healthReport.activeArcCount}</Text>
                    <Text style={styles.telemetryLabel}>待关怀约定</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityLabel="记忆图谱一键整理"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: healing }}
                    disabled={healing}
                    onPress={handleHealMemoryGraph}
                    style={styles.healBtn}
                  >
                    {healing ? (
                      <ActivityIndicator color={colors.text.title} size="small" />
                    ) : (
                      <>
                        <Ionicons name="sparkles-outline" size={13} color={colors.text.title} />
                        <Text style={styles.healBtnText}>深度整理</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : telemetryStatus === 'error' ? (
                <View style={styles.telemetryFallbackRow}>
                  <Text style={styles.telemetryErrorText}>图谱状态暂不可用</Text>
                  <TouchableOpacity
                    accessibilityLabel="重试读取记忆图谱状态"
                    accessibilityRole="button"
                    onPress={() => void loadHealthTelemetry()}
                    style={styles.healBtn}
                  >
                    <Ionicons name="refresh-outline" size={13} color={colors.text.title} />
                    <Text style={styles.healBtnText}>重试</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.telemetryFallbackRow}>
                  <ActivityIndicator color={colors.text.secondary} size="small" />
                  <Text style={styles.telemetryLoadingText}>正在统计图谱与脉络状态...</Text>
                </View>
              )}
              {healFeedback ? (
                <Text
                  numberOfLines={1}
                  style={[styles.telemetryHint, healFeedback.isError && styles.telemetryHintError]}
                >
                  {healFeedback.text}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* List */}
          <FlatList
            contentContainerStyle={memories.length === 0 ? styles.emptyListContent : styles.listContent}
            data={memories}
            keyExtractor={memoryKeyExtractor}
            ListEmptyComponent={loading && memories.length === 0 ? renderLoadingState : renderEmptyState}
            renderItem={renderMemoryItem}
          />

          {/* Undo Toast */}
          {deletedUndoItem && (
            <View accessibilityLiveRegion="polite" style={styles.undoToast}>
              <Text numberOfLines={1} style={styles.undoToastText}>
                已移除记忆「{deletedUndoItem.content}」
              </Text>
              <TouchableOpacity
                accessibilityLabel="撤销移除记忆"
                accessibilityRole="button"
                onPress={() => void handleUndoDelete()}
                style={styles.undoBtn}
              >
                <Text style={styles.undoBtnText}>撤销 (5s)</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Edit / Add Modal */}
          <Modal
            animationType="fade"
            onRequestClose={handleCloseEditModal}
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
                  onPress={handleCloseEditModal}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.editCard}>
                  <Text style={styles.editTitle}>
                    {editingMemory ? '编辑专属记忆' : '添加专属记忆'}
                  </Text>
                  <TextInput
                    autoFocus
                    editable={!saving}
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
                      accessibilityLabel="取消编辑记忆"
                      accessibilityRole="button"
                      disabled={saving}
                      onPress={handleCloseEditModal}
                      style={styles.editCancelBtn}
                    >
                      <Text style={styles.editCancelText}>取消</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityLabel={saving ? '正在保存' : '保存记忆落盘'}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !canSaveEdit }}
                      disabled={!canSaveEdit}
                      onPress={() => void handleSaveEdit()}
                      style={[styles.editConfirmBtn, !canSaveEdit && styles.editConfirmBtnDisabled]}
                    >
                      <Text style={styles.editConfirmText}>{saving ? '保存中...' : '保存落盘'}</Text>
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
    ...typography.textStyles.sectionTitle,
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
    ...typography.textStyles.body,
    fontWeight: typography.weight.medium,
    color: colors.text.title,
    marginLeft: spacing[1] / 2,
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
    paddingLeft: spacing[3],
    paddingRight: spacing[1],
    ...shadows.xs,
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  searchInput: {
    flex: 1,
    ...typography.textStyles.body,
    color: colors.text.primary,
  },
  clearSearchBtn: {
    width: metrics.minTouchSize,
    height: metrics.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    gap: rhythm.microGap,
  },
  tabChip: {
    minHeight: metrics.minTouchSize,
    justifyContent: 'center',
    paddingHorizontal: metrics.chipPaddingHorizontal,
    borderRadius: radius.pill,
    backgroundColor: colors.background.tag,
  },
  tabChipActive: {
    backgroundColor: colors.primary.default,
  },
  tabChipText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  tabChipTextActive: {
    color: colors.text.inverse,
    fontWeight: typography.weight.medium,
  },
  listContent: {
    paddingHorizontal: spacing[4],
    gap: rhythm.listCardGap,
    paddingBottom: spacing[10],
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
    gap: spacing[1.5],
  },
  tierBadge: {
    backgroundColor: colors.background.soft,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1] / 2,
    borderRadius: radius.xs,
  },
  tierBadgeFact: {
    backgroundColor: colors.overlay.selectedGold,
  },
  tierBadgeSlot: {
    backgroundColor: colors.semantic.warningBackground,
  },
  tierText: {
    ...typography.textStyles.micro,
    fontWeight: typography.weight.medium,
    color: colors.text.title,
  },
  categoryBadge: {
    backgroundColor: colors.background.tag,
    paddingHorizontal: spacing[1.5],
    paddingVertical: spacing[1] / 2,
    borderRadius: radius.xs,
  },
  categoryText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.semantic.warningBackground,
    paddingHorizontal: spacing[1.5],
    paddingVertical: spacing[1] / 2,
    borderRadius: radius.xs,
    gap: spacing[1] / 2,
  },
  expiryText: {
    ...typography.textStyles.micro,
    color: colors.semantic.warning,
  },
  iconBtn: {
    width: metrics.minTouchSize,
    height: metrics.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    ...typography.textStyles.body,
    color: colors.text.body,
    marginBottom: spacing[2],
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing[1.5],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
  dateText: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
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
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  emptyTitle: {
    ...typography.textStyles.emptyTitle,
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  emptyDesc: {
    ...typography.textStyles.emptyDescription,
    textAlign: 'center',
    marginBottom: spacing[5],
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary.default,
    paddingHorizontal: spacing[4],
    minHeight: metrics.minTouchSize,
    borderRadius: radius.md,
    gap: spacing[1.5],
  },
  emptyBtnText: {
    ...typography.textStyles.body,
    fontWeight: typography.weight.medium,
    color: colors.text.inverse,
  },
  undoToast: {
    position: 'absolute',
    bottom: spacing[6],
    left: spacing[5],
    right: spacing[5],
    backgroundColor: colors.primary.default,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.md,
  },
  undoToastText: {
    flex: 1,
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    marginRight: spacing[3],
  },
  undoBtn: {
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[2],
    justifyContent: 'center',
  },
  undoBtnText: {
    ...typography.textStyles.caption,
    color: colors.text.gold,
    fontWeight: typography.weight.semibold,
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
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
    marginBottom: spacing[3],
  },
  editInput: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    padding: spacing[3],
    ...typography.textStyles.body,
    color: colors.text.primary,
    minHeight: 100, // 多行输入区域最小视觉高度
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
    ...typography.textStyles.body,
    color: colors.text.secondary,
  },
  editConfirmBtn: {
    backgroundColor: colors.primary.default,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    minHeight: metrics.minTouchSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editConfirmBtnDisabled: {
    opacity: 0.45,
  },
  editConfirmText: {
    ...typography.textStyles.body,
    fontWeight: typography.weight.medium,
    color: colors.text.inverse,
  },
  telemetryStrip: {
    marginHorizontal: spacing[4],
    marginBottom: rhythm.listCardGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.background.surface,
    borderRadius: radius.md,
    borderWidth: 1, // 1px 极细卡片边框
    borderColor: colors.border.divider,
    ...shadows.xs,
  },
  telemetryFallbackRow: {
    minHeight: metrics.minTouchSize,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  telemetryLoadingText: {
    flex: 1,
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  telemetryErrorText: {
    flex: 1,
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  telemetryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  telemetryMetric: {
    alignItems: 'flex-start',
    flex: 1,
  },
  telemetryValue: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  telemetryLabel: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  telemetryDivider: {
    width: 1, // 1px 竖向视觉分隔线
    height: spacing[5],
    backgroundColor: colors.border.divider,
  },
  healBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    minHeight: metrics.minTouchSize,
    borderRadius: radius.pill,
    backgroundColor: colors.background.tag,
  },
  healBtnText: {
    ...typography.textStyles.caption,
    fontWeight: typography.weight.medium,
    color: colors.text.title,
  },
  telemetryHint: {
    ...typography.textStyles.micro,
    marginTop: spacing[1],
    color: colors.semantic.taskSuccess,
  },
  telemetryHintError: {
    color: colors.semantic.danger,
  },
});
