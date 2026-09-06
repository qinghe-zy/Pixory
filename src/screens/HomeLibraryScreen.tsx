import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, Platform, type LayoutChangeEvent, type ListRenderItemInfo } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, interpolateColor, Easing } from 'react-native-reanimated';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { FilterChip } from '../components/FilterChip';
import { IPCard } from '../components/IPCard';
import { IPCardSkeleton } from '../components/IPCardSkeleton';
import { PageStateBlock } from '../components/PageStateBlock';
import { RhythmBars } from '../components/RhythmBars';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ParallaxLightSweep } from '../components/ParallaxLightSweep';
import { SearchBar } from '../components/SearchBar';
import { commonButtonCopy, commonEmptyStateCopy, commonErrorCopy } from '../constants/copy';
import { imageRepository, ipRepository, runWithDatabaseSpace, type IpLibraryFilter, type IpListItem, type PixorySpace } from '../database';
import { colors, componentTokens, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { BlurView } from 'expo-blur';
import { usePagedScreenLoad } from '../hooks/usePagedScreenLoad';
import { useToast } from '../components/AppToast';
import { LiquidGlassBezel } from '../components/LiquidGlassBezel';
import { MagneticLiquidContainer } from '../components/MagneticLiquidContainer';
import { permanentlyDeleteIp, softDeleteIpToTrash } from '../services/ipDeletionService';
import { moveIpBetweenSpaces } from '../services/spaceMigrationService';

const FILTER_OPTIONS: Array<{ key: IpLibraryFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'recent', label: '最近更新' },
  { key: 'favorite', label: '收藏' },
];

