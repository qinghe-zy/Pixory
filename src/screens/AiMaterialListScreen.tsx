import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiMaterialSourceSheet, type AiMaterialSourceKind } from '../components/ai/AiMaterialSourceSheet';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppDialog } from '../components/AppDialog';
import { useToast } from '../components/AppToast';
import { DocumentBubbleCard } from '../components/document/DocumentBubbleCard';
import {
  injectDocumentToContext,
  removeDocumentFromContext,
} from '../ai/aiDocumentPinService';
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
import { recordDiagnosticEvent } from '../diagnostics/diagnosticLogger';
import { globalScrollState, createScrollHandlers } from '../utils/scrollState';

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
    const startedAt = Date.now();
    const traceId = `materials-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    recordDiagnosticEvent({ eventType: 'materials_load_started', space, traceId, payload: { global: isGlobalView, thread: Boolean(threadId), knowledgeBase: Boolean(knowledgeBaseId) } });
    if (threadId) {
      setConversationGroups([]);
      const page = await listMaterialsPage({ limit: MATERIAL_PAGE_SIZE, space, threadId });
      setItems(page.items);
      setItemCursor(page.nextCursor);
      setGroupCursor(null);
      setHasMore(page.hasMore);
      recordDiagnosticEvent({ eventType: 'materials_load_completed', space, traceId, durationMs: Date.now() - startedAt, payload: { itemCount: page.items.length, groupCount: 0, hasMore: page.hasMore } });
      return;
    }
    if (isGlobalView) {
      setItems([]);
      const page = await listGlobalMaterialGroupPage({ limit: MATERIAL_GROUP_PAGE_SIZE, space });
      setConversationGroups(page.items);
      setGroupCursor(page.nextCursor);
      setItemCursor(null);
      setHasMore(page.hasMore);
      recordDiagnosticEvent({ eventType: 'materials_load_completed', space, traceId, durationMs: Date.now() - startedAt, payload: { itemCount: page.items.length, groupCount: 0, hasMore: page.hasMore } });
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
    recordDiagnosticEvent({ eventType: 'materials_load_completed', space, traceId, durationMs: Date.now() - startedAt, payload: { itemCount: page.items.length, groupCount: page.items.length, hasMore: page.hasMore } });
  }, [isGlobalView, knowledgeBaseId, ownerId, ownerType, space, threadId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) {
      return;
    }
    setLoadingMore(true);
    const startedAt = Date.now();
    const traceId = 'materials-page-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    recordDiagnosticEvent({ eventType: 'materials_page_started', space, traceId, payload: { global: isGlobalView } });
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
        recordDiagnosticEvent({ eventType: 'materials_page_completed', space, traceId, durationMs: Date.now() - startedAt, payload: { loadedCount: page.items.length, hasMore: page.hasMore } });
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
      recordDiagnosticEvent({ eventType: 'materials_page_completed', space, traceId, durationMs: Date.now() - startedAt, payload: { loadedCount: page.items.length, hasMore: page.hasMore } });
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

  const { showToast } = useToast();

  function getDocCharCountAndInjected(doc: AiDocumentRecord): { charCount: number; isInjected: boolean } {
    try {
      const meta = JSON.parse(doc.metadataJson || '{}');
      return {
        charCount: typeof meta.charCount === 'number' ? meta.charCount : Math.round((doc.fileSize ?? 1000) / 2),
        isInjected: Boolean(meta.injectedToContext),
      };
    } catch {
      return { charCount: Math.round((doc.fileSize ?? 1000) / 2), isInjected: false };
    }
  }

  async function handleTogglePin(item: AiDocumentRecord, itemThreadId?: string) {
    const effectiveThreadId = itemThreadId ?? threadId ?? (item.ownerType === 'thread' ? item.ownerId : undefined);
    if (!effectiveThreadId) {
      showToast('当前资料库尚未关联具体对话，请先在对话中引用该资料');
      return;
    }
    const { charCount, isInjected } = getDocCharCountAndInjected(item);
    try {
      if (isInjected) {
        await removeDocumentFromContext({ space, documentId: item.id, threadId: effectiveThreadId });
        showToast('已取消原文注入上下文');
        await reload();
      } else {
        if (charCount >= 2500) {
          showToast('文档正文超过 2500 字符，无法纳入上下文前缀');
          return;
        }
        const res = await injectDocumentToContext({ space, documentId: item.id, threadId: effectiveThreadId });
        if (res.success) {
          showToast('已原文注入上下文');
          await reload();
        } else if (res.reason === 'overflow') {
          showToast('注入原文字符较多，无法增加新的文档');
        } else if (res.reason === 'too_large') {
          showToast(`文档超过 ${res.limit} 字符，无法全文常驻`);
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败');
    }
  }

  function renderMaterialRow(item: AiDocumentRecord, itemThreadId?: string) {
    const { charCount, isInjected } = getDocCharCountAndInjected(item);
    const isShort = charCount > 0 && charCount < 2500;
    const pinState: 'red' | 'gray' | 'none' = isInjected ? 'red' : isShort ? 'gray' : 'none';

    return (
      <View key={item.id} style={styles.materialRowWrap}>
        <DocumentBubbleCard
          charCount={charCount}
          flatStyle
          fullWidth
          onLongPress={() => {
            if (globalScrollState.isScrolling) return;
            toggleSelected(item.id);
          }}
          onPress={() => {
            if (selectedIds.length) {
              toggleSelected(item.id);
              return;
            }
            onOpenDocument(item.id, item.title);
          }}
          onPressPin={() => void handleTogglePin(item, itemThreadId)}
          pinState={pinState}
          selectionState={
            selectedIds.length > 0
              ? selectedIds.includes(item.id)
                ? 'selected'
                : 'unselected'
              : 'none'
          }
          sizeBytes={item.fileSize ?? undefined}
          title={item.title}
        />
        {item.parserStatus === 'failed' ? (
          <View style={styles.failedRow}>
            <Text style={styles.failedText}>{item.parserError ?? '解析失败'}</Text>
            <View style={styles.failedActions}>
              <AiLightButton label="重试" onPress={() => void retryDocument(item.id)} variant="outline" />
              <AiLightButton label="删除" onPress={() => void removeDocument(item.id)} variant="ghost" />
            </View>
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

  const renderEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Ionicons color={aiLightColors.muted} name="document-text-outline" size={44} style={{ marginBottom: spacing[2] }} />
      <Text style={styles.emptyTitle}>还没有参考资料</Text>
      <Text style={styles.emptyDescription}>
        {threadId
          ? '导入文档、长文本或素材后，AI 即可在回答时引用相关知识背景。'
          : '各个会话沉淀的知识与参考资料会统一聚合在此处展示。'}
      </Text>
      {threadId && onImportMaterial ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setSourceSheetVisible(true)}
          style={({ pressed }) => [styles.emptyActionButton, pressed && styles.pressed]}
        >
          <Ionicons color="#ffffff" name="add" size={16} />
          <Text style={styles.emptyActionText}>添加资料</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const listHeader = (
    <View style={styles.listHeaderWrap}>
      {status ? <Text style={styles.statusText}>{status}</Text> : null}
      {threadId && onImportMaterial ? (
        <View style={styles.addBtnWrap}>
          <AiLightButton label="添加资料" onPress={() => setSourceSheetVisible(true)} />
        </View>
      ) : null}
    </View>
  );

  return (
    <AiLightScaffold
      bodyStyle={styles.body}
      footer={selectionFooter}
      footerNaked
      fullBleed
      hideStatusBarShield
      onBack={onBack}
      subtitle={`${spaceLabel} · ${threadId ? '当前会话' : knowledgeBaseId ? '当前知识库' : ownerId ? '当前来源' : '按来源展示'}`}
      title={screenTitle}
    >
      <View style={styles.contentStack}>
        {isGlobalView ? (
          <FlatList
            {...createScrollHandlers()}
            contentContainerStyle={styles.fullBleedList}
            data={conversationGroups}
            keyExtractor={(group) => `${group.ownerType}:${group.ownerId}`}
            ListEmptyComponent={renderEmptyComponent()}
            ListFooterComponent={loadingMore ? <Text style={styles.loadingMore}>正在加载更多…</Text> : null}
            ListHeaderComponent={listHeader}
            onEndReached={() => { void loadMore(); }}
            onEndReachedThreshold={0.6}
            renderItem={({ item: group }) => (
              <View key={`${group.ownerType}:${group.ownerId}`} style={styles.groupSection}>
                <View style={styles.groupHeaderRow}>
                  <View style={styles.groupHeaderLeft}>
                    <Text numberOfLines={1} style={styles.groupTitle}>{group.threadTitle}</Text>
                    <Text style={styles.groupMeta}>
                      {group.ownerLabel} · {group.materialCount} 份资料 · 最近更新 {group.updatedAt.slice(5, 10)}
                    </Text>
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
                <View style={styles.groupCardsWrap}>
                  {group.materials.map((material) =>
                    renderMaterialRow(material, group.ownerType === 'thread' ? group.ownerId : undefined)
                  )}
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
            {...createScrollHandlers()}
            contentContainerStyle={styles.fullBleedList}
            data={items}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={renderEmptyComponent()}
            ListFooterComponent={loadingMore ? <Text style={styles.loadingMore}>正在加载更多…</Text> : null}
            ListHeaderComponent={listHeader}
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
  fullBleedList: {
    paddingBottom: 40,
  },
  listHeaderWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  statusText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
  },
  addBtnWrap: {
    marginBottom: 8,
  },
  materialRowWrap: {
    width: '100%',
  },
  selectedRow: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.primary,
  },
  failedRow: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  failedText: {
    fontSize: 12,
    color: '#EF4444',
  },
  failedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  groupSection: {
    width: '100%',
    marginBottom: 16,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  groupHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  groupMeta: {
    fontSize: 12,
    color: '#8E8E93',
  },
  openGroupButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  textActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: aiLightColors.primary,
  },
  groupCardsWrap: {
    width: '100%',
  },
  previewNote: {
    fontSize: 12,
    color: '#8E8E93',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  loadingMore: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    paddingVertical: spacing[3],
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  emptyTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  emptyDescription: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyActionButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    marginTop: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  emptyActionText: {
    ...typography.textStyles.bodyStrong,
    color: '#ffffff',
    fontSize: 13,
  },
  selectionFooter: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  pressed: {
    opacity: 0.75,
  },
});
