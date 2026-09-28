export const COMPANION_REPAIR_POLICY_VERSION = 'repair-policy-v1';

export type CompanionRepairState = 'detected' | 'constrained' | 'acknowledged' | 'observing' | 'verified' | 'violated' | 'dismissed';

export interface CompanionRepairDraft {
  sourceEventId: string;
  sourceMessageId: string;
  category: 'boundary' | 'correction';
  subtype: string;
  constraintText: string;
  forbiddenTerms: string[];
  state: CompanionRepairState;
  passedRelevantTurns: number;
  violationCount: number;
  semanticReviewRequired: boolean;
}

function cleanTerm(value: string): string {
  return value.replace(/[，。！？!?；;].*$/u, '').replace(/^(?:再|继续)/u, '').trim();
}

function extractForbiddenTerms(text: string, subtype: string): string[] {
  const patterns = subtype === 'naming'
    ? [/(?:别|不要|不许)(?:再)?(?:这样)?叫我([^，。！？!?]{1,24})/u, /(?:别|不要)(?:再)?用([^，。！？!?]{1,24})(?:叫|称呼)/u]
    : subtype === 'topic'
      ? [/(?:别|不要)(?:再)?(?:问|提|聊)(?:起|这个)?([^，。！？!?]{1,32})/u]
      : [];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const term = match?.[1] ? cleanTerm(match[1]) : '';
    if (term) return [term];
  }
  return [];
}

export function createRepairDraft(input: {
  sourceEventId: string;
  sourceMessageId: string;
  category: 'boundary' | 'correction';
  subtype: string;
  evidenceText: string;
}): CompanionRepairDraft {
  const forbiddenTerms = extractForbiddenTerms(input.evidenceText, input.subtype);
  return {
    category: input.category,
    constraintText: input.evidenceText.trim(),
    forbiddenTerms,
    passedRelevantTurns: 0,
    semanticReviewRequired: forbiddenTerms.length === 0 && input.subtype !== 'fact' && input.subtype !== 'identity',
    sourceEventId: input.sourceEventId,
    sourceMessageId: input.sourceMessageId,
    state: 'constrained',
    subtype: input.subtype,
    violationCount: 0,
  };
}

export function applyRepairAssistantTurn(repair: CompanionRepairDraft, assistantText: string): CompanionRepairDraft {
  if (repair.state === 'verified' || repair.state === 'dismissed') return repair;
  const normalized = assistantText.normalize('NFKC').toLocaleLowerCase();
  const violated = repair.forbiddenTerms.some((term) => normalized.includes(term.normalize('NFKC').toLocaleLowerCase()));
  if (violated) {
    return { ...repair, passedRelevantTurns: 0, state: 'constrained', violationCount: repair.violationCount + 1 };
  }
  const passedRelevantTurns = repair.passedRelevantTurns + 1;
  return {
    ...repair,
    passedRelevantTurns,
    state: passedRelevantTurns >= 3 ? 'verified' : 'observing',
  };
}

export function dismissRepair(repair: CompanionRepairDraft): CompanionRepairDraft {
  return { ...repair, state: 'dismissed' };
}

export const CompanionRepairService = { applyAssistantTurn: applyRepairAssistantTurn, create: createRepairDraft, dismiss: dismissRepair };
