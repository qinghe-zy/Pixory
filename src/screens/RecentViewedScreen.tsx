import { useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { AssetDetailRow } from '../components/AssetDetailRow';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SortMenuButton, IMAGE_SORT_OPTIONS } from '../components/SortMenuButton';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, runWithDatabaseSpace, type ImageListItem, type PixorySpace } from '../database';
import { colors, componentTokens, radius, rhythm, spacing, typography } from '../design/tokens';
import { useToast } from '../components/AppToast';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import { useSwipeGridSelection } from '../hooks/useSwipeGridSelection';
import { useAssetListPreferences } from '../services/assetListPreferences';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

interface RecentViewedScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onStartBatchManagement: (ipId: number, imageId: number) => void;
}

const SORT_OPTIONS = IMAGE_SORT_OPTIONS;

export function RecentViewedScreen({
  space = 'normal',
  refreshToken,
  onBack,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: RecentViewedScreenProps) {
  const { showToast } = useToast();
  const { viewMode, sortOrder, setViewMode, setSortOrder } = useAssetListPreferences(space, 'lastViewedAtDesc');
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [isClearingRecentViewed, setIsClearingRecentViewed] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const { data: images = [], isLoading, errorMessage, reload } = useScreenLoad<ImageListItem[]>(
    () => runWithDatabaseSpace(space, (db) => imageRepository.findRecentViewed(db, 60, { mediaType: 'all', orderBy: sortOrder })),
    [refreshToken, sortOrder, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取最近查看失败：${message}`;
      },
      initialData: [],
    }
  );
  const selectableAssets = images;
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

    onOpenImage(imageId, { type: 'recent-viewed', space });
  }

  function handleImageLongPress(image: ImageListItem) {
    swipeSelection.beginSwipeSelection(image.id);
  }

  async function handleConfirmClearRecentViewed() {
    setIsClearingRecentViewed(true);
    try {
      const clearedCount = await runWithDatabaseSpace(space, (db) => imageRepository.clearRecentViewed(db));
      multiSelect.clearSelection();
      setClearConfirmVisible(false);
      reload();
      showToast(clearedCount > 0 ? `已清除 ${clearedCount} 条最近查看记录` : '没有需要清除的最近查看记录');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`清除记录失败：${message}`);
    } finally {
      setIsClearingRecentViewed(false);
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
    <ScreenScaffold
      backgroundVariant="gallery"
      decorativeTitle="Recent"
      footer={footer}
      onBack={onBack}
      onScroll={swipeSelection.onScroll}
      scrollViewRef={scrollViewRef}
      scrollable
      title="最近查看"
    >
      <View style={styles.summaryRow}>
        <View style={styles.summary}>
          <Text numberOfLines={1} style={styles.subtitle}>
            最近打开
          </Text>
          <Text numberOfLines={1} style={styles.countText}>
            {images.length} 个
          </Text>
        </View>
        <Pressable
          disabled={images.length === 0 || isClearingRecentViewed}
          onPress={() => setClearConfirmVisible(true)}
          style={({ pressed }) => [
            styles.clearRecentButton,
            (images.length === 0 || isClearingRecentViewed) ? styles.disabled : null,
            pressed && images.length > 0 && !isClearingRecentViewed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.clearRecentText}>清除记录</Text>
        </Pressable>
      </View>

      <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="打开过图片详情后，这里会展示最近查看过的图片。"
        emptyIconName="time-outline"
        emptyTitle="还没有最近查看"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地最近查看索引读取完成后，这里会展示最近查看过的图片。"
        loadingTitle="正在读取最近查看"
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
      <AppDialog
        message="只会清除最近查看时间，不会删除图片、视频、原图、缩略图、分组、标签或备注。"
        onClose={() => {
          if (!isClearingRecentViewed) {
            setClearConfirmVisible(false);
          }
        }}
        onPrimary={() => {
          void handleConfirmClearRecentViewed();
        }}
        primaryDisabled={isClearingRecentViewed}
        primaryLabel={isClearingRecentViewed ? '清除中…' : '确认清除'}
        title="清除最近查看记录"
        visible={clearConfirmVisible}
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  summary: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexGrow: 1,
    flexShrink: 1,
    gap: spacing[2],
    maxWidth: '100%',
    minWidth: 148,
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
  clearRecentButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  clearRecentText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  detailList: {
    gap: rhythm.listCardGap,
  },
  gridHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  gridTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
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
    opacity: 0.44,
  },
  pressed: {
    opacity: 0.78,
  },
});