const IP_LIBRARY_PAGE_SIZE = 20;

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
}

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
}: HomeLibraryScreenProps) {
  const { showToast } = useToast();
  const [activeFilter, setActiveFilter] = useState<IpLibraryFilter>(initialFilter);
  const [actionIp, setActionIp] = useState<IpListItem | null>(null);
  const [trashIp, setTrashIp] = useState<IpListItem | null>(null);
  const [permanentDeleteIp, setPermanentDeleteIp] = useState<IpListItem | null>(null);
  const [spaceMoveIp, setSpaceMoveIp] = useState<IpListItem | null>(null);
  const [personalPassword, setPersonalPassword] = useState('');
  const [isMovingSpace, setIsMovingSpace] = useState(false);
  const [showSweep, setShowSweep] = useState(true);
  const [listWidth, setListWidth] = useState(0);

  // Persistent dismiss: store the threshold count when user taps X.
  // Banner only shows again if actual count exceeds that threshold.
  const NEEDS_PANEL_DISMISS_FILE = `${FileSystem.documentDirectory ?? ''}pixory/preferences/needsPanelDismiss.json`;
  const [dismissedThreshold, setDismissedThreshold] = useState<number>(-1); // -1 = not yet loaded
  const [needsOrganizingCount, setNeedsOrganizingCount] = useState(0);
  const prevRefreshKey = useRef(refreshKey);

  // Load persisted dismiss threshold once on mount
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistDismissThreshold(count: number) {
    try {
      const dir = `${FileSystem.documentDirectory ?? ''}pixory/preferences/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
      await FileSystem.writeAsStringAsync(NEEDS_PANEL_DISMISS_FILE, JSON.stringify({ threshold: count }));
    } catch {
      // ignore
    }
  }

  // Re-fetch count whenever refreshKey changes (even if component stays mounted in tab)
  useEffect(() => {
    prevRefreshKey.current = refreshKey;
    let isMounted = true;
    void runWithDatabaseSpace(space, async (db) => {
      try {
        const count = await imageRepository.countNeedsOrganizing(db);
        if (isMounted) {
          setNeedsOrganizingCount(count);
        }
      } catch (error) {
        console.warn('Failed to fetch needsOrganizingCount', error);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [space, refreshKey]);

  // Whether to show the needs-organizing banner
  const isNeedsPanelVisible =
    dismissedThreshold >= 0 && // loaded
    needsOrganizingCount > 0 &&
    needsOrganizingCount > dismissedThreshold;

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSweep(false);
    }, 750);
    return () => clearTimeout(timer);
  }, []);

  const isDaytime = useMemo(() => {
    const hour = new Date().getHours();
    return hour >= 5 && hour < 18;
  }, [refreshKey]);

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
        limit: IP_LIBRARY_PAGE_SIZE,
        offset,
      });
      return { items: page.items, hasMore: page.hasMore };
    }),
    {
      requestKey: JSON.stringify([space, activeFilter, refreshKey]),
      getItemKey: (item) => item.id,
      initialMeta: undefined,
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取 IP 资产失败：${message}`;
      },
      onLoadMoreError: (error) => {
        showToast(error instanceof Error ? `加载更多 IP 失败：${error.message}` : '加载更多 IP 失败');
      },
      deferUntilInteractions: true,
    }
  );

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter, refreshKey]);

  const rightSlot = useMemo(
    () => (
        <View style={styles.addActionWrapper}>
          <MagneticLiquidContainer magneticStrength={0.4} stretchFactor={0.03} damping={12}>
            <Pressable
              accessibilityLabel="新建 IP"
              hitSlop={10}
              onPress={onCreateIp}
              style={({ pressed }) => [styles.addAction, pressed && styles.pressed]}
            >
              <BlurView intensity={50} style={styles.addActionBlur} tint="light">
                <LiquidGlassBezel radius={componentTokens.iconButton.radius} />
                <Ionicons color={colors.primary.default} name="add" size={componentTokens.iconButton.iconSize} />
              </BlurView>
            </Pressable>
          </MagneticLiquidContainer>
        </View>
    ),
    [onCreateIp]
  );

  const isLibraryCompletelyEmpty = !isLoading && !errorMessage && items.length === 0 && activeFilter === 'all';
  const isSearchOrFilterEmpty = !isLoading && !errorMessage && items.length === 0 && !isLibraryCompletelyEmpty;

  const handleDeleteIp = useCallback((ip: IpListItem) => {
    setActionIp(ip);
  }, []);

  const renderIpCard = useCallback(
    ({ item, index }: ListRenderItemInfo<IpListItem>) => (
      <IPCard
        imagePriority={index === 0 ? 'high' : 'normal'}
        useGyroEffect={index === 0}
        ip={item}
        onLongPress={handleDeleteIp}
        onPress={onOpenIp}
        space={space}
      />
    ),
    [handleDeleteIp, onOpenIp, space]
  );

  const getIpCardLayout = useCallback(
    (_data: ArrayLike<IpListItem> | null | undefined, index: number) => {
      const length = listWidth / componentTokens.ipCard.aspectRatio;
      return {
        index,
        length,
        offset: index * (length + rhythm.entryCardGap),
      };
    },
    [listWidth]
  );

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setListWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);

  function confirmMoveIpToTrash() {
    if (!trashIp) {
      return;
    }

    const ip = trashIp;
    setTrashIp(null);
    void (async () => {
      try {
        const result = await softDeleteIpToTrash(ip.id, space);
        if (result.ipDeletedCount === 0) {
          throw new Error('没有找到这个 IP。');
        }
        showToast(`已移入回收站，包含 ${result.imageDeletedCount} 张图片`);
        setData((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== ip.id) }));
      } catch (error) {
        showToast(error instanceof Error ? `移入回收站失败：${error.message}` : '移入回收站失败');
      }
    })();
  }

  function confirmPermanentDeleteIp() {
    if (!permanentDeleteIp) {
      return;
    }

    const ip = permanentDeleteIp;
    setPermanentDeleteIp(null);
    void (async () => {
      try {
        const result = await permanentlyDeleteIp(ip.id, space);
        if (result.ipDeletedCount === 0) {
          throw new Error('没有找到这个 IP。');
        }
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
    if (space === 'personal') {
      void confirmMoveSpace(ip, '');
    }
  }

  async function confirmMoveSpace(ip = spaceMoveIp, password = personalPassword) {
    if (!ip || isMovingSpace) {
      return;
    }

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
      backgroundVariant="home"
      footer={footer}
      rightAction={rightSlot}
      titleSlot={<HomeBrandHeader isActive={isActive} />}
      titleVariant="brand"
    >
      <View style={styles.topArea}>
        <View style={styles.searchWithDecor}>
          <MagneticLiquidContainer magneticStrength={0.4} stretchFactor={0.03} damping={12}>
            <View style={styles.rhythmDecorRow}>
              <RhythmBars
                active={isActive}
                barGap={5}
                barWidth={3}
                maxBarHeight={24}
                minBarHeight={7}
                speedMultiplier={isDaytime ? 1.5 : 1}
              />
              <RhythmBars
                active={isActive}
                barGap={5}
                barWidth={3}
                maxBarHeight={24}
                minBarHeight={7}
                speedMultiplier={isDaytime ? 1.5 : 1}
              />
            </View>
          </MagneticLiquidContainer>
          <SearchBar onChangeText={() => undefined} onPress={onOpenGlobalSearch} placeholder="搜索 IP / 分组 / 标签 / 文件名 / 备注" value="" />
        </View>
        {isNeedsPanelVisible ? (
          <Pressable onPress={onOpenNeedsOrganizing} style={({ pressed }) => [styles.needsPanel, pressed && styles.pressed]}>
            <View style={styles.needsIcon}>
              <Ionicons color={colors.primary.active} name="sparkles-outline" size={17} />
            </View>
            <Text numberOfLines={1} style={styles.needsText}>待整理 {needsOrganizingCount} 张</Text>
            <Ionicons color={colors.text.secondary} name="chevron-forward" size={15} />
            <Pressable 
              hitSlop={15} 
              onPress={(e) => {
                e.stopPropagation();
                // Persist threshold so banner won't reappear unless count grows
                setDismissedThreshold(needsOrganizingCount);
                void persistDismissThreshold(needsOrganizingCount);
              }}
              style={styles.needsCloseButton}
            >
              <Ionicons color={colors.text.tertiary} name="close" size={18} />
            </Pressable>
          </Pressable>
        ) : null}
        <View style={styles.filterRow}>
          {FILTER_OPTIONS.map((option) => (
            <FilterChip
              key={option.key}
              active={activeFilter === option.key}
              label={option.label}
              onPress={() => setActiveFilter(option.key)}
            />
          ))}
        </View>
      </View>

      <View onLayout={handleListLayout} style={styles.emptyWrap}>
        <FlatList
          contentContainerStyle={[styles.grid, items.length === 0 && styles.emptyGrid]}
          data={items}
          getItemLayout={listWidth > 0 ? getIpCardLayout : undefined}
          initialNumToRender={3}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={
            isLoading ? (
              <IPCardSkeleton />
            ) : (
              <PageStateBlock
                emptyActionLabel={
                  isLibraryCompletelyEmpty
                    ? commonButtonCopy.createFirstIp
                    : commonButtonCopy.createIp
                }
                emptyDescription={
                  isLibraryCompletelyEmpty
                    ? commonEmptyStateCopy.noIpsDescription
                    : activeFilter === 'favorite'
                      ? '你还没有收藏的 IP，可以先创建一个并标记收藏。'
                      : '切换到其他筛选条件，或创建新的 IP。'
                }
                emptyContainerStyle={styles.emptyGuideOffset}
                emptyIconName={
                  activeFilter === 'favorite'
                    ? 'star-outline'
                    : isLibraryCompletelyEmpty
                      ? 'archive-outline'
                      : 'search-outline'
                }
                emptyTitle={
                  isLibraryCompletelyEmpty
                    ? commonEmptyStateCopy.noIpsTitle
                    : activeFilter === 'favorite'
                      ? commonEmptyStateCopy.noFavoritesTitle
                      : '当前筛选下没有 IP'
                }
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
          renderItem={renderIpCard}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          windowSize={5}
        />
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
      message={spaceMoveIp && space === 'normal' ? `将「${spaceMoveIp.name}」移入隐私空间。需要先验证隐私密码，复制和校验目标空间完成后才会清理普通空间数据。` : ''}
      onClose={() => {
        if (!isMovingSpace) {
          setSpaceMoveIp(null);
          setPersonalPassword('');
        }
      }}
      onPrimary={() => void confirmMoveSpace()}
      primaryDisabled={space === 'normal' && !personalPassword.trim()}
      primaryLabel={isMovingSpace ? '正在迁移' : '移入隐私空间'}
      title="移入隐私空间"
      visible={Boolean(spaceMoveIp && space === 'normal')}
    >
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
    </AppDialog>
    <AppActionSheet
      items={actionIp ? [
        {
          key: 'space',
          label: space === 'normal' ? '移入隐私空间' : '移出隐私空间',
          icon: space === 'normal' ? 'lock-closed-outline' : 'lock-open-outline',
          meta: space === 'normal' ? '需要验证隐私密码' : '移动到普通空间',
          onPress: () => startMoveSpace(actionIp),
        },
        {
          key: 'trash',
          label: '移入回收站',
          icon: 'archive-outline',
          meta: '推荐，保留本地文件',
          onPress: () => setTrashIp(actionIp),
        },
        {
          key: 'permanent',
          label: '永久删除',
          icon: 'trash-outline',
          danger: true,
          meta: '删除数据库记录、原图和缩略图',
          onPress: () => setPermanentDeleteIp(actionIp),
        },
      ] : []}
      message="移入回收站更安全；永久删除会清理 Pixory 私有存储中的文件。"
      onClose={() => setActionIp(null)}
      title={actionIp?.name ?? 'IP 操作'}
      visible={Boolean(actionIp)}
    />
      <ParallaxLightSweep fadeOutDuration={750} opacity={0.35} visible={isActive && (showSweep || isLoading)} />
    </>
  );
}

function HomeBrandHeader({ isActive }: { isActive: boolean }) {
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 9) return '早上好';
    if (hour >= 9 && hour < 12) return '上午好';
    if (hour >= 12 && hour < 14) return '中午好';
    if (hour >= 14 && hour < 18) return '下午好';
    if (hour >= 18 && hour < 23) return '晚上好';
    return '夜深了';
  }, []);
  
  const timeT = useSharedValue(0);
  const rot1 = useSharedValue(0);
  const rot2 = useSharedValue(0);
  const rot3 = useSharedValue(0);

  useEffect(() => {
    if (!isActive) {
      cancelAnimation(timeT);
      cancelAnimation(rot1);
      cancelAnimation(rot2);
      cancelAnimation(rot3);
      timeT.value = 0;
      rot1.value = 0;
      rot2.value = 0;
      rot3.value = 0;
      return;
    }
    timeT.value = withRepeat(withTiming(Math.PI * 2, { duration: 20000, easing: Easing.linear }), -1, false);
    rot1.value = withRepeat(withTiming(Math.PI * 2, { duration: 10000, easing: Easing.linear }), -1, false);
    rot2.value = withRepeat(withTiming(-Math.PI * 2, { duration: 14000, easing: Easing.linear }), -1, false);
    rot3.value = withRepeat(withTiming(Math.PI * 2, { duration: 18000, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(timeT);
      cancelAnimation(rot1);
      cancelAnimation(rot2);
      cancelAnimation(rot3);
    };
  }, [isActive, timeT, rot1, rot2, rot3]);

  const textStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      timeT.value,
      [0, Math.PI / 4, (Math.PI * 2) / 3, Math.PI, (Math.PI * 5) / 4, (Math.PI * 4) / 3, Math.PI * 2],
      [
        colors.support.sky300,
        colors.support.mint300,
        colors.support.sky300,
        colors.support.lilac300,
        colors.support.mint300,
        colors.support.sky300,
        colors.support.sky300,
      ]
    );
    return { color };
  });

  const star1Style = useAnimatedStyle(() => {
    const a = rot1.value;
    const x = 9 * Math.cos(a);
    const y = 9 * Math.sin(a) * 0.5; // cos(60deg)
    const scale = 1.0 + 0.3 * Math.sin(a);
    return { transform: [{ translateX: x }, { translateY: y }, { scale }] };
  });

  const star2Style = useAnimatedStyle(() => {
    const a = rot2.value;
    const x = 12 * Math.cos(a) * 0.5; // cos(60deg)
    const y = 12 * Math.sin(a);
    const scale = 1.0 + 0.3 * Math.sin(a);
    return { transform: [{ translateX: x }, { translateY: y }, { scale }] };
  });

  const star3Style = useAnimatedStyle(() => {
    const a = rot3.value;
    const x = 15 * Math.cos(a);
    const y = 15 * Math.sin(a) * 0.342; // cos(70deg)
    const scale = 1.0 + 0.3 * Math.sin(a);
    return { transform: [{ translateX: x }, { translateY: y }, { scale }] };
  });

  return (
    <View style={styles.brandHeaderContainer}>
      <View style={styles.brandGreetingRow}>
        <MagneticLiquidContainer magneticStrength={0.7} stretchFactor={0.07} damping={10}>
          <Animated.Text style={[styles.brandGreetingText, textStyle, { padding: 10, margin: -10 }]}>
            {greeting}
          </Animated.Text>
        </MagneticLiquidContainer>
        <MagneticLiquidContainer magneticStrength={0.8} stretchFactor={0.1} damping={12}>
          <View style={styles.binaryStarsContainer}>
            {/* 极淡的虚线轨道 - 还原原始正确的旋转顺序 (先 rotateZ 再 rotateX)，并将直径+1补偿线宽导致的半像素偏移 */}
            <View style={[styles.faintOrbit, { width: 19, height: 19, borderRadius: 9.5, transform: [{ rotateX: '60deg' }] }]} />
            <View style={[styles.faintOrbit, { width: 25, height: 25, borderRadius: 12.5, transform: [{ rotateY: '60deg' }] }]} />
            <View style={[styles.faintOrbit, { width: 31, height: 31, borderRadius: 15.5, transform: [{ rotateZ: '45deg' }, { rotateX: '70deg' }] }]} />
            
            {/* 星星实体 */}
            <Animated.View style={[styles.binaryStar, { backgroundColor: colors.support.mint300 }, star1Style]} />
            <Animated.View style={[styles.binaryStar, { backgroundColor: colors.support.sky300 }, star2Style]} />
            <View style={{ position: 'absolute', transform: [{ rotateZ: '45deg' }] }}>
              <Animated.View style={[styles.binaryStar, { backgroundColor: colors.support.lilac300 }, star3Style]} />
            </View>
          </View>
        </MagneticLiquidContainer>
      </View>
      <MagneticLiquidContainer magneticStrength={0.6} stretchFactor={0.05} damping={10}>
        <Animated.Text style={[styles.brandSubtitleText, textStyle, { padding: 10, margin: -10 }]}>
          PIXORY · PRIVATE ARCHIVE
        </Animated.Text>
      </MagneticLiquidContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  brandHeaderContainer: {
    justifyContent: 'center',
    paddingVertical: spacing[1],
  },
  brandGreetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  binaryStarsContainer: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12, // 稍微拉开一点和文字的间距
  },
  faintOrbit: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.strong,
    borderStyle: 'dashed',
    opacity: 0.3,
  },
  orbitWrapper: {
    position: 'absolute',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  binaryStar: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.9,
  },
  brandGreetingText: {
    fontWeight: 'bold',
    fontSize: 28,
    includeFontPadding: false,
    letterSpacing: 2,
  },
  brandSubtitleText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 9,
    color: colors.text.secondary,
    letterSpacing: 1.5,
    marginTop: 2,
    marginLeft: 0, // 对齐主标题文字的左边缘
  },
  pressed: {
    opacity: 0.8,
  },
  addActionWrapper: {
    elevation: 1, // 强制 Android 创建 RenderNode 从而使 BlurView 正常工作
    shadowColor: 'transparent', // 彻底消除阴影导致的毛玻璃发黑现象
    borderRadius: componentTokens.iconButton.radius,
  },
  addAction: {
    ...shadows.sm,
    shadowColor: '#3A2E1D',
    shadowOpacity: 0.05,
    borderRadius: componentTokens.iconButton.radius,
    height: componentTokens.iconButton.size,
    width: componentTokens.iconButton.size,
  },
  addActionBlur: {
    width: componentTokens.iconButton.size,
    height: componentTokens.iconButton.size,
    borderRadius: componentTokens.iconButton.radius,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  topArea: {
    gap: spacing[3],
  },
  searchWithDecor: {
    gap: 2, // tiny breathing room between bars and search bar
  },
  rhythmDecorRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 5,
    height: 24,
    marginLeft: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: componentTokens.filterChip.gap,
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
    paddingTop: spacing[3],
  },
  emptyGuideOffset: {
    paddingTop: spacing[8],
  },
  grid: {
    gap: rhythm.entryCardGap,
    paddingBottom: spacing[6],
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
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
});
