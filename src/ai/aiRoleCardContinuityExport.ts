import type { AiRoleCardRecord, AiThreadRecord } from './types';
import type { PixorySpace } from '../database';
import type { AiMemoryRecord, AiMessageRecord } from '../database/repositories/aiThreadRepository';

type ExportRoleCard = Pick<
  AiRoleCardRecord,
  'id' | 'name' | 'description' | 'prompt' | 'firstMessage' | 'alternateGreetings' | 'sourceType' | 'sourceJson' | 'boundaryMode' | 'tags'
>;

type ExportThread = Pick<
  AiThreadRecord,
  | 'id'
  | 'title'
  | 'systemPrompt'
  | 'materialRulesSnapshot'
  | 'summary'
  | 'contextType'
  | 'roleInstructionWeight'
  | 'replyPreference'
  | 'boundaryMode'
  | 'roleCardId'
  | 'boundIpId'
  | 'boundKnowledgeBaseId'
  | 'currentBranchRootMessageId'
  | 'currentBranchVersionIndex'
>;

type ExportMemory = Pick<AiMemoryRecord, 'id' | 'scope' | 'type' | 'content' | 'importance' | 'confidence'>;
type ExportMessage = Pick<
  AiMessageRecord,
  'id' | 'role' | 'status' | 'content' | 'createdAt' | 'branchRootMessageId' | 'branchVersionIndex'
>;

export interface RoleContinuityMarkdownInput {
  exportedAt: string;
  space: PixorySpace;
  roleCard: ExportRoleCard;
  thread?: ExportThread | null;
  memories?: ExportMemory[];
  messages?: ExportMessage[];
}

const MAX_FILE_NAME_LENGTH = 80;

function safeText(value: string | null | undefined, fallback = '无'): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function sanitizeRoleContinuityFileName(value: string): string {
  const sanitized = value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH);
  return sanitized || 'Pixory-Role';
}

function bullet(label: string, value: string | number | null | undefined): string {
  return `- ${label}: ${safeText(value == null ? null : String(value))}`;
}

function fencedText(value: string | null | undefined): string {
  const text = safeText(value);
  const longestFence = text.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0;
  const fence = '`'.repeat(Math.max(4, longestFence + 1));
  return `${fence}text\n${text}\n${fence}`;
}

function fencedJson(value: unknown): string {
  return ['```json', JSON.stringify(value, null, 2), '```'].join('\n');
}

function parseSourceJson(sourceJson: string | null | undefined): Record<string, unknown> | null {
  if (!sourceJson?.trim()) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(sourceJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    return record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? record.data as Record<string, unknown>
      : record;
  } catch {
    return null;
  }
}

function sourceField(source: Record<string, unknown> | null, key: string): string {
  const value = source?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function sourceCharacterBookSummary(source: Record<string, unknown> | null): string {
  const book = source?.character_book;
  if (!book || typeof book !== 'object' || Array.isArray(book)) {
    return '未单独设置。';
  }
  const entries = (book as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    return '未单独设置。';
  }
  const lines = entries
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      if (record.enabled === false) {
        return null;
      }
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const comment = typeof record.comment === 'string' ? record.comment.trim() : '';
      const content = typeof record.content === 'string' ? record.content.trim() : '';
      if (!name && !comment && !content) {
        return null;
      }
      return `${index + 1}. ${name || comment || '未命名条目'}\n${content || '无内容。'}`;
    })
    .filter((line): line is string => Boolean(line));
  return lines.length ? lines.join('\n\n') : '未单独设置。';
}

