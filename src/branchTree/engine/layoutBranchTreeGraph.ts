import type {
  BranchTreeEdge,
  BranchTreeGraph,
  BranchTreeLayout,
  BranchTreeLayoutEdge,
  BranchTreeLayoutNode,
  BranchTreeNode,
} from './types';

export const BRANCH_TREE_NODE_WIDTH = 120;
export const BRANCH_TREE_NODE_HEIGHT = 82;
export const BRANCH_TREE_LANE_WIDTH = 140;
export const BRANCH_TREE_ROW_HEIGHT = 110;
export const BRANCH_TREE_CANVAS_PADDING = 120;
export const BRANCH_TREE_MAX_VISIBLE_SIBLINGS = 2;

function buildBezierPath(from: BranchTreeLayoutNode, to: BranchTreeLayoutNode): string {
  const startX = from.x + BRANCH_TREE_NODE_WIDTH / 2;
  const startY = from.y + BRANCH_TREE_NODE_HEIGHT;
  const endX = to.x + BRANCH_TREE_NODE_WIDTH / 2;
  const endY = to.y;
  const verticalDistance = Math.max(40, Math.abs(endY - startY));
  const controlX1 = startX;
  const controlY1 = startY + verticalDistance * 0.45;
  const controlX2 = endX;
  const controlY2 = endY - verticalDistance * 0.45;
  return `M ${startX} ${startY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${endX} ${endY}`;
}

export function layoutBranchTreeGraph(graph: BranchTreeGraph): BranchTreeLayout {
  const depths = new Map<string, number>();
  const lanes = new Map<string, number>();
  const occupiedLanesByDepth = new Map<number, Set<number>>();
  const collapsedCounts = new Map<string, number>();

  const childrenByParentId = new Map<string, BranchTreeNode[]>();
  graph.nodes.forEach((node) => {
    if (node.parentNodeId) {
      const children = childrenByParentId.get(node.parentNodeId) ?? [];
      children.push(node);
      childrenByParentId.set(node.parentNodeId, children);
    }
  });

  childrenByParentId.forEach((children) => {
    children.sort((a, b) => {
      if (a.isActivePath !== b.isActivePath) {
        return a.isActivePath ? -1 : 1;
      }
      return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });
  });

  const roots = graph.nodes
    .filter((n) => !n.parentNodeId)
    .sort((a, b) => {
      if (a.isActivePath !== b.isActivePath) {
        return a.isActivePath ? -1 : 1;
      }
      return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });

  function computeDepth(node: BranchTreeNode, currentDepth: number) {
    depths.set(node.id, currentDepth);
    const children = childrenByParentId.get(node.id) ?? [];
    children.forEach((child) => computeDepth(child, currentDepth + 1));
  }
  roots.forEach((root) => computeDepth(root, 0));

  function isOccupied(depth: number, lane: number) {
    return occupiedLanesByDepth.get(depth)?.has(lane) ?? false;
  }
  function reserve(depth: number, lane: number) {
    const set = occupiedLanesByDepth.get(depth) ?? new Set<number>();
    set.add(lane);
    occupiedLanesByDepth.set(depth, set);
  }
  function findFreeLane(depth: number, preferredLane: number, direction: 1 | -1) {
    let l = preferredLane;
    while (isOccupied(depth, l)) {
      l += direction;
    }
    return l;
  }

  function assignLaneDFS(node: BranchTreeNode, preferredLane: number, direction: 1 | -1) {
    const depth = depths.get(node.id) ?? 0;
    let targetLane = node.isActivePath ? 0 : preferredLane;
    if (isOccupied(depth, targetLane)) {
      targetLane = findFreeLane(depth, targetLane, direction);
    }
    lanes.set(node.id, targetLane);
    reserve(depth, targetLane);

    const children = childrenByParentId.get(node.id) ?? [];
    
    const inactiveChildren = children.filter((c) => !c.isActivePath);
    const activeChildren = children.filter((c) => c.isActivePath);
    const visibleInactiveCount = Math.min(inactiveChildren.length, BRANCH_TREE_MAX_VISIBLE_SIBLINGS);
    const collapsedCount = Math.max(0, inactiveChildren.length - visibleInactiveCount);
    collapsedCounts.set(node.id, collapsedCount);

    const visibleChildren = [
      ...activeChildren,
      ...inactiveChildren.slice(0, visibleInactiveCount)
    ];

    visibleChildren.forEach((child, index) => {
      const childDir = index % 2 === 0 ? direction : (direction * -1 as 1 | -1);
      const childPref = index === 0 ? targetLane : targetLane + childDir;
      assignLaneDFS(child, childPref, childDir);
    });
  }

  roots.forEach((root, index) => {
    const dir = index % 2 === 0 ? 1 : -1;
    const pref = index === 0 ? 0 : dir * Math.ceil(index / 2);
    assignLaneDFS(root, pref, dir);
  });

  const placedNodes = graph.nodes.filter(n => lanes.has(n.id));
  
  const minLane = placedNodes.reduce((min, node) => Math.min(min, lanes.get(node.id) ?? 0), 0);
  const maxLane = placedNodes.reduce((max, node) => Math.max(max, lanes.get(node.id) ?? 0), 0);
  const maxDepth = placedNodes.reduce((max, node) => Math.max(max, depths.get(node.id) ?? 0), 0);
  const maxAbsLane = Math.max(Math.abs(minLane), Math.abs(maxLane));
  const xOffset = BRANCH_TREE_CANVAS_PADDING + maxAbsLane * BRANCH_TREE_LANE_WIDTH;

  const layoutNodeById = new Map<string, BranchTreeLayoutNode>();
  
  const layoutNodes: BranchTreeLayoutNode[] = placedNodes.map(node => {
    const depth = depths.get(node.id) ?? 0;
    const lane = lanes.get(node.id) ?? 0;
    const collapsedCount = collapsedCounts.get(node.id) ?? 0;
    const layoutNode = {
      ...node,
      collapsedChildCount: collapsedCount,
      depth,
      lane,
      x: xOffset + lane * BRANCH_TREE_LANE_WIDTH,
      y: BRANCH_TREE_CANVAS_PADDING + depth * BRANCH_TREE_ROW_HEIGHT,
    };
    layoutNodeById.set(node.id, layoutNode);
    return layoutNode;
  });

  const layoutEdges: BranchTreeLayoutEdge[] = graph.edges.reduce<BranchTreeLayoutEdge[]>((acc, edge) => {
    const from = layoutNodeById.get(edge.fromNodeId);
    const to = layoutNodeById.get(edge.toNodeId);
    if (!from || !to) {
      return acc;
    }
    acc.push({
      ...edge,
      path: buildBezierPath(from, to),
    });
    return acc;
  }, []);

  const headNode = graph.headNodeId ? layoutNodeById.get(graph.headNodeId) ?? null : null;

  return {
    edges: layoutEdges,
    headNode,
    height: BRANCH_TREE_CANVAS_PADDING * 2 + maxDepth * BRANCH_TREE_ROW_HEIGHT + BRANCH_TREE_NODE_HEIGHT,
    nodes: layoutNodes,
    width: BRANCH_TREE_CANVAS_PADDING * 2 + (maxAbsLane * 2 + 1) * BRANCH_TREE_LANE_WIDTH,
  };
}
