# AI Chat Streaming Tail Occupancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pixory's scroll-ratio streaming reveal prototype with a measured tail-occupancy architecture that keeps streaming fast, prevents history-reading jitter, and lets users scroll into generated content naturally.

**Architecture:** Build pure streaming-tail model files first, then connect them to `AiChatScreen.tsx` with a real `FlatList` spacer item. Keep live streaming text in `AiStreamingMessageStore`; when the user detaches, freeze the visible prefix and route later deltas to a tail model that owns block segmentation, reserved height, measurement, and replay.

**Tech Stack:** Expo, React Native, TypeScript, inverted `FlatList`, `useSyncExternalStore`, existing Node policy tests via `node --test tests/*.test.cjs`.

---

## 0. Hard Rules For The Implementing Agent

These rules are mandatory. If code conflicts with them, the implementation is wrong.

- Do not add overlay/floating fake content for the generated tail. Tail occupancy must be a real `FlatList` data item.
- Do not estimate the final height of the whole assistant reply.
- Do not use scroll percentage or character percentage to reveal hidden stream text.
- Do not call `setMessages` for hidden detached streaming deltas.
- Do not flush final DB content into the visible message while the user is detached.
- Do not show the "回到最新" button until offset is greater than `4800`.
- Do not use `scrollToEnd`; this screen uses inverted `FlatList` and latest is `offset: 0`.
- Do not add real-device or emulator validation as a required acceptance gate for this task.
- Do not rewrite chat UI styling unless needed for spacer/block measurement.
- Do not change provider API behavior, model config, memory logic, role card logic, or persistence schema.
- Do not create commits, push branches/tags, open pull requests, run EAS update, package APKs, publish hot updates, or deploy anything. Stop after local code changes and local verification; wait for the user to inspect and accept.

## 1. File Map

Create these focused files:

- `src/ai/aiStreamingBlockSplitter.ts`
  - Owns stream block types, stable block splitting, graceful detach text boundaries, and conservative height estimation.
- `src/ai/aiStreamingHeightCache.ts`
  - Owns in-memory measured height cache keyed by width/font/renderer version.
- `src/ai/aiStreamingTailModel.ts`
  - Owns detached tail state, monotonic reserved height, patch merging, measurement updates, and block promotion.
- `src/components/ai/AiStreamingTailSpacer.tsx`
  - Renders a real invisible spacer row with measured height.
- `src/components/ai/AiMeasuredStreamBlock.tsx`
  - Renders a promoted hidden tail block and reports `onLayout` height.
- `tests/ai-chat-streaming-tail-policy.test.cjs`
  - Adds source-policy tests that prevent regression to ratio reveal, overlay tail, or unsafe final flush.

Modify these existing files:

- `src/screens/AiChatScreen.tsx`
  - Replace ratio reveal refs/functions with tail model refs/state.
  - Extend `VisibleMessageItem` into a discriminated union.
  - Insert `streamTailSpacer` and `streamTailBlock` items into `invertedMessageItems`.
  - Render spacer/block items.
  - Ensure detached provider deltas update the tail model, not visible message state.
- `src/ai/aiStreamingRuntime.ts`
  - Optionally raise visible streaming cadence once the list path is isolated.
- Existing tests:
  - Update tests that currently require `revealBufferedStreamingStateForScroll`.
  - Keep tests that assert `4800`, no `scrollToEnd`, external streaming store, and no forced scroll while user is reading.

## 2. Success Criteria

The implementation is acceptable when all are true:

- `pnpm typecheck` passes.
- `pnpm test` passes.
- `git diff --check` passes.
- `src/screens/AiChatScreen.tsx` contains no `revealTextByRatio`, no `revealedStreamingRatioRef`, and no `revealBufferedStreamingStateForScroll`.
- Detached streaming path contains `mergeStreamingTailPatch` or equivalent tail-model update and does not call `publishStreamingMessage` for hidden text.
- Final completion while detached sets a pending final state but does not directly replace visible frozen text with full final content.
- `VisibleMessageItem` is a union including `message`, `streamTailSpacer`, and `streamTailBlock`.
- `FlatList` data contains the spacer/block as real items; there is no overlay tail implementation.
- Height reservation uses `Math.max(previousReservedHeight, nextHeight)` while detached.
- Height cache key includes width bucket, font scale bucket, renderer version, block type, and block identity/content signature.
- Latest button threshold remains exactly `4800`.

## 3. Task 1: Add Streaming Block Splitter

**Files:**

- Create: `src/ai/aiStreamingBlockSplitter.ts`
- Create: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Add the policy test shell**

Add `tests/ai-chat-streaming-tail-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('streaming tail splitter defines stable blocks, graceful detach, and conservative estimation', () => {
  const splitter = read('src/ai/aiStreamingBlockSplitter.ts');
  assert.match(splitter, /export type AiStreamBlockType/);
  assert.match(splitter, /export type AiStreamBlock/);
  assert.match(splitter, /export function splitStreamingTextIntoBlocks/);
  assert.match(splitter, /export function chooseGracefulDetachText/);
  assert.match(splitter, /export function estimateStreamBlockHeight/);
  assert.match(splitter, /paragraph|heading|list|blockquote|code|table|math|image|html|thinking|plain/);
  assert.match(splitter, /Math\.ceil/);
  assert.doesNotMatch(splitter, /finalResponseHeight|wholeResponseHeight|totalResponseEstimate/);
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected:

```txt
not ok ... ENOENT: no such file or directory, open '...\src\ai\aiStreamingBlockSplitter.ts'
```

- [ ] **Step 3: Create the splitter implementation**

Create `src/ai/aiStreamingBlockSplitter.ts`:

```ts
export type AiStreamBlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'blockquote'
  | 'code'
  | 'table'
  | 'math'
  | 'image'
  | 'html'
  | 'thinking'
  | 'plain';

