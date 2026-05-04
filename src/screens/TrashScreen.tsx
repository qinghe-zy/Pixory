import { Ionicons } from '@expo/vector-icons';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
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
      '清空后会永久删除回收站中的原图、缩略图和数据库记录，这个操作不可撤销。',
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

                Alert.alert('回收站已清空', `已永久删除 ${result.clearedCount} 张图片的原图、缩略图和数据库记录。`);
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
    <ScreenScaffold decorativeTitle="Trash" onBack={onBack} rightAction={rightAction} scrollable title="回收站">
      <View style={styles.notice}>
        <Ionicons color={colors.primary.active} name="shield-checkmark-outline" size={16} />
        <Text numberOfLines={3} style={styles.subtitle}>
          图片进入回收站后，原图和缩略图仍保留在本地；只有确认清空回收站，才会永久删除文件和数据库记录。
        </Text>
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
            <View key={image.id} style={styles.itemCard}>
              <View style={styles.previewWrap}>
                {image.thumbnailFileUri ? (
                  <Image resizeMode="cover" source={{ uri: image.thumbnailFileUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewFallback}>
                    <Ionicons color={colors.text.secondary} name="image-outline" size={22} />
                  </View>
                )}
                <View style={styles.remainingBadge}>
                  <Text style={styles.remainingText}>{getTrashStatusLabel(image.deletedAt)}</Text>
                </View>
              </View>
              <View style={styles.itemBody}>
                <Text numberOfLines={2} style={styles.itemTitle}>
                  {image.originalFilename}
                </Text>
                <Text style={styles.itemMeta}>
                  {image.deletedAt ? formatDateTime(image.deletedAt) : '未知时间'}
                </Text>
                <Pressable onPress={() => handleRestore(image.id)} style={({ pressed }) => [styles.restoreChip, pressed && styles.pressed]}>
                  <Text style={styles.restoreText}>恢复</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

function getTrashStatusLabel(deletedAt: string | null) {
  if (!deletedAt) {
    return '文件保留';
  }

  const deletedTime = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedTime)) {
    return '文件保留';
  }

  return '待清空';
}

const styles = StyleSheet.create({
  notice: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  subtitle: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    flex: 1,
    minWidth: 0,
  },
  list: {
    gap: spacing[2],
  },
  itemCard: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[2],
  },
  previewWrap: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    aspectRatio: 1,
    overflow: 'hidden',
    width: 72,
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
  remainingBadge: {
    backgroundColor: colors.overlay.softSurface,
    borderRadius: radius.sm,
    bottom: spacing[1],
    left: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    position: 'absolute',
    right: spacing[1],
  },
  remainingText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '600',
    textAlign: 'center',
  },
  itemBody: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  itemTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.body,
  },
  itemMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: {
    opacity: 0.82,
  },
  restoreChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    marginTop: spacing[1],
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing[1],
  },
  restoreText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '600',
  },
});
