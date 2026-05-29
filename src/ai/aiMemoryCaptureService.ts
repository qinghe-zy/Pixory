import type { SQLiteDatabase } from 'expo-sqlite';

import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiBranchScope, AiMemoryRecord, AiMessageRecord } from '../database/repositories/aiThreadRepository';
import { callMemoryMaintenanceModel } from './aiMemoryMaintenanceModelService';
import { saveRecentMemoryCaptures, shouldRunImmediateMemoryCapture, type MemoryCaptureNoticeItem } from './aiMemoryService';
import {
  buildMemoryReconciliationPrompt,
  normalizeMemoryContentForReconciliation,
  parseMemoryReconciliationOperations,
  sanitizeMemoryReconciliationOperations,
  type AiMemoryReconciliationOperation,
} from './aiMemoryReconciliationService';
import { emptyMaintenanceStepResult, type MemoryMaintenanceStepResult } from './aiMemorySummaryService';
import type { AiThreadRecord } from './types';

const SUMMARY_DECISION_LIMIT = 8;
const MEMORY_MODEL_CONTEXT_LIMIT = 18;

interface MemoryCandidate {
  type: AiMemoryRecord['type'];
  scope: AiMemoryRecord['scope'];
  content: string;
  importance: number;
  confidence: number;
}

interface ModelMemoryUpdate {
  summary: string;
  decisions: string;
  openQuestions: string;
  memories: MemoryCandidate[];
}

function createAiId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

const normalizeMemoryContent = normalizeMemoryContentForReconciliation;

function truncateForPrompt(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function extractMemoryCandidates(userMessage: string, thread: AiThreadRecord): MemoryCandidate[] {
  const normalized = userMessage.replace(/\s+/g, ' ').trim();
  if (normalized.length < 4) {
    return [];
  }
  const candidates: MemoryCandidate[] = [];
  const push = (type: AiMemoryRecord['type'], scope: AiMemoryRecord['scope'], content: string, importance: number, confidence = 0.76) => {
    const cleaned = content.replace(/^[：:，,\s]+/, '').trim();
    if (cleaned.length >= 4 && cleaned.length <= 180) {
      candidates.push({ confidence, content: cleaned, importance, scope, type });
    }
  };

  const defaultScope = thread.boundIpId != null ? 'ip' : 'thread';

  for (const match of normalized.matchAll(/(?:请记住|记住|以后默认|之后默认)([^。！？!?]{4,120})/g)) {
    push('instruction', defaultScope, match[1] ?? '', 4, 0.86);
  }
  for (const match of normalized.matchAll(/我(?:喜欢|偏好|希望|习惯|通常|一般)([^。！？!?]{4,120})/g)) {
    push('preference', defaultScope, `我${match[0].replace(/^我/, '')}`, 3, 0.82);
  }
  for (const match of normalized.matchAll(/(?:决定|确认|确定|同意)([^。！？!?]{4,120})/g)) {
    push('decision', 'thread', match[1] ?? '', 3, 0.78);
  }
  for (const match of normalized.matchAll(/(?:纠正|更正|不是|不要)([^。！？!?]{4,120})/g)) {
    push('correction', 'thread', match[0] ?? '', 4, 0.84);
  }
  return candidates.slice(0, 6);
}

function extractJsonObject(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  return first >= 0 && last > first ? text.slice(first, last + 1) : text.trim();
}

function parseModelMemoryUpdate(text: string): ModelMemoryUpdate | null {
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const decisions = typeof parsed.decisions === 'string' ? parsed.decisions.trim() : '';
    const openQuestions = typeof parsed.openQuestions === 'string' ? parsed.openQuestions.trim() : '';
    const rawMemories = Array.isArray(parsed.memories) ? parsed.memories : [];
    const memories = rawMemories.flatMap((item): MemoryCandidate[] => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const record = item as Record<string, unknown>;
      const content = typeof record.content === 'string' ? record.content.replace(/\s+/g, ' ').trim() : '';
      const scope = record.scope === 'global' || record.scope === 'ip' ? 'ip' : record.scope === 'thread' ? 'thread' : null;
      const type = ['preference', 'fact', 'decision', 'instruction', 'task', 'correction'].includes(String(record.type))
        ? String(record.type) as AiMemoryRecord['type']
        : null;
      if (!content || !scope || !type || content.length < 4 || content.length > 180) {
        return [];
      }
      return [{
        confidence: typeof record.confidence === 'number' ? Math.max(0.1, Math.min(1, record.confidence)) : 0.78,
        content,
        importance: typeof record.importance === 'number' ? Math.max(1, Math.min(5, Math.round(record.importance))) : 2,
        scope,
        type,
      }];
    }).slice(0, 8);
    if (!summary && !decisions && !openQuestions && memories.length === 0) {
      return null;
    }
    return { decisions, memories, openQuestions, summary };
  } catch {
    return null;
  }
}

