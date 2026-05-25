# AI Chat Navigation And Stability Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable AI chat navigation polish pass with a left drawer, cleaner history recovery, compact attachment popover, fixed edit/regenerate actions, inline streaming cursor, and no chat-list jitter regressions.

**Architecture:** Keep the current AI chat services and SQLite data model. Add a focused drawer component for chat navigation, replace composer attachment bottom sheet behavior with an anchored popover, tighten chat action state handling, and preserve the existing inverted-list/Android `adjustResize` scroll model.

**Tech Stack:** Expo React Native, TypeScript, React Native Animated/PanResponder, existing Pixory AI light components, SQLite-backed AI chat services, Node policy tests under `tests/*.test.cjs`.

---

## Scope And Guardrails

- Do not add cloud, sync, account, web search, image generation, or any new remote feature.
- Do not remove the existing full `AiHistoryScreen`; the drawer links to it.
- Do not implement Claude projects/artifacts or paid-upgrade concepts.
- Do not reintroduce `keyboardBottomInset`, message-list `onContentSizeChange` auto-scroll, or forced `scrollToEnd`.
- Keep all recent/history queries scoped to the active `PixorySpace`.
- Preserve existing uncommitted user/code changes. If a file is already modified, inspect it before editing and only change the lines needed for this plan.
- Commit after each task that changes code.

## File Structure

Create:

- `src/components/ai/AiComprehensiveRecordDrawer.tsx`  
  Left drawer overlay for AI chat navigation. Owns drawer layout, recent list rendering, and action callbacks. No routing logic beyond callback invocation.

Modify:

- `src/screens/AiChatScreen.tsx`  
  Replace visible back button with drawer trigger, remove composer-area recent switcher, host drawer state, tighten edit/regenerate/streaming cursor behavior, and keep scroll policy stable.

- `src/components/ai/AiChatComposer.tsx`  
  Replace the large attachment sheet trigger contract with compact icon-only popover support and separate attachment option callbacks.

- `src/screens/AiHistoryScreen.tsx`  
  Fix archive/restore swipe background and animation so only the intended Gmail-like action area is revealed.

- `src/screens/AiHomeScreen.tsx`  
  Remove `最近继续` state, fetching, section, and unused callbacks/imports.

- `App.tsx`  
  Pass drawer navigation callbacks into `AiChatScreen` and keep existing full history route.

- `tests/ai-chat-fixes-policy.test.cjs`  
  Add tests for edit/regenerate action paths, inline cursor policy, scroll no-jitter preservation, and compact attachment popover.

- `tests/ai-navigation-policy.test.cjs`  
  Add tests for drawer route behavior, workbench cleanup, full history route preservation, and recent limit.

---

### Task 1: Drawer Contract And Navigation Policy Tests

**Files:**

- Test: `tests/ai-navigation-policy.test.cjs`
- Modify later: `src/screens/AiChatScreen.tsx`
- Modify later: `App.tsx`
- Create later: `src/components/ai/AiComprehensiveRecordDrawer.tsx`

- [ ] **Step 1: Add failing navigation policy tests**

Append these tests to `tests/ai-navigation-policy.test.cjs`:

```js
test('AI chat exposes comprehensive record drawer from the top-left menu', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const app = read('App.tsx');
  const drawer = read('src/components/ai/AiComprehensiveRecordDrawer.tsx');

  assert.match(chat, /onOpenHistory/);
  assert.match(chat, /onStartNormalChat/);
  assert.match(chat, /AiComprehensiveRecordDrawer/);
  assert.match(chat, /accessibilityLabel="打开综合记录"/);
  assert.match(chat, /menu-outline/);
  assert.doesNotMatch(chat, /accessibilityLabel="返回"[\s\S]{0,160}chevron-back/);
  assert.match(app, /onOpenHistory=\{\(\) => pushRoute\(\{ name: 'ai-history'/);
  assert.match(drawer, /export function AiComprehensiveRecordDrawer/);
  assert.match(drawer, /新聊天/);
  assert.match(drawer, /历史记录/);
  assert.match(drawer, /最近/);
  assert.match(drawer, /recentThreads\.slice\(0, 15\)/);
});

test('AI workbench no longer shows recent continue because recents moved into drawer', () => {
  const home = read('src/screens/AiHomeScreen.tsx');
  assert.doesNotMatch(home, /最近继续/);
  assert.doesNotMatch(home, /recentThreads/);
  assert.doesNotMatch(home, /listAiHistoryThreads/);
  assert.doesNotMatch(home, /formatAiHistoryMinute/);
  assert.match(home, /角色库/);
});
```

