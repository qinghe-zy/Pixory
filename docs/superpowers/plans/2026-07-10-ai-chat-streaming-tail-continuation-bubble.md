# AI Chat Streaming Tail Continuation Bubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 detached streaming tail replay 期间“一条 assistant 回复短暂碎成多条气泡”的视觉问题，同时保留 measured tail occupancy 的占位、测量、promotion、hot-zone render readiness 能力。

**Architecture:** 继续使用 real FlatList tail spacer、block-level tail model、monotonic reserved height、onLayout measurement、block promotion。调整的是视觉分层：block 仍作为测量/缓存/promotion 单元，但不再作为消息气泡单元；同一条 message 的 promoted blocks 组合进一个 lightweight continuation bubble。

**Tech Stack:** Expo, React Native, TypeScript, inverted `FlatList`, existing Pixory AI chat streaming tail model, Node policy tests via `node --test tests/*.test.cjs`.

---

## 0. 结论和成熟方案判断

当前 Pixory 的底层方向是对的：

```txt
external streaming store
> detached read buffer
> real FlatList tail spacer
> block-level tail model
> measured reserved height
> hot-zone pre-promotion
```

问题不在 measured occupancy，而在视觉边界：

```txt
当前：
AiStreamBlock = 测量单元 = FlatList row = 一个视觉气泡

成熟方案：
AiStreamBlock = 测量单元
StreamingTailContinuationGroup = FlatList row / 视觉延续单元
assistant message bubble shell = 只画一次
```

参考项目证据：

- `react-native-streaming-message-list`：`AnchorItem` / `StreamingItem` 只负责测量；placeholder 是真实列表空间，但不会把内部测量片段伪装成多条消息。
- `use-stick-to-bottom`：把 bottom lock、near bottom、escaped-from-lock 当成状态机，而不是让内容增长直接支配用户滚动。
- `Vercel ai-chatbot`：一条 `PreviewMessage` 内部可以包含 text/reasoning/tool parts，但视觉仍是一条消息。
- `LibreChat`：`splitMarkdownIntoBlocks` 用于 block-level memo/cache，外层 `ContentRender` 仍保持 message container。
- `Open WebUI`：结构更新和内容更新分层；streaming markdown parse throttle 到 rAF；`ResponseMessage` 仍是一条回复 shell。

因此，本计划不回退到 overlay、ratio reveal、整段最终高度估算，也不取消 block-level measured tail。只修正“block promotion 的视觉包装粒度”。

## 1. 当前问题路径

当前 Pixory 代码路径：

- `src/ai/aiStreamingBlockSplitter.ts`
  - 把 long paragraph 拆成 soft segments。
  - 当前阈值约为 `SOFT_SEGMENT_MAX_CHARS = 560`。
- `src/ai/aiStreamingTailModel.ts`
  - `promoteStreamingTailBlocks(...)` 维护 `promotedBlockIds`。
  - `calculateRemainingStreamingTailHeight(...)` 计算未 promotion 的 spacer remainder。
- `src/screens/AiChatScreen.tsx`
  - `VisibleMessageItem` 包含 `streamTailBlock`。
  - 每个 promoted block 被插入为一个 FlatList item。
  - render 时每个 item 外包 `AiStreamingTailBlockBubble`。
- `src/components/ai/AiStreamingTailBlockBubble.tsx`
  - 每个 block 都画完整 assistant bubble 外壳。

用户截图中的“负荷状态。”独立小气泡就是这个路径导致的：

```txt
long paragraph
> soft segment
> promoted block
> independent FlatList row
> independent assistant bubble shell
```

## 2. 必须保持的不变量

实现时不得破坏这些已有成果：

- 不使用 overlay / absolute fake tail。
- 不恢复 scroll ratio / character ratio reveal。
- 不估算 whole assistant final height。
- detached 时 hidden provider deltas 不得直接 `setMessages` 替换可见历史。
- completed detached 时不得把完整 DB final content 突然刷进可见 viewport。
- spacer 必须是真实 FlatList item。
- spacer height 必须只代表 still-unrendered remainder。
- block measurement 仍由 `onLayout` 上报。
- reserved height detached 期间保持 monotonic；shrink 只在安全窗口结算。
- reasoning collapsed 时不占位、不 promotion、不进入 continuation group。
- hot-zone render window / pre-promotion 继续保留。
- Android long history virtualization 不全局关闭。

