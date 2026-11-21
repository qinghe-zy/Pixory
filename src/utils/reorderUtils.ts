export interface FlatReorderItem {
  id: number;
  sortOrder: number;
  isPinned?: boolean;
}

export interface GroupReorderItem extends FlatReorderItem {
  type: string;
}

export function getFlatItemMoveBoundaries<T extends FlatReorderItem>(
  items: T[],
  targetId: number
): { canMoveUp: boolean; canMoveDown: boolean } {
  const index = items.findIndex((item) => item.id === targetId);
  if (index < 0) return { canMoveUp: false, canMoveDown: false };

  const current = items[index];
  const isPinned = Boolean(current.isPinned);
  const isFirst = index === 0;
  const isLast = index === items.length - 1;
  const prev = index > 0 ? items[index - 1] : null;

  // 上移禁用条件：
  // 1. 已是列表第 0 项
  // 2. 当前为未置顶卡片，且其上方为置顶卡片（未置顶不能上移超越置顶卡片，提前置灰）
  const canMoveUp = !isFirst && (isPinned || !prev?.isPinned);
  const canMoveDown = !isLast;

  return { canMoveUp, canMoveDown };
}

export function moveFlatItem<T extends FlatReorderItem>(
  items: T[],
  targetId: number,
  direction: 'up' | 'down'
): {
  nextItems: T[];
  updates: Array<{ id: number; sortOrder: number; isPinned?: boolean }>;
  unpinned: boolean;
} | null {
  const index = items.findIndex((item) => item.id === targetId);
  if (index < 0) return null;

  const current = items[index];
  if (direction === 'up') {
    if (index === 0) return null;
    const prev = items[index - 1];
    if (!current.isPinned && prev.isPinned) return null;

    const newItems = [...items];
    newItems[index - 1] = current;
    newItems[index] = prev;

    const updates: Array<{ id: number; sortOrder: number; isPinned?: boolean }> = [];
    const nextItems = newItems.map((item, idx) => {
      const nextOrder = idx * 10;
      if (item.sortOrder !== nextOrder) {
        updates.push({ id: item.id, sortOrder: nextOrder });
        return { ...item, sortOrder: nextOrder };
      }
      return item;
    });

    return { nextItems, updates, unpinned: false };
  } else {
    if (index >= items.length - 1) return null;
    const next = items[index + 1];

    const newItems = [...items];
    const updates: Array<{ id: number; sortOrder: number; isPinned?: boolean }> = [];

    if (current.isPinned && !next.isPinned) {
      // 置顶一旦下移自动取消置顶，变成未置顶状态
      const unpinnedItem: T = { ...current, isPinned: false };
      newItems[index] = next;
      newItems[index + 1] = unpinnedItem;

      const nextItems = newItems.map((item, idx) => {
        const nextOrder = idx * 10;
        const isTarget = item.id === targetId;
        if (item.sortOrder !== nextOrder || isTarget) {
          updates.push({ id: item.id, sortOrder: nextOrder, isPinned: isTarget ? false : undefined });
          return { ...item, sortOrder: nextOrder, isPinned: isTarget ? false : item.isPinned };
        }
        return item;
      });

      return { nextItems, updates, unpinned: true };
    } else {
      newItems[index] = next;
      newItems[index + 1] = current;

      const nextItems = newItems.map((item, idx) => {
        const nextOrder = idx * 10;
        if (item.sortOrder !== nextOrder) {
          updates.push({ id: item.id, sortOrder: nextOrder });
          return { ...item, sortOrder: nextOrder };
        }
        return item;
      });

      return { nextItems, updates, unpinned: false };
    }
  }
}

export function getGroupedItemMoveBoundaries<T extends GroupReorderItem>(
  groups: T[],
  targetGroup: T | null | undefined
): { canMoveUp: boolean; canMoveDown: boolean } {
  if (!targetGroup) return { canMoveUp: false, canMoveDown: false };
  const sameType = groups.filter((g) => g.type === targetGroup.type);
  const index = sameType.findIndex((g) => g.id === targetGroup.id);
  if (index < 0) return { canMoveUp: false, canMoveDown: false };

  const current = sameType[index];
  const isPinned = Boolean(current.isPinned);
  const isFirst = index === 0;
  const isLast = index === sameType.length - 1;
  const prev = index > 0 ? sameType[index - 1] : null;

  const canMoveUp = !isFirst && (isPinned || !prev?.isPinned);
  const canMoveDown = !isLast;

  return { canMoveUp, canMoveDown };
}

export function moveGroupedItem<T extends GroupReorderItem>(
  groups: T[],
  targetId: number,
  direction: 'up' | 'down'
): {
  nextItems: T[];
  updates: Array<{ id: number; sortOrder: number; isPinned?: boolean }>;
  unpinned: boolean;
} | null {
  const targetGroup = groups.find((g) => g.id === targetId);
  if (!targetGroup) return null;

  const sameType = groups.filter((g) => g.type === targetGroup.type);
  const typeIndex = sameType.findIndex((g) => g.id === targetId);
  if (typeIndex < 0) return null;

  const partnerGroup = direction === 'up' ? sameType[typeIndex - 1] : sameType[typeIndex + 1];
  if (!partnerGroup) return null;

  if (direction === 'up' && !targetGroup.isPinned && partnerGroup.isPinned) {
    return null;
  }

  const gIdx = groups.findIndex((g) => g.id === targetId);
  const partnerGIdx = groups.findIndex((g) => g.id === partnerGroup.id);
  if (gIdx < 0 || partnerGIdx < 0) return null;

  const unpinned = Boolean(direction === 'down' && targetGroup.isPinned && !partnerGroup.isPinned);
  const finalTargetGroup: T = unpinned ? { ...targetGroup, isPinned: false } : targetGroup;

  const newGroups = [...groups];
  newGroups[gIdx] = partnerGroup;
  newGroups[partnerGIdx] = finalTargetGroup;

  const updates: Array<{ id: number; sortOrder: number; isPinned?: boolean }> = [];
  const reorderedSameType = newGroups.filter((g) => g.type === targetGroup.type);
  const orderMap = new Map<number, { sortOrder: number; isPinned?: boolean }>();

  reorderedSameType.forEach((g, i) => {
    const nextOrder = i * 10;
    const isTarget = g.id === targetId;
    if (g.sortOrder !== nextOrder || (isTarget && unpinned)) {
      const isPinnedVal = isTarget && unpinned ? false : undefined;
      updates.push({ id: g.id, sortOrder: nextOrder, isPinned: isPinnedVal });
      orderMap.set(g.id, { sortOrder: nextOrder, isPinned: isPinnedVal });
    }
  });

  const nextItems = newGroups.map((g) => {
    const update = orderMap.get(g.id);
    if (update) {
      return {
        ...g,
        sortOrder: update.sortOrder,
        ...(update.isPinned !== undefined ? { isPinned: update.isPinned } : {}),
      };
    }
    return g;
  });

  return { nextItems, updates, unpinned };
}
