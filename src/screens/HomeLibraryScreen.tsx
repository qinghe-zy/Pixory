import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { FilterChip } from '../components/FilterChip';
import { IPCard } from '../components/IPCard';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SearchBar } from '../components/SearchBar';
import { commonButtonCopy, commonEmptyStateCopy, commonErrorCopy } from '../constants/copy';
import { imageRepository, ipRepository, runWithDatabaseSpace, type IpLibraryFilter, type IpListItem, type PixorySpace } from '../database';
import { colors, componentTokens, radius, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import { permanentlyDeleteIp, softDeleteIpToTrash } from '../services/ipDeletionService';

const FILTER_OPTIONS: Array<{ key: IpLibraryFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'recent', label: '最近更新' },
  { key: 'favorite', label: '收藏' },
];

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
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ items: IpListItem[]; needsOrganizingCount: number }>(
    async () => {
      const [items, needsOrganizingCount] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findLibraryItems(db, {
          filter: activeFilter,
        }),
        imageRepository.countNeedsOrganizing(db),
      ]));
      return { items, needsOrganizingCount };
    },
    [activeFilter, refreshKey, space],
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
          <View style={styles.grid}>
            {items.map((item) => (
              <IPCard ip={item} key={item.id} onLongPress={handleDeleteIp} onPress={onOpenIp} space={space} />
            ))}
          </View>
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
    <AppActionSheet
      items={actionIp ? [
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
  emptyGuideOffset: {
    paddingTop: spacing[8],
  },
  grid: {
    gap: spacing[4],
  },
});
