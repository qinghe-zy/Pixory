import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { FilterChip } from '../components/FilterChip';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { groupRepository, imageRepository, ipRepository, tagRepository, type GroupRecord, type ImageListItem, type IpRecord, type TagUsageItem } from '../database';
import { colors, componentTokens, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
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
  const hasAdvancedFilters = groups.length > 0 || tags.length > 0;
  const shouldShowAdvancedFilters = showAdvancedFilters || activeFilter.type === 'group' || activeFilter.type === 'tag';
  const activeFilterLabel = useMemo(() => {
    if (activeFilter.type === 'favorite') {
      return '已收藏';
    }

    if (activeFilter.type === 'ungrouped') {
      return '未分组';
    }

    if (activeFilter.type === 'group') {
      return groups.find((group) => group.id === activeFilter.groupId)?.name ?? '按分组';
    }

    if (activeFilter.type === 'tag') {
      return `#${tags.find((tag) => tag.id === activeFilter.tagId)?.name ?? '标签'}`;
    }

    return '全部';
  }, [activeFilter, groups, tags]);

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
    onOpenImage(imageId, { type: 'ip-all', ipId, filter: activeFilter });
  }

  function handleImageLongPress(imageId: number) {
    Alert.alert('图片操作', '选择对这张图片的操作。', [
      { text: '查看详情', onPress: () => onOpenImageDetail(imageId) },
      { text: '批量管理', onPress: () => onStartBatchManagement(imageId) },
      { text: '取消', style: 'cancel' },
    ]);
  }

  return (
    <ScreenScaffold decorativeTitle="Gallery" onBack={onBack} rightAction={rightAction} scrollable title="图片库">
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

      <View style={styles.filterPanel}>
        <View style={styles.filterPanelHeader}>
          <View style={styles.filterTitleWrap}>
            <Ionicons color={colors.text.secondary} name="options-outline" size={16} />
            <Text style={styles.filterSectionLabel}>筛选</Text>
          </View>
          {hasAdvancedFilters ? (
            <Pressable
              accessibilityLabel={shouldShowAdvancedFilters ? '收起细分筛选' : '展开细分筛选'}
              accessibilityRole="button"
              onPress={() => setShowAdvancedFilters((current) => !current)}
              style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}
            >
              <Text style={styles.filterStatus}>{shouldShowAdvancedFilters ? '收起' : '细分'}</Text>
              <Ionicons
                color={colors.text.tertiary}
                name={shouldShowAdvancedFilters ? 'chevron-up' : 'chevron-down'}
                size={14}
              />
            </Pressable>
          ) : (
            <Text style={styles.filterStatus}>{activeFilterLabel}</Text>
          )}
        </View>
        <View style={styles.filterRow}>
          <FilterChip active={activeFilter.type === 'all'} dense label="全部" onPress={() => setActiveFilter({ type: 'all' })} />
          <FilterChip
            active={activeFilter.type === 'favorite'}
            dense
            label="已收藏"
            onPress={() => setActiveFilter({ type: 'favorite' })}
          />
          <FilterChip
            active={activeFilter.type === 'ungrouped'}
            dense
            label="未分组"
            onPress={() => setActiveFilter({ type: 'ungrouped' })}
          />
        </View>

        {shouldShowAdvancedFilters && groups.length > 0 ? (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>按分组</Text>
            <View style={styles.filterOptions}>
              {groups.map((group) => (
                <FilterChip
                  active={activeFilter.type === 'group' && activeFilter.groupId === group.id}
                  dense
                  key={group.id}
                  label={group.name}
                  onPress={() => setActiveFilter({ type: 'group', groupId: group.id })}
                />
              ))}
            </View>
          </View>
        ) : null}

        {shouldShowAdvancedFilters && tags.length > 0 ? (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>按标签</Text>
            <View style={styles.filterOptions}>
              {tags.map((tag) => (
                <FilterChip
                  active={activeFilter.type === 'tag' && activeFilter.tagId === tag.id}
                  dense
                  key={tag.id}
                  label={`#${tag.name}`}
                  onPress={() => setActiveFilter({ type: 'tag', tagId: tag.id })}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>

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
            />
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
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
  filterPanel: {
    backgroundColor: colors.background.soft,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
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