function buildMemoryConversationText(messages: AiMessageRecord[]): string {
  return messages
    .filter((message) => message.status === 'completed' && message.role !== 'system')
    .slice(-MEMORY_MODEL_CONTEXT_LIMIT)
    .map((message) => `${message.role === 'assistant' ? 'AI' : '用户'}：${truncateForPrompt(message.content, 420)}`)
    .join('\n\n');
}

function buildMemoryModelPrompt(messages: AiMessageRecord[], candidateMemories: AiMemoryRecord[]): string {
  return [
    '只输出 JSON，不要输出 Markdown 或解释。',
    buildMemoryReconciliationPrompt({
      candidateMemories,
      conversationText: buildMemoryConversationText(messages),
    }),
  ].join('\n\n');
}

function buildThreadSummaryFromMessages(messages: AiMessageRecord[]): { summary: string; decisions: string; openQuestions: string; lastMessageId: string | null } {
  const completed = messages.filter((message) => message.status === 'completed' && message.role !== 'system');
  const recent = completed.slice(-16);
  const summary = recent
    .map((message) => `${message.role === 'assistant' ? 'AI' : '用户'}：${truncateForPrompt(message.content, 120)}`)
    .join('\n')
    .slice(0, 1200);
  const decisions = completed
    .filter((message) => /决定|确认|确定|同意|以后|默认|记住|纠正|更正/.test(message.content))
    .slice(-SUMMARY_DECISION_LIMIT)
    .map((message) => `- ${truncateForPrompt(message.content, 140)}`)
    .join('\n');
  const openQuestions = completed
    .filter((message) => message.role === 'user' && /[?？]|怎么|如何|是否|能不能/.test(message.content))
    .slice(-5)
    .map((message) => `- ${truncateForPrompt(message.content, 120)}`)
    .join('\n');
  return {
    decisions,
    lastMessageId: completed.length ? completed[completed.length - 1].id : null,
    openQuestions,
    summary,
  };
}

function stepResult(error: string | null, usedRemote: boolean, usedFallback: boolean, providerId: string | null, modelId: string | null): MemoryMaintenanceStepResult {
  return { error, modelId, providerId, usedFallback, usedRemote };
}

function scopeIdForMemoryCandidate(thread: AiThreadRecord, candidate: Pick<MemoryCandidate, 'scope'>): string | null {
  if (candidate.scope === 'thread') {
    return thread.id;
  }
  if (candidate.scope === 'role') {
    return thread.roleCardId;
  }
  if (candidate.scope === 'ip') {
    return thread.boundIpId == null ? null : String(thread.boundIpId);
  }
  if (candidate.scope === 'knowledge_base') {
    return thread.boundKnowledgeBaseId;
  }
  return null;
}

function allowedMemoryScopes(thread: AiThreadRecord): Array<{ scope: AiMemoryRecord['scope']; scopeId: string | null }> {
  const scopes: Array<{ scope: AiMemoryRecord['scope']; scopeId: string | null }> = [
    { scope: 'thread', scopeId: thread.id },
  ];
  if (thread.roleCardId) {
    scopes.push({ scope: 'role', scopeId: thread.roleCardId });
  }
  if (thread.boundIpId != null) {
    scopes.push({ scope: 'ip', scopeId: String(thread.boundIpId) });
  }
  if (thread.boundKnowledgeBaseId) {
    scopes.push({ scope: 'knowledge_base', scopeId: thread.boundKnowledgeBaseId });
  }
  return scopes;
}

async function createMemoryFromCandidate(db: SQLiteDatabase, input: {
  candidate: MemoryCandidate;
  sourceMessageId: string;
  space: PixorySpace;
  thread: AiThreadRecord;
  reason?: string | null;
}): Promise<AiMemoryRecord | null> {
  const scopeId = scopeIdForMemoryCandidate(input.thread, input.candidate);
  if (input.candidate.scope === 'global' || !scopeId) {
    return null;
  }
  const normalizedContent = normalizeMemoryContent(input.candidate.content);
  const memory = await aiThreadRepository.createMemory(db, {
    confidence: input.candidate.confidence,
    content: input.candidate.content,
    id: createAiId('aimem'),
    importance: input.candidate.importance,
    mergeReason: input.reason ?? null,
    normalizedContent,
    reconcileSourceMessageId: input.sourceMessageId,
    scope: input.candidate.scope,
    scopeId,
    sourceMessageId: input.sourceMessageId,
    space: input.space,
    type: input.candidate.type,
  });
  return memory;
}

