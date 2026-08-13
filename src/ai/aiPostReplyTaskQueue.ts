import type { PixorySpace } from '../database';

const activeTasks = new Map<string, Promise<void>>();

function taskKey(space: PixorySpace, threadId: string): string {
  return `${space}:${threadId}`;
}

export function enqueueAiPostReplyTask(
  space: PixorySpace,
  threadId: string,
  run: () => Promise<void>,
): Promise<void> {
  const key = taskKey(space, threadId);
  const previous = activeTasks.get(key) ?? Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(run)
    .catch(() => undefined);
  activeTasks.set(key, task);
  void task.finally(() => {
    if (activeTasks.get(key) === task) {
      activeTasks.delete(key);
    }
  });
  return task;
}
