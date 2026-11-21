import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useToast } from '../components/AppToast';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { groupRepository, imageRepository, runWithDatabaseSpace, type GroupRecord, type ImageListItem, type PixorySpace } from '../database';
import { componentTokens, rhythm, spacing } from '../design/tokens';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ group: GroupRecord | null; images: ImageListItem[] }>(
    () =>
      runWithDatabaseSpace(space, async (db) => {
        const [group, images] = await Promise.all([
          groupRepository.findById(db, groupId),
          imageRepository.findByGroupId(db, groupId, { mediaType: 'all' }),
        ]);
        return { group, images };
      }),
    ['GroupCoverPickerScreen', groupId, ipId, space],
    {
      initialData: { group: null, images: [] },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组封面候选失败：${message}`;
      },
    }
  );

  const group = data?.group ?? null;
  const images = data?.images ?? [];

  function chooseCover(imageId: number) {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => groupRepository.setCoverImage(db, groupId, imageId));
        showToast('已更新分组封面');
        onChanged();
        onBack();
      } catch (error) {
        submittingRef.current = false;
        setIsSubmitting(false);
        showToast(error instanceof Error ? `设置分组封面失败：${error.message}` : '设置分组封面失败');
      }
    })();
  }

  function useDefaultCover() {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => groupRepository.clearCoverImage(db, groupId));
        showToast('已恢复默认分组封面');
        onChanged();
        onBack();
      } catch (error) {
        submittingRef.current = false;
        setIsSubmitting(false);
        showToast(error instanceof Error ? `恢复默认封面失败：${error.message}` : '恢复默认封面失败');
      }
    })();
  }

  return (
    <ScreenScaffold backgroundColor="#f9f9f9" decorativeTitle="Cover" onBack={onBack} scrollable title="选择分组封面">
      <PrimaryButton disabled={isSubmitting} label="使用系统默认封面" onPress={useDefaultCover} variant="outline" />

      <PageStateBlock
        emptyDescription="把图片或视频加入这个分组后，可以从这里选择一项作为手动封面。"
        emptyIconName="images-outline"
        emptyTitle="还没有可选素材"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="正在读取当前分组内的图片与视频。"
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
    paddingTop: spacing[3],
  },
});
