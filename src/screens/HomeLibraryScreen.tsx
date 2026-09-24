import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type ListRenderItemInfo } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiAnchoredContextMenu } from '../components/ai/AiAnchoredContextMenu';
import { AppDialog } from '../components/AppDialog';
import { IPCard } from '../components/IPCard';
import { IPCardSkeleton } from '../components/IPCardSkeleton';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { FloatingFooterContext } from '../components/AppScreen';
import { useContext } from 'react';
import { ParallaxLightSweep } from '../components/ParallaxLightSweep';
import { commonButtonCopy, commonEmptyStateCopy, commonErrorCopy } from '../constants/copy';
import { imageRepository, ipRepository, runWithDatabaseSpace, type IpLibraryFilter, type IpListItem, type PixorySpace } from '../database';
import { IpSortMenuButton } from '../components/IpSortMenuButton';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { usePagedScreenLoad } from '../hooks/usePagedScreenLoad';
import { useIpListPreferences } from '../services/ipListPreferences';
import { useToast } from '../components/AppToast';
import { permanentlyDeleteIp, softDeleteIpToTrash } from '../services/ipDeletionService';
import { moveIpBetweenSpaces } from '../services/spaceMigrationService';

const FILTER_OPTIONS: Array<{ key: IpLibraryFilter; label: string }> = [
  { key: 'all', label: '全部 IP' },
  { key: 'favorite', label: '收藏' },
  { key: 'recent', label: '最近更新' },
];

const IP_LIBRARY_PAGE_SIZE = 20;

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

interface HomeLibraryScreenProps {
  refreshKey: number;
  isActive?: boolean;
  initialFilter?: IpLibraryFilter;
  space?: PixorySpace;
  footer?: ReactNode;
  onCreateIp: () => void;
  onOpenGlobalSearch: () => void;
  onOpenIp: (ipId: number) => void;
  onOpenNeedsOrganizing: () => void;
  onImportIp?: (ipId: number) => void;
  onEditIp?: (ipId: number) => void;
}

type LayoutItem = 
  | { type: 'hero'; item: IpListItem; id: string }
  | { type: 'standard'; item: IpListItem; id: string }
  | { type: 'grid_row'; items: IpListItem[]; id: string };

