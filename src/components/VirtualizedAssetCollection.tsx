import { useEffect, useRef, memo, useMemo, useCallback, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  View,
  type GestureResponderHandlers,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import type { ImageListItem } from '../database';
import type { AssetListViewMode } from '../database/repositories/settingsRepository';
import { colors, layout, rhythm, spacing } from '../design/tokens';
import { globalViewState } from '../services/globalViewState';
import { JustifiedRowView } from './JustifiedRowView';
import {
  computeJustifiedLayout,
  JUSTIFIED_GAP,
  JUSTIFIED_TARGET_HEIGHT,
  type JustifiedRow,
} from '../utils/justifiedLayout';


interface MeasuredLayout {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface VirtualizedAssetCollectionProps {
  emptyComponent?: ReactNode;
  headerComponent?: ReactNode;
  images: ImageListItem[];
  isLoadingMore?: boolean;
  listRef?: RefObject<any>;
  onEndReached?: () => void;
  onItemMeasured?: (imageId: number, layout: MeasuredLayout | null) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  panHandlers?: GestureResponderHandlers;
  scrollOffsetRef?: { current: number };
  renderAsset: (image: ImageListItem, index: number, fillCell: boolean) => ReactNode;
  viewMode: AssetListViewMode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
}

export const VirtualizedAssetCollection = memo(function VirtualizedAssetCollection({
  emptyComponent,
  headerComponent,
  images,
  isLoadingMore = false,
  listRef,
  onEndReached,
  onItemMeasured,
  onScroll,
  panHandlers,
  scrollOffsetRef = { current: 0 },
  renderAsset,
  viewMode,
  contentContainerStyle,
}: VirtualizedAssetCollectionProps) {

  const isGrid = viewMode === 'grid';
  const isJustified = viewMode === 'justified';
  const numColumns = isGrid ? 3 : 1;

  // ── Justified layout pre-computation ──────────────────────────────────────
  // Single useMemo: one O(N) pass builds the row layout, the id→item lookup,
  // and the id→index lookup together. Only re-runs when images reference
  // changes, not on unrelated re-renders (isLoadingMore, callbacks, etc.).
  const { justifiedRows, itemById, indexById } = useMemo(() => {
    if (!isJustified) {
      return {
        justifiedRows: [] as JustifiedRow[],
        itemById: new Map<number, ImageListItem>(),
        indexById: new Map<number, number>(),
      };
    }
    const containerWidth = Dimensions.get('window').width; // full-bleed
    const rows = computeJustifiedLayout(images, {
      containerWidth,
      gap: JUSTIFIED_GAP,
      targetHeight: JUSTIFIED_TARGET_HEIGHT,
    });
    const byId = new Map<number, ImageListItem>();
    const byIndex = new Map<number, number>();
    for (let i = 0; i < images.length; i++) {
      byId.set(images[i].id, images[i]);
      byIndex.set(images[i].id, i);
    }
    return { justifiedRows: rows, itemById: byId, indexById: byIndex };
  }, [isJustified, images]);

  // ── Initial scroll restoration ─────────────────────────────────────────────
  const initialIndex = useRef<number | undefined>(undefined);
  if (initialIndex.current === undefined) {
    if (globalViewState.lastViewedImageId !== -1) {
      if (isJustified) {
        // Find which row contains the last-viewed image.
        const rowIdx = justifiedRows.findIndex((row) =>
          row.cells.some((cell) => cell.item.id === globalViewState.lastViewedImageId)
        );
        initialIndex.current = rowIdx !== -1 ? rowIdx : -1;
      } else {
        const idx = images.findIndex((img) => img.id === globalViewState.lastViewedImageId);
        initialIndex.current = idx !== -1 ? Math.floor(idx / numColumns) : -1;
      }
    } else {
      initialIndex.current = -1;
    }
  }

  // renderCell is stable across re-renders as long as itemById/indexById/renderAsset
  // haven't changed — lets JustifiedRowView's memo actually bail out.
  const justifiedRenderCell = useCallback(
    (itemId: number | string, cellWidth: number, cellHeight: number) => {
      const image = itemById.get(itemId as number);
      if (!image) return null;
      return (
        <MeasuredAssetCell
          imageId={image.id}
          onMeasured={onItemMeasured}
          scrollOffsetRef={scrollOffsetRef}
          style={[
            { width: cellWidth, height: cellHeight, overflow: 'hidden' },
            image.id === globalViewState.lastViewedImageId ? styles.lastViewedHighlight : null,
          ]}
        >
          {renderAsset(image, indexById.get(itemId as number) ?? 0, true)}
        </MeasuredAssetCell>
      );
    },
    [itemById, indexById, renderAsset, onItemMeasured, scrollOffsetRef],
  );

  // ── Justified rendering path ───────────────────────────────────────────────
  if (isJustified) {
    return (
      <Animated.FlatList<JustifiedRow>
        {...panHandlers}
        ListEmptyComponent={emptyComponent ? <View>{emptyComponent}</View> : null}
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator color={colors.primary.active} style={styles.loader} />
          ) : null
        }
        ListHeaderComponent={
          headerComponent ? (
            <View style={{ zIndex: 1000, elevation: 100 }}>{headerComponent}</View>
          ) : null
        }
        contentContainerStyle={[
          styles.justifiedContent,
          justifiedRows.length === 0 && styles.emptyContent,
          contentContainerStyle,
        ]}
        data={justifiedRows}
        // One item = one row → O(1) getItemLayout via pre-computed offsets.
        getItemLayout={(_data, index) => {
          const row = justifiedRows[index];
          if (!row) return { length: 0, offset: 0, index };
          return {
            length: row.height + JUSTIFIED_GAP,
            offset: row.top,
            index,
          };
        }}
        initialNumToRender={8}
        initialScrollIndex={
          initialIndex.current !== -1 ? initialIndex.current : undefined
        }
        key="justified"
        keyExtractor={(_row, index) => `jr-${index}`}
        maxToRenderPerBatch={8}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        onScroll={onScroll}
        onScrollToIndexFailed={(info) => {
          if (justifiedRows.length > 0) {
            setTimeout(() => {
              listRef?.current?.scrollToIndex({ index: info.index, animated: false });
            }, 100);
          }
        }}
        ref={listRef}
        removeClippedSubviews
        renderItem={({ item: row }) => (
          <View style={styles.justifiedRowWrap}>
            <JustifiedRowView
              gap={JUSTIFIED_GAP}
              row={row}
              renderCell={justifiedRenderCell}
            />
          </View>
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        updateCellsBatchingPeriod={40}
        windowSize={7}
      />
    );
  }


  // ── Grid / Detail rendering path (unchanged) ───────────────────────────────
  return (
    <Animated.FlatList
      {...panHandlers}
      ListEmptyComponent={emptyComponent ? <View>{emptyComponent}</View> : null}
      ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary.active} style={styles.loader} /> : null}
      ListHeaderComponent={headerComponent ? <View style={{ zIndex: 1000, elevation: 100 }}>{headerComponent}</View> : null}
      columnWrapperStyle={isGrid ? styles.gridRow : undefined}
      contentContainerStyle={[styles.content, images.length === 0 && styles.emptyContent, contentContainerStyle]}
      data={images}
      initialNumToRender={12}
      key={viewMode}

      initialScrollIndex={initialIndex.current !== -1 ? initialIndex.current : undefined}
      getItemLayout={(data, index) => {
        const windowWidth = Dimensions.get('window').width;
        const contentWidth = windowWidth - 40; // spacing[5] * 2 padding in ScreenScaffold
        const itemHeight = isGrid ? (contentWidth * 0.318) : 86;
        const gap = 12; // rhythm.listCardGap
        const rowHeight = itemHeight + gap;
        return {
          length: rowHeight,
          offset: rowHeight * index,
          index,
        };
      }}

      onScrollToIndexFailed={(info) => {
        if (images.length > 0) {
          setTimeout(() => {
            listRef?.current?.scrollToIndex({ index: info.index, animated: false });
          }, 100);
        }
      }}
      keyExtractor={(item) => String(item.id)}
      maxToRenderPerBatch={12}
      numColumns={isGrid ? 3 : 1}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      onScroll={onScroll}
      ref={listRef}
      removeClippedSubviews
      renderItem={({ item, index }) => (
        <MeasuredAssetCell
          imageId={item.id}
          onMeasured={onItemMeasured}
          scrollOffsetRef={scrollOffsetRef}
          style={[isGrid ? styles.gridCell : styles.detailCell, item.id === globalViewState.lastViewedImageId ? styles.lastViewedHighlight : null]}
        >
          {renderAsset(item, index, isGrid)}
        </MeasuredAssetCell>
      )}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={styles.list}
      updateCellsBatchingPeriod={40}
      windowSize={7}
    />
  );
});

