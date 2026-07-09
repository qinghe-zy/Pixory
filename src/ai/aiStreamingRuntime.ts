export type StreamingVisibilityState = {
  appActive?: boolean;
  bottomLocked: boolean;
  devicePressure?: boolean;
  routeFocused?: boolean;
};

export type StreamingFlushReason = 'background' | 'completion' | 'error' | 'route_blur' | 'stop';

export const STREAMING_RECOVERABILITY_PERSIST_INTERVAL_MS = 500;
export const STREAMING_PRESSURE_DELAY_MS = 250;
export const STREAMING_PRESSURE_RECOVERY_MS = 120;
export const STREAMING_PRESSURE_WINDOWS_REQUIRED = 2;

export function canPublishStreamingPatch(input: StreamingVisibilityState): boolean {
  return input.appActive !== false && input.routeFocused !== false;
}

export function targetStreamingFps(input: StreamingVisibilityState & { visibleChars: number }): number {
  if (!canPublishStreamingPatch(input)) {
    return 0;
  }
  if (!input.bottomLocked) {
    return input.devicePressure ? 8 : 12;
  }
  if (input.visibleChars <= 1000) {
    return input.devicePressure ? 30 : 60;
  }
  if (input.visibleChars <= 4000) {
    return input.devicePressure ? 24 : 45;
  }
  return input.devicePressure ? 18 : 30;
}

export function targetStreamingPatchIntervalMs(input: StreamingVisibilityState & { visibleChars: number }): number | null {
  const fps = targetStreamingFps(input);
  return fps > 0 ? Math.ceil(1000 / fps) : null;
}

export function targetStreamingDisplayStep(input: {
  backlogChars: number;
  devicePressure?: boolean;
  visibleChars: number;
}): number {
  if (input.backlogChars <= 0) {
    return 0;
  }
  const pressureScale = input.devicePressure ? 0.72 : 1;
  const longTextScale = input.visibleChars > 4000 ? 1.35 : input.visibleChars > 1000 ? 1.15 : 1;
  if (input.backlogChars <= 24) {
    return Math.max(1, Math.ceil(6 * pressureScale));
  }
  if (input.backlogChars <= 120) {
    return Math.ceil(18 * pressureScale * longTextScale);
  }
  if (input.backlogChars <= 600) {
    return Math.ceil(48 * pressureScale * longTextScale);
  }
  return Math.ceil(120 * pressureScale * longTextScale);
}

export function targetPersistIntervalMs(): number {
  return STREAMING_RECOVERABILITY_PERSIST_INTERVAL_MS;
}

export function shouldForceStreamingFlush(reason: StreamingFlushReason): boolean {
  return reason === 'background' || reason === 'completion' || reason === 'error' || reason === 'route_blur' || reason === 'stop';
}

export function updateStreamingDevicePressure(input: {
  consecutivePressureWindows: number;
  observedDelayMs: number;
}): { consecutivePressureWindows: number; devicePressureThrottled: boolean } {
  if (input.observedDelayMs > STREAMING_PRESSURE_DELAY_MS) {
    const consecutivePressureWindows = input.consecutivePressureWindows + 1;
    return {
      consecutivePressureWindows,
      devicePressureThrottled: consecutivePressureWindows >= STREAMING_PRESSURE_WINDOWS_REQUIRED,
    };
  }
  if (input.observedDelayMs < STREAMING_PRESSURE_RECOVERY_MS) {
    return { consecutivePressureWindows: 0, devicePressureThrottled: false };
  }
  return {
    consecutivePressureWindows: input.consecutivePressureWindows,
    devicePressureThrottled: input.consecutivePressureWindows >= STREAMING_PRESSURE_WINDOWS_REQUIRED,
  };
}
