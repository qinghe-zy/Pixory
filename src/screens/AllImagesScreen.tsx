import { StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { imageRepository, ipRepository, type ImageListItem, type IpRecord } from '../database';
import { spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';

interface AllImagesScreenProps {
  ipId: number;
  refreshToken: number;
  onBack: () => void;
  onImportImages: () => void;
  onOpenImage: (imageId: number) => void;
}

export function AllImagesScreen({
  ipId,
  refreshToken,
  onBack,
  onImportImages,
  onOpenImage,
}: AllImagesScreenProps) {
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ ip: IpRecord | null; images: ImageListItem[] }>(
    async () => {
      const [ip, images] = await Promise.all([
        ipRepository.findById(ipId),
        imageRepository.findByIpId(ipId),
      ]);

      return { ip, images };
    },
    [ipId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取图片库失败：${message}`;
      },
      initialData: { ip: null, images: [] },
    }
  );

  const ip = data?.ip ?? null;
  const images = data?.images ?? [];

  return (
    <ScreenScaffold onBack={onBack} scrollable title="图片库">
      <View style={styles.summary}>
        <Text style={styles.subtitle}>{ip?.name ?? '当前IP'}</Text>
        <Text style={styles.countText}>{images.length} 张图片</Text>
      </View>

      <PageStateBlock
        emptyActionLabel={commonButtonCopy.importImages}
        emptyDescription="上传第一张图片后，就可以在这里按分组和标签进行管理"
        emptyIconName="images-outline"
        emptyTitle={commonEmptyStateCopy.noImagesTitle}
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地图片索引加载完成后，这里会展示当前 IP 下的全部图片。"
        loadingTitle="正在读取图片库"
        onEmptyAction={onImportImages}
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
