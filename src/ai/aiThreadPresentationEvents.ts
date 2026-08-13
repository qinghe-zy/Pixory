import type { PixorySpace } from '../database';

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

function presentationKey(space: PixorySpace, threadId: string): string {
  return `${space}:${threadId}`;
}

export function subscribeAiThreadPresentation(
  space: PixorySpace,
  threadId: string,
  listener: Listener,
): () => void {
  const key = presentationKey(space, threadId);
  const current = listeners.get(key) ?? new Set<Listener>();
  current.add(listener);
  listeners.set(key, current);
  return () => {
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(key);
    }
  };
}

export function emitAiThreadPresentationUpdated(
  space: PixorySpace,
  threadId: string,
): void {
  listeners.get(presentationKey(space, threadId))?.forEach((listener) => {
    listener();
  });
}