## 3. 文件边界

### Create

- `src/ai/aiStreamingTailContinuation.ts`
  - 纯函数：把 promoted `AiStreamBlock[]` 分组成视觉 continuation groups。
  - 不引用 React Native。
  - 不处理滚动、不处理高度结算。

- `src/components/ai/AiStreamingTailContinuationBubble.tsx`
  - 一个 assistant-side lightweight continuation bubble shell。
  - 内部渲染多个 `AiMeasuredStreamBlock`。
  - 不显示 action row、avatar、favorite、version controls、citations。

### Modify

- `src/screens/AiChatScreen.tsx`
  - `VisibleMessageItem` 从 `streamTailBlock` 改为 `streamTailContinuation`。
  - promoted blocks 先 group，再插入 FlatList。
  - render item 使用 `AiStreamingTailContinuationBubble`。
  - 移除 `AiStreamingTailBlockBubble` import / render path。

- `tests/ai-chat-streaming-tail-policy.test.cjs`
  - 更新旧的 per-block bubble policy。
  - 新增 continuation grouping policy。
  - 新增 “不把每个 block 包成一个 bubble” 的防回归断言。

- `tests/ai-chat-fixes-policy.test.cjs`
  - 如果有 `streamTailBlock` / `AiStreamingTailBlockBubble` 源码断言，更新为 continuation 语义。

### Delete or deprecate

- `src/components/ai/AiStreamingTailBlockBubble.tsx`
  - 推荐删除。
  - 如果担心改动范围，第一轮可以保留文件但不再 import；测试应断言 `AiChatScreen.tsx` 不再使用它。

## 4. Data Model

新增纯类型：

```ts
import type { AiStreamBlock } from "./aiStreamingBlockSplitter";

export type AiStreamingTailContinuationGroup = {
  blocks: AiStreamBlock[];
  endOrdinal: number;
  generationId: string;
  groupId: string;
  lane: "reasoning" | "content";
  messageId: string;
  startOrdinal: number;
};
```

分组规则：

- 只包含 `promotedBlockIds` 里的 block。
- 只包含 active lanes。
- 按 `blocks` 原始顺序处理。
- 连续且同 `lane/messageId/generationId` 的 blocks 合并为一组。
- reasoning 和 content 不混在一个 group 里。
- group id 由 message/generation/lane/start/end ordinal 构造，稳定且可追踪。

第一版不做 viewport-height 分组切片。原因：当前 bug 是视觉碎片化，先解决消息级 shell 稳定；如果后续发现单 group 过高影响 VirtualizedList，可再按 reserved height budget 拆成 “同一视觉气泡的 top/middle/bottom segments”。

## 5. Task 1: Add continuation grouping helper

**Files:**

- Create: `src/ai/aiStreamingTailContinuation.ts`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Write failing policy test**

Add this test to `tests/ai-chat-streaming-tail-policy.test.cjs`:

```js
test('streaming tail continuation groups promoted blocks without changing measurement granularity', () => {
  const helper = read('src/ai/aiStreamingTailContinuation.ts');

  assert.match(helper, /export type AiStreamingTailContinuationGroup/);
  assert.match(helper, /export function groupPromotedStreamingTailBlocks/);
  assert.match(helper, /promotedBlockIds: Set<string>/);
  assert.match(helper, /activeLanes\?: \("reasoning" \| "content"\)\[\]/);
  assert.match(helper, /groupId/);
  assert.match(helper, /startOrdinal/);
  assert.match(helper, /endOrdinal/);
  assert.doesNotMatch(helper, /scrollRatio|characterRatio|overlay|absolute/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node --test tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected:

```txt
not ok ... ENOENT ... src\ai\aiStreamingTailContinuation.ts
```

- [ ] **Step 3: Create the helper**

Create `src/ai/aiStreamingTailContinuation.ts`:

```ts
import type { AiStreamBlock } from "./aiStreamingBlockSplitter";

