import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, SectionList, StyleSheet, Text, View, Modal, Dimensions } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { GroupRenameDialog } from '../components/GroupRenameDialog';
import { ListSkeleton } from '../components/ListSkeleton';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SecureImage } from '../components/SecureImage';
import { commonEmptyStateCopy } from '../constants/copy';
import { getGroupTypeLabel, GROUP_TYPE_OPTIONS } from '../constants/groups';
import { BlurView } from 'expo-blur';
import { LiquidGlassBezel } from '../components/LiquidGlassBezel';
import { resolvePersonalCoverBlurRadius } from '../constants/privacy';
import { groupRepository, ipRepository, runWithDatabaseSpace, type GlobalGroupListItem, type IpListItem, type PixorySpace } from '../database';
import { colors, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { usePagedScreenLoad } from '../hooks/usePagedScreenLoad';
import { useToast } from '../components/AppToast';
import { formatDate } from '../utils/formatters';
import { AssetFilterDrawer } from '../components/AssetFilterDrawer';
import { OptionSelectRow } from '../components/OptionSelectRow';

interface GlobalGroupsScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  footer?: ReactNode;
  titleSlot?: ReactNode;
  onCreateFirstIp?: () => void;
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
  refreshToken,
  footer,
  titleSlot,
  onCreateFirstIp,
  onOpenCoverPicker,
  onEditGroup,
  onOpenGroup,
  onImportImagesToGroup,
  onImportVideosToGroup,
}: GlobalGroupsScreenProps) {
  const { showToast } = useToast();
  const [actionGroup, setActionGroup] = useState<GlobalGroupListItem | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GlobalGroupListItem | null>(null);
  const [renameGroup, setRenameGroup] = useState<GlobalGroupListItem | null>(null);
  const [selectedIpId, setSelectedIpId] = useState<number | null>(null);
  const [isIpDrawerOpen, setIsIpDrawerOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const filterBtnRef = useRef<View>(null);
  const {
    items: groups,
    isLoading,
    isLoadingMore,
    errorMessage,
    loadMore,
    reload,
  } = usePagedScreenLoad<GlobalGroupListItem, null>(
    (offset) => runWithDatabaseSpace(space, async (db) => {
      const page = await groupRepository.findOverviewPage(db, {
        ipId: selectedIpId ?? undefined,
        limit: GROUP_PAGE_SIZE,
        offset,
      });
      return { items: page.items, hasMore: page.hasMore };
    }),
    {
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
    isLoadingMore: isLoadingMoreScopes,
    loadMore: loadMoreScopes,
  } = usePagedScreenLoad<IpListItem, null>(
    (offset) => runWithDatabaseSpace(space, async (db) => {
      const page = await ipRepository.findLibraryItemsPage(db, { limit: IP_SCOPE_PAGE_SIZE, offset });
      return { items: page.items, hasMore: page.hasMore };
    }),
    {
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

  const selectedIpName = selectedIpId == null ? '全部 IP' : ipScopes.find((ip) => ip.id === selectedIpId)?.name ?? groups[0]?.ipName ?? '当前 IP';
  const groupedSections = GROUP_TYPE_OPTIONS.map((option) => ({
    ...option,
    data: groups.filter((group) => group.type === option.value),
  })).filter((section) => section.data.length > 0);

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

  const handleFilterPress = () => {
    if (ipScopes.length <= 8) {
      if (isDropdownOpen) {
        setIsDropdownOpen(false);
        return;
      }
      filterBtnRef.current?.measure((x, y, w, h, px, py) => {
        const windowWidth = Dimensions.get('window').width;
        setDropdownPos({ top: py + h + 6, right: windowWidth - px - w });
        setIsDropdownOpen(true);
      });
    } else {
      setIsIpDrawerOpen(true);
    }
  };

  const headerRightAction = (
    <View ref={filterBtnRef}>
      <Pressable onPress={handleFilterPress} style={({ pressed }) => [styles.headerFilterBtn, pressed && styles.pressed]}>
        <BlurView intensity={50} style={styles.headerFilterBlur} tint="light">
          <LiquidGlassBezel radius={16} />
          <View style={styles.headerFilterInner}>
            <Text numberOfLines={1} style={styles.headerFilterText}>{selectedIpName}</Text>
            <Ionicons color={colors.text.secondary} name={ipScopes.length <= 8 ? "chevron-down" : "chevron-back"} size={14} />
          </View>
        </BlurView>
      </Pressable>
    </View>
  );

  return (
    <>
    <ScreenScaffold backgroundVariant="archive" decorativeTitle="Groups" footer={footer} rightAction={headerRightAction} title="分组" titleSlot={titleSlot}>
      <PageStateBlock
        loadingComponent={<ListSkeleton />}
        emptyActionLabel={onCreateFirstIp ? '去首页创建 IP' : undefined}
        emptyDescription="分组需要先归属于一个 IP。先创建或打开 IP，再在详情页新建分组。"
        emptyContainerStyle={styles.emptyGuideOffset}
        emptyIconName="folder-open-outline"
        emptyTitle={commonEmptyStateCopy.noGroupsTitle}
        errorMessage={errorMessage}
        isEmpty={!isLoading && groups.length === 0}
        loading={isLoading}
        loadingDescription="本地分组数据读取完成后，这里会展示全部分组。"
        loadingTitle="正在读取分组"
        onEmptyAction={onCreateFirstIp}
        onRetry={reload}
      >
        <SectionList
          contentContainerStyle={styles.list}
          keyExtractor={(group) => String(group.id)}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary.default} style={styles.loadingMore} /> : null}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item: group }) => <View style={styles.groupCardWrapper}><Pressable onLongPress={() => setActionGroup(group)} onPress={() => onOpenGroup(group.ipId, group.id)} style={({ pressed }) => [styles.groupCardFloating, pressed && styles.pressed]}><View style={styles.groupCardInner}><View style={styles.coverWrap}>{group.coverThumbnailFileUri ? <SecureImage blurRadius={getGroupCoverBlurRadius(group)} contentFit="cover" space={space} style={styles.coverImage} uri={group.coverThumbnailFileUri} /> : <View style={styles.coverEmpty}><Ionicons color={colors.primary.default} name="images-outline" size={22} /></View>}</View><GroupCardCopy group={group} /></View></Pressable></View>}
          renderSectionHeader={({ section }) => <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{section.label}</Text><Text style={styles.sectionCount}>{section.data.length}</Text></View>}
          sections={groupedSections}
          showsVerticalScrollIndicator={false}
          style={styles.listViewport}
        />
      </PageStateBlock>
    </ScreenScaffold>
    <AppActionSheet
      items={actionGroup ? [
        { key: 'view', label: '查看图片', icon: 'images-outline', onPress: () => onOpenGroup(actionGroup.ipId, actionGroup.id) },
        ...(onImportImagesToGroup ? [{ key: 'add-images', label: '添加图片', icon: 'image-outline' as const, onPress: () => onImportImagesToGroup(actionGroup.ipId, actionGroup.id) }] : []),
        ...(onImportVideosToGroup ? [{ key: 'add-videos', label: '添加视频', icon: 'videocam-outline' as const, onPress: () => onImportVideosToGroup(actionGroup.ipId, actionGroup.id) }] : []),
        { key: 'cover', label: actionGroup.coverSource === 'custom' ? '更换封面' : '选择封面', icon: 'image-outline', onPress: () => onOpenCoverPicker(actionGroup.ipId, actionGroup.id) },
        { key: 'rename', label: '重命名', icon: 'text-outline', onPress: () => setRenameGroup(actionGroup) },
        { key: 'edit', label: '编辑分组', icon: 'create-outline', onPress: () => onEditGroup(actionGroup.ipId, actionGroup.id) },
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
      message="删除分组不会删除图片，图片会保留在所属 IP 中。"
      onClose={() => setActionGroup(null)}
      title={actionGroup?.name ?? '分组操作'}
      visible={Boolean(actionGroup)}
    />
    <GroupRenameDialog
      group={renameGroup}
      onClose={() => setRenameGroup(null)}
      onRenamed={reload}
      space={space}
      visible={Boolean(renameGroup)}
    />
      <Modal
        visible={isDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDropdownOpen(false)}
      >
        <Pressable accessibilityLabel="关闭选择" onPress={() => setIsDropdownOpen(false)} style={StyleSheet.absoluteFill} />
        <View style={[styles.menu, { top: dropdownPos.top, right: dropdownPos.right }]}>
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: radius.lg }]}>
            <BlurView intensity={65} style={StyleSheet.absoluteFill} tint="light" />
          </View>
          <LiquidGlassBezel radius={radius.lg} />
          <View style={styles.menuContent}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSelectedIpId(null);
                setIsDropdownOpen(false);
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
            >
              <View style={[StyleSheet.absoluteFill, styles.menuRowBg, selectedIpId === null ? styles.menuRowActiveBg : null]} />
              <Text numberOfLines={1} style={[styles.menuText, selectedIpId === null ? styles.menuTextActive : null]}>全部 IP</Text>
              <Ionicons color={selectedIpId === null ? colors.primary.active : colors.text.tertiary} name={selectedIpId === null ? 'checkmark-circle' : 'ellipse-outline'} size={15} />
            </Pressable>
            {ipScopes.map((ip) => {
              const selected = selectedIpId === ip.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={ip.id}
                  onPress={() => {
                    setSelectedIpId(ip.id);
                    setIsDropdownOpen(false);
                  }}
                  style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                >
                  <View style={[StyleSheet.absoluteFill, styles.menuRowBg, selected ? styles.menuRowActiveBg : null]} />
                  <Text numberOfLines={1} style={[styles.menuText, selected ? styles.menuTextActive : null]}>{ip.name}</Text>
                  <Ionicons color={selected ? colors.primary.active : colors.text.tertiary} name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={15} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
      <AssetFilterDrawer onClose={() => setIsIpDrawerOpen(false)} scrollable={false} visible={isIpDrawerOpen}>
      <OptionSelectRow
        label="全部 IP"
        onPress={() => {
          setSelectedIpId(null);
          setIsIpDrawerOpen(false);
        }}
        selected={selectedIpId === null}
      />
      <FlatList
        data={ipScopes}
        keyExtractor={(ip) => String(ip.id)}
        ListFooterComponent={isLoadingMoreScopes ? <ActivityIndicator color={colors.primary.default} style={styles.loadingMore} /> : null}
        onEndReached={loadMoreScopes}
        onEndReachedThreshold={0.5}
        renderItem={({ item: ip }) => <OptionSelectRow label={ip.name} onPress={() => { setSelectedIpId(ip.id); setIsIpDrawerOpen(false); }} selected={selectedIpId === ip.id} />}
        style={styles.scopeList}
      />
    </AssetFilterDrawer>
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

function GroupCardCopy({ group }: { group: GlobalGroupListItem }) {
  return (
    <View style={styles.groupBody}>
      <View style={styles.groupHeader}>
        <Text numberOfLines={1} style={styles.groupName}>
          {group.name}
        </Text>
        <Text style={styles.groupType}>{getGroupTypeLabel(group.type)}</Text>
      </View>
      <Text numberOfLines={1} style={styles.metaText}>
        {group.ipName}
      </Text>
      <Text style={styles.metaText}>
        {group.imageCount} 张图片 · {formatDate(group.recentUpdatedAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.8,
  },
  list: {
    gap: rhythm.entryCardGap,
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
  },
  listViewport: {
    flex: 1,
  },
  loadingMore: {
    marginVertical: spacing[4],
  },
  scopeList: {
    flex: 1,
  },
  emptyGuideOffset: {
    paddingTop: spacing[8],
  },
  headerFilterBtn: {
    ...shadows.sm,
    shadowColor: '#3A2E1D',
    shadowOpacity: 0.1,
    borderRadius: 16,
    height: 32,
    maxWidth: 140,
    minWidth: 80,
  },
  headerFilterBlur: {
    borderRadius: 16,
    flex: 1,
    overflow: 'hidden',
  },
  headerFilterInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 4,
    flex: 1,
  },
  headerFilterText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    fontSize: 13,
    flexShrink: 1,
  },
  sectionBlock: {
    gap: rhythm.listCardGap,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[1],
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  sectionCount: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  groupCardWrapper: {
    paddingBottom: rhythm.microGap,
  },
  groupCardFloating: {
    backgroundColor: colors.background.elevated,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    ...shadows.sm,
  },
  groupCardInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.listCardGap,
    minHeight: 80,
    padding: spacing[3],
  },
  coverWrap: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    flexShrink: 0,
    height: 74,
    overflow: 'hidden',
    width: 92,
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
    gap: spacing[2],
    minWidth: 0,
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  groupName: {
    ...typography.textStyles.bodyStrong,
    flex: 1,
  },
  groupType: {
    ...typography.textStyles.micro,
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    color: colors.primary.active,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  metaText: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  menu: {
    ...shadows.floating,
    borderRadius: radius.lg,
    minWidth: 156,
    position: 'absolute',
    zIndex: 999,
    elevation: 99,
    overflow: 'hidden',
  },
  menuContent: {
    padding: spacing[2],
    gap: spacing[1],
  },
  menuRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 34,
    paddingHorizontal: spacing[2],
    overflow: 'hidden',
  },
  menuRowBg: {
    backgroundColor: 'transparent',
  },
  menuRowActiveBg: {
    backgroundColor: 'rgba(86, 107, 72, 0.28)',
  },
  menuText: {
    ...typography.textStyles.micro,
    color: colors.text.title,
    flex: 1,
    fontWeight: '600',
    minWidth: 0,
    zIndex: 1,
  },
  menuTextActive: {
    color: colors.primary.dark,
  },
});
