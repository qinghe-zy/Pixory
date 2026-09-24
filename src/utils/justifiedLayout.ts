/**
 * justifiedLayout.ts
 *
 * Justified (equal-height row) layout engine.
 *
 * Reproduces the Google Photos / Flickr "justified grid" using a single-pass algorithm (O(N)).
 *
 * Enhanced with dual-layer layout protections:
 * 1. Smart Breaking (防过小): Compares error deltas to prevent images from being squished too small.
 * 2. Max Height Capping (防过大): Caps row height and uses proportional width allocation 
 *    with `cover` cropping to prevent rows of portrait images from becoming overwhelmingly tall.
 *
 * This module is pure TypeScript with zero React / React-Native imports so it
 * can be exercised in plain Jest without a native environment.
 */

// ─── Public constants ────────────────────────────────────────────────────────

/** Default gap between images (px) — both horizontal and vertical. */
export const JUSTIFIED_GAP = 2;

/** Default target row height (px). */
export const JUSTIFIED_TARGET_HEIGHT = 150;

/**
 * Aspect-ratio clamp range.
 * Prevents pathologically thin or wide images from distorting their neighbours.
 */
const RATIO_MIN = 0.56; // max portrait (16:9 portrait, approx 0.56)
const RATIO_MAX = 2.5; // max landscape (2.5 : 1 panorama)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JustifiedItem {
  /** Unique identifier — passed through unchanged for keying. */
  id: number | string;
  /** Original pixel width as stored in the database. */
  width: number;
  /** Original pixel height as stored in the database. */
  height: number;
}

export interface JustifiedCell {
  /** Reference to the original item. */
  item: JustifiedItem;
  /** Rendered pixel width for this cell. */
  renderedWidth: number;
}

export interface JustifiedRow {
  /** Ordered cells that make up this row. */
  cells: JustifiedCell[];
  /** Shared rendered height for every cell in this row (px, integer). */
  height: number;
  /**
   * Absolute vertical offset from the top of the list (px, integer).
   * Used directly by FlatList.getItemLayout — no DOM measurement needed.
   */
  top: number;
}

export interface JustifiedLayoutOptions {
  /** Usable container width in physical pixels (full-bleed, no padding). */
  containerWidth: number;
  /** Pixel gap between cells and between rows. @default JUSTIFIED_GAP */
  gap?: number;
  /** Target row height; greedy algorithm commits a row near this value. @default JUSTIFIED_TARGET_HEIGHT */
  targetHeight?: number;
}

// ─── Core algorithm ──────────────────────────────────────────────────────────

/**
 * Compute a justified row layout for an ordered list of items.
 *
 * Returns one `JustifiedRow` per visual row.  Each row carries precomputed
 * `top` and `height` values so that `FlatList.getItemLayout` can skip all
 * native measurement and achieve true O(log N) visible-row lookup.
 *
 * Complexity: O(N) time, O(M) space where M = number of rows ≪ N.
 */
