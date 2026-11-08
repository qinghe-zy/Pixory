/**
 * Core Companion Memory Types
 *
 * 物理隔离契约：
 * 本模块为无状态、无业务副作用的数据结构与契约定义。
 */

export type CompanionMemoryTier =
  | 'L1_SLOT'
  | 'L1_SUMMARY'
  | 'L2_EPISODIC'
  | 'L2_FACT'
  | 'L2_EPISODE';

export interface CompanionMemoryRecord {
  id: string;
  roleCardId: string;
  space: 'normal' | 'personal';
  tier: CompanionMemoryTier;
  category: string;
  content: string;
  triggerKeywords: string[];
  entities: string[];
  importance: number;
  hitCount: number;
  isPinned: boolean;
  createdAt: number;
  lastAccessedAt: number;
  sourceMode: string;
  expiresAt?: number | null;
  supersededBy?: string | null;
  deletedAt?: number | null;
  confidence?: number;
}

export type CompanionMemoryItem = CompanionMemoryRecord;

export type TurnMemoryIntent =
  | 'PHATIC_SHORT_ACK'
  | 'EMOTIONAL_CONFIDE'
  | 'PREFERENCE_DECISION'
  | 'EPISODIC_RECALL'
  | 'FACT_OR_COMMITMENT_MUTATION'
  | 'DIARY_INQUIRY'
  | 'FORGET_REQUEST'
  | 'GENERAL_CHAT';

export interface TurnMemoryIntentProfile {
  intent: TurnMemoryIntent;
  confidence: number;
  topK: number;
  invokeMemoryModel: boolean;
  scoreThreshold: number;
  boostCategory?: 'fact' | 'episode' | 'preference' | 'diary' | 'none';
  detectedTemporalCue?: string | null;
}

export interface EpisodicContinuity {
  unresolved_tension: string;
  emotional_aftertaste: string;
  narrative_summary: string;
}

export interface L1SlotMutation {
  op: 'ADD' | 'UPDATE' | 'DELETE';
  slot: string;
  value: string;
}

export interface L2MemoryMutation {
  op: 'ADD' | 'UPDATE' | 'SUPERSEDE' | 'DELETE' | 'NOOP';
  content: string;
  importance: number;
  entities: string[];
  expanded_triggers: string[];
  tier?: 'L2_FACT' | 'L2_EPISODE' | 'L2_EPISODIC';
  category?: string;
  targetId?: string;
  expiresAt?: number | null;
  confidence?: number;
}

export interface FourDCompactionResult {
  episodic_continuity?: EpisodicContinuity;
  l1_slot_mutations?: L1SlotMutation[];
  l2_memory_mutations?: L2MemoryMutation[];
}

export interface MemoryRecallCandidate {
  id: string;
  content: string;
  tier: CompanionMemoryTier;
  category: string;
  score: number;
  matchedChannel: 'trigger' | 'fts' | 'entity' | 'temporal';
  decayFactor?: number;
  baseRelevance?: number;
  clarity?: 'clear' | 'fuzzy';
  entities?: string[];
  triggerKeywords?: string[];
}

export interface ScoredMemoryResult {
  memory: CompanionMemoryRecord;
  finalScore: number;
  baseRelevance: number;
  decayFactor: number;
  clarity?: 'clear' | 'fuzzy';
}
