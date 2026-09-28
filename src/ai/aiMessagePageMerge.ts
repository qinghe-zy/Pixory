export interface OrderedChatMessage {
  createdAt: string;
  id: string;
}

function compareOrderedMessages(left: OrderedChatMessage, right: OrderedChatMessage): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

/**
 * Linearly merges two already ordered chat windows. Current-window records win
 * duplicate ids because they can contain newer streaming/version hydration.
 */
export function mergeOrderedMessagePages<T extends OrderedChatMessage>(
  olderPage: readonly T[],
  currentWindow: readonly T[],
): T[] {
  const currentIds = new Set(currentWindow.map((message) => message.id));
  const emittedIds = new Set<string>();
  const merged: T[] = [];
  let olderIndex = 0;
  let currentIndex = 0;
  const pushUnique = (message: T) => {
    if (!emittedIds.has(message.id)) {
      emittedIds.add(message.id);
      merged.push(message);
    }
  };

  while (olderIndex < olderPage.length || currentIndex < currentWindow.length) {
    while (olderIndex < olderPage.length && currentIds.has(olderPage[olderIndex].id)) {
      olderIndex += 1;
    }
    const older = olderPage[olderIndex];
    const current = currentWindow[currentIndex];
    if (!older) {
      if (current) {
        pushUnique(current);
        currentIndex += 1;
      }
      continue;
    }
    if (!current || compareOrderedMessages(older, current) <= 0) {
      pushUnique(older);
      olderIndex += 1;
    } else {
      pushUnique(current);
      currentIndex += 1;
    }
  }
  return merged;
}
