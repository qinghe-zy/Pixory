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
const RATIO_MIN = 0.4; // max portrait (~2.5 : 1 portrait)
const RATIO_MAX = 4.0; // max landscape (4 : 1 landscape)

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

  const commitRow = (rowHeight: number, isLastRow = false) => {
    // 【防过大】：强行限制最大行高 (如果是最后一行则不限制，保持 targetHeight)
    const finalHeight = isLastRow ? rowHeight : Math.min(rowHeight, MAX_HEIGHT);

    const availableWidth = containerWidth - Math.max(0, rowItems.length - 1) * gap;

    const cells = rowItems.map((item) => {
      const ratio = clampRatio(item.width, item.height);
      
      // 【防过大-辅助宽度分配】：
      // 如果是最后一行，按真实比例渲染，不拉伸。
      // 如果是常规行，宽度依然按比例强行瓜分可用宽度，无视 finalHeight 是否被压扁。
      // 配合 UI 层的 resizeMode="cover" 可以完美解决裁切问题并保持右侧对齐。
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

    // 提前计算：如果强行把这张图加进当前行，行高会变成多少？
    const nextRatioSum = ratioSum + ratio;
    const nextAvailableWidth = containerWidth - rowItems.length * gap;
    const heightWithNew = nextAvailableWidth / nextRatioSum;

    // 【防过小】智能比价：如果加入新图导致行高比目标高度小，对比加和不加哪个误差更小
    if (heightWithNew < targetHeight && rowItems.length > 0) {
      const currentAvailableWidth = containerWidth - (rowItems.length - 1) * gap;
      const heightWithoutNew = currentAvailableWidth / ratioSum;

      const errorWithNew = Math.abs(heightWithNew - targetHeight);
      const errorWithoutNew = Math.abs(heightWithoutNew - targetHeight);

      if (errorWithoutNew <= errorWithNew) {
        // 不加这张图更贴近目标高度！立刻结算当前行（让它略高一点），把新图留给下一行
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
