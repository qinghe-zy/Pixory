const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI branch tree repository derives candidates without loading ordinary transcript nodes', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(repository, /export type AiBranchRouteStatus = 'exploring' \| 'adopted' \| 'paused' \| 'abandoned'/);
  assert.match(repository, /export interface AiBranchTreeCandidateRecord/);
  assert.match(repository, /async listBranchTreeCandidates/);
  assert.match(repository, /FROM ai_message_versions/);
  assert.match(repository, /JOIN ai_messages root ON root\.id = ai_message_versions\.originalMessageId/);
  assert.match(repository, /ai_message_versions\.versionIndex < root_versions\.versionTotal/);
  assert.match(repository, /current_versions AS/);
  assert.match(repository, /root\.content AS versionContent/);
  assert.match(repository, /COUNT\(descendant\.id\) AS followUpMessageCount/);
  assert.match(repository, /COUNT\(\*\) \+ 1 AS versionTotal/);
  assert.match(repository, /HAVING versionTotal > 1/);
  assert.match(repository, /CASE[\s\S]{0,120}WHEN ai_message_versions\.versionIndex > 1 THEN root\.id[\s\S]{0,120}END AS parentBranchRootMessageId/);
  assert.match(repository, /versionIndex > 1 THEN ai_message_versions\.versionIndex - 1/);
  assert.match(repository, /WHEN root_versions\.versionTotal > 1 THEN root\.id[\s\S]{0,120}END AS parentBranchRootMessageId/);
  assert.doesNotMatch(repository, /versionStatus: AiMessageStatus/);
  assert.doesNotMatch(repository, /MAX\(versionIndex\) AS versionTotal/);
  assert.doesNotMatch(repository, /listBranchTreeCandidates[\s\S]{0,1800}SELECT \* FROM ai_messages\s+WHERE threadId = \?/);
});

test('AI branch route metadata repository stores labels without deleting route history', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(repository, /export interface AiBranchRouteMetadataRecord/);
  assert.match(repository, /async listBranchRouteMetadata/);
  assert.match(repository, /async upsertBranchRouteMetadata/);
  assert.match(repository, /async deleteBranchRouteMetadata/);
  assert.match(repository, /ON CONFLICT\(threadId, branchRootMessageId, branchVersionIndex\) DO UPDATE/);
  assert.match(repository, /const nextName = input\.name === undefined \? existing\?\.name \?\? null/);
  assert.doesNotMatch(repository, /upsertBranchRouteMetadata[\s\S]{0,1800}DELETE FROM ai_messages/);
  assert.doesNotMatch(repository, /upsertBranchRouteMetadata[\s\S]{0,1800}UPDATE ai_messages SET/);
});

test('AI branch tree service keeps graph labels compact and builds return selection maps', () => {
  const service = read('src/ai/aiBranchTreeService.ts');

  assert.match(service, /export interface AiBranchTreeNode/);
  assert.match(service, /export interface AiBranchTreePreview/);
  assert.match(service, /export async function loadBranchTree/);
  assert.match(service, /export async function loadBranchTreePreview/);
  assert.match(service, /export async function updateBranchRouteStatus/);
  assert.match(service, /export function buildBranchSelectionMap/);
  assert.doesNotMatch(service, /collapsedShortBranchCount/);
  assert.doesNotMatch(service, /resolveThreadIdForBranchRoot/);
  assert.match(service, /title: formatCompactNodeTitle/);
  assert.match(service, /const titleSource = candidate\.rootRole === 'user' \? candidate\.versionContent : candidate\.rootContent/);
  assert.match(service, /followUpMessageCount/);
  assert.match(service, /resolveBranchLineage/);
  assert.doesNotMatch(service, /const roundLabel = candidate\.rootRole === 'assistant' \? '重生成' : '修改'/);
  assert.doesNotMatch(service, /preview:\s*candidate\.versionContent\.slice\(0,\s*240\)/);
});