- [ ] **Step 2: Run the navigation tests and verify failure**

Run:

```powershell
node --test tests\ai-navigation-policy.test.cjs
```

Expected: FAIL because `AiComprehensiveRecordDrawer.tsx` does not exist, `AiChatScreen` still exposes a visible back button, and `AiHomeScreen` still renders `最近继续`.

- [ ] **Step 3: Commit the failing tests**

```powershell
git add tests\ai-navigation-policy.test.cjs
git commit -m "test: cover ai chat drawer navigation"
```

---

### Task 2: Comprehensive Record Drawer Component

**Files:**

- Create: `src/components/ai/AiComprehensiveRecordDrawer.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `App.tsx`
- Test: `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Create the drawer component**

Create `src/components/ai/AiComprehensiveRecordDrawer.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AiThreadHistoryItem } from '../../database/repositories/aiThreadRepository';
import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { formatAiHistoryMinute } from '../../utils/aiTimeFormatters';
import { aiLightColors } from './aiLightTheme';

interface AiComprehensiveRecordDrawerProps {
  visible: boolean;
  recentThreads: AiThreadHistoryItem[];
  activeThreadId?: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onOpenHistory: () => void;
  onOpenThread: (thread: AiThreadHistoryItem) => void;
}

export function AiComprehensiveRecordDrawer({
  visible,
  recentThreads,
  activeThreadId = null,
  onClose,
  onNewChat,
  onOpenHistory,
  onOpenThread,
}: AiComprehensiveRecordDrawerProps) {
  if (!visible) {
    return null;
  }

  const visibleRecents = recentThreads.filter((thread) => thread.id !== activeThreadId).slice(0, 15);

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Pressable accessibilityLabel="关闭综合记录" accessibilityRole="button" onPress={onClose} style={styles.scrim} />
      <View style={styles.drawer}>
        <Text style={styles.brand}>Pixory AI</Text>
        <View style={styles.primaryActions}>
          <DrawerAction icon="add-circle-outline" label="新聊天" onPress={onNewChat} tone="accent" />
          <DrawerAction icon="chatbubbles-outline" label="历史记录" onPress={onOpenHistory} />
        </View>
        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>最近</Text>
        <ScrollView contentContainerStyle={styles.recentList} showsVerticalScrollIndicator={false}>
          {visibleRecents.length ? (
            visibleRecents.map((thread) => (
              <Pressable
                accessibilityRole="button"
                key={thread.id}
                onPress={() => onOpenThread(thread)}
                style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={styles.recentTitle}>{thread.title}</Text>
                <Text numberOfLines={1} style={styles.recentMeta}>
                  {thread.lastMessagePreview ?? `上次聊天 ${formatAiHistoryMinute(thread.lastMessageAt ?? thread.updatedAt)}`}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyText}>暂无最近会话</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function DrawerAction({
  icon,
  label,
  onPress,
  tone = 'default',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'accent';
}) {
  const color = tone === 'accent' ? aiLightColors.coralActive : aiLightColors.ink;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
      <Ionicons color={color} name={icon} size={metrics.iconSizeLg} />
      <Text style={[styles.actionLabel, tone === 'accent' && styles.actionLabelAccent]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 20,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24, 24, 24, 0.28)',
  },
  drawer: {
    backgroundColor: aiLightColors.canvas,
    borderBottomRightRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: rhythm.sectionGap,
    paddingBottom: spacing[5],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[10],
    width: '86%',
  },
  brand: {
    ...typography.textStyles.screenTitle,
    color: aiLightColors.ink,
  },
  primaryActions: {
    gap: rhythm.cardContentGap,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: metrics.minTouchSize,
  },
  actionLabel: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  actionLabelAccent: {
    color: aiLightColors.coralActive,
    fontWeight: '700',
  },
  divider: {
    backgroundColor: aiLightColors.hairline,
    height: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.muted,
  },
  recentList: {
    gap: rhythm.inlineGap,
    paddingBottom: spacing[8],
  },
  recentRow: {
    borderRadius: radius.md,
    gap: rhythm.microGap,
    paddingVertical: spacing[1],
  },
  recentTitle: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  recentMeta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  emptyText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  pressed: {
    opacity: 0.72,
  },
});
```

