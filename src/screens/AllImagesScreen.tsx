import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppActionSheet, type AppActionSheetItem } from '../components/AppActionSheet';
import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { groupRepository, imageRepository, ipRepository, tagRepository, type GroupRecord, type ImageListItem, type IpRecord, type TagUsageItem } from '../database';
import { colors, componentTokens, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import type { ImageViewerContext, ImageViewerIpAllFilter } from '../navigation/imageViewerContext';

type AllImagesFilter = ImageViewerIpAllFilter;

interface AllImagesScreenProps {
  ipId: number;
  refreshToken: number;
  onBack: () => void;
  onImportImages: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onStartBatchManagement: (imageId: number) => void;
}

export function AllImagesScreen({
  ipId,
  refreshToken,
  onBack,
  onImportImages,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: AllImagesScreenProps) {
  const [activeFilter, setActiveFilter] = useState<AllImagesFilter>({ type: 'all' });
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState(false);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ip: IpRecord | null;
    images: ImageListItem[];
    groups: GroupRecord[];
    tags: TagUsageItem[];
  }>(
    async () => {
      const [ip, groups, tags] = await Promise.all([
        ipRepository.findById(ipId),
        groupRepository.findByIpId(ipId),
        tagRepository.findUsageOverviewByIpId(ipId),
      ]);

      const images =
        activeFilter.type === 'favorite'
          ? await imageRepository.findByIpId(ipId, { favoritesOnly: true })
          : activeFilter.type === 'ungrouped'
            ? await imageRepository.findByIpId(ipId, { ungroupedOnly: true })
            : activeFilter.type === 'untagged'
              ? await imageRepository.findByIpId(ipId, { untaggedOnly: true })
              : activeFilter.type === 'recent-viewed'
                ? await imageRepository.findByIpId(ipId, { recentlyViewedOnly: true, orderBy: 'lastViewedAtDesc' })
                : activeFilter.type === 'mime'
                  ? await imageRepository.findByIpId(ipId, { mimeType: activeFilter.mimeType })
                  : activeFilter.type === 'size'
                    ? await imageRepository.findByIpId(ipId, { minFileSize: activeFilter.minFileSize, maxFileSize: activeFilter.maxFileSize })
                    : activeFilter.type === 'group'
                      ? await imageRepository.findByGroupId(activeFilter.groupId)
                      : activeFilter.type === 'tag'
                        ? await imageRepository.findByIpId(ipId, { tagId: activeFilter.tagId })
                        : await imageRepository.findByIpId(ipId);

      return { ip, images, groups, tags };
    },
    [activeFilter, ipId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取图片库失败：${message}`;
      },
      initialData: { ip: null, images: [], groups: [], tags: [] },
    }
  );

  const ip = data?.ip ?? null;
  const images = data?.images ?? [];
  const groups = data?.groups ?? [];
  const tags = data?.tags ?? [];
  const activeFilterLabel = useMemo(() => {
    if (activeFilter.type === 'favorite') {
      return '已收藏';
    }

    if (activeFilter.type === 'ungrouped') {
      return '未分组';
    }

    if (activeFilter.type === 'untagged') {
      return '无标签';
    }

    if (activeFilter.type === 'recent-viewed') {
      return '最近查看';
    }

    if (activeFilter.type === 'mime') {
      return activeFilter.label;
    }

    if (activeFilter.type === 'size') {
      return activeFilter.label;
    }

    if (activeFilter.type === 'group') {
      return groups.find((group) => group.id === activeFilter.groupId)?.name ?? '按分组';
    }

    if (activeFilter.type === 'tag') {
      return `#${tags.find((tag) => tag.id === activeFilter.tagId)?.name ?? '标签'}`;
    }

    return '全部';
  }, [activeFilter, groups, tags]);
  const multiSelect = useImageMultiSelect(useMemo(() => images.map((image) => image.id), [images]));
  const selectedImages = useMemo(
    () => images.filter((image) => multiSelect.selectedImageIds.includes(image.id)),
    [images, multiSelect.selectedImageIds]
  );

  const rightAction = (
    <Pressable
      accessibilityLabel={commonButtonCopy.importImages}
      onPress={onImportImages}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
    >
      <Ionicons color={colors.text.title} name="add" size={22} />
    </Pressable>
  );

  function handleOpenImage(imageId: number) {
    if (multiSelect.isSelectionMode) {
      multiSelect.toggleSelection(imageId);
      return;
    }

    onOpenImage(imageId, { type: 'ip-all', ipId, filter: activeFilter });
  }

  function handleImageLongPress(imageId: number) {
    multiSelect.enterSelection(imageId);
  }

  const footer = multiSelect.isSelectionMode ? (
    <BatchImageOrganizePanel
      onChanged={reload}
      onClearSelection={multiSelect.clearSelection}
      onDeleted={reload}
      selectedImages={selectedImages}
      totalCount={images.length}
    />
  ) : undefined;
  const filterItems = useMemo<AppActionSheetItem[]>(() => {
    const baseItems: AppActionSheetItem[] = [
      { key: 'all', label: '全部图片', icon: 'images-outline', onPress: () => setActiveFilter({ type: 'all' }) },
      { key: 'favorite', label: '收藏', icon: 'star-outline', onPress: () => setActiveFilter({ type: 'favorite' }) },
      { key: 'ungrouped', label: '未分组', icon: 'folder-open-outline', onPress: () => setActiveFilter({ type: 'ungrouped' }) },
      { key: 'untagged', label: '无标签', icon: 'pricetags-outline', onPress: () => setActiveFilter({ type: 'untagged' }) },
      { key: 'recent-viewed', label: '最近查看', icon: 'time-outline', onPress: () => setActiveFilter({ type: 'recent-viewed' }) },
      { key: 'jpeg', label: 'JPEG', icon: 'document-outline', onPress: () => setActiveFilter({ type: 'mime', mimeType: 'image/jpeg', label: 'JPEG' }) },
      { key: 'png', label: 'PNG', icon: 'document-outline', onPress: () => setActiveFilter({ type: 'mime', mimeType: 'image/png', label: 'PNG' }) },
      { key: 'small-size', label: '小于 500 KB', icon: 'resize-outline', meta: '尺寸/大小', onPress: () => setActiveFilter({ type: 'size', label: '< 500 KB', maxFileSize: 500 * 1024 }) },
      { key: 'large-size', label: '大于 2 MB', icon: 'resize-outline', meta: '尺寸/大小', onPress: () => setActiveFilter({ type: 'size', label: '> 2 MB', minFileSize: 2 * 1024 * 1024 }) },
    ];

    return [
      ...baseItems,
      ...groups.map((group) => ({
        key: `group-${group.id}`,
        label: group.name,
        icon: 'folder-outline' as const,
        meta: '分组',
        onPress: () => setActiveFilter({ type: 'group', groupId: group.id }),
      })),
      ...tags.map((tag) => ({
        key: `tag-${tag.id}`,
        label: `#${tag.name}`,
        icon: 'pricetag-outline' as const,
        meta: '标签',
        onPress: () => setActiveFilter({ type: 'tag', tagId: tag.id }),
      })),
    ];
  }, [groups, tags]);

  return (
    <>
    <ScreenScaffold decorativeTitle="Gallery" footer={footer} onBack={onBack} rightAction={rightAction} scrollable title="图片库">
      <View style={styles.summaryPanel}>
        <View style={styles.summaryTopLine}>
          <Text numberOfLines={1} style={styles.subtitle}>{ip?.name ?? '当前 IP'}</Text>
          <View style={styles.countPill}>
            <Ionicons color={colors.primary.active} name="images-outline" size={14} />
            <Text style={styles.countPillText}>{images.length} 张</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.summaryTitle}>{activeFilterLabel}</Text>
        <View style={styles.summaryMetaRow}>
          <Text numberOfLines={1} style={styles.summaryMeta}>分组 {groups.length}</Text>
          <View style={styles.metaDot} />
          <Text numberOfLines={1} style={styles.summaryMeta}>标签 {tags.length}</Text>
        </View>
      </View>

      <Pressable onPress={() => setIsFilterSheetVisible(true)} style={({ pressed }) => [styles.filterSummary, pressed && styles.pressed]}>
        <View style={styles.filterTitleWrap}>
          <Ionicons color={colors.text.secondary} name="options-outline" size={16} />
          <Text style={styles.filterSectionLabel}>当前筛选：{activeFilterLabel}</Text>
        </View>
        <Text style={styles.filterStatus}>筛选</Text>
      </Pressable>

      <PageStateBlock
        emptyActionLabel={commonButtonCopy.importImages}
        emptyDescription={
          activeFilter.type === 'all'
            ? '上传第一张图片后，就可以在这里按分组和标签进行管理'
            : '这个筛选条件下暂时没有图片。'
        }
        emptyIconName="images-outline"
        emptyTitle={activeFilter.type === 'all' ? commonEmptyStateCopy.noImagesTitle : commonEmptyStateCopy.noSearchResultTitle}
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地图片索引加载完成后，这里会展示当前 IP 下的全部图片。"
        loadingTitle="正在读取图片库"
        onEmptyAction={onImportImages}
        onRetry={reload}
      >
        <View style={styles.galleryHeading}>
          <Text style={styles.galleryTitle}>图片</Text>
          <Text style={styles.galleryCount}>{activeFilterLabel} · {images.length}</Text>
        </View>
        <View style={styles.grid}>
          {images.map((image) => (
            <ThumbnailTile
              aspectRatio={componentTokens.thumbnail.squareAspectRatio}
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
    <AppActionSheet
      items={filterItems}
      message="选择一个筛选条件。分组和标签会基于当前 IP 的真实数据展示。"
      onClose={() => setIsFilterSheetVisible(false)}
      title="筛选图片"
      visible={isFilterSheetVisible}
    />
    </>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderColor: colors.border.default,
    borderRadius: componentTokens.iconButton.radius,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    width: componentTokens.iconButton.size,
  },
  pressed: {
    opacity: 0.78,
  },
  summaryPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  summaryTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  subtitle: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    ...typography.textStyles.sectionTitle,
    fontSize: 18,
    lineHeight: 24,
  },
  summaryMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  summaryMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  metaDot: {
    backgroundColor: colors.border.strong,
    borderRadius: radius.pill,
    height: 3,
    width: 3,
  },
  countPill: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 28,
    paddingHorizontal: spacing[2],
  },
  countPillText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '600',
  },
  filterSummary: {
    alignItems: 'center',
    backgroundColor: colors.background.soft,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[2],
    padding: spacing[3],
  },
  filterPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  filterTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
  },
  filterStatus: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
    flexShrink: 1,
    textAlign: 'right',
  },
  filterToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 28,
    paddingLeft: spacing[2],
  },
  filterGroup: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[2],
  },
  filterLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    lineHeight: 28,
    width: 44,
  },
  filterSectionLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing[1.5],
    rowGap: spacing[2],
  },
  filterOptions: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing[1.5],
    rowGap: spacing[2],
    minWidth: 0,
  },
  galleryHeading: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  galleryTitle: {
    ...typography.textStyles.sectionTitle,
  },
  galleryCount: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing[2],
    rowGap: spacing[2],
  },
});
