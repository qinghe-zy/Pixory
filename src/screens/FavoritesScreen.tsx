import { StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, type ImageListItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';

interface FavoritesScreenProps {
  refreshToken: number;
  onBack: () => void;
  onOpenImage: (imageId: number) => void;
}

export function FavoritesScreen({ refreshToken, onBack, onOpenImage }: FavoritesScreenProps) {
  const { data: images = [], isLoading, errorMessage, reload } = useScreenLoad<ImageListItem[]>(
    () => imageRepository.findFavorites(),
    [refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取收藏图片失败：${message}`;
      },
      initialData: [],
    }
  );

  return (
    <ScreenScaffold decorativeTitle="Favorites" onBack={onBack} scrollable title="收藏">
      <View style={styles.summary}>
        <Text numberOfLines={1} style={styles.subtitle}>
          已收藏
        </Text>
        <Text numberOfLines={1} style={styles.countText}>
          {images.length} 张
        </Text>
      </View>

      <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="给图片加星标后，这里会展示当前所有收藏图片。"
        emptyIconName="star-outline"
        emptyTitle="还没有收藏图片"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地收藏索引读取完成后，这里会展示收藏图片。"
        loadingTitle="正在读取收藏图片"
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
