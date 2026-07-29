import type { PixorySpace } from '../database';

export type AiGenerationTimestampKey =
  | 'sendPressedAt'
  | 'userMessagePersistStartAt'
  | 'userMessagePersistEndAt'
  | 'assistantPlaceholderPersistStartAt'
  | 'assistantPlaceholderPersistEndAt'
  | 'generationStartAt'
  | 'providerResolveStartAt'
  | 'providerResolveEndAt'
  | 'branchResolveStartAt'
  | 'branchResolveEndAt'
  | 'memoryResolveStartAt'
  | 'memoryResolveEndAt'
  | 'retrievalStartAt'
  | 'retrievalEndAt'
  | 'historyLoadStartAt'
  | 'historyLoadEndAt'
  | 'promptBuildStartAt'
  | 'promptBuildEndAt'
  | 'providerRequestSentAt'
  | 'firstProviderDeltaAt'
  | 'firstUiPatchAt'
  | 'lastProviderDeltaAt'
  | 'finalPersistStartAt'
  | 'finalPersistEndAt'
  | 'generationSettledAt';

export interface AiGenerationMetricsDraft {
  version: 2;
  timestamps: Partial<Record<AiGenerationTimestampKey, string>>;
  counters: {
    providerDeltaCount: number;
    answerDeltaCount: number;
    reasoningDeltaCount: number;
    streamUiPatchCount: number;
    streamPersistCount: number;
    streamMergedDeltaCount: number;
    streamSkippedUiPatchCount: number;
    streamSkippedPersistCount: number;
    maxBufferedChars: number;
    maxUiBacklogChars: number;
    maxUiBacklogAgeMs: number;
    providerAnswerChars: number;
    providerReasoningChars: number;
    providerEventHandlerTotalMs: number;
    partialPersistTotalMs: number;
    detachedTailMergeTotalMs: number;
    finalAnswerChars: number;
    finalReasoningChars: number;
  };
  context: {
    space: PixorySpace;
    threadId: string;
    messageId: string;
    generationId: string;
    providerId: string | null;
    modelId: string | null;
    chatMode: string | null;
    chatPerformanceProfile: string | null;
    fastPathClassification: string | null;
    contextType: string | null;
    branchScopeCount: number;
    historyMessageCount: number;
    loadedMessageCountAtSend: number;
    coverageComplete: boolean;
    coverageSummarySegmentCount: number;
    coverageBridgeMessageCount: number;
    coverageProvisionalMessageCount: number;
    coverageLineageVersion: number | null;
    coverageBranchRouteHash: string | null;
    companionEventCount: number;
    companionDiagnosticCandidateCount: number;
    companionOptionalCandidateCount: number;
    companionSelectedTopicType: string | null;
    companionObserverDurationMs: number;
    companionCompilerDurationMs: number;
    companionPolicyVersion: string | null;
    companionProjectionVersion: string | null;
    companionStanceLabel: string | null;
    dynamicContextTokenCount: number;
    retrievalSnippetCount: number;
    memoryEpoch: string | null;
    memoryProjectionVersion: number | null;
    memoryRetrievalScorerVersion: string | null;
    memoryRetrievalCandidateCount: number;
    memoryRetrievalInjectedCount: number;
    memoryModelCalls: number;
    memoryModelCost: number | null;
    stablePrefixEstimatedTokens: number | null;
    totalPromptTokens: number | null;
    cachedInputTokens: number | null;
    cachedTokenRatio: number | null;
    retrievalMode: string | null;
    retrievalPartial: boolean;
    retrievalSkippedReason: string | null;
    retrievalTimedOut: boolean;
    stopReason: string | null;
    failureReason: string | null;
    modelContextWindowTokens: number | null;
    streamingTargetFps: number | null;
    devicePressureThrottled: boolean;
  };
}

export interface AiGenerationMetrics extends AiGenerationMetricsDraft {
  durations: {
    sendToProviderRequestMs: number | null;
    providerRequestToFirstDeltaMs: number | null;
    sendToFirstDeltaMs: number | null;
    firstDeltaToFirstUiPatchMs: number | null;
    sendToFirstVisibleTextMs: number | null;
    promptPipelineMs: number | null;
    retrievalMs: number | null;
    memoryMs: number | null;
    historyLoadMs: number | null;
    finalizationMs: number | null;
    totalGenerationMs: number | null;
  };
}

