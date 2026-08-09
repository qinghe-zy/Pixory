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

test('chat preserves explicit base-route scope when reloading messages', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.doesNotMatch(
    chat,
    /branchScopes && branchScopes\.length > 0 \? branchScopes : undefined/,
    'an explicit [] is the base route, not an unrestricted all-branch query',
  );
});

test('message paging orders equal timestamps with the same rowid cursor in both directions', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const listMessagesBase = repository.slice(
    repository.indexOf('async listMessagesBase'),
    repository.indexOf('async listMessagesBaseAroundAnchor'),
  );

  assert.match(listMessagesBase, /ORDER BY createdAt DESC, rowid DESC/);
  assert.match(listMessagesBase, /ORDER BY createdAt ASC, rowid ASC/);
});