test('AI branch tree keeps every real message version reachable as a route node', () => {
  const service = read('src/ai/aiBranchTreeService.ts');

  assert.match(service, /const visibleNodes = allNodes;/);
  assert.doesNotMatch(service, /function isRouteWorthyBranchNode/);
  assert.doesNotMatch(service, /isRouteWorthyBranchNode\(node\)/);
  assert.doesNotMatch(service, /const RECENT_BRANCH_LIMIT =/);
  assert.doesNotMatch(service, /\.slice\(0,\s*RECENT_BRANCH_LIMIT\)/);
});

test('AI branch tree persists the adopted main route on the thread', () => {
  const schema = read('src/database/schema.ts');
  const database = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const types = read('src/ai/types.ts');
  const service = read('src/ai/aiBranchTreeService.ts');

  assert.match(schema, /currentBranchRootMessageId TEXT/);
  assert.match(schema, /currentBranchVersionIndex INTEGER/);
  assert.match(schema, /MIGRATION_STATEMENTS_V36/);
  assert.match(database, /MIGRATION_STATEMENTS_V36/);
  assert.match(database, /currentVersion < 36/);
  assert.match(types, /currentBranchRootMessageId: string \| null/);
  assert.match(types, /currentBranchVersionIndex: number \| null/);
  assert.match(repository, /setThreadCurrentBranch/);
  assert.match(repository, /currentBranchRootMessageId:\s*row\.currentBranchRootMessageId/);
  assert.match(repository, /currentBranchVersionIndex:\s*row\.currentBranchVersionIndex/);
  assert.match(service, /adoptBranchSelection/);
  assert.match(service, /aiThreadRepository\.setThreadCurrentBranch/);
});

test('AI branch route metadata and current route survive thread export import', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const exportSnapshotBlock = repository.match(/export interface AiThreadExportSnapshot \{[\s\S]*?\n\}/)?.[0] ?? '';
  const exportThreadBlock = repository.slice(
    repository.indexOf('async exportThread'),
    repository.indexOf('async importThread')
  );
  const importThreadBlock = repository.slice(
    repository.indexOf('async importThread'),
    repository.indexOf('async deleteUserProfilesBoundToThreads')
  );

  assert.match(exportSnapshotBlock, /branchRouteMetadata: AiBranchRouteMetadataRecord\[\]/);
  assert.match(exportThreadBlock, /const branchRouteMetadata = await aiThreadRepository\.listBranchRouteMetadata\(db, threadId\)/);
  for (const field of ['branchRouteMetadata', 'thread', 'messages', 'citations', 'versions', 'userProfile']) {
    assert.match(exportThreadBlock, new RegExp(`return \\{[\\s\\S]*${field},`));
  }
  assert.match(importThreadBlock, /currentBranchRootMessageId/);
  assert.match(importThreadBlock, /currentBranchVersionIndex/);
  assert.match(importThreadBlock, /snapshot\.thread\.currentBranchRootMessageId \?\? null/);
  assert.match(importThreadBlock, /snapshot\.thread\.currentBranchVersionIndex \?\? null/);
  assert.match(importThreadBlock, /sessionBaseUrl/);
  assert.match(importThreadBlock, /snapshot\.thread\.sessionBaseUrl \?\? null/);
  assert.doesNotMatch(importThreadBlock, /sessionApiKeyRef/);
  assert.match(importThreadBlock, /for \(const route of snapshot\.branchRouteMetadata \?\? \[\]\)/);
  assert.match(importThreadBlock, /INSERT INTO ai_branch_route_metadata/);
  assert.match(importThreadBlock, /route\.branchRootMessageId/);
  assert.match(importThreadBlock, /route\.branchVersionIndex/);
});

