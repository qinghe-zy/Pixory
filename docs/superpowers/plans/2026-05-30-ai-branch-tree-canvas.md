# AI Branch Tree Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current AI Branch Tree page with an isolated mobile canvas module that supports Git-like DAG layout, pan/zoom gestures, Bezier links, HEAD recentering, and a bottom chat snapshot drawer.

**Architecture:** Create an independent `src/branchTree/` module with pure graph/layout engine functions, isolated canvas components, and a Pixory AI adapter. Keep `AiBranchTreeScreen` as a thin route shell and preserve the existing checkout selection-map and return-to-chat scroll contract.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`, `react-native-svg`, existing Pixory AI light theme/tokens, Node policy tests.

---

## Scope

This plan implements the first production-oriented Branch Tree canvas. It does not implement a generic graph platform, cross-thread merge/rebase, physical descendant deletion, or new cloud/account behavior.

The implementation must preserve:

- existing `ai-branch-tree` route name,
- existing `onSelectBranch` checkout contract,
- existing `adoptBranchSelection` path in `App.tsx`,
- existing branch-tree return scroll retry in `AiChatScreen.tsx`,
- existing local-only data model.

## File Structure

Create:

- `src/branchTree/engine/types.ts`
  - Shared graph, layout, snapshot, and viewport types.
- `src/branchTree/engine/buildBranchTreeGraph.ts`
  - Converts adapter nodes into one-node-per-message-version DAG graph data.
- `src/branchTree/engine/layoutBranchTreeGraph.ts`
  - Computes centered active-path lanes, depth rows, collapsed groups, and Bezier link anchors.
- `src/branchTree/engine/branchTreeViewport.ts`
  - Contains scale clamps, world/screen transform helpers, and HEAD offscreen detection.
- `src/branchTree/adapters/pixoryAiBranchTreeAdapter.ts`
  - Converts current `AiBranchTreeNode`/preview service data into branch-tree graph input and snapshot data.
- `src/branchTree/components/BranchTreeGrid.tsx`
  - SVG grid layer.
- `src/branchTree/components/BranchTreeLinks.tsx`
  - SVG Bezier link layer.
- `src/branchTree/components/BranchTreeNodeCard.tsx`
  - Compact 120px node card.
- `src/branchTree/components/BranchTreeDrawer.tsx`
  - Bottom chat snapshot drawer.
- `src/branchTree/components/BranchTreeCanvas.tsx`
  - Gesture-enabled canvas composition.
- `tests/ai-branch-tree-canvas-policy.test.cjs`
  - Policy tests for dependency wiring, module boundaries, layout rules, gesture stack, drawer behavior, and screen integration.

Modify:

- `package.json`
  - Add graph interaction dependencies via Expo install.
- `pnpm-lock.yaml`
  - Updated by Expo/pnpm install.
- `index.ts`
  - Import `react-native-gesture-handler` first.
- `App.tsx`
  - Wrap app content in `GestureHandlerRootView`.
- `src/screens/AiBranchTreeScreen.tsx`
  - Replace current static/scroll tree with the new adapter + canvas + drawer flow.
- `tests/ai-branch-tree-navigation-policy.test.cjs`
  - Update assertions that currently expect embedded preview inside tree rows.
- `tests/ai-chat-fixes-policy.test.cjs`
  - Keep scroll retry assertions unchanged unless import names move.

Do not modify:

- database schema,
- AI memory services,
- provider adapters,
- material/document systems,
- image/video asset storage flows,
- release version files.

---

## Task 1: Add Native Canvas Dependencies And App Root Wiring

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `index.ts`
- Modify: `App.tsx`
- Test: `tests/ai-branch-tree-canvas-policy.test.cjs`

- [ ] **Step 1: Write the dependency and root-wiring policy test**

Create `tests/ai-branch-tree-canvas-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(read(file));

test('branch tree canvas dependencies are installed through the Expo-compatible stack', () => {
  const pkg = readJson('package.json');

  assert.match(pkg.dependencies['react-native-gesture-handler'] ?? '', /\d/);
  assert.match(pkg.dependencies['react-native-reanimated'] ?? '', /\d/);
  assert.match(pkg.dependencies['react-native-worklets'] ?? '', /\d/);
  assert.match(pkg.dependencies['react-native-svg'] ?? '', /\d/);
});

