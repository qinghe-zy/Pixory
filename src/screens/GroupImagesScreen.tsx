import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { AssetDetailRow } from '../components/AssetDetailRow';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SortMenuButton, IMAGE_SORT_OPTIONS } from '../components/SortMenuButton';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { getGroupTypeLabel } from '../constants/groups';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageAspectRatioFilter, type ImageListItem, type IpRecord, type PixorySpace, type TagUsageItem } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import { useSwipeGridSelection } from '../hooks/useSwipeGridSelection';
import { useAssetListPreferences } from '../services/assetListPreferences';
import { filterSimilarImages } from '../utils/batchSelectionRules';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

interface GroupImagesScreenProps {
  ipId: number;
  groupId: number;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onImportImages: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onStartBatchManagement: (imageId: number) => void;
}

type GroupResultFileSizeFilter = { label: string; minFileSize?: number; maxFileSize?: number };

interface GroupResultFilterState {
  favorite: boolean;
  recentViewed: boolean;
  similarDuplicate: boolean;
  tagIds: number[];
  untagged: boolean;
  aspectRatio: ImageAspectRatioFilter | null;
  aspectLabel: string | null;
  size: GroupResultFileSizeFilter | null;
}

const EMPTY_GROUP_RESULT_FILTERS: GroupResultFilterState = {
  aspectLabel: null,
  aspectRatio: null,
  favorite: false,
  recentViewed: false,
  similarDuplicate: false,
  size: null,
  tagIds: [],
  untagged: false,
};

type GroupResultFilterDropdown = 'status' | 'tag' | 'size';
const SORT_OPTIONS = IMAGE_SORT_OPTIONS;

