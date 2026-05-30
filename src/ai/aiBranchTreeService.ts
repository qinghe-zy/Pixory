import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  AiBranchRouteMetadataRecord,
  AiBranchRouteStatus,
  AiBranchScope,
  AiBranchTreeCandidateRecord,
  AiMessageRecord,
} from '../database/repositories/aiThreadRepository';

export interface AiBranchTreeNode {
  id: string;
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  parentBranchRootMessageId: string | null;
  parentBranchVersionIndex: number | null;
  rootRole: AiMessageRecord['role'];
  title: string;
  preview: string;
  versionLabel: string;
  versionTotal: number;
  followUpMessageCount: number;
  status: AiBranchRouteStatus;
  name: string | null;
  isCurrentRoute: boolean;
  isCollapsedRepresentative: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiBranchTreeGroup {
  id: string;
  label: string;
  parentBranchRootMessageId: string;
  parentBranchVersionIndex: number;
  nodes: AiBranchTreeNode[];
}

export interface AiBranchTreeRow {
  id: string;
  kind: 'node' | 'collapsed';
  lane: 'left' | 'main' | 'right';
  node?: AiBranchTreeNode;
  group?: AiBranchTreeGroup;
}

export interface AiBranchPreviewMessage {
  id: string;
  role: AiMessageRecord['role'];
  label?: string;
  content: string;
  createdAt: string;
}

export interface AiBranchTreePreview {
  node: AiBranchTreeNode;
  previousMessages: AiBranchPreviewMessage[];
  selectedMessage: AiBranchPreviewMessage;
  followUpMessages: AiBranchPreviewMessage[];
}

export interface AiBranchTreeResult {
  nodes: AiBranchTreeNode[];
  rows: AiBranchTreeRow[];
  collapsedGroups: AiBranchTreeGroup[];
}

export interface AiResolvedBranchSelection {
  branchRootMessageId: string;
  branchVersionIndex: number;
  lineage: AiBranchScope[];
  selectionMap: Record<string, number>;
}

const LONG_BRANCH_PROMOTION_THRESHOLD = 5;

function compactText(value: string, max = 42): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function formatCompactNodeTitle(candidate: AiBranchTreeCandidateRecord): string {
  const titleSource = candidate.rootRole === 'user' ? candidate.versionContent : candidate.rootContent;
  return compactText(titleSource || candidate.versionContent || candidate.rootContent || '分叉', 28);
}

function metadataKey(rootId: string, versionIndex: number): string {
  return `${rootId}:${versionIndex}`;
}

function scopeKey(scope: AiBranchScope): string {
  return metadataKey(scope.branchRootMessageId, scope.branchVersionIndex);
}

function uniqueScopes(scopes: AiBranchScope[]): AiBranchScope[] {
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = scopeKey(scope);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function currentScopeMatchesNode(currentScopes: AiBranchScope[], node: Pick<AiBranchTreeCandidateRecord, 'branchRootMessageId' | 'branchVersionIndex'>): boolean {
  if (currentScopes.length === 0) {
    return false;
  }
  return currentScopes.some(
    (scope) =>
      scope.branchRootMessageId === node.branchRootMessageId &&
      scope.branchVersionIndex === node.branchVersionIndex
  );
}

function mapCandidateToNode(
  candidate: AiBranchTreeCandidateRecord,
  metadata: AiBranchRouteMetadataRecord | undefined,
  currentScopes: AiBranchScope[]
): AiBranchTreeNode {
  const key = metadataKey(candidate.branchRootMessageId, candidate.branchVersionIndex);
  const isCurrentRoute = currentScopeMatchesNode(currentScopes, candidate);
  return {
    id: key,
    branchRootMessageId: candidate.branchRootMessageId,
    branchVersionIndex: candidate.branchVersionIndex,
    createdAt: candidate.versionCreatedAt,
    followUpMessageCount: candidate.followUpMessageCount,
    isCollapsedRepresentative: false,
    isCurrentRoute,
    name: metadata?.name ?? null,
    parentBranchRootMessageId: candidate.parentBranchRootMessageId,
    parentBranchVersionIndex: candidate.parentBranchVersionIndex,
    preview: compactText(candidate.versionContent || candidate.rootContent, 72),
    rootRole: candidate.rootRole,
    status: metadata?.status ?? 'exploring',
    threadId: candidate.rootThreadId,
    title: formatCompactNodeTitle(candidate),
    updatedAt: candidate.latestFollowUpAt ?? candidate.versionUpdatedAt,
    versionLabel: `v${candidate.branchVersionIndex}/${candidate.versionTotal}`,
    versionTotal: candidate.versionTotal,
  };
}

function isSameScope(scope: AiBranchScope, node: Pick<AiBranchTreeNode, 'branchRootMessageId' | 'branchVersionIndex'>): boolean {
  return scope.branchRootMessageId === node.branchRootMessageId && scope.branchVersionIndex === node.branchVersionIndex;
}

function chooseMainRouteScopes(
  currentScopes: AiBranchScope[],
  nodes: AiBranchTreeNode[],
  persistedCurrentScopes: AiBranchScope[] = []
): AiBranchScope[] {
  if (persistedCurrentScopes.length > 0) {
    return uniqueScopes(persistedCurrentScopes);
  }
  const longBranch = [...nodes]
    .filter((node) => node.followUpMessageCount >= LONG_BRANCH_PROMOTION_THRESHOLD)
    .sort((left, right) => right.followUpMessageCount - left.followUpMessageCount || right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!longBranch) {
    return currentScopes;
  }
  return uniqueScopes([
    ...currentScopes,
    {
      branchRootMessageId: longBranch.branchRootMessageId,
      branchVersionIndex: longBranch.branchVersionIndex,
    },
  ]);
}

function branchSiblingKey(node: AiBranchTreeNode): string {
  return node.branchRootMessageId;
}

function sortBranchNodes(left: AiBranchTreeNode, right: AiBranchTreeNode): number {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.branchRootMessageId.localeCompare(right.branchRootMessageId) ||
    left.branchVersionIndex - right.branchVersionIndex
  );
}

function buildCollapsedGroups(sideNodes: AiBranchTreeNode[]): AiBranchTreeGroup[] {
  const nodesBySibling = new Map<string, AiBranchTreeNode[]>();
  sideNodes.forEach((node) => {
    const key = branchSiblingKey(node);
    const group = nodesBySibling.get(key) ?? [];
    group.push(node);
    nodesBySibling.set(key, group);
  });
  const groups: AiBranchTreeGroup[] = [];
  nodesBySibling.forEach((groupNodes, key) => {
    const sortedNodes = [...groupNodes].sort(sortBranchNodes);
    const collapsedNodes = sortedNodes.slice(2);
    if (collapsedNodes.length === 0) {
      return;
    }
    const firstNode = sortedNodes[0];
    groups.push({
      id: `collapsed:${key}`,
      label: `+${collapsedNodes.length}`,
      nodes: collapsedNodes,
      parentBranchRootMessageId: firstNode?.parentBranchRootMessageId ?? 'root',
      parentBranchVersionIndex: firstNode?.parentBranchVersionIndex ?? 0,
    });
  });
  return groups;
}

function buildBranchTreeRows(nodes: AiBranchTreeNode[], mainRouteScopes: AiBranchScope[]): { rows: AiBranchTreeRow[]; collapsedGroups: AiBranchTreeGroup[] } {
  const sideNodes = nodes.filter((node) => !mainRouteScopes.some((scope) => isSameScope(scope, node)));
  const sideNodesBySibling = new Map<string, AiBranchTreeNode[]>();
  sideNodes.forEach((node) => {
    const key = branchSiblingKey(node);
    const group = sideNodesBySibling.get(key) ?? [];
    group.push(node);
    sideNodesBySibling.set(key, group);
  });
  const collapsedGroups = buildCollapsedGroups(sideNodes);
  const rows: AiBranchTreeRow[] = [];
  const renderedSideNodeIds = new Set<string>();
  const renderedGroupIds = new Set<string>();
  const renderedSiblingKeys = new Set<string>();

  function pushSideRowsForRoot(rootMessageId: string): void {
    if (renderedSiblingKeys.has(rootMessageId)) {
      return;
    }
    renderedSiblingKeys.add(rootMessageId);
    const siblingNodes = [...(sideNodesBySibling.get(rootMessageId) ?? [])].sort(sortBranchNodes);
    siblingNodes.slice(0, 2).forEach((node, index) => {
      renderedSideNodeIds.add(node.id);
      rows.push({
        id: `row:${node.id}`,
        kind: 'node',
        lane: index % 2 === 0 ? 'right' : 'left',
        node,
      });
    });
    const group = collapsedGroups.find((item) => item.id === `collapsed:${rootMessageId}`);
    if (group && !renderedGroupIds.has(group.id)) {
      renderedGroupIds.add(group.id);
      rows.push({
        id: `row:${group.id}`,
        kind: 'collapsed',
        lane: siblingNodes.length % 2 === 0 ? 'right' : 'left',
        group,
      });
    }
  }

  nodes.forEach((node) => {
    if (mainRouteScopes.some((scope) => isSameScope(scope, node))) {
      rows.push({ id: `row:${node.id}`, kind: 'node', lane: 'main', node });
      pushSideRowsForRoot(node.branchRootMessageId);
      return;
    }
  });
  sideNodes.forEach((node) => {
    if (renderedSideNodeIds.has(node.id)) {
      return;
    }
    pushSideRowsForRoot(node.branchRootMessageId);
  });

  return { collapsedGroups, rows };
}

export function buildBranchSelectionMap(scopes: AiBranchScope[]): Record<string, number> {
  return uniqueScopes(scopes).reduce<Record<string, number>>((selected, scope) => {
    selected[scope.branchRootMessageId] = scope.branchVersionIndex;
    return selected;
  }, {});
}

function resolveDefaultCurrentScopes(candidates: AiBranchTreeCandidateRecord[]): AiBranchScope[] {
  const latestByRoot = new Map<string, AiBranchTreeCandidateRecord>();
  candidates.forEach((candidate) => {
    const current = latestByRoot.get(candidate.branchRootMessageId);
    if (!current || candidate.branchVersionIndex > current.branchVersionIndex) {
      latestByRoot.set(candidate.branchRootMessageId, candidate);
    }
  });
  return [...latestByRoot.values()].map((candidate) => ({
    branchRootMessageId: candidate.branchRootMessageId,
    branchVersionIndex: candidate.branchVersionIndex,
  }));
}

async function normalizeCurrentScopes(
  db: SQLiteDatabase,
  currentBranchScopes: AiBranchScope[] | undefined,
  candidates: AiBranchTreeCandidateRecord[]
): Promise<AiBranchScope[]> {
  if (currentBranchScopes && currentBranchScopes.length > 0) {
    const expanded: AiBranchScope[] = [];
    for (const scope of currentBranchScopes) {
      const lineage = await aiThreadRepository.resolveBranchLineage(db, scope.branchRootMessageId, scope.branchVersionIndex);
      expanded.push(...(lineage.length > 0 ? lineage : [scope]));
    }
    return uniqueScopes(expanded);
  }
  return resolveDefaultCurrentScopes(candidates);
}

export async function resolveBranchSelection(input: {
  space: PixorySpace;
  branchRootMessageId: string;
  branchVersionIndex: number;
}): Promise<AiResolvedBranchSelection> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const lineage = await aiThreadRepository.resolveBranchLineage(
      db,
      input.branchRootMessageId,
      input.branchVersionIndex
    );
    const scopes = lineage.length > 0
      ? lineage
      : [{ branchRootMessageId: input.branchRootMessageId, branchVersionIndex: input.branchVersionIndex }];
    return {
      branchRootMessageId: input.branchRootMessageId,
      branchVersionIndex: input.branchVersionIndex,
      lineage: scopes,
      selectionMap: buildBranchSelectionMap(scopes),
    };
  });
}

