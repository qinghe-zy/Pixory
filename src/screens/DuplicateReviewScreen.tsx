import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { imageRepository, type SuspectedDuplicateGroup } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { formatFileSize } from '../utils/formatters';

interface DuplicateReviewScreenProps {
  importBatchId: number;
  refreshToken: number;
  onBack: () => void;
}

export function DuplicateReviewScreen({ importBatchId, refreshToken, onBack }: DuplicateReviewScreenProps) {
  const { data, isLoading, errorMessage, reload } = useScreenLoad<SuspectedDuplicateGroup[]>(
    () => imageRepository.findSuspectedDuplicateGroupsByImportBatchId(importBatchId),
    [importBatchId, refreshToken],
    {
      initialData: [],
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取疑似重复失败：${message}`;
      },
    }
  );
  const groups = data ?? [];
  const duplicateCount = groups.reduce((total, group) => total + group.images.length, 0);

  return (
    <ScreenScaffold decorativeTitle="Duplicate" onBack={onBack} scrollable title="疑似重复">
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons color={colors.primary.active} name="copy-outline" size={20} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>本批疑似重复 {duplicateCount} 张</Text>
          <Text style={styles.heroMeta}>依据：同尺寸 + 同文件大小。这里只提示，不自动删除或合并。</Text>
        </View>
      </View>

      <PageStateBlock
        emptyDescription="当前导入批次内没有发现同尺寸且同文件大小的图片。"
        emptyIconName="checkmark-circle-outline"
        emptyTitle="没有疑似重复"
        errorMessage={errorMessage}
        isEmpty={!isLoading && groups.length === 0}
        loading={isLoading}
        loadingDescription="正在按本批次内的尺寸和文件大小做本地检查。"
        loadingTitle="读取疑似重复"
        onRetry={reload}
      >
        <View style={styles.groupList}>
          {groups.map((group) => (
            <View key={group.key} style={styles.groupCard}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{group.images.length} 张疑似重复</Text>
                <Text style={styles.groupMeta}>{group.width} x {group.height} · {formatFileSize(group.fileSize)}</Text>
              </View>
              <View style={styles.imageList}>
                {group.images.map((image) => (
                  <View key={image.id} style={styles.imageRow}>
                    <View style={styles.thumb}>
                      {image.thumbnailFileUri ? (
                        <Image resizeMode="cover" source={{ uri: image.thumbnailFileUri }} style={styles.thumbImage} />
                      ) : (
                        <Ionicons color={colors.text.tertiary} name="image-outline" size={16} />
                      )}
                    </View>
                    <View style={styles.imageCopy}>
                      <Text numberOfLines={1} style={styles.filename}>{image.originalFilename}</Text>
                      <Text numberOfLines={1} style={styles.imageMeta}>{image.mimeType} · {formatFileSize(image.fileSize)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroCopy: {
    flex: 1,
    gap: spacing[1],
  },
  heroTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  heroMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  groupList: {
    gap: spacing[3],
  },
  groupCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    padding: spacing[3],
  },
  groupHeader: {
    gap: spacing[1],
  },
  groupTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  groupMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  imageList: {
    gap: spacing[2],
  },
  imageRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  thumb: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: colors.background.empty,
    borderRadius: radius.sm,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 46,
  },
  thumbImage: {
    height: '100%',
    width: '100%',
  },
  imageCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  filename: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '600',
  },
  imageMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
});
