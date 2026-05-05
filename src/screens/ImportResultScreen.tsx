import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, runWithDatabaseSpace, type ImageListItem, type PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';

interface ImportResultScreenProps {
  imageIds: number[];
  space?: PixorySpace;
  onViewImport: () => void;
  onContinueOrganize: () => void;
  onImportAgain: () => void;
  onBack: () => void;
  onOpenImageDetail: (imageId: number) => void;
}

export function ImportResultScreen({
  imageIds,
  space = 'normal',
  onViewImport,
  onContinueOrganize,
  onImportAgain,
  onBack,
  onOpenImageDetail,
}: ImportResultScreenProps) {
  const { data: images = [], isLoading, errorMessage, reload } = useScreenLoad<ImageListItem[]>(
    () => runWithDatabaseSpace(space, (db) => imageRepository.findByIds(db, imageIds)),
    [imageIds.join(','), space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取导入结果失败：${message}`;
      },
      initialData: [],
    }
  );

  return (
    <ScreenScaffold decorativeTitle="Imported" onBack={onBack} scrollable title="导入完成">
      <View style={styles.safetyPanel}>
        <View style={styles.safetyIcon}>
          <Ionicons color={colors.semantic.success} name="shield-checkmark-outline" size={19} />
        </View>
        <View style={styles.safetyCopy}>
          <Text style={styles.safetyTitle}>原图已保存到 Pixory 本地私有存储</Text>
          <Text style={styles.safetyText}>缩略图是独立预览文件；不压缩、不裁剪、不重编码。</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="查看本次导入" onPress={onViewImport} />
        <View style={styles.secondaryActions}>
          <View style={styles.secondaryAction}>
            <PrimaryButton label="继续整理" onPress={onContinueOrganize} variant="ghost" />
          </View>
          <View style={styles.secondaryAction}>
            <PrimaryButton label="再导入一批" onPress={onImportAgain} variant="ghost" />
          </View>
        </View>
      </View>

      <PageStateBlock
        emptyDescription="导入结果里没有可展示图片，可能已被移动到回收站。"
        emptyIconName="images-outline"
        emptyTitle="暂无导入结果"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="正在读取刚导入的图片。"
        loadingTitle="读取导入结果"
        onRetry={reload}
      >
        <View style={styles.grid}>
          {images.map((image) => (
            <ThumbnailTile image={image} key={image.id} onPress={onOpenImageDetail} space={space} />
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  safetyPanel: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
  },
  safetyIcon: {
    alignItems: 'center',
    backgroundColor: colors.semantic.successBackground,
    borderRadius: radius.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  safetyCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  safetyTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  safetyText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  actions: {
    gap: spacing[2],
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  secondaryAction: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
});
