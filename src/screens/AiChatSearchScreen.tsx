import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { searchThreadMessages, type AiChatSearchResult } from '../ai/aiChatService';
import { AiLightSearchBar } from '../components/ai/AiLightField';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppScreen } from '../components/AppScreen';
import type { PixorySpace } from '../database';
import type { AiBranchScope } from '../database/repositories/aiThreadRepository';
import { layout, radius, rhythm, spacing, typography } from '../design/tokens';

const SEARCH_PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 220;

interface AiChatSearchScreenProps {
  branchScopes: AiBranchScope[];
  contextTitle?: string;
  space: PixorySpace;
  threadId: string;
  onBack: () => void;
  onSelectResult: (result: AiChatSearchResult) => void;
}

export function AiChatSearchScreen({
  branchScopes,
  contextTitle,
  space,
  threadId,
  onBack,
  onSelectResult,
}: AiChatSearchScreenProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AiChatSearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const offsetRef = useRef(0);

  const runSearch = useCallback(
    async (searchQuery: string, offset = 0) => {
      const trimmedQuery = searchQuery.trim();
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      if (!trimmedQuery) {
        offsetRef.current = 0;
        setResults([]);
        setHasMore(false);
        setErrorMessage(null);
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      if (offset === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setErrorMessage(null);
      try {
        const response = await searchThreadMessages({
          branchScopes,
          limit: SEARCH_PAGE_SIZE,
          offset,
          query: trimmedQuery,
          space,
          threadId,
        });
        if (requestIdRef.current !== requestId) {
          return;
        }
        offsetRef.current = offset + response.results.length;
        setHasMore(response.hasMore);
        setResults((current) => (offset === 0 ? response.results : [...current, ...response.results]));
      } catch (error) {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '搜索当前聊天失败');
        setHasMore(false);
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [branchScopes, space, threadId]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      void runSearch(query, 0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, runSearch]);

  function loadMore() {
    if (loading || loadingMore || !hasMore) {
      return;
    }
    void runSearch(query, offsetRef.current);
  }

  function handleSelectResult(result: AiChatSearchResult) {
    onSelectResult(result);
  }

  const hasQuery = query.trim().length > 0;
  const title = contextTitle ?? '当前聊天';

  return (
    <AppScreen backgroundColor={aiLightColors.canvas} contentStyle={styles.host}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? 'height' : undefined}
        enabled={Platform.OS === 'android'}
        style={[styles.screen, { paddingTop: statusBarHeight + layout.pageTopOffset }]}
      >
        <View style={styles.header}>
          <Pressable accessibilityLabel="返回聊天" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
            <Ionicons color={aiLightColors.ink} name="chevron-back" size={22} />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text numberOfLines={1} style={styles.title}>聊天内搜索</Text>
            <Text numberOfLines={1} style={styles.subtitle}>{title} · 本地模糊查询</Text>
          </View>
        </View>

        <AiLightSearchBar onChangeText={setQuery} placeholder="搜索当前聊天" value={query} />

        {errorMessage ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateTitle}>搜索失败</Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
          </View>
        ) : null}

        {!hasQuery && !errorMessage ? (
          <View style={styles.stateBox}>
            <Ionicons color={aiLightColors.coralActive} name="search-outline" size={24} />
            <Text style={styles.stateTitle}>输入关键词查找聊天</Text>
            <Text style={styles.stateText}>会先显示精确查询结果，再显示本地模糊查询内容。</Text>
          </View>
        ) : null}

        {hasQuery && !loading && results.length === 0 && !errorMessage ? (
          <View style={styles.stateBox}>
            <Ionicons color={aiLightColors.muted} name="chatbubble-ellipses-outline" size={24} />
            <Text style={styles.stateTitle}>当前路线没有找到相关聊天</Text>
            <Text style={styles.stateText}>当前版本只搜索本分支路线，不会混入其他分支。</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={aiLightColors.coralActive} />
            <Text style={styles.stateText}>正在搜索当前路线</Text>
          </View>
        ) : null}

        <FlatList
          data={results}
          keyExtractor={(item) => item.messageId}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              accessibilityLabel={`定位到${item.role === 'user' ? '你' : 'AI'}的聊天消息`}
              accessibilityRole="button"
              onPress={() => handleSelectResult(item)}
              style={({ pressed }) => [styles.resultRow, item.matchKind === 'exact' && styles.exactResultRow, pressed && styles.pressed]}
            >
              <View style={styles.resultHeader}>
                <Text style={[styles.rolePill, item.role === 'user' && styles.userRolePill]}>{item.role === 'user' ? '你' : 'AI'}</Text>
                <Text style={styles.matchKind}>{item.matchKind === 'exact' ? '精确' : '模糊'}</Text>
                <Text style={styles.timeText}>{formatSearchResultTime(item.createdAt)}</Text>
                {item.versionTotal > 1 ? <Text style={styles.versionText}>v{item.versionIndex}/{item.versionTotal}</Text> : null}
              </View>
              <Text numberOfLines={3} style={styles.snippet}>
                {renderHighlightedSnippet(item.snippet || item.content, item.matchedTerms)}
              </Text>
            </Pressable>
          )}
          ListFooterComponent={
            hasMore ? (
              <Pressable accessibilityLabel="继续加载更多搜索结果" accessibilityRole="button" disabled={loadingMore} onPress={loadMore} style={({ pressed }) => [styles.loadMoreButton, pressed && styles.pressed]}>
                {loadingMore ? <ActivityIndicator color={aiLightColors.coralActive} size="small" /> : null}
                <Text style={styles.loadMoreText}>继续加载更多结果</Text>
              </Pressable>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

function formatSearchResultTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const datePart = sameYear
    ? `${date.getMonth() + 1}-${date.getDate()}`
    : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return `${datePart} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedSnippet(snippet: string, terms: string[]) {
  const highlightTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  if (highlightTerms.length === 0 || !snippet) {
    return snippet;
  }
  const pattern = new RegExp(`(${highlightTerms.map(escapeRegExp).join('|')})`, 'gi');
  return snippet.split(pattern).map((part, index) => {
    const highlighted = highlightTerms.some((term) => part.toLowerCase() === term.toLowerCase());
    return highlighted ? (
      <Text key={`${part}-${index}`} style={styles.matchHighlight}>{part}</Text>
    ) : (
      <Text key={`${part}-${index}`}>{part}</Text>
    );
  });
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  screen: {
    flex: 1,
    gap: rhythm.cardContentGap,
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  roundButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  titleBlock: {
    flex: 1,
    gap: rhythm.microGap,
  },
  title: {
    ...typography.textStyles.navTitle,
    color: aiLightColors.ink,
  },
  subtitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  stateBox: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[5],
  },
  stateTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    textAlign: 'center',
  },
  stateText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    textAlign: 'center',
  },
  loadingBox: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'center',
    minHeight: spacing[10],
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: rhythm.listCardGap,
    paddingBottom: spacing[6],
  },
  resultRow: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  exactResultRow: {
    borderColor: aiLightColors.coral,
  },
  resultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  rolePill: {
    ...typography.textStyles.micro,
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    color: aiLightColors.ink,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  userRolePill: {
    backgroundColor: aiLightColors.coral,
    color: aiLightColors.onDark,
  },
  matchKind: {
    ...typography.textStyles.micro,
    color: aiLightColors.coralActive,
    fontWeight: '700',
  },
  versionText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    marginLeft: 'auto',
  },
  timeText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
  },
  snippet: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    lineHeight: 22,
  },
  matchHighlight: {
    backgroundColor: aiLightColors.coralSoft,
    color: aiLightColors.coralActive,
    fontWeight: '800',
  },
  loadMoreButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: spacing[10],
    paddingHorizontal: spacing[4],
  },
  loadMoreText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
});