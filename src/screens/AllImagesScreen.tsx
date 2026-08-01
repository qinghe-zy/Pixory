import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { AssetDetailRow } from '../components/AssetDetailRow';
import { AssetFilterDrawer } from '../components/AssetFilterDrawer';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { SortMenuButton, IMAGE_SORT_OPTIONS } from '../components/SortMenuButton';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageListItem, type IpRecord, type PixorySpace, type TagUsageItem } from '../database';
import { colors, componentTokens, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import { useSwipeGridSelection } from '../hooks/useSwipeGridSelection';
import { useAssetListPreferences } from '../services/assetListPreferences';
import { filterSimilarImages } from '../utils/batchSelectionRules';
import type { ImageAspectRatioFilter } from '../database';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

type FileSizeFilter = { label: string; minFileSize?: number; maxFileSize?: number };

interface AllImagesFilterState {
  favorite: boolean;
  ungrouped: boolean;
  untagged: boolean;
  recentViewed: boolean;
  similarDuplicate: boolean;
  mimeType: string | null;
  mimeLabel: string | null;
  aspectRatio: ImageAspectRatioFilter | null;
  aspectLabel: string | null;
  size: FileSizeFilter | null;
  groupIds: number[];
  tagIds: number[];
}

const EMPTY_FILTERS: AllImagesFilterState = {
  favorite: false,
  ungrouped: false,
  untagged: false,
  recentViewed: false,
  similarDuplicate: false,
  mimeType: null,
  mimeLabel: null,
  aspectRatio: null,
  aspectLabel: null,
  size: null,
  groupIds: [],
  tagIds: [],
};

type AllImagesFilterDropdown = 'status' | 'aspect' | 'file' | 'group' | 'tag';

interface AllImagesScreenProps {
  ipId: number;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onImportImages: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onStartBatchManagement: (imageId: number) => void;
}

export function AllImagesScreen({
  ipId,
  space = 'normal',
  refreshToken,
  onBack,
  onImportImages,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: AllImagesScreenProps) {
  const [activeFilters, setActiveFilters] = useState<AllImagesFilterState>(EMPTY_FILTERS);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const { viewMode, sortOrder, setViewMode, setSortOrder } = useAssetListPreferences(space, 'createdAtDesc');
  const SORT_OPTIONS = IMAGE_SORT_OPTIONS;
  const scrollViewRef = useRef<ScrollView | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ip: IpRecord | null;
    images: ImageListItem[];
    groups: GroupRecord[];
    tags: TagUsageItem[];
  }>(
    async () => {
      return runWithDatabaseSpace(space, async (db) => {
      const [ip, groups, tags] = await Promise.all([
        ipRepository.findById(db, ipId),
        groupRepository.findByIpId(db, ipId),
        tagRepository.findUsageOverviewByIpId(db, ipId),
      ]);

      const baseImages = await imageRepository.findByIpId(db, ipId, {
        mediaType: hasImageOnlyFilter(activeFilters) ? 'image' : 'all',
        favoritesOnly: activeFilters.favorite || undefined,
        ungroupedOnly: activeFilters.ungrouped || undefined,
        untaggedOnly: activeFilters.untagged || undefined,
        recentlyViewedOnly: activeFilters.recentViewed || undefined,
        orderBy: activeFilters.recentViewed ? 'lastViewedAtDesc' : sortOrder,
        mimeType: activeFilters.mimeType ?? undefined,
        aspectRatio: activeFilters.aspectRatio ?? undefined,
        minFileSize: activeFilters.size?.minFileSize,
        maxFileSize: activeFilters.size?.maxFileSize,
        groupIds: activeFilters.groupIds,
        tagIds: activeFilters.tagIds,
      });
      const images = filterImagesBySimilarity(baseImages, activeFilters);

      return { ip, images, groups, tags };
      });
    },
    [activeFilters, ipId, refreshToken, sortOrder, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取图片库失败：${message}`;
      },
      initialData: { ip: null, images: [], groups: [], tags: [] },
      deferUntilInteractions: true,
    }
  );

  const ip = data?.ip ?? null;
  const images = data?.images ?? [];
  const imageAssets = useMemo(() => images.filter((image) => image.mediaType !== 'video'), [images]);
  const selectableAssets = images;
  const groups = data?.groups ?? [];
  const tags = data?.tags ?? [];
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (activeFilters.favorite) labels.push('收藏');
    if (activeFilters.ungrouped) labels.push('未分组');
    if (activeFilters.untagged) labels.push('无标签');
    if (activeFilters.recentViewed) labels.push('最近查看');
    if (activeFilters.similarDuplicate) labels.push('相似图片');
    if (activeFilters.mimeLabel) labels.push(activeFilters.mimeLabel);
    if (activeFilters.aspectLabel) labels.push(activeFilters.aspectLabel);
    if (activeFilters.size) labels.push(activeFilters.size.label);
    if (activeFilters.groupIds.length > 0) labels.push(`分组 ${activeFilters.groupIds.length}`);
    if (activeFilters.tagIds.length > 0) labels.push(`标签 ${activeFilters.tagIds.length}`);
    return labels;
  }, [activeFilters, groups, tags]);
  const activeFilterLabel = activeFilterLabels.length > 0 ? activeFilterLabels.join(' · ') : '全部';
  const hasActiveFilters = activeFilterLabels.length > 0;
  const multiSelect = useImageMultiSelect(useMemo(() => selectableAssets.map((image) => image.id), [selectableAssets]));
  const swipeSelection = useSwipeGridSelection({
    items: images.map((image) => ({ id: image.id, mediaType: image.mediaType })),
    selectedIds: multiSelect.selectedImageIds,
    setSelectedIds: multiSelect.setSelectedImageIds,
    scrollViewRef,
    selectableMediaTypes: ['image', 'video'],
  });

  const swipeFilterDrawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (evt, gs) => {
        return (
          gs.dx < -6 &&
          Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2
        );
      },
      onPanResponderRelease: (evt, gs) => {
        if (
          gs.dx < -10 ||
          (gs.dx < -6 && gs.vx < -0.18)
        ) {
          setIsFilterDrawerOpen(true);
        }
      },
    })
  ).current;

  const selectedAssets = useMemo(
    () => selectableAssets.filter((image) => multiSelect.selectedImageIds.includes(image.id)),
    [selectableAssets, multiSelect.selectedImageIds]
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
        ? { type: 'image-scope', imageIds: imageAssets.map((image) => image.id), label: activeFilterLabel, space }
        : { type: 'ip-all', ipId, filter: { type: 'all' }, space }
    );
  }

  function handleImageLongPress(imageId: number) {
    swipeSelection.beginSwipeSelection(imageId);
  }

  function toggleBooleanFilter(key: 'favorite' | 'ungrouped' | 'untagged' | 'recentViewed') {
    setActiveFilters((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleSimilarFilter() {
    setActiveFilters((current) => ({ ...current, similarDuplicate: !current.similarDuplicate }));
  }

  function toggleMimeFilter(mimeType: string, label: string) {
    setActiveFilters((current) => ({
      ...current,
      mimeType: current.mimeType === mimeType ? null : mimeType,
      mimeLabel: current.mimeType === mimeType ? null : label,
    }));
  }

  function toggleAspectFilter(aspectRatio: ImageAspectRatioFilter, label: string) {
    setActiveFilters((current) => ({
      ...current,
      aspectRatio: current.aspectRatio === aspectRatio ? null : aspectRatio,
      aspectLabel: current.aspectRatio === aspectRatio ? null : label,
    }));
  }

  function toggleSizeFilter(size: FileSizeFilter) {
    setActiveFilters((current) => ({
      ...current,
      size: current.size?.label === size.label ? null : size,
    }));
  }

  function toggleGroupFilter(groupId: number) {
    setActiveFilters((current) => ({
      ...current,
      groupIds: current.groupIds.includes(groupId)
        ? current.groupIds.filter((item) => item !== groupId)
        : [...current.groupIds, groupId],
    }));
  }

  function toggleTagFilter(tagId: number) {
    setActiveFilters((current) => ({
      ...current,
      tagIds: current.tagIds.includes(tagId)
        ? current.tagIds.filter((item) => item !== tagId)
        : [...current.tagIds, tagId],
    }));
  }

  function clearFilterGroup(group: AllImagesFilterDropdown) {
    if (group === 'status') {
      setActiveFilters((current) => ({
        ...current,
        favorite: false,
        recentViewed: false,
        similarDuplicate: false,
        ungrouped: false,
        untagged: false,
      }));
    } else if (group === 'aspect') {
      setActiveFilters((current) => ({ ...current, aspectRatio: null, aspectLabel: null }));
    } else if (group === 'file') {
      setActiveFilters((current) => ({ ...current, mimeType: null, mimeLabel: null, size: null }));
    } else if (group === 'group') {
      setActiveFilters((current) => ({ ...current, groupIds: [] }));
    } else {
      setActiveFilters((current) => ({ ...current, tagIds: [] }));
    }
  }

  const footer = multiSelect.isSelectionMode ? (
    <BatchImageOrganizePanel
      onChanged={reload}
      onClearSelection={multiSelect.clearSelection}
      onDeleted={reload}
      selectedImages={selectedAssets}
      space={space}
      totalCount={selectableAssets.length}
    />
  ) : undefined;
  return (
    <View style={styles.host} {...swipeFilterDrawerPanResponder.panHandlers}>
    <ScreenScaffold
      backgroundVariant="gallery"
      decorativeTitle="Gallery"
      footer={footer}
      onBack={onBack}
      onScroll={swipeSelection.onScroll}
      rightAction={rightAction}
      scrollViewRef={scrollViewRef}
      scrollable
      title={ip ? `全部素材 · ${ip.name}` : '全部素材'}
    >

      <AssetFilterDrawer visible={isFilterDrawerOpen} onClose={() => setIsFilterDrawerOpen(false)}>
              <View style={styles.drawerSections}>
                <Text style={styles.drawerSectionTitle}>视图</Text>
                <View style={styles.filterOptionGrid}>
                  <FilterOptionChip label="宫格展示" selected={viewMode === 'grid'} onPress={() => setViewMode('grid')} />
                  <FilterOptionChip label="详细信息" selected={viewMode === 'detail'} onPress={() => setViewMode('detail')} />
                </View>
              </View>

              <View style={styles.drawerSections}>
                <Text style={styles.drawerSectionTitle}>状态 · 多选</Text>
                <View style={styles.filterOptionGrid}>
                  <FilterOptionChip label="收藏" selected={activeFilters.favorite} onPress={() => toggleBooleanFilter('favorite')} />
                  <FilterOptionChip label="未分组" selected={activeFilters.ungrouped} onPress={() => toggleBooleanFilter('ungrouped')} />
                  <FilterOptionChip label="无标签" selected={activeFilters.untagged} onPress={() => toggleBooleanFilter('untagged')} />
                  <FilterOptionChip label="最近查看" selected={activeFilters.recentViewed} onPress={() => toggleBooleanFilter('recentViewed')} />
                </View>
                <View style={styles.filterOptionGrid}>
                  <FilterOptionChip label="相似图片" selected={activeFilters.similarDuplicate} onPress={toggleSimilarFilter} />
                </View>
              </View>

              <View style={styles.filterOptionGrid}>
                <FilterOptionChip label="横图" selected={activeFilters.aspectRatio === 'landscape'} onPress={() => toggleAspectFilter('landscape', '横图')} />
                <FilterOptionChip label="竖图" selected={activeFilters.aspectRatio === 'portrait'} onPress={() => toggleAspectFilter('portrait', '竖图')} />
                <FilterOptionChip label="方图" selected={activeFilters.aspectRatio === 'square'} onPress={() => toggleAspectFilter('square', '方图')} />
                <FilterOptionChip label="长图" selected={activeFilters.aspectRatio === 'panorama'} onPress={() => toggleAspectFilter('panorama', '长图')} />
              </View>

              <View style={styles.drawerSections}>
                <Text style={styles.drawerSectionTitle}>格式 · 单选</Text>
                <View style={styles.filterOptionGrid}>
                  <FilterOptionChip label="JPEG" selected={activeFilters.mimeType === 'image/jpeg'} onPress={() => toggleMimeFilter('image/jpeg', 'JPEG')} />
                  <FilterOptionChip label="PNG" selected={activeFilters.mimeType === 'image/png'} onPress={() => toggleMimeFilter('image/png', 'PNG')} />
                </View>
                <Text style={styles.drawerSectionTitle}>大小 · 单选</Text>
                <View style={styles.filterOptionGrid}>
                  <FilterOptionChip label="< 500 KB" selected={activeFilters.size?.label === '< 500 KB'} onPress={() => toggleSizeFilter({ label: '< 500 KB', maxFileSize: 500 * 1024 })} />
                  <FilterOptionChip label="> 2 MB" selected={activeFilters.size?.label === '> 2 MB'} onPress={() => toggleSizeFilter({ label: '> 2 MB', minFileSize: 2 * 1024 * 1024 })} />
                </View>
              </View>

              <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
                {groups.map((group) => (
                  <FilterOptionRow key={group.id} label={group.name} selected={activeFilters.groupIds.includes(group.id)} onPress={() => toggleGroupFilter(group.id)} />
                ))}
              </ScrollView>

              <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
                {tags.map((tag) => (
                  <FilterOptionRow key={tag.id} label={`#${tag.name}`} selected={activeFilters.tagIds.includes(tag.id)} onPress={() => toggleTagFilter(tag.id)} />
                ))}
              </ScrollView>
      </AssetFilterDrawer>

      <PageStateBlock
        emptyActionLabel={commonButtonCopy.importImages}
        emptyDescription={
          !hasActiveFilters
            ? '上传第一张图片后，就可以在这里按分组和标签进行管理'
            : '这个筛选条件下暂时没有素材。'
        }
        emptyIconName="images-outline"
        emptyTitle={!hasActiveFilters ? commonEmptyStateCopy.noImagesTitle : commonEmptyStateCopy.noSearchResultTitle}
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地索引加载完成后，这里会展示当前 IP 下的全部素材。"
        loadingTitle="正在读取素材库"
        onEmptyAction={onImportImages}
        onRetry={reload}
      >
        <View style={styles.galleryHeading}>
          <Text style={styles.galleryTitle}>{hasActiveFilters ? '筛选结果' : '全部素材'} · {images.length} 张</Text>
          <View style={styles.galleryActions}>
            {multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0 ? (
              <Pressable
                disabled={selectableAssets.length === 0}
                onPress={multiSelect.toggleSelectAll}
                style={({ pressed }) => [styles.selectAllButton, selectableAssets.length === 0 ? styles.disabled : null, pressed && selectableAssets.length > 0 ? styles.pressed : null]}
              >
                <Text style={styles.selectAllText}>{multiSelect.allSelected ? '取消全选' : '全选'}</Text>
              </Pressable>
            ) : null}
            <SortMenuButton
              hasActiveFilters={hasActiveFilters}
              onChange={setSortOrder}
              onFilterPress={() => setIsFilterDrawerOpen(true)}
              orderBy={sortOrder}
            />
          </View>
        </View>
        {viewMode === 'detail' ? (
          <View {...swipeSelection.panHandlers} style={styles.detailList}>
            {images.map((image) => (
              <AssetDetailRow
                image={image}
                key={image.id}
                onLayout={(event: any) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}
                onLongPress={handleImageLongPress}
                onPress={handleOpenImage}
                selected={multiSelect.selectedImageIds.includes(image.id)}
                isSelectionMode={multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0}
                space={space}
              />
            ))}
          </View>
        ) : (
          <View {...swipeSelection.panHandlers} style={styles.grid}>
            {images.map((image) => (
              <ThumbnailTile
                aspectRatio={componentTokens.thumbnail.squareAspectRatio}
                image={image}
                key={image.id}
                onLayout={(event) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}
                onLongPress={handleImageLongPress}
                onPress={handleOpenImage}
                selected={multiSelect.selectedImageIds.includes(image.id)}
                isSelectionMode={multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0}
                space={space}
              />
            ))}
            {Array.from({ length: (3 - (images.length % 3)) % 3 }).map((_, i) => (
              <View key={`dummy-${i}`} style={{ width: '31.8%' }} />
            ))}
          </View>
        )}
      </PageStateBlock>
    </ScreenScaffold>
    </View>
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

function getAllImagesFilterTitle(filter: AllImagesFilterDropdown) {
  if (filter === 'status') return '状态筛选';
  if (filter === 'aspect') return '画幅筛选';
  if (filter === 'file') return '文件筛选';
  if (filter === 'group') return '分组筛选';
  return '标签筛选';
}

function getAllImagesFilterMode(filter: AllImagesFilterDropdown): '多选' | '单选' {
  return filter === 'status' || filter === 'group' || filter === 'tag' ? '多选' : '单选';
}

function filterImagesBySimilarity(images: ImageListItem[], filters: AllImagesFilterState): ImageListItem[] {
  return filters.similarDuplicate ? filterSimilarImages(images) : images;
}

function hasImageOnlyFilter(filters: AllImagesFilterState): boolean {
  return Boolean(
    filters.aspectRatio ||
    filters.mimeType?.startsWith('image/') ||
    filters.similarDuplicate
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
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
    gap: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  summaryTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
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
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    minWidth: 0,
  },
  summaryTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    justifyContent: 'space-between',
  },
  summaryMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: rhythm.cardContentGap,
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
    gap: rhythm.microGap,
    minHeight: 28,
    paddingHorizontal: spacing[2],
  },
  countPillText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '600',
  },
  filterBarWrap: {
    gap: rhythm.cardContentGap,
    marginTop: rhythm.microGap,
  },
  filterBar: {
    gap: rhythm.cardContentGap,
    paddingTop: spacing[1],
    paddingRight: spacing[2],
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
    paddingTop: 2,
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
    justifyContent: 'space-between',
    gap: rhythm.cardContentGap,
  },
  filterDrawerTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
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
    minHeight: 28,
    justifyContent: 'center',
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
  galleryHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: rhythm.microGap,
  },
  galleryTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
  },
  galleryActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
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
  detailList: {
    gap: rhythm.listCardGap,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: rhythm.compactGridGap,
  },
});
