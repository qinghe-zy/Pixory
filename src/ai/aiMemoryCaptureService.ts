import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiMemoryRecord, AiMessageRecord } from '../database/repositories/aiThreadRepository';
import { callMemoryMaintenanceModel } from './aiMemoryMaintenanceModelService';
import { saveRecentMemoryCaptures, shouldRunImmediateMemoryCapture } from './aiMemoryService';
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

function normalizeMemoryContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 180);
}

function truncateForPrompt(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function extractMemoryCandidates(userMessage: string): MemoryCandidate[] {
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

  for (const match of normalized.matchAll(/(?:请记住|记住|以后默认|之后默认)([^。！？!?]{4,120})/g)) {
    push('instruction', 'global', match[1] ?? '', 4, 0.86);
  }
  for (const match of normalized.matchAll(/我(?:喜欢|偏好|希望|习惯|通常|一般)([^。！？!?]{4,120})/g)) {
    push('preference', 'global', `我${match[0].replace(/^我/, '')}`, 3, 0.82);
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
      const scope = record.scope === 'global' ? 'global' : record.scope === 'thread' ? 'thread' : null;
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

function buildMemoryModelPrompt(messages: AiMessageRecord[]): string {
  const recent = messages
    .filter((message) => message.status === 'completed' && message.role !== 'system')
    .slice(-MEMORY_MODEL_CONTEXT_LIMIT)
    .map((message) => `${message.role === 'assistant' ? 'AI' : '用户'}：${truncateForPrompt(message.content, 420)}`)
    .join('\n\n');
  return [
    '请为一个本地离线优先的 AI 聊天应用更新“深度记忆”。',
    '只输出 JSON，不要输出 Markdown 或解释。',
    '记忆必须保守：只保存用户明确表达、重复出现、纠正 AI、或对后续明显有用的稳定事实。不要保存普通寒暄、临时情绪、一次性闲聊、未经确认的推测。',
    '记忆使用时只是背景参考，不能覆盖用户当前最新要求、角色指令、安全规则或资料事实。',
    'JSON 结构：{"summary":"会话摘要","decisions":"已确认事项","openQuestions":"待跟进问题","memories":[{"scope":"global或thread","type":"preference|fact|decision|instruction|task|correction","content":"单条记忆","confidence":0.1到1,"importance":1到5}]}',
    'scope 只允许 global 或 thread；跨会话稳定偏好用 global，本会话决策和任务用 thread。',
    '如果没有值得长期保存的记忆，memories 返回空数组。',
    '聊天片段：',
    recent || '暂无聊天片段。',
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

export async function captureDeepMemoryForExchange(input: {
  space: PixorySpace;
  thread: AiThreadRecord;
  userMessage: Pick<AiMessageRecord, 'id' | 'content'>;
  assistantMessageId: string;
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
    const messages = await aiThreadRepository.listMessages(db, input.thread.id, 80);
    return {
      fallbackSummary: buildThreadSummaryFromMessages(messages),
      messages,
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
      userPrompt: buildMemoryModelPrompt(prepared.messages),
    });
  const modelUpdate = modelResult.text ? parseModelMemoryUpdate(modelResult.text) : null;

  await runWithDatabaseSpace(input.space, async (db) => {
    await aiThreadRepository.upsertThreadSummary(db, {
      decisions: modelUpdate?.decisions || prepared.fallbackSummary.decisions,
      lastMessageId: prepared.fallbackSummary.lastMessageId,
      openQuestions: modelUpdate?.openQuestions || prepared.fallbackSummary.openQuestions,
      summary: modelUpdate?.summary || prepared.fallbackSummary.summary,
      threadId: input.thread.id,
    });
    const captures: Array<{ id: string; content: string }> = [];
    const candidates = modelUpdate?.memories.length ? modelUpdate.memories : extractMemoryCandidates(input.userMessage.content);
    for (const candidate of candidates) {
      const scopeId = candidate.scope === 'thread'
        ? input.thread.id
        : candidate.scope === 'role'
          ? input.thread.roleCardId
          : candidate.scope === 'ip'
            ? String(input.thread.boundIpId ?? '')
            : candidate.scope === 'knowledge_base'
              ? input.thread.boundKnowledgeBaseId
              : null;
      const normalizedContent = normalizeMemoryContent(candidate.content);
      const existing = await aiThreadRepository.findActiveMemoryByNormalizedContent(db, {
        normalizedContent,
        scope: candidate.scope,
        scopeId,
        space: input.space,
      });
      if (!existing) {
        const memory = await aiThreadRepository.createMemory(db, {
          confidence: candidate.confidence,
          content: candidate.content,
          id: createAiId('aimem'),
          importance: candidate.importance,
          normalizedContent,
          scope: candidate.scope,
          scopeId,
          sourceMessageId: input.userMessage.id,
          space: input.space,
          type: candidate.type,
        });
        if (memory.confidence >= 0.75 && memory.importance >= 2) {
          captures.push({ content: memory.content, id: memory.id });
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
