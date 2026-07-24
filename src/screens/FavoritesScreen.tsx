import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { AssetDetailRow } from '../components/AssetDetailRow';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SortMenuButton, IMAGE_SORT_OPTIONS } from '../components/SortMenuButton';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { listFavoriteAssistantMessages, type AiMessageFavoriteListItem } from '../ai/aiChatService';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageAspectRatioFilter, type ImageListItem, type IpRecord, type PixorySpace, type TagUsageItem } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import { useSwipeGridSelection } from '../hooks/useSwipeGridSelection';
import { useAssetListPreferences } from '../services/assetListPreferences';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

interface FavoritesScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onOpenAiMessageFavorite: (favorite: AiMessageFavoriteListItem) => void;
  onStartBatchManagement: (ipId: number, imageId: number) => void;
}

type FavoriteFileSizeFilter = { label: string; minFileSize?: number; maxFileSize?: number };

interface FavoriteFilterState {
  ipIds: number[];
  groupIds: number[];
  tagIds: number[];
  aspectRatio: ImageAspectRatioFilter | null;
  aspectLabel: string | null;
  size: FavoriteFileSizeFilter | null;
}

const EMPTY_FAVORITE_FILTERS: FavoriteFilterState = {
  ipIds: [],
  groupIds: [],
  tagIds: [],
  aspectRatio: null,
  aspectLabel: null,
  size: null,
};

type FavoriteFilterDropdown = 'ip' | 'size' | 'group' | 'tag';
const SORT_OPTIONS = IMAGE_SORT_OPTIONS;

