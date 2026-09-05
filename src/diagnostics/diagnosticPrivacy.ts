const SENSITIVE_KEY = /^(apiKey|authorization|cookie|setCookie|secret|password|base64|base64Data|prompt|promptText|systemPrompt|userPrompt|content|contentText|reasoning|reasoningText|response|responseBody|filename|fileName|path|uri|localUri)$/i;
const SECRET_VALUE = /(Bearer\s+[A-Za-z0-9._~+/=-]+|sk-[A-Za-z0-9_-]{8,}|api[_-]?key\s*[:=])/gi;
function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') return sanitizeDiagnosticPayload(value as Record<string, unknown>);
  if (typeof value === 'string') return value.replace(SECRET_VALUE, '[REDACTED]');
  return typeof value === 'function' ? undefined : value;
}
export function sanitizeDiagnosticPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEY.test(key)) continue;
    const sanitized = sanitizeValue(value);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}