export async function adoptBranchSelection(input: {
  space: PixorySpace;
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
}): Promise<AiResolvedBranchSelection> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const lineage = await aiThreadRepository.resolveBranchLineage(
      db,
      input.branchRootMessageId,
      input.branchVersionIndex
    );
    const scopes = lineage.length > 0
      ? lineage
      : [{ branchRootMessageId: input.branchRootMessageId, branchVersionIndex: input.branchVersionIndex }];
    const selection = {
      branchRootMessageId: input.branchRootMessageId,
      branchVersionIndex: input.branchVersionIndex,
      lineage: scopes,
      selectionMap: buildBranchSelectionMap(scopes),
    };
    await aiThreadRepository.setThreadCurrentBranch(db, {
      branchRootMessageId: selection.branchRootMessageId,
      branchVersionIndex: selection.branchVersionIndex,
      threadId: input.threadId,
    });
    await aiThreadRepository.upsertBranchRouteMetadata(db, {
      branchRootMessageId: selection.branchRootMessageId,
      branchVersionIndex: selection.branchVersionIndex,
      status: 'adopted',
      threadId: input.threadId,
    });
    return selection;
  });
}

async function buildBranchTreeFromDatabase(input: {
  db: SQLiteDatabase;
  threadId: string;
  currentBranchScopes?: AiBranchScope[];
}): Promise<AiBranchTreeResult> {
  const [candidates, metadataRows] = await Promise.all([
    aiThreadRepository.listBranchTreeCandidates(input.db, input.threadId),
    aiThreadRepository.listBranchRouteMetadata(input.db, input.threadId),
  ]);
  const currentThread = await aiThreadRepository.findThreadById(input.db, input.threadId);
  const currentScopes = await normalizeCurrentScopes(input.db, input.currentBranchScopes, candidates);
  const persistedCurrentScopes = currentThread?.currentBranchRootMessageId && currentThread.currentBranchVersionIndex != null
    ? await aiThreadRepository.resolveBranchLineage(input.db, currentThread.currentBranchRootMessageId, currentThread.currentBranchVersionIndex)
    : [];
  const metadataByKey = new Map(
    metadataRows.map((row) => [metadataKey(row.branchRootMessageId, row.branchVersionIndex), row])
  );
  const allNodes = candidates.map((candidate) =>
    mapCandidateToNode(
      candidate,
      metadataByKey.get(metadataKey(candidate.branchRootMessageId, candidate.branchVersionIndex)),
      currentScopes
    )
  );
  const visibleNodes = allNodes;
  const mainRouteScopes = chooseMainRouteScopes(currentScopes, visibleNodes, persistedCurrentScopes);
  const promotedNodes = visibleNodes.map((node) => ({
    ...node,
    isCurrentRoute: mainRouteScopes.some((scope) => isSameScope(scope, node)),
  }));
  const { collapsedGroups, rows } = buildBranchTreeRows(promotedNodes, mainRouteScopes);
  return {
    collapsedGroups,
    nodes: promotedNodes,
    rows,
  };
}

