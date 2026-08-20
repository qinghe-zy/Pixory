import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
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
          style={isGrid ? styles.gridCell : styles.detailCell}
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
  list: {
    flex: 1,
  },
});