export function GroupImagesScreen({
  ipId,
  groupId,
  space = 'normal',
  refreshToken,
  onBack,
  onImportImages,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: GroupImagesScreenProps) {
  const [activeFilters, setActiveFilters] = useState<GroupResultFilterState>(EMPTY_GROUP_RESULT_FILTERS);
  const [activeFilterDropdown, setActiveFilterDropdown] = useState<GroupResultFilterDropdown | null>(null);
  const { viewMode, sortOrder, setViewMode, setSortOrder } = useAssetListPreferences(space, 'createdAtDesc');
  const scrollViewRef = useRef<ScrollView | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ip: IpRecord | null;
    group: GroupRecord | null;
    images: ImageListItem[];
    tags: TagUsageItem[];
  }>(
    async () => {
      return runWithDatabaseSpace(space, async (db) => {
      const [ip, group, baseImages, tags] = await Promise.all([
        ipRepository.findById(db, ipId),
        groupRepository.findById(db, groupId),
        imageRepository.findByGroupId(db, groupId, {
          mediaType: hasImageOnlyFilter(activeFilters) ? 'image' : 'all',
          aspectRatio: activeFilters.aspectRatio ?? undefined,
          favoritesOnly: activeFilters.favorite || undefined,
          orderBy: activeFilters.recentViewed ? 'lastViewedAtDesc' : sortOrder,
          recentlyViewedOnly: activeFilters.recentViewed || undefined,
          tagIds: activeFilters.tagIds,
          untaggedOnly: activeFilters.untagged || undefined,
          minFileSize: activeFilters.size?.minFileSize,
          maxFileSize: activeFilters.size?.maxFileSize,
        }),
        tagRepository.findUsageOverviewByIpId(db, ipId),
      ]);
      const images = filterImagesBySimilarity(baseImages, activeFilters);

      return { ip, group, images, tags };
      });
    },
    [activeFilters, groupId, ipId, refreshToken, sortOrder, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组图片失败：${message}`;
      },
      initialData: { group: null, images: [], ip: null, tags: [] },
    }
  );

  const ip = data?.ip ?? null;
  const group = data?.group ?? null;
  const images = data?.images ?? [];
  const imageAssets = useMemo(() => images.filter((image) => image.mediaType !== 'video'), [images]);
  const selectableAssets = images;
  const tags = data?.tags ?? [];
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (activeFilters.favorite) labels.push('收藏');
    if (activeFilters.untagged) labels.push('无标签');
    if (activeFilters.recentViewed) labels.push('最近查看');
    if (activeFilters.similarDuplicate) labels.push('相似图片');
    if (activeFilters.tagIds.length > 0) labels.push(`标签 ${activeFilters.tagIds.length}`);
    if (activeFilters.aspectLabel) labels.push(activeFilters.aspectLabel);
    if (activeFilters.size) labels.push(activeFilters.size.label);
    return labels;
  }, [activeFilters, tags]);
  const filterLabel = activeFilterLabels.length > 0 ? activeFilterLabels.join(' · ') : '全部';
  const hasActiveFilters = activeFilterLabels.length > 0;
  const multiSelect = useImageMultiSelect(useMemo(() => selectableAssets.map((image) => image.id), [selectableAssets]));
  const swipeSelection = useSwipeGridSelection({
    items: images.map((image) => ({ id: image.id, mediaType: image.mediaType })),
    selectedIds: multiSelect.selectedImageIds,
    setSelectedIds: multiSelect.setSelectedImageIds,
    scrollViewRef,
    selectableMediaTypes: ['image', 'video'],
  });
  const selectedAssets = useMemo(
    () => selectableAssets.filter((image) => multiSelect.selectedImageIds.includes(image.id)),
    [selectableAssets, multiSelect.selectedImageIds]
  );

  function handleOpenImage(imageId: number) {
    const asset = images.find((item) => item.id === imageId);
    if (multiSelect.isSelectionMode) {
      multiSelect.toggleSelection(imageId);
      return;
    }
    if (asset?.mediaType === 'video') {
      onOpenImageDetail(imageId);
      return;
    }

    onOpenImage(
      imageId,
      hasActiveFilters
        ? { type: 'image-scope', imageIds: imageAssets.map((image) => image.id), label: `${group?.name ?? '分组'} · ${filterLabel}`, space }
        : { type: 'group', ipId, groupId, space }
    );
  }

  function handleImageLongPress(imageId: number) {
    swipeSelection.beginSwipeSelection(imageId);
  }

  const footer = multiSelect.isSelectionMode ? (
    <BatchImageOrganizePanel
      currentGroupId={groupId}
      onChanged={reload}
      onClearSelection={multiSelect.clearSelection}
      onDeleted={reload}
      selectedImages={selectedAssets}
      space={space}
      totalCount={selectableAssets.length}
    />
  ) : undefined;

  function toggleTagFilter(tagId: number) {
    setActiveFilters((current) => ({
      ...current,
      tagIds: current.tagIds.includes(tagId) ? current.tagIds.filter((item) => item !== tagId) : [...current.tagIds, tagId],
    }));
  }

  function toggleBooleanFilter(key: 'favorite' | 'untagged' | 'recentViewed') {
    setActiveFilters((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleSimilarFilter() {
    setActiveFilters((current) => ({ ...current, similarDuplicate: !current.similarDuplicate }));
  }

  function toggleAspectFilter(aspectRatio: ImageAspectRatioFilter, label: string) {
    setActiveFilters((current) => ({
      ...current,
      aspectRatio: current.aspectRatio === aspectRatio ? null : aspectRatio,
      aspectLabel: current.aspectRatio === aspectRatio ? null : label,
    }));
  }

  function toggleSizeFilter(size: GroupResultFileSizeFilter) {
    setActiveFilters((current) => ({ ...current, size: current.size?.label === size.label ? null : size }));
  }

  function clearFilterGroup(group: GroupResultFilterDropdown) {
    if (group === 'status') {
      setActiveFilters((current) => ({
        ...current,
        favorite: false,
        recentViewed: false,
        similarDuplicate: false,
        untagged: false,
      }));
    } else if (group === 'tag') {
      setActiveFilters((current) => ({ ...current, tagIds: [] }));
    } else {
      setActiveFilters((current) => ({ ...current, aspectRatio: null, aspectLabel: null, size: null }));
    }
  }

  return (
    <ScreenScaffold
      backgroundVariant="gallery"
      decorativeTitle="Gallery"
      footer={footer}
      onBack={onBack}
      onScroll={swipeSelection.onScroll}
      scrollViewRef={scrollViewRef}
      scrollable
      title="分组图片"
    >
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

      <View style={styles.filterBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
          <FilterMenuButton active={activeFilters.favorite || activeFilters.untagged || activeFilters.recentViewed || activeFilters.similarDuplicate} label="状态" onPress={() => setActiveFilterDropdown((current) => (current === 'status' ? null : 'status'))} />
          <FilterMenuButton active={activeFilters.tagIds.length > 0} label={`标签${activeFilters.tagIds.length > 0 ? ` ${activeFilters.tagIds.length}` : ''}`} onPress={() => setActiveFilterDropdown((current) => (current === 'tag' ? null : 'tag'))} />
          <FilterMenuButton active={activeFilters.aspectRatio != null || activeFilters.size != null} label="尺寸" onPress={() => setActiveFilterDropdown((current) => (current === 'size' ? null : 'size'))} />
          {hasActiveFilters ? (
            <Pressable onPress={() => setActiveFilters(EMPTY_GROUP_RESULT_FILTERS)} style={({ pressed }) => [styles.clearFilterPill, pressed && styles.pressed]}>
              <Text style={styles.clearFilterText}>清空</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        <Text numberOfLines={1} style={styles.filterStatus}>
          {hasActiveFilters ? `已选 ${activeFilterLabels.length} 个条件：${filterLabel}` : '未设置筛选'}
        </Text>
        {activeFilterDropdown ? (
          <FilterDrawer
            mode={getGroupResultFilterMode(activeFilterDropdown)}
            onClear={() => clearFilterGroup(activeFilterDropdown)}
            title={getGroupResultFilterTitle(activeFilterDropdown)}
          >
            {activeFilterDropdown === 'status' ? (
              <View style={styles.drawerSections}>
                <Text style={styles.drawerSectionTitle}>状态 · 多选</Text>
                <View style={styles.filterOptionGrid}>
                  <FilterOptionChip label="收藏" selected={activeFilters.favorite} onPress={() => toggleBooleanFilter('favorite')} />
                  <FilterOptionChip label="无标签" selected={activeFilters.untagged} onPress={() => toggleBooleanFilter('untagged')} />
                  <FilterOptionChip label="最近查看" selected={activeFilters.recentViewed} onPress={() => toggleBooleanFilter('recentViewed')} />
                </View>
                <View style={styles.filterOptionGrid}>
                  <FilterOptionChip label="相似图片" selected={activeFilters.similarDuplicate} onPress={toggleSimilarFilter} />
                </View>
              </View>
            ) : null}
            {activeFilterDropdown === 'tag' ? (
              <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
                {tags.map((tag) => (
                  <FilterOptionRow key={tag.id} label={`#${tag.name}`} selected={activeFilters.tagIds.includes(tag.id)} onPress={() => toggleTagFilter(tag.id)} />
                ))}
              </ScrollView>
            ) : null}
            {activeFilterDropdown === 'size' ? (
              <View style={styles.drawerSections}>
                <Text style={styles.drawerSectionTitle}>画幅 · 单选</Text>
                <View style={styles.filterOptionGrid}>
                  <FilterOptionChip label="横图" selected={activeFilters.aspectRatio === 'landscape'} onPress={() => toggleAspectFilter('landscape', '横图')} />
                  <FilterOptionChip label="竖图" selected={activeFilters.aspectRatio === 'portrait'} onPress={() => toggleAspectFilter('portrait', '竖图')} />
                  <FilterOptionChip label="方图" selected={activeFilters.aspectRatio === 'square'} onPress={() => toggleAspectFilter('square', '方图')} />
                  <FilterOptionChip label="长图" selected={activeFilters.aspectRatio === 'panorama'} onPress={() => toggleAspectFilter('panorama', '长图')} />
                </View>
                <Text style={styles.drawerSectionTitle}>大小 · 单选</Text>
                <View style={styles.filterOptionGrid}>
                  <FilterOptionChip label="< 500 KB" selected={activeFilters.size?.label === '< 500 KB'} onPress={() => toggleSizeFilter({ label: '< 500 KB', maxFileSize: 500 * 1024 })} />
                  <FilterOptionChip label="> 2 MB" selected={activeFilters.size?.label === '> 2 MB'} onPress={() => toggleSizeFilter({ label: '> 2 MB', minFileSize: 2 * 1024 * 1024 })} />
                </View>
              </View>
            ) : null}
          </FilterDrawer>
        ) : null}
      </View>

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
        <View style={styles.gridHeader}>
          <Text style={styles.gridTitle}>图片</Text>
          <SortMenuButton onChange={setSortOrder} orderBy={sortOrder} />
          <Pressable
            accessibilityLabel={viewMode === 'detail' ? '切换为宫格展示' : '切换为详细信息展示'}
            onPress={() => setViewMode(viewMode === 'detail' ? 'grid' : 'detail')}
            style={({ pressed }) => [styles.viewModeButton, viewMode === 'detail' ? styles.viewModeButtonActive : null, pressed && styles.pressed]}
          >
            <Ionicons color={viewMode === 'detail' ? colors.primary.active : colors.text.secondary} name={viewMode === 'detail' ? 'list-outline' : 'grid-outline'} size={15} />
          </Pressable>
          <Pressable
            disabled={selectableAssets.length === 0}
            onPress={multiSelect.toggleSelectAll}
            style={({ pressed }) => [styles.selectAllButton, selectableAssets.length === 0 ? styles.disabled : null, pressed && selectableAssets.length > 0 ? styles.pressed : null]}
          >
            <Text style={styles.selectAllText}>{multiSelect.allSelected ? '取消全选' : '全选'}</Text>
          </Pressable>
        </View>
        {viewMode === 'detail' ? (
          <View {...swipeSelection.panHandlers} style={styles.detailList}>
            {images.map((image) => (
              <AssetDetailRow
                image={image}
                key={image.id}
                onLayout={(event) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}
                onLongPress={handleImageLongPress}
                onPress={handleOpenImage}
                selected={multiSelect.selectedImageIds.includes(image.id)}
                space={space}
              />
            ))}
          </View>
        ) : (
          <View {...swipeSelection.panHandlers} style={styles.grid}>
            {images.map((image) => (
              <ThumbnailTile
                image={image}
                key={image.id}
                onLayout={(event) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}
                onLongPress={handleImageLongPress}
                onPress={handleOpenImage}
                selected={multiSelect.selectedImageIds.includes(image.id)}
                space={space}
              />
            ))}
          </View>
        )}
      </PageStateBlock>
    </ScreenScaffold>
  );
}

function FilterMenuButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.filterMenuButton, active ? styles.filterMenuButtonActive : null, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={[styles.filterMenuText, active ? styles.filterMenuTextActive : null]}>{label}</Text>
      <Ionicons color={active ? colors.primary.active : colors.text.secondary} name="chevron-down" size={13} />
    </Pressable>
  );
}

function FilterDrawer({ children, mode, onClear, title }: { children: ReactNode; mode: '多选' | '单选'; onClear: () => void; title: string }) {
  return (
    <View style={styles.filterDrawer}>
      <View style={styles.filterDrawerHeader}>
        <View style={styles.filterDrawerTitleRow}>
          <Text style={styles.filterDrawerTitle}>{title}</Text>
          <Text style={styles.filterDrawerMode}>{mode}</Text>
        </View>
        <Pressable onPress={onClear} style={({ pressed }) => [styles.drawerClearButton, pressed && styles.pressed]}>
          <Text style={styles.drawerClearText}>清空本类</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function FilterOptionChip({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.filterOptionChip, selected ? styles.filterOptionChipActive : null, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={[styles.filterOptionText, selected ? styles.filterOptionTextActive : null]}>{label}</Text>
      {selected ? <Ionicons color={colors.primary.active} name="checkmark-circle" size={14} /> : null}
    </Pressable>
  );
}

function FilterOptionRow({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.filterOptionRow, selected ? styles.filterOptionRowActive : null, pressed && styles.pressed]}>
      <Text numberOfLines={2} style={[styles.filterOptionRowText, selected ? styles.filterOptionTextActive : null]}>{label}</Text>
      <Ionicons color={selected ? colors.primary.active : colors.text.tertiary} name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={18} />
    </Pressable>
  );
}

