import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import pinyinMatch from 'pinyin-match';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { searchGlobalMessages, searchGlobalThreads, type AiHomeThreadItem } from '../ai/aiChatService';
import { listRoleCards } from '../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../ai/types';
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
  type SearchHistoryItem,
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
  onOpenThread?: (threadId: string) => void;
  onOpenRoleCard?: (roleCardId: string) => void;
  onOpenHistory?: () => void;
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
  onOpenThread,
  onOpenRoleCard,
  onOpenHistory,
}: GlobalSearchScreenProps) {
  const keyword = query.trim();
  const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
  const resultKey = JSON.stringify([space, debouncedKeyword]);
  
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [historyEditMode, setHistoryEditMode] = useState(false);

  // Recommendations
  const [allRoleCards, setAllRoleCards] = useState<AiRoleCardRecord[]>([]);
  const [recommendedRoleCards, setRecommendedRoleCards] = useState<AiRoleCardRecord[]>([]);

  useEffect(() => {
    let isMounted = true;
    void listRoleCards(space).then((cards) => {
      if (!isMounted) return;
      setAllRoleCards(cards);
      setRecommendedRoleCards(cards.slice(0, 8)); // Initial 8 items
    });
    return () => { isMounted = false; };
  }, [space]);

  const handleRefreshTrending = () => {
    if (allRoleCards.length <= 8) return; // Not enough to shuffle meaningfully
    const shuffled = [...allRoleCards].sort(() => 0.5 - Math.random());
    setRecommendedRoleCards(shuffled.slice(0, 8));
  };

  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ips: IpListItem[];
    groups: GlobalGroupListItem[];
    tags: TagUsageItem[];
    images: ImageListItem[];
    threads: AiHomeThreadItem[];
    messages: { id: string; threadId: string; threadTitle: string; content: string; createdAt: string }[];
    roles: AiRoleCardRecord[];
    resultKey: string;
  }>(
    async () => {
      if (!debouncedKeyword) {
        return { groups: [], images: [], ips: [], tags: [], threads: [], messages: [], roles: [], resultKey };
      }

      const [ipPage, groups, tagPage, imagePage, allRoles, threads, messagesRes] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findLibraryItemsPage(db, { searchText: debouncedKeyword, limit: SEARCH_RESULT_LIMIT }),
        groupRepository.findOverviewSearch(db, debouncedKeyword, SEARCH_RESULT_LIMIT),
        tagRepository.findUsageOverviewPage(db, { searchText: debouncedKeyword, limit: SEARCH_RESULT_LIMIT }),
        imageRepository.findFilteredPage(db, { mediaType: 'all', searchText: debouncedKeyword, limit: SEARCH_RESULT_LIMIT }),
        listRoleCards(space),
        searchGlobalThreads({ space, query: debouncedKeyword, limit: SEARCH_RESULT_LIMIT }),
        searchGlobalMessages({ space, query: debouncedKeyword, limit: SEARCH_RESULT_LIMIT }),
      ]));

      // Client-side pinyin filter for roles
      const filteredRoles = allRoles.filter((role) => pinyinMatch.match(role.name, debouncedKeyword)).slice(0, SEARCH_RESULT_LIMIT);

      return {
        ips: ipPage.items,
        groups,
        tags: tagPage.items,
        images: imagePage.items,
        roles: filteredRoles,
        threads,
        messages: messagesRes.results.map((res) => ({
          id: res.messageId,
          threadId: res.threadId,
          threadTitle: res.threadTitle || 'Chat',
          content: res.content,
          createdAt: res.createdAt,
        })),
        resultKey,
      };
    },
    [debouncedKeyword, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `搜索失败：${message}`;
      },
      initialData: { groups: [], images: [], ips: [], tags: [], threads: [], messages: [], roles: [], resultKey: '' },
    }
  );

  const isCurrentResult = data?.resultKey === resultKey && keyword === debouncedKeyword;
  const ips = isCurrentResult ? data.ips : [];
  const groups = isCurrentResult ? data.groups : [];
  const tags = isCurrentResult ? data.tags : [];
  const images = isCurrentResult ? data.images : [];
  const roles = isCurrentResult ? data.roles : [];
  const threads = isCurrentResult ? data.threads : [];
  const messages = isCurrentResult ? data.messages : [];

  const totalCount = ips.length + groups.length + tags.length + images.length + roles.length + threads.length + messages.length;
  const isSearchLoading = Boolean(keyword) && (isLoading || !isCurrentResult);
  const isEmpty = !isSearchLoading && totalCount === 0;
  const showHistory = !keyword;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    let isMounted = true;
    void loadSearchHistory(space).then((nextHistory) => {
      if (isMounted) setSearchHistory(nextHistory);
    });
    return () => { isMounted = false; };
  }, [space]);

  useEffect(() => {
    if (!keyword) return;
    const timer = setTimeout(() => {
      void addSearchHistoryItem(space, keyword).then(setSearchHistory);
    }, 700);
    return () => clearTimeout(timer);
  }, [keyword, space]);

  function useHistoryItem(value: string) {
    onChangeQuery(value);
    void addSearchHistoryItem(space, value).then(setSearchHistory);
  }

  function deleteHistoryItem(id: string) {
    void removeSearchHistoryItem(space, id).then(setSearchHistory);
  }

  function confirmDeleteAllHistory() {
    setSearchHistory([]);
    setClearConfirmVisible(false);
    void clearSearchHistory(space);
  }

  return (
    <>
      <ScreenScaffold backgroundVariant="search" decorativeTitle="Search" onBack={onBack} scrollable title="全局搜索">
        <SearchBar onChangeText={onChangeQuery} placeholder="搜聊天 / 记录 / 角色 / 素材..." value={query} />
        
        <Pressable style={{ flex: 1 }} onPress={() => setHistoryEditMode(false)}>
          <PageStateBlock
            emptyDescription=""
            emptyIconName="search-outline"
            emptyTitle=""
            errorMessage={isCurrentResult ? errorMessage : null}
            isEmpty={false}
            loading={isSearchLoading}
            loadingDescription="正在搜索..."
            loadingTitle="搜索中"
            onRetry={reload}
          >
            {showHistory ? (
              <View style={styles.historyAndRecommendationsBlock}>
                {searchHistory.length > 0 && (
                  <>
                    <SearchHistoryList
                      history={searchHistory}
                      isExpanded={isHistoryExpanded}
                      onToggleExpand={() => setIsHistoryExpanded(!isHistoryExpanded)}
                      onClearAll={() => setClearConfirmVisible(true)}
                      onDeleteItem={deleteHistoryItem}
                      onUseItem={useHistoryItem}
                      onViewMore={onOpenHistory}
                      editMode={historyEditMode}
                      setEditMode={setHistoryEditMode}
                      onEditModeStart={() => {
                        setHistoryEditMode(true);
                        setIsHistoryExpanded(true);
                      }}
                    />
                    <View style={styles.divider} />
                  </>
                )}
                
                {recommendedRoleCards.length > 0 && (
                  <GuessYouWantList
                    items={recommendedRoleCards}
                    onRefresh={handleRefreshTrending}
                    onUseItem={useHistoryItem}
                  />
                )}
              </View>
            ) : isEmpty ? (
              <View style={styles.emptySpace} />
            ) : (
              <View style={styles.content}>
                <ResultSection title="会话" count={threads.length}>
                  {threads.map((thread) => (
                    <ResultRow key={thread.id} label={thread.title} meta={`${thread.roleCardName || 'Chat'}`} onPress={() => onOpenThread?.(thread.id)} />
                  ))}
                </ResultSection>
                <ResultSection title="聊天记录" count={messages.length}>
                  {messages.map((msg) => (
                    <ResultRow key={msg.id} label={msg.content} meta={`${msg.threadTitle} · ${format(new Date(msg.createdAt), 'MM-dd HH:mm')}`} onPress={() => onOpenThread?.(msg.threadId)} />
                  ))}
                </ResultSection>
                <ResultSection title="角色卡" count={roles.length}>
                  {roles.map((role) => (
                    <ResultRow key={role.id} label={role.name} meta="角色卡" onPress={() => onOpenRoleCard?.(role.id)} />
                  ))}
                </ResultSection>
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
        </Pressable>
      </ScreenScaffold>
      
      <AppDialog
        danger
        message="确定要清空全部搜索记录吗？"
        onClose={() => setClearConfirmVisible(false)}
        onPrimary={confirmDeleteAllHistory}
        primaryLabel="清空"
        title="清空搜索历史"
        visible={clearConfirmVisible}
      />
    </>
  );
}

function SearchHistoryList({
  history,
  isExpanded,
  onToggleExpand,
  onClearAll,
  onDeleteItem,
  onUseItem,
  onViewMore,
  editMode,
  setEditMode,
  onEditModeStart,
}: {
  history: SearchHistoryItem[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClearAll: () => void;
  onDeleteItem: (id: string) => void;
  onUseItem: (value: string) => void;
  onViewMore?: () => void;
  editMode: boolean;
  setEditMode: (mode: boolean) => void;
  onEditModeStart: () => void;
}) {
  const displayLimit = isExpanded ? 14 : 6;
  const displayHistory = history.slice(0, displayLimit);

  return (
    <View style={styles.historyBlock}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>历史记录</Text>
        <View style={styles.headerRight}>
          {editMode ? (
            <>
              <Pressable hitSlop={8} onPress={onClearAll} style={styles.headerAction}>
                <Text style={styles.headerActionText}>全部删除</Text>
              </Pressable>
              <View style={styles.headerDivider} />
              <Pressable hitSlop={8} onPress={() => setEditMode(false)} style={styles.headerAction}>
                <Text style={styles.headerActionText}>完成</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable hitSlop={8} onPress={onToggleExpand} style={styles.headerAction}>
                <Text style={styles.headerActionText}>{isExpanded ? '收起' : '展开'}</Text>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.tertiary} />
              </Pressable>
              <View style={styles.headerDivider} />
              <Pressable accessibilityLabel="编辑搜索记录" hitSlop={8} onPress={onEditModeStart} style={styles.headerAction}>
                <Ionicons name="trash-outline" size={16} color={colors.text.tertiary} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <View style={styles.twoColumnList}>
        {displayHistory.map((item) => (
          <View key={item.id} style={styles.twoColumnItemWrapper}>
            <Pressable
              onPress={() => {
                if (editMode) onDeleteItem(item.id);
                else onUseItem(item.keyword);
              }}
              style={({ pressed }) => [styles.textItemRow, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.textItemText}>
                {item.keyword}
              </Text>
              {editMode && (
                <View style={styles.deleteIconWrapper}>
                  <Ionicons name="close" size={18} color={colors.text.tertiary} />
                </View>
              )}
            </Pressable>
          </View>
        ))}
      </View>
      
      {onViewMore && (
        <Pressable style={styles.viewMoreButton} onPress={onViewMore}>
          <Text style={styles.viewMoreText}>查看更多搜索记录 ({history.length})</Text>
        </Pressable>
      )}
    </View>
  );
}

function GuessYouWantList({
  items,
  onRefresh,
  onUseItem,
}: {
  items: AiRoleCardRecord[];
  onRefresh: () => void;
  onUseItem: (value: string) => void;
}) {
  return (
    <View style={styles.historyBlock}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>猜你想搜</Text>
        <View style={styles.headerRight}>
          <Pressable hitSlop={8} onPress={onRefresh} style={styles.headerAction}>
            <Ionicons name="refresh" size={14} color={colors.text.tertiary} />
            <Text style={styles.headerActionText}>换一换</Text>
          </Pressable>
          <View style={styles.headerDivider} />
          <Pressable hitSlop={8} style={styles.headerAction}>
            <Ionicons name="ellipsis-vertical" size={16} color={colors.text.tertiary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.twoColumnList}>
        {items.map((item) => (
          <View key={item.id} style={styles.twoColumnItemWrapper}>
            <Pressable
              onPress={() => onUseItem(item.name)}
              style={({ pressed }) => [styles.textItemRow, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.textItemText}>
                {item.name}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

function ResultSection({ children, count, title }: { children: ReactNode; count: number; title: string }) {
  if (count === 0) return null;
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
  historyAndRecommendationsBlock: {
    gap: rhythm.screenSectionGap,
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
    ...typography.textStyles.bodyStrong,
    color: colors.text.tertiary,
    fontWeight: '500',
    fontSize: 15,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  headerActionText: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
    fontSize: 13,
  },
  headerDivider: {
    width: StyleSheet.hairlineWidth,
    height: 12,
    backgroundColor: colors.border.default,
    marginHorizontal: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.subtle,
    marginVertical: spacing[1],
  },
  twoColumnList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing[2],
  },
  twoColumnItemWrapper: {
    width: '50%',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2] + 2,
  },
  textItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  textItemText: {
    ...typography.textStyles.body,
    color: colors.text.title,
    fontSize: 15,
    flexShrink: 1,
  },
  hotText: {
    color: '#FF4D4F',
  },
  badgeWrapper: {
    backgroundColor: '#FF7A45',
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    ...typography.textStyles.micro,
    color: '#FFF',
    fontSize: 10,
    lineHeight: 12,
  },
  deleteIconWrapper: {
    marginLeft: 'auto',
  },
  viewMoreButton: {
    alignItems: 'center',
    marginTop: spacing[3],
    paddingVertical: spacing[1],
  },
  viewMoreText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  section: {
    gap: rhythm.listCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
  },
  row: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
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
