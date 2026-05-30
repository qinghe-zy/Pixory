import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  loadBranchTree,
  loadBranchTreePreview,
  resolveBranchSelection,
  type AiBranchTreeNode,
  type AiBranchTreePreview,
} from '../ai/aiBranchTreeService';
import { buildPixoryBranchTreeGraph, buildPixoryBranchTreeSnapshot } from '../branchTree/adapters/pixoryAiBranchTreeAdapter';
import { BranchTreeCanvas } from '../branchTree/components/BranchTreeCanvas';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import type { PixorySpace } from '../database';
import type { AiBranchScope } from '../database/repositories/aiThreadRepository';
import { radius, rhythm, spacing, typography } from '../design/tokens';

interface AiBranchTreeScreenProps {
  currentBranchScopes?: AiBranchScope[];
  onBack: () => void;
  onCheckoutBranch: (input: {
    branchRootMessageId: string;
    branchVersionIndex: number;
    selectionMap: Record<string, number>;
  }) => void;
  onDeriveBranch: (input: {
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
  onCheckoutBranch,
  onDeriveBranch,
  space,
  threadId,
}: AiBranchTreeScreenProps) {
  const [nodes, setNodes] = useState<AiBranchTreeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<AiBranchTreeNode | null>(null);
  const [preview, setPreview] = useState<AiBranchTreePreview | null>(null);
  const [snapshotVisible, setSnapshotVisible] = useState(false);
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
    if (!snapshotVisible) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
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
  }, [currentBranchScopes, selectedNode, snapshotVisible, space, threadId]);

  function selectNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId) ?? null;
    setSelectedNode(node);
  }

  function openSnapshotNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId) ?? null;
    setSelectedNode(node);
    setSnapshotVisible(node !== null);
  }

  function closeSnapshot() {
    setSnapshotVisible(false);
  }

  async function checkoutNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }

    const performCheckout = async () => {
      try {
        const selection = await resolveBranchSelection({
          branchRootMessageId: node.branchRootMessageId,
          branchVersionIndex: node.branchVersionIndex,
          space,
        });
        onCheckoutBranch({
          branchRootMessageId: selection.branchRootMessageId,
          branchVersionIndex: selection.branchVersionIndex,
          selectionMap: selection.selectionMap,
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '无法切换路线');
      }
    };

    const layoutNode = graph.nodes.find((n) => n.id === node.id);
    const isActivePath = layoutNode?.isActivePath ?? node.isCurrentRoute;

    if (isActivePath) {
      void performCheckout();
    } else {
      Alert.alert(
        '确认切换路线',
        '你即将跳跃到一条旁支路线上。\n（此操作会将该旁支设为当前主路线，你随时可以切换回来）',
        [
          { text: '取消', style: 'cancel' },
          { text: '确认切换', onPress: () => void performCheckout() },
        ]
      );
    }
  }





  return (
    <AiLightScaffold
      bodyStyle={styles.fullScreenBody}
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
          onCloseSnapshot={closeSnapshot}
          onOpenSnapshotNode={openSnapshotNode}
          onSelectNode={selectNode}
          selectedNodeId={selectedNode?.id ?? null}
          snapshot={snapshot}
          snapshotLoading={previewLoading}
          snapshotVisible={snapshotVisible}
        />
      )}
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  fullScreenBody: {
    flex: 1,
  },
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
