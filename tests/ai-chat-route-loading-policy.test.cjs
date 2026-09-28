const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('chat route loading has one adopted-route snapshot boundary', () => {
  const snapshotPath = path.join(root, 'src/ai/aiThreadRouteSnapshotService.ts');
  assert.equal(
    fs.existsSync(snapshotPath),
    true,
    'chat route reads must be defined by a reusable adopted-route snapshot service',
  );

  const snapshot = read('src/ai/aiThreadRouteSnapshotService.ts');
  const prefetch = read('src/ai/aiThreadMessagePrefetch.ts');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(snapshot, /export interface AiAdoptedThreadRouteSnapshot/);
  assert.match(snapshot, /export async function loadAdoptedThreadRouteSnapshot/);
  assert.match(snapshot, /selectedVersionByMessageId/);
  assert.match(snapshot, /hasEarlierMessages/);
  assert.match(snapshot, /lineageVersion/);
  assert.match(prefetch, /loadAdoptedThreadRouteSnapshot/);
  assert.match(chat, /prefetched\.selectedVersionByMessageId/);
  assert.match(chat, /selectedVersionByMessageIdRef\.current = prefetched\.selectedVersionByMessageId/);
});

test('route snapshots use a bounded page and retain its older cursor', () => {
  const snapshot = read('src/ai/aiThreadRouteSnapshotService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /export async function loadThreadMessagePageInDatabase/);
  assert.match(service, /const hasEarlierMessages = candidates\.length > limit/);
  assert.match(service, /olderCursor: oldest \? \{ createdAt: oldest\.createdAt, id: oldest\.id \} : null/);
  assert.match(snapshot, /olderCursor/);
  assert.match(snapshot, /loadThreadMessagePageInDatabase/);
  assert.match(snapshot, /loadThreadMessagePageAroundAnchorInDatabase/);
  assert.doesNotMatch(snapshot, /countMessagesBase/);
  assert.match(chat, /olderMessageCursorRef/);
  assert.match(chat, /loadThreadMessagePage\(space, targetThreadId/);
  assert.doesNotMatch(chat, /loadedMessageLimitRef\.current \+ CHAT_MESSAGE_PAGE_SIZE/);
});

test('anchored chat pages retain a real cursor for loading earlier history', () => {
  const service = read('src/ai/aiChatService.ts');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(service, /export async function loadThreadMessagePageAroundAnchorInDatabase/);
  assert.match(service, /aiThreadRepository\.listMessagesBaseAroundAnchor/);
  assert.match(service, /aiThreadRepository\.listMessagesBaseBefore/);
  assert.match(chat, /loadThreadMessagePageAroundAnchor\(space, targetThreadId/);
  assert.match(chat, /nextOlderCursor = page\.olderCursor/);
  assert.doesNotMatch(chat, /nextHasEarlierMessages = true;\s*nextOlderCursor = null;/);
});

test('chat preserves explicit base-route scope when reloading messages', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.doesNotMatch(
    chat,
    /branchScopes && branchScopes\.length > 0 \? branchScopes : undefined/,
    'an explicit [] is the base route, not an unrestricted all-branch query',
  );
  assert.match(
    chat,
    /selectedVersionByMessageIdRef\.current = buildBranchSelectionMap\(resolvedScopes\)/,
    'base-route reloads must also clear stale branch-version selections',
  );
});

test('chat shows a recoverable load error instead of treating failed history reads as an empty thread', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /const \[messageLoadError, setMessageLoadError\]/);
  assert.match(chat, /setMessageLoadError\([^)]*聊天记录加载失败/);
  assert.match(
    chat,
    /invertedMessageItems\.length === 0 && isMessageListReady && !errorMessage && !messageLoadError/,
  );
});

test('new sends optimistically append the persisted user message before the assistant placeholder', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /function createOptimisticUserMessage\(/);
  assert.match(chat, /onCreated: \(\{ assistantMessageId, generationId, thinkingExpected, userMessageId \}\) =>/);
  assert.match(
    chat,
    /createOptimisticUserMessage\([\s\S]{0,500}createStreamingAssistantMessage/,
    'the user bubble must be present even while the database refresh is pending',
  );
});

test('message paging uses a deterministic createdAt and id boundary', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const listMessagesBase = repository.slice(
    repository.indexOf('async listMessagesBase'),
    repository.indexOf('async listMessagesBaseAroundAnchor'),
  );

  assert.match(listMessagesBase, /ORDER BY createdAt DESC, id DESC/);
  assert.match(listMessagesBase, /ORDER BY createdAt ASC, id ASC/);
  assert.match(listMessagesBase, /async listMessagesBaseBefore/);
  assert.doesNotMatch(listMessagesBase, /rowid AS rowOrder/);
  assert.doesNotMatch(listMessagesBase, /ORDER BY createdAt DESC, rowid DESC/);
});
