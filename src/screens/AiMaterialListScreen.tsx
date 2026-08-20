import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiMaterialSourceSheet, type AiMaterialSourceKind } from '../components/ai/AiMaterialSourceSheet';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppDialog } from '../components/AppDialog';
import {
  listGlobalMaterialGroupPage,
  listMaterialsPage,
  removeMaterial,
  removeMaterials,
  retryMaterialParsing,
  type AiMaterialConversationGroup,
} from '../ai/aiDocumentService';
import type {
  AiDocumentRecord,
  DocumentOwnerGroupCursor,
  DocumentPageCursor,
} from '../database/repositories/aiKnowledgeRepository';
import type { AiDocumentOwnerType, AiDocumentStatus } from '../ai/types';
import { radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiMaterialListScreenProps {
  space: PixorySpace;
  knowledgeBaseId?: string;
  threadId?: string;
  ownerType?: AiDocumentOwnerType;
  ownerId?: string;
  ownerTitle?: string;
  onBack: () => void;
  onOpenDocument: (documentId: string, title: string) => void;
  onImportMaterial?: (threadId?: string, source?: AiMaterialSourceKind) => void;
  onOpenMaterialOwner?: (group: AiMaterialConversationGroup) => void;
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
const MATERIAL_PAGE_SIZE = 40;
const MATERIAL_GROUP_PAGE_SIZE = 20;

export function AiMaterialListScreen({ space, knowledgeBaseId, threadId, ownerType, ownerId, ownerTitle, onBack, onOpenDocument, onImportMaterial, onOpenMaterialOwner }: AiMaterialListScreenProps) {
  const [items, setItems] = useState<AiDocumentRecord[]>([]);
  const [conversationGroups, setConversationGroups] = useState<AiMaterialConversationGroup[]>([]);
  const [itemCursor, setItemCursor] = useState<DocumentPageCursor | null>(null);
  const [groupCursor, setGroupCursor] = useState<DocumentOwnerGroupCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmingBatchRemove, setConfirmingBatchRemove] = useState(false);
  const [sourceSheetVisible, setSourceSheetVisible] = useState(false);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const isGlobalView = !knowledgeBaseId && !threadId && !ownerId;
  const screenTitle = threadId ? '会话资料库' : knowledgeBaseId ? '知识库资料' : ownerTitle ?? '总资料库';

  const reload = useCallback(async () => {
    if (threadId) {
      setConversationGroups([]);
      const page = await listMaterialsPage({ limit: MATERIAL_PAGE_SIZE, space, threadId });
      setItems(page.items);
      setItemCursor(page.nextCursor);
      setGroupCursor(null);
      setHasMore(page.hasMore);
      return;
    }
    if (isGlobalView) {
      setItems([]);
      const page = await listGlobalMaterialGroupPage({ limit: MATERIAL_GROUP_PAGE_SIZE, space });
      setConversationGroups(page.items);
      setGroupCursor(page.nextCursor);
      setItemCursor(null);
      setHasMore(page.hasMore);
      return;
    }
    setConversationGroups([]);
    const page = await listMaterialsPage({
      knowledgeBaseId,
      limit: MATERIAL_PAGE_SIZE,
      ownerId,
      ownerType,
      space,
    });
    setItems(page.items);
    setItemCursor(page.nextCursor);
    setGroupCursor(null);
    setHasMore(page.hasMore);
  }, [isGlobalView, knowledgeBaseId, ownerId, ownerType, space, threadId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) {
      return;
    }
    setLoadingMore(true);
    try {
      if (isGlobalView) {
        const page = await listGlobalMaterialGroupPage({
          before: groupCursor,
          limit: MATERIAL_GROUP_PAGE_SIZE,
          space,
        });
        setConversationGroups((current) => {
          const existing = new Set(current.map((group) => `${group.ownerType}:${group.ownerId}`));
          return [...current, ...page.items.filter((group) => !existing.has(`${group.ownerType}:${group.ownerId}`))];
        });
        setGroupCursor(page.nextCursor);
        setHasMore(page.hasMore);
        return;
      }
      const page = await listMaterialsPage({
        before: itemCursor,
        knowledgeBaseId,
        limit: MATERIAL_PAGE_SIZE,
        ownerId,
        ownerType,
        space,
        threadId,
      });
      setItems((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !existing.has(item.id))];
      });
      setItemCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [groupCursor, hasMore, isGlobalView, itemCursor, knowledgeBaseId, loadingMore, ownerId, ownerType, space, threadId]);

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
    setStatus('资料及应用内副本已删除。');
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
    setStatus(`已删除 ${ids.length} 个资料及应用内副本。`);
    await reload();
  }

  function selectMaterialSource(source: AiMaterialSourceKind) {
    setSourceSheetVisible(false);
    onImportMaterial?.(threadId, source);
  }

  function renderMaterialRow(item: AiDocumentRecord, compact = false) {
    const selected = selectedIds.includes(item.id);
    return (
      <View key={item.id} style={[compact ? styles.groupMaterialRow : styles.row, selected && styles.selectedRow]}>
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
            <Ionicons color={aiLightColors.primaryActive} name={selected ? 'checkmark-circle' : iconForStatus(item.parserStatus)} size={20} />
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={compact ? 1 : undefined} style={styles.title}>{item.title}</Text>
            <Text numberOfLines={1} style={styles.meta}>{STATUS_LABELS[item.parserStatus]} · {item.originalFilename ?? '手动文本'}</Text>
            {!compact && item.parserError ? <Text style={styles.error}>{item.parserError}</Text> : null}
          </View>
        </Pressable>
        {!compact && item.parserStatus === 'failed' ? (
          <View style={styles.failedActions}>
            <AiLightButton label="重试" onPress={() => void retryDocument(item.id)} variant="outline" />
            <AiLightButton label="删除" onPress={() => void removeDocument(item.id)} variant="ghost" />
          </View>
        ) : null}
      </View>
    );
  }

  const affectedOwnerCount = isGlobalView
    ? new Set(
        conversationGroups.flatMap((group) =>
          group.materials
            .filter((material) => selectedIds.includes(material.id))
            .map(() => `${group.ownerType}:${group.ownerId}`)
        )
      ).size
    : selectedIds.length ? 1 : 0;

  const selectionFooter = selectedIds.length ? (
    <View style={styles.selectionFooter}>
      <View style={styles.selectionCopy}>
        <Text style={styles.selectionText}>已选择 {selectedIds.length} 个资料</Text>
        <Text style={styles.selectionMeta}>将删除应用内资料文件和索引；原始 IP 素材与系统文件不受影响。{affectedOwnerCount ? `受影响 ${affectedOwnerCount} 个来源。` : ''}</Text>
      </View>
      <View style={styles.selectionActions}>
        <AiLightButton label="批量删除" onPress={() => setConfirmingBatchRemove(true)} variant="outline" />
        <AiLightButton label="取消选择" onPress={() => setSelectedIds([])} variant="ghost" />
      </View>
    </View>
  ) : null;

  return (
    <AiLightScaffold
      bodyStyle={styles.body}
      footer={selectionFooter}
      onBack={onBack}
      subtitle={`${spaceLabel} · ${threadId ? '当前会话' : knowledgeBaseId ? '当前知识库' : ownerId ? '当前来源' : '按来源展示'}`}
      title={screenTitle}
    >
      <View style={styles.contentStack}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        {threadId && onImportMaterial ? (
          <AiLightButton label="添加资料" onPress={() => setSourceSheetVisible(true)} />
        ) : null}
        {isGlobalView ? (
          <FlatList
            contentContainerStyle={styles.list}
            data={conversationGroups}
            keyExtractor={(group) => `${group.ownerType}:${group.ownerId}`}
            ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.title}>还没有资料</Text></View>}
            ListFooterComponent={loadingMore ? <Text style={styles.loadingMore}>正在加载更多…</Text> : null}
            onEndReached={() => { void loadMore(); }}
            onEndReachedThreshold={0.6}
            renderItem={({ item: group }) => (
                <View
                  style={styles.groupRow}
                >
                  <View style={styles.groupHeader}>
                    <View style={styles.copy}>
                      <Text numberOfLines={1} style={styles.title}>{group.threadTitle}</Text>
                      <Text style={styles.meta}>{group.ownerLabel} · {group.materialCount} 份资料 · 最近更新 {group.updatedAt.slice(5, 10)}</Text>
                    </View>
                    {onOpenMaterialOwner ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          if (!selectedIds.length) {
                            onOpenMaterialOwner(group);
                          }
                        }}
                        style={({ pressed }) => [styles.openGroupButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.textActionLabel}>进入</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.groupMaterialList}>
                    {group.materials.map((material) => renderMaterialRow(material, true))}
                  </View>
                  {group.materialCount > group.materials.length ? (
                    <Text style={styles.previewNote}>仅预览最近 {group.materials.length} 份，进入后可查看全部</Text>
                  ) : null}
                </View>
            )}
            windowSize={7}
          />
        ) : (
          <FlatList
            contentContainerStyle={styles.list}
            data={items}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.title}>还没有材料</Text></View>}
            ListFooterComponent={loadingMore ? <Text style={styles.loadingMore}>正在加载更多…</Text> : null}
            onEndReached={() => { void loadMore(); }}
            onEndReachedThreshold={0.6}
            renderItem={({ item }) => renderMaterialRow(item)}
            windowSize={7}
          />
        )}
      </View>
      <AppDialog
        accent="ai"
        danger
        message={`将删除 ${selectedIds.length} 个资料的数据库记录、检索索引和应用内资料文件。原始 IP 素材与系统原文件不会被删除。${affectedOwnerCount ? `受影响 ${affectedOwnerCount} 个来源。` : ''}`}
        onClose={() => setConfirmingBatchRemove(false)}
        onPrimary={() => {
          void batchRemoveSelected();
        }}
        primaryDisabled={!selectedIds.length}
        primaryLabel="批量删除"
        title="删除所选资料？"
        visible={confirmingBatchRemove}
      />
      <AiMaterialSourceSheet
        onClose={() => setSourceSheetVisible(false)}
        onSelectSource={selectMaterialSource}
        visible={sourceSheetVisible}
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
  body: {
    flex: 1,
  },
  contentStack: {
    flex: 1,
    gap: rhythm.entryCardGap,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
  },
  loadingMore: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    paddingVertical: spacing[3],
    textAlign: 'center',
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
  groupMaterialList: {
    gap: rhythm.microGap,
  },
  groupMaterialRow: {
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.md,
    padding: spacing[2],
  },
  openGroupButton: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  selectedRow: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.primary,
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
  previewNote: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  meta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  textActionLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    fontWeight: '600',
  },
  error: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
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
