import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import pinyinMatch from 'pinyin-match';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, TextInput, ScrollView, Image, BackHandler, Switch } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { searchGlobalMessages, searchGlobalThreads, loadThreadMessageAppearanceConfig, type AiHomeThreadItem, type AiThreadMessageAppearanceConfig } from '../ai/aiChatService';
import { listRoleCards } from '../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../ai/types';
import { AppDialog } from '../components/AppDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { ParallaxLightSweep } from '../components/ParallaxLightSweep';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, settingsRepository, type GlobalGroupListItem, type ImageListItem, type IpListItem, type PixorySpace, type TagUsageItem } from '../database';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { SecureImage } from '../components/SecureImage';
import {
  addSearchHistoryItem,
  clearSearchHistory,
  loadSearchHistory,
  removeSearchHistoryItem,
  type SearchHistoryItem,
} from '../services/searchHistoryService';

import { searchActions, getRandomRecommendedActions, type MatchedAction } from '../services/searchActionService';

interface GlobalSearchScreenProps {
  space?: PixorySpace;
  query: string;
  onChangeQuery: (value: string) => void;
  onBack: () => void;
  onOpenIp: (ipId: number) => void;
  onOpenGroup: (ipId: number, groupId: number) => void;
  onOpenTag: (tagId: number) => void;
  onOpenImageDetail: (imageId: number) => void;
  onOpenThread?: (threadId: string, messageId?: string) => void;
  onOpenRoleCard?: (roleCardId: string) => void;
  onOpenHistory?: () => void;
  onOpenRoute?: (routeName: string, params?: any) => void;
  isTop?: boolean;
}

const SEARCH_RESULT_LIMIT = 20;

