import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { FilterChip } from '../components/FilterChip';
import { IPCard } from '../components/IPCard';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SearchBar } from '../components/SearchBar';
import { commonButtonCopy, commonEmptyStateCopy, commonErrorCopy } from '../constants/copy';
import { imageRepository, ipRepository, type IpLibraryFilter, type IpListItem } from '../database';
import { colors, componentTokens, radius, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';

const FILTER_OPTIONS: Array<{ key: IpLibraryFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'recent', label: '最近更新' },
  { key: 'favorite', label: '收藏' },
];

interface HomeLibraryScreenProps {
  refreshKey: number;
  initialFilter?: IpLibraryFilter;
  footer?: ReactNode;
  onCreateIp: () => void;
  onOpenGlobalSearch: () => void;
  onOpenIp: (ipId: number) => void;
  onOpenNeedsOrganizing: () => void;
}

export function HomeLibraryScreen({
  refreshKey,
  initialFilter = 'all',
  footer,
  onCreateIp,
  onOpenGlobalSearch,
  onOpenIp,
  onOpenNeedsOrganizing,
}: HomeLibraryScreenProps) {
  const { showToast } = useToast();
  const [activeFilter, setActiveFilter] = useState<IpLibraryFilter>(initialFilter);
  const [deleteIp, setDeleteIp] = useState<IpListItem | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ items: IpListItem[]; needsOrganizingCount: number }>(
    async () => {
      const [items, needsOrganizingCount] = await Promise.all([
        ipRepository.findLibraryItems({
          filter: activeFilter,
        }),
        imageRepository.countNeedsOrganizing(),
      ]);
      return { items, needsOrganizingCount };
    },
    [activeFilter, refreshKey],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取 IP 资产失败：${message}`;
      },
      initialData: { items: [], needsOrganizingCount: 0 },
    }
  );
  const items = data?.items ?? [];
  const needsOrganizingCount = data?.needsOrganizingCount ?? 0;

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter, refreshKey]);

  const rightSlot = useMemo(
    () => (
      <Pressable
        accessibilityLabel="新建 IP"
        hitSlop={10}
        onPress={onCreateIp}
        style={({ pressed }) => [styles.addAction, pressed && styles.pressed]}
      >
        <Ionicons color={colors.primary.default} name="add" size={componentTokens.iconButton.iconSize} />
      </Pressable>
    ),
    [onCreateIp]
  );

  const isLibraryCompletelyEmpty = !isLoading && !errorMessage && items.length === 0 && activeFilter === 'all';
  const isSearchOrFilterEmpty = !isLoading && !errorMessage && items.length === 0 && !isLibraryCompletelyEmpty;

  function handleDeleteIp(ip: IpListItem) {
    setDeleteIp(ip);
  }

  function confirmDeleteIp() {
    if (!deleteIp) {
      return;
    }

    const ip = deleteIp;
    setDeleteIp(null);
    void (async () => {
      try {
        const deletedCount = await ipRepository.deleteById(ip.id);
        if (deletedCount === 0) {
          throw new Error('没有找到这个 IP。');
        }
        showToast('已删除 IP');
        reload();
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showToast(`删除 IP 失败：${message}`);
      }
    })();
  }

  return (
    <>
    <ScreenScaffold
      footer={footer}
      rightAction={rightSlot}
      scrollable
      subtitle="IP 图像资产管理"
      title="Pixory"
      titleVariant="brand"
    >
      <View style={styles.topArea}>
        <SearchBar onChangeText={() => undefined} onPress={onOpenGlobalSearch} placeholder="搜索 IP / 分组 / 标签 / 文件名 / 备注" value="" />
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
          <View style={styles.grid}>
            {items.map((item) => (
              <IPCard ip={item} key={item.id} onLongPress={handleDeleteIp} onPress={onOpenIp} />
            ))}
          </View>
        </PageStateBlock>
      </View>
    </ScreenScaffold>
    <AppDialog
      danger
      message={deleteIp ? `将删除「${deleteIp.name}」及其空分组信息。包含图片记录的 IP 需要先删除图片并清空回收站。` : ''}
      onClose={() => setDeleteIp(null)}
      onPrimary={confirmDeleteIp}
      primaryLabel="确认删除"
      title="删除 IP"
      visible={Boolean(deleteIp)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.8,
  },
  addAction: {
    ...shadows.xs,
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderColor: colors.border.default,
    borderRadius: componentTokens.iconButton.radius,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 2,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    minWidth: componentTokens.iconButton.size,
    width: componentTokens.iconButton.size,
    zIndex: 2,
  },
  topArea: {
    gap: spacing[3],
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
    paddingTop: spacing[3],
  },
  grid: {
    gap: spacing[4],
  },
});
