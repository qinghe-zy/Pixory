import {
  BRANCH_TREE_NODE_HEIGHT,
  BRANCH_TREE_NODE_WIDTH,
} from './layoutBranchTreeGraph';
import type {
  BranchTreeLayout,
  BranchTreeLayoutEdge,
  BranchTreeLayoutNode,
  BranchTreeViewportSize,
  BranchTreeViewportTransform,
} from './types';

export const BRANCH_TREE_VIEWPORT_OVERSCAN = 1200;

export interface BranchTreeVisibleWindow {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface BranchTreeVisibleLayout {
  edges: BranchTreeLayoutEdge[];
  nodes: BranchTreeLayoutNode[];
  visibleNodeIds: Set<string>;
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function intersectsWindow(rect: BranchTreeVisibleWindow, window: BranchTreeVisibleWindow): boolean {
  return (
    rect.right >= window.left &&
    rect.left <= window.right &&
    rect.bottom >= window.top &&
    rect.top <= window.bottom
  );
}

function nodeTouchesWindow(node: BranchTreeLayoutNode, window: BranchTreeVisibleWindow): boolean {
  return intersectsWindow(
    {
      bottom: node.y + BRANCH_TREE_NODE_HEIGHT,
      left: node.x,
      right: node.x + BRANCH_TREE_NODE_WIDTH,
      top: node.y,
    },
    window
  );
}

function edgeTouchesWindow(edge: BranchTreeLayoutEdge, window: BranchTreeVisibleWindow): boolean {
  const numbers = edge.path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length < 8 || numbers.some((value) => !Number.isFinite(value))) {
    return false;
  }
  const xs = [numbers[0], numbers[2], numbers[4], numbers[6]];
  const ys = [numbers[1], numbers[3], numbers[5], numbers[7]];
  return intersectsWindow(
    {
      bottom: Math.max(...ys),
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
    },
    window
  );
}

export function buildBranchTreeVisibleWindow(
  viewport: BranchTreeViewportSize,
  transform: BranchTreeViewportTransform,
  overscan = BRANCH_TREE_VIEWPORT_OVERSCAN
): BranchTreeVisibleWindow | null {
  if (!isFinitePositive(viewport.width) || !isFinitePositive(viewport.height) || !isFinitePositive(transform.scale)) {
    return null;
  }

  const left = -transform.translateX / transform.scale - overscan;
  const top = -transform.translateY / transform.scale - overscan;
  const right = (viewport.width - transform.translateX) / transform.scale + overscan;
  const bottom = (viewport.height - transform.translateY) / transform.scale + overscan;

  return { bottom, left, right, top };
}

export function filterBranchTreeVisibleLayout(
  layout: BranchTreeLayout,
  visibleWindow: BranchTreeVisibleWindow | null,
  selectedNodeId: string | null
): BranchTreeVisibleLayout {
  const nodes = visibleWindow
    ? layout.nodes.filter(
        (node) =>
          node.id === selectedNodeId ||
          node.isHead ||
          nodeTouchesWindow(node, visibleWindow)
      )
    : layout.nodes.filter((node) => node.id === selectedNodeId || node.isHead);

  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const edges = visibleWindow
    ? layout.edges.filter(
        (edge) =>
          visibleNodeIds.has(edge.fromNodeId) ||
          visibleNodeIds.has(edge.toNodeId) ||
          edgeTouchesWindow(edge, visibleWindow)
      )
    : [];

  return {
    edges,
    nodes,
    visibleNodeIds,
  };
}
