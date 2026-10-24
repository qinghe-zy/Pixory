import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { contextWindowPolicy } from './contextWindowPolicy';
import { estimatePromptTokens } from '../aiContextBudget';

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
  segments: CoverageSegment[];
  windowTarget: number;
  maxBuffer: number;
  rawStartMessageId: string | null;
}

export interface CoverageSegment {
  representation: 'full_transcript' | 'model_summary' | 'skeleton_degraded';
  sourceMessageIds: string[];
  sourceMessageVersionHash: string;
  summarySegmentId?: string;
}

export interface ContextWindowSnapshot {
  windowTarget: number;
  rawStartMessageId: string | null;
  activeSummaryIds: string[];
}

export interface CompiledConversationCoverage {
  plan: ConversationCoveragePlan;
  recentMessages: AiMessageRecord[];
  stableSummaryText: string;
  summaryBridgeText: string;
  activatedSummaryIds?: string[];
}

export interface CoveragePlannerInput {
  threadId: string;
  branchRouteHash: string;
  lineageVersion: number;
  historyRoundLimit: number;
  messages: AiMessageRecord[];
  summarySegments: CoverageSummarySegment[];
  rawBridgeMessageLimit?: number;
  previousWindow?: ContextWindowSnapshot | null;
  summaryTokenBudget?: number;
}

interface CompletedRound {
  user: AiMessageRecord;
  assistant: AiMessageRecord;
}

export function summaryPrewarmRoundThreshold(historyRoundLimit: number): number {
  return contextWindowPolicy(historyRoundLimit).windowTarget;
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
    || !segment.summaryText.trim()
    || segment.quality !== 'model'
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
  const firstIndex = input.completedRounds.findIndex(round => round.user.id === sourceIds[0]);
  if (firstIndex < 0 || input.completedRounds.slice(firstIndex, firstIndex + sourceIds.length / 2)
    .flatMap(round => [round.user.id, round.assistant.id]).some((id, index) => id !== sourceIds[index])) return null;
  return { segment, sourceIds };
}

const PRIMARY_HEAD_PUNCTUATION = new Set(['。', '！', '？', '!', '?', '\n']);
const SECONDARY_HEAD_PUNCTUATION = new Set(['；', ';', '，', ',']);
const TAIL_SENTENCE_TERMINATORS = new Set(['。', '\n', '！', '？', '!', '?']);

function cleanBridgeText(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractSemanticHead(text: string, targetPoints = 40, minPoints = 12): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const points = Array.from(trimmed);
  if (points.length <= targetPoints) return cleanBridgeText(trimmed);

  const effectiveMin = Math.min(minPoints, Math.max(4, Math.floor(targetPoints / 2)));
  const searchLimit = Math.min(points.length - 2, targetPoints);
  // Level 1: Primary sentence punctuation
  for (let index = searchLimit; index >= effectiveMin; index -= 1) {
    if (PRIMARY_HEAD_PUNCTUATION.has(points[index])) {
      const excerpt = cleanBridgeText(points.slice(0, index + 1).join(''));
      return `${excerpt}...`;
    }
  }
  // Secondary clause punctuation
  for (let index = searchLimit; index >= effectiveMin; index -= 1) {
    if (SECONDARY_HEAD_PUNCTUATION.has(points[index])) {
      const excerpt = cleanBridgeText(points.slice(0, index + 1).join(''));
      return `${excerpt}...`;
    }
  }

  // Level 2: Safe Unicode code-point fallback
  const fallback = cleanBridgeText(points.slice(0, targetPoints).join(''));
  return `${fallback}...`;
}

export function extractSemanticTail(text: string, targetPoints = 60, minPoints = 12): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const points = Array.from(trimmed);
  if (points.length <= targetPoints) return cleanBridgeText(trimmed);

  const effectiveMin = Math.min(minPoints, Math.max(4, Math.floor(targetPoints / 2)));
  const searchStart = Math.max(1, points.length - targetPoints);
  const searchEnd = points.length - effectiveMin;
  // Level 1: Find start of final complete sentence
  for (let index = searchStart; index < searchEnd; index += 1) {
    if (TAIL_SENTENCE_TERMINATORS.has(points[index])) {
      let sentenceStart = index + 1;
      while (
        sentenceStart < points.length &&
        (points[sentenceStart] === ' ' || points[sentenceStart] === '\t' || points[sentenceStart] === '"' || points[sentenceStart] === '”' || points[sentenceStart] === '’')
      ) {
        sentenceStart += 1;
      }
      if (sentenceStart < points.length && points.length - sentenceStart >= effectiveMin) {
        const excerpt = cleanBridgeText(points.slice(sentenceStart).join(''));
        return `...${excerpt}`;
      }
    }
  }

  // Level 2: Safe Unicode code-point tail fallback
  const fallback = cleanBridgeText(points.slice(-targetPoints).join(''));
  return `...${fallback}`;
}