export const FORBIDDEN_GENERATION_METRIC_KEYS = [
  'prompt',
  'promptText',
  'system',
  'systemPrompt',
  'user',
  'userMessage',
  'assistant',
  'assistantReply',
  'memory',
  'memoryText',
  'retrieved',
  'retrievedText',
  'materialText',
  'snippetText',
  'content',
] as const;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createGenerationMetricsDraft(input: {
  space: PixorySpace;
  threadId: string;
  messageId: string;
  generationId: string;
  contextType?: string | null;
  loadedMessageCountAtSend?: number;
  sendPressedAt?: string | null;
}): AiGenerationMetricsDraft {
  const draft: AiGenerationMetricsDraft = {
    version: 2,
    timestamps: {},
    counters: {
      providerDeltaCount: 0,
      answerDeltaCount: 0,
      reasoningDeltaCount: 0,
      streamUiPatchCount: 0,
      streamPersistCount: 0,
      streamMergedDeltaCount: 0,
      streamSkippedUiPatchCount: 0,
      streamSkippedPersistCount: 0,
      maxBufferedChars: 0,
      maxUiBacklogChars: 0,
      maxUiBacklogAgeMs: 0,
      providerAnswerChars: 0,
      providerReasoningChars: 0,
      providerEventHandlerTotalMs: 0,
      partialPersistTotalMs: 0,
      detachedTailMergeTotalMs: 0,
      finalAnswerChars: 0,
      finalReasoningChars: 0,
    },
    context: {
      space: input.space,
      threadId: input.threadId,
      messageId: input.messageId,
      generationId: input.generationId,
      providerId: null,
      modelId: null,
      chatMode: null,
      chatPerformanceProfile: null,
      fastPathClassification: null,
      contextType: input.contextType ?? null,
      branchScopeCount: 0,
      historyMessageCount: 0,
      loadedMessageCountAtSend: input.loadedMessageCountAtSend ?? 0,
      coverageComplete: false,
      coverageSummarySegmentCount: 0,
      coverageBridgeMessageCount: 0,
      coverageProvisionalMessageCount: 0,
      coverageLineageVersion: null,
      coverageBranchRouteHash: null,
      companionEventCount: 0,
      companionDiagnosticCandidateCount: 0,
      companionOptionalCandidateCount: 0,
      companionSelectedTopicType: null,
      companionObserverDurationMs: 0,
      companionCompilerDurationMs: 0,
      companionPolicyVersion: null,
      companionProjectionVersion: null,
      companionStanceLabel: null,
      dynamicContextTokenCount: 0,
      retrievalSnippetCount: 0,
      memoryEpoch: null,
      memoryProjectionVersion: null,
      memoryRetrievalScorerVersion: null,
      memoryRetrievalCandidateCount: 0,
      memoryRetrievalInjectedCount: 0,
      memoryModelCalls: 0,
      memoryModelCost: null,
      stablePrefixEstimatedTokens: null,
      totalPromptTokens: null,
      cachedInputTokens: null,
      cachedTokenRatio: null,
      retrievalMode: null,
      retrievalPartial: false,
      retrievalSkippedReason: null,
      retrievalTimedOut: false,
      stopReason: null,
      failureReason: null,
      modelContextWindowTokens: null,
      streamingTargetFps: null,
      devicePressureThrottled: false,
    },
  };
  if (input.sendPressedAt) {
    markGenerationMetric(draft, 'sendPressedAt', input.sendPressedAt);
  }
  return draft;
}

export function markGenerationMetric(
  draft: AiGenerationMetricsDraft,
  key: AiGenerationTimestampKey,
  value: string = nowIso()
): void {
  draft.timestamps[key] = value;
}

function msBetween(start?: string, end?: string): number | null {
  if (!start || !end) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return endMs - startMs;
}

export function finalizeGenerationMetrics(draft: AiGenerationMetricsDraft): AiGenerationMetrics {
  const { timestamps } = draft;
  return {
    ...draft,
    durations: {
      sendToProviderRequestMs: msBetween(timestamps.sendPressedAt, timestamps.providerRequestSentAt),
      providerRequestToFirstDeltaMs: msBetween(timestamps.providerRequestSentAt, timestamps.firstProviderDeltaAt),
      sendToFirstDeltaMs: msBetween(timestamps.sendPressedAt, timestamps.firstProviderDeltaAt),
      firstDeltaToFirstUiPatchMs: msBetween(timestamps.firstProviderDeltaAt, timestamps.firstUiPatchAt),
      sendToFirstVisibleTextMs: msBetween(timestamps.sendPressedAt, timestamps.firstUiPatchAt),
      promptPipelineMs: msBetween(timestamps.promptBuildStartAt, timestamps.promptBuildEndAt),
      retrievalMs: msBetween(timestamps.retrievalStartAt, timestamps.retrievalEndAt),
      memoryMs: msBetween(timestamps.memoryResolveStartAt, timestamps.memoryResolveEndAt),
      historyLoadMs: msBetween(timestamps.historyLoadStartAt, timestamps.historyLoadEndAt),
      finalizationMs: msBetween(timestamps.finalPersistStartAt, timestamps.finalPersistEndAt),
      totalGenerationMs: msBetween(timestamps.generationStartAt, timestamps.generationSettledAt),
    },
  };
}

export function assertContentFreeGenerationMetrics(metrics: unknown): void {
  const serialized = JSON.stringify(metrics);
  for (const key of FORBIDDEN_GENERATION_METRIC_KEYS) {
    if (new RegExp(`"${key}"\\s*:`, 'i').test(serialized)) {
      throw new Error(`generationMetrics contains forbidden content-like key: ${key}`);
    }
  }
}

export function toGenerationFailureCode(reason: unknown): string {
  if (typeof reason === 'string') {
    const knownCode = reason.trim().toLowerCase();
    if (/^[a-z][a-z0-9_:-]{0,79}$/.test(knownCode)) {
      return knownCode;
    }
    return 'generation_failed';
  }
  if (reason instanceof Error) {
    return reason.name === 'AbortError' ? 'abort_error' : 'generation_failed';
  }
  return 'generation_failed';
}

export function redactGenerationMetricsForDiagnostics(metrics: AiGenerationMetrics): AiGenerationMetrics {
  assertContentFreeGenerationMetrics(metrics);
  return metrics;
}
