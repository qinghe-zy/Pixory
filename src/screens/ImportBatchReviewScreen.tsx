import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import {
  imageRepository,
  importBatchRepository,
  type ImageListItem,
  type ImportBatchSummary,
} from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { formatDateTime } from '../utils/formatters';

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
  | 'large-file';

interface ImportBatchReviewScreenProps {
  ipId: number;
  importBatchId: number | null;
  imageIds: number[];
  refreshToken: number;
  onBack: () => void;
  onImportAgain: () => void;
  onQuickOrganize: () => void;
  onBatchOrganize: (imageIds: number[]) => void;
  onOpenImageDetail: (imageId: number) => void;
}

export function ImportBatchReviewScreen({
  ipId,
  importBatchId,
  imageIds,
  refreshToken,
  onBack,
  onImportAgain,
  onQuickOrganize,
  onBatchOrganize,
  onOpenImageDetail,
}: ImportBatchReviewScreenProps) {
  const [activePile, setActivePile] = useState<BatchPileKey>('all');
  const [activePrefix, setActivePrefix] = useState<string | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    summary: ImportBatchSummary | null;
    images: ImageListItem[];
  }>(
    async () => {
      const [summary, images] = await Promise.all([
        importBatchId != null ? importBatchRepository.findSummaryById(importBatchId) : Promise.resolve(null),
        importBatchId != null ? imageRepository.findByImportBatchId(importBatchId) : imageRepository.findByIds(imageIds),
      ]);

      return { summary, images };
    },
    [imageIds.join(','), importBatchId, ipId, refreshToken],
    {
      initialData: { summary: null, images: [] },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取本次导入失败：${message}`;
      },
    }
  );

  const images = data?.images ?? [];
  const summary = data?.summary ?? null;
  const stats = useMemo(() => buildBatchStats(images, summary), [images, summary]);
  const piles = useMemo(() => buildPileOptions(images, stats), [images, stats]);
  const prefixPiles = useMemo(() => buildPrefixPiles(images), [images]);
  const filteredImages = useMemo(() => {
    const pileImages = filterImagesByPile(images, activePile);
    return activePrefix ? pileImages.filter((image) => getFilenamePrefix(image.originalFilename) === activePrefix) : pileImages;
  }, [activePile, activePrefix, images]);
  const organizationPercent = stats.totalCount > 0 ? Math.round((stats.organizedCount / stats.totalCount) * 100) : 100;

  return (
    <ScreenScaffold decorativeTitle="Batch" onBack={onBack} scrollable title="本次导入">
      <View style={styles.heroPanel}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons color={colors.primary.active} name="file-tray-stacked-outline" size={21} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>本次导入 {stats.totalCount} 张</Text>
            <Text numberOfLines={1} style={styles.heroMeta}>
              {summary ? `${summary.ipName} · ${formatDateTime(summary.createdAt)}` : '导入结果整理台'}
            </Text>
          </View>
          <Text style={styles.percentText}>{organizationPercent}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${organizationPercent}%` }]} />
        </View>
        <View style={styles.metricGrid}>
          <Metric label="已整理" value={stats.organizedCount} />
          <Metric label="未分组" value={stats.ungroupedCount} />
          <Metric label="无标签" value={stats.untaggedCount} />
          <Metric label="疑似重复" value={stats.suspectedDuplicateCount} />
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="进入批量整理" onPress={() => onBatchOrganize(filteredImages.map((image) => image.id))} />
        <View style={styles.secondaryActions}>
          <View style={styles.secondaryAction}>
            <PrimaryButton label="连续整理" onPress={onQuickOrganize} variant="outline" />
          </View>
          <View style={styles.secondaryAction}>
            <PrimaryButton label="再导入一批" onPress={onImportAgain} variant="ghost" />
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
              .slice(0, 6)
              .map((pile) => (
                <PilePreviewRow
                  active={activePile === pile.key && activePrefix == null}
                  images={filterImagesByPile(images, pile.key).slice(0, 4)}
                  key={pile.key}
                  label={pile.label}
                  count={pile.count}
                  onPress={() => {
                    setActivePile(pile.key);
                    setActivePrefix(null);
                  }}
                />
              ))}
          </View>
          <View style={styles.pileWrap}>
            {piles.map((pile) => (
              <PileChip
                active={activePile === pile.key}
                count={pile.count}
                key={pile.key}
                label={pile.label}
                onPress={() => {
                  setActivePile(pile.key);
                  setActivePrefix(null);
                }}
              />
            ))}
          </View>
          {prefixPiles.length > 0 ? (
            <View style={styles.prefixPanel}>
              <Text style={styles.prefixTitle}>文件名前缀</Text>
              <View style={styles.prefixWrap}>
                {prefixPiles.map((pile) => (
                  <Pressable
                    key={pile.prefix}
                    onPress={() => setActivePrefix((current) => current === pile.prefix ? null : pile.prefix)}
                    style={({ pressed }) => [styles.prefixChip, activePrefix === pile.prefix ? styles.prefixChipActive : null, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={1} style={[styles.prefixChipText, activePrefix === pile.prefix ? styles.prefixChipTextActive : null]}>
                      {pile.prefix} · {pile.count}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.gridHeader}>
          <Text style={styles.sectionTitle}>{activePrefix ?? getPileLabel(activePile)} {filteredImages.length} 张</Text>
          <Pressable onPress={() => onBatchOrganize(filteredImages.map((image) => image.id))} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            <Text style={styles.textButtonLabel}>整理这些</Text>
          </Pressable>
        </View>
        <View style={styles.grid}>
          {filteredImages.map((image) => (
            <ThumbnailTile image={image} key={image.id} onPress={onOpenImageDetail} />
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

function PilePreviewRow({
  active,
  count,
  images,
  label,
  onPress,
}: {
  active: boolean;
  count: number;
  images: ImageListItem[];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pilePreviewRow, active ? styles.pilePreviewRowActive : null, pressed && styles.pressed]}>
      <View style={styles.pilePreviewCopy}>
        <Text style={[styles.pilePreviewTitle, active ? styles.pilePreviewTitleActive : null]}>{label}</Text>
        <Text style={styles.pilePreviewMeta}>{count} 张</Text>
      </View>
      <View style={styles.pilePreviewImages}>
        {images.map((image) => (
          <View key={image.id} style={styles.pilePreviewThumb}>
            {image.thumbnailFileUri ? (
              <Image resizeMode="cover" source={{ uri: image.thumbnailFileUri }} style={styles.pilePreviewImage} />
            ) : (
              <View style={styles.pilePreviewFallback}>
                <Ionicons color={colors.text.tertiary} name="image-outline" size={13} />
              </View>
            )}
          </View>
        ))}
      </View>
      <Ionicons color={colors.text.secondary} name="chevron-forward" size={15} />
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function PileChip({
  active,
  count,
  label,
  onPress,
}: {
  active: boolean;
  count: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pileChip, active ? styles.pileChipActive : null, pressed && styles.pressed]}>
      <Text style={[styles.pileLabel, active ? styles.pileLabelActive : null]}>{label}</Text>
      <Text style={[styles.pileCount, active ? styles.pileLabelActive : null]}>{count}</Text>
    </Pressable>
  );
}

function buildBatchStats(images: ImageListItem[], summary: ImportBatchSummary | null) {
  const totalCount = summary?.successCount ?? images.length;
  const ungroupedCount = summary?.ungroupedCount ?? images.filter((image) => image.groupCount === 0).length;
  const untaggedCount = summary?.untaggedCount ?? images.filter((image) => image.tagCount === 0).length;
  const noNoteCount = summary?.noNoteCount ?? images.filter((image) => !image.note).length;

  return {
    totalCount,
    organizedCount:
      summary?.organizedCount ?? images.filter((image) => image.groupCount > 0 && image.tagCount > 0).length,
    ungroupedCount,
    untaggedCount,
    noNoteCount,
    suspectedDuplicateCount: summary?.suspectedDuplicateCount ?? countSuspectedDuplicates(images),
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
  ];
}

function filterImagesByPile(images: ImageListItem[], pile: BatchPileKey): ImageListItem[] {
  if (pile === 'ungrouped') {
    return images.filter((image) => image.groupCount === 0);
  }
  if (pile === 'untagged') {
    return images.filter((image) => image.tagCount === 0);
  }
  if (pile === 'no-note') {
    return images.filter((image) => !image.note);
  }
  if (pile === 'landscape') {
    return images.filter((image) => image.width > image.height && image.width / image.height < 2.2);
  }
  if (pile === 'portrait') {
    return images.filter((image) => image.height > image.width && image.height / image.width < 2.2);
  }
  if (pile === 'square') {
    return images.filter((image) => Math.abs(image.width - image.height) <= Math.max(image.width, image.height) * 0.08);
  }
  if (pile === 'panorama') {
    return images.filter((image) => Math.max(image.width / image.height, image.height / image.width) >= 2.2);
  }
  if (pile === 'large') {
    return images.filter((image) => image.width >= 2400 || image.height >= 2400);
  }
  if (pile === 'small') {
    return images.filter((image) => image.width <= 900 && image.height <= 900);
  }
  if (pile === 'large-file') {
    return images.filter((image) => image.fileSize >= 5 * 1024 * 1024);
  }
  return images;
}

function buildPrefixPiles(images: ImageListItem[]): Array<{ prefix: string; count: number }> {
  const counts = new Map<string, number>();
  for (const image of images) {
    const prefix = getFilenamePrefix(image.originalFilename);
    if (!prefix) {
      continue;
    }
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
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
  if (!normalized || normalized.length < 2 || /^\d+$/.test(normalized)) {
    return baseName.slice(0, 6) || null;
  }
  return normalized;
}

function countSuspectedDuplicates(images: ImageListItem[]): number {
  const counts = new Map<string, number>();
  for (const image of images) {
    const key = `${image.width}x${image.height}:${image.fileSize}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

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
  };
  return labels[pile];
}

const styles = StyleSheet.create({
  heroPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    padding: spacing[3],
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  heroTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  heroMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  percentText: {
    ...typography.textStyles.statNumber,
    color: colors.primary.active,
  },
  progressTrack: {
    backgroundColor: colors.background.input,
    borderRadius: radius.pill,
    height: 7,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.primary.default,
    borderRadius: radius.pill,
    height: '100%',
  },
  metricGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metric: {
    gap: spacing[1],
    width: '24%',
  },
  metricValue: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    textAlign: 'center',
  },
  metricLabel: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  actions: {
    gap: spacing[2],
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  secondaryAction: {
    flex: 1,
  },
  filterBlock: {
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  pileOverview: {
    gap: spacing[2],
  },
  pilePreviewRow: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 58,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  pilePreviewRowActive: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.hover,
  },
  pilePreviewCopy: {
    gap: spacing[1],
    width: 72,
  },
  pilePreviewTitle: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '700',
  },
  pilePreviewTitleActive: {
    color: colors.primary.active,
  },
  pilePreviewMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  pilePreviewImages: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing[1],
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  pilePreviewThumb: {
    aspectRatio: 1,
    backgroundColor: colors.background.empty,
    borderColor: colors.border.subtle,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 38,
    overflow: 'hidden',
    width: '22%',
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
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
  },
  pileWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  pileChip: {
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
  pileChipActive: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.hover,
  },
  pileLabel: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    fontWeight: '500',
  },
  pileCount: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  pileLabelActive: {
    color: colors.primary.active,
  },
  prefixPanel: {
    gap: spacing[2],
    paddingTop: spacing[1],
  },
  prefixTitle: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  prefixWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  prefixChip: {
    backgroundColor: colors.background.tag,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    maxWidth: '48%',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  prefixChipActive: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.hover,
  },
  prefixChipText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  prefixChipTextActive: {
    color: colors.primary.active,
    fontWeight: '600',
  },
  gridHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  textButton: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  textButtonLabel: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  pressed: {
    opacity: 0.82,
  },
});
