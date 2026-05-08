import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type ScrollView } from 'react-native';

import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SortMenuButton, IMAGE_SORT_OPTIONS } from '../components/SortMenuButton';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, runWithDatabaseSpace, type ImageListItem, type ImageSortOrder, type PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import { useSwipeGridSelection } from '../hooks/useSwipeGridSelection';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

interface RecentViewedScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onStartBatchManagement: (ipId: number, imageId: number) => void;
}

const SORT_OPTIONS = IMAGE_SORT_OPTIONS;

export function RecentViewedScreen({
  space = 'normal',
  refreshToken,
  onBack,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: RecentViewedScreenProps) {
  const [sortOrder, setSortOrder] = useState<ImageSortOrder>('lastViewedAtDesc');
  const scrollViewRef = useRef<ScrollView | null>(null);
  const { data: images = [], isLoading, errorMessage, reload } = useScreenLoad<ImageListItem[]>(
    () => runWithDatabaseSpace(space, (db) => imageRepository.findRecentViewed(db, 60, { mediaType: 'all', orderBy: sortOrder })),
    [refreshToken, sortOrder, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取最近查看失败：${message}`;
      },
      initialData: [],
    }
  );
  const selectableAssets = images;
  const multiSelect = useImageMultiSelect(useMemo(() => selectableAssets.map((image) => image.id), [selectableAssets]));
  const swipeSelection = useSwipeGridSelection({
    items: images.map((image) => ({ id: image.id, mediaType: image.mediaType })),
    selectedIds: multiSelect.selectedImageIds,
    setSelectedIds: multiSelect.setSelectedImageIds,
    scrollViewRef,
    selectableMediaTypes: ['image', 'video'],
  });
  const selectedAssets = useMemo(
    () => selectableAssets.filter((image) => multiSelect.selectedImageIds.includes(image.id)),
    [selectableAssets, multiSelect.selectedImageIds]
  );

  function handleOpenImage(imageId: number) {
    const asset = images.find((item) => item.id === imageId);
    if (multiSelect.isSelectionMode) {
      multiSelect.toggleSelection(imageId);
      return;
    }
    if (asset?.mediaType === 'video') {
      onOpenImageDetail(imageId);
      return;
    }

    onOpenImage(imageId, { type: 'recent-viewed', space });
  }

  function handleImageLongPress(image: ImageListItem) {
    swipeSelection.beginSwipeSelection(image.id);
  }

  const footer = multiSelect.isSelectionMode ? (
    <BatchImageOrganizePanel
      onChanged={reload}
      onClearSelection={multiSelect.clearSelection}
      onDeleted={reload}
      selectedImages={selectedAssets}
      space={space}
      totalCount={selectableAssets.length}
    />
  ) : undefined;

  return (
    <ScreenScaffold
      backgroundVariant="gallery"
      decorativeTitle="Recent"
      footer={footer}
      onBack={onBack}
      onScroll={swipeSelection.onScroll}
      scrollViewRef={scrollViewRef}
      scrollable
      title="最近查看"
    >
      <View style={styles.summary}>
        <Text numberOfLines={1} style={styles.subtitle}>
          最近打开
        </Text>
        <Text numberOfLines={1} style={styles.countText}>
          {images.length} 张
        </Text>
      </View>

      <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="打开过图片详情后，这里会展示最近查看过的图片。"
        emptyIconName="time-outline"
        emptyTitle="还没有最近查看"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地最近查看索引读取完成后，这里会展示最近查看过的图片。"
        loadingTitle="正在读取最近查看"
        onRetry={reload}
      >
        <View style={styles.gridHeader}>
          <Text style={styles.gridTitle}>素材</Text>
          <SortMenuButton onChange={setSortOrder} orderBy={sortOrder} />
        </View>
        <View {...swipeSelection.panHandlers} style={styles.grid}>
          {images.map((image) => (
            <ThumbnailTile
              image={image}
              key={image.id}
              onLayout={(event) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}
              onLongPress={() => handleImageLongPress(image)}
              onPress={handleOpenImage}
              selected={multiSelect.selectedImageIds.includes(image.id)}
              space={space}
            />
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    maxWidth: '100%',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  subtitle: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  countText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  gridHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  gridTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
});
