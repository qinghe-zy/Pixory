import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SecureImage } from '../components/SecureImage';
import type { ImageListItem, PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { getIpStorageDetail, type IpStorageDetail } from '../services/storageUsageService';
import { formatDateTime, formatDuration, formatFileSize } from '../utils/formatters';

type StorageSortMode = 'fileSizeDesc' | 'createdAtDesc' | 'groupNameAsc';

interface IpStorageDetailScreenProps {
  space?: PixorySpace;
  ipId: number;
  refreshToken: number;
  onBack: () => void;
  onOpenImage: (imageId: number) => void;
}

const SORT_OPTIONS: Array<{ key: StorageSortMode; label: string }> = [
  { key: 'fileSizeDesc', label: '按大小' },
  { key: 'createdAtDesc', label: '按时间' },
  { key: 'groupNameAsc', label: '按分组' },
];

export function IpStorageDetailScreen({ space = 'normal', ipId, refreshToken, onBack, onOpenImage }: IpStorageDetailScreenProps) {
  const [sortMode, setSortMode] = useState<StorageSortMode>('fileSizeDesc');
  const { data, isLoading, errorMessage, reload } = useScreenLoad<IpStorageDetail>(
    () => getIpStorageDetail(space, ipId, sortMode),
    [space, ipId, sortMode, refreshToken],
    {
      formatError: (error) => error instanceof Error ? `读取 IP 占用失败：${error.message}` : '读取 IP 占用失败',
    }
  );
  const images = data?.images ?? [];

  return (
    <ScreenScaffold backgroundVariant="archive" decorativeTitle="Storage" onBack={onBack} scrollable title={data?.ip.ipName ?? '素材占用'}>
      {data ? (
        <View style={styles.summary}>
          <Text style={styles.totalValue}>{formatFileSize(data.ip.totalBytes)}</Text>
          <View style={styles.breakdown}>
            <Metric label="图片" value={formatFileSize(data.ip.imageBytes)} />
            <Metric label="视频" value={formatFileSize(data.ip.videoBytes)} />
            <Metric label="回收站" value={formatFileSize(data.ip.trashBytes)} />
          </View>
        </View>
      ) : null}

      <View style={styles.segmented}>
        {SORT_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => setSortMode(option.key)}
            style={({ pressed }) => [
              styles.segmentButton,
              sortMode === option.key && styles.segmentButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.segmentText, sortMode === option.key && styles.segmentTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <PageStateBlock
        emptyDescription="这个 IP 下还没有素材。"
        emptyIconName="image-outline"
        emptyTitle="没有素材"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="正在按文件大小整理素材列表。"
        loadingTitle="正在统计…"
        onRetry={reload}
      >
        <View style={styles.list}>
          {images.map((image) => (
            <StorageAssetRow image={image} key={image.id} onPress={() => onOpenImage(image.id)} space={space} />
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function StorageAssetRow({ image, onPress, space }: { image: ImageListItem; onPress: () => void; space: PixorySpace }) {
  const previewUri = image.coverThumbnailFileUri ?? image.thumbnailFileUri;
  const title = image.note?.trim() || image.originalFilename;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.assetRow, pressed && styles.pressed]}>
      <View style={styles.preview}>
        {previewUri ? (
          <SecureImage contentFit="cover" space={space} style={styles.previewImage} uri={previewUri} />
        ) : (
          <Ionicons color={colors.text.secondary} name={image.mediaType === 'video' ? 'videocam-outline' : 'image-outline'} size={22} />
        )}
        {image.mediaType === 'video' ? (
          <View style={styles.videoBadge}>
            <Ionicons color={colors.text.inverse} name="play" size={9} />
            <Text style={styles.videoBadgeText}>{formatDuration(image.durationMs)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.assetCopy}>
        <View style={styles.assetMain}>
          <Text numberOfLines={1} style={styles.assetTitle}>{title}</Text>
          <Text style={styles.assetSize}>{formatFileSize(image.fileSize)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.assetMeta}>
          {image.mediaType === 'video' ? '视频' : '图片'} · {image.groupName ?? '未分组'} · {formatDateTime(image.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing[3],
  },
  totalValue: {
    color: colors.text.title,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 40,
  },
  breakdown: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: spacing[3],
  },
  metric: {
    flex: 1,
    gap: 3,
  },
  metricLabel: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  metricValue: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '800',
  },
  segmented: {
    backgroundColor: colors.background.input,
    borderRadius: radius.md,
    flexDirection: 'row',
    padding: 3,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.background.surface,
  },
  segmentText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.primary.active,
  },
  list: {
    gap: spacing[2],
  },
  assetRow: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[2],
  },
  preview: {
    alignItems: 'center',
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 58,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  videoBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(30, 38, 29, 0.72)',
    borderRadius: radius.pill,
    bottom: 4,
    flexDirection: 'row',
    gap: 2,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
  },
  videoBadgeText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '700',
  },
  assetCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  assetMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  assetTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    flex: 1,
  },
  assetSize: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    fontWeight: '800',
  },
  assetMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.82,
  },
});
