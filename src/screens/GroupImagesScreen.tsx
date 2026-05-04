import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { getGroupTypeLabel } from '../constants/groups';
import { groupRepository, imageRepository, ipRepository, type GroupRecord, type ImageListItem, type IpRecord } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

interface GroupImagesScreenProps {
  ipId: number;
  groupId: number;
  refreshToken: number;
  onBack: () => void;
  onImportImages: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onStartBatchManagement: (imageId: number) => void;
}

export function GroupImagesScreen({
  ipId,
  groupId,
  refreshToken,
  onBack,
  onImportImages,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: GroupImagesScreenProps) {
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ip: IpRecord | null;
    group: GroupRecord | null;
    images: ImageListItem[];
  }>(
    async () => {
      const [ip, group, images] = await Promise.all([
        ipRepository.findById(ipId),
        groupRepository.findById(groupId),
        imageRepository.findByGroupId(groupId),
      ]);

      return { ip, group, images };
    },
    [groupId, ipId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组图片失败：${message}`;
      },
      initialData: { group: null, images: [], ip: null },
    }
  );

  const ip = data?.ip ?? null;
  const group = data?.group ?? null;
  const images = data?.images ?? [];
  const multiSelect = useImageMultiSelect(useMemo(() => images.map((image) => image.id), [images]));
  const selectedImages = useMemo(
    () => images.filter((image) => multiSelect.selectedImageIds.includes(image.id)),
    [images, multiSelect.selectedImageIds]
  );

  function handleOpenImage(imageId: number) {
    if (multiSelect.isSelectionMode) {
      multiSelect.toggleSelection(imageId);
      return;
    }

    onOpenImage(imageId, { type: 'group', ipId, groupId });
  }

  function handleImageLongPress(imageId: number) {
    multiSelect.enterSelection(imageId);
  }

  const footer = multiSelect.isSelectionMode ? (
    <BatchImageOrganizePanel
      allImages={images}
      currentGroupId={groupId}
      onApplyRuleSelection={multiSelect.applyRuleSelection}
      onChanged={reload}
      onClearSelection={multiSelect.clearSelection}
      onDeleted={reload}
      selectedImages={selectedImages}
      totalCount={images.length}
    />
  ) : undefined;

  return (
    <ScreenScaffold decorativeTitle="Gallery" footer={footer} onBack={onBack} scrollable title="分组图片">
      {group ? (
        <View style={styles.summary}>
          <View style={styles.summaryCopy}>
            <Text numberOfLines={1} style={styles.subtitle}>
              {ip?.name ?? '所属 IP'} / {getGroupTypeLabel(group.type)}
            </Text>
            <Text adjustsFontSizeToFit minimumFontScale={0.86} numberOfLines={2} style={styles.groupName}>
              {group.name}
            </Text>
          </View>
          <Text style={styles.countPill}>{images.length} 张</Text>
        </View>
      ) : null}

      <PageStateBlock
        emptyActionLabel={commonButtonCopy.importImages}
        emptyDescription="导入图片后，可以在这里查看该分组下的素材"
        emptyIconName="images-outline"
        emptyTitle={commonEmptyStateCopy.noImagesTitle}
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地分组图片索引读取完成后，这里会展示当前分组下的素材。"
        loadingTitle="正在读取分组图片"
        onEmptyAction={onImportImages}
        onRetry={reload}
      >
        <View style={styles.grid}>
          {images.map((image) => (
            <ThumbnailTile
              image={image}
              key={image.id}
              onLongPress={handleImageLongPress}
              onPress={handleOpenImage}
              selected={multiSelect.selectedImageIds.includes(image.id)}
            />
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
    marginBottom: spacing[1],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  summaryCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  subtitle: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  groupName: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  countPill: {
    ...typography.textStyles.micro,
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    color: colors.primary.active,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[1],
  },
});
