import { Alert, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, type ImageListItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

interface RecentViewedScreenProps {
  refreshToken: number;
  onBack: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onStartBatchManagement: (ipId: number, imageId: number) => void;
}

export function RecentViewedScreen({
  refreshToken,
  onBack,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: RecentViewedScreenProps) {
  const { data: images = [], isLoading, errorMessage, reload } = useScreenLoad<ImageListItem[]>(
    () => imageRepository.findRecentViewed(),
    [refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取最近查看失败：${message}`;
      },
      initialData: [],
    }
  );

  function handleOpenImage(imageId: number) {
    onOpenImage(imageId, { type: 'recent-viewed' });
  }

  function handleImageLongPress(image: ImageListItem) {
    Alert.alert('图片操作', '选择对这张图片的操作。', [
      { text: '查看详情', onPress: () => onOpenImageDetail(image.id) },
      { text: '批量管理', onPress: () => onStartBatchManagement(image.ipId, image.id) },
      { text: '取消', style: 'cancel' },
    ]);
  }

  return (
    <ScreenScaffold decorativeTitle="Recent" onBack={onBack} scrollable title="最近查看">
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
