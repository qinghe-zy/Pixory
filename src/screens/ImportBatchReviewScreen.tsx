import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppActionSheet, type AppActionSheetItem } from '../components/AppActionSheet';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SecureImage } from '../components/SecureImage';
import { ThumbnailTile } from '../components/ThumbnailTile';
import {
  imageRepository,
  importBatchRepository,
  runWithDatabaseSpace,
  type ImageListItem,
  type ImportBatchItemRecord,
  type ImportBatchSummary,
  type PixorySpace,
} from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { formatDateTime } from '../utils/formatters';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

type BatchPileKey =
  | 'all'
  | 'ungrouped'
  | 'untagged'
  | 'no-note'
  | 'landscape'
  | 'portrait'
  | 'square'
  | 'panorama'
  | 'large'
  | 'small'
  | 'large-file'
  | 'same-size'
  | 'filename-prefix'
  | 'suspected-duplicate';

export type BatchInitialMode = 'idle' | 'replace-group' | 'add-tags' | 'apply-template';

interface ImportBatchReviewScreenProps {
  ipId: number;
  space?: PixorySpace;
  importBatchId: number | null;
  imageIds: number[];
  refreshToken: number;
  onBack: () => void;
  onImportAgain: () => void;
  onQuickOrganize: (importBatchId?: number | null) => void;
  onBatchOrganize: (imageIds: number[], initialMode?: BatchInitialMode) => void;
  onOpenDuplicateReview: (importBatchId: number) => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
}

