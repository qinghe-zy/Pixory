# AI Branch Tree Canvas Handoff

Date: 2026-05-30
Commit: `46c1ef36d5223ae8466ae7864f1db5009214e86b`
Commit message: `feat: refine AI branch tree canvas`
OTA update group: `eba08aa0-bf0b-4b14-ac66-5db6f07e6954`
Runtime version: `2.4.0`
Platform updated by OTA: Android production channel

## 1. Purpose

This handoff documents the current AI creation route tree, also called Branch Tree or Fork Tree, after the `feat: refine AI branch tree canvas` commit.

The goal of this work is to make AI chat and writing branch history usable on mobile:

- preserve alternate message versions instead of losing them after edit or regenerate;
- show message-version branches as a compact vertical tree;
- keep the active creation route visually centered;
- allow users to inspect nearby context only when needed;
- keep checkout as an explicit action instead of an accidental double tap.

This implementation is Android-first, local-only, and built inside the existing Pixory AI chat stack. It does not add cloud sync, server state, AI generation features, or Git-like merge/rebase behavior.

## 2. User-Facing Features In This Commit

### 2.1 Full-screen branch tree canvas

The branch tree screen now delegates graph rendering to the isolated `src/branchTree/` module. The page is effectively a canvas-first screen:

- the graph occupies the main screen area;
- the existing AI light scaffold can now provide a full-height body through `bodyStyle`;
- the bottom snapshot drawer is no longer permanently mounted;
- canvas panning and pinch zoom remain owned by `BranchTreeCanvas`.

### 2.2 Single tap selects only

Single tapping a tree node now selects/highlights the node. It does not open the snapshot drawer and does not checkout the route.

Effect:

- the canvas remains clean by default;
- users can explore nodes visually without losing tree context;
- accidental checkout is reduced.

### 2.3 Double tap opens branch snapshot

Double tapping a node now opens the branch snapshot drawer for that node.

Previous behavior:

- double tap was wired directly to checkout.

Current behavior:

- double tap calls `onOpenSnapshotNode(node.id)`;
- the screen sets that node as selected;
- `snapshotVisible` becomes true;
- preview data is loaded only after the drawer is visible.

### 2.4 Checkout only from drawer

Checkout is now only available through the drawer action `切为此主线`.

Effect:

- route switching is explicit;
- the visual tree can be browsed without mutating current route state;
- the user's mental model is closer to "inspect first, then checkout".

### 2.5 Snapshot drawer defaults hidden

The branch snapshot drawer is not rendered on initial screen entry. It appears only after a double tap or after selecting a child branch option inside an already opened drawer.

Effect:

- more vertical space for the graph;
- fewer overlapping UI layers;
- lower preview-loading work on initial tree open.

### 2.6 Drawer can be closed

The drawer header now includes a `收起` action.

Effect:

- users can return to a clean full-tree canvas after inspecting context;
- drawer state is controlled by `snapshotVisible`.

### 2.7 Derive and checkout are separated

The branch tree screen now exposes two separate callbacks:

- `onCheckoutBranch`: adopts the selected branch route and persists it through `adoptBranchSelection`;
- `onDeriveBranch`: returns to chat using the selected route as a derivation base without calling `adoptBranchSelection`.

Effect:

- `切为此主线` and `基于此衍生新分支` no longer share the same behavior;
- future UI can treat "adopt existing route" and "continue from here" as distinct actions.

### 2.8 Initial head recenter

The canvas performs an initial recenter to the current HEAD node at scale `0.8`.

Effect:

- entering the branch tree starts near the active route endpoint;
- users are less likely to land on a blank or off-center canvas.

### 2.9 Worklet-safe offscreen HEAD detection

The "latest node has drifted away" logic is now evaluated in a Reanimated worklet with direct arithmetic instead of calling non-worklet helper functions from the reaction body.

Effect:

- safer Android runtime behavior;
- the recenter pill updates as the user pans/zooms;
- avoids calling ordinary JS helper functions inside `useAnimatedReaction`.

## 3. Files Changed

### 3.1 `App.tsx`

Role: route-level integration.

Changes:

- renamed the branch tree callback from `onSelectBranch` to `onCheckoutBranch`;
- added `onDeriveBranch`;
- checkout path calls `adoptBranchSelection` before returning to chat;
- derive path returns to chat without persisting the selected branch as the thread's current route.

Current behavior:

