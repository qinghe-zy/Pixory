import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, LayoutAnimation, Pressable, SectionList, ScrollView, StyleSheet, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';

const AnimatedSectionList = Animated.createAnimatedComponent(SectionList);

import { AnchoredContextMenu } from '../components/AnchoredContextMenu';
import { AppDialog } from '../components/AppDialog';
import { GroupRenameDialog } from '../components/GroupRenameDialog';
import { ListSkeleton } from '../components/ListSkeleton';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { IpRail } from '../components/IpRail';
import { MediaCountMeta } from '../components/MediaCountMeta';
import { SecureImage } from '../components/SecureImage';
import { commonEmptyStateCopy } from '../constants/copy';
import { getGroupTypeLabel, GROUP_TYPE_OPTIONS } from '../constants/groups';
import { resolvePersonalCoverBlurRadius } from '../constants/privacy';
import { groupRepository, ipRepository, runWithDatabaseSpace, type GlobalGroupListItem, type IpListItem, type PixorySpace } from '../database';
import { radius, spacing, typography } from '../design/tokens';
import { usePagedScreenLoad } from '../hooks/usePagedScreenLoad';
import { useCompactHeaderAnimation } from '../hooks/useCompactHeaderAnimation';
import { useToast } from '../components/AppToast';
import { formatDate } from '../utils/formatters';
import { getGroupedItemMoveBoundaries, moveGroupedItem } from '../utils/reorderUtils';
import { OrganizeSegmentedControl, protoColors, type OrganizeMode } from '../components/OrganizeShared';
import { globalScrollState, createScrollHandlers } from '../utils/scrollState';

interface GlobalGroupsScreenProps {
  space?: PixorySpace;
  isActive?: boolean;
  refreshToken: number;
  footer?: ReactNode;
  mode?: OrganizeMode;
  onSelectMode?: (mode: OrganizeMode) => void;
  onCreateFirstIp?: () => void;
  onCreateGroup?: (ipId: number) => void;
  onOpenCoverPicker: (ipId: number, groupId: number) => void;
  onEditGroup: (ipId: number, groupId: number) => void;
  onOpenGroup: (ipId: number, groupId: number) => void;
  onImportImagesToGroup?: (ipId: number, groupId: number) => void;
  onImportVideosToGroup?: (ipId: number, groupId: number) => void;
}

const GROUP_PAGE_SIZE = 30;
const IP_SCOPE_PAGE_SIZE = 30;

