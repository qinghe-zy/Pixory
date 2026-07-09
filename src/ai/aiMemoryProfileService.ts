import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiBranchScope, AiMessageRecord, AiUserProfileRecord } from '../database/repositories/aiThreadRepository';
import { EMPTY_USER_PROFILE_JSON, buildProfileInitializationPrompt, buildProfileUpdatePrompt } from './aiMemoryPrompts';
import { callMemoryMaintenanceModel, localMemoryMaintenanceResult, type MemoryMaintenanceModelCallResult } from './aiMemoryMaintenanceModelService';
import { emptyMaintenanceStepResult, type MemoryMaintenanceStepResult } from './aiMemorySummaryService';

export const PROFILE_INITIAL_MESSAGE_COUNT = 8;
export const PROFILE_UPDATE_MESSAGE_INTERVAL = 16;
export const PROFILE_PASSIVE_UPDATE_MESSAGE_INTERVAL = 10;
export const PROFILE_STRONG_SIGNAL_MESSAGE_COOLDOWN = 4;
export const PROFILE_STRONG_SIGNAL_TIME_COOLDOWN_MS = 5 * 60 * 1000;

export const PROFILE_SIGNAL_PATTERNS = [
  /记住我|你可以记住|帮我记住/,
  /我喜欢|我不喜欢|我习惯|我更偏好|我希望|我需要/,
  /我是|我叫|叫我|我现在|我最近|我目前|我现在在做|我的项目是/,
  /不是这样|你记错了|我其实是|应该是/,
  /以后都|默认|每次都|不要再|以后不要|以后请/,
];

export type ProfileUpdateReason = 'message_interval' | 'strong_signal' | 'leave_chat' | 'app_background' | 'summary_merge';

const REQUIRED_PROFILE_KEYS = Object.keys(EMPTY_USER_PROFILE_JSON);

type MutableProfileJson = {
  基本信息: Record<string, string>;
  性格特点: string[];
  说话习惯: string[];
  近期状态: string;
  重要关系: Record<string, string>;
  重要日期: string[];
  偏好: {
    喜欢: string[];
    不喜欢: string[];
  };
  价值观: string[];
};