test('AI branch tree highlights the persisted route and folds sibling groups', () => {
  const service = read('src/ai/aiBranchTreeService.ts');

  assert.match(service, /export interface AiBranchTreeGroup/);
  assert.match(service, /export interface AiBranchTreeRow/);
  assert.match(service, /collapsedGroups: AiBranchTreeGroup\[\]/);
  assert.match(service, /rows: AiBranchTreeRow\[\]/);
  assert.match(service, /function chooseMainRouteScopes/);
  assert.doesNotMatch(service, /LONG_BRANCH_PROMOTION_THRESHOLD/);
  assert.match(service, /function buildBranchTreeRows/);
  assert.match(service, /function buildCollapsedGroups/);
  assert.match(service, /function branchSiblingKey/);
  assert.match(service, /persistedCurrentScopes/);
  assert.match(service, /currentThread\?\.currentBranchRootMessageId/);
  assert.match(service, /return uniqueScopes\(currentScopes\)/);
  assert.match(service, /siblingNodes\.slice\(0,\s*2\)/);
  assert.match(service, /sortedNodes\.slice\(2\)/);
  assert.match(service, /renderedSiblingKeys/);
  assert.match(service, /kind: 'collapsed'/);
  assert.match(service, /label: `\+\$\{collapsedNodes\.length\}`/);
  assert.match(service, /currentThread\?\.currentBranchRootMessageId/);
});

test('AI branch tree screen delegates folded route density to the canvas layout', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');
  const layout = read('src/branchTree/engine/layoutBranchTreeGraph.ts');
  const node = read('src/branchTree/components/BranchTreeNodeCard.tsx');

  assert.match(screen, /BranchTreeCanvas/);
  assert.match(layout, /BRANCH_TREE_MAX_VISIBLE_SIBLINGS = 2/);
  assert.match(layout, /collapsedChildCount/);
  assert.match(node, /\{node\.collapsedChildCount\}/);
  assert.match(screen, /onDeriveBranch/);
  assert.match(screen, /onCheckoutBranch/);
  assert.doesNotMatch(screen, /selectedGroup/);
  assert.doesNotMatch(screen, /renderCollapsedGroup/);
  assert.doesNotMatch(screen, /Modal/);
});