export function GlobalGroupsScreen({
  space = 'normal',
  isActive = true,
  refreshToken,
  footer,
  mode,
  onSelectMode,
  onCreateFirstIp,
  onCreateGroup,
  onOpenCoverPicker,
  onEditGroup,
  onOpenGroup,
  onImportImagesToGroup,
  onImportVideosToGroup,
}: GlobalGroupsScreenProps) {
  const { showToast } = useToast();
  const [actionGroupState, setActionGroupState] = useState<{ group: GlobalGroupListItem; anchorX: number; anchorY: number } | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GlobalGroupListItem | null>(null);
  const [renameGroup, setRenameGroup] = useState<GlobalGroupListItem | null>(null);
  const [selectedIpId, setSelectedIpId] = useState<number | null>(null);

  const groupPageSize = space === 'personal' ? 16 : GROUP_PAGE_SIZE;

  const {
    items: groups,
    isLoading,
    isLoadingMore,
    errorMessage,
    loadMore,
    reload,
    setData,
  } = usePagedScreenLoad<GlobalGroupListItem, null>(
    (offset) => runWithDatabaseSpace(space, async (db) => {
      const page = await groupRepository.findOverviewPage(db, {
        ipId: selectedIpId ?? undefined,
        limit: groupPageSize,
        offset,
      });
      return { items: page.items, hasMore: page.hasMore };
    }),
    {
      deferUntilInteractions: true,
      requestKey: JSON.stringify([space, selectedIpId, refreshToken]),
      getItemKey: (group) => group.id,
      initialMeta: null,
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组总览失败：${message}`;
      },
      onLoadMoreError: (error) => {
        showToast(error instanceof Error ? `加载更多分组失败：${error.message}` : '加载更多分组失败');
      },
    }
  );

  const {
    items: ipScopes,
  } = usePagedScreenLoad<IpListItem, null>(
    (offset) => runWithDatabaseSpace(space, async (db) => {
      const page = await ipRepository.findLibraryItemsPage(db, { includeTotalCount: false, limit: IP_SCOPE_PAGE_SIZE, offset });
      return { items: page.items, hasMore: page.hasMore };
    }),
    {
      deferUntilInteractions: true,
      requestKey: JSON.stringify([space, refreshToken]),
      getItemKey: (ip) => ip.id,
      initialMeta: null,
      onLoadMoreError: (error) => {
        showToast(error instanceof Error ? `加载更多 IP 失败：${error.message}` : '加载更多 IP 失败');
      },
    }
  );

  useEffect(() => {
    setSelectedIpId(null);
  }, [space]);

  const groupedSections = useMemo(() => {
    const predefinedValues = new Set(GROUP_TYPE_OPTIONS.map(o => o.value as string));
    
    const sections: Array<{
      value: string;
      label: string;
      description?: string;
      data: GlobalGroupListItem[];
    }> = GROUP_TYPE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description,
      data: groups.filter((group) => group.type === option.value),
    })).filter((section) => section.data.length > 0);

    const customGroups = groups.filter(g => !predefinedValues.has(g.type));
    const customTypes = Array.from(new Set(customGroups.map(g => g.type)));
    
    for (const ct of customTypes) {
      sections.push({
        value: ct,
        label: getGroupTypeLabel(ct),
        description: undefined,
        data: customGroups.filter(g => g.type === ct),
      });
    }

    return sections;
  }, [groups]);

  function getGroupCoverBlurRadius(group: GlobalGroupListItem): number | undefined {
    return space === 'personal' && (group.ipCoverBlurEnabled ?? true) ? resolvePersonalCoverBlurRadius(group.ipCoverBlurRadius) : undefined;
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

  const handleMoveGlobalGroupUp = useCallback((targetGroup: GlobalGroupListItem) => {
    const result = moveGroupedItem(groups, targetGroup.id, 'up');
    if (!result) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData((prev) => ({ ...prev, items: result.nextItems }));

    void runWithDatabaseSpace(space, (db) => groupRepository.updateSortOrders(db, result.updates)).catch((err) => {
      console.warn('Move global group up failed.', err);
      showToast('调整排序失败');
      reload();
    });
  }, [groups, space, setData, showToast, reload]);

  const handleMoveGlobalGroupDown = useCallback((targetGroup: GlobalGroupListItem) => {
    const result = moveGroupedItem(groups, targetGroup.id, 'down');
    if (!result) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData((prev) => ({ ...prev, items: result.nextItems }));
    if (result.unpinned) {
      showToast('已取消置顶并下移');
    }

    void runWithDatabaseSpace(space, (db) => groupRepository.updateSortOrders(db, result.updates)).catch((err) => {
      console.warn('Move global group down failed.', err);
      showToast('调整排序失败');
      reload();
    });
  }, [groups, space, setData, showToast, reload]);

  const scrollY = useSharedValue(0);

  const { compactHeaderStyle, compactAnimatedProps } = useCompactHeaderAnimation(scrollY, {
    threshold: [10, 30],
    translateYRange: [-10, 0],
  });

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollY.value = event.contentOffset.y;
    },
  });

  const rightAction = (
    <View style={styles.headerActions}>
      {selectedIpId !== null && (
        <Pressable
          onPress={() => onCreateGroup?.(selectedIpId)}
          style={({ pressed }) => [styles.newBtn, pressed && styles.pressed]}
        >
          <MaterialIcons name="add" size={14} color={protoColors.onPrimary} />
          <Text style={styles.newBtnText}>新建分组</Text>
        </Pressable>
      )}
    </View>
  );

  const compactRightAction = (
    <View style={styles.headerActions}>
      {selectedIpId !== null && (
        <Pressable
          onPress={() => onCreateGroup?.(selectedIpId)}
          style={({ pressed }) => [styles.newBtn, pressed && styles.pressed]}
        >
          <MaterialIcons name="add" size={14} color={protoColors.onPrimary} />
        </Pressable>
      )}
    </View>
  );

  const expandedHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 20], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const allOptionBadgeCount = useMemo(() => ipScopes.reduce((acc, ip) => acc + ip.groupCount, 0), [ipScopes]);

  const expandedHeader = (
    <Animated.View style={[styles.topSection, expandedHeaderStyle]}>
      {mode && onSelectMode && (
        <OrganizeSegmentedControl mode={mode} onSelect={onSelectMode} rightAction={rightAction} collapsed={false} />
      )}
      <IpRail
        ips={ipScopes}
        selectedIpId={selectedIpId}
        onSelectIp={setSelectedIpId}
        allOptionBadgeCount={allOptionBadgeCount}
        onCreateIp={onCreateFirstIp}
        style={{ marginHorizontal: -16 }}
        railId="globalGroups"
      />
    </Animated.View>
  );

  const compactHeader = (
    <Animated.View style={[styles.headerContainer, compactHeaderStyle]} animatedProps={compactAnimatedProps}>
      <View style={styles.topSectionCollapsed}>
        {mode && onSelectMode && (
          <OrganizeSegmentedControl mode={mode} onSelect={onSelectMode} rightAction={compactRightAction} collapsed={true} />
        )}
        <IpRail
          ips={ipScopes}
          selectedIpId={selectedIpId}
          onSelectIp={setSelectedIpId}
          allOptionBadgeCount={allOptionBadgeCount}
          onCreateIp={onCreateFirstIp}
          style={styles.ipScrollCollapsed}
          contentContainerStyle={styles.ipRailCollapsed}
          railId="globalGroups"
        />
        {compactRightAction}
      </View>
    </Animated.View>
  );

  const { canMoveUp: canGlobalGroupMoveUp, canMoveDown: canGlobalGroupMoveDown } = useMemo(() => {
    return getGroupedItemMoveBoundaries(groups, actionGroupState?.group);
  }, [groups, actionGroupState]);

  return (
    <>
    <ScreenScaffold showHeader={false} backgroundColor={protoColors.surface} contentContainerStyle={{ paddingHorizontal: 16 }} decorativeTitle={undefined} footer={footer} title="">
      <PageStateBlock
        errorMessage={errorMessage}
        isEmpty={false} emptyTitle="" emptyDescription=""
        loading={false}
        onEmptyAction={onCreateFirstIp}
        onRetry={reload}
      >
        {compactHeader}
        <AnimatedSectionList
          {...createScrollHandlers()}
          contentContainerStyle={styles.list}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyExtractor={(group: any) => String(group.id)}
          ListHeaderComponent={expandedHeader}
          ListEmptyComponent={
            isLoading ? (
              <ListSkeleton active={isActive} showHeader={false} />
            ) : groups.length === 0 ? (
              <View style={styles.emptyInline}>
                <MaterialIcons name="folder-open" size={32} color={protoColors.outlineVariant} />
                <Text style={styles.emptyInlineTitle}>还没有分组</Text>
                <Text style={styles.emptyInlineDesc}>分组需要先归属于一个 IP。先创建或打开 IP，再在详情页新建分组。</Text>
                {onCreateFirstIp ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={onCreateFirstIp}
                    style={({ pressed }) => [styles.emptyActionBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.emptyActionBtnText}>前往 IP 库</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
          ListFooterComponent={isLoadingMore ? <ActivityIndicator color={protoColors.primary} style={styles.loadingMore} /> : null}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item }: { item: any }) => {
            const group = item as GlobalGroupListItem;
            return (
              <View style={styles.groupCardWrapper}>
                <Pressable
                  onLongPress={(e) => {
                    if (globalScrollState.isScrolling) return;
                    setActionGroupState({ group, anchorX: e.nativeEvent.pageX, anchorY: e.nativeEvent.pageY });
                  }}
                  onPress={() => onOpenGroup(group.ipId, group.id)}
                  style={({ pressed }) => [styles.groupCardFloating, pressed && styles.pressedCard]}
                >
                  <View style={styles.groupCardInner}>
                    {group.isPinned && (
                      <View style={styles.pinBadge}>
                        <MaterialIcons name="push-pin" size={12} color="#747878" />
                      </View>
                    )}
                    <View style={styles.coverWrap}>
                      <View style={[StyleSheet.absoluteFill, styles.coverLayer2]} />
                      <View style={[StyleSheet.absoluteFill, styles.coverLayer1]} />
                      <View style={styles.coverImageContainer}>
                        {group.coverThumbnailFileUri ? (
                          <SecureImage blurRadius={getGroupCoverBlurRadius(group)} contentFit="cover" decodeFormat="rgb" space={space} style={styles.coverImage} uri={group.coverThumbnailFileUri} />
                        ) : (
                          <View style={styles.coverEmpty}><MaterialIcons color={protoColors.outlineVariant} name="image" size={22} /></View>
                        )}
                      </View>
                    </View>
                    <GroupCardCopy group={group} onOpenGroup={onOpenGroup} onOpenMenu={(group, anchorX, anchorY) => setActionGroupState({ group, anchorX, anchorY })} />
                  </View>
                </Pressable>
              </View>
            );
          }}
          renderSectionHeader={({ section }: { section: any }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ARCHIVE GROUPS ({section.data.length})</Text>
              <Text style={styles.sectionType}>{section.label}</Text>
            </View>
          )}
          sections={groupedSections}
          showsVerticalScrollIndicator={false}
          style={styles.listViewport}
        />
      </PageStateBlock>
    </ScreenScaffold>
    <AnchoredContextMenu
      actions={actionGroupState ? [
        {
          key: 'move-up',
          label: '上移',
          icon: 'arrow-up-outline',
          disabled: !canGlobalGroupMoveUp,
          onPress: () => handleMoveGlobalGroupUp(actionGroupState.group),
        },
        {
          key: 'move-down',
          label: '下移',
          icon: 'arrow-down-outline',
          disabled: !canGlobalGroupMoveDown,
          onPress: () => handleMoveGlobalGroupDown(actionGroupState.group),
        },
        { key: 'cover', label: actionGroupState.group.coverSource === 'custom' ? '更换封面' : '选择封面', icon: 'image-outline', onPress: () => onOpenCoverPicker(actionGroupState.group.ipId, actionGroupState.group.id) },
        { key: 'edit', label: '编辑分组', icon: 'create-outline', onPress: () => onEditGroup(actionGroupState.group.ipId, actionGroupState.group.id) },
        {
          key: 'pin',
          label: actionGroupState.group.isPinned ? '取消置顶' : '置顶分组',
          icon: actionGroupState.group.isPinned ? 'pin' : 'pin-outline',
          onPress: () => {
            void (async () => {
              await runWithDatabaseSpace(space, (db) => groupRepository.updatePinned(db, actionGroupState.group.id, !actionGroupState.group.isPinned));
              showToast(actionGroupState.group.isPinned ? '已取消置顶' : '已置顶');
              reload();
            })();
          },
        },
        { key: 'delete', label: '删除分组', icon: 'trash-outline', danger: true, onPress: () => setDeleteGroup(actionGroupState.group) },
      ] : []}
      anchorX={actionGroupState?.anchorX ?? 0}
      anchorY={actionGroupState?.anchorY ?? 0}
      dismissAccessibilityLabel="关闭分组菜单"
      onClose={() => setActionGroupState(null)}
      visible={Boolean(actionGroupState)}
    />
    <GroupRenameDialog
      group={renameGroup}
      onClose={() => setRenameGroup(null)}
      onRenamed={reload}
      space={space}
      visible={Boolean(renameGroup)}
    />
    <AppDialog
      danger
      message={deleteGroup ? `删除「${deleteGroup.name}」后，分组内素材会保留并移动到未分组。` : ''}
      onClose={() => setDeleteGroup(null)}
      onPrimary={confirmDeleteGroup}
      primaryLabel="确认删除"
      title="删除分组"
      visible={Boolean(deleteGroup)}
    />
    </>
  );
}

function GroupCardCopy({ group, onOpenGroup, onOpenMenu }: { group: GlobalGroupListItem, onOpenGroup: (ipId: number, groupId: number) => void, onOpenMenu: (group: GlobalGroupListItem, anchorX: number, anchorY: number) => void }) {
  return (
    <View style={styles.groupBody}>
      <View>
        <View style={styles.groupHeader}>
          <Text numberOfLines={1} style={styles.groupName}>
            {group.name}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.groupIpName}>
            {group.ipName}
          </Text>
          {group.description ? (
            <Text numberOfLines={2} style={styles.groupDescription}>
              {group.description}
            </Text>
          ) : null}
      </View>
      <View style={styles.groupFooter}>
        <View style={styles.groupFooterMetaRow}>
          <MediaCountMeta
            color={protoColors.outline}
            groupGap={6}
            iconSize={12}
            imageCount={group.imageCount}
            itemGap={3}
            textStyle={styles.groupFooterMeta}
            videoCount={group.videoCount}
          />
          <Text numberOfLines={1} style={[styles.groupFooterMeta, styles.groupFooterDate]}>
            {formatDate(group.recentUpdatedAt)}
          </Text>
        </View>
        <View style={styles.groupActions}>
          <Pressable
            accessibilityLabel={`更多操作：${group.name}`}
            accessibilityRole="button"
            hitSlop={12}
            onPress={(e) => onOpenMenu(group, e.nativeEvent.pageX, e.nativeEvent.pageY)}
            style={({ pressed }) => [styles.groupActionBtn, pressed && styles.pressed]}
          >
            <MaterialIcons name="more-horiz" size={16} color={protoColors.secondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.8,
  },
  pressedCard: {
    transform: [{ scale: 0.995 }],
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: -16,
    right: -16,
    zIndex: 10,
    backgroundColor: protoColors.surface,
    paddingHorizontal: 16,
  },
  topSection: {
    paddingBottom: 4,
    paddingTop: 2,
    gap: 8,
  },
  topSectionCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    paddingTop: 2,
    gap: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: protoColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  newBtnText: {
    fontFamily: typography.family.base,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    color: protoColors.onPrimary,
    fontWeight: '600',
  },
  ipRail: {
    gap: 6,
    paddingVertical: 2,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  ipRailCollapsed: {
    paddingHorizontal: 0,
  },
  ipScrollCollapsed: {
    flex: 1,
    marginHorizontal: 0,
    maxWidth: '62%',
    marginLeft: 'auto',
  },
  ipPill: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ipPillActive: {
    backgroundColor: protoColors.primary,
  },
  ipPillInactive: {
    backgroundColor: protoColors.surfaceContainerLowest,
    borderColor: 'rgba(196,199,199,0.3)', // outline-variant/30
    borderWidth: StyleSheet.hairlineWidth,
  },
  ipPillCreate: {
    backgroundColor: protoColors.primary,
    borderColor: protoColors.primary,
  },
  ipPillTextCreate: {
    color: protoColors.onPrimary,
  },
  ipPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: protoColors.primary,
  },
  ipPillText: {
    fontFamily: typography.family.base,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    fontWeight: '600',
  },
  ipPillTextActive: {
    color: protoColors.onPrimary,
  },
  ipPillTextInactive: {
    color: protoColors.onSurface,
  },
  ipPillBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  ipPillBadgeInactive: {
    backgroundColor: protoColors.surfaceContainerLow,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },  ipPillBadgeText: {
    fontFamily: typography.family.mono,
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '500',
    letterSpacing: 0.72, // 0.08em
  },
  ipPillBadgeTextActive: {
    color: protoColors.onPrimary,
  },
  ipPillBadgeTextInactive: {
    color: protoColors.secondary,
  },
  list: {
    gap: 10,
    paddingBottom: 24,
  },
  listViewport: {
    flex: 1,
  },
  loadingMore: {
    marginVertical: 16,
  },
  emptyInline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyInlineTitle: {
    fontFamily: typography.family.base,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: protoColors.onSurface,
  },
  emptyInlineDesc: {
    fontFamily: typography.family.base,
    fontSize: 12,
    lineHeight: 16,
    color: protoColors.outline,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyActionBtn: {
    alignItems: 'center',
    backgroundColor: protoColors.primary,
    borderRadius: radius.pill,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyActionBtnText: {
    fontFamily: typography.family.base,
    fontSize: 12,
    fontWeight: '600',
    color: protoColors.onPrimary,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 12,
    textTransform: 'uppercase',
    color: protoColors.outline,
    letterSpacing: 0.8, // 0.08em
    fontWeight: '500',
  },
  sectionType: {
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 12,
    color: protoColors.secondary,
    letterSpacing: 0.8, // 0.08em
    fontWeight: '500',
  },
  groupCardWrapper: {
    // paddingBottom wrapper removed, gap covers it
  },
  groupCardFloating: {
    backgroundColor: protoColors.surfaceContainerLowest,
    borderColor: 'rgba(0,0,0,0.04)', // border-black/[0.04]
    borderRadius: 12,
    borderWidth: 1,
  },
  groupCardInner: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  coverWrap: {
    width: 80,
    height: 80,
    flexShrink: 0,
    position: 'relative',
  },
  coverLayer2: {
    backgroundColor: protoColors.surfaceContainerHigh,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)', // border-black/[0.03]
    transform: [{ translateX: 4 }, { translateY: -4 }],
  },
  coverLayer1: {
    backgroundColor: protoColors.surfaceContainer,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    transform: [{ translateX: 2 }, { translateY: -2 }],
  },
  coverImageContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: protoColors.surfaceContainer,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    overflow: 'hidden',
  },
  coverEmpty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  groupBody: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 2,
    minWidth: 0,
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  groupName: {
    fontFamily: typography.family.base,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: protoColors.primary,
    letterSpacing: -0.075, // -0.005em
    flex: 1,
    paddingRight: 8,
  },
  groupTypeBadge: {
    fontFamily: typography.family.mono,
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '500',
    letterSpacing: 0.72, // 0.08em
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: protoColors.surfaceContainerLow,
    color: protoColors.secondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,199,199,0.3)', // outline-variant/30
    overflow: 'hidden',
  },
  groupIpName: {
    fontFamily: typography.family.base,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.66,
    color: protoColors.secondary,
  },
  groupDescription: {
    fontFamily: typography.family.base,
    fontSize: 11,
    lineHeight: 14,
    color: protoColors.secondary,
    marginTop: 2,
  },
  groupFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  groupFooterMetaRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing[2],
    rowGap: 2, // 极端超长数字折行时保持紧凑行距
    marginRight: spacing[2],
  },
  groupFooterMeta: {
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    letterSpacing: 0.15,
    color: protoColors.outline,
  },
  groupFooterDate: {
    flexShrink: 0,
  },
  groupActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupActionBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: protoColors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupActionBtnPrimary: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: protoColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
















