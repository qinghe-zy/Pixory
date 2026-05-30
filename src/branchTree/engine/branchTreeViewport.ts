import type { BranchTreePoint, BranchTreeViewportSize, BranchTreeViewportTransform } from './types';

export const BRANCH_TREE_MIN_SCALE = 0.4;
export const BRANCH_TREE_MAX_SCALE = 1.8;

export function clampBranchTreeScale(scale: number): number {
  return Math.min(BRANCH_TREE_MAX_SCALE, Math.max(BRANCH_TREE_MIN_SCALE, scale));
}

export function worldToScreen(point: BranchTreePoint, transform: BranchTreeViewportTransform): BranchTreePoint {
  return {
    x: point.x * transform.scale + transform.translateX,
    y: point.y * transform.scale + transform.translateY,
  };
}

export function isHeadOutsideSafeViewport(screenPoint: BranchTreePoint, viewport: BranchTreeViewportSize): boolean {
  return (
    screenPoint.x < 20 ||
    screenPoint.x > viewport.width - 140 ||
    screenPoint.y < 80 ||
    screenPoint.y > viewport.height - 280
  );
}

export function buildRecenterTransform(
  headWorldPoint: BranchTreePoint,
  viewport: BranchTreeViewportSize,
  scale: number
): BranchTreeViewportTransform {
  const nextScale = clampBranchTreeScale(scale);
  return {
    scale: nextScale,
    translateX: viewport.width / 2 - headWorldPoint.x * nextScale,
    translateY: viewport.height * 0.35 - headWorldPoint.y * nextScale,
  };
}
