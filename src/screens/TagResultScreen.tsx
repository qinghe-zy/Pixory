import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { AssetDetailRow } from '../components/AssetDetailRow';
import { AssetFilterDrawer } from '../components/AssetFilterDrawer';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SortMenuButton, IMAGE_SORT_OPTIONS } from '../components/SortMenuButton';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageAspectRatioFilter, type ImageListItem, type IpRecord, type PixorySpace, type TagRecord } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import { useSwipeGridSelection } from '../hooks/useSwipeGridSelection';
import { useAssetListPreferences } from '../services/assetListPreferences';
import { getFilenamePrefix } from '../utils/batchSelectionRules';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

interface TagResultScreenProps {
  tagId: number;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onStartBatchManagement: (ipId: number, imageId: number) => void;
}

type TagResultFileSizeFilter = { label: string; minFileSize?: number; maxFileSize?: number };
type SimilarFilterKey = 'similarSameSize' | 'similarFilenamePrefix' | 'similarDuplicate';

interface TagResultFilterState {
  favorite: boolean;
  recentViewed: boolean;
  similarDuplicate: boolean;
  similarFilenamePrefix: boolean;
  similarSameSize: boolean;
  ungrouped: boolean;
  ipIds: number[];
  groupIds: number[];
  aspectRatio: ImageAspectRatioFilter | null;
  aspectLabel: string | null;
  size: TagResultFileSizeFilter | null;
}

const EMPTY_TAG_RESULT_FILTERS: TagResultFilterState = {
  aspectLabel: null,
  aspectRatio: null,
  favorite: false,
  groupIds: [],
  ipIds: [],
  recentViewed: false,
  similarDuplicate: false,
  similarFilenamePrefix: false,
  similarSameSize: false,
  size: null,
  ungrouped: false,
};

type TagResultFilterDropdown = 'status' | 'ip' | 'group' | 'size';
const SORT_OPTIONS = IMAGE_SORT_OPTIONS;

