import { useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, Dimensions, ScrollView } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { BatchImageOrganizePanel } from '../components/BatchImageOrganizePanel';
import { GalleryCompactHeader, galleryHeaderStyles } from '../components/GalleryHeaders';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SortMenuButton, IMAGE_SORT_OPTIONS } from '../components/SortMenuButton';
import { GallerySkeleton } from '../components/GallerySkeleton';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { imageRepository, runWithDatabaseSpace, type ImageListItem, type PixorySpace } from '../database';
import { colors, componentTokens, radius, rhythm, spacing, typography, layout } from '../design/tokens';
import { computeJustifiedLayout, JUSTIFIED_GAP } from '../utils/justifiedLayout';
import { JustifiedRowView } from '../components/JustifiedRowView';
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
  onRefreshed: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number, context?: ImageViewerContext) => void;
  onStartBatchManagement: (ipId: number, imageId: number) => void;
}

const SORT_OPTIONS = IMAGE_SORT_OPTIONS;

export function RecentViewedScreen({
  space = 'normal',
  refreshToken,
  onBack,
  onRefreshed,
  onOpenImage,
  onOpenImageDetail,
  onStartBatchManagement,
}: RecentViewedScreenProps) {
  const { showToast } = useToast();
  const { sortOrder, setSortOrder } = useAssetListPreferences(space, 'lastViewedAtDesc');
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
      onRefreshed();
      showToast(clearedCount > 0 ? `已清除 ${clearedCount} 条最近查看记录` : '没有需要清除的最近查看记录');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`清除记录失败：${message}`);
    } finally {
      setIsClearingRecentViewed(false);
    }
  }

  const justifiedRows = useMemo(() => {
    if (!images || images.length === 0) return [];
    const windowWidth = Dimensions.get('window').width;
    const contentWidth = windowWidth - layout.pagePaddingHorizontal * 2;
    return computeJustifiedLayout(images, { containerWidth: contentWidth });
  }, [images]);

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
    <View style={styles.host}>
      <ScreenScaffold contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, flex: 1 }}
        backgroundVariant="gallery"
        decorativeTitle="Recent"
        footer={footer}
        footerNaked={true}
        showHeader={false}
        scrollable={false}
        fullScreen={true}
      >
        <GalleryCompactHeader
          title="最近查看"
          count={images.length}
          space={space}
          onBack={onBack}
          staticMode={true}
          rightActions={
            <>
              {multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0 ? (
                <Pressable disabled={selectableAssets.length === 0} onPress={multiSelect.toggleSelectAll} style={galleryHeaderStyles.selectionModeTextButton}>
                  <Text style={galleryHeaderStyles.selectionModeText}>{multiSelect.allSelected ? '取消全选' : '全选'}</Text>
                </Pressable>
              ) : null}
              <SortMenuButton compact={true} onChange={setSortOrder} orderBy={sortOrder} />
              <Pressable
                disabled={images.length === 0 || isClearingRecentViewed}
                onPress={() => setClearConfirmVisible(true)}
                style={({ pressed }) => [
                  galleryHeaderStyles.secondaryPillButton,
                  (images.length === 0 || isClearingRecentViewed) ? styles.disabled : null,
                  pressed && images.length > 0 && !isClearingRecentViewed ? styles.pressed : null,
                ]}
              >
                <Text style={galleryHeaderStyles.secondaryPillText}>清除记录</Text>
              </Pressable>
            </>
          }
        />

        <ScrollView
          ref={scrollViewRef}
          onScroll={swipeSelection.onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          <PageStateBlock
            loadingComponent={<GallerySkeleton />}
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

        <View {...swipeSelection.panHandlers}>
          {justifiedRows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', gap: JUSTIFIED_GAP, marginBottom: rowIndex < justifiedRows.length - 1 ? JUSTIFIED_GAP : 0 }}>
              <JustifiedRowView
                gap={JUSTIFIED_GAP}
                row={row}
                renderCell={(itemId: number | string, cellWidth: number, cellHeight: number) => {
                  const image = images.find((img) => img.id === itemId);
                  if (!image) return null;
                  return (
                    <View key={itemId} style={{ width: cellWidth, height: cellHeight, overflow: 'hidden' }} onLayout={(event) => swipeSelection.registerItemLayout(image.id, event.nativeEvent.layout)}>
                      <ThumbnailTile
                        aspectRatio="auto"
                        containerStyle={{ flex: 1, minHeight: 0 }}
                        image={image}
                        onLongPress={() => handleImageLongPress(image)}
                        onPress={handleOpenImage}
                        selected={multiSelect.selectedImageIds.includes(image.id)}
                        isSelectionMode={multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0}
                        space={space}
                      />
                    </View>
                  );
                }}
              />
            </View>
          ))}
        </View>
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
        </ScrollView>
      </ScreenScaffold>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: '#FAFAFA', // gallery background color
  },
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

  gridHeader: {
    zIndex: 10,
    elevation: 10,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  gridTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },

  selectAllButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
    backgroundColor: colors.background.surface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.subtle,
  },
  selectAllText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.secondary,
    fontSize: 13,
  },

  disabled: {
    opacity: 0.44,
  },
  pressed: {
    opacity: 0.78,
  },
});