- checkout mutates the thread's current branch pointer;
- derive only builds the chat route from the selected branch selection.

### 3.2 `src/screens/AiBranchTreeScreen.tsx`

Role: Pixory-specific screen adapter.

Changes:

- added `snapshotVisible`;
- preview loading is gated by `snapshotVisible`;
- added `openSnapshotNode`;
- added `closeSnapshot`;
- split `checkoutNode` and `deriveBranch`;
- passes full-screen body style into `AiLightScaffold`;
- passes new canvas props:
  - `snapshotVisible`;
  - `onOpenSnapshotNode`;
  - `onCloseSnapshot`;
  - separated derive and checkout callbacks.

Important logic:

```text
screen loads tree nodes
-> buildPixoryBranchTreeGraph(nodes)
-> BranchTreeCanvas renders graph
-> single tap updates selectedNode only
-> double tap sets selectedNode and snapshotVisible=true
-> preview effect runs only when snapshotVisible=true
-> drawer actions call derive / checkout / prune
```

Preview loading boundary:

- if `snapshotVisible` is false, `preview` is cleared and no `loadBranchTreePreview` request is made;
- if selected node changes while drawer is visible, preview reloads for the new node.

### 3.3 `src/branchTree/components/BranchTreeCanvas.tsx`

Role: gesture canvas and graph renderer.

Changes:

- added `snapshotVisible`;
- added `onOpenSnapshotNode`;
- added `onCloseSnapshot`;
- double tap opens snapshot instead of checkout;
- drawer is conditionally mounted only when `snapshotVisible` is true;
- node card is now presentational;
- initial recenter to HEAD at scale `0.8`;
- offscreen HEAD detection moved to `useAnimatedReaction`.

Gesture behavior:

```text
single tap node -> onSelectNode(node.id)
double tap node -> onOpenSnapshotNode(node.id)
drawer checkout button -> onCheckoutNode(selectedOrFallbackNodeId)
drawer derive button -> onDeriveFromNode(selectedOrFallbackNodeId)
drawer prune button -> onRequestPruneNode(selectedOrFallbackNodeId)
```

Canvas behavior:

- pan gesture changes `translateX` and `translateY`;
- pinch gesture clamps scale through `clampBranchTreeScale`;
- initial focus is applied once after viewport and head point exist;
- recenter pill appears when HEAD screen coordinates leave the safe viewport.

### 3.4 `src/branchTree/components/BranchTreeDrawer.tsx`

Role: bottom snapshot drawer.

Changes:

- added `onClose`;
- added visible `收起` action;
- retains parent/current/child bubble rendering;
- retains actions:
  - `基于此衍生新分支`;
  - `切为此主线`;
  - `剪除此后代`.

Current drawer content model:

- parent messages: muted background bubbles;
- selected message: emphasized bubble;
- child branch messages: pressable branch options;
- user messages are right-aligned coral bubbles;
- assistant/system messages are left-aligned light bubbles.

### 3.5 `src/branchTree/components/BranchTreeNodeCard.tsx`

Role: compact node presentation.

Changes:

- removed internal `Pressable`;
- removed direct press/double-press props;
- now only renders visual card state;
- gesture ownership is fully in `BranchTreeCanvas`.

Reason:

- avoids conflicting gesture ownership between `Pressable` and React Native Gesture Handler;
- makes single/double tap behavior easier to reason about in one file.

### 3.6 `src/branchTree/engine/layoutBranchTreeGraph.ts`

Role: graph layout engine.

Changes:

- canvas padding reduced from `180` to `120`.

Current layout constants:

```text
node width: 120
node height: 82
lane width: 140
row height: 110
canvas padding: 120
max visible inactive siblings per parent: 2
```

Current layout semantics:

- active route uses lane `0`;
- depth advances vertically by row height;
- inactive branches alternate left/right from the trunk;
- nested inactive branches inherit parent direction and move outward;
- overflow inactive siblings are folded into `collapsedChildCount`;
- SVG paths are cubic Bezier curves, not elbow lines.

### 3.7 `src/components/ai/AiLightScaffold.tsx`

Role: shared AI screen shell.

Changes:

- added optional `bodyStyle`;
- body style is composed with loading state.

Reason:

- the branch tree screen needs a full-height content host while still using the shared AI scaffold.

### 3.8 `src/database/repositories/aiThreadRepository.ts`

Role: SQLite repository and branch tree candidate source.

Changes:

