import type { AiMessageRecord } from '../../database/repositories/aiThreadRepository';
import type { PixorySpace } from '../../database/db';
import { buildSkeletonBridge, hashCoverageMessageVersions, type ConversationCoveragePlan, type CoverageSegment } from './conversationCoverage';
import { estimateCompiledRequestTokens, requestInputBudget, type RequestBudgetPolicy, type RequestBudgetReceipt } from './providerRequestBudget';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { estimateCalibratedPromptTokens, estimatePromptTokens } from '../aiContextBudget';

type HistoryMessage = { role: 'assistant' | 'user'; content: string };

export interface ContextPlanSources {
  providerId: string;
  modelId: string;
  roleCardId: string | null;
  roleVersionHash: string;
  memoryProjectionVersion: number;
  memorySegmentHashes: string[];
  selectedEvidenceIds: string[];
  retrieval: Array<{ chunkId: string; documentVersion: string | null }>;
  attachmentIds: string[];
}

function freezeValue<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freezeValue(item);
    Object.freeze(value);
  }
  return value;
}

export interface ContextPlan {
  readonly version: 1;
  readonly space: PixorySpace;
  readonly threadId: string;
  readonly branchRouteHash: string;
  readonly lineageVersion: number;
  readonly coverage: Readonly<ConversationCoveragePlan>;
  readonly budget: Readonly<RequestBudgetReceipt>;
  readonly degradationReason: 'input_budget' | null;
  readonly sources: Readonly<ContextPlanSources> | null;
  readonly requestTextHash: string;
}

export function finalizeContextRequest(input: {
  space: PixorySpace;
  coverage: ConversationCoveragePlan;
  sourceMessages: AiMessageRecord[];
  systemPrompt: string;
  userPrompt: string;
  history: HistoryMessage[];
  attachmentCount: number;
  budgetPolicy: RequestBudgetPolicy;
  sources?: ContextPlanSources;
}): { plan: ContextPlan; history: HistoryMessage[]; userPrompt: string; historyMessageIds: string[] } {
  const budget = requestInputBudget(input.budgetPolicy);
  if (input.history.length < input.sourceMessages.length) throw new Error('Context compiler lost planned history.');
  const raw = input.sourceMessages;
  const estimateTokens = (text: string) => input.budgetPolicy?.providerProtocol || input.budgetPolicy?.isDeepSeek !== undefined
    ? estimateCalibratedPromptTokens(text, { isDeepSeek: input.budgetPolicy.isDeepSeek, providerProtocol: input.budgetPolicy.providerProtocol })
    : estimatePromptTokens(text);
  const historyTokenPrefix = [0];
  for (const message of input.history) historyTokenPrefix.push(historyTokenPrefix.at(-1)! + 16 + estimateTokens(message.content));
  const originalUserTokens = estimateTokens(input.userPrompt);
  const fixedTokens = estimateCompiledRequestTokens({ system: input.systemPrompt, messages: [{ role: 'user', content: [
    { type: 'text', text: input.userPrompt },
    ...Array.from({ length: input.attachmentCount }, () => ({ type: 'image' })),
  ] }] }, input.budgetPolicy);
  const evaluate = (removedRounds: number) => {
    const removed = raw.slice(0, removedRounds * 2);
    const bridge = buildSkeletonBridge(removed);
    const gapNotice = bridge.uncoveredMessageIds.length ? '\n[Historical source gap: some older rounds are omitted by the input budget.]' : '';
    const userPrompt = [bridge.text, gapNotice, input.userPrompt].filter(Boolean).join('\n\n');
    const history = input.history.slice(removed.length);
    const estimatedInputTokens = fixedTokens - originalUserTokens + estimateTokens(userPrompt)
      + historyTokenPrefix.at(-1)! - historyTokenPrefix[removed.length];
    return { removed, bridge, userPrompt, history, estimatedInputTokens, fits: estimatedInputTokens <= budget.inputBudgetTokens };
  };
  let selected = evaluate(0);
  if (!selected.fits) {
    let low = 1;
    let high = Math.floor(raw.length / 2);
    // Find the smallest complete-round removal that fits, preserving recent history.
    selected = evaluate(high);
    if (!selected.fits) throw new Error('本轮输入、必要上下文或附件超过模型预算，无法安全发送。');
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (evaluate(middle).fits) high = middle;
      else low = middle + 1;
    }
    selected = evaluate(low);
  }
  const kept = raw.slice(selected.removed.length);
  const represented = new Set(selected.bridge.representedMessageIds);
  const excerpts = selected.removed.filter(message => represented.has(message.id));
  const segments: CoverageSegment[] = input.coverage.segments.filter(segment => segment.representation !== 'full_transcript');
  if (excerpts.length) segments.push({ representation: 'skeleton_degraded', sourceMessageIds: excerpts.map(message => message.id),
    sourceMessageVersionHash: hashCoverageMessageVersions(excerpts) });
  if (kept.length) segments.push({ representation: 'full_transcript', sourceMessageIds: kept.map(message => message.id),
    sourceMessageVersionHash: hashCoverageMessageVersions(kept) });
  const coverage: ConversationCoveragePlan = {
    ...input.coverage, segments, recentMessageIds: kept.map(message => message.id),
    rawStartMessageId: kept[0]?.id ?? null,
    provisionalSourceMessageIds: [...new Set([...input.coverage.provisionalSourceMessageIds, ...selected.bridge.representedMessageIds])],
    uncoveredMessageIds: [...new Set([...input.coverage.uncoveredMessageIds, ...selected.bridge.uncoveredMessageIds])],
    coverageComplete: input.coverage.uncoveredMessageIds.length === 0 && selected.bridge.uncoveredMessageIds.length === 0,
  };
  // Publish a detached immutable value; no model content is stored in this audit object.
  const frozenCoverage = freezeValue(JSON.parse(JSON.stringify(coverage)) as ConversationCoveragePlan);
  const sources = input.sources ? freezeValue(JSON.parse(JSON.stringify(input.sources)) as ContextPlanSources) : null;
  return {
    plan: Object.freeze({ version: 1, space: input.space, threadId: coverage.threadId,
      branchRouteHash: coverage.branchRouteHash, lineageVersion: coverage.lineageVersion,
      coverage: frozenCoverage, budget: Object.freeze({ ...budget, estimatedInputTokens: selected.estimatedInputTokens, fits: true }),
      sources,
      requestTextHash: bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([input.systemPrompt, selected.history, selected.userPrompt])))),
      degradationReason: selected.removed.length || input.coverage.segments.some(segment => segment.representation === 'skeleton_degraded')
        || input.coverage.uncoveredMessageIds.length ? 'input_budget' : null }),
    history: selected.history, userPrompt: selected.userPrompt, historyMessageIds: coverage.recentMessageIds,
  };
}
