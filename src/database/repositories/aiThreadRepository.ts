import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  AiBoundaryMode,
  AiCitationRecord,
  AiCitationSourceType,
  AiContextType,
  AiMessageRole,
  AiMessageStatus,
  AiMemorySourceKind,
  AiReplyPreference,
  AiRoleInstructionWeight,
  AiThreadRecord,
} from '../types';
import type {
  AiContinuityImportReviewGateState,
  AiContinuityImportRollbackState,
  AiContinuityImportSourceKind,
  AiContinuitySyntheticMessageKind,
} from '../../ai/aiContinuityImportTypes';
import type { PixorySpace } from '../db';
import { booleanToSqlite, buildUpdateStatement, createTimestamp, normalizeOptionalText, sqliteToBoolean } from '../utils';

export interface AiMessageRecord {
  id: string;
  threadId: string;
  branchRootMessageId: string | null;
  branchVersionIndex: number | null;
  role: AiMessageRole;
  status: AiMessageStatus;
  content: string;
  reasoningText: string | null;
  errorMessage: string | null;
  providerId: string | null;
  modelId: string | null;
  modelSnapshotJson: string;
  promptSnapshotJson: string;
  continuityImportSessionId: string | null;
  continuitySyntheticKind: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AiMessageAttachmentRecord {
  id: string;
  messageId: string;
  threadId: string;
  kind: 'image' | 'document';
  name: string;
  localUri: string;
  documentId: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
}

export interface AiUsageObservationMessageRecord {
  id: string;
  threadId: string;
  providerId: string | null;
  modelId: string | null;
  promptSnapshotJson: string;
  createdAt: string;
  completedAt: string | null;
}

export interface AiBranchScope {
  branchRootMessageId: string;
  branchVersionIndex: number;
}

export type AiBranchRouteStatus = 'exploring' | 'adopted' | 'paused' | 'abandoned';

export interface AiBranchRouteMetadataRecord {
  id: string;
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  name: string | null;
  status: AiBranchRouteStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiBranchTreeCandidateRecord {
  branchRootMessageId: string;
  branchVersionIndex: number;
  rootThreadId: string;
  rootRole: AiMessageRole;
  rootContent: string;
  rootCreatedAt: string;
  rootUpdatedAt: string;
  versionContent: string;
  versionCreatedAt: string;
  versionUpdatedAt: string;
  versionTotal: number;
  followUpMessageCount: number;
  latestFollowUpAt: string | null;
  parentBranchRootMessageId: string | null;
  parentBranchVersionIndex: number | null;
}

export interface AiMessageVersionRecord {
  id: string;
  originalMessageId: string;
  threadId: string;
  versionIndex: number;
  role: AiMessageRole;
  status: AiMessageStatus;
  content: string;
  reasoningText: string | null;
  errorMessage: string | null;
  providerId: string | null;
  modelId: string | null;
  modelSnapshotJson: string;
  promptSnapshotJson: string;
  citations: AiCitationRecord[];
  messageCreatedAt: string;
  messageUpdatedAt: string;
  messageCompletedAt: string | null;
  createdAt: string;
}

export interface AiMessageFavoriteRecord {
  id: string;
  space: PixorySpace;
  threadId: string;
  messageId: string;
  favoriteKey: string;
  branchRootMessageId: string | null;
  branchVersionIndex: number | null;
  branchScopesJson: string;
  messageVersionIndex: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageFavoriteListItem extends AiMessageFavoriteRecord {
  threadTitle: string;
  contextType: AiContextType;
  boundIpId: number | null;
  boundKnowledgeBaseId: string | null;
  includeIpDocuments: boolean;
  messageContent: string;
  messageCreatedAt: string;
  messageUpdatedAt: string;
  versionTotal: number;
}

export interface AiFavoriteAssistantMessageInput {
  space: PixorySpace;
  threadId: string;
  messageId: string;
  branchScopes?: AiBranchScope[];
  messageVersionIndex?: number | null;
}

export type AiMemoryScope = 'global' | 'thread' | 'role' | 'ip' | 'knowledge_base';
export type AiMemoryType = 'preference' | 'fact' | 'decision' | 'instruction' | 'task' | 'correction';
export type AiMemoryStatus = 'active' | 'stale' | 'deleted';

export interface AiThreadMemorySettingsRecord {
  threadId: string;
  deepMemoryEnabled: boolean;
  updatedAt: string;
}

export interface AiThreadSummaryRecord {
  threadId: string;
  summary: string;
  decisions: string;
  openQuestions: string;
  lastMessageId: string | null;
  updatedAt: string;
}

export interface AiThreadMemoryJobRecord {
  threadId: string;
  pendingTurnCount: number;
  lastConsolidatedMessageId: string | null;
  lastCaptureNoticeJson: string;
  lastCompressedMessageId: string | null;
  uncompressedRoundCount: number;
  completedMessageCountAtProfileUpdate: number;
  lastProfileUpdatedAt: string | null;
  profileUpdateCooldownUntil: string | null;
  lastMaintenanceError: string | null;
  lastMaintenanceModelProviderId: string | null;
  lastMaintenanceModelId: string | null;
  lastMaintenanceCompletedAt: string | null;
  lastMaintenanceUsedFallback: number;
  updatedAt: string;
}

export interface AiUserProfileRecord {
  id: string;
  space: PixorySpace;
  boundIpId: number | null;
  boundThreadId: string | null;
  profileJson: string;
  profileText: string;
  version: number;
  sourceThreadId: string | null;
  sourceStartMessageId: string | null;
  sourceEndMessageId: string | null;
  messageCountAtUpdate: number;
  lastUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiThreadSummarySegmentRecord {
  id: string;
  threadId: string;
  space: PixorySpace;
  kind: 'compressed' | 'merged';
  summaryText: string;
  startMessageId: string | null;
  endMessageId: string | null;
  startAt: string | null;
  endAt: string | null;
  roundCount: number;
  sourceSegmentIdsJson: string;
  sourceMessageIdsJson: string;
  branchRouteHash: string;
  lineageVersion: number;
  sourceMessageVersionHash: string;
  quality: 'legacy' | 'local' | 'model' | 'merged';
  status: 'active' | 'stale';
  continuityImportSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiContinuityImportSessionRecord {
  id: string;
  threadId: string;
  space: PixorySpace;
  sourceKind: AiContinuityImportSourceKind;
  sourcePlatform: string | null;
  formatVersion: string | null;
  status: string;
  rollbackState: AiContinuityImportRollbackState;
  rollbackRoundsRemaining: number;
  reviewGateState: AiContinuityImportReviewGateState;
  preImportBranchRootMessageId: string | null;
  preImportBranchVersionIndex: number | null;
  importedBranchRootMessageId: string | null;
  importedBranchVersionIndex: number | null;
  importAnchorMessageId: string | null;
  importAnchorMessageRole: AiMessageRole | null;
  importBranchRootKind: string | null;
  rawDocumentText: string;
  rawDocumentHash: string;
  parsedMessageCount: number;
  containsCompressedContinuity: number;
  remoteModelConsent: number;
  memoryReviewStatus: string | null;
  memoryReviewError: string | null;
  createdAt: string;
  updatedAt: string;
  rolledBackAt: string | null;
  stabilizedAt: string | null;
}

export interface AiContinuityImportBlockRecord {
  id: string;
  importSessionId: string;
  kind: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface AiContinuityImportEffectRecord {
  id: string;
  importSessionId: string;
  effectOrder: number;
  effectType: string;
  targetRecordId: string | null;
  beforeStateJson: string | null;
  afterStateJson: string | null;
  createdAt: string;
}

export interface AiThreadContinuityMilestoneRecord {
  importSessionId: string;
  branchRootMessageId: string;
  rollbackState: AiContinuityImportRollbackState;
  rollbackRoundsRemaining: number;
  sourceKind: AiContinuityImportSourceKind;
  sourcePlatform: string | null;
  parsedMessageCount: number;
  containsCompressedContinuity: number;
  reviewGateState: AiContinuityImportReviewGateState;
  memoryReviewStatus: string | null;
  createdAt: string;
}

export interface AiMemoryRecord {
  id: string;
  space: PixorySpace;
  scope: AiMemoryScope;
  scopeId: string | null;
  type: AiMemoryType;
  content: string;
  normalizedContent: string;
  sourceMessageId: string | null;
  confidence: number;
  importance: number;
  status: AiMemoryStatus;
  lastUsedAt: string | null;
  ipId: number | null;
  groupId: number | null;
  imageAssetId: number | null;
  assetSnapshotJson: string;
  sourceKind: AiMemorySourceKind;
  supersededByMemoryId: string | null;
  mergeReason: string | null;
  mergedAt: string | null;
  lastReconciledAt: string | null;
  reconcileSourceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  memoryLane?: 'confirmed' | 'working' | 'archive';
  memoryVersion?: number;
}

interface AiThreadMemorySettingsRow {
  threadId: string;
  deepMemoryEnabled: number;
  updatedAt: string;
}

export type AiThreadSummaryRow = AiThreadSummaryRecord;
export type AiMemoryRow = AiMemoryRecord;

export type AiMessageVersionRow = Omit<AiMessageVersionRecord, 'citations'> & {
  citationsJson: string;
};

export type AiThreadRow = Omit<AiThreadRecord, 'includeIpDocuments' | 'thinkingDisabled'> & {
  includeIpDocuments: number;
  modelSnapshotJson: string;
  roleCardId: string | null;
  roleSnapshotJson: string;
  thinkingDisabled: number;
};

export type AiCitationRow = Omit<AiCitationRecord, 'locator'> & {
  locatorJson: string;
};

export interface CreateAiThreadInput {
  id: string;
  space: PixorySpace;
  contextType: AiContextType;
  title: string;
  boundIpId?: number | null;
  boundKnowledgeBaseId?: string | null;
  includeIpDocuments?: boolean;
  titleStatus?: 'fallback' | 'generated' | 'custom';
  providerId?: string | null;
  modelId?: string | null;
  sessionBaseUrl?: string | null;
  sessionApiKeyRef?: string | null;
  modelTitleGeneratedAt?: string | null;
  modelSnapshotJson?: string;
  roleCardId?: string | null;
  roleSnapshotJson?: string;
  roleInstructionWeight?: AiRoleInstructionWeight;
  replyPreference?: AiReplyPreference;
  contextHistoryRoundLimit?: number;
  thinkingDisabled?: boolean;
  systemPrompt?: string;
  materialRulesSnapshot?: string | null;
  boundaryMode?: AiBoundaryMode;
  summary?: string | null;
  lastMessagePreview?: string | null;
}

export interface AiThreadListQuery {
  space: PixorySpace;
  contextType?: AiContextType | 'all';
  includeArchived?: boolean;
  customerProjectOnly?: boolean;
  limit?: number;
}

export type AiThreadHistoryFilter = 'all' | AiContextType | 'customer_project' | 'archived';

export interface AiThreadHistoryItem extends AiThreadRecord {
  knowledgeCategory: string | null;
  lastMessageAt: string | null;
}

export type UpdateAiThreadPatch = Partial<
  Pick<
    CreateAiThreadInput,
    | 'title'
    | 'boundIpId'
    | 'boundKnowledgeBaseId'
    | 'includeIpDocuments'
    | 'titleStatus'
    | 'providerId'
    | 'modelId'
    | 'sessionBaseUrl'
    | 'sessionApiKeyRef'
    | 'modelTitleGeneratedAt'
    | 'modelSnapshotJson'
    | 'roleCardId'
    | 'roleSnapshotJson'
    | 'roleInstructionWeight'
    | 'replyPreference'
    | 'contextHistoryRoundLimit'
    | 'thinkingDisabled'
    | 'systemPrompt'
    | 'materialRulesSnapshot'
    | 'boundaryMode'
    | 'summary'
  >
> & {
  lastMessagePreview?: string | null;
  currentBranchRootMessageId?: string | null;
  currentBranchVersionIndex?: number | null;
  archivedAt?: string | null;
};

export interface CreateAiMessageInput {
  id: string;
  threadId: string;
  branchRootMessageId?: string | null;
  branchVersionIndex?: number | null;
  role: AiMessageRole;
  status: AiMessageStatus;
  content?: string;
  reasoningText?: string | null;
  errorMessage?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  modelSnapshotJson?: string;
  promptSnapshotJson?: string;
  continuityImportSessionId?: string | null;
  continuitySyntheticKind?: AiContinuitySyntheticMessageKind | null;
  completedAt?: string | null;
}

export interface CreateAiMessageAttachmentInput {
  id: string;
  messageId: string;
  threadId: string;
  kind: AiMessageAttachmentRecord['kind'];
  name: string;
  localUri: string;
  documentId?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

export type UpdateAiMessagePatch = Partial<Omit<CreateAiMessageInput, 'id' | 'threadId' | 'role'>> & {
  createdAt?: string;
};

export interface CreateAiContinuityImportSessionInput {
  id: string;
  threadId: string;
  space: PixorySpace;
  sourceKind: AiContinuityImportSourceKind;
  sourcePlatform?: string | null;
  formatVersion?: string | null;
  status: string;
  rollbackState: AiContinuityImportRollbackState;
  rollbackRoundsRemaining?: number;
  reviewGateState: AiContinuityImportReviewGateState;
  preImportBranchRootMessageId?: string | null;
  preImportBranchVersionIndex?: number | null;
  importedBranchRootMessageId?: string | null;
  importedBranchVersionIndex?: number | null;
  importAnchorMessageId?: string | null;
  importAnchorMessageRole?: AiMessageRole | null;
  importBranchRootKind?: string | null;
  rawDocumentText: string;
  rawDocumentHash: string;
  parsedMessageCount?: number;
  containsCompressedContinuity?: boolean;
  remoteModelConsent?: boolean;
  memoryReviewStatus?: string | null;
  memoryReviewError?: string | null;
  rolledBackAt?: string | null;
  stabilizedAt?: string | null;
}

export interface CreateAiContinuityImportBlockInput {
  id: string;
  kind: string;
  title: string;
  content: string;
  createdAt?: string;
}

export interface CreateAiContinuityImportEffectInput {
  id: string;
  importSessionId: string;
  effectOrder: number;
  effectType: string;
  targetRecordId?: string | null;
  beforeStateJson?: string | null;
  afterStateJson?: string | null;
  createdAt?: string;
}

export interface CreateSyntheticContinuityImportRootInput {
  id: string;
  threadId: string;
  importSessionId: string;
  createdAt: string;
}

export interface CreateContinuityImportMessageInput {
  id: string;
  threadId: string;
  role: AiMessageRole;
  status: AiMessageStatus;
  content: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  continuityImportSessionId: string;
  continuitySyntheticKind?: AiContinuitySyntheticMessageKind | null;
  completedAt?: string | null;
}

export interface CreateAiMessageVersionInput {
  id: string;
  originalMessageId: string;
  threadId: string;
  role: AiMessageRole;
  status: AiMessageStatus;
  content: string;
  reasoningText?: string | null;
  errorMessage?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  modelSnapshotJson?: string;
  promptSnapshotJson?: string;
  citations?: AiCitationRecord[];
  messageCreatedAt: string;
  messageUpdatedAt: string;
  messageCompletedAt?: string | null;
}

export interface UpsertAiBranchRouteMetadataInput {
  threadId: string;
  branchRootMessageId: string;
  branchVersionIndex: number;
  name?: string | null;
  status?: AiBranchRouteStatus;
  note?: string;
}

interface BranchVersionProjectionRow {
  branchRootMessageId: string;
  branchVersionIndex: number;
  rootThreadId: string;
  rootRole: AiMessageRole;
  rootContent: string;
  rootCreatedAt: string;
  rootUpdatedAt: string;
  versionContent: string;
  versionCreatedAt: string;
  versionUpdatedAt: string;
  versionTotal: number;
  followUpMessageCount: number;
  latestFollowUpAt: string | null;
  parentBranchRootMessageId: string | null;
  parentBranchVersionIndex: number | null;
}

export interface UpsertAiThreadSummaryInput {
  threadId: string;
  summary: string;
  decisions?: string;
  openQuestions?: string;
  lastMessageId?: string | null;
}

export interface CreateAiMemoryInput {
  id: string;
  space: PixorySpace;
  scope: AiMemoryScope;
  scopeId?: string | null;
  type: AiMemoryType;
  content: string;
  normalizedContent: string;
  sourceMessageId?: string | null;
  confidence?: number;
  importance?: number;
  ipId?: number | null;
  groupId?: number | null;
  imageAssetId?: number | null;
  assetSnapshotJson?: string;
  sourceKind?: AiMemorySourceKind;
  supersededByMemoryId?: string | null;
  mergeReason?: string | null;
  mergedAt?: string | null;
  lastReconciledAt?: string | null;
  reconcileSourceMessageId?: string | null;
}

export interface ReplaceCitationInput {
  id: string;
  sourceType: AiCitationSourceType;
  sourceId: string;
  label: string;
  locator?: Record<string, unknown>;
}

export interface AiThreadExportSnapshot {
  thread: AiThreadRow;
  messages: AiMessageRecord[];
  attachments: AiMessageAttachmentRecord[];
  citations: AiCitationRow[];
  versions: AiMessageVersionRow[];
  favorites: AiMessageFavoriteRecord[];
  memorySettings: AiThreadMemorySettingsRecord | null;
  summary: AiThreadSummaryRecord | null;
  threadMemories: AiMemoryRecord[];
  memoryJob: AiThreadMemoryJobRecord | null;
  summarySegments: AiThreadSummarySegmentRecord[];
  branchRouteMetadata: AiBranchRouteMetadataRecord[];
  continuityImportSessions: AiContinuityImportSessionRecord[];
  continuityImportBlocks: AiContinuityImportBlockRecord[];
  userProfile: AiUserProfileRecord | null;
  companionEvents?: CompanionSnapshotRow[];
  companionTemporalAnchors?: CompanionSnapshotRow[];
  companionOpenLoops?: CompanionSnapshotRow[];
  companionRuntimeJobs?: CompanionSnapshotRow[];
  companionContextTraces?: CompanionSnapshotRow[];
}

type CompanionSnapshotRow = Record<string, string | number | null>;

function validateUserProfileScope(input: { boundIpId?: number | null; boundThreadId?: string | null }): void {
  if (input.boundIpId != null && input.boundThreadId != null) {
    throw new Error('AI user profile cannot bind both an IP and a thread.');
  }
}

function mapThreadRow(row: AiThreadRow): AiThreadRecord {
  return {
    id: row.id,
    space: row.space,
    contextType: row.contextType,
    boundIpId: row.boundIpId ?? null,
    boundKnowledgeBaseId: row.boundKnowledgeBaseId ?? null,
    includeIpDocuments: sqliteToBoolean(row.includeIpDocuments),
    title: row.title,
    titleStatus: row.titleStatus,
    modelTitleGeneratedAt: row.modelTitleGeneratedAt ?? null,
    providerId: row.providerId ?? null,
    modelId: row.modelId ?? null,
    sessionBaseUrl: row.sessionBaseUrl ?? null,
    sessionApiKeyRef: row.sessionApiKeyRef ?? null,
    modelSnapshotJson: row.modelSnapshotJson,
    roleCardId: row.roleCardId ?? null,
    roleSnapshotJson: row.roleSnapshotJson,
    roleInstructionWeight: row.roleInstructionWeight === 'high' ? 'high' : 'default',
    replyPreference: row.replyPreference === 'concise' || row.replyPreference === 'detailed' ? row.replyPreference : 'auto',
    contextHistoryRoundLimit: Number.isFinite(row.contextHistoryRoundLimit)
      ? Math.max(1, Math.floor(row.contextHistoryRoundLimit))
      : 30,
    thinkingDisabled: sqliteToBoolean(row.thinkingDisabled),
    boundaryMode: row.boundaryMode,
    systemPrompt: row.systemPrompt,
    materialRulesSnapshot: row.materialRulesSnapshot ?? null,
    summary: row.summary ?? null,
    lastMessagePreview: row.lastMessagePreview ?? null,
    currentBranchRootMessageId: row.currentBranchRootMessageId ?? null,
    currentBranchVersionIndex: row.currentBranchVersionIndex ?? null,
    lineageVersion: Number.isFinite(row.lineageVersion) ? Number(row.lineageVersion) : 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? null,
  };
}

function mapThreadHistoryRow(row: AiThreadRow & { knowledgeCategory: string | null; lastMessageAt: string | null }): AiThreadHistoryItem {
  return {
    ...mapThreadRow(row),
    knowledgeCategory: row.knowledgeCategory ?? null,
    lastMessageAt: row.lastMessageAt ?? null,
  };
}

function parseVersionCitations(citationsJson: string): AiCitationRecord[] {
  try {
    const parsed = JSON.parse(citationsJson);
    return Array.isArray(parsed) ? parsed.filter((citation): citation is AiCitationRecord => citation && typeof citation.id === 'string') : [];
  } catch {
    return [];
  }
}

function mapMessageVersionRow(row: AiMessageVersionRow): AiMessageVersionRecord {
  return {
    ...row,
    citations: parseVersionCitations(row.citationsJson),
  };
}

function mapCitationRow(row: AiCitationRow): AiCitationRecord {
  let locator: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.locatorJson);
    locator = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    locator = {};
  }
  return {
    id: row.id,
    messageId: row.messageId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    label: row.label,
    locator,
    createdAt: row.createdAt,
  };
}

function mapMemorySettingsRow(row: AiThreadMemorySettingsRow): AiThreadMemorySettingsRecord {
  return {
    threadId: row.threadId,
    deepMemoryEnabled: sqliteToBoolean(row.deepMemoryEnabled),
    updatedAt: row.updatedAt,
  };
}

function makeInClause(values: string[]): string {
  return values.map(() => '?').join(', ');
}

function buildSearchTerms(value: string): string[] {
  const normalized = value.toLowerCase();
  const terms = normalized
    .split(/[\s,，。！？!?;；:：、"'“”‘’()\[\]{}<>]+/)
    .map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, '').trim())
    .filter((term) => term.length >= 2);
  for (const match of normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const text = match[0];
    if (text.length <= 6) {
      terms.push(text);
    }
    for (let size = 2; size <= 3; size += 1) {
      for (let index = 0; index <= text.length - size; index += 1) {
        terms.push(text.slice(index, index + size));
      }
    }
  }
  return [...new Set(terms)].slice(0, 18);
}

function buildFtsQuery(value: string): string | null {
  const terms = buildSearchTerms(value).slice(0, 8);
  return terms.length > 0 ? terms.map((term) => `"${term}"`).join(' OR ') : null;
}

function memoryScopePrioritySql(alias = ''): string {
  const prefix = alias ? `${alias}.` : '';
  return `CASE
        WHEN ${prefix}scope = 'thread' THEN 5
        WHEN ${prefix}scope = 'ip' THEN 4
        WHEN ${prefix}scope = 'knowledge_base' THEN 3
        WHEN ${prefix}scope = 'role' THEN 2
        WHEN ${prefix}scope = 'global' THEN 1
        ELSE 0
      END`;
}

function normalizeBranchScopes(branchScopes?: AiBranchScope[]): AiBranchScope[] | null {
  if (!branchScopes) {
    return null;
  }
  const seen = new Set<string>();
  return branchScopes.filter((scope) => {
    const key = `${scope.branchRootMessageId}:${scope.branchVersionIndex}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeFavoriteBranchScopes(branchScopes?: AiBranchScope[]): AiBranchScope[] {
  return normalizeBranchScopes(branchScopes) ?? [];
}

function stableFavoriteBranchScopesJson(branchScopes?: AiBranchScope[]): string {
  const normalized = normalizeFavoriteBranchScopes(branchScopes)
    .slice()
    .sort((left, right) => {
      const rootCompare = left.branchRootMessageId.localeCompare(right.branchRootMessageId);
      return rootCompare !== 0 ? rootCompare : left.branchVersionIndex - right.branchVersionIndex;
    });
  return JSON.stringify(normalized);
}

function getPrimaryFavoriteBranchScope(branchScopes?: AiBranchScope[]): AiBranchScope | null {
  return normalizeFavoriteBranchScopes(branchScopes).at(-1) ?? null;
}

function buildAiMessageFavoriteKey(input: AiFavoriteAssistantMessageInput): string {
  return [
    input.space,
    input.messageId,
    stableFavoriteBranchScopesJson(input.branchScopes),
    input.messageVersionIndex ?? 'current',
  ].join('|');
}

function buildVisibleBranchClause(alias: string, branchScopes?: AiBranchScope[]): { clause: string; values: Array<string | number> } {
  const normalized = normalizeBranchScopes(branchScopes);
  if (!normalized) {
    return { clause: '', values: [] };
  }
  if (normalized.length === 0) {
    return {
      clause: `AND ${alias}.branchRootMessageId IS NULL`,
      values: [],
    };
  }
  const branchPairs = normalized.map(() => `(${alias}.branchRootMessageId = ? AND ${alias}.branchVersionIndex = ?)`).join(' OR ');
  return {
    clause: `AND (${alias}.branchRootMessageId IS NULL OR ${branchPairs})`,
    values: normalized.flatMap((scope) => [scope.branchRootMessageId, scope.branchVersionIndex]),
  };
}

function applyBranchVersionContent(message: AiMessageRecord, version: AiMessageVersionRecord): AiMessageRecord {
  return {
    ...message,
    status: version.status,
    content: version.content,
    reasoningText: version.reasoningText,
    errorMessage: version.errorMessage,
    providerId: version.providerId,
    modelId: version.modelId,
    modelSnapshotJson: version.modelSnapshotJson,
    promptSnapshotJson: version.promptSnapshotJson,
    createdAt: version.messageCreatedAt,
    updatedAt: version.messageUpdatedAt,
    completedAt: version.messageCompletedAt,
  };
}

async function listBranchVersionRowsForScopes(
  db: SQLiteDatabase,
  branchScopes?: AiBranchScope[],
  candidateMessageIds?: Set<string>
): Promise<AiMessageVersionRecord[]> {
  const normalized = normalizeBranchScopes(branchScopes) ?? [];
  const scopedRoots = normalized.filter((scope) => !candidateMessageIds || candidateMessageIds.has(scope.branchRootMessageId));
  if (scopedRoots.length === 0) {
    return [];
  }
  const pairClause = scopedRoots.map(() => '(originalMessageId = ? AND versionIndex = ?)').join(' OR ');
  const rows = await db.getAllAsync<AiMessageVersionRow>(
    `SELECT * FROM ai_message_versions
     WHERE ${pairClause}`,
    ...scopedRoots.flatMap((scope) => [scope.branchRootMessageId, scope.branchVersionIndex])
  );
  return rows.map(mapMessageVersionRow);
}

async function materializeMessagesForBranchScopes(
  db: SQLiteDatabase,
  messages: AiMessageRecord[],
  branchScopes?: AiBranchScope[]
): Promise<AiMessageRecord[]> {
  if (!branchScopes || messages.length === 0) {
    return messages;
  }
  const messageIds = new Set(messages.map((message) => message.id));
  const versions = await listBranchVersionRowsForScopes(db, branchScopes, messageIds);
  if (versions.length === 0) {
    return messages;
  }
  const versionByMessageId = new Map(versions.map((version) => [version.originalMessageId, version]));
  return messages.map((message) => {
    const version = versionByMessageId.get(message.id);
    return version ? applyBranchVersionContent(message, version) : message;
  });
}

function buildBranchVersionSearchClause(branchScopes?: AiBranchScope[]): { clause: string; values: Array<string | number> } | null {
  const normalized = normalizeBranchScopes(branchScopes);
  if (!normalized || normalized.length === 0) {
    return null;
  }
  return {
    clause: normalized.map(() => '(ai_message_versions.originalMessageId = ? AND ai_message_versions.versionIndex = ?)').join(' OR '),
    values: normalized.flatMap((scope) => [scope.branchRootMessageId, scope.branchVersionIndex]),
  };
}

function mergeMessageSearchRows(primaryRows: AiMessageRecord[], secondaryRows: AiMessageRecord[], limit: number): AiMessageRecord[] {
  const seen = new Set<string>();
  const merged: AiMessageRecord[] = [];
  for (const row of [...primaryRows, ...secondaryRows]) {
    if (seen.has(row.id)) {
      continue;
    }
    seen.add(row.id);
    merged.push(row);
    if (merged.length >= limit) {
      break;
    }
  }
  return merged;
}

function buildMemorySourceVisibilityClause(
  alias: string,
  threadId: string,
  branchScopes?: AiBranchScope[]
): { clause: string; values: Array<string | number> } {
  const visibleBranchClause = buildVisibleBranchClause('source_message', branchScopes);
  if (!visibleBranchClause.clause) {
    return { clause: '', values: [] };
  }
  return {
    clause: `(${alias}.sourceMessageId IS NULL OR NOT EXISTS (
        SELECT 1 FROM ai_messages source_message_any
        WHERE source_message_any.id = ${alias}.sourceMessageId
          AND source_message_any.threadId = ?
      ) OR EXISTS (
        SELECT 1 FROM ai_messages source_message
        WHERE source_message.id = ${alias}.sourceMessageId
          AND source_message.threadId = ?
          ${visibleBranchClause.clause}
      ))`,
    values: [threadId, threadId, ...visibleBranchClause.values],
  };
}

function excludeRolledBackContinuityPayload(alias: string): string {
  return `NOT EXISTS (
    SELECT 1
    FROM ai_continuity_import_sessions rolled_back_import
    WHERE rolled_back_import.id = ${alias}.continuityImportSessionId
      AND rolled_back_import.reviewGateState = 'rolled_back'
  )`;
}

function buildSummarySegmentVisibilityClause(
  alias: string,
  branchScopes?: AiBranchScope[]
): { clause: string; values: Array<string | number> } {
  const visibleBranchClause = buildVisibleBranchClause('source_message', branchScopes);
  if (!visibleBranchClause.clause) {
    return { clause: '', values: [] };
  }
  return {
    clause: `(${alias}.endMessageId IS NULL OR EXISTS (
        SELECT 1 FROM ai_messages source_message
        WHERE source_message.id = ${alias}.endMessageId
          AND source_message.threadId = ${alias}.threadId
          ${visibleBranchClause.clause}
      ))`,
    values: visibleBranchClause.values,
  };
}

function buildContinuityImportSessionBranchScopeClause(
  alias: string,
  currentBranchRootMessageId: string | null,
  branchScopes?: AiBranchScope[]
): { clause: string; values: Array<string | number> } {
  const normalized = normalizeBranchScopes(branchScopes);
  if (!normalized) {
    return { clause: '', values: [] };
  }
  if (normalized.length === 0) {
    if (!currentBranchRootMessageId) {
      return { clause: '', values: [] };
    }
    return {
      clause: `AND ${alias}.importedBranchRootMessageId = ?`,
      values: [currentBranchRootMessageId],
    };
  }
  return {
    clause: `AND (${normalized.map(() => `${alias}.importedBranchRootMessageId = ?`).join(' OR ')})`,
    values: normalized.map((scope) => scope.branchRootMessageId),
  };
}

const DELETE_MESSAGE_CHUNK_SIZE = 200;
const MESSAGE_LOOKUP_CHUNK_SIZE = 200;
const BRANCH_LINEAGE_MAX_DEPTH = 1000;

export const aiThreadRepository = {
  async listBranchRouteMetadata(db: SQLiteDatabase, threadId: string): Promise<AiBranchRouteMetadataRecord[]> {
    return db.getAllAsync<AiBranchRouteMetadataRecord>(
      `SELECT * FROM ai_branch_route_metadata
       WHERE threadId = ?
       ORDER BY updatedAt DESC, createdAt DESC`,
      threadId
    );
  },

  async upsertBranchRouteMetadata(
    db: SQLiteDatabase,
    input: UpsertAiBranchRouteMetadataInput
  ): Promise<AiBranchRouteMetadataRecord> {
    const now = createTimestamp();
    const existing = await db.getFirstAsync<AiBranchRouteMetadataRecord>(
      `SELECT * FROM ai_branch_route_metadata
       WHERE threadId = ? AND branchRootMessageId = ? AND branchVersionIndex = ?`,
      input.threadId,
      input.branchRootMessageId,
      input.branchVersionIndex
    );
    const id = existing?.id ?? `route_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const nextName = input.name === undefined ? existing?.name ?? null : normalizeOptionalText(input.name) ?? null;
    const nextNote = input.note === undefined ? existing?.note ?? '' : input.note;
    await db.runAsync(
      `INSERT INTO ai_branch_route_metadata (
         id, threadId, branchRootMessageId, branchVersionIndex, name, status, note, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(threadId, branchRootMessageId, branchVersionIndex) DO UPDATE SET
         name = excluded.name,
         status = excluded.status,
         note = excluded.note,
         updatedAt = excluded.updatedAt`,
      id,
      input.threadId,
      input.branchRootMessageId,
      input.branchVersionIndex,
      nextName,
      input.status ?? existing?.status ?? 'exploring',
      nextNote,
      existing?.createdAt ?? now,
      now
    );
    const row = await db.getFirstAsync<AiBranchRouteMetadataRecord>('SELECT * FROM ai_branch_route_metadata WHERE id = ?', id);
    if (!row) {
      throw new Error('Failed to save AI branch route metadata.');
    }
    return row;
  },

  async deleteBranchRouteMetadata(
    db: SQLiteDatabase,
    input: { threadId: string; branchRootMessageId: string; branchVersionIndex: number }
  ): Promise<void> {
    await db.runAsync(
      `DELETE FROM ai_branch_route_metadata
       WHERE threadId = ? AND branchRootMessageId = ? AND branchVersionIndex = ?`,
      input.threadId,
      input.branchRootMessageId,
      input.branchVersionIndex
    );
  },

  async setThreadCurrentBranch(
    db: SQLiteDatabase,
    input: { threadId: string; branchRootMessageId: string | null; branchVersionIndex: number | null }
  ): Promise<AiThreadRecord | null> {
    await db.runAsync(
      `UPDATE ai_threads
       SET currentBranchRootMessageId = ?,
           currentBranchVersionIndex = ?,
           lineageVersion = lineageVersion + CASE
             WHEN COALESCE(currentBranchRootMessageId, '∅') <> COALESCE(?, '∅')
               OR COALESCE(currentBranchVersionIndex, -1) <> COALESCE(?, -1)
             THEN 1 ELSE 0 END,
           updatedAt = ?
       WHERE id = ?`,
      input.branchRootMessageId,
      input.branchVersionIndex,
      input.branchRootMessageId,
      input.branchVersionIndex,
      createTimestamp(),
      input.threadId
    );
    const row = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', input.threadId);
    if (row) {
      await db.runAsync(
        `INSERT INTO memory_lineage_meta (
           threadId, currentRootMessageId, currentBranchVersionIndex, lineageVersion, updatedAt
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(threadId) DO UPDATE SET
           currentRootMessageId = excluded.currentRootMessageId,
           currentBranchVersionIndex = excluded.currentBranchVersionIndex,
           lineageVersion = excluded.lineageVersion,
           updatedAt = excluded.updatedAt`,
        row.id,
        row.currentBranchRootMessageId ?? null,
        row.currentBranchVersionIndex ?? 0,
        row.lineageVersion ?? 0,
        createTimestamp()
      );
    }
    return row ? mapThreadRow(row) : null;
  },

  async listBranchTreeCandidates(db: SQLiteDatabase, threadId: string): Promise<AiBranchTreeCandidateRecord[]> {
    const rows = await db.getAllAsync<BranchVersionProjectionRow>(
       `WITH root_versions AS (
         SELECT originalMessageId, COUNT(*) + 1 AS versionTotal
         FROM ai_message_versions
         WHERE threadId = ?
         GROUP BY originalMessageId
         HAVING versionTotal > 1
       ),
       historical_versions AS (
        SELECT
          root.id AS branchRootMessageId,
          ai_message_versions.versionIndex AS branchVersionIndex,
           root.threadId AS rootThreadId,
           root.role AS rootRole,
           root.content AS rootContent,
           root.createdAt AS rootCreatedAt,
           root.updatedAt AS rootUpdatedAt,
          ai_message_versions.content AS versionContent,
          ai_message_versions.messageCreatedAt AS versionCreatedAt,
          ai_message_versions.messageUpdatedAt AS versionUpdatedAt,
          root_versions.versionTotal AS versionTotal,
          CASE
            WHEN ai_message_versions.versionIndex > 1 THEN root.id
            ELSE root.branchRootMessageId
          END AS parentBranchRootMessageId,
          CASE
            WHEN ai_message_versions.versionIndex > 1 THEN ai_message_versions.versionIndex - 1
            ELSE root.branchVersionIndex
          END AS parentBranchVersionIndex
        FROM ai_message_versions
        JOIN root_versions ON root_versions.originalMessageId = ai_message_versions.originalMessageId
        JOIN ai_messages root ON root.id = ai_message_versions.originalMessageId
         WHERE root.threadId = ?
           AND ai_message_versions.versionIndex < root_versions.versionTotal
           AND ai_message_versions.status IN ('completed', 'stopped', 'failed')
       ),
       current_versions AS (
         SELECT
           root.id AS branchRootMessageId,
           root_versions.versionTotal AS branchVersionIndex,
           root.threadId AS rootThreadId,
           root.role AS rootRole,
           root.content AS rootContent,
           root.createdAt AS rootCreatedAt,
           root.updatedAt AS rootUpdatedAt,
          root.content AS versionContent,
          root.createdAt AS versionCreatedAt,
          root.updatedAt AS versionUpdatedAt,
          root_versions.versionTotal AS versionTotal,
          CASE
            WHEN root_versions.versionTotal > 1 THEN root.id
            ELSE root.branchRootMessageId
          END AS parentBranchRootMessageId,
          CASE
            WHEN root_versions.versionTotal > 1 THEN root_versions.versionTotal - 1
            ELSE root.branchVersionIndex
          END AS parentBranchVersionIndex
        FROM root_versions
        JOIN ai_messages root ON root.id = root_versions.originalMessageId
        WHERE root.threadId = ?
           AND root.status IN ('completed', 'stopped', 'failed')
       ),
       branch_versions AS (
         SELECT * FROM historical_versions
         UNION ALL
         SELECT * FROM current_versions
       )
       SELECT
         branch_versions.branchRootMessageId,
         branch_versions.branchVersionIndex,
         branch_versions.rootThreadId,
         branch_versions.rootRole,
         branch_versions.rootContent,
         branch_versions.rootCreatedAt,
         branch_versions.rootUpdatedAt,
         branch_versions.versionContent,
         branch_versions.versionCreatedAt,
         branch_versions.versionUpdatedAt,
         branch_versions.versionTotal,
         COUNT(descendant.id) AS followUpMessageCount,
         MAX(descendant.updatedAt) AS latestFollowUpAt,
         branch_versions.parentBranchRootMessageId,
         branch_versions.parentBranchVersionIndex
       FROM branch_versions
       LEFT JOIN ai_messages descendant
         ON descendant.threadId = branch_versions.rootThreadId
        AND descendant.branchRootMessageId = branch_versions.branchRootMessageId
        AND descendant.branchVersionIndex = branch_versions.branchVersionIndex
        AND descendant.status IN ('completed', 'stopped', 'failed')
       GROUP BY
         branch_versions.branchRootMessageId,
         branch_versions.branchVersionIndex,
         branch_versions.rootThreadId,
         branch_versions.rootRole,
         branch_versions.rootContent,
         branch_versions.rootCreatedAt,
         branch_versions.rootUpdatedAt,
         branch_versions.versionContent,
         branch_versions.versionCreatedAt,
         branch_versions.versionUpdatedAt,
         branch_versions.versionTotal,
         branch_versions.parentBranchRootMessageId,
         branch_versions.parentBranchVersionIndex
       ORDER BY branch_versions.rootCreatedAt ASC, branch_versions.branchRootMessageId ASC, branch_versions.branchVersionIndex ASC`,
      threadId,
      threadId,
      threadId,
    );
    return rows.map((row) => ({
      branchRootMessageId: row.branchRootMessageId,
      branchVersionIndex: row.branchVersionIndex,
      followUpMessageCount: row.followUpMessageCount,
      latestFollowUpAt: row.latestFollowUpAt,
      parentBranchRootMessageId: row.parentBranchRootMessageId,
      parentBranchVersionIndex: row.parentBranchVersionIndex,
      rootContent: row.rootContent,
      rootCreatedAt: row.rootCreatedAt,
      rootRole: row.rootRole,
      rootThreadId: row.rootThreadId,
      rootUpdatedAt: row.rootUpdatedAt,
      versionContent: row.versionContent,
      versionCreatedAt: row.versionCreatedAt,
      versionTotal: row.versionTotal,
      versionUpdatedAt: row.versionUpdatedAt,
    }));
  },

  async createThread(db: SQLiteDatabase, input: CreateAiThreadInput): Promise<AiThreadRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_threads (
        id,
        space,
        contextType,
        boundIpId,
        boundKnowledgeBaseId,
        includeIpDocuments,
        title,
        titleStatus,
        providerId,
        modelId,
        sessionBaseUrl,
        sessionApiKeyRef,
        modelTitleGeneratedAt,
        modelSnapshotJson,
        roleCardId,
        roleSnapshotJson,
        roleInstructionWeight,
        replyPreference,
        contextHistoryRoundLimit,
        thinkingDisabled,
        systemPrompt,
        materialRulesSnapshot,
        boundaryMode,
        summary,
        lastMessagePreview,
        createdAt,
        updatedAt,
        archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      input.id,
      input.space,
      input.contextType,
      input.boundIpId ?? null,
      input.boundKnowledgeBaseId ?? null,
      booleanToSqlite(input.includeIpDocuments ?? false),
      input.title,
      input.titleStatus ?? 'fallback',
      input.providerId ?? null,
      input.modelId ?? null,
      input.sessionBaseUrl ?? null,
      input.sessionApiKeyRef ?? null,
      input.modelTitleGeneratedAt ?? null,
      input.modelSnapshotJson ?? '{}',
      input.roleCardId ?? null,
      input.roleSnapshotJson ?? '{}',
      input.roleInstructionWeight ?? 'default',
      input.replyPreference ?? 'auto',
      input.contextHistoryRoundLimit ?? 30,
      booleanToSqlite(input.thinkingDisabled ?? false),
      input.systemPrompt ?? '',
      input.materialRulesSnapshot ?? null,
      input.boundaryMode ?? 'free',
      input.summary ?? null,
      normalizeOptionalText(input.lastMessagePreview) ?? null,
      now,
      now
    );

    const thread = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', input.id);
    if (!thread) {
      throw new Error(`AI thread ${input.id} was created but could not be reloaded.`);
    }
    return mapThreadRow(thread);
  },

  async updateThread(db: SQLiteDatabase, threadId: string, patch: UpdateAiThreadPatch): Promise<AiThreadRecord | null> {
    const updates = buildUpdateStatement({
      title: patch.title,
      boundIpId: patch.boundIpId,
      boundKnowledgeBaseId: patch.boundKnowledgeBaseId,
      includeIpDocuments: patch.includeIpDocuments === undefined ? undefined : booleanToSqlite(patch.includeIpDocuments),
      titleStatus: patch.titleStatus,
      providerId: patch.providerId,
      modelId: patch.modelId,
      sessionBaseUrl: patch.sessionBaseUrl,
      sessionApiKeyRef: patch.sessionApiKeyRef,
      modelTitleGeneratedAt: patch.modelTitleGeneratedAt,
      modelSnapshotJson: patch.modelSnapshotJson,
      roleCardId: patch.roleCardId,
      roleSnapshotJson: patch.roleSnapshotJson,
      roleInstructionWeight: patch.roleInstructionWeight,
      replyPreference: patch.replyPreference,
      contextHistoryRoundLimit: patch.contextHistoryRoundLimit === undefined
        ? undefined
        : Math.max(1, Math.floor(patch.contextHistoryRoundLimit)),
      thinkingDisabled: patch.thinkingDisabled === undefined ? undefined : booleanToSqlite(patch.thinkingDisabled),
      systemPrompt: patch.systemPrompt,
      materialRulesSnapshot: patch.materialRulesSnapshot,
      boundaryMode: patch.boundaryMode,
      summary: patch.summary,
      lastMessagePreview: normalizeOptionalText(patch.lastMessagePreview),
      currentBranchRootMessageId: patch.currentBranchRootMessageId,
      currentBranchVersionIndex: patch.currentBranchVersionIndex,
      archivedAt: patch.archivedAt,
      updatedAt: createTimestamp(),
    });
    if (!updates.setClause) {
      const row = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', threadId);
      return row ? mapThreadRow(row) : null;
    }
    await db.runAsync(`UPDATE ai_threads SET ${updates.setClause} WHERE id = ?`, ...updates.values, threadId);
    const row = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', threadId);
    return row ? mapThreadRow(row) : null;
  },

  async findThreadById(db: SQLiteDatabase, threadId: string): Promise<AiThreadRecord | null> {
    const row = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', threadId);
    return row ? mapThreadRow(row) : null;
  },

  async listAssistantUsageObservationMessages(
    db: SQLiteDatabase,
    input: { space: PixorySpace; since?: string | null; limit?: number }
  ): Promise<AiUsageObservationMessageRecord[]> {
    const limit = input.limit ?? 500;
    const sinceClause = input.since ? 'AND ai_messages.createdAt >= ?' : '';
    const values: Array<string | number> = input.since ? [input.space, input.since, limit] : [input.space, limit];
    return db.getAllAsync<AiUsageObservationMessageRecord>(
      `SELECT
         ai_messages.id,
         ai_messages.threadId,
         ai_messages.providerId,
         ai_messages.modelId,
         ai_messages.promptSnapshotJson,
         ai_messages.createdAt,
         ai_messages.completedAt
       FROM ai_messages
       JOIN ai_threads ON ai_threads.id = ai_messages.threadId
       WHERE ai_threads.space = ?
         AND ai_messages.role = 'assistant'
         AND (
           ai_messages.promptSnapshotJson LIKE '%"providerCache"%'
           OR ai_messages.promptSnapshotJson LIKE '%"usage"%'
         )
         ${sinceClause}
       ORDER BY ai_messages.createdAt DESC, ai_messages.rowid DESC
       LIMIT ?`,
      ...values
    );
  },

  async listThreadAssistantUsageObservationMessages(
    db: SQLiteDatabase,
    input: { space: PixorySpace; threadId: string; limit?: number }
  ): Promise<AiUsageObservationMessageRecord[]> {
    const limit = input.limit ?? 80;
    return db.getAllAsync<AiUsageObservationMessageRecord>(
      `SELECT
         ai_messages.id,
         ai_messages.threadId,
         ai_messages.providerId,
         ai_messages.modelId,
         ai_messages.promptSnapshotJson,
         ai_messages.createdAt,
         ai_messages.completedAt
       FROM ai_messages
       JOIN ai_threads ON ai_threads.id = ai_messages.threadId
       WHERE ai_threads.space = ?
         AND ai_messages.threadId = ?
         AND ai_messages.role = 'assistant'
         AND (
           ai_messages.promptSnapshotJson LIKE '%"providerCache"%'
           OR ai_messages.promptSnapshotJson LIKE '%"usage"%'
         )
       ORDER BY ai_messages.createdAt DESC, ai_messages.rowid DESC
       LIMIT ?`,
      input.space,
      input.threadId,
      limit
    );
  },

  async findThreadsByIds(db: SQLiteDatabase, space: PixorySpace, threadIds: string[]): Promise<AiThreadRecord[]> {
    const ids = Array.from(new Set(threadIds.filter(Boolean)));
    if (ids.length === 0) {
      return [];
    }
    const rows: AiThreadRow[] = [];
    for (let index = 0; index < ids.length; index += 400) {
      const chunk = ids.slice(index, index + 400);
      rows.push(
        ...(await db.getAllAsync<AiThreadRow>(
          `SELECT * FROM ai_threads
           WHERE space = ? AND id IN (${makeInClause(chunk)})`,
          space,
          ...chunk
        ))
      );
    }
    return rows.map(mapThreadRow);
  },

  async exportThread(db: SQLiteDatabase, threadId: string): Promise<AiThreadExportSnapshot | null> {
    const thread = await db.getFirstAsync<AiThreadRow>('SELECT * FROM ai_threads WHERE id = ?', threadId);
    if (!thread) {
      return null;
    }
    const messages = await db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM ai_messages
       WHERE threadId = ?
       ORDER BY createdAt ASC`,
      threadId
    );
    const citations = await db.getAllAsync<AiCitationRow>(
      `SELECT ai_message_citations.*
       FROM ai_message_citations
       INNER JOIN ai_messages ON ai_messages.id = ai_message_citations.messageId
       WHERE ai_messages.threadId = ?
       ORDER BY ai_message_citations.createdAt ASC`,
      threadId
    );
    const attachments = await db.getAllAsync<AiMessageAttachmentRecord>(
      `SELECT * FROM ai_message_attachments
       WHERE threadId = ?
       ORDER BY createdAt ASC`,
      threadId
    );
    const versions = await db.getAllAsync<AiMessageVersionRow>(
      `SELECT ai_message_versions.*
       FROM ai_message_versions
       INNER JOIN ai_messages ON ai_messages.id = ai_message_versions.originalMessageId
       WHERE ai_messages.threadId = ?
       ORDER BY ai_message_versions.originalMessageId ASC, ai_message_versions.versionIndex ASC`,
      threadId
    );
    const branchRouteMetadata = await aiThreadRepository.listBranchRouteMetadata(db, threadId);
    const continuityImportSessions = await db.getAllAsync<AiContinuityImportSessionRecord>(
      `SELECT *
       FROM ai_continuity_import_sessions
       WHERE threadId = ?
       ORDER BY createdAt ASC`,
      threadId
    );
    const favorites = await db.getAllAsync<AiMessageFavoriteRecord>(
      `SELECT * FROM ai_message_favorites
       WHERE threadId = ?
       ORDER BY createdAt ASC`,
      threadId
    );
    const memorySettingsRow = await db.getFirstAsync<AiThreadMemorySettingsRow>(
      'SELECT * FROM ai_thread_memory_settings WHERE threadId = ?',
      threadId
    );
    const summary = await db.getFirstAsync<AiThreadSummaryRecord>(
      'SELECT * FROM ai_thread_summaries WHERE threadId = ?',
      threadId
    );
    const threadMemories = await db.getAllAsync<AiMemoryRecord>(
      `SELECT * FROM ai_memories
       WHERE space = ? AND scope = 'thread' AND scopeId = ?
       ORDER BY createdAt ASC`,
      thread.space,
      threadId
    );
    const memoryJob = await db.getFirstAsync<AiThreadMemoryJobRecord>(
      'SELECT * FROM ai_thread_memory_jobs WHERE threadId = ?',
      threadId
    );
    const summarySegments = await db.getAllAsync<AiThreadSummarySegmentRecord>(
      `SELECT * FROM ai_thread_summary_segments
       WHERE threadId = ?
       ORDER BY createdAt ASC, id ASC`,
      threadId
    );
    const companionEvents = await db.getAllAsync<CompanionSnapshotRow>(
      'SELECT * FROM companion_events WHERE threadId = ? ORDER BY eventSequence ASC, id ASC',
      threadId
    );
    const companionTemporalAnchors = await db.getAllAsync<CompanionSnapshotRow>(
      'SELECT * FROM companion_temporal_anchors WHERE threadId = ? ORDER BY createdAt ASC, id ASC',
      threadId
    );
    const companionOpenLoops = await db.getAllAsync<CompanionSnapshotRow>(
      'SELECT * FROM companion_open_loops WHERE threadId = ? ORDER BY createdAt ASC, id ASC',
      threadId
    );
    const companionRuntimeJobs = await db.getAllAsync<CompanionSnapshotRow>(
      'SELECT * FROM companion_runtime_jobs WHERE threadId = ? ORDER BY createdAt ASC, id ASC',
      threadId
    );
    const companionContextTraces = await db.getAllAsync<CompanionSnapshotRow>(
      'SELECT * FROM companion_context_traces WHERE threadId = ? ORDER BY createdAt ASC, id ASC',
      threadId
    );
    const continuityImportBlocks = await db.getAllAsync<AiContinuityImportBlockRecord>(
      `SELECT ai_continuity_import_blocks.*
       FROM ai_continuity_import_blocks
       INNER JOIN ai_continuity_import_sessions
         ON ai_continuity_import_sessions.id = ai_continuity_import_blocks.importSessionId
       WHERE ai_continuity_import_sessions.threadId = ?
       ORDER BY ai_continuity_import_blocks.createdAt ASC`,
      threadId
    );
    const userProfile = await db.getFirstAsync<AiUserProfileRecord>(
      'SELECT * FROM ai_user_profiles WHERE space = ? AND boundIpId IS NULL AND boundThreadId = ?',
      thread.space,
      threadId
    );
    return {
      attachments,
      branchRouteMetadata,
      citations,
      companionContextTraces,
      companionEvents,
      companionOpenLoops,
      companionRuntimeJobs,
      companionTemporalAnchors,
      continuityImportBlocks,
      continuityImportSessions,
      favorites,
      memoryJob,
      memorySettings: memorySettingsRow ? mapMemorySettingsRow(memorySettingsRow) : null,
      messages,
      summary,
      summarySegments,
      thread,
      threadMemories,
      userProfile,
      versions,
    };
  },

  async importThread(db: SQLiteDatabase, snapshot: AiThreadExportSnapshot, targetSpace: PixorySpace): Promise<void> {
    await db.runAsync(
      `INSERT INTO ai_threads (
        id,
        space,
        contextType,
        boundIpId,
        boundKnowledgeBaseId,
        includeIpDocuments,
        title,
        titleStatus,
        modelTitleGeneratedAt,
        providerId,
        modelId,
        sessionBaseUrl,
        modelSnapshotJson,
        roleCardId,
        roleSnapshotJson,
        roleInstructionWeight,
        replyPreference,
        contextHistoryRoundLimit,
        thinkingDisabled,
        systemPrompt,
        materialRulesSnapshot,
        boundaryMode,
        summary,
        lastMessagePreview,
        currentBranchRootMessageId,
        currentBranchVersionIndex,
        createdAt,
        updatedAt,
        archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      snapshot.thread.id,
      targetSpace,
      snapshot.thread.contextType,
      snapshot.thread.boundIpId ?? null,
      snapshot.thread.boundKnowledgeBaseId ?? null,
      snapshot.thread.includeIpDocuments,
      snapshot.thread.title,
      snapshot.thread.titleStatus,
      snapshot.thread.modelTitleGeneratedAt ?? null,
      snapshot.thread.providerId ?? null,
      snapshot.thread.modelId ?? null,
      snapshot.thread.sessionBaseUrl ?? null,
      snapshot.thread.modelSnapshotJson,
      snapshot.thread.roleCardId ?? null,
      snapshot.thread.roleSnapshotJson,
      snapshot.thread.roleInstructionWeight ?? 'default',
      snapshot.thread.replyPreference ?? 'auto',
      snapshot.thread.contextHistoryRoundLimit ?? 30,
      snapshot.thread.thinkingDisabled ?? 0,
      snapshot.thread.systemPrompt,
      snapshot.thread.materialRulesSnapshot ?? null,
      snapshot.thread.boundaryMode,
      snapshot.thread.summary ?? null,
      snapshot.thread.lastMessagePreview ?? null,
      snapshot.thread.currentBranchRootMessageId ?? null,
      snapshot.thread.currentBranchVersionIndex ?? null,
      snapshot.thread.createdAt,
      snapshot.thread.updatedAt,
      snapshot.thread.archivedAt ?? null
    );

    for (const session of snapshot.continuityImportSessions ?? []) {
      const targetRollbackState = session.rollbackState === 'available' ? 'locked' : session.rollbackState;
      const targetRollbackRoundsRemaining = targetRollbackState === 'locked' ? 0 : session.rollbackRoundsRemaining;
      await db.runAsync(
        `INSERT INTO ai_continuity_import_sessions (
          id,
          threadId,
          space,
          sourceKind,
          sourcePlatform,
          formatVersion,
          status,
          rollbackState,
          rollbackRoundsRemaining,
          reviewGateState,
          preImportBranchRootMessageId,
          preImportBranchVersionIndex,
          importedBranchRootMessageId,
          importedBranchVersionIndex,
          importAnchorMessageId,
          importAnchorMessageRole,
          importBranchRootKind,
          rawDocumentText,
          rawDocumentHash,
          parsedMessageCount,
          containsCompressedContinuity,
          memoryReviewStatus,
          memoryReviewError,
          createdAt,
          updatedAt,
          rolledBackAt,
          stabilizedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        session.id,
        snapshot.thread.id,
        targetSpace,
        session.sourceKind,
        session.sourcePlatform,
        session.formatVersion,
        session.status,
        targetRollbackState,
        targetRollbackRoundsRemaining,
        session.reviewGateState,
        session.preImportBranchRootMessageId,
        session.preImportBranchVersionIndex,
        session.importedBranchRootMessageId,
        session.importedBranchVersionIndex,
        session.importAnchorMessageId,
        session.importAnchorMessageRole,
        session.importBranchRootKind,
        session.rawDocumentText,
        session.rawDocumentHash,
        session.parsedMessageCount,
        session.containsCompressedContinuity,
        session.memoryReviewStatus,
        session.memoryReviewError,
        session.createdAt,
        session.updatedAt,
        session.rolledBackAt,
        session.stabilizedAt
      );
    }

    for (const message of snapshot.messages) {
      await db.runAsync(
        `INSERT INTO ai_messages (
          id,
          threadId,
          branchRootMessageId,
          branchVersionIndex,
          role,
          status,
          content,
          reasoningText,
      errorMessage,
      providerId,
      modelId,
      modelSnapshotJson,
      promptSnapshotJson,
      continuityImportSessionId,
      continuitySyntheticKind,
      createdAt,
      updatedAt,
      completedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        message.id,
        message.threadId,
        message.branchRootMessageId ?? null,
        message.branchVersionIndex ?? null,
        message.role,
        message.status,
        message.content,
        message.reasoningText,
        message.errorMessage,
        message.providerId,
        message.modelId,
        message.modelSnapshotJson,
        message.promptSnapshotJson,
        message.continuityImportSessionId ?? null,
        message.continuitySyntheticKind ?? null,
        message.createdAt,
        message.updatedAt,
        message.completedAt
      );
      await aiThreadRepository.syncMessageFts(db, message);
    }

    for (const event of snapshot.companionEvents ?? []) {
      await db.runAsync(
        `INSERT INTO companion_events (
          id, space, subjectType, subjectId, roleCardId, threadId, branchRootMessageId,
          branchVersionIndex, branchRouteHash, lineageVersion, sourceMessageId,
          sourceMessageVersionHash, category, subtype, speechMode, confidence, intensity,
          sincerity, payloadJson, evidenceSpanJson, extractorVersion, provenanceJson,
          idempotencyKey, status, eventSequence, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        event.id, targetSpace, event.subjectType, event.subjectId, event.roleCardId ?? null,
        snapshot.thread.id, event.branchRootMessageId ?? null, event.branchVersionIndex ?? null,
        event.branchRouteHash, event.lineageVersion, event.sourceMessageId,
        event.sourceMessageVersionHash, event.category, event.subtype, event.speechMode,
        event.confidence, event.intensity, event.sincerity, event.payloadJson,
        event.evidenceSpanJson, event.extractorVersion, event.provenanceJson,
        event.idempotencyKey, event.status, event.eventSequence, event.createdAt
      );
    }

    for (const anchor of snapshot.companionTemporalAnchors ?? []) {
      await db.runAsync(
        `INSERT INTO companion_temporal_anchors (
          id, space, roleCardId, threadId, branchRouteHash, lineageVersion, sourceEventId,
          sourceMessageId, rawText, startAtUtc, endAtUtc, parseTimeZone, localDateKey,
          precision, anchorType, recurrenceRule, mentionCount, lastMentionedAt, status,
          confidence, parserVersion, idempotencyKey, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        anchor.id, targetSpace, anchor.roleCardId ?? null, snapshot.thread.id,
        anchor.branchRouteHash, anchor.lineageVersion, anchor.sourceEventId,
        anchor.sourceMessageId, anchor.rawText, anchor.startAtUtc ?? null, anchor.endAtUtc ?? null,
        anchor.parseTimeZone, anchor.localDateKey, anchor.precision, anchor.anchorType,
        anchor.recurrenceRule ?? null, anchor.mentionCount ?? 0, anchor.lastMentionedAt ?? null,
        anchor.status, anchor.confidence, anchor.parserVersion,
        anchor.idempotencyKey, anchor.createdAt, anchor.updatedAt
      );
    }

    for (const loop of snapshot.companionOpenLoops ?? []) {
      await db.runAsync(
        `INSERT INTO companion_open_loops (
          id, space, roleCardId, threadId, branchRouteHash, lineageVersion, sourceEventId,
          sourceMessageId, temporalAnchorId, kind, topicText, status, priority,
          earliestMentionAt, expiresAt, mentionCount, lastMentionedAt, lastMentionedRound,
          recurrenceRule, resolutionEvidenceMessageId, idempotencyKey, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        loop.id, targetSpace, loop.roleCardId ?? null, snapshot.thread.id, loop.branchRouteHash,
        loop.lineageVersion, loop.sourceEventId, loop.sourceMessageId,
        loop.temporalAnchorId ?? null, loop.kind, loop.topicText, loop.status, loop.priority,
        loop.earliestMentionAt, loop.expiresAt ?? null, loop.mentionCount,
        loop.lastMentionedAt ?? null, loop.lastMentionedRound ?? null, loop.recurrenceRule ?? null,
        loop.resolutionEvidenceMessageId ?? null, loop.idempotencyKey, loop.createdAt, loop.updatedAt
      );
    }

    for (const job of snapshot.companionRuntimeJobs ?? []) {
      const importedStatus = job.status === 'running' ? 'retry' : job.status;
      await db.runAsync(
        `INSERT INTO companion_runtime_jobs (
          id, space, threadId, branchRouteHash, lineageVersion, sourceMessageId, jobType,
          status, payloadJson, idempotencyKey, attemptCount, nextRunAt, leaseOwner,
          leaseUntil, lastErrorCode, createdAt, updatedAt, completedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
        job.id, targetSpace, snapshot.thread.id, job.branchRouteHash, job.lineageVersion,
        job.sourceMessageId ?? null, job.jobType, importedStatus, job.payloadJson,
        job.idempotencyKey, job.attemptCount, job.nextRunAt, job.lastErrorCode ?? null,
        job.createdAt, job.updatedAt, job.completedAt ?? null
      );
    }

    for (const trace of snapshot.companionContextTraces ?? []) {
      await db.runAsync(
        `INSERT INTO companion_context_traces (
          id, space, threadId, sourceMessageId, branchRouteHash, lineageVersion,
          policyVersion, eventCount, diagnosticCandidateCount, optionalCandidateCount,
          selectedTopicType, observerDurationMs, compilerDurationMs, reasonCodesJson, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        trace.id, targetSpace, snapshot.thread.id, trace.sourceMessageId ?? null,
        trace.branchRouteHash, trace.lineageVersion, trace.policyVersion, trace.eventCount,
        trace.diagnosticCandidateCount, trace.optionalCandidateCount,
        trace.selectedTopicType ?? null, trace.observerDurationMs, trace.compilerDurationMs,
        trace.reasonCodesJson, trace.createdAt
      );
    }

    for (const citation of snapshot.citations) {
      await db.runAsync(
        `INSERT INTO ai_message_citations (
          id,
          messageId,
          sourceType,
          sourceId,
          label,
          locatorJson,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        citation.id,
        citation.messageId,
        citation.sourceType,
        citation.sourceId,
        citation.label,
        citation.locatorJson,
        citation.createdAt
      );
    }

    for (const version of snapshot.versions ?? []) {
      await db.runAsync(
        `INSERT INTO ai_message_versions (
          id,
          originalMessageId,
          threadId,
          versionIndex,
          role,
          status,
          content,
          reasoningText,
          errorMessage,
          providerId,
          modelId,
          modelSnapshotJson,
          promptSnapshotJson,
          citationsJson,
          messageCreatedAt,
          messageUpdatedAt,
          messageCompletedAt,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        version.id,
        version.originalMessageId,
        version.threadId,
        version.versionIndex,
        version.role,
        version.status,
        version.content,
        version.reasoningText,
        version.errorMessage,
        version.providerId,
        version.modelId,
        version.modelSnapshotJson,
        version.promptSnapshotJson,
        version.citationsJson,
        version.messageCreatedAt,
        version.messageUpdatedAt,
        version.messageCompletedAt,
        version.createdAt
      );
      await aiThreadRepository.syncMessageVersionFts(db, mapMessageVersionRow(version));
    }

    for (const attachment of snapshot.attachments ?? []) {
      await db.runAsync(
        `INSERT INTO ai_message_attachments (
          id, messageId, threadId, kind, name, localUri, documentId, mimeType, fileSize, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        attachment.id,
        attachment.messageId,
        attachment.threadId,
        attachment.kind,
        attachment.name,
        attachment.localUri,
        attachment.mimeType,
        attachment.fileSize,
        attachment.createdAt
      );
    }

    for (const favorite of snapshot.favorites ?? []) {
      const targetFavoriteKey = favorite.favoriteKey.startsWith(`${favorite.space}|`)
        ? `${targetSpace}|${favorite.favoriteKey.slice(favorite.space.length + 1)}`
        : favorite.favoriteKey;
      await db.runAsync(
        `INSERT INTO ai_message_favorites (
          id, space, threadId, messageId, favoriteKey, branchRootMessageId, branchVersionIndex,
          branchScopesJson, messageVersionIndex, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        favorite.id,
        targetSpace,
        favorite.threadId,
        favorite.messageId,
        targetFavoriteKey,
        favorite.branchRootMessageId,
        favorite.branchVersionIndex,
        favorite.branchScopesJson,
        favorite.messageVersionIndex,
        favorite.createdAt,
        favorite.updatedAt
      );
    }

    if (snapshot.memorySettings) {
      await db.runAsync(
        `INSERT INTO ai_thread_memory_settings (threadId, deepMemoryEnabled, updatedAt)
         VALUES (?, ?, ?)`,
        snapshot.memorySettings.threadId,
        booleanToSqlite(snapshot.memorySettings.deepMemoryEnabled),
        snapshot.memorySettings.updatedAt
      );
    }

    if (snapshot.summary) {
      await db.runAsync(
        `INSERT INTO ai_thread_summaries (
          threadId, summary, decisions, openQuestions, lastMessageId, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        snapshot.summary.threadId,
        snapshot.summary.summary,
        snapshot.summary.decisions,
        snapshot.summary.openQuestions,
        snapshot.summary.lastMessageId,
        snapshot.summary.updatedAt
      );
    }

    for (const memory of snapshot.threadMemories ?? []) {
      const movedMemory = {
        ...memory,
        space: targetSpace,
        // Asset ids are local to a space-specific database. Keep the descriptive
        // snapshot but never let numeric ids resolve to unrelated target records.
        ipId: null,
        groupId: null,
        imageAssetId: null,
      };
      await db.runAsync(
        `INSERT INTO ai_memories (
          id, space, scope, scopeId, type, content, normalizedContent, sourceMessageId,
          confidence, importance, status, lastUsedAt, ipId, groupId, imageAssetId, assetSnapshotJson,
          sourceKind, supersededByMemoryId, mergeReason, mergedAt, lastReconciledAt,
          reconcileSourceMessageId, createdAt, updatedAt, deletedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        movedMemory.id,
        movedMemory.space,
        movedMemory.scope,
        movedMemory.scopeId,
        movedMemory.type,
        movedMemory.content,
        movedMemory.normalizedContent,
        movedMemory.sourceMessageId,
        movedMemory.confidence,
        movedMemory.importance,
        movedMemory.status,
        movedMemory.lastUsedAt,
        movedMemory.ipId,
        movedMemory.groupId,
        movedMemory.imageAssetId,
        movedMemory.assetSnapshotJson,
        movedMemory.sourceKind,
        movedMemory.supersededByMemoryId,
        movedMemory.mergeReason,
        movedMemory.mergedAt,
        movedMemory.lastReconciledAt,
        movedMemory.reconcileSourceMessageId,
        movedMemory.createdAt,
        movedMemory.updatedAt,
        movedMemory.deletedAt
      );
      await aiThreadRepository.syncMemoryFts(db, movedMemory);
    }

    if (snapshot.memoryJob) {
      await db.runAsync(
        `INSERT INTO ai_thread_memory_jobs (
          threadId, pendingTurnCount, lastConsolidatedMessageId, lastCaptureNoticeJson,
          lastCompressedMessageId, uncompressedRoundCount, completedMessageCountAtProfileUpdate,
          lastProfileUpdatedAt, profileUpdateCooldownUntil, lastMaintenanceError,
          lastMaintenanceModelProviderId, lastMaintenanceModelId, lastMaintenanceCompletedAt,
          lastMaintenanceUsedFallback, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        snapshot.memoryJob.threadId,
        snapshot.memoryJob.pendingTurnCount,
        snapshot.memoryJob.lastConsolidatedMessageId,
        snapshot.memoryJob.lastCaptureNoticeJson,
        snapshot.memoryJob.lastCompressedMessageId,
        snapshot.memoryJob.uncompressedRoundCount,
        snapshot.memoryJob.completedMessageCountAtProfileUpdate,
        snapshot.memoryJob.lastProfileUpdatedAt,
        snapshot.memoryJob.profileUpdateCooldownUntil,
        snapshot.memoryJob.lastMaintenanceError,
        snapshot.memoryJob.lastMaintenanceModelProviderId,
        snapshot.memoryJob.lastMaintenanceModelId,
        snapshot.memoryJob.lastMaintenanceCompletedAt,
        snapshot.memoryJob.lastMaintenanceUsedFallback,
        snapshot.memoryJob.updatedAt
      );
    }

    for (const segment of snapshot.summarySegments ?? []) {
      await db.runAsync(
        `INSERT INTO ai_thread_summary_segments (
          id, threadId, space, kind, summaryText, startMessageId, endMessageId,
          startAt, endAt, roundCount, sourceSegmentIdsJson, continuityImportSessionId,
          sourceMessageIdsJson, branchRouteHash, lineageVersion, sourceMessageVersionHash,
          quality, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        segment.id,
        segment.threadId,
        targetSpace,
        segment.kind,
        segment.summaryText,
        segment.startMessageId,
        segment.endMessageId,
        segment.startAt,
        segment.endAt,
        segment.roundCount,
        segment.sourceSegmentIdsJson,
        segment.continuityImportSessionId,
        segment.sourceMessageIdsJson ?? '[]',
        segment.branchRouteHash ?? '',
        segment.lineageVersion ?? 0,
        segment.sourceMessageVersionHash ?? '',
        segment.quality ?? 'legacy',
        segment.status ?? 'stale',
        segment.createdAt,
        segment.updatedAt
      );
    }

    for (const block of snapshot.continuityImportBlocks ?? []) {
      await db.runAsync(
        `INSERT INTO ai_continuity_import_blocks (
          id,
          importSessionId,
          kind,
          title,
          content,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        block.id,
        block.importSessionId,
        block.kind,
        block.title,
        block.content,
        block.createdAt
      );
    }

    for (const route of snapshot.branchRouteMetadata ?? []) {
      await db.runAsync(
        `INSERT INTO ai_branch_route_metadata (
          id,
          threadId,
          branchRootMessageId,
          branchVersionIndex,
          name,
          status,
          note,
          createdAt,
          updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        route.id,
        snapshot.thread.id,
        route.branchRootMessageId,
        route.branchVersionIndex,
        route.name ?? null,
        route.status,
        route.note,
        route.createdAt,
        route.updatedAt
      );
    }

    if (snapshot.userProfile) {
      await aiThreadRepository.upsertUserProfile(db, {
        id: snapshot.userProfile.id,
        lastUpdatedAt: snapshot.userProfile.lastUpdatedAt,
        messageCountAtUpdate: snapshot.userProfile.messageCountAtUpdate,
        profileJson: snapshot.userProfile.profileJson,
        profileText: snapshot.userProfile.profileText,
        sourceEndMessageId: snapshot.userProfile.sourceEndMessageId,
        sourceStartMessageId: snapshot.userProfile.sourceStartMessageId,
        sourceThreadId: snapshot.thread.id,
        space: targetSpace,
        boundIpId: null,
        boundThreadId: snapshot.thread.id,
        version: snapshot.userProfile.version,
        createdAt: snapshot.userProfile.createdAt,
        updatedAt: snapshot.userProfile.updatedAt,
      });
    }
  },

  async restoreMessageAttachmentDocumentLinks(
    db: SQLiteDatabase,
    attachments: AiMessageAttachmentRecord[]
  ): Promise<void> {
    for (const attachment of attachments) {
      if (!attachment.documentId) {
        continue;
      }
      const document = await db.getFirstAsync<{ id: string; localUri: string | null }>(
        'SELECT id, localUri FROM ai_documents WHERE id = ?',
        attachment.documentId
      );
      if (!document?.localUri) {
        throw new Error('聊天附件关联的文档迁移不完整。');
      }
      await db.runAsync(
        'UPDATE ai_message_attachments SET documentId = ?, localUri = ? WHERE id = ? AND threadId = ?',
        attachment.documentId,
        document.localUri,
        attachment.id,
        attachment.threadId
      );
    }
  },

  async deleteUserProfilesBoundToThreads(db: SQLiteDatabase, threadIds: string[]): Promise<number> {
    let deletedCount = 0;
    for (const threadId of threadIds) {
      const result = await db.runAsync('DELETE FROM ai_user_profiles WHERE boundThreadId = ?', threadId);
      deletedCount += result.changes;
    }
    return deletedCount;
  },

  async deleteThreads(db: SQLiteDatabase, threadIds: string[]): Promise<number> {
    let deletedCount = 0;
    for (const threadId of threadIds) {
      await db.runAsync('DELETE FROM ai_message_fts WHERE threadId = ?', threadId);
      await db.runAsync('DELETE FROM ai_message_version_fts WHERE threadId = ?', threadId);
      const memoryIds = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM ai_memories
         WHERE scope = 'thread' AND scopeId = ?`,
        threadId
      );
      if (memoryIds.length > 0) {
        const ids = memoryIds.map((row) => row.id);
        await db.runAsync(`DELETE FROM ai_memory_fts WHERE id IN (${makeInClause(ids)})`, ...ids);
      }
      const thread = await db.getFirstAsync<{ space: PixorySpace }>('SELECT space FROM ai_threads WHERE id = ?', threadId);
      if (thread) {
        await db.runAsync(
          `DELETE FROM ai_memories WHERE space = ? AND scope = 'thread' AND scopeId = ?`,
          thread.space,
          threadId
        );
      }
      await this.deleteUserProfilesBoundToThreads(db, [threadId]);
      const result = await db.runAsync('DELETE FROM ai_threads WHERE id = ?', threadId);
      deletedCount += result.changes;
    }
    return deletedCount;
  },

  async softDeleteThreads(db: SQLiteDatabase, space: PixorySpace, threadIds: string[]): Promise<number> {
    const now = createTimestamp();
    let deletedCount = 0;
    for (const threadId of threadIds) {
      const result = await db.runAsync(
        `UPDATE ai_threads
         SET archivedAt = ?, updatedAt = ?
         WHERE id = ? AND space = ? AND archivedAt IS NULL`,
        now,
        now,
        threadId,
        space
      );
      deletedCount += result.changes;
    }
    return deletedCount;
  },

  async listRecentThreads(db: SQLiteDatabase, space: PixorySpace, limit = 5): Promise<AiThreadRecord[]> {
    const rows = await db.getAllAsync<AiThreadRow>(
      `SELECT * FROM ai_threads
       WHERE space = ? AND archivedAt IS NULL
       ORDER BY updatedAt DESC, createdAt DESC
       LIMIT ?`,
      space,
      limit
    );
    return rows.map(mapThreadRow);
  },

  async listThreads(db: SQLiteDatabase, query: AiThreadListQuery): Promise<AiThreadRecord[]> {
    const clauses = ['space = ?'];
    const values: (string | number)[] = [query.space];
    if (query.contextType && query.contextType !== 'all') {
      clauses.push('contextType = ?');
      values.push(query.contextType);
    }
    if (!query.includeArchived) {
      clauses.push('archivedAt IS NULL');
    }
    const rows = await db.getAllAsync<AiThreadRow>(
      `SELECT * FROM ai_threads
       WHERE ${clauses.join(' AND ')}
       ORDER BY updatedAt DESC, createdAt DESC
       LIMIT ?`,
      ...values,
      query.limit ?? 100
    );
    return rows.map(mapThreadRow);
  },

  async listHistoryItems(db: SQLiteDatabase, space: PixorySpace, filter: AiThreadHistoryFilter = 'all', limit = 100, searchText = ''): Promise<AiThreadHistoryItem[]> {
    const clauses = ['ai_threads.space = ?'];
    const values: (string | number)[] = [space];
    const normalizedSearch = searchText.trim();
    if (filter === 'archived') {
      clauses.push('ai_threads.archivedAt IS NOT NULL');
    } else {
      clauses.push('ai_threads.archivedAt IS NULL');
      if (filter === 'normal' || filter === 'ip' || filter === 'knowledge_base') {
        clauses.push('ai_threads.contextType = ?');
        values.push(filter);
      }
      if (filter === 'customer_project') {
        clauses.push("ai_threads.contextType = 'knowledge_base'");
        clauses.push("ai_knowledge_bases.category = 'customer_project'");
      }
    }
    clauses.push(`EXISTS (
      SELECT 1
      FROM ai_messages history_messages
      WHERE history_messages.threadId = ai_threads.id
        AND history_messages.role <> 'system'
    )`);
    if (normalizedSearch) {
      clauses.push('(ai_threads.title LIKE ? OR ai_threads.lastMessagePreview LIKE ?)');
      values.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`);
    }
    const rows = await db.getAllAsync<AiThreadRow & { knowledgeCategory: string | null; lastMessageAt: string | null }>(
      `SELECT ai_threads.*, ai_knowledge_bases.category AS knowledgeCategory, ai_last_messages.lastMessageAt AS lastMessageAt
       FROM ai_threads
       LEFT JOIN ai_knowledge_bases ON ai_knowledge_bases.id = ai_threads.boundKnowledgeBaseId
       LEFT JOIN (
         SELECT threadId, MAX(COALESCE(completedAt, updatedAt, createdAt)) AS lastMessageAt
         FROM ai_messages
         GROUP BY threadId
       ) ai_last_messages ON ai_last_messages.threadId = ai_threads.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY COALESCE(ai_last_messages.lastMessageAt, ai_threads.updatedAt) DESC, ai_threads.createdAt DESC
       LIMIT ?`,
      ...values,
      limit
    );
    return rows.map(mapThreadHistoryRow);
  },

  async createMessage(db: SQLiteDatabase, input: CreateAiMessageInput): Promise<AiMessageRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_messages (
        id,
        threadId,
        branchRootMessageId,
        branchVersionIndex,
        role,
        status,
        content,
        reasoningText,
        errorMessage,
        providerId,
        modelId,
        modelSnapshotJson,
        promptSnapshotJson,
        continuityImportSessionId,
        continuitySyntheticKind,
        createdAt,
        updatedAt,
        completedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.threadId,
      input.branchRootMessageId ?? null,
      input.branchVersionIndex ?? null,
      input.role,
      input.status,
      input.content ?? '',
      input.reasoningText ?? null,
      input.errorMessage ?? null,
      input.providerId ?? null,
      input.modelId ?? null,
      input.modelSnapshotJson ?? '{}',
      input.promptSnapshotJson ?? '{}',
      input.continuityImportSessionId ?? null,
      input.continuitySyntheticKind ?? null,
      now,
      now,
      input.completedAt ?? null
    );
    const message = await db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ?', input.id);
    if (!message) {
      throw new Error(`AI message ${input.id} was created but could not be reloaded.`);
    }
    await aiThreadRepository.syncMessageFts(db, message);
    return message;
  },

  async updateMessage(db: SQLiteDatabase, messageId: string, patch: UpdateAiMessagePatch): Promise<AiMessageRecord | null> {
    const updates = buildUpdateStatement({
      status: patch.status,
      branchRootMessageId: patch.branchRootMessageId,
      branchVersionIndex: patch.branchVersionIndex,
      content: patch.content,
      reasoningText: patch.reasoningText,
      errorMessage: normalizeOptionalText(patch.errorMessage),
      providerId: patch.providerId,
      modelId: patch.modelId,
      modelSnapshotJson: patch.modelSnapshotJson,
      promptSnapshotJson: patch.promptSnapshotJson,
      continuityImportSessionId: patch.continuityImportSessionId,
      continuitySyntheticKind: patch.continuitySyntheticKind,
      createdAt: patch.createdAt,
      completedAt: patch.completedAt,
      updatedAt: createTimestamp(),
    });
    if (!updates.setClause) {
      return db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ?', messageId);
    }
    await db.runAsync(`UPDATE ai_messages SET ${updates.setClause} WHERE id = ?`, ...updates.values, messageId);
    const message = await db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ?', messageId);
    if (message) {
      await aiThreadRepository.syncMessageFts(db, message);
    }
    return message;
  },

  async createMessageAttachment(db: SQLiteDatabase, input: CreateAiMessageAttachmentInput): Promise<AiMessageAttachmentRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_message_attachments (
        id,
        messageId,
        threadId,
        kind,
        name,
        localUri,
        documentId,
        mimeType,
        fileSize,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.messageId,
      input.threadId,
      input.kind,
      input.name,
      input.localUri,
      input.documentId ?? null,
      input.mimeType ?? null,
      input.fileSize ?? null,
      now
    );
    const row = await db.getFirstAsync<AiMessageAttachmentRecord>('SELECT * FROM ai_message_attachments WHERE id = ?', input.id);
    if (!row) {
      throw new Error(`AI message attachment ${input.id} was created but could not be reloaded.`);
    }
    return row;
  },

  async listMessageAttachments(db: SQLiteDatabase, messageId: string): Promise<AiMessageAttachmentRecord[]> {
    return db.getAllAsync<AiMessageAttachmentRecord>(
      `SELECT * FROM ai_message_attachments
       WHERE messageId = ?
       ORDER BY createdAt ASC`,
      messageId
    );
  },

  async listAttachmentsForMessages(db: SQLiteDatabase, messageIds: string[]): Promise<Record<string, AiMessageAttachmentRecord[]>> {
    if (messageIds.length === 0) {
      return {};
    }
    const rows: AiMessageAttachmentRecord[] = [];
    for (let index = 0; index < messageIds.length; index += MESSAGE_LOOKUP_CHUNK_SIZE) {
      const chunk = messageIds.slice(index, index + MESSAGE_LOOKUP_CHUNK_SIZE);
      rows.push(
        ...(await db.getAllAsync<AiMessageAttachmentRecord>(
          `SELECT * FROM ai_message_attachments WHERE messageId IN (${makeInClause(chunk)}) ORDER BY createdAt ASC`,
          ...chunk
        ))
      );
    }
    const result: Record<string, AiMessageAttachmentRecord[]> = {};
    for (const row of rows) {
      const list = result[row.messageId];
      if (list) {
        list.push(row);
      } else {
        result[row.messageId] = [row];
      }
    }
    return result;
  },

  async createContinuityImportSession(
    db: SQLiteDatabase,
    input: CreateAiContinuityImportSessionInput
  ): Promise<AiContinuityImportSessionRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_continuity_import_sessions (
        id,
        threadId,
        space,
        sourceKind,
        sourcePlatform,
        formatVersion,
        status,
        rollbackState,
        rollbackRoundsRemaining,
        reviewGateState,
        preImportBranchRootMessageId,
        preImportBranchVersionIndex,
        importedBranchRootMessageId,
        importedBranchVersionIndex,
        importAnchorMessageId,
        importAnchorMessageRole,
        importBranchRootKind,
        rawDocumentText,
        rawDocumentHash,
        parsedMessageCount,
        containsCompressedContinuity,
        remoteModelConsent,
        memoryReviewStatus,
        memoryReviewError,
        createdAt,
        updatedAt,
        rolledBackAt,
        stabilizedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.threadId,
      input.space,
      input.sourceKind,
      input.sourcePlatform ?? null,
      input.formatVersion ?? null,
      input.status,
      input.rollbackState,
      input.rollbackRoundsRemaining ?? 10,
      input.reviewGateState,
      input.preImportBranchRootMessageId ?? null,
      input.preImportBranchVersionIndex ?? null,
      input.importedBranchRootMessageId ?? null,
      input.importedBranchVersionIndex ?? null,
      input.importAnchorMessageId ?? null,
      input.importAnchorMessageRole ?? null,
      input.importBranchRootKind ?? null,
      input.rawDocumentText,
      input.rawDocumentHash,
      input.parsedMessageCount ?? 0,
      booleanToSqlite(input.containsCompressedContinuity ?? false),
      booleanToSqlite(input.remoteModelConsent ?? false),
      input.memoryReviewStatus ?? null,
      input.memoryReviewError ?? null,
      now,
      now,
      input.rolledBackAt ?? null,
      input.stabilizedAt ?? null
    );
    const row = await db.getFirstAsync<AiContinuityImportSessionRecord>(
      'SELECT * FROM ai_continuity_import_sessions WHERE id = ?',
      input.id
    );
    if (!row) {
      throw new Error(`AI continuity import session ${input.id} was created but could not be reloaded.`);
    }
    return row;
  },

  async createContinuityImportBlocks(
    db: SQLiteDatabase,
    importSessionId: string,
    blocks: CreateAiContinuityImportBlockInput[]
  ): Promise<AiContinuityImportBlockRecord[]> {
    if (blocks.length === 0) {
      return [];
    }
    for (const block of blocks) {
      await db.runAsync(
        `INSERT INTO ai_continuity_import_blocks (
          id,
          importSessionId,
          kind,
          title,
          content,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        block.id,
        importSessionId,
        block.kind,
        block.title,
        block.content,
        block.createdAt ?? createTimestamp()
      );
    }
    return aiThreadRepository.listContinuityImportBlocksBySessionId(db, importSessionId);
  },

  async listContinuityImportEffectsBySessionId(
    db: SQLiteDatabase,
    importSessionId: string
  ): Promise<AiContinuityImportEffectRecord[]> {
    return db.getAllAsync<AiContinuityImportEffectRecord>(
      `SELECT * FROM ai_continuity_import_effects
       WHERE importSessionId = ?
       ORDER BY effectOrder ASC, createdAt ASC, id ASC`,
      importSessionId
    );
  },

  async createContinuityImportEffect(
    db: SQLiteDatabase,
    input: CreateAiContinuityImportEffectInput
  ): Promise<AiContinuityImportEffectRecord> {
    const now = input.createdAt ?? createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_continuity_import_effects (
        id,
        importSessionId,
        effectOrder,
        effectType,
        targetRecordId,
        beforeStateJson,
        afterStateJson,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.importSessionId,
      input.effectOrder,
      input.effectType,
      input.targetRecordId ?? null,
      input.beforeStateJson ?? null,
      input.afterStateJson ?? null,
      now
    );
    const row = await db.getFirstAsync<AiContinuityImportEffectRecord>(
      'SELECT * FROM ai_continuity_import_effects WHERE id = ?',
      input.id
    );
    if (!row) {
      throw new Error(`AI continuity import effect ${input.id} was created but could not be reloaded.`);
    }
    return row;
  },

  async recordContinuityImportMemoryEffect(
    db: SQLiteDatabase,
    input: {
      id: string;
      importSessionId: string;
      effectType: 'memory_create' | 'memory_update' | 'memory_stale' | 'memory_keep';
      targetRecordId?: string | null;
      before: AiMemoryRecord | null;
      after: AiMemoryRecord | null;
    }
  ): Promise<AiContinuityImportEffectRecord> {
    const orderRow = await db.getFirstAsync<{ nextOrder: number | null }>(
      `SELECT COALESCE(MAX(effectOrder), 0) + 1 AS nextOrder
       FROM ai_continuity_import_effects
       WHERE importSessionId = ?`,
      input.importSessionId
    );
    return aiThreadRepository.createContinuityImportEffect(db, {
      id: input.id,
      importSessionId: input.importSessionId,
      effectOrder: orderRow?.nextOrder ?? 1,
      effectType: input.effectType,
      targetRecordId: input.targetRecordId ?? input.after?.id ?? input.before?.id ?? null,
      beforeStateJson: input.before ? JSON.stringify(input.before) : null,
      afterStateJson: input.after ? JSON.stringify(input.after) : null,
    });
  },

  async recordContinuityImportProfileEffect(
    db: SQLiteDatabase,
    input: {
      id: string;
      importSessionId: string;
      before: AiUserProfileRecord | null;
      after: AiUserProfileRecord | null;
    }
  ): Promise<AiContinuityImportEffectRecord> {
    const orderRow = await db.getFirstAsync<{ nextOrder: number | null }>(
      `SELECT COALESCE(MAX(effectOrder), 0) + 1 AS nextOrder
       FROM ai_continuity_import_effects
       WHERE importSessionId = ?`,
      input.importSessionId
    );
    return aiThreadRepository.createContinuityImportEffect(db, {
      id: input.id,
      importSessionId: input.importSessionId,
      effectOrder: orderRow?.nextOrder ?? 1,
      effectType: 'profile_upsert',
      targetRecordId: input.after?.id ?? input.before?.id ?? null,
      beforeStateJson: input.before ? JSON.stringify(input.before) : null,
      afterStateJson: input.after ? JSON.stringify(input.after) : null,
    });
  },

  async updateContinuityImportSession(
    db: SQLiteDatabase,
    importSessionId: string,
    patch: Partial<
      Pick<
        CreateAiContinuityImportSessionInput,
        | 'status'
        | 'importedBranchRootMessageId'
        | 'importedBranchVersionIndex'
        | 'importAnchorMessageId'
        | 'importAnchorMessageRole'
        | 'importBranchRootKind'
        | 'memoryReviewStatus'
        | 'memoryReviewError'
        | 'rolledBackAt'
        | 'stabilizedAt'
      >
    >
  ): Promise<AiContinuityImportSessionRecord | null> {
    const updates = buildUpdateStatement({
      status: patch.status,
      importedBranchRootMessageId: patch.importedBranchRootMessageId,
      importedBranchVersionIndex: patch.importedBranchVersionIndex,
      importAnchorMessageId: patch.importAnchorMessageId,
      importAnchorMessageRole: patch.importAnchorMessageRole,
      importBranchRootKind: patch.importBranchRootKind,
      memoryReviewStatus: patch.memoryReviewStatus,
      memoryReviewError: patch.memoryReviewError,
      rolledBackAt: patch.rolledBackAt,
      stabilizedAt: patch.stabilizedAt,
      updatedAt: createTimestamp(),
    });
    await db.runAsync(
      `UPDATE ai_continuity_import_sessions
       SET ${updates.setClause}
       WHERE id = ?`,
      ...updates.values,
      importSessionId
    );
    return aiThreadRepository.findContinuityImportSessionById(db, importSessionId);
  },

  async listContinuityImportBlocksBySessionId(
    db: SQLiteDatabase,
    importSessionId: string
  ): Promise<AiContinuityImportBlockRecord[]> {
    return db.getAllAsync<AiContinuityImportBlockRecord>(
      `SELECT * FROM ai_continuity_import_blocks
       WHERE importSessionId = ?
       ORDER BY createdAt ASC`,
      importSessionId
    );
  },

  async listContinuityImportMessagesBySessionId(
    db: SQLiteDatabase,
    importSessionId: string
  ): Promise<AiMessageRecord[]> {
    return db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM ai_messages
       WHERE continuityImportSessionId = ?
       ORDER BY createdAt ASC, id ASC`,
      importSessionId
    );
  },

  async createSyntheticContinuityImportRoot(
    db: SQLiteDatabase,
    input: CreateSyntheticContinuityImportRootInput
  ): Promise<AiMessageRecord> {
    return aiThreadRepository.createMessage(db, {
      id: input.id,
      threadId: input.threadId,
      role: 'system',
      status: 'completed',
      content: '已接回外部对话',
      branchRootMessageId: null,
      branchVersionIndex: null,
      continuityImportSessionId: input.importSessionId,
      continuitySyntheticKind: 'continuity_import_root',
      completedAt: input.createdAt,
    });
  },

  async createContinuityImportMessage(
    db: SQLiteDatabase,
    input: CreateContinuityImportMessageInput
  ): Promise<AiMessageRecord> {
    return aiThreadRepository.createMessage(db, {
      id: input.id,
      threadId: input.threadId,
      role: input.role,
      status: input.status,
      content: input.content,
      branchRootMessageId: input.branchRootMessageId,
      branchVersionIndex: input.branchVersionIndex,
      continuityImportSessionId: input.continuityImportSessionId,
      continuitySyntheticKind: input.continuitySyntheticKind ?? null,
      completedAt: input.completedAt ?? null,
    });
  },

  async listThreadContinuityMilestones(
    db: SQLiteDatabase,
    threadId: string
  ): Promise<AiThreadContinuityMilestoneRecord[]> {
    return db.getAllAsync<AiThreadContinuityMilestoneRecord>(
      `SELECT
         id AS importSessionId,
         importedBranchRootMessageId AS branchRootMessageId,
         rollbackState,
         rollbackRoundsRemaining,
         sourceKind,
         sourcePlatform,
         parsedMessageCount,
         containsCompressedContinuity,
         reviewGateState,
         memoryReviewStatus,
         createdAt
       FROM ai_continuity_import_sessions
       WHERE threadId = ?
         AND importedBranchRootMessageId IS NOT NULL
         AND reviewGateState <> 'rolled_back'
       ORDER BY createdAt ASC`,
      threadId
    );
  },

  async loadContinuityImportReviewGateState(
    db: SQLiteDatabase,
    threadId: string,
    branchScopes?: AiBranchScope[]
  ): Promise<AiContinuityImportReviewGateState | null> {
    const importSessionId = await aiThreadRepository.resolveContinuityImportSessionIdForBranchScopes(
      db,
      threadId,
      branchScopes
    );
    if (!importSessionId) {
      return null;
    }
    const row = await db.getFirstAsync<{ reviewGateState: AiContinuityImportReviewGateState }>(
      `SELECT reviewGateState
       FROM ai_continuity_import_sessions
       WHERE id = ?
       LIMIT 1`,
      importSessionId
    );
    return row?.reviewGateState ?? null;
  },

  async markContinuityImportReviewAccepted(
    db: SQLiteDatabase,
    importSessionId: string
  ): Promise<void> {
    await db.runAsync(
      `UPDATE ai_continuity_import_sessions
       SET reviewGateState = 'accepted',
           memoryReviewStatus = 'accepted',
           updatedAt = ?
       WHERE id = ? AND reviewGateState <> 'rolled_back'`,
      createTimestamp(),
      importSessionId
    );
  },

  async markContinuityImportReviewFailed(
    db: SQLiteDatabase,
    importSessionId: string,
    errorMessage: string
  ): Promise<void> {
    await db.runAsync(
      `UPDATE ai_continuity_import_sessions
       SET reviewGateState = 'failed',
           memoryReviewStatus = 'failed',
           memoryReviewError = ?,
           updatedAt = ?
       WHERE id = ? AND reviewGateState <> 'rolled_back'`,
      errorMessage,
      createTimestamp(),
      importSessionId
    );
  },

  async findContinuityImportSessionById(
    db: SQLiteDatabase,
    importSessionId: string
  ): Promise<AiContinuityImportSessionRecord | null> {
    return db.getFirstAsync<AiContinuityImportSessionRecord>(
      'SELECT * FROM ai_continuity_import_sessions WHERE id = ?',
      importSessionId
    );
  },

  async findActiveContinuityImportSessionIdForBranch(
    db: SQLiteDatabase,
    threadId: string,
    assistantMessageId: string
  ): Promise<string | null> {
    const row = await db.getFirstAsync<{ continuityImportSessionId: string | null }>(
      `SELECT ai_continuity_import_sessions.id AS continuityImportSessionId
       FROM ai_messages
       JOIN ai_continuity_import_sessions
         ON ai_continuity_import_sessions.importedBranchRootMessageId = ai_messages.branchRootMessageId
       WHERE ai_messages.id = ?
         AND ai_messages.threadId = ?
         AND ai_continuity_import_sessions.threadId = ?
         AND ai_continuity_import_sessions.rollbackState = 'available'
         AND ai_continuity_import_sessions.reviewGateState <> 'rolled_back'
       LIMIT 1`,
      assistantMessageId,
      threadId,
      threadId
    );
    return row?.continuityImportSessionId ?? null;
  },

  async resolveContinuityImportSessionIdForBranchScopes(
    db: SQLiteDatabase,
    threadId: string,
    branchScopes?: AiBranchScope[]
  ): Promise<string | null> {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    const scopeClause = buildContinuityImportSessionBranchScopeClause(
      'ai_continuity_import_sessions',
      thread?.currentBranchRootMessageId ?? null,
      branchScopes
    );
    const row = await db.getFirstAsync<{ continuityImportSessionId: string | null }>(
      `SELECT ai_continuity_import_sessions.id AS continuityImportSessionId
       FROM ai_continuity_import_sessions
       WHERE ai_continuity_import_sessions.threadId = ?
         AND ai_continuity_import_sessions.importedBranchRootMessageId IS NOT NULL
         ${scopeClause.clause}
       ORDER BY ai_continuity_import_sessions.createdAt DESC
       LIMIT 1`,
      threadId,
      ...scopeClause.values
    );
    return row?.continuityImportSessionId ?? null;
  },

  async decrementContinuityRollbackRoundsRemaining(
    db: SQLiteDatabase,
    importSessionId: string
  ): Promise<AiContinuityImportSessionRecord | null> {
    await db.runAsync(
      `UPDATE ai_continuity_import_sessions
       SET rollbackRoundsRemaining = CASE
             WHEN rollbackRoundsRemaining > 0 THEN rollbackRoundsRemaining - 1
             ELSE rollbackRoundsRemaining
           END,
           updatedAt = ?
       WHERE id = ?
         AND rollbackState = 'available'`,
      createTimestamp(),
      importSessionId
    );
    return aiThreadRepository.findContinuityImportSessionById(db, importSessionId);
  },

  async setContinuityImportRollbackState(
    db: SQLiteDatabase,
    input: {
      importSessionId: string;
      rollbackState: AiContinuityImportRollbackState;
      reviewGateState?: AiContinuityImportReviewGateState;
      rollbackRoundsRemaining?: number;
      rolledBackAt?: string | null;
      stabilizedAt?: string | null;
    }
  ): Promise<AiContinuityImportSessionRecord | null> {
    const updates = buildUpdateStatement({
      rollbackState: input.rollbackState,
      reviewGateState: input.reviewGateState,
      rollbackRoundsRemaining: input.rollbackRoundsRemaining,
      rolledBackAt: input.rolledBackAt,
      stabilizedAt: input.stabilizedAt,
      updatedAt: createTimestamp(),
    });
    await db.runAsync(
      `UPDATE ai_continuity_import_sessions
       SET ${updates.setClause}
       WHERE id = ?`,
      ...updates.values,
      input.importSessionId
    );
    return aiThreadRepository.findContinuityImportSessionById(db, input.importSessionId);
  },

  async stabilizeContinuityImportSession(
    db: SQLiteDatabase,
    importSessionId: string,
    stabilizedAt: string
  ): Promise<AiContinuityImportSessionRecord | null> {
    return aiThreadRepository.setContinuityImportRollbackState(db, {
      importSessionId,
      rollbackState: 'locked',
      rollbackRoundsRemaining: 0,
      stabilizedAt,
    });
  },

  async markContinuityImportRolledBack(
    db: SQLiteDatabase,
    importSessionId: string,
    rolledBackAt: string
  ): Promise<AiContinuityImportSessionRecord | null> {
    return aiThreadRepository.setContinuityImportRollbackState(db, {
      importSessionId,
      rollbackState: 'rolled_back',
      reviewGateState: 'rolled_back',
      rolledBackAt,
    });
  },

  async rollbackContinuityImportAcceptedEffects(
    db: SQLiteDatabase,
    importSessionId: string
  ): Promise<void> {
    const effects = await aiThreadRepository.listContinuityImportEffectsBySessionId(db, importSessionId);
    for (const effect of [...effects].reverse()) {
      if (effect.effectType === 'profile_upsert') {
        const before = effect.beforeStateJson
          ? JSON.parse(effect.beforeStateJson) as AiUserProfileRecord
          : null;
        const after = effect.afterStateJson
          ? JSON.parse(effect.afterStateJson) as AiUserProfileRecord
          : null;
        const targetId = after?.id ?? before?.id ?? effect.targetRecordId ?? null;
        if (!before) {
          if (targetId) {
            await db.runAsync('DELETE FROM ai_user_profiles WHERE id = ?', targetId);
          }
          continue;
        }
        if (targetId && targetId !== before.id) {
          await db.runAsync('DELETE FROM ai_user_profiles WHERE id = ?', targetId);
        }
        await db.runAsync(
          `INSERT INTO ai_user_profiles (
             id, space, boundIpId, boundThreadId, profileJson, profileText, version, sourceThreadId, sourceStartMessageId,
             sourceEndMessageId, messageCountAtUpdate, lastUpdatedAt, createdAt, updatedAt
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             space = excluded.space,
             boundIpId = excluded.boundIpId,
             boundThreadId = excluded.boundThreadId,
             profileJson = excluded.profileJson,
             profileText = excluded.profileText,
             version = excluded.version,
             sourceThreadId = excluded.sourceThreadId,
             sourceStartMessageId = excluded.sourceStartMessageId,
             sourceEndMessageId = excluded.sourceEndMessageId,
             messageCountAtUpdate = excluded.messageCountAtUpdate,
             lastUpdatedAt = excluded.lastUpdatedAt,
             createdAt = excluded.createdAt,
             updatedAt = excluded.updatedAt`,
          before.id,
          before.space,
          before.boundIpId,
          before.boundThreadId,
          before.profileJson,
          before.profileText,
          before.version,
          before.sourceThreadId,
          before.sourceStartMessageId,
          before.sourceEndMessageId,
          before.messageCountAtUpdate,
          before.lastUpdatedAt,
          before.createdAt,
          before.updatedAt
        );
        continue;
      }
      const before = effect.beforeStateJson
        ? JSON.parse(effect.beforeStateJson) as AiMemoryRecord
        : null;
      const after = effect.afterStateJson
        ? JSON.parse(effect.afterStateJson) as AiMemoryRecord
        : null;
      const targetId = after?.id ?? before?.id ?? effect.targetRecordId ?? null;
      if (!before) {
        if (targetId) {
          await db.runAsync('DELETE FROM ai_memories WHERE id = ?', targetId);
          await db.runAsync('DELETE FROM ai_memory_fts WHERE id = ?', targetId);
        }
        continue;
      }
      if (targetId && targetId !== before.id) {
        await db.runAsync('DELETE FROM ai_memories WHERE id = ?', targetId);
        await db.runAsync('DELETE FROM ai_memory_fts WHERE id = ?', targetId);
      }
      await db.runAsync(
        `INSERT INTO ai_memories (
           id, space, scope, scopeId, type, content, normalizedContent, sourceMessageId,
           confidence, importance, status, lastUsedAt, createdAt, updatedAt, deletedAt,
           ipId, groupId, imageAssetId, assetSnapshotJson, sourceKind,
           supersededByMemoryId, mergeReason, mergedAt, lastReconciledAt, reconcileSourceMessageId
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           space = excluded.space,
           scope = excluded.scope,
           scopeId = excluded.scopeId,
           type = excluded.type,
           content = excluded.content,
           normalizedContent = excluded.normalizedContent,
           sourceMessageId = excluded.sourceMessageId,
           confidence = excluded.confidence,
           importance = excluded.importance,
           status = excluded.status,
           lastUsedAt = excluded.lastUsedAt,
           createdAt = excluded.createdAt,
           updatedAt = excluded.updatedAt,
           deletedAt = excluded.deletedAt,
           ipId = excluded.ipId,
           groupId = excluded.groupId,
           imageAssetId = excluded.imageAssetId,
           assetSnapshotJson = excluded.assetSnapshotJson,
           sourceKind = excluded.sourceKind,
           supersededByMemoryId = excluded.supersededByMemoryId,
           mergeReason = excluded.mergeReason,
           mergedAt = excluded.mergedAt,
           lastReconciledAt = excluded.lastReconciledAt,
           reconcileSourceMessageId = excluded.reconcileSourceMessageId`,
        before.id,
        before.space,
        before.scope,
        before.scopeId,
        before.type,
        before.content,
        before.normalizedContent,
        before.sourceMessageId,
        before.confidence,
        before.importance,
        before.status,
        before.lastUsedAt,
        before.createdAt,
        before.updatedAt,
        before.deletedAt,
        before.ipId,
        before.groupId,
        before.imageAssetId,
        before.assetSnapshotJson,
        before.sourceKind,
        before.supersededByMemoryId,
        before.mergeReason,
        before.mergedAt,
        before.lastReconciledAt,
        before.reconcileSourceMessageId
      );
      const restored = await db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ?', before.id);
      if (restored) {
        await aiThreadRepository.syncMemoryFts(db, restored);
      }
    }
  },

  async createReversibleContinuitySummarySegment(
    db: SQLiteDatabase,
    input: Omit<AiThreadSummarySegmentRecord, 'createdAt' | 'updatedAt'>
  ): Promise<AiThreadSummarySegmentRecord> {
    return aiThreadRepository.createSummarySegment(db, {
      ...input,
      continuityImportSessionId: input.continuityImportSessionId ?? null,
    });
  },

  async updateMessageWherePromptSnapshotJsonContains(
    db: SQLiteDatabase,
    messageId: string,
    promptSnapshotNeedle: string,
    patch: UpdateAiMessagePatch,
    options?: { syncFts?: boolean }
  ): Promise<AiMessageRecord | null> {
    const updates = buildUpdateStatement({
      status: patch.status,
      branchRootMessageId: patch.branchRootMessageId,
      branchVersionIndex: patch.branchVersionIndex,
      content: patch.content,
      reasoningText: patch.reasoningText,
      errorMessage: normalizeOptionalText(patch.errorMessage),
      providerId: patch.providerId,
      modelId: patch.modelId,
      modelSnapshotJson: patch.modelSnapshotJson,
      promptSnapshotJson: patch.promptSnapshotJson,
      continuityImportSessionId: patch.continuityImportSessionId,
      continuitySyntheticKind: patch.continuitySyntheticKind,
      createdAt: patch.createdAt,
      completedAt: patch.completedAt,
      updatedAt: createTimestamp(),
    });
    if (!updates.setClause) {
      const current = await db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ? AND instr(promptSnapshotJson, ?) > 0', messageId, promptSnapshotNeedle);
      return current ?? null;
    }
    await db.runAsync(
      `UPDATE ai_messages SET ${updates.setClause} WHERE id = ? AND instr(promptSnapshotJson, ?) > 0`,
      ...updates.values,
      messageId,
      promptSnapshotNeedle
    );
    const message = await db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ? AND instr(promptSnapshotJson, ?) > 0', messageId, promptSnapshotNeedle);
    if (message && options?.syncFts !== false) {
      await aiThreadRepository.syncMessageFts(db, message);
    }
    return message ?? null;
  },

  async favoriteAssistantMessage(db: SQLiteDatabase, input: AiFavoriteAssistantMessageInput): Promise<AiMessageFavoriteRecord> {
    const message = await aiThreadRepository.findMessageById(db, input.messageId);
    if (!message || message.threadId !== input.threadId) {
      throw new Error('AI message was not found.');
    }
    if (message.role !== 'assistant') {
      throw new Error('Only assistant messages can be favorited.');
    }
    const now = createTimestamp();
    const primaryScope = getPrimaryFavoriteBranchScope(input.branchScopes);
    const favoriteKey = buildAiMessageFavoriteKey(input);
    const branchScopesJson = stableFavoriteBranchScopesJson(input.branchScopes);
    await db.runAsync(
      `INSERT INTO ai_message_favorites (
        id, space, threadId, messageId, favoriteKey, branchRootMessageId, branchVersionIndex,
        branchScopesJson, messageVersionIndex, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(favoriteKey) DO UPDATE SET updatedAt = excluded.updatedAt`,
      `ai-favorite-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      input.space,
      input.threadId,
      input.messageId,
      favoriteKey,
      primaryScope?.branchRootMessageId ?? null,
      primaryScope?.branchVersionIndex ?? null,
      branchScopesJson,
      input.messageVersionIndex ?? null,
      now,
      now
    );
    const row = await db.getFirstAsync<AiMessageFavoriteRecord>('SELECT * FROM ai_message_favorites WHERE favoriteKey = ?', favoriteKey);
    if (!row) {
      throw new Error('AI message favorite was saved but could not be reloaded.');
    }
    return row;
  },

  async unfavoriteAssistantMessage(db: SQLiteDatabase, input: AiFavoriteAssistantMessageInput): Promise<void> {
    await db.runAsync('DELETE FROM ai_message_favorites WHERE favoriteKey = ?', buildAiMessageFavoriteKey(input));
  },

  async findFavoriteAssistantMessageState(db: SQLiteDatabase, input: AiFavoriteAssistantMessageInput): Promise<AiMessageFavoriteRecord | null> {
    return db.getFirstAsync<AiMessageFavoriteRecord>(
      'SELECT * FROM ai_message_favorites WHERE favoriteKey = ?',
      buildAiMessageFavoriteKey(input)
    );
  },

  async listFavoriteAssistantMessageKeys(db: SQLiteDatabase, input: { space: PixorySpace; favoriteKeys: string[] }): Promise<Set<string>> {
    const uniqueKeys = [...new Set(input.favoriteKeys.filter((key) => key.length > 0))];
    if (uniqueKeys.length === 0) {
      return new Set();
    }
    const rows: Array<{ favoriteKey: string }> = [];
    for (let index = 0; index < uniqueKeys.length; index += MESSAGE_LOOKUP_CHUNK_SIZE) {
      const chunk = uniqueKeys.slice(index, index + MESSAGE_LOOKUP_CHUNK_SIZE);
      rows.push(
        ...(await db.getAllAsync<{ favoriteKey: string }>(
          `SELECT favoriteKey FROM ai_message_favorites
           WHERE space = ?
             AND favoriteKey IN (${makeInClause(chunk)})`,
          input.space,
          ...chunk
        ))
      );
    }
    return new Set(rows.map((row) => row.favoriteKey));
  },

  async listFavoriteAssistantMessages(
    db: SQLiteDatabase,
    input: { space: PixorySpace; limit?: number; offset?: number }
  ): Promise<AiMessageFavoriteListItem[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 80, 200));
    const offset = Math.max(0, input.offset ?? 0);
    const rows = await db.getAllAsync<AiMessageFavoriteRecord & {
      threadTitle: string;
      contextType: AiContextType;
      boundIpId: number | null;
      boundKnowledgeBaseId: string | null;
      includeIpDocuments: number;
      messageContent: string;
      messageCreatedAt: string;
      messageUpdatedAt: string;
      versionTotal: number;
    }>(
      `SELECT
         ai_message_favorites.*,
         ai_threads.title AS threadTitle,
         ai_threads.contextType,
         ai_threads.boundIpId,
         ai_threads.boundKnowledgeBaseId,
         ai_threads.includeIpDocuments,
         CASE
           WHEN ai_message_versions.id IS NOT NULL THEN ai_message_versions.content
           WHEN ai_message_favorites.messageVersionIndex IS NULL THEN ai_messages.content
           WHEN ai_message_favorites.messageVersionIndex = COALESCE(version_counts.versionTotal, 1) THEN ai_messages.content
           ELSE ''
         END AS messageContent,
         CASE
           WHEN ai_message_versions.id IS NOT NULL THEN ai_message_versions.messageCreatedAt
           ELSE ai_messages.createdAt
         END AS messageCreatedAt,
         CASE
           WHEN ai_message_versions.id IS NOT NULL THEN ai_message_versions.messageUpdatedAt
           ELSE ai_messages.updatedAt
         END AS messageUpdatedAt,
         COALESCE(version_counts.versionTotal, 1) AS versionTotal
       FROM ai_message_favorites
       JOIN ai_threads ON ai_threads.id = ai_message_favorites.threadId
       JOIN ai_messages ON ai_messages.id = ai_message_favorites.messageId
       LEFT JOIN ai_message_versions
         ON ai_message_versions.originalMessageId = ai_message_favorites.messageId
        AND ai_message_versions.versionIndex = ai_message_favorites.messageVersionIndex
       LEFT JOIN (
         SELECT originalMessageId, COUNT(*) + 1 AS versionTotal
         FROM ai_message_versions
         GROUP BY originalMessageId
       ) version_counts ON version_counts.originalMessageId = ai_message_favorites.messageId
       WHERE ai_message_favorites.space = ?
         AND ai_messages.role = 'assistant'
         AND (
           ai_message_favorites.messageVersionIndex IS NULL
           OR ai_message_versions.id IS NOT NULL
           OR ai_message_favorites.messageVersionIndex = COALESCE(version_counts.versionTotal, 1)
         )
       ORDER BY ai_message_favorites.createdAt DESC, ai_message_favorites.id DESC
       LIMIT ? OFFSET ?`,
      input.space,
      limit,
      offset
    );
    return rows.map((row) => ({
      ...row,
      includeIpDocuments: sqliteToBoolean(row.includeIpDocuments),
    }));
  },

  async deleteMessagesByIds(db: SQLiteDatabase, messageIds: string[]): Promise<number> {
    let deletedCount = 0;
    for (let index = 0; index < messageIds.length; index += DELETE_MESSAGE_CHUNK_SIZE) {
      const chunk = messageIds.slice(index, index + DELETE_MESSAGE_CHUNK_SIZE);
      await db.runAsync(`DELETE FROM ai_message_fts WHERE id IN (${makeInClause(chunk)})`, ...chunk);
      const result = await db.runAsync(`DELETE FROM ai_messages WHERE id IN (${makeInClause(chunk)})`, ...chunk);
      deletedCount += result.changes;
    }
    return deletedCount;
  },

  async markVisibleMessagesAfterAsBranch(
    db: SQLiteDatabase,
    threadId: string,
    afterMessageId: string,
    branchRootMessageId: string,
    branchVersionIndex: number,
    parentMessage: Pick<AiMessageRecord, 'branchRootMessageId' | 'branchVersionIndex'>
  ): Promise<number> {
    const now = createTimestamp();
    const sameBranchClause = parentMessage.branchRootMessageId && parentMessage.branchVersionIndex
      ? 'candidate.branchRootMessageId = ? AND candidate.branchVersionIndex = ?'
      : 'candidate.branchRootMessageId IS NULL';
    const sameBranchValues = parentMessage.branchRootMessageId && parentMessage.branchVersionIndex
      ? [parentMessage.branchRootMessageId, parentMessage.branchVersionIndex]
      : [];
    const result = await db.runAsync(
      `UPDATE ai_messages
       SET branchRootMessageId = ?,
           branchVersionIndex = ?,
           updatedAt = ?
       WHERE id IN (
         SELECT candidate.id
         FROM ai_messages target
          JOIN ai_messages candidate ON candidate.threadId = target.threadId
          WHERE target.id = ?
            AND target.threadId = ?
            AND ${sameBranchClause}
            AND (
              candidate.createdAt > target.createdAt
              OR (candidate.createdAt = target.createdAt AND candidate.rowid > target.rowid)
           )
       )`,
      branchRootMessageId,
      branchVersionIndex,
      now,
      afterMessageId,
      threadId,
      ...sameBranchValues
    );
    return result.changes;
  },

  async syncMessageFts(db: SQLiteDatabase, message: AiMessageRecord): Promise<void> {
    await db.runAsync('DELETE FROM ai_message_fts WHERE id = ?', message.id);
    if (message.status !== 'completed' || message.role === 'system' || !message.content.trim()) {
      return;
    }
    await db.runAsync(
      'INSERT INTO ai_message_fts (id, threadId, role, content, updatedAt) VALUES (?, ?, ?, ?, ?)',
      message.id,
      message.threadId,
      message.role,
      message.content,
      message.updatedAt
    );
  },

  async syncMessageVersionFts(db: SQLiteDatabase, version: AiMessageVersionRecord): Promise<void> {
    await db.runAsync('DELETE FROM ai_message_version_fts WHERE id = ?', version.id);
    if (version.status !== 'completed' || version.role === 'system' || !version.content.trim()) {
      return;
    }
    await db.runAsync(
      'INSERT INTO ai_message_version_fts (id, originalMessageId, threadId, role, content, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      version.id,
      version.originalMessageId,
      version.threadId,
      version.role,
      version.content,
      version.messageUpdatedAt
    );
  },

  async searchVersionedCompletedMessages(db: SQLiteDatabase, input: { threadId: string; ftsQuery: string; rawQuery: string; excludeIds?: string[]; limit: number; branchScopes?: AiBranchScope[] }): Promise<AiMessageRecord[]> {
    const branchVersionClause = buildBranchVersionSearchClause(input.branchScopes);
    if (!branchVersionClause || input.limit <= 0) {
      return [];
    }
    const excludeIds = input.excludeIds ?? [];
    const excludeClause = excludeIds.length > 0 ? `AND ai_messages.id NOT IN (${makeInClause(excludeIds)})` : '';
    const fallbackTerms = buildSearchTerms(input.rawQuery).slice(0, 8);
    const fallbackClause = fallbackTerms.length > 0
      ? `AND (${fallbackTerms.map(() => 'ai_message_versions.content LIKE ?').join(' OR ')})`
      : 'AND ai_message_versions.content LIKE ?';
    const fallbackValues = fallbackTerms.length > 0 ? fallbackTerms.map((term) => `%${term}%`) : [`%${input.rawQuery.trim()}%`];
    const fallbackSearch = async () => {
      const rows = await db.getAllAsync<AiMessageRecord>(
        `SELECT ai_messages.*
         FROM ai_message_versions
         JOIN ai_messages ON ai_messages.id = ai_message_versions.originalMessageId
         WHERE ai_message_versions.threadId = ?
           AND ai_message_versions.status = 'completed'
           AND ai_message_versions.role <> 'system'
           AND (${branchVersionClause.clause})
           ${fallbackClause}
           ${excludeClause}
         ORDER BY ai_message_versions.messageUpdatedAt DESC
         LIMIT ?`,
        input.threadId,
        ...branchVersionClause.values,
        ...fallbackValues,
        ...excludeIds,
        input.limit
      );
      return materializeMessagesForBranchScopes(db, rows, input.branchScopes);
    };
    try {
      const rows = await db.getAllAsync<AiMessageRecord>(
        `SELECT ai_messages.*
         FROM ai_message_version_fts
         JOIN ai_message_versions ON ai_message_versions.id = ai_message_version_fts.id
         JOIN ai_messages ON ai_messages.id = ai_message_versions.originalMessageId
         WHERE ai_message_version_fts MATCH ?
           AND ai_message_versions.threadId = ?
           AND ai_message_versions.status = 'completed'
           AND ai_message_versions.role <> 'system'
           AND (${branchVersionClause.clause})
           ${excludeClause}
         ORDER BY bm25(ai_message_version_fts), ai_message_versions.messageUpdatedAt DESC
         LIMIT ?`,
        input.ftsQuery,
        input.threadId,
        ...branchVersionClause.values,
        ...excludeIds,
        input.limit
      );
      return rows.length > 0 ? materializeMessagesForBranchScopes(db, rows, input.branchScopes) : fallbackSearch();
    } catch {
      return fallbackSearch();
    }
  },

  async searchCompletedMessageFts(db: SQLiteDatabase, input: { threadId: string; query: string; excludeIds?: string[]; limit: number; branchScopes?: AiBranchScope[] }): Promise<AiMessageRecord[]> {
    const ftsQuery = buildFtsQuery(input.query);
    if (!ftsQuery || input.limit <= 0) {
      return [];
    }
    const excludeIds = input.excludeIds ?? [];
    const excludeClause = excludeIds.length > 0 ? `AND ai_messages.id NOT IN (${makeInClause(excludeIds)})` : '';
    const fallbackExcludeClause = excludeIds.length > 0 ? `AND candidate.id NOT IN (${makeInClause(excludeIds)})` : '';
    const fallbackTerms = buildSearchTerms(input.query).slice(0, 8);
    const fallbackClause = fallbackTerms.length > 0 ? `AND (${fallbackTerms.map(() => 'candidate.content LIKE ?').join(' OR ')})` : 'AND candidate.content LIKE ?';
    const fallbackValues = fallbackTerms.length > 0 ? fallbackTerms.map((term) => `%${term}%`) : [`%${input.query.trim()}%`];
    const visibleBranchClause = buildVisibleBranchClause('ai_messages', input.branchScopes);
    const fallbackVisibleBranchClause = buildVisibleBranchClause('candidate', input.branchScopes);
    const fallbackSearch = async () => {
      const [currentRows, versionRows] = await Promise.all([
        db.getAllAsync<AiMessageRecord>(
          `SELECT candidate.*
           FROM ai_messages candidate
           WHERE candidate.threadId = ?
             AND candidate.status = 'completed'
             AND candidate.role <> 'system'
             ${fallbackClause}
             ${fallbackVisibleBranchClause.clause}
             ${fallbackExcludeClause}
           ORDER BY candidate.updatedAt DESC
           LIMIT ?`,
          input.threadId,
          ...fallbackValues,
          ...fallbackVisibleBranchClause.values,
          ...excludeIds,
          input.limit
        ),
        aiThreadRepository.searchVersionedCompletedMessages(db, {
          branchScopes: input.branchScopes,
          excludeIds,
          ftsQuery,
          limit: input.limit,
          rawQuery: input.query,
          threadId: input.threadId,
        }),
      ]);
      const rows = mergeMessageSearchRows(currentRows, versionRows, input.limit);
      return materializeMessagesForBranchScopes(db, rows, input.branchScopes);
    };
    try {
      const [currentRows, versionRows] = await Promise.all([
        db.getAllAsync<AiMessageRecord>(
          `SELECT ai_messages.*
           FROM ai_message_fts
           JOIN ai_messages ON ai_messages.id = ai_message_fts.id
           WHERE ai_message_fts MATCH ?
              AND ai_messages.threadId = ?
              AND ai_messages.status = 'completed'
              AND ai_messages.role <> 'system'
              ${visibleBranchClause.clause}
              ${excludeClause}
            ORDER BY bm25(ai_message_fts), ai_messages.updatedAt DESC
            LIMIT ?`,
          ftsQuery,
          input.threadId,
          ...visibleBranchClause.values,
          ...excludeIds,
          input.limit
        ),
        aiThreadRepository.searchVersionedCompletedMessages(db, {
          branchScopes: input.branchScopes,
          excludeIds,
          ftsQuery,
          limit: input.limit,
          rawQuery: input.query,
          threadId: input.threadId,
        }),
      ]);
      const rows = mergeMessageSearchRows(currentRows, versionRows, input.limit);
      return rows.length > 0 ? materializeMessagesForBranchScopes(db, rows, input.branchScopes) : fallbackSearch();
    } catch {
      return fallbackSearch();
    }
  },

  async listMessages(db: SQLiteDatabase, threadId: string, limit?: number, branchScopes?: AiBranchScope[]): Promise<AiMessageRecord[]> {
    const visibleBranchClause = buildVisibleBranchClause('ai_messages', branchScopes);
    if (limit && limit > 0) {
      const rows = await db.getAllAsync<AiMessageRecord>(
        `SELECT * FROM (
           SELECT * FROM ai_messages
           WHERE threadId = ?
             ${visibleBranchClause.clause}
             AND ${excludeRolledBackContinuityPayload('ai_messages')}
           ORDER BY createdAt DESC
           LIMIT ?
          )
          ORDER BY createdAt ASC`,
        threadId,
        ...visibleBranchClause.values,
        limit
      );
      return materializeMessagesForBranchScopes(db, rows, branchScopes);
    }
    const rows = await db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM ai_messages
       WHERE threadId = ?
         ${visibleBranchClause.clause}
         AND ${excludeRolledBackContinuityPayload('ai_messages')}
       ORDER BY createdAt ASC`,
      threadId,
      ...visibleBranchClause.values
    );
    return materializeMessagesForBranchScopes(db, rows, branchScopes);
  },

  async listMessagesBase(db: SQLiteDatabase, threadId: string, limit?: number, branchScopes?: AiBranchScope[]): Promise<AiMessageRecord[]> {
    const visibleBranchClause = buildVisibleBranchClause('ai_messages', branchScopes);
    if (limit && limit > 0) {
      return db.getAllAsync<AiMessageRecord>(
        `SELECT * FROM (
           SELECT * FROM ai_messages
           WHERE threadId = ?
             ${visibleBranchClause.clause}
             AND ${excludeRolledBackContinuityPayload('ai_messages')}
           ORDER BY createdAt DESC
           LIMIT ?
          )
          ORDER BY createdAt ASC`,
        threadId,
        ...visibleBranchClause.values,
        limit
      );
    }
    return db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM ai_messages
       WHERE threadId = ?
         ${visibleBranchClause.clause}
         AND ${excludeRolledBackContinuityPayload('ai_messages')}
       ORDER BY createdAt ASC`,
      threadId,
      ...visibleBranchClause.values
    );
  },

  async listMessagesBaseAroundAnchor(db: SQLiteDatabase, threadId: string, anchorMessageId: string, limit: number, branchScopes?: AiBranchScope[]): Promise<AiMessageRecord[]> {
    const visibleBranchClause = buildVisibleBranchClause('ai_messages', branchScopes);
    const latestLimit = Math.max(1, limit);
    const sideLimit = Math.max(1, Math.ceil(limit / 2));
    const anchor = await db.getFirstAsync<AiMessageRecord>(
      `SELECT * FROM ai_messages
       WHERE id = ?
         AND threadId = ?
         AND ${excludeRolledBackContinuityPayload('ai_messages')}
         ${visibleBranchClause.clause}`,
      anchorMessageId,
      threadId,
      ...visibleBranchClause.values
    );
    if (!anchor) {
      return aiThreadRepository.listMessagesBase(db, threadId, latestLimit, branchScopes);
    }
    const [latestRows, beforeRows, afterRows] = await Promise.all([
      aiThreadRepository.listMessagesBase(db, threadId, latestLimit, branchScopes),
      db.getAllAsync<AiMessageRecord>(
        `SELECT * FROM (
           SELECT * FROM ai_messages
           WHERE threadId = ?
             ${visibleBranchClause.clause}
             AND ${excludeRolledBackContinuityPayload('ai_messages')}
             AND (
               createdAt < ?
               OR (createdAt = ? AND id < ?)
             )
           ORDER BY createdAt DESC, id DESC
           LIMIT ?
         )
         ORDER BY createdAt ASC, id ASC`,
        threadId,
        ...visibleBranchClause.values,
        anchor.createdAt,
        anchor.createdAt,
        anchor.id,
        sideLimit
      ),
      db.getAllAsync<AiMessageRecord>(
        `SELECT * FROM ai_messages
         WHERE threadId = ?
           ${visibleBranchClause.clause}
           AND ${excludeRolledBackContinuityPayload('ai_messages')}
           AND (
             createdAt > ?
             OR (createdAt = ? AND id > ?)
           )
         ORDER BY createdAt ASC, id ASC
         LIMIT ?`,
        threadId,
        ...visibleBranchClause.values,
        anchor.createdAt,
        anchor.createdAt,
        anchor.id,
        sideLimit
      ),
    ]);
    const byId = new Map<string, AiMessageRecord>();
    for (const row of [...latestRows, ...beforeRows, anchor, ...afterRows]) {
      byId.set(row.id, row);
    }
    return [...byId.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    );
  },

  async findMessageById(db: SQLiteDatabase, messageId: string): Promise<AiMessageRecord | null> {
    return db.getFirstAsync<AiMessageRecord>('SELECT * FROM ai_messages WHERE id = ?', messageId);
  },

  async findMessagesByIds(db: SQLiteDatabase, messageIds: string[], branchScopes?: AiBranchScope[]): Promise<AiMessageRecord[]> {
    if (messageIds.length === 0) {
      return [];
    }
    const rows = await db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM ai_messages
       WHERE id IN (${makeInClause(messageIds)})
       ORDER BY createdAt ASC, rowid ASC`,
      ...messageIds
    );
    return materializeMessagesForBranchScopes(db, rows, branchScopes);
  },

  async resolveBranchLineage(
    db: SQLiteDatabase,
    branchRootMessageId?: string | null,
    branchVersionIndex?: number | null
  ): Promise<AiBranchScope[]> {
    if (!branchRootMessageId || !branchVersionIndex) {
      return [];
    }
    const rows = await db.getAllAsync<{
      branchRootMessageId: string;
      branchVersionIndex: number;
      cycleDetected: number;
      depth: number;
      depthLimitReached: number;
      missingParentDetected: number;
    }>(
      `WITH RECURSIVE lineage(
         id,
         branchRootMessageId,
         branchVersionIndex,
         parentBranchRootMessageId,
         parentBranchVersionIndex,
         depth,
         path,
         cycleDetected,
         missingParentDetected
       ) AS (
         SELECT
           root.id,
           root.id,
           CAST(? AS INTEGER),
           root.branchRootMessageId,
           root.branchVersionIndex,
           0,
           '|' || root.id || ':' || CAST(? AS TEXT) || '|',
           0,
           0
         FROM ai_messages root
         WHERE root.id = ?

         UNION ALL

         SELECT
           parent.id,
           parent.id,
           lineage.parentBranchVersionIndex,
           parent.branchRootMessageId,
           parent.branchVersionIndex,
           lineage.depth + 1,
           lineage.path || parent.id || ':' || CAST(lineage.parentBranchVersionIndex AS TEXT) || '|',
           CASE
             WHEN instr(lineage.path, '|' || parent.id || ':' || CAST(lineage.parentBranchVersionIndex AS TEXT) || '|') > 0 THEN 1
             ELSE 0
           END,
           0
         FROM lineage
         JOIN ai_messages parent ON parent.id = lineage.parentBranchRootMessageId
         WHERE lineage.parentBranchRootMessageId IS NOT NULL
           AND lineage.parentBranchVersionIndex IS NOT NULL
           AND lineage.cycleDetected = 0
           AND lineage.depth < ?

         UNION ALL

         SELECT
           '__missing_parent__',
           lineage.parentBranchRootMessageId,
           lineage.parentBranchVersionIndex,
           NULL,
           NULL,
           lineage.depth + 1,
           lineage.path,
           0,
           1
         FROM lineage
         LEFT JOIN ai_messages parent ON parent.id = lineage.parentBranchRootMessageId
         WHERE lineage.parentBranchRootMessageId IS NOT NULL
           AND lineage.parentBranchVersionIndex IS NOT NULL
           AND parent.id IS NULL
           AND lineage.cycleDetected = 0
           AND lineage.depth < ?
       )
       SELECT
         branchRootMessageId,
         branchVersionIndex,
         cycleDetected,
         depth,
         CASE WHEN depth >= ? THEN 1 ELSE 0 END AS depthLimitReached,
         missingParentDetected
       FROM lineage
       ORDER BY depth ASC`,
      branchVersionIndex,
      branchVersionIndex,
      branchRootMessageId,
      BRANCH_LINEAGE_MAX_DEPTH,
      BRANCH_LINEAGE_MAX_DEPTH,
      BRANCH_LINEAGE_MAX_DEPTH
    );
    if (
      rows.length === 0
      || rows.some((row) => row.cycleDetected || row.missingParentDetected || row.depthLimitReached)
    ) {
      return [];
    }
    return rows.map((row) => ({
      branchRootMessageId: row.branchRootMessageId,
      branchVersionIndex: row.branchVersionIndex,
    }));
  },

  async listRecentCompletedMessagesBefore(
    db: SQLiteDatabase,
    threadId: string,
    beforeMessageId: string,
    limit: number,
    branchScopes?: AiBranchScope[]
  ): Promise<AiMessageRecord[]> {
    if (limit <= 0) {
      return [];
    }
    const visibleBranchClause = buildVisibleBranchClause('candidate', branchScopes);
    const rows = await db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM (
         SELECT candidate.*, candidate.rowid AS rowOrder
         FROM ai_messages target
         JOIN ai_messages candidate ON candidate.threadId = target.threadId
         WHERE target.id = ?
            AND target.threadId = ?
            AND candidate.status = 'completed'
            AND candidate.id <> target.id
            ${visibleBranchClause.clause}
            AND (
              candidate.createdAt < target.createdAt
              OR (candidate.createdAt = target.createdAt AND candidate.rowid < target.rowid)
           )
         ORDER BY candidate.createdAt DESC, candidate.rowid DESC
         LIMIT ?
       )
       ORDER BY createdAt ASC, rowOrder ASC`,
      beforeMessageId,
      threadId,
      ...visibleBranchClause.values,
      limit
    );
    return materializeMessagesForBranchScopes(db, rows, branchScopes);
  },

  async listCompletedNonSystemMessagesBefore(
    db: SQLiteDatabase,
    threadId: string,
    beforeMessageId: string,
    branchScopes?: AiBranchScope[]
  ): Promise<AiMessageRecord[]> {
    const visibleBranchClause = buildVisibleBranchClause('candidate', branchScopes);
    const rows = await db.getAllAsync<AiMessageRecord>(
      `SELECT candidate.*
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
         AND target.threadId = ?
         AND candidate.status = 'completed'
         AND candidate.role <> 'system'
         AND candidate.id <> target.id
         ${visibleBranchClause.clause}
         AND ${excludeRolledBackContinuityPayload('candidate')}
         AND (
           candidate.createdAt < target.createdAt
           OR (candidate.createdAt = target.createdAt AND candidate.rowid < target.rowid)
         )
       ORDER BY candidate.createdAt ASC, candidate.rowid ASC`,
      beforeMessageId,
      threadId,
      ...visibleBranchClause.values
    );
    return materializeMessagesForBranchScopes(db, rows, branchScopes);
  },

  async countCompletedNonSystemMessagesAfter(db: SQLiteDatabase, threadId: string, afterMessageId: string | null, branchScopes?: AiBranchScope[]): Promise<number> {
    const visibleBranchClause = buildVisibleBranchClause(afterMessageId ? 'candidate' : 'ai_messages', branchScopes);
    if (!afterMessageId) {
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM ai_messages
         WHERE threadId = ?
            AND status = 'completed'
            AND role <> 'system'
            ${visibleBranchClause.clause}`,
        threadId,
        ...visibleBranchClause.values
      );
      return row?.count ?? 0;
    }
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
          AND target.threadId = ?
          AND candidate.status = 'completed'
          AND candidate.role <> 'system'
          ${visibleBranchClause.clause}
          AND (
            candidate.createdAt > target.createdAt
            OR (candidate.createdAt = target.createdAt AND candidate.rowid > target.rowid)
          )`,
      afterMessageId,
      threadId,
      ...visibleBranchClause.values
    );
    return row?.count ?? 0;
  },

  async countCompletedNonSystemMessages(db: SQLiteDatabase, threadId: string, branchScopes?: AiBranchScope[]): Promise<number> {
    const visibleBranchClause = buildVisibleBranchClause('ai_messages', branchScopes);
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM ai_messages
       WHERE threadId = ?
          AND status = 'completed'
          AND role <> 'system'
          ${visibleBranchClause.clause}`,
      threadId,
      ...visibleBranchClause.values
    );
    return row?.count ?? 0;
  },

  async listCompletedNonSystemMessagesAfter(db: SQLiteDatabase, threadId: string, afterMessageId: string | null, limit: number, branchScopes?: AiBranchScope[]): Promise<AiMessageRecord[]> {
    if (limit <= 0) {
      return [];
    }
    const visibleBranchClause = buildVisibleBranchClause(afterMessageId ? 'candidate' : 'ai_messages', branchScopes);
    if (!afterMessageId) {
      const rows = await db.getAllAsync<AiMessageRecord>(
        `SELECT * FROM ai_messages
         WHERE threadId = ?
            AND status = 'completed'
            AND role <> 'system'
            ${visibleBranchClause.clause}
          ORDER BY createdAt ASC, rowid ASC
          LIMIT ?`,
        threadId,
        ...visibleBranchClause.values,
        limit
      );
      return materializeMessagesForBranchScopes(db, rows, branchScopes);
    }
    const rows = await db.getAllAsync<AiMessageRecord>(
      `SELECT candidate.*
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
          AND target.threadId = ?
          AND candidate.status = 'completed'
          AND candidate.role <> 'system'
          ${visibleBranchClause.clause}
          AND (
            candidate.createdAt > target.createdAt
            OR (candidate.createdAt = target.createdAt AND candidate.rowid > target.rowid)
         )
       ORDER BY candidate.createdAt ASC, candidate.rowid ASC
       LIMIT ?`,
      afterMessageId,
      threadId,
      ...visibleBranchClause.values,
      limit
    );
    return materializeMessagesForBranchScopes(db, rows, branchScopes);
  },

  async listRecentCompletedNonSystemMessages(db: SQLiteDatabase, threadId: string, limit: number, branchScopes?: AiBranchScope[]): Promise<AiMessageRecord[]> {
    if (limit <= 0) {
      return [];
    }
    const visibleBranchClause = buildVisibleBranchClause('ai_messages', branchScopes);
    const rows = await db.getAllAsync<AiMessageRecord>(
      `SELECT * FROM (
         SELECT *, rowid AS rowOrder
         FROM ai_messages
         WHERE threadId = ?
            AND status = 'completed'
            AND role <> 'system'
            ${visibleBranchClause.clause}
          ORDER BY createdAt DESC, rowid DESC
          LIMIT ?
        )
        ORDER BY createdAt ASC, rowOrder ASC`,
      threadId,
      ...visibleBranchClause.values,
      limit
    );
    return materializeMessagesForBranchScopes(db, rows, branchScopes);
  },

  async listCompletedMessagesInDateRange(
    db: SQLiteDatabase,
    threadId: string,
    startIso: string,
    endIso: string,
    branchScopes?: AiBranchScope[],
  ): Promise<AiMessageRecord[]> {
    const visibleBranchClause = buildVisibleBranchClause('candidate', branchScopes);
    const rows = await db.getAllAsync<AiMessageRecord>(
      `SELECT candidate.*
       FROM ai_messages candidate
       WHERE candidate.threadId = ?
         AND candidate.status = 'completed'
         AND candidate.role <> 'system'
         AND candidate.createdAt >= ?
         AND candidate.createdAt < ?
         ${visibleBranchClause.clause}
       ORDER BY candidate.createdAt ASC, candidate.rowid ASC`,
      threadId,
      startIso,
      endIso,
      ...visibleBranchClause.values,
    );
    return materializeMessagesForBranchScopes(db, rows, branchScopes);
  },

  async findPreviousMessageByRole(db: SQLiteDatabase, threadId: string, beforeMessageId: string, role: AiMessageRole, branchScopes?: AiBranchScope[]): Promise<AiMessageRecord | null> {
    const visibleBranchClause = buildVisibleBranchClause('candidate', branchScopes);
    const row = await db.getFirstAsync<AiMessageRecord>(
      `SELECT candidate.*
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
          AND target.threadId = ?
          AND candidate.role = ?
          ${visibleBranchClause.clause}
          AND (
            candidate.createdAt < target.createdAt
            OR (candidate.createdAt = target.createdAt AND candidate.rowid < target.rowid)
         )
       ORDER BY candidate.createdAt DESC, candidate.rowid DESC
       LIMIT 1`,
      beforeMessageId,
      threadId,
      role,
      ...visibleBranchClause.values
    );
    if (!row) {
      return null;
    }
    const [materialized] = await materializeMessagesForBranchScopes(db, [row], branchScopes);
    return materialized ?? row;
  },

  async findNextMessageByRole(db: SQLiteDatabase, threadId: string, afterMessageId: string, role: AiMessageRole): Promise<AiMessageRecord | null> {
    return db.getFirstAsync<AiMessageRecord>(
      `SELECT candidate.*
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
         AND target.threadId = ?
         AND candidate.role = ?
         AND (
           candidate.createdAt > target.createdAt
           OR (candidate.createdAt = target.createdAt AND candidate.rowid > target.rowid)
         )
       ORDER BY candidate.createdAt ASC, candidate.rowid ASC
       LIMIT 1`,
      afterMessageId,
      threadId,
      role
    );
  },

  async listMessageIdsAfter(db: SQLiteDatabase, threadId: string, afterMessageId: string): Promise<string[]> {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT candidate.id
       FROM ai_messages target
       JOIN ai_messages candidate ON candidate.threadId = target.threadId
       WHERE target.id = ?
         AND target.threadId = ?
         AND (
           candidate.createdAt > target.createdAt
           OR (candidate.createdAt = target.createdAt AND candidate.rowid > target.rowid)
         )
       ORDER BY candidate.createdAt ASC, candidate.rowid ASC`,
      afterMessageId,
      threadId
    );
    return rows.map((row) => row.id);
  },

  async createMessageVersion(db: SQLiteDatabase, input: CreateAiMessageVersionInput): Promise<AiMessageVersionRecord> {
    const now = createTimestamp();
    const latest = await db.getFirstAsync<{ versionIndex: number }>(
      `SELECT versionIndex FROM ai_message_versions
       WHERE originalMessageId = ?
       ORDER BY versionIndex DESC
       LIMIT 1`,
      input.originalMessageId
    );
    const versionIndex = (latest?.versionIndex ?? 0) + 1;
    await db.runAsync(
      `INSERT INTO ai_message_versions (
        id,
        originalMessageId,
        threadId,
        versionIndex,
        role,
        status,
        content,
        reasoningText,
        errorMessage,
        providerId,
        modelId,
        modelSnapshotJson,
        promptSnapshotJson,
        citationsJson,
        messageCreatedAt,
        messageUpdatedAt,
        messageCompletedAt,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.originalMessageId,
      input.threadId,
      versionIndex,
      input.role,
      input.status,
      input.content,
      input.reasoningText ?? null,
      input.errorMessage == null ? null : normalizeOptionalText(input.errorMessage) ?? null,
      input.providerId ?? null,
      input.modelId ?? null,
      input.modelSnapshotJson ?? '{}',
      input.promptSnapshotJson ?? '{}',
      JSON.stringify(input.citations ?? []),
      input.messageCreatedAt,
      input.messageUpdatedAt,
      input.messageCompletedAt ?? null,
      now
    );
    const row = await db.getFirstAsync<AiMessageVersionRow>('SELECT * FROM ai_message_versions WHERE id = ?', input.id);
    if (!row) {
      throw new Error(`AI message version ${input.id} was created but could not be reloaded.`);
    }
    const version = mapMessageVersionRow(row);
    await aiThreadRepository.syncMessageVersionFts(db, version);
    return version;
  },

  async listMessageVersions(db: SQLiteDatabase, messageId: string): Promise<AiMessageVersionRecord[]> {
    const rows = await db.getAllAsync<AiMessageVersionRow>(
      `SELECT * FROM ai_message_versions
       WHERE originalMessageId = ?
       ORDER BY versionIndex ASC`,
      messageId
    );
    return rows.map(mapMessageVersionRow);
  },

  async listMessageVersionTotalsForMessages(db: SQLiteDatabase, messageIds: string[]): Promise<Record<string, number>> {
    if (messageIds.length === 0) {
      return {};
    }
    const rows: Array<{ originalMessageId: string; versionTotal: number }> = [];
    for (let index = 0; index < messageIds.length; index += MESSAGE_LOOKUP_CHUNK_SIZE) {
      const chunk = messageIds.slice(index, index + MESSAGE_LOOKUP_CHUNK_SIZE);
      rows.push(
        ...(await db.getAllAsync<{ originalMessageId: string; versionTotal: number }>(
          `SELECT originalMessageId, COUNT(*) + 1 AS versionTotal
           FROM ai_message_versions
           WHERE originalMessageId IN (${makeInClause(chunk)})
           GROUP BY originalMessageId`,
          ...chunk
        ))
      );
    }
    return rows.reduce<Record<string, number>>((grouped, row) => {
      grouped[row.originalMessageId] = row.versionTotal;
      return grouped;
    }, {});
  },

  async listMessageVersionsForMessages(db: SQLiteDatabase, messageIds: string[]): Promise<Record<string, AiMessageVersionRecord[]>> {
    if (messageIds.length === 0) {
      return {};
    }
    const rows: AiMessageVersionRow[] = [];
    for (let index = 0; index < messageIds.length; index += MESSAGE_LOOKUP_CHUNK_SIZE) {
      const chunk = messageIds.slice(index, index + MESSAGE_LOOKUP_CHUNK_SIZE);
      rows.push(
        ...(await db.getAllAsync<AiMessageVersionRow>(
          `SELECT * FROM ai_message_versions
           WHERE originalMessageId IN (${makeInClause(chunk)})
           ORDER BY originalMessageId ASC, versionIndex ASC`,
          ...chunk
        ))
      );
    }
    return rows.reduce<Record<string, AiMessageVersionRecord[]>>((grouped, row) => {
      const mapped = mapMessageVersionRow(row);
      grouped[mapped.originalMessageId] = grouped[mapped.originalMessageId] ?? [];
      grouped[mapped.originalMessageId].push(mapped);
      return grouped;
    }, {});
  },

  async listMessageVersionsByIndexForMessages(
    db: SQLiteDatabase,
    selections: Array<{ messageId: string; versionIndex: number }>
  ): Promise<Record<string, AiMessageVersionRecord>> {
    if (selections.length === 0) {
      return {};
    }
    const normalized = selections.filter(
      (selection): selection is { messageId: string; versionIndex: number } =>
        typeof selection.messageId === 'string'
        && selection.messageId.length > 0
        && Number.isFinite(selection.versionIndex)
        && selection.versionIndex > 0
    );
    if (normalized.length === 0) {
      return {};
    }

    const rows: AiMessageVersionRow[] = [];
    for (let index = 0; index < normalized.length; index += MESSAGE_LOOKUP_CHUNK_SIZE) {
      const chunk = normalized.slice(index, index + MESSAGE_LOOKUP_CHUNK_SIZE);
      const clause = chunk.map(() => '(originalMessageId = ? AND versionIndex = ?)').join(' OR ');
      rows.push(
        ...(await db.getAllAsync<AiMessageVersionRow>(
          `SELECT * FROM ai_message_versions
           WHERE ${clause}
           ORDER BY originalMessageId ASC, versionIndex ASC`,
          ...chunk.flatMap((selection) => [selection.messageId, selection.versionIndex])
        ))
      );
    }

    return rows.reduce<Record<string, AiMessageVersionRecord>>((grouped, row) => {
      const mapped = mapMessageVersionRow(row);
      grouped[mapped.originalMessageId] = mapped;
      return grouped;
    }, {});
  },

  async replaceCitations(db: SQLiteDatabase, messageId: string, citations: ReplaceCitationInput[]): Promise<void> {
    const now = createTimestamp();
    await db.runAsync('DELETE FROM ai_message_citations WHERE messageId = ?', messageId);
    for (const citation of citations) {
      await db.runAsync(
        `INSERT INTO ai_message_citations (
          id,
          messageId,
          sourceType,
          sourceId,
          label,
          locatorJson,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        citation.id,
        messageId,
        citation.sourceType,
        citation.sourceId,
        citation.label,
        JSON.stringify(citation.locator ?? {}),
        now
      );
    }
  },

  async listCitations(db: SQLiteDatabase, messageId: string): Promise<AiCitationRecord[]> {
    const rows = await db.getAllAsync<AiCitationRow>(
      `SELECT * FROM ai_message_citations
       WHERE messageId = ?
       ORDER BY createdAt ASC`,
      messageId
    );
    return rows.map(mapCitationRow);
  },

  async listCitationsForMessages(db: SQLiteDatabase, messageIds: string[]): Promise<Record<string, AiCitationRecord[]>> {
    if (messageIds.length === 0) {
      return {};
    }
    const rows: AiCitationRow[] = [];
    for (let index = 0; index < messageIds.length; index += MESSAGE_LOOKUP_CHUNK_SIZE) {
      const chunk = messageIds.slice(index, index + MESSAGE_LOOKUP_CHUNK_SIZE);
      rows.push(
        ...(await db.getAllAsync<AiCitationRow>(
          `SELECT * FROM ai_message_citations
           WHERE messageId IN (${makeInClause(chunk)})
           ORDER BY messageId ASC, createdAt ASC`,
          ...chunk
        ))
      );
    }
    return rows.reduce<Record<string, AiCitationRecord[]>>((grouped, row) => {
      const mapped = mapCitationRow(row);
      grouped[mapped.messageId] = grouped[mapped.messageId] ?? [];
      grouped[mapped.messageId].push(mapped);
      return grouped;
    }, {});
  },

  async getThreadMemorySettings(db: SQLiteDatabase, threadId: string): Promise<AiThreadMemorySettingsRecord> {
    const row = await db.getFirstAsync<AiThreadMemorySettingsRow>('SELECT * FROM ai_thread_memory_settings WHERE threadId = ?', threadId);
    return row ? mapMemorySettingsRow(row) : { threadId, deepMemoryEnabled: true, updatedAt: createTimestamp() };
  },

  async updateThreadMemorySettings(db: SQLiteDatabase, threadId: string, deepMemoryEnabled: boolean): Promise<AiThreadMemorySettingsRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_thread_memory_settings (threadId, deepMemoryEnabled, updatedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(threadId) DO UPDATE SET deepMemoryEnabled = excluded.deepMemoryEnabled, updatedAt = excluded.updatedAt`,
      threadId,
      booleanToSqlite(deepMemoryEnabled),
      now
    );
    const row = await db.getFirstAsync<AiThreadMemorySettingsRow>('SELECT * FROM ai_thread_memory_settings WHERE threadId = ?', threadId);
    if (!row) {
      throw new Error(`AI thread memory settings ${threadId} could not be reloaded.`);
    }
    return mapMemorySettingsRow(row);
  },

  async getUserProfiles(db: SQLiteDatabase, space: PixorySpace, input: { boundIpId?: number | null; boundThreadId?: string | null } = {}): Promise<AiUserProfileRecord[]> {
    const clauses = ['space = ?'];
    const values: Array<string | number | null> = [space];
    const scopeClauses = ['(boundIpId IS NULL AND boundThreadId IS NULL)'];
    if (input.boundIpId != null) {
      scopeClauses.push('(boundIpId = ? AND boundThreadId IS NULL)');
      values.push(input.boundIpId);
    }
    if (input.boundThreadId) {
      scopeClauses.push('(boundIpId IS NULL AND boundThreadId = ?)');
      values.push(input.boundThreadId);
    }
    clauses.push(`(${scopeClauses.join(' OR ')})`);
    return db.getAllAsync<AiUserProfileRecord>(
      `SELECT * FROM ai_user_profiles
       WHERE ${clauses.join(' AND ')}
       ORDER BY
         CASE
           WHEN boundThreadId IS NOT NULL THEN 3
           WHEN boundIpId IS NOT NULL THEN 2
           ELSE 1
         END DESC`,
      ...values
    );
  },

  async getUserProfile(db: SQLiteDatabase, space: PixorySpace, boundIpId: number | null = null, boundThreadId: string | null = null): Promise<AiUserProfileRecord | null> {
    if (boundThreadId) {
      return db.getFirstAsync<AiUserProfileRecord>('SELECT * FROM ai_user_profiles WHERE space = ? AND boundIpId IS NULL AND boundThreadId = ?', space, boundThreadId);
    }
    if (boundIpId != null) {
      return db.getFirstAsync<AiUserProfileRecord>('SELECT * FROM ai_user_profiles WHERE space = ? AND boundIpId = ? AND boundThreadId IS NULL', space, boundIpId);
    }
    return db.getFirstAsync<AiUserProfileRecord>('SELECT * FROM ai_user_profiles WHERE space = ? AND boundIpId IS NULL AND boundThreadId IS NULL', space);
  },

  async upsertUserProfile(
    db: SQLiteDatabase,
    input: Omit<AiUserProfileRecord, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }
  ): Promise<AiUserProfileRecord> {
    validateUserProfileScope(input);
    const now = createTimestamp();
    const existing = await this.getUserProfile(db, input.space, input.boundIpId, input.boundThreadId);
    if (existing) {
      await db.runAsync(
        `UPDATE ai_user_profiles SET
         profileJson = ?, profileText = ?, version = version + 1, sourceThreadId = ?,
         sourceStartMessageId = ?, sourceEndMessageId = ?, messageCountAtUpdate = ?,
         lastUpdatedAt = ?, updatedAt = ?
         WHERE id = ?`,
        input.profileJson, input.profileText, input.sourceThreadId, input.sourceStartMessageId,
        input.sourceEndMessageId, input.messageCountAtUpdate, input.lastUpdatedAt, input.updatedAt ?? now,
        existing.id
      );
    } else {
      await db.runAsync(
        `INSERT INTO ai_user_profiles (
          id, space, boundIpId, boundThreadId, profileJson, profileText, version, sourceThreadId, sourceStartMessageId,
          sourceEndMessageId, messageCountAtUpdate, lastUpdatedAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.id, input.space, input.boundIpId ?? null, input.boundThreadId ?? null, input.profileJson, input.profileText, input.version,
        input.sourceThreadId, input.sourceStartMessageId, input.sourceEndMessageId, input.messageCountAtUpdate,
        input.lastUpdatedAt, input.createdAt ?? now, input.updatedAt ?? now
      );
    }
    const row = await this.getUserProfile(db, input.space, input.boundIpId, input.boundThreadId);
    if (!row) {
      throw new Error('User profile upsert failed.');
    }
    return row;
  },

  async createSummarySegment(
    db: SQLiteDatabase,
    input: Omit<AiThreadSummarySegmentRecord, 'createdAt' | 'updatedAt'>
  ): Promise<AiThreadSummarySegmentRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_thread_summary_segments (
        id, threadId, space, kind, summaryText, startMessageId, endMessageId,
        startAt, endAt, roundCount, sourceSegmentIdsJson, continuityImportSessionId,
        sourceMessageIdsJson, branchRouteHash, lineageVersion, sourceMessageVersionHash,
        quality, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.threadId,
      input.space,
      input.kind,
      input.summaryText,
      input.startMessageId,
      input.endMessageId,
      input.startAt,
      input.endAt,
      input.roundCount,
      input.sourceSegmentIdsJson,
      input.continuityImportSessionId ?? null,
      input.sourceMessageIdsJson,
      input.branchRouteHash,
      input.lineageVersion,
      input.sourceMessageVersionHash,
      input.quality,
      input.status,
      now,
      now
    );
    const row = await db.getFirstAsync<AiThreadSummarySegmentRecord>('SELECT * FROM ai_thread_summary_segments WHERE id = ?', input.id);
    if (!row) {
      throw new Error('Summary segment insert failed.');
    }
    return row;
  },

  async listSummarySegments(db: SQLiteDatabase, threadId: string, branchScopes?: AiBranchScope[]): Promise<AiThreadSummarySegmentRecord[]> {
    const visibilityClause = buildSummarySegmentVisibilityClause('ai_thread_summary_segments', branchScopes);
    return db.getAllAsync<AiThreadSummarySegmentRecord>(
      `SELECT * FROM ai_thread_summary_segments
       WHERE threadId = ?
         AND status = 'active'
         AND ${excludeRolledBackContinuityPayload('ai_thread_summary_segments')}
         ${visibilityClause.clause ? `AND ${visibilityClause.clause}` : ''}
       ORDER BY createdAt ASC, id ASC`,
      threadId,
      ...visibilityClause.values
    );
  },

  async deleteSummarySegments(db: SQLiteDatabase, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const placeholders = makeInClause(ids);
    await db.runAsync(`DELETE FROM ai_thread_summary_segments WHERE id IN (${placeholders})`, ...ids);
  },

  async deleteSummarySegment(db: SQLiteDatabase, threadId: string, segmentId: string): Promise<number> {
    const result = await db.runAsync(
      'DELETE FROM ai_thread_summary_segments WHERE threadId = ? AND id = ?',
      threadId,
      segmentId
    );
    return result.changes;
  },

  async getThreadSummary(db: SQLiteDatabase, threadId: string): Promise<AiThreadSummaryRecord | null> {
    return db.getFirstAsync<AiThreadSummaryRecord>('SELECT * FROM ai_thread_summaries WHERE threadId = ?', threadId);
  },

  async upsertThreadSummary(db: SQLiteDatabase, input: UpsertAiThreadSummaryInput): Promise<AiThreadSummaryRecord> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_thread_summaries (threadId, summary, decisions, openQuestions, lastMessageId, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(threadId) DO UPDATE SET
         summary = excluded.summary,
         decisions = excluded.decisions,
         openQuestions = excluded.openQuestions,
         lastMessageId = excluded.lastMessageId,
         updatedAt = excluded.updatedAt`,
      input.threadId,
      input.summary,
      input.decisions ?? '',
      input.openQuestions ?? '',
      input.lastMessageId ?? null,
      now
    );
    const row = await db.getFirstAsync<AiThreadSummaryRecord>('SELECT * FROM ai_thread_summaries WHERE threadId = ?', input.threadId);
    if (!row) {
      throw new Error(`AI thread summary ${input.threadId} could not be reloaded.`);
    }
    return row;
  },

  async findActiveMemoryByNormalizedContent(db: SQLiteDatabase, input: { space: PixorySpace; scope: AiMemoryScope; scopeId?: string | null; normalizedContent: string }): Promise<AiMemoryRecord | null> {
    return db.getFirstAsync<AiMemoryRecord>(
      `SELECT * FROM ai_memories
       WHERE space = ? AND scope = ? AND COALESCE(scopeId, '') = COALESCE(?, '') AND normalizedContent = ? AND status = 'active'
       LIMIT 1`,
      input.space,
      input.scope,
      input.scopeId ?? null,
      input.normalizedContent
    );
  },

  async createMemory(db: SQLiteDatabase, input: CreateAiMemoryInput): Promise<AiMemoryRecord> {
    const now = createTimestamp();
    const existing = await aiThreadRepository.findActiveMemoryByNormalizedContent(db, {
      normalizedContent: input.normalizedContent,
      scope: input.scope,
      scopeId: input.scopeId ?? null,
      space: input.space,
    });
    if (existing) {
      return existing;
    }
    try {
      await db.runAsync(
        `INSERT INTO ai_memories (
          id, space, scope, scopeId, type, content, normalizedContent, sourceMessageId,
          confidence, importance, status, lastUsedAt, ipId, groupId, imageAssetId, assetSnapshotJson, sourceKind,
          supersededByMemoryId, mergeReason, mergedAt, lastReconciledAt, reconcileSourceMessageId,
          createdAt, updatedAt, deletedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        input.id,
        input.space,
        input.scope,
        input.scopeId ?? null,
        input.type,
        input.content,
        input.normalizedContent,
        input.sourceMessageId ?? null,
        input.confidence ?? 0.7,
        input.importance ?? 1,
        input.ipId ?? null,
        input.groupId ?? null,
        input.imageAssetId ?? null,
        input.assetSnapshotJson ?? '{}',
        input.sourceKind ?? 'auto',
        input.supersededByMemoryId ?? null,
        input.mergeReason ?? null,
        input.mergedAt ?? null,
        input.lastReconciledAt ?? null,
        input.reconcileSourceMessageId ?? null,
        now,
        now
      );
    } catch (error) {
      const duplicate = await aiThreadRepository.findActiveMemoryByNormalizedContent(db, {
        normalizedContent: input.normalizedContent,
        scope: input.scope,
        scopeId: input.scopeId ?? null,
        space: input.space,
      });
      if (duplicate) {
        return duplicate;
      }
      throw error;
    }
    const row = await db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ?', input.id);
    if (!row) {
      throw new Error(`AI memory ${input.id} was created but could not be reloaded.`);
    }
    await aiThreadRepository.syncMemoryFts(db, row);
    return row;
  },

  async createManualMemory(db: SQLiteDatabase, input: CreateAiMemoryInput): Promise<AiMemoryRecord> {
    return aiThreadRepository.createMemory(db, {
      ...input,
      confidence: input.confidence ?? 1,
      importance: input.importance ?? 4,
      sourceKind: 'manual',
    });
  },

  async updateMemoryContent(db: SQLiteDatabase, memoryId: string, content: string): Promise<AiMemoryRecord | null> {
    const now = createTimestamp();
    const trimmed = content.replace(/\s+/g, ' ').trim();
    const normalizedContent = trimmed.toLowerCase().slice(0, 180);
    const current = await db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ? AND status = \'active\'', memoryId);
    if (!current) {
      return null;
    }
    const duplicate = await aiThreadRepository.findActiveMemoryByNormalizedContent(db, {
      normalizedContent,
      scope: current.scope,
      scopeId: current.scopeId,
      space: current.space,
    });
    if (duplicate && duplicate.id !== memoryId) {
      throw new Error('已存在相同的记忆。');
    }
    await db.runAsync(
      `UPDATE ai_memories
       SET content = ?, normalizedContent = ?, updatedAt = ?
       WHERE id = ? AND status = 'active'`,
      trimmed,
      normalizedContent,
      now,
      memoryId
    );
    const memory = await db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ?', memoryId);
    if (memory) {
      await aiThreadRepository.syncMemoryFts(db, memory);
    }
    return memory;
  },

  async listMemoryBoardItems(db: SQLiteDatabase,
    input: {
      space: PixorySpace;
      threadId?: string | null;
      roleCardId?: string | null;
      boundIpId?: number | null;
      boundKnowledgeBaseId?: string | null;
      branchScopes?: AiBranchScope[];
      limit?: number;
      offset?: number;
      status?: AiMemoryStatus | 'all';
    }
  ): Promise<AiMemoryRecord[]> {
    const status = input.status ?? 'active';
    const clauses = ["space = ?"];
    const values: Array<string | number | null> = [input.space];
    if (status !== 'all') {
      clauses.push('status = ?');
      values.push(status);
    }
    if (status === 'active') {
      clauses.push('supersededByMemoryId IS NULL');
    }
    const scopeClauses = ["scope = 'global'"];
    if (input.threadId) {
      scopeClauses.push("(scope = 'thread' AND scopeId = ?)");
      values.push(input.threadId);
    }
    if (input.roleCardId) {
      scopeClauses.push("(scope = 'role' AND scopeId = ?)");
      values.push(input.roleCardId);
    }
    if (input.boundIpId != null) {
      scopeClauses.push("(scope = 'ip' AND scopeId = ?)");
      values.push(String(input.boundIpId));
    }
    if (input.boundKnowledgeBaseId) {
      scopeClauses.push("(scope = 'knowledge_base' AND scopeId = ?)");
      values.push(input.boundKnowledgeBaseId);
    }
    clauses.push(`(${scopeClauses.join(' OR ')})`);
    if (input.threadId) {
      const sourceVisibilityClause = buildMemorySourceVisibilityClause('ai_memories', input.threadId, input.branchScopes);
      if (sourceVisibilityClause.clause) {
        clauses.push(sourceVisibilityClause.clause);
        values.push(...sourceVisibilityClause.values);
      }
    }
    const limit = Math.max(1, Math.min(input.limit ?? 80, 200));
    const offset = Math.max(0, input.offset ?? 0);
    return db.getAllAsync<AiMemoryRecord>(
      `SELECT * FROM ai_memories
       WHERE ${clauses.join(' AND ')}
       ORDER BY ${memoryScopePrioritySql()} DESC, importance DESC, createdAt ASC, id ASC
       LIMIT ? OFFSET ?`,
      ...values,
      limit,
      offset
    );
  },

  async listActiveMemories(db: SQLiteDatabase, input: { space: PixorySpace; threadId: string; roleCardId?: string | null; boundIpId?: number | null; boundKnowledgeBaseId?: string | null; branchScopes?: AiBranchScope[]; limit?: number }): Promise<AiMemoryRecord[]> {
    const scopePairs: Array<[AiMemoryScope, string | null]> = [
      ['global', null],
      ['thread', input.threadId],
    ];
    if (input.roleCardId) {
      scopePairs.push(['role', input.roleCardId]);
    }
    if (input.boundIpId != null) {
      scopePairs.push(['ip', String(input.boundIpId)]);
    }
    if (input.boundKnowledgeBaseId) {
      scopePairs.push(['knowledge_base', input.boundKnowledgeBaseId]);
    }
    const clauses = scopePairs.map(() => '(scope = ? AND COALESCE(scopeId, \'\') = COALESCE(?, \'\'))');
    const values = scopePairs.flatMap(([scope, scopeId]) => [scope, scopeId]);
    const sourceVisibilityClause = buildMemorySourceVisibilityClause('ai_memories', input.threadId, input.branchScopes);
    return db.getAllAsync<AiMemoryRecord>(
      `SELECT * FROM ai_memories
       WHERE space = ? AND status = 'active' AND supersededByMemoryId IS NULL AND (${clauses.join(' OR ')})
         ${sourceVisibilityClause.clause ? `AND ${sourceVisibilityClause.clause}` : ''}
       ORDER BY ${memoryScopePrioritySql()} DESC, importance DESC, COALESCE(lastUsedAt, updatedAt) DESC, updatedAt DESC
       LIMIT ?`,
      input.space,
      ...values,
      ...sourceVisibilityClause.values,
      input.limit ?? 80
    );
  },

  async listRoleMemoriesForSpaceMove(
    db: SQLiteDatabase,
    space: PixorySpace,
    roleCardIds: string[]
  ): Promise<AiMemoryRecord[]> {
    const uniqueRoleCardIds = Array.from(new Set(roleCardIds));
    if (uniqueRoleCardIds.length === 0) {
      return [];
    }
    const placeholders = uniqueRoleCardIds.map(() => '?').join(', ');
    return db.getAllAsync<AiMemoryRecord>(
      `SELECT * FROM ai_memories
       WHERE space = ? AND scope = 'role' AND scopeId IN (${placeholders})
       ORDER BY createdAt ASC, id ASC`,
      space,
      ...uniqueRoleCardIds
    );
  },

  async findRoleMemoriesForSpaceMoveByIds(
    db: SQLiteDatabase,
    memoryIds: string[]
  ): Promise<AiMemoryRecord[]> {
    const uniqueMemoryIds = Array.from(new Set(memoryIds));
    if (uniqueMemoryIds.length === 0) {
      return [];
    }
    const placeholders = uniqueMemoryIds.map(() => '?').join(', ');
    return db.getAllAsync<AiMemoryRecord>(
      `SELECT * FROM ai_memories
       WHERE id IN (${placeholders})`,
      ...uniqueMemoryIds
    );
  },

  async importRoleMemoriesForSpaceMove(
    db: SQLiteDatabase,
    memories: AiMemoryRecord[]
  ): Promise<void> {
    for (const memory of memories) {
      await db.runAsync(
        `INSERT INTO ai_memories (
          id, space, scope, scopeId, type, content, normalizedContent, sourceMessageId,
          confidence, importance, status, lastUsedAt, ipId, groupId, imageAssetId, assetSnapshotJson,
          sourceKind, supersededByMemoryId, mergeReason, mergedAt, lastReconciledAt,
          reconcileSourceMessageId, createdAt, updatedAt, deletedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        memory.id,
        memory.space,
        memory.scope,
        memory.scopeId,
        memory.type,
        memory.content,
        memory.normalizedContent,
        memory.sourceMessageId,
        memory.confidence,
        memory.importance,
        memory.status,
        memory.lastUsedAt,
        memory.ipId,
        memory.groupId,
        memory.imageAssetId,
        memory.assetSnapshotJson,
        memory.sourceKind,
        memory.supersededByMemoryId,
        memory.mergeReason,
        memory.mergedAt,
        memory.lastReconciledAt,
        memory.reconcileSourceMessageId,
        memory.createdAt,
        memory.updatedAt,
        memory.deletedAt
      );
      await aiThreadRepository.syncMemoryFts(db, memory);
    }
  },

  async deleteRoleMemoriesForSpaceMove(
    db: SQLiteDatabase,
    space: PixorySpace,
    memoryIds: string[]
  ): Promise<void> {
    for (const memoryId of Array.from(new Set(memoryIds))) {
      await db.runAsync('DELETE FROM ai_memory_fts WHERE id = ?', memoryId);
      await db.runAsync(
        `DELETE FROM ai_memories
         WHERE id = ? AND space = ? AND scope = 'role'`,
        memoryId,
        space
      );
    }
  },

  async syncMemoryFts(db: SQLiteDatabase, memory: AiMemoryRecord): Promise<void> {
    await db.runAsync('DELETE FROM ai_memory_fts WHERE id = ?', memory.id);
    if (memory.status !== 'active' || memory.supersededByMemoryId) {
      return;
    }
    await db.runAsync(
      `INSERT INTO ai_memory_fts (
        id, space, scope, scopeId, content, normalizedContent, assetSnapshotJson, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      memory.id,
      memory.space,
      memory.scope,
      memory.scopeId,
      memory.content,
      memory.normalizedContent,
      memory.assetSnapshotJson,
      memory.updatedAt
    );
  },

  async searchActiveMemoryFts(
    db: SQLiteDatabase,
    input: { space: PixorySpace; threadId: string; roleCardId?: string | null; boundIpId?: number | null; boundKnowledgeBaseId?: string | null; branchScopes?: AiBranchScope[]; query: string; limit: number }
  ): Promise<AiMemoryRecord[]> {
    const ftsQuery = buildFtsQuery(input.query);
    if (!ftsQuery || input.limit <= 0) {
      return [];
    }
    const scopePairs: Array<[AiMemoryScope, string | null]> = [
      ['global', null],
      ['thread', input.threadId],
    ];
    if (input.roleCardId) {
      scopePairs.push(['role', input.roleCardId]);
    }
    if (input.boundIpId != null) {
      scopePairs.push(['ip', String(input.boundIpId)]);
    }
    if (input.boundKnowledgeBaseId) {
      scopePairs.push(['knowledge_base', input.boundKnowledgeBaseId]);
    }
    const scopeClauses = scopePairs.map(() => '(ai_memories.scope = ? AND COALESCE(ai_memories.scopeId, \'\') = COALESCE(?, \'\'))');
    const scopeValues = scopePairs.flatMap(([scope, scopeId]) => [scope, scopeId]);
    const sourceVisibilityClause = buildMemorySourceVisibilityClause('ai_memories', input.threadId, input.branchScopes);
    const fallbackSearch = async () => {
      const memories = await aiThreadRepository.listActiveMemories(db, input);
      const terms = buildSearchTerms(input.query);
      return memories
        .filter((memory) => {
          const content = `${memory.content} ${memory.normalizedContent} ${memory.assetSnapshotJson}`.toLowerCase();
          return terms.some((term) => content.includes(term));
        })
        .slice(0, input.limit);
    };
    try {
      const rows = await db.getAllAsync<AiMemoryRecord>(
        `SELECT ai_memories.*
         FROM ai_memory_fts
         JOIN ai_memories ON ai_memories.id = ai_memory_fts.id
         WHERE ai_memory_fts MATCH ?
           AND ai_memories.space = ?
           AND ai_memories.status = 'active'
           AND ai_memories.supersededByMemoryId IS NULL
           AND (${scopeClauses.join(' OR ')})
           ${sourceVisibilityClause.clause ? `AND ${sourceVisibilityClause.clause}` : ''}
         ORDER BY ${memoryScopePrioritySql('ai_memories')} DESC, bm25(ai_memory_fts), ai_memories.importance DESC, COALESCE(ai_memories.lastUsedAt, ai_memories.updatedAt) DESC
         LIMIT ?`,
        ftsQuery,
        input.space,
        ...scopeValues,
        ...sourceVisibilityClause.values,
        input.limit
      );
      return rows.length > 0 ? rows : fallbackSearch();
    } catch {
      return fallbackSearch();
    }
  },

  async touchMemories(db: SQLiteDatabase, memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) {
      return;
    }
    const now = createTimestamp();
    await db.runAsync(
      `UPDATE ai_memories SET lastUsedAt = ?, updatedAt = ? WHERE id IN (${makeInClause(memoryIds)})`,
      now,
      now,
      ...memoryIds
    );
  },

  async updateMemoryByReconciliation(db: SQLiteDatabase, input: {
    memoryId: string;
    content: string;
    normalizedContent: string;
    type?: AiMemoryType;
    confidence?: number;
    importance?: number;
    reason?: string | null;
    sourceMessageId?: string | null;
  }): Promise<AiMemoryRecord | null> {
    const now = createTimestamp();
    const current = await db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ? AND status = \'active\'', input.memoryId);
    if (!current || current.sourceKind === 'manual') {
      return null;
    }
    const duplicate = await aiThreadRepository.findActiveMemoryByNormalizedContent(db, {
      normalizedContent: input.normalizedContent,
      scope: current.scope,
      scopeId: current.scopeId,
      space: current.space,
    });
    if (duplicate && duplicate.id !== input.memoryId) {
      await aiThreadRepository.markMemoryStaleByReconciliation(db, {
        memoryId: input.memoryId,
        reason: input.reason ?? '被现有等价记忆替代',
        sourceMessageId: input.sourceMessageId ?? null,
        supersededByMemoryId: duplicate.id,
      });
      return duplicate;
    }
    await db.runAsync(
      `UPDATE ai_memories
       SET content = ?,
           normalizedContent = ?,
           type = ?,
           confidence = ?,
           importance = ?,
           mergeReason = ?,
           mergedAt = ?,
           lastReconciledAt = ?,
           reconcileSourceMessageId = ?,
           updatedAt = ?
       WHERE id = ? AND status = 'active' AND sourceKind <> 'manual'`,
      input.content,
      input.normalizedContent,
      input.type ?? current.type,
      input.confidence ?? current.confidence,
      input.importance ?? current.importance,
      input.reason ?? null,
      now,
      now,
      input.sourceMessageId ?? null,
      now,
      input.memoryId
    );
    const memory = await db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ?', input.memoryId);
    if (memory) {
      await aiThreadRepository.syncMemoryFts(db, memory);
    }
    return memory;
  },

  async markMemoryStaleByReconciliation(db: SQLiteDatabase, input: {
    memoryId: string;
    supersededByMemoryId?: string | null;
    reason?: string | null;
    sourceMessageId?: string | null;
  }): Promise<AiMemoryRecord | null> {
    const now = createTimestamp();
    await db.runAsync(
      `UPDATE ai_memories
       SET status = 'stale',
           supersededByMemoryId = ?,
           mergeReason = ?,
           mergedAt = ?,
           lastReconciledAt = ?,
           reconcileSourceMessageId = ?,
           deletedAt = NULL,
           updatedAt = ?
       WHERE id = ? AND status = 'active' AND sourceKind <> 'manual'`,
      input.supersededByMemoryId ?? null,
      input.reason ?? null,
      now,
      now,
      input.sourceMessageId ?? null,
      now,
      input.memoryId
    );
    const memory = await db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ?', input.memoryId);
    if (memory) {
      await aiThreadRepository.syncMemoryFts(db, memory);
    }
    return memory;
  },

  async touchMemoryReconciled(db: SQLiteDatabase, input: { memoryId: string; reason?: string | null; sourceMessageId?: string | null }): Promise<AiMemoryRecord | null> {
    const now = createTimestamp();
    await db.runAsync(
      `UPDATE ai_memories
       SET lastReconciledAt = ?,
           reconcileSourceMessageId = ?,
           mergeReason = COALESCE(?, mergeReason),
           updatedAt = ?
       WHERE id = ? AND status = 'active'`,
      now,
      input.sourceMessageId ?? null,
      input.reason ?? null,
      now,
      input.memoryId
    );
    return db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ?', input.memoryId);
  },

  async incrementThreadMemoryPendingTurn(db: SQLiteDatabase, threadId: string): Promise<void> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_thread_memory_jobs (threadId, pendingTurnCount, lastCaptureNoticeJson, updatedAt)
       VALUES (?, 1, '[]', ?)
       ON CONFLICT(threadId) DO UPDATE SET
         pendingTurnCount = pendingTurnCount + 1,
         updatedAt = excluded.updatedAt`,
      threadId,
      now
    );
  },

  async updateMemoryStatus(db: SQLiteDatabase, memoryId: string, status: AiMemoryStatus): Promise<void> {
    const now = createTimestamp();
    await db.runAsync(
      `UPDATE ai_memories SET status = ?, deletedAt = ?, updatedAt = ? WHERE id = ?`,
      status,
      status === 'deleted' ? now : null,
      now,
      memoryId
    );
    const memory = await db.getFirstAsync<AiMemoryRecord>('SELECT * FROM ai_memories WHERE id = ?', memoryId);
    if (memory) {
      await aiThreadRepository.syncMemoryFts(db, memory);
    }
  },

  async deleteMemory(db: SQLiteDatabase, memoryId: string): Promise<void> {
    await aiThreadRepository.updateMemoryStatus(db, memoryId, 'deleted');
  },

  async getThreadMemoryJob(db: SQLiteDatabase, threadId: string): Promise<AiThreadMemoryJobRecord> {
    const row = await db.getFirstAsync<AiThreadMemoryJobRecord>('SELECT * FROM ai_thread_memory_jobs WHERE threadId = ?', threadId);
    return row ?? {
      threadId,
      pendingTurnCount: 0,
      lastConsolidatedMessageId: null,
      lastCaptureNoticeJson: '[]',
      lastCompressedMessageId: null,
      uncompressedRoundCount: 0,
      completedMessageCountAtProfileUpdate: 0,
      lastProfileUpdatedAt: null,
      profileUpdateCooldownUntil: null,
      lastMaintenanceError: null,
      lastMaintenanceModelProviderId: null,
      lastMaintenanceModelId: null,
      lastMaintenanceCompletedAt: null,
      lastMaintenanceUsedFallback: 0,
      updatedAt: createTimestamp(),
    };
  },

  async updateThreadMemoryJob(db: SQLiteDatabase, input: Partial<AiThreadMemoryJobRecord> & { threadId: string }): Promise<AiThreadMemoryJobRecord> {
    const current = await aiThreadRepository.getThreadMemoryJob(db, input.threadId);
    const next = { ...current, ...input, updatedAt: createTimestamp() };
    await db.runAsync(
      `INSERT INTO ai_thread_memory_jobs (
         threadId, pendingTurnCount, lastConsolidatedMessageId, lastCaptureNoticeJson,
         lastCompressedMessageId, uncompressedRoundCount, completedMessageCountAtProfileUpdate,
         lastProfileUpdatedAt, profileUpdateCooldownUntil, lastMaintenanceError,
         lastMaintenanceModelProviderId, lastMaintenanceModelId,
         lastMaintenanceCompletedAt, lastMaintenanceUsedFallback, updatedAt
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(threadId) DO UPDATE SET
         pendingTurnCount = excluded.pendingTurnCount,
         lastConsolidatedMessageId = excluded.lastConsolidatedMessageId,
         lastCaptureNoticeJson = excluded.lastCaptureNoticeJson,
         lastCompressedMessageId = excluded.lastCompressedMessageId,
         uncompressedRoundCount = excluded.uncompressedRoundCount,
         completedMessageCountAtProfileUpdate = excluded.completedMessageCountAtProfileUpdate,
         lastProfileUpdatedAt = excluded.lastProfileUpdatedAt,
         profileUpdateCooldownUntil = excluded.profileUpdateCooldownUntil,
         lastMaintenanceError = excluded.lastMaintenanceError,
         lastMaintenanceModelProviderId = excluded.lastMaintenanceModelProviderId,
         lastMaintenanceModelId = excluded.lastMaintenanceModelId,
         lastMaintenanceCompletedAt = excluded.lastMaintenanceCompletedAt,
         lastMaintenanceUsedFallback = excluded.lastMaintenanceUsedFallback,
         updatedAt = excluded.updatedAt`,
      next.threadId,
      next.pendingTurnCount,
      next.lastConsolidatedMessageId,
      next.lastCaptureNoticeJson,
      next.lastCompressedMessageId,
      next.uncompressedRoundCount,
      next.completedMessageCountAtProfileUpdate,
      next.lastProfileUpdatedAt,
      next.profileUpdateCooldownUntil,
      next.lastMaintenanceError,
      next.lastMaintenanceModelProviderId,
      next.lastMaintenanceModelId,
      next.lastMaintenanceCompletedAt,
      next.lastMaintenanceUsedFallback,
      next.updatedAt
    );
    return next;
  },
};

export default aiThreadRepository;
