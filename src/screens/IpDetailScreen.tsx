import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { AssetDetailRow } from '../components/AssetDetailRow';
import { GroupRenameDialog } from '../components/GroupRenameDialog';
import { IpDetailDrawer } from '../components/IpDetailDrawer';
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
import { colors, componentTokens, layout, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import type { ImageViewerContext } from '../navigation/imageViewerContext';
import { formatDateTime, formatDuration, formatUpdatedLabel, getIpInitials } from '../utils/formatters';
import { computeJustifiedLayout, JUSTIFIED_GAP } from '../utils/justifiedLayout';
import { useAssetListPreferences } from '../services/assetListPreferences';
import { VirtualizedAssetCollection } from '../components/VirtualizedAssetCollection';
import { Dimensions } from 'react-native';

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
  { key: 'import', label: '导入素材', subtitle: '本地相册 / 云盘', icon: 'cloud-upload' },
  { key: 'create-group', label: '新建分组', subtitle: '', icon: 'create-new-folder' },
  { key: 'all-images', label: '全部素材', subtitle: '', icon: 'collections-bookmark' },
  { key: 'batch', label: '批量管理', subtitle: '移动 / 导出 / 标签', icon: 'folder-special' },
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
  const insets = useSafeAreaInsets();
  const [actionGroup, setActionGroup] = useState<GroupListItem | null>(null);
  const [actionImage, setActionImage] = useState<ImageListItem | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GroupListItem | null>(null);
  const [renameGroup, setRenameGroup] = useState<GroupListItem | null>(null);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const { data, isLoading, errorMessage, reload, setData } = useScreenLoad<{
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
        groupRepository.findOverviewPreviewByIpId(db, ipId, 4),
        imageRepository.findRecentByIpId(db, ipId, 15, { mediaType: 'all' }),
        importBatchRepository.findByIpId(db, ipId, 3),
        imageRepository.countNeedsOrganizing(db, ipId),
        imageRepository.getOrganizationProgress(db, ipId),
      ]));

      if (!ip) {
        throw new Error('没有找到这个 IP。');
      }

      return { groups, ip, needsOrganizingCount, organizationProgress, recentImages, recentImportBatches };
    },
    ['IpDetailScreen', ipId, refreshToken, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return message === '没有找到这个 IP。' ? message : `读取详情失败：${message}`;
      },
    }
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return gestureState.dx < -30 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -50) {
            setIsDrawerVisible(true);
          }
        },
      }),
    []
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
  const { viewMode } = useAssetListPreferences(space);
  
  const { displayImages, justifiedRows } = useMemo(() => {
    if (viewMode === 'grid') return { displayImages: recentImages.slice(0, 9), justifiedRows: [] };
    if (viewMode === 'detail') return { displayImages: recentImages.slice(0, 3), justifiedRows: [] };
    
    // Justified: compute layout for all 15, slice to 3 rows
    const windowWidth = Dimensions.get('window').width;
    const contentWidth = windowWidth - layout.pagePaddingHorizontal * 2;
    const layoutInfo = computeJustifiedLayout(recentImages, { containerWidth: contentWidth });
    const maxRows = Math.min(layoutInfo.length, 3);
    const rows = layoutInfo.slice(0, maxRows);
    return { displayImages: [], justifiedRows: rows };
  }, [recentImages, viewMode]);

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

  async function handleCoverPlayPress() {
    if (!ip) return;
    try {
      let targetVideoId = ip.coverImageAssetId;
      if (!targetVideoId) {
        const row = await runWithDatabaseSpace(space, (db) => 
          db.getFirstAsync<{id: number}>(`SELECT id FROM image_assets WHERE ipId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC, id DESC LIMIT 1`, ip.id)
        );
        if (row) {
          targetVideoId = row.id;
        }
      }
      if (targetVideoId) {
        onOpenImageDetail(targetVideoId);
      }
    } catch (error) {
      console.error('Failed to open cover video:', error);
    }
  }

  function handleImageLongPress(image: ImageListItem) {
    setActionImage(image);
  }

  function handleCoverBlurChange(enabled: boolean) {
    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) => ipRepository.setCoverBlurEnabled(db, ipId, enabled));
        setData((current) => current ? { ...current, ip: { ...current.ip, coverBlurEnabled: enabled } } : undefined);
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
        setData((current) => current ? { ...current, ip: { ...current.ip, coverBlurRadius: radiusValue } } : undefined);
        onChanged();
      } catch (error) {
        showToast(error instanceof Error ? `更新模糊强度失败：${error.message}` : '更新模糊强度失败');
      }
    })();
  }

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
    <ScreenScaffold backgroundVariant="archive" scrollable showHeader={false}>
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
            <View style={styles.heroCard}>
              <Pressable
                style={styles.heroImageContainer}
                onPress={ip.videoCount > 0 && ip.imageCount === 0 ? handleCoverPlayPress : onOpenCoverPicker}
              >
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
                
                {ip.videoCount > 0 && ip.imageCount === 0 ? (
                  <View pointerEvents="none" style={styles.coverPlayOverlay}>
                    <Ionicons color="rgba(255, 255, 255, 0.5)" name="play" size={56} />
                  </View>
                ) : null}

                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.8)']}
                  locations={[0, 0.5, 1]}
                  style={styles.heroGradient}
                />

                <View style={styles.heroTopBadges}>
                  {ip.isFavorite ? (
                    <View style={styles.heroFavoriteBadge}>
                      <Ionicons color="#fff" name="star" size={14} />
                    </View>
                  ) : <View />}
                  <Pressable onPress={() => setIsDrawerVisible(true)} style={({ pressed }) => [styles.heroMoreButton, pressed && styles.pressed]}>
                    <MaterialIcons color="#ffffff" name="more-vert" size={18} />
                  </Pressable>
                </View>

                <View style={styles.heroBottomContent}>
                  <View style={{ flex: 1 }}>
                    <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={2} style={styles.heroTitle}>
                      {ip.name}
                    </Text>
                  </View>
                </View>
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
            <View style={styles.quickGrid}>
              {QUICK_ACTIONS.map((action) => {
                let subtitle: string = action.subtitle;
                if (action.key === 'create-group') subtitle = `${ip.groupCount} 个现有分组`;
                if (action.key === 'all-images') subtitle = `${ip.imageCount} 个项目归档`;
                
                return (
                  <Pressable
                    key={action.key}
                    onPress={() => handleQuickAction(action.key)}
                    style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
                  >
                    <View style={styles.quickIcon}>
                      <MaterialIcons color="#1a1c1c" name={action.icon as any} size={18} />
                    </View>
                    <View style={styles.quickTextContainer}>
                      <Text numberOfLines={1} style={styles.quickLabel}>{action.label}</Text>
                      <Text numberOfLines={1} style={styles.quickSubtitle}>{subtitle}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.recentSectionHeader}>
              <View style={styles.recentSectionHeaderLeft}>
                <Text style={styles.recentSectionTitle}>最近素材</Text>
                <Text style={styles.recentSectionSubtitle}>RECENTLY SYNCED</Text>
              </View>
              {recentImages.length > 0 ? (
                <Pressable onPress={onOpenAllImages} style={({ pressed }) => [styles.recentSectionAction, pressed && styles.pressed]}>
                  <Text style={styles.recentSectionActionText}>全部图片</Text>
                  <MaterialIcons color="#767676" name="chevron-right" size={14} />
                </Pressable>
              ) : null}
            </View>

            <PageStateBlock
              emptyActionLabel={commonButtonCopy.importImages}
              emptyDescription="导入第一批素材后，这里会显示最近导入的图片和视频。"
              emptyIconName="image-outline"
              emptyTitle={commonEmptyStateCopy.noImagesTitle}
              isEmpty={recentImages.length === 0}
              loading={false}
              onEmptyAction={onImportImages}
            >
              <View style={viewMode === 'detail' ? styles.recentList : styles.recentGrid}>
                {viewMode === 'justified' ? (
                  justifiedRows.map((row, rowIndex) => (
                    <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', gap: JUSTIFIED_GAP, marginBottom: rowIndex < justifiedRows.length - 1 ? JUSTIFIED_GAP : 0 }}>
                      {row.cells.map((cell) => (
                        <View key={cell.item.id} style={{ width: cell.renderedWidth, height: row.height }}>
                          <ThumbnailTile
                            aspectRatio="auto"
                            image={cell.item as ImageListItem}
                            onLongPress={() => handleImageLongPress(cell.item as ImageListItem)}
                            onPress={handleOpenRecentImage}
                            space={space}
                          />
                        </View>
                      ))}
                    </View>
                  ))
                ) : viewMode === 'detail' ? (
                  displayImages.map((image) => (
                    <AssetDetailRow
                      image={image}
                      key={image.id}
                      onLongPress={() => handleImageLongPress(image)}
                      onPress={handleOpenRecentImage}
                      space={space}
                    />
                  ))
                ) : (
                  <>
                    {displayImages.map((image) => {
                      const isVideo = image.mediaType === 'video';
                      return (
                        <Pressable 
                          key={image.id} 
                          onLongPress={() => handleImageLongPress(image)} 
                          onPress={() => handleOpenRecentImage(image.id)}
                          style={({ pressed }) => [styles.recentCard, pressed && styles.pressed]}
                        >
                          <View style={styles.recentImageContainer}>
                            {image.thumbnailFileUri ? (
                              <SecureImage contentFit="cover" space={space} style={styles.coverImage} uri={image.thumbnailFileUri} />
                            ) : (
                              <View style={styles.coverFallback}>
                                <MaterialIcons color="#767676" name={isVideo ? "videocam" : "image"} size={22} />
                              </View>
                            )}
                            <LinearGradient
                              colors={['transparent', 'rgba(0,0,0,0.6)']}
                              locations={[0.3, 1]}
                              style={styles.recentGradient}
                            />
                            {isVideo && (
                              <View style={styles.recentVideoBadge}>
                                <MaterialIcons color="#fff" name="play-arrow" size={12} />
                                <Text style={styles.recentVideoTime}>{formatDuration(image.durationMs)}</Text>
                              </View>
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </>
                )}
              </View>
              {recentImages.length > 0 ? (
                <View style={styles.recentViewAllDivider}>
                  <Pressable onPress={onOpenAllImages} style={({ pressed }) => [styles.viewAllPrompt, pressed && styles.pressed]}>
                    <Text style={styles.viewAllPromptText}>查看全部 {ip.imageCount} 项素材</Text>
                    <MaterialIcons color="#1a1c1c" name="arrow-forward" size={15} />
                  </Pressable>
                </View>
              ) : null}
            </PageStateBlock>
          </>
        ) : null}
      </PageStateBlock>
    </ScreenScaffold>
    <IpDetailDrawer onClose={() => setIsDrawerVisible(false)} visible={isDrawerVisible}>
      {ip ? (
        <>
          <SectionHeader title="基础操作" />
          <Pressable onPress={() => { setIsDrawerVisible(false); setTimeout(() => onEdit(), 300); }} style={({ pressed }) => [styles.drawerActionBtn, pressed && styles.pressed]}>
            <View style={styles.drawerActionIcon}>
              <Ionicons color={colors.primary.active} name="create-outline" size={20} />
            </View>
            <Text style={styles.drawerActionLabel}>编辑 IP 基础信息</Text>
            <Ionicons color={colors.text.secondary} name="chevron-forward" size={16} />
          </Pressable>

          <View style={[styles.managementSummary, { marginTop: 0 }]}>
            <View style={styles.statsStrip}>
              <StatBlock label="素材数量" value={String(ip.imageCount)} />
              <StatBlock label="分组数量" value={String(ip.groupCount)} />
              <StatBlock label="标签数量" value={String(ip.tagCount)} />
            </View>
            {managementSummary ? (
              <>
              <SectionHeader actionLabel={recentImportBatches.length > 0 ? '全部批次' : undefined} onActionPress={recentImportBatches.length > 0 ? () => { setIsDrawerVisible(false); setTimeout(() => onOpenImportBatches(), 300); } : undefined} title="管理摘要" />
              {needsOrganizingCount > 0 ? (
                <Pressable onPress={() => { setIsDrawerVisible(false); setTimeout(() => onOpenNeedsOrganizing(), 300); }} style={({ pressed }) => [styles.needsPanel, pressed && styles.pressed]}>
                  <View style={styles.needsCopy}>
                    <Text style={styles.needsTitle}>待整理 {needsOrganizingCount} 张</Text>
                  </View>
                  <Ionicons color={colors.text.secondary} name="chevron-forward" size={16} />
                </Pressable>
              ) : null}

              {organizationProgress ? (
                <Pressable onPress={() => { setIsDrawerVisible(false); setTimeout(() => onOpenNeedsOrganizing(), 300); }} style={({ pressed }) => [styles.progressPanel, pressed && styles.pressed]}>
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
                      <Pressable key={batch.id} onPress={() => { setIsDrawerVisible(false); setTimeout(() => onOpenImportBatches(), 300); }} style={({ pressed }) => [styles.batchRow, pressed && styles.pressed]}>
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

          <View style={styles.groupSection}>
            <SectionHeader actionLabel={commonButtonCopy.viewAll} onActionPress={() => { setIsDrawerVisible(false); setTimeout(() => onOpenGroups(), 300); }} title="分组入口" />
            {groups.length > 0 ? (
              <View style={styles.groupEntryList}>
                {groups.map((group) => (
                  <Pressable
                    key={group.id}
                    onLongPress={() => { setIsDrawerVisible(false); setActionGroup(group); }}
                    onPress={() => { setIsDrawerVisible(false); setTimeout(() => onOpenGroup(group.id), 300); }}
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
              <Pressable onPress={() => { setIsDrawerVisible(false); setTimeout(() => onCreateGroup(), 300); }} style={({ pressed }) => [styles.emptyGroupEntry, pressed && styles.pressed]}>
                <Ionicons color={colors.primary.default} name="folder-open-outline" size={18} />
                <Text style={styles.emptyGroupText}>还没有分组，点击新建</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : null}
    </IpDetailDrawer>
    <AppActionSheet
      items={actionGroup ? [
        { key: 'view', label: '查看素材', icon: 'images-outline', onPress: () => onOpenGroup(actionGroup.id) },
        { key: 'cover', label: actionGroup.coverSource === 'custom' ? '更换封面' : '选择封面', icon: 'image-outline', onPress: () => onOpenGroupCoverPicker(actionGroup.id) },
        { key: 'rename', label: '重命名', icon: 'text-outline', onPress: () => setRenameGroup(actionGroup) },
        { key: 'edit', label: '编辑分组', icon: 'create-outline', onPress: () => onEditGroup(actionGroup.id) },
        {
          key: 'pin',
          label: actionGroup.isPinned ? '取消置顶' : '置顶分组',
          icon: 'pin-outline',
          onPress: () => {
            void (async () => {
              await runWithDatabaseSpace(space, (db) => groupRepository.updatePinned(db, actionGroup.id, !actionGroup.isPinned));
              showToast(actionGroup.isPinned ? '已取消置顶' : '已置顶');
              setData((current) => {
                if (!current) return current;
                const newGroups = current.groups.map(g => g.id === actionGroup.id ? { ...g, isPinned: !actionGroup.isPinned } : g);
                newGroups.sort((a, b) => {
                  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
                  if (a.type !== b.type) return a.type.localeCompare(b.type);
                  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
                  return b.imageCount - a.imageCount;
                });
                return { ...current, groups: newGroups };
              });
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
    <GroupRenameDialog
      group={renameGroup}
      onClose={() => setRenameGroup(null)}
      onRenamed={(newName) => {
        setData((current) => {
          if (!current || !renameGroup) return current;
          const newGroups = current.groups.map(g => g.id === renameGroup.id ? { ...g, name: newName } : g);
          return { ...current, groups: newGroups };
        });
        onChanged();
      }}
      space={space}
      visible={Boolean(renameGroup)}
    />
    <AppActionSheet
      items={actionImage ? [
        { key: 'detail', label: '查看详情', icon: 'information-circle-outline', onPress: () => onOpenImageDetail(actionImage.id) },
        { key: 'organize', label: '整理', icon: 'albums-outline' as const, onPress: () => onOpenBatchManagement(actionImage.id) },
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
    </View>
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
    ...shadows.sm,
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
  heroCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
  heroImageContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#f3f3f4',
    position: 'relative',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f3f4',
  },
  coverInitials: {
    ...typography.textStyles.heroTitle,
    color: '#1a1c1c',
  },
  coverPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTopBadges: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroFavoriteBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMoreButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  heroBottomContent: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heroTitle: {
    fontFamily: 'Newsreader',
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: -0.22,
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
    gap: rhythm.listCardGap,
  },
  managementSummary: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.listCardGap,
    marginTop: rhythm.entryCardGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[4],
  },
  batchList: {
    gap: rhythm.listCardGap,
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
    width: '33.33%',
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
    marginTop: rhythm.screenSectionGap,
    rowGap: 10, // gap-2.5
  },
  quickCard: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    width: '48.5%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  quickIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f3f4',
    borderRadius: 8,
    width: 36,
    height: 36,
  },
  quickTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  quickLabel: {
    fontFamily: 'Geist',
    fontSize: 13.5,
    fontWeight: '500',
    color: '#1a1c1c',
    letterSpacing: -0.07,
  },
  quickSubtitle: {
    fontFamily: 'Geist',
    fontSize: 10.5,
    color: '#767676',
    marginTop: 2,
  },
  groupSection: {
    gap: rhythm.listCardGap,
  },
  groupEntryList: {
    gap: rhythm.listCardGap,
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
  recentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 2,
  },
  recentSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  recentSectionTitle: {
    fontFamily: 'Newsreader',
    fontSize: 18,
    fontWeight: '500',
    color: '#1a1c1c',
    letterSpacing: -0.18,
  },
  recentSectionSubtitle: {
    fontFamily: 'Geist',
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(118, 118, 118, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  recentSectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  recentSectionActionText: {
    fontFamily: 'Geist',
    fontSize: 12,
    color: '#767676',
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  recentList: {
    flexDirection: 'column',
    gap: rhythm.listCardGap,
  },
  recentCard: {
    width: '48.5%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
    overflow: 'hidden',
  },
  recentImageContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#f3f3f4',
    position: 'relative',
    overflow: 'hidden',
  },
  recentGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  recentVideoBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  recentVideoTime: {
    fontFamily: 'Geist',
    fontSize: 10.5,
    color: '#ffffff',
  },
  recentViewAllDivider: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  viewAllPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  viewAllPromptText: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontWeight: '500',
    color: '#1a1c1c',
    letterSpacing: -0.065,
  },
  drawerActionBtn: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 56,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  drawerActionIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  drawerActionLabel: {
    ...typography.textStyles.bodyStrong,
    flex: 1,
  },
});