export function HomeLibraryScreen({
  refreshKey,
  isActive = true,
  initialFilter = 'all',
  space = 'normal',
  footer,
  onCreateIp,
  onOpenGlobalSearch,
  onOpenIp,
  onOpenNeedsOrganizing,
  onImportIp,
  onEditIp,
}: HomeLibraryScreenProps) {
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const floatingFooterHeight = useContext(FloatingFooterContext);
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const stage1Opacity = scrollY.interpolate({
    inputRange: [10, 30],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const stage1Translate = scrollY.interpolate({
    inputRange: [10, 30],
    outputRange: [10, 0],
    extrapolate: 'clamp',
  });

  const stage2Opacity = scrollY.interpolate({
    inputRange: [20, 40],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const stage2Translate = scrollY.interpolate({
    inputRange: [20, 40],
    outputRange: [10, 0],
    extrapolate: 'clamp',
  });

  const [activeFilter, setActiveFilter] = useState<IpLibraryFilter>(initialFilter);
  const { sortOrder: activeSortOrder, setSortOrder: setActiveSortOrder } = useIpListPreferences(space, 'default');
  const [actionMenuState, setActionMenuState] = useState<{ ip: IpListItem; anchorX: number; anchorY: number } | null>(null);
  const [trashIp, setTrashIp] = useState<IpListItem | null>(null);
  const [permanentDeleteIp, setPermanentDeleteIp] = useState<IpListItem | null>(null);
  const [spaceMoveIp, setSpaceMoveIp] = useState<IpListItem | null>(null);
  const [personalPassword, setPersonalPassword] = useState('');
  const [isMovingSpace, setIsMovingSpace] = useState(false);
  const [showSweep, setShowSweep] = useState(true);
  const [listWidth, setListWidth] = useState(0);

  const NEEDS_PANEL_DISMISS_FILE = `${FileSystem.documentDirectory ?? ''}pixory/preferences/needsPanelDismiss.json`;
  const [dismissedThreshold, setDismissedThreshold] = useState<number>(-1);
  const [needsOrganizingCount, setNeedsOrganizingCount] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const info = await FileSystem.getInfoAsync(NEEDS_PANEL_DISMISS_FILE);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(NEEDS_PANEL_DISMISS_FILE);
          const parsed = JSON.parse(raw) as { threshold?: number };
          setDismissedThreshold(parsed.threshold ?? 0);
        } else {
          setDismissedThreshold(0);
        }
      } catch {
        setDismissedThreshold(0);
      }
    })();
  }, []);

  async function persistDismissThreshold(count: number) {
    try {
      const dir = `${FileSystem.documentDirectory ?? ''}pixory/preferences/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
      await FileSystem.writeAsStringAsync(NEEDS_PANEL_DISMISS_FILE, JSON.stringify({ threshold: count }));
    } catch {
    }
  }

  useEffect(() => {
    let isMounted = true;
    void runWithDatabaseSpace(space, async (db) => {
      try {
        const count = await imageRepository.countNeedsOrganizing(db);
        if (isMounted) {
          setNeedsOrganizingCount(count);
        }
      } catch (error) {
      }
    });
    return () => {
      isMounted = false;
    };
  }, [space, refreshKey]);

  const isNeedsPanelVisible = dismissedThreshold >= 0 && needsOrganizingCount > 0 && needsOrganizingCount > dismissedThreshold;

  const filterThreshold = isNeedsPanelVisible ? 120 : 60;
  const stage3Opacity = scrollY.interpolate({
    inputRange: [filterThreshold, filterThreshold + 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const stage3Translate = scrollY.interpolate({
    inputRange: [filterThreshold, filterThreshold + 20],
    outputRange: [10, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSweep(false);
    }, 750);
    return () => clearTimeout(timer);
  }, []);

  const {
    items,
    isLoading,
    isLoadingMore,
    errorMessage,
    loadMore,
    reload,
    setData,
  } = usePagedScreenLoad<IpListItem, undefined>(
    async (offset) => runWithDatabaseSpace(space, async (db) => {
      const page = await ipRepository.findLibraryItemsPage(db, {
        filter: activeFilter,
        orderBy: activeSortOrder,
        limit: IP_LIBRARY_PAGE_SIZE,
        offset,
      });
      return { items: page.items, hasMore: page.hasMore };
    }),
    {
      requestKey: JSON.stringify([space, activeFilter, activeSortOrder, refreshKey]),
      getItemKey: (item) => item.id,
      initialMeta: undefined,
      formatError: (error) => `读取 IP 资产失败：${error instanceof Error ? error.message : '未知错误'}`,
      onLoadMoreError: (error) => showToast(error instanceof Error ? `加载更多 IP 失败：${error.message}` : '加载更多 IP 失败'),
      deferUntilInteractions: true,
    }
  );

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter, refreshKey]);

  const rightSlot = useMemo(
    () => (
      <Pressable
        accessibilityLabel="新建或导入"
        onPress={onCreateIp}
        style={({ pressed }) => [styles.newIpButton, pressed && { opacity: 0.95, transform: [{ scale: 0.95 }] }]}
      >
        <Ionicons name="add" size={18} color="#ffffff" />
        <Text style={styles.newIpButtonText}>新建IP</Text>
      </Pressable>
    ),
    [onCreateIp]
  );

  const isLibraryCompletelyEmpty = !isLoading && !errorMessage && items.length === 0 && activeFilter === 'all';
  const isSearchOrFilterEmpty = !isLoading && !errorMessage && items.length === 0 && !isLibraryCompletelyEmpty;

  const handleTogglePin = useCallback(async (ip: IpListItem) => {
    try {
      await runWithDatabaseSpace(space, (db) => ipRepository.setPinned(db, ip.id, !ip.isPinned));
      void reload();
    } catch (error) {
      showToast(ip.isPinned ? '取消置顶失败' : '置顶失败');
    }
  }, [space, reload, showToast]);

  const layoutItems = useMemo(() => {
    const result: LayoutItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (i === 0) {
        result.push({ type: 'hero', item: items[i], id: `hero-${items[i].id}` });
      } else if (i === 1 || i === 2) {
        result.push({ type: 'standard', item: items[i], id: `std-${items[i].id}` });
      } else {
        const row = [items[i]];
        if (i + 1 < items.length) {
          row.push(items[i + 1]);
        }
        result.push({ type: 'grid_row', items: row, id: `row-${items[i].id}` });
        i++; // Skip the next item as it's included in this row
      }
    }
    return result;
  }, [items]);

  const renderIpCard = useCallback(
    ({ item, index }: ListRenderItemInfo<LayoutItem>) => {
      if (item.type === 'hero' || item.type === 'standard') {
        return (
          <IPCard
            index={index}
            imagePriority={item.type === 'hero' ? 'high' : 'normal'}
            layoutVariant={item.type}
            ip={item.item}
            onOptionsPress={(ip, pageX, pageY) => setActionMenuState({ ip, anchorX: pageX, anchorY: pageY })}
            onPress={onOpenIp}
            onImportPress={onImportIp}
            onEditPress={onEditIp}
            space={space}
          />
        );
      } else if (item.type === 'grid_row') {
        return (
          <View style={styles.gridRow}>
            <View style={styles.gridCol}>
              <IPCard
                index={index}
                layoutVariant="grid"
                ip={item.items[0]}
                onOptionsPress={(ip, pageX, pageY) => setActionMenuState({ ip, anchorX: pageX, anchorY: pageY })}
                onPress={onOpenIp}
                onImportPress={onImportIp}
                onEditPress={onEditIp}
                space={space}
              />
            </View>
            <View style={styles.gridCol}>
              {item.items[1] ? (
                <IPCard
                  index={index}
                  layoutVariant="grid"
                  ip={item.items[1]}
                  onOptionsPress={(ip, pageX, pageY) => setActionMenuState({ ip, anchorX: pageX, anchorY: pageY })}
                  onPress={onOpenIp}
                  onImportPress={onImportIp}
                  onEditPress={onEditIp}
                  space={space}
                />
              ) : null}
            </View>
          </View>
        );
      }
      return null;
    },
    [onOpenIp, onImportIp, onEditIp, space]
  );

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setListWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);

  function confirmMoveIpToTrash() {
    if (!trashIp) return;
    const ip = trashIp;
    setTrashIp(null);
    void (async () => {
      try {
        const result = await softDeleteIpToTrash(ip.id, space);
        if (result.ipDeletedCount === 0) throw new Error('没有找到这个 IP。');
        showToast(`已移入回收站，包含 ${result.imageDeletedCount} 张图片`);
        setData((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== ip.id) }));
      } catch (error) {
        showToast(error instanceof Error ? `移入回收站失败：${error.message}` : '移入回收站失败');
      }
    })();
  }

  function confirmPermanentDeleteIp() {
    if (!permanentDeleteIp) return;
    const ip = permanentDeleteIp;
    setPermanentDeleteIp(null);
    void (async () => {
      try {
        const result = await permanentlyDeleteIp(ip.id, space);
        if (result.ipDeletedCount === 0) throw new Error('没有找到这个 IP。');
        showToast(`已永久删除 ${result.imageDeletedCount} 张图片，文件失败 ${result.fileFailures.length} 个`);
        setData((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== ip.id) }));
      } catch (error) {
        showToast(error instanceof Error ? `永久删除失败：${error.message}` : '永久删除失败');
      }
    })();
  }

  function startMoveSpace(ip: IpListItem) {
    setSpaceMoveIp(ip);
    setPersonalPassword('');
  }

  async function confirmMoveSpace(ip = spaceMoveIp, password = personalPassword) {
    if (!ip || isMovingSpace) return;
    setIsMovingSpace(true);
    try {
      const result = await moveIpBetweenSpaces({
        ipId: ip.id,
        sourceSpace: space,
        targetSpace: space === 'normal' ? 'personal' : 'normal',
        personalPassword: password,
      });
      showToast(`已${space === 'normal' ? '移入隐私空间' : '移出隐私空间'}，包含 ${result.assetCount} 个素材`);
      setSpaceMoveIp(null);
      setPersonalPassword('');
      setData((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== ip.id) }));
    } catch (error) {
      showToast(error instanceof Error ? `空间迁移失败：${error.message}` : '空间迁移失败');
    } finally {
      setIsMovingSpace(false);
    }
  }

  return (
    <>
    <ScreenScaffold
      backgroundColor="#f9f9f9"
      footer={footer}
      showHeader={false}
      fullScreen={true}
      contentContainerStyle={{ paddingHorizontal: 0, gap: 0, paddingBottom: 0 }}
    >
      <AnimatedFlatList
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        onLayout={handleListLayout}
        contentContainerStyle={[styles.grid, items.length === 0 && styles.emptyGrid, { paddingTop: insets.top, paddingHorizontal: 6, paddingBottom: floatingFooterHeight + 4 }]}
        data={layoutItems}
        initialNumToRender={3}
        keyExtractor={(item: any) => item.id}
        ListHeaderComponent={
          <View style={styles.topArea}>
            <View style={[styles.headerTitleRow, { paddingHorizontal: 10 }]}>
              <HomeBrandHeader />
              {rightSlot}
            </View>
            <View style={{ paddingHorizontal: 10 }}>
              <Pressable style={styles.searchContainer} onPress={onOpenGlobalSearch}>
                <Ionicons name="search" size={17} color="#444748" />
                <Text style={styles.searchInputPlaceholder}>搜索 IP企划 / 标签 / 角色 / 备注...</Text>
              </Pressable>
            </View>
            {isNeedsPanelVisible && (
              <View style={{ paddingHorizontal: 10 }}>
                <Pressable onPress={onOpenNeedsOrganizing} style={styles.needsPanel}>
                  <View style={styles.needsIcon}>
                    <Ionicons color={colors.primary.active} name="sparkles-outline" size={17} />
                  </View>
                  <Text numberOfLines={1} style={styles.needsText}>待整理 {needsOrganizingCount} 张</Text>
                  <Ionicons color={colors.text.secondary} name="chevron-forward" size={15} />
                  <Pressable 
                    hitSlop={15} 
                    onPress={(e) => {
                      e.stopPropagation();
                      setDismissedThreshold(needsOrganizingCount);
                      void persistDismissThreshold(needsOrganizingCount);
                    }}
                    style={styles.needsCloseButton}
                  >
                    <Ionicons color={colors.text.tertiary} name="close" size={18} />
                  </Pressable>
                </Pressable>
              </View>
            )}
            <View style={styles.filterRow}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterPillsRow}
                data={FILTER_OPTIONS}
                keyExtractor={item => item.key}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setActiveFilter(item.key)}
                    style={activeFilter === item.key ? styles.filterPillActive : styles.filterPill}
                  >
                    <Text style={activeFilter === item.key ? styles.filterPillTextActive : styles.filterPillText}>
                      {item.label}
                    </Text>
                    {item.key === 'all' && (
                      <Text style={[
                        styles.filterPillCount,
                        activeFilter === item.key ? { color: 'rgba(255,255,255,0.8)' } : undefined
                      ]}>
                        {items.length}
                      </Text>
                    )}
                  </Pressable>
                )}
              />
              <View style={styles.filterSpacer} />
              <IpSortMenuButton orderBy={activeSortOrder} onChange={setActiveSortOrder} />
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <IPCardSkeleton />
          ) : (
            <PageStateBlock
              emptyActionLabel={isLibraryCompletelyEmpty ? commonButtonCopy.createFirstIp : commonButtonCopy.createIp}
              emptyDescription={isLibraryCompletelyEmpty ? commonEmptyStateCopy.noIpsDescription : '当前筛选下没有 IP。'}
              emptyContainerStyle={styles.emptyGuideOffset}
              emptyIconName="archive-outline"
              emptyTitle={isLibraryCompletelyEmpty ? commonEmptyStateCopy.noIpsTitle : '空空如也'}
              errorMessage={errorMessage}
              errorTitle={commonErrorCopy.listUnavailableTitle}
              isEmpty={isLibraryCompletelyEmpty || isSearchOrFilterEmpty}
              loading={false}
              onEmptyAction={onCreateIp}
              onRetry={reload}
            >
              <View />
            </PageStateBlock>
          )
        }
        ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary.default} style={styles.loadingMore} /> : null}
        maxToRenderPerBatch={4}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        renderItem={renderIpCard as any}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        windowSize={5}
      />

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
        {/* Status bar is always covered by a solid background to prevent overlap */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: '#f9f9f9', zIndex: 1 }} />
        
        {/* Sticky header background animates its opacity */}
        <Animated.View style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: 52, backgroundColor: '#f9f9f9', opacity: headerBgOpacity, zIndex: 1 }} pointerEvents="none" />
        
        <View style={{ paddingTop: insets.top, height: insets.top + 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 }} pointerEvents="box-none">
           <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} pointerEvents="box-none">
             <Animated.View style={{ opacity: stage2Opacity, transform: [{ translateY: stage2Translate }] }}>
                <Pressable onPress={onOpenGlobalSearch} style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#f3f3f4', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="search" size={15} color="#5e5e5e" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#646464', display: listWidth < 350 ? 'none' : 'flex' }}>快速检索...</Text>
                </Pressable>
             </Animated.View>
           </View>
           <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} pointerEvents="box-none">
             <Animated.View style={{ opacity: stage3Opacity, transform: [{ translateY: stage3Translate }] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f3f4', borderRadius: 14, padding: 2 }}>
                  {FILTER_OPTIONS.map(item => (
                    <Pressable
                      key={item.key}
                      onPress={() => setActiveFilter(item.key)}
                      style={[
                        { height: 24, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
                        activeFilter === item.key && { backgroundColor: '#ffffff' }
                      ]}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: activeFilter === item.key ? '#000000' : '#5e5e5e' }}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
             </Animated.View>
             <Animated.View style={{ opacity: stage1Opacity, transform: [{ translateY: stage1Translate }] }}>
                <Pressable onPress={onCreateIp} style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#000000', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="add" size={14} color="#ffffff" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#ffffff' }}>新建</Text>
                </Pressable>
             </Animated.View>
           </View>
        </View>
      </View>
    </ScreenScaffold>
    <AppDialog
      danger
      message={trashIp ? `将「${trashIp.name}」移入回收站，并软删除该 IP 下全部图片。原图和缩略图仍保留在 Pixory 本地私有存储。` : ''}
      onClose={() => setTrashIp(null)}
      onPrimary={confirmMoveIpToTrash}
      primaryLabel="移入回收站"
      title="移入回收站"
      visible={Boolean(trashIp)}
    />
    <AppDialog
      danger
      message={permanentDeleteIp ? `将永久删除「${permanentDeleteIp.name}」及其图片记录、分组、导入批次，并删除 Pixory 私有存储中的原图和缩略图。此操作不可恢复。` : ''}
      onClose={() => setPermanentDeleteIp(null)}
      onPrimary={confirmPermanentDeleteIp}
      primaryLabel="永久删除"
      title="永久删除 IP"
      visible={Boolean(permanentDeleteIp)}
    />
    <AppDialog
      message={spaceMoveIp ? (space === 'normal' ? `将「${spaceMoveIp.name}」移入隐私空间。需要先验证隐私密码，复制和校验目标空间完成后才会清理普通空间数据。` : `将「${spaceMoveIp.name}」移出隐私空间。复制和校验目标空间完成后才会清理隐私空间数据。`) : ''}
      onClose={() => {
        if (!isMovingSpace) {
          setSpaceMoveIp(null);
          setPersonalPassword('');
        }
      }}
      onPrimary={() => void confirmMoveSpace()}
      primaryDisabled={space === 'normal' && !personalPassword.trim()}
      primaryLabel={isMovingSpace ? '正在迁移' : (space === 'normal' ? '移入隐私空间' : '移出隐私空间')}
      title={space === 'normal' ? '移入隐私空间' : '移出隐私空间'}
      visible={Boolean(spaceMoveIp)}
    >
      {space === 'normal' ? (
        <TextInput
          secureTextEntry
          editable={!isMovingSpace}
          onChangeText={setPersonalPassword}
          placeholder="输入隐私密码"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.passwordInput}
          value={personalPassword}
        />
      ) : (
        <Text style={{ color: colors.text.secondary, marginTop: 8, fontSize: 14 }}>移出后，普通空间下任何人可见，无需密码即可查看，确定要移出吗？</Text>
      )}
    </AppDialog>
    <AiAnchoredContextMenu
      actions={actionMenuState ? [
        {
          key: 'pin',
          label: actionMenuState.ip.isPinned ? '取消置顶' : 'IP 置顶',
          icon: actionMenuState.ip.isPinned ? 'pin' : 'pin-outline',
          onPress: () => void handleTogglePin(actionMenuState.ip),
        },
        {
          key: 'space',
          label: space === 'normal' ? '移入隐私空间' : '移出隐私空间',
          icon: space === 'normal' ? 'lock-closed-outline' : 'lock-open-outline',
          onPress: () => startMoveSpace(actionMenuState.ip),
        },
        {
          key: 'trash',
          label: '移入回收站',
          icon: 'archive-outline',
          onPress: () => setTrashIp(actionMenuState.ip),
        },
        {
          key: 'permanent',
          label: '永久删除',
          icon: 'trash-outline',
          danger: true,
          onPress: () => setPermanentDeleteIp(actionMenuState.ip),
        },
      ] : []}
      anchorX={actionMenuState?.anchorX ?? 0}
      anchorY={actionMenuState?.anchorY ?? 0}
      dismissAccessibilityLabel="关闭菜单"
      onClose={() => setActionMenuState(null)}
      visible={Boolean(actionMenuState)}
    />
      <ParallaxLightSweep fadeOutDuration={750} opacity={0.35} visible={isActive && (showSweep || isLoading)} />
    </>
  );
}

function HomeBrandHeader() {
  const [storageText, setStorageText] = useState('... GB / ... GB');

  useEffect(() => {
    let mounted = true;
    async function fetchStorage() {
      try {
        const free = await FileSystem.getFreeDiskStorageAsync();
        const total = await FileSystem.getTotalDiskCapacityAsync();
        if (mounted) {
          const used = total - free;
          const formatGB = (bytes: number) => (bytes / 1024 / 1024 / 1024).toFixed(1);
          setStorageText(`${formatGB(used)} GB / ${formatGB(total)} GB`);
        }
      } catch (error) {
        console.warn('Failed to fetch disk storage:', error);
      }
    }
    void fetchStorage();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.brandHeaderContainer}>
      <Text style={styles.brandGreetingText}>Pixory</Text>
      <Text style={styles.brandSubtitleText}>{storageText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandHeaderContainer: {
    justifyContent: 'center',
  },
  brandGreetingText: {
    fontFamily: typography.family.serifItalic,
    fontSize: 22,
    color: '#000000',
    lineHeight: 26,
    letterSpacing: -0.5,
  },
  brandSubtitleText: {
    fontFamily: typography.family.mono,
    fontSize: 10,
    color: '#747878',
    letterSpacing: 0.8,
  },
  newIpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: 8,
    height: 36,
    paddingHorizontal: 12,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  newIpButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  headerTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 },
  topArea: {
    gap: 12,
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    backgroundColor: '#f3f3f4',
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  searchInputPlaceholder: {
    flex: 1,
    fontSize: 13,
    color: '#747878',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterPill: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  filterPillActive: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#000000',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a1c1c',
  },
  filterPillTextActive: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  filterPillCount: {
    fontSize: 10,
    fontFamily: typography.family.mono,
    color: '#747878',
    opacity: 0.8,
  },
  filterSpacer: {
    flex: 1,
  },
  needsPanel: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 46,
    paddingHorizontal: spacing[3],
  },
  needsIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.sm,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  needsCloseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: spacing[2],
  },
  needsText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    paddingTop: 12,
  },
  emptyGuideOffset: {
    paddingTop: spacing[8],
  },
  grid: {
    /* dynamic paddingBottom applied inline */
  },
  gridRow: {
    flexDirection: 'row',
    
    paddingBottom: 16,
    gap: 12,
  },
  gridCol: {
    flex: 1,
  },
  emptyGrid: {
    flexGrow: 1,
  },
  list: {
    flex: 1,
  },
  loadingMore: {
    marginVertical: spacing[4],
  },
  passwordInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.body,
    height: 48,
    marginTop: spacing[2],
    paddingHorizontal: spacing[3],
  },
});

