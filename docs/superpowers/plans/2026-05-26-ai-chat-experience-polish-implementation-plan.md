# AI Chat Experience Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved AI chat polish spec: Claude-like first-message greeting, native thinking animation, markdown image preview, Android keyboard stability, thousand-plus-message query chunking, and long-chat FlatList memory controls.

**Architecture:** Keep changes surgical. Repository stability is handled in `aiThreadRepository`; chat screen UX and virtualization stay in `AiChatScreen`; markdown rendering stays in `AiMessageContent`; small timer and animation fixes stay in their current components.

**Tech Stack:** Expo, React Native, TypeScript, Node test runner policy tests, SQLite, existing Pixory design tokens and AI light theme.

---

## Files and Responsibilities

- `tests/ai-chat-fixes-policy.test.cjs`
  - Update old policy anchors that currently require `useNativeDriver: false` and Android `KeyboardAvoidingView behavior="height"`.
  - Add structural coverage for the new greeting, image markdown, timers, scroll guard, FlatList virtualization, and SQL chunking requirements.
- `src/database/repositories/aiThreadRepository.ts`
  - Chunk large message id lookups in `listMessageVersionsForMessages` and `listCitationsForMessages`.
- `src/components/ai/AiThinkingBlock.tsx`
  - Move opacity animation to native driver and reduce elapsed timer frequency.
- `src/components/ai/AiMessageContent.tsx`
  - Memoize markdown blocks, parse/render image markdown, and clean code-copy feedback timer.
- `src/components/ai/AiMessageBubble.tsx`
  - Clean message-copy feedback timer on repeated copy and unmount.
- `src/components/ai/AiScrollToLatestButton.tsx`
  - Accept a dynamic `bottomOffset` prop instead of fixed composer-distance math.
- `src/screens/AiChatScreen.tsx`
  - Add starter greeting/suggestions, Android keyboard wrapper cleanup, FlatList virtualization props, latest visibility guard, latest assistant lookup helper, composer panel height tracking, and voice timeout cleanup.

---

### Task 1: Add Red Policy Coverage for Chat Polish

**Files:**
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Update the thinking animation test**

Replace the existing expectation in `test('AI thinking block expands and collapses with a lightweight animation', ...)`:

```js
assert.match(thinking, /useNativeDriver: false/);
```

with:

```js
assert.match(thinking, /useNativeDriver: true/);
assert.doesNotMatch(thinking, /useNativeDriver: false/);
assert.match(thinking, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 500\)/);
assert.doesNotMatch(thinking, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 100\)/);
```

- [ ] **Step 2: Update the Android keyboard policy test**

In `test('AI chat relies on Android adjustResize instead of JS keyboard margin lifting', ...)`, replace:

```js
assert.match(chat, /<KeyboardAvoidingView behavior="height" enabled=\{Platform\.OS === 'android'\} style=\{\[styles\.keyboardResizeHost, styles\.screenContent/);
assert.match(chat, /keyboardResizeHost:\s*\{\s*flex:\s*1/);
```

with:

```js
assert.doesNotMatch(chat, /KeyboardAvoidingView behavior="height"/);
assert.doesNotMatch(chat, /enabled=\{Platform\.OS === 'android'\}/);
assert.doesNotMatch(chat, /keyboardResizeHost/);
assert.match(chat, /<View style=\{\[styles\.screenContent,\s*\{ paddingTop: statusBarHeight \+ layout\.pageTopOffset \}\]\}>/);
```

- [ ] **Step 3: Add a new policy test for starter greeting**

Append this test near the other AI chat UX tests:

```js
test('AI chat empty start uses a Claude-like greeting and faint starter suggestions', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /function getAiChatGreeting/);
  assert.match(chat, /今天想聊点什么？/);
  assert.match(chat, /现在想聊点什么？/);
  assert.match(chat, /今晚想聊点什么？/);
  assert.match(chat, /ListEmptyComponent=\{invertedMessageItems\.length === 0 \? /);
  assert.match(chat, /AiChatStarterHints/);
  assert.match(chat, /fontSize:\s*28/);
  assert.match(chat, /lineHeight:\s*36/);
  assert.match(chat, /fontWeight:\s*'400'/);
  assert.match(chat, /letterSpacing:\s*0/);
  assert.match(chat, /整理这段资料/);
  assert.match(chat, /帮我发散想法/);
  assert.match(chat, /总结当前设定/);
  assert.match(chat, /onPickSuggestion=\{setComposerText\}/);
  assert.doesNotMatch(chat, /onPickSuggestion=\{handleSend\}/);
  assert.doesNotMatch(chat, /emptyStateCard/);
});
```

