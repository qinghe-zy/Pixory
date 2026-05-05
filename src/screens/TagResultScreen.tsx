import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageAspectRatioFilter, type ImageListItem, type IpRecord, type PixorySpace, type TagRecord } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
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
  const [activeFilterDropdown, setActiveFilterDropdown] = useState<TagResultFilterDropdown | null>(null);
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
          aspectRatio: activeFilters.aspectRatio ?? undefined,
          favoritesOnly: activeFilters.favorite || undefined,
          groupIds: activeFilters.groupIds,
          ipIds: activeFilters.ipIds,
          orderBy: activeFilters.recentViewed ? 'lastViewedAtDesc' : undefined,
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
    [activeFilters, tagId, refreshToken, space],
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

    onOpenImage(
      imageId,
      hasActiveFilters
        ? { type: 'image-scope', imageIds: images.map((image) => image.id), label: `#${tag?.name ?? '标签'} · ${filterLabel}`, space }
        : { type: 'tag', tagId, space }
    );
  }

  function handleImageLongPress(image: ImageListItem) {
    multiSelect.enterSelection(image.id);
  }

  const footer = multiSelect.isSelectionMode ? (
    <BatchImageOrganizePanel
      onChanged={reload}
      onClearSelection={multiSelect.clearSelection}
      onDeleted={reload}
      selectedImages={selectedImages}
      space={space}
      totalCount={images.length}
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
    <ScreenScaffold footer={footer} onBack={onBack} scrollable title={tag ? `#${tag.name}` : '标签结果'}>
      {tag ? (
        <View style={styles.summary}>
          <View style={styles.summaryCopy}>
            <Text numberOfLines={1} style={styles.subtitle}>已排除回收站</Text>
            <Text numberOfLines={1} style={styles.tagName}>#{tag.name}</Text>
          </View>
          <Text numberOfLines={1} style={styles.countText}>{images.length} 张</Text>
        </View>
      ) : null}

      <View style={styles.filterBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
          <FilterMenuButton active={activeFilters.favorite || activeFilters.ungrouped || activeFilters.recentViewed || activeFilters.similarSameSize || activeFilters.similarFilenamePrefix || activeFilters.similarDuplicate} label="状态" onPress={() => setActiveFilterDropdown((current) => (current === 'status' ? null : 'status'))} />
          <FilterMenuButton active={activeFilters.ipIds.length > 0} label={`IP${activeFilters.ipIds.length > 0 ? ` ${activeFilters.ipIds.length}` : ''}`} onPress={() => setActiveFilterDropdown((current) => (current === 'ip' ? null : 'ip'))} />
          <FilterMenuButton active={activeFilters.groupIds.length > 0} label={`分组${activeFilters.groupIds.length > 0 ? ` ${activeFilters.groupIds.length}` : ''}`} onPress={() => setActiveFilterDropdown((current) => (current === 'group' ? null : 'group'))} />
          <FilterMenuButton active={activeFilters.aspectRatio != null || activeFilters.size != null} label="尺寸" onPress={() => setActiveFilterDropdown((current) => (current === 'size' ? null : 'size'))} />
          {hasActiveFilters ? (
            <Pressable onPress={() => setActiveFilters(EMPTY_TAG_RESULT_FILTERS)} style={({ pressed }) => [styles.clearFilterPill, pressed && styles.pressed]}>
              <Text style={styles.clearFilterText}>清空</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        <Text numberOfLines={1} style={styles.filterStatus}>
          {hasActiveFilters ? `已选 ${activeFilterLabels.length} 个条件：${filterLabel}` : '未设置筛选'}
        </Text>
        {activeFilterDropdown ? (
          <FilterDrawer
            mode={getTagResultFilterMode(activeFilterDropdown)}
            onClear={() => clearFilterGroup(activeFilterDropdown)}
            title={getTagResultFilterTitle(activeFilterDropdown)}
          >
            {activeFilterDropdown === 'status' ? (
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
            ) : null}
            {activeFilterDropdown === 'ip' ? (
              <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
                {ips.map((ip) => (
                  <FilterOptionRow key={ip.id} label={ip.name} selected={activeFilters.ipIds.includes(ip.id)} onPress={() => toggleIpFilter(ip.id)} />
                ))}
              </ScrollView>
            ) : null}
            {activeFilterDropdown === 'group' ? (
              <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
                {groups.map((group) => (
                  <FilterOptionRow key={group.id} label={group.name} selected={activeFilters.groupIds.includes(group.id)} onPress={() => toggleGroupFilter(group.id)} />
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
        <View style={styles.gridHeader}>
          <Text style={styles.gridTitle}>图片</Text>
          <Pressable
            disabled={images.length === 0}
            onPress={multiSelect.toggleSelectAll}
            style={({ pressed }) => [styles.selectAllButton, images.length === 0 ? styles.disabled : null, pressed && images.length > 0 ? styles.pressed : null]}
          >
            <Text style={styles.selectAllText}>{multiSelect.allSelected ? '取消全选' : '全选'}</Text>
          </Pressable>
        </View>
        <View style={styles.grid}>
          {images.map((image) => (
            <ThumbnailTile
              image={image}
              key={image.id}
              onLongPress={() => handleImageLongPress(image)}
              onPress={handleOpenImage}
              selected={multiSelect.selectedImageIds.includes(image.id)}
              space={space}
            />
          ))}
        </View>
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
    maxWidth: '100%',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  summaryCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  subtitle: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  tagName: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  countText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '500',
  },
  filterBarWrap: {
    gap: spacing[2],
    marginTop: spacing[1],
  },
  filterBar: {
    gap: spacing[2],
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
    gap: spacing[1],
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
    gap: spacing[2],
    padding: spacing[3],
  },
  filterDrawerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  filterDrawerTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing[2],
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
    gap: spacing[2],
  },
  drawerSectionTitle: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
    fontWeight: '700',
  },
  filterOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  filterOptionChip: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
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
    gap: spacing[2],
    justifyContent: 'space-between',
    marginBottom: spacing[2],
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
    gap: spacing[2],
    marginTop: spacing[1],
  },
  gridHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
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
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.78,
  },
});
