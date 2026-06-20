import { useSyncExternalStore } from 'react';

import type { PixorySpace } from '../database';

export type AiStreamingMessageIdentity = {
  generationId: string;
  messageId: string;
  space: PixorySpace;
  threadId: string;
};

export type AiStreamingMessageSnapshot = {
  content: string;
  hasSnapshot: boolean;
  reasoningText: string | null;
  status: 'generating' | 'stopped' | 'failed' | 'completed';
  updatedAt: number;
};

const emptySnapshot: AiStreamingMessageSnapshot = {
  content: '',
  hasSnapshot: false,
  reasoningText: null,
  status: 'generating',
  updatedAt: 0,
};

const snapshots = new Map<string, AiStreamingMessageSnapshot>();
const listeners = new Map<string, Set<() => void>>();
const contentListeners = new Map<string, Set<() => void>>();
const reasoningListeners = new Map<string, Set<() => void>>();

function streamingMessageKey(identity: AiStreamingMessageIdentity): string {
  return `${identity.space}:${identity.threadId}:${identity.messageId}:${identity.generationId}`;
}

function notify(listenerMap: Map<string, Set<() => void>>, key: string) {
  listenerMap.get(key)?.forEach((listener) => listener());
}

export function publishStreamingMessage(
  identity: AiStreamingMessageIdentity,
  snapshot: Partial<Omit<AiStreamingMessageSnapshot, 'updatedAt'>>
) {
  const key = streamingMessageKey(identity);
  const current = snapshots.get(key) ?? emptySnapshot;
  const nextSnapshot = {
    content: snapshot.content ?? current.content,
    hasSnapshot: true,
    reasoningText: snapshot.reasoningText === undefined ? current.reasoningText : snapshot.reasoningText,
    status: snapshot.status ?? current.status,
    updatedAt: Date.now(),
  };
  const contentChanged = nextSnapshot.content !== current.content;
  const reasoningChanged = nextSnapshot.reasoningText !== current.reasoningText;
  const statusChanged = nextSnapshot.status !== current.status;
  const hasSnapshotChanged = nextSnapshot.hasSnapshot !== current.hasSnapshot;
  if (!contentChanged && !reasoningChanged && !statusChanged && !hasSnapshotChanged) {
    return;
  }
  snapshots.set(key, nextSnapshot);
  notify(listeners, key);
  if (contentChanged || hasSnapshotChanged) {
    notify(contentListeners, key);
  }
  if (reasoningChanged || statusChanged || hasSnapshotChanged) {
    notify(reasoningListeners, key);
  }
}

export function clearStreamingMessage(identity: AiStreamingMessageIdentity) {
  const key = streamingMessageKey(identity);
  const hadSnapshot = snapshots.has(key);
  snapshots.delete(key);
  if (hadSnapshot) {
    notify(listeners, key);
    notify(contentListeners, key);
    notify(reasoningListeners, key);
  }
}

export function subscribeStreamingMessage(identity: AiStreamingMessageIdentity, listener: () => void): () => void {
  const key = streamingMessageKey(identity);
  return subscribeStreamingMessageByKey(listeners, key, listener);
}

function subscribeStreamingMessageByKey(
  listenerMap: Map<string, Set<() => void>>,
  key: string,
  listener: () => void
): () => void {
  const current = listenerMap.get(key) ?? new Set<() => void>();
  current.add(listener);
  listenerMap.set(key, current);
  return () => {
    current.delete(listener);
    if (current.size === 0) {
      listenerMap.delete(key);
    }
  };
}

export function subscribeStreamingMessageContent(identity: AiStreamingMessageIdentity, listener: () => void): () => void {
  return subscribeStreamingMessageByKey(contentListeners, streamingMessageKey(identity), listener);
}

export function subscribeStreamingMessageReasoning(identity: AiStreamingMessageIdentity, listener: () => void): () => void {
  return subscribeStreamingMessageByKey(reasoningListeners, streamingMessageKey(identity), listener);
}

export function getStreamingMessageSnapshot(identity: AiStreamingMessageIdentity): AiStreamingMessageSnapshot {
  return snapshots.get(streamingMessageKey(identity)) ?? emptySnapshot;
}

export function useStreamingMessageSnapshot(identity: AiStreamingMessageIdentity): AiStreamingMessageSnapshot {
  return useSyncExternalStore(
    (listener) => subscribeStreamingMessage(identity, listener),
    () => getStreamingMessageSnapshot(identity),
    () => getStreamingMessageSnapshot(identity)
  );
}

export function useStreamingMessageTextSnapshot(identity: AiStreamingMessageIdentity): AiStreamingMessageSnapshot {
  return useSyncExternalStore(
    (listener) => subscribeStreamingMessageContent(identity, listener),
    () => getStreamingMessageSnapshot(identity),
    () => getStreamingMessageSnapshot(identity)
  );
}

export function useStreamingMessageReasoningSnapshot(identity: AiStreamingMessageIdentity): AiStreamingMessageSnapshot {
  return useSyncExternalStore(
    (listener) => subscribeStreamingMessageReasoning(identity, listener),
    () => getStreamingMessageSnapshot(identity),
    () => getStreamingMessageSnapshot(identity)
  );
}
