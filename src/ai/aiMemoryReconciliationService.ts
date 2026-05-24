import type { AiMemoryRecord, AiMemoryScope, AiMemoryType } from '../database/repositories/aiThreadRepository';

export type AiMemoryReconciliationOp = 'add' | 'update' | 'stale' | 'keep';

export interface AiMemoryReconciliationOperation {
  op: AiMemoryReconciliationOp;
  targetMemoryId?: string | null;
  content?: string;
  scope?: AiMemoryScope;
  type?: AiMemoryType;
  confidence: number;
  importance?: number;
  reason?: string;
}

export interface RejectedMemoryReconciliationOperation {
  operation: AiMemoryReconciliationOperation;
  reason: string;
}

export interface ManualMemoryConflict {
  memoryId: string;
  content: string;
  reason: string;
}

export interface SanitizedMemoryReconciliationOperations {
  accepted: AiMemoryReconciliationOperation[];
  rejected: RejectedMemoryReconciliationOperation[];
  manualConflicts: ManualMemoryConflict[];
}

const VALID_OPS = new Set<AiMemoryReconciliationOp>(['add', 'update', 'stale', 'keep']);
const VALID_SCOPES = new Set<AiMemoryScope>(['global', 'thread', 'role', 'ip', 'knowledge_base']);
const VALID_TYPES = new Set<AiMemoryType>(['preference', 'fact', 'decision', 'instruction', 'task', 'correction']);
const MIN_STALE_CONFIDENCE = 0.78;
const MIN_UPDATE_CONFIDENCE = 0.65;
const MIN_ADD_CONFIDENCE = 0.62;

function extractJsonObject(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  return first >= 0 && last > first ? text.slice(first, last + 1) : text.trim();
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeText(value: unknown, limit = 240): string {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? normalized.slice(0, limit).trim() : normalized;
}

function normalizeImportance(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(1, Math.min(5, Math.round(value)));
}

function parseRawOperation(item: unknown): AiMemoryReconciliationOperation | null {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const record = item as Record<string, unknown>;
  const op = typeof record.op === 'string' && VALID_OPS.has(record.op as AiMemoryReconciliationOp)
    ? record.op as AiMemoryReconciliationOp
    : null;
  if (!op) {
    return null;
  }
  const scope = typeof record.scope === 'string' && VALID_SCOPES.has(record.scope as AiMemoryScope)
    ? record.scope as AiMemoryScope
    : undefined;
  const type = typeof record.type === 'string' && VALID_TYPES.has(record.type as AiMemoryType)
    ? record.type as AiMemoryType
    : undefined;
  return {
    confidence: clampConfidence(record.confidence),
    content: normalizeText(record.content),
    importance: normalizeImportance(record.importance),
    op,
    reason: normalizeText(record.reason, 140),
    scope,
    targetMemoryId: normalizeText(record.targetMemoryId, 120) || null,
    type,
  };
}

export function parseMemoryReconciliationOperations(text: string): AiMemoryReconciliationOperation[] {
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    const rawOperations = Array.isArray(parsed.operations) ? parsed.operations : [];
    return rawOperations.flatMap((item) => {
      const operation = parseRawOperation(item);
      return operation ? [operation] : [];
    }).slice(0, 16);
  } catch {
    return [];
  }
}

export function normalizeMemoryContentForReconciliation(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 180);
}