test('gesture handler is initialized before the app registers and wraps the root view', () => {
  const index = read('index.ts');
  const app = read('App.tsx');

  assert.match(index, /^import 'react-native-gesture-handler';/);
  assert.match(app, /import \{ GestureHandlerRootView \} from 'react-native-gesture-handler';/);
  assert.match(app, /<GestureHandlerRootView style=\{styles\.gestureRoot\}>/);
  assert.match(app, /gestureRoot:\s*\{\s*flex:\s*1\s*\}/);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
```

Expected: FAIL because the dependencies and root wiring are not present.

- [ ] **Step 3: Install Expo-compatible dependencies**

Run:

```powershell
pnpm exec expo install react-native-gesture-handler react-native-reanimated react-native-worklets react-native-svg
```

Expected: `package.json` and `pnpm-lock.yaml` are updated. Use Expo install so versions align with the installed SDK.

- [ ] **Step 4: Initialize gesture handler before app registration**

Modify `index.ts` so the first import is:

```ts
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
```

- [ ] **Step 5: Wrap the app in `GestureHandlerRootView`**

In `App.tsx`, add the import:

```ts
import { GestureHandlerRootView } from 'react-native-gesture-handler';
```

Wrap the current return tree:

```tsx
return (
  <GestureHandlerRootView style={styles.gestureRoot}>
    <SafeAreaProvider>
      <AppToastProvider>
        {/* existing content stays unchanged */}
      </AppToastProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
);
```

Add this style to the existing `StyleSheet.create` object:

```ts
gestureRoot: {
  flex: 1,
},
```

- [ ] **Step 6: Verify dependency and root wiring**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 7: Commit**

```powershell
git add package.json pnpm-lock.yaml index.ts App.tsx tests/ai-branch-tree-canvas-policy.test.cjs
git commit -m "feat: add branch tree canvas dependencies"
```

---

## Task 2: Add Branch Tree Engine Types

**Files:**

- Create: `src/branchTree/engine/types.ts`
- Modify: `tests/ai-branch-tree-canvas-policy.test.cjs`

- [ ] **Step 1: Add a failing policy test for engine type boundaries**

Append to `tests/ai-branch-tree-canvas-policy.test.cjs`:

```js
test('branch tree engine exposes graph layout snapshot and viewport contracts', () => {
  const types = read('src/branchTree/engine/types.ts');

  assert.match(types, /export type BranchTreeRole = 'user' \| 'assistant' \| 'system'/);
  assert.match(types, /export interface BranchTreeNode/);
  assert.match(types, /messageId: string/);
  assert.match(types, /versionIndex: number/);
  assert.match(types, /parentNodeId: string \| null/);
  assert.match(types, /childNodeIds: string\[\]/);
  assert.match(types, /export interface BranchTreeEdge/);
  assert.match(types, /kind: 'active' \| 'inactive'/);
  assert.match(types, /export interface BranchTreeGraph/);
  assert.match(types, /export interface BranchTreeLayoutNode/);
  assert.match(types, /lane: number/);
  assert.match(types, /depth: number/);
  assert.match(types, /export interface BranchTreeSnapshot/);
  assert.match(types, /export interface BranchTreeViewportTransform/);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
```

Expected: FAIL because `src/branchTree/engine/types.ts` does not exist.

- [ ] **Step 3: Create the engine type file**

Create `src/branchTree/engine/types.ts`:

```ts
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
  childMessages: BranchTreeSnapshotMessage[];
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
```

- [ ] **Step 4: Verify types**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add src/branchTree/engine/types.ts tests/ai-branch-tree-canvas-policy.test.cjs
git commit -m "feat: add branch tree engine types"
```

---

## Task 3: Build The One-Message-Version DAG Graph

**Files:**

- Create: `src/branchTree/engine/buildBranchTreeGraph.ts`
- Modify: `tests/ai-branch-tree-canvas-policy.test.cjs`

- [ ] **Step 1: Add a failing policy test for the graph builder**

Append to `tests/ai-branch-tree-canvas-policy.test.cjs`:

```js
test('branch tree graph builder models one message version per node and derives active edges', () => {
  const builder = read('src/branchTree/engine/buildBranchTreeGraph.ts');

  assert.match(builder, /export interface BranchTreeSourceNode/);
  assert.match(builder, /messageId: string/);
  assert.match(builder, /versionIndex: number/);
  assert.match(builder, /parentMessageId: string \| null/);
  assert.match(builder, /parentVersionIndex: number \| null/);
  assert.match(builder, /export function buildBranchTreeGraph/);
  assert.match(builder, /const nodeByVersionKey = new Map<string, BranchTreeNode>/);
  assert.match(builder, /function versionKey\(messageId: string, versionIndex: number\)/);
  assert.match(builder, /childNodeIds/);
  assert.match(builder, /activeNodeId/);
  assert.match(builder, /headNodeId/);
  assert.doesNotMatch(builder, /Date\.parse/);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
```

Expected: FAIL because the builder file does not exist.

- [ ] **Step 3: Create the graph builder**

Create `src/branchTree/engine/buildBranchTreeGraph.ts`:

```ts
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
  const sorted = [...sourceNodes].sort((left, right) =>
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
      parentNodeId: source.parentMessageId && source.parentVersionIndex
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
```

- [ ] **Step 4: Verify graph builder**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add src/branchTree/engine/buildBranchTreeGraph.ts tests/ai-branch-tree-canvas-policy.test.cjs
git commit -m "feat: build branch tree graph"
```

---

## Task 4: Add Centered Lane Layout Algorithm

**Files:**

- Create: `src/branchTree/engine/layoutBranchTreeGraph.ts`
- Modify: `tests/ai-branch-tree-canvas-policy.test.cjs`

- [ ] **Step 1: Add failing layout policy tests**

Append to `tests/ai-branch-tree-canvas-policy.test.cjs`:

```js
test('branch tree layout centers active path and pushes nested branches outward', () => {
  const layout = read('src/branchTree/engine/layoutBranchTreeGraph.ts');

  assert.match(layout, /export const BRANCH_TREE_NODE_WIDTH = 120/);
  assert.match(layout, /export const BRANCH_TREE_LANE_WIDTH = 140/);
  assert.match(layout, /export const BRANCH_TREE_ROW_HEIGHT = 110/);
  assert.match(layout, /export const BRANCH_TREE_MAX_VISIBLE_SIBLINGS = 2/);
  assert.match(layout, /export function layoutBranchTreeGraph/);
  assert.match(layout, /function assignActivePathDepths/);
  assert.match(layout, /function resolveInactiveLane/);
  assert.match(layout, /parentLane < 0/);
  assert.match(layout, /parentLane > 0/);
  assert.match(layout, /while \(occupiedLanesByDepth\.get\(depth\)\?\.has\(lane\)\)/);
  assert.match(layout, /lane \+= direction/);
  assert.doesNotMatch(layout, /Date\.parse/);
});

test('branch tree layout emits cubic Bezier SVG paths instead of hard elbows', () => {
  const layout = read('src/branchTree/engine/layoutBranchTreeGraph.ts');

  assert.match(layout, /function buildBezierPath/);
  assert.match(layout, /return `M \$\{startX\} \$\{startY\} C \$\{controlX1\} \$\{controlY1\}, \$\{controlX2\} \$\{controlY2\}, \$\{endX\} \$\{endY\}`/);
  assert.doesNotMatch(layout, / L /);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
```

Expected: FAIL because the layout file does not exist.

- [ ] **Step 3: Create the layout algorithm**

Create `src/branchTree/engine/layoutBranchTreeGraph.ts`:

```ts
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
  const depths = new Map<string, number>();
  nodes.filter((node) => node.isActivePath).sort(nodeSort).forEach((node, index) => {
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

export function layoutBranchTreeGraph(graph: BranchTreeGraph): BranchTreeLayout {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const activeDepths = assignActivePathDepths(graph.nodes);
  const layoutById = new Map<string, BranchTreeLayoutNode>();
  const occupiedLanesByDepth = new Map<number, Set<number>>();

  graph.nodes.filter((node) => node.isActivePath).sort(nodeSort).forEach((node) => {
    const depth = activeDepths.get(node.id) ?? 0;
    const layoutNode: BranchTreeLayoutNode = {
      ...node,
      collapsedChildCount: Math.max(0, node.childNodeIds.length - BRANCH_TREE_MAX_VISIBLE_SIBLINGS),
      depth,
      lane: 0,
      x: 0,
      y: depth * BRANCH_TREE_ROW_HEIGHT,
    };
    layoutById.set(node.id, layoutNode);
    reserveLane(occupiedLanesByDepth, depth, 0);
  });

  graph.nodes.filter((node) => !node.isActivePath).sort(nodeSort).forEach((node) => {
    const parent = node.parentNodeId ? layoutById.get(node.parentNodeId) : null;
    const parentSource = node.parentNodeId ? nodeById.get(node.parentNodeId) : null;
    const siblingIndex = parentSource?.childNodeIds.indexOf(node.id) ?? 0;
    const depth = parent ? parent.depth + 1 : layoutById.size;
    const parentLane = parent?.lane ?? 0;
    const lane = resolveInactiveLane(parentLane, Math.max(0, siblingIndex), depth, occupiedLanesByDepth);
    const layoutNode: BranchTreeLayoutNode = {
      ...node,
      collapsedChildCount: Math.max(0, node.childNodeIds.length - BRANCH_TREE_MAX_VISIBLE_SIBLINGS),
      depth,
      lane,
      x: lane * BRANCH_TREE_LANE_WIDTH,
      y: depth * BRANCH_TREE_ROW_HEIGHT,
    };
    layoutById.set(node.id, layoutNode);
    reserveLane(occupiedLanesByDepth, depth, lane);
  });

  const nodes = [...layoutById.values()].sort((left, right) => left.depth - right.depth || left.lane - right.lane);
  const edges: BranchTreeLayoutEdge[] = graph.edges.flatMap((edge: BranchTreeEdge) => {
    const from = layoutById.get(edge.fromNodeId);
    const to = layoutById.get(edge.toNodeId);
    if (!from || !to) {
      return [];
    }
    return [{ ...edge, path: buildBezierPath(from, to) }];
  });

  const minX = Math.min(0, ...nodes.map((node) => node.x));
  const maxX = Math.max(0, ...nodes.map((node) => node.x + BRANCH_TREE_NODE_WIDTH));
  const maxY = Math.max(0, ...nodes.map((node) => node.y + BRANCH_TREE_NODE_HEIGHT));

  return {
    edges,
    headNode: graph.headNodeId ? layoutById.get(graph.headNodeId) ?? null : null,
    height: maxY + BRANCH_TREE_CANVAS_PADDING,
    nodes,
    width: maxX - minX + BRANCH_TREE_CANVAS_PADDING * 2,
  };
}
```

- [ ] **Step 4: Verify layout**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add src/branchTree/engine/layoutBranchTreeGraph.ts tests/ai-branch-tree-canvas-policy.test.cjs
git commit -m "feat: layout branch tree lanes"
```

---

## Task 5: Add Viewport Transform And HEAD Recenter Helpers

**Files:**

- Create: `src/branchTree/engine/branchTreeViewport.ts`
- Modify: `tests/ai-branch-tree-canvas-policy.test.cjs`

- [ ] **Step 1: Add failing viewport policy test**

Append to `tests/ai-branch-tree-canvas-policy.test.cjs`:

```js
test('branch tree viewport helpers clamp zoom and detect offscreen head safely', () => {
  const viewport = read('src/branchTree/engine/branchTreeViewport.ts');

  assert.match(viewport, /export const BRANCH_TREE_MIN_SCALE = 0\.4/);
  assert.match(viewport, /export const BRANCH_TREE_MAX_SCALE = 1\.8/);
  assert.match(viewport, /export function clampBranchTreeScale/);
  assert.match(viewport, /Math\.min\(BRANCH_TREE_MAX_SCALE, Math\.max\(BRANCH_TREE_MIN_SCALE, scale\)\)/);
  assert.match(viewport, /export function worldToScreen/);
  assert.match(viewport, /point\.x \* transform\.scale \+ transform\.translateX/);
  assert.match(viewport, /export function isHeadOutsideSafeViewport/);
  assert.match(viewport, /screenPoint\.x < 20/);
  assert.match(viewport, /screenPoint\.x > viewport\.width - 140/);
  assert.match(viewport, /screenPoint\.y < 80/);
  assert.match(viewport, /screenPoint\.y > viewport\.height - 280/);
  assert.match(viewport, /export function buildRecenterTransform/);
  assert.match(viewport, /viewport\.height \* 0\.35/);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
```

Expected: FAIL because the viewport file does not exist.

- [ ] **Step 3: Create viewport helpers**

Create `src/branchTree/engine/branchTreeViewport.ts`:

```ts
import type { BranchTreePoint, BranchTreeViewportSize, BranchTreeViewportTransform } from './types';

export const BRANCH_TREE_MIN_SCALE = 0.4;
export const BRANCH_TREE_MAX_SCALE = 1.8;

export function clampBranchTreeScale(scale: number): number {
  return Math.min(BRANCH_TREE_MAX_SCALE, Math.max(BRANCH_TREE_MIN_SCALE, scale));
}

export function worldToScreen(point: BranchTreePoint, transform: BranchTreeViewportTransform): BranchTreePoint {
  return {
    x: point.x * transform.scale + transform.translateX,
    y: point.y * transform.scale + transform.translateY,
  };
}

export function isHeadOutsideSafeViewport(screenPoint: BranchTreePoint, viewport: BranchTreeViewportSize): boolean {
  return (
    screenPoint.x < 20 ||
    screenPoint.x > viewport.width - 140 ||
    screenPoint.y < 80 ||
    screenPoint.y > viewport.height - 280
  );
}

export function buildRecenterTransform(
  headWorldPoint: BranchTreePoint,
  viewport: BranchTreeViewportSize,
  scale: number
): BranchTreeViewportTransform {
  const nextScale = clampBranchTreeScale(scale);
  return {
    scale: nextScale,
    translateX: viewport.width / 2 - headWorldPoint.x * nextScale,
    translateY: viewport.height * 0.35 - headWorldPoint.y * nextScale,
  };
}
```

- [ ] **Step 4: Verify viewport helpers**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add src/branchTree/engine/branchTreeViewport.ts tests/ai-branch-tree-canvas-policy.test.cjs
git commit -m "feat: add branch tree viewport helpers"
```

---

## Task 6: Add Pixory AI Branch Tree Adapter

**Files:**

- Create: `src/branchTree/adapters/pixoryAiBranchTreeAdapter.ts`
- Modify: `tests/ai-branch-tree-canvas-policy.test.cjs`

- [ ] **Step 1: Add failing adapter policy test**

Append to `tests/ai-branch-tree-canvas-policy.test.cjs`:

```js
test('Pixory branch tree adapter isolates AI service records from canvas graph records', () => {
  const adapter = read('src/branchTree/adapters/pixoryAiBranchTreeAdapter.ts');

  assert.match(adapter, /import type \{ AiBranchTreeNode, AiBranchTreePreview \} from '..\/..\/ai\/aiBranchTreeService'/);
  assert.match(adapter, /import \{ buildBranchTreeGraph/);
  assert.match(adapter, /export function buildPixoryBranchTreeGraph/);
  assert.match(adapter, /messageId: node\.branchRootMessageId/);
  assert.match(adapter, /versionIndex: node\.branchVersionIndex/);
  assert.match(adapter, /parentMessageId: node\.parentBranchRootMessageId/);
  assert.match(adapter, /parentVersionIndex: node\.parentBranchVersionIndex/);
  assert.match(adapter, /isActivePath: node\.isCurrentRoute/);
  assert.match(adapter, /export function buildPixoryBranchTreeSnapshot/);
  assert.doesNotMatch(adapter, /AiChatScreen/);
  assert.doesNotMatch(adapter, /aiMemory/);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
```

Expected: FAIL because the adapter file does not exist.

- [ ] **Step 3: Create the adapter**

Create `src/branchTree/adapters/pixoryAiBranchTreeAdapter.ts`:

```ts
import type { AiBranchTreeNode, AiBranchTreePreview } from '../../ai/aiBranchTreeService';
import { buildBranchTreeGraph } from '../engine/buildBranchTreeGraph';
import type { BranchTreeGraph, BranchTreeSnapshot, BranchTreeSnapshotMessage } from '../engine/types';

function roleFromAiNode(node: AiBranchTreeNode): 'user' | 'assistant' | 'system' {
  return node.rootRole === 'user' || node.rootRole === 'assistant' || node.rootRole === 'system'
    ? node.rootRole
    : 'assistant';
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
    role: message.role === 'user' || message.role === 'assistant' || message.role === 'system' ? message.role : 'assistant',
  };
}

export function buildPixoryBranchTreeSnapshot(preview: AiBranchTreePreview | null): BranchTreeSnapshot | null {
  if (!preview) {
    return null;
  }
  return {
    childMessages: preview.followUpMessages.map(toSnapshotMessage),
    node: {
      branchesCount: preview.node.followUpMessageCount,
      childNodeIds: [],
      contentPreview: preview.node.preview,
      createdAt: preview.node.createdAt,
      id: preview.node.id,
      isActivePath: preview.node.isCurrentRoute,
      isHead: false,
      messageId: preview.node.branchRootMessageId,
      parentNodeId: preview.node.parentBranchRootMessageId && preview.node.parentBranchVersionIndex
        ? `${preview.node.parentBranchRootMessageId}:${preview.node.parentBranchVersionIndex}`
        : null,
      role: roleFromAiNode(preview.node),
      status: preview.node.status,
      summary: preview.node.title,
      versionIndex: preview.node.branchVersionIndex,
      versionTotal: preview.node.versionTotal,
    },
    parentMessages: preview.previousMessages.map(toSnapshotMessage),
    selectedMessage: toSnapshotMessage(preview.selectedMessage),
  };
}
```

- [ ] **Step 4: Verify adapter**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add src/branchTree/adapters/pixoryAiBranchTreeAdapter.ts tests/ai-branch-tree-canvas-policy.test.cjs
git commit -m "feat: adapt Pixory branches to canvas graph"
```

---

## Task 7: Add SVG Grid, Links, And Compact Node Components

**Files:**

- Create: `src/branchTree/components/BranchTreeGrid.tsx`
- Create: `src/branchTree/components/BranchTreeLinks.tsx`
- Create: `src/branchTree/components/BranchTreeNodeCard.tsx`
- Modify: `tests/ai-branch-tree-canvas-policy.test.cjs`

- [ ] **Step 1: Add failing component policy test**

Append to `tests/ai-branch-tree-canvas-policy.test.cjs`:

```js
test('branch tree visual layers use SVG grid links and compact view nodes', () => {
  const grid = read('src/branchTree/components/BranchTreeGrid.tsx');
  const links = read('src/branchTree/components/BranchTreeLinks.tsx');
  const node = read('src/branchTree/components/BranchTreeNodeCard.tsx');

  assert.match(grid, /import Svg, \{ Circle, Line \} from 'react-native-svg'/);
  assert.match(grid, /opacity=\{0\.08\}/);
  assert.match(grid, /smallStep = 20/);
  assert.match(grid, /largeStep = 100/);
  assert.match(links, /import Svg, \{ Path \} from 'react-native-svg'/);
  assert.match(links, /strokeWidth=\{edge\.kind === 'active' \? 3\.5 : 1\.8\}/);
  assert.match(links, /strokeDasharray=\{edge\.kind === 'active' \? undefined : '3,3'\}/);
  assert.match(node, /width: 120/);
  assert.match(node, /borderRadius: 16/);
  assert.match(node, /numberOfLines=\{2\}/);
  assert.match(node, /fontSize: 10\.5/);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
```

Expected: FAIL because the component files do not exist.

- [ ] **Step 3: Create `BranchTreeGrid.tsx`**

Create `src/branchTree/components/BranchTreeGrid.tsx`:

```tsx
import Svg, { Circle, Line } from 'react-native-svg';

import { aiLightColors } from '../../components/ai/aiLightTheme';

interface BranchTreeGridProps {
  width: number;
  height: number;
  smallStep?: number;
  largeStep?: number;
}

export function BranchTreeGrid({ height, largeStep = 100, smallStep = 20, width }: BranchTreeGridProps) {
  const dots = [];
  const lines = [];
  for (let x = 0; x <= width; x += smallStep) {
    for (let y = 0; y <= height; y += smallStep) {
      dots.push(<Circle cx={x} cy={y} fill={aiLightColors.muted} key={`dot:${x}:${y}`} opacity={0.08} r={1} />);
    }
  }
  for (let x = 0; x <= width; x += largeStep) {
    lines.push(<Line key={`vx:${x}`} opacity={0.08} stroke={aiLightColors.hairline} strokeWidth={1} x1={x} x2={x} y1={0} y2={height} />);
  }
  for (let y = 0; y <= height; y += largeStep) {
    lines.push(<Line key={`hy:${y}`} opacity={0.08} stroke={aiLightColors.hairline} strokeWidth={1} x1={0} x2={width} y1={y} y2={y} />);
  }
  return (
    <Svg height={height} pointerEvents="none" width={width}>
      {dots}
      {lines}
    </Svg>
  );
}
```

- [ ] **Step 4: Create `BranchTreeLinks.tsx`**

Create `src/branchTree/components/BranchTreeLinks.tsx`:

```tsx
import Svg, { Path } from 'react-native-svg';

import type { BranchTreeLayoutEdge } from '../engine/types';

interface BranchTreeLinksProps {
  edges: BranchTreeLayoutEdge[];
  width: number;
  height: number;
}

export function BranchTreeLinks({ edges, height, width }: BranchTreeLinksProps) {
  return (
    <Svg height={height} pointerEvents="none" width={width}>
      {edges.map((edge) => (
        <Path
          d={edge.path}
          fill="none"
          key={edge.id}
          stroke={edge.kind === 'active' ? '#D07C60' : '#D1C9BE'}
          strokeDasharray={edge.kind === 'active' ? undefined : '3,3'}
          strokeLinecap="round"
          strokeWidth={edge.kind === 'active' ? 3.5 : 1.8}
        />
      ))}
    </Svg>
  );
}
```

- [ ] **Step 5: Create `BranchTreeNodeCard.tsx`**

Create `src/branchTree/components/BranchTreeNodeCard.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { aiLightColors } from '../../components/ai/aiLightTheme';
import { radius, spacing, typography } from '../../design/tokens';
import type { BranchTreeLayoutNode } from '../engine/types';

interface BranchTreeNodeCardProps {
  node: BranchTreeLayoutNode;
  selected: boolean;
  onPress: (nodeId: string) => void;
  onDoublePress: (nodeId: string) => void;
}

export function BranchTreeNodeCard({ node, onDoublePress, onPress, selected }: BranchTreeNodeCardProps) {
  return (
    <Pressable
      accessibilityLabel={`查看${node.summary}分支快照`}
      accessibilityRole="button"
      onLongPress={() => onDoublePress(node.id)}
      onPress={() => onPress(node.id)}
      style={({ pressed }) => [
        styles.card,
        node.isActivePath && styles.activePathCard,
        selected && styles.selectedCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.metaRow}>
        <View style={[styles.statusDot, node.isActivePath && styles.activeDot]} />
        <Text numberOfLines={1} style={styles.versionLabel}>v{node.versionIndex}/{node.versionTotal}</Text>
      </View>
      <Text numberOfLines={2} style={styles.summary}>{node.summary}</Text>
      {node.collapsedChildCount > 0 ? (
        <Text numberOfLines={1} style={styles.branchCounter}>+{node.collapsedChildCount}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  activeDot: {
    backgroundColor: '#D07C60',
    borderColor: '#D07C60',
  },
  activePathCard: {
    borderColor: '#D07C60',
  },
  branchCounter: {
    ...typography.textStyles.caption,
    alignSelf: 'flex-start',
    backgroundColor: aiLightColors.coralSoft,
    borderRadius: radius.pill,
    color: '#D07C60',
    marginTop: spacing[1],
    paddingHorizontal: spacing[1.5],
    paddingVertical: 1,
  },
  card: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 70,
    padding: spacing[2],
    position: 'absolute',
    width: 120,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.76,
  },
  selectedCard: {
    borderColor: '#D07C60',
    borderWidth: 2,
  },
  statusDot: {
    backgroundColor: aiLightColors.surface,
    borderColor: '#D1C9BE',
    borderRadius: radius.pill,
    borderWidth: 2,
    height: spacing[3],
    width: spacing[3],
  },
  summary: {
    color: aiLightColors.ink,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: spacing[1],
  },
  versionLabel: {
    color: aiLightColors.muted,
    fontFamily: 'monospace',
    fontSize: 9,
  },
});
```

- [ ] **Step 6: Verify visual layers**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 7: Commit**

```powershell
git add src/branchTree/components/BranchTreeGrid.tsx src/branchTree/components/BranchTreeLinks.tsx src/branchTree/components/BranchTreeNodeCard.tsx tests/ai-branch-tree-canvas-policy.test.cjs
git commit -m "feat: add branch tree visual layers"
```

---

## Task 8: Add Bottom Snapshot Drawer Component

**Files:**

- Create: `src/branchTree/components/BranchTreeDrawer.tsx`
- Modify: `tests/ai-branch-tree-canvas-policy.test.cjs`

- [ ] **Step 1: Add failing drawer policy test**

Append to `tests/ai-branch-tree-canvas-policy.test.cjs`:

```js
test('branch tree drawer renders parent selected and child chat bubbles with safe actions', () => {
  const drawer = read('src/branchTree/components/BranchTreeDrawer.tsx');

  assert.match(drawer, /export function BranchTreeDrawer/);
  assert.match(drawer, /snapshot: BranchTreeSnapshot \| null/);
  assert.match(drawer, /parentMessages\.map/);
  assert.match(drawer, /selectedMessage/);
  assert.match(drawer, /childMessages\.map/);
  assert.match(drawer, /基于此衍生新分支/);
  assert.match(drawer, /切为此主线/);
  assert.match(drawer, /剪除此后代/);
  assert.match(drawer, /onSelectChildMessage/);
  assert.match(drawer, /onCheckout/);
  assert.match(drawer, /onDerive/);
  assert.match(drawer, /onRequestPrune/);
  assert.match(drawer, /message\.role === 'user'/);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
```

Expected: FAIL because the drawer component does not exist.

- [ ] **Step 3: Create `BranchTreeDrawer.tsx`**

Create `src/branchTree/components/BranchTreeDrawer.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AiLightButton } from '../../components/ai/AiLightButton';
import { aiLightColors } from '../../components/ai/aiLightTheme';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import type { BranchTreeSnapshot, BranchTreeSnapshotMessage } from '../engine/types';

interface BranchTreeDrawerProps {
  snapshot: BranchTreeSnapshot | null;
  loading?: boolean;
  onCheckout: () => void;
  onDerive: () => void;
  onRequestPrune: () => void;
  onSelectChildMessage: (messageId: string) => void;
}

function BranchTreeBubble({
  emphasis,
  message,
  muted,
}: {
  emphasis?: boolean;
  message: BranchTreeSnapshotMessage;
  muted?: boolean;
}) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View style={[
        styles.bubble,
        muted && styles.bubbleMuted,
        isUser && styles.bubbleUser,
        emphasis && styles.bubbleEmphasis,
      ]}>
        <Text numberOfLines={1} style={[styles.bubbleLabel, isUser && styles.bubbleLabelUser]}>{message.label}</Text>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{message.content || '空消息'}</Text>
      </View>
    </View>
  );
}

export function BranchTreeDrawer({
  loading = false,
  onCheckout,
  onDerive,
  onRequestPrune,
  onSelectChildMessage,
  snapshot,
}: BranchTreeDrawerProps) {
  return (
    <View style={styles.drawer}>
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        <Text numberOfLines={1} style={styles.title}>
          {snapshot ? '当前节点分支快照' : loading ? '正在读取分支快照' : '选择一个分支节点'}
        </Text>
        {snapshot ? <Text style={styles.versionLabel}>v{snapshot.node.versionIndex}/{snapshot.node.versionTotal}</Text> : null}
      </View>
      {snapshot ? (
        <View style={styles.content}>
          {snapshot.parentMessages.map((message) => (
            <BranchTreeBubble key={`${message.id}:${message.label}`} message={message} muted />
          ))}
          <BranchTreeBubble emphasis message={snapshot.selectedMessage} />
          {snapshot.childMessages.map((message) => (
            <Pressable accessibilityRole="button" key={`${message.id}:${message.label}`} onPress={() => onSelectChildMessage(message.id)} style={({ pressed }) => [pressed && styles.pressed]}>
              <BranchTreeBubble message={{ ...message, label: message.label || '分支选项' }} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>{loading ? '请稍候' : '点击画布上的节点查看上下文'}</Text>
      )}
      <View style={styles.actionRow}>
        <View style={styles.primaryAction}>
          <AiLightButton disabled={!snapshot} label="基于此衍生新分支" onPress={onDerive} />
        </View>
        <View style={styles.secondaryAction}>
          <AiLightButton disabled={!snapshot} label="切为此主线" onPress={onCheckout} variant="outline" />
        </View>
      </View>
      <Pressable accessibilityRole="button" disabled={!snapshot} onPress={onRequestPrune} style={({ pressed }) => [styles.pruneAction, pressed && styles.pressed, !snapshot && styles.disabled]}>
        <Text style={styles.pruneText}>剪除此后代</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  bubble: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '82%',
    padding: spacing[3],
  },
  bubbleEmphasis: {
    borderColor: '#D07C60',
    borderWidth: 1,
  },
  bubbleLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  bubbleLabelUser: {
    color: 'rgba(255,255,255,0.78)',
  },
  bubbleMuted: {
    backgroundColor: '#F0EAE0',
  },
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleText: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  bubbleTextUser: {
    color: aiLightColors.onDark,
  },
  bubbleUser: {
    backgroundColor: '#D07C60',
    borderColor: '#D07C60',
  },
  content: {
    gap: rhythm.cardContentGap,
  },
  disabled: {
    opacity: 0.36,
  },
  drawer: {
    backgroundColor: aiLightColors.cardWash,
    borderTopColor: aiLightColors.hairline,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
  },
  emptyText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    height: 4,
    width: spacing[10],
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.76,
  },
  primaryAction: {
    flex: 1,
  },
  pruneAction: {
    alignSelf: 'flex-start',
    paddingVertical: spacing[1],
  },
  pruneText: {
    ...typography.textStyles.caption,
    color: '#B75348',
  },
  secondaryAction: {
    flex: 0.74,
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    flex: 1,
  },
  versionLabel: {
    color: aiLightColors.muted,
    fontFamily: 'monospace',
    fontSize: 11,
  },
});
```

- [ ] **Step 4: Verify drawer**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add src/branchTree/components/BranchTreeDrawer.tsx tests/ai-branch-tree-canvas-policy.test.cjs
git commit -m "feat: add branch tree snapshot drawer"
```

---

## Task 9: Add Gesture-Enabled Branch Tree Canvas

**Files:**

- Create: `src/branchTree/components/BranchTreeCanvas.tsx`
- Modify: `tests/ai-branch-tree-canvas-policy.test.cjs`

- [ ] **Step 1: Add failing canvas policy test**

Append to `tests/ai-branch-tree-canvas-policy.test.cjs`:

```js
test('branch tree canvas owns pan pinch tap checkout and head recenter gestures', () => {
  const canvas = read('src/branchTree/components/BranchTreeCanvas.tsx');

  assert.match(canvas, /GestureDetector/);
  assert.match(canvas, /Gesture\.Pan\(\)/);
  assert.match(canvas, /Gesture\.Pinch\(\)/);
  assert.match(canvas, /Gesture\.Tap\(\)\.numberOfTaps\(1\)/);
  assert.match(canvas, /Gesture\.Tap\(\)\.numberOfTaps\(2\)/);
  assert.match(canvas, /useSharedValue/);
  assert.match(canvas, /useAnimatedStyle/);
  assert.match(canvas, /withTiming/);
  assert.match(canvas, /clampBranchTreeScale/);
  assert.match(canvas, /isHeadOutsideSafeViewport/);
  assert.match(canvas, /最新节点已偏离 · 一键回正/);
  assert.match(canvas, /BranchTreeGrid/);
  assert.match(canvas, /BranchTreeLinks/);
  assert.match(canvas, /BranchTreeNodeCard/);
  assert.match(canvas, /BranchTreeDrawer/);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
```

Expected: FAIL because the canvas component does not exist.

- [ ] **Step 3: Create `BranchTreeCanvas.tsx`**

Create `src/branchTree/components/BranchTreeCanvas.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { aiLightColors } from '../../components/ai/aiLightTheme';
import { radius, spacing, typography } from '../../design/tokens';
import { buildRecenterTransform, clampBranchTreeScale, isHeadOutsideSafeViewport, worldToScreen } from '../engine/branchTreeViewport';
import { layoutBranchTreeGraph } from '../engine/layoutBranchTreeGraph';
import type { BranchTreeGraph, BranchTreeSnapshot, BranchTreeViewportSize } from '../engine/types';
import { BranchTreeDrawer } from './BranchTreeDrawer';
import { BranchTreeGrid } from './BranchTreeGrid';
import { BranchTreeLinks } from './BranchTreeLinks';
import { BranchTreeNodeCard } from './BranchTreeNodeCard';

interface BranchTreeCanvasProps {
  graph: BranchTreeGraph;
  selectedNodeId: string | null;
  snapshot: BranchTreeSnapshot | null;
  snapshotLoading?: boolean;
  onCheckoutNode: (nodeId: string) => void;
  onDeriveFromNode: (nodeId: string) => void;
  onRequestPruneNode: (nodeId: string) => void;
  onSelectChildMessage: (messageId: string) => void;
  onSelectNode: (nodeId: string) => void;
}

export function BranchTreeCanvas({
  graph,
  onCheckoutNode,
  onDeriveFromNode,
  onRequestPruneNode,
  onSelectChildMessage,
  onSelectNode,
  selectedNodeId,
  snapshot,
  snapshotLoading = false,
}: BranchTreeCanvasProps) {
  const layout = useMemo(() => layoutBranchTreeGraph(graph), [graph]);
  const [viewport, setViewport] = useState<BranchTreeViewportSize>({ height: 0, width: 0 });
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);

  const graphStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = panStartX.value + event.translationX;
      translateY.value = panStartY.value + event.translationY;
    });

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      pinchStartScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = clampBranchTreeScale(pinchStartScale.value * event.scale);
    });

  const singleTapGesture = Gesture.Tap().numberOfTaps(1);
  const doubleTapGesture = Gesture.Tap().numberOfTaps(2);
  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture, Gesture.Exclusive(doubleTapGesture, singleTapGesture));

  const headScreenPoint = layout.headNode
    ? worldToScreen({ x: layout.headNode.x, y: layout.headNode.y }, { scale: scale.value, translateX: translateX.value, translateY: translateY.value })
    : null;
  const headOutside = Boolean(headScreenPoint && viewport.width > 0 && isHeadOutsideSafeViewport(headScreenPoint, viewport));

  function handleLayout(event: LayoutChangeEvent) {
    setViewport({
      height: event.nativeEvent.layout.height,
      width: event.nativeEvent.layout.width,
    });
  }

  function recenterHead() {
    if (!layout.headNode || viewport.width <= 0 || viewport.height <= 0) {
      return;
    }
    const next = buildRecenterTransform({ x: layout.headNode.x, y: layout.headNode.y }, viewport, scale.value);
    translateX.value = withTiming(next.translateX);
    translateY.value = withTiming(next.translateY);
    scale.value = withTiming(next.scale);
  }

  function selectedOrFallbackNodeId(): string | null {
    return selectedNodeId ?? graph.headNodeId ?? graph.activeNodeId;
  }

  return (
    <View onLayout={handleLayout} style={styles.root}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.canvas, graphStyle]}>
          <BranchTreeGrid height={layout.height} width={layout.width} />
          <BranchTreeLinks edges={layout.edges} height={layout.height} width={layout.width} />
          {layout.nodes.map((node) => (
            <View key={node.id} style={[styles.nodePosition, { left: node.x + layout.width / 2, top: node.y }]}>
              <BranchTreeNodeCard
                node={node}
                onDoublePress={(nodeId) => runOnJS(onCheckoutNode)(nodeId)}
                onPress={(nodeId) => runOnJS(onSelectNode)(nodeId)}
                selected={node.id === selectedNodeId}
              />
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
      {headOutside ? (
        <Pressable accessibilityRole="button" onPress={recenterHead} style={({ pressed }) => [styles.recenterPill, pressed && styles.pressed]}>
          <Text style={styles.recenterText}>最新节点已偏离 · 一键回正</Text>
        </Pressable>
      ) : null}
      <BranchTreeDrawer
        loading={snapshotLoading}
        onCheckout={() => {
          const nodeId = selectedOrFallbackNodeId();
          if (nodeId) {
            onCheckoutNode(nodeId);
          }
        }}
        onDerive={() => {
          const nodeId = selectedOrFallbackNodeId();
          if (nodeId) {
            onDeriveFromNode(nodeId);
          }
        }}
        onRequestPrune={() => {
          const nodeId = selectedOrFallbackNodeId();
          if (nodeId) {
            onRequestPruneNode(nodeId);
          }
        }}
        onSelectChildMessage={onSelectChildMessage}
        snapshot={snapshot}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    minHeight: 720,
    minWidth: 720,
  },
  nodePosition: {
    position: 'absolute',
  },
  pressed: {
    opacity: 0.76,
  },
  recenterPill: {
    alignSelf: 'center',
    backgroundColor: '#D07C60',
    borderRadius: radius.pill,
    bottom: 238,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    position: 'absolute',
  },
  recenterText: {
    ...typography.textStyles.caption,
    color: aiLightColors.onDark,
  },
  root: {
    backgroundColor: aiLightColors.canvas,
    flex: 1,
    overflow: 'hidden',
  },
});
```

- [ ] **Step 4: If `runOnJS` type usage fails, simplify callbacks**

If `pnpm typecheck` reports that `runOnJS` is not needed or invalid in the JS-side `onPress` callback, replace:

```ts
onDoublePress={(nodeId) => runOnJS(onCheckoutNode)(nodeId)}
onPress={(nodeId) => runOnJS(onSelectNode)(nodeId)}
```

with:

```ts
onDoublePress={onCheckoutNode}
onPress={onSelectNode}
```

Keep the import only if still used.

- [ ] **Step 5: Verify canvas**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit**

```powershell
git add src/branchTree/components/BranchTreeCanvas.tsx tests/ai-branch-tree-canvas-policy.test.cjs
git commit -m "feat: add branch tree gesture canvas"
```

---

## Task 10: Replace `AiBranchTreeScreen` With The Canvas Adapter Shell

**Files:**

- Modify: `src/screens/AiBranchTreeScreen.tsx`
- Modify: `tests/ai-branch-tree-canvas-policy.test.cjs`
- Modify: `tests/ai-branch-tree-navigation-policy.test.cjs`

- [ ] **Step 1: Add failing integration policy tests**

Append to `tests/ai-branch-tree-canvas-policy.test.cjs`:

```js
test('AI branch tree screen delegates graph rendering to the isolated branchTree module', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');

  assert.match(screen, /BranchTreeCanvas/);
  assert.match(screen, /buildPixoryBranchTreeGraph/);
  assert.match(screen, /buildPixoryBranchTreeSnapshot/);
  assert.match(screen, /loadBranchTree/);
  assert.match(screen, /loadBranchTreePreview/);
  assert.match(screen, /resolveBranchSelection/);
  assert.match(screen, /updateBranchRouteStatus/);
  assert.doesNotMatch(screen, /branchRail/);
  assert.doesNotMatch(screen, /renderEmbeddedPreview/);
  assert.doesNotMatch(screen, /rowConnectorLayer/);
  assert.doesNotMatch(screen, /previewPanel/);
});
```

Update `tests/ai-branch-tree-navigation-policy.test.cjs`:

- Replace assertions that require `branchCanvas`, `branchChatPreview`, `renderPreviewBubble`, `renderEmbeddedPreview`, `branchRail`, and `rowConnectorLayer`.
- Add assertions for `BranchTreeCanvas`, `buildPixoryBranchTreeGraph`, `buildPixoryBranchTreeSnapshot`, and preserving `primaryActionLabel` semantics through checkout callbacks.

- [ ] **Step 2: Run focused failing tests**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs
```

Expected: FAIL because the screen still renders the old static tree.

- [ ] **Step 3: Replace screen rendering with canvas shell**

Rewrite `src/screens/AiBranchTreeScreen.tsx` around this structure:

```tsx
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
import { spacing, typography } from '../design/tokens';

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
  const snapshot = useMemo(() => buildPixoryBranchTreeSnapshot(preview), [preview]);

  const loadTree = useCallback(async (preferredSelectedNodeId?: string) => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const result = await loadBranchTree({ currentBranchScopes, space, threadId });
      setNodes(result.nodes);
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

  async function markSelectedStatus(status: AiBranchRouteStatus) {
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
      await loadTree(selectedNode.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '标记路线失败');
    }
  }

  function selectNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId) ?? null;
    setSelectedNode(node);
  }

  return (
    <AiLightScaffold
      contentContainerStyle={styles.fullScreenContent}
      errorMessage={errorMessage}
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
          onDeriveFromNode={(nodeId) => {
            void checkoutNode(nodeId);
          }}
          onRequestPruneNode={() => {
            void markSelectedStatus('abandoned');
          }}
          onSelectChildMessage={(messageId) => {
            const nextNode = nodes.find((node) => node.branchRootMessageId === messageId);
            if (nextNode) {
              setSelectedNode(nextNode);
            }
          }}
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
    paddingHorizontal: 0,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  stateScreen: {
    alignItems: 'center',
    flex: 1,
    gap: spacing[2],
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
```

- [ ] **Step 4: Adjust exact implementation after typecheck**

If `AiLightScaffold` content style still applies horizontal padding through `AppScreen`, keep `contentContainerStyle={styles.fullScreenContent}`. If non-scroll content still has inherited page padding, update `AiLightScaffold` usage to pass a full-width wrapper that offsets padding only for this route.

If `onDeriveFromNode` should not checkout immediately after manual testing, change its handler to set an info error message:

```ts
setErrorMessage('已定位到该节点，返回聊天后可基于此继续创作。');
```

- [ ] **Step 5: Verify screen integration**

Run:

```powershell
node --test tests/ai-branch-tree-canvas-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add src/screens/AiBranchTreeScreen.tsx tests/ai-branch-tree-canvas-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
git commit -m "feat: replace branch tree screen with canvas"
```

---

## Task 11: Full Automated Verification And Code Review

**Files:**

- No source files expected unless verification or review exposes a bug.

- [ ] **Step 1: Run full automated verification**

Run:

```powershell
pnpm typecheck
pnpm test
git diff --check
```

Expected:

- `pnpm typecheck` exits `0`.
- `pnpm test` exits `0`.
- `git diff --check` exits `0` or only reports CRLF warnings from Git status, not whitespace errors.

- [ ] **Step 2: Run Expo dependency check before review**

Run:

```powershell
pnpm exec expo install --check
```

Expected: no incompatible dependency warnings for the newly added gesture, reanimated, worklets, or SVG packages.

- [ ] **Step 3: Perform code-level review before emulator acceptance**

Review the implementation after all code tasks are complete and automated checks pass. Use a code-review stance:

- Check graph engine correctness:
  - one node per message version,
  - parent-child links are stable,
  - active path is centered,
  - inactive nested lanes never cross `lane 0`,
  - dense groups collapse predictably.
- Check module boundaries:
  - `src/branchTree/` must not import `AiChatScreen`,
  - canvas components must not call database repositories directly,
  - Pixory-specific data access must stay in the adapter/screen shell.
- Check interaction safety:
  - double tap checkout cannot accidentally run twice,
  - child selection in drawer does not checkout,
  - prune action does not physically delete descendants in the first implementation,
  - `onDeriveFromNode` behavior is explicit and not silently destructive.
- Check performance risks:
  - pan/pinch transform is shared and does not animate every node independently,
  - path generation is not recomputed on every gesture frame,
  - grid rendering is bounded by canvas size.
- Check existing app behavior:
  - `AiChatScreen` return scroll retry remains wired,
  - `adoptBranchSelection` path in `App.tsx` remains intact,
  - no release version files changed.

Document review findings in the task notes or final report with file/line references. Do not start emulator validation until all review findings are resolved.

- [ ] **Step 4: Fix every code review finding**

For each review finding:

1. Apply the smallest targeted fix.
2. Re-run the focused test that covers the affected area.
3. Re-run:

```powershell
pnpm typecheck
pnpm test
git diff --check
```

Expected: all pass after the final review fix.

Commit review fixes if any source files changed:

```powershell
git add <changed-files>
git commit -m "fix: address branch tree canvas review"
```

If no review fixes are needed, do not create an empty commit.

---

## Task 12: Android Emulator Native Acceptance

**Files:**

- No source files expected unless emulator validation exposes a bug.

- [ ] **Step 1: Confirm emulator is available**

Run:

```powershell
D:\Develop\Android\Sdk\platform-tools\adb.exe devices
```

Expected: at least one emulator/device is listed as `device`.

- [ ] **Step 2: Build Android release or debug native app**

Because Expo Go cannot load Pixory's native modules, use the native Android project:

```powershell
cd android
.\gradlew.bat assembleRelease
```

Expected: build succeeds. If the repository does not currently have a generated `android` directory, run the existing project-native generation workflow used for release builds before this step, then build.

- [ ] **Step 3: Install and smoke test on Android**

Check device:

```powershell
D:\Develop\Android\Sdk\platform-tools\adb.exe devices
```

Install only if signature compatibility allows it:

```powershell
D:\Develop\Android\Sdk\platform-tools\adb.exe install -r android\app\build\outputs\apk\release\app-release.apk
```

If install fails because of signature mismatch, do not uninstall user data. Report the mismatch and use an existing compatible debug/release build path if available.

Smoke test:

1. Open an AI chat with at least one rewrite or regenerate branch.
2. Open `创作路线树`.
3. Verify the page is a full canvas, not a scroll card list.
4. Pan the canvas in both axes.
5. Pinch zoom between compact and enlarged states.
6. Tap a node and verify the bottom snapshot drawer opens.
7. Tap a child branch option and verify selected node changes without checkout.
8. Double tap a node or press `切为此主线` and verify chat returns to the selected message.
9. Pan away from HEAD and verify `最新节点已偏离 · 一键回正`.
10. Tap recenter and verify HEAD returns near the top 35% viewport area.

- [ ] **Step 4: Fix emulator acceptance bugs if needed**

If any verification exposes a bug, fix the smallest affected module and commit:

```powershell
git add <changed-files>
git commit -m "fix: stabilize branch tree canvas"
```

If no source changes are needed, do not create an empty commit.

---

## Final Handoff Checklist

Before reporting completion:

- [ ] `git status --short --branch` shows only expected branch ahead state.
- [ ] `pnpm typecheck` passed.
- [ ] `pnpm test` passed.
- [ ] `git diff --check` passed.
- [ ] Code-level review was completed after implementation.
- [ ] Every code review finding was fixed before emulator acceptance.
- [ ] Android native validation result is recorded, including any signature mismatch or unavailable device caveat.
- [ ] No `.superpowers/` companion artifacts are staged.
- [ ] No release version files changed.

## Notes From Official Expo Docs

Expo SDK 54 documents these install commands:

```powershell
pnpm exec expo install react-native-gesture-handler
pnpm exec expo install react-native-reanimated react-native-worklets
pnpm exec expo install react-native-svg
```

Expo SDK 54 also documents that the Reanimated Babel plugin is automatically configured by `babel-preset-expo` after installing Reanimated, so this plan does not add a manual Babel config unless verification proves the project needs one.
