import type { PixorySpace } from '../../database/db';
import type { MemorySpeechMode } from '../memory/memoryTypes';

export type CompanionSubjectType = 'role' | 'thread';
export type CompanionEventCategory =
  | 'interaction'
  | 'user_affect'
  | 'relationship'
  | 'boundary'
  | 'correction'
  | 'commitment'
  | 'temporal'
  | 'artifact'
  | 'assistant';

export interface CompanionEvidenceSpan {
  messageId: string;
  messageVersionHash: string;
  start: number;
  end: number;
  text: string;
}

export interface CompanionEventCandidate {
  category: CompanionEventCategory;
  subtype: string;
  speechMode: MemorySpeechMode;
  confidence: number;
  intensity: number;
  sincerity: number;
  payload: Record<string, unknown>;
  evidence: CompanionEvidenceSpan;
  extractorVersion: string;
  semanticKey: string;
  effectiveNow: boolean;
  needsEnrichment: boolean;
  diagnosticReason: string | null;
}

export interface CompanionObservedMessage {
  id: string;
  content: string;
  role: 'assistant' | 'system' | 'user';
  status: string;
  updatedAt: string;
  completedAt: string | null;
  branchRootMessageId: string | null;
  branchVersionIndex: number | null;
}

export interface CompanionEventRecord {
  id: string;
  space: PixorySpace;
  subjectType: CompanionSubjectType;
  subjectId: string;
  roleCardId: string | null;
  threadId: string;
  branchRootMessageId: string | null;
  branchVersionIndex: number | null;
  branchRouteHash: string;
  lineageVersion: number;
  sourceMessageId: string;
  sourceMessageVersionHash: string;
  category: CompanionEventCategory;
  subtype: string;
  speechMode: MemorySpeechMode;
  confidence: number;
  intensity: number;
  sincerity: number;
  payloadJson: string;
  evidenceSpanJson: string;
  extractorVersion: string;
  provenanceJson: string;
  idempotencyKey: string;
  status: 'active' | 'superseded' | 'deleted';
  eventSequence: number;
  createdAt: string;
}

export type CompanionTemporalPrecision = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'unknown';
export type CompanionTemporalType = 'point' | 'range' | 'deadline' | 'recurrence' | 'anniversary';

export interface ParsedTemporalAnchor {
  rawText: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  parseTimeZone: string;
  localDateKey: string;
  precision: CompanionTemporalPrecision;
  type: CompanionTemporalType;
  recurrenceRule: string | null;
  parserVersion: string;
  sourceStart: number;
  sourceEnd: number;
}

export type CompanionOpenLoopStatus = 'open' | 'resolved' | 'dismissed' | 'expired' | 'superseded';
export type CompanionOpenLoopKind = 'deadline' | 'result_wait' | 'weak' | 'recurring';

export interface CompanionOpenLoopPolicyFields {
  kind: CompanionOpenLoopKind;
  status: CompanionOpenLoopStatus;
  priority: number;
  earliestMentionAt: string;
  expiresAt: string | null;
  mentionCount: number;
  lastMentionedAt: string | null;
  lastMentionedRound: number | null;
  recurrenceRule: string | null;
}

export type CompanionTopicType =
  | 'repair'
  | 'boundary'
  | 'correction'
  | 'affect'
  | 'open_loop'
  | 'temporal_anchor'
  | 'memory_echo'
  | 'artifact';

export interface CompanionTopicCandidate {
  id: string;
  type: CompanionTopicType;
  basePriority: number;
  relevance: number;
  urgency: number;
  confidence: number;
  cooldownPenalty: number;
  mentionPenalty: number;
  evidenceAt: string;
}
