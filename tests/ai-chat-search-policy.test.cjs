const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI chat search is a full-page current-route local fuzzy search flow', () => {
  const app = read('App.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const search = read('src/screens/AiChatSearchScreen.tsx');
  const service = read('src/ai/aiChatService.ts');

  assert.match(app, /name: 'ai-chat-search'/);
  assert.match(app, /<AiChatSearchScreen/);
  assert.match(app, /onOpenChatSearch/);
  assert.match(chat, /accessibilityLabel="搜索当前聊天"/);
  assert.match(chat, /handleOpenChatSearch/);
  assert.match(chat, /onOpenChatSearch\(nextThreadId, getPersistedCurrentBranchScopes\(\)\)/);
  assert.match(search, /AiLightSearchBar/);
  assert.match(search, /searchThreadMessages/);
  assert.match(search, /当前路线没有找到相关聊天/);
  assert.match(search, /本地模糊查询/);
  assert.match(search, /formatSearchResultTime/);
  assert.match(search, /renderHighlightedSnippet/);
  assert.match(search, /matchHighlight/);
  assert.match(search, /KeyboardAvoidingView/);
  assert.match(search, /statusBarHeight \+ layout\.pageTopOffset/);
  assert.match(service, /export interface AiChatSearchResult/);
  assert.match(service, /export async function searchThreadMessages/);
  assert.match(service, /const branchScopes = input\.branchScopes \?\? \[\]/);
  assert.match(service, /aiThreadRepository\.searchCompletedMessageFts\(db, \{/);
  assert.match(service, /branchScopes,/);
  assert.match(service, /normalizeChatSearchText/);
  assert.match(service, /branchScopes/);
  assert.doesNotMatch(search, /streamChat|embed|embedding|retrieveForThread/);
});

test('AI chat search uses bounded SQLite candidates instead of materializing full long threads', () => {
  const service = read('src/ai/aiChatService.ts');
  const searchBody = /export async function searchThreadMessages[\s\S]*?\r?\n}\r?\n\r?\nexport async function loadThreadAvatarConfig/.exec(service)?.[0] ?? '';

  assert.match(searchBody, /const candidateLimit = offset \+ limit \+ 1/);
  assert.match(searchBody, /runWithDatabaseSpace\(input\.space, async \(db\) => \{/);
  assert.match(searchBody, /aiThreadRepository\.searchCompletedMessageFts\(db, \{/);
  assert.match(searchBody, /limit: candidateLimit/);
  assert.match(searchBody, /aiThreadRepository\.listMessageVersionTotalsForMessages\(db, messageIds\)/);
  assert.match(searchBody, /const pagedMatches = matches\.slice\(offset, offset \+ limit\)/);
  assert.match(searchBody, /hasMore: matches\.length > offset \+ limit/);
  assert.doesNotMatch(searchBody, /listThreadMessages\(input\.space, input\.threadId/);
});

test('AI chat search ranks exact hits before fuzzy hits', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /export type AiChatSearchMatchKind = 'exact' \| 'fuzzy'/);
  assert.match(service, /matchKind: AiChatSearchMatchKind/);
  assert.match(service, /scoreChatSearchMessage/);
  assert.match(service, /exact/);
  assert.match(service, /fuzzy/);
  assert.match(service, /left\.rank - right\.rank/);
  assert.match(service, /createdAt\.localeCompare/);
});

test('AI chat search result selection returns to chat and scrolls to target', () => {
  const app = read('App.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const search = read('src/screens/AiChatSearchScreen.tsx');

  assert.match(app, /searchTargetMessageId\?: string/);
  assert.match(app, /searchTargetKey\?: string/);
  assert.match(app, /searchTargetBranchScopes\?: AiBranchScope\[\]/);
  assert.match(app, /searchTargetBranchScopes: searchRoute\.branchScopes/);
  assert.match(app, /onSelectResult=\{\(result\) =>/);
  assert.match(app, /searchTargetMessageId: result\.messageId/);
  assert.match(chat, /searchTargetMessageId\?: string/);
  assert.match(chat, /searchTargetBranchScopes\?: AiBranchScope\[\]/);
  assert.match(chat, /currentBranchScopes = searchTargetBranchScopes \?\? await loadPersistedCurrentBranchScopes\(targetThreadId\)/);
  assert.match(chat, /pendingSearchScrollMessageIdRef/);
  assert.match(chat, /searchHighlightMessageId/);
  assert.match(chat, /scheduleSearchTargetScroll/);
  assert.match(chat, /retrySearchScrollToIndex/);
  assert.match(search, /onSelectResult\(result\)/);
});

test('AI chat search target scroll is not overwritten by latest-message jumps', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const routeReloadEffect = /  useEffect\(\(\) => \{\r?\n    const targetThreadId = threadId \?\? null;[\s\S]*?\r?\n  \}, \[reloadMessages[\s\S]*?threadId\]\);/.exec(chat)?.[0] ?? '';
  const composerHeightHandler = /  const handleComposerHeightChange = useCallback\(\(\) => \{\r?\n[\s\S]*?\r?\n  \}, \[scrollToLatestMessage\]\);/.exec(chat)?.[0] ?? '';
  const viewableHandler = /const handleInlineEditViewableItemsChangedRef = useRef\(\([\s\S]*?\n  \}\);/.exec(chat)?.[0] ?? '';
  const searchRetryHandler = /  function retrySearchScrollToIndex\(info: \{ averageItemLength: number; index: number \}\) \{\r?\n[\s\S]*?\r?\n  \}/.exec(chat)?.[0] ?? '';
  const branchTreeRetryHandler = /  function retryBranchTreeScrollToIndex\(info: \{ averageItemLength: number; index: number \}\) \{\r?\n[\s\S]*?\r?\n  \}/.exec(chat)?.[0] ?? '';
  const searchTargetGuard = /if \(hasSearchTarget\) \{\s*return;\s*\}/.exec(routeReloadEffect)?.[0] ?? '';
  const pendingSearchGuard = /if \(pendingSearchScrollMessageIdRef\.current\) \{\s*return;\s*\}/.exec(composerHeightHandler)?.[0] ?? '';
  const pendingClearByTimeout = /setTimeout\(\(\) => \{\s*if \(pendingSearchScrollMessageIdRef\.current === targetMessageId\) \{\s*pendingSearchScrollMessageIdRef\.current = null;/;

  assert.match(routeReloadEffect, /const hasSearchTarget = Boolean\(searchTargetMessageId\)/);
  assert.match(chat, /const SEARCH_SCROLL_RETRY_DELAYS_MS = \[80, 260, 520, 900, 1400, 2200, 3400\]/);
  assert.match(routeReloadEffect, /await reloadMessages\(targetThreadId, \{\s*anchorMessageId: searchTargetMessageId \?\? undefined,\s*branchScopes: currentBranchScopes,\s*forceToLatest: !hasSearchTarget,\s*\}\)/);
  assert.match(searchTargetGuard, /return/);
  assert.doesNotMatch(searchTargetGuard, /scheduleIntentionalLatestJump/);
  assert.match(routeReloadEffect, /searchTargetMessageId/);
  assert.match(composerHeightHandler, /pendingSearchScrollMessageIdRef\.current/);
  assert.match(pendingSearchGuard, /return/);
  assert.doesNotMatch(pendingSearchGuard, /scrollToLatestMessage\(false\)/);
  assert.match(viewableHandler, /pendingSearchScrollMessageIdRef\.current/);
  assert.match(viewableHandler, /clearSearchScrollTimeouts\(\)/);
  assert.doesNotMatch(chat, pendingClearByTimeout);
  assert.match(searchRetryHandler, /const failedMessageId = getMessageItemIdAtIndex\(info\.index\)/);
  assert.match(searchRetryHandler, /failedMessageId !== targetMessageId/);
  assert.match(searchRetryHandler, /scrollToOffset/);
  assert.match(branchTreeRetryHandler, /const failedMessageId = getMessageItemIdAtIndex\(info\.index\)/);
  assert.match(branchTreeRetryHandler, /failedMessageId !== targetMessageId/);
});