- [ ] **Step 2: Wire drawer props into `AiChatScreen`**

Modify `AiChatScreenProps` in `src/screens/AiChatScreen.tsx`:

```ts
  onOpenHistory: () => void;
  onStartNormalChat: () => void;
```

Add the import:

```ts
import { AiComprehensiveRecordDrawer } from '../components/ai/AiComprehensiveRecordDrawer';
```

Add state near other chat state:

```ts
  const [recordDrawerVisible, setRecordDrawerVisible] = useState(false);
```

Replace the visible header back button with:

```tsx
<Pressable accessibilityLabel="打开综合记录" accessibilityRole="button" onPress={() => setRecordDrawerVisible(true)} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
  <Ionicons color={aiLightColors.ink} name="menu-outline" size={22} />
</Pressable>
```

Render the drawer just before the closing `</AppScreen>`:

```tsx
<AiComprehensiveRecordDrawer
  activeThreadId={activeThreadId}
  recentThreads={recentThreads}
  visible={recordDrawerVisible}
  onClose={() => setRecordDrawerVisible(false)}
  onNewChat={() => {
    setRecordDrawerVisible(false);
    onStartNormalChat();
  }}
  onOpenHistory={() => {
    setRecordDrawerVisible(false);
    onOpenHistory();
  }}
  onOpenThread={(thread) => {
    setRecordDrawerVisible(false);
    onOpenThread(thread);
  }}
/>
```

- [ ] **Step 3: Pass drawer callbacks from `App.tsx`**

In the `AiChatScreen` render branch in `App.tsx`, add:

```tsx
onOpenHistory={() => pushRoute({ name: 'ai-history', space: currentRoute.space })}
onStartNormalChat={() => openNewAiChat(currentRoute.space)}
```

- [ ] **Step 4: Remove composer-area recent switcher**

In `src/screens/AiChatScreen.tsx`, remove this render from the composer panel:

```tsx
<AiRecentThreadSwitcher items={recentThreads.filter((thread) => thread.id !== activeThreadId)} onOpenThread={onOpenThread} />
```

Keep `recentThreads` state because the drawer uses it.

- [ ] **Step 5: Run tests**

Run:

```powershell
node --test tests\ai-navigation-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src\components\ai\AiComprehensiveRecordDrawer.tsx src\screens\AiChatScreen.tsx App.tsx tests\ai-navigation-policy.test.cjs
git commit -m "feat: add ai comprehensive record drawer"
```

---

### Task 3: Remove Workbench Recent Continue

**Files:**