export type AiStreamingTailContinuationGroup = {
  blocks: AiStreamBlock[];
  endOrdinal: number;
  generationId: string;
  groupId: string;
  lane: "reasoning" | "content";
  messageId: string;
  startOrdinal: number;
};

type GroupInput = {
  activeLanes?: ("reasoning" | "content")[];
  blocks: AiStreamBlock[];
  promotedBlockIds: Set<string>;
};

function createGroupId(input: {
  endOrdinal: number;
  generationId: string;
  lane: "reasoning" | "content";
  messageId: string;
  startOrdinal: number;
}): string {
  return [
    "stream-tail-continuation",
    input.messageId,
    input.generationId,
    input.lane,
    input.startOrdinal,
    input.endOrdinal,
  ].join(":");
}

function createGroup(blocks: AiStreamBlock[]): AiStreamingTailContinuationGroup {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  return {
    blocks,
    endOrdinal: last.ordinal,
    generationId: first.generationId,
    groupId: createGroupId({
      endOrdinal: last.ordinal,
      generationId: first.generationId,
      lane: first.lane,
      messageId: first.messageId,
      startOrdinal: first.ordinal,
    }),
    lane: first.lane,
    messageId: first.messageId,
    startOrdinal: first.ordinal,
  };
}

export function groupPromotedStreamingTailBlocks({
  activeLanes,
  blocks,
  promotedBlockIds,
}: GroupInput): AiStreamingTailContinuationGroup[] {
  const activeLaneSet = activeLanes ? new Set(activeLanes) : null;
  const groups: AiStreamingTailContinuationGroup[] = [];
  let currentBlocks: AiStreamBlock[] = [];

  const flush = () => {
    if (currentBlocks.length === 0) {
      return;
    }
    groups.push(createGroup(currentBlocks));
    currentBlocks = [];
  };

  for (const block of blocks) {
    const active = !activeLaneSet || activeLaneSet.has(block.lane);
    if (!active || !promotedBlockIds.has(block.blockId)) {
      flush();
      continue;
    }

    const previous = currentBlocks[currentBlocks.length - 1];
    const canAppend =
      previous &&
      previous.lane === block.lane &&
      previous.messageId === block.messageId &&
      previous.generationId === block.generationId &&
      previous.ordinal + 1 === block.ordinal;

    if (!previous || canAppend) {
      currentBlocks.push(block);
      continue;
    }

    flush();
    currentBlocks.push(block);
  }

  flush();
  return groups;
}
```

- [ ] **Step 4: Run targeted test**

Run:

```powershell
node --test tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected:

```txt
pass
```

If other tests fail because they still expect `streamTailBlock`, do not weaken them yet; update them in Task 4 after the screen integration.

## 6. Task 2: Add continuation bubble component

**Files:**

- Create: `src/components/ai/AiStreamingTailContinuationBubble.tsx`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Write failing component policy test**

Add:

```js
test('streaming tail continuation bubble renders one shell for multiple measured blocks', () => {
  const bubble = read('src/components/ai/AiStreamingTailContinuationBubble.tsx');

  assert.match(bubble, /export function AiStreamingTailContinuationBubble/);
  assert.match(bubble, /group: AiStreamingTailContinuationGroup/);
  assert.match(bubble, /group\.blocks\.map/);
  assert.match(bubble, /AiMeasuredStreamBlock/);
  assert.match(bubble, /onMeasured/);
  assert.match(bubble, /assistantBubble/);
  assert.doesNotMatch(bubble, /message actions|favorite|version|citation/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
node --test tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected:

```txt
not ok ... ENOENT ... AiStreamingTailContinuationBubble.tsx
```

- [ ] **Step 3: Create component**

Create `src/components/ai/AiStreamingTailContinuationBubble.tsx`:

```tsx
import { StyleSheet, View } from "react-native";

import type { AiStreamingTailContinuationGroup } from "../../ai/aiStreamingTailContinuation";
import { colors, radius } from "../../design/tokens";
import { AiMeasuredStreamBlock } from "./AiMeasuredStreamBlock";

type AiStreamingTailContinuationBubbleProps = {
  bubbleWidth: number;
  group: AiStreamingTailContinuationGroup;
  onMeasured: (blockId: string, height: number) => void;
};

