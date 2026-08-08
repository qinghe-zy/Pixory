import type { PixorySpace } from '../../database';

export interface DiaryRuntimeNotice {
  type: 'completed';
  space: PixorySpace;
  threadId: string;
  roleCardId: string;
  jobId: string;
  diaryId: string;
}

type Listener = (notice: DiaryRuntimeNotice) => void;

const listeners = new Set<Listener>();

export function emitDiaryRuntimeNotice(notice: DiaryRuntimeNotice): void {
  for (const listener of listeners) {
    listener(notice);
  }
}

export function subscribeDiaryRuntimeNotices(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
