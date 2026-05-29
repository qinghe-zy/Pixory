import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  loadBranchTree,
  loadBranchTreePreview,
  resolveBranchSelection,
  updateBranchRouteStatus,
  type AiBranchTreeGroup,
  type AiBranchTreeNode,
  type AiBranchTreePreview,
  type AiBranchTreeRow,
} from '../ai/aiBranchTreeService';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import type { PixorySpace } from '../database';
import type { AiBranchRouteStatus, AiBranchScope } from '../database/repositories/aiThreadRepository';
import { metrics, radius, rhythm, spacing, typography } from '../design/tokens';

interface AiBranchTreeScreenProps {
  currentBranchScopes?: AiBranchScope[];
  onBack: () => void;
  onSelectBranch: (input: {
    branchRootMessageId: string;
    branchVersionIndex: number;
    selectionMap: Record<string, number>;
  }) => void;
  space: PixorySpace;
  threadId: string;
}

const STATUS_LABELS: Record<AiBranchRouteStatus, string> = {
  abandoned: '放弃',
  adopted: '已采用',
  exploring: '探索中',
  paused: '暂停',
};

const STATUS_OPTIONS: AiBranchRouteStatus[] = ['exploring', 'adopted', 'paused', 'abandoned'];
type BranchGraphLane = 'left' | 'main' | 'right';

