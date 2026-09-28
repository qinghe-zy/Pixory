import type { AiBranchTreeNode, AiBranchTreePreview } from '../../ai/aiBranchTreeService';
import { buildBranchTreeGraph } from '../engine/buildBranchTreeGraph';
import type { BranchTreeGraph, BranchTreeNode, BranchTreeRole, BranchTreeSnapshot, BranchTreeSnapshotMessage } from '../engine/types';

function roleFromAiRole(role: string): BranchTreeRole {
  return role === 'user' || role === 'assistant' || role === 'system' ? role : 'assistant';
}

function roleFromAiNode(node: AiBranchTreeNode): BranchTreeRole {
  return roleFromAiRole(node.rootRole);
}

function branchNodeId(messageId: string, versionIndex: number): string {
  return `${messageId}:${versionIndex}`;
}

function toBranchTreeNode(node: AiBranchTreeNode): BranchTreeNode {
  return {
    branchesCount: node.followUpMessageCount,
    childNodeIds: [],
    contentPreview: node.preview,
    createdAt: node.createdAt,
    id: node.id,
    isActivePath: node.isCurrentRoute,
    isHead: false,
    messageId: node.branchRootMessageId,
    parentNodeId:
      node.parentBranchRootMessageId !== null && node.parentBranchVersionIndex !== null
        ? branchNodeId(node.parentBranchRootMessageId, node.parentBranchVersionIndex)
        : null,
    role: roleFromAiNode(node),
    status: node.status,
    summary: node.title,
    versionIndex: node.branchVersionIndex,
    versionTotal: node.versionTotal,
  };
}

export function buildPixoryBranchTreeGraph(nodes: AiBranchTreeNode[]): BranchTreeGraph {
  const sortedNodes = [...nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const mainSequenceNodes = sortedNodes.filter((n) => n.parentBranchRootMessageId === null);

  return buildBranchTreeGraph(
    sortedNodes.map((node) => {
      let parentId = node.parentBranchRootMessageId;
      let parentVersionIndex = node.parentBranchVersionIndex;

      if (parentId === null) {
        const myIndex = mainSequenceNodes.findIndex(
          (n) => n.branchRootMessageId === node.branchRootMessageId && n.branchVersionIndex === node.branchVersionIndex
        );
        if (myIndex > 0) {
          const prev = mainSequenceNodes[myIndex - 1];
          parentId = prev.branchRootMessageId;
          parentVersionIndex = prev.branchVersionIndex;
        }
      }

      return {
        contentPreview: node.preview,
        createdAt: node.createdAt,
        isActivePath: node.isCurrentRoute,
        messageId: node.branchRootMessageId,
        parentMessageId: parentId,
        parentVersionIndex: parentVersionIndex,
        role: roleFromAiNode(node),
        status: node.status,
        summary: node.title,
        versionIndex: node.branchVersionIndex,
        versionTotal: node.versionTotal,
      };
    })
  );
}

function toSnapshotMessage(message: AiBranchTreePreview['selectedMessage']): BranchTreeSnapshotMessage {
  return {
    content: message.content,
    id: message.id,
    label: message.label || '',
    role: roleFromAiRole(message.role),
  };
}

export function buildPixoryBranchTreeSnapshot(
  preview: AiBranchTreePreview | null,
  nodes: AiBranchTreeNode[] = []
): BranchTreeSnapshot | null {
  if (!preview) {
    return null;
  }

  const layoutNode = buildPixoryBranchTreeGraph(nodes).nodes.find((n) => n.id === branchNodeId(preview.node.branchRootMessageId, preview.node.branchVersionIndex));

  return {
    nextMessages: preview.followUpMessages.map(toSnapshotMessage),
    node: layoutNode ?? {
      branchesCount: 0,
      childNodeIds: [],
      contentPreview: preview.node.preview,
      createdAt: preview.node.createdAt,
      id: branchNodeId(preview.node.branchRootMessageId, preview.node.branchVersionIndex),
      isActivePath: preview.node.isCurrentRoute,
      isHead: false,
      messageId: preview.node.branchRootMessageId,
      parentNodeId: null,
      role: roleFromAiRole(preview.node.rootRole),
      status: preview.node.status,
      summary: preview.node.title,
      versionIndex: preview.node.branchVersionIndex,
      versionTotal: preview.node.versionTotal,
    },
    parentMessages: preview.previousMessages.map(toSnapshotMessage),
    selectedMessage: toSnapshotMessage(preview.selectedMessage),
  };
}