- [ ] **Step 4: Add a new policy test for markdown image rendering and memoization**

Append:

```js
test('AI message content memoizes markdown and renders image markdown inline', () => {
  const content = read('src/components/ai/AiMessageContent.tsx');

  assert.match(content, /import \{ useEffect, useMemo, useRef, useState, type ReactNode \} from 'react'/);
  assert.match(content, /Image/);
  assert.match(content, /type: 'image'/);
  assert.match(content, /isImageMarkdownLine/);
  assert.match(content, /AiMarkdownImage/);
  assert.match(content, /const blocks = useMemo\(\(\) => parseMarkdownBlocks\(content\), \[content\]\)/);
  assert.match(content, /onError=\{\(\) => setLoadFailed\(true\)\}/);
  assert.match(content, /图片无法预览/);
  assert.doesNotMatch(content, /!\[alt\]\(url\)/);
});
```

- [ ] **Step 5: Add new policy tests for long-chat stability**

Append:

```js
test('AI chat long histories chunk attached data lookups', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const versionsBody = /async listMessageVersionsForMessages[\s\S]*?\n  \},\n\n  async replaceCitations/.exec(repository)?.[0] ?? '';
  const citationsBody = /async listCitationsForMessages[\s\S]*?\n  \},\n\n  async getThreadMemorySettings/.exec(repository)?.[0] ?? '';

  assert.match(repository, /MESSAGE_LOOKUP_CHUNK_SIZE = 200|DELETE_MESSAGE_CHUNK_SIZE = 200/);
  assert.match(versionsBody, /for \(let index = 0; index < messageIds\.length; index \+= MESSAGE_LOOKUP_CHUNK_SIZE\)/);
  assert.match(versionsBody, /const chunk = messageIds\.slice\(index, index \+ MESSAGE_LOOKUP_CHUNK_SIZE\)/);
  assert.match(versionsBody, /makeInClause\(chunk\)/);
  assert.doesNotMatch(versionsBody, /makeInClause\(messageIds\)/);
  assert.match(citationsBody, /for \(let index = 0; index < messageIds\.length; index \+= MESSAGE_LOOKUP_CHUNK_SIZE\)/);
  assert.match(citationsBody, /const chunk = messageIds\.slice\(index, index \+ MESSAGE_LOOKUP_CHUNK_SIZE\)/);
  assert.match(citationsBody, /makeInClause\(chunk\)/);
  assert.doesNotMatch(citationsBody, /makeInClause\(messageIds\)/);
});

test('AI chat long histories keep FlatList resident rows bounded', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /initialNumToRender=\{10\}/);
  assert.match(chat, /maxToRenderPerBatch=\{8\}/);
  assert.match(chat, /windowSize=\{11\}/);
  assert.match(chat, /removeClippedSubviews=\{Platform\.OS === 'android'\}/);
});
```

- [ ] **Step 6: Add a new policy test for scroll guards, dynamic latest button, and timer cleanup**

Append:

```js
test('AI chat polish avoids redundant scroll state updates and clears transient timers', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const content = read('src/components/ai/AiMessageContent.tsx');
  const latestButton = read('src/components/ai/AiScrollToLatestButton.tsx');

  assert.match(chat, /latestVisibleRef/);
  assert.match(chat, /const nextLatestVisible = contentOffset\.y <= MESSAGE_BOTTOM_LOCK_THRESHOLD/);
  assert.match(chat, /if \(latestVisibleRef\.current !== nextLatestVisible\)/);
  assert.match(chat, /latestVisibleRef\.current = nextLatestVisible/);
  assert.match(chat, /findLatestAssistantMessage/);
  assert.doesNotMatch(chat, /\[\.\.\.messages\]\.reverse\(\)\.find/);
  assert.doesNotMatch(chat, /\[\.\.\.visibleMessages\]\.reverse\(\)\.find/);
  assert.match(chat, /composerPanelHeight/);
  assert.match(chat, /onLayout=\{\(event\) => setComposerPanelHeight\(event\.nativeEvent\.layout\.height\)\}/);
  assert.match(chat, /bottomOffset=\{composerPanelHeight \+ spacing\[4\]\}/);
  assert.match(latestButton, /bottomOffset: number/);
  assert.match(latestButton, /bottom:\s*bottomOffset/);
  assert.doesNotMatch(latestButton, /bottom:\s*spacing\[12\] \+ spacing\[10\]/);

  assert.match(content, /feedbackTimeoutRef/);
  assert.match(content, /clearFeedbackTimer/);
  assert.match(content, /return clearFeedbackTimer/);
  assert.match(bubble, /copyFeedbackTimeoutRef/);
  assert.match(bubble, /clearCopyFeedbackTimer/);
  assert.match(bubble, /return clearCopyFeedbackTimer/);
  assert.match(chat, /voiceResetTimeoutRef/);
  assert.match(chat, /clearVoiceResetTimeout/);
});
```

- [ ] **Step 7: Run the red tests**

Run:

```powershell
node --test tests/ai-chat-fixes-policy.test.cjs --test-name-pattern "AI thinking block|Android adjustResize|empty start|markdown image|chunk attached data|FlatList resident|scroll state"
```

Expected: FAIL because production code still has JS-driver thinking animation, no starter greeting, no image markdown, no chunking, no FlatList props, no timer cleanup, and fixed latest-button bottom.

- [ ] **Step 8: Commit the red tests**

```powershell
git add tests/ai-chat-fixes-policy.test.cjs
git commit -m "test: cover ai chat experience polish"
```

---

### Task 2: Chunk Message Version and Citation Lookups

**Files:**
- Modify: `src/database/repositories/aiThreadRepository.ts`
- Test: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add a lookup chunk constant**

Near `DELETE_MESSAGE_CHUNK_SIZE = 200`, add:

```ts
const MESSAGE_LOOKUP_CHUNK_SIZE = 200;
```

- [ ] **Step 2: Chunk `listMessageVersionsForMessages`**

Replace the body of `listMessageVersionsForMessages` with:

```ts
  async listMessageVersionsForMessages(db: SQLiteDatabase, messageIds: string[]): Promise<Record<string, AiMessageVersionRecord[]>> {
    if (messageIds.length === 0) {
      return {};
    }
    const rows: AiMessageVersionRow[] = [];
    for (let index = 0; index < messageIds.length; index += MESSAGE_LOOKUP_CHUNK_SIZE) {
      const chunk = messageIds.slice(index, index + MESSAGE_LOOKUP_CHUNK_SIZE);
      rows.push(
        ...(await db.getAllAsync<AiMessageVersionRow>(
          `SELECT * FROM ai_message_versions
           WHERE originalMessageId IN (${makeInClause(chunk)})
           ORDER BY originalMessageId ASC, versionIndex ASC`,
          ...chunk
        ))
      );
    }
    return rows.reduce<Record<string, AiMessageVersionRecord[]>>((grouped, row) => {
      const mapped = mapMessageVersionRow(row);
      grouped[mapped.originalMessageId] = grouped[mapped.originalMessageId] ?? [];
      grouped[mapped.originalMessageId].push(mapped);
      return grouped;
    }, {});
  },
```

- [ ] **Step 3: Chunk `listCitationsForMessages`**

Replace the body of `listCitationsForMessages` with:

```ts
  async listCitationsForMessages(db: SQLiteDatabase, messageIds: string[]): Promise<Record<string, AiCitationRecord[]>> {
    if (messageIds.length === 0) {
      return {};
    }
    const rows: AiCitationRow[] = [];
    for (let index = 0; index < messageIds.length; index += MESSAGE_LOOKUP_CHUNK_SIZE) {
      const chunk = messageIds.slice(index, index + MESSAGE_LOOKUP_CHUNK_SIZE);
      rows.push(
        ...(await db.getAllAsync<AiCitationRow>(
          `SELECT * FROM ai_message_citations
           WHERE messageId IN (${makeInClause(chunk)})
           ORDER BY messageId ASC, createdAt ASC`,
          ...chunk
        ))
      );
    }
    return rows.reduce<Record<string, AiCitationRecord[]>>((grouped, row) => {
      const mapped = mapCitationRow(row);
      grouped[mapped.messageId] = grouped[mapped.messageId] ?? [];
      grouped[mapped.messageId].push(mapped);
      return grouped;
    }, {});
  },
```