function buildSystemPersonaSection(roleCard: ExportRoleCard): string {
  const source = parseSourceJson(roleCard.sourceJson);
  const parts = [
    '## 系统人设区',
    '',
    '以下内容适合放在目标平台的 system prompt、角色卡设定、Character Note 或长期人设区。',
    '',
    `角色名：${roleCard.name}`,
    '',
    '### 角色核心设定',
    safeText(sourceField(source, 'description') || roleCard.description),
    '',
    '### 性格',
    safeText(sourceField(source, 'personality'), '未单独设置。'),
    '',
    '### 场景',
    safeText(sourceField(source, 'scenario'), '未单独设置。'),
    '',
    '### 系统提示',
    safeText(sourceField(source, 'system_prompt'), '未单独设置。'),
    '',
    '### 历史后指令',
    safeText(sourceField(source, 'post_history_instructions'), '未单独设置。'),
    '',
    '### Pixory 角色指令',
    fencedText(roleCard.prompt),
    '',
    '## 开场白',
    '',
    fencedText(roleCard.firstMessage),
    '',
    '## 备用开场白',
    '',
    roleCard.alternateGreetings.length
      ? roleCard.alternateGreetings.map((greeting, index) => `### ${index + 1}\n\n${fencedText(greeting)}`).join('\n\n')
      : '无备用开场白。',
    '',
    '## 标签',
    '',
    roleCard.tags.length ? roleCard.tags.map((tag) => `- ${tag}`).join('\n') : '无标签。',
    '',
    '## 角色书或附加设定',
    '',
    fencedText(sourceCharacterBookSummary(source)),
  ];
  return parts.join('\n');
}

function formatMemory(memory: ExportMemory, index: number): string {
  return [
    `${index + 1}. [${memory.scope}/${memory.type}]`,
    fencedText(memory.content),
    `   - importance: ${memory.importance}`,
    `   - confidence: ${memory.confidence}`,
  ].join('\n');
}

function formatMessage(message: ExportMessage, index: number): string {
  const label = message.role === 'assistant' ? 'Assistant' : message.role === 'user' ? 'User' : 'System';
  return [`### ${index + 1}. ${label} · ${message.createdAt}`, '', fencedText(message.content || '[空消息]')].join('\n');
}

function findPreviousRound(messages: ExportMessage[]): ExportMessage[] {
  const visible = messages.filter((message) => message.role === 'user' || message.role === 'assistant');
  const lastAssistantIndex = (() => {
    for (let index = visible.length - 1; index >= 0; index -= 1) {
      if (visible[index].role === 'assistant') {
        return index;
      }
    }
    return -1;
  })();
  if (lastAssistantIndex < 0) {
    return visible.slice(-2);
  }
  let userIndex = lastAssistantIndex - 1;
  while (userIndex >= 0 && visible[userIndex].role !== 'user') {
    userIndex -= 1;
  }
  return userIndex >= 0 ? visible.slice(userIndex, lastAssistantIndex + 1) : visible.slice(lastAssistantIndex, lastAssistantIndex + 1);
}

