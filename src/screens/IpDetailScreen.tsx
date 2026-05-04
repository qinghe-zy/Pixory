import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SectionHeader } from '../components/SectionHeader';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { GROUP_TYPE_OPTIONS } from '../constants/groups';
import { imageRepository, ipRepository, type ImageListItem, type IpDetailRecord } from '../database';
import { colors, componentTokens, layout, radius, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { formatDate, getIpInitials } from '../utils/formatters';

interface IpDetailScreenProps {
  ipId: number;
  refreshToken: number;
  onBack: () => void;
  onEdit: () => void;
  onImportImages: () => void;
  onCreateGroup: () => void;
  onOpenGroups: () => void;
  onOpenAllImages: () => void;
  onOpenBatchManagement: (imageId?: number) => void;
  onOpenImage: (imageId: number) => void;
}

const QUICK_ACTIONS = [
  { key: 'import', label: '导入图片', icon: 'cloud-upload-outline' },
  { key: 'create-group', label: '新建分组', icon: 'folder-open-outline' },
  { key: 'all-images', label: '全部图片', icon: 'images-outline' },
  { key: 'batch', label: '批量管理', icon: 'albums-outline' },
] as const;

export function IpDetailScreen({
  ipId,
  refreshToken,
  onBack,
  onEdit,
  onImportImages,
  onCreateGroup,
  onOpenGroups,
  onOpenAllImages,
  onOpenBatchManagement,
  onOpenImage,
}: IpDetailScreenProps) {
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ip: IpDetailRecord;
    recentImages: ImageListItem[];
  }>(
    async () => {
      const [ip, recentImages] = await Promise.all([
        ipRepository.findDetailById(ipId),
        imageRepository.findRecentByIpId(ipId, 6),
      ]);

      if (!ip) {
        throw new Error('没有找到这个 IP。');
      }

      return { ip, recentImages };
    },
    [ipId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return message === '没有找到这个 IP。' ? message : `读取详情失败：${message}`;
      },
    }
  );

  const rightSlot = useMemo(
    () => (
      <Pressable onPress={onEdit} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
        <Ionicons color={colors.primary.default} name="create-outline" size={18} />
      </Pressable>
    ),
    [onEdit]
  );

  const ip = data?.ip;
  const recentImages = data?.recentImages ?? [];

  function handleQuickAction(key: (typeof QUICK_ACTIONS)[number]['key']) {
    if (key === 'import') {
      onImportImages();
      return;
    }

    if (key === 'create-group') {
      onCreateGroup();
      return;
    }

    if (key === 'all-images') {
      onOpenAllImages();
      return;
    }

    onOpenBatchManagement();
  }

  return (
    <ScreenScaffold decorativeTitle="Archive" onBack={onBack} rightAction={rightSlot} scrollable title="IP详情">
      <PageStateBlock
        emptyDescription=""
        emptyTitle=""
        errorMessage={errorMessage}
        errorTitle="IP详情不可用"
        isEmpty={false}
        loading={isLoading}
        loadingDescription="本地 IP 详情读取完成后，这里会展示图片、分组和标签概览。"
        loadingTitle="正在读取 IP 详情"
        onRetry={reload}
      >
        {ip ? (
          <>
            <View style={styles.cover}>
              {recentImages[0]?.thumbnailFileUri ? (
                <Image resizeMode="cover" source={{ uri: recentImages[0].thumbnailFileUri }} style={styles.coverImage} />
              ) : (
                <View style={styles.coverFallback}>
                  <Text style={styles.coverInitials}>{getIpInitials(ip.name)}</Text>
                </View>
              )}
              {ip.isFavorite ? (
                <View style={styles.favoriteBadge}>
                  <Ionicons color={colors.semantic.favorite} name="star" size={14} />
                </View>
              ) : null}
            </View>

            <View style={styles.identityBlock}>
              <View style={styles.titleRow}>
                <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={2} style={styles.title}>
                  {ip.name}
                </Text>
              </View>
              <Text style={styles.description}>{ip.description || '还没有简介'}</Text>
            </View>

            <View style={styles.statsStrip}>
              <StatBlock label="图片数量" value={String(ip.imageCount)} />
              <StatBlock label="分组数量" value={String(ip.groupCount)} />
              <StatBlock label="标签数量" value={String(ip.tagCount)} />
              <StatBlock label="最近更新" value={formatDate(ip.recentUpdatedAt)} />
            </View>

            <SectionHeader title="快捷操作" />
            <View style={styles.quickGrid}>
              {QUICK_ACTIONS.map((action) => (
                <Pressable
                  key={action.key}
                  onPress={() => handleQuickAction(action.key)}
                  style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
                >
                  <View style={styles.quickIcon}>
                    <Ionicons color={colors.primary.active} name={action.icon} size={20} />
                  </View>
                  <Text style={styles.quickLabel}>{action.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.groupSection}>
              <SectionHeader actionLabel={commonButtonCopy.viewAll} onActionPress={onOpenGroups} title="分组入口" />
              <View style={styles.groupEntryList}>
                {GROUP_TYPE_OPTIONS.map((groupType) => (
                  <Pressable key={groupType.value} onPress={onOpenGroups} style={({ pressed }) => [styles.groupEntry, pressed && styles.pressed]}>
                    <Text style={styles.groupEntryTitle}>{groupType.label}</Text>
                    <Ionicons color={colors.text.secondary} name="chevron-forward" size={16} />
                  </Pressable>
                ))}
              </View>
            </View>

            <SectionHeader
              actionLabel={recentImages.length > 0 ? commonButtonCopy.allImages : undefined}
              onActionPress={recentImages.length > 0 ? onOpenAllImages : undefined}
              title="最近图片"
            />
            <PageStateBlock
              emptyActionLabel={commonButtonCopy.importImages}
              emptyDescription="导入第一批素材后，这里会显示最近导入的图片。"
              emptyIconName="image-outline"
              emptyTitle={commonEmptyStateCopy.noImagesTitle}
              isEmpty={recentImages.length === 0}
              loading={false}
              onEmptyAction={onImportImages}
            >
              <View style={styles.recentGrid}>
                {recentImages.map((image) => (
                  <ThumbnailTile
                    image={image}
                    key={image.id}
                    onLongPress={onOpenBatchManagement}
                    onPress={onOpenImage}
                  />
                ))}
              </View>
            </PageStateBlock>
          </>
        ) : null}
      </PageStateBlock>
    </ScreenScaffold>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: componentTokens.iconButton.radius,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    width: componentTokens.iconButton.size,
  },
  pressed: {
    opacity: 0.8,
  },
  cover: {
    ...shadows.xs,
    aspectRatio: 1.55,
    backgroundColor: colors.background.empty,
    borderColor: colors.border.subtle,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  coverFallback: {
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    flex: 1,
    justifyContent: 'center',
  },
  coverInitials: {
    ...typography.textStyles.heroTitle,
    color: colors.primary.active,
  },
  favoriteBadge: {
    alignItems: 'center',
    backgroundColor: colors.overlay.softSurface,
    borderRadius: radius.sm,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing[3],
    top: spacing[3],
    width: 28,
  },
  identityBlock: {
    gap: spacing[2],
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[2],
  },
  title: {
    ...typography.textStyles.pageTitle,
    flexShrink: 1,
    fontSize: 20,
    lineHeight: 26,
  },
  description: {
    ...typography.textStyles.body,
    color: colors.text.body,
    maxWidth: layout.maxReadableWidth,
  },
  statsStrip: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  statItem: {
    alignItems: 'center',
    gap: spacing[1],
    width: '25%',
  },
  statValue: {
    ...typography.textStyles.statNumber,
    textAlign: 'center',
  },
  statLabel: {
    ...typography.textStyles.statLabel,
    textAlign: 'center',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  quickCard: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 64,
    paddingHorizontal: spacing[3],
    width: '48.3%',
  },
  quickIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  quickLabel: {
    ...typography.textStyles.bodyStrong,
    flex: 1,
  },
  groupSection: {
    gap: spacing[3],
  },
  groupEntryList: {
    gap: spacing[1],
  },
  groupEntry: {
    alignItems: 'center',
    borderBottomColor: colors.border.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: componentTokens.common.minTouchSize,
    paddingHorizontal: spacing[1],
  },
  groupEntryTitle: {
    ...typography.textStyles.body,
    color: colors.text.title,
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
});
