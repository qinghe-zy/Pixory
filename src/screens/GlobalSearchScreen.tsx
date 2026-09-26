import { Ionicons, MaterialIcons } from '@expo/vector-icons';
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
import { ParallaxLightSweep } from '../components/ParallaxLightSweep';
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
  onOpenThread?: (threadId: string, messageId?: string) => void;
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
  }, ["GlobalSearchScreen", space]);

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
  }, ["GlobalSearchScreen", space]);

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
      <ScreenScaffold backgroundColor="#f9f9f9" decorativeTitle="Search" onBack={onBack} scrollable title="全局搜索">
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
                    <View style={newStyles.separator} />
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
                    <ResultRow key={msg.id} label={msg.content} meta={`${msg.threadTitle} · ${format(new Date(msg.createdAt), 'MM-dd HH:mm')}`} onPress={() => onOpenThread?.(msg.threadId, msg.id)} highlight={debouncedKeyword} snippet={true} />
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

// Literal values used for pixel-perfect restoration of reference HTML design
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
};

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
  onUseItem,
}: {
  items: AiRoleCardRecord[];
  onRefresh: () => void;
  onUseItem: (value: string) => void;
}) {
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
          const dotColor = index % 2 === 0 ? htmlColors.primary : htmlColors.secondary;
          return (
            <View key={item.id} style={newStyles.gridItemWrapper}>
              <Pressable
                onPress={() => onUseItem(item.name)}
                style={({ pressed }) => [newStyles.suggestionItem, pressed && newStyles.pressed]}
              >
                <View style={newStyles.itemLeft}>
                  <View style={[newStyles.dot, { backgroundColor: dotColor }]} />
                  <Text numberOfLines={1} ellipsizeMode="tail" style={newStyles.itemText}>
                    {item.name}
                  </Text>
                </View>
                <View style={newStyles.badge}>
                  <Text style={newStyles.badgeText}>角色</Text>
                </View>
              </Pressable>
            </View>
          );
        })}
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

function HighlightedText({ text, keyword, style, highlightStyle, snippet = false }: { text: string; keyword?: string; style?: any; highlightStyle?: any; snippet?: boolean }) {
  if (!keyword || !text) return <Text style={style} numberOfLines={1}>{text}</Text>;
  
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const index = lowerText.indexOf(lowerKeyword);
  
  if (index === -1) return <Text style={style} numberOfLines={1}>{text}</Text>;

  let displayText = text.replace(/\n/g, ' ');
  
  if (snippet && text.length > 30) {
    let start = Math.max(0, index - 8);
    let end = Math.min(text.length, index + keyword.length + 20);
    
    displayText = text.substring(start, end).replace(/\n/g, ' ');
    if (start > 0) displayText = '...' + displayText;
    if (end < text.length) displayText = displayText + '...';
  }

  const parts = displayText.split(new RegExp(`(${keyword})`, 'gi'));

  return (
    <Text style={style} numberOfLines={1}>
      {parts.map((part, i) => 
        part.toLowerCase() === lowerKeyword ? (
          <Text key={i} style={[style, highlightStyle]}>{part}</Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

function ResultRow({ label, meta, onPress, highlight, snippet }: { label: string; meta: string; onPress: () => void; highlight?: string; snippet?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowCopy}>
        {highlight ? (
          <HighlightedText text={label} keyword={highlight} style={styles.rowTitle} highlightStyle={styles.highlightedText} snippet={snippet} />
        ) : (
          <Text numberOfLines={1} style={styles.rowTitle}>{label}</Text>
        )}
        <Text numberOfLines={1} style={styles.rowMeta}>{meta}</Text>
      </View>
    </Pressable>
  );
}

const newStyles = StyleSheet.create({
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
    alignItems: 'flex-end', // similar to baseline for RN
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

const styles = StyleSheet.create({
  content: {
    gap: rhythm.screenSectionGap,
  },
  emptySpace: {
    minHeight: 360,
  },
  historyAndRecommendationsBlock: {
    // keeping base gap if needed, though handled by separator now
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
  highlightedText: {
    backgroundColor: colors.primary.background,
    color: colors.primary.default,
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

