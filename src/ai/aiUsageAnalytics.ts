export interface AiUsageObservationSource {
  id: string;
  threadId: string;
  providerId: string | null;
  modelId: string | null;
  promptSnapshotJson: string;
  createdAt: string;
  completedAt: string | null;
}

export interface AiUsageRound {
  id: string;
  providerId: string;
  modelId: string;
  createdAt: string;
  totalPromptTokens: number;
  completionTokens: number;
  cachedInputTokens: number;
  nonCachedInputTokens: number;
  totalTokens: number;
  cacheObserved: boolean;
  cachedTokenRatio: number | null;
}

export interface AiUsageModelBreakdown {
  key: string;
  providerId: string;
  modelId: string;
  totalPromptTokens: number;
  completionTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface AiUsageAggregate {
  requestCount: number;
  observedRequestCount: number;
  cacheObservedRequestCount: number;
  totalPromptTokens: number;
  completionTokens: number;
  cachedInputTokens: number;
  cacheUnobservedPromptTokens: number;
  nonCachedInputTokens: number;
  totalTokens: number;
  cachedTokenRatio: number | null;
  modelBreakdown: AiUsageModelBreakdown[];
  recentRounds: AiUsageRound[];
}

interface CacheObservationUsage {
  totalPromptTokens?: unknown;
  promptTokens?: unknown;
  completionTokens?: unknown;
  cachedInputTokens?: unknown;
  cacheMissInputTokens?: unknown;
  cacheCreationInputTokens?: unknown;
  cacheReadInputTokens?: unknown;
  cacheFieldsObserved?: unknown;
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function hasObservedCacheFields(usage: CacheObservationUsage): boolean {
  if (typeof usage.cacheFieldsObserved === 'boolean') {
    return usage.cacheFieldsObserved;
  }
  return [
    usage.cachedInputTokens,
    usage.cacheMissInputTokens,
    usage.cacheCreationInputTokens,
    usage.cacheReadInputTokens,
  ].some((value) => finiteNumber(value) > 0);
}

function hasObservedUsageTokens(usage: CacheObservationUsage): boolean {
  return [
    usage.totalPromptTokens,
    usage.promptTokens,
    usage.completionTokens,
    usage.cachedInputTokens,
    usage.cacheCreationInputTokens,
    usage.cacheReadInputTokens,
  ].some((value) => finiteNumber(value) > 0);
}

function readUsageFromPromptSnapshot(promptSnapshotJson: string): CacheObservationUsage | null {
  try {
    const parsed = JSON.parse(promptSnapshotJson || '{}') as {
      cacheObservation?: {
        providerCache?: CacheObservationUsage;
        usage?: CacheObservationUsage;
      };
    };
    const usage = parsed.cacheObservation?.providerCache ?? parsed.cacheObservation?.usage ?? null;
    return usage && typeof usage === 'object' ? usage : null;
  } catch {
    return null;
  }
}

export function aggregateAiUsageObservations(input: {
  observations: AiUsageObservationSource[];
  recentLimit?: number;
}): AiUsageAggregate {
  const recentLimit = input.recentLimit ?? 12;
  const rounds: AiUsageRound[] = [];
  const breakdown = new Map<string, AiUsageModelBreakdown>();

  for (const observation of input.observations) {
    const usage = readUsageFromPromptSnapshot(observation.promptSnapshotJson);
    if (!usage) {
      continue;
    }
    if (!hasObservedUsageTokens(usage)) {
      continue;
    }

    const totalPromptTokens = finiteNumber(usage.totalPromptTokens);
    const completionTokens = finiteNumber(usage.completionTokens);
    const cachedInputTokens = Math.min(finiteNumber(usage.cachedInputTokens), totalPromptTokens);
    const cacheObserved = hasObservedCacheFields(usage);
    const nonCachedInputTokens = cacheObserved
      ? Math.max(totalPromptTokens - cachedInputTokens, 0)
      : 0;
    const totalTokens = totalPromptTokens + completionTokens;
    const providerId = observation.providerId || 'Unknown';
    const modelId = observation.modelId || 'Unknown';
    const round: AiUsageRound = {
      cacheObserved,
      cachedInputTokens,
      cachedTokenRatio: cacheObserved && totalPromptTokens > 0
        ? clampRatio(cachedInputTokens / totalPromptTokens)
        : null,
      completionTokens,
      createdAt: observation.completedAt ?? observation.createdAt,
      id: observation.id,
      modelId,
      nonCachedInputTokens,
      providerId,
      totalPromptTokens,
      totalTokens,
    };
    rounds.push(round);

    const key = `${providerId}:${modelId}`;
    const current = breakdown.get(key) ?? {
      cachedInputTokens: 0,
      completionTokens: 0,
      key,
      modelId,
      providerId,
      requestCount: 0,
      totalPromptTokens: 0,
      totalTokens: 0,
    };
    current.cachedInputTokens += cachedInputTokens;
    current.completionTokens += completionTokens;
    current.requestCount += 1;
    current.totalPromptTokens += totalPromptTokens;
    current.totalTokens += totalTokens;
    breakdown.set(key, current);
  }

  const totalPromptTokens = rounds.reduce((sum, round) => sum + round.totalPromptTokens, 0);
  const completionTokens = rounds.reduce((sum, round) => sum + round.completionTokens, 0);
  const cachedInputTokens = rounds.reduce((sum, round) => sum + round.cachedInputTokens, 0);
  const nonCachedInputTokens = rounds.reduce((sum, round) => sum + round.nonCachedInputTokens, 0);
  const totalTokens = totalPromptTokens + completionTokens;
  const cacheObservedRounds = rounds.filter((round) => round.cacheObserved);
  const cacheUnobservedPromptTokens = rounds
    .filter((round) => !round.cacheObserved)
    .reduce((sum, round) => sum + round.totalPromptTokens, 0);
  const cacheObservedPromptTokens = cacheObservedRounds.reduce((sum, round) => sum + round.totalPromptTokens, 0);
  const cacheObservedInputTokens = cacheObservedRounds.reduce((sum, round) => sum + round.cachedInputTokens, 0);

  return {
    cachedInputTokens,
    cachedTokenRatio: cacheObservedPromptTokens > 0
      ? clampRatio(cacheObservedInputTokens / cacheObservedPromptTokens)
      : null,
    cacheObservedRequestCount: cacheObservedRounds.length,
    cacheUnobservedPromptTokens,
    completionTokens,
    modelBreakdown: Array.from(breakdown.values()).sort((left, right) => right.totalTokens - left.totalTokens),
    nonCachedInputTokens,
    observedRequestCount: rounds.length,
    recentRounds: rounds.slice(0, recentLimit),
    requestCount: input.observations.length,
    totalPromptTokens,
    totalTokens,
  };
}
