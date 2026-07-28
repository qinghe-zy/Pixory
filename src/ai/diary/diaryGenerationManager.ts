import type { PixorySpace } from '../../database';

import { runDiaryJob } from './diarySchedulerService';

const tasksByJobKey = new Map<string, Promise<void>>();

function jobKey(space: PixorySpace, jobId: string): string {
  return `${space}:${jobId}`;
}

function trackBackgroundTask(key: string, start: () => Promise<void>): Promise<void> {
  const existing = tasksByJobKey.get(key);
  if (existing) {
    return existing;
  }
  const task = start();
  tasksByJobKey.set(key, task);
  void task.then(
    () => {
      if (tasksByJobKey.get(key) === task) {
        tasksByJobKey.delete(key);
      }
    },
    () => {
      if (tasksByJobKey.get(key) === task) {
        tasksByJobKey.delete(key);
      }
    },
  );
  return task;
}

export function runDiaryTaskInBackground({ taskKey, task }: { taskKey: string; task: () => Promise<void> }): Promise<void> {
  return trackBackgroundTask(taskKey, task);
}

/** Keeps confirmed diary work alive when the chat route that started it unmounts. */
export function runDiaryJobInBackground({ jobId, space }: { jobId: string; space: PixorySpace }): Promise<void> {
  return trackBackgroundTask(jobKey(space, jobId), () => runDiaryJob(space, jobId));
}
