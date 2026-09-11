# AI Branch Tree Canvas Design

## Goal

Build a mobile-first Branch Tree for AI chat and writing workflows. The feature lets users explore, preview, and switch between parallel conversation or story routes without losing historical branches.

This design replaces the current route-tree page with an independent canvas module while keeping existing Pixory AI chat, memory, material, and provider systems isolated behind adapters.

## Product Requirements

The Branch Tree must solve three user problems:

1. Preserve alternate history after a user rewrite or assistant regenerate.
2. Let users preview and checkout any historical branch as a sandboxed route.
3. Use mobile screen space efficiently through compact nodes, pan, zoom, folding, and a bottom snapshot drawer.

The Branch Tree is not a social feature, cloud sync feature, or AI generation feature by itself. It is local UI and local data navigation over existing chat records.

## Architecture

Use an independent module under `src/branchTree/`.

Suggested module boundary:

```text
src/branchTree/
├─ engine/
│  ├─ types.ts
│  ├─ buildBranchTreeGraph.ts
│  ├─ layoutBranchTreeGraph.ts
│  └─ branchTreeViewport.ts
├─ components/
│  ├─ BranchTreeCanvas.tsx
│  ├─ BranchTreeNodeCard.tsx
│  ├─ BranchTreeLinks.tsx
│  ├─ BranchTreeGrid.tsx
│  └─ BranchTreeDrawer.tsx
└─ adapters/
   └─ pixoryAiBranchTreeAdapter.ts
```

`AiBranchTreeScreen` becomes a thin Pixory adapter shell. It loads thread data, passes graph data to the canvas, and handles Pixory-specific actions such as checkout, return-to-chat, and route metadata updates.

The graph module must not import `AiChatScreen`, memory services, provider adapters, or material services. It communicates through typed actions:

- `selectNode`
- `checkoutNode`
- `deriveChildBranch`
- `markRouteStatus`
- `requestPruneDescendants`
- `focusHead`

## Data Model

One Branch Tree node represents one message version. This is the core model decision.

```ts
export interface BranchTreeNode {
  id: string;
  messageId: string;
  versionIndex: number;
  versionTotal: number;
  parentNodeId: string | null;
  childNodeIds: string[];
  role: 'user' | 'assistant' | 'system';
  summary: string;
  contentPreview: string;
  createdAt: string;
  status: 'exploring' | 'adopted' | 'paused' | 'abandoned';
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
```

Route restoration walks from `activeNodeId` upward through `parentNodeId` to root, then reverses the path to produce the model context chain. Existing repository fields such as `branchRootMessageId`, `branchVersionIndex`, current thread branch pointers, and message version records can remain the source of truth during the first implementation.

The first implementation may use the existing `aiBranchTreeService` as the source adapter, then convert its candidates into this graph model. A later pass can move more DAG logic into repository queries if needed.

## Layout Algorithm

Use a centered active-path graph.

Constants:

- Node width: `120px`
- Node normal height: `70px` to `90px`
- Lane width: `140px`
- Row height: `110px`
- Minimum scale: `0.4`
- Maximum scale: `1.8`

Layout rules:

1. Y position is based on conversation depth, not physical timestamp.
2. X position is based on lane index.
3. The active path is normalized to `lane = 0`.
4. First-level inactive siblings alternate left and right from the active path.
5. Nested inactive branches inherit their parent side and move outward only.
6. Inactive branches must not cross `lane = 0` unless they become active after checkout.
7. Each depth row tracks occupied lanes. If a target lane is occupied, push outward in the same direction.
8. Dense sibling groups collapse into a `+N` representative node instead of rendering every node on the canvas.

Formula:

```text
x = lane * 140
y = depth * 110
```

Lane examples:

```text
lane -2  nested left branch
lane -1  first left branch
lane  0  active path
lane +1  first right branch
lane +2  nested right branch
```

The collision rule is directional:

```text
left side:  -1 -> -2 -> -3
right side: +1 -> +2 -> +3
```

This prevents branch lines from crossing through the active center lane.

## Canvas Rendering

Use these libraries:

- `react-native-gesture-handler` for pan, pinch, tap, and double tap.
- `react-native-reanimated` for UI-thread transform state.
- `react-native-svg` for background grid and Bezier links.

Rendering stack:

1. SVG background grid.
2. SVG cubic Bezier links.
3. React Native View node cards.
4. Fixed bottom drawer outside the canvas transform.

The canvas uses world coordinates from the layout engine and one shared transform:

```text
screenX = worldX * scale + translateX
screenY = worldY * scale + translateY
```

Do not animate each node independently during pan and pinch. Apply transform once to the graph content container. Node-level animation should be limited to selection rings and subtle focus feedback.

## Visual Specification

Canvas background:

- Fine dot or grid reference texture.
- Small grid: about `20px`.
- Large guide grid: about `100px`.
- Opacity around `0.08`.
- Grid scales with the canvas.

Node card:

- Width: `120px`.
- Height: content-based, usually `70px` to `90px`.
- Radius: `16px`.
- Status dot at top-left.
- Version label at top-right, monospace, about `9px`.
- Branch counter bubble when children exceed visible count.
- Summary clamped to two lines, about `10.5px`.