interface RecommendedItem {
  id: string;
  name: string;
  type: 'IP' | '聊天' | '角色' | '分组' | '标签' | '功能';
  route?: string;
  routeParams?: any;
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
  onOpenThread,
  onOpenRoleCard,
  onOpenHistory,
  onOpenRoute,
  isTop,
}: GlobalSearchScreenProps) {
  const insets = useSafeAreaInsets();
  const keyword = query.trim();
  const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
  const resultKey = JSON.stringify([space, debouncedKeyword]);
  
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [historyEditMode, setHistoryEditMode] = useState(false);
  
  const [activeFilter, setActiveFilter] = useState<'all' | 'ip' | 'role' | 'group' | 'tag' | 'image' | 'thread' | 'message'>('all');

  const [messageSortDesc, setMessageSortDesc] = useState(true);

  const handleBackPress = useCallback(() => {
    if (isTop === false) {
      return false;
    }
    if (query && query.trim() !== '') {
      onChangeQuery('');
      return true;
    }
    if (activeFilter !== 'all') {
      setActiveFilter('all');
      return true;
    }
    onBack();
    return true;
  }, [isTop, query, onChangeQuery, activeFilter, onBack]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [handleBackPress]);

  // Recommendations
  const [allRecommendedItems, setAllRecommendedItems] = useState<RecommendedItem[]>([]);
  const [displayRecommendedItems, setDisplayRecommendedItems] = useState<RecommendedItem[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchRecommendations = async () => {
      try {
        const [ipPage, groupPage, tagList, allRoles, threads] = await runWithDatabaseSpace(space, (db) => Promise.all([
          ipRepository.findLibraryItemsPage(db, { limit: 15 }),
          groupRepository.findOverviewPage(db, { limit: 15 }),
          tagRepository.findPopular(db, 15),
          listRoleCards(space),
          searchGlobalThreads({ space, query: '', limit: 15 }),
        ]));

        if (!isMounted) return;

        const items: RecommendedItem[] = [];
        allRoles.forEach(r => items.push({ id: `role_${r.id}`, name: r.name, type: '角色' }));
        ipPage.items.forEach(i => items.push({ id: `ip_${i.id}`, name: i.name, type: 'IP' }));
        groupPage.items.forEach(g => items.push({ id: `group_${g.id}`, name: g.name, type: '分组' }));
        tagList.forEach(t => items.push({ id: `tag_${t.id}`, name: t.name, type: '标签' }));
        threads.items.forEach((t: AiHomeThreadItem) => items.push({ id: `thread_${t.id}`, name: t.title || 'Chat', type: '聊天' }));
        
        // Add random functions to "Guess You Like"
        const randomActions = getRandomRecommendedActions(6);
        randomActions.forEach(a => items.push({ id: `action_${a.id}`, name: a.title, type: '功能', route: a.route, routeParams: a.routeParams }));

        setAllRecommendedItems(items);
        
        const shuffled = [...items].sort(() => 0.5 - Math.random());
        setDisplayRecommendedItems(shuffled.slice(0, 8));
      } catch (error) {
        console.error('Failed to load recommendations', error);
      }
    };

    if (isTop !== false) {
      void fetchRecommendations();
    }
    return () => { isMounted = false; };
  }, [space, isTop]);

  const handleRefreshTrending = () => {
    if (allRecommendedItems.length <= 8) return; 
    const shuffled = [...allRecommendedItems].sort(() => 0.5 - Math.random());
    setDisplayRecommendedItems(shuffled.slice(0, 8));
  };

  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    actions: MatchedAction[];
    ips: IpListItem[];
    groups: GlobalGroupListItem[];
    tags: TagUsageItem[];
    images: ImageListItem[];
    threads: AiHomeThreadItem[];
    messages: { id: string; threadId: string; threadTitle: string; content: string; snippet?: string; createdAt: string }[];
    roles: AiRoleCardRecord[];
    resultKey: string;
    counts: { actions: number; ips: number; groups: number; tags: number; images: number; threads: number; messages: number; roles: number; all: number };
  }>(
    async () => {
      if (!debouncedKeyword) {
        return { actions: [], groups: [], images: [], ips: [], tags: [], threads: [], messages: [], roles: [], resultKey, counts: { actions: 0, ips: 0, groups: 0, tags: 0, images: 0, threads: 0, messages: 0, roles: 0, all: 0 } };
      }

      const actionsList = searchActions(debouncedKeyword);

      const [ipPage, groups, tagPage, imagePage, allRoles, threads, messagesRes] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findLibraryItemsPage(db, { searchText: debouncedKeyword, limit: activeFilter === 'ip' ? 1000 : SEARCH_RESULT_LIMIT }),
        groupRepository.findOverviewSearch(db, debouncedKeyword, activeFilter === 'group' ? 1000 : SEARCH_RESULT_LIMIT),
        tagRepository.findUsageOverviewPage(db, { searchText: debouncedKeyword, limit: activeFilter === 'tag' ? 1000 : SEARCH_RESULT_LIMIT }),
        imageRepository.findFilteredPage(db, { mediaType: 'all', searchText: debouncedKeyword, limit: activeFilter === 'image' ? 1000 : SEARCH_RESULT_LIMIT }),
        listRoleCards(space),
        searchGlobalThreads({ space, query: debouncedKeyword, limit: activeFilter === 'thread' ? 1000 : SEARCH_RESULT_LIMIT }),
        searchGlobalMessages({ space, query: debouncedKeyword, limit: activeFilter === 'message' ? 1000 : SEARCH_RESULT_LIMIT, sortDesc: messageSortDesc }),
      ]));

      const filteredRolesAll = allRoles.filter((role) => pinyinMatch.match(role.name, debouncedKeyword));
      const filteredRolesSlice = filteredRolesAll.slice(0, activeFilter === 'role' ? 1000 : SEARCH_RESULT_LIMIT);

      const counts = {
        actions: actionsList.length,
        ips: ipPage.totalCount ?? ipPage.items.length,
        groups: groups.totalCount,
        tags: tagPage.totalCount ?? tagPage.items.length,
        images: imagePage.totalCount ?? imagePage.items.length,
        roles: filteredRolesAll.length,
        threads: threads.totalCount,
        messages: messagesRes.totalCount,
      };
      const totalCount = counts.actions + counts.ips + counts.groups + counts.tags + counts.images + counts.roles + counts.threads + counts.messages;

      return {
        actions: actionsList,
        ips: ipPage.items,
        groups: groups.items,
        tags: tagPage.items,
        images: imagePage.items,
        roles: filteredRolesSlice,
        threads: threads.items,
        messages: messagesRes.results.map((res) => ({
          id: res.messageId,
          threadId: res.threadId,
          threadTitle: res.threadTitle || 'Chat',
          content: res.content,
          snippet: res.snippet,
          createdAt: res.createdAt,
        })),
        resultKey,
        counts: { ...counts, all: totalCount },
      };
    },
    [debouncedKeyword, space, activeFilter, messageSortDesc],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `搜索失败：${message}`;
      },
      initialData: { actions: [], groups: [], images: [], ips: [], tags: [], threads: [], messages: [], roles: [], resultKey: '', counts: { actions: 0, ips: 0, groups: 0, tags: 0, images: 0, threads: 0, messages: 0, roles: 0, all: 0 } },
        keepPreviousData: true,
    }
  );

  const isCurrentResult = data?.resultKey === resultKey && keyword === debouncedKeyword;
  const actions = isCurrentResult ? data.actions : [];
  const ips = isCurrentResult ? data.ips : [];
  const groups = isCurrentResult ? data.groups : [];
  const tags = isCurrentResult ? data.tags : [];
  const images = isCurrentResult ? data.images : [];
  const roles = isCurrentResult ? data.roles : [];
  const threads = isCurrentResult ? data.threads : [];
  const messages = isCurrentResult ? data.messages : [];

  const counts = isCurrentResult && data.counts ? data.counts : { actions: 0, ips: 0, groups: 0, tags: 0, images: 0, threads: 0, messages: 0, roles: 0, all: 0 };
  const totalCount = counts.all;
  const isSearchLoading = Boolean(keyword) && (isLoading || !isCurrentResult);
  const isEmpty = !isSearchLoading && totalCount === 0;
  const showHistory = !keyword;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    let isMounted = true;
    if (isTop !== false) {
      void loadSearchHistory(space).then((nextHistory) => {
        if (isMounted) setSearchHistory(nextHistory);
      });
    }
    return () => { isMounted = false; };
  }, [space, isTop]);

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
      <ScreenScaffold
        backgroundColor="#f9f9f9"
        fullScreen
        showHeader={false}
        scrollable={false}
        contentContainerStyle={{ paddingHorizontal: 0, gap: 0 }}
      >
        <View style={[newStyles.stickyHeaderBlock, { paddingTop: insets.top }]}>
          <View style={newStyles.topBar}>
            <Pressable onPress={handleBackPress} style={newStyles.backButton} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color={htmlColors.onSurface} />
            </Pressable>
            <Text style={newStyles.topBarTitle}>全局搜索</Text>
            <View style={{ width: 44, height: 44 }} />
          </View>
          <View style={newStyles.searchBarContainer}>
            <View style={newStyles.searchBarInner}>
              <Ionicons name="search" size={17} color="#444748" />
              <TextInput
                value={query}
                onChangeText={onChangeQuery}
                placeholder="搜索 IP企划 / 标签 / 角色 / 备注..."
                placeholderTextColor="#747878"
                style={newStyles.searchInput}
                selectionColor={htmlColors.primary}
              />
              {query ? (
                <Pressable onPress={() => onChangeQuery('')} hitSlop={8} style={{ padding: 4, marginRight: -4 }}>
                  <View style={newStyles.clearButton}>
                    <MaterialIcons name="close" size={14} color={htmlColors.onSurfaceVariant} />
                  </View>
                </Pressable>
              ) : null}
            </View>
          </View>
          
          {!showHistory && (
             <SearchFilterRail 
                counts={counts}
                activeFilter={activeFilter}
                onSelectFilter={setActiveFilter}
             />
          )}
        </View>
        
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={newStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setHistoryEditMode(false)}>
          <PageStateBlock
            emptyDescription="尝试更换关键词或检查输入是否正确"
            emptyIconName="search-outline"
            emptyTitle="未找到搜索结果"
            errorMessage={isCurrentResult ? errorMessage : null}
            isEmpty={isEmpty && !showHistory}
            loading={isSearchLoading}
            loadingDescription="正在搜索..."
            loadingTitle="搜索中"
            onRetry={reload}
          >
            {showHistory ? (
              <View style={{}}>
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
                    <View style={newStyles.separator} />
                  </>
                )}
                
                {displayRecommendedItems.length > 0 && (
                  <GuessYouWantList
                    items={displayRecommendedItems}
                    onRefresh={handleRefreshTrending}
                    onItemPress={(item) => {
                      if (item.type === '功能' && item.route && onOpenRoute) {
                        onOpenRoute(item.route, item.routeParams);
                      } else {
                        useHistoryItem(item.name);
                      }
                    }}
                  />
                )}
              </View>
            ) : isEmpty ? (
              <View style={{ minHeight: 360 }} />
            ) : (
              <View style={protoStyles.content}>
                {/* 0. Actions */}
                {actions.length > 0 && (
                  <ActionSection
                    items={actions}
                    space={space}
                    onOpenAction={(action) => {
                      if (onOpenRoute) onOpenRoute(action.route, action.routeParams);
                    }}
                  />
                )}
                {/* 1. IP */}
                {(activeFilter === 'all' || activeFilter === 'ip') && ips.length > 0 && (
                  <IpSection items={ips} totalCount={counts.ips} onOpen={onOpenIp} query={debouncedKeyword} space={space} activeFilter={activeFilter} onViewMore={() => setActiveFilter('ip')} />
                )}
                {/* 2. Role Cards */}
                {(activeFilter === 'all' || activeFilter === 'role') && roles.length > 0 && (
                  <RoleSection items={roles} onOpen={onOpenRoleCard} query={debouncedKeyword} space={space} activeFilter={activeFilter} onViewMore={() => setActiveFilter('role')} />
                )}
                {/* 3. Groups */}
                {(activeFilter === 'all' || activeFilter === 'group') && groups.length > 0 && (
                  <GroupSection items={groups} totalCount={counts.groups} onOpen={onOpenGroup} query={debouncedKeyword} space={space} activeFilter={activeFilter} onViewMore={() => setActiveFilter('group')} />
                )}
                {/* 4. Tags */}
                {(activeFilter === 'all' || activeFilter === 'tag') && tags.length > 0 && (
                  <TagSection items={tags} totalCount={counts.tags} onOpen={onOpenTag} query={debouncedKeyword} activeFilter={activeFilter} onViewMore={() => setActiveFilter('tag')} />
                )}
                {/* 5. Images */}
                {(activeFilter === 'all' || activeFilter === 'image') && images.length > 0 && (
                  <ImageSection items={images} totalCount={counts.images} onOpen={onOpenImageDetail} query={debouncedKeyword} space={space} activeFilter={activeFilter} onViewMore={() => setActiveFilter('image')} />
                )}
                {/* 6. Threads */}
                {(activeFilter === 'all' || activeFilter === 'thread') && threads.length > 0 && (
                  <ThreadSection items={threads} totalCount={counts.threads} onOpen={onOpenThread} query={debouncedKeyword} activeFilter={activeFilter} onViewMore={() => setActiveFilter('thread')} />
                )}
                {/* 7. Messages */}
                {(activeFilter === 'all' || activeFilter === 'message') && messages.length > 0 && (
                  <MessageSection items={messages} totalCount={counts.messages} onOpen={onOpenThread} query={debouncedKeyword} activeFilter={activeFilter} onViewMore={() => setActiveFilter('message')} sortDesc={messageSortDesc} onToggleSort={() => setMessageSortDesc(!messageSortDesc)} />
                )}
              </View>
            )}
          </PageStateBlock>
          </Pressable>
        </ScrollView>
      </ScreenScaffold>
      
      <ParallaxLightSweep
        color1="#A7F3D0"
        color2="#BAE6FD"
        fadeDuration={500}
        opacity={0.65}
        variant="edges"
        visible={isSearchLoading}
      />

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

