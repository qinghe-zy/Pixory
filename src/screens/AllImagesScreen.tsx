import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { FlatList, PanResponder, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { AssetDetailRow } from '../components/AssetDetailRow';
import { AssetFilterDrawer } from '../components/AssetFilterDrawer';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { Header } from '../components/Header';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { GallerySkeleton } from '../components/GallerySkeleton';
import { VirtualizedAssetCollection } from '../components/VirtualizedAssetCollection';
import { SortMenuButton, IMAGE_SORT_OPTIONS } from '../components/SortMenuButton';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageListItem, type IpRecord, type PixorySpace, type TagUsageItem } from '../database';
import { colors, componentTokens, layout, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import { useMediaCursorCollection } from '../hooks/useMediaCursorCollection';
import { useSwipeGridSelection } from '../hooks/useSwipeGridSelection';
import { useAssetListPreferences } from '../services/assetListPreferences';
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
  const [forceSelectionMode, setForceSelectionMode] = useState(false);
  const { viewMode, sortOrder, setViewMode, setSortOrder } = useAssetListPreferences(space, 'createdAtDesc');
  const SORT_OPTIONS = IMAGE_SORT_OPTIONS;
  const scrollViewRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const { data, isLoading: isMetadataLoading, errorMessage: metadataErrorMessage, reload: reloadMetadata } = useScreenLoad<{
    ip: IpRecord | null;
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

      return { ip, groups, tags };
      });
    },
    [ipId, refreshToken, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取图片库失败：${message}`;
      },
      initialData: { ip: null, groups: [], tags: [] },
      deferUntilInteractions: true,
    }
  );

  const mediaRequest = {
    aspectRatio: activeFilters.aspectRatio ?? undefined,
    favoritesOnly: activeFilters.favorite || undefined,
    groupIds: activeFilters.groupIds,
    imageIds: undefined as number[] | undefined,
    ipId,
    maxFileSize: activeFilters.size?.maxFileSize,
    mediaType: hasImageOnlyFilter(activeFilters) ? 'image' as const : 'all' as const,
    mimeType: activeFilters.mimeType ?? undefined,
    minFileSize: activeFilters.size?.minFileSize,
    orderBy: activeFilters.recentViewed ? 'lastViewedAtDesc' as const : sortOrder,
    recentlyViewedOnly: activeFilters.recentViewed || undefined,
    tagIds: activeFilters.tagIds,
    ungroupedOnly: activeFilters.ungrouped || undefined,
    untaggedOnly: activeFilters.untagged || undefined,
  };
  const { data: similarIds, isLoading: isSimilarityLoading, errorMessage: similarityErrorMessage, reload: reloadSimilarity } = useScreenLoad<number[] | null>(
    async () => activeFilters.similarDuplicate
      ? runWithDatabaseSpace(space, (db) => imageRepository.findSimilarImageIds(db, mediaRequest))
      : null,
    [activeFilters, ipId, refreshToken, space],
    { initialData: null, deferUntilInteractions: true }
  );
  const similarityKey = activeFilters.similarDuplicate
    ? similarIds == null ? 'pending' : `ready:${similarIds.length}:${similarIds[0] ?? 0}:${similarIds[similarIds.length - 1] ?? 0}`
    : 'off';
  const media = useMediaCursorCollection({
    formatError: (error) => `读取图片库失败：${error instanceof Error ? error.message : '未知错误'}`,
    request: { ...mediaRequest, imageIds: activeFilters.similarDuplicate ? similarIds ?? [] : undefined },
    requestKey: JSON.stringify([space, ipId, refreshToken, activeFilters, sortOrder, similarityKey]),
    space,
  });

  const ip = data?.ip ?? null;
  const images = media.items;
  const selectableAssets = images;
  const groups = data?.groups ?? [];
  const tags = data?.tags ?? [];
  const isLoading = isMetadataLoading || media.isLoading || (activeFilters.similarDuplicate && isSimilarityLoading);
  const errorMessage = metadataErrorMessage ?? similarityErrorMessage ?? media.errorMessage;
  const reload = () => {
    reloadMetadata();
    reloadSimilarity();
    media.reload();
  };
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

  
  
  
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;
  
  const compactHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [90, 110], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [90, 110], [5, 0], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  const heroStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [90, 110], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const scrollOffsetRef = useRef(0);
  
  const handleScrollJS = (y: number) => {
    scrollOffsetRef.current = y;
    const mockEvent = { nativeEvent: { contentOffset: { y } } } as any;
    swipeSelection.onScroll(mockEvent);
  };

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollY.value = event.contentOffset.y;
      runOnJS(handleScrollJS)(event.contentOffset.y);
    },
  });



  function handleOpenImage(imageId: number) {
    const asset = images.find((item) => item.id === imageId);
    if (multiSelect.isSelectionMode || forceSelectionMode) {
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
        ? {
            type: 'media-query',
            request: { ...mediaRequest, imageIds: activeFilters.similarDuplicate ? similarIds ?? [] : undefined },
            label: activeFilterLabel,
            space,
          }
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

  
  
  
  const rightAction = (
    <Pressable
      accessibilityLabel={commonButtonCopy.importImages}
      onPress={onImportImages}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
    >
      <Ionicons color={colors.text.title} name="add" size={24} />
    </Pressable>
  );

    const headingNode = (
    <Animated.View style={[{ paddingTop: statusBarHeight + 12, paddingBottom: 10, paddingHorizontal: layout.pagePaddingHorizontal, backgroundColor: '#FAFAFA' }, heroStyle]}>
      {/* Row 1: Title and Actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={{ fontFamily: Platform.OS === 'ios' ? 'PingFang SC' : 'sans-serif', fontSize: 24, fontWeight: 'bold', letterSpacing: -0.5, color: '#111827' }}>
            {ip ? `全部素材 · ${ip.name}` : '全部素材'}
          </Text>
          <Text style={{ fontFamily: Platform.OS === 'ios' ? 'PingFang SC' : 'sans-serif', fontSize: 12, fontWeight: '500', color: '#9CA3AF' }}>
            {images.length} 张素材
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable style={styles.importPillButton} onPress={onImportImages}>
            <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" color="#FFFFFF">
              <Path d="M12 4.5v15m7.5-7.5h-15" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={styles.importPillText}>导入</Text>
          </Pressable>
        </View>
      </View>

      {/* Row 2: Quick Filter Chips */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 16 }} style={{ flex: 1, marginRight: 4 }}>
          <Pressable onPress={() => setActiveFilters(EMPTY_FILTERS)} style={[styles.filterChip, !hasActiveFilters && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, !hasActiveFilters && styles.filterChipTextActive]}>全部</Text>
          </Pressable>
          
          <Pressable onPress={() => setActiveFilters(prev => ({...prev, favorite: !prev.favorite}))} style={[styles.filterChip, activeFilters.favorite && styles.filterChipActive]}>
            <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color={activeFilters.favorite ? '#FFFFFF' : '#6B7280'} style={{ marginRight: 4 }}>
              <Path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.601a.562.562 0 0 1 .321-.989l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={[styles.filterChipText, activeFilters.favorite && styles.filterChipTextActive]}>收藏</Text>
          </Pressable>

          {groups.map(group => (
             <Pressable key={group.id} onPress={() => toggleGroupFilter(group.id)} style={[styles.filterChip, activeFilters.groupIds.includes(group.id) && styles.filterChipActive]}>
               <Text style={[styles.filterChipText, activeFilters.groupIds.includes(group.id) && styles.filterChipTextActive]}>{group.name}</Text>
             </Pressable>
          ))}
        </ScrollView>

        <View style={{ backgroundColor: '#FAFAFA', paddingLeft: 6 }}>
          <Pressable style={styles.advancedFilterButton} onPress={() => setIsFilterDrawerOpen(true)}>
            <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color="#4B5563">
              <Path d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={styles.advancedFilterText}>筛选</Text>
          </Pressable>
        </View>
      </View>

      {/* Row 3: Sort & Density Controls */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.06)' }}>
        <SortMenuButton
          onChange={setSortOrder}
          orderBy={sortOrder}
        />
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.densityToggle}>
            <Pressable onPress={() => setViewMode('grid')} style={[styles.densityIconButton, viewMode === 'grid' ? styles.densityIconButtonActive : null]}>
               <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color={viewMode === 'grid' ? '#111827' : '#9CA3AF'}>
                 <Path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" strokeLinecap="round" strokeLinejoin="round" />
               </Svg>
            </Pressable>
            <Pressable onPress={() => setViewMode('justified')} style={[styles.densityIconButton, viewMode === 'justified' ? styles.densityIconButtonActive : null]}>
               <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color={viewMode === 'justified' ? '#111827' : '#9CA3AF'}>
                 <Path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" strokeLinecap="round" strokeLinejoin="round" />
               </Svg>
            </Pressable>
          </View>
          
          {multiSelect.isSelectionMode || forceSelectionMode ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable onPress={() => { multiSelect.clearSelection(); setForceSelectionMode(false); }} style={styles.selectionModeTextButton}>
                <Text style={styles.selectionModeText}>完成</Text>
              </Pressable>
              <Pressable disabled={selectableAssets.length === 0} onPress={multiSelect.toggleSelectAll} style={styles.selectionModeTextButton}>
                <Text style={styles.selectionModeText}>{multiSelect.allSelected ? '取消全选' : '全选'}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setForceSelectionMode(true)} style={styles.selectionModeTextButton}>
              <Text style={styles.selectionModeText}>选择</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.host}>
    <ScreenScaffold
      backgroundColor="#FFFFFF"
      footer={footer}
      footerNaked={true}
      showHeader={false}
      scrollable={false}
      fullScreen={true}
      contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, flex: 1 }}
    >
      {/* Compact Sticky Header */}
      <Animated.View style={[
        { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: statusBarHeight, height: statusBarHeight + 48 },
        compactHeaderStyle
      ]} pointerEvents="box-none">
        <BlurView intensity={space === 'personal' ? 60 : 80} style={StyleSheet.absoluteFill} tint={space === 'personal' ? 'dark' : 'light'} />
        {/* iOS Top Status Bar Background */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: statusBarHeight, backgroundColor: '#FFFFFF' }} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: '#FAFAFA', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', letterSpacing: -0.2 }}>
              {ip ? `${ip.name}` : '全部素材'}
            </Text>
            <View style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>
              <Text style={{ fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '500', color: '#4B5563', lineHeight: 12 }}>
                {images.length}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <SortMenuButton
              onChange={setSortOrder}
              orderBy={sortOrder}
              compact={true}
            />
            <Pressable onPress={() => setIsFilterDrawerOpen(true)} style={{ height: 28, width: 28, borderRadius: 999, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
              <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color="#4B5563">
                <Path d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
            <Pressable onPress={onImportImages} style={{ height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#111827', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" color="#FFFFFF">
                <Path d="M12 4.5v15m7.5-7.5h-15" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={{ fontSize: 11, fontWeight: '500', color: '#FFFFFF', letterSpacing: 0.5 }}>导入</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>

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
        loadingComponent={<GallerySkeleton />}
        emptyActionLabel={commonButtonCopy.importImages}
        emptyDescription={
          !hasActiveFilters
            ? '上传第一张图片后，就可以在这里按分组和标签进行管理'
            : '这个筛选条件下暂时没有素材。'
        }
        emptyTitle={!hasActiveFilters ? '您的个人素材库' : commonEmptyStateCopy.noSearchResultTitle}
        onEmptyAction={onImportImages}
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地索引加载完成后，这里会展示当前 IP 下的全部素材。"
        loadingTitle="正在读取素材库"
      >
      <VirtualizedAssetCollection
          headerComponent={headingNode}
          images={images}
          isLoadingMore={media.isLoadingMore}
          listRef={scrollViewRef}
          onEndReached={media.loadMore}
          onItemMeasured={swipeSelection.registerMeasuredItemLayout}
          onScroll={handleScroll}
          panHandlers={swipeSelection.panHandlers}
          scrollOffsetRef={scrollOffsetRef}
          renderAsset={(image, index, fillCell) => viewMode === 'detail' ? (
              <AssetDetailRow
                image={image}
                onLongPress={handleImageLongPress}
                onPress={handleOpenImage}
                selected={multiSelect.selectedImageIds.includes(image.id)}
                isSelectionMode={multiSelect.isSelectionMode || forceSelectionMode}
                space={space}
              />
          ) : (
              <ThumbnailTile
                aspectRatio={viewMode === 'justified' ? 'auto' : componentTokens.thumbnail.squareAspectRatio}
                containerStyle={fillCell ? styles.fillCell : undefined}
                image={image}
                index={index}
                onLongPress={handleImageLongPress}
                onPress={handleOpenImage}
                selected={multiSelect.selectedImageIds.includes(image.id)}
                isSelectionMode={multiSelect.isSelectionMode || forceSelectionMode}
                space={space}
              />
          )}
          viewMode={viewMode}
        />
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

function hasImageOnlyFilter(filters: AllImagesFilterState): boolean {
  return Boolean(
    filters.aspectRatio ||
    filters.mimeType?.startsWith('image/') ||
    filters.similarDuplicate
  );
}

const styles = StyleSheet.create({
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
  },
  stickyBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
  },
  stickyTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    letterSpacing: 0.5,
  },
  stickyCount: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
    marginLeft: 8,
  },
  importPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  importPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: '#111827',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
    elevation: 2,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  advancedFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  advancedFilterText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  densityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 2,
    borderRadius: 8,
    gap: 4,
  },
  densityIconButton: {
    padding: 4,
    borderRadius: 6,
  },
  densityIconButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  selectionModeTextButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  selectionModeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
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
    color: colors.text.title,
    marginBottom: 4,
  },
  gallerySubtitle: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
  },
  galleryActions: {
    zIndex: 10,
    elevation: 10,
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
  fillCell: {
    width: '100%',
  },
});