export type AiStreamBlock = {
  blockId: string;
  estimatedHeight: number;
  finalized: boolean;
  generationId: string;
  measuredHeight?: number;
  messageId: string;
  ordinal: number;
  raw: string;
  reservedHeight: number;
  startOffset: number;
  type: AiStreamBlockType;
};

export type StreamBlockEstimateInput = {
  bubbleWidth: number;
  fontScale?: number;
  lineHeight?: number;
};

const DEFAULT_LINE_HEIGHT = 22;
const MIN_BLOCK_HEIGHT = 24;
const PARAGRAPH_VERTICAL_PADDING = 10;
const CODE_VERTICAL_PADDING = 34;
const TABLE_VERTICAL_PADDING = 30;
const RICH_FALLBACK_HEIGHT = 140;

function countCjkChars(text: string): number {
  const matches = text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g);
  return matches?.length ?? 0;
}

function estimateWrappedLines(text: string, bubbleWidth: number): number {
  const safeWidth = Math.max(180, bubbleWidth);
  const cjkCount = countCjkChars(text);
  const nonCjkCount = Math.max(0, text.length - cjkCount);
  const weightedChars = cjkCount + nonCjkCount * 0.55;
  const charsPerLine = Math.max(12, Math.floor(safeWidth / 15));
  return Math.max(1, Math.ceil(weightedChars / charsPerLine));
}

function inferBlockType(raw: string): AiStreamBlockType {
  const trimmed = raw.trimStart();
  if (!trimmed) return 'plain';
  if (/^```/.test(trimmed)) return 'code';
  if (/^\$\$/.test(trimmed)) return 'math';
  if (/^#{1,6}\s/.test(trimmed)) return 'heading';
  if (/^>\s?/m.test(trimmed)) return 'blockquote';
  if (/^(\s*[-*+]\s+|\s*\d+\.\s+)/m.test(trimmed)) return 'list';
  if (/^\|.+\|\r?\n\|[\s:-]+\|/m.test(trimmed)) return 'table';
  if (/^<([a-z][\w-]*)(\s|>|\/>)/i.test(trimmed)) return 'html';
  if (/!\[[^\]]*]\([^)]+\)/.test(trimmed)) return 'image';
  return 'paragraph';
}

export function estimateStreamBlockHeight(
  block: Pick<AiStreamBlock, 'raw' | 'type'>,
  input: StreamBlockEstimateInput
): number {
  const lineHeight = (input.lineHeight ?? DEFAULT_LINE_HEIGHT) * (input.fontScale ?? 1);
  const raw = block.raw || '';
  const physicalLines = Math.max(1, raw.split(/\r?\n/).length);
  if (block.type === 'code') {
    return Math.ceil(Math.max(MIN_BLOCK_HEIGHT, physicalLines * lineHeight + CODE_VERTICAL_PADDING));
  }
  if (block.type === 'table') {
    return Math.ceil(Math.max(MIN_BLOCK_HEIGHT, physicalLines * lineHeight * 1.15 + TABLE_VERTICAL_PADDING));
  }
  if (block.type === 'image' || block.type === 'html' || block.type === 'math') {
    return RICH_FALLBACK_HEIGHT;
  }
  const wrappedLines = estimateWrappedLines(raw, input.bubbleWidth);
  return Math.ceil(Math.max(MIN_BLOCK_HEIGHT, wrappedLines * lineHeight + PARAGRAPH_VERTICAL_PADDING));
}

function isFenceOpen(text: string): boolean {
  return (text.match(/^```/gm)?.length ?? 0) % 2 === 1;
}

function nextBlockId(input: {
  generationId: string;
  messageId: string;
  ordinal: number;
  startOffset: number;
  type: AiStreamBlockType;
}): string {
  return `${input.messageId}:${input.generationId}:${input.ordinal}:${input.type}:${input.startOffset}`;
}

export function splitStreamingTextIntoBlocks(input: {
  bubbleWidth: number;
  content: string;
  generationId: string;
  lineHeight?: number;
  messageId: string;
}): AiStreamBlock[] {
  const content = input.content ?? '';
  if (!content) return [];

  const blocks: AiStreamBlock[] = [];
  const paragraphPattern = /\n{2,}/g;
  let startOffset = 0;
  let match: RegExpExecArray | null;

  const pushBlock = (raw: string, start: number, finalized: boolean) => {
    if (!raw) return;
    const ordinal = blocks.length;
    const type = inferBlockType(raw);
    const estimatedHeight = estimateStreamBlockHeight(
      { raw, type },
      { bubbleWidth: input.bubbleWidth, lineHeight: input.lineHeight }
    );
    blocks.push({
      blockId: nextBlockId({ generationId: input.generationId, messageId: input.messageId, ordinal, startOffset: start, type }),
      estimatedHeight,
      finalized,
      generationId: input.generationId,
      messageId: input.messageId,
      ordinal,
      raw,
      reservedHeight: estimatedHeight,
      startOffset: start,
      type,
    });
  };

  while ((match = paragraphPattern.exec(content)) !== null) {
    const end = match.index;
    pushBlock(content.slice(startOffset, end), startOffset, true);
    startOffset = match.index + match[0].length;
  }

  const tail = content.slice(startOffset);
  pushBlock(tail, startOffset, !tail || (!isFenceOpen(tail) && /\n$/.test(content)));
  return blocks;
}