function createAiProfileId(): string {
  return `aiprofile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

function formatConversation(messages: AiMessageRecord[]): string {
  return messages
    .map((message) => `${message.role === 'assistant' ? 'AI' : '用户'}（${message.completedAt ?? message.createdAt}）：${message.content}`)
    .join('\n\n');
}

export function parseProfileJson(text: string, fallback = EMPTY_USER_PROFILE_JSON): typeof EMPTY_USER_PROFILE_JSON {
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    const fallbackRecord = fallback as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of REQUIRED_PROFILE_KEYS) {
      next[key] = Object.prototype.hasOwnProperty.call(parsed, key) ? parsed[key] : fallbackRecord[key];
    }
    if (!next.偏好 || typeof next.偏好 !== 'object' || Array.isArray(next.偏好)) {
      next.偏好 = fallback.偏好;
    }
    return next as typeof EMPTY_USER_PROFILE_JSON;
  } catch {
    return fallback;
  }
}

function profileJsonToText(profile: typeof EMPTY_USER_PROFILE_JSON): string {
  const lines: string[] = [];
  const basic = Object.entries(profile.基本信息).map(([key, value]) => `${key}：${String(value)}`);
  if (basic.length > 0) {
    lines.push(`基本信息：${basic.join('；')}`);
  }
  if (profile.性格特点.length > 0) {
    lines.push(`性格特点：${profile.性格特点.join('、')}`);
  }
  if (profile.说话习惯.length > 0) {
    lines.push(`说话习惯：${profile.说话习惯.join('、')}`);
  }
  if (profile.近期状态) {
    lines.push(`近期状态：${profile.近期状态}`);
  }
  const relationships = Object.entries(profile.重要关系).map(([key, value]) => `${key}：${String(value)}`);
  if (relationships.length > 0) {
    lines.push(`重要关系：${relationships.join('；')}`);
  }
  if (profile.重要日期.length > 0) {
    lines.push(`重要日期：${profile.重要日期.join('、')}`);
  }
  if (profile.偏好.喜欢.length > 0 || profile.偏好.不喜欢.length > 0) {
    lines.push(`偏好：喜欢 ${profile.偏好.喜欢.join('、') || '暂无'}；不喜欢 ${profile.偏好.不喜欢.join('、') || '暂无'}`);
  }
  if (profile.价值观.length > 0) {
    lines.push(`价值观：${profile.价值观.join('、')}`);
  }
  return lines.join('\n');
}

function getProfileFallback(profile: AiUserProfileRecord | null): typeof EMPTY_USER_PROFILE_JSON {
  if (!profile) {
    return EMPTY_USER_PROFILE_JSON;
  }
  return parseProfileJson(profile.profileJson, EMPTY_USER_PROFILE_JSON);
}

function profileTextToJson(profileText: string, current: AiUserProfileRecord | null): typeof EMPTY_USER_PROFILE_JSON {
  const next = JSON.parse(JSON.stringify(getProfileFallback(current))) as Record<string, unknown>;
  const basicInfo = next.基本信息 && typeof next.基本信息 === 'object' && !Array.isArray(next.基本信息)
    ? { ...(next.基本信息 as Record<string, unknown>) }
    : {};
  const trimmed = profileText.trim();
  if (trimmed) {
    basicInfo.用户手动画像 = trimmed;
  } else {
    delete basicInfo.用户手动画像;
  }
  next.基本信息 = basicInfo;
  return next as unknown as typeof EMPTY_USER_PROFILE_JSON;
}

function cloneProfile(profile: typeof EMPTY_USER_PROFILE_JSON): MutableProfileJson {
  return JSON.parse(JSON.stringify(profile)) as MutableProfileJson;
}

function appendUnique(target: string[], value: string): void {
  const trimmed = value.trim().replace(/[。；;，,]+$/, '');
  if (trimmed && !target.includes(trimmed)) {
    target.push(trimmed);
  }
}

function extractLocalPreference(content: string, marker: '我喜欢' | '我不喜欢'): string | null {
  const index = content.indexOf(marker);
  if (index < 0) {
    return null;
  }
  const rest = content.slice(index + marker.length).trim();
  return rest.split(/[。；;\n]/)[0]?.trim() ?? null;
}

function buildLocalProfileJsonFromMessages(messages: AiMessageRecord[], fallback = EMPTY_USER_PROFILE_JSON): typeof EMPTY_USER_PROFILE_JSON {
  const next = cloneProfile(fallback);
  const recentUserMessages = messages.filter((message) => message.role === 'user');
  for (const message of recentUserMessages) {
    const content = message.content.trim();
    const like = extractLocalPreference(content, '我喜欢');
    const dislike = extractLocalPreference(content, '我不喜欢');
    if (like) {
      appendUnique(next.偏好.喜欢, like);
    }
    if (dislike) {
      appendUnique(next.偏好.不喜欢, dislike);
    }
    const selfIntro = /我是([^。；;\n]{1,40})/.exec(content)?.[1]?.trim();
    if (selfIntro) {
      next.基本信息.自述 = selfIntro;
    }
  }
  const latest = recentUserMessages[recentUserMessages.length - 1]?.content.trim();
  if (latest) {
    next.近期状态 = latest.length > 160 ? `${latest.slice(0, 160)}...` : latest;
  }
  return next as unknown as typeof EMPTY_USER_PROFILE_JSON;
}

function remoteFallbackError(error: string | null): string | null {
  return error ? `remote_failed_used_local_fallback: ${error}` : null;
}

function stepResultFromModel(modelResult: MemoryMaintenanceModelCallResult, usedFallback: boolean): MemoryMaintenanceStepResult {
  return {
    error: modelResult.error,
    modelId: modelResult.modelId,
    providerId: modelResult.providerId,
    usedFallback,
    usedRemote: modelResult.usedRemote,
  };
}

export function hasStrongProfileSignal(text: string): boolean {
  return PROFILE_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

export async function getUserProfile(space: PixorySpace, boundIpId: number | null = null, boundThreadId: string | null = null): Promise<AiUserProfileRecord | null> {
  return runWithDatabaseSpace(space, (db) => aiThreadRepository.getUserProfile(db, space, boundIpId, boundThreadId));
}

export async function updateUserProfile(space: PixorySpace, profileText: string, boundIpId: number | null = null, boundThreadId: string | null = null): Promise<AiUserProfileRecord> {
  return runWithDatabaseSpace(space, async (db) => {
    const current = await aiThreadRepository.getUserProfile(db, space, boundIpId, boundThreadId);
    const now = new Date().toISOString();
    const profileJson = profileTextToJson(profileText, current);
    return aiThreadRepository.upsertUserProfile(db, {
      id: current?.id ?? createAiProfileId(),
      lastUpdatedAt: now,
      messageCountAtUpdate: current?.messageCountAtUpdate ?? 0,
      profileJson: JSON.stringify(profileJson),
      profileText,
      sourceEndMessageId: current?.sourceEndMessageId ?? null,
      sourceStartMessageId: current?.sourceStartMessageId ?? null,
      sourceThreadId: current?.sourceThreadId ?? null,
      space,
      boundIpId,
      boundThreadId,
      version: current?.version ?? 1,
    });
  });
}

export async function maybeInitializeUserProfile(
  space: PixorySpace,
  threadId: string,
  options: {
    allowRemoteModel?: boolean;
    branchScopes?: AiBranchScope[];
    reversibleImportSessionId?: string | null;
    allowIrreversibleImportEffects?: boolean;
  } = {}
): Promise<MemoryMaintenanceStepResult> {
  if (options.allowIrreversibleImportEffects === false) {
    return emptyMaintenanceStepResult();
  }
  const prepared = await runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread) {
      return null;
    }
    const settings = await aiThreadRepository.getThreadMemorySettings(db, threadId);
    const existing = await aiThreadRepository.getUserProfile(db, space, null, thread.id);
    if (!settings.deepMemoryEnabled || existing) {
      return null;
    }
    const messageCount = await aiThreadRepository.countCompletedNonSystemMessagesAfter(db, threadId, null, options.branchScopes);
    if (messageCount < PROFILE_INITIAL_MESSAGE_COUNT) {
      return null;
    }
    const selected = await aiThreadRepository.listCompletedNonSystemMessagesAfter(db, threadId, null, PROFILE_INITIAL_MESSAGE_COUNT, options.branchScopes);
    return {
      conversation: formatConversation(selected),
      endMessageId: selected[selected.length - 1].id,
      messageCount,
      selected,
      startMessageId: selected[0].id,
      thread,
    };
  });
  if (!prepared) {
    return emptyMaintenanceStepResult();
  }
  const modelResult = options.allowRemoteModel === false
    ? localMemoryMaintenanceResult()
    : await callMemoryMaintenanceModel({
      space,
      systemPrompt: '你是 Pixory 的用户画像建档器。只输出 JSON。',
      thread: prepared.thread,
      userPrompt: buildProfileInitializationPrompt(prepared.conversation, '本会话'),
    });
  const profileJson = modelResult.text ? parseProfileJson(modelResult.text) : buildLocalProfileJsonFromMessages(prepared.selected);
  const now = new Date().toISOString();
  await runWithDatabaseSpace(space, async (db) => {
    await aiThreadRepository.upsertUserProfile(db, {
      id: createAiProfileId(),
      lastUpdatedAt: now,
      messageCountAtUpdate: prepared.messageCount,
      profileJson: JSON.stringify(profileJson),
      profileText: profileJsonToText(profileJson),
      sourceEndMessageId: prepared.endMessageId,
      sourceStartMessageId: prepared.startMessageId,
      sourceThreadId: threadId,
      space,
      boundIpId: null,
      boundThreadId: prepared.thread.id,
      version: 1,
    });
    await aiThreadRepository.updateThreadMemoryJob(db, {
      lastMaintenanceError: remoteFallbackError(modelResult.error),
      threadId,
    });
  });
  return stepResultFromModel(modelResult, !modelResult.text);
}

function reasonIsEligible(input: {
  completedSinceLastUpdate: number;
  jobCooldownUntil: string | null;
  lastProfileUpdatedAt: string | null;
  nowMs: number;
  reason: ProfileUpdateReason;
}): boolean {
  if (input.reason === 'message_interval' || input.reason === 'summary_merge') {
    return input.completedSinceLastUpdate >= PROFILE_UPDATE_MESSAGE_INTERVAL;
  }
  if (input.reason === 'leave_chat' || input.reason === 'app_background') {
    return input.completedSinceLastUpdate >= PROFILE_PASSIVE_UPDATE_MESSAGE_INTERVAL;
  }
  const cooldownByMessage = input.completedSinceLastUpdate >= PROFILE_STRONG_SIGNAL_MESSAGE_COOLDOWN;
  const cooldownUntilMs = input.jobCooldownUntil ? Date.parse(input.jobCooldownUntil) : 0;
  const cooldownByTime = Number.isNaN(cooldownUntilMs) || input.nowMs >= cooldownUntilMs;
  return cooldownByMessage || cooldownByTime;
}

export async function maybeUpdateUserProfile(
  space: PixorySpace,
  threadId: string,
  reason: ProfileUpdateReason,
  options: {
    allowRemoteModel?: boolean;
    branchScopes?: AiBranchScope[];
    reversibleImportSessionId?: string | null;
    allowIrreversibleImportEffects?: boolean;
  } = {}
): Promise<MemoryMaintenanceStepResult> {
  if (options.allowIrreversibleImportEffects === false) {
    return emptyMaintenanceStepResult();
  }
  const prepared = await runWithDatabaseSpace(space, async (db) => {
    const thread = await aiThreadRepository.findThreadById(db, threadId);
    if (!thread) {
      return null;
    }
    const settings = await aiThreadRepository.getThreadMemorySettings(db, threadId);
    const profile = await aiThreadRepository.getUserProfile(db, space, null, thread.id);
    if (!settings.deepMemoryEnabled || !profile) {
      return null;
    }
    const job = await aiThreadRepository.getThreadMemoryJob(db, threadId);
    const messageCount = await aiThreadRepository.countCompletedNonSystemMessagesAfter(db, threadId, null, options.branchScopes);
    const completedSinceLastUpdate = messageCount - (profile.messageCountAtUpdate || job.completedMessageCountAtProfileUpdate || 0);
    const nowMs = Date.now();
    if (!reasonIsEligible({
      completedSinceLastUpdate,
      jobCooldownUntil: job.profileUpdateCooldownUntil,
      lastProfileUpdatedAt: job.lastProfileUpdatedAt,
      nowMs,
      reason,
    })) {
      return null;
    }
    const selected = await aiThreadRepository.listRecentCompletedNonSystemMessages(db, threadId, 30, options.branchScopes);
    return {
      conversation: formatConversation(selected),
      currentProfile: profile,
      endMessageId: selected[selected.length - 1]?.id ?? null,
      messageCount,
      selected,
      startMessageId: selected[0]?.id ?? null,
      thread,
    };
  });
  if (!prepared) {
    return emptyMaintenanceStepResult();
  }
  const modelResult = options.allowRemoteModel === false
    ? localMemoryMaintenanceResult()
    : await callMemoryMaintenanceModel({
      space,
      systemPrompt: '你是 Pixory 的用户画像维护器。只输出 JSON。',
      thread: prepared.thread,
      userPrompt: buildProfileUpdatePrompt(prepared.currentProfile.profileJson, prepared.conversation, prepared.currentProfile.profileText, '本会话'),
    });
  const profileJson = modelResult.text
    ? parseProfileJson(modelResult.text, getProfileFallback(prepared.currentProfile))
    : buildLocalProfileJsonFromMessages(prepared.selected, getProfileFallback(prepared.currentProfile));
  const now = new Date().toISOString();
  await runWithDatabaseSpace(space, async (db) => {
    await aiThreadRepository.upsertUserProfile(db, {
      id: prepared.currentProfile.id,
      lastUpdatedAt: now,
      messageCountAtUpdate: prepared.messageCount,
      profileJson: JSON.stringify(profileJson),
      profileText: profileJsonToText(profileJson),
      sourceEndMessageId: prepared.endMessageId,
      sourceStartMessageId: prepared.startMessageId,
      sourceThreadId: threadId,
      space,
      boundIpId: null,
      boundThreadId: prepared.thread.id,
      version: prepared.currentProfile.version,
    });
    await aiThreadRepository.updateThreadMemoryJob(db, {
      completedMessageCountAtProfileUpdate: prepared.messageCount,
      lastMaintenanceError: remoteFallbackError(modelResult.error),
      lastProfileUpdatedAt: now,
      profileUpdateCooldownUntil: new Date(Date.now() + PROFILE_STRONG_SIGNAL_TIME_COOLDOWN_MS).toISOString(),
      threadId,
    });
  });
  return stepResultFromModel(modelResult, !modelResult.text);
}