function MeasuredAssetCell({
  children,
  imageId,
  onMeasured,
  scrollOffsetRef,
  style,
}: {
  children: ReactNode;
  imageId: number;
  onMeasured?: (imageId: number, layout: MeasuredLayout | null) => void;
  scrollOffsetRef: { current: number };
  style: object;
}) {
  const cellRef = useRef<View | null>(null);

  useEffect(() => () => onMeasured?.(imageId, null), [imageId, onMeasured]);

  return (
    <View
      collapsable={false}
      onLayout={() => {
        cellRef.current?.measureInWindow((x, y, width, height) => {
          onMeasured?.(imageId, { height, width, x, y: y + scrollOffsetRef.current });
        });
      }}
      ref={cellRef}
      style={style}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: rhythm.listCardGap,
    paddingBottom: spacing[6],
  },
  // Justified mode: no horizontal padding (full-bleed), minimal vertical gap.
  justifiedContent: {
    paddingBottom: spacing[6],
  },
  // Each justified row cancels the AppScreen horizontal padding so images
  // bleed to the screen edges. Row spacing is fully owned by the algorithm's
  // `top` offsets + getItemLayout `length` — no extra margin needed here.
  justifiedRowWrap: {
    
  },
  justifiedCellInner: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  detailCell: {
    width: '100%',
  },
  emptyContent: {
    flexGrow: 1,
  },
  gridCell: {
    width: (Dimensions.get('window').width - 8) / 3,
  },
  gridRow: {
    justifyContent: 'flex-start', gap: 4,
  },
  loader: {
    paddingVertical: spacing[4],
  },

  lastViewedHighlight: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary.active,
    shadowColor: colors.primary.active,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'visible',
    transform: [{ scale: 1.02 }],
  },
  list: {
    flex: 1,
  },
});