export function TagResultScreen({
  tagId,
  space = 'normal',
  refreshToken,
  onBack,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: TagResultScreenProps) {
  const [activeFilters, setActiveFilters] = useState<TagResultFilterState>(EMPTY_TAG_RESULT_FILTERS);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const { viewMode, sortOrder, setViewMode, setSortOrder } = useAssetListPreferences(space, 'createdAtDesc');
  const scrollViewRef = useRef<ScrollView | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    tag: TagRecord | null;
    images: ImageListItem[];
    ips: IpRecord[];
    groups: GroupRecord[];
  }>(
    async () => {
      const [tag, baseImages, ips, groups] = await runWithDatabaseSpace(space, (db) => Promise.all([
        tagRepository.findById(db, tagId),
        imageRepository.findByTagId(db, tagId, {
          mediaType: hasImageOnlyFilter(activeFilters) ? 'image' : 'all',
          aspectRatio: activeFilters.aspectRatio ?? undefined,
          favoritesOnly: activeFilters.favorite || undefined,
          groupIds: activeFilters.groupIds,
          ipIds: activeFilters.ipIds,
          orderBy: activeFilters.recentViewed ? 'lastViewedAtDesc' : sortOrder,
          recentlyViewedOnly: activeFilters.recentViewed || undefined,
          ungroupedOnly: activeFilters.ungrouped || undefined,
          minFileSize: activeFilters.size?.minFileSize,
          maxFileSize: activeFilters.size?.maxFileSize,
        }),
        ipRepository.findAll(db),
        groupRepository.findAll(db),
      ]));

      if (!tag) {
        throw new Error('没有找到这个标签。');
      }
      const images = filterImagesBySimilarity(baseImages, activeFilters);

      return { tag, images, ips, groups };
    },
    [activeFilters, tagId, refreshToken, sortOrder, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取标签结果失败：${message}`;
      },
      initialData: { tag: null, images: [], ips: [], groups: [] },
    }
  );

  const tag = data?.tag ?? null;
  const images = data?.images ?? [];
  const imageAssets = useMemo(() => images.filter((image) => image.mediaType !== 'video'), [images]);
  const selectableAssets = images;
  const ips = data?.ips ?? [];
  const groups = data?.groups ?? [];
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (activeFilters.favorite) labels.push('收藏');
    if (activeFilters.ungrouped) labels.push('未分组');
    if (activeFilters.recentViewed) labels.push('最近查看');
    if (activeFilters.similarSameSize) labels.push('同尺寸');
    if (activeFilters.similarFilenamePrefix) labels.push('文件名前缀');
    if (activeFilters.similarDuplicate) labels.push('疑似重复');
    if (activeFilters.ipIds.length > 0) labels.push(`IP ${activeFilters.ipIds.length}`);
    if (activeFilters.groupIds.length > 0) labels.push(`分组 ${activeFilters.groupIds.length}`);
    if (activeFilters.aspectLabel) labels.push(activeFilters.aspectLabel);
    if (activeFilters.size) labels.push(activeFilters.size.label);
    return labels;
  }, [activeFilters, groups, ips]);
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
        ? { type: 'image-scope', imageIds: imageAssets.map((image) => image.id), label: `#${tag?.name ?? '标签'} · ${filterLabel}`, space }
        : { type: 'tag', tagId, space }
    );
  }

  function handleImageLongPress(image: ImageListItem) {
    swipeSelection.beginSwipeSelection(image.id);
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

  function toggleIpFilter(ipId: number) {
    setActiveFilters((current) => ({
      ...current,
      ipIds: current.ipIds.includes(ipId) ? current.ipIds.filter((item) => item !== ipId) : [...current.ipIds, ipId],
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

  function toggleAspectFilter(aspectRatio: ImageAspectRatioFilter, label: string) {
    setActiveFilters((current) => ({
      ...current,
      aspectRatio: current.aspectRatio === aspectRatio ? null : aspectRatio,
      aspectLabel: current.aspectRatio === aspectRatio ? null : label,
    }));
  }

  function toggleSizeFilter(size: TagResultFileSizeFilter) {
    setActiveFilters((current) => ({ ...current, size: current.size?.label === size.label ? null : size }));
  }

  function toggleBooleanFilter(key: 'favorite' | 'ungrouped' | 'recentViewed') {
    setActiveFilters((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleSimilarFilter(key: SimilarFilterKey) {
    setActiveFilters((current) => ({ ...current, [key]: !current[key] }));
  }

  function clearFilterGroup(group: TagResultFilterDropdown) {
    if (group === 'status') {
      setActiveFilters((current) => ({
        ...current,
        favorite: false,
        recentViewed: false,
        similarDuplicate: false,
        similarFilenamePrefix: false,
        similarSameSize: false,
        ungrouped: false,
      }));
    } else if (group === 'ip') {
      setActiveFilters((current) => ({ ...current, ipIds: [] }));
    } else if (group === 'group') {
      setActiveFilters((current) => ({ ...current, groupIds: [] }));
    } else {
      setActiveFilters((current) => ({ ...current, aspectRatio: null, aspectLabel: null, size: null }));
    }
  }

  return (
    <View style={styles.host} {...swipeFilterDrawerPanResponder.panHandlers}>
    <ScreenScaffold
      backgroundVariant="tags"
      footer={footer}
      onBack={onBack}
      onScroll={swipeSelection.onScroll}
      scrollViewRef={scrollViewRef}
      scrollable
      title={tag ? `#${tag.name}` : '标签结果'}
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
            <FilterOptionChip label="最近查看" selected={activeFilters.recentViewed} onPress={() => toggleBooleanFilter('recentViewed')} />
          </View>
          <Text style={styles.drawerSectionTitle}>相似 · 多选</Text>
          <View style={styles.filterOptionGrid}>
            <FilterOptionChip label="同尺寸" selected={activeFilters.similarSameSize} onPress={() => toggleSimilarFilter('similarSameSize')} />
            <FilterOptionChip label="文件名前缀" selected={activeFilters.similarFilenamePrefix} onPress={() => toggleSimilarFilter('similarFilenamePrefix')} />
            <FilterOptionChip label="疑似重复" selected={activeFilters.similarDuplicate} onPress={() => toggleSimilarFilter('similarDuplicate')} />
          </View>
        </View>

        <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
          {ips.map((ip) => (
            <FilterOptionRow key={ip.id} label={ip.name} selected={activeFilters.ipIds.includes(ip.id)} onPress={() => toggleIpFilter(ip.id)} />
          ))}
        </ScrollView>

        <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
          {groups.map((group) => (
            <FilterOptionRow key={group.id} label={group.name} selected={activeFilters.groupIds.includes(group.id)} onPress={() => toggleGroupFilter(group.id)} />
          ))}
        </ScrollView>

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
      </AssetFilterDrawer>

      <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="这个标签当前没有关联中的图片，可能都已移入回收站或还没被使用。"
        emptyIconName="search-outline"
        emptyTitle="暂无标签结果"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地标签结果读取完成后，这里会展示关联图片。"
        loadingTitle="正在读取标签结果"
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
                onLongPress={() => handleImageLongPress(image)}
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
                onLayout={(event: any) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}
                onLongPress={() => handleImageLongPress(image)}
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

function getTagResultFilterTitle(filter: TagResultFilterDropdown) {
  if (filter === 'status') return '状态筛选';
  if (filter === 'ip') return 'IP 筛选';
  if (filter === 'group') return '分组筛选';
  return '尺寸筛选';
}

function getTagResultFilterMode(filter: TagResultFilterDropdown): '多选' | '单选' {
  return filter === 'size' ? '单选' : '多选';
}

function filterImagesBySimilarity(images: ImageListItem[], filters: TagResultFilterState): ImageListItem[] {
  if (!filters.similarSameSize && !filters.similarFilenamePrefix && !filters.similarDuplicate) {
    return images;
  }

  const sameSizeCounts = new Map<string, number>();
  const prefixCounts = new Map<string, number>();
  const duplicateCounts = new Map<string, number>();

  for (const image of images) {
    const sizeKey = `${image.width}x${image.height}`;
    const duplicateKey = `${sizeKey}:${image.fileSize}`;
    sameSizeCounts.set(sizeKey, (sameSizeCounts.get(sizeKey) ?? 0) + 1);
    duplicateCounts.set(duplicateKey, (duplicateCounts.get(duplicateKey) ?? 0) + 1);

    const prefix = getFilenamePrefix(image.originalFilename);
    if (prefix) {
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
  }

  return images.filter((image) => {
    if (filters.similarSameSize && (sameSizeCounts.get(`${image.width}x${image.height}`) ?? 0) <= 1) {
      return false;
    }
    if (filters.similarDuplicate && (duplicateCounts.get(`${image.width}x${image.height}:${image.fileSize}`) ?? 0) <= 1) {
      return false;
    }
    if (filters.similarFilenamePrefix) {
      const prefix = getFilenamePrefix(image.originalFilename);
      if (!prefix || (prefixCounts.get(prefix) ?? 0) <= 1) {
        return false;
      }
    }
    return true;
  });
}

function hasImageOnlyFilter(filters: TagResultFilterState): boolean {
  return Boolean(filters.aspectRatio || filters.similarDuplicate || filters.similarFilenamePrefix || filters.similarSameSize);
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
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
    justifyContent: 'space-between',
    rowGap: rhythm.compactGridGap,
    marginTop: rhythm.microGap,
  },
  detailList: {
    gap: rhythm.listCardGap,
    marginTop: rhythm.microGap,
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
  pressed: {
    opacity: 0.78,
  },
});
