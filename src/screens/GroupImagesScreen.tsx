import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '../components/AppScreen';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { getGroupTypeLabel } from '../constants/groups';
import { groupRepository, imageRepository, ipRepository, type GroupRecord, type ImageListItem, type IpRecord } from '../database';
import { spacing, typography } from '../design/tokens';

interface GroupImagesScreenProps {
  ipId: number;
  groupId: number;
  refreshToken: number;
  onBack: () => void;
  onImportImages: () => void;
  onOpenImage: (imageId: number) => void;
}

export function GroupImagesScreen({
  ipId,
  groupId,
  refreshToken,
  onBack,
  onImportImages,
  onOpenImage,
}: GroupImagesScreenProps) {
  const [ip, setIp] = useState<IpRecord | null>(null);
  const [group, setGroup] = useState<GroupRecord | null>(null);
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [ipRecord, groupRecord, groupImages] = await Promise.all([
          ipRepository.findById(ipId),
          groupRepository.findById(groupId),
          imageRepository.findByGroupId(groupId),
        ]);

        if (!isMounted) {
          return;
        }

        setIp(ipRecord);
        setGroup(groupRecord);
        setImages(groupImages);
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取分组图片失败：${message}`);
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
  }, [groupId, ipId, refreshToken]);

  return (
    <AppScreen scrollable>
      <Header onBack={onBack} title={group?.name ?? '分组图片'} />

      {group ? (
        <View style={styles.summary}>
          <Text style={styles.subtitle}>
            {ip?.name ?? '所属IP'} / {getGroupTypeLabel(group.type)}
          </Text>
          <Text style={styles.countText}>{images.length} 张图片</Text>
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {!isLoading && images.length === 0 ? (
        <EmptyState
          actionLabel="导入图片"
          description="导入图片后，可以在这里查看该分组下的素材"
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
