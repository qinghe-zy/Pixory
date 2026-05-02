import { Ionicons } from '@expo/vector-icons';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { imageRepository, type ImageListItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { clearTrash } from '../services/trashService';
import { formatDateTime } from '../utils/formatters';

interface TrashScreenProps {
  refreshToken: number;
  onBack: () => void;
  onChanged: () => void;
}

export function TrashScreen({ refreshToken, onBack, onChanged }: TrashScreenProps) {
  const { data: images = [], isLoading, errorMessage, reload } = useScreenLoad<ImageListItem[]>(
    () => imageRepository.findDeleted(),
    [refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取回收站失败：${message}`;
      },
      initialData: [],
    }
  );

  function handleRestore(imageId: number) {
    void (async () => {
      try {
        const restoredCount = await imageRepository.restoreMany([imageId]);
        if (restoredCount === 0) {
          throw new Error('没有可恢复的图片。');
        }

        onChanged();
        reload();
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        Alert.alert('恢复失败', message);
      }
    })();
  }

  function handleClearTrash() {
    Alert.alert(
      '确认清空回收站',
      '清空后会物理删除回收站中的原图和缩略图文件，这个操作不可撤销。',
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '确认清空',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const result = await clearTrash();
                onChanged();
                reload();

                if (result.failures.length > 0) {
                  Alert.alert(
                    '回收站部分清空',
                    `已清空 ${result.clearedCount} 张，仍有 ${result.remainingCount} 张保留。首个失败项：${result.failures[0]?.originalFilename ?? '未知图片'}。`
                  );
                  return;
                }

                Alert.alert('回收站已清空', `已物理删除 ${result.clearedCount} 张图片的原图和缩略图。`);
              } catch (error) {
                const message = error instanceof Error ? error.message : '未知错误';
                Alert.alert('清空回收站失败', message);
              }
            })();
          },
        },
      ]
    );
  }

  const rightAction =
    images.length > 0 ? (
      <Pressable onPress={handleClearTrash} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
        <Ionicons color={colors.semantic.danger} name="trash-outline" size={18} />
      </Pressable>
    ) : undefined;

  return (
    <ScreenScaffold onBack={onBack} rightAction={rightAction} scrollable title="回收站">
      <View style={styles.summary}>
        <Text style={styles.subtitle}>软删除图片会保留在本地，恢复后会重新回到正常列表</Text>
        <Text style={styles.countText}>{images.length} 张图片</Text>
      </View>

      <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="当前没有处于软删除状态的图片。"
        emptyIconName="trash-outline"
        emptyTitle="回收站是空的"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地回收站索引读取完成后，这里会展示已软删除图片。"
        loadingTitle="正在读取回收站"
        onRetry={reload}
      >
        <View style={styles.list}>
          {images.map((image) => (
            <ContentCard key={image.id} style={styles.itemCard}>
              <View style={styles.previewWrap}>
                {image.thumbnailFileUri ? (
                  <Image resizeMode="cover" source={{ uri: image.thumbnailFileUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewFallback}>
                    <Ionicons color={colors.text.secondary} name="image-outline" size={22} />
                  </View>
                )}
              </View>
              <View style={styles.itemBody}>
                <Text numberOfLines={1} style={styles.itemTitle}>
                  {image.originalFilename}
                </Text>
                <Text style={styles.itemMeta}>{image.ipName}</Text>
                <Text style={styles.itemMeta}>
                  删除时间 {image.deletedAt ? formatDateTime(image.deletedAt) : '未知时间'}
                </Text>
                <PrimaryButton label="恢复图片" onPress={() => handleRestore(image.id)} variant="outline" />
              </View>
            </ContentCard>
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
  list: {
    gap: spacing[3],
  },
  itemCard: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
  },
  previewWrap: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    height: 88,
    overflow: 'hidden',
    width: 88,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
    gap: spacing[1],
    justifyContent: 'space-between',
  },
  itemTitle: {
    ...typography.textStyles.sectionTitle,
  },
  itemMeta: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: '#FFD6D6',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: {
    opacity: 0.82,
  },
});
