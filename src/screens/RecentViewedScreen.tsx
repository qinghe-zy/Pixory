import { StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, type ImageListItem } from '../database';
import { spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';

interface RecentViewedScreenProps {
  refreshToken: number;
  onBack: () => void;
  onOpenImage: (imageId: number) => void;
}

export function RecentViewedScreen({ refreshToken, onBack, onOpenImage }: RecentViewedScreenProps) {
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

  return (
    <ScreenScaffold onBack={onBack} scrollable title="最近查看">
      <View style={styles.summary}>
        <Text style={styles.subtitle}>按最近打开时间倒序展示，默认排除回收站中的图片</Text>
        <Text style={styles.countText}>{images.length} 张图片</Text>
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
            <ThumbnailTile image={image} key={image.id} onPress={onOpenImage} />
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing[1],
    marginTop: -spacing[4],
  },
  subtitle: {
    ...typography.textStyles.caption,
  },
  countText: {
    ...typography.textStyles.sectionTitle,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
});