export function AiStreamingTailContinuationBubble({
  bubbleWidth,
  group,
  onMeasured,
}: AiStreamingTailContinuationBubbleProps) {
  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantStack}>
        <View
          style={[
            styles.assistantBubble,
            group.lane === "reasoning" && styles.reasoningBubble,
          ]}
        >
          {group.blocks.map((block) => (
            <AiMeasuredStreamBlock
              block={block}
              bubbleWidth={bubbleWidth}
              key={block.blockId}
              onMeasured={onMeasured}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  assistantBubble: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
    overflow: "hidden",
  },
  assistantRow: {
    alignItems: "flex-start",
    maxWidth: "100%",
  },
  assistantStack: {
    alignItems: "flex-start",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  reasoningBubble: {
    backgroundColor: colors.background.subtle,
  },
});
```

Notes:

- This component intentionally renders one shell for the group.
- `AiMeasuredStreamBlock` remains per-block so measurement granularity is unchanged.
- `overflow: "hidden"` prevents adjacent internal blocks from visually leaking outside the shared shell.

- [ ] **Step 4: Run targeted test**

Run:

```powershell
node --test tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected:

```txt
component policy passes
```

## 7. Task 3: Replace per-block FlatList visual items with continuation groups

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Write failing screen policy test**

Update or add:

```js
test('AI chat tail replay uses continuation groups instead of one bubble per block', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /AiStreamingTailContinuationBubble/);
  assert.match(chat, /groupPromotedStreamingTailBlocks/);
  assert.match(chat, /type:\s*"streamTailContinuation"/);
  assert.match(chat, /promotedTailGroups/);
  assert.match(chat, /calculateRemainingStreamingTailHeight/);
  assert.doesNotMatch(chat, /<AiStreamingTailBlockBubble>[\s\S]*<AiMeasuredStreamBlock/);
  assert.doesNotMatch(chat, /type:\s*"streamTailBlock"/);
});
```

If existing policy tests still assert `streamTailBlock`, replace those assertions with `streamTailContinuation`.

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
node --test tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected:

```txt
not ok ... expected AiStreamingTailContinuationBubble / streamTailContinuation
```

- [ ] **Step 3: Update imports**

In `src/screens/AiChatScreen.tsx`, replace:

```ts
import { AiStreamingTailBlockBubble } from "../components/ai/AiStreamingTailBlockBubble";
```

with:

```ts
import { AiStreamingTailContinuationBubble } from "../components/ai/AiStreamingTailContinuationBubble";
import {
  groupPromotedStreamingTailBlocks,
  type AiStreamingTailContinuationGroup,
} from "../ai/aiStreamingTailContinuation";
```

Keep:

```ts
import { AiMeasuredStreamBlock } from "../components/ai/AiMeasuredStreamBlock";
```

only if it is still used directly elsewhere. After this task, `AiChatScreen.tsx` should not directly render `AiMeasuredStreamBlock`; if unused, remove that import.

- [ ] **Step 4: Update `VisibleMessageItem`**

Find the current union member:

```ts
  | {
      block: AiStreamBlock;
      id: string;
      type: "streamTailBlock";
    }
```

Replace it with:

```ts
  | {
      group: AiStreamingTailContinuationGroup;
      id: string;
      type: "streamTailContinuation";
    }
```

If `AiStreamBlock` is no longer referenced by `AiChatScreen.tsx`, remove:

```ts
import { type AiStreamBlock } from "../ai/aiStreamingBlockSplitter";
```

- [ ] **Step 5: Update tail item construction**

Replace this block:

```ts
const promotedTailItems = tailState.blocks
  .filter((block) => tailState.promotedBlockIds.has(block.blockId))
  .filter((block) => activeLanes.includes(block.lane))
  .map((block): VisibleMessageItem => ({
    block,
    id: block.blockId,
    type: "streamTailBlock",
  }));
for (let index = 0; index < promotedTailItems.length; index += 1) {
  nextInvertedMessageItems.unshift(promotedTailItems[index]);
}
```

with:

```ts
const promotedTailGroups = groupPromotedStreamingTailBlocks({
  activeLanes,
  blocks: tailState.blocks,
  promotedBlockIds: tailState.promotedBlockIds,
}).map((group): VisibleMessageItem => ({
  group,
  id: group.groupId,
  type: "streamTailContinuation",
}));
for (let index = 0; index < promotedTailGroups.length; index += 1) {
  nextInvertedMessageItems.unshift(promotedTailGroups[index]);
}
```

Keep the spacer insertion after the group insertion:

```ts
if (hiddenTailHeight > 0) {
  nextInvertedMessageItems.unshift({
    height: hiddenTailHeight,
    id: "stream-tail-spacer",
    type: "streamTailSpacer",
  });
}
```

Reason:

- For the current inverted list insertion order, this preserves the established visual ordering:

```txt
frozen assistant message
> promoted continuation bubble
> remaining spacer
```

- [ ] **Step 6: Update render item**

Replace:

```tsx
if (item.type === "streamTailBlock") {
  return (
    <AiStreamingTailBlockBubble>
      <AiMeasuredStreamBlock
        block={item.block}
        bubbleWidth={getStreamingBubbleWidth()}
        onMeasured={handleMeasuredTailBlock}
      />
    </AiStreamingTailBlockBubble>
  );
}
```

with:

```tsx
if (item.type === "streamTailContinuation") {
  return (
    <AiStreamingTailContinuationBubble
      bubbleWidth={getStreamingBubbleWidth()}
      group={item.group}
      onMeasured={handleMeasuredTailBlock}
    />
  );
}
```

- [ ] **Step 7: Update key extractor if needed**

If `messageKeyExtractor` currently branches on `streamTailBlock`, replace that branch:

```ts
if (item.type === "streamTailContinuation") {
  return item.id;
}
```

Do not use `group.blocks.map(...).join()` as a key; `group.groupId` is already stable enough for a contiguous promoted group.

- [ ] **Step 8: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected:

```txt
tsc --noEmit exits 0
```

Fix only type errors caused by the renamed item type/imports.

## 8. Task 4: Update policy tests and remove obsolete shell usage

**Files:**

- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`
- Optional delete: `src/components/ai/AiStreamingTailBlockBubble.tsx`

- [ ] **Step 1: Search for obsolete assertions**

Run:

```powershell
rg -n "streamTailBlock|AiStreamingTailBlockBubble|promotedTailItems" tests src/screens/AiChatScreen.tsx
```

Expected after Task 3:

```txt
Only old tests or unused component file references remain.
```

- [ ] **Step 2: Replace source-policy expectations**

Replace old positive assertions:

```js
assert.match(screen, /type:\s*"streamTailBlock"/);
assert.match(chat, /AiStreamingTailBlockBubble/);
assert.match(chat, /<AiStreamingTailBlockBubble>[\s\S]*<AiMeasuredStreamBlock/s);
```

with:

```js
assert.match(screen, /type:\s*"streamTailContinuation"/);
assert.match(chat, /AiStreamingTailContinuationBubble/);
assert.match(chat, /groupPromotedStreamingTailBlocks/);
assert.doesNotMatch(chat, /<AiStreamingTailBlockBubble>[\s\S]*<AiMeasuredStreamBlock/s);
```

- [ ] **Step 3: Add no-fragmented-bubble regression test**

Add:

```js
test('streaming tail replay keeps block measurement separate from visual message shells', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const continuation = read('src/components/ai/AiStreamingTailContinuationBubble.tsx');
  const measured = read('src/components/ai/AiMeasuredStreamBlock.tsx');

  assert.match(chat, /type:\s*"streamTailContinuation"/);
  assert.doesNotMatch(chat, /type:\s*"streamTailBlock"/);
  assert.match(continuation, /group\.blocks\.map/);
  assert.match(continuation, /<AiMeasuredStreamBlock/);
  assert.match(measured, /onLayout/);
  assert.match(measured, /onMeasured\(block\.blockId, height\)/);
});
```

- [ ] **Step 4: Decide whether to delete old block bubble component**

Preferred:

```patch
*** Begin Patch
*** Delete File: src/components/ai/AiStreamingTailBlockBubble.tsx
*** End Patch
```

Only do this after verifying no imports remain:

```powershell
rg -n "AiStreamingTailBlockBubble" src tests
```

Expected:

```txt
no output
```

If deletion is skipped for a low-risk incremental change, add a final report note:

```txt
AiStreamingTailBlockBubble.tsx is now unused and can be deleted in cleanup.
```

## 9. Task 5: Verify spacer remainder and reasoning lane behavior

**Files:**

- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`
- Modify only if tests reveal a gap:
  - `src/screens/AiChatScreen.tsx`
  - `src/ai/aiStreamingTailContinuation.ts`

