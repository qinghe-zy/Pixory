import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { GalleryNormalHeader, GalleryCompactHeader, galleryHeaderStyles, FilterIcon, GridIcon, JustifiedIcon } from '../components/GalleryHeaders';
import Animated, { useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SecureImage } from '../components/SecureImage';
import { VirtualizedAssetCollection } from '../components/VirtualizedAssetCollection';
import { imageRepository, ipRepository, runWithDatabaseSpace, type ImageListItem, type IpRecord, type PixorySpace } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useMediaCursorCollection } from '../hooks/useMediaCursorCollection';
import { clearTrash, clearTrashItems, TRASH_RETENTION_DAYS } from '../services/trashService';
import { formatDateTime, formatDuration, formatFileSize } from '../utils/formatters';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import { useToast } from '../components/AppToast';
import { useAssetListPreferences } from '../services/assetListPreferences';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { componentTokens } from '../design/tokens';

interface TrashScreenProps {
  space: PixorySpace;
  refreshToken?: number;
  onBack: () => void;
  onChanged: () => void;
  storageMode?: boolean;
  titleSlot?: React.ReactNode;
}

export function TrashScreen({ space, refreshToken, onBack, onChanged, storageMode = false, titleSlot }: TrashScreenProps) {
  const { showToast } = useToast();
  const { viewMode, setViewMode } = useAssetListPreferences(space, 'createdAtDesc');
  const [activeIpId, setActiveIpId] = useState<number | null>(null);
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState(false);
  const [isClearDialogVisible, setIsClearDialogVisible] = useState(false);
  const [isClearSelectedDialogVisible, setIsClearSelectedDialogVisible] = useState(false);
  const listRef = useRef<FlatList<ImageListItem> | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ips: IpRecord[];
    summary: { count: number; totalBytes: number };
  }>(
    async () => {
      const [ips, summary] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findAllIncludingDeleted(db),
        imageRepository.getFilteredStorageSummary(db, {
          deletedOnly: true,
          ipId: activeIpId ?? undefined,
          mediaType: 'all',
        }),
      ]));
      return { ips, summary };
    },
    [activeIpId, refreshToken, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取回收站失败：${message}`;
      },
      initialData: { ips: [], summary: { count: 0, totalBytes: 0 } },
    }
  );
  const storageSortMode = storageMode ? 'fileSizeDesc' : 'deletedAtDesc';
  const media = useMediaCursorCollection({
    formatError: (loadError) => `读取回收站失败：${loadError instanceof Error ? loadError.message : '未知错误'}`,
    request: {
      deletedOnly: true,
      ipId: activeIpId ?? undefined,
      mediaType: 'all',
      orderBy: storageSortMode,
    },
    requestKey: JSON.stringify([space, activeIpId, refreshToken, storageSortMode]),
    space,
  });
  const images = media.items;
  const visibleImages = images;
  const ips = data?.ips ?? [];
  const trashBytes = data?.summary.totalBytes ?? 0;
  const trashCount = data?.summary.count ?? 0;
  const combinedLoading = isLoading || media.isLoading;
  const combinedError = errorMessage ?? media.errorMessage;
  const reloadAll = () => {
    reload();
    media.reload();
  };
  const multiSelect = useImageMultiSelect(useMemo(() => visibleImages.map((image) => image.id), [visibleImages]));
  const selectedImages = useMemo(
    () => visibleImages.filter((image) => multiSelect.selectedImageIds.includes(image.id)),
    [visibleImages, multiSelect.selectedImageIds]
  );

  function handleRestore(imageId: number) {
    void (async () => {
      try {
        const restoredCount = await runWithDatabaseSpace(space, (db) => imageRepository.restoreMany(db, [imageId]));
        if (restoredCount === 0) {
          throw new Error('没有可恢复的素材。');
        }

        onChanged();
        reloadAll();
        showToast('已恢复');
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showToast(`恢复失败：${message}`);
      }
    })();
  }

  function handleRestoreSelected() {
    const ids = [...multiSelect.selectedImageIds];
    void (async () => {
      try {
        const restoredCount = await runWithDatabaseSpace(space, (db) => imageRepository.restoreMany(db, ids));
        if (restoredCount === 0) {
          throw new Error('没有可恢复的素材。');
        }
        multiSelect.clearSelection();
        onChanged();
        reloadAll();
        showToast(`已恢复 ${restoredCount} 个素材`);
      } catch (error) {
        showToast(error instanceof Error ? `恢复失败：${error.message}` : '恢复失败');
      }
    })();
  }

  function confirmClearTrash() {
    setIsClearDialogVisible(false);
    void (async () => {
      try {
        const result = await clearTrash(space);
        multiSelect.clearSelection();
        onChanged();
        reloadAll();

        if (result.databaseDeletedCount !== result.requestedCount) {
          showToast(`数据库已删除 ${result.databaseDeletedCount}/${result.requestedCount} 张，本地文件已保留待核验`);
          return;
        }

        if (result.fileFailures.length > 0) {
          showToast(`数据库已清空 ${result.databaseDeletedCount} 张，${result.fileFailures.length} 个文件需手动核验`);
          return;
        }

        showToast(`已永久删除 ${result.databaseDeletedCount} 张，清理 ${result.fileDeletedCount} 个文件`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showToast(`清空回收站失败：${message}`);
      }
    })();
  }

  function confirmClearSelected() {
    const ids = [...multiSelect.selectedImageIds];
    setIsClearSelectedDialogVisible(false);
    void (async () => {
      try {
        const result = await clearTrashItems(ids, space);
        multiSelect.clearSelection();
        onChanged();
        reloadAll();
        if (result.fileFailures.length > 0) {
          showToast(`已删除 ${result.databaseDeletedCount} 条记录，${result.fileFailures.length} 个文件需核验`);
          return;
        }
        showToast(`已永久删除 ${result.databaseDeletedCount} 个素材`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showToast(`彻底清理失败：${message}`);
      }
    })();
  }

  const scrollY = useSharedValue(0);
  const scrollOffsetRef = useRef(0);
  const compactHeaderStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(scrollY.value, [10, 30], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(scrollY.value, [10, 30], [-5, 0], Extrapolation.CLAMP) }],
    };
  });

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollY.value = y;
    scrollOffsetRef.current = y;
  }, [scrollY]);

  const rightAction = (
    <>
      <Pressable onPress={() => setViewMode(viewMode === 'grid' ? 'justified' : viewMode === 'justified' ? 'detail' : 'grid')} style={galleryHeaderStyles.densityToggle}>
        <View style={[galleryHeaderStyles.densityIconButton, viewMode === 'grid' && galleryHeaderStyles.densityIconButtonActive]}><GridIcon color={viewMode === 'grid' ? '#111827' : '#9CA3AF'} /></View>
        <View style={[galleryHeaderStyles.densityIconButton, viewMode === 'justified' && galleryHeaderStyles.densityIconButtonActive]}><JustifiedIcon color={viewMode === 'justified' ? '#111827' : '#9CA3AF'} /></View>
        <View style={[galleryHeaderStyles.densityIconButton, viewMode === 'detail' && galleryHeaderStyles.densityIconButtonActive]}>
           <Ionicons color={viewMode === 'detail' ? '#111827' : '#9CA3AF'} name="list-outline" size={14} />
        </View>
      </Pressable>
      {trashCount > 0 && (
        <Pressable onPress={() => setIsClearDialogVisible(true)} style={galleryHeaderStyles.dangerPillButton}>
          <Text style={galleryHeaderStyles.dangerPillText}>清空</Text>
        </Pressable>
      )}
    </>
  );

  const headerComponent = (
    <GalleryNormalHeader
      title="回收站"
      count={trashCount}
      topRightActions={rightAction}
      middleContent={
        <Pressable onPress={() => setIsFilterSheetVisible(true)} style={galleryHeaderStyles.advancedFilterButton}>
          <FilterIcon />
          <Text style={galleryHeaderStyles.advancedFilterText}>{activeIpId == null ? '全部 IP' : ips.find((ip) => ip.id === activeIpId)?.name ?? '当前 IP'}</Text>
        </Pressable>
      }
      bottomContent={
        storageMode ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B7280' }}>占用空间：{formatFileSize(trashBytes)}</Text>
          </View>
        ) : <View />
      }
    />
  );
  const footer = multiSelect.isSelectionMode ? (
    <View style={styles.footerPanel}>
      <Text style={styles.footerTitle}>已选择 {selectedImages.length} 张</Text>
      <PrimaryButton label="批量恢复" onPress={handleRestoreSelected} />
      <PrimaryButton label="彻底清理所选" onPress={() => setIsClearSelectedDialogVisible(true)} variant="outline" />
      <PrimaryButton label="取消选择" onPress={multiSelect.clearSelection} variant="ghost" />
    </View>
  ) : undefined;

  return (
    <>
      <ScreenScaffold
        contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, flex: 1 }} backgroundColor="#FFFFFF" decorativeTitle={titleSlot ? undefined : "Trash"} footer={footer} onBack={onBack} showHeader={false} fullScreen={true}>
        <GalleryCompactHeader
          title={titleSlot ? '' : "回收站"}
          count={trashCount}
          space={space}
          onBack={onBack}
          animatedStyle={compactHeaderStyle}
          rightActions={rightAction}
        />
        <PageStateBlock
          emptyActionLabel={undefined}
          emptyDescription="当前没有处于软删除状态的图片或视频。"
        emptyIconName="trash-outline"
        emptyTitle="回收站是空的"
        errorMessage={combinedError}
        isEmpty={!combinedLoading && images.length === 0}
        loading={combinedLoading}
        loadingDescription="本地回收站索引读取完成后，这里会展示已软删除图片和视频。"
        loadingTitle="正在读取回收站"
        onRetry={reloadAll}
      >
        <VirtualizedAssetCollection
          headerComponent={headerComponent}
          onScroll={handleScroll}
          scrollOffsetRef={scrollOffsetRef}
          images={visibleImages}
          isLoadingMore={media.isLoadingMore}
          listRef={listRef}
          onEndReached={media.loadMore}
          renderAsset={(image, index, fillCell) => viewMode === 'detail' ? (
            <Pressable
              onLongPress={() => multiSelect.enterSelection(image.id)}
              onPress={() => multiSelect.isSelectionMode ? multiSelect.toggleSelection(image.id) : undefined}
              style={({ pressed }) => [styles.itemCard, multiSelect.selectedImageIds.includes(image.id) ? styles.selectedItem : null, pressed && styles.pressed]}
            >
              <View style={styles.previewWrap}>
                {image.thumbnailFileUri ? (
                  <SecureImage contentFit="cover" space={space} style={styles.previewImage} uri={image.thumbnailFileUri} />
                ) : (
                  <View style={styles.previewFallback}>
                    <Ionicons color={colors.text.secondary} name={image.mediaType === 'video' ? 'videocam-outline' : 'image-outline'} size={22} />
                  </View>
                )}
                {image.mediaType === 'video' ? (
                  <View style={styles.mediaBadge}>
                    <Ionicons color={colors.text.inverse} name="play" size={10} />
                    <Text style={styles.mediaBadgeText}>{formatDuration(image.durationMs)}</Text>
                  </View>
                ) : null}
                <View style={styles.remainingBadge}>
                  <Text style={styles.remainingText}>{getTrashStatusLabel(image.deletedAt)}</Text>
                </View>
              </View>
              <View style={styles.itemBody}>
                <Text numberOfLines={2} style={styles.itemTitle}>
                  {image.originalFilename}
                </Text>
                <Text style={styles.itemMeta}>
                  {formatFileSize(image.fileSize)} · {image.deletedAt ? formatDateTime(image.deletedAt) : '未知时间'}
                </Text>
                <Pressable onPress={() => handleRestore(image.id)} style={({ pressed }) => [styles.restoreChip, pressed && styles.pressed]}>
                  <Text style={styles.restoreText}>恢复</Text>
                </Pressable>
              </View>
            </Pressable>
          ) : (
            <ThumbnailTile
              aspectRatio={viewMode === 'justified' ? 'auto' : componentTokens.thumbnail.squareAspectRatio}
              containerStyle={fillCell ? { flex: 1, minHeight: 0 } : undefined}
              image={image}
              index={index}
              onLongPress={() => multiSelect.enterSelection(image.id)}
              onPress={() => multiSelect.isSelectionMode ? multiSelect.toggleSelection(image.id) : undefined}
              selected={multiSelect.selectedImageIds.includes(image.id)}
              isSelectionMode={multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0}
              space={space}
            />
          )}
          viewMode={viewMode}
        />
      </PageStateBlock>
    </ScreenScaffold>
    <AppActionSheet
      items={[
        { key: 'all', label: '全部 IP', icon: 'albums-outline', onPress: () => setActiveIpId(null) },
        ...ips.map((ip) => ({ key: String(ip.id), label: ip.name, icon: 'archive-outline' as const, onPress: () => setActiveIpId(ip.id) })),
      ]}
      onClose={() => setIsFilterSheetVisible(false)}
      title="按 IP 筛选"
      visible={isFilterSheetVisible}
    />
    <AppDialog
      danger
      message="清空后会永久删除回收站中的原图、缩略图和数据库记录，这个操作不可撤销。"
      onClose={() => setIsClearDialogVisible(false)}
      onPrimary={confirmClearTrash}
      primaryLabel="永久删除"
      title="确认清空回收站"
      visible={isClearDialogVisible}
    />
    <AppDialog
      danger
      message={`将永久删除所选 ${selectedImages.length} 个素材的数据库记录和 Pixory 私有文件。此操作不可撤销。`}
      onClose={() => setIsClearSelectedDialogVisible(false)}
      onPrimary={confirmClearSelected}
      primaryLabel="彻底清理"
      title="彻底清理所选"
      visible={isClearSelectedDialogVisible}
    />
    </>
  );
}

function getTrashStatusLabel(deletedAt: string | null) {
  if (!deletedAt) {
    return '文件保留';
  }

  const deletedTime = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedTime)) {
    return '文件保留';
  }

  const elapsedDays = Math.floor((Date.now() - deletedTime) / (24 * 60 * 60 * 1000));
  const remainingDays = Math.max(0, TRASH_RETENTION_DAYS - elapsedDays);
  return `距永久删除 ${remainingDays} 天`;
}

const styles = StyleSheet.create({
  notice: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  subtitle: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    flex: 1,
    minWidth: 0,
  },
  list: {
    gap: rhythm.listCardGap,
  },
  storageNotice: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  storageNoticeTitle: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '700',
  },
  filterButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 32,
    paddingHorizontal: spacing[3],
  },
  filterText: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    fontWeight: '600',
  },
  itemCard: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[2],
  },
  selectedItem: {
    borderColor: colors.primary.default,
    backgroundColor: colors.primary.weak,
  },
  previewWrap: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    aspectRatio: 1,
    overflow: 'hidden',
    width: 72,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  remainingBadge: {
    backgroundColor: colors.overlay.softSurface,
    borderRadius: radius.sm,
    bottom: spacing[1],
    left: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    position: 'absolute',
    right: spacing[1],
  },
  mediaBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(30, 38, 29, 0.72)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    position: 'absolute',
    right: spacing[1],
    top: spacing[1],
  },
  mediaBadgeText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '700',
  },
  remainingText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '600',
    textAlign: 'center',
  },
  itemBody: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  itemTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.body,
  },
  itemMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: {
    opacity: 0.82,
  },
  restoreChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    marginTop: spacing[1],
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing[1],
  },
  restoreText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '600',
  },
  footerPanel: {
    gap: spacing[2],
  },
  footerTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
});