- [ ] **Step 4: Run targeted test**

Run:

```powershell
node --test tests/ai-chat-fixes-policy.test.cjs --test-name-pattern "chunk attached data"
```

Expected: PASS.

- [ ] **Step 5: Commit repository fix**

```powershell
git add src/database/repositories/aiThreadRepository.ts
git commit -m "fix: chunk ai chat attached data lookups"
```

---

### Task 3: Smooth Thinking Block Animation

**Files:**
- Modify: `src/components/ai/AiThinkingBlock.tsx`
- Test: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Change thinking timer interval**

Replace:

```ts
const timer = setInterval(() => setNow(Date.now()), 100);
```

with:

```ts
const timer = setInterval(() => setNow(Date.now()), 500);
```

- [ ] **Step 2: Move opacity animation to native driver**

Replace:

```ts
useNativeDriver: false,
```

with:

```ts
useNativeDriver: true,
```

- [ ] **Step 3: Run targeted test**

Run:

```powershell
node --test tests/ai-chat-fixes-policy.test.cjs --test-name-pattern "AI thinking block"
```

Expected: PASS for thinking animation tests.

- [ ] **Step 4: Commit thinking fix**

```powershell
git add src/components/ai/AiThinkingBlock.tsx
git commit -m "fix: smooth ai thinking animation"
```

---

### Task 4: Memoize Markdown and Render Image Markdown Inline

**Files:**
- Modify: `src/components/ai/AiMessageContent.tsx`
- Test: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Update imports**

Replace the imports at the top with:

```ts
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
```

- [ ] **Step 2: Extend `MarkdownBlock`**

Add an image block member:

```ts
  | { type: 'image'; alt: string; uri: string }
```

- [ ] **Step 3: Add image markdown helpers**

Add below `isHorizontalRule`:

```ts
function isImageMarkdownLine(line: string): boolean {
  return /^!\[[^\]]*\]\((https?:\/\/[^)\s]+|file:\/\/[^)\s]+|content:\/\/[^)\s]+)\)\s*$/.test(line.trim());
}

function parseImageMarkdown(line: string): { alt: string; uri: string } | null {
  const match = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+|file:\/\/[^)\s]+|content:\/\/[^)\s]+)\)\s*$/.exec(line.trim());
  return match ? { alt: match[1].trim(), uri: match[2] } : null;
}
```

- [ ] **Step 4: Add image block parsing**

In `parseMarkdownBlocks`, after horizontal rule handling and before list handling, add:

```ts
    if (isImageMarkdownLine(line)) {
      const image = parseImageMarkdown(line);
      if (image) {
        blocks.push({ type: 'image', alt: image.alt, uri: image.uri });
        index += 1;
        continue;
      }
    }
```

In the paragraph loop break condition, add `isImageMarkdownLine(nextLine)` to the list of block boundaries:

```ts
if (!nextLine.trim() || isFence(nextLine) || isHeading(nextLine) || isHorizontalRule(nextLine) || isImageMarkdownLine(nextLine) || isListLine(nextLine) || isQuoteLine(nextLine) || (isTableLine(nextLine) && isTableSeparator(lines[index + 1] ?? ''))) {
```

- [ ] **Step 5: Add `AiMarkdownImage` component**

Add above `export function AiMessageContent`:

```tsx
function AiMarkdownImage({ alt, uri }: { alt: string; uri: string }) {
  const [loadFailed, setLoadFailed] = useState(false);
  if (loadFailed) {
    return (
      <View style={styles.imageFallback}>
        <Ionicons color={aiLightColors.muted} name="image-outline" size={16} />
        <Text style={styles.imageFallbackText}>{alt || '图片无法预览'}</Text>
      </View>
    );
  }
  return (
    <View style={styles.imageBlock}>
      <Image onError={() => setLoadFailed(true)} resizeMode="cover" source={{ uri }} style={styles.markdownImage} />
      {alt ? <Text numberOfLines={2} style={styles.imageCaption}>{alt}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 6: Memoize markdown blocks and add feedback timer cleanup**

Inside `AiMessageContent`, after state declarations, add:

```ts
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  function clearFeedbackTimer() {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
  }

  useEffect(() => clearFeedbackTimer, []);
