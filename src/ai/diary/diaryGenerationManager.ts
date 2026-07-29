import type { PixorySpace } from '../../database';

import { resumeDiaryRuntime, runDiaryJob, suspendDiaryRuntime } from './diarySchedulerService';

const tasksByJobKey = new Map<string, Promise<void>>();
const taskSpaces = new Map<string, PixorySpace>();
const suspendedSpaces = new Set<PixorySpace>(['personal']);

function jobKey(space: PixorySpace, jobId: string): string {
  return `${space}:${jobId}`;
}

function trackBackgroundTask(space: PixorySpace, key: string, start: () => Promise<void>): Promise<void> {
  if (suspendedSpaces.has(space)) return Promise.resolve();
  const existing = tasksByJobKey.get(key);
  if (existing) {
    return existing;
  }
  const task = start();
  tasksByJobKey.set(key, task);
  taskSpaces.set(key, space);
  void task.then(
    () => {
      if (tasksByJobKey.get(key) === task) {
        tasksByJobKey.delete(key);
        taskSpaces.delete(key);
      }
    },
    () => {
      if (tasksByJobKey.get(key) === task) {
        tasksByJobKey.delete(key);
        taskSpaces.delete(key);
      }
    },
  );
  return task;
}

export function runDiaryTaskInBackground({ space, taskKey, task }: { space: PixorySpace; taskKey: string; task: () => Promise<void> }): Promise<void> {
  return trackBackgroundTask(space, taskKey, task);
}

/** Keeps confirmed diary work alive when the chat route that started it unmounts. */
export function runDiaryJobInBackground({ jobId, space }: { jobId: string; space: PixorySpace }): Promise<void> {
  return trackBackgroundTask(space, jobKey(space, jobId), () => runDiaryJob(space, jobId));
}

export function resumeDiaryBackgroundTasks(space: PixorySpace): void {
  suspendedSpaces.delete(space);
  resumeDiaryRuntime(space);
}

export async function suspendDiaryBackgroundTasks(space: PixorySpace): Promise<void> {
  suspendedSpaces.add(space);
  const runtimeSuspension = suspendDiaryRuntime(space);
  const tasks = [...tasksByJobKey].filter(([key]) => taskSpaces.get(key) === space).map(([, task]) => task);
  await runtimeSuspension;
  await Promise.allSettled(tasks);
}
