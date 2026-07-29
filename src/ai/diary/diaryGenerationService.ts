import {
  aiThreadRepository,
  runWithDatabaseSpace,
  type AiThreadRecord,
  type PixorySpace,
} from '../../database';
import type { AiBranchScope } from '../../database/repositories/aiThreadRepository';
import type { AiMessageRecord } from '../../database/repositories/aiThreadRepository';
import { getAdapterForProvider } from '../aiProviderService';
import { resolveThreadChatModel } from '../aiChatService';
import { normalizeAiErrorMessage } from '../aiErrorMessageService';
import { diaryRepository, type RoleDiaryVersionRecord } from './diaryRepository';
import { buildDiaryPrompt } from './diaryPromptService';
import { beijingDiaryDayBounds, resolveDiaryBodyFont, resolveDiaryTheme, type DiaryTriggerKind } from './diaryTypes';

export interface GenerateRoleDiaryInput {
  space: PixorySpace;
  thread: AiThreadRecord;
  diaryDate: string;
  triggerKind: DiaryTriggerKind | 'manual';
  branchScopes: AiBranchScope[];
  sourceBranchRouteJson: string;
  sourceSnapshotHash: string;
  sourceSummarySnapshot?: string | null;
  sourceMessages?: AiMessageRecord[];
  roleSnapshotJson?: string;
  roleCardId?: string;
  deferPresentation?: boolean;
  signal?: AbortSignal;
}

function buildRoleContext(thread: AiThreadRecord, roleSnapshotJson?: string): string {
  return [thread.systemPrompt.trim(), (roleSnapshotJson ?? thread.roleSnapshotJson).trim()].filter(Boolean).join('\n\n');
}

function sourceCharacterBudget(contextWindowTokens: number | null): number {
  const modelBudget = Math.max(4_000, Math.min(24_000, Math.floor((contextWindowTokens ?? 8_000) * 2)));
  return Math.max(3_000, modelBudget - 1_500);
}

function sanitizeDiaryBody(value: string): string {
  const body = value.replace(/^\s*(日记|diary)\s*[:：-]?\s*/i, '').trim();
  if (!body) {
    throw new Error('日记模型没有返回正文。');
  }
  if (body.length > 1_600) {
    return body.slice(0, 1_600).trim();
  }
  return body;
}

export async function generateRoleDiary(input: GenerateRoleDiaryInput): Promise<RoleDiaryVersionRecord> {
  if (input.signal?.aborted) throw new Error('Diary generation was suspended.');
  const roleCardId = input.roleCardId ?? input.thread.roleCardId;
  if (!roleCardId) {
    throw new Error('当前会话没有角色卡，无法生成角色日记。');
  }
  const resolved = await resolveThreadChatModel(input.space, input.thread);
  if (resolved.status !== 'ready') {
    throw new Error(resolved.message);
  }
  if (!resolved.apiKey) {
    throw new Error('当前会话模型还没有可用的 API Key。');
  }

  const { startIso, endIso } = beijingDiaryDayBounds(input.diaryDate);
  const messages = input.sourceMessages ?? await runWithDatabaseSpace(input.space, (db) =>
    aiThreadRepository.listCompletedMessagesInDateRange(db, input.thread.id, startIso, endIso, input.branchScopes),
  );
  const built = buildDiaryPrompt({
    roleContext: buildRoleContext(input.thread, input.roleSnapshotJson),
    threadSummary: input.sourceSummarySnapshot ?? input.thread.summary,
    messages,
    historyRoundLimit: input.thread.contextHistoryRoundLimit,
    maxSourceCharacters: sourceCharacterBudget(resolved.modelContextWindowTokens),
    hasDayChat: messages.length > 0,
  });

  let streamed = '';
  let streamError: string | null = null;
  await getAdapterForProvider(resolved.provider).streamChat(
    {
      apiKey: resolved.apiKey,
      baseUrl: resolved.provider.baseUrl ?? '',
      history: [],
      modelId: resolved.modelId,
      signal: input.signal,
      systemPrompt: '你只负责写角色的私密日记。严格遵守用户给出的日记请求，不要解释。',
      thinkingDisabled: true,
      userPrompt: built.prompt,
    },
    (event) => {
      if (event.type === 'answer_delta') {
        streamed += event.text;
      }
      if (event.type === 'error') {
        streamError = event.message;
      }
    },
  );
  if (input.signal?.aborted) throw new Error('Diary generation was suspended.');
  if (streamError) {
    throw new Error(normalizeAiErrorMessage(new Error(streamError)));
  }

  return runWithDatabaseSpace(input.space, (db) => {
    if (input.signal?.aborted) throw new Error('Diary generation was suspended.');
    return (
    diaryRepository.saveDiaryVersion(db, {
      roleCardId,
      diaryDate: input.diaryDate,
      body: sanitizeDiaryBody(streamed),
      bodyFontKey: resolveDiaryBodyFont(input.space, roleCardId, input.diaryDate),
      generationModelSnapshotJson: JSON.stringify({ providerId: resolved.provider.id, modelId: resolved.modelId }),
      sourceBranchRouteJson: input.sourceBranchRouteJson,
      sourceMessageIdsJson: JSON.stringify(built.sourceMessages.map((message) => message.id)),
      sourceSnapshotHash: input.sourceSnapshotHash,
      sourceSummarySnapshot: input.sourceSummarySnapshot ?? input.thread.summary,
      sourceThreadId: input.thread.id,
      status: input.deferPresentation ? 'ready_pending_presentation' : 'ready',
      themeKey: resolveDiaryTheme(input.space, roleCardId, input.diaryDate),
    }));
  });
}
