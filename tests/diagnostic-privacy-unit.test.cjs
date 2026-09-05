const test = require('node:test');
const assert = require('node:assert/strict');

test('diagnostic privacy removes secrets and content-bearing fields recursively', async () => {
  const { sanitizeDiagnosticPayload } = await import('../src/diagnostics/diagnosticPrivacy.ts');
  const sanitized = sanitizeDiagnosticPayload({ apiKey: 'secret', nested: { authorization: 'Bearer x', content: 'private', ok: 1 }, promptTokens: 1200, cachedInputTokens: 900, requestBodyBytes: 42, message: 'Bearer abcdefghijklmnop' });
  assert.deepEqual(sanitized.nested, { ok: 1 });
  assert.equal(sanitized.apiKey, undefined);
  assert.equal(sanitized.promptTokens, 1200);
  assert.equal(sanitized.cachedInputTokens, 900);
  assert.equal(sanitized.requestBodyBytes, 42);
  assert.equal(sanitized.message, '[REDACTED]');
});
