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
  return buildBranchTreeGraph(
    nodes.map((node) => ({
      contentPreview: node.preview,
      createdAt: node.createdAt,
      isActivePath: node.isCurrentRoute,
      messageId: node.branchRootMessageId,
      parentMessageId: node.parentBranchRootMessageId,
      parentVersionIndex: node.parentBranchVersionIndex,
      role: roleFromAiNode(node),
      status: node.status,
      summary: node.title,
      versionIndex: node.branchVersionIndex,
      versionTotal: node.versionTotal,
    }))
  );
}

function toSnapshotMessage(message: AiBranchTreePreview['selectedMessage']): BranchTreeSnapshotMessage {
  return {
    content: message.content,
    id: message.id,
    label: message.label,
    role: roleFromAiRole(message.role),
  };
}

export function buildPixoryBranchTreeSnapshot(preview: AiBranchTreePreview | null): BranchTreeSnapshot | null {
  if (!preview) {
    return null;
  }

  return {
    childMessages: preview.followUpMessages.map(toSnapshotMessage),
    node: toBranchTreeNode(preview.node),
    parentMessages: preview.previousMessages.map(toSnapshotMessage),
    selectedMessage: toSnapshotMessage(preview.selectedMessage),
  };
}