export function ImportBatchReviewScreen({
  ipId,
  space = 'normal',
  importBatchId,
  imageIds,
  refreshToken,
  onBack,
  onImportAgain,
  onQuickOrganize,
  onBatchOrganize,
  onOpenDuplicateReview,
  onOpenImage,
  onOpenImageDetail,
}: ImportBatchReviewScreenProps) {
  const [activePile, setActivePile] = useState<BatchPileKey>('all');
  const [activePrefix, setActivePrefix] = useState<string | null>(null);
  const [actionPile, setActionPile] = useState<{ key: BatchPileKey; label: string; imageIds: number[] } | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    summary: ImportBatchSummary | null;
    images: ImageListItem[];
    items: ImportBatchItemRecord[];
  }>(
    async () => {
      const [summary, images, items] = await runWithDatabaseSpace(space, (db) => Promise.all([
        importBatchId != null ? importBatchRepository.findSummaryById(db, importBatchId) : Promise.resolve(null),
        importBatchId != null ? imageRepository.findByImportBatchId(db, importBatchId, { mediaType: 'all' }) : imageRepository.findByIds(db, imageIds, { mediaType: 'all' }),
        importBatchId != null ? importBatchRepository.findItemsByBatchId(db, importBatchId) : Promise.resolve([]),
      ]));

      return { summary, images, items };
    },
    [imageIds.join(','), importBatchId, ipId, refreshToken, space],
    {
      initialData: { summary: null, images: [], items: [] },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取本次导入失败：${message}`;
      },
    }
  );

  const images = data?.images ?? [];
  const batchItems = data?.items ?? [];
  const summary = data?.summary ?? null;
  const stats = useMemo(() => buildBatchStats(images, summary), [images, summary]);
  const piles = useMemo(() => buildPileOptions(images, stats), [images, stats]);
  const prefixPiles = useMemo(() => buildPrefixPiles(images), [images]);
  const filteredImages = useMemo(() => {
    const pileImages = filterImagesByPile(images, activePile);
    return activePrefix ? pileImages.filter((image) => getFilenamePrefix(image.originalFilename) === activePrefix) : pileImages;
  }, [activePile, activePrefix, images]);
  const filteredImageAssetIds = useMemo(() => getImageAssetIds(filteredImages), [filteredImages]);
  const organizationPercent = stats.totalCount > 0 ? Math.round((stats.organizedCount / stats.totalCount) * 100) : 100;
  const suggestions = useMemo(() => buildSuggestionCards(stats, importBatchId), [importBatchId, stats]);
  const actionSheetItems: AppActionSheetItem[] = actionPile
    ? [
        {
          key: 'tags',
          label: `给这 ${actionPile.imageIds.length} 张图片加标签`,
          icon: 'pricetags-outline',
          onPress: () => onBatchOrganize(actionPile.imageIds, 'add-tags'),
        },
        {
          key: 'template',
          label: `套用模板到这 ${actionPile.imageIds.length} 张图片`,
          icon: 'albums-outline',
          onPress: () => onBatchOrganize(actionPile.imageIds, 'apply-template'),
        },
        ...(actionPile.key === 'suspected-duplicate' && importBatchId != null
          ? [{
              key: 'duplicate',
              label: '查看疑似重复',
              icon: 'copy-outline' as const,
              onPress: () => onOpenDuplicateReview(importBatchId),
            }]
          : []),
      ]
    : [];

  function handleImagePress(imageId: number) {
    const asset = filteredImages.find(i => i.id === imageId);
    if (asset?.mediaType === 'video') {
      onOpenImageDetail(imageId);
      return;
    }
    const context: ImageViewerContext = importBatchId != null
      ? { type: 'import-batch', ipId, importBatchId, space }
      : { type: 'image-scope', imageIds: filteredImages.map(i => i.id), space, label: '导入结果' };
    onOpenImage(imageId, context);
  }

  return (
    <>
      <ScreenScaffold backgroundColor="#f9f9f9" decorativeTitle="Batch" onBack={onBack} scrollable title="本次导入">
        <View style={styles.heroPanel}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons color="#1a1c1c" name="file-tray-stacked-outline" size={21} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>本次导入 {stats.totalCount} 张</Text>
            </View>
          </View>
        </View>

        <PageStateBlock
          emptyDescription="导入批次里没有可展示图片，可能已经被移动到回收站。"
          emptyIconName="images-outline"
          emptyTitle="暂无导入图片"
          errorMessage={errorMessage}
          isEmpty={!isLoading && images.length === 0}
          loading={isLoading}
          loadingDescription="正在读取本地 SQLite 中的导入批次和图片。"
          loadingTitle="读取本次导入"
          onRetry={reload}
        >
          <View style={styles.filterBlock}>
            <Text style={styles.sectionTitle}>自动分堆</Text>
            <View style={styles.pileOverview}>
              {piles
                .filter((pile) => pile.key !== 'all' && pile.count > 0)
                .slice(0, 8)
                .map((pile) => {
                  const pileImages = filterImagesByPile(images, pile.key);
                  const pileImageAssetIds = getImageAssetIds(pileImages);
                  return (
                    <PilePreviewRow
                      active={activePile === pile.key && activePrefix == null}
                      count={pile.count}
                      images={pileImages.slice(0, 4)}
                      key={pile.key}
                      label={pile.label}
                      onMore={() => setActionPile({ key: pile.key, label: pile.label, imageIds: pileImageAssetIds })}
                      onOrganize={() => onBatchOrganize(pileImageAssetIds)}
                      onPress={() => {
                        setActivePile(pile.key);
                        setActivePrefix(null);
                      }}
                      space={space}
                    />
                  );
                })}
            </View>
          </View>
        </PageStateBlock>

        <View style={styles.actions}>
          <Pressable 
            disabled={filteredImageAssetIds.length === 0} 
            onPress={() => onBatchOrganize(filteredImageAssetIds)}
            style={[styles.blackButton, filteredImageAssetIds.length === 0 && styles.buttonDisabled]}
          >
            <Text style={styles.blackButtonText}>进入批量整理</Text>
          </Pressable>
          <View style={styles.secondaryActions}>
            <View style={styles.secondaryAction}>
              <Pressable onPress={() => onQuickOrganize(importBatchId)} style={styles.whiteButton}>
                <Text style={styles.whiteButtonText}>连续整理</Text>
              </Pressable>
            </View>
            <View style={styles.secondaryAction}>
              <Pressable onPress={onImportAgain} style={styles.whiteButton}>
                <Text style={styles.whiteButtonText}>再导入一批</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScreenScaffold>
      <AppActionSheet
        items={actionSheetItems}
        onClose={() => setActionPile(null)}
        title={actionPile?.label ?? ''}
        visible={actionPile != null}
      />
    </>
  );
}

function PilePreviewRow({
  active,
  count,
  images,
  label,
  onMore,
  onOrganize,
  onPress,
  space,
}: {
  active: boolean;
  count: number;
  images: ImageListItem[];
  label: string;
  onMore: () => void;
  onOrganize: () => void;
  onPress: () => void;
  space: PixorySpace;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pilePreviewRow, active && styles.pilePreviewRowActive, pressed && styles.pressed]}>
      <View style={styles.pilePreviewCopy}>
        <Text style={[styles.pilePreviewTitle, active && styles.pilePreviewTitleActive]}>{label}</Text>
        <Text style={[styles.pilePreviewMeta, active && styles.pilePreviewMetaActive]}>{count} 张</Text>
      </View>
      <View style={styles.pilePreviewImages}>
        {images.map((image) => (
          <View key={image.id} style={styles.pilePreviewThumb}>
            {image.thumbnailFileUri ? (
              <SecureImage contentFit="cover" space={space} style={styles.pilePreviewImage} uri={image.thumbnailFileUri as string} />
            ) : (
              <View style={styles.pilePreviewFallback}>
                <Ionicons color="#666" name="image-outline" size={13} />
              </View>
            )}
          </View>
        ))}
      </View>
      <Pressable onPress={onOrganize} style={({ pressed }) => [styles.organizeButton, active && styles.organizeButtonActive, pressed && styles.pressed]}>
        <Text style={[styles.organizeButtonText, active && styles.organizeButtonTextActive]}>管理这堆</Text>
      </Pressable>
      <Pressable hitSlop={8} onPress={onMore} style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}>
        <Ionicons color={active ? "#ffffff" : "#666666"} name="ellipsis-horizontal" size={17} />
      </Pressable>
    </Pressable>
  );
}





function buildBatchStats(images: ImageListItem[], summary: ImportBatchSummary | null) {
  const imageAssets = images.filter((image) => image.mediaType !== 'video');
  const videoCount = images.length - imageAssets.length;
  const totalCount = summary?.successCount ?? images.length;
  const ungroupedCount = summary?.ungroupedCount ?? images.filter((image) => image.groupCount === 0).length;
  const untaggedCount = summary?.untaggedCount ?? images.filter((image) => image.tagCount === 0).length;
  const noNoteCount = summary?.noNoteCount ?? images.filter((image) => !image.note).length;

  return {
    totalCount,
    organizedCount: summary?.organizedCount ?? images.filter((image) => image.groupCount > 0).length,
    ungroupedCount,
    untaggedCount,
    noNoteCount,
    suspectedDuplicateCount: summary?.suspectedDuplicateCount ?? countSuspectedDuplicates(imageAssets),
    videoCount,
  };
}

function buildPileOptions(images: ImageListItem[], stats: ReturnType<typeof buildBatchStats>) {
  return [
    { key: 'all' as const, label: '全部', count: images.length },
    { key: 'ungrouped' as const, label: '未分组', count: stats.ungroupedCount },
    { key: 'untagged' as const, label: '无标签', count: stats.untaggedCount },
    { key: 'no-note' as const, label: '无备注', count: stats.noNoteCount },
    { key: 'landscape' as const, label: '横图', count: filterImagesByPile(images, 'landscape').length },
    { key: 'portrait' as const, label: '竖图', count: filterImagesByPile(images, 'portrait').length },
    { key: 'square' as const, label: '方图', count: filterImagesByPile(images, 'square').length },
    { key: 'panorama' as const, label: '长图', count: filterImagesByPile(images, 'panorama').length },
    { key: 'large' as const, label: '大图', count: filterImagesByPile(images, 'large').length },
    { key: 'small' as const, label: '小图', count: filterImagesByPile(images, 'small').length },
    { key: 'large-file' as const, label: '大文件', count: filterImagesByPile(images, 'large-file').length },
    { key: 'same-size' as const, label: '同尺寸', count: filterImagesByPile(images, 'same-size').length },
    { key: 'filename-prefix' as const, label: '文件名前缀', count: filterImagesByPile(images, 'filename-prefix').length },
    { key: 'suspected-duplicate' as const, label: '疑似重复', count: stats.suspectedDuplicateCount },
  ];
}

function filterImagesByPile(images: ImageListItem[], pile: BatchPileKey): ImageListItem[] {
  if (pile === 'ungrouped') return images.filter((image) => image.groupCount === 0);
  if (pile === 'untagged') return images.filter((image) => image.tagCount === 0);
  if (pile === 'no-note') return images.filter((image) => !image.note);
  const imageAssets = images.filter((image) => image.mediaType !== 'video');
  if (pile === 'landscape') return imageAssets.filter((image) => image.width > image.height && image.width / image.height < 2.2);
  if (pile === 'portrait') return imageAssets.filter((image) => image.height > image.width && image.height / image.width < 2.2);
  if (pile === 'square') return imageAssets.filter((image) => Math.abs(image.width - image.height) <= Math.max(image.width, image.height) * 0.08);
  if (pile === 'panorama') return imageAssets.filter((image) => Math.max(image.width / image.height, image.height / image.width) >= 2.2);
  if (pile === 'large') return imageAssets.filter((image) => image.width >= 2400 || image.height >= 2400);
  if (pile === 'small') return imageAssets.filter((image) => image.width <= 900 && image.height <= 900);
  if (pile === 'large-file') return imageAssets.filter((image) => image.fileSize >= 5 * 1024 * 1024);
  if (pile === 'same-size') {
    const counts = countBy(imageAssets, (image) => `${image.width}x${image.height}`);
    return imageAssets.filter((image) => (counts.get(`${image.width}x${image.height}`) ?? 0) > 1);
  }
  if (pile === 'filename-prefix') {
    const counts = countBy(imageAssets, (image) => getFilenamePrefix(image.originalFilename) ?? '');
    return imageAssets.filter((image) => {
      const prefix = getFilenamePrefix(image.originalFilename);
      return prefix ? (counts.get(prefix) ?? 0) > 1 : false;
    });
  }
  if (pile === 'suspected-duplicate') {
    const counts = countBy(imageAssets, (image) => `${image.width}x${image.height}:${image.fileSize}`);
    return imageAssets.filter((image) => (counts.get(`${image.width}x${image.height}:${image.fileSize}`) ?? 0) > 1);
  }
  return images;
}

function getImageAssetIds(images: ImageListItem[]): number[] {
  return images.map((image) => image.id);
}

const WEAK_FILENAME_PREFIXES = new Set(['img', 'image', 'screenshot', 'screen', 'photo', 'pic', 'dsc']);

function buildPrefixPiles(images: ImageListItem[]): Array<{ prefix: string; count: number }> {
  const counts = new Map<string, number>();
  for (const image of images) {
    const prefix = getFilenamePrefix(image.originalFilename);
    if (prefix) {
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([prefix, count]) => ({ prefix, count }));
}

function getFilenamePrefix(filename: string): string | null {
  const baseName = filename.replace(/\.[^.]+$/, '');
  const [prefix] = baseName.split(/[_\-\s.]+/);
  const normalized = prefix?.trim();
  if (!normalized || normalized.length < 2 || /^\d+$/.test(normalized) || WEAK_FILENAME_PREFIXES.has(normalized.toLowerCase())) {
    return null;
  }
  return normalized;
}

function countBy<T>(items: T[], getKey: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function countSuspectedDuplicates(images: ImageListItem[]): number {
  const counts = countBy(images, (image) => `${image.width}x${image.height}:${image.fileSize}`);
  return [...counts.values()].filter((count) => count > 1).reduce((total, count) => total + count, 0);
}

function getPileLabel(pile: BatchPileKey): string {
  const labels: Record<BatchPileKey, string> = {
    all: '全部',
    ungrouped: '未分组',
    untagged: '无标签',
    'no-note': '无备注',
    landscape: '横图',
    portrait: '竖图',
    square: '方图',
    panorama: '长图',
    large: '大图',
    small: '小图',
    'large-file': '大文件',
    'same-size': '同尺寸',
    'filename-prefix': '文件名前缀',
    'suspected-duplicate': '疑似重复',
  };
  return labels[pile];
}

function buildSuggestionCards(stats: ReturnType<typeof buildBatchStats>, importBatchId: number | null) {
  const suggestions: Array<{ key: string; pile: BatchPileKey; title: string; meta: string }> = [];

  if (stats.ungroupedCount > 0) {
    suggestions.push({ key: 'ungrouped', pile: 'ungrouped', title: `还有 ${stats.ungroupedCount} 张未分组`, meta: '建议先整理这堆，确认一次再批量写入。' });
  }
  if (stats.untaggedCount > 0) {
    suggestions.push({ key: 'untagged', pile: 'untagged', title: `还有 ${stats.untaggedCount} 张无标签`, meta: '可以进入这堆后统一加标签或套模板。' });
  }
  if (stats.suspectedDuplicateCount > 0 && importBatchId != null) {
    suggestions.push({ key: 'duplicate', pile: 'suspected-duplicate', title: `疑似重复 ${stats.suspectedDuplicateCount} 张`, meta: '依据同尺寸和同文件大小，仅提示不自动删除。' });
  }

  return suggestions.slice(0, 3);
}

const styles = StyleSheet.create({
  heroPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  heroTitle: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 16,
    color: '#1a1c1c',
  },
  actions: {
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryAction: {
    flex: 1,
  },
  filterBlock: {
    gap: 12,
    marginBottom: 16,
  },
  pileOverview: {
    gap: 10,
  },
  pilePreviewRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pilePreviewRowActive: {
    backgroundColor: '#1a1c1c',
  },
  pilePreviewCopy: {
    gap: 2,
    width: 72,
  },
  pilePreviewTitle: {
    fontSize: 14,
    color: '#1a1c1c',
    fontWeight: '700',
  },
  pilePreviewTitleActive: {
    color: '#ffffff',
  },
  pilePreviewMeta: {
    fontSize: 12,
    color: '#666666',
  },
  pilePreviewMetaActive: {
    color: '#a0a0a0',
  },
  pilePreviewImages: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  pilePreviewThumb: {
    aspectRatio: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
    overflow: 'hidden',
    width: '21%',
    maxWidth: 34,
  },
  pilePreviewImage: {
    height: '100%',
    width: '100%',
  },
  pilePreviewFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  organizeButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  organizeButtonActive: {
    backgroundColor: '#333333',
  },
  organizeButtonText: {
    fontSize: 12,
    color: '#1a1c1c',
    fontWeight: '700',
  },
  organizeButtonTextActive: {
    color: '#ffffff',
  },
  moreButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1c1c',
    marginLeft: 4,
  },
  blackButton: {
    alignItems: 'center',
    backgroundColor: '#1a1c1c',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  blackButtonText: {
    color: '#ffffff',
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 14,
  },
  whiteButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e6e6e6',
    borderWidth: 1,
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
  },
  whiteButtonText: {
    color: '#1a1c1c',
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.82,
  },
});

