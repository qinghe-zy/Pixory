import { normalizeBaseUrl } from './providers/base';

export type ProviderConnectionImportResult =
  | { ok: true; apiKey: string; baseUrl: string; hasPath: boolean }
  | { ok: false; reason: 'invalid_json' | 'invalid_shape' | 'missing_fields' | 'invalid_url' | 'unsupported_url' };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseProviderConnectionImport(raw: string): ProviderConnectionImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  if (!isPlainRecord(parsed)) {
    return { ok: false, reason: 'invalid_shape' };
  }

  const record = parsed;
  if (typeof record.url !== 'string' || typeof record.key !== 'string') {
    return { ok: false, reason: 'missing_fields' };
  }

  const apiKey = record.key.trim();
  if (!record.url.trim() || !apiKey) {
    return { ok: false, reason: 'missing_fields' };
  }

  let url: URL;
  try {
    url = new URL(record.url.trim());
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (url.search || url.hash) {
    return { ok: false, reason: 'unsupported_url' };
  }
  const baseUrl = normalizeBaseUrl(record.url);

  return { ok: true, baseUrl, apiKey, hasPath: url.pathname !== '/' };
}