- branch tree candidates now connect message versions into a sequential version chain;
- historical versions use the root message id as parent root and `versionIndex - 1` as parent version index when possible;
- current version uses the root message id and `versionTotal - 1` as parent version index when possible.

Root cause fixed:

- prior candidate records could appear parentless because they relied on root message branch fields that are null in demo/local data for root version records;
- parentless nodes flattened the tree and made the canvas look horizontally scattered.

Current candidate parent logic:

```text
historical version vN:
  parentBranchRootMessageId = root.id
  parentBranchVersionIndex = N - 1 if N > 1 else null

current version vTotal:
  parentBranchRootMessageId = root.id
  parentBranchVersionIndex = versionTotal - 1 if versionTotal > 1 else null
```

### 3.9 Tests

Files:

- `tests/ai-branch-tree-canvas-policy.test.cjs`
- `tests/ai-branch-tree-navigation-policy.test.cjs`

Coverage added or updated:

- drawer has `onClose` and `收起`;
- canvas exposes `snapshotVisible`, `onOpenSnapshotNode`, and `onCloseSnapshot`;
- double tap opens snapshot instead of checkout;
- drawer is conditional rather than always mounted;
- node card is presentational and no longer owns press handlers;
- checkout remains in drawer;
- branch tree screen gates preview loading behind `snapshotVisible`;
- app route separates checkout and derive behavior;
- repository parent mapping is asserted;
- worklet-safe offscreen-head reaction is asserted.

## 4. Current Architecture

### 4.1 Data Source

The source of branch tree nodes is SQLite through `aiThreadRepository.listBranchTreeCandidates`.

Relevant data concepts:

- `ai_messages`: current visible message rows;
- `ai_message_versions`: historical versions created by edit/regenerate;
- branch route metadata: lightweight status/name metadata;
- thread current branch fields:
  - `currentBranchRootMessageId`;
  - `currentBranchVersionIndex`.

The tree is not stored as a separate graph table. It is derived from message version records and current route metadata.

### 4.2 Service Layer

File: `src/ai/aiBranchTreeService.ts`

Responsibilities:

- loads branch tree candidates;
- maps repository records to `AiBranchTreeNode`;
- computes current route scope;
- builds compact node labels and previews;
- loads snapshot preview around the selected node;
- resolves branch selection for checkout or derive;
- builds selection maps for returning to chat.

Important exported functions:

- `loadBranchTree`;
- `loadBranchTreePreview`;
- `resolveBranchSelection`;
- `updateBranchRouteStatus`;
- `buildBranchSelectionMap`.

### 4.3 Adapter Layer

File: `src/branchTree/adapters/pixoryAiBranchTreeAdapter.ts`

Responsibilities:

- converts Pixory AI branch nodes to generic canvas graph nodes;
- converts preview records to drawer snapshot messages;
- finds child branch options for the selected node.

This layer keeps `src/branchTree/` usable as a more independent canvas module.

### 4.4 Graph Builder

File: `src/branchTree/engine/buildBranchTreeGraph.ts`

Responsibilities:

- converts source nodes into `BranchTreeGraph`;
- node id format is `${messageId}:${versionIndex}`;
- builds parent-child relationships;
- marks edge kind as active or inactive;
- identifies active/head node.

Graph meaning:

- one node means one message version;
- one edge means "this version follows from this parent version";
- active edges are those where both endpoints are on the current route.

### 4.5 Layout Engine

File: `src/branchTree/engine/layoutBranchTreeGraph.ts`

Responsibilities:

- assigns depth and lane;
- active path stays on lane `0`;
- inactive branches spread outward;
- folds overflow inactive siblings;
- computes Bezier paths;
- normalizes negative lanes into positive SVG coordinates.

### 4.6 Canvas Components

Files:

- `BranchTreeCanvas.tsx`;
- `BranchTreeGrid.tsx`;
- `BranchTreeLinks.tsx`;
- `BranchTreeNodeCard.tsx`;
- `BranchTreeDrawer.tsx`.

Responsibilities:

- render grid and SVG links;
- render compact node cards;
- own pan/pinch/tap gestures;
- show recenter pill;
- mount drawer only when needed.

## 5. Interaction Logic

### 5.1 Opening the branch tree

```text
AI chat route
-> user taps branch tree entry
-> App routes to AiBranchTreeScreen
-> AiBranchTreeScreen calls loadBranchTree
-> graph is built
-> BranchTreeCanvas renders full tree
-> snapshot drawer is hidden
```

