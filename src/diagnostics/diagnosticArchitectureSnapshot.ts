import { DATABASE_VERSION } from '../database/schema';
export function buildDiagnosticArchitectureSnapshot(input: { appVersion?: string; modelId?: string | null; providerType?: string | null; promptVersion?: number | null; historyRoundLimit?: number | null; space: 'normal' | 'personal' }) {
  return {
    appVersion: input.appVersion ?? 'unknown',
    databaseVersion: DATABASE_VERSION,
    diagnosticsVersion: 1,
    historyRoundLimit: input.historyRoundLimit ?? null,
    modelId: input.modelId ?? null,
    privacy: { contentCapture: 'deep_export_only', secrets: 'never', space: input.space },
    promptVersion: input.promptVersion ?? null,
    providerType: input.providerType ?? null,
    generatedAt: new Date().toISOString(),
  };
}
