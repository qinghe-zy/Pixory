import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { MemoryConfidenceBand } from './memoryTypes';

const UNIT_SEPARATOR = '\u001F';

const ALIAS_PREDICATES: Array<{ alias: string; predicate: string }> = [
  { alias: '以后默认', predicate: 'preference.communication' },
  { alias: '过敏于', predicate: 'boundary.safety' },
  { alias: '不喜欢', predicate: 'preference.general' },
  { alias: '喜欢', predicate: 'preference.general' },
  { alias: '偏好', predicate: 'preference.general' },
  { alias: '讨厌', predicate: 'preference.general' },
  { alias: '不吃', predicate: 'preference.food' },
  { alias: '忌口', predicate: 'preference.food' },
  { alias: '过敏', predicate: 'boundary.safety' },
  { alias: '记住', predicate: 'preference.communication' },
].sort((left, right) => right.alias.length - left.alias.length);

export function normalizeMemoryText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/gu, ' ')
    .replace(/[，。！？、；：,.!?;:]+/gu, ' ')
    .trim();
}

export function normalizeMemoryObject(value: string): string {
  return normalizeMemoryText(value)
    .replace(/^(我|本人|用户|以后|默认|就是|其实|那个|这个)\s*/u, '')
    .replace(/\s+/gu, '');
}

export function resolvePredicate(aliasOrPredicate: string): string {
  const normalized = normalizeMemoryText(aliasOrPredicate);
  const matched = ALIAS_PREDICATES.find((item) => normalized.includes(item.alias));
  return matched?.predicate ?? normalized;
}

export function normalizeValidTimeBucket(value: string | null | undefined): string {
  const normalized = normalizeMemoryText(value ?? '');
  if (!normalized) {
    return 'unknown';
  }
  const day = normalized.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/u);
  if (day) {
    return `day:${day[1]}-${day[2].padStart(2, '0')}-${day[3].padStart(2, '0')}`;
  }
  const month = normalized.match(/(\d{4})[/-](\d{1,2})/u);
  if (month) {
    return `month:${month[1]}-${month[2].padStart(2, '0')}`;
  }
  return `relative:${normalized}`;
}

export interface CanonicalClaimTuple {
  schemaVersion: number;
  privacyDomain: 'normal' | 'personal';
  scopeType: string;
  scopeId?: string | null;
  subjectEntityId: string;
  predicate: string;
  polarity: string;
  canonicalObject: string;
  validTimeBucket: string;
}

export function serializeCanonicalClaimTuple(input: CanonicalClaimTuple): string {
  return [
    input.schemaVersion,
    input.privacyDomain,
    input.scopeType,
    input.scopeId ?? '∅',
    input.subjectEntityId,
    input.predicate,
    input.polarity,
    input.canonicalObject,
    input.validTimeBucket,
  ].join(UNIT_SEPARATOR);
}

export function buildCanonicalClaimId(input: CanonicalClaimTuple): string {
  return bytesToHex(sha256(new TextEncoder().encode(serializeCanonicalClaimTuple({
    ...input,
    canonicalObject: normalizeMemoryObject(input.canonicalObject),
    predicate: resolvePredicate(input.predicate),
    validTimeBucket: normalizeValidTimeBucket(input.validTimeBucket),
  }))));
}

export function resolveConfidence(
  confidenceCalibrated: number | null | undefined,
  confidenceBand: MemoryConfidenceBand
): number {
  if (confidenceCalibrated != null && Number.isFinite(confidenceCalibrated)) {
    return Math.max(0, Math.min(1, confidenceCalibrated));
  }
  return confidenceBand === 'high' ? 0.95 : confidenceBand === 'medium' ? 0.7 : 0.35;
}

export const resolveCalibratedConfidence = resolveConfidence;
