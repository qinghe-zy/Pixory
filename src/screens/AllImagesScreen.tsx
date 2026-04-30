import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '../components/AppScreen';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, ipRepository, type ImageListItem, type IpRecord } from '../database';
import { spacing, typography } from '../design/tokens';

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
  const [ip, setIp] = useState<IpRecord | null>(null);
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [ipRecord, allImages] = await Promise.all([
          ipRepository.findById(ipId),
          imageRepository.findByIpId(ipId),
        ]);

        if (!isMounted) {
          return;
        }

        setIp(ipRecord);
        setImages(allImages);
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取图片库失败：${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [ipId, refreshToken]);

  return (
    <AppScreen scrollable>
      <Header onBack={onBack} title="图片库" />

      <View style={styles.summary}>
        <Text style={styles.subtitle}>{ip?.name ?? '当前IP'}</Text>
        <Text style={styles.countText}>{images.length} 张图片</Text>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {!isLoading && images.length === 0 ? (
        <EmptyState
          actionLabel="导入图片"
          description="上传第一张图片后，就可以在这里按分组和标签进行管理"
          iconName="images-outline"
          onAction={onImportImages}
          title="还没有图片"
        />
      ) : null}

      <View style={styles.grid}>
        {images.map((image) => (
          <ThumbnailTile image={image} key={image.id} onPress={onOpenImage} />
        ))}
      </View>
    </AppScreen>
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
  errorText: {
    ...typography.textStyles.caption,
    color: '#FF4D4F',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
});