test('AI branch tree resolves the persisted route and adopts selected route before returning', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const app = read('App.tsx');

  assert.match(chat, /thread\?\.currentBranchRootMessageId/);
  assert.match(chat, /setSelectedVersionByMessageId\(buildBranchSelectionMap/);
  assert.match(chat, /loadAdoptedThreadRouteSnapshot/);
  assert.doesNotMatch(app, /currentBranchScopes: \[\]/);
  assert.match(app, /adoptBranchSelection/);
  assert.match(app, /await adoptBranchSelection/);
  assert.match(app, /onCheckoutBranch=\{async \(selection\) => \{/);
  assert.match(app, /onDeriveBranch=\{\(selection\) => \{/);
});

test('AI chat persists message version selection as the current route', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /function getActiveBranchForSelection\(selectionMap: Record<string, number>\): AiBranchScope \| null/);
  assert.match(chat, /async function persistCurrentBranchRoute\(activeBranch: AiBranchScope \| null\): Promise<void>/);
  assert.match(chat, /aiThreadRepository\.setThreadCurrentBranch\(db, \{/);
  assert.match(chat, /const branchRootMessageId = activeBranch \? activeBranch\.branchRootMessageId : null/);
  assert.match(chat, /const branchVersionIndex = activeBranch \? activeBranch\.branchVersionIndex : null/);
  assert.match(chat, /branchRootMessageId,\s*branchVersionIndex,\s*threadId: targetThreadId/);
  assert.match(chat, /function handleSelectMessageVersion\(messageId: string, versionIndex: number\)/);
  assert.match(chat, /const nextSelection = \{ \.\.\.selectedVersionByMessageId, \[messageId\]: versionIndex \}/);
  assert.match(chat, /const activeBranch = getActiveBranchForSelection\(nextSelection\)/);
  assert.match(chat, /void persistCurrentBranchRoute\(activeBranch\)/);
  assert.match(chat, /onSelectVersion=\{handleSelectMessageVersion\}/);
  assert.doesNotMatch(chat, /onSelectVersion=\{\(messageId, versionIndex\) => \{\s*setSelectedVersionByMessageId/);
});

test('AI chat generation paths persist the route that history previews point to', () => {
  const service = read('src/ai/aiChatService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  const sendBlock = /export async function sendUserMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function regenerateAssistantMessage/.exec(service)?.[0] ?? '';
  const regenerateBlock = /export async function regenerateAssistantMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function retryAssistantMessage/.exec(service)?.[0] ?? '';
  const rewriteBlock = /export async function rewriteUserMessage[\s\S]*?\r?\n}\r?\n\r?\nexport async function stopStreamingMessage/.exec(service)?.[0] ?? '';

  assert.match(sendBlock, /setThreadCurrentBranch\(db, \{\s*branchRootMessageId: input\.branchRootMessageId \?\? null,\s*branchVersionIndex: input\.branchVersionIndex \?\? null,\s*threadId: thread\.id/);
  assert.match(regenerateBlock, /const nextBranchVersionIndex = previousAssistantVersion\.versionIndex \+ 1/);
  assert.match(regenerateBlock, /setThreadCurrentBranch\(db, \{\s*branchRootMessageId: input\.assistantMessageId,\s*branchVersionIndex: nextBranchVersionIndex,\s*threadId: thread\.id/);
  assert.match(rewriteBlock, /setThreadCurrentBranch\(db, \{\s*branchRootMessageId: input\.userMessageId,\s*branchVersionIndex: nextBranchVersionIndex,\s*threadId: thread\.id/);
  assert.match(chat, /async function syncPersistedCurrentBranchRoute\(targetThreadId: string, applySelection = false\): Promise<AiBranchScope\[\]>/);
  assert.match(chat, /await syncPersistedCurrentBranchRoute\(targetThreadId, true\)/);
  assert.match(chat, /const branchTreeScopes = branchScopesFromSelectionMap\(branchTreeSelection\.selectionMap\)/);
  assert.match(chat, /void reloadMessages\(targetThreadId, \{\s*anchorMessageId: branchTreeSelection\.branchRootMessageId,\s*branchScopes: branchTreeScopes,\s*forceToLatest: false,\s*\}\)/);
});

test('AI branch tree preview uses the selected branch root version content', () => {
  const service = read('src/ai/aiBranchTreeService.ts');

  assert.match(service, /async function resolveSelectedRootMessage/);
  assert.match(service, /const selectedVersion = versions\.find\(\(version\) => version\.versionIndex === branchVersionIndex\)/);
  assert.match(service, /const selectedRoot = await resolveSelectedRootMessage\(db, root, input\.branchVersionIndex, node\.versionTotal\)/);
  assert.match(service, /selectedMessage: toPreviewMessage\(selectedRoot, `当前选中的 v\$\{node\.branchVersionIndex\} 版本`\)/);
  assert.doesNotMatch(service, /selectedMessage: toPreviewMessage\(root,/);
});

test('AI branch tree screen uses isolated canvas and keeps nearby preview actions in the drawer', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');
  const scaffold = read('src/components/ai/AiLightScaffold.tsx');
  const drawer = read('src/branchTree/components/BranchTreeDrawer.tsx');
  const node = read('src/branchTree/components/BranchTreeNodeCard.tsx');

  assert.match(screen, /AiLightScaffold/);
  assert.match(screen, /title="创作路线树"/);
  assert.match(scaffold, /bodyStyle\?: StyleProp<ViewStyle>/);
  assert.match(scaffold, /style=\{\[bodyStyle, loading && styles\.loadingContent\]\}/);
  assert.match(screen, /bodyStyle=\{styles\.fullScreenBody\}/);
  assert.match(screen, /fullScreenBody:\s*\{\s*flex: 1,\s*\}/);
  assert.doesNotMatch(screen, /当前会话 · 自动整理关键分叉/);
  assert.match(screen, /loadBranchTree/);
  assert.match(screen, /loadBranchTreePreview/);
  assert.match(screen, /BranchTreeCanvas/);
  assert.match(screen, /buildPixoryBranchTreeGraph/);
  assert.match(screen, /buildPixoryBranchTreeSnapshot/);
  assert.match(drawer, /切为此主线/);
  assert.doesNotMatch(drawer, /基于此衍生新分支/);
  assert.match(screen, /snapshotVisible/);
  assert.match(screen, /openSnapshotNode/);
  assert.match(screen, /closeSnapshot/);
  assert.match(node, /numberOfLines=\{2\}/);
  assert.match(drawer, /message\.role === 'user'/);
  assert.match(drawer, /bubbleUser/);
  assert.match(drawer, /bubbleHighlighted/);
  assert.match(screen, /onDeriveBranch/);
  assert.match(screen, /onCheckoutBranch/);
  assert.match(screen, /if \(!snapshotVisible\) \{\s*setPreview\(null\);\s*setPreviewLoading\(false\);\s*return;/);
  assert.doesNotMatch(screen, /previewPanel/);
  assert.match(screen, /aiLightColors\.canvas/);
  assert.match(screen, /rhythm\./);
  assert.match(screen, /spacing\[/);
  assert.doesNotMatch(screen, /node\.isCurrentRoute \? <Text numberOfLines=\{1\} style=\{styles\.nodePill\}>当前<\/Text> : null/);
  assert.doesNotMatch(screen, /点关键节点查看附近消息/);
  assert.doesNotMatch(screen, /节点展开后先确认上下文/);
  assert.doesNotMatch(screen, /选择树上的关键节点后查看附近消息/);
  assert.doesNotMatch(screen, /普通消息不会塞进树里/);
  assert.doesNotMatch(screen, /当前采用：/);
  assert.doesNotMatch(screen, /折叠短枝/);
  assert.doesNotMatch(screen, /关键节点/);
  assert.doesNotMatch(screen, /LinearGradient/);
});

test('AI branch tree lines stay continuous through SVG Bezier paths', () => {
  const links = read('src/branchTree/components/BranchTreeLinks.tsx');
  const layout = read('src/branchTree/engine/layoutBranchTreeGraph.ts');

  assert.match(links, /<Path/);
  assert.match(layout, /function buildBezierPath/);
  assert.match(layout, / C /);
  assert.match(links, /strokeDasharray=\{edge\.kind === 'active' \? undefined : '3,3'\}/);
  assert.match(links, /strokeWidth=\{edge\.kind === 'active' \? 3\.5 : 1\.8\}/);
  assert.doesNotMatch(layout, / L /);
  assert.doesNotMatch(layout, /branchForkHorizontal/);
});

test('AI branch tree renders selected chat preview in the bottom drawer', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');
  const adapter = read('src/branchTree/adapters/pixoryAiBranchTreeAdapter.ts');
  const drawer = read('src/branchTree/components/BranchTreeDrawer.tsx');

  assert.match(screen, /buildPixoryBranchTreeSnapshot\(preview, nodes\)/);
  assert.match(adapter, /preview\.followUpMessages\.map\(toSnapshotMessage\)/);
  assert.doesNotMatch(adapter, /childBranchMessagesForNode/);
  assert.match(drawer, /parentMessages\.map/);
  assert.match(drawer, /selectedMessage/);
  assert.match(drawer, /nextMessages\.map/);
  assert.doesNotMatch(drawer, /onSelectChildMessage/);
  assert.match(drawer, /message\.role === 'user'/);
  assert.match(screen, /setSnapshotVisible\(node !== null\)/);
  assert.doesNotMatch(screen, /setSnapshotVisible\(true\)/);
});

test('AI branch tree node cards are presentational and gesture ownership stays in the canvas', () => {
  const canvas = read('src/branchTree/components/BranchTreeCanvas.tsx');
  const node = read('src/branchTree/components/BranchTreeNodeCard.tsx');

  assert.match(canvas, /Gesture\.Exclusive/);
  assert.match(canvas, /Gesture\.Tap\(\)\.numberOfTaps\(1\)/);
  assert.match(canvas, /Gesture\.Tap\(\)\.numberOfTaps\(2\)/);
  assert.match(canvas, /numberOfTaps\(1\)[\s\S]{0,120}onSelectNode\(node\.id\)/);
  assert.match(canvas, /numberOfTaps\(2\)[\s\S]{0,120}onOpenSnapshotNode\(node\.id\)/);
  assert.doesNotMatch(canvas, /onDoublePress=\{onCheckoutNode\}/);
  assert.doesNotMatch(node, /void onDoublePress/);
  assert.doesNotMatch(node, /Pressable/);
});

test('AI branch tree head recenter reaction stays worklet-safe on Android', () => {
  const canvas = read('src/branchTree/components/BranchTreeCanvas.tsx');
  const reactionBody = canvas.match(/useAnimatedReaction\(\s*\(\) => \{([\s\S]*?)\n    \},\s*\(next, previous\)/)?.[1] ?? '';

  assert.match(reactionBody, /const screenX = headCenterPoint\.x \* scale\.value \+ translateX\.value/);
  assert.match(reactionBody, /const screenY = headCenterPoint\.y \* scale\.value \+ translateY\.value/);
  assert.doesNotMatch(reactionBody, /worldToScreen\(/);
  assert.doesNotMatch(reactionBody, /isHeadOutsideSafeViewport\(/);
});

test('AI branch tree screen keeps graph canvas vertical-depth first and checkout in drawer', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');
  const layout = read('src/branchTree/engine/layoutBranchTreeGraph.ts');
  const drawer = read('src/branchTree/components/BranchTreeDrawer.tsx');

  assert.match(layout, /depth \* BRANCH_TREE_ROW_HEIGHT/);
  assert.match(layout, /BRANCH_TREE_LANE_WIDTH = 140/);
  assert.match(layout, /BRANCH_TREE_ROW_HEIGHT = 110/);
  assert.match(drawer, /切为此主线/);
  assert.match(screen, /onCheckoutNode=\{\(nodeId\) => void checkoutNode\(nodeId\)\}/);
  assert.doesNotMatch(screen, /GRAPH_CANVAS_WIDTH/);
  assert.doesNotMatch(screen, /<ScrollView[\s\S]{0,220}\bhorizontal\b[\s\S]{0,260}<View style=\{styles\.graphGrid\}/);
  assert.doesNotMatch(screen, /width: GRAPH_CANVAS_WIDTH/);
});

test('AI branch tree layout folds overflow branch candidates instead of silently dropping them', () => {
  const layout = read('src/branchTree/engine/layoutBranchTreeGraph.ts');
  const node = read('src/branchTree/components/BranchTreeNodeCard.tsx');

  assert.match(layout, /visibleInactiveCount = Math\.min\(inactiveChildren\.length, BRANCH_TREE_MAX_VISIBLE_SIBLINGS\)/);
  assert.match(layout, /inactiveChildren\.slice\(0, visibleInactiveCount\)/);
  assert.match(layout, /collapsedChildCount/);
  assert.match(node, /\{node\.collapsedChildCount\}/);
  assert.doesNotMatch(layout, /leftBranchNodes[\s\S]{0,140}\.slice\(0,\s*2\)/);
  assert.doesNotMatch(layout, /rightBranchNodes[\s\S]{0,140}\.slice\(0,\s*2\)/);
  assert.doesNotMatch(layout, /trunkNodes[\s\S]{0,160}\.slice\(0,\s*4\)/);
});

test('AI branch tree status updates preserve the selected node after reload', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');

  assert.match(screen, /preferredSelectedNodeId/);
  assert.match(screen, /result\.nodes\.find\(\(node\) => node\.id === preferredSelectedNodeId\)/);
  assert.doesNotMatch(screen, /updateBranchRouteStatus/);
});

test('AI session settings opens branch tree from the current-session module and chat accepts selected branch return', () => {
  const app = read('App.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(app, /AiBranchTreeScreen/);
  assert.match(app, /name: 'ai-branch-tree'/);
  assert.match(app, /branchTreeSelection/);
  assert.match(chat, /branchTreeSelection\?:/);
  assert.doesNotMatch(chat, /onOpenBranchTree: \(threadId: string, currentBranchScopes: AiBranchScope\[\]\) => void/);
  assert.doesNotMatch(chat, /accessibilityLabel="打开创作路线树"/);
  assert.match(sessionConfig, /onOpenBranchTree\?: \(\) => void/);
  assert.match(sessionConfig, /title="创作路线树"/);
  assert.match(sessionConfig, /icon="git-branch-outline"/);
  assert.match(sessionConfig, /disabled=\{!threadId \|\| !onOpenBranchTree\}/);
  assert.match(app, /onOpenBranchTree=\{[\s\S]{0,220}name: 'ai-branch-tree'/);
  assert.doesNotMatch(app, /currentBranchScopes: \[\]/);
  assert.match(chat, /setSelectedVersionByMessageId\(branchTreeSelection\.selectionMap\)/);
  assert.match(chat, /pendingBranchTreeScrollMessageIdRef/);
});

test('AI session settings branch tree entry never creates an empty thread and requires an existing thread', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');

  assert.doesNotMatch(chat, /async function handleOpenBranchTree\(\)/);
  assert.doesNotMatch(sessionConfig, /ensureThread\(/);
  assert.match(sessionConfig, /disabled=\{!threadId \|\| !onOpenBranchTree\}/);

  assert.match(chat, /const targetMessageId = pendingBranchTreeScrollMessageIdRef\.current;[\s\S]*const index = invertedMessageIndexById\.get\(targetMessageId\);[\s\S]*if \(index == null\) \{[\s\S]*messagesRef\.current\.length === 0[\s\S]*return;[\s\S]*hasEarlierMessages[\s\S]*loadEarlierMessages\(\)[\s\S]*setErrorMessage/);
});

test('AI chat branch tree return has its own scroll retry path', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /BRANCH_TREE_SCROLL_RETRY_DELAYS_MS/);
  assert.match(chat, /branchTreeScrollTimeoutsRef/);
  assert.match(chat, /function scrollBranchTreeTargetIntoView/);
  assert.match(chat, /function retryBranchTreeScrollToIndex/);
  assert.match(chat, /onScrollToIndexFailed=\{handleMessageScrollToIndexFailed\}/);
  assert.match(chat, /retryInlineEditScrollToIndex\(info\)/);
  assert.match(chat, /retryBranchTreeScrollToIndex\(info\)/);
  assert.doesNotMatch(chat, /onScrollToIndexFailed=\{retryInlineEditScrollToIndex\}/);
});

test('AI branch tree returns lineage scopes so nested branches switch predictably', () => {
  const service = read('src/ai/aiBranchTreeService.ts');
  const screen = read('src/screens/AiBranchTreeScreen.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(service, /export async function resolveBranchSelection/);
  assert.match(service, /aiThreadRepository\.resolveBranchLineage/);
  assert.match(service, /buildBranchSelectionMap\(scopes\)/);
  assert.match(service, /normalizeCurrentScopes/);
  assert.doesNotMatch(service, /resolveDefaultCurrentScopes/);
  assert.match(service, /currentThread: AiThreadRecord \| null/);
  assert.match(screen, /resolveBranchSelection/);
  assert.match(screen, /selectionMap/);
  assert.match(chat, /selectionMap: Record<string, number>/);
  assert.match(chat, /setSelectedVersionByMessageId\(branchTreeSelection\.selectionMap\)/);
});

test('AI chat restores one persisted route snapshot before loading and positioning messages', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /export interface ListThreadMessagesOptions \{[\s\S]*anchorMessageId\?: string;[\s\S]*branchScopes\?: AiBranchScope\[\]/);
  assert.match(service, /aiThreadRepository\.listMessagesBaseAroundAnchor\(db, threadId, options\.anchorMessageId, options\.limit, options\.branchScopes\)/);
  assert.match(service, /aiThreadRepository\.listMessagesBase\(db, threadId, options\.limit, options\.branchScopes\)/);
  assert.match(chat, /loadAdoptedThreadRouteSnapshot/);
  assert.match(chat, /selectedVersionByMessageIdRef\.current = snapshot\.selectedVersionByMessageId/);
  assert.match(chat, /const hasSearchTarget = Boolean\(searchTargetMessageId\)/);
  assert.match(chat, /await reloadMessages\(targetThreadId, \{\s*anchorMessageId: searchTargetMessageId \?\? undefined,\s*branchScopes: searchTargetBranchScopes,\s*forceToLatest: !hasSearchTarget,\s*\}\)/);
  assert.match(chat, /anchorMessageId: branchTreeSelection\.branchRootMessageId/);
  assert.doesNotMatch(chat, /void reloadMessages\(threadId \?\? null, true\)/);
});
