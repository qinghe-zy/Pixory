import type { CompanionTopicCandidate } from './companionTypes';

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function scoreCompanionTopic(candidate: CompanionTopicCandidate): number {
  return candidate.basePriority
    + clampUnit(candidate.relevance) * 30
    + clampUnit(candidate.urgency) * 20
    + clampUnit(candidate.confidence) * 10
    - Math.max(0, candidate.cooldownPenalty)
    - Math.max(0, candidate.mentionPenalty);
}

export function selectOptionalCompanionTopic(
  candidates: CompanionTopicCandidate[],
): (CompanionTopicCandidate & { score: number }) | null {
  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: scoreCompanionTopic(candidate) }))
    .filter((candidate) => ['repair', 'boundary', 'correction'].includes(candidate.type) || candidate.score >= 60)
    .sort((left, right) => (
      right.score - left.score
      || right.evidenceAt.localeCompare(left.evidenceAt)
      || left.id.localeCompare(right.id)
    ));
  return ranked[0] ?? null;
}

export const CompanionTopicArbitrator = { score: scoreCompanionTopic, select: selectOptionalCompanionTopic };
