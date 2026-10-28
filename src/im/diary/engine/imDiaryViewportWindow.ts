import type { DiarySpreadPair } from '../types';

/**
 * 3-Spread 视口滑动窗口 (Virtual Sliding Window)
 * 物理铁律：内存中永远只挂载 3 个对开面 (最多 6 张物理页面)
 * 复杂度恒为 O(1)，无惧积累 365+ 篇历史日记
 */

export interface ViewportState {
  currentIndex: number;
  totalSpreads: number;
  prevSpread: DiarySpreadPair | null;
  currSpread: DiarySpreadPair | null;
  nextSpread: DiarySpreadPair | null;
  canPrev: boolean;
  canNext: boolean;
}

export function computeViewportSpreads(
  allSpreads: DiarySpreadPair[],
  currentIndex: number
): ViewportState {
  const total = allSpreads.length;
  if (total === 0) {
    return {
      currentIndex: 0,
      totalSpreads: 0,
      prevSpread: null,
      currSpread: null,
      nextSpread: null,
      canPrev: false,
      canNext: false,
    };
  }

  const clampedIndex = Math.max(0, Math.min(currentIndex, total - 1));
  const prevSpread = clampedIndex > 0 ? allSpreads[clampedIndex - 1] : null;
  const currSpread = allSpreads[clampedIndex] || null;
  const nextSpread = clampedIndex < total - 1 ? allSpreads[clampedIndex + 1] : null;

  return {
    currentIndex: clampedIndex,
    totalSpreads: total,
    prevSpread,
    currSpread,
    nextSpread,
    canPrev: clampedIndex > 0,
    canNext: clampedIndex < total - 1,
  };
}

export function computeBookThicknessLayers(totalCount: number): {
  paperEdgeCount: number;
  shadowBlur: number;
  layerOffsetPx: number;
} {
  // 随篇数增长，书侧叠纸边缘视觉层数逐渐增加 (最少 2 层，最多 6 层)
  if (totalCount <= 3) {
    return { paperEdgeCount: 2, shadowBlur: 3, layerOffsetPx: 3 };
  } else if (totalCount <= 15) {
    return { paperEdgeCount: 3, shadowBlur: 5, layerOffsetPx: 5 };
  } else if (totalCount <= 60) {
    return { paperEdgeCount: 4, shadowBlur: 8, layerOffsetPx: 8 };
  } else {
    return { paperEdgeCount: 6, shadowBlur: 14, layerOffsetPx: 12 };
  }
}
