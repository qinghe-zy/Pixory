export interface PersonalTaskToken {
  readonly sessionId: string;
  readonly generation: number;
  readonly isActive: () => boolean;
  active: boolean;
}

const activeTasksByToken = new Map<PersonalTaskToken, Set<Promise<unknown>>>();

export function createPersonalTaskToken(sessionId: string, generation: number): PersonalTaskToken {
  let active = true;

  return {
    active,
    sessionId,
    generation,
    isActive() {
      return this.active;
    },
  };
}

export function invalidatePersonalTaskToken(token: PersonalTaskToken | null): void {
  if (!token) {
    return;
  }

  token.active = false;
}

export function assertPersonalTaskActive(taskToken?: PersonalTaskToken | null): void {
  if (taskToken && !taskToken.isActive()) {
    throw new Error('Personal task is no longer active.');
  }
}

export function trackPersonalTask<T>(taskToken: PersonalTaskToken | null | undefined, task: Promise<T>): Promise<T> {
  if (!taskToken) return task;
  const tasks = activeTasksByToken.get(taskToken) ?? new Set<Promise<unknown>>();
  tasks.add(task);
  activeTasksByToken.set(taskToken, tasks);
  void task.finally(() => {
    tasks.delete(task);
    if (tasks.size === 0) activeTasksByToken.delete(taskToken);
  }).catch(() => undefined);
  return task;
}

export async function waitForPersonalTasks(taskToken: PersonalTaskToken | null | undefined): Promise<void> {
  if (!taskToken) return;
  while ((activeTasksByToken.get(taskToken)?.size ?? 0) > 0) {
    await Promise.allSettled([...(activeTasksByToken.get(taskToken) ?? [])]);
  }
}
