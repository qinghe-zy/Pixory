import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppActionSheet, type AppActionSheetItem } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { useToast } from '../components/AppToast';
import {
  createKnowledgeBase,
  deleteKnowledgeBases,
  getKnowledgeBaseDocCounts,
  listKnowledgeBases,
} from '../ai/aiDocumentService';
import type { AiKnowledgeBaseRecord } from '../database/repositories/aiKnowledgeRepository';
import { radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';
import { globalScrollState } from '../utils/scrollState';

interface AiKnowledgeBaseScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onImportMaterial: (knowledgeBaseId?: string) => void;
  onOpenMaterials: (knowledgeBaseId?: string) => void;
  onStartChat: (knowledgeBaseId: string | undefined, title: string) => void;
}

export function AiKnowledgeBaseScreen({
  space,
  onBack,
  onImportMaterial,
  onOpenMaterials,
  onStartChat,
}: AiKnowledgeBaseScreenProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<AiKnowledgeBaseRecord[]>([]);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [newKbName, setNewKbName] = useState('');
  const [activeMenuKb, setActiveMenuKb] = useState<AiKnowledgeBaseRecord | null>(null);
  const [confirmingDeleteKb, setConfirmingDeleteKb] = useState<AiKnowledgeBaseRecord | null>(null);
  const [confirmingBatchDelete, setConfirmingBatchDelete] = useState(false);

  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  const reload = useCallback(async () => {
    try {
      const [nextItems, counts] = await Promise.all([
        listKnowledgeBases(space),
        getKnowledgeBaseDocCounts(space),
      ]);
      setItems(nextItems);
      setDocCounts(counts);
    } catch {
      // 容错保持
    }
  }, [space]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate() {
    const trimmed = newKbName.trim();
    if (!trimmed) return;
    try {
      await createKnowledgeBase({ category: 'general', description: '', name: trimmed, space });
      setNewKbName('');
      setCreateDialogVisible(false);
      showToast('资料库已创建');
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建失败');
    }
  }

  function toggleSelected(knowledgeBaseId: string) {
    if (globalScrollState.isScrolling) return;
    setSelectedIds((current) =>
      current.includes(knowledgeBaseId)
        ? current.filter((id) => id !== knowledgeBaseId)
        : [...current, knowledgeBaseId]
    );
  }

  async function handleDeleteSingle(kb: AiKnowledgeBaseRecord) {
    try {
      await deleteKnowledgeBases({ knowledgeBaseIds: [kb.id], space });
      setConfirmingDeleteKb(null);
      showToast(`已删除资料库「${kb.name}」`);
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败');
    }
  }

  async function batchDeleteSelected() {
    if (!selectedIds.length) {
      setConfirmingBatchDelete(false);
      return;
    }
    try {
      const deletedCount = await deleteKnowledgeBases({ knowledgeBaseIds: selectedIds, space });
      setSelectedIds([]);
      setConfirmingBatchDelete(false);
      showToast(`已删除 ${deletedCount} 个资料库`);
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败');
    }
  }

  const menuItems: AppActionSheetItem[] = activeMenuKb
    ? [
        {
          key: 'import_material',
          label: '导入新材料',
          icon: 'cloud-upload-outline',
          onPress: () => {
            const kbId = activeMenuKb.id;
            setActiveMenuKb(null);
            onImportMaterial(kbId);
          },
        },
        {
          key: 'view_materials',
          label: '查看材料列表',
          icon: 'list-outline',
          onPress: () => {
            const kbId = activeMenuKb.id;
            setActiveMenuKb(null);
            onOpenMaterials(kbId);
          },
        },
        {
          key: 'delete_kb',
          label: '删除此资料库',
          icon: 'trash-outline',
          danger: true,
          onPress: () => {
            const kb = activeMenuKb;
            setActiveMenuKb(null);
            setConfirmingDeleteKb(kb);
          },
        },
      ]
    : [];

  const selectionFooter = selectedIds.length ? (
    <View style={styles.selectionFooter}>
      <View style={styles.selectionCopy}>
        <Text style={styles.selectionText}>已选择 {selectedIds.length} 个资料库</Text>
        <Text style={styles.selectionMeta}>
          将删除资料库、材料记录和本地索引，原始材料文件不会被物理删除。
        </Text>
      </View>
      <View style={styles.selectionActions}>
        <AiLightButton
          label="批量删除"
          onPress={() => setConfirmingBatchDelete(true)}
          variant="outline"
        />
        <AiLightButton label="取消选择" onPress={() => setSelectedIds([])} variant="ghost" />
      </View>
    </View>
  ) : null;

  return (
    <AiLightScaffold
      footer={selectionFooter}
      onBack={onBack}
      rightAction={
        <Pressable
          accessibilityLabel="新建资料库"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setCreateDialogVisible(true)}
          style={({ pressed }) => [styles.headerAddBtn, pressed && styles.pressed]}
        >
          <Ionicons color={aiLightColors.primary} name="add-circle" size={26} />
        </Pressable>
      }
      scrollable
      subtitle={spaceLabel}
      title="资料库"
    >
      <View style={styles.contentStack}>
        {items.length ? (
          <View style={styles.cardList}>
            {items.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const count = docCounts[item.id] ?? 0;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onLongPress={() => toggleSelected(item.id)}
                  onPress={() => {
                    if (selectedIds.length) {
                      toggleSelected(item.id);
                      return;
                    }
                    onOpenMaterials(item.id);
                  }}
                  style={({ pressed }) => [
                    styles.kbCard,
                    isSelected && styles.kbCardSelected,
                    pressed && styles.kbCardPressed,
                  ]}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.iconWrap}>
                      <Ionicons
                        color={aiLightColors.primary}
                        name={isSelected ? 'checkmark-circle' : 'library'}
                        size={20}
                      />
                    </View>
                    <View style={styles.cardMainInfo}>
                      <Text numberOfLines={1} style={styles.kbTitle}>
                        {item.name}
                      </Text>
                      <Text style={styles.kbSubtitle}>
                        {count > 0 ? `📚 ${count} 篇资料` : '暂无收录资料'} · 常驻设定与知识
                      </Text>
                    </View>
                    <Pressable
                      accessibilityLabel="更多操作"
                      hitSlop={12}
                      onPress={(e) => {
                        e.stopPropagation();
                        setActiveMenuKb(item);
                      }}
                      style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}
                    >
                      <Ionicons
                        color={aiLightColors.mutedSoft}
                        name="ellipsis-horizontal"
                        size={18}
                      />
                    </Pressable>
                  </View>

                  <View style={styles.cardBottomRow}>
                    <View style={styles.categoryChip}>
                      <Text style={styles.categoryChipText}>
                        {item.category === 'general' ? '通用资料' : item.category || '资料库'}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={6}
                      onPress={(e) => {
                        e.stopPropagation();
                        onStartChat(item.id, item.name);
                      }}
                      style={({ pressed }) => [styles.chatActionBtn, pressed && styles.pressed]}
                    >
                      <Ionicons
                        color={aiLightColors.primary}
                        name="chatbubble-ellipses-outline"
                        size={14}
                      />
                      <Text style={styles.chatActionText}>开启对话</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBadge}>
              <Ionicons color={aiLightColors.mutedSoft} name="library-outline" size={48} />
            </View>
            <Text style={styles.emptyTitle}>建立你的专属资料库</Text>
            <Text style={styles.emptyDesc}>
              在对话中发送的长文章或世界观设定，点击 📌 即可一键固化到这里，也可以直接创建新库归档资料。
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCreateDialogVisible(true)}
              style={({ pressed }) => [styles.emptyCreateBtn, pressed && styles.pressed]}
            >
              <Ionicons color="#fff" name="add" size={18} />
              <Text style={styles.emptyCreateText}>新建资料库</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* 新建资料库弹窗 */}
      <AppDialog
        accent="ai"
        onClose={() => {
          setCreateDialogVisible(false);
          setNewKbName('');
        }}
        onPrimary={() => void handleCreate()}
        primaryDisabled={!newKbName.trim()}
        primaryLabel="创建"
        secondaryLabel="取消"
        title="新建资料库"
        visible={createDialogVisible}
      >
        <TextInput
          autoFocus
          maxLength={30}
          onChangeText={setNewKbName}
          placeholder="例如：世界观设定集、产品说明书..."
          placeholderTextColor={aiLightColors.mutedSoft}
          selectionColor={aiLightColors.primary}
          style={styles.dialogInput}
          value={newKbName}
        />
      </AppDialog>

      {/* 单个资料库操作单 */}
      <AppActionSheet
        items={menuItems}
        message={activeMenuKb?.name}
        onClose={() => setActiveMenuKb(null)}
        title="资料库操作"
        visible={Boolean(activeMenuKb)}
      />

      {/* 删除单个资料库二次确认 */}
      <AppDialog
        accent="ai"
        danger
        message={`确定要删除「${confirmingDeleteKb?.name}」吗？\n将移除该资料库下的全部材料索引，原始文件不会被物理删除。`}
        onClose={() => setConfirmingDeleteKb(null)}
        onPrimary={() => {
          if (confirmingDeleteKb) void handleDeleteSingle(confirmingDeleteKb);
        }}
        primaryLabel="删除"
        secondaryLabel="取消"
        title="删除资料库"
        visible={Boolean(confirmingDeleteKb)}
      />

      {/* 批量删除二次确认 */}
      <AppDialog
        accent="ai"
        danger
        message={`将删除选中的 ${selectedIds.length} 个资料库及其内部索引。原始文件不受影响。`}
        onClose={() => setConfirmingBatchDelete(false)}
        onPrimary={() => void batchDeleteSelected()}
        primaryDisabled={!selectedIds.length}
        primaryLabel="批量删除"
        secondaryLabel="取消"
        title="批量删除资料库"
        visible={confirmingBatchDelete}
      />
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    paddingVertical: spacing[2],
    gap: rhythm.entryCardGap,
  },
  headerAddBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[1],
  },
  cardList: {
    gap: rhythm.listCardGap,
  },
  kbCard: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
    ...shadows.sm,
  },
  kbCardSelected: {
    borderColor: aiLightColors.primary,
    backgroundColor: aiLightColors.card,
  },
  kbCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  cardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  cardMainInfo: {
    flex: 1,
    gap: 2,
  },
  kbTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    fontSize: 16,
  },
  kbSubtitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  moreBtn: {
    padding: spacing[1.5],
  },
  cardBottomRow: {
    alignItems: 'center',
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing[2],
  },
  categoryChip: {
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  categoryChipText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
  },
  chatActionBtn: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
  },
  chatActionText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primary,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    gap: rhythm.cardContentGap,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[10],
  },
  emptyIconBadge: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 88,
    justifyContent: 'center',
    marginBottom: spacing[2],
    width: 88,
    ...shadows.sm,
  },
  emptyTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    fontSize: 17,
  },
  emptyDesc: {
    ...typography.textStyles.body,
    color: aiLightColors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyCreateBtn: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing[3],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
    ...shadows.sm,
  },
  emptyCreateText: {
    ...typography.textStyles.bodyStrong,
    color: '#ffffff',
    fontSize: 14,
  },
  dialogInput: {
    ...typography.textStyles.body,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    fontSize: 15,
    marginVertical: spacing[2],
    minHeight: 46,
    paddingHorizontal: spacing[3],
  },
  selectionFooter: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
    ...shadows.sm,
  },
  selectionCopy: {
    gap: rhythm.microGap,
  },
  selectionText: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  selectionMeta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  pressed: {
    opacity: 0.75,
  },
});
