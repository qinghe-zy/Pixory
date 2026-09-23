/**
 * justifiedLayout.ts
 *
 * Justified (equal-height row) layout engine.
 *
 * Reproduces the Google Photos / Flickr "justified grid" using a single-pass
 * greedy algorithm (O(N)).  Every image in a row shares the same height; widths
 * are solved analytically so the row fills the container exactly.
 *
 * Key formula for a row of k images with aspect ratios r₁…rk and gap G:
 *
 *   H_actual = (W − (k−1)·G) / Σrᵢ
 *   Wᵢ       = H_actual · rᵢ
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
 * Greedy tolerance multiplier.
 * A row is committed when computedHeight ≤ targetHeight × TOLERANCE.
 * 1.15 → the row breaks as soon as height would drop ≤ 15 % below target.
 */
const TOLERANCE = 1.15;

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

  const commitRow = (rowHeight: number) => {
    const cells = rowItems.map((item) => {
      const ratio = clampRatio(item.width, item.height);
      return {
        item,
        renderedWidth: Math.round(rowHeight * ratio),
      };
    });

    // Pixel-snapping: redistribute rounding error to the last cell so the row
    // width equals containerWidth exactly.
    const usedWidth =
      cells.reduce((sum, c) => sum + c.renderedWidth, 0) +
      (cells.length - 1) * gap;
    const diff = containerWidth - usedWidth;
    if (diff !== 0 && cells.length > 0) {
      cells[cells.length - 1].renderedWidth += diff;
    }

    const h = Math.round(rowHeight);
    rows.push({ cells, height: h, top: currentTop });
    currentTop += h + gap;

    // Reset accumulators.
    rowItems = [];
    ratioSum = 0;
  };

  for (const item of items) {
    const ratio = clampRatio(item.width, item.height);

    // Single-image shortcut: if one image alone would exceed the container
    // width at target height, give it its own row at target height.
    if (rowItems.length === 0 && ratio >= containerWidth / targetHeight) {
      rowItems = [item];
      ratioSum = ratio;
      commitRow(targetHeight);
      continue;
    }

    rowItems.push(item);
    ratioSum += ratio;

    const availableWidth = containerWidth - (rowItems.length - 1) * gap;
    const computedHeight = availableWidth / ratioSum;

    if (computedHeight <= targetHeight * TOLERANCE) {
      commitRow(computedHeight);
    }
  }

  // Flush the last incomplete row.
  // Do NOT stretch it to fill the container — render it left-aligned at
  // targetHeight to avoid one or two images being grotesquely enlarged.
  if (rowItems.length > 0) {
    const cells = rowItems.map((item) => ({
      item,
      renderedWidth: Math.round(targetHeight * clampRatio(item.width, item.height)),
    }));
    rows.push({ cells, height: targetHeight, top: currentTop });
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
