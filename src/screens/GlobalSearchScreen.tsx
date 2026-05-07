import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SearchBar } from '../components/SearchBar';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GlobalGroupListItem, type ImageListItem, type IpListItem, type PixorySpace, type TagUsageItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
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
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ips: IpListItem[];
    groups: GlobalGroupListItem[];
    tags: TagUsageItem[];
    images: ImageListItem[];
  }>(
    async () => {
      if (!keyword) {
        return { groups: [], images: [], ips: [], tags: [] };
      }

      const [ips, allGroups, allTags, images] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findLibraryItems(db, { searchText: keyword }),
        groupRepository.findOverview(db),
        tagRepository.findUsageOverview(db),
        imageRepository.findFiltered(db, { mediaType: 'all', searchText: keyword }),
      ]));
      const lower = keyword.toLowerCase();

      return {
        ips,
        groups: allGroups.filter((group) => group.name.toLowerCase().includes(lower) || group.ipName.toLowerCase().includes(lower)),
        tags: allTags.filter((tag) => tag.name.toLowerCase().includes(lower)),
        images,
      };
    },
    [keyword, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `搜索失败：${message}`;
      },
      initialData: { groups: [], images: [], ips: [], tags: [] },
    }
  );
  const ips = data?.ips ?? [];
  const groups = data?.groups ?? [];
  const tags = data?.tags ?? [];
  const images = data?.images ?? [];
  const totalCount = ips.length + groups.length + tags.length + images.length;
  const isEmpty = !isLoading && totalCount === 0;
  const showHistory = !keyword && searchHistory.length > 0;

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
    void removeSearchHistoryItem(space, value).then(setSearchHistory);
  }

  function deleteAllHistory() {
    setSearchHistory([]);
    void clearSearchHistory(space);
  }

  return (
    <ScreenScaffold backgroundVariant="search" decorativeTitle="Search" onBack={onBack} scrollable title="全局搜索">
      <SearchBar onChangeText={onChangeQuery} placeholder="搜 IP / 分组 / 标签 / 文件名 / 备注" value={query} />
      <PageStateBlock
        emptyDescription=""
        emptyIconName="search-outline"
        emptyTitle=""
        errorMessage={errorMessage}
        isEmpty={false}
        loading={isLoading && Boolean(keyword)}
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
    gap: spacing[5],
  },
  emptySpace: {
    minHeight: 360,
  },
  historyBlock: {
    gap: spacing[3],
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
    gap: spacing[2],
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
    gap: spacing[2],
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
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
    gap: spacing[2],
  },
  pressed: {
    opacity: 0.78,
  },
});
