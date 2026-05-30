import type { AiBranchRouteStatus } from '../../database/repositories/aiThreadRepository';
import type { BranchTreeEdge, BranchTreeGraph, BranchTreeNode, BranchTreeRole } from './types';

export interface BranchTreeSourceNode {
  messageId: string;
  versionIndex: number;
  versionTotal: number;
  parentMessageId: string | null;
  parentVersionIndex: number | null;
  role: BranchTreeRole;
  summary: string;
  contentPreview: string;
  createdAt: string;
  status: AiBranchRouteStatus;
  isActivePath: boolean;
}

function versionKey(messageId: string, versionIndex: number): string {
  return `${messageId}:${versionIndex}`;
}

function edgeKey(fromNodeId: string, toNodeId: string): string {
  return `${fromNodeId}->${toNodeId}`;
}

export function buildBranchTreeGraph(sourceNodes: BranchTreeSourceNode[]): BranchTreeGraph {
  const sorted = [...sourceNodes].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.messageId.localeCompare(right.messageId) ||
      left.versionIndex - right.versionIndex
  );
  const nodeByVersionKey = new Map<string, BranchTreeNode>();

  sorted.forEach((source) => {
    const id = versionKey(source.messageId, source.versionIndex);
    nodeByVersionKey.set(id, {
      branchesCount: 0,
      childNodeIds: [],
      contentPreview: source.contentPreview,
      createdAt: source.createdAt,
      id,
      isActivePath: source.isActivePath,
      isHead: false,
      messageId: source.messageId,
      parentNodeId:
        source.parentMessageId !== null && source.parentVersionIndex !== null
          ? versionKey(source.parentMessageId, source.parentVersionIndex)
          : null,
      role: source.role,
      status: source.status,
      summary: source.summary,
      versionIndex: source.versionIndex,
      versionTotal: source.versionTotal,
    });
  });

  nodeByVersionKey.forEach((node) => {
    if (!node.parentNodeId) {
      return;
    }
    const parent = nodeByVersionKey.get(node.parentNodeId);
    if (!parent) {
      return;
    }
    parent.childNodeIds.push(node.id);
    parent.branchesCount = parent.childNodeIds.length;
  });

  const nodes = [...nodeByVersionKey.values()];
  const activeNodes = nodes.filter((node) => node.isActivePath);
  const activeNodeIds = new Set(activeNodes.map((node) => node.id));
  const headNode = activeNodes[activeNodes.length - 1] ?? nodes[nodes.length - 1] ?? null;
  if (headNode) {
    headNode.isHead = true;
    let curr: BranchTreeNode | null = headNode;
    while (curr) {
      curr.isActivePath = true;
      activeNodeIds.add(curr.id);
      curr = curr.parentNodeId ? nodeByVersionKey.get(curr.parentNodeId) ?? null : null;
    }
  }

  const edges: BranchTreeEdge[] = [];
  nodes.forEach((node) => {
    if (!node.parentNodeId || !nodeByVersionKey.has(node.parentNodeId)) {
      return;
    }
    edges.push({
      fromNodeId: node.parentNodeId,
      id: edgeKey(node.parentNodeId, node.id),
      kind: activeNodeIds.has(node.parentNodeId) && activeNodeIds.has(node.id) ? 'active' : 'inactive',
      toNodeId: node.id,
    });
  });

  return {
    activeNodeId: activeNodes[activeNodes.length - 1]?.id ?? null,
    edges,
    headNodeId: headNode?.id ?? null,
    nodes,
  };
}