export function buildSkeletonBridge(messages: AiMessageRecord[], maxChars = 1800): {
  text: string; representedMessageIds: string[]; uncoveredMessageIds: string[];
} {
  const lines = ['[skeleton_degraded: historical excerpts; omitted text is not summarized]'];
  const representedMessageIds: string[] = [];
  const uncoveredMessageIds: string[] = [];
  let length = lines[0].length;
  for (const round of pairCompletedRounds(messages)) {
    // Multi-level semantic sentence-boundary backtracking with Unicode code-point safety
    const user = extractSemanticHead(round.user.content);
    const assistant = extractSemanticTail(round.assistant.content);
    const line = `${round.user.id}/${round.assistant.id} U: ${user} / A: ${assistant}`;
    if (length + line.length + 1 > maxChars) {
      uncoveredMessageIds.push(round.user.id, round.assistant.id);
      continue;
    }
    lines.push(line);
    length += line.length + 1;
    representedMessageIds.push(round.user.id, round.assistant.id);
  }
  return { text: representedMessageIds.length ? lines.join('\n') : '', representedMessageIds, uncoveredMessageIds };
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
  const policy = contextWindowPolicy(input.historyRoundLimit);
  const validSegments = input.summarySegments
    .map((segment) => validateSummarySegment({
      branchRouteHash: input.branchRouteHash,
      completedRounds,
      lineageVersion: input.lineageVersion,
      messageById,
      segment,
    }))
    .filter((item): item is { segment: CoverageSummarySegment; sourceIds: string[] } => Boolean(item));
  const positions = new Map(completedMessages.map((message, index) => [message.id, index]));
  const previous = input.previousWindow;
  const previousStart = previous?.rawStartMessageId ? positions.get(previous.rawStartMessageId) ?? 0 : 0;
  const expanded = previous != null && policy.windowTarget > previous.windowTarget;
  const rawRounds = completedRounds.length - previousStart / 2;
  const canSwap = rawRounds >= policy.windowTarget + policy.maxBuffer;
  const latestSummaryEnd = Math.max(0, completedRounds.length - policy.windowTarget) * 2;
  const allowed = validSegments.filter(item => {
    const start = positions.get(item.sourceIds[0])!;
    const end = start + item.sourceIds.length;
    if (end > latestSummaryEnd) return false;
    return expanded || canSwap || previous?.activeSummaryIds.includes(item.segment.id);
  }).sort((a, b) => positions.get(a.sourceIds[0])! - positions.get(b.sourceIds[0])!
    || b.sourceIds.length - a.sourceIds.length);
  // Only a contiguous, non-overlapping verified prefix may displace original text.
  let cursor = 0;
  const selected: typeof validSegments = [];
  for (const item of allowed) {
    if (positions.get(item.sourceIds[0]) !== cursor) continue;
    selected.push(item);
    cursor += item.sourceIds.length;
  }
  const recentMessages = completedMessages.slice(cursor);
  const injected: typeof selected = [];
  let summaryTokens = 0;
  for (const item of [...selected].reverse()) {
    const tokens = estimatePromptTokens(formatStableSummaries([item]));
    if (summaryTokens + tokens > (input.summaryTokenBudget ?? Infinity)) continue;
    injected.unshift(item); summaryTokens += tokens;
  }
  const injectedIds = new Set(injected.map(item => item.segment.id));
  const archivedSourceIds = new Set(selected.filter(item => !injectedIds.has(item.segment.id)).flatMap(item => item.sourceIds));
  const archivedSources = completedMessages.filter(message => archivedSourceIds.has(message.id));
  const bridge = buildSkeletonBridge(archivedSources);
  const segments: CoverageSegment[] = injected.map(item => ({
    representation: 'model_summary', sourceMessageIds: item.sourceIds,
    sourceMessageVersionHash: item.segment.sourceMessageVersionHash, summarySegmentId: item.segment.id,
  }));
  if (bridge.representedMessageIds.length) segments.unshift({ representation: 'skeleton_degraded',
    sourceMessageIds: bridge.representedMessageIds,
    sourceMessageVersionHash: hashCoverageMessageVersions(archivedSources.filter(message => bridge.representedMessageIds.includes(message.id))) });
  if (recentMessages.length) segments.push({ representation: 'full_transcript',
    sourceMessageIds: recentMessages.map(message => message.id), sourceMessageVersionHash: hashCoverageMessageVersions(recentMessages) });

  return {
    plan: {
      branchRouteHash: input.branchRouteHash,
      bridgeMessageIds: [],
      coverageComplete: bridge.uncoveredMessageIds.length === 0,
      lineageVersion: input.lineageVersion,
      provisionalSourceMessageIds: bridge.representedMessageIds,
      provisionalSummaryId: null,
      recentMessageIds: recentMessages.map((message) => message.id),
      summarySegmentIds: injected.map((item) => item.segment.id),
      threadId: input.threadId,
      uncoveredMessageIds: bridge.uncoveredMessageIds,
      segments,
      windowTarget: policy.windowTarget,
      maxBuffer: policy.maxBuffer,
      rawStartMessageId: recentMessages[0]?.id ?? null,
    },
    recentMessages,
    activatedSummaryIds: selected.map(item => item.segment.id),
    stableSummaryText: formatStableSummaries(injected),
    summaryBridgeText: [bridge.text, bridge.uncoveredMessageIds.length
      ? `[history_gap: ${bridge.uncoveredMessageIds.length} source messages omitted from this request; originals retained locally]` : ''].filter(Boolean).join('\n'),
  };
}