### 5.2 Selecting a node

```text
single tap node
-> BranchTreeCanvas calls onSelectNode(node.id)
-> AiBranchTreeScreen sets selectedNode
-> no preview request is made if snapshotVisible=false
```

### 5.3 Inspecting a node

```text
double tap node
-> BranchTreeCanvas calls onOpenSnapshotNode(node.id)
-> AiBranchTreeScreen sets selectedNode
-> snapshotVisible=true
-> preview effect calls loadBranchTreePreview
-> buildPixoryBranchTreeSnapshot(preview, nodes)
-> BranchTreeDrawer renders bubbles
```

### 5.4 Selecting a child branch inside drawer

```text
tap child branch bubble
-> onSelectChildMessage(message.id)
-> screen finds matching node
-> selectedNode changes
-> snapshotVisible remains true
-> preview reloads for that child
```

### 5.5 Checkout

```text
tap 切为此主线
-> BranchTreeCanvas resolves selected/fallback node id
-> AiBranchTreeScreen.checkoutNode
-> resolveBranchSelection
-> App.onCheckoutBranch
-> adoptBranchSelection persists current route
-> route returns to AI chat with selection map
```

### 5.6 Derive new branch

```text
tap 基于此衍生新分支
-> BranchTreeCanvas resolves selected/fallback node id
-> AiBranchTreeScreen.deriveBranch
-> resolveBranchSelection
-> App.onDeriveBranch
-> route returns to AI chat with selection map
-> no adoptBranchSelection call in App derive path
```

### 5.7 Prune

```text
tap 剪除此后代
-> AiBranchTreeScreen.markNodeStatus(node.id, 'abandoned')
-> updateBranchRouteStatus
-> tree reloads and keeps selected node if possible
```

Current prune behavior is metadata/status based. It does not physically delete messages or version records.

## 6. Data Model Semantics

### 6.1 What a node means

A node means one version of one AI chat message:

```text
node id = branchRootMessageId + ":" + branchVersionIndex
```

This is not a full chat transcript node and not a Git commit object.

### 6.2 What an edge means

An edge means the child version derives from the parent version.

For same-message version chains, the current repository logic links:

```text
v1 -> v2 -> v3 -> ... -> current version
```

For nested branch scopes, service lineage and branch root metadata determine the active route selection.

### 6.3 What active path means

`isCurrentRoute` marks whether a node belongs to the current route scopes. In layout:

- active path is promoted to lane `0`;
- active edges use solid coral links;
- inactive branches use lighter dashed links.

### 6.4 What checkout means

Checkout means:

- resolve selected node lineage;
- build a message-version selection map;
- persist thread current branch when using `onCheckoutBranch`;
- return to chat with selected versions applied.

Checkout does not:

- merge branches;
- delete other routes;
- rewrite old records;
- create a Git-like branch pointer object.

## 7. Current Capability Boundary

### 7.1 Supported

The current implementation supports:

- local-only branch tree rendering for AI message versions;
- one node per message version;
- parent/child graph derived from local SQLite records;
- active route centered in the graph;
- inactive branches spread left/right;
- nested inactive branches moving outward from their parent side;
- overflow sibling folding via `+N`;
- pan and pinch zoom;
- initial focus on HEAD;
- offscreen HEAD recenter pill;
- single tap selection;
- double tap snapshot opening;
- bottom drawer snapshot with parent/current/child bubbles;
- explicit checkout from drawer;
- explicit derive from drawer;
- metadata status update for abandoning a route;
- return to chat with selection map;
- Android production OTA delivery for this update.

### 7.2 Not Supported Yet

The current implementation does not support:

- Git-style merge;
- Git-style rebase;
- branch renaming UI;
- persistent branch objects independent of messages;
- cross-thread branch graph;
- physical descendant deletion from drawer prune;
- undo for prune;
- native minimap;
- full route diff view;
- real-time collaborative editing;
- server/cloud sync;
- AI generation inside the tree screen;
- automatic layout based on semantic story groups;
- guaranteed rendering of every extremely dense sibling branch at once.

### 7.3 Important Behavioral Boundaries

- The tree is derived from versions and metadata, not stored as an independent canonical graph.
- `剪除此后代` currently marks route metadata as `abandoned`; it is not destructive cleanup.
- Snapshot preview is lazy-loaded only when drawer is visible.
- Checkout persists route state; derive returns to chat without adopting the route globally.
- Runtime version is `2.4.0`; this OTA reaches compatible 2.4.0 builds only.

