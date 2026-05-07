import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SectionHeader } from '../components/SectionHeader';
import { SecureImage } from '../components/SecureImage';
import { SwitchSettingRow } from '../components/SwitchSettingRow';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { getGroupTypeLabel } from '../constants/groups';
import { PERSONAL_COVER_BLUR_OPTIONS, resolvePersonalCoverBlurRadius } from '../constants/privacy';
import { groupRepository, imageRepository, importBatchRepository, ipRepository, runWithDatabaseSpace, type GroupListItem, type ImageListItem, type ImportBatchSummary, type IpDetailRecord, type PixorySpace } from '../database';
import { colors, componentTokens, radius, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import type { ImageViewerContext } from '../navigation/imageViewerContext';
import { formatDateTime, formatUpdatedLabel, getIpInitials } from '../utils/formatters';

interface IpDetailScreenProps {
  ipId: number;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onEdit: () => void;
  onEditGroup: (groupId: number) => void;
  onImportImages: () => void;
  onCreateGroup: () => void;
  onOpenGroups: () => void;
  onOpenGroup: (groupId: number) => void;
  onOpenGroupCoverPicker: (groupId: number) => void;
  onOpenAllImages: () => void;
  onOpenBatchManagement: (imageId?: number) => void;
  onOpenImportBatches: () => void;
  onOpenNeedsOrganizing: () => void;
  onOpenCoverPicker: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onChanged: () => void;
}

const QUICK_ACTIONS = [
  { key: 'import', label: '导入素材', icon: 'cloud-upload-outline' },
  { key: 'create-group', label: '新建分组', icon: 'folder-open-outline' },
  { key: 'all-images', label: '全部素材', icon: 'images-outline' },
  { key: 'batch', label: '批量管理', icon: 'albums-outline' },
] as const;

export function IpDetailScreen({
  ipId,
  space = 'normal',
  refreshToken,
  onBack,
  onEdit,
  onEditGroup,
  onImportImages,
  onCreateGroup,
  onOpenGroups,
  onOpenGroup,
  onOpenGroupCoverPicker,
  onOpenAllImages,
  onOpenBatchManagement,
  onOpenImportBatches,
  onOpenNeedsOrganizing,
  onOpenCoverPicker,
  onOpenImage,
  onOpenImageDetail,
  onChanged,
}: IpDetailScreenProps) {
  const { showToast } = useToast();
  const [actionGroup, setActionGroup] = useState<GroupListItem | null>(null);
  const [actionImage, setActionImage] = useState<ImageListItem | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GroupListItem | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ip: IpDetailRecord;
    groups: GroupListItem[];
    recentImages: ImageListItem[];
    recentImportBatches: ImportBatchSummary[];
    needsOrganizingCount: number;
    organizationProgress: Awaited<ReturnType<typeof imageRepository.getOrganizationProgress>>;
  }>(
    async () => {
      const [ip, groups, recentImages, recentImportBatches, needsOrganizingCount, organizationProgress] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findDetailById(db, ipId),
        groupRepository.findOverviewByIpId(db, ipId),
        imageRepository.findRecentByIpId(db, ipId, 6, { mediaType: 'all' }),
        importBatchRepository.findByIpId(db, ipId, 3),
        imageRepository.countNeedsOrganizing(db, ipId),
        imageRepository.getOrganizationProgress(db, ipId),
      ]));

      if (!ip) {
        throw new Error('没有找到这个 IP。');
      }

      return { groups, ip, needsOrganizingCount, organizationProgress, recentImages, recentImportBatches };
    },
    [ipId, refreshToken, space],
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
  const groups = data?.groups ?? [];
  const recentImages = data?.recentImages ?? [];
  const recentImportBatches = data?.recentImportBatches ?? [];
  const needsOrganizingCount = data?.needsOrganizingCount ?? 0;
  const organizationProgress = data?.organizationProgress;
  const managementSummary = needsOrganizingCount > 0 || Boolean(organizationProgress) || recentImportBatches.length > 0;
  const activeCoverBlurRadius = resolvePersonalCoverBlurRadius(ip?.coverBlurRadius);
  const personalCoverBlurRadius = space === 'personal' && (ip?.coverBlurEnabled ?? true) ? activeCoverBlurRadius : undefined;
  const groupCoverBlurRadius = personalCoverBlurRadius;

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

  function confirmDeleteGroup() {
    if (!deleteGroup) {
      return;
    }

    const group = deleteGroup;
    setDeleteGroup(null);
    void (async () => {
      try {
        const deletedCount = await runWithDatabaseSpace(space, (db) => groupRepository.deleteById(db, group.id));
        if (deletedCount === 0) {
          throw new Error('没有找到这个分组。');
        }
        showToast('已删除分组');
        reload();
      } catch (error) {
        showToast(error instanceof Error ? `删除分组失败：${error.message}` : '删除分组失败');
      }
    })();
  }

  function handleOpenRecentImage(imageId: number) {
    const image = recentImages.find((item) => item.id === imageId);
    if (image?.mediaType === 'video') {
      onOpenImageDetail(imageId);
      return;
    }
    if (image?.importBatchId != null) {
      onOpenImage(imageId, { type: 'import-batch', ipId, importBatchId: image.importBatchId, space });
      return;
    }

    onOpenImage(imageId, { type: 'ip-all', ipId, filter: { type: 'all' }, space });
  }

  function handleImageLongPress(image: ImageListItem) {
    setActionImage(image);
  }

  function handleCoverBlurChange(enabled: boolean) {
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => ipRepository.setCoverBlurEnabled(db, ipId, enabled));
        reload();
        onChanged();
      } catch (error) {
        showToast(error instanceof Error ? `更新封面模糊失败：${error.message}` : '更新封面模糊失败');
      }
    })();
  }

  function handleCoverBlurRadiusChange(radiusValue: number) {
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => ipRepository.setCoverBlurRadius(db, ipId, radiusValue));
        reload();
        onChanged();
      } catch (error) {
        showToast(error instanceof Error ? `更新模糊强度失败：${error.message}` : '更新模糊强度失败');
      }
    })();
  }

  return (
    <>
    <ScreenScaffold backgroundVariant="archive" decorativeTitle="Archive" onBack={onBack} rightAction={rightSlot} scrollable title="IP详情">
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
              {ip.coverThumbnailFileUri ? (
                <SecureImage
                  blurRadius={personalCoverBlurRadius}
                  contentFit="cover"
                  space={space}
                  style={styles.coverImage}
                  uri={ip.coverThumbnailFileUri}
                />
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
              <View style={styles.coverCaption}>
                <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={2} style={styles.coverTitle}>
                  {ip.name}
                </Text>
              </View>
              <Pressable onPress={onOpenCoverPicker} style={({ pressed }) => [styles.coverAction, pressed && styles.pressed]}>
                <Ionicons color={colors.text.inverse} name="image-outline" size={14} />
                <Text style={styles.coverActionText}>{ip.coverSource === 'custom' ? '更换封面' : '选择封面'}</Text>
              </Pressable>
            </View>
            {space === 'personal' ? (
              <>
              <SwitchSettingRow
                hint="只模糊隐私空间中的 IP 封面预览，不修改原图。"
                label="封面模糊"
                onValueChange={handleCoverBlurChange}
                value={ip.coverBlurEnabled ?? true}
              />
              {(ip.coverBlurEnabled ?? true) ? (
                <View style={styles.blurOptions}>
                  <Text style={styles.blurOptionsLabel}>模糊强度</Text>
                  <View style={styles.blurOptionRow}>
                    {PERSONAL_COVER_BLUR_OPTIONS.map((radiusValue) => {
                      const selected = activeCoverBlurRadius === radiusValue;
                      return (
                        <Pressable
                          key={radiusValue}
                          onPress={() => handleCoverBlurRadiusChange(radiusValue)}
                          style={({ pressed }) => [
                            styles.blurOption,
                            selected && styles.blurOptionSelected,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={[styles.blurOptionText, selected && styles.blurOptionTextSelected]}>{radiusValue}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
              </>
            ) : null}

            <View style={styles.managementSummary}>
              <View style={styles.statsStrip}>
                <StatBlock label="素材数量" value={String(ip.imageCount)} />
                <StatBlock label="分组数量" value={String(ip.groupCount)} />
                <StatBlock label="标签数量" value={String(ip.tagCount)} />
                <StatBlock label="最近更新" value={formatUpdatedLabel(ip.recentUpdatedAt).replace(' 更新', '')} />
              </View>
              {managementSummary ? (
                <>
                <SectionHeader actionLabel={recentImportBatches.length > 0 ? '全部批次' : undefined} onActionPress={recentImportBatches.length > 0 ? onOpenImportBatches : undefined} title="管理摘要" />
                {needsOrganizingCount > 0 ? (
                  <Pressable onPress={onOpenNeedsOrganizing} style={({ pressed }) => [styles.needsPanel, pressed && styles.pressed]}>
                    <View style={styles.needsCopy}>
                      <Text style={styles.needsTitle}>待整理 {needsOrganizingCount} 张</Text>
                    </View>
                    <Ionicons color={colors.text.secondary} name="chevron-forward" size={16} />
                  </Pressable>
                ) : null}

                {organizationProgress ? (
                  <Pressable onPress={onOpenNeedsOrganizing} style={({ pressed }) => [styles.progressPanel, pressed && styles.pressed]}>
                    <View style={styles.progressHeader}>
                      <Text style={styles.progressTitle}>当前 IP 整理度 {organizationProgress.organizationPercent}%</Text>
                      <Text style={styles.progressMeta}>{organizationProgress.organizedCount}/{organizationProgress.totalCount}</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${organizationProgress.organizationPercent}%` }]} />
                    </View>
                    <View style={styles.progressFacts}>
                      <Text style={styles.progressFact}>无标签 {organizationProgress.untaggedCount} 张</Text>
                      <Text style={styles.progressFact}>未分组 {organizationProgress.ungroupedCount} 张</Text>
                      <Text style={styles.progressFact}>最近导入未整理 {organizationProgress.recentImportUnorganizedCount} 张</Text>
                    </View>
                  </Pressable>
                ) : null}

                {recentImportBatches.length > 0 ? (
                  <View style={styles.batchList}>
                    {recentImportBatches.slice(0, 2).map((batch) => {
                      const percent = batch.activeCount > 0 ? Math.round((batch.organizedCount / batch.activeCount) * 100) : 100;
                      return (
                        <Pressable key={batch.id} onPress={onOpenImportBatches} style={({ pressed }) => [styles.batchRow, pressed && styles.pressed]}>
                          <View style={styles.batchCopy}>
                            <Text numberOfLines={1} style={styles.batchTitle}>{batch.name}</Text>
                            <Text numberOfLines={1} style={styles.batchMeta}>
                              {formatDateTime(batch.createdAt)} · {batch.activeCount} 张 · 整理度 {percent}%
                            </Text>
                          </View>
                          <Ionicons color={colors.text.secondary} name="chevron-forward" size={16} />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                </>
              ) : null}
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
              {groups.length > 0 ? (
                <View style={styles.groupEntryList}>
                  {groups.slice(0, 4).map((group) => (
                    <Pressable
                      key={group.id}
                      onLongPress={() => setActionGroup(group)}
                      onPress={() => onOpenGroup(group.id)}
                      style={({ pressed }) => [styles.groupEntry, pressed && styles.pressed]}
                    >
                      <View style={styles.groupEntryCover}>
                        {group.coverThumbnailFileUri ? (
                          <SecureImage
                            blurRadius={groupCoverBlurRadius}
                            contentFit="cover"
                            space={space}
                            style={styles.groupEntryCoverImage}
                            uri={group.coverThumbnailFileUri}
                          />
                        ) : (
                          <Ionicons color={colors.primary.default} name="images-outline" size={18} />
                        )}
                      </View>
                      <View style={styles.groupEntryCopy}>
                        <Text numberOfLines={1} style={styles.groupEntryTitle}>{group.name}</Text>
                        <Text style={styles.groupEntryMeta}>{getGroupTypeLabel(group.type)} · {group.imageCount} 张</Text>
                      </View>
                      <Ionicons color={colors.text.secondary} name="chevron-forward" size={16} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Pressable onPress={onCreateGroup} style={({ pressed }) => [styles.emptyGroupEntry, pressed && styles.pressed]}>
                  <Ionicons color={colors.primary.default} name="folder-open-outline" size={18} />
                  <Text style={styles.emptyGroupText}>还没有分组，点击新建</Text>
                </Pressable>
              )}
            </View>

            <SectionHeader
              actionLabel={recentImages.length > 0 ? commonButtonCopy.allImages : undefined}
              onActionPress={recentImages.length > 0 ? onOpenAllImages : undefined}
              title="最近素材"
            />
            <PageStateBlock
              emptyActionLabel={commonButtonCopy.importImages}
              emptyDescription="导入第一批素材后，这里会显示最近导入的图片和视频。"
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
                    onLongPress={() => handleImageLongPress(image)}
                    onPress={handleOpenRecentImage}
                    space={space}
                  />
                ))}
              </View>
            </PageStateBlock>
          </>
        ) : null}
      </PageStateBlock>
    </ScreenScaffold>
    <AppActionSheet
      items={actionGroup ? [
        { key: 'view', label: '查看素材', icon: 'images-outline', onPress: () => onOpenGroup(actionGroup.id) },
        { key: 'cover', label: actionGroup.coverSource === 'custom' ? '更换封面' : '选择封面', icon: 'image-outline', onPress: () => onOpenGroupCoverPicker(actionGroup.id) },
        { key: 'edit', label: '编辑分组', icon: 'create-outline', onPress: () => onEditGroup(actionGroup.id) },
        {
          key: 'pin',
          label: actionGroup.isPinned ? '取消置顶' : '置顶分组',
          icon: 'pin-outline',
          onPress: () => {
            void (async () => {
              await runWithDatabaseSpace(space, (db) => groupRepository.updatePinned(db, actionGroup.id, !actionGroup.isPinned));
              showToast(actionGroup.isPinned ? '已取消置顶' : '已置顶');
              reload();
            })();
          },
        },
        { key: 'delete', label: '删除分组', icon: 'trash-outline', danger: true, onPress: () => setDeleteGroup(actionGroup) },
      ] : []}
      message="删除分组不会删除图片，图片会保留在当前 IP 中。"
      onClose={() => setActionGroup(null)}
      title={actionGroup?.name ?? '分组操作'}
      visible={Boolean(actionGroup)}
    />
    <AppActionSheet
      items={actionImage ? [
        { key: 'detail', label: '查看详情', icon: 'information-circle-outline', onPress: () => onOpenImageDetail(actionImage.id) },
        ...(actionImage.mediaType === 'video' ? [] : [{ key: 'organize', label: '整理', icon: 'albums-outline' as const, onPress: () => onOpenBatchManagement(actionImage.id) }]),
      ] : []}
      onClose={() => setActionImage(null)}
      title={actionImage?.originalFilename ?? '图片操作'}
      visible={Boolean(actionImage)}
    />
    <AppDialog
      danger
      message={deleteGroup ? `删除「${deleteGroup.name}」后，分组内图片会保留并移动到未分组。` : ''}
      onClose={() => setDeleteGroup(null)}
      onPrimary={confirmDeleteGroup}
      primaryLabel="确认删除"
      title="删除分组"
      visible={Boolean(deleteGroup)}
    />
    </>
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
  coverCaption: {
    alignItems: 'flex-end',
    bottom: spacing[4],
    maxWidth: '74%',
    position: 'absolute',
    right: spacing[4],
  },
  coverTitle: {
    ...typography.textStyles.cardTitle,
    color: colors.text.inverse,
    fontSize: 19,
    fontWeight: '600',
    lineHeight: 24,
    textAlign: 'right',
    textShadowColor: 'rgba(23, 33, 43, 0.92)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  coverAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 7, 10, 0.48)',
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    left: spacing[3],
    minHeight: 32,
    paddingHorizontal: spacing[3],
    position: 'absolute',
    top: spacing[3],
  },
  coverActionText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '700',
  },
  blurOptions: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    padding: spacing[3],
  },
  blurOptionsLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  blurOptionRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  blurOption: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 54,
  },
  blurOptionSelected: {
    backgroundColor: colors.primary.active,
    borderColor: colors.primary.active,
  },
  blurOptionText: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    fontWeight: '700',
  },
  blurOptionTextSelected: {
    color: colors.text.inverse,
  },
  statsStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing[4],
  },
  needsPanel: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  needsCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  needsTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  progressPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    padding: spacing[3],
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    flex: 1,
  },
  progressMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
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
  progressFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  progressFact: {
    ...typography.textStyles.micro,
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    color: colors.text.secondary,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  batchSection: {
    gap: spacing[2],
  },
  managementSummary: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    marginTop: spacing[4],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[4],
  },
  batchList: {
    gap: spacing[2],
  },
  batchRow: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  batchCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  batchTitle: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '700',
  },
  batchMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
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
    justifyContent: 'space-between',
    rowGap: spacing[3],
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
    width: '48%',
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
    gap: spacing[2],
  },
  groupEntry: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  groupEntryCover: {
    alignItems: 'center',
    backgroundColor: colors.background.empty,
    borderRadius: radius.sm,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 58,
  },
  groupEntryCoverImage: {
    height: '100%',
    width: '100%',
  },
  groupEntryCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  groupEntryTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  groupEntryMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  emptyGroupEntry: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 52,
    paddingHorizontal: spacing[3],
  },
  emptyGroupText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
});
