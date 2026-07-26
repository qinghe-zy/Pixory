export interface MemoryQualitySample {
  expectedClaimIds: string[];
  selectedClaimIds: string[];
  staleSelectedCount: number;
  conflictSelectedCount: number;
  scopeLeakCount: number;
}

export interface MemoryQualityMetrics {
  recallAtK: number;
  staleRate: number;
  contradictionRate: number;
  scopeLeakRate: number;
}

export interface MaintenanceCostEnvelopeInput {
  dailyActiveUsers: number;
  messagesPerUserPerDay: number;
  lightExtractionCostPerCall: number;
  heavyMaintenanceEveryNRounds: number;
  heavyMaintenanceCostPerCall: number;
  generationCostPerMessage: number;
}

export interface MaintenanceCostEnvelope {
  messagesPerDay: number;
  lightCallsPerDay: number;
  heavyCallsPerDay: number;
  maintenanceCostPerDay: number;
  generationCostPerDay: number;
  maintenanceShare: number;
}

export function computeMemoryQualityMetrics(
  samples: MemoryQualitySample[],
  k = 6
): MemoryQualityMetrics {
  if (samples.length === 0) {
    return { contradictionRate: 0, recallAtK: 0, scopeLeakRate: 0, staleRate: 0 };
  }
  const safeK = Math.max(1, Math.floor(k));
  let expectedCount = 0;
  let hitCount = 0;
  let selectedCount = 0;
  let staleCount = 0;
  let conflictCount = 0;
  let leakCount = 0;
  for (const sample of samples) {
    const expected = new Set(sample.expectedClaimIds);
    const selected = sample.selectedClaimIds.slice(0, safeK);
    expectedCount += expected.size;
    hitCount += selected.filter((id) => expected.has(id)).length;
    selectedCount += selected.length;
    staleCount += Math.max(0, sample.staleSelectedCount);
    conflictCount += Math.max(0, sample.conflictSelectedCount);
    leakCount += Math.max(0, sample.scopeLeakCount);
  }
  return {
    contradictionRate: conflictCount / Math.max(1, selectedCount),
    recallAtK: hitCount / Math.max(1, expectedCount),
    scopeLeakRate: leakCount / Math.max(1, selectedCount),
    staleRate: staleCount / Math.max(1, selectedCount),
  };
}

export function estimateMaintenanceCostEnvelope(
  input: MaintenanceCostEnvelopeInput
): MaintenanceCostEnvelope {
  const messagesPerDay = Math.max(0, input.dailyActiveUsers) * Math.max(0, input.messagesPerUserPerDay);
  const lightCallsPerDay = messagesPerDay;
  const cadence = Math.max(1, Math.floor(input.heavyMaintenanceEveryNRounds));
  const heavyCallsPerDay = Math.ceil(messagesPerDay / cadence);
  const maintenanceCostPerDay =
    lightCallsPerDay * Math.max(0, input.lightExtractionCostPerCall)
    + heavyCallsPerDay * Math.max(0, input.heavyMaintenanceCostPerCall);
  const generationCostPerDay = messagesPerDay * Math.max(0, input.generationCostPerMessage);
  return {
    generationCostPerDay,
    heavyCallsPerDay,
    lightCallsPerDay,
    maintenanceCostPerDay,
    maintenanceShare: maintenanceCostPerDay / Math.max(0.000001, generationCostPerDay),
    messagesPerDay,
  };
}

export const MemoryDiagnostics = {
  computeMemoryQualityMetrics,
  estimateMaintenanceCostEnvelope,
};
