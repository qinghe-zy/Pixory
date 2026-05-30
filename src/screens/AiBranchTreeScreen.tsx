import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  loadBranchTree,
  loadBranchTreePreview,
  resolveBranchSelection,
  updateBranchRouteStatus,
  type AiBranchTreeNode,
  type AiBranchTreePreview,
} from '../ai/aiBranchTreeService';
import { buildPixoryBranchTreeGraph, buildPixoryBranchTreeSnapshot } from '../branchTree/adapters/pixoryAiBranchTreeAdapter';
import { BranchTreeCanvas } from '../branchTree/components/BranchTreeCanvas';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import type { PixorySpace } from '../database';
import type { AiBranchRouteStatus, AiBranchScope } from '../database/repositories/aiThreadRepository';
import { radius, rhythm, spacing, typography } from '../design/tokens';

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

export function AiBranchTreeScreen({
  currentBranchScopes = [],
  onBack,
  onSelectBranch,
  space,
  threadId,
}: AiBranchTreeScreenProps) {
  const [nodes, setNodes] = useState<AiBranchTreeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<AiBranchTreeNode | null>(null);
  const [preview, setPreview] = useState<AiBranchTreePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const graph = useMemo(() => buildPixoryBranchTreeGraph(nodes), [nodes]);
  const snapshot = useMemo(() => buildPixoryBranchTreeSnapshot(preview, nodes), [nodes, preview]);

  const loadTree = useCallback(
    async (preferredSelectedNodeId?: string) => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const result = await loadBranchTree({ currentBranchScopes, space, threadId });
        setNodes(result.nodes);
        const initialNode =
          result.nodes.find((node) => node.id === preferredSelectedNodeId) ??
          result.nodes.find((node) => node.isCurrentRoute) ??
          result.nodes[0] ??
          null;
        setSelectedNode(initialNode);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '无法读取创作路线树');
      } finally {
        setLoading(false);
      }
    },
    [currentBranchScopes, space, threadId]
  );

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

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
  }, [currentBranchScopes, selectedNode, space, threadId]);

  function selectNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId) ?? null;
    setSelectedNode(node);
  }

  async function checkoutNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }

    try {
      const selection = await resolveBranchSelection({
        branchRootMessageId: node.branchRootMessageId,
        branchVersionIndex: node.branchVersionIndex,
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

  async function markNodeStatus(nodeId: string, status: AiBranchRouteStatus) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }

    try {
      await updateBranchRouteStatus({
        branchRootMessageId: node.branchRootMessageId,
        branchVersionIndex: node.branchVersionIndex,
        space,
        status,
        threadId,
      });
      await loadTree(node.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '标记路线失败');
    }
  }

  function selectChildMessage(messageId: string) {
    const nextNode = nodes.find((node) => node.id === messageId) ?? null;
    if (nextNode) {
      setSelectedNode(nextNode);
    }
  }

  return (
    <AiLightScaffold
      contentContainerStyle={styles.fullScreenContent}
      errorMessage={errorMessage}
      headerDividerVisible={false}
      onBack={onBack}
      title="创作路线树"
      rightAction={
        <View style={styles.headerIcon}>
          <Ionicons color={aiLightColors.ink} name="git-branch-outline" size={18} />
        </View>
      }
    >
      {loading ? (
        <View style={styles.stateScreen}>
          <ActivityIndicator color={aiLightColors.coral} />
          <Text style={styles.stateText}>正在整理路线</Text>
        </View>
      ) : nodes.length === 0 ? (
        <View style={styles.stateScreen}>
          <Ionicons color={aiLightColors.coral} name="git-branch-outline" size={24} />
          <Text style={styles.stateTitle}>暂无分支</Text>
          <Text style={styles.stateText}>改写消息或重新生成回复后，会在这里形成创作路线。</Text>
        </View>
      ) : (
        <BranchTreeCanvas
          graph={graph}
          onCheckoutNode={(nodeId) => void checkoutNode(nodeId)}
          onDeriveFromNode={(nodeId) => void checkoutNode(nodeId)}
          onRequestPruneNode={(nodeId) => void markNodeStatus(nodeId, 'abandoned')}
          onSelectChildMessage={selectChildMessage}
          onSelectNode={selectNode}
          selectedNodeId={selectedNode?.id ?? null}
          snapshot={snapshot}
          snapshotLoading={previewLoading}
        />
      )}
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  fullScreenContent: {
    flex: 1,
    gap: 0,
    paddingHorizontal: 0,
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
  stateScreen: {
    alignItems: 'center',
    flex: 1,
    gap: rhythm.cardContentGap,
    justifyContent: 'center',
    padding: spacing[6],
  },
  stateText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    textAlign: 'center',
  },
  stateTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
});
