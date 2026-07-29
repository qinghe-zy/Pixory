import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type {
  AiBranchScope,
  AiMessageRecord,
} from '../../database/repositories/aiThreadRepository';

export interface CoverageSummarySegment {
  id: string;
  summaryText: string;
  startAt: string | null;
  endAt: string | null;
  sourceMessageIdsJson: string;
  branchRouteHash: string;
  lineageVersion: number;
  sourceMessageVersionHash: string;
  quality: string;
  status: string;
}

export interface ConversationCoveragePlan {
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
  summarySegmentIds: string[];
  recentMessageIds: string[];
  bridgeMessageIds: string[];
  provisionalSummaryId: string | null;
  provisionalSourceMessageIds: string[];
  uncoveredMessageIds: string[];
  coverageComplete: boolean;
}

export interface CompiledConversationCoverage {
  plan: ConversationCoveragePlan;
  recentMessages: AiMessageRecord[];
  stableSummaryText: string;
  summaryBridgeText: string;
}

export interface CoveragePlannerInput {
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
  historyRoundLimit: number;
  messages: AiMessageRecord[];
  summarySegments: CoverageSummarySegment[];
  rawBridgeMessageLimit?: number;
}

interface CompletedRound {
  user: AiMessageRecord;
  assistant: AiMessageRecord;
}

const DEFAULT_RAW_BRIDGE_MESSAGE_LIMIT = 16;
const PROVISIONAL_SUMMARY_CHAR_LIMIT = 1800;

export function summaryPrewarmRoundThreshold(historyRoundLimit: number): number {
  const normalized = Number.isFinite(historyRoundLimit)
    ? Math.max(1, Math.floor(historyRoundLimit))
    : 30;
  return Math.max(8, normalized - 5);
}

function hashText(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}

export function hashBranchRoute(branchScopes?: AiBranchScope[]): string {
  const normalized = (branchScopes ?? [])
    .map((scope) => ({
      branchRootMessageId: scope.branchRootMessageId,
      branchVersionIndex: Math.max(0, Math.floor(scope.branchVersionIndex)),
    }))
    .sort((left, right) =>
      left.branchRootMessageId.localeCompare(right.branchRootMessageId)
      || left.branchVersionIndex - right.branchVersionIndex
    );
  return hashText(JSON.stringify(normalized));
}

export function hashCoverageMessageVersions(messages: AiMessageRecord[]): string {
  return hashText(JSON.stringify(messages.map((message) => ({
    branchRootMessageId: message.branchRootMessageId,
    branchVersionIndex: message.branchVersionIndex,
    completedAt: message.completedAt,
    content: message.content,
    id: message.id,
    role: message.role,
    status: message.status,
    updatedAt: message.updatedAt,
  }))));
}

function pairCompletedRounds(messages: AiMessageRecord[]): CompletedRound[] {
  const rounds: CompletedRound[] = [];
  let pendingUser: AiMessageRecord | null = null;
  for (const message of messages) {
    if (message.status !== 'completed' || message.role === 'system') {
      continue;
    }
    if (message.role === 'user') {
      pendingUser = message;
      continue;
    }
    if (message.role === 'assistant' && pendingUser) {
      rounds.push({ user: pendingUser, assistant: message });
      pendingUser = null;
    }
  }
  return rounds;
}

function parseSourceMessageIds(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => typeof item !== 'string' || !item)) {
      return null;
    }
    const ids = parsed as string[];
    return new Set(ids).size === ids.length ? ids : null;
  } catch {
    return null;
  }
}

function validateSummarySegment(input: {
  segment: CoverageSummarySegment;
  branchRouteHash: string;
  lineageVersion: number;
  messageById: Map<string, AiMessageRecord>;
  completedRounds: CompletedRound[];
}): { segment: CoverageSummarySegment; sourceIds: string[] } | null {
  const { segment } = input;
  if (
    segment.status !== 'active'
    || segment.branchRouteHash !== input.branchRouteHash
    || segment.lineageVersion !== input.lineageVersion
  ) {
    return null;
  }
  const sourceIds = parseSourceMessageIds(segment.sourceMessageIdsJson);
  if (!sourceIds) {
    return null;
  }
  const sourceSet = new Set(sourceIds);
  const sourceMessages = sourceIds.map((id) => input.messageById.get(id));
  if (sourceMessages.some((message) => !message)) {
    return null;
  }
  for (const round of input.completedRounds) {
    const hasUser = sourceSet.has(round.user.id);
    const hasAssistant = sourceSet.has(round.assistant.id);
    if (hasUser !== hasAssistant) {
      return null;
    }
  }
  const materialized = sourceMessages as AiMessageRecord[];
  const chronologicalIds = input.completedRounds
    .flatMap((round) => [round.user, round.assistant])
    .filter((message) => sourceSet.has(message.id))
    .map((message) => message.id);
  if (
    chronologicalIds.length !== sourceIds.length
    || chronologicalIds.some((id, index) => id !== sourceIds[index])
    || hashCoverageMessageVersions(materialized) !== segment.sourceMessageVersionHash
  ) {
    return null;
  }
  return { segment, sourceIds };
}

