export const SYSTEM_ASSISTANT_THREAD_ID = 'pixory-system-assistant';

export function isSystemAssistantThread(threadId: string): boolean {
  return threadId === SYSTEM_ASSISTANT_THREAD_ID;
}

export const SYSTEM_ASSISTANT_PROFILE = {
  profileId: 'pixory-system-assistant-ip-ops-v1',
  allowBatchMutations: false,
  allowHighRiskActions: false,
} as const;
