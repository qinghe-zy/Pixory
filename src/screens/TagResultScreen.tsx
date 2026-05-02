import { StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, tagRepository, type ImageListItem, type TagRecord } from '../database';
import { spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';

interface TagResultScreenProps {
  tagId: number;
  refreshToken: number;
  onBack: () => void;
  onOpenImage: (imageId: number) => void;
}

export function TagResultScreen({ tagId, refreshToken, onBack, onOpenImage }: TagResultScreenProps) {
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    tag: TagRecord | null;
    images: ImageListItem[];
  }>(
    async () => {
      const [tag, images] = await Promise.all([
        tagRepository.findById(tagId),
        imageRepository.findByTagId(tagId),
      ]);

      if (!tag) {
        throw new Error('没有找到这个标签。');
      }

      return { tag, images };
    },
    [tagId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取标签结果失败：${message}`;
      },
      initialData: { tag: null, images: [] },
    }
  );

  const tag = data?.tag ?? null;
  const images = data?.images ?? [];

  return (
    <ScreenScaffold onBack={onBack} scrollable title={tag ? `#${tag.name}` : '标签结果'}>
      {tag ? (
        <View style={styles.summary}>
          <Text style={styles.subtitle}>默认已排除回收站中的图片</Text>
          <Text style={styles.countText}>{images.length} 张图片</Text>
        </View>
      ) : null}

      <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="这个标签当前没有关联中的图片，可能都已移入回收站或还没被使用。"
        emptyIconName="search-outline"
        emptyTitle="暂无标签结果"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地标签结果读取完成后，这里会展示关联图片。"
        loadingTitle="正在读取标签结果"
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
