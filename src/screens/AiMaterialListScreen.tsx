import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppDialog } from '../components/AppDialog';
import {
  listGlobalMaterialsGroupedByThread,
  listMaterials,
  listThreadMaterials,
  removeMaterial,
  removeMaterials,
  retryMaterialParsing,
  type AiMaterialConversationGroup,
} from '../ai/aiDocumentService';
import type { AiDocumentRecord } from '../database/repositories/aiKnowledgeRepository';
import type { AiDocumentStatus } from '../ai/types';
import { radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiMaterialListScreenProps {
  space: PixorySpace;
  knowledgeBaseId?: string;
  threadId?: string;
  onBack: () => void;
  onOpenDocument: (documentId: string, title: string) => void;
  onImportMaterial?: (threadId?: string) => void;
  onOpenThreadMaterials?: (threadId: string, title: string) => void;
}

const STATUS_LABELS: Record<AiDocumentStatus, string> = {
  pending: '等待',
  parsing: '处理中',
  parsed: '可用',
  chunked: '可用',
  searchable: '可用',
  embedding_pending: '处理中',
  embedding_ready: '可用',
  failed: '失败',
};

const RECOVERABLE_PARSE_ACTION = '重试解析';

export function AiMaterialListScreen({ space, knowledgeBaseId, threadId, onBack, onOpenDocument, onImportMaterial, onOpenThreadMaterials }: AiMaterialListScreenProps) {
  const [items, setItems] = useState<AiDocumentRecord[]>([]);
  const [conversationGroups, setConversationGroups] = useState<AiMaterialConversationGroup[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmingBatchRemove, setConfirmingBatchRemove] = useState(false);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const isGlobalView = !knowledgeBaseId && !threadId;
  const screenTitle = threadId ? '会话资料库' : '总资料库';

  const reload = useCallback(async () => {
    if (threadId) {
      setConversationGroups([]);
      setItems(await listThreadMaterials({ space, threadId }));
      return;
    }
    if (isGlobalView) {
      setItems([]);
      setConversationGroups(await listGlobalMaterialsGroupedByThread({ space }));
      return;
    }
    setConversationGroups([]);
    setItems(await listMaterials({ knowledgeBaseId, space }));
  }, [isGlobalView, knowledgeBaseId, space, threadId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function retryDocument(documentId: string) {
    try {
      await retryMaterialParsing({ documentId, space });
      setStatus('已重新解析材料。');
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重试失败');
    }
  }

  async function removeDocument(documentId: string) {
    await removeMaterial({ documentId, space });
    setStatus('材料记录已移除。');
    setSelectedIds((current) => current.filter((id) => id !== documentId));
    await reload();
  }

  function toggleSelected(documentId: string) {
    setSelectedIds((current) => current.includes(documentId) ? current.filter((id) => id !== documentId) : [...current, documentId]);
  }

  async function batchRemoveSelected() {
    const ids = selectedIds;
    if (!ids.length) {
      setConfirmingBatchRemove(false);
      return;
    }
    await removeMaterials({ documentIds: ids, space });
    setSelectedIds([]);
    setConfirmingBatchRemove(false);
    setStatus(`已批量移除 ${ids.length} 个材料。`);
    await reload();
  }

  const selectionFooter = selectedIds.length ? (
    <View style={styles.selectionFooter}>
      <View style={styles.selectionCopy}>
        <Text style={styles.selectionText}>已选择 {selectedIds.length} 个材料</Text>
        <Text style={styles.selectionMeta}>只移除材料记录和本地索引，不会删除原始素材。</Text>
      </View>
      <View style={styles.selectionActions}>
        <AiLightButton label="批量移除" onPress={() => setConfirmingBatchRemove(true)} variant="outline" />
        <AiLightButton label="取消选择" onPress={() => setSelectedIds([])} variant="ghost" />
      </View>
    </View>
  ) : null;

  return (
    <AiLightScaffold
      footer={selectionFooter}
      onBack={onBack}
      scrollable
      subtitle={`${spaceLabel} · ${threadId ? '当前会话' : knowledgeBaseId ? '当前知识库' : '按对话展示'}`}
      title={screenTitle}
    >
      <View style={styles.contentStack}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        {threadId && onImportMaterial ? (
          <AiLightButton label="添加资料" onPress={() => onImportMaterial(threadId)} />
        ) : null}
        <View style={styles.list}>
          {isGlobalView ? (
            conversationGroups.length ? (
              conversationGroups.map((group) => (
                <Pressable
                  accessibilityRole="button"
                  key={group.threadId}
                  onPress={() => onOpenThreadMaterials?.(group.threadId, group.threadTitle)}
                  style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}
                >
                  <View style={styles.groupHeader}>
                    <View style={styles.copy}>
                      <Text numberOfLines={1} style={styles.title}>{group.threadTitle}</Text>
                      <Text style={styles.meta}>{group.materialCount} 份资料 · 最近更新 {group.updatedAt.slice(5, 10)}</Text>
                    </View>
                    <Text style={styles.textActionLabel}>进入</Text>
                  </View>
                  {group.materials[0] ? (
                    <View style={styles.groupMaterialPreview}>
                      <View style={styles.iconWrap}>
                        <Ionicons color={aiLightColors.coralActive} name={iconForStatus(group.materials[0].parserStatus)} size={18} />
                      </View>
                      <View style={styles.copy}>
                        <Text numberOfLines={1} style={styles.previewTitle}>{group.materials[0].title}</Text>
                        <Text numberOfLines={1} style={styles.meta}>{STATUS_LABELS[group.materials[0].parserStatus]} · {group.materials[0].originalFilename ?? '手动文本'}</Text>
                      </View>
                    </View>
                  ) : null}
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.title}>还没有会话资料</Text>
              </View>
            )
          ) : items.length ? (
            items.map((item) => {
              const selected = selectedIds.includes(item.id);
              return (
              <View key={item.id} style={[styles.row, selected && styles.selectedRow]}>
                <Pressable
                  accessibilityRole="button"
                  onLongPress={() => toggleSelected(item.id)}
                  onPress={() => {
                    if (selectedIds.length) {
                      toggleSelected(item.id);
                      return;
                    }
                    onOpenDocument(item.id, item.title);
                  }}
                  style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                >
                  <View style={styles.iconWrap}>
                    <Ionicons color={aiLightColors.coralActive} name={selected ? 'checkmark-circle' : iconForStatus(item.parserStatus)} size={20} />
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.meta}>{STATUS_LABELS[item.parserStatus]} · {item.originalFilename ?? '手动文本'}</Text>
                    {item.parserError ? <Text style={styles.error}>{item.parserError}</Text> : null}
                  </View>
                </Pressable>
                {item.parserStatus === 'failed' ? (
                  <View style={styles.failedActions}>
                    <AiLightButton label="重试" onPress={() => void retryDocument(item.id)} variant="outline" />
                    <AiLightButton label="移除" onPress={() => void removeDocument(item.id)} variant="ghost" />
                  </View>
                ) : null}
              </View>
            );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.title}>还没有材料</Text>
            </View>
          )}
        </View>
      </View>
      <AppDialog
        danger
        message="将从材料列表和本地知识索引中移除所选记录。原始导入文件仍在应用材料目录中按普通文件保存。"
        onClose={() => setConfirmingBatchRemove(false)}
        onPrimary={() => {
          void batchRemoveSelected();
        }}
        primaryDisabled={!selectedIds.length}
        primaryLabel="批量移除"
        title="移除所选材料？"
        visible={confirmingBatchRemove}
      />
    </AiLightScaffold>
  );
}

function iconForStatus(status: AiDocumentStatus): keyof typeof Ionicons.glyphMap {
  if (status === 'failed') {
    return 'alert-circle-outline';
  }
  if (status === 'searchable' || status === 'embedding_ready') {
    return 'checkmark-circle-outline';
  }
  return 'document-text-outline';
}

const styles = StyleSheet.create({
  contentStack: {
    gap: rhythm.entryCardGap,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  list: {
    gap: rhythm.listCardGap,
  },
  row: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  groupRow: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  groupMaterialPreview: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    padding: spacing[2],
  },
  selectedRow: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.coral,
  },
  rowMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
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
  previewTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    fontSize: 14,
    lineHeight: 19,
  },
  meta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  textActionLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  error: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  failedActions: {
    gap: rhythm.inlineGap,
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing[4],
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
