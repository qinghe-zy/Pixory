import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, interpolateColor, Easing } from 'react-native-reanimated';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { FilterChip } from '../components/FilterChip';
import { IPCard } from '../components/IPCard';
import { PageStateBlock } from '../components/PageStateBlock';
import { RhythmBars } from '../components/RhythmBars';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SearchBar } from '../components/SearchBar';
import { commonButtonCopy, commonEmptyStateCopy, commonErrorCopy } from '../constants/copy';
import { imageRepository, ipRepository, runWithDatabaseSpace, type IpLibraryFilter, type IpListItem, type PixorySpace } from '../database';
import { colors, componentTokens, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { BlurView } from 'expo-blur';
import { usePagedScreenLoad } from '../hooks/usePagedScreenLoad';
import { useToast } from '../components/AppToast';
import { LiquidGlassBezel } from '../components/LiquidGlassBezel';
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
  const {
    items,
    meta: needsOrganizingCount,
    isLoading,
    isLoadingMore,
    errorMessage,
    loadMore,
    reload,
  } = usePagedScreenLoad<IpListItem, number>(
    async (offset) => runWithDatabaseSpace(space, async (db) => {
      const page = await ipRepository.findLibraryItemsPage(db, {
        filter: activeFilter,
        limit: IP_LIBRARY_PAGE_SIZE,
        offset,
      });
      const count = offset === 0 ? await imageRepository.countNeedsOrganizing(db) : undefined;
      return { items: page.items, hasMore: page.hasMore, meta: count };
    }),
    {
      requestKey: JSON.stringify([space, activeFilter, refreshKey]),
      getItemKey: (item) => item.id,
      initialMeta: 0,
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
      </View>
    ),
    [onCreateIp]
  );

  const isLibraryCompletelyEmpty = !isLoading && !errorMessage && items.length === 0 && activeFilter === 'all';
  const isSearchOrFilterEmpty = !isLoading && !errorMessage && items.length === 0 && !isLibraryCompletelyEmpty;

  function handleDeleteIp(ip: IpListItem) {
    setActionIp(ip);
  }

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
        reload();
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
        reload();
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
      reload();
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
      titleSlot={<HomeBrandHeader />}
      titleVariant="brand"
    >
      <View style={styles.topArea}>
        <View style={styles.searchWithDecor}>
          <View style={styles.rhythmDecorRow}>
            <RhythmBars
              barGap={5}
              barWidth={3}
              maxBarHeight={24}
              minBarHeight={7}
            />
            <RhythmBars
              barGap={5}
              barWidth={3}
              maxBarHeight={24}
              minBarHeight={7}
            />
          </View>
          <SearchBar onChangeText={() => undefined} onPress={onOpenGlobalSearch} placeholder="搜索 IP / 分组 / 标签 / 文件名 / 备注" value="" />
        </View>
        {needsOrganizingCount > 0 ? (
          <Pressable onPress={onOpenNeedsOrganizing} style={({ pressed }) => [styles.needsPanel, pressed && styles.pressed]}>
            <View style={styles.needsIcon}>
              <Ionicons color={colors.primary.active} name="sparkles-outline" size={17} />
            </View>
            <Text numberOfLines={1} style={styles.needsText}>待整理 {needsOrganizingCount} 张</Text>
            <Ionicons color={colors.text.secondary} name="chevron-forward" size={15} />
          </Pressable>
        ) : null}
        <View style={styles.filterRow}>
          {FILTER_OPTIONS.map((option) => (
            <FilterChip
              active={activeFilter === option.key}
              key={option.key}
              label={option.label}
              onPress={() => setActiveFilter(option.key)}
            />
          ))}
        </View>
      </View>

      <View style={styles.emptyWrap}>
        <PageStateBlock
          emptyActionLabel={
            isLibraryCompletelyEmpty
              ? commonButtonCopy.createFirstIp
              : activeFilter === 'favorite'
                ? commonButtonCopy.createIp
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
          loading={isLoading}
          loadingDescription="SQLite 数据加载完成后，这里会展示真实的 IP 列表。"
          loadingTitle="正在读取本地资产库"
          onEmptyAction={onCreateIp}
          onRetry={reload}
        >
          <FlatList
            contentContainerStyle={styles.grid}
            data={items}
            keyExtractor={(item) => String(item.id)}
            ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary.default} style={styles.loadingMore} /> : null}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            renderItem={({ item }) => <IPCard ip={item} onLongPress={handleDeleteIp} onPress={onOpenIp} space={space} />}
            showsVerticalScrollIndicator={false}
            style={styles.list}
          />
        </PageStateBlock>
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
    </>
  );
}

function HomeBrandHeader() {
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
    timeT.value = withRepeat(withTiming(Math.PI * 2, { duration: 20000, easing: Easing.linear }), -1, false);
    rot1.value = withRepeat(withTiming(Math.PI * 2, { duration: 10000, easing: Easing.linear }), -1, false);
    rot2.value = withRepeat(withTiming(-Math.PI * 2, { duration: 14000, easing: Easing.linear }), -1, false);
    rot3.value = withRepeat(withTiming(Math.PI * 2, { duration: 18000, easing: Easing.linear }), -1, false);
  }, [timeT, rot1, rot2, rot3]);

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
        <Animated.Text style={[styles.brandGreetingText, textStyle]}>
          {greeting}
        </Animated.Text>
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
      </View>
      <Animated.Text style={[styles.brandSubtitleText, textStyle]}>
        PIXORY · PRIVATE ARCHIVE
      </Animated.Text>
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
    ...shadows.sm,
    shadowColor: '#3A2E1D',
    shadowOpacity: 0.15,
    borderRadius: componentTokens.iconButton.radius,
  },
  addAction: {
    borderRadius: componentTokens.iconButton.radius,
    height: componentTokens.iconButton.size,
    width: componentTokens.iconButton.size,
  },
  addActionBlur: {
    alignItems: 'center',
    borderRadius: componentTokens.iconButton.radius,
    flex: 1,
    justifyContent: 'center',
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
