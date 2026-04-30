import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ipRepository, type IpLibraryFilter, type IpListItem } from '../database';
import { colors, componentTokens, layout, shadows, spacing, typography } from '../design/tokens';
import { AppScreen } from '../components/AppScreen';
import { ContentCard } from '../components/ContentCard';
import { EmptyState } from '../components/EmptyState';
import { FilterChip } from '../components/FilterChip';
import { Header } from '../components/Header';
import { IPCard } from '../components/IPCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { SearchBar } from '../components/SearchBar';

const FILTER_OPTIONS: Array<{ key: IpLibraryFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'recent', label: '最近更新' },
  { key: 'favorite', label: '收藏' },
];

interface HomeLibraryScreenProps {
  refreshKey: number;
  initialFilter?: IpLibraryFilter;
  onCreateIp: () => void;
  onOpenIp: (ipId: number) => void;
  onOpenImportDevelopment?: () => void;
}

export function HomeLibraryScreen({
  refreshKey,
  initialFilter = 'all',
  onCreateIp,
  onOpenIp,
  onOpenImportDevelopment,
}: HomeLibraryScreenProps) {
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<IpLibraryFilter>(initialFilter);
  const [items, setItems] = useState<IpListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  async function handleQuickCreateTestIp() {
    try {
      const createdIp = await ipRepository.create({
        name: `RegressionIP_${Date.now()}`,
        description: 'Dev-only regression test IP',
      });
      setSearchText('');
      setActiveFilter('recent');
      setReloadKey((current) => current + 1);
      onOpenIp(createdIp.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setErrorMessage(`快速创建测试 IP 失败：${message}`);
    }
  }

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter, refreshKey]);

  useEffect(() => {
    let isMounted = true;

    async function loadIps() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const records = await ipRepository.findLibraryItems({
          filter: activeFilter,
          searchText,
        });

        if (isMounted) {
          setItems(records);
        }
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取 IP 资产失败：${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadIps();

    return () => {
      isMounted = false;
    };
  }, [activeFilter, refreshKey, reloadKey, searchText]);

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
    <AppScreen scrollable>
      <Header rightSlot={rightSlot} sideWidth={componentTokens.iconButton.size} title="IP资产库" />

      <View style={styles.topArea}>
        <SearchBar onChangeText={setSearchText} placeholder="搜索IP名称或关键词" value={searchText} />
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
        <View style={styles.actionRow}>
          <PrimaryButton label="新建IP" onPress={onCreateIp} />
        </View>
        {/* Dev-only regression helpers must stay out of the formal action area. */}
        {__DEV__ ? (
          <ContentCard style={styles.devToolsCard}>
            <Text style={styles.devToolsTitle}>开发回归入口</Text>
            <Text style={styles.devToolsHint}>
              仅用于开发回归，必须保持与正式“新建IP”入口隔离，避免影响正式点击区域。
            </Text>
            <View style={styles.devToolsActions}>
              <PrimaryButton label="快速建测试IP" onPress={handleQuickCreateTestIp} variant="outline" />
              {onOpenImportDevelopment ? (
                <PrimaryButton label="导入检查" onPress={onOpenImportDevelopment} variant="outline" />
              ) : null}
            </View>
          </ContentCard>
        ) : null}
      </View>

      {errorMessage ? (
        <View style={styles.feedbackCard}>
          <Text style={styles.feedbackTitle}>列表暂时不可用</Text>
          <Text style={styles.feedbackText}>{errorMessage}</Text>
          <PrimaryButton label="重新加载" onPress={() => setReloadKey((current) => current + 1)} variant="outline" />
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.feedbackCard}>
          <Text style={styles.feedbackTitle}>正在读取本地资产库</Text>
          <Text style={styles.feedbackText}>SQLite 数据加载完成后，这里会展示真实的 IP 列表。</Text>
        </View>
      ) : null}

      {isLibraryCompletelyEmpty ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            actionLabel="创建第一个IP"
            description="创建第一个IP，开始整理你的图片与形象素材"
            onAction={onCreateIp}
            title="还没有IP资产"
          />
        </View>
      ) : null}

      {isSearchOrFilterEmpty ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            actionLabel={activeFilter === 'favorite' ? '新建IP' : '清空搜索'}
            description={
              activeFilter === 'favorite'
                ? '你还没有收藏的 IP，可以先创建一个并标记收藏。'
                : '试试更短的关键词，或者切换到其他筛选条件。'
            }
            iconName={activeFilter === 'favorite' ? 'star-outline' : 'search-outline'}
            onAction={activeFilter === 'favorite' ? onCreateIp : () => setSearchText('')}
            title={activeFilter === 'favorite' ? '还没有收藏的IP' : '没有找到匹配结果'}
          />
        </View>
      ) : null}

      {!isLoading && !errorMessage && items.length > 0 ? (
        <View style={styles.grid}>
          {items.map((item) => (
            <IPCard ip={item} key={item.id} onPress={onOpenIp} />
          ))}
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.8,
  },
  addAction: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: componentTokens.iconButton.radius,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    minWidth: componentTokens.iconButton.size,
    zIndex: 2,
    elevation: 2,
    width: componentTokens.iconButton.size,
  },
  topArea: {
    gap: spacing[3],
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: componentTokens.filterChip.gap,
  },
  actionRow: {
    gap: spacing[3],
  },
  devToolsCard: {
    gap: spacing[3],
  },
  devToolsTitle: {
    ...typography.textStyles.sectionTitle,
  },
  devToolsHint: {
    ...typography.textStyles.caption,
  },
  devToolsActions: {
    gap: spacing[3],
  },
  feedbackCard: {
    ...shadows.xs,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    padding: spacing[5],
  },
  feedbackTitle: {
    ...typography.textStyles.sectionTitle,
  },
  feedbackText: {
    ...typography.textStyles.body,
  },
  emptyWrap: {
    paddingTop: spacing[5],
  },
  grid: {
    columnGap: layout.gridGap,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: layout.gridGap,
  },
});
