import type { ImThreadListItem } from '../types';

export type ImFeedItem =
  | { key: string; type: 'thread'; thread: ImThreadListItem }
  | { key: string; type: 'folded'; list: ImThreadListItem[] };

export interface ImFeedResult {
  displayItems: ImFeedItem[];
  foldedList: ImThreadListItem[];
}

/**
 * 伴侣通讯录会话流构造纯函数
 *
 * 核心业务契约：
 * 1. 过滤掉从列表中隐藏（isHiddenFromList）的会话。
 * 2. 折叠会话（isFolded）统一归入折叠池：
 *    - 折叠会话不单独在主列表中显示；
 *    - 被折叠的会话暂时忽略置顶属性（折叠优先，移出折叠后恢复原置顶状态）；
 * 3. 普通未折叠会话中，isPinned = true 的会话排在最前（置顶区）。
 * 4. 折叠聚合行（__folded_group__）不再永远置顶，而是参与常规会话的时间流排序：
 *    - 取折叠池中所有会话的最晚消息时间（lastChatAt / updatedAt）；
 *    - 与未置顶的常规会话统一按时间倒序排列；若折叠会话收到新消息，聚合行自然被顶到前面；
 * 5. 若折叠池为空，则完全不呈现折叠聚合行。
 */
export function buildImThreadFeed(threads: ImThreadListItem[]): ImFeedResult {
  const visible = threads.filter((t) => !t.isHiddenFromList);
  const foldedList = visible.filter((t) => Boolean(t.isFolded));
  const unfolded = visible.filter((t) => !t.isFolded);

  // 折叠列表内部按最新消息时间倒序排列，确保进入折叠页时活跃会话在最上方
  foldedList.sort((a, b) => {
    const timeA = a.lastMessageAt || a.updatedAt ? new Date(a.lastMessageAt || a.updatedAt).getTime() : 0;
    const timeB = b.lastMessageAt || b.updatedAt ? new Date(b.lastMessageAt || b.updatedAt).getTime() : 0;
    return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
  });

  const pinnedItems = unfolded.filter((t) => Boolean(t.isPinned));
  const unpinnedItems = unfolded.filter((t) => !t.isPinned);

  const displayItems: ImFeedItem[] = pinnedItems.map((t) => ({
    key: t.id,
    type: 'thread',
    thread: t,
  }));

  if (foldedList.length > 0) {
    // 计算折叠池中最新的消息/更新时间
    let maxFoldedTime = 0;
    foldedList.forEach((t) => {
      const timeStr = t.lastMessageAt || t.updatedAt;
      if (timeStr) {
        const parsed = new Date(timeStr).getTime();
        if (!isNaN(parsed) && parsed > maxFoldedTime) {
          maxFoldedTime = parsed;
        }
      }
    });

    const foldedFeedItem: ImFeedItem = {
      key: '__folded_group__',
      type: 'folded',
      list: foldedList,
    };

    // 将未置顶常规列表与折叠聚合行按时间排序合并
    type SortableItem = {
      item: ImFeedItem;
      sortTime: number;
    };

    const sortables: SortableItem[] = unpinnedItems.map((t) => {
      const timeStr = t.lastMessageAt || t.updatedAt;
      const parsed = timeStr ? new Date(timeStr).getTime() : 0;
      return {
        item: { key: t.id, type: 'thread', thread: t },
        sortTime: isNaN(parsed) ? 0 : parsed,
      };
    });

    sortables.push({
      item: foldedFeedItem,
      sortTime: maxFoldedTime,
    });

    sortables.sort((a, b) => b.sortTime - a.sortTime);

    sortables.forEach((s) => {
      displayItems.push(s.item);
    });
  } else {
    unpinnedItems.forEach((t) => {
      displayItems.push({
        key: t.id,
        type: 'thread',
        thread: t,
      });
    });
  }

  return {
    displayItems,
    foldedList,
  };
}
