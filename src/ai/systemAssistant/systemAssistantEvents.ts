import type { PixorySpace } from '../../database';
import type { SystemTaskSnapshot } from './systemAssistantTypes';

const listeners = new Set<(task: SystemTaskSnapshot) => void>();

export function publishSystemTask(task: SystemTaskSnapshot): void {
  for (const listener of listeners) listener(task);
}

export function subscribeSystemTasks(space: PixorySpace, listener: (task: SystemTaskSnapshot) => void): () => void {
  const scopedListener = (task: SystemTaskSnapshot) => { if (task.space === space) listener(task); };
  listeners.add(scopedListener);
  return () => { listeners.delete(scopedListener); };
}
