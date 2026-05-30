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

test('branch tree layout normalizes negative lanes into one positive SVG coordinate space', () => {
  const layout = read('src/branchTree/engine/layoutBranchTreeGraph.ts');

  assert.match(layout, /const maxAbsLane = Math\.max\(Math\.abs\(minLane\), Math\.abs\(maxLane\)\)/);
  assert.match(layout, /const xOffset = BRANCH_TREE_CANVAS_PADDING \+ maxAbsLane \* BRANCH_TREE_LANE_WIDTH/);
  assert.match(layout, /node\.x \+= xOffset/);
});

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
  assert.match(adapter, /childBranchMessagesForNode/);
  assert.match(adapter, /candidate\.parentBranchRootMessageId === node\.branchRootMessageId/);
  assert.match(adapter, /candidate\.parentBranchVersionIndex === node\.branchVersionIndex/);
  assert.doesNotMatch(adapter, /AiChatScreen/);
  assert.doesNotMatch(adapter, /aiMemory/);
});

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

test('branch tree drawer renders parent selected and child chat bubbles with safe actions', () => {
  const drawer = read('src/branchTree/components/BranchTreeDrawer.tsx');

  assert.match(drawer, /export function BranchTreeDrawer/);
  assert.match(drawer, /snapshot: BranchTreeSnapshot \| null/);
  assert.match(drawer, /onClose: \(\) => void/);
  assert.match(drawer, /parentMessages\.map/);
  assert.match(drawer, /selectedMessage/);
  assert.match(drawer, /childMessages\.map/);
  assert.match(drawer, /基于此衍生新分支/);
  assert.match(drawer, /切为此主线/);
  assert.match(drawer, /剪除此后代/);
  assert.match(drawer, /收起/);
  assert.match(drawer, /onSelectChildMessage/);
  assert.match(drawer, /onCheckout/);
  assert.match(drawer, /onDerive/);
  assert.match(drawer, /onRequestPrune/);
  assert.match(drawer, /message\.role === 'user'/);
});

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
  assert.match(canvas, /useAnimatedReaction/);
  assert.match(canvas, /const screenX = headCenterPoint\.x \* scale\.value \+ translateX\.value/);
  assert.match(canvas, /最新节点已偏离 · 一键回正/);
  assert.match(canvas, /BranchTreeGrid/);
  assert.match(canvas, /BranchTreeLinks/);
  assert.match(canvas, /styles\.layer/);
  assert.match(canvas, /transformOrigin: '0px 0px'/);
  assert.match(canvas, /BranchTreeNodeCard/);
  assert.match(canvas, /BranchTreeDrawer/);
  assert.match(canvas, /snapshotVisible: boolean/);
  assert.match(canvas, /onOpenSnapshotNode/);
  assert.match(canvas, /onCloseSnapshot/);
  assert.match(canvas, /Gesture\.Tap\(\)\.numberOfTaps\(2\)\.runOnJS\(true\)\.onEnd\(\(\) => onOpenSnapshotNode\(node\.id\)\)/);
  assert.doesNotMatch(canvas, /Gesture\.Tap\(\)\.numberOfTaps\(2\)\.runOnJS\(true\)\.onEnd\(\(\) => onCheckoutNode\(node\.id\)\)/);
  assert.doesNotMatch(canvas, /<BranchTreeDrawer[\s\S]*snapshotVisible/);
});

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
