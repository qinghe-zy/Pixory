import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import { FilterChip } from '../components/FilterChip';
import { IPCard } from '../components/IPCard';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SearchBar } from '../components/SearchBar';
import { commonButtonCopy, commonEmptyStateCopy, commonErrorCopy } from '../constants/copy';
import { ipRepository, type IpLibraryFilter, type IpListItem } from '../database';
import { colors, componentTokens, layout, radius, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';

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
  onOpenIp: (ipId: number) => void;
}

export function HomeLibraryScreen({
  refreshKey,
  initialFilter = 'all',
  footer,
  onCreateIp,
  onOpenIp,
}: HomeLibraryScreenProps) {
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<IpLibraryFilter>(initialFilter);
  const { data: items = [], isLoading, errorMessage, reload } = useScreenLoad<IpListItem[]>(
    () =>
      ipRepository.findLibraryItems({
        filter: activeFilter,
        searchText,
      }),
    [activeFilter, refreshKey, searchText],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取 IP 资产失败：${message}`;
      },
      initialData: [],
    }
  );

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

  const isLibraryCompletelyEmpty = !isLoading && !errorMessage && items.length === 0 && !searchText && activeFilter === 'all';
  const isSearchOrFilterEmpty = !isLoading && !errorMessage && items.length === 0 && !isLibraryCompletelyEmpty;

  return (
    <ScreenScaffold
      footer={footer}
      rightAction={rightSlot}
      scrollable
      subtitle="IP 图像资产管理"
      title="Pixory"
      titleVariant="brand"
    >
      <View style={styles.topArea}>
        <SearchBar onChangeText={setSearchText} placeholder="搜索 IP / 关键词 / 标签" value={searchText} />
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
        <HeroBanner coverUri={items[0]?.coverThumbnailFileUri ?? null} />
      </View>

      <View style={styles.emptyWrap}>
        <PageStateBlock
          emptyActionLabel={
            isLibraryCompletelyEmpty
              ? commonButtonCopy.createFirstIp
              : activeFilter === 'favorite'
                ? commonButtonCopy.createIp
                : commonButtonCopy.clearSearch
          }
          emptyDescription={
            isLibraryCompletelyEmpty
              ? commonEmptyStateCopy.noIpsDescription
              : activeFilter === 'favorite'
                ? '你还没有收藏的 IP，可以先创建一个并标记收藏。'
                : '试试更短的关键词，或者切换到其他筛选条件。'
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
                : commonEmptyStateCopy.noSearchResultTitle
          }
          errorMessage={errorMessage}
          errorTitle={commonErrorCopy.listUnavailableTitle}
          isEmpty={isLibraryCompletelyEmpty || isSearchOrFilterEmpty}
          loading={isLoading}
          loadingDescription="SQLite 数据加载完成后，这里会展示真实的 IP 列表。"
          loadingTitle="正在读取本地资产库"
          onEmptyAction={activeFilter === 'favorite' || isLibraryCompletelyEmpty ? onCreateIp : () => setSearchText('')}
          onRetry={reload}
        >
          <View style={styles.grid}>
            {items.map((item) => (
              <IPCard ip={item} key={item.id} onPress={onOpenIp} />
            ))}
          </View>
        </PageStateBlock>
      </View>
    </ScreenScaffold>
  );
}

function HeroBanner({ coverUri }: { coverUri: string | null }) {
  const content = (
    <View style={styles.heroContent}>
      <Text style={styles.heroTitle}>灵感有序{'\n'}美好长存</Text>
      <Text style={styles.heroCaption}>让每一个 IP 都被妥善管理</Text>
    </View>
  );

  if (coverUri) {
    return (
      <ImageBackground imageStyle={styles.heroImage} resizeMode="cover" source={{ uri: coverUri }} style={styles.hero}>
        <View style={styles.heroOverlay}>{content}</View>
      </ImageBackground>
    );
  }

  return <View style={[styles.hero, styles.heroFallback]}>{content}</View>;
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
    gap: spacing[4],
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: componentTokens.filterChip.gap,
  },
  hero: {
    ...shadows.hero,
    borderRadius: radius.xl,
    height: 170,
    overflow: 'hidden',
  },
  heroImage: {
    borderRadius: radius.xl,
  },
  heroOverlay: {
    backgroundColor: colors.overlay.heroSurface,
    flex: 1,
  },
  heroFallback: {
    backgroundColor: colors.support.sky100,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  heroTitle: {
    ...typography.textStyles.heroTitle,
  },
  heroCaption: {
    ...typography.textStyles.heroCaption,
    marginTop: spacing[2],
  },
  emptyWrap: {
    paddingTop: spacing[1],
  },
  grid: {
    columnGap: layout.gridGap,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: layout.gridGap,
  },
});
