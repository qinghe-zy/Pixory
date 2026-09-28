import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { JustifiedRow } from '../utils/justifiedLayout';
import { JUSTIFIED_GAP } from '../utils/justifiedLayout';

interface JustifiedRowViewProps {
  row: JustifiedRow;
  gap?: number;
  /**
   * Render one cell.  Receives the item id and the precomputed pixel width
   * and height for that specific cell — the parent does not need to know
   * anything about layout math.
   */
  renderCell: (itemId: number | string, width: number, height: number) => ReactNode;
}

/**
 * JustifiedRowView
 *
 * Renders a single row produced by `computeJustifiedLayout`.
 * It is responsible for one concern only: laying out a fixed-height horizontal
 * strip of cells with pixel-perfect widths and configurable gaps.
 *
 * - No scroll logic.
 * - No data fetching.
 * - No knowledge of what's inside each cell (images, videos, skeletons, …).
 *
 * Wrapped in `memo` so that FlatList's item recycling doesn't re-render rows
 * whose data hasn't changed.
 */
export const JustifiedRowView = memo(function JustifiedRowView({
  row,
  gap = JUSTIFIED_GAP,
  renderCell,
}: JustifiedRowViewProps) {
  return (
    <View style={[styles.row, { height: row.height }]}>
      {row.cells.map((cell, cellIndex) => (
        <View
          key={String(cell.item.id)}
          style={[
            styles.cell,
            { width: cell.renderedWidth },
            cellIndex > 0 && { marginLeft: gap },
          ]}
        >
          {renderCell(cell.item.id, cell.renderedWidth, row.height)}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
  cell: {
    overflow: 'hidden',
  },
});
