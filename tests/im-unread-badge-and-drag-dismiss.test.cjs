const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('IM unread badge and drag dismiss policy verification', async (t) => {
  const repoPath = path.resolve(root, 'src/im/repository/imThreadRepository.ts');
  const repoContent = fs.readFileSync(repoPath, 'utf8');

  const badgePath = path.resolve(root, 'src/components/common/DraggableBadge.tsx');
  const badgeContent = fs.readFileSync(badgePath, 'utf8');

  const bottomTabPath = path.resolve(root, 'src/components/BottomTabBar.tsx');
  const bottomTabContent = fs.readFileSync(bottomTabPath, 'utf8');

  const threadListPath = path.resolve(root, 'src/im/components/ImThreadList.tsx');
  const threadListContent = fs.readFileSync(threadListPath, 'utf8');

  const appPath = path.resolve(root, 'App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  await t.test('imThreadRepository exports clearAllImUnread and dispatches notifyListeners on unread state updates', () => {
    assert.match(repoContent, /export async function clearAllImUnread/);
    assert.match(repoContent, /GlobalHeartbeatEngine\.shared\.notifyListeners/);

    // Verify clearImThreadHistory notifies heartbeat
    const clearHistoryMatch = repoContent.match(/export async function clearImThreadHistory[\s\S]*?GlobalHeartbeatEngine\.shared\.notifyListeners\(threadId,\s*space\)/);
    assert.ok(clearHistoryMatch, 'clearImThreadHistory must dispatch notifyListeners');

    // Verify markImThreadRead notifies heartbeat
    const markReadMatch = repoContent.match(/export async function markImThreadRead[\s\S]*?GlobalHeartbeatEngine\.shared\.notifyListeners\(threadId,\s*space\)/);
    assert.ok(markReadMatch, 'markImThreadRead must dispatch notifyListeners');

    // Verify clearAllImUnread notifies heartbeat
    const clearAllMatch = repoContent.match(/export async function clearAllImUnread[\s\S]*?GlobalHeartbeatEngine\.shared\.notifyListeners\('',\s*space\)/);
    assert.ok(clearAllMatch, 'clearAllImUnread must dispatch notifyListeners');
  });

  await t.test('getTotalImUnreadCount restricts query to chat_mode = im and performs zero-message ghost count self-healing', () => {
    assert.match(repoContent, /chat_mode = 'im'/);
    assert.match(repoContent, /archivedAt IS NULL/);
    assert.match(repoContent, /UPDATE ai_threads[\s\S]*?SET im_unread_count = 0[\s\S]*?NOT IN \([\s\S]*?SELECT DISTINCT threadId FROM ai_messages/);
  });

  await t.test('DraggableBadge component implements gesture threshold, viscous stretch, and explode dismissal', () => {
    assert.match(badgeContent, /export function DraggableBadge/);
    assert.match(badgeContent, /activeOffsetX\(\[-6,\s*6\]\)/);
    assert.match(badgeContent, /activeOffsetY\(\[-6,\s*6\]\)/);
    assert.match(badgeContent, /SNAP_DISTANCE = 50/);
    assert.match(badgeContent, /Haptics\.impactAsync/);
    assert.match(badgeContent, /Haptics\.notificationAsync/);
    assert.match(badgeContent, /runOnJS\(handleDismissComplete\)/);
  });

  await t.test('BottomTabBar integrates DraggableBadge on IM tab with onClearAllImUnread', () => {
    assert.match(bottomTabContent, /onClearAllImUnread\?: \(\) => void/);
    assert.match(bottomTabContent, /<DraggableBadge[\s\S]*?isBottomTab[\s\S]*?onDismiss=\{onClearAllImUnread\}/);
    assert.match(appContent, /clearAllImUnread/);
    assert.match(appContent, /handleClearAllImUnread/);
    assert.match(appContent, /onClearAllImUnread=\{handleClearAllImUnread\}/);
  });

  await t.test('ImThreadList integrates DraggableBadge for thread items and folded items', () => {
    assert.match(threadListContent, /import \{ DraggableBadge \} from '\.\.\/\.\.\/components\/common\/DraggableBadge'/);
    assert.match(threadListContent, /<DraggableBadge[\s\S]*?count=\{unreadCount\}[\s\S]*?onDismiss=\{[\s\S]*?feed\.markRead\(threadItem\)/);
    assert.match(threadListContent, /<DraggableBadge[\s\S]*?count=\{totalUnread\}[\s\S]*?onDismiss=/);
  });
});