export function buildRoleContinuityMarkdown(input: RoleContinuityMarkdownInput): string {
  const memories = input.memories ?? [];
  const messages = input.messages ?? [];
  const previousRound = findPreviousRound(messages);
  const groupedMemories = memories.reduce<Record<string, ExportMemory[]>>((groups, memory) => {
    groups[memory.scope] = groups[memory.scope] ?? [];
    groups[memory.scope].push(memory);
    return groups;
  }, {});
  const memoryText = Object.entries(groupedMemories).length
    ? Object.entries(groupedMemories)
      .map(([scope, items]) => [`### ${scope}`, '', ...items.map(formatMemory)].join('\n'))
      .join('\n\n')
    : '无 active memory。';
  const messageText = messages.length
    ? messages.map(formatMessage).join('\n\n')
    : '无当前分支可见聊天消息。';
  const previousRoundText = previousRound.length
    ? previousRound.map(formatMessage).join('\n\n')
    : '暂无上一轮可续聊上下文。';
  const thread = input.thread;
  const nativeBranchPayload = {
    threadId: thread?.id ?? null,
    currentBranchRootMessageId: thread?.currentBranchRootMessageId ?? null,
    currentBranchVersionIndex: thread?.currentBranchVersionIndex ?? null,
    exportBranchScopes: messages.map((message) => ({
      branchRootMessageId: message.branchRootMessageId ?? null,
      branchVersionIndex: message.branchVersionIndex ?? null,
      messageId: message.id,
    })),
  };
  const nativeMessagePayload = messages.map((message) => ({
    id: message.id,
    role: message.role,
    status: message.status,
    content: message.content,
    createdAt: message.createdAt,
    branchRootMessageId: message.branchRootMessageId ?? null,
    branchVersionIndex: message.branchVersionIndex ?? null,
  }));
  const nativeSummaryPayload = {
    threadSummary: thread?.summary ?? null,
    systemPrompt: thread?.systemPrompt ?? null,
    materialRulesSnapshot: thread?.materialRulesSnapshot ?? null,
  };
  const nativeMemoryPayload = memories.map((memory) => ({
    id: memory.id,
    scope: memory.scope,
    type: memory.type,
    content: memory.content,
    importance: memory.importance,
    confidence: memory.confidence,
  }));

  return [
    '# Pixory Role Continuity Export',
    '',
    '这是 Pixory 角色连续性 Markdown 包。PNG 角色卡只承载标准角色设定；本文件承载全量上下文、记忆和续聊说明。',
    '',
    '## Native Continuity Metadata',
    '',
    '- Format Version: 1',
    '- Source: pixory-native',
    bullet('Space', input.space),
    bullet('Exported At', input.exportedAt),
    '',
    '## Native Branch Payload',
    '',
    fencedJson(nativeBranchPayload),
    '',
    '## Native Message Payload',
    '',
    fencedJson(nativeMessagePayload),
    '',
    '## Native Summary Payload',
    '',
    fencedJson(nativeSummaryPayload),
    '',
    '## Native Memory Payload',
    '',
    fencedJson(nativeMemoryPayload),
    '',
    '## Export Metadata',
    '',
    bullet('Exported At', input.exportedAt),
    bullet('Space', input.space),
    bullet('Role Card', `${input.roleCard.name} (${input.roleCard.id})`),
    bullet('Thread', thread ? `${thread.title} (${thread.id})` : '未绑定线程'),
    '',
    buildSystemPersonaSection(input.roleCard),
    '',
    '## 对话框续聊区',
    '',
    '以下内容适合复制到目标平台的新对话框中，用来接上 Pixory 当前聊天状态。不要把这一段长期写死到角色卡本体，除非你希望它成为永久设定。',
    '',
    previousRoundText,
    '',
    '## 全量上下文系统',
    '',
    thread
      ? [
        bullet('Thread Title', thread.title),
        bullet('Context Type', thread.contextType),
        bullet('Role Instruction Weight', thread.roleInstructionWeight),
        bullet('Reply Preference', thread.replyPreference),
        bullet('Boundary Mode', thread.boundaryMode),
        '',
        '### Thread System Prompt',
        safeText(thread.systemPrompt),
        '',
        '### Material Rules Snapshot',
        safeText(thread.materialRulesSnapshot, '无资料规则快照。'),
        '',
        '### Thread Summary',
        safeText(thread.summary, '无线程摘要。'),
      ].join('\n')
      : '未绑定线程，因此没有线程级上下文系统。',
    '',
    '## 全量记忆快照',
    '',
    memoryText,
    '',
    '## 当前分支全量聊天上下文',
    '',
    messageText,
    '',
    '## 使用说明',
    '',
    '1. 将同目录 PNG 导入 SillyTavern 或兼容平台，作为角色卡本体。',
    '2. 将“系统人设区”放入目标平台的 system prompt、角色设定或 Character Note。',
    '3. 将“对话框续聊区”复制到新聊天的第一条用户消息，用来接上上一轮上下文。',
    '4. “全量记忆快照”和“当前分支全量聊天上下文”用于需要强一致迁移时参考或分批粘贴；不建议全部写入 PNG 角色卡。',
    '',
  ].join('\n');
}
