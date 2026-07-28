import type { MemorySpeechMode } from '../memory/memoryTypes';
import type { CompanionEventCategory } from './companionTypes';

const VALID_CATEGORIES = new Set<CompanionEventCategory>(['interaction', 'user_affect', 'relationship', 'boundary', 'correction', 'commitment', 'temporal', 'artifact', 'assistant']);
const VALID_SPEECH_MODES = new Set<MemorySpeechMode>(['asserted', 'corrected', 'negated', 'hypothetical', 'joke', 'quoted', 'roleplay', 'uncertain']);

export interface ValidatedEnrichmentCandidate {
  category: CompanionEventCategory;
  subtype: string;
  confidence: number;
  speechMode: MemorySpeechMode;
  evidenceIds: string[];
  payload: Record<string, unknown>;
}

export function validateEnrichmentCommitGuard(input: {
  commitAt: string;
  expectedMessageVersionHash: string;
  expectedThreadId: string;
  workerId: string;
  job: { leaseOwner: string | null; leaseUntil: string | null; status: string; threadId: string } | null;
  message: { role: string; status: string; threadId: string; versionHash: string } | null;
}): 'ok' | 'lease_lost' | 'source_invalid' {
  if (
    !input.job
    || input.job.status !== 'running'
    || input.job.leaseOwner !== input.workerId
    || !input.job.leaseUntil
    || input.job.leaseUntil <= input.commitAt
  ) return 'lease_lost';
  if (
    input.job.threadId !== input.expectedThreadId
    || !input.message
    || input.message.threadId !== input.expectedThreadId
    || input.message.status !== 'completed'
    || input.message.role !== 'user'
    || input.message.versionHash !== input.expectedMessageVersionHash
  ) return 'source_invalid';
  return 'ok';
}

export function parseAndValidateEnrichmentOutput(
  value: string,
  input: { evidenceIds: string[] },
): ValidatedEnrichmentCandidate[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return []; }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Record<string, unknown>).events)) return [];
  const allowedEvidence = new Set(input.evidenceIds);
  const valid: ValidatedEnrichmentCandidate[] = [];
  for (const raw of (parsed as { events: unknown[] }).events.slice(0, 8)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const category = item.category as CompanionEventCategory;
    const speechMode = item.speechMode as MemorySpeechMode;
    const confidence = Number(item.confidence);
    const evidenceIds = Array.isArray(item.evidenceIds) ? item.evidenceIds.filter((id): id is string => typeof id === 'string') : [];
    if (!VALID_CATEGORIES.has(category) || !VALID_SPEECH_MODES.has(speechMode)) continue;
    if (confidence < 0.75 || confidence > 1 || !Number.isFinite(confidence)) continue;
    if (typeof item.subtype !== 'string' || !item.subtype.trim() || evidenceIds.length === 0) continue;
    if (evidenceIds.some((id) => !allowedEvidence.has(id))) continue;
    if (!item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload)) continue;
    valid.push({ category, confidence, evidenceIds: [...new Set(evidenceIds)], payload: item.payload as Record<string, unknown>, speechMode, subtype: item.subtype.trim() });
  }
  return valid;
}