// --------------------------------------------------------
// HTML Prototype Styles & Tokens
// --------------------------------------------------------
const htmlColors = {
  surfaceContainerLowest: '#ffffff',
  surfaceContainer: '#eeeeee',
  surfaceContainerHigh: '#e8e8e8',
  onSurface: '#1a1c1c',
  onSurfaceVariant: '#444748',
  outline: '#747878',
  outlineVariant: '#c4c7c7',
  primary: '#000000',
  error: '#ba1a1a',
  secondary: '#5e5e5e',
  surface: '#f9f9f9',
  surfaceVariant: '#e2e2e2',
  surfaceContainerLow: '#f3f3f4',
  surfaceContainerHighest: '#e2e2e2',
  onPrimary: '#ffffff',
};

// --------------------------------------------------------
// Filter Rail
// --------------------------------------------------------
function SearchFilterRail({ counts, activeFilter, onSelectFilter }: { counts: any; activeFilter: string; onSelectFilter: (f: any) => void }) {
  const filters = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'ip', label: 'IP', count: counts.ips },
    { key: 'role', label: '角色卡', count: counts.roles },
    { key: 'group', label: '分组', count: counts.groups },
    { key: 'tag', label: '标签', count: counts.tags },
    { key: 'image', label: '素材', count: counts.images },
    { key: 'thread', label: '会话', count: counts.threads },
    { key: 'message', label: '聊天记录', count: counts.messages },
  ];

  return (
    <View style={protoStyles.filterRailContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={protoStyles.filterRailScroll} keyboardShouldPersistTaps="handled">
        {filters.map((f) => {
          if (f.count === 0 && f.key !== 'all') return null;
          const isActive = activeFilter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => onSelectFilter(f.key)}
              style={[protoStyles.filterChip, isActive && protoStyles.filterChipActive]}
            >
              <Text style={[protoStyles.filterChipText, isActive && protoStyles.filterChipTextActive]}>{f.label}</Text>

            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// --------------------------------------------------------
// Highlight Text Utility
// --------------------------------------------------------
function HighlightedText({ text, keyword, style, highlightWrapperStyle, numberOfLines = 1 }: { text: string; keyword?: string; style?: any; highlightWrapperStyle?: any; numberOfLines?: number }) {
  if (!keyword || !text) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  
  const terms = [...new Set(keyword.split(/[\s,，。！？!?;；:：、"'“”‘’()\[\]{}<>]+/).map((t: string) => t.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (terms.length === 0) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;

  const pattern = new RegExp(`(${terms.map((t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        const isMatch = terms.some(t => part.toLowerCase() === t.toLowerCase());
        return isMatch ? (
          <Text key={i} style={highlightWrapperStyle}>{part}</Text>
        ) : (
          part
        );
      })}
    </Text>
  );
}

// --------------------------------------------------------
// Result Sections
// --------------------------------------------------------
function SectionHeader({ title, subtitle, count, actionText, onAction }: any) {
  return (
    <View style={protoStyles.sectionHeader}>
      <View style={protoStyles.sectionHeaderLeft}>
        <Text style={protoStyles.sectionTitle}>{title}&nbsp;</Text>
        <View style={protoStyles.sectionSubtitleBox}>
          <Text style={protoStyles.sectionSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {onAction ? (
        <Pressable onPress={onAction}>
          <Text style={protoStyles.sectionAction}>{actionText} ›</Text>
        </Pressable>
      ) : (
        <Text style={protoStyles.sectionCount}>{count}</Text>
      )}
    </View>
  );
}

function IpSection({ items, totalCount, onOpen, query, space, activeFilter, onViewMore }: any) {
  const isAllFilter = activeFilter === 'all';
  const displayItems = isAllFilter ? items.slice(0, 3) : items;
  const hasMore = isAllFilter && items.length > 3;

  return (
    <View style={protoStyles.sectionWrapper}>
      <SectionHeader title="IP" subtitle="PROJECT · 核心素材库" />
      {displayItems.map((item: any) => (
        <Pressable key={item.id} onPress={() => onOpen(item.id)} style={protoStyles.ipCard}>
          <View style={protoStyles.ipCardRow}>
            <View style={protoStyles.ipCoverBox}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: htmlColors.surfaceContainer }]} />
              {item.coverThumbnailFileUri ? (
                <SecureImage uri={item.coverThumbnailFileUri} space={space} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : null}
              <View style={protoStyles.ipTagAbsolute}>
                <Text style={protoStyles.ipTagAbsoluteText}>ARC-{item.id.toString().padStart(2, '0')}</Text>
              </View>
            </View>
            <View style={protoStyles.ipInfo}>
              <View>
                <View style={protoStyles.ipTitleRow}>
                  <HighlightedText text={item.name} keyword={query} style={protoStyles.ipTitle} highlightWrapperStyle={protoStyles.highlightBox} />
                  <MaterialIcons name="arrow-forward" size={18} color={htmlColors.outline} />
                </View>
                <Text style={protoStyles.ipDesc} numberOfLines={1}>核心素材库与记录</Text>
              </View>
              <View style={protoStyles.ipMetaRow}>
                <View style={protoStyles.metaPill}><Text style={protoStyles.metaPillText}>{item.imageCount} 项素材</Text></View>
                <View style={protoStyles.metaPill}><Text style={protoStyles.metaPillText}>{item.groupCount} 个分组</Text></View>
              </View>
            </View>
          </View>
        </Pressable>
      ))}
      {hasMore && (
        <Pressable style={({ pressed }) => [newStyles.expandBtn, pressed && newStyles.pressedBtn]} onPress={onViewMore}>
          <Text style={newStyles.expandBtnText}>查看更多 IP</Text>
        </Pressable>
      )}
    </View>
  );
}

function RoleSection({ items, totalCount, onOpen, query, space, activeFilter, onViewMore }: any) {
  const isAllFilter = activeFilter === 'all';
  const displayItems = isAllFilter ? items.slice(0, 3) : items;
  const hasMore = isAllFilter && items.length > 3;

  return (
    <View style={protoStyles.sectionWrapper}>
      <SectionHeader title="角色卡" subtitle="PERSONA · 拼音匹配" />
      {displayItems.map((item: any) => (
        <Pressable key={item.id} onPress={() => onOpen(item.id)} style={protoStyles.roleCard}>
          <View style={protoStyles.roleAvatarBox}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: htmlColors.surfaceContainer, borderRadius: 28 }]} />
            {item.avatarUri ? (
              <SecureImage uri={item.avatarUri} space={space} style={[StyleSheet.absoluteFill, { borderRadius: 28 }]} contentFit="cover" />
            ) : null}
            <View style={protoStyles.roleSparkleBadge}>
              <MaterialIcons name="auto-awesome" size={10} color={htmlColors.onPrimary} />
            </View>
          </View>
          <View style={protoStyles.roleInfo}>
            <View style={protoStyles.roleTitleRow}>
              <HighlightedText text={item.name} keyword={query} style={protoStyles.roleTitle} highlightWrapperStyle={protoStyles.highlightBox} />
              <View style={protoStyles.metaPillSmall}><Text style={protoStyles.metaPillText}>ROLE</Text></View>
            </View>
            <Text style={protoStyles.roleDesc} numberOfLines={1}>{item.prompt || '暂无设定'}</Text>
          </View>
          <View style={protoStyles.roleIconBtn}>
            <MaterialIcons name="forum" size={18} color={htmlColors.onSurface} />
          </View>
        </Pressable>
      ))}
      {hasMore && (
        <Pressable style={({ pressed }) => [newStyles.expandBtn, pressed && newStyles.pressedBtn]} onPress={onViewMore}>
          <Text style={newStyles.expandBtnText}>查看更多角色</Text>
        </Pressable>
      )}
    </View>
  );
}

function GroupSection({ items, totalCount, onOpen, query, space, activeFilter, onViewMore }: any) {
  const isAllFilter = activeFilter === 'all';
  const displayItems = isAllFilter ? items.slice(0, 6) : items;
  const hasMore = isAllFilter && items.length > 6;

  return (
    <View style={protoStyles.sectionWrapper}>
      <SectionHeader title="分组" subtitle="GROUPS · 图集与分类" />
      <View style={protoStyles.grid2Col}>
        {displayItems.map((item: any) => (
          <Pressable key={item.id} onPress={() => onOpen(item.ipId, item.id)} style={protoStyles.groupCard}>
            <View style={protoStyles.groupCardInner}>
              <View style={protoStyles.groupCardTopRow}>
                <View style={protoStyles.groupCoverBox}>
                  {item.coverThumbnailFileUri ? (
                    <SecureImage uri={item.coverThumbnailFileUri} space={space} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: htmlColors.surfaceContainer }]} />
                  )}
                </View>
                <MaterialIcons name="folder-open" size={18} color={htmlColors.outline} />
              </View>
              <View style={protoStyles.groupCardBottomRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <HighlightedText text={item.name} keyword={query} style={protoStyles.groupTitle} highlightWrapperStyle={protoStyles.highlightBox} />
                  <Text style={protoStyles.groupSub} numberOfLines={1}>归属于 {item.ipName}</Text>
                </View>
                <Text style={protoStyles.groupCountText}>{item.imageCount} 项</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
      {hasMore && (
        <Pressable style={({ pressed }) => [newStyles.expandBtn, pressed && newStyles.pressedBtn]} onPress={onViewMore}>
          <Text style={newStyles.expandBtnText}>查看更多分组</Text>
        </Pressable>
      )}
    </View>
  );
}

function TagSection({ items, totalCount, onOpen, query, activeFilter, onViewMore }: any) {
  const isAllFilter = activeFilter === 'all';
  const displayItems = isAllFilter ? items.slice(0, 10) : items;
  const hasMore = isAllFilter && items.length > 10;

  return (
    <View style={protoStyles.sectionWrapper}>
      <SectionHeader title="标签" subtitle="TAGS · 自定义分类元数据" />
      <View style={protoStyles.tagFlow}>
        {displayItems.map((item: any) => (
          <Pressable key={item.id} onPress={() => onOpen(item.id)} style={protoStyles.tagPill}>
            <Text style={protoStyles.tagHash}>#</Text>
            <HighlightedText text={item.name} keyword={query} style={protoStyles.tagText} highlightWrapperStyle={protoStyles.highlightBox} />
            <View style={protoStyles.tagCountBox}><Text style={protoStyles.tagCountText}>{item.imageCount}</Text></View>
          </Pressable>
        ))}
      </View>
      {hasMore && (
        <Pressable style={({ pressed }) => [newStyles.expandBtn, pressed && newStyles.pressedBtn]} onPress={onViewMore}>
          <Text style={newStyles.expandBtnText}>查看更多标签</Text>
        </Pressable>
      )}
    </View>
  );
}

function ImageSection({ items, totalCount, onOpen, query, space, activeFilter, onViewMore }: any) {
  const isAllFilter = activeFilter === 'all';
  const displayItems = isAllFilter ? items.slice(0, 6) : items;
  const hasMore = isAllFilter && items.length > 6;

  return (
    <View style={protoStyles.sectionWrapper}>
      <SectionHeader title="图片 / 素材" subtitle="ASSETS · 视觉切片" />
      <View style={protoStyles.grid2Col}>
        {displayItems.map((item: any) => (
          <Pressable key={item.id} onPress={() => onOpen(item.id)} style={protoStyles.imageCard}>
            <View style={protoStyles.imageBox}>
              <SecureImage uri={item.thumbnailFileUri} space={space} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={protoStyles.imageTypeBadge}>
                <Text style={protoStyles.imageTypeBadgeText}>{item.mediaType === 'video' ? 'MP4' : 'PNG'}</Text>
              </View>
            </View>
            <View style={protoStyles.imageInfo}>
              <HighlightedText text={item.originalFilename || `素材_${item.id}`} keyword={query} style={protoStyles.imageTitle} highlightWrapperStyle={protoStyles.highlightBox} />
              <Text style={protoStyles.imageSub}>{item.width}×{item.height}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      {hasMore && (
        <Pressable style={({ pressed }) => [newStyles.expandBtn, pressed && newStyles.pressedBtn]} onPress={onViewMore}>
          <Text style={newStyles.expandBtnText}>查看更多素材</Text>
        </Pressable>
      )}
    </View>
  );
}

function ThreadSection({ items, totalCount, onOpen, query, activeFilter, onViewMore }: any) {
  const isAllFilter = activeFilter === 'all';
  const displayItems = isAllFilter ? items.slice(0, 3) : items;
  const hasMore = isAllFilter && items.length > 3;

  return (
    <View style={protoStyles.sectionWrapper}>
      <SectionHeader title="会话" subtitle="THREADS · 伴聊状态" />
      <View style={protoStyles.threadList}>
        {displayItems.map((item: any, idx: number) => (
          <Pressable key={item.id} onPress={() => onOpen(item.id)} style={[protoStyles.threadItem, idx > 0 && protoStyles.threadItemBorder]}>
            <View style={protoStyles.threadIconBox}>
              <MaterialIcons name="forum" size={20} color={htmlColors.onSurfaceVariant} />
            </View>
            <View style={protoStyles.threadInfo}>
              <View style={protoStyles.threadTopRow}>
                <HighlightedText text={item.title || 'Chat'} keyword={query} style={protoStyles.threadTitle} highlightWrapperStyle={protoStyles.highlightBox} />
                <Text style={protoStyles.threadTime}>活跃</Text>
              </View>
              <Text style={protoStyles.threadDesc} numberOfLines={1}>{item.roleCardName}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      {hasMore && (
        <Pressable style={({ pressed }) => [newStyles.expandBtn, pressed && newStyles.pressedBtn]} onPress={onViewMore}>
          <Text style={newStyles.expandBtnText}>查看更多会话</Text>
        </Pressable>
      )}
    </View>
  );
}

function FtsSnippetText({ snippet, style, highlightWrapperStyle }: { snippet: string; style?: any; highlightWrapperStyle?: any }) {
  const parts = snippet.replace(/\n/g, ' ').split(/(\{\{HL_START\}\}|\{\{HL_END\}\})/g);
  const elements = [];
  let isHighlight = false;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '{{HL_START}}') {
      isHighlight = true;
    } else if (part === '{{HL_END}}') {
      isHighlight = false;
    } else if (part) {
      elements.push(
        isHighlight ? (
          <Text key={i} style={highlightWrapperStyle}>{part}</Text>
        ) : (
          part
        )
      );
    }
  }
  return (
    <Text style={style} numberOfLines={2}>
      {elements}
    </Text>
  );
}

function MessageSection({ items, totalCount, onOpen, query, activeFilter, sortDesc, onToggleSort, onViewMore }: any) {
  const isAllFilter = activeFilter === 'all';
  const displayItems = isAllFilter ? items.slice(0, 10) : items;
  const hasMore = isAllFilter && items.length > 10;

  return (
    <View style={protoStyles.sectionWrapper}>
      <SectionHeader 
        title="聊天记录" 
        subtitle="MESSAGES · 精确高亮" 
        actionText={sortDesc ? '时间倒序' : '时间正序'}
        onAction={onToggleSort}
      />
      <View style={protoStyles.messageList}>
        {displayItems.map((item: any) => {
          let snippetComponent;
          if (item.contentSnippet && item.contentSnippet.includes('{{HL_START}}')) {
            snippetComponent = <FtsSnippetText snippet={item.contentSnippet} style={protoStyles.messageText} highlightWrapperStyle={protoStyles.highlightBoxText} />;
          } else {
            const terms = query.split(/[\s,，。！？!?;；:：、"'“”‘’()\[\]{}<>]+/).map((t: string) => t.trim()).filter(Boolean);
            if (terms.length === 0) terms.push(query.trim());
            const text = item.content;
            const lowerText = text.toLowerCase();
            let firstIndex = -1;
            for (const term of terms) {
              const idx = lowerText.indexOf(term.toLowerCase());
              if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) {
                firstIndex = idx;
              }
            }
            let snippet = text.replace(/\n/g, ' ');
            if (firstIndex !== -1 && text.length > 40) {
              let start = Math.max(0, firstIndex - 10);
              let end = Math.min(text.length, firstIndex + 30);
              snippet = text.substring(start, end).replace(/\n/g, ' ');
              if (start > 0) snippet = '...' + snippet;
              if (end < text.length) snippet = snippet + '...';
            }
            snippetComponent = <HighlightedText text={snippet} keyword={query} style={protoStyles.messageText} highlightWrapperStyle={protoStyles.highlightBoxText} />;
          }

          return (
            <Pressable key={item.id} onPress={() => onOpen(item.threadId, item.id)} style={({ pressed }) => [protoStyles.messageCard, pressed && { opacity: 0.8 }]}>
              <View style={protoStyles.messageTopRow}>
                <View style={protoStyles.messageSourceRow}>
                  <MaterialIcons name="chat-bubble-outline" size={13} color={htmlColors.outline} />
                  <Text style={protoStyles.messageSourceText}>来源: {item.threadTitle}</Text>
                  <Text style={protoStyles.messageSourceText}>·</Text>
                  <Text style={protoStyles.messageSourceText}>{format(new Date(item.createdAt), 'MM-dd HH:mm')}</Text>
                </View>
                <View style={protoStyles.messageJumpBtn}>
                  <Text style={protoStyles.messageJumpText}>跳转</Text>
                  <MaterialIcons name="north-east" size={12} color={htmlColors.onSurface} />
                </View>
              </View>
              <View style={protoStyles.messageBubble}>
                {snippetComponent}
              </View>
            </Pressable>
          );
        })}
      </View>
      {hasMore && (
        <Pressable style={({ pressed }) => [newStyles.expandBtn, pressed && newStyles.pressedBtn]} onPress={onViewMore}>
          <Text style={newStyles.expandBtnText}>查看更多聊天记录</Text>
        </Pressable>
      )}
    </View>
  );
}

const protoStyles = StyleSheet.create({
  content: {
    gap: 20,
    paddingTop: 4,
  },
  filterRailContainer: {
    paddingTop: 8,
    paddingBottom: 4,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  filterRailScroll: {
    gap: 6,
    paddingHorizontal: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 8,
    backgroundColor: htmlColors.surfaceContainerLowest,
    borderRadius: 14,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  filterChipActive: {
    backgroundColor: htmlColors.primary,
  },
  filterChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: htmlColors.onSurfaceVariant,
    letterSpacing: 0.06,
  },
  filterChipTextActive: {
    color: htmlColors.onPrimary,
  },
  filterChipCountBox: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: 'transparent',
    borderRadius: 4,
  },
  filterChipCountBoxActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  filterChipCountText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    color: htmlColors.secondary,
  },
  filterChipCountTextActive: {
    color: htmlColors.onPrimary,
  },
  sectionWrapper: {
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '500',
    color: htmlColors.onSurface,
    letterSpacing: -0.01,
  },
  sectionSubtitleBox: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: htmlColors.surfaceContainer,
    borderRadius: 4,
  },
  sectionSubtitle: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    color: htmlColors.onSurfaceVariant,
  },
  sectionCount: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: htmlColors.secondary,
  },
  sectionAction: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: htmlColors.secondary,
  },
  highlightBox: {
    backgroundColor: htmlColors.surfaceVariant,
    paddingHorizontal: 2,
    borderRadius: 2,
    color: htmlColors.onSurface,
  },
  highlightBoxText: {
    backgroundColor: htmlColors.surfaceVariant,
    paddingHorizontal: 4,
    borderRadius: 4,
    color: htmlColors.onSurface,
    fontWeight: '500',
  },
  ipCard: {
    backgroundColor: htmlColors.surfaceContainerLowest,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  ipCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  ipCoverBox: {
    width: 64,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  ipTagAbsolute: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 4,
  },
  ipTagAbsoluteText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '500',
  },
  ipInfo: {
    flex: 1,
    height: 80,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  ipTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ipTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: htmlColors.onSurface,
    flex: 1,
    marginRight: 8,
  },
  ipDesc: {
    fontSize: 13,
    color: htmlColors.secondary,
    marginTop: 2,
  },
  ipMetaRow: {
    flexDirection: 'row',
    gap: 4,
  },
  metaPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: htmlColors.surfaceContainerLow,
    borderRadius: 4,
  },
  metaPillText: {
    fontSize: 10,
    fontWeight: '500',
    color: htmlColors.onSurfaceVariant,
  },
  roleCard: {
    backgroundColor: htmlColors.surfaceContainerLowest,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleAvatarBox: {
    width: 56,
    height: 56,
    position: 'relative',
  },
  roleSparkleBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: htmlColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleInfo: {
    flex: 1,
    gap: 2,
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: htmlColors.onSurface,
  },
  metaPillSmall: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: htmlColors.surfaceContainerHighest,
    borderRadius: 4,
  },
  roleDesc: {
    fontSize: 13,
    color: htmlColors.secondary,
  },
  roleIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: htmlColors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid2Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  groupCard: {
    width: '50%',
    padding: 4,
  },
  groupCardInner: {
    backgroundColor: htmlColors.surfaceContainerLowest,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: htmlColors.surfaceVariant,
    overflow: 'hidden',
    padding: 12,
    gap: 12,
  },
  groupCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  groupCoverBox: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: htmlColors.surfaceContainer,
  },
  groupCardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  groupCountText: {
    fontSize: 10,
    color: htmlColors.outline,
    fontWeight: '500',
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: htmlColors.onSurface,
    marginTop: -8,
  },
  groupSub: {
    fontSize: 11,
    color: htmlColors.outline,
    marginTop: 2,
  },
  tagFlow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: htmlColors.surfaceContainerLowest,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tagHash: {
    fontSize: 13,
    color: htmlColors.secondary,
    fontWeight: '500',
  },
  tagText: {
    fontSize: 13,
    color: htmlColors.onSurface,
    fontWeight: '500',
  },
  tagCountBox: {
    paddingHorizontal: 4,
    backgroundColor: htmlColors.surfaceContainerLow,
    borderRadius: 4,
  },
  tagCountText: {
    fontSize: 10,
    color: htmlColors.outline,
    fontWeight: '500',
  },
  imageCard: {
    width: '50%',
    padding: 4,
  },
  imageBox: {
    width: '100%',
    aspectRatio: 4/3,
    backgroundColor: htmlColors.surfaceContainer,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  imageTypeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  imageTypeBadgeText: {
    fontSize: 9,
    color: htmlColors.onSurface,
    fontWeight: '500',
  },
  imageInfo: {
    padding: 4,
    gap: 2,
  },
  imageTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: htmlColors.onSurface,
  },
  imageSub: {
    fontSize: 10,
    color: htmlColors.outline,
  },
  threadList: {
    backgroundColor: htmlColors.surfaceContainerLowest,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  threadItemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: htmlColors.surfaceContainer,
  },
  threadIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: htmlColors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadInfo: {
    flex: 1,
  },
  threadTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  threadTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: htmlColors.onSurface,
    flex: 1,
    marginRight: 8,
  },
  threadTime: {
    fontSize: 10,
    color: htmlColors.outline,
  },
  threadDesc: {
    fontSize: 13,
    color: htmlColors.secondary,
    marginTop: 2,
  },
  messageList: {
    gap: 4,
  },
  messageCard: {
    backgroundColor: htmlColors.surfaceContainerLowest,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    gap: 4,
  },
  messageTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  messageSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  messageSourceText: {
    fontSize: 10,
    color: htmlColors.outline,
    fontWeight: '500',
  },
  messageJumpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  messageJumpText: {
    fontSize: 11,
    color: htmlColors.onSurface,
  },
  messageBubble: {
    padding: 4,
    paddingLeft: 4,
    backgroundColor: 'rgba(243,243,244,0.4)',
    borderRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: htmlColors.onSurface,
  }
});

const newStyles = StyleSheet.create({
  stickyHeaderBlock: {
    backgroundColor: '#f9f9f9',
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
    gap: 16,
  },
  topBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: htmlColors.primary,
    letterSpacing: -0.075,
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  searchBarInner: {
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
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111111',
    paddingVertical: 0,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: htmlColors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionContainer: {
    gap: 8,
    paddingTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  headerTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: htmlColors.onSurface,
    letterSpacing: -0.075,
  },
  headerSubtitle: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    color: htmlColors.outline,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  refreshBtnText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: htmlColors.onSurfaceVariant,
    letterSpacing: 0.66,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  gridItemWrapper: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  historyItem: {
    height: 40,
    paddingHorizontal: 12,
    backgroundColor: htmlColors.surfaceContainerLowest,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: htmlColors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  suggestionItem: {
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: htmlColors.surfaceContainerLowest,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: htmlColors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 4,
  },
  itemText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    color: htmlColors.onSurface,
    flexShrink: 1,
  },
  closeButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: htmlColors.surfaceContainer,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: htmlColors.outlineVariant,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: htmlColors.onSurfaceVariant,
    lineHeight: 14,
  },
  expandBtn: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    backgroundColor: htmlColors.surfaceContainerLowest,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: htmlColors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  expandBtnText: {
    fontSize: 11,
    fontWeight: '500',
    color: htmlColors.onSurfaceVariant,
    letterSpacing: -0.1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    backgroundColor: htmlColors.surfaceContainerHigh,
    marginVertical: 12,
  },
  pressed: {
    backgroundColor: htmlColors.surfaceContainer,
  },
  pressedBtn: {
    backgroundColor: htmlColors.surfaceContainer,
  },
});

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
    <View style={newStyles.sectionContainer}>
      <View style={newStyles.header}>
        <View style={newStyles.headerLeft}>
          <Text style={newStyles.headerTitle}>历史记录</Text>
          <Text style={newStyles.headerSubtitle}>RECENT QUERIES</Text>
        </View>
        <Pressable onPress={onClearAll} style={newStyles.iconButton} hitSlop={8}>
          <MaterialIcons name="delete" size={16} color={htmlColors.outline} />
        </Pressable>
      </View>

      <View style={newStyles.grid}>
        {displayHistory.map((item) => (
          <View key={item.id} style={newStyles.gridItemWrapper}>
            <Pressable
              onPress={() => onUseItem(item.keyword)}
              style={({ pressed }) => [newStyles.historyItem, pressed && newStyles.pressed]}
            >
              <View style={newStyles.itemLeft}>
                <MaterialIcons name="history" size={13} color={htmlColors.outline} />
                <Text numberOfLines={1} ellipsizeMode="tail" style={newStyles.itemText}>
                  {item.keyword}
                </Text>
              </View>
              <Pressable onPress={() => onDeleteItem(item.id)} hitSlop={8} style={newStyles.closeButton}>
                <MaterialIcons name="close" size={13} color={htmlColors.outline} />
              </Pressable>
            </Pressable>
          </View>
        ))}
      </View>
      
      {history.length > 6 && !isExpanded && (
        <Pressable style={({ pressed }) => [newStyles.expandBtn, pressed && newStyles.pressedBtn]} onPress={onToggleExpand}>
          <Text style={newStyles.expandBtnText}>查看更多历史记录</Text>
        </Pressable>
      )}
      {onViewMore && isExpanded && (
        <Pressable style={({ pressed }) => [newStyles.expandBtn, pressed && newStyles.pressedBtn]} onPress={onViewMore}>
          <Text style={newStyles.expandBtnText}>进入完整历史</Text>
        </Pressable>
      )}
    </View>
  );
}

function GuessYouWantList({
  items,
  onRefresh,
  onItemPress,
}: {
  items: RecommendedItem[];
  onRefresh: () => void;
  onItemPress: (item: RecommendedItem) => void;
}) {
  const getDotColor = (type: RecommendedItem['type']) => {
    switch (type) {
      case '角色': return htmlColors.primary;      
      case 'IP': return htmlColors.secondary;    
      case '聊天': return htmlColors.outline;      
      case '标签': return htmlColors.outlineVariant; 
      case '分组': return htmlColors.error;        
      case '功能': return htmlColors.secondary;
      default: return htmlColors.primary;
    }
  };

  return (
    <View style={newStyles.sectionContainer}>
      <View style={newStyles.header}>
        <View style={newStyles.headerLeft}>
          <Text style={newStyles.headerTitle}>猜你想搜</Text>
          <Text style={newStyles.headerSubtitle}>EXPLORE & DISCOVER</Text>
        </View>
        <Pressable hitSlop={8} onPress={onRefresh} style={newStyles.refreshBtn}>
          <MaterialIcons name="autorenew" size={14} color={htmlColors.onSurfaceVariant} />
          <Text style={newStyles.refreshBtnText}>换一换</Text>
        </Pressable>
      </View>

      <View style={newStyles.grid}>
        {items.map((item, index) => {
          const dotColor = getDotColor(item.type);
          return (
            <View key={item.id} style={newStyles.gridItemWrapper}>
              <Pressable
                onPress={() => onItemPress(item)}
                style={({ pressed }) => [newStyles.suggestionItem, pressed && newStyles.pressed]}
              >
                <View style={newStyles.itemLeft}>
                  <View style={[newStyles.dot, { backgroundColor: dotColor }]} />
                  <Text numberOfLines={1} ellipsizeMode="tail" style={newStyles.itemText}>
                    {item.name}
                  </Text>
                </View>
                <View style={newStyles.badge}>
                  <Text style={newStyles.badgeText}>{item.type}</Text>
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ActionSection({ items, onOpenAction, space }: { items: MatchedAction[]; onOpenAction: (item: MatchedAction) => void; space: PixorySpace }) {
  const [systemAssistantEnabled, setSystemAssistantEnabled] = useState(true);

  useEffect(() => {
    let isMounted = true;
    void runWithDatabaseSpace(space, async (db) => {
      const enabled = await settingsRepository.getSystemAssistantEnabled(db);
      if (isMounted) {
        setSystemAssistantEnabled(enabled);
      }
    });
    return () => { isMounted = false; };
  }, [space]);

  const toggleSystemAssistant = async (value: boolean) => {
    setSystemAssistantEnabled(value);
    await runWithDatabaseSpace(space, async (db) => {
      await settingsRepository.setSystemAssistantEnabled(db, value);
    });
  };

  return (
    <View style={protoStyles.sectionWrapper}>
      <SectionHeader title="功能与入口" subtitle="ACTIONS · 快捷直达" />
      {items.map((item) => (
        <Pressable
          key={item.id}
          style={({ pressed }) => [actionStyles.actionRow, pressed && item.id !== 'system-assistant-toggle' && actionStyles.actionRowPressed]}
          onPress={() => item.id !== 'system-assistant-toggle' && onOpenAction(item)}
        >
          <View style={actionStyles.actionIconBox}>
            {item.id === 'system-assistant-toggle' ? (
              <ExpoImage
                source={require('../../assets/app-icon.png')}
                style={{ width: '100%', height: '100%', borderRadius: 12 }}
                contentFit="cover"
              />
            ) : (
              <Ionicons name={item.icon as any} size={20} color={htmlColors.primary} />
            )}
          </View>
          
          <View style={actionStyles.actionTextContent}>
            <Text style={actionStyles.actionTitle}>{item.title}</Text>
            {item.matchedAlias && (
              <Text style={actionStyles.actionMatchedSubtitle}>匹配: {item.matchedAlias}</Text>
            )}
          </View>
          
          {item.id === 'system-assistant-toggle' ? (
            <Switch
              value={systemAssistantEnabled}
              onValueChange={toggleSystemAssistant}
              trackColor={{ false: htmlColors.surfaceVariant, true: htmlColors.primary }}
              thumbColor={htmlColors.surface}
            />
          ) : (
            <Ionicons name="chevron-forward" size={16} color={htmlColors.onSurfaceVariant} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

const actionStyles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: htmlColors.surfaceContainerLow,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  actionRowPressed: {
    opacity: 0.8,
    backgroundColor: htmlColors.surfaceContainer,
  },
  actionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: htmlColors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTextContent: {
    flex: 1,
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 16,
    color: htmlColors.onSurface,
    fontWeight: '500',
  },
  actionMatchedSubtitle: {
    fontSize: 12,
    color: htmlColors.primary,
    marginTop: 2,
  },
});

