export function FavoritesScreen({
  space = 'normal',
  refreshToken,
  onBack,
  onOpenAiMessageFavorite,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: FavoritesScreenProps) {
  const [activeFilters, setActiveFilters] = useState<FavoriteFilterState>(EMPTY_FAVORITE_FILTERS);
  const [activeFilterDropdown, setActiveFilterDropdown] = useState<FavoriteFilterDropdown | null>(null);
  const [favoriteMode, setFavoriteMode] = useState<'images' | 'ai'>('images');
  const [aiMessages, setAiMessages] = useState<AiMessageFavoriteListItem[]>([]);
  const [aiFavoriteErrorMessage, setAiFavoriteErrorMessage] = useState<string | null>(null);
  const [aiFavoritesLoading, setAiFavoritesLoading] = useState(false);
  const { viewMode, sortOrder, setViewMode, setSortOrder } = useAssetListPreferences(space, 'createdAtDesc');
  const scrollViewRef = useRef<ScrollView | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    images: ImageListItem[];
    ips: IpRecord[];
    groups: GroupRecord[];
    tags: TagUsageItem[];
  }>(
    async () => {
      const [images, ips, groups, tags] = await runWithDatabaseSpace(space, (db) => Promise.all([
        imageRepository.findFavorites(db, {
          mediaType: activeFilters.aspectRatio || activeFilters.size ? 'image' : 'all',
          ipIds: activeFilters.ipIds,
          groupIds: activeFilters.groupIds,
          tagIds: activeFilters.tagIds,
          aspectRatio: activeFilters.aspectRatio ?? undefined,
          minFileSize: activeFilters.size?.minFileSize,
          maxFileSize: activeFilters.size?.maxFileSize,
          orderBy: sortOrder,
        }),
        ipRepository.findAll(db),
        groupRepository.findAll(db),
        tagRepository.findUsageOverview(db),
      ]));
      return { images, ips, groups, tags };
    },
    [activeFilters, refreshToken, sortOrder, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取收藏图片失败：${message}`;
      },
      initialData: { images: [], ips: [], groups: [], tags: [] },
    }
  );
  const images = data?.images ?? [];
  const imageAssets = useMemo(() => images.filter((image) => image.mediaType !== 'video'), [images]);
  const selectableAssets = images;
  const ips = data?.ips ?? [];
  const groups = data?.groups ?? [];
  const tags = data?.tags ?? [];
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
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (activeFilters.ipIds.length > 0) labels.push(`IP ${activeFilters.ipIds.length}`);
    if (activeFilters.groupIds.length > 0) labels.push(`分组 ${activeFilters.groupIds.length}`);
    if (activeFilters.tagIds.length > 0) labels.push(`标签 ${activeFilters.tagIds.length}`);
    if (activeFilters.aspectLabel) labels.push(activeFilters.aspectLabel);
    if (activeFilters.size) labels.push(activeFilters.size.label);
    return labels;
  }, [activeFilters, groups, ips, tags]);
  const filterLabel = activeFilterLabels.length > 0 ? activeFilterLabels.join(' · ') : '全部收藏';
  const hasActiveFilters = activeFilterLabels.length > 0;

  const reloadAiFavorites = useCallback(async () => {
    setAiFavoritesLoading(true);
    setAiFavoriteErrorMessage(null);
    try {
      setAiMessages(await listFavoriteAssistantMessages({ space }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setAiFavoriteErrorMessage(`读取 AI 消息收藏失败：${message}`);
    } finally {
      setAiFavoritesLoading(false);
    }
  }, [space]);

  useEffect(() => {
    void reloadAiFavorites();
  }, [refreshToken, reloadAiFavorites]);

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
        ? { type: 'image-scope', imageIds: imageAssets.map((image) => image.id), label: filterLabel, space }
        : { type: 'favorites', space }
    );
  }

  function handleImageLongPress(image: ImageListItem) {
    swipeSelection.beginSwipeSelection(image.id);
  }

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

  function toggleTagFilter(tagId: number) {
    setActiveFilters((current) => ({
      ...current,
      tagIds: current.tagIds.includes(tagId) ? current.tagIds.filter((item) => item !== tagId) : [...current.tagIds, tagId],
    }));
  }

  function toggleAspectFilter(aspectRatio: ImageAspectRatioFilter, label: string) {
    setActiveFilters((current) => ({
      ...current,
      aspectRatio: current.aspectRatio === aspectRatio ? null : aspectRatio,
      aspectLabel: current.aspectRatio === aspectRatio ? null : label,
    }));
  }

  function toggleSizeFilter(size: FavoriteFileSizeFilter) {
    setActiveFilters((current) => ({ ...current, size: current.size?.label === size.label ? null : size }));
  }

  function clearFilterGroup(group: FavoriteFilterDropdown) {
    if (group === 'ip') {
      setActiveFilters((current) => ({ ...current, ipIds: [] }));
    } else if (group === 'size') {
      setActiveFilters((current) => ({ ...current, aspectRatio: null, aspectLabel: null, size: null }));
    } else if (group === 'group') {
      setActiveFilters((current) => ({ ...current, groupIds: [] }));
    } else {
      setActiveFilters((current) => ({ ...current, tagIds: [] }));
    }
  }

  const footer = favoriteMode === 'images' && multiSelect.isSelectionMode ? (
    <BatchImageOrganizePanel
      onChanged={reload}
      onClearSelection={multiSelect.clearSelection}
      onDeleted={reload}
      selectedImages={selectedAssets}
      space={space}
      totalCount={selectableAssets.length}
    />
  ) : undefined;
  const imageFavoritesContent = (
    <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="给图片加星标后，这里会展示当前所有收藏图片。"
        emptyIconName="star-outline"
        emptyTitle="还没有收藏图片"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地收藏索引读取完成后，这里会展示收藏图片。"
        loadingTitle="正在读取收藏图片"
        onRetry={reload}
      >
        <View style={styles.gridHeader}>
          <Text style={styles.gridTitle}>图片</Text>
          <Pressable
            disabled={selectableAssets.length === 0}
            onPress={multiSelect.toggleSelectAll}
            style={({ pressed }) => [styles.selectAllButton, selectableAssets.length === 0 ? styles.disabled : null, pressed && selectableAssets.length > 0 ? styles.pressed : null]}
          >
            <Text style={styles.selectAllText}>{multiSelect.allSelected ? '取消全选' : '全选'}</Text>
          </Pressable>
          <SortMenuButton
            filterIcon={viewMode === 'detail' ? 'list-outline' : 'grid-outline'}
            hasActiveFilters={viewMode === 'detail'}
            onChange={setSortOrder}
            onFilterPress={() => setViewMode(viewMode === 'detail' ? 'grid' : 'detail')}
            orderBy={sortOrder}
          />
        </View>
        {viewMode === 'detail' ? (
          <View {...swipeSelection.panHandlers} style={styles.detailList}>
            {images.map((image) => (
              <AssetDetailRow
                image={image}
                key={image.id}
                onLayout={(event) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}
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
                onLayout={(event) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}
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
  );
  const aiFavoritesContent = (
    <PageStateBlock
      emptyDescription="在 AI 回复下点亮星标后，这里会展示收藏消息。"
      emptyIconName="star-outline"
      emptyTitle="还没有收藏 AI 消息"
      errorMessage={aiFavoriteErrorMessage}
      isEmpty={!aiFavoritesLoading && aiMessages.length === 0}
      loading={aiFavoritesLoading}
      loadingDescription="正在读取本地 AI 消息收藏。"
      loadingTitle="正在读取收藏"
      onRetry={reloadAiFavorites}
    >
      <View style={styles.aiFavoriteList}>
        {aiMessages.map((favorite) => (
          <Pressable
            accessibilityLabel={`打开收藏消息，来自${favorite.threadTitle}`}
            accessibilityRole="button"
            key={favorite.id}
            onPress={() => onOpenAiMessageFavorite(favorite)}
            style={({ pressed }) => [styles.aiFavoriteRow, pressed && styles.pressed]}
          >
            <View style={styles.aiFavoriteHeader}>
              <Text numberOfLines={1} style={styles.aiFavoriteThread}>{favorite.threadTitle}</Text>
              <Text style={styles.aiFavoriteRole}>AI</Text>
            </View>
            <Text numberOfLines={3} style={styles.aiFavoriteSnippet}>{favorite.snippet || favorite.content}</Text>
            <Text numberOfLines={1} style={styles.aiFavoriteMeta}>
              {favorite.messageVersionIndex && favorite.versionTotal > 1 ? `版本 ${favorite.messageVersionIndex}/${favorite.versionTotal} · ` : ''}
              {new Date(favorite.createdAt).toLocaleDateString()}
            </Text>
          </Pressable>
        ))}
      </View>
    </PageStateBlock>
  );
  return (
    <ScreenScaffold
      backgroundVariant="gallery"
      decorativeTitle="Favorites"
      footer={footer}
      onBack={onBack}
      onScroll={swipeSelection.onScroll}
      scrollViewRef={scrollViewRef}
      scrollable
      title="收藏"
    >
      <View style={styles.summary}>
        <Text numberOfLines={1} style={styles.subtitle}>
          {favoriteMode === 'ai' ? 'AI 消息收藏' : hasActiveFilters ? '筛选结果' : '全部收藏'}
        </Text>
        <Text numberOfLines={1} style={styles.countText}>
          {favoriteMode === 'ai' ? `${aiMessages.length} 条` : `${images.length} 张`}
        </Text>
      </View>
      <View style={styles.favoriteModeTabs}>
        <Pressable onPress={() => setFavoriteMode('images')} style={({ pressed }) => [styles.favoriteModeTab, favoriteMode === 'images' ? styles.favoriteModeTabActive : null, pressed && styles.pressed]}>
          <Text style={[styles.favoriteModeText, favoriteMode === 'images' ? styles.favoriteModeTextActive : null]}>图片</Text>
        </Pressable>
        <Pressable onPress={() => setFavoriteMode('ai')} style={({ pressed }) => [styles.favoriteModeTab, favoriteMode === 'ai' ? styles.favoriteModeTabActive : null, pressed && styles.pressed]}>
          <Text style={[styles.favoriteModeText, favoriteMode === 'ai' ? styles.favoriteModeTextActive : null]}>AI 消息</Text>
        </Pressable>
      </View>
      {favoriteMode === 'images' ? (
        <View style={styles.filterBarWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
            <FilterMenuButton active={activeFilters.ipIds.length > 0} label={`IP${activeFilters.ipIds.length > 0 ? ` ${activeFilters.ipIds.length}` : ''}`} onPress={() => setActiveFilterDropdown((current) => (current === 'ip' ? null : 'ip'))} />
            <FilterMenuButton active={activeFilters.aspectRatio != null || activeFilters.size != null} label="尺寸" onPress={() => setActiveFilterDropdown((current) => (current === 'size' ? null : 'size'))} />
            <FilterMenuButton active={activeFilters.groupIds.length > 0} label={`分组${activeFilters.groupIds.length > 0 ? ` ${activeFilters.groupIds.length}` : ''}`} onPress={() => setActiveFilterDropdown((current) => (current === 'group' ? null : 'group'))} />
            <FilterMenuButton active={activeFilters.tagIds.length > 0} label={`标签${activeFilters.tagIds.length > 0 ? ` ${activeFilters.tagIds.length}` : ''}`} onPress={() => setActiveFilterDropdown((current) => (current === 'tag' ? null : 'tag'))} />
            {hasActiveFilters ? (
              <Pressable onPress={() => setActiveFilters(EMPTY_FAVORITE_FILTERS)} style={({ pressed }) => [styles.clearFilterPill, pressed && styles.pressed]}>
                <Text style={styles.clearFilterText}>清空</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <Text numberOfLines={1} style={styles.filterStatus}>
            {hasActiveFilters ? `已选 ${activeFilterLabels.length} 个条件：${filterLabel}` : '未设置筛选'}
          </Text>
          {activeFilterDropdown ? (
            <FilterDrawer
              mode={getFavoriteFilterMode(activeFilterDropdown)}
              onClear={() => clearFilterGroup(activeFilterDropdown)}
              title={getFavoriteFilterTitle(activeFilterDropdown)}
            >
              {activeFilterDropdown === 'ip' ? (
                <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
                  {ips.map((ip) => (
                    <FilterOptionRow key={ip.id} label={ip.name} selected={activeFilters.ipIds.includes(ip.id)} onPress={() => toggleIpFilter(ip.id)} />
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
              {activeFilterDropdown === 'group' ? (
                <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
                  {groups.map((group) => (
                    <FilterOptionRow key={group.id} label={group.name} selected={activeFilters.groupIds.includes(group.id)} onPress={() => toggleGroupFilter(group.id)} />
                  ))}
                </ScrollView>
              ) : null}
              {activeFilterDropdown === 'tag' ? (
                <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
                  {tags.map((tag) => (
                    <FilterOptionRow key={tag.id} label={`#${tag.name}`} selected={activeFilters.tagIds.includes(tag.id)} onPress={() => toggleTagFilter(tag.id)} />
                  ))}
                </ScrollView>
              ) : null}
            </FilterDrawer>
          ) : null}
        </View>
      ) : null}

      {favoriteMode === 'ai' ? aiFavoritesContent : imageFavoritesContent}
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