- [ ] **Step 1: Add spacer ordering policy**

Add:

```js
test('streaming tail continuation keeps spacer as only the unrendered remainder', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const tailInsertionBody =
    /const hiddenTailHeight = calculateRemainingStreamingTailHeight[\s\S]*?if \(hiddenTailHeight > 0\) \{[\s\S]*?\}/.exec(chat)?.[0] ?? '';

  assert.match(tailInsertionBody, /calculateRemainingStreamingTailHeight/);
  assert.match(tailInsertionBody, /promotedTailGroups/);
  assert.match(tailInsertionBody, /nextInvertedMessageItems\.unshift\(promotedTailGroups\[index\]\)/);
  assert.match(tailInsertionBody, /nextInvertedMessageItems\.unshift\(\{\s*height: hiddenTailHeight/);
  assert.ok(
    tailInsertionBody.indexOf('nextInvertedMessageItems.unshift(promotedTailGroups[index])') <
      tailInsertionBody.indexOf('height: hiddenTailHeight'),
  );
});
```

- [ ] **Step 2: Add reasoning active-lane policy**

Add:

```js
test('streaming tail continuation respects active reasoning and content lanes', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const helper = read('src/ai/aiStreamingTailContinuation.ts');

  assert.match(chat, /const activeLanes: \("content" \| "reasoning"\)\[\]/);
  assert.match(chat, /isThinkingExpanded[\s\S]*\? \["content", "reasoning"\][\s\S]*: \["content"\]/);
  assert.match(chat, /groupPromotedStreamingTailBlocks\(\{\s*activeLanes,/);
  assert.match(helper, /activeLaneSet\.has\(block\.lane\)/);
});
```

