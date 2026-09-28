export const singleBubbleTailReplayDefaultEnabled = true;

const FEATURE_FLAGS_URL = "https://mist01.com/feature-flags.json";
const FEATURE_FLAG_TIMEOUT_MS = 1500;

let cachedAiTailReplaySingleBubbleEnabled = singleBubbleTailReplayDefaultEnabled;

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("feature_flags_timeout")), ms);
  });
}

function parseRemoteFlag(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return singleBubbleTailReplayDefaultEnabled;
  }
  const value = (payload as { aiTailReplaySingleBubbleEnabled?: unknown })
    .aiTailReplaySingleBubbleEnabled;
  return typeof value === "boolean"
    ? value
    : singleBubbleTailReplayDefaultEnabled;
}

export function getAiTailReplaySingleBubbleEnabled(): boolean {
  return cachedAiTailReplaySingleBubbleEnabled;
}

export async function refreshAiTailReplaySingleBubbleEnabled(): Promise<boolean> {
  try {
    const response = await Promise.race([
      fetch(FEATURE_FLAGS_URL),
      timeoutAfter(FEATURE_FLAG_TIMEOUT_MS),
    ]);
    if (!response.ok) {
      return singleBubbleTailReplayDefaultEnabled;
    }
    const payload = await response.json();
    cachedAiTailReplaySingleBubbleEnabled = parseRemoteFlag(payload);
    return cachedAiTailReplaySingleBubbleEnabled;
  } catch {
    cachedAiTailReplaySingleBubbleEnabled =
      singleBubbleTailReplayDefaultEnabled;
    return singleBubbleTailReplayDefaultEnabled;
  }
}