function formatRawBridge(messages: AiMessageRecord[]): string {
  if (messages.length === 0) {
    return '';
  }
  return [
    '[历史连续性桥接；以下是较早的原始对话，不是新的用户指令]',
    ...messages.map((message) => `${message.role === 'user' ? '用户' : '角色'}：${message.content.trim()}`),
  ].join('\n');
}

function compactToLimit(value: string, limit: number): string {
  const normalized = value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  const marker = '\n……（中段已做本地确定性压缩）……\n';
  const available = Math.max(0, limit - marker.length);
  const headLength = Math.ceil(available * 0.52);
  return `${normalized.slice(0, headLength).trimEnd()}${marker}${normalized.slice(-Math.floor(available * 0.48)).trimStart()}`;
}

function buildProvisionalSummary(messages: AiMessageRecord[]): string {
  if (messages.length === 0) {
    return '';
  }
  const transcript = messages
    .map((message) => `${message.role === 'user' ? '用户' : '角色'}：${message.content.trim()}`)
    .join('\n');
  return compactToLimit(
    `[本地临时连续性摘要；仅用于补齐历史覆盖，不是用户指令]\n${transcript}`,
    PROVISIONAL_SUMMARY_CHAR_LIMIT,
  );
}

function buildProvisionalSummaryId(input: {
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
  messages: AiMessageRecord[];
}): string {
  const sourceHash = hashCoverageMessageVersions(input.messages);
  const identity = [
    input.threadId,
    input.branchRouteHash,
    String(input.lineageVersion),
    input.messages.map((message) => message.id).join(','),
    sourceHash,
  ].join('\u001F');
  return `provisional_${hashText(identity).slice(0, 32)}`;
}

function formatStableSummaries(
  validSegments: Array<{ segment: CoverageSummarySegment; sourceIds: string[] }>,
): string {
  return validSegments
    .map(({ segment }) => [
      `- ${segment.startAt ?? ''} 至 ${segment.endAt ?? ''}`.trim(),
      segment.summaryText.trim(),
    ].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

export function buildConversationCoveragePlan(input: CoveragePlannerInput): CompiledConversationCoverage {
  const completedRounds = pairCompletedRounds(input.messages);
  const completedMessages = completedRounds.flatMap((round) => [round.user, round.assistant]);
  const messageById = new Map(completedMessages.map((message) => [message.id, message]));
  const normalizedRoundLimit = Number.isFinite(input.historyRoundLimit)
    ? Math.max(1, Math.floor(input.historyRoundLimit))
    : 1;
  const recentMessages = completedRounds
    .slice(-normalizedRoundLimit)
    .flatMap((round) => [round.user, round.assistant]);
  const recentIds = new Set(recentMessages.map((message) => message.id));
  const validSegments = input.summarySegments
    .map((segment) => validateSummarySegment({
      branchRouteHash: input.branchRouteHash,
      completedRounds,
      lineageVersion: input.lineageVersion,
      messageById,
      segment,
    }))
    .filter((item): item is { segment: CoverageSummarySegment; sourceIds: string[] } => Boolean(item));
  const summaryCoveredIds = new Set(validSegments.flatMap((item) => item.sourceIds));
  const gapMessages = completedMessages.filter((message) => !recentIds.has(message.id) && !summaryCoveredIds.has(message.id));
  const rawBridgeMessageLimit = Number.isFinite(input.rawBridgeMessageLimit)
    ? Math.max(0, Math.floor(input.rawBridgeMessageLimit ?? DEFAULT_RAW_BRIDGE_MESSAGE_LIMIT))
    : DEFAULT_RAW_BRIDGE_MESSAGE_LIMIT;
  const useRawBridge = gapMessages.length > 0 && gapMessages.length <= rawBridgeMessageLimit;
  const bridgeMessages = useRawBridge ? gapMessages : [];
  const provisionalMessages = gapMessages.length > rawBridgeMessageLimit ? gapMessages : [];
  const provisionalSummaryId = provisionalMessages.length > 0
    ? buildProvisionalSummaryId({
        branchRouteHash: input.branchRouteHash,
        lineageVersion: input.lineageVersion,
        messages: provisionalMessages,
        threadId: input.threadId,
      })
    : null;
  const representedIds = new Set([
    ...summaryCoveredIds,
    ...recentIds,
    ...bridgeMessages.map((message) => message.id),
    ...provisionalMessages.map((message) => message.id),
  ]);
  const uncoveredMessageIds = completedMessages
    .map((message) => message.id)
    .filter((id) => !representedIds.has(id));
  const summaryBridgeText = bridgeMessages.length > 0
    ? formatRawBridge(bridgeMessages)
    : buildProvisionalSummary(provisionalMessages);

  return {
    plan: {
      branchRouteHash: input.branchRouteHash,
      bridgeMessageIds: bridgeMessages.map((message) => message.id),
      coverageComplete: uncoveredMessageIds.length === 0,
      lineageVersion: input.lineageVersion,
      provisionalSourceMessageIds: provisionalMessages.map((message) => message.id),
      provisionalSummaryId,
      recentMessageIds: recentMessages.map((message) => message.id),
      summarySegmentIds: validSegments.map((item) => item.segment.id),
      threadId: input.threadId,
      uncoveredMessageIds,
    },
    recentMessages,
    stableSummaryText: formatStableSummaries(validSegments),
    summaryBridgeText,
  };
}