export async function loadBranchTree(input: {
  space: PixorySpace;
  threadId: string;
  currentBranchScopes?: AiBranchScope[];
}): Promise<AiBranchTreeResult> {
  return runWithDatabaseSpace(input.space, (db) =>
    buildBranchTreeFromDatabase({
      currentBranchScopes: input.currentBranchScopes,
      db,
      threadId: input.threadId,
    })
  );
}

function toPreviewMessage(message: AiMessageRecord, label?: string): AiBranchPreviewMessage {
  return {
    content: message.content,
    createdAt: message.createdAt,
    id: message.id,
    label: label ?? '',
    role: message.role,
  };
}

async function resolveSelectedRootMessage(db: SQLiteDatabase, root: AiMessageRecord, branchVersionIndex: number, versionTotal: number): Promise<AiMessageRecord | null> {
  if (branchVersionIndex >= versionTotal) {
    return root;
  }
  const versions = await aiThreadRepository.listMessageVersions(db, root.id);
  const selectedVersion = versions.find((version) => version.versionIndex === branchVersionIndex);
  if (!selectedVersion) {
    return null;
  }
  return {
    ...root,
    completedAt: selectedVersion.messageCompletedAt,
    content: selectedVersion.content,
    createdAt: selectedVersion.messageCreatedAt,
    errorMessage: selectedVersion.errorMessage,
    modelId: selectedVersion.modelId,
    modelSnapshotJson: selectedVersion.modelSnapshotJson,
    promptSnapshotJson: selectedVersion.promptSnapshotJson,
    providerId: selectedVersion.providerId,
    reasoningText: selectedVersion.reasoningText,
    status: selectedVersion.status,
    updatedAt: selectedVersion.messageUpdatedAt,
  };
}

