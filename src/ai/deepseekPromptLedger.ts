import type { SQLiteDatabase } from 'expo-sqlite';
import type { PixorySpace } from '../database/db';
import { hashPromptCacheText } from './aiPromptCache';
import { replayDeepSeekRenderedUsers } from './deepseekPromptReplay';

export interface DeepSeekPromptLedgerRequest { id: string; space: PixorySpace; threadId: string; userMessageId: string; assistantMessageId: string; generationId: string; providerId: string; modelId: string; branchRouteHash: string; sourceMessageVersionHash: string; contextAssemblyProfileHash: string; memoryEpoch?: string | null; retrievalHash?: string | null; historyRoundLimit: number; promptVersion: number; stablePrefixHash: string; stablePrefixEstimatedTokens: number; reusablePrefixEstimatedTokens: number; }
export interface DeepSeekPromptSnapshot { role: 'user' | 'assistant'; messageId: string; renderedContent: string; sourceMessageVersionHash: string; branchRouteHash: string; }
export interface DeepSeekRenderedHistoryMessage { role: 'user' | 'assistant'; content: string; messageId?: string; }
export function sourceMessageVersionHash(content: string): string { return hashPromptCacheText(content); }

export async function beginDeepSeekPromptRequest(db: SQLiteDatabase, input: DeepSeekPromptLedgerRequest): Promise<void> {
  await db.runAsync(`INSERT OR REPLACE INTO ai_prompt_requests (id, space, threadId, userMessageId, assistantMessageId, generationId, providerId, modelId, status, branchRouteHash, sourceMessageVersionHash, contextAssemblyProfileHash, memoryEpoch, retrievalHash, historyRoundLimit, promptVersion, stablePrefixHash, stablePrefixEstimatedTokens, reusablePrefixEstimatedTokens, createdAt, completedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.id, input.space, input.threadId, input.userMessageId, input.assistantMessageId, input.generationId, input.providerId, input.modelId, input.branchRouteHash, input.sourceMessageVersionHash, input.contextAssemblyProfileHash, input.memoryEpoch ?? null, input.retrievalHash ?? null, input.historyRoundLimit, input.promptVersion, input.stablePrefixHash, input.stablePrefixEstimatedTokens, input.reusablePrefixEstimatedTokens, new Date().toISOString(), null);
}
export async function completeDeepSeekPromptRequest(db: SQLiteDatabase, requestId: string, snapshots: DeepSeekPromptSnapshot[]): Promise<void> { const now = new Date().toISOString(); await db.withTransactionAsync(() => writeCompletedDeepSeekPromptRequest(db, requestId, snapshots, now)); }
export async function writeCompletedDeepSeekPromptRequest(db: SQLiteDatabase, requestId: string, snapshots: DeepSeekPromptSnapshot[], completedAt = new Date().toISOString()): Promise<void> {
  await db.runAsync('DELETE FROM ai_prompt_snapshots WHERE requestId = ?', requestId);
  for (const [sequence, snapshot] of snapshots.entries()) await db.runAsync(`INSERT INTO ai_prompt_snapshots (id, requestId, sequence, role, messageId, renderedContent, sourceMessageVersionHash, branchRouteHash, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, `${requestId}:snapshot:${sequence}`, requestId, sequence, snapshot.role, snapshot.messageId, snapshot.renderedContent, snapshot.sourceMessageVersionHash, snapshot.branchRouteHash, completedAt);
  await db.runAsync("UPDATE ai_prompt_requests SET status = 'completed', completedAt = ? WHERE id = ?", completedAt, requestId);
}
export async function failDeepSeekPromptRequest(db: SQLiteDatabase, requestId: string, status: 'failed' | 'stopped' = 'failed'): Promise<void> { await db.runAsync('UPDATE ai_prompt_requests SET status = ?, completedAt = ? WHERE id = ?', status, new Date().toISOString(), requestId); }
export async function findRenderedUserSnapshotsForAssistantIds(db: SQLiteDatabase, assistantMessageIds: string[]): Promise<Map<string, DeepSeekPromptSnapshot[]>> {
  if (assistantMessageIds.length === 0) return new Map();
  const placeholders = assistantMessageIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<DeepSeekPromptSnapshot & { assistantMessageId: string }>(`SELECT r.assistantMessageId, s.role, s.messageId, s.renderedContent, s.sourceMessageVersionHash, s.branchRouteHash FROM ai_prompt_requests r JOIN ai_prompt_snapshots s ON s.requestId = r.id WHERE r.status = 'completed' AND r.assistantMessageId IN (${placeholders}) ORDER BY r.assistantMessageId, s.sequence`, ...assistantMessageIds);
  const result = new Map<string, DeepSeekPromptSnapshot[]>();
  for (const row of rows) { const snapshots = result.get(row.assistantMessageId) ?? []; snapshots.push({ role: row.role, messageId: row.messageId, renderedContent: row.renderedContent, sourceMessageVersionHash: row.sourceMessageVersionHash, branchRouteHash: row.branchRouteHash }); result.set(row.assistantMessageId, snapshots); }
  return result;
}
export function buildDeepSeekReplayHistory(input: { history: DeepSeekRenderedHistoryMessage[]; snapshotsByAssistantId: Map<string, DeepSeekPromptSnapshot[]>; branchRouteHash: string }): DeepSeekRenderedHistoryMessage[] {
  return replayDeepSeekRenderedUsers({ ...input, sourceHash: sourceMessageVersionHash });
}
