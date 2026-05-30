import type { AiBranchRouteStatus } from '../../database/repositories/aiThreadRepository';

export type BranchTreeRole = 'user' | 'assistant' | 'system';

export interface BranchTreeNode {
  id: string;
  messageId: string;
  versionIndex: number;
  versionTotal: number;
  parentNodeId: string | null;
  childNodeIds: string[];
  role: BranchTreeRole;
  summary: string;
  contentPreview: string;
  createdAt: string;
  status: AiBranchRouteStatus;
  isActivePath: boolean;
  isHead: boolean;
  branchesCount: number;
}

export interface BranchTreeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: 'active' | 'inactive';
}

export interface BranchTreeGraph {
  nodes: BranchTreeNode[];
  edges: BranchTreeEdge[];
  activeNodeId: string | null;
  headNodeId: string | null;
}

export interface BranchTreeLayoutNode extends BranchTreeNode {
  lane: number;
  depth: number;
  x: number;
  y: number;
  collapsedChildCount: number;
}

export interface BranchTreeLayoutEdge extends BranchTreeEdge {
  path: string;
}

export interface BranchTreeLayout {
  nodes: BranchTreeLayoutNode[];
  edges: BranchTreeLayoutEdge[];
  width: number;
  height: number;
  headNode: BranchTreeLayoutNode | null;
}

export interface BranchTreeSnapshotMessage {
  id: string;
  role: BranchTreeRole;
  label: string;
  content: string;
}

export interface BranchTreeSnapshot {
  node: BranchTreeNode;
  parentMessages: BranchTreeSnapshotMessage[];
  selectedMessage: BranchTreeSnapshotMessage;
  nextMessages: BranchTreeSnapshotMessage[];
}

export interface BranchTreeViewportTransform {
  translateX: number;
  translateY: number;
  scale: number;
}

export interface BranchTreeViewportSize {
  width: number;
  height: number;
}

export interface BranchTreePoint {
  x: number;
  y: number;
}