```

Remove this existing declaration:

```ts
const blocks = parseMarkdownBlocks(content);
```

In `copyCodeBlock`, replace:

```ts
setTimeout(() => setFeedback(null), 1600);
```

with:

```ts
clearFeedbackTimer();
feedbackTimeoutRef.current = setTimeout(() => {
  setFeedback(null);
  feedbackTimeoutRef.current = null;
}, 1600);
```

- [ ] **Step 7: Render image blocks**

In the `blocks.map` render switch, after the `hr` block handling and before code blocks, add:

```tsx
        if (block.type === 'image') {
          return <AiMarkdownImage alt={block.alt} key={key} uri={block.uri} />;
        }
```

- [ ] **Step 8: Add styles**

Add these styles:

```ts
  imageBlock: {
    gap: rhythm.microGap,
    maxWidth: '100%',
  },
  markdownImage: {
    aspectRatio: 16 / 10,
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.md,
    maxWidth: '100%',
    width: 260,
  },
  imageCaption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  imageFallback: {
    alignItems: 'center',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  imageFallbackText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    flex: 1,
  },
```

- [ ] **Step 9: Run targeted test**

Run:

```powershell
node --test tests/ai-chat-fixes-policy.test.cjs --test-name-pattern "markdown image|message text supports"
```

Expected: PASS for markdown image/memoization and existing markdown text selection coverage.

- [ ] **Step 10: Commit markdown fix**

```powershell
git add src/components/ai/AiMessageContent.tsx
git commit -m "feat: render ai markdown images inline"
```

---

### Task 5: Clean Message Bubble Copy Feedback Timer

**Files:**
- Modify: `src/components/ai/AiMessageBubble.tsx`
- Test: `tests/ai-chat-fixes-policy.test.cjs`

- [ ] **Step 1: Add timeout ref and cleanup helper**

Inside `AiMessageBubbleComponent`, after `copyFeedbackVisible` state:

```ts
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearCopyFeedbackTimer() {
    if (copyFeedbackTimeoutRef.current) {
      clearTimeout(copyFeedbackTimeoutRef.current);
      copyFeedbackTimeoutRef.current = null;
    }
  }
```

Update the React import to include `useRef`:

```ts
import { memo, useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: Add unmount cleanup effect**

After the existing edit-draft effect:

```ts
  useEffect(() => clearCopyFeedbackTimer, []);
```

- [ ] **Step 3: Replace inline timeout**

Replace:

```ts
setTimeout(() => setCopyFeedbackVisible(false), 1400);
```

with:

```ts
clearCopyFeedbackTimer();
copyFeedbackTimeoutRef.current = setTimeout(() => {
  setCopyFeedbackVisible(false);
  copyFeedbackTimeoutRef.current = null;
}, 1400);
```

- [ ] **Step 4: Run targeted test**

Run:

```powershell
node --test tests/ai-chat-fixes-policy.test.cjs --test-name-pattern "scroll state"
```

Expected: timer cleanup assertions for `AiMessageBubble` pass. Chat-screen assertions still fail until Task 6.

- [ ] **Step 5: Commit bubble timer fix**

```powershell
git add src/components/ai/AiMessageBubble.tsx
git commit -m "fix: clean ai message feedback timer"
```

---

### Task 6: Polish AiChatScreen Empty Start, Keyboard, Long-List, and Scroll State

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `src/components/ai/AiScrollToLatestButton.tsx`
- Test: `tests/ai-chat-fixes-policy.test.cjs`, `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Remove `KeyboardAvoidingView` import**

In `AiChatScreen.tsx`, remove `KeyboardAvoidingView` from the React Native import list.

- [ ] **Step 2: Add greeting helpers near existing helper functions**

Add after `formatDateSeparator`:

```ts
function getAiChatGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) {
    return '今天想聊点什么？';
  }
  if (hour < 18) {
    return '现在想聊点什么？';
  }
  return '今晚想聊点什么？';
}