export function sanitizeMemoryReconciliationOperations(input: {
  operations: AiMemoryReconciliationOperation[];
  candidateMemories: Pick<AiMemoryRecord, 'id' | 'content' | 'scope' | 'scopeId' | 'sourceKind' | 'space' | 'status'>[];
  allowedScopes: Array<{ scope: AiMemoryScope; scopeId: string | null }>;
  space: string;
}): SanitizedMemoryReconciliationOperations {
  const candidateById = new Map(input.candidateMemories.map((memory) => [memory.id, memory]));
  const allowedScopeKeys = new Set(input.allowedScopes.map((item) => `${item.scope}:${item.scopeId ?? ''}`));
  const accepted: AiMemoryReconciliationOperation[] = [];
  const rejected: RejectedMemoryReconciliationOperation[] = [];
  const manualConflicts: ManualMemoryConflict[] = [];

  const reject = (operation: AiMemoryReconciliationOperation, reason: string) => {
    rejected.push({ operation, reason });
  };

  for (const operation of input.operations) {
    if (!VALID_OPS.has(operation.op)) {
      reject(operation, 'unknown_op');
      continue;
    }

    if (operation.op === 'add') {
      const content = normalizeText(operation.content);
      if (!content || content.length < 4 || !operation.scope || !operation.type) {
        reject(operation, 'invalid_add_payload');
        continue;
      }
      if (!allowedScopeKeys.has(`${operation.scope}:${operation.scope === 'global' ? '' : ''}`) && operation.scope !== 'global') {
        const hasScope = input.allowedScopes.some((item) => item.scope === operation.scope);
        if (!hasScope) {
          reject(operation, 'scope_not_allowed');
          continue;
        }
      }
      if (operation.confidence < MIN_ADD_CONFIDENCE) {
        reject(operation, 'low_confidence_add');
        continue;
      }
      accepted.push({ ...operation, content, importance: operation.importance ?? 2 });
      continue;
    }

    const targetId = operation.targetMemoryId ?? '';
    const target = candidateById.get(targetId);
    if (!target) {
      reject(operation, 'unknown_target');
      continue;
    }
    if (target.space !== input.space || target.status !== 'active') {
      reject(operation, 'target_not_active_in_space');
      continue;
    }
    if (!allowedScopeKeys.has(`${target.scope}:${target.scopeId ?? ''}`)) {
      reject(operation, 'target_scope_not_allowed');
      continue;
    }

    if ((operation.op === 'update' || operation.op === 'stale') && target.sourceKind === 'manual') {
      manualConflicts.push({
        content: target.content,
        memoryId: target.id,
        reason: operation.reason || '新对话与手动记忆可能冲突',
      });
      reject(operation, 'manual_memory_requires_user_action');
      continue;
    }

    if (operation.op === 'update') {
      const content = normalizeText(operation.content);
      if (!content || content.length < 4 || operation.confidence < MIN_UPDATE_CONFIDENCE) {
        reject(operation, 'invalid_update_payload');
        continue;
      }
      accepted.push({ ...operation, content, importance: operation.importance ?? 2 });
      continue;
    }

    if (operation.op === 'stale' && operation.confidence < MIN_STALE_CONFIDENCE) {
      reject(operation, 'low_confidence_stale');
      continue;
    }

    accepted.push(operation);
  }

  return { accepted, manualConflicts, rejected };
}

export function buildMemoryReconciliationPrompt(input: {
  conversationText: string;
  candidateMemories: Array<Pick<AiMemoryRecord, 'id' | 'scope' | 'scopeId' | 'type' | 'content' | 'sourceKind' | 'confidence' | 'importance'>>;
}): string {
  const oldMemories = input.candidateMemories.length
    ? input.candidateMemories
      .map((memory, index) => `${index + 1}. id=${memory.id}; scope=${memory.scope}${memory.scopeId ? `:${memory.scopeId}` : ''}; type=${memory.type}; source=${memory.sourceKind}; importance=${memory.importance}; confidence=${memory.confidence}; content=${memory.content}`)
      .join('\n')
    : '无强相关旧记忆。';
  return [
    '请为 Pixory 的深度记忆执行安全校准，只输出 JSON。',
    '你会看到最近对话和最多 8 条候选旧记忆。只能对候选旧记忆输出 update/stale/keep，不允许操作未列出的记忆。',
    'manual 来源的记忆只能 keep，不能 update 或 stale；若冲突，仍输出 keep 或 add 新自动记忆，由用户在界面中处理。',
    '优先保守：不确定就 keep；只有用户明确替换、纠正、否定旧信息时才 stale。',
    '不要记录 API Key、系统提示词、私密本地路径或数据库内部信息。',
    'JSON 结构：{"summary":"会话摘要","decisions":"已确认事项","openQuestions":"待跟进问题","memories":[{"scope":"global或thread","type":"preference|fact|decision|instruction|task|correction","content":"单条新增候选","confidence":0.1到1,"importance":1到5}],"operations":[{"op":"add|update|stale|keep","targetMemoryId":"候选旧记忆id，可选","scope":"global或thread","type":"preference|fact|decision|instruction|task|correction","content":"新增或更新后的内容","confidence":0.1到1,"importance":1到5,"reason":"简短原因"}]}',
    'scope 只允许 global 或 thread；跨会话稳定偏好用 global，本会话决策和任务用 thread。',
    '候选旧记忆：',
    oldMemories,
    '最近对话：',
    input.conversationText || '暂无聊天片段。',
  ].join('\n\n');
}
