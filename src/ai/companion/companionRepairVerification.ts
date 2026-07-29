export interface CompanionRepairVerificationResult {
  violated: boolean;
}

export function parseCompanionRepairVerification(value: string): CompanionRepairVerificationResult | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const keys = Object.keys(parsed);
    if (keys.length !== 1 || keys[0] !== 'violated') return null;
    const violated = (parsed as Record<string, unknown>).violated;
    return typeof violated === 'boolean' ? { violated } : null;
  } catch {
    return null;
  }
}
