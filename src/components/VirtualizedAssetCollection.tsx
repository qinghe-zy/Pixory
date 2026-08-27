import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  StyleSheet,
  View,
  type GestureResponderHandlers,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { ImageListItem } from '../database';
import type { AssetListViewMode } from '../database/repositories/settingsRepository';
import { colors, rhythm, spacing } from '../design/tokens';
import { globalViewState } from '../services/globalViewState';

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
  listRef?: RefObject<FlatList<ImageListItem> | null>;
  onEndReached?: () => void;
  onItemMeasured?: (imageId: number, layout: MeasuredLayout | null) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  panHandlers?: GestureResponderHandlers;
  renderAsset: (image: ImageListItem, index: number, fillCell: boolean) => ReactNode;
  viewMode: AssetListViewMode;
}

export function VirtualizedAssetCollection({
  emptyComponent,
  headerComponent,
  images,
  isLoadingMore = false,
  listRef,
  onEndReached,
  onItemMeasured,
  onScroll,
  panHandlers,
  renderAsset,
  viewMode,
}: VirtualizedAssetCollectionProps) {

  const scrollOffsetRef = useRef(0);
  const isGrid = viewMode === 'grid';
  const numColumns = isGrid ? 3 : 1;

  const initialIndex = useRef<number | undefined>(undefined);
  if (initialIndex.current === undefined) {
    if (globalViewState.lastViewedImageId !== -1) {
      const idx = images.findIndex(img => img.id === globalViewState.lastViewedImageId);
      if (idx !== -1) {
        initialIndex.current = Math.floor(idx / numColumns);
      } else {
        initialIndex.current = -1;
      }
    } else {
      initialIndex.current = -1;
    }
  }


  return (
    <FlatList
      {...panHandlers}
      ListEmptyComponent={emptyComponent ? <View>{emptyComponent}</View> : null}
      ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary.active} style={styles.loader} /> : null}
      ListHeaderComponent={headerComponent ? <View>{headerComponent}</View> : null}
      columnWrapperStyle={isGrid ? styles.gridRow : undefined}
      contentContainerStyle={[styles.content, images.length === 0 && styles.emptyContent]}
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
          offset: rowHeight * (isGrid ? Math.floor(index / 3) : index),
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
      onScroll={(event) => {
        scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        onScroll?.(event);
      }}
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
      style={styles.list}
      updateCellsBatchingPeriod={40}
      windowSize={7}
    />
  );
}

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
  detailCell: {
    width: '100%',
  },
  emptyContent: {
    flexGrow: 1,
  },
  gridCell: {
    width: '31.8%',
  },
  gridRow: {
    justifyContent: 'space-between',
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
