import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { AppDialog } from '../components/AppDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SearchBar } from '../components/SearchBar';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GlobalGroupListItem, type ImageListItem, type IpListItem, type PixorySpace, type TagUsageItem } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import {
  addSearchHistoryItem,
  clearSearchHistory,
  loadSearchHistory,
  removeSearchHistoryItem,
} from '../services/searchHistoryService';

interface GlobalSearchScreenProps {
  space?: PixorySpace;
  query: string;
  onChangeQuery: (value: string) => void;
  onBack: () => void;
  onOpenIp: (ipId: number) => void;
  onOpenGroup: (ipId: number, groupId: number) => void;
  onOpenTag: (tagId: number) => void;
  onOpenImageDetail: (imageId: number) => void;
}

const SEARCH_RESULT_LIMIT = 20;

export function GlobalSearchScreen({
  space = 'normal',
  query,
  onChangeQuery,
  onBack,
  onOpenIp,
  onOpenGroup,
  onOpenTag,
  onOpenImageDetail,
}: GlobalSearchScreenProps) {
  const keyword = query.trim();
  const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
  const resultKey = JSON.stringify([space, debouncedKeyword]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<string | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ips: IpListItem[];
    groups: GlobalGroupListItem[];
    tags: TagUsageItem[];
    images: ImageListItem[];
    resultKey: string;
  }>(
    async () => {
      if (!debouncedKeyword) {
        return { groups: [], images: [], ips: [], tags: [], resultKey };
      }

      const [ipPage, groups, tagPage, imagePage] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findLibraryItemsPage(db, { searchText: debouncedKeyword, limit: SEARCH_RESULT_LIMIT }),
        groupRepository.findOverviewSearch(db, debouncedKeyword, SEARCH_RESULT_LIMIT),
        tagRepository.findUsageOverviewPage(db, { searchText: debouncedKeyword, limit: SEARCH_RESULT_LIMIT }),
        imageRepository.findFilteredPage(db, { mediaType: 'all', searchText: debouncedKeyword, limit: SEARCH_RESULT_LIMIT }),
      ]));

      return {
        ips: ipPage.items,
        groups,
        tags: tagPage.items,
        images: imagePage.items,
        resultKey,
      };
    },
    [debouncedKeyword, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `搜索失败：${message}`;
      },
      initialData: { groups: [], images: [], ips: [], tags: [], resultKey: '' },
    }
  );
  const isCurrentResult = data?.resultKey === resultKey && keyword === debouncedKeyword;
  const ips = isCurrentResult ? data.ips : [];
  const groups = isCurrentResult ? data.groups : [];
  const tags = isCurrentResult ? data.tags : [];
  const images = isCurrentResult ? data.images : [];
  const totalCount = ips.length + groups.length + tags.length + images.length;
  const isSearchLoading = Boolean(keyword) && (isLoading || !isCurrentResult);
  const isEmpty = !isSearchLoading && totalCount === 0;
  const showHistory = !keyword && searchHistory.length > 0;
  const suggestions = keyword
    ? buildSearchSuggestions({
        keyword,
        history: searchHistory,
        ips,
        groups,
        tags,
      })
    : [];

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    let isMounted = true;

    void loadSearchHistory(space).then((nextHistory) => {
      if (isMounted) {
        setSearchHistory(nextHistory);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [space]);

  useEffect(() => {
    if (!keyword) {
      return;
    }

    const timer = setTimeout(() => {
      void addSearchHistoryItem(space, keyword).then(setSearchHistory);
    }, 700);

    return () => clearTimeout(timer);
  }, [keyword, space]);

  function useHistoryItem(value: string) {
    onChangeQuery(value);
    void addSearchHistoryItem(space, value).then(setSearchHistory);
  }

  function deleteHistoryItem(value: string) {
    setDeleteConfirmItem(value);
  }

  function confirmDeleteHistoryItem() {
    if (!deleteConfirmItem) {
      return;
    }
    const value = deleteConfirmItem;
    setDeleteConfirmItem(null);
    void removeSearchHistoryItem(space, value).then(setSearchHistory);
  }

  function deleteAllHistory() {
    setClearConfirmVisible(true);
  }

  function confirmDeleteAllHistory() {
    setSearchHistory([]);
    setClearConfirmVisible(false);
    void clearSearchHistory(space);
  }

  return (
    <>
      <ScreenScaffold backgroundVariant="search" decorativeTitle="Search" onBack={onBack} scrollable title="全局搜索">
        <SearchBar onChangeText={onChangeQuery} placeholder="搜 IP / 分组 / 标签 / 文件名 / 备注" value={query} />
        <PageStateBlock
          emptyDescription=""
          emptyIconName="search-outline"
          emptyTitle=""
          errorMessage={isCurrentResult ? errorMessage : null}
          isEmpty={false}
          loading={isSearchLoading}
          loadingDescription="正在搜索本地 SQLite 数据。"
          loadingTitle="搜索中"
          onRetry={reload}
        >
          {showHistory ? (
            <SearchHistoryList
              history={searchHistory}
              onClearAll={deleteAllHistory}
              onDeleteItem={deleteHistoryItem}
              onUseItem={useHistoryItem}
            />
          ) : isEmpty ? (
            <View style={styles.emptySpace} />
          ) : (
            <View style={styles.content}>
              {suggestions.length > 0 ? <SearchSuggestionList onPick={onChangeQuery} suggestions={suggestions} /> : null}
              <ResultSection title="IP" count={ips.length}>
                {ips.map((ip) => (
                  <ResultRow key={ip.id} label={ip.name} meta={`${ip.imageCount} 张图片 · ${ip.groupCount} 个分组`} onPress={() => onOpenIp(ip.id)} />
                ))}
              </ResultSection>
              <ResultSection title="分组" count={groups.length}>
                {groups.map((group) => (
                  <ResultRow key={group.id} label={group.name} meta={`${group.ipName} · ${group.imageCount} 张`} onPress={() => onOpenGroup(group.ipId, group.id)} />
                ))}
              </ResultSection>
              <ResultSection title="标签" count={tags.length}>
                {tags.map((tag) => (
                  <ResultRow key={tag.id} label={`#${tag.name}`} meta={`${tag.imageCount} 张图片`} onPress={() => onOpenTag(tag.id)} />
                ))}
              </ResultSection>
              <ResultSection title="图片" count={images.length}>
                <View style={styles.grid}>
                  {images.map((image) => (
                    <ThumbnailTile image={image} key={image.id} onPress={onOpenImageDetail} space={space} />
                  ))}
                </View>
              </ResultSection>
            </View>
          )}
        </PageStateBlock>
      </ScreenScaffold>
      <AppDialog
        danger
        message="清空后不会影响本地素材，只会移除搜索历史。"
        onClose={() => setClearConfirmVisible(false)}
        onPrimary={confirmDeleteAllHistory}
        primaryLabel="清空"
        title="清空搜索历史"
        visible={clearConfirmVisible}
      />
      <AppDialog
        danger
        message={deleteConfirmItem ? `删除「${deleteConfirmItem}」这条搜索记录？` : ''}
        onClose={() => setDeleteConfirmItem(null)}
        onPrimary={confirmDeleteHistoryItem}
        primaryLabel="删除"
        title="删除搜索记录"
        visible={deleteConfirmItem != null}
      />
    </>
  );
}

interface SearchSuggestion {
  key: string;
  label: string;
  meta: string;
}

function buildSearchSuggestions({
  keyword,
  history,
  ips,
  groups,
  tags,
}: {
  keyword: string;
  history: string[];
  ips: IpListItem[];
  groups: GlobalGroupListItem[];
  tags: TagUsageItem[];
}): SearchSuggestion[] {
  const suggestions = new Map<string, SearchSuggestion>();
  const lowerKeyword = keyword.toLowerCase();
  for (const item of history.filter((item) => item.toLowerCase().includes(lowerKeyword)).slice(0, 2)) {
    suggestions.set(`history:${item}`, { key: `history:${item}`, label: item, meta: '历史' });
  }
  for (const ip of ips.slice(0, 2)) {
    suggestions.set(`ip:${ip.id}`, { key: `ip:${ip.id}`, label: ip.name, meta: 'IP' });
  }
  for (const group of groups.slice(0, 2)) {
    suggestions.set(`group:${group.id}`, { key: `group:${group.id}`, label: group.name, meta: '分组' });
  }
  for (const tag of tags.slice(0, 2)) {
    suggestions.set(`tag:${tag.id}`, { key: `tag:${tag.id}`, label: `#${tag.name}`, meta: '标签' });
  }
  return [...suggestions.values()].slice(0, 6);
}

function SearchSuggestionList({ onPick, suggestions }: { onPick: (value: string) => void; suggestions: SearchSuggestion[] }) {
  return (
    <View style={styles.suggestionBlock}>
      <Text style={styles.suggestionTitle}>建议</Text>
      <View style={styles.suggestionList}>
        {suggestions.map((suggestion) => (
          <Pressable key={suggestion.key} onPress={() => onPick(suggestion.label.replace(/^#/, ''))} style={({ pressed }) => [styles.suggestionPill, pressed && styles.pressed]}>
            <Text numberOfLines={1} style={styles.suggestionLabel}>{suggestion.label}</Text>
            <Text numberOfLines={1} style={styles.suggestionMeta}>{suggestion.meta}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SearchHistoryList({
  history,
  onClearAll,
  onDeleteItem,
  onUseItem,
}: {
  history: string[];
  onClearAll: () => void;
  onDeleteItem: (value: string) => void;
  onUseItem: (value: string) => void;
}) {
  return (
    <View style={styles.historyBlock}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>搜索记录</Text>
        <Pressable accessibilityLabel="清空全部搜索记录" hitSlop={8} onPress={onClearAll}>
          <Text style={styles.clearHistoryText}>清空全部</Text>
        </Pressable>
      </View>
      <View style={styles.historyList}>
        {history.map((item) => (
          <Pressable
            accessibilityHint="长按删除这条搜索记录"
            accessibilityLabel={`搜索 ${item}`}
            key={item}
            onLongPress={() => onDeleteItem(item)}
            onPress={() => onUseItem(item)}
            style={({ pressed }) => [styles.historyPill, pressed && styles.pressed]}
          >
            <Ionicons color={colors.text.secondary} name="time-outline" size={15} />
            <Text numberOfLines={1} style={styles.historyPillText}>{item}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ResultSection({ children, count, title }: { children: ReactNode; count: number; title: string }) {
  if (count === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title} · {count}</Text>
      {children}
    </View>
  );
}

function ResultRow({ label, meta, onPress }: { label: string; meta: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>{label}</Text>
        <Text numberOfLines={1} style={styles.rowMeta}>{meta}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: rhythm.screenSectionGap,
  },
  emptySpace: {
    minHeight: 360,
  },
  historyBlock: {
    gap: rhythm.listCardGap,
    paddingTop: spacing[1],
  },
  historyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyTitle: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
  },
  clearHistoryText: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
    fontWeight: '700',
  },
  historyList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  historyPill: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    maxWidth: '100%',
    minHeight: 38,
    paddingHorizontal: spacing[3],
  },
  historyPillText: {
    ...typography.textStyles.body,
    color: colors.text.body,
    maxWidth: 260,
  },
  section: {
    gap: rhythm.listCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  suggestionBlock: {
    gap: rhythm.microGap,
  },
  suggestionTitle: {
    ...typography.textStyles.micro,
    color: colors.text.placeholder,
    fontWeight: '700',
  },
  suggestionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.microGap,
  },
  suggestionPill: {
    alignItems: 'center',
    minHeight: 32,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    maxWidth: '48%',
    paddingHorizontal: spacing[2],
  },
  suggestionLabel: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '700',
    flexShrink: 1,
    maxWidth: 112,
  },
  suggestionMeta: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '700',
  },
  row: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  rowCopy: {
    gap: spacing[1],
  },
  rowTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  rowMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  pressed: {
    opacity: 0.78,
  },
});