- Modify: `src/screens/AiHomeScreen.tsx`
- Modify: `App.tsx`
- Test: `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Remove unused recent props/imports/state**

In `src/screens/AiHomeScreen.tsx`, remove:

```ts
import { useEffect, useState } from 'react';
import { listAiHistoryThreads } from '../ai/aiChatService';
import type { AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import { formatAiHistoryMinute } from '../utils/aiTimeFormatters';
```

Replace the React import with:

```ts
import type { ReactNode } from 'react';
```

Remove these props from `AiHomeScreenProps`:

```ts
  onOpenHistory: () => void;
  onOpenThread: (thread: AiThreadHistoryItem) => void;
```

Remove the destructured props:

```ts
  onOpenHistory,
  onOpenThread,
```

Remove:

```ts
  const [recentThreads, setRecentThreads] = useState<AiThreadHistoryItem[]>([]);
  useEffect(() => {
    let isMounted = true;
    void listAiHistoryThreads({ limit: 3, space }).then((items) => {
      if (isMounted) {
        setRecentThreads(items);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [space]);
```

- [ ] **Step 2: Remove the `最近继续` section**

Delete the whole section beginning with:

```tsx
<View style={styles.section}>
  <SectionTitle actionLabel="查看全部" title="最近继续" onPress={onOpenHistory} />
```

and ending after the empty recent row closing `</View>`.

- [ ] **Step 3: Update `App.tsx` home props**

In the root AI tab `AiHomeScreen` render, remove:

```tsx
onOpenHistory={() => pushRoute({ name: 'ai-history', space: activeSpace })}
onOpenThread={(thread) =>
  pushRoute({
    name: 'ai-chat',
    contextTitle: thread.title,
    contextType: thread.contextType,
    includeIpDocuments: thread.includeIpDocuments,
    ipId: thread.boundIpId ?? undefined,
    knowledgeBaseId: thread.boundKnowledgeBaseId ?? undefined,
    space: activeSpace,
    threadId: thread.id,
  })
}
```

Do not remove the `ai-history` route itself.

- [ ] **Step 4: Run tests**

Run:

```powershell
node --test tests\ai-navigation-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src\screens\AiHomeScreen.tsx App.tsx tests\ai-navigation-policy.test.cjs
git commit -m "feat: move ai recents into drawer"
```

---

### Task 4: Compact Attachment Popover

**Files:**

- Modify: `src/components/ai/AiChatComposer.tsx`
- Modify: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing composer policy test**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI composer uses compact icon-only attachment popover anchored above add button', () => {
  const composer = read('src/components/ai/AiChatComposer.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(composer, /attachmentPopoverVisible/);
  assert.match(composer, /styles\.attachmentPopover/);
  assert.match(composer, /accessibilityLabel="上传图片"/);
  assert.match(composer, /accessibilityLabel="上传视频"/);
  assert.match(composer, /accessibilityLabel="上传文档"/);
  assert.match(composer, /flexDirection: 'row'/);
  assert.doesNotMatch(composer, /添加附件[\s\S]{0,400}上传图片[\s\S]{0,400}上传视频[\s\S]{0,400}上传文档/);
  assert.doesNotMatch(chat, /attachmentSheetVisible/);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
node --test tests\ai-chat-fixes-policy.test.cjs
```

Expected: FAIL because the composer does not yet own a compact popover and chat still has `attachmentSheetVisible`.

- [ ] **Step 3: Change composer props**

In `AiChatComposerProps`, replace:

```ts
  onAddAttachment: () => void;
```

with:

```ts
  onAddImageAttachment: () => void;
  onAddVideoAttachment: () => void;
  onAddDocumentAttachment: () => void;
```

In the component parameters, replace `onAddAttachment` with:

```ts
  onAddImageAttachment,
  onAddVideoAttachment,
  onAddDocumentAttachment,
```

Add state:

```ts
  const [attachmentPopoverVisible, setAttachmentPopoverVisible] = useState(false);
```

- [ ] **Step 4: Render icon-only horizontal popover**

Replace the add button block with:

```tsx
<View style={styles.addButtonWrap}>
  {attachmentPopoverVisible ? (
    <View style={styles.attachmentPopover}>
      <AttachmentOption accessibilityLabel="上传图片" icon="image-outline" onPress={() => {
        setAttachmentPopoverVisible(false);
        onAddImageAttachment();
      }} />
      <AttachmentOption accessibilityLabel="上传视频" icon="videocam-outline" onPress={() => {
        setAttachmentPopoverVisible(false);
        onAddVideoAttachment();
      }} />
      <AttachmentOption accessibilityLabel="上传文档" icon="document-text-outline" onPress={() => {
        setAttachmentPopoverVisible(false);
        onAddDocumentAttachment();
      }} />
    </View>
  ) : null}
  <Pressable
    accessibilityLabel="添加附件"
    accessibilityRole="button"
    disabled={generating}
    hitSlop={spacing[2]}
    onPress={() => setAttachmentPopoverVisible((current) => !current)}
    style={({ pressed }) => [styles.addButton, generating && styles.disabled, pressed && !generating && styles.pressed]}
  >
    <Ionicons color={aiLightColors.coral} name="add" size={spacing[6]} />
  </Pressable>
</View>
```

Add the local helper above `export function AiChatComposer`:

```tsx
function AttachmentOption({
  accessibilityLabel,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.attachmentOption, pressed && styles.pressed]}>
      <Ionicons color={aiLightColors.ink} name={icon} size={spacing[5]} />
    </Pressable>
  );
}
```

Add styles:

```ts
  addButtonWrap: {
    position: 'relative',
  },
  attachmentPopover: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: spacing[10],
    flexDirection: 'row',
    gap: spacing[1],
    left: 0,
    padding: spacing[1],
    position: 'absolute',
    ...shadows.floating,
  },
  attachmentOption: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
```

- [ ] **Step 5: Wire specific attachment callbacks from `AiChatScreen`**

Remove:

```ts
const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
```

In the `AiChatComposer` call, replace:

```tsx
onAddAttachment={() => setAttachmentSheetVisible(true)}
```

with:

```tsx
onAddImageAttachment={() => void pickImageAttachment()}
onAddVideoAttachment={() => void pickVideoAttachment()}
onAddDocumentAttachment={() => void pickDocumentAttachment()}
```

Delete the large bottom sheet render for attachment choices. Keep the picker functions and attachment rail.

- [ ] **Step 6: Run tests**

```powershell
node --test tests\ai-chat-fixes-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src\components\ai\AiChatComposer.tsx src\screens\AiChatScreen.tsx tests\ai-chat-fixes-policy.test.cjs
git commit -m "feat: add compact ai attachment popover"
```

---

### Task 5: Gmail-Like History Archive And Restore Swipe

**Files:**

- Modify: `src/screens/AiHistoryScreen.tsx`
- Test: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing archive swipe policy test**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI history archive restore swipe clips the action background to the row', () => {
  const history = read('src/screens/AiHistoryScreen.tsx');

  assert.match(history, /swipeActionClip/);
  assert.match(history, /swipeActionSurface/);
  assert.match(history, /interpolate\(\{[\s\S]*inputRange:\s*\[0,\s*ARCHIVE_ACTION_WIDTH\]/);
  assert.match(history, /Animated\.spring/);
  assert.match(history, /ARCHIVE_SWIPE_THRESHOLD/);
  assert.doesNotMatch(history, /style=\{\(\{ pressed \}\) => \[styles\.archiveAction/);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
node --test tests\ai-chat-fixes-policy.test.cjs
```

Expected: FAIL because the current action is an absolute full-height pressable behind the row.

- [ ] **Step 3: Introduce clipped action width**

In `src/screens/AiHistoryScreen.tsx`, add constants near the existing archive width:

```ts
const ARCHIVE_SWIPE_THRESHOLD = 72;
const ARCHIVE_ACTION_WIDTH = 96;
```

If `ARCHIVE_ACTION_WIDTH` already exists, keep one definition and add `ARCHIVE_SWIPE_THRESHOLD`.

Inside the `items.map` render block, after:

```ts
const swipeTranslateX = getSwipeAnimatedValue(thread.id);
```

add:

```ts
const actionWidth = swipeTranslateX.interpolate({
  inputRange: [0, ARCHIVE_ACTION_WIDTH],
  outputRange: [0, ARCHIVE_ACTION_WIDTH],
  extrapolate: 'clamp',
});
```

Replace the current archive action render with:

```tsx
{!isSelecting ? (
  <Animated.View style={[styles.swipeActionClip, { width: actionWidth }]}>
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void toggleArchive(thread);
      }}
      style={({ pressed }) => [styles.swipeActionSurface, pressed && styles.pressed]}
    >
      <Ionicons color={aiLightColors.onDark} name={thread.archivedAt ? 'arrow-undo-outline' : 'archive-outline'} size={17} />
      <Text style={styles.archiveActionText}>{thread.archivedAt ? '恢复' : '归档'}</Text>
    </Pressable>
  </Animated.View>
) : null}
```

- [ ] **Step 4: Update gesture threshold**

In the swipe release handler, replace hard-coded thresholds with:

```ts
if (gestureState.dx <= -ARCHIVE_SWIPE_THRESHOLD) {
  animateSwipe(thread.id, -ARCHIVE_ACTION_WIDTH);
  setSwipedThreadId(thread.id);
  return;
}
```

Keep the existing spring-back path:

```ts
animateSwipe(thread.id, 0);
setSwipedThreadId(null);
```

- [ ] **Step 5: Update styles**

Replace `archiveAction` style with:

```ts
  swipeActionClip: {
    bottom: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  swipeActionSurface: {
    alignItems: 'center',
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.lg,
    bottom: 0,
    gap: 2,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: ARCHIVE_ACTION_WIDTH,
  },
```

Keep `archiveActionText`.

- [ ] **Step 6: Run tests**

```powershell
node --test tests\ai-chat-fixes-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src\screens\AiHistoryScreen.tsx tests\ai-chat-fixes-policy.test.cjs
git commit -m "fix: polish ai history archive swipe"
```

---

### Task 6: Edit And Regenerate Action Reliability

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/ai/aiChatService.ts`
- Test: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing action reliability policy test**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI edit and regenerate actions expose pending guards and call service paths', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const service = read('src/ai/aiChatService.ts');

  assert.match(chat, /const \[pendingMessageActionId, setPendingMessageActionId\]/);
  assert.match(chat, /setPendingMessageActionId\(userMessageId\)/);
  assert.match(chat, /setPendingMessageActionId\(targetMessageId\)/);
  assert.match(chat, /rewriteUserMessage\(/);
  assert.match(chat, /regenerateAssistantMessage\(/);
  assert.match(chat, /finally \{[\s\S]{0,240}setPendingMessageActionId\(null\)/);
  assert.match(service, /export async function rewriteUserMessage/);
  assert.match(service, /export async function regenerateAssistantMessage/);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
node --test tests\ai-chat-fixes-policy.test.cjs
```

Expected: FAIL because `pendingMessageActionId` is not present.

- [ ] **Step 3: Add pending message action state**

In `src/screens/AiChatScreen.tsx`, add state near other message action state:

```ts
const [pendingMessageActionId, setPendingMessageActionId] = useState<string | null>(null);
```

In `handleSubmitInlineRewrite`, after `const userMessageId = messageId;`, add:

```ts
setPendingMessageActionId(userMessageId);
```

In its `finally`, before leaving the current stream branch, add:

```ts
setPendingMessageActionId(null);
```

In `handleConfirmedRegenerate`, before `setGenerating(true);`, add:

```ts
setPendingMessageActionId(targetMessageId);
```

In its `finally`, add:

```ts
setPendingMessageActionId(null);
```

- [ ] **Step 4: Pass pending state into message bubbles**

If `AiMessageBubble` already accepts a disabled or pending prop, pass `pendingMessageActionId`. If it does not, add a minimal prop to the local message bubble component/type in `AiChatScreen.tsx`:

```ts
pendingActionMessageId?: string | null;
```

Disable edit/regenerate action presses while:

```ts
generating || pendingActionMessageId === message.id
```

Keep visual changes minimal: existing pressed/disabled styling is enough if present; otherwise reduce opacity for disabled action buttons.

- [ ] **Step 5: Preserve editable content on rewrite failure**

In the catch block of `handleSubmitInlineRewrite`, keep:

```ts
editingUserMessageIdRef.current = userMessageId;
setEditingUserMessageId(userMessageId);
setErrorMessage(error instanceof Error ? error.message : '重写失败');
```

If current code clears the edited content before failure recovery, move the text clear until after service success.

- [ ] **Step 6: Run tests**

```powershell
node --test tests\ai-chat-fixes-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src\screens\AiChatScreen.tsx src\ai\aiChatService.ts tests\ai-chat-fixes-policy.test.cjs
git commit -m "fix: stabilize ai edit and regenerate actions"
```

---

### Task 7: Inline Streaming Cursor

**Files:**

- Modify: `src/components/ai/AiMessageBubble.tsx`
- Test: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add failing cursor policy test**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI streaming cursor is rendered inline with assistant text', () => {
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(bubble, /InlineStreamingCursor/);
  assert.match(bubble, /renderAssistantContentWithCursor/);
  assert.match(bubble, /<Text selectable style=\{styles\.assistantContentWithCursor\}/);
  assert.doesNotMatch(bubble, /streamingCursorBlock/);
  assert.doesNotMatch(bubble, /\\n\s*<InlineStreamingCursor/);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
node --test tests\ai-chat-fixes-policy.test.cjs
```

Expected: FAIL because `AiMessageBubble` currently renders `styles.streamingCursor` as a separate `Animated.Text` after `AiMessageContent`.

- [ ] **Step 3: Add inline cursor component**

In `src/components/ai/AiMessageBubble.tsx`, near `AiMessageBubbleComponent`, add:

```tsx
function InlineStreamingCursor() {
  return <Text style={styles.inlineStreamingCursor}>▍</Text>;
}
```

Add style:

```ts
  assistantContentWithCursor: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  inlineStreamingCursor: {
    color: aiLightColors.coralActive,
    fontWeight: '700',
  },
```

- [ ] **Step 4: Render cursor at the end of assistant content**

In `src/components/ai/AiMessageBubble.tsx`, add this helper below `InlineStreamingCursor`:

```tsx
function renderAssistantContentWithCursor(content: string, streaming: boolean) {
  if (!streaming || !content.trim()) {
    return <AiMessageContent content={content} />;
  }
  return (
    <Text selectable style={styles.assistantContentWithCursor}>
      {content}
      <InlineStreamingCursor />
    </Text>
  );
}
```

Then replace the assistant content branch:

```tsx
{waitingForFirstToken ? <AiTypingIndicator /> : <AiMessageContent content={content} />}
```

with:

```tsx
{waitingForFirstToken ? <AiTypingIndicator /> : renderAssistantContentWithCursor(content, streaming)}
```

Delete this separate cursor line:

```tsx
{streaming && !waitingForFirstToken ? <Animated.Text style={[styles.streamingCursor, { opacity: streamingCursorOpacity }]}>▌</Animated.Text> : null}
```

Remove the `streamingCursorOpacity` ref and its `useEffect` animation if they are no longer used.

- [ ] **Step 5: Run tests**

```powershell
node --test tests\ai-chat-fixes-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src\components\ai\AiMessageBubble.tsx tests\ai-chat-fixes-policy.test.cjs
git commit -m "fix: render ai streaming cursor inline"
```

---

### Task 8: Scroll, Keyboard, And Return-To-Generation Stability

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/ai/aiChatService.ts`
- Test: `tests/ai-chat-fixes-policy.test.cjs`
- Test: `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Add stability policy test**

Append to `tests/ai-chat-fixes-policy.test.cjs`:

```js
test('AI chat keeps no-jitter scroll policy during streaming keyboard and return flows', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /userScrolledAwayFromBottomRef/);
  assert.match(chat, /followLatestMessage/);
  assert.match(chat, /scrollToOffset\(\{\s*animated,\s*offset:\s*0\s*\}\)/);
  assert.match(chat, /reloadMessages\(targetThreadId\)/);
  assert.doesNotMatch(chat, /keyboardBottomInset/);
  assert.doesNotMatch(chat, /scrollToEnd/);
  assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*followLatestMessage/);
  assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*scrollToOffset/);
});
```

- [ ] **Step 2: Run and verify current behavior**

```powershell
node --test tests\ai-chat-fixes-policy.test.cjs tests\ai-navigation-policy.test.cjs
```

Expected: PASS if previous protections remain. If it fails, remove the newly introduced auto-scroll or keyboard-lift pattern.

- [ ] **Step 3: Guard streaming auto-follow**

In `applyStreamingMessagePatch` or the equivalent patch handler in `AiChatScreen`, ensure auto-follow is gated:

```ts
if (!userScrolledAwayFromBottomRef.current) {
  followLatestMessage(false);
}
```

Do not call `followLatestMessage` unconditionally from streaming token updates.

- [ ] **Step 4: Ensure return hydration does not reset scroll repeatedly**

When route/thread changes and messages reload, keep reload as a data hydration step:

```ts
await reloadMessages(targetThreadId);
```

Only call `followLatestMessage(false)` once after initial load when the user has not scrolled away:

```ts
if (!userScrolledAwayFromBottomRef.current) {
  followLatestMessage(false);
}
```

- [ ] **Step 5: Run full verification**

```powershell
node --test tests\ai-chat-fixes-policy.test.cjs tests\ai-navigation-policy.test.cjs
pnpm typecheck
pnpm test
git diff --check
```

Expected: all pass. `git diff --check` may print CRLF warnings, but must report no whitespace errors.

- [ ] **Step 6: Commit**

```powershell
git add src\screens\AiChatScreen.tsx src\ai\aiChatService.ts tests\ai-chat-fixes-policy.test.cjs tests\ai-navigation-policy.test.cjs
git commit -m "fix: preserve ai chat scroll stability"
```

---

### Task 9: Final Review And Android Handoff

**Files:**

- Review: `src/screens/AiChatScreen.tsx`
- Review: `src/components/ai/AiChatComposer.tsx`
- Review: `src/components/ai/AiComprehensiveRecordDrawer.tsx`
- Review: `src/screens/AiHistoryScreen.tsx`
- Review: `src/screens/AiHomeScreen.tsx`
- Review: `App.tsx`
- Review: `tests/ai-chat-fixes-policy.test.cjs`
- Review: `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Inspect final diff**

Run:

```powershell
git diff --stat
git diff -- src\screens\AiChatScreen.tsx src\components\ai\AiChatComposer.tsx src\components\ai\AiComprehensiveRecordDrawer.tsx src\screens\AiHistoryScreen.tsx src\screens\AiHomeScreen.tsx App.tsx
```

Expected:

- no release files changed;
- no database schema changes;
- no network/cloud code added;
- no unrelated IP asset management changes;
- no broad design-token bypasses.

- [ ] **Step 2: Run final verification**

Run:

```powershell
pnpm typecheck
pnpm test
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Manual Android validation checklist**

Use a real Android device or emulator:

```powershell
D:\Develop\Android\Sdk\platform-tools\adb.exe devices
```

Validate:

- swipe archive and restore in normal and archived history filters;
- no extra background block appears during swipe;
- edit an earlier user message and send;
- regenerate an assistant message;
- cursor appears immediately after generated text;
- scroll upward during streaming and confirm it does not pull back;
- tap `回到最新` and confirm one smooth movement;
- open keyboard during streaming and confirm no list jump;
- leave a generating chat and return; partial content remains;
- open drawer from chat; start new chat; open history; open recent;
- workbench does not show `最近继续`;
- attachment popover opens above add button, horizontal icon-only, and works with keyboard.

If Android validation is not performed, state that explicitly in the final report.

- [ ] **Step 4: Commit any final test-only corrections**

If final review required only test-policy corrections:

```powershell
git add tests\ai-chat-fixes-policy.test.cjs tests\ai-navigation-policy.test.cjs
git commit -m "test: cover ai chat navigation polish"
```

Do not create an empty commit if no files changed.

---

## Completion Criteria

- All tasks are completed in order.
- `pnpm typecheck`, `pnpm test`, and `git diff --check` pass.
- Drawer behavior, attachment popover, history swipe, edit/regenerate, inline cursor, and no-jitter policy are all covered by tests.
- Manual Android validation is either completed and reported, or explicitly listed as not performed.
- No packaging/release workflow is started unless the user separately requests it.
