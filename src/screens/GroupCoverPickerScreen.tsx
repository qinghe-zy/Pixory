import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useToast } from '../components/AppToast';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, type GroupRecord, type ImageListItem, type IpRecord, type PixorySpace } from '../database';
import { colors, componentTokens, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';

interface GroupCoverPickerScreenProps {
  ipId: number;
  groupId: number;
  space?: PixorySpace;
  onBack: () => void;
  onChanged: () => void;
}

export function GroupCoverPickerScreen({ ipId, groupId, space = 'normal', onBack, onChanged }: GroupCoverPickerScreenProps) {
  const { showToast } = useToast();
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ ip: IpRecord | null; group: GroupRecord | null; images: ImageListItem[] }>(
    () =>
      runWithDatabaseSpace(space, async (db) => {
        const [ip, group, images] = await Promise.all([
          ipRepository.findById(db, ipId),
          groupRepository.findById(db, groupId),
          imageRepository.findByGroupId(db, groupId, { mediaType: 'image' }),
        ]);
        return { group, images, ip };
      }),
    [groupId, ipId, space],
    {
      initialData: { group: null, images: [], ip: null },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组封面候选失败：${message}`;
      },
    }
  );

  const ip = data?.ip ?? null;
  const group = data?.group ?? null;
  const images = data?.images ?? [];

  function chooseCover(imageId: number) {
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => groupRepository.setCoverImage(db, groupId, imageId));
        showToast('已更新分组封面');
        onChanged();
        onBack();
      } catch (error) {
        showToast(error instanceof Error ? `设置分组封面失败：${error.message}` : '设置分组封面失败');
      }
    })();
  }

  function useDefaultCover() {
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => groupRepository.clearCoverImage(db, groupId));
        showToast('已恢复默认分组封面');
        onChanged();
        onBack();
      } catch (error) {
        showToast(error instanceof Error ? `恢复默认封面失败：${error.message}` : '恢复默认封面失败');
      }
    })();
  }

  return (
    <ScreenScaffold backgroundVariant="gallery" decorativeTitle="Cover" onBack={onBack} scrollable title="选择分组封面">
      <View style={styles.headerPanel}>
        <View style={styles.iconWrap}>
          <Ionicons color={colors.primary.active} name="folder-open-outline" size={18} />
        </View>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.headerTitle}>{group?.name ?? '当前分组'}</Text>
          <Text style={styles.headerHint}>{ip?.name ? `${ip.name} · ` : ''}选择当前分组内的一张图片作为封面，原图不会被修改。</Text>
        </View>
      </View>
      <PrimaryButton label="使用系统默认封面" onPress={useDefaultCover} variant="outline" />

      <PageStateBlock
        emptyDescription="把图片加入这个分组后，可以从这里选择一张作为手动封面。"
        emptyIconName="images-outline"
        emptyTitle="还没有可选图片"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="正在读取当前分组内的图片。"
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
              selected={group?.coverImageAssetId === image.id}
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