export function computeJustifiedLayout(
  items: JustifiedItem[],
  options: JustifiedLayoutOptions,
): JustifiedRow[] {
  const {
    containerWidth,
    gap = JUSTIFIED_GAP,
    targetHeight = JUSTIFIED_TARGET_HEIGHT,
  } = options;

  if (containerWidth <= 0 || items.length === 0) {
    return [];
  }

  const rows: JustifiedRow[] = [];

  // Accumulator for the current in-progress row.
  let rowItems: JustifiedItem[] = [];
  let ratioSum = 0;
  let currentTop = 0;

  // Maximum allowed height for a row (1.5x multiplier)
  const MAX_HEIGHT = targetHeight * 1.5;
  // 【防极宽图】最短边保护：防止全景图导致行高变成极窄的缝隙（如 60px），强行保底到 100px 并通过 cover 左右裁切
  const MIN_ROW_HEIGHT = Math.max(100, targetHeight * 0.6);

  const commitRow = (rowHeight: number, isLastRow = false) => {
    // 【防过大/防过矮】：强行限制最大和最小行高
    let finalHeight = rowHeight;
    if (!isLastRow) {
      finalHeight = Math.max(MIN_ROW_HEIGHT, Math.min(rowHeight, MAX_HEIGHT));
    }

    const availableWidth = containerWidth - Math.max(0, rowItems.length - 1) * gap;

    const cells = rowItems.map((item) => {
      const ratio = clampRatio(item.width, item.height);
      
      // 【防过大-辅助宽度分配】：
      // 宽度依然按比例强行瓜分可用宽度，无视 finalHeight 是否被压扁或拔高。
      const renderedWidth = isLastRow
        ? Math.round(finalHeight * ratio)
        : Math.round((ratio / ratioSum) * availableWidth);

      return {
        item,
        renderedWidth,
      };
    });

    // Pixel-snapping: 把 Math.round 导致的几个像素误差补给最后一个元素，保证像素级贴合右边缘
    if (!isLastRow && cells.length > 0) {
      const usedWidth = cells.reduce((sum, c) => sum + c.renderedWidth, 0);
      const diff = availableWidth - usedWidth;
      if (diff !== 0) {
        cells[cells.length - 1].renderedWidth += diff;
      }
    }

    const h = Math.round(finalHeight);
    rows.push({ cells, height: h, top: currentTop });
    currentTop += h + gap;

    // Reset accumulators
    rowItems = [];
    ratioSum = 0;
  };

  for (const item of items) {
    const ratio = clampRatio(item.width, item.height);

    // Single-image shortcut: 如果单张图本身就已经非常宽，直接让它单独成行
    if (rowItems.length === 0 && ratio >= containerWidth / targetHeight) {
      rowItems = [item];
      ratioSum = ratio;
      commitRow(targetHeight, false);
      continue;
    }

    // 【防面条】单行最多图片数量保护
    const MAX_ITEMS_PER_ROW = 4;
    // 【智能防面条】宽度物理下限保护：如果加了这图，平均宽度会小于 80px，则强行断行（专门保护折叠屏或大屏的物理体验）
    const MIN_CELL_WIDTH = 80;
    const nextAvailableWidth = containerWidth - rowItems.length * gap;
    const predictedAvgWidth = nextAvailableWidth / (rowItems.length + 1);

    if (rowItems.length >= MAX_ITEMS_PER_ROW || (rowItems.length > 0 && predictedAvgWidth < MIN_CELL_WIDTH)) {
      const currentAvailableWidth = containerWidth - (rowItems.length - 1) * gap;
      const currentHeight = currentAvailableWidth / ratioSum;
      commitRow(currentHeight, false);
      rowItems = [item];
      ratioSum = ratio;
      continue;
    }

    // 提前计算：如果强行把这张图加进当前行，行高会变成多少？
    const nextRatioSum = ratioSum + ratio;
    const heightWithNew = nextAvailableWidth / nextRatioSum;

    // 【防过小】智能比价：如果加入新图导致行高比目标高度小，对比加和不加哪个误差更小
    if (heightWithNew < targetHeight && rowItems.length > 0) {
      const currentAvailableWidth = containerWidth - (rowItems.length - 1) * gap;
      const heightWithoutNew = currentAvailableWidth / ratioSum;

      const errorWithNew = Math.abs(heightWithNew - targetHeight);
      const errorWithoutNew = Math.abs(heightWithoutNew - targetHeight);

      // 引入偏好系数 (0.8)，使得算法在误差相近时，更倾向于把新图“挤”进来，而不是让上一行变得过大
      // 这可以完美解决不同页面（因 Padding 导致 containerWidth 差几像素）排版从 2张 突变到 1张 的不一致问题
      const PACK_BIAS = 0.8;

      if (errorWithoutNew <= errorWithNew * PACK_BIAS) {
        // 只有当“不加新图”的误差显著更小时，才换行
        commitRow(heightWithoutNew, false);
        rowItems = [item];
        ratioSum = ratio;
        continue;
      }
    }

    // 否则，将其加入当前行
    rowItems.push(item);

    ratioSum += ratio;

    // 保底结算：一旦当前行高 <= 目标高度，说明已经填够了，可以直接结算
    const currentAvailableWidth = containerWidth - (rowItems.length - 1) * gap;
    const currentHeight = currentAvailableWidth / ratioSum;
    
    if (currentHeight <= targetHeight) {
      commitRow(currentHeight, false);
    }
  }

  // 尾行处理：不拉伸填满屏幕，而是固定在 targetHeight 左对齐展示
  if (rowItems.length > 0) {
    commitRow(targetHeight, true);
  }

  return rows;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a clamped aspect ratio from raw pixel dimensions.
 * Falls back to 1 (square) when dimensions are missing or zero.
 */
export function clampRatio(width: number, height: number): number {
  if (!width || !height) {
    return 1;
  }
  const raw = width / height;
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, raw));
}
