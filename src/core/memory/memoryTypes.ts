/**
 * Core Companion Memory Types
 *
 * 物理隔离契约：
 * 本模块为无状态、无业务副作用的数据结构与契约定义。
 */

export type CompanionMemoryTier = 'L1_SLOT' | 'L1_SUMMARY' | 'L2_EPISODIC';

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
  op: 'ADD' | 'UPDATE' | 'DELETE';
  content: string;
  importance: number;
  entities: string[];
  expanded_triggers: string[];
}

export interface FourDCompactionResult {
  episodic_continuity: EpisodicContinuity;
  l1_slot_mutations: L1SlotMutation[];
  l2_memory_mutations: L2MemoryMutation[];
}

export interface MemoryRecallCandidate {
  id: string;
  content: string;
  tier: CompanionMemoryTier;
  category: string;
  score: number;
  matchedChannel: 'trigger' | 'fts' | 'entity' | 'temporal';
}