- [ ] **Step 3: Run targeted tests**

Run:

```powershell
node --test tests/ai-chat-streaming-tail-policy.test.cjs
node --test tests/ai-chat-fixes-policy.test.cjs
```

Expected:

```txt
all tests pass
```

## 10. Task 6: Full verification and code review

**Files:**

- No new files unless verification reveals a missing policy.

- [ ] **Step 1: Typecheck**

Run:

```powershell
pnpm typecheck
```

Expected:

```txt
tsc --noEmit exits 0
```

- [ ] **Step 2: Full tests**

Run:

```powershell
pnpm test
```

Expected:

```txt
all tests pass
```

- [ ] **Step 3: Whitespace check**

Run:

```powershell
git diff --check
```

Expected:

```txt
exit 0
```

Line-ending warnings may appear in this repo. Treat actual whitespace errors as blockers.

- [ ] **Step 4: Source review checklist**

Review `src/screens/AiChatScreen.tsx`:

- `streamTailSpacer` remains a real FlatList item.
- `streamTailContinuation` is a real FlatList item.
- No `streamTailBlock` item remains in `VisibleMessageItem`.
- No `<AiStreamingTailBlockBubble>` render path remains.
- `AiStreamingTailContinuationBubble` receives grouped blocks.
- `handleMeasuredTailBlock` is still called by each `AiMeasuredStreamBlock`.
- `calculateRemainingStreamingTailHeight(...)` is still used for spacer remainder.
- `groupPromotedStreamingTailBlocks(...)` receives `activeLanes`.
- `removeClippedSubviews`, `windowSize`, `maxToRenderPerBatch`, and hot-zone list policy remain dynamic.
- No `scrollToEnd`.
- No ratio reveal functions.
- No hidden detached stream path calls full `setMessages` for every token.

Review `src/components/ai/AiStreamingTailContinuationBubble.tsx`:

- One assistant shell per group.
- Multiple measured blocks inside the shell.
- No action row.
- No version/favorite/citation controls.
- No heavyweight finalized markdown path.

