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
  assert.match(splitter, /SOFT_SEGMENT_TARGET_CHARS/);
  assert.match(splitter, /function splitSoftStreamSegments/);
  assert.match(splitter, /type === 'paragraph' \|\| type === 'plain' \|\| type === 'thinking'/);
  assert.match(splitter, /startOffset: input\.startOffset \+ cursor/);
});

test('streaming height cache keys include layout and renderer invalidation inputs', () => {
  const cache = read('src/ai/aiStreamingHeightCache.ts');
  assert.match(cache, /export type AiStreamBlockHeightEntry/);
  assert.match(cache, /widthBucket/);
  assert.match(cache, /fontScaleBucket/);
  assert.match(cache, /rendererVersion/);
  assert.match(cache, /blockType/);
  assert.match(cache, /export function createStreamBlockHeightCacheKey/);
});

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

test('streaming tail UI uses real list spacer and measured block components', () => {
  const spacer = read('src/components/ai/AiStreamingTailSpacer.tsx');
  const block = read('src/components/ai/AiMeasuredStreamBlock.tsx');
  assert.match(spacer, /export (const|function) AiStreamingTailSpacer/);
  assert.match(spacer, /height:\s*Math\.max\(0, height\)/);
  assert.match(block, /export (const|function) AiMeasuredStreamBlock/);
  assert.match(block, /onLayout/);
  assert.match(block, /onMeasured\(block\.blockId/);
  assert.match(block, /AiMessageContent/);
});


test('reasoning tail blocks use independent lane and frozen boundaries', () => {
  const model = read('src/ai/aiStreamingTailModel.ts');
  const splitter = read('src/ai/aiStreamingBlockSplitter.ts');
  const cache = read('src/ai/aiStreamingHeightCache.ts');
  const block = read('src/components/ai/AiMeasuredStreamBlock.tsx');

  assert.match(splitter, /lane:\s*'reasoning'\s*\|\s*'content'/);
  assert.match(splitter, /type\s*=\s*input\.lane\s*===\s*'reasoning'\s*\?\s*'thinking'\s*:\s*inferBlockType\(raw\)/);
  assert.match(cache, /lane:\s*'reasoning'\s*\|\s*'content'/);
  assert.match(cache, /input\.lane/);

  assert.match(model, /frozenReasoningText/);
  assert.match(model, /tailReasoningText/);
  assert.match(model, /const frozenReasoningText = chooseGracefulDetachText/);
  assert.match(model, /lane:\s*'reasoning'/);
  assert.match(model, /lane:\s*'content'/);
  assert.match(model, /\[\.\.\.reasoningBlocks,\s*\.\.\.contentBlocks\]/);

  assert.match(block, /block\.lane\s*===\s*'reasoning'/);
  assert.match(block, /styles\.thinkingText/);
});

test('reasoning tail integrates with visible message state and thinking expanded toggle', () => {
  const screen = read('src/screens/AiChatScreen.tsx');
  assert.match(screen, /reasoningText:\s*tailState\.frozenReasoningText/);
  assert.match(screen, /targetReasoningText:/);
  assert.match(screen, /calculateEffectiveTotalReservedHeight\(\s*tailState,\s*activeLanes/s);
  assert.match(screen, /activeLanes\.includes\(block\.lane\)/);
  assert.match(screen, /maxTailReservedHeightRef\.current/);
  assert.match(screen, /thinkingExpandedByMessageIdRef\.current\.set/);
  assert.match(screen, /forceRender\?: boolean/);
  assert.match(screen, /options\?\.forceRender/);
  assert.match(screen, /recomputeVisibleStreamingTailForCurrentScroll\(\{\s*forceRender:/);
  assert.match(screen, /streamingTailStateRef\.current\.messageId === messageId/);
  assert.match(screen, /const streamingRendererActive = Boolean\(streamingIdentity\) && generating && message\.id === activeAssistantId && !streamingReadModeActive/);
  assert.doesNotMatch(screen, /tailState\.totalReservedHeight/);
});

test('AI chat screen rejects ratio reveal and uses real FlatList tail items', () => {
  const screen = read('src/screens/AiChatScreen.tsx');
  assert.match(screen, /type:\s*"streamTailSpacer"/);
  assert.match(screen, /type:\s*"streamTailBlock"/);
  assert.match(screen, /AiStreamingTailSpacer/);
  assert.match(screen, /AiMeasuredStreamBlock/);
  assert.match(screen, /mergeStreamingTailPatch/);
  assert.match(screen, /promoteStreamingTailBlocks/);
  assert.match(screen, /resetStreamingTailOccupancy/);
  assert.match(screen, /getMessageItemIdAtIndex/);
  assert.match(screen, /MESSAGE_SCROLL_BUTTON_THRESHOLD = 4800/);
  assert.doesNotMatch(screen, /revealedStreamingRatioRef/);
  assert.doesNotMatch(screen, /revealTextByRatio/);
  assert.doesNotMatch(screen, /revealBufferedStreamingStateForScroll/);
  assert.doesNotMatch(screen, /buildScrollRevealedStreamingPatch/);
  assert.doesNotMatch(screen, /if \(false\)[\s\S]{0,120}@ts-ignore/);
});

test('detached streaming path updates the measured tail model only', () => {
  const screen = read('src/screens/AiChatScreen.tsx');
  const bufferBody = /const applyOrBufferStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[[^\]]*\]\);/.exec(screen)?.[0] ?? '';
  const detachedBody = /bottomLockedRef\.current = false;[\s\S]*?syncScrollToLatestVisibility\(\);/.exec(bufferBody)?.[0] ?? '';
  assert.match(detachedBody, /freezeVisibleStreamingMessage\(patch\.id\)/);
  assert.match(screen, /getStreamingMessageSnapshot\(streamingIdentity\)/);
  assert.match(screen, /content: streamingSnapshot\.content/);
  assert.match(screen, /reasoningText: streamingSnapshot\.reasoningText/);
  assert.match(detachedBody, /mergeBufferedStreamingPatch\(patch\)/);
  assert.match(detachedBody, /if \(patch\.generationId\)/);
  assert.match(detachedBody, /currentTailState\.messageId !== patch\.id/);
  assert.match(detachedBody, /currentTailState\.generationId !== patch\.generationId/);
  assert.match(detachedBody, /startStreamingTailDetach/);
  assert.match(detachedBody, /mergeStreamingTailPatch/);
  assert.doesNotMatch(detachedBody, /publishStreamingMessage/);
  assert.doesNotMatch(detachedBody, /applyStreamingMessagePatch\(patch\)/);
});

test('streaming bubble width uses a conservative assistant content width instead of a loose window ratio', () => {
  const screen = read('src/screens/AiChatScreen.tsx');
  assert.match(screen, /const listContentWidth = Math\.max\(\s*220,\s*screenWidth - layout\.pagePaddingHorizontal \* 2,/s);
  assert.match(screen, /const stackWidth = listContentWidth \* 0\.88/);
  assert.match(screen, /const bubbleContentWidth = stackWidth - spacing\[3\] \* 2/);
  assert.doesNotMatch(screen, /return Dimensions\.get\(['"]window['"]\)\.width \* 0\.9/);
});