export async function loadBranchTreePreview(input: {
  space: PixorySpace;
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  currentBranchScopes?: AiBranchScope[];
}): Promise<AiBranchTreePreview | null> {
  return runWithDatabaseSpace(input.space, async (db) => {
    const result = await buildBranchTreeFromDatabase({
      currentBranchScopes: input.currentBranchScopes,
      db,
      threadId: input.threadId,
    });
    const node = result.nodes.find(
      (item) =>
        item.branchRootMessageId === input.branchRootMessageId &&
        item.branchVersionIndex === input.branchVersionIndex
    );
    const root = await aiThreadRepository.findMessageById(db, input.branchRootMessageId);
    if (!node || !root) {
      return null;
    }
    const lineage = await aiThreadRepository.resolveBranchLineage(db, input.branchRootMessageId, input.branchVersionIndex);
    const scopes = lineage.length > 0
      ? lineage
      : [{ branchRootMessageId: input.branchRootMessageId, branchVersionIndex: input.branchVersionIndex }];
    const selectedMessages = await aiThreadRepository.listMessages(db, input.threadId, 80, scopes);
    const rootIndex = selectedMessages.findIndex((message) => message.id === input.branchRootMessageId);
    const selectedRoot = await resolveSelectedRootMessage(db, root, input.branchVersionIndex, node.versionTotal);
    if (!selectedRoot) {
      return null;
    }
    const previous = rootIndex > 0
      ? selectedMessages.slice(Math.max(0, rootIndex - 4), rootIndex)
      : await aiThreadRepository.listRecentCompletedMessagesBefore(db, input.threadId, root.id, 4, scopes);
    const followUp = rootIndex >= 0
      ? selectedMessages.slice(rootIndex + 1, rootIndex + 6)
      : await aiThreadRepository.listCompletedNonSystemMessagesAfter(db, input.threadId, root.id, 5, scopes);
    return {
      followUpMessages: followUp.map((message) => toPreviewMessage(message)),
      node,
      previousMessages: previous.map((message) => toPreviewMessage(message)),
      selectedMessage: toPreviewMessage(selectedRoot, `当前选中的 v${node.branchVersionIndex} 版本`),
    };
  });
}

export async function updateBranchRouteStatus(input: {
  space: PixorySpace;
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  status: AiBranchRouteStatus;
}): Promise<void> {
  await runWithDatabaseSpace(input.space, async (db) => {
    await aiThreadRepository.upsertBranchRouteMetadata(db, {
      branchRootMessageId: input.branchRootMessageId,
      branchVersionIndex: input.branchVersionIndex,
      status: input.status,
      threadId: input.threadId,
    });
  });
}
