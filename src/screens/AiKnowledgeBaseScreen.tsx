import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppDialog } from '../components/AppDialog';
import { createKnowledgeBase, deleteKnowledgeBases, listKnowledgeBases } from '../ai/aiDocumentService';
import type { AiKnowledgeBaseRecord } from '../database/repositories/aiKnowledgeRepository';
import { radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiKnowledgeBaseScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onImportMaterial: (knowledgeBaseId?: string) => void;
  onOpenMaterials: (knowledgeBaseId?: string) => void;
  onStartChat: (knowledgeBaseId: string | undefined, title: string) => void;
}

export function AiKnowledgeBaseScreen({ space, onBack, onImportMaterial, onOpenMaterials, onStartChat }: AiKnowledgeBaseScreenProps) {
  const [items, setItems] = useState<AiKnowledgeBaseRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmingBatchDelete, setConfirmingBatchDelete] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  async function reload() {
    const nextItems = await listKnowledgeBases(space);
    setItems(nextItems);
    setSelectedId((current) => nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id);
  }

  useEffect(() => {
    void reload();
  }, [space]);

  async function handleCreate() {
    try {
      const created = await createKnowledgeBase({ category: 'general', description: '', name, space });
      setName('');
      setSelectedId(created.id);
      setStatus('已创建。');
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '创建失败');
    }
  }

  function toggleSelected(knowledgeBaseId: string) {
    setSelectedIds((current) => current.includes(knowledgeBaseId) ? current.filter((id) => id !== knowledgeBaseId) : [...current, knowledgeBaseId]);
  }

  async function batchDeleteSelected() {
    const ids = selectedIds;
    if (!ids.length) {
      setConfirmingBatchDelete(false);
      return;
    }
    try {
      const deletedCount = await deleteKnowledgeBases({ knowledgeBaseIds: ids, space });
      setSelectedIds([]);
      setConfirmingBatchDelete(false);
      setStatus(`已删除 ${deletedCount} 个知识库。`);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '删除失败');
    }
  }

  const selectionFooter = selectedIds.length ? (
    <View style={styles.selectionFooter}>
      <View style={styles.selectionCopy}>
        <Text style={styles.selectionText}>已选择 {selectedIds.length} 个知识库</Text>
        <Text style={styles.selectionMeta}>会删除知识库、材料记录和本地索引，不会删除原始材料文件。</Text>
      </View>
      <View style={styles.selectionActions}>
        <AiLightButton label="批量删除" onPress={() => setConfirmingBatchDelete(true)} variant="outline" />
        <AiLightButton label="取消选择" onPress={() => setSelectedIds([])} variant="ghost" />
      </View>
    </View>
  ) : null;

  return (
    <AiLightScaffold
      footer={selectionFooter}
      onBack={onBack}
      scrollable
      subtitle={spaceLabel}
      title="资料库"
    >
      <View style={styles.contentStack}>
        <AiLightCard>
          <Text style={styles.sectionTitle}>新建资料库</Text>
          <TextInput
            onChangeText={setName}
            placeholder="名称"
            placeholderTextColor={aiLightColors.mutedSoft}
            selectionColor={aiLightColors.primary}
            style={styles.input}
            value={name}
          />
          <AiLightButton disabled={!name.trim()} label="创建" onPress={() => void handleCreate()} variant="outline" />
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </AiLightCard>

        <View style={styles.list}>
          {items.length ? (
            items.map((item) => {
              const selectedItem = item.id === selectedId;
              const batchSelected = selectedIds.includes(item.id);
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
                    setSelectedId(item.id);
                  }}
                  style={({ pressed }) => [styles.kbRow, selectedItem && styles.selectedRow, batchSelected && styles.batchSelectedRow, pressed && styles.pressed]}
                >
                  <View style={styles.kbIcon}>
                    <Ionicons color={aiLightColors.primaryActive} name={batchSelected ? 'checkmark-circle' : selectedItem ? 'radio-button-on' : 'library-outline'} size={20} />
                  </View>
                  <View style={styles.kbCopy}>
                    <Text style={styles.kbName}>{item.name}</Text>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.sectionTitle}>还没有资料库</Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <AiLightButton label="导入材料" onPress={() => onImportMaterial(selected?.id)} variant="outline" />
          <AiLightButton label="材料列表" onPress={() => onOpenMaterials(selected?.id)} variant="outline" />
          <AiLightButton
            disabled={!selected}
            label="开始聊天"
            onPress={() => {
              if (selected) {
                onStartChat(selected.id, selected.name);
              }
            }}
          />
        </View>
      </View>
      <AppDialog
        accent="ai"
        danger
        message={`将删除 ${selectedIds.length} 个知识库，并移除其中的材料记录和本地知识索引。原始材料文件不会被删除。`}
        onClose={() => setConfirmingBatchDelete(false)}
        onPrimary={() => {
          void batchDeleteSelected();
        }}
        primaryDisabled={!selectedIds.length}
        primaryLabel="批量删除"
        title="删除所选知识库？"
        visible={confirmingBatchDelete}
      />
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: rhythm.entryCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
  },
  input: {
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
  list: {
    gap: rhythm.listCardGap,
  },
  kbRow: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    padding: spacing[3],
  },
  selectedRow: {
    borderColor: aiLightColors.primary,
  },
  batchSelectedRow: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.primary,
  },
  pressed: {
    opacity: 0.78,
  },
  kbIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  kbCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  kbName: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing[4],
  },
  actions: {
    gap: rhythm.inlineGap,
  },
  selectionFooter: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
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
    gap: rhythm.inlineGap,
  },
});
