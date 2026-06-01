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
  assert.match(service, /branchScopes,\s*\}\)/);
  assert.match(service, /normalizeChatSearchText/);
  assert.match(service, /branchScopes/);
  assert.doesNotMatch(search, /streamChat|embed|embedding|retrieveForThread/);
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
