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
export const BRANCH_TREE_CANVAS_PADDING = 180;
export const BRANCH_TREE_MAX_VISIBLE_SIBLINGS = 2;

function nodeSort(left: BranchTreeNode, right: BranchTreeNode): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function assignActivePathDepths(nodes: BranchTreeNode[]): Map<string, number> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const activeNodes = nodes.filter((node) => node.isActivePath);
  const activeHead = activeNodes.find((node) => node.isHead) ?? activeNodes[activeNodes.length - 1] ?? null;
  const activeChain: BranchTreeNode[] = [];
  let cursor: BranchTreeNode | undefined = activeHead ?? undefined;

  while (cursor?.isActivePath) {
    activeChain.push(cursor);
    cursor = cursor.parentNodeId ? nodeById.get(cursor.parentNodeId) : undefined;
  }

  const orderedActiveNodes = activeChain.length > 0 ? activeChain.reverse() : activeNodes.sort(nodeSort);
  const depths = new Map<string, number>();
  orderedActiveNodes.forEach((node, index) => {
    depths.set(node.id, index);
  });
  return depths;
}

function reserveLane(occupiedLanesByDepth: Map<number, Set<number>>, depth: number, lane: number): void {
  const occupied = occupiedLanesByDepth.get(depth) ?? new Set<number>();
  occupied.add(lane);
  occupiedLanesByDepth.set(depth, occupied);
}

function resolveInactiveLane(
  parentLane: number,
  siblingIndex: number,
  depth: number,
  occupiedLanesByDepth: Map<number, Set<number>>
): number {
  const direction = parentLane < 0 ? -1 : parentLane > 0 ? 1 : siblingIndex % 2 === 0 ? -1 : 1;
  let lane = parentLane === 0 ? direction : parentLane + direction;
  while (occupiedLanesByDepth.get(depth)?.has(lane)) {
    lane += direction;
  }
  return lane;
}

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

function toPositionedNode(node: BranchTreeNode, lane: number, depth: number, collapsedChildCount = 0): BranchTreeLayoutNode {
  return {
    ...node,
    collapsedChildCount,
    depth,
    lane,
    x: lane * BRANCH_TREE_LANE_WIDTH,
    y: BRANCH_TREE_CANVAS_PADDING + depth * BRANCH_TREE_ROW_HEIGHT,
  };
}

export function layoutBranchTreeGraph(graph: BranchTreeGraph): BranchTreeLayout {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const childrenByParentId = new Map<string, BranchTreeNode[]>();
  graph.nodes.forEach((node) => {
    if (!node.parentNodeId) {
      return;
    }
    const children = childrenByParentId.get(node.parentNodeId) ?? [];
    children.push(node);
    childrenByParentId.set(node.parentNodeId, children);
  });
  childrenByParentId.forEach((children) => children.sort(nodeSort));

  const activeDepths = assignActivePathDepths(graph.nodes);
  const occupiedLanesByDepth = new Map<number, Set<number>>();
  const layoutNodeById = new Map<string, BranchTreeLayoutNode>();

  graph.nodes
    .filter((node) => activeDepths.has(node.id))
    .sort((left, right) => (activeDepths.get(left.id) ?? 0) - (activeDepths.get(right.id) ?? 0))
    .forEach((node) => {
      const depth = activeDepths.get(node.id) ?? 0;
      reserveLane(occupiedLanesByDepth, depth, 0);
      layoutNodeById.set(node.id, toPositionedNode(node, 0, depth));
    });

  function placeInactiveChildren(parentNode: BranchTreeNode, parentLane: number, parentDepth: number): void {
    const children = childrenByParentId.get(parentNode.id) ?? [];
    const inactiveChildren = children.filter((child) => !activeDepths.has(child.id)).sort(nodeSort);
    const visibleInactiveChildren = inactiveChildren.slice(0, BRANCH_TREE_MAX_VISIBLE_SIBLINGS);
    const parentLayoutNode = layoutNodeById.get(parentNode.id);
    if (parentLayoutNode) {
      parentLayoutNode.collapsedChildCount = Math.max(0, inactiveChildren.length - visibleInactiveChildren.length);
    }

    visibleInactiveChildren.forEach((child, siblingIndex) => {
      const depth = parentDepth + 1;
      const lane = resolveInactiveLane(parentLane, siblingIndex, depth, occupiedLanesByDepth);
      reserveLane(occupiedLanesByDepth, depth, lane);
      layoutNodeById.set(child.id, toPositionedNode(child, lane, depth));
      placeInactiveChildren(child, lane, depth);
    });

    children
      .filter((child) => activeDepths.has(child.id))
      .forEach((child) => {
        const childDepth = activeDepths.get(child.id);
        if (childDepth !== undefined) {
          placeInactiveChildren(child, 0, childDepth);
        }
      });
  }

  graph.nodes
    .filter((node) => !node.parentNodeId)
    .sort(nodeSort)
    .forEach((rootNode, rootIndex) => {
      const depth = activeDepths.get(rootNode.id) ?? 0;
      const lane = activeDepths.has(rootNode.id) ? 0 : resolveInactiveLane(0, rootIndex, depth, occupiedLanesByDepth);
      if (!layoutNodeById.has(rootNode.id)) {
        reserveLane(occupiedLanesByDepth, depth, lane);
        layoutNodeById.set(rootNode.id, toPositionedNode(rootNode, lane, depth));
      }
      placeInactiveChildren(rootNode, lane, depth);
    });

  const nodes = [...layoutNodeById.values()].sort((left, right) => left.depth - right.depth || left.lane - right.lane);
  const minLane = nodes.reduce((min, node) => Math.min(min, node.lane), 0);
  const maxLane = nodes.reduce((max, node) => Math.max(max, node.lane), 0);
  const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
  const xOffset = BRANCH_TREE_CANVAS_PADDING - minLane * BRANCH_TREE_LANE_WIDTH;
  nodes.forEach((node) => {
    node.x += xOffset;
  });
  const layoutEdges: BranchTreeLayoutEdge[] = graph.edges.reduce<BranchTreeLayoutEdge[]>((edges, edge: BranchTreeEdge) => {
    const from = layoutNodeById.get(edge.fromNodeId);
    const to = layoutNodeById.get(edge.toNodeId);
    if (!from || !to) {
      return edges;
    }
    edges.push({
      ...edge,
      path: buildBezierPath(from, to),
    });
    return edges;
  }, []);
  const headNode = graph.headNodeId ? layoutNodeById.get(graph.headNodeId) ?? null : null;

  return {
    edges: layoutEdges,
    headNode,
    height: BRANCH_TREE_CANVAS_PADDING * 2 + maxDepth * BRANCH_TREE_ROW_HEIGHT + BRANCH_TREE_NODE_HEIGHT,
    nodes,
    width: BRANCH_TREE_CANVAS_PADDING * 2 + (maxLane - minLane + 1) * BRANCH_TREE_LANE_WIDTH,
  };
}