function candidateFromAddOperation(operation: AiMemoryReconciliationOperation): MemoryCandidate | null {
  if (operation.op !== 'add' || !operation.content || !operation.scope || !operation.type) {
    return null;
  }
  return {
    confidence: operation.confidence,
    content: operation.content,
    importance: operation.importance ?? 2,
    scope: operation.scope,
    type: operation.type,
  };
}

export async function captureDeepMemoryForExchange(input: {
  space: PixorySpace;
  thread: AiThreadRecord;
  userMessage: Pick<AiMessageRecord, 'id' | 'content'>;
  assistantMessageId: string;
  branchScopes?: AiBranchScope[];
  allowRemoteModel?: boolean;
}): Promise<MemoryMaintenanceStepResult> {
  const exchangeText = `${input.userMessage.content}`;
  const shouldCaptureImmediately = shouldRunImmediateMemoryCapture(exchangeText);
  const prepared = await runWithDatabaseSpace(input.space, async (db) => {
    const settings = await aiThreadRepository.getThreadMemorySettings(db, input.thread.id);
    if (!settings.deepMemoryEnabled) {
      return null;
    }
    const job = await aiThreadRepository.getThreadMemoryJob(db, input.thread.id);
    const nextPendingTurnCount = job.pendingTurnCount + 1;
    if (!shouldCaptureImmediately && nextPendingTurnCount < 5) {
      await aiThreadRepository.updateThreadMemoryJob(db, {
        pendingTurnCount: nextPendingTurnCount,
        threadId: input.thread.id,
      });
      return null;
    }
    const messages = await aiThreadRepository.listMessages(db, input.thread.id, 80, input.branchScopes);
    const localCandidates = extractMemoryCandidates(input.userMessage.content, input.thread);
    const candidateQuery = [input.userMessage.content, ...localCandidates.map((candidate) => candidate.content)].join('\n');
    const relatedMemories = await aiThreadRepository.searchActiveMemoryFts(db, {
      branchScopes: input.branchScopes,
      boundIpId: input.thread.boundIpId,
      boundKnowledgeBaseId: input.thread.boundKnowledgeBaseId,
      limit: 8,
      query: candidateQuery,
      roleCardId: input.thread.roleCardId,
      space: input.space,
      threadId: input.thread.id,
    });
    return {
      fallbackSummary: buildThreadSummaryFromMessages(messages),
      localCandidates,
      messages,
      relatedMemories: relatedMemories.slice(0, 8),
    };
  });
  if (!prepared) {
    return emptyMaintenanceStepResult();
  }

  const modelResult = input.allowRemoteModel === false
    ? { error: null, modelId: null, providerId: null, text: null, usedRemote: false }
    : await callMemoryMaintenanceModel({
      space: input.space,
      systemPrompt: '你是 Pixory 的后台记忆整理器。你只输出可解析 JSON。',
      thread: input.thread,
      userPrompt: buildMemoryModelPrompt(prepared.messages, prepared.relatedMemories),
    });
  const modelUpdate = modelResult.text ? parseModelMemoryUpdate(modelResult.text) : null;
  const modelOperations = modelResult.text ? parseMemoryReconciliationOperations(modelResult.text) : [];

  await runWithDatabaseSpace(input.space, async (db) => {
    await aiThreadRepository.upsertThreadSummary(db, {
      decisions: modelUpdate?.decisions || prepared.fallbackSummary.decisions,
      lastMessageId: prepared.fallbackSummary.lastMessageId,
      openQuestions: modelUpdate?.openQuestions || prepared.fallbackSummary.openQuestions,
      summary: modelUpdate?.summary || prepared.fallbackSummary.summary,
      threadId: input.thread.id,
    });
    const captures: MemoryCaptureNoticeItem[] = [];
    const changedNormalizedContents = new Set<string>();
    const sanitized = sanitizeMemoryReconciliationOperations({
      allowedScopes: allowedMemoryScopes(input.thread),
      candidateMemories: prepared.relatedMemories,
      operations: modelOperations,
      space: input.space,
    });
    let replacementMemoryId: string | null = null;
    for (const conflict of sanitized.manualConflicts) {
      captures.push({
        content: `发现与手动记忆冲突：${conflict.content}`,
        id: conflict.memoryId,
        kind: 'conflict',
        sourceMessageId: input.userMessage.id,
      });
    }
    const addOrUpdateOperations = sanitized.accepted.filter((operation) => operation.op === 'add' || operation.op === 'update');
    const staleOperations = sanitized.accepted.filter((operation) => operation.op === 'stale');
    const keepOperations = sanitized.accepted.filter((operation) => operation.op === 'keep');
    for (const operation of addOrUpdateOperations) {
      if (operation.op === 'add') {
        const candidate = candidateFromAddOperation(operation);
        if (!candidate) {
          continue;
        }
        const memory = await createMemoryFromCandidate(db, {
          candidate,
          reason: operation.reason ?? null,
          sourceMessageId: input.userMessage.id,
          space: input.space,
          thread: input.thread,
        });
        if (memory) {
          replacementMemoryId = memory.id;
          changedNormalizedContents.add(memory.normalizedContent);
          if (memory.confidence >= 0.75 && memory.importance >= 2) {
            captures.push({ content: memory.content, id: memory.id, kind: 'added', sourceMessageId: input.userMessage.id });
          }
        }
        continue;
      }
      if (operation.op === 'update' && operation.targetMemoryId && operation.content) {
        const memory = await aiThreadRepository.updateMemoryByReconciliation(db, {
          confidence: operation.confidence,
          content: operation.content,
          importance: operation.importance,
          memoryId: operation.targetMemoryId,
          normalizedContent: normalizeMemoryContent(operation.content),
          reason: operation.reason ?? null,
          sourceMessageId: input.userMessage.id,
          type: operation.type,
        });
        if (memory) {
          replacementMemoryId = memory.id;
          changedNormalizedContents.add(memory.normalizedContent);
          captures.push({ content: memory.content, id: memory.id, kind: 'updated', sourceMessageId: input.userMessage.id });
        }
        continue;
      }
    }
    for (const operation of staleOperations) {
      if (!operation.targetMemoryId) {
        continue;
      }
      const memory = await aiThreadRepository.markMemoryStaleByReconciliation(db, {
        memoryId: operation.targetMemoryId,
        reason: operation.reason ?? null,
        sourceMessageId: input.userMessage.id,
        supersededByMemoryId: replacementMemoryId,
      });
      if (memory) {
        captures.push({ content: memory.content, id: memory.id, kind: 'staled', sourceMessageId: input.userMessage.id });
      }
    }
    for (const operation of keepOperations) {
      if (operation.targetMemoryId) {
        await aiThreadRepository.touchMemoryReconciled(db, {
          memoryId: operation.targetMemoryId,
          reason: operation.reason ?? null,
          sourceMessageId: input.userMessage.id,
        });
      }
    }

    const candidates = modelUpdate ? modelUpdate.memories : prepared.localCandidates;
    for (const candidate of candidates) {
      if (candidate.scope === 'global') {
        continue;
      }
      const normalizedContent = normalizeMemoryContent(candidate.content);
      if (changedNormalizedContents.has(normalizedContent)) {
        continue;
      }
      const scopeId = scopeIdForMemoryCandidate(input.thread, candidate);
      if (!scopeId) {
        continue;
      }
      const existing = await aiThreadRepository.findActiveMemoryByNormalizedContent(db, {
        normalizedContent,
        scope: candidate.scope,
        scopeId,
        space: input.space,
      });
      if (!existing) {
        const memory = await createMemoryFromCandidate(db, {
          candidate,
          reason: modelResult.text ? '新增稳定记忆' : '本地明确记忆短语',
          sourceMessageId: input.userMessage.id,
          space: input.space,
          thread: input.thread,
        });
        if (memory && memory.confidence >= 0.75 && memory.importance >= 2) {
          captures.push({
            content: memory.content,
            id: memory.id,
            kind: modelResult.text ? 'added' : 'local_fallback',
            sourceMessageId: input.userMessage.id,
          });
        }
      }
    }
    await aiThreadRepository.updateThreadMemoryJob(db, {
      lastConsolidatedMessageId: input.assistantMessageId,
      lastMaintenanceError: modelResult.error ? `remote_failed_used_local_fallback: ${modelResult.error}` : null,
      pendingTurnCount: 0,
      threadId: input.thread.id,
    });
    if (captures.length > 0) {
      await saveRecentMemoryCaptures(db, input.thread.id, captures);
    }
  });
  return stepResult(modelResult.error, modelResult.usedRemote, !modelResult.text, modelResult.providerId, modelResult.modelId);
}
