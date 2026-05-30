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