Link style:

- Active path: `#D07C60`, `3.5px`, solid.
- Inactive path: `#D1C9BE`, `1.8px`, dashed `3,3`.
- All links use cubic Bezier curves. Do not use hard elbow lines.

## Gestures

Required gestures:

1. Single-finger pan moves the canvas on both axes.
2. Pinch zoom clamps scale to `[0.4, 1.8]`.
3. Tap node selects it, highlights it, and opens the bottom drawer.
4. Double tap node checks out the selected route.
5. Tap empty canvas may keep the current node selected or collapse the drawer to peek state.

Double tap must not accidentally trigger two checkout actions or conflict with single tap. The implementation should route both gestures through a single hit-testing layer.

## HEAD Anti-Disorientation

The active terminal node is HEAD.

Show the recenter pill when HEAD leaves the safe viewport:

```text
screenX < 20
screenX > viewportWidth - 140
screenY < 80
screenY > viewportHeight - 280
```

The pill text is:

```text
最新节点已偏离 · 一键回正
```

Tap behavior:

- Animate canvas transform.
- Place HEAD horizontally near the viewport center.
- Place HEAD vertically around `viewportHeight * 0.35`.

Use Reanimated timing for this animation.

## Bottom Snapshot Drawer

The drawer is the primary reading surface. The canvas stays compact.

Drawer heights:

- `peek`: header and selected node summary.
- `half`: default selected-node context.
- `full`: longer context and full child-branch list.

Drawer structure:

1. Header: current node title, status, version label.
2. Parent context bubble.
3. Selected node bubble.
4. Child branch option bubbles.
5. Action panel.

Bubble rules:

- Parent context: muted gray-beige background.
- AI selected bubble: left aligned, white surface, dark text.
- User selected bubble: right aligned, coral surface, white text.
- Child options are clickable. Tapping one selects that child in the drawer and canvas but does not checkout.

Actions:

- `基于此衍生新分支`: primary action. First implementation may return to chat positioned at the selected node and open the existing edit/continue flow.
- `切为此主线`: explicit checkout.
- `剪除此后代`: dangerous action. Keep behind a secondary menu and confirmation. Prefer route hiding or abandoned status first; physical deletion is out of scope for the first implementation unless explicitly approved.

## Pixory Integration Strategy

Replace the existing Branch Tree page behavior behind the current route. Do not modify unrelated chat, memory, material, provider, image, or release systems.

Integration rules:

1. `AiBranchTreeScreen` remains the app route entry.
2. The new graph module receives typed graph data and action callbacks.
3. Existing `aiBranchTreeService` can remain the first data adapter.
4. Existing checkout selection map behavior must be preserved.
5. Existing return-to-chat scroll retry must be preserved.
6. Route metadata status chips may move into the drawer action area.
7. Release-critical files are not touched during this feature implementation unless a later release task requires it.

## Testing And Verification

Policy tests:

- Graph engine builds one node per message version.
- Active path is normalized to lane `0`.
- Nested inactive branches inherit side and move outward.
- Inactive branches do not cross `lane 0`.
- Dense sibling groups collapse into representative `+N` nodes.
- Checkout emits the same branch selection map contract as the current implementation.
- Return-to-chat scroll retry remains wired.

Type and unit verification:

- `pnpm typecheck`
- `pnpm test`
- `git diff --check`

Device verification:

- Use a dev build or release/debug build that includes native modules. Expo Go is not sufficient because Pixory already depends on native modules such as `react-native-volume-manager`.
- Verify pan, pinch, tap, double tap, drawer states, and recenter on Android.
- Verify a real long conversation with at least:
  - one active route,
  - two first-level inactive siblings,
  - one nested inactive branch,
  - one dense sibling group.

## Out Of Scope For First Implementation

- Full generic graph platform for unrelated features.
- Physical deletion of message descendants without a separate safety design.
- Cross-thread branch merging.
- Git-style rebase or merge.
- Cloud sync or account-backed branch history.
- AI-generated branch summaries beyond existing local message summaries.

## Risks

1. Gesture libraries require native build verification.
2. Too many visible nodes can still hurt performance; collapse and viewport culling may be needed.
3. Double tap checkout can be risky if too easy to trigger; visual confirmation or undo may be needed after testing.
4. Existing branch data is version-based rather than a clean node-parent table; adapter logic must be carefully tested.
5. Bottom drawer plus canvas gestures can conflict if gesture boundaries are not explicit.

## Acceptance Criteria

The feature is ready when:

1. The Branch Tree renders as a pan-and-zoom canvas.
2. The active path is centered and visually dominant.
3. Nested side branches never cross the active center lane.
4. Node tap opens a bottom chat snapshot drawer.
5. Child branch selection updates drawer and canvas without checkout.
6. Explicit checkout switches the chat route and returns to the selected message.
7. HEAD recenter appears and works when the terminal active node leaves the viewport.
8. The implementation is isolated under `src/branchTree/` plus a thin Pixory screen adapter.
9. Automated checks pass.
10. Android device validation is performed with a native build.
