import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, ipRepository, runWithDatabaseSpace, type ImageListItem, type IpDetailRecord, type PixorySpace } from '../database';
import { colors, componentTokens, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';

interface IpCoverPickerScreenProps {
  ipId: number;
  space?: PixorySpace;
  onBack: () => void;
  onChanged: () => void;
}

export function IpCoverPickerScreen({ ipId, space = 'normal', onBack, onChanged }: IpCoverPickerScreenProps) {
  const { showToast } = useToast();
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ ip: IpDetailRecord | null; images: ImageListItem[] }>(
    () =>
      runWithDatabaseSpace(space, async (db) => {
        const [ip, images] = await Promise.all([
          ipRepository.findDetailById(db, ipId),
          imageRepository.findByIpId(db, ipId),
        ]);
        return { ip, images };
      }),
    [ipId, space],
    {
      initialData: { ip: null, images: [] },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取封面候选失败：${message}`;
      },
    }
  );

  const ip = data?.ip ?? null;
  const images = data?.images ?? [];

  function chooseCover(imageId: number) {
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => ipRepository.setCoverImage(db, ipId, imageId));
        showToast('已更新 IP 封面');
        onChanged();
        onBack();
      } catch (error) {
        showToast(error instanceof Error ? `设置封面失败：${error.message}` : '设置封面失败');
      }
    })();
  }

  function useDefaultCover() {
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => ipRepository.clearCoverImage(db, ipId));
        showToast('已恢复默认封面');
        onChanged();
        onBack();
      } catch (error) {
        showToast(error instanceof Error ? `恢复默认封面失败：${error.message}` : '恢复默认封面失败');
      }
    })();
  }

  return (
    <ScreenScaffold backgroundVariant="gallery" decorativeTitle="Cover" onBack={onBack} scrollable title="选择 IP 封面">
      <View style={styles.headerPanel}>
        <View style={styles.iconWrap}>
          <Ionicons color={colors.primary.active} name="image-outline" size={18} />
        </View>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.headerTitle}>{ip?.name ?? '当前 IP'}</Text>
          <Text style={styles.headerHint}>选择当前 IP 内的一张图片作为封面，原图不会被修改。</Text>
        </View>
      </View>
      <PrimaryButton label="使用系统默认封面" onPress={useDefaultCover} variant="outline" />

      <PageStateBlock
        emptyDescription="导入图片后，可以从这里选择一张作为 IP 封面。"
        emptyIconName="images-outline"
        emptyTitle="还没有可选图片"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="正在读取当前 IP 的图片。"
        loadingTitle="正在读取封面候选"
        onRetry={reload}
      >
        <View style={styles.grid}>
          {images.map((image) => (
            <ThumbnailTile
              aspectRatio={componentTokens.thumbnail.squareAspectRatio}
              image={image}
              key={image.id}
              onPress={chooseCover}
              selected={ip?.coverImageAssetId === image.id}
              space={space}
            />
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  headerPanel: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  headerTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  headerHint: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
    paddingTop: spacing[3],
  },
});