## 8. Verification Performed

### 8.1 Code Review

Manual review focused on:

- double-tap no longer checkout;
- drawer default hidden;
- preview request gated behind `snapshotVisible`;
- checkout remains available from drawer;
- derive and checkout are distinct;
- node card is presentational;
- no server/cloud behavior introduced.

Review conclusion before commit: no blocking issue found.

### 8.2 Automated Verification

Commands run after implementation:

```bash
pnpm typecheck
pnpm test -- tests/ai-branch-tree-canvas-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs
pnpm test
git diff --check
```

Results:

- `pnpm typecheck`: passed;
- targeted branch tree tests: passed;
- full test suite: 406 tests passed;
- `git diff --check`: no whitespace errors, only Windows line-ending warnings during earlier checks.

### 8.3 Emulator / Visual Verification

Earlier in this work sequence, emulator verification confirmed the branch tree page rendered real data with a vertical branch tree and snapshot drawer. The verified image from the previous validation pass is:

```text
output/branch-tree-final-real.png
```

This image is local verification output and was not committed.

### 8.4 OTA Verification

Command used:

```bash
npx eas-cli update --channel production --platform android --message "Refine AI branch tree canvas" --non-interactive
```

Confirmed by:

```bash
npx eas-cli update:list --branch production --limit 3
```

Published update:

- Branch: `production`;
- Platform: `android`;
- Runtime version: `2.4.0`;
- Update group ID: `eba08aa0-bf0b-4b14-ac66-5db6f07e6954`;
- Android update ID: `019e7796-075c-7099-8e87-4ddde0a045c4`;
- Dashboard: `https://expo.dev/accounts/qinghe.zy/projects/pixory/updates/eba08aa0-bf0b-4b14-ac66-5db6f07e6954`.

## 9. Known Risks And Watch Points

### 9.1 Double-tap feel on real Android devices

The double-tap behavior is implemented through React Native Gesture Handler:

```text
Gesture.Exclusive(
  double tap,
  single tap
)
```

This should work, but real-device timing can feel different from emulator/browser tests. If users report missed double taps, tune gesture timing or add a visible secondary snapshot button.

### 9.2 Drawer header density

The drawer header now contains title, version, and `收起`. On very narrow screens or long localized text, it may feel tight.

If this becomes visible in screenshots, consider replacing `收起` text with an icon button plus accessibility label.

### 9.3 Dense branch graphs

The layout intentionally folds excessive inactive siblings after two visible children per parent. This protects mobile readability, but it means the canvas is not a complete expanded view for extremely branch-heavy nodes.

Future options:

- tap `+N` to expand folded siblings;
- add a branch list sheet;
- add local subtree focus mode.

### 9.4 Data derivation assumptions

The repository now models same-message versions as a sequential chain. This improves visual tree continuity for message-version histories, but it is not a general DAG storage layer.

If future work adds explicit branch objects, the graph builder should consume that canonical graph instead of inferring from message version indices.

### 9.5 Prune semantics

The UI label says `剪除此后代`, but current implementation updates branch route status to `abandoned`. It does not delete descendants.

This is safer for local data integrity, but the label may overpromise. Future work should either:

- rename the action to a softer label such as `标记为废案`; or
- implement real descendant deletion with confirmation, undo, and database/file safety checks.

## 10. Follow-Up Recommendations

Recommended next steps, in priority order:

1. Real Android acceptance pass for double tap, drawer open/close, checkout, derive, and prune.
2. Add a visible compact hint or icon for "double tap opens snapshot" if discoverability is weak.
3. Add folded `+N` expansion behavior.
4. Revisit `剪除此后代` wording or implement true safe deletion.
5. Add screenshot-based acceptance fixtures for branch tree layout states.
6. Consider making the branch tree canvas module reusable for future non-chat route trees.

## 11. Git And Workspace State At Handoff Time

Committed local change:

```text
46c1ef3 feat: refine AI branch tree canvas
```

Branch state after commit and OTA:

```text
main...origin/main [ahead 15]
```

Untracked local files intentionally not committed:

- `.playwright-mcp/`;
- `branch-tree-mobile-concept.png`;
- `output/*.png`;
- `output/*.xml`;
- `output/*.log`;
- `output/pixory.sqlite`.

EAS generated `dist/` during OTA export and it was removed after publishing.