function getGroupResultFilterTitle(filter: GroupResultFilterDropdown) {
  if (filter === 'status') return '状态筛选';
  if (filter === 'tag') return '标签筛选';
  return '尺寸筛选';
}

function getGroupResultFilterMode(filter: GroupResultFilterDropdown): '多选' | '单选' {
  return filter === 'size' ? '单选' : '多选';
}

function filterImagesBySimilarity(images: ImageListItem[], filters: GroupResultFilterState): ImageListItem[] {
  return filters.similarDuplicate ? filterSimilarImages(images) : images;
}

function hasImageOnlyFilter(filters: GroupResultFilterState): boolean {
  return Boolean(filters.aspectRatio || filters.similarDuplicate);
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.listCardGap,
    justifyContent: 'space-between',
    marginBottom: rhythm.microGap,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  summaryCopy: {
    flex: 1,
    gap: rhythm.microGap,
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
  filterBarWrap: {
    gap: rhythm.cardContentGap,
    marginTop: rhythm.microGap,
  },
  filterBar: {
    gap: rhythm.cardContentGap,
    paddingRight: spacing[2],
    paddingTop: spacing[1],
  },
  filterMenuButton: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  filterMenuButtonActive: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  filterMenuText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  filterMenuTextActive: {
    color: colors.primary.active,
  },
  filterStatus: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
    paddingHorizontal: spacing[1],
  },
  filterDrawer: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  filterDrawerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    justifyContent: 'space-between',
  },
  filterDrawerTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    minWidth: 0,
  },
  filterDrawerTitle: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '700',
  },
  filterDrawerMode: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
  drawerClearButton: {
    backgroundColor: colors.background.input,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: spacing[3],
  },
  drawerClearText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '700',
  },
  drawerSections: {
    gap: rhythm.cardContentGap,
  },
  drawerSectionTitle: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
    fontWeight: '700',
  },
  filterOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  filterOptionChip: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 32,
    paddingHorizontal: spacing[3],
  },
  filterOptionChipActive: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  filterOptionText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  filterOptionTextActive: {
    color: colors.primary.active,
  },
  filterDrawerList: {
    maxHeight: 250,
  },
  filterOptionRow: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    justifyContent: 'space-between',
    marginBottom: rhythm.cardContentGap,
    minHeight: 42,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  filterOptionRowActive: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  filterOptionRowText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    flex: 1,
    fontWeight: '700',
  },
  clearFilterPill: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  clearFilterText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
    marginTop: rhythm.microGap,
  },
  detailList: {
    gap: rhythm.listCardGap,
    marginTop: rhythm.microGap,
  },
  gridHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    justifyContent: 'space-between',
    marginBottom: rhythm.microGap,
  },
  gridTitle: {
    ...typography.textStyles.sectionTitle,
  },
  selectAllButton: {
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  selectAllText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '700',
  },
  viewModeButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  viewModeButtonActive: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.78,
  },
});