const STARTER_SUGGESTIONS = ['整理这段资料', '帮我发散想法', '总结当前设定'] as const;
```

- [ ] **Step 3: Add starter hints component**

Add below the `VisibleMessageItem` type:

```tsx
function AiChatStarterHints({ onPickSuggestion }: { onPickSuggestion: (value: string) => void }) {
  return (
    <View style={styles.starterWrap}>
      <Text style={styles.starterGreeting}>{getAiChatGreeting()}</Text>
      <View style={styles.starterSuggestions}>
        {STARTER_SUGGESTIONS.map((suggestion) => (
          <Pressable
            accessibilityRole="button"
            key={suggestion}
            onPress={() => onPickSuggestion(suggestion)}
            style={({ pressed }) => [styles.starterChip, pressed && styles.pressed]}
          >
            <Text style={styles.starterChipText}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Add refs/state for latest visibility, voice timeout, and composer height**

Near existing refs/state:

```ts
  const latestVisibleRef = useRef(true);
  const voiceResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [composerPanelHeight, setComposerPanelHeight] = useState(0);
```

- [ ] **Step 5: Add cleanup helper**

Near `clearInlineEditVisibilityTimeouts`:

```ts
  function clearVoiceResetTimeout() {
    if (voiceResetTimeoutRef.current) {
      clearTimeout(voiceResetTimeoutRef.current);
      voiceResetTimeoutRef.current = null;
    }
  }
```

In the unmount cleanup effect, add:

```ts
      clearVoiceResetTimeout();
```

- [ ] **Step 6: Guard `latestVisible` updates**

Replace `handleMessageScroll` with:

```ts
  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    const nextLatestVisible = contentOffset.y <= MESSAGE_BOTTOM_LOCK_THRESHOLD;
    userScrolledAwayFromBottomRef.current = !nextLatestVisible;
    if (latestVisibleRef.current !== nextLatestVisible) {
      latestVisibleRef.current = nextLatestVisible;
      setLatestVisible(nextLatestVisible);
    }
  }, []);
```

In `followLatestMessage`, before `setLatestVisible(true)`, add:

```ts
    latestVisibleRef.current = true;
```

In route reset and reload branches that currently `setLatestVisible(true)`, also set `latestVisibleRef.current = true;`.

- [ ] **Step 7: Replace latest assistant reverse scans**

Add helper before the component:

```ts
function findLatestAssistantMessage(messages: AiMessageWithCitations[]): AiMessageWithCitations | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index];
    }
  }
  return undefined;
}
```

Replace:

```ts
const latestAssistantMessage = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant'), [messages]);
```

with:

```ts
const latestAssistantMessage = useMemo(() => findLatestAssistantMessage(messages), [messages]);
```

Replace context trim lookup:

```ts
const latestAssistant = [...visibleMessages].reverse().find((message) => message.role === 'assistant');
```

with:

```ts
const latestAssistant = findLatestAssistantMessage(visibleMessages);
```

- [ ] **Step 8: Replace Android `KeyboardAvoidingView` wrapper with `View`**

Replace:

```tsx
      <KeyboardAvoidingView behavior="height" enabled={Platform.OS === 'android'} style={[styles.keyboardResizeHost, styles.screenContent, { paddingTop: statusBarHeight + layout.pageTopOffset }]}>
```

with:

```tsx
      <View style={[styles.screenContent, { paddingTop: statusBarHeight + layout.pageTopOffset }]}>
```

Replace the closing `</KeyboardAvoidingView>` with `</View>`.

Remove the `keyboardResizeHost` style block.

- [ ] **Step 9: Add FlatList props and empty greeting**

On the chat `FlatList`, add:

```tsx
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={11}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={invertedMessageItems.length === 0 ? (
          <AiChatStarterHints onPickSuggestion={setComposerText} />
        ) : null}
```

Keep the existing `ListFooterComponent`.

- [ ] **Step 10: Track composer panel height**

Change the composer panel `Animated.View` opening tag to:

```tsx
        <Animated.View onLayout={(event) => setComposerPanelHeight(event.nativeEvent.layout.height)} style={[styles.composerPanel, composerEntranceStyle]}>
```

Change:

```tsx
<AiScrollToLatestButton visible={!latestVisible && !inlineEditingActive} onPress={() => followLatestMessage()} />
```

to:

```tsx
<AiScrollToLatestButton bottomOffset={composerPanelHeight + spacing[4]} visible={!latestVisible && !inlineEditingActive} onPress={() => followLatestMessage()} />
```

- [ ] **Step 11: Clean voice reset timeout**

Replace:

```ts
setTimeout(() => setVoiceState('idle'), 1200);
```

with:

```ts
clearVoiceResetTimeout();
voiceResetTimeoutRef.current = setTimeout(() => {
  setVoiceState('idle');
  voiceResetTimeoutRef.current = null;
}, 1200);
```

- [ ] **Step 12: Add starter hint styles**

Add styles:

```ts
  starterWrap: {
    alignItems: 'center',
    flex: 1,
    gap: rhythm.inlineGap,
    justifyContent: 'flex-end',
    paddingBottom: spacing[8],
    paddingHorizontal: spacing[2],
  },
  starterGreeting: {
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontSize: 28,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 36,
    opacity: 0.78,
    textAlign: 'center',
  },
  starterSuggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.microGap,
    justifyContent: 'center',
  },
  starterChip: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  starterChipText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
```

- [ ] **Step 13: Update `AiScrollToLatestButton` props and style**

In `src/components/ai/AiScrollToLatestButton.tsx`, change the interface:

```ts
interface AiScrollToLatestButtonProps {
  bottomOffset: number;
  visible: boolean;
  onPress: () => void;
}
```

Change function signature:

```ts
export function AiScrollToLatestButton({ bottomOffset, visible, onPress }: AiScrollToLatestButtonProps) {
```

Change style usage:

```tsx
<Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, { bottom: bottomOffset }, pressed && styles.pressed]}>
```

Remove this from `styles.button`:

```ts
bottom: spacing[12] + spacing[10],
```

- [ ] **Step 14: Run targeted tests**

Run:

```powershell
node --test tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs --test-name-pattern "Android adjustResize|empty start|FlatList resident|scroll state|inverted native list|streaming does not force bottom|no-jitter"
```

Expected: PASS for the matching tests in both policy files.

- [ ] **Step 15: Commit chat screen polish**

```powershell
git add src/screens/AiChatScreen.tsx src/components/ai/AiScrollToLatestButton.tsx
git commit -m "feat: polish ai chat long conversation experience"
```

---

### Task 7: Full Verification and Policy Cleanup

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run focused policy suite**

Run:

```powershell
node --test tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs
```

Expected: command exits 0 with no TypeScript errors.

- [ ] **Step 2: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: `tsc --noEmit` exits `0`.

- [ ] **Step 3: Run full test suite**

Run:

```powershell
pnpm test
```

Expected: all tests pass. If failures appear outside the touched AI chat policy tests, classify them as pre-existing or unrelated only after reading their assertions.

- [ ] **Step 4: Run diff check**

Run:

```powershell
git diff --check
```

Expected: exit `0`. Git may print LF/CRLF warnings; whitespace errors must be fixed.

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
git diff --stat
git status --short --branch
```

Expected: only the intended code/test files are modified, and no untracked generated artifacts are present.

- [ ] **Step 6: Final commit if previous tasks were not committed**

If any verified changes remain unstaged:

```powershell
git add tests/ai-chat-fixes-policy.test.cjs src/database/repositories/aiThreadRepository.ts src/components/ai/AiThinkingBlock.tsx src/components/ai/AiMessageContent.tsx src/components/ai/AiMessageBubble.tsx src/components/ai/AiScrollToLatestButton.tsx src/screens/AiChatScreen.tsx
git commit -m "fix: polish ai chat experience"
```

Expected: a clean working tree after commit.

---

## Plan Self-Review

- Spec coverage: all approved spec sections are covered by tasks: greeting and suggestions in Task 6; native thinking and timer cadence in Task 3; markdown image and memoization in Task 4; Android keyboard in Task 6; repository chunking in Task 2; FlatList virtualization in Task 6; scroll guard/latest lookup/dynamic button in Task 6; timer cleanup in Tasks 4, 5, and 6.
- Placeholder scan: no task leaves behavior unspecified; each code change has concrete snippets and commands.
- Type consistency: `bottomOffset`, `latestVisibleRef`, `voiceResetTimeoutRef`, `MESSAGE_LOOKUP_CHUNK_SIZE`, `AiMarkdownImage`, and `AiChatStarterHints` names are used consistently across tasks and tests.
