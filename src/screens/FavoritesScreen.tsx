import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useAnimatedProps, useSharedValue, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { AssetDetailRow } from '../components/AssetDetailRow';
import { AssetFilterDrawer } from '../components/AssetFilterDrawer';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SortMenuButton, IMAGE_SORT_OPTIONS } from '../components/SortMenuButton';
import { GallerySkeleton } from '../components/GallerySkeleton';
import { GalleryNormalHeader, GalleryCompactHeader, galleryHeaderStyles, FilterIcon, GridIcon, JustifiedIcon } from '../components/GalleryHeaders';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { VirtualizedAssetCollection } from '../components/VirtualizedAssetCollection';
import { listFavoriteAssistantMessagePage, type AiMessageFavoriteListItem } from '../ai/aiChatService';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageAspectRatioFilter, type ImageListItem, type IpRecord, type PixorySpace, type TagUsageItem } from '../database';
import { colors, componentTokens, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import { useMediaCursorCollection } from '../hooks/useMediaCursorCollection';
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
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [favoriteMode, setFavoriteMode] = useState<'images' | 'ai'>('images');
  const [aiMessages, setAiMessages] = useState<AiMessageFavoriteListItem[]>([]);
  const [aiFavoriteErrorMessage, setAiFavoriteErrorMessage] = useState<string | null>(null);
  const [aiFavoritesLoading, setAiFavoritesLoading] = useState(false);
  const [aiFavoritesLoadingMore, setAiFavoritesLoadingMore] = useState(false);
  const [aiFavoritesHasMore, setAiFavoritesHasMore] = useState(false);
  const [aiFavoritesCursor, setAiFavoritesCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const { viewMode, sortOrder, setViewMode, setSortOrder } = useAssetListPreferences(space, 'createdAtDesc');
  const scrollViewRef = useRef<FlatList<ImageListItem> | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ips: IpRecord[];
    groups: GroupRecord[];
    tags: TagUsageItem[];
  }>(
    async () => {
      const [ips, groups, tags] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findAll(db),
        groupRepository.findAll(db),
        tagRepository.findUsageOverview(db),
      ]));
      return { ips, groups, tags };
    },
    [activeFilters, refreshToken, sortOrder, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取收藏图片失败：${message}`;
      },
      initialData: { ips: [], groups: [], tags: [] },
    }
  );
  const favoriteMediaRequest = {
    aspectRatio: activeFilters.aspectRatio ?? undefined,
    favoritesOnly: true,
    groupIds: activeFilters.groupIds,
    ipIds: activeFilters.ipIds,
    maxFileSize: activeFilters.size?.maxFileSize,
    mediaType: activeFilters.aspectRatio || activeFilters.size ? 'image' as const : 'all' as const,
    minFileSize: activeFilters.size?.minFileSize,
    orderBy: sortOrder,
    tagIds: activeFilters.tagIds,
  };
  const media = useMediaCursorCollection({
    formatError: (loadError) => `读取收藏图片失败：${loadError instanceof Error ? loadError.message : '未知错误'}`,
    request: favoriteMediaRequest,
    requestKey: JSON.stringify([space, refreshToken, activeFilters, sortOrder]),
    space,
  });
  const images = media.items;
  const combinedLoading = isLoading || media.isLoading;
  const combinedError = errorMessage ?? media.errorMessage;
  const reloadAll = () => {
    reload();
    media.reload();
  };
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
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;
  const scrollY = useSharedValue(0);
  const scrollOffsetRef = useRef(0);
  const compactHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [10, 30], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [10, 30], [5, 0], Extrapolation.CLAMP);
    const display = opacity > 0 ? 'flex' : 'none';
    return { opacity, transform: [{ translateY }], display };
  });
  const heroStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 30], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const handleScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollY.value = y;
    scrollOffsetRef.current = y;
    swipeSelection.onScroll(event);
  };

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
      const page = await listFavoriteAssistantMessagePage({ space });
      setAiMessages(page.items);
      setAiFavoritesCursor(page.cursor);
      setAiFavoritesHasMore(page.hasMore);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setAiFavoriteErrorMessage(`读取 AI 消息收藏失败：${message}`);
    } finally {
      setAiFavoritesLoading(false);
    }
  }, [space]);

  useEffect(() => {
    if (favoriteMode !== 'ai') return;
    void reloadAiFavorites();
  }, [favoriteMode, refreshToken, reloadAiFavorites]);

  const loadMoreAiFavorites = useCallback(() => {
    if (!aiFavoritesHasMore || aiFavoritesLoading || aiFavoritesLoadingMore || !aiFavoritesCursor) return;
    setAiFavoritesLoadingMore(true);
    void listFavoriteAssistantMessagePage({ space, cursor: aiFavoritesCursor })
      .then((page) => {
        setAiMessages((current) => {
          const existing = new Set(current.map((item) => item.id));
          return [...current, ...page.items.filter((item) => !existing.has(item.id))];
        });
        setAiFavoritesCursor(page.cursor);
        setAiFavoritesHasMore(page.hasMore);
      })
      .catch((loadError) => setAiFavoriteErrorMessage(loadError instanceof Error ? loadError.message : '加载更多收藏失败'))
      .finally(() => setAiFavoritesLoadingMore(false));
  }, [aiFavoritesCursor, aiFavoritesHasMore, aiFavoritesLoading, aiFavoritesLoadingMore, space]);

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
        ? { type: 'media-query', request: favoriteMediaRequest, label: filterLabel, space }
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



  const footer = favoriteMode === 'images' && multiSelect.isSelectionMode ? (
    <BatchImageOrganizePanel
      onChanged={reloadAll}
      onClearSelection={multiSelect.clearSelection}
      onDeleted={reloadAll}
      selectedImages={selectedAssets}
      space={space}
      totalCount={selectableAssets.length}
    />
  ) : undefined;
  const imageFavoritesContent = (
    <PageStateBlock
        loadingComponent={<GallerySkeleton />}
        emptyActionLabel={undefined}
        emptyDescription="给图片加星标后，这里会展示当前所有收藏图片。"
        emptyIconName="star-outline"
        emptyTitle="还没有收藏图片"
        errorMessage={combinedError}
        isEmpty={!combinedLoading && images.length === 0}
        loading={combinedLoading}
        loadingDescription="本地收藏索引读取完成后，这里会展示收藏图片。"
        loadingTitle="正在读取收藏图片"
        onRetry={reloadAll}
      >

        <VirtualizedAssetCollection
          contentContainerStyle={{}}
          scrollOffsetRef={scrollOffsetRef}
          headerComponent={
            <GalleryNormalHeader
              title=""
              count={undefined}
              animatedStyle={heroStyle}
              middleContent={undefined}
              bottomContent={undefined}
              topLeftActions={
                <View style={[styles.favoriteModeTabs, { padding: 3, minHeight: 32 }]}>
                  <Pressable onPress={() => setFavoriteMode('images')} style={({ pressed }) => [styles.favoriteModeTab, favoriteMode === 'images' ? { backgroundColor: '#111827' } : null, pressed && styles.pressed, { minHeight: 26, paddingHorizontal: 12 }]}>
                    <Text style={[styles.favoriteModeText, favoriteMode === 'images' ? { color: '#FFFFFF', fontWeight: '700' } : null, { fontSize: 13 }]}>图片</Text>
                  </Pressable>
                  <Pressable onPress={() => setFavoriteMode('ai')} style={({ pressed }) => [styles.favoriteModeTab, favoriteMode === 'ai' ? { backgroundColor: '#111827' } : null, pressed && styles.pressed, { minHeight: 26, paddingHorizontal: 12 }]}>
                    <Text style={[styles.favoriteModeText, favoriteMode === 'ai' ? { color: '#FFFFFF', fontWeight: '700' } : null, { fontSize: 13 }]}>AI</Text>
                  </Pressable>
                </View>
              }
              topRightActions={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>

                  <SortMenuButton compact={true} onChange={setSortOrder} orderBy={sortOrder} />

                  {favoriteMode === 'images' && (
                    multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0 ? (
                      <Pressable onPress={() => { multiSelect.clearSelection(); }} style={galleryHeaderStyles.selectionModeTextButton}>
                        <Text style={galleryHeaderStyles.selectionModeText}>完成</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => multiSelect.enterSelection(images[0]?.id ?? 0)} style={galleryHeaderStyles.selectionModeTextButton}>
                        <Text style={galleryHeaderStyles.selectionModeText}>选择</Text>
                      </Pressable>
                    )
                  )}

                  <Pressable style={galleryHeaderStyles.advancedFilterButton} onPress={() => setIsFilterDrawerOpen(true)}>
                    <FilterIcon color={hasActiveFilters ? '#111827' : '#4B5563'} />
                    <Text style={[galleryHeaderStyles.advancedFilterText, hasActiveFilters && { color: '#111827', fontWeight: '600' }]}>
                      {hasActiveFilters ? '已筛选' : '筛选'}
                    </Text>
                  </Pressable>
                </View>
              }
            />
          }
          images={images}
          isLoadingMore={media.isLoadingMore}
          listRef={scrollViewRef}
          onEndReached={media.loadMore}
          onItemMeasured={swipeSelection.registerMeasuredItemLayout}
          onScroll={handleScroll}
          panHandlers={swipeSelection.panHandlers}
          renderAsset={(image, index, fillCell) => viewMode === 'detail' ? (
              <AssetDetailRow
                image={image}
                onLongPress={() => handleImageLongPress(image)}
                onPress={handleOpenImage}
                selected={multiSelect.selectedImageIds.includes(image.id)}
                isSelectionMode={multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0}
                space={space}
                hideFavoriteBadge={true}
              />
          ) : (
              <ThumbnailTile
                aspectRatio={viewMode === 'justified' ? 'auto' : componentTokens.thumbnail.squareAspectRatio}
                containerStyle={fillCell ? styles.fillCell : undefined}
                image={image}
                index={index}
                onLongPress={() => handleImageLongPress(image)}
                onPress={handleOpenImage}
                selected={multiSelect.selectedImageIds.includes(image.id)}
                isSelectionMode={multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0}
                space={space}
                hideFavoriteBadge={true}
              />
          )}
          viewMode={viewMode}
        />
      </PageStateBlock>
  );
  const aiFavoritesContent = (
    <PageStateBlock
        loadingComponent={<GallerySkeleton />}
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
      <FlatList
        contentContainerStyle={styles.aiFavoriteList}
        data={aiMessages}
        keyExtractor={(favorite) => favorite.id}
        onScroll={handleScroll}
        ListHeaderComponent={
          <GalleryNormalHeader
            title=""
            count={undefined}
            animatedStyle={heroStyle}
            topLeftActions={
              <View style={[styles.favoriteModeTabs, { padding: 3, minHeight: 32 }]}>
                <Pressable onPress={() => setFavoriteMode('images')} style={({ pressed }) => [styles.favoriteModeTab, favoriteMode === 'images' ? { backgroundColor: '#111827' } : null, pressed && styles.pressed, { minHeight: 26, paddingHorizontal: 12 }]}>
                  <Text style={[styles.favoriteModeText, favoriteMode === 'images' ? { color: '#FFFFFF', fontWeight: '700' } : null, { fontSize: 13 }]}>图片</Text>
                </Pressable>
                <Pressable onPress={() => setFavoriteMode('ai')} style={({ pressed }) => [styles.favoriteModeTab, favoriteMode === 'ai' ? { backgroundColor: '#111827' } : null, pressed && styles.pressed, { minHeight: 26, paddingHorizontal: 12 }]}>
                  <Text style={[styles.favoriteModeText, favoriteMode === 'ai' ? { color: '#FFFFFF', fontWeight: '700' } : null, { fontSize: 13 }]}>AI</Text>
                </Pressable>
              </View>
            }
            topRightActions={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              </View>
            }
          />
        }
        ListFooterComponent={aiFavoritesLoadingMore ? <Text style={styles.aiFavoriteMeta}>正在加载更多…</Text> : null}
        onEndReached={loadMoreAiFavorites}
        onEndReachedThreshold={0.5}
        renderItem={({ item: favorite }) => (
          <Pressable
            accessibilityLabel={`打开收藏消息，来自${favorite.threadTitle}`}
            accessibilityRole="button"
            key={favorite.id}
            onPress={() => onOpenAiMessageFavorite(favorite)}
            style={({ pressed }) => [styles.aiFavoriteRow, pressed && styles.pressed]}
          >
            <View style={styles.aiFavoriteHeader}>
              {favorite.roleAvatarUri ? (
                <Image source={{ uri: favorite.roleAvatarUri }} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#F3F4F6' }} contentFit="cover" />
              ) : (
                <Ionicons name="chatbubble-ellipses-outline" size={14} color="#9CA3AF" />
              )}
              <Text numberOfLines={1} style={styles.aiFavoriteThread}>
                {favorite.roleName ? `${favorite.roleName} - ` : ''}{favorite.threadTitle || 'AI 对话'}
              </Text>
              <View style={styles.aiFavoriteRoleBadge}>
                <Text style={styles.aiFavoriteRole}>AI</Text>
              </View>
            </View>
            <Text numberOfLines={3} style={styles.aiFavoriteSnippet}>{favorite.snippet || favorite.content}</Text>
            <Text numberOfLines={1} style={styles.aiFavoriteMeta}>
              {favorite.messageVersionIndex && favorite.versionTotal > 1 ? `版本 ${favorite.messageVersionIndex}/${favorite.versionTotal} · ` : ''}
              {new Date(favorite.createdAt).toLocaleDateString()}
            </Text>
          </Pressable>
        )}
        windowSize={7}
      />
    </PageStateBlock>
  );
  return (
    <ScreenScaffold
      backgroundColor="#FFFFFF"
      footer={footer}
      footerNaked={true}
      showHeader={false}
      fullScreen={true}
      contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, flex: 1 }}
    >
      <GalleryCompactHeader
        title=""
        count={undefined}
        space={space}
        onBack={onBack}
        animatedStyle={compactHeaderStyle}
        leftActions={
          <View style={[styles.favoriteModeTabs, { padding: 3, minHeight: 32 }]}>
            <Pressable onPress={() => setFavoriteMode('images')} style={({ pressed }) => [styles.favoriteModeTab, favoriteMode === 'images' ? { backgroundColor: '#111827' } : null, pressed && styles.pressed, { minHeight: 26, paddingHorizontal: 12 }]}>
              <Text style={[styles.favoriteModeText, favoriteMode === 'images' ? { color: '#FFFFFF', fontWeight: '700' } : null, { fontSize: 13 }]}>图片</Text>
            </Pressable>
            <Pressable onPress={() => setFavoriteMode('ai')} style={({ pressed }) => [styles.favoriteModeTab, favoriteMode === 'ai' ? { backgroundColor: '#111827' } : null, pressed && styles.pressed, { minHeight: 26, paddingHorizontal: 12 }]}>
              <Text style={[styles.favoriteModeText, favoriteMode === 'ai' ? { color: '#FFFFFF', fontWeight: '700' } : null, { fontSize: 13 }]}>AI</Text>
            </Pressable>
          </View>
        }
        rightActions={
          favoriteMode === 'images' ? (
            <>
              {multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0 ? (
                <Pressable disabled={selectableAssets.length === 0} onPress={multiSelect.toggleSelectAll} style={galleryHeaderStyles.selectionModeTextButton}>
                  <Text style={galleryHeaderStyles.selectionModeText}>{multiSelect.allSelected ? '取消全选' : '全选'}</Text>
                </Pressable>
              ) : null}
              <SortMenuButton compact={true} onChange={setSortOrder} orderBy={sortOrder} />
              <Pressable style={galleryHeaderStyles.filterButton} onPress={() => setIsFilterDrawerOpen(true)}>
                <FilterIcon color={hasActiveFilters ? '#111827' : '#4B5563'} />
              </Pressable>
            </>
          ) : null
        }
      />

      <AssetFilterDrawer visible={isFilterDrawerOpen} onClose={() => setIsFilterDrawerOpen(false)}>
        <View style={styles.drawerSections}>
          <Text style={styles.drawerSectionTitle}>视图</Text>
          <View style={styles.filterOptionGrid}>
            <FilterOptionChip label="宫格展示" selected={viewMode === 'grid'} onPress={() => setViewMode('grid')} />
            <FilterOptionChip label="自适应排版" selected={viewMode === 'justified'} onPress={() => setViewMode('justified')} />
            <FilterOptionChip label="详细信息" selected={viewMode === 'detail'} onPress={() => setViewMode('detail')} />
          </View>
        </View>

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

        {ips.length > 0 && (
          <View style={styles.drawerSections}>
            <Text style={styles.drawerSectionTitle}>IP · 多选</Text>
            <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
              {ips.map((ip) => (
                <FilterOptionRow key={ip.id} label={ip.name} selected={activeFilters.ipIds.includes(ip.id)} onPress={() => toggleIpFilter(ip.id)} />
              ))}
            </ScrollView>
          </View>
        )}

        {groups.length > 0 && (
          <View style={styles.drawerSections}>
            <Text style={styles.drawerSectionTitle}>分组 · 多选</Text>
            <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
              {groups.map((group) => (
                <FilterOptionRow key={group.id} label={group.name} selected={activeFilters.groupIds.includes(group.id)} onPress={() => toggleGroupFilter(group.id)} />
              ))}
            </ScrollView>
          </View>
        )}

        {tags.length > 0 && (
          <View style={styles.drawerSections}>
            <Text style={styles.drawerSectionTitle}>标签 · 多选</Text>
            <ScrollView nestedScrollEnabled style={styles.filterDrawerList}>
              {tags.map((tag) => (
                <FilterOptionRow key={tag.id} label={`#${tag.name}`} selected={activeFilters.tagIds.includes(tag.id)} onPress={() => toggleTagFilter(tag.id)} />
              ))}
            </ScrollView>
          </View>
        )}
      </AssetFilterDrawer>

      {favoriteMode === 'ai' ? aiFavoritesContent : imageFavoritesContent}
    </ScreenScaffold>
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
  fillCell: {
    width: '100%',
  },
  detailList: {
    gap: rhythm.listCardGap,
  },
  filterBarWrap: {
    gap: spacing[2],
    marginTop: spacing[1],
  },
  favoriteModeTabs: {
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
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 64,
  },
  aiFavoriteRow: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  aiFavoriteHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  aiFavoriteThread: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
    fontWeight: '500',
  },
  aiFavoriteRoleBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiFavoriteRole: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#4B5563',
    fontWeight: '600',
  },
  aiFavoriteSnippet: {
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 22,
    fontWeight: '400',
    marginBottom: 6,
  },
  aiFavoriteMeta: {
    fontSize: 11,
    color: '#9CA3AF',
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
  gridHeader: {
    zIndex: 10,
    elevation: 10,
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





