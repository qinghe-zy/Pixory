import { StyleSheet, View } from 'react-native';

import { aiLightColors } from '../../components/ai/aiLightTheme';
import type { BranchTreeVisibleWindow } from '../engine/branchTreeViewportVirtualization';

interface BranchTreeGridProps {
  width: number;
  height: number;
  smallStep?: number;
  largeStep?: number;
  visibleWindow?: BranchTreeVisibleWindow | null;
}

const BRANCH_TREE_GRID_MAX_LINES = 32;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildGridPositions(size: number, step: number, windowStart = 0, windowEnd = size): number[] {
  if (!Number.isFinite(size) || size <= 0) {
    return [];
  }
  const safeStep = Math.max(1, step);
  const adaptiveStep =
    Math.ceil(size / BRANCH_TREE_GRID_MAX_LINES / safeStep) * safeStep;
  const actualStep = Math.max(safeStep, adaptiveStep);
  const start = clamp(Math.floor(windowStart / actualStep) * actualStep, 0, size);
  const end = clamp(Math.ceil(windowEnd / actualStep) * actualStep, 0, size);
  const positions: number[] = [];
  for (let position = start; position <= end; position += actualStep) {
    positions.push(position);
  }
  return positions;
}

export function BranchTreeGrid({ height, largeStep = 100, smallStep = 20, visibleWindow, width }: BranchTreeGridProps) {
  const left = clamp(visibleWindow?.left ?? 0, 0, width);
  const right = clamp(visibleWindow?.right ?? width, 0, width);
  const top = clamp(visibleWindow?.top ?? 0, 0, height);
  const bottom = clamp(visibleWindow?.bottom ?? height, 0, height);
  const dotXs = buildGridPositions(width, smallStep, left, right);
  const dotYs = buildGridPositions(height, smallStep, top, bottom);
  const lineXs = buildGridPositions(width, largeStep, left, right);
  const lineYs = buildGridPositions(height, largeStep, top, bottom);
  const lineHeight = Math.max(0, bottom - top);
  const lineWidth = Math.max(0, right - left);

  return (
    <View pointerEvents="none" style={styles.root}>
      {dotXs.map((x) =>
        dotYs.map((y) => (
          <View
            key={`dot:${x}:${y}`}
            style={[styles.dot, { left: x, top: y }]}
          />
        )),
      )}
      {lineXs.map((x) => (
        <View
          key={`vx:${x}`}
          style={[styles.verticalLine, { height: lineHeight, left: x, top }]}
        />
      ))}
      {lineYs.map((y) => (
        <View
          key={`hy:${y}`}
          style={[styles.horizontalLine, { left, top: y, width: lineWidth }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    backgroundColor: aiLightColors.muted,
    borderRadius: 1,
    height: 2,
    opacity: 0.08,
    position: 'absolute',
    width: 2,
  },
  horizontalLine: {
    backgroundColor: aiLightColors.hairline,
    height: StyleSheet.hairlineWidth,
    opacity: 0.08,
    position: 'absolute',
  },
  root: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  verticalLine: {
    backgroundColor: aiLightColors.hairline,
    opacity: 0.08,
    position: 'absolute',
    width: StyleSheet.hairlineWidth,
  },
});