Review `src/ai/aiStreamingTailContinuation.ts`:

- Pure helper.
- No React imports.
- No UI tokens.
- No scroll calls.
- No height estimation.

## 11. Risk review

### Risk 1: 一个 continuation row 过高影响 virtualization

第一版风险可接受，因为：

- 当前 promoted horizon 已受 hot-zone/pre-promotion 控制。
- 真实问题是 visual fragmentation，不是无限行渲染。
- 多个 small blocks 合成一个 shell 更接近成熟消息结构。

如果后续出现 row 过高，再做第二阶段：

```txt
group by lane/message
> split by cumulative reservedHeight <= 1.5 viewport
> render top/middle/bottom shell segments with connected radii
```

这不是本轮必须项，避免过度设计。

### Risk 2: 内部 block padding 叠加导致视觉间距略大

`AiMeasuredStreamBlock` 当前每块有 `paddingHorizontal` / `paddingVertical`。多个块进一个 bubble 后，内部块之间可能比最终 `AiMessageContent` 的段落间距略大。

第一版处理：

- 接受轻微差异，因为 tail replay 是 transient lightweight renderer。
- 不在本轮改 `AiMeasuredStreamBlock` padding，避免影响测量缓存和估算。

后续如需优化，再给 `AiMeasuredStreamBlock` 增加 `positionInGroup: "single" | "first" | "middle" | "last"`，只调整 internal vertical padding。

### Risk 3: reasoning 与 content 合并顺序

当前方案不混合 lane。展开 reasoning 时会出现 reasoning continuation group + content continuation group。

这是正确的：

- collapsed reasoning 不应占位。
- expanded reasoning 应参与同一 replay 体系。
- 视觉上 reasoning 可用轻微不同背景，避免和正文混淆。

### Risk 4: 测试是源码 policy，不是真机视觉验证

本计划符合当前项目阶段要求：不把真机验证作为必要 gate。  
但因为这是视觉问题，后续如果用户允许，建议用 Android 截图验证：

- 长中文段落一次性返回。
- 用户上滑等待完成。
- 用户缓慢回到底部。
- 确认不会出现多个独立 assistant 气泡。

## 12. Self Review

### 12.1 Spec coverage

- measured tail occupancy：保留，不改 spacer/model 主链路。
- render readiness：保留 hot-zone / pre-promotion / dynamic FlatList policy。
- no blank-first：保留 promoted content before spacer remainder。
- no fragmented bubble：通过 continuation group 修复。
- reasoning lane：active lanes 进入 grouping helper，collapsed 不参与。
- long history：不全局扩大 FlatList，仅保留现有动态策略。
- markdown performance：tail replay 仍使用 lightweight streaming renderer。

### 12.2 Placeholder scan

本计划没有未展开的占位执行步骤。  
后续优化被明确列为风险缓解，不是本轮必需实现。

### 12.3 Type consistency

新增类型：

- `AiStreamingTailContinuationGroup`
- `streamTailContinuation`

新增函数：

- `groupPromotedStreamingTailBlocks`

新增组件：

- `AiStreamingTailContinuationBubble`

所有后续任务均使用同一命名。

## 13. Acceptance Criteria

本计划执行完成后，必须满足：

- 流式 detached replay 中，同一 assistant message 的多个 promoted content blocks 视觉上不再显示成多条独立气泡。
- block-level `onLayout` measurement 仍逐块上报。
- spacer 仍只代表未渲染 remainder。
- reasoning collapsed 时不占位、不 promotion。
- hot-zone pre-promotion 和 dynamic FlatList policy 不被删除。
- `pnpm typecheck` 通过。
- `pnpm test` 通过。
- `git diff --check` 无实际 whitespace error。

## 14. Execution mode for this repository

Plan complete and saved to:

```txt
docs/superpowers/plans/2026-07-10-ai-chat-streaming-tail-continuation-bubble.md
```

For this Pixory workspace, execute inline unless the user explicitly asks for subagents.

- **Inline Execution**  
  在当前 session 按 task 顺序执行，每个 task 后做一次源码 review 和 targeted test。

本计划不包含 commit、push、hot update、APK packaging。完成本地验证后等待用户确认。