export function chooseGracefulDetachText(input: {
  previousVisibleText: string;
  targetText: string;
  maxExtraChars?: number;
}): string {
  const previous = input.previousVisibleText ?? '';
  const target = input.targetText ?? '';
  if (!target.startsWith(previous)) {
    return previous;
  }
  const maxExtraChars = input.maxExtraChars ?? 64;
  const candidate = target.slice(0, previous.length + maxExtraChars);
  const extra = candidate.slice(previous.length);
  const boundaryMatch = /[\n。！？.!?；;](?![\s\S]*[\n。！？.!?；;])/.exec(extra);
  if (!boundaryMatch) {
    return candidate;
  }
  return previous + extra.slice(0, boundaryMatch.index + boundaryMatch[0].length);
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected:

```txt
ok ... streaming tail splitter defines stable blocks, graceful detach, and conservative estimation
```

## 4. Task 2: Add Height Cache

**Files:**

- Create: `src/ai/aiStreamingHeightCache.ts`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Add cache policy test**

Append to `tests/ai-chat-streaming-tail-policy.test.cjs`:

```js
test('streaming height cache keys include layout and renderer invalidation inputs', () => {
  const cache = read('src/ai/aiStreamingHeightCache.ts');
  assert.match(cache, /export type AiStreamBlockHeightEntry/);
  assert.match(cache, /widthBucket/);
  assert.match(cache, /fontScaleBucket/);
  assert.match(cache, /rendererVersion/);
  assert.match(cache, /blockType/);
  assert.match(cache, /export function createStreamBlockHeightCacheKey/);
  assert.match(cache, /Math\.round\(input\.width \/ 8\) \* 8/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: failure because `src/ai/aiStreamingHeightCache.ts` does not exist.

- [ ] **Step 3: Create height cache**

Create `src/ai/aiStreamingHeightCache.ts`:

```ts
import type { AiStreamBlockType } from './aiStreamingBlockSplitter';

export const AI_STREAMING_HEIGHT_RENDERER_VERSION = 1;

export type AiStreamBlockHeightEntry = {
  blockType: AiStreamBlockType;
  fontScaleBucket: number;
  key: string;
  lineCount: number;
  measuredHeight: number;
  rawLength: number;
  rendererVersion: number;
  updatedAt: number;
  widthBucket: number;
};

export function bucketStreamWidth(width: number): number {
  return Math.round(inputSafeNumber(width, 0) / 8) * 8;
}

export function bucketFontScale(fontScale: number | undefined): number {
  return Math.round(inputSafeNumber(fontScale ?? 1, 1) * 100);
}

function inputSafeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function createStreamBlockHeightCacheKey(input: {
  blockId: string;
  blockType: AiStreamBlockType;
  fontScale?: number;
  lineCount: number;
  rawLength: number;
  rendererVersion?: number;
  width: number;
}): string {
  const widthBucket = Math.round(input.width / 8) * 8;
  const fontScaleBucket = bucketFontScale(input.fontScale);
  const rendererVersion = input.rendererVersion ?? AI_STREAMING_HEIGHT_RENDERER_VERSION;
  return [
    input.blockId,
    input.blockType,
    widthBucket,
    fontScaleBucket,
    rendererVersion,
    input.rawLength,
    input.lineCount,
  ].join(':');
}

export function createStreamingHeightCache(limit = 500) {
  const entries = new Map<string, AiStreamBlockHeightEntry>();

  function get(key: string): AiStreamBlockHeightEntry | undefined {
    return entries.get(key);
  }

  function set(entry: AiStreamBlockHeightEntry) {
    entries.set(entry.key, entry);
    if (entries.size <= limit) return;
    const oldest = entries.keys().next().value;
    if (oldest) entries.delete(oldest);
  }

  function clear() {
    entries.clear();
  }

  return { clear, get, set };
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: pass.

## 5. Task 3: Add Tail Model

**Files:**

- Create: `src/ai/aiStreamingTailModel.ts`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Add model policy test**

Append:

```js
test('streaming tail model uses monotonic reserved height and block promotion', () => {
  const model = read('src/ai/aiStreamingTailModel.ts');
  assert.match(model, /export type AiStreamingTailState/);
  assert.match(model, /export function createEmptyStreamingTailState/);
  assert.match(model, /export function mergeStreamingTailPatch/);
  assert.match(model, /export function updateStreamingTailBlockMeasurement/);
  assert.match(model, /export function promoteStreamingTailBlocks/);
  assert.match(model, /Math\.max\(.*reservedHeight.*measuredHeight/s);
  assert.match(model, /promotedBlockIds/);
  assert.doesNotMatch(model, /scrollRatio|revealRatio|characterRatio/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
```

Expected: failure because `src/ai/aiStreamingTailModel.ts` does not exist.

- [ ] **Step 3: Create tail model**

Create `src/ai/aiStreamingTailModel.ts`:

```ts
import type { AiStreamingMessagePatch } from './aiChatService';
import {
  type AiStreamBlock,
  chooseGracefulDetachText,
  splitStreamingTextIntoBlocks,
} from './aiStreamingBlockSplitter';

export type AiStreamingTailState = {
  blocks: AiStreamBlock[];
  frozenContent: string;
  frozenReasoningText: string | null;
  generationId: string | null;
  messageId: string | null;
  promotedBlockIds: Set<string>;
  status: 'idle' | 'detached' | 'completed';
  tailContent: string;
  tailReasoningText: string | null;
  totalReservedHeight: number;
};

export function createEmptyStreamingTailState(): AiStreamingTailState {
  return {
    blocks: [],
    frozenContent: '',
    frozenReasoningText: null,
    generationId: null,
    messageId: null,
    promotedBlockIds: new Set<string>(),
    status: 'idle',
    tailContent: '',
    tailReasoningText: null,
    totalReservedHeight: 0,
  };
}

function sumReservedHeight(blocks: AiStreamBlock[], promotedBlockIds: Set<string>): number {
  return blocks.reduce((total, block) => {
    if (promotedBlockIds.has(block.blockId)) {
      return total;
    }
    return total + block.reservedHeight;
  }, 0);
}

export function startStreamingTailDetach(input: {
  bubbleWidth: number;
  currentContent: string;
  currentReasoningText: string | null;
  generationId: string;
  messageId: string;
  targetContent: string;
}): AiStreamingTailState {
  const frozenContent = chooseGracefulDetachText({
    previousVisibleText: input.currentContent,
    targetText: input.targetContent,
  });
  const hiddenContent = input.targetContent.startsWith(frozenContent)
    ? input.targetContent.slice(frozenContent.length)
    : '';
  const blocks = splitStreamingTextIntoBlocks({
    bubbleWidth: input.bubbleWidth,
    content: hiddenContent,
    generationId: input.generationId,
    messageId: input.messageId,
  });
  const promotedBlockIds = new Set<string>();
  return {
    blocks,
    frozenContent,
    frozenReasoningText: input.currentReasoningText,
    generationId: input.generationId,
    messageId: input.messageId,
    promotedBlockIds,
    status: 'detached',
    tailContent: hiddenContent,
    tailReasoningText: null,
    totalReservedHeight: sumReservedHeight(blocks, promotedBlockIds),
  };
}

export function mergeStreamingTailPatch(input: {
  bubbleWidth: number;
  patch: AiStreamingMessagePatch;
  previous: AiStreamingTailState;
}): AiStreamingTailState {
  const previous = input.previous;
  if (!input.patch.generationId || !input.patch.id) {
    return previous;
  }
  const frozenContent = previous.frozenContent;
  const nextFullContent = input.patch.content ?? frozenContent + previous.tailContent;
  const tailContent = nextFullContent.startsWith(frozenContent)
    ? nextFullContent.slice(frozenContent.length)
    : previous.tailContent;
  const nextBlocks = splitStreamingTextIntoBlocks({
    bubbleWidth: input.bubbleWidth,
    content: tailContent,
    generationId: input.patch.generationId,
    messageId: input.patch.id,
  }).map((nextBlock) => {
    const previousBlock = previous.blocks.find((block) => block.blockId === nextBlock.blockId);
    if (!previousBlock) return nextBlock;
    return {
      ...nextBlock,
      measuredHeight: previousBlock.measuredHeight,
      reservedHeight: Math.max(previousBlock.reservedHeight, nextBlock.reservedHeight),
    };
  });
  const promotedBlockIds = new Set(
    [...previous.promotedBlockIds].filter((blockId) => nextBlocks.some((block) => block.blockId === blockId))
  );
  const status = input.patch.status === 'completed' || input.patch.status === 'failed' || input.patch.status === 'stopped'
    ? 'completed'
    : 'detached';
  return {
    ...previous,
    blocks: nextBlocks,
    generationId: input.patch.generationId,
    messageId: input.patch.id,
    promotedBlockIds,
    status,
    tailContent,
    tailReasoningText: input.patch.reasoningText === undefined ? previous.tailReasoningText : input.patch.reasoningText,
    totalReservedHeight: sumReservedHeight(nextBlocks, promotedBlockIds),
  };
}

export function updateStreamingTailBlockMeasurement(input: {
  blockId: string;
  measuredHeight: number;
  previous: AiStreamingTailState;
}): AiStreamingTailState {
  const blocks = input.previous.blocks.map((block) => {
    if (block.blockId !== input.blockId) return block;
    return {
      ...block,
      measuredHeight: input.measuredHeight,
      reservedHeight: Math.max(block.reservedHeight, input.measuredHeight),
    };
  });
  return {
    ...input.previous,
    blocks,
    totalReservedHeight: sumReservedHeight(blocks, input.previous.promotedBlockIds),
  };
}

export function promoteStreamingTailBlocks(input: {
  previous: AiStreamingTailState;
  visibleTailHeight: number;
}): AiStreamingTailState {
  let consumed = 0;
  const promotedBlockIds = new Set(input.previous.promotedBlockIds);
  for (const block of input.previous.blocks) {
    if (promotedBlockIds.has(block.blockId)) continue;
    const nextConsumed = consumed + block.reservedHeight;
    if (nextConsumed > input.visibleTailHeight) break;
    promotedBlockIds.add(block.blockId);
    consumed = nextConsumed;
  }
  return {
    ...input.previous,
    promotedBlockIds,
    totalReservedHeight: sumReservedHeight(input.previous.blocks, promotedBlockIds),
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
pnpm typecheck
```

Expected: both pass. If typecheck fails because importing `AiStreamingMessagePatch` from `aiChatService` creates a cycle warning or undesirable dependency, move the minimal patch type into `aiStreamingTailModel.ts`:

```ts
type StreamingTailPatch = {
  content?: string;
  generationId?: string;
  id?: string;
  reasoningText?: string | null;
  status?: string;
};
```

Then update `mergeStreamingTailPatch` to use `StreamingTailPatch`.

## 6. Task 4: Add Tail Spacer And Measured Block Components

**Files:**

- Create: `src/components/ai/AiStreamingTailSpacer.tsx`
- Create: `src/components/ai/AiMeasuredStreamBlock.tsx`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Add component policy test**

Append:

```js
test('streaming tail UI uses real list spacer and measured block components', () => {
  const spacer = read('src/components/ai/AiStreamingTailSpacer.tsx');
  const block = read('src/components/ai/AiMeasuredStreamBlock.tsx');
  assert.match(spacer, /export function AiStreamingTailSpacer/);
  assert.match(spacer, /height:\s*Math\.max\(0, height\)/);
  assert.match(block, /export function AiMeasuredStreamBlock/);
  assert.match(block, /onLayout/);
  assert.match(block, /onMeasured\(block\.blockId/);
  assert.match(block, /AiMessageContent/);
});
```

- [ ] **Step 2: Create spacer component**

Create `src/components/ai/AiStreamingTailSpacer.tsx`:

```tsx
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

type AiStreamingTailSpacerProps = {
  height: number;
};

function AiStreamingTailSpacerComponent({ height }: AiStreamingTailSpacerProps) {
  return <View pointerEvents="none" style={[styles.spacer, { height: Math.max(0, height) }]} />;
}

export const AiStreamingTailSpacer = memo(AiStreamingTailSpacerComponent);

const styles = StyleSheet.create({
  spacer: {
    opacity: 0,
    width: '100%',
  },
});
```

- [ ] **Step 3: Create measured block component**

Create `src/components/ai/AiMeasuredStreamBlock.tsx`:

```tsx
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { AiStreamBlock } from '../../ai/aiStreamingBlockSplitter';
import { spacing } from '../../design/tokens';
import { AiMessageContent } from './AiMessageContent';

type AiMeasuredStreamBlockProps = {
  block: AiStreamBlock;
  onMeasured: (blockId: string, height: number) => void;
};

function AiMeasuredStreamBlockComponent({ block, onMeasured }: AiMeasuredStreamBlockProps) {
  return (
    <View
      onLayout={(event) => {
        onMeasured(block.blockId, event.nativeEvent.layout.height);
      }}
      style={styles.block}
    >
      <AiMessageContent content={block.raw} streaming={true} />
    </View>
  );
}

export const AiMeasuredStreamBlock = memo(AiMeasuredStreamBlockComponent);

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
  },
});
```

- [ ] **Step 4: Run tests**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
pnpm typecheck
```

Expected: pass.

## 6.5. Task 4.5: Hook Up Height Cache

- [ ] **Step 1: Use cache in Splitter**

In `src/ai/aiStreamingBlockSplitter.ts`, import `createStreamBlockHeightCacheKey` and `createStreamingHeightCache`.
Create a global or module-level cache instance:
```ts
export const streamBlockHeightCache = createStreamingHeightCache();
```
In `splitStreamingTextIntoBlocks`, check the cache before estimating. (You'll need to pass the bubble width to the cache key).

- [ ] **Step 2: Write to cache in Component**

In `src/components/ai/AiMeasuredStreamBlock.tsx`, when handling `onLayout`, write the layout height into the cache for this block.

## 7. Task 5: Connect Tail Items To AiChatScreen

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`
- Modify existing tests that mention `revealBufferedStreamingStateForScroll`

- [ ] **Step 0: Fix Types**

Find `onOpenThread` in `AiChatScreen.tsx` near `AiComprehensiveRecordDrawer` that uses `: any` and remove the `: any` type degradation. (Around line 3429).

- [ ] **Step 1: Add screen policy test**

Append:

```js
test('AI chat screen uses real FlatList tail items instead of ratio reveal', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /type:\s*'message'/);
  assert.match(chat, /type:\s*'streamTailSpacer'/);
  assert.match(chat, /type:\s*'streamTailBlock'/);
  assert.match(chat, /AiStreamingTailSpacer/);
  assert.match(chat, /AiMeasuredStreamBlock/);
  assert.match(chat, /mergeStreamingTailPatch/);
  assert.match(chat, /promoteStreamingTailBlocks/);
  assert.match(chat, /MESSAGE_SCROLL_BUTTON_THRESHOLD = 4800/);
  assert.doesNotMatch(chat, /revealedStreamingRatioRef/);
  assert.doesNotMatch(chat, /revealTextByRatio/);
  assert.doesNotMatch(chat, /revealBufferedStreamingStateForScroll/);
  assert.doesNotMatch(chat, /scrollRatio|characterRatio/);
});
```

- [ ] **Step 2: Add imports to `AiChatScreen.tsx`**

Add imports near existing AI imports:

```ts
import { AiMeasuredStreamBlock } from '../components/ai/AiMeasuredStreamBlock';
import { AiStreamingTailSpacer } from '../components/ai/AiStreamingTailSpacer';
import type { AiStreamBlock } from '../ai/aiStreamingBlockSplitter';
import {
  createEmptyStreamingTailState,
  mergeStreamingTailPatch,
  promoteStreamingTailBlocks,
  startStreamingTailDetach,
  updateStreamingTailBlockMeasurement,
  type AiStreamingTailState,
} from '../ai/aiStreamingTailModel';
```

- [ ] **Step 3: Replace `VisibleMessageItem` type**

Replace the current type:

```ts
type VisibleMessageItem = {
  message: AiMessageWithCitations;
  showAvatar: boolean;
  showDateSeparator: boolean;
};
```

with:

```ts
type VisibleMessageItem =
  | {
      message: AiMessageWithCitations;
      showAvatar: boolean;
      showDateSeparator: boolean;
      type: 'message';
    }
  | {
      generationId: string;
      height: number;
      type: 'streamTailSpacer';
    }
  | {
      block: AiStreamBlock;
      type: 'streamTailBlock';
    };
```

- [ ] **Step 4: Replace ratio reveal refs**

Remove these refs:

```ts
const bufferedStreamingPatchRef = useRef<AiStreamingMessagePatch | null>(null);
const revealedStreamingPatchRef = useRef<AiStreamingMessagePatch | null>(null);
const revealedStreamingRatioRef = useRef(0);
```

Add these refs/state:

```ts
const bufferedStreamingPatchRef = useRef<AiStreamingMessagePatch | null>(null);
const streamingTailStateRef = useRef<AiStreamingTailState>(createEmptyStreamingTailState());
const [streamingTailVersion, setStreamingTailVersion] = useState(0);
```

Keep `bufferedStreamingPatchRef` because final flush still needs full patch metadata.

- [ ] **Step 5: Add tail state helper functions**

Add below `syncScrollToLatestVisibility`:

```ts
function updateStreamingTailState(updater: (current: AiStreamingTailState) => AiStreamingTailState) {
  const next = updater(streamingTailStateRef.current);
  streamingTailStateRef.current = next;
  setStreamingTailVersion((version) => version + 1);
}

function resetStreamingTailState() {
  streamingTailStateRef.current = createEmptyStreamingTailState();
  setStreamingTailVersion((version) => version + 1);
}

function getStreamingBubbleWidth() {
  return Math.max(220, layout.screenMaxWidth - spacing[8]);
}
```

- [ ] **Step 6: Delete ratio reveal functions**

Delete these functions completely:

```ts
function revealTextByRatio(...)
function buildScrollRevealedStreamingPatch(...)
function revealBufferedStreamingStateForScroll(...)
```

Do not leave unused wrappers with the same names.

- [ ] **Step 7: Update reset paths**

In `resetStreamingReadBufferState`, remove:

```ts
revealedStreamingPatchRef.current = null;
revealedStreamingRatioRef.current = 0;
```

Add:

```ts
resetStreamingTailState();
```

In `flushBufferedStreamingState`, remove the same revealed refs and add:

```ts
if (streamingTailStateRef.current.status !== 'idle') {
  if (bottomLockedRef.current || currentRoute?.name !== 'ai-chat') {
    resetStreamingTailState();
  }
}
```

Only call `resetStreamingTailState()` after applying the full buffered patch if the user is safely at the bottom (`bottomLockedRef.current`) or leaving the chat. Otherwise leave it 'completed' so it can be naturally consumed.

- [ ] **Step 8: Change scroll handler**

In `handleMessageScroll`, remove:

```ts
revealBufferedStreamingStateForScroll(contentOffset.y);
```

Replace with:

```ts
if (hasPendingStreamingReadBuffer()) {
  const tailState = streamingTailStateRef.current;
  const visibleTailHeight = Math.max(0, tailState.totalReservedHeight - contentOffset.y);
  updateStreamingTailState((current) =>
    promoteStreamingTailBlocks({
      previous: current,
      visibleTailHeight,
    })
  );
}
```

This promotes blocks by subtracting the offset from the `totalReservedHeight` so that promotion happens safely as the user scrolls downwards toward the latest.

- [ ] **Step 9: Update `nextVisibleMessageItems` construction**

Change each message item object to include `type: 'message'`:

```ts
return {
  message,
  showAvatar: message.role === 'assistant' && (showDateSeparator || previousMessage?.role !== 'assistant'),
  showDateSeparator,
  type: 'message' as const,
};
```

After `nextInvertedMessageItems` is created, insert tail items. Use the current tail model:

```ts
const tailState = streamingTailStateRef.current;
const promotedTailItems = tailState.blocks
  .filter((block) => tailState.promotedBlockIds.has(block.blockId))
  .map((block): VisibleMessageItem => ({ block, type: 'streamTailBlock' }));
const hiddenTailHeight = tailState.totalReservedHeight;
if ((tailState.status === 'detached' || tailState.status === 'completed') && tailState.generationId) {
  if (hiddenTailHeight > 0) {
    nextInvertedMessageItems.unshift({
      generationId: tailState.generationId,
      height: hiddenTailHeight,
      type: 'streamTailSpacer',
    });
  }
  for (let index = promotedTailItems.length - 1; index >= 0; index -= 1) {
    nextInvertedMessageItems.unshift(promotedTailItems[index]);
  }
}
```

Important: if the visual placement is wrong in code review, adjust only item insertion order. Do not switch to overlay.

- [ ] **Step 10: Update `visibleMessageState` memo dependencies**

Add `streamingTailVersion` to the `useMemo` dependency array that builds `visibleMessageState`.
Also, inside the memo, check if the current message matches the detached tail state and override its content:

```ts
  if (message.id === tailState.messageId && tailState.status !== 'idle') {
    message = { ...message, content: tailState.frozenContent };
  }
```

```ts
}, [messages, selectedVersionByMessageId, streamingTailVersion]);
```

- [ ] **Step 11: Update index map**

Change index map creation so it only indexes message items:

```ts
nextInvertedMessageItems.forEach((item, index) => {
  if (item.type === 'message') {
    nextInvertedMessageIndexById.set(item.message.id, index);
  }
});
```

- [ ] **Step 12: Update key extractor**

Replace current key extractor:

```ts
const messageKeyExtractor = useCallback((item: VisibleMessageItem) => item.message.id, []);
```

with:

```ts
const messageKeyExtractor = useCallback((item: VisibleMessageItem) => {
  if (item.type === 'message') return item.message.id;
  if (item.type === 'streamTailSpacer') return `stream-tail-spacer:${item.generationId}`;
  return `stream-tail-block:${item.block.blockId}`;
}, []);
```

- [ ] **Step 13: Update render item**

At the start of `renderMessageItem`, before reading `item.message`, add:

```tsx
if (item.type === 'streamTailSpacer') {
  return <AiStreamingTailSpacer height={item.height} />;
}
if (item.type === 'streamTailBlock') {
  return (
    <AiMeasuredStreamBlock
      block={item.block}
      onMeasured={(blockId, height) => {
        updateStreamingTailState((current) =>
          updateStreamingTailBlockMeasurement({
            blockId,
            measuredHeight: height,
            previous: current,
          })
        );
      }}
    />
  );
}
```

Then keep existing message rendering for `item.type === 'message'`.

- [ ] **Step 14: Fix `scrollToIndexFailed` item access**

Replace direct `.message.id` reads for failed index:

```ts
const failedMessageId = invertedMessageItems[info.index]?.message.id;
```

with:

```ts
const failedItem = invertedMessageItems[info.index];
const failedMessageId = failedItem?.type === 'message' ? failedItem.message.id : null;
```

Apply this replacement to every `onScrollToIndexFailed` helper in `AiChatScreen.tsx`.

- [ ] **Step 15: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: pass. If it fails on `VisibleMessageItem` property access, every read of `item.message` must be guarded by `item.type === 'message'`.

## 8. Task 6: Route Detached Patches Into Tail Model

**Files:**

- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] **Step 1: Add detached-path policy test**

Append:

```js
test('detached streaming path updates tail model and does not publish hidden text', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const bufferBody = /const applyOrBufferStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[[^\]]*\]\);/.exec(chat)?.[0] ?? '';
  const detachedBody = /bottomLockedRef\.current = false;[\s\S]*?syncScrollToLatestVisibility\(\);/.exec(bufferBody)?.[0] ?? '';
  assert.match(detachedBody, /freezeVisibleStreamingMessage\(patch\.id\)/);
  assert.match(detachedBody, /mergeStreamingTailPatch/);
  assert.match(detachedBody, /updateStreamingTailState/);
  assert.doesNotMatch(detachedBody, /publishStreamingMessage/);
  assert.doesNotMatch(detachedBody, /applyStreamingMessagePatch\(patch\)/);
});
```

- [ ] **Step 2: Update detached branch in `applyOrBufferStreamingMessagePatch`**

Inside the `else` branch where current code does:

```ts
bottomLockedRef.current = false;
streamingReadBufferActiveRef.current = true;
hasBufferedStreamingUpdateRef.current = true;
freezeVisibleStreamingMessage(patch.id);
mergeBufferedStreamingPatch(patch);
syncScrollToLatestVisibility();
```

Replace with:

```ts
bottomLockedRef.current = false;
streamingReadBufferActiveRef.current = true;
hasBufferedStreamingUpdateRef.current = true;
freezeVisibleStreamingMessage(patch.id);
mergeBufferedStreamingPatch(patch);
const frozenMessage = frozenStreamingMessageByIdRef.current.get(patch.id);
if (frozenMessage && patch.generationId) {
  const currentTail = streamingTailStateRef.current;
  if (currentTail.status === 'idle' || currentTail.messageId !== patch.id || currentTail.generationId !== patch.generationId) {
    streamingTailStateRef.current = startStreamingTailDetach({
      bubbleWidth: getStreamingBubbleWidth(),
      currentContent: frozenMessage.content,
      currentReasoningText: frozenMessage.reasoningText,
      generationId: patch.generationId,
      messageId: patch.id,
      targetContent: patch.content ?? frozenMessage.content,
    });
    setStreamingTailVersion((version) => version + 1);
  } else {
    updateStreamingTailState((tail) =>
      mergeStreamingTailPatch({
        bubbleWidth: getStreamingBubbleWidth(),
        patch,
        previous: tail,
      })
    );
  }
}
syncScrollToLatestVisibility();
```

- [ ] **Step 3: Ensure final detached completion does not flash**

Find the final patch handling path that sets:

```ts
streamingReadBufferActiveRef.current = true;
pendingFinalReloadRef.current = true;
hasBufferedStreamingUpdateRef.current = true;
```

After buffering the final patch, call the same tail update path:

```ts
if (bufferedStreamingPatchRef.current) {
  updateStreamingTailState((tail) =>
    mergeStreamingTailPatch({
      bubbleWidth: getStreamingBubbleWidth(),
      patch: bufferedStreamingPatchRef.current!,
      previous: tail,
    })
  );
}
```

Do not call `applyStreamingMessagePatch` in this detached final path.

- [ ] **Step 4: Run targeted tests**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-tail-policy.test.cjs
pnpm test -- tests/ai-chat-performance-hardening-policy.test.cjs
pnpm test -- tests/ai-navigation-policy.test.cjs
```

Expected: pass after updating old tests that still mention ratio reveal.

## 9. Task 7: Update Existing Policy Tests

**Files:**

- Modify: `tests/ai-chat-fixes-policy.test.cjs`
- Modify: `tests/ai-navigation-policy.test.cjs`
- Modify: `tests/ai-chat-performance-hardening-policy.test.cjs`
- Modify: `tests/ai-chat-first-token-pipeline-policy.test.cjs`

- [ ] **Step 1: Replace old ratio-reveal expectations**

Find expectations like:

```js
assert.match(scrollHandler, /revealBufferedStreamingStateForScroll\(contentOffset\.y\)/);
```

Replace with:

```js
assert.match(scrollHandler, /promoteStreamingTailBlocks/);
assert.doesNotMatch(scrollHandler, /revealBufferedStreamingStateForScroll/);
```

- [ ] **Step 2: Preserve first-token policy**

Do not weaken this expectation:

```js
assert.match(bufferBody, /if \(canAttachLiveLayout && canPublishLive && streamingIdentity\) \{/);
```

The first visible token must still publish through `publishStreamingMessage` while live locked.

- [ ] **Step 3: Preserve no forced scroll policy**

Keep or add:

```js
assert.doesNotMatch(scrollHandler, /flushBufferedStreamingState/);
assert.doesNotMatch(chat, /scrollToEnd/);
assert.doesNotMatch(chat, /onContentSizeChange=\{[^}]*scrollToOffset/);
```

- [ ] **Step 4: Run all policy tests**

Run:

```powershell
pnpm test
```

Expected: pass.

## 10. Task 8: Tune Streaming Runtime After Isolation

**Files:**

- Modify: `src/ai/aiStreamingRuntime.ts`
- Modify: `tests/ai-chat-streaming-runtime-policy.test.cjs`

- [ ] **Step 1: Decide whether to tune now**

Only change runtime cadence after Tasks 1-7 pass. If task owner wants minimal risk, skip this task.

- [ ] **Step 2: If tuning, update `targetStreamingFps`**

Recommended replacement:

```ts
export function targetStreamingFps(input: StreamingVisibilityState & { visibleChars: number }): number {
  if (!canPublishStreamingPatch(input)) {
    return 0;
  }
  if (!input.bottomLocked) {
    return input.devicePressure ? 8 : 12; // Low-frequency tail occupancy updates while detached
  }
  if (input.visibleChars <= 1000) {
    return input.devicePressure ? 30 : 60;
  }
  if (input.visibleChars <= 4000) {
    return input.devicePressure ? 24 : 45;
  }
  return input.devicePressure ? 18 : 30;
}
```

- [ ] **Step 3: Keep backlog catch-up**

Do not remove `targetStreamingDisplayStep`. It is the mechanism that catches up by increasing characters per frame instead of pretending the device can render unlimited frames.

- [ ] **Step 4: Update runtime policy test**

In `tests/ai-chat-streaming-runtime-policy.test.cjs`, update expected fps tiers to include `60`, `45`, and detached `12` if the test checks exact numbers.

- [ ] **Step 5: Run tests**

Run:

```powershell
pnpm test -- tests/ai-chat-streaming-runtime-policy.test.cjs
pnpm typecheck
```

Expected: pass.

## 11. Task 9: Final Verification

**Files:**

- No new files unless tests reveal a missing policy.

- [ ] **Step 1: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected:

```txt
no TypeScript errors
```

- [ ] **Step 2: Run all tests**

Run:

```powershell
pnpm test
```

Expected:

```txt
all tests pass
```

- [ ] **Step 3: Run whitespace check**

Run:

```powershell
git diff --check
```

Expected: no output.

- [ ] **Step 4: Code review checklist**

Review `src/screens/AiChatScreen.tsx` and confirm:

- `MESSAGE_SCROLL_BUTTON_THRESHOLD` is still `4800`.
- `scrollToLatestMessage` still uses `scrollToOffset({ animated, offset: 0 })`.
- There is no `scrollToEnd`.
- `handleMessageScroll` does not flush buffered final content.
- Detached branch in `applyOrBufferStreamingMessagePatch` updates the tail model.
- Hidden detached updates do not call `publishStreamingMessage`.
- `streamTailSpacer` and `streamTailBlock` are real `FlatList` data items.
- The spacer component is not absolutely positioned.
- Tail measurement uses `onLayout`.
- Reserved height is monotonic.

- [ ] **Step 5: Stop before git or release actions**

Do not run any of these commands:

```powershell
git commit
git push
git tag
npx eas-cli update
eas update
gradlew assembleRelease
scripts/deploy-docs-mist01.ps1
```

Expected final handoff: report changed files, verification results, and remaining risks to the user. Wait for user inspection and explicit approval before any commit, push, hot update, packaging, or deployment.

## 12. Common Failure Patterns To Reject

Reject the implementation if any of these appear:

- It adds `position: 'absolute'` tail content to fake scroll height.
- It keeps `revealTextByRatio` and merely renames it.
- It maps `contentOffset.y` directly to substring length.
- It applies the completed full patch to `messages` while detached.
- It calls `scrollToOffset` inside `onScroll` to fight the user's gesture.
- It changes the latest button threshold below `4800`.
- It parses full Markdown on every streaming token.
- It introduces a global final-height estimate for the assistant response.
- It removes `AiStreamingMessageStore` live rendering and routes every token through `setMessages`.

## 13. Handoff Prompt For Another AI

Use this prompt when delegating:

```txt
You are implementing Pixory's AI chat measured streaming tail occupancy. Read these files first:
- docs/ai-chat-streaming-research/streaming-tail-occupancy-spec.md
- docs/ai-chat-streaming-research/implementation-plan.md
- src/screens/AiChatScreen.tsx
- src/ai/aiStreamingRuntime.ts
- src/ai/aiStreamingMessageStore.ts
- src/components/ai/AiStreamingMessageText.tsx
- src/components/ai/AiMessageBubble.tsx
- src/components/ai/AiMessageContent.tsx

Follow implementation-plan.md task by task. Do not skip tests. Do not replace the plan with a simpler ratio reveal or overlay implementation. The required design is: live streaming store when bottom-locked, graceful detach when user scrolls away, real FlatList tail spacer, block-level tail model, monotonic height reservation, onLayout measurement, and block promotion while scrolling back.

Important permissions:
- Do not create a git commit.
- Do not push to any remote.
- Do not create tags or pull requests.
- Do not run EAS update, hot update, APK packaging, release build, or deployment scripts.
- Stop after local code changes and local verification. Report results and wait for user inspection/acceptance.

Acceptance commands:
- pnpm typecheck
- pnpm test
- git diff --check
```
