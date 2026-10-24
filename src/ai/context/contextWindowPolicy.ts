export interface ContextWindowPolicy {
  windowTarget: number;
  maxBuffer: number;
  chunkSize: number;
}

export function contextWindowPolicy(target: number): ContextWindowPolicy {
  const windowTarget = Number.isFinite(target) ? Math.min(2500, Math.max(4, Math.floor(target))) : 30;
  const maxBuffer = Math.min(32, Math.max(2, Math.ceil(windowTarget / 4)));
  return { windowTarget, maxBuffer, chunkSize: Math.min(maxBuffer, 25) };
}

export function shouldPrewarmContext(input: {
  uncompressedRounds: number;
  target: number;
  availableTokens?: number;
  recentRoundTokens?: readonly number[];
  recentMaintenanceMs?: readonly number[];
  recentRoundIntervalMs?: readonly number[];
}): boolean {
  const policy = contextWindowPolicy(input.target);
  if (input.uncompressedRounds >= policy.windowTarget) return true;
  if (input.availableTokens == null) return false;
  const mean = (values: readonly number[] | undefined, fallback: number) => {
    const samples = values?.slice(-8).filter(value => Number.isFinite(value) && value > 0) ?? [];
    return samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : fallback;
  };
  const growth = mean(input.recentRoundTokens, 0);
  const roundsDuringMaintenance = Math.max(2, Math.ceil(
    mean(input.recentMaintenanceMs, 0) / mean(input.recentRoundIntervalMs, 30_000),
  ));
  return input.availableTokens < growth * roundsDuringMaintenance;
}
