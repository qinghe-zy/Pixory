import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, runWithDatabaseSpace, type ImageListItem, type PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

interface RecentViewedScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onStartBatchManagement: (ipId: number, imageId: number) => void;
}

export function RecentViewedScreen({
  space = 'normal',
  refreshToken,
  onBack,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: RecentViewedScreenProps) {
  const { data: images = [], isLoading, errorMessage, reload } = useScreenLoad<ImageListItem[]>(
    () => runWithDatabaseSpace(space, (db) => imageRepository.findRecentViewed(db, 60, { mediaType: 'all' })),
    [refreshToken, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取最近查看失败：${message}`;
      },
      initialData: [],
    }
  );
  const selectableImages = useMemo(() => images.filter((image) => image.mediaType !== 'video'), [images]);
  const multiSelect = useImageMultiSelect(useMemo(() => selectableImages.map((image) => image.id), [selectableImages]));
  const selectedImages = useMemo(
    () => selectableImages.filter((image) => multiSelect.selectedImageIds.includes(image.id)),
    [selectableImages, multiSelect.selectedImageIds]
  );

  function handleOpenImage(imageId: number) {
    const asset = images.find((item) => item.id === imageId);
    if (asset?.mediaType === 'video') {
      onOpenImageDetail(imageId);
      return;
    }
    if (multiSelect.isSelectionMode) {
      multiSelect.toggleSelection(imageId);
      return;
    }

    onOpenImage(imageId, { type: 'recent-viewed', space });
  }

  function handleImageLongPress(image: ImageListItem) {
    if (image.mediaType === 'video') {
      onOpenImageDetail(image.id);
      return;
    }
    multiSelect.enterSelection(image.id);
  }

  const footer = multiSelect.isSelectionMode ? (
    <BatchImageOrganizePanel
      onChanged={reload}
      onClearSelection={multiSelect.clearSelection}
      onDeleted={reload}
      selectedImages={selectedImages}
      space={space}
      totalCount={selectableImages.length}
    />
  ) : undefined;

  return (
    <ScreenScaffold backgroundVariant="gallery" decorativeTitle="Recent" footer={footer} onBack={onBack} scrollable title="最近查看">
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
        <View style={styles.grid}>
          {images.map((image) => (
            <ThumbnailTile
              image={image}
              key={image.id}
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
});
