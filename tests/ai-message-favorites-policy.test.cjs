const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI message favorites schema uses a dedicated local table with stable key', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');

  assert.match(schema, /DATABASE_VERSION = 5[1-9]/);
  assert.match(schema, /MIGRATION_STATEMENTS_V37/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_message_favorites/);
  assert.match(schema, /favoriteKey TEXT NOT NULL/);
  assert.match(schema, /branchScopesJson TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_message_favorites_key/);
  assert.match(schema, /ON ai_message_favorites\(favoriteKey\)/);
  assert.match(schema, /FOREIGN KEY \(threadId\) REFERENCES ai_threads\(id\) ON DELETE CASCADE/);
  assert.match(schema, /FOREIGN KEY \(messageId\) REFERENCES ai_messages\(id\) ON DELETE CASCADE/);
  assert.match(db, /MIGRATION_STATEMENTS_V37/);
  assert.match(db, /currentVersion < 37/);
});

test('AI message favorite repository only accepts assistant messages and normalizes identity', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(repository, /export interface AiMessageFavoriteRecord/);
  assert.match(repository, /export interface AiFavoriteAssistantMessageInput/);
  assert.match(repository, /function normalizeFavoriteBranchScopes/);
  assert.match(repository, /branchRootMessageId\.localeCompare/);
  assert.match(repository, /branchVersionIndex - right\.branchVersionIndex/);
  assert.match(repository, /function buildAiMessageFavoriteKey/);
  assert.match(repository, /favoriteAssistantMessage/);
  assert.match(repository, /unfavoriteAssistantMessage/);
  assert.match(repository, /listFavoriteAssistantMessages/);
  assert.match(repository, /findFavoriteAssistantMessageState/);
  assert.match(repository, /listFavoriteAssistantMessageKeys/);
  assert.match(repository, /favoriteKey IN \(\$\{makeInClause\(chunk\)\}\)/);
  assert.match(repository, /message\.role !== 'assistant'/);
  assert.match(repository, /Only assistant messages can be favorited/);
});

test('AI chat service exposes local favorite wrappers without remote calls', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /export interface AiMessageFavoriteListItem/);
  assert.match(service, /export async function toggleAssistantMessageFavorite/);
  assert.match(service, /export async function listFavoriteAssistantMessages/);
  assert.match(service, /export async function findFavoriteAssistantMessageState/);
  assert.match(service, /export async function listFavoriteAssistantMessageKeys/);
  assert.match(service, /branchScopesJson/);
  const toggleStart = service.indexOf('export async function toggleAssistantMessageFavorite');
  const toggleEnd = service.indexOf('export async function findFavoriteAssistantMessageState');
  assert.notEqual(toggleStart, -1);
  assert.notEqual(toggleEnd, -1);
  const toggleBody = service.slice(toggleStart, toggleEnd);
  assert.match(toggleBody, /runWithDatabaseSpace/);
  assert.match(toggleBody, /aiThreadRepository\.favoriteAssistantMessage/);
  assert.match(toggleBody, /aiThreadRepository\.unfavoriteAssistantMessage/);
  assert.doesNotMatch(toggleBody, /streamChat|embedding|retrieveForThread|generate/);
});

test('assistant message bubbles expose favorite action beside copy and regenerate', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(bubble, /favorited\?: boolean/);
  assert.match(bubble, /favoriteDisabledByGeneration\?: boolean/);
  assert.match(bubble, /favoritePending\?: boolean/);
  assert.match(bubble, /onToggleFavorite\?: \(message: AiMessageWithCitations\) => void/);
  assert.match(bubble, /accessibilityLabel=\{favorited \? '取消收藏 AI 消息' : '收藏 AI 消息'\}/);
  assert.match(bubble, /name=\{favorited \? 'star' : 'star-outline'\}/);
  assert.match(bubble, /onToggleFavorite\?\.\(message\)/);
  assert.match(bubble, /canFavorite/);
  assert.match(bubble, /!isUser/);
  assert.match(bubble, /onCopy[\s\S]*onToggleFavorite[\s\S]*onRegenerate/);
});

test('AI chat screen toggles favorites with current branch and visible version identity', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /favoriteStateByKey/);
  assert.match(chat, /favoritePendingByKey/);
  assert.match(chat, /buildMessageFavoriteIdentity/);
  assert.match(chat, /getPersistedCurrentBranchScopes\(\)/);
  assert.match(chat, /message\.versionIndex/);
  assert.match(chat, /toggleAssistantMessageFavorite/);
  assert.match(chat, /listFavoriteAssistantMessageKeys/);
  assert.match(chat, /const assistantFavoriteKeyState = useMemo/);
  assert.match(chat, /signature: keys\.join\('\\u001f'\)/);
  assert.match(chat, /const favoriteKeys = assistantFavoriteKeyState\.keys/);
  assert.match(chat, /const favoritedKeys = await listFavoriteAssistantMessageKeys\(\{ favoriteKeys, space \}\)/);
  assert.doesNotMatch(chat, /assistantMessages\.map\(async \(message\)/);
  assert.match(chat, /\}, \[assistantFavoriteKeyState\.signature, space\]\);/);
  assert.doesNotMatch(chat, /\}, \[space, visibleMessages, selectedVersionByMessageId, persistedCurrentBranchScopes\]\);/);
  assert.match(chat, /activeMessageBranchScopesRef/);


  assert.match(chat, /favorited=\{/);
  assert.match(chat, /favoriteDisabledByGeneration=\{/);
  assert.match(chat, /favoritePending=\{/);
  assert.match(chat, /persistedCurrentBranchScopes,/);
  assert.match(chat, /selectedVersionByMessageId,/);
});

test('Favorites Center includes AI message segment and opens source chat target', () => {
  const favorites = read('src/screens/FavoritesScreen.tsx');
  const app = read('App.tsx');

  assert.match(favorites, /onOpenAiMessageFavorite/);
  assert.match(favorites, /listFavoriteAssistantMessagePage/);
  assert.match(favorites, /图片/);
  assert.match(favorites, /AI 消息/);
  assert.match(favorites, /还没有收藏 AI 消息/);
  assert.match(favorites, /favorite\.threadTitle/);
  assert.match(favorites, /favorite\.snippet/);
  assert.match(favorites, /favoriteMode === 'images' && multiSelect\.isSelectionMode/);
  assert.match(favorites, /aiFavoriteErrorMessage/);
  assert.match(favorites, /aiMessages\.length/);
  assert.match(favorites, /images\.length/);
  assert.match(favorites, /条/);
  assert.match(favorites, /张/);
  assert.match(app, /onOpenAiMessageFavorite/);
  assert.match(app, /searchTargetMessageId: favorite\.messageId/);
  assert.match(app, /searchTargetBranchScopes: favorite\.branchScopes/);
  assert.match(app, /contextTitle: favorite\.threadTitle/);
});