function getFavoriteFilterTitle(filter: FavoriteFilterDropdown) {
  if (filter === 'ip') return 'IP 筛选';
  if (filter === 'size') return '尺寸筛选';
  if (filter === 'group') return '分组筛选';
  return '标签筛选';
}

function getFavoriteFilterMode(filter: FavoriteFilterDropdown): '多选' | '单选' {
  return filter === 'size' ? '单选' : '多选';
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    maxWidth: '100%',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  subtitle: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  countText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  detailList: {
    gap: rhythm.listCardGap,
  },
  filterBarWrap: {
    gap: spacing[2],
    marginTop: spacing[1],
  },
  favoriteModeTabs: {
    alignSelf: 'stretch',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    padding: spacing[1],
  },
  favoriteModeTab: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  favoriteModeTabActive: {
    backgroundColor: colors.primary.weak,
  },
  favoriteModeText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  favoriteModeTextActive: {
    color: colors.primary.active,
  },
  aiFavoriteList: {
    gap: rhythm.listCardGap,
  },
  aiFavoriteRow: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  aiFavoriteHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  aiFavoriteThread: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    flex: 1,
    fontWeight: '700',
  },
  aiFavoriteRole: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '800',
  },
  aiFavoriteSnippet: {
    ...typography.textStyles.body,
    color: colors.text.primary,
    lineHeight: 21,
  },
  aiFavoriteMeta: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
  filterBar: {
    flexGrow: 1,
    gap: spacing[2],
    justifyContent: 'center',
    paddingHorizontal: spacing[1],
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
    textAlign: 'center',
    paddingHorizontal: spacing[1],
    paddingTop: 2,
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
  gridHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
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
