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

test('AI branch tree hides recent-only message versions that are not real route nodes', () => {
  const service = read('src/ai/aiBranchTreeService.ts');
  const visibleFilter = service.match(/const visibleNodes = allNodes\.filter\(\s*\([\s\S]*?\n  \);/)?.[0] ?? '';

  assert.match(service, /function isRouteWorthyBranchNode/);
  assert.match(visibleFilter, /isRouteWorthyBranchNode\(node\)/);
  assert.doesNotMatch(visibleFilter, /node\.isRecent/);
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
  assert.match(exportThreadBlock, /return \{ branchRouteMetadata, thread, messages, citations, versions, userProfile \}/);
  assert.match(importThreadBlock, /currentBranchRootMessageId/);
  assert.match(importThreadBlock, /currentBranchVersionIndex/);
  assert.match(importThreadBlock, /snapshot\.thread\.currentBranchRootMessageId \?\? null/);
  assert.match(importThreadBlock, /snapshot\.thread\.currentBranchVersionIndex \?\? null/);
  assert.match(importThreadBlock, /for \(const route of snapshot\.branchRouteMetadata \?\? \[\]\)/);
  assert.match(importThreadBlock, /INSERT INTO ai_branch_route_metadata/);
  assert.match(importThreadBlock, /route\.branchRootMessageId/);
  assert.match(importThreadBlock, /route\.branchVersionIndex/);
});

test('AI branch tree service returns promoted main route and folded sibling groups', () => {
  const service = read('src/ai/aiBranchTreeService.ts');

  assert.match(service, /export interface AiBranchTreeGroup/);
  assert.match(service, /export interface AiBranchTreeRow/);
  assert.match(service, /collapsedGroups: AiBranchTreeGroup\[\]/);
  assert.match(service, /rows: AiBranchTreeRow\[\]/);
  assert.match(service, /function chooseMainRouteScopes/);
  assert.match(service, /LONG_BRANCH_PROMOTION_THRESHOLD/);
  assert.match(service, /function buildBranchTreeRows/);
  assert.match(service, /function buildCollapsedGroups/);
  assert.match(service, /function branchSiblingKey/);
  assert.match(service, /persistedCurrentScopes/);
  assert.match(service, /resolveBranchLineage\(input\.db, currentThread\.currentBranchRootMessageId, currentThread\.currentBranchVersionIndex\)/);
  assert.match(service, /siblingNodes\.slice\(0,\s*2\)/);
  assert.match(service, /sortedNodes\.slice\(2\)/);
  assert.match(service, /renderedSiblingKeys/);
  assert.match(service, /kind: 'collapsed'/);
  assert.match(service, /label: `\+\$\{collapsedNodes\.length\}`/);
  assert.match(service, /currentThread\?\.currentBranchRootMessageId/);
});

test('AI branch tree screen renders +N groups in a bottom sheet and uses service rows', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');

  assert.match(screen, /collapsedGroups/);
  assert.match(screen, /selectedGroup/);
  assert.match(screen, /renderCollapsedGroup/);
  assert.match(screen, /group\.label/);
  assert.match(screen, /Modal/);
  assert.match(screen, /transparent/);
  assert.match(screen, /bottomSheet/);
  assert.match(screen, /selectedGroup\?\.nodes\.map/);
  assert.match(screen, /visibleGraphRows = rows/);
  assert.doesNotMatch(screen, /nodes\.map\(\(node, index\) =>/);
});

test('AI chat opens branch tree with persisted route and adopts selected route before returning', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const app = read('App.tsx');

  assert.match(chat, /thread\?\.currentBranchRootMessageId/);
  assert.match(chat, /setSelectedVersionByMessageId\(buildBranchSelectionMap/);
  assert.match(chat, /getPersistedCurrentBranchScopes/);
  assert.match(chat, /currentBranchScopes = getPersistedCurrentBranchScopes/);
  assert.match(app, /adoptBranchSelection/);
  assert.match(app, /await adoptBranchSelection/);
  assert.match(app, /onSelectBranch=\{async \(selection\) => \{/);
});

test('AI branch tree preview uses the selected branch root version content', () => {
  const service = read('src/ai/aiBranchTreeService.ts');

  assert.match(service, /async function resolveSelectedRootMessage/);
  assert.match(service, /const selectedVersion = versions\.find\(\(version\) => version\.versionIndex === branchVersionIndex\)/);
  assert.match(service, /const selectedRoot = await resolveSelectedRootMessage\(db, root, input\.branchVersionIndex, node\.versionTotal\)/);
  assert.match(service, /selectedMessage: toPreviewMessage\(selectedRoot, node\.versionLabel\)/);
  assert.doesNotMatch(service, /selectedMessage: toPreviewMessage\(root, node\.versionLabel\)/);
});

test('AI branch tree screen uses light styling compact nodes and nearby preview actions', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');

  assert.match(screen, /AiLightScaffold/);
  assert.match(screen, /title="创作路线树"/);
  assert.doesNotMatch(screen, /当前会话 · 自动整理关键分叉/);
  assert.match(screen, /loadBranchTree/);
  assert.match(screen, /loadBranchTreePreview/);
  assert.match(screen, /切换并返回聊天/);
  assert.match(screen, /返回聊天定位此处/);
  assert.match(screen, /branchRail/);
  assert.match(screen, /rowConnectorLayer/);
  assert.match(screen, /nodeTitle\}>\{node\.title\}/);
  assert.match(screen, /numberOfLines=\{2\}/);
  assert.match(screen, /nodeCard/);
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

test('AI branch tree lines stay continuous behind compact folded message nodes', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');

  assert.match(screen, /<View pointerEvents="none" style=\{styles\.branchLineLayer\}>/);
  assert.match(screen, /<View style=\{styles\.branchNodeLayer\}>/);
  assert.match(screen, /branchLineLayer:\s*\{[\s\S]{0,120}position: 'absolute'/);
  assert.match(screen, /styles\.rowConnectorLayer/);
  assert.match(screen, /lane === 'left' && styles\.rowConnectorLeft/);
  assert.match(screen, /lane === 'right' && styles\.rowConnectorRight/);
  assert.match(screen, /branchNodeRow:\s*\{[\s\S]{0,120}flexDirection: 'row'/);
  assert.match(screen, /branchLeftRow:\s*\{[\s\S]{0,120}justifyContent: 'flex-start'/);
  assert.match(screen, /branchMainRow:\s*\{[\s\S]{0,120}justifyContent: 'center'/);
  assert.match(screen, /branchRightRow:\s*\{[\s\S]{0,120}justifyContent: 'flex-end'/);
  assert.doesNotMatch(screen, /branchForkVerticalLeft/);
  assert.doesNotMatch(screen, /branchForkVerticalRight/);
  assert.doesNotMatch(screen, /branchForkHorizontal/);
  assert.doesNotMatch(screen, /borderColor: '#A9D8CA'/);
  assert.doesNotMatch(screen, /borderColor: '#E9C28A'/);
  assert.doesNotMatch(screen, /branchForkLine:\s*\{[\s\S]{0,240}borderTopWidth:\s*4/);
  assert.doesNotMatch(screen, /node\.name \?\? node\.title/);
});

test('AI branch tree screen keeps graph vertical-first and switches primary action copy on current route', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');

  assert.match(screen, /const primaryActionLabel = selectedNode\?\.isCurrentRoute \? '返回聊天定位此处' : '切换并返回聊天'/);
  assert.match(screen, /<AiLightButton label=\{primaryActionLabel\}/);
  assert.doesNotMatch(screen, /GRAPH_CANVAS_WIDTH/);
  assert.doesNotMatch(screen, /<ScrollView[\s\S]{0,220}\bhorizontal\b[\s\S]{0,260}<View style=\{styles\.graphGrid\}/);
  assert.doesNotMatch(screen, /width: GRAPH_CANVAS_WIDTH/);
});

test('AI branch tree screen folds overflow branch candidates instead of silently dropping them', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');

  assert.match(screen, /visibleGraphRows/);
  assert.match(screen, /visibleGraphRows = rows/);
  assert.match(screen, /selectedGroup\?\.nodes\.map/);
  assert.doesNotMatch(screen, /leftBranchNodes[\s\S]{0,140}\.slice\(0,\s*2\)/);
  assert.doesNotMatch(screen, /rightBranchNodes[\s\S]{0,140}\.slice\(0,\s*2\)/);
  assert.doesNotMatch(screen, /trunkNodes[\s\S]{0,160}\.slice\(0,\s*4\)/);
});

test('AI branch tree status updates preserve the selected node after reload', () => {
  const screen = read('src/screens/AiBranchTreeScreen.tsx');

  assert.match(screen, /preferredSelectedNodeId/);
  assert.match(screen, /result\.nodes\.find\(\(node\) => node\.id === preferredSelectedNodeId\)/);
  assert.match(screen, /await loadTree\(selectedNode\.id\)/);
});

test('AI chat opens branch tree from header and accepts selected branch return', () => {
  const app = read('App.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(app, /AiBranchTreeScreen/);
  assert.match(app, /name: 'ai-branch-tree'/);
  assert.match(app, /branchTreeSelection/);
  assert.match(app, /onOpenBranchTree/);
  assert.match(chat, /branchTreeSelection\?:/);
  assert.match(chat, /onOpenBranchTree: \(threadId: string, currentBranchScopes: AiBranchScope\[\]\) => void/);
  assert.match(chat, /accessibilityLabel="打开创作路线树"/);
  assert.match(chat, /name="git-branch-outline"/);
  assert.match(chat, /setSelectedVersionByMessageId\(branchTreeSelection\.selectionMap\)/);
  assert.match(chat, /pendingBranchTreeScrollMessageIdRef/);
});

test('AI chat branch tree entry never creates an empty thread and handles unloaded targets', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const openBranchTreeBody = chat.match(/async function handleOpenBranchTree\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';

  assert.doesNotMatch(openBranchTreeBody, /ensureThread\(/);
  assert.match(openBranchTreeBody, /activeThreadIdRef\.current \?\? activeThreadId/);
  assert.match(chat, /disabled=\{!activeThreadId\}/);
  assert.match(chat, /accessibilityState=\{\{ disabled: !activeThreadId \}\}/);

  assert.match(chat, /const targetMessageId = pendingBranchTreeScrollMessageIdRef\.current;[\s\S]*if \(index < 0\) \{[\s\S]*messagesRef\.current\.length === 0[\s\S]*return;[\s\S]*hasEarlierMessages[\s\S]*loadEarlierMessages\(\)[\s\S]*setErrorMessage/);
});

test('AI branch tree returns lineage scopes so nested branches switch predictably', () => {
  const service = read('src/ai/aiBranchTreeService.ts');
  const screen = read('src/screens/AiBranchTreeScreen.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(service, /export async function resolveBranchSelection/);
  assert.match(service, /aiThreadRepository\.resolveBranchLineage/);
  assert.match(service, /buildBranchSelectionMap\(scopes\)/);
  assert.match(service, /normalizeCurrentScopes/);
  assert.match(service, /resolveDefaultCurrentScopes/);
  assert.match(screen, /resolveBranchSelection/);
  assert.match(screen, /selectionMap/);
  assert.match(chat, /selectionMap: Record<string, number>/);
  assert.match(chat, /setSelectedVersionByMessageId\(branchTreeSelection\.selectionMap\)/);
});
