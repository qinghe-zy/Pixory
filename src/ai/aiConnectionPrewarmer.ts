import {
  aiProviderRepository,
  runWithDatabaseSpace,
  settingsRepository,
  type PixorySpace,
} from '../database';

/**
 * 3-minute cooldown map for prewarmed host origins to prevent redundant network handshakes.
 */
const lastPrewarmedHostMap = new Map<string, number>();
const PREWARM_COOLDOWN_MS = 180000; // 3 minutes

/**
 * Normalizes a baseUrl to its protocol + host origin (e.g., "https://api.deepseek.com").
 */
function extractHostOrigin(baseUrl?: string | null): string | null {
  if (!baseUrl || typeof baseUrl !== 'string') {
    return null;
  }
  const trimmed = baseUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/**
 * Silently pre-warms the HTTP/TLS connection to an AI provider's baseUrl.
 *
 * How it works:
 * - On React Native (Android OkHttpClient), sending a lightweight HEAD request triggers DNS resolution,
 *   TCP handshake, and TLS handshake, and places the active socket into OkHttp's keep-alive ConnectionPool (5 min).
 * - When the user subsequently submits a message, the first network packet avoids 300~500ms of handshake latency.
 * - Non-blocking, completely error-swallowed, debounced to at most once per 3 minutes per host.
 */
export function prewarmAiConnectionByBaseUrl(baseUrl?: string | null): void {
  const origin = extractHostOrigin(baseUrl);
  if (!origin) {
    return;
  }

  const now = Date.now();
  const lastPrewarmed = lastPrewarmedHostMap.get(origin) ?? 0;
  if (now - lastPrewarmed < PREWARM_COOLDOWN_MS) {
    return;
  }
  lastPrewarmedHostMap.set(origin, now);

  // Trigger silent HEAD probe without credentials or payloads
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  fetch(origin, {
    method: 'HEAD',
    signal: controller.signal,
  })
    .catch(() => {
      // Intentionally swallowed: even 401/404 or connection closes establish TLS socket in OkHttp pool
    })
    .finally(() => {
      clearTimeout(timer);
    });
}

/**
 * Resolves the active or default AI provider for a space and silently pre-warms its connection.
 */
export async function prewarmDefaultAiConnection(
  space: PixorySpace = 'normal',
  preferredProviderId?: string | null
): Promise<void> {
  try {
    const baseUrl = await runWithDatabaseSpace(space, async (db) => {
      if (preferredProviderId) {
        const found = await aiProviderRepository.findProviderById(db, preferredProviderId);
        if (found?.baseUrl) {
          return found.baseUrl;
        }
      }
      const defaultProviderId = await settingsRepository.getDefaultAiProviderId(db);
      const providers = await aiProviderRepository.listProviders(db);
      const target = defaultProviderId
        ? providers.find((item) => item.id === defaultProviderId) ?? providers[0]
        : providers[0];
      return target?.baseUrl ?? null;
    });

    if (baseUrl) {
      prewarmAiConnectionByBaseUrl(baseUrl);
    }
  } catch {
    // Background silent prewarm should never disrupt UI or app flow
  }
}