export function AiBranchTreeScreen({
  currentBranchScopes = [],
  onBack,
  onSelectBranch,
  space,
  threadId,
}: AiBranchTreeScreenProps) {
  const [nodes, setNodes] = useState<AiBranchTreeNode[]>([]);
  const [rows, setRows] = useState<AiBranchTreeRow[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<AiBranchTreeGroup[]>([]);
  const [selectedNode, setSelectedNode] = useState<AiBranchTreeNode | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<AiBranchTreeGroup | null>(null);
  const [preview, setPreview] = useState<AiBranchTreePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTree = useCallback(async (preferredSelectedNodeId?: string) => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const result = await loadBranchTree({ currentBranchScopes, space, threadId });
      setNodes(result.nodes);
      setRows(result.rows);
      setCollapsedGroups(result.collapsedGroups);
      const initialNode = result.nodes.find((node) => node.id === preferredSelectedNodeId)
        ?? result.nodes.find((node) => node.isCurrentRoute)
        ?? result.nodes[0]
        ?? null;
      setSelectedNode(initialNode);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法读取创作路线树');
    } finally {
      setLoading(false);
    }
  }, [currentBranchScopes, space, threadId]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const selectedKey = selectedNode?.id ?? null;

  useEffect(() => {
    if (!selectedNode) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void loadBranchTreePreview({
      branchRootMessageId: selectedNode.branchRootMessageId,
      branchVersionIndex: selectedNode.branchVersionIndex,
      currentBranchScopes,
      space,
      threadId,
    })
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '无法读取附近消息');
          setPreview(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentBranchScopes, selectedKey, selectedNode, space, threadId]);

  async function selectPreviewBranch() {
    if (!selectedNode) {
      return;
    }
    try {
      const selection = await resolveBranchSelection({
        branchRootMessageId: selectedNode.branchRootMessageId,
        branchVersionIndex: selectedNode.branchVersionIndex,
        space,
      });
      onSelectBranch({
        branchRootMessageId: selection.branchRootMessageId,
        branchVersionIndex: selection.branchVersionIndex,
        selectionMap: selection.selectionMap,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法切换路线');
    }
  }

  async function markStatus(status: AiBranchRouteStatus) {
    if (!selectedNode) {
      return;
    }
    try {
      await updateBranchRouteStatus({
        branchRootMessageId: selectedNode.branchRootMessageId,
        branchVersionIndex: selectedNode.branchVersionIndex,
        space,
        status,
        threadId,
      });
      setSelectedNode({ ...selectedNode, status });
      setNodes((current) => current.map((node) => (node.id === selectedNode.id ? { ...node, status } : node)));
      await loadTree(selectedNode.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '标记路线失败');
    }
  }

  function renderNode(node: AiBranchTreeNode, placement: 'main' | 'left' | 'right') {
    const selected = selectedNode?.id === node.id;
    return (
      <Pressable
        accessibilityLabel={`查看${node.title}附近消息`}
        accessibilityRole="button"
        key={node.id}
        onPress={() => setSelectedNode(node)}
        style={({ pressed }) => [
          styles.nodeCard,
          placement === 'left' && styles.leftNode,
          placement === 'right' && styles.rightNode,
          selected && styles.nodeCardSelected,
          node.isCurrentRoute && styles.currentNode,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.nodeTitleRow}>
          <View style={[styles.nodeDot, selected && styles.nodeDotSelected]} />
          <Text numberOfLines={2} style={styles.nodeTitle}>{node.title}</Text>
        </View>
        <View style={styles.nodeMetaRow}>
          <Text numberOfLines={1} style={styles.nodePill}>{node.versionLabel}</Text>
          <Text numberOfLines={1} style={styles.nodePill}>{node.followUpMessageCount} 条</Text>
        </View>
      </Pressable>
    );
  }

  function renderCollapsedGroup(group: AiBranchTreeGroup, placement: 'left' | 'right') {
    return (
      <Pressable
        accessibilityLabel={`展开${group.label}条创作路线`}
        accessibilityRole="button"
        key={group.id}
        onPress={() => setSelectedGroup(group)}
        style={({ pressed }) => [
          styles.nodeCard,
          styles.collapsedNodeCard,
          placement === 'left' && styles.leftNode,
          placement === 'right' && styles.rightNode,
          pressed && styles.pressed,
        ]}
      >
        <Text numberOfLines={1} style={styles.collapsedNodeLabel}>{group.label}</Text>
      </Pressable>
    );
  }

  function renderPreviewBubble(message: AiBranchTreePreview['selectedMessage'], emphasis = false) {
    const isUser = message.role === 'user';
    const roleLabel = isUser ? '用户' : message.role === 'assistant' ? '助手' : '系统';
    return (
      <View
        key={`${message.id}:${message.label}`}
        style={[
          styles.previewBubbleWrap,
          isUser ? styles.previewBubbleWrapUser : styles.previewBubbleWrapAssistant,
        ]}
      >
        <View
          style={[
            styles.previewBubble,
            isUser ? styles.previewBubbleUser : styles.previewBubbleAssistant,
            emphasis && styles.previewBubbleEmphasis,
          ]}
        >
          <View style={styles.previewBubbleMetaRow}>
            <Text numberOfLines={1} style={styles.previewLabel}>{message.label}</Text>
            <Text numberOfLines={1} style={styles.previewRoleLabel}>{roleLabel}</Text>
          </View>
          <Text numberOfLines={4} style={styles.previewText}>{message.content || '空消息'}</Text>
        </View>
      </View>
    );
  }

  function renderEmbeddedPreview() {
    if (previewLoading) {
      return (
        <View style={styles.branchChatPreview}>
          <ActivityIndicator color={aiLightColors.coral} size="small" />
          <Text style={styles.emptyText}>正在读取附近消息</Text>
        </View>
      );
    }
    if (!preview) {
      return (
        <View style={styles.branchChatPreview}>
          <Text style={styles.emptyText}>未读取到附近消息</Text>
        </View>
      );
    }
    return (
      <View style={styles.branchChatPreview}>
        {preview.previousMessages.map((message) => renderPreviewBubble(message))}
        {renderPreviewBubble(preview.selectedMessage, true)}
        {preview.followUpMessages.map((message) => renderPreviewBubble(message))}
      </View>
    );
  }

  const visibleGraphRows = rows;
  const primaryActionLabel = selectedNode?.isCurrentRoute ? '返回聊天定位此处' : '切换并返回聊天';
  const actionBar = (
    <View style={selectedNode ? styles.canvasActionBar : styles.canvasActionBarDisabled}>
      <View style={styles.statusRow}>
        {STATUS_OPTIONS.map((status) => (
          <Pressable
            accessibilityRole="button"
            key={status}
            onPress={() => void markStatus(status)}
            style={({ pressed }) => [
              styles.statusChip,
              selectedNode?.status === status && styles.statusChipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.statusChipText, selectedNode?.status === status && styles.statusChipTextActive]}>
              {STATUS_LABELS[status]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actionRow}>
        <View style={styles.secondaryAction}>
          <AiLightButton label="返回" onPress={onBack} variant="outline" />
        </View>
        <View style={styles.primaryAction}>
          <AiLightButton label={primaryActionLabel} onPress={selectPreviewBranch} disabled={!selectedNode} />
        </View>
      </View>
    </View>
  );

  return (
    <AiLightScaffold
      errorMessage={errorMessage}
      footer={actionBar}
      onBack={onBack}
      scrollable
      title="创作路线树"
      rightAction={
        <View style={styles.headerIcon}>
          <Ionicons color={aiLightColors.ink} name="git-branch-outline" size={18} />
        </View>
      }
    >
      <View style={styles.screen}>
        <View style={styles.branchCanvas}>
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={aiLightColors.coral} />
              <Text style={styles.emptyText}>正在整理路线</Text>
            </View>
          ) : nodes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons color={aiLightColors.coral} name="git-branch-outline" size={24} />
              <Text style={styles.emptyTitle}>暂无分支</Text>
            </View>
          ) : (
            <View style={styles.graphGrid}>
              <View pointerEvents="none" style={styles.branchLineLayer}>
                <View style={styles.gridLineOne} />
                <View style={styles.gridLineTwo} />
                <View style={styles.gridLineThree} />
                <View style={styles.branchRail} />
              </View>
              <View style={styles.branchNodeLayer}>
                {visibleGraphRows.map((row) => (
                  <View
                    key={row.id}
                    style={[
                      styles.branchNodeRow,
                      row.lane === 'left' && styles.branchLeftRow,
                      row.lane === 'main' && styles.branchMainRow,
                      row.lane === 'right' && styles.branchRightRow,
                    ]}
                  >
                    {row.lane === 'main' ? null : (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.rowConnectorLayer,
                          row.lane === 'left' && styles.rowConnectorLeft,
                          row.lane === 'right' && styles.rowConnectorRight,
                        ]}
                      />
                    )}
                    {row.kind === 'collapsed' && row.group
                      ? renderCollapsedGroup(row.group, row.lane === 'left' ? 'left' : 'right')
                      : row.node
                        ? renderNode(row.node, row.lane)
                        : null}
                    {row.node?.id === selectedNode?.id ? renderEmbeddedPreview() : null}
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
        <Modal
          animationType="fade"
          onRequestClose={() => setSelectedGroup(null)}
          transparent
          visible={Boolean(selectedGroup)}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setSelectedGroup(null)}>
            <Pressable style={styles.bottomSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetList}>
                {selectedGroup?.nodes.map((node) => (
                  <Pressable
                    accessibilityRole="button"
                    key={node.id}
                    onPress={() => {
                      setSelectedNode(node);
                      setSelectedGroup(null);
                    }}
                    style={({ pressed }) => [styles.sheetBranchItem, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={2} style={styles.sheetBranchTitle}>{node.title}</Text>
                    <View style={styles.nodeMetaRow}>
                      <Text numberOfLines={1} style={styles.nodePill}>{node.versionLabel}</Text>
                      <Text numberOfLines={1} style={styles.nodePill}>{node.followUpMessageCount} 条</Text>
                      <Text numberOfLines={1} style={styles.nodePill}>{STATUS_LABELS[node.status]}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: aiLightColors.canvas,
    paddingVertical: spacing[3],
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  branchCanvas: {
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 720,
    overflow: 'hidden',
  },
  graphGrid: {
    minHeight: 720,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[5],
    position: 'relative',
    width: '100%',
  },
  branchLineLayer: {
    bottom: 0,
    left: spacing[3],
    position: 'absolute',
    right: spacing[3],
    top: 0,
  },
  branchNodeLayer: {
    gap: rhythm.compactGridGap,
    position: 'relative',
    zIndex: 2,
  },
  gridLineOne: {
    backgroundColor: aiLightColors.hairline,
    bottom: 0,
    left: '15%',
    opacity: 0.48,
    position: 'absolute',
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridLineTwo: {
    backgroundColor: aiLightColors.hairline,
    bottom: 0,
    left: '50%',
    opacity: 0.48,
    position: 'absolute',
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridLineThree: {
    backgroundColor: aiLightColors.hairline,
    bottom: 0,
    left: '85%',
    opacity: 0.48,
    position: 'absolute',
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
  branchRail: {
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.pill,
    bottom: spacing[8],
    left: '50%',
    marginLeft: -2,
    position: 'absolute',
    top: spacing[8],
    width: 4,
  },
  branchNodeRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    minHeight: 72,
    position: 'relative',
  },
  branchLeftRow: {
    justifyContent: 'flex-start',
  },
  branchMainRow: {
    justifyContent: 'center',
  },
  branchRightRow: {
    justifyContent: 'flex-end',
  },
  rowConnectorLayer: {
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.pill,
    height: 4,
    opacity: 0.72,
    position: 'absolute',
    top: spacing[7],
    zIndex: -1,
  },
  rowConnectorLeft: {
    left: '17%',
    right: '50%',
  },
  rowConnectorRight: {
    left: '50%',
    right: '17%',
  },
  nodeCard: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 62,
    overflow: 'hidden',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    width: '35%',
  },
  collapsedNodeCard: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: metrics.minTouchSize,
    width: '24%',
  },
  collapsedNodeLabel: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.coral,
  },
  leftNode: {
    borderColor: aiLightColors.hairline,
  },
  rightNode: {
    borderColor: aiLightColors.hairline,
  },
  nodeCardSelected: {
    backgroundColor: aiLightColors.coralSoft,
    borderColor: aiLightColors.coral,
    borderWidth: 1,
  },
  currentNode: {
    borderColor: aiLightColors.coral,
  },
  nodeTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  nodeDot: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.coral,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: spacing[3],
    marginTop: 2,
    width: spacing[3],
  },
  nodeDotSelected: {
    backgroundColor: aiLightColors.coral,
  },
  nodeTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    flex: 1,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  nodeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.microGap,
    paddingTop: spacing[1],
  },
  nodePill: {
    ...typography.textStyles.caption,
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.pill,
    color: aiLightColors.muted,
    overflow: 'hidden',
    paddingHorizontal: spacing[1.5],
    paddingVertical: 1,
  },
  branchChatPreview: {
    alignSelf: 'flex-end',
    gap: rhythm.compactGridGap,
    paddingLeft: spacing[2],
    width: '63%',
  },
  previewBubbleWrap: {
    flexDirection: 'row',
  },
  previewBubbleWrapAssistant: {
    justifyContent: 'flex-start',
  },
  previewBubbleWrapUser: {
    justifyContent: 'flex-end',
  },
  previewBubble: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '94%',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  previewBubbleAssistant: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
  },
  previewBubbleUser: {
    backgroundColor: aiLightColors.coralSoft,
    borderColor: 'rgba(204, 120, 92, 0.42)',
  },
  previewBubbleEmphasis: {
    borderColor: aiLightColors.coral,
  },
  previewBubbleMetaRow: {
    flexDirection: 'row',
    gap: rhythm.microGap,
    justifyContent: 'space-between',
  },
  previewLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    flexShrink: 1,
  },
  previewRoleLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  previewText: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    fontSize: typography.size.caption,
    lineHeight: 19,
  },
  canvasActionBar: {
    backgroundColor: aiLightColors.canvas,
    gap: rhythm.cardContentGap,
  },
  canvasActionBarDisabled: {
    backgroundColor: aiLightColors.canvas,
    gap: rhythm.cardContentGap,
    opacity: 0.72,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
    paddingVertical: spacing[1],
  },
  statusChip: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  statusChipActive: {
    backgroundColor: aiLightColors.dark,
    borderColor: aiLightColors.dark,
  },
  statusChipText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  statusChipTextActive: {
    color: aiLightColors.onDark,
  },
  actionRow: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    paddingTop: spacing[3],
  },
  secondaryAction: {
    flex: 0.7,
  },
  primaryAction: {
    flex: 1,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(24, 22, 20, 0.22)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: aiLightColors.cardWash,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    height: 4,
    width: spacing[10],
  },
  sheetList: {
    gap: rhythm.compactGridGap,
  },
  sheetBranchItem: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[3],
  },
  sheetBranchTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  loadingState: {
    alignItems: 'center',
    gap: rhythm.cardContentGap,
    minHeight: 720,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: rhythm.cardContentGap,
    minHeight: 720,
    justifyContent: 'center',
    padding: spacing[6],
  },
  emptyTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  emptyText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.76,
  },
});
