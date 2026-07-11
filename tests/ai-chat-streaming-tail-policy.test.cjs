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

test('streaming tail continuation group keys stay stable as more blocks are appended', () => {
  const helper = read('src/ai/aiStreamingTailContinuation.ts');

  assert.match(helper, /startOrdinal/);
  assert.match(helper, /endOrdinal/);
  assert.match(helper, /input\.startOrdinal/);
  assert.doesNotMatch(helper, /input\.endOrdinal,[\s\S]{0,80}\]\.join\(":"\)/);
});

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
  assert.match(model, /"reasoning"|"content"|lane/);
  assert.match(model, /\[\.\.\.reasoningBlocks,\s*\.\.\.contentBlocks\]/);

  assert.match(block, /block\.lane\s*===\s*'reasoning'/);
  assert.match(block, /styles\.thinkingText/);
});

test('reasoning tail integrates with visible message state and thinking expanded toggle', () => {
  const screen = read('src/screens/AiChatScreen.tsx');
  assert.match(screen, /selectVisibleMessage\(\{\s*message,\s*tailOverride,/s);
  assert.match(screen, /frozenReasoningText:\s*tailState\.frozenReasoningText/);
  assert.match(screen, /targetReasoningText:/);
  assert.match(screen, /calculateEffectiveTotalReservedHeight\(\s*tailState,\s*activeLanes/s);
  assert.match(screen, /groupPromotedStreamingTailBlocks\(\{\s*activeLanes,/);
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
  assert.match(screen, /type AiTailDebtSpacerItem/);
  assert.match(screen, /type AiTailMessageSegment/);
  assert.match(screen, /createTailDebtSpacer/);
  assert.match(screen, /buildTailMessageSegments/);
  assert.match(screen, /type:\s*"streamTailSpacer"/);
  assert.match(screen, /type:\s*"streamTailContinuation"/);
  assert.match(screen, /AiStreamingTailSpacer/);
  assert.match(screen, /AiStreamingTailContinuationBubble/);
  assert.match(screen, /groupPromotedStreamingTailBlocks/);
  assert.match(screen, /mergeStreamingTailPatch/);
  assert.match(screen, /promoteStreamingTailBlocks/);
  assert.match(screen, /resetStreamingTailOccupancy/);
  assert.match(screen, /getMessageItemIdAtIndex/);
  assert.match(screen, /MESSAGE_SCROLL_BUTTON_THRESHOLD = 2400/);
  assert.doesNotMatch(screen, /revealedStreamingRatioRef/);
  assert.doesNotMatch(screen, /revealTextByRatio/);
  assert.doesNotMatch(screen, /revealBufferedStreamingStateForScroll/);
  assert.doesNotMatch(screen, /buildScrollRevealedStreamingPatch/);
  assert.doesNotMatch(screen, /type:\s*"streamTailBlock"/);
  assert.doesNotMatch(screen, /if \(false\)[\s\S]{0,120}@ts-ignore/);
});

test('tail replay single-bubble path is guarded by a fail-safe remote JS flag', () => {
  const flags = read('src/ai/aiStreamingTailFeatureFlags.ts');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(flags, /singleBubbleTailReplayDefaultEnabled = true/);
  assert.match(flags, /aiTailReplaySingleBubbleEnabled/);
  assert.match(flags, /feature-flags\.json/);
  assert.match(flags, /Promise\.race/);
  assert.match(flags, /catch/);
  assert.match(flags, /return singleBubbleTailReplayDefaultEnabled/);
  assert.match(chat, /getAiTailReplaySingleBubbleEnabled/);
  assert.match(chat, /refreshAiTailReplaySingleBubbleEnabled/);
  assert.doesNotMatch(chat, /setSingleBubbleTailReplayEnabled/);
});

test('single-bubble tail replay uses message segments and keeps legacy continuation as a kill-switch fallback', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const contract = read('src/ai/aiStreamingTailRenderContract.ts');

  assert.match(chat, /singleBubbleTailReplayEnabled/);
  assert.match(chat, /buildTailMessageSegments/);
  assert.match(chat, /createTailDebtSpacer/);
  assert.match(chat, /getTailReplayItemKey/);
  assert.match(chat, /selectVisibleMessage/);
  assert.match(chat, /stitchTailSegmentEdgeAfterFrozenPrefix/);
  assert.match(chat, /tailDebtSpacer/);
  assert.match(chat, /messageSegment/);
  assert.match(chat, /AiStreamingTailMessageSegment/);
  assert.match(chat, /footer=\{/);
  assert.match(chat, /assistantBubbleEdge=\{/);
  assert.match(chat, /baseTailFooterVisible/);
  assert.doesNotMatch(chat, /hideFooterActions=\{\s*singleBubbleTailReplayEnabled[\s\S]{0,180}streamingTailStateRef\.current\.status !== "idle"\s*\}/);
  assert.match(bubble, /assistantBubbleEdge\?: AiTailSegmentEdge/);
  assert.match(bubble, /assistantBubbleOpenBottom/);
  assert.match(bubble, /assistantBubbleOpenTop/);
  assert.match(bubble, /const assistantTerminal =/);
  assert.match(bubble, /message\.status === 'completed'/);
  assert.match(bubble, /message\.status === 'failed'/);
  assert.match(bubble, /message\.status === 'stopped'/);
  assert.match(bubble, /const footerActionsVisible =\s*!hideFooterActions && \(isUser \|\| assistantTerminal\)/);
  assert.doesNotMatch(bubble, /position:\s*['"]absolute['"]/);
  assert.match(bubble, /hideCitations\?: boolean/);
  assert.match(bubble, /!isUser && !hideCitations/);
  assert.match(bubble, /<AiCitationList citations=\{message\.citations\}/);
  const segment = read('src/components/ai/AiStreamingTailMessageSegment.tsx');
  assert.match(segment, /aiLightColors\.card/);
  assert.match(segment, /marginTop:\s*-rhythm\.listCardGap/);
  assert.match(chat, /citations=\{/);
  assert.match(segment, /chrome\.drawsCitations/);
  assert.match(chat, /AiStreamingTailContinuationBubble/);
  assert.match(contract, /export function selectVisibleMessage/);
  assert.match(contract, /drawsCitations/);
  assert.doesNotMatch(chat, /const message = messagesById\.get\(item\.messageId\) \?\? null;/);
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
  assert.match(screen, /getLatestAssistantBubbleContentWidth\(\)/);
  assert.match(screen, /getAssistantBubbleContentWidthFallback\(\{/);
  assert.match(screen, /messageStackRatio:\s*0\.88/);
  assert.match(screen, /bubbleHorizontalPadding:\s*spacing\[3\]/);
  assert.doesNotMatch(screen, /return Dimensions\.get\(['"]window['"]\)\.width \* 0\.9/);
});

test('hardening adds a measured assistant bubble width registry and geometry fallback', () => {
  const registry = read('src/ai/aiStreamingBubbleWidthRegistry.ts');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const screen = read('src/screens/AiChatScreen.tsx');

  assert.match(registry, /setLatestAssistantBubbleContentWidth/);
  assert.match(registry, /getLatestAssistantBubbleContentWidth/);
  assert.match(registry, /getAssistantBubbleContentWidthFallback/);
  assert.match(registry, /messageStackRatio/);
  assert.match(registry, /bubbleHorizontalPadding/);
  assert.match(registry, /Math\.round\(.*\/ 8\) \* 8/s);
  assert.match(bubble, /setLatestAssistantBubbleContentWidth/);
  assert.match(bubble, /onLayout/);
  assert.match(bubble, /!isUser/);
  assert.match(screen, /getLatestAssistantBubbleContentWidth\(\)/);
  assert.match(screen, /getAssistantBubbleContentWidthFallback\(/);
  assert.doesNotMatch(screen, /Dimensions\.get\(['"]window['"]\)\.width \* 0\.9/);
});

test('hardening uses real font scale in both estimation and measurement cache paths', () => {
  const splitter = read('src/ai/aiStreamingBlockSplitter.ts');
  const block = read('src/components/ai/AiMeasuredStreamBlock.tsx');

  assert.match(splitter, /PixelRatio\.getFontScale\(\)/);
  assert.match(splitter, /const fontScale = input\.fontScale \?\? PixelRatio\.getFontScale\(\)/);
  assert.match(block, /PixelRatio\.getFontScale\(\)/);
  assert.match(block, /fontScaleBucket:\s*bucketFontScale\(PixelRatio\.getFontScale\(\)\)/);
});

test('hardening tail model tracks shrink debt and block-count prewarm without pixel reveal heuristics', () => {
  const model = read('src/ai/aiStreamingTailModel.ts');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(model, /debtPayoffEligible/);
  assert.match(model, /overReservedHeight/);
  assert.match(model, /pendingShrinkHeight/);
  assert.match(model, /shrinkStableSince/);
  assert.match(model, /export function settleStreamingTailShrinkDebt/);
  assert.match(model, /calculatePendingShrinkHeight/);
  assert.match(model, /block\.measuredHeight >= block\.reservedHeight/);
  assert.match(model, /pendingShrinkHeight/);
  assert.match(model, /overReservedHeight/);
  assert.match(model, /prewarm/);
  assert.match(model, /next complete block|allow one more block/i);
  assert.match(chat, /shouldPayoffDebt/);
  assert.match(chat, /debtPayoffEligible/);
  assert.doesNotMatch(model, /prewarm.*(?:px|pixel|threshold)/i);
});

test('hardening screen uses drag-aware lock semantics and requestAnimationFrame reconcile scheduling', () => {
  const screen = read('src/screens/AiChatScreen.tsx');

  assert.match(screen, /isUserDraggingRef/);
  assert.match(screen, /isNearBottomRef/);
  assert.match(screen, /escapedFromLockRef/);
  assert.match(screen, /lastUserScrollAtRef/);
  assert.match(screen, /const STICK_TO_BOTTOM_OFFSET_PX = 70/);
  assert.match(screen, /const USER_SCROLL_IDLE_TIMEOUT_MS = 150/);
  assert.match(screen, /const RETAIN_RECONCILE_WINDOW_MS = 350/);
  assert.match(screen, /const SHRINK_DEBOUNCE_MS = 150/);
  assert.match(screen, /const SHRINK_STABLE_DELAY_MS = 200/);
  assert.match(screen, /scheduleStreamingTailReconcile/);
  assert.match(screen, /requestAnimationFrame\(/);
  assert.match(screen, /onScrollBeginDrag/);
  assert.match(screen, /onMomentumScrollEnd/);
  assert.match(screen, /onScrollEndDrag/);
});

test('tail viewport policy defines hot-zone state and pre-promotion budget', () => {
  const policy = read('src/ai/aiStreamingTailViewportPolicy.ts');
  assert.match(policy, /hotZone:\s*'cold'\s*\|\s*'warming'\s*\|\s*'active'/);
  assert.match(policy, /export function deriveStreamingTailViewportPolicy/);
  assert.match(policy, /prePromotionHeight/);
  assert.match(policy, /targetDetachedFps/);
  assert.match(policy, /shouldRelaxClipping/);
  assert.match(policy, /shouldExpandRenderWindow/);
  assert.match(policy, /viewportHeight/);
  assert.match(policy, /totalReservedHeight/);
  assert.doesNotMatch(policy, /ratio|characterPercent|scrollPercent/);
});

test('tail continuation replay uses a dedicated assistant-style bubble shell', () => {
  const shell = read('src/components/ai/AiStreamingTailContinuationBubble.tsx');
  assert.match(shell, /export function AiStreamingTailContinuationBubble/);
  assert.match(shell, /group\.blocks\.map/);
  assert.match(shell, /AiMeasuredStreamBlock/);
  assert.match(shell, /assistant/i);
  assert.match(shell, /borderRadius|borderColor|backgroundColor/);
  assert.doesNotMatch(shell, /favorite|versionControl|citation/i);
});

test('replayed reasoning stays on the thinking surface instead of assistant body chrome', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const segment = read('src/components/ai/AiStreamingTailMessageSegment.tsx');
  const continuation = read('src/components/ai/AiStreamingTailContinuationBubble.tsx');
  const measured = read('src/components/ai/AiMeasuredStreamBlock.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  assert.match(segment, /const lane = blocks\[0\]\?\.lane \?\? ["']content["']/);
  assert.match(segment, /if \(lane === ["']reasoning["']\)/);
  assert.match(segment, /styles\.reasoningRow/);
  assert.match(segment, /insetMode=["']thinking["']/);
  assert.match(continuation, /group\.lane === ["']reasoning["']/);
  assert.match(continuation, /insetMode=["']thinking["']/);
  assert.match(measured, /insetMode\?: ["']bubble["'] \| ["']thinking["']/);
  assert.match(measured, /measurementSignatureRef/);
  assert.match(measured, /block\.raw/);
  assert.match(measured, /block\.finalized/);
  assert.match(
    chat,
    /segment\.blockRange\.lane === ["']content["'] &&\s*Boolean\(tailState\.frozenContent\.trim\(\)\)/,
  );
  assert.match(
    bubble,
    /const waitingForFirstToken =\s*generating && !message\.content\.trim\(\) && !thinkingActive/,
  );
});

test('AI chat screen promotes tail blocks with a pre-promotion horizon, not visible-only tail height', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /deriveStreamingTailViewportPolicy/);
  assert.match(chat, /prePromotionHeight/);
  assert.match(chat, /visibleTailHeight/);
  assert.match(
    chat,
    /visibleTailHeight\s*\+\s*tailViewportPolicy\.prePromotionHeight/,
  );
});

test('tail spacer represents only the remaining unpromoted tail height', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const model = read('src/ai/aiStreamingTailModel.ts');
  assert.match(model, /export function calculateRemainingStreamingTailHeight/);
  assert.match(chat, /hiddenTailHeight/);
  assert.match(chat, /promotedBlockIds/);
  assert.match(chat, /calculateRemainingStreamingTailHeight\(/);
  assert.doesNotMatch(
    chat,
    /hiddenTailHeight\s*=\s*calculateEffectiveTotalReservedHeight\(\s*tailState\s*,\s*activeLanes\s*\)\s*;/,
  );
});

test('inverted tail replay places promoted rows before spacer in visual reading order', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const tailInsertionBody =
    /const hiddenTailHeight = calculateRemainingStreamingTailHeight[\s\S]*?if \(hiddenTailHeight > 0\) \{[\s\S]*?\}/.exec(
      chat,
    )?.[0] ?? '';

  assert.match(tailInsertionBody, /promotedTailGroups/);
  assert.ok(
    tailInsertionBody.indexOf('nextInvertedMessageItems.unshift(promotedTailGroups[index])') <
      tailInsertionBody.indexOf('nextInvertedMessageItems.unshift({'),
  );
});

test('promoted tail groups render inside the dedicated continuation bubble shell', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /AiStreamingTailContinuationBubble/);
  assert.match(chat, /group=\{item\.group\}/);
  assert.doesNotMatch(chat, /AiStreamingTailBlockBubble/);
  assert.doesNotMatch(chat, /<AiStreamingTailBlockBubble>[\s\S]*<AiMeasuredStreamBlock/s);
});

test('streaming tail replay keeps block measurement separate from visual message shells', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const continuation = read('src/components/ai/AiStreamingTailContinuationBubble.tsx');
  const measured = read('src/components/ai/AiMeasuredStreamBlock.tsx');

  assert.match(chat, /type:\s*"streamTailContinuation"/);
  assert.match(chat, /type AiTailMessageSegment/);
  assert.match(chat, /block\.lane === item\.blockRange\.lane/);
  assert.doesNotMatch(chat, /type:\s*"streamTailBlock"/);
  assert.match(continuation, /group\.blocks\.map/);
  assert.match(continuation, /<AiMeasuredStreamBlock/);
  assert.match(measured, /onLayout/);
  assert.match(measured, /onMeasured\(block\.blockId,\s*height\)/);
});

test('promoted tail block rows measure actual content without visible reserved height', () => {
  const block = read('src/components/ai/AiMeasuredStreamBlock.tsx');

  assert.doesNotMatch(block, /minHeight:\s*block\.reservedHeight/);
  assert.match(block, /onLayout=\{\(event\) =>/);
  assert.match(block, /onMeasured\(block\.blockId,\s*height\)/);
  assert.match(block, /SUPPRESSED_MEASUREMENT_RECONCILE_DP/);
});

test('AI chat screen derives dynamic tail hot-zone list settings', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /shouldRelaxClipping/);
  assert.match(chat, /shouldExpandRenderWindow/);
  assert.match(chat, /removeClippedSubviews=/);
  assert.match(chat, /windowSize=/);
  assert.match(chat, /maxToRenderPerBatch=/);
  assert.match(chat, /updateCellsBatchingPeriod=/);
  assert.match(chat, /tailListUpdateCellsBatchingPeriod/);
});

test('tail hot-zone render window remains active for completed detached replay', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const listPolicyBody =
    /const tailReplayReadinessActive =[\s\S]*?const tailListUpdateCellsBatchingPeriod =[\s\S]*?;/m.exec(
      chat,
    )?.[0] ?? '';

  assert.match(listPolicyBody, /streamingTailStateRef\.current\.status !== "idle"/);
  assert.match(listPolicyBody, /tailViewportPolicy\.shouldExpandRenderWindow/);
  assert.doesNotMatch(listPolicyBody, /generating\s*&&/);
});

test('thinking expansion immediately recomputes active-lane tail replay', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  assert.match(chat, /thinking-expanded/);
  assert.match(chat, /forceRender:\s*true/);
  assert.match(chat, /activeLanes/);
});

test('hardening adds dev-only streaming tail performance instrumentation', () => {
  const perf = read('src/ai/aiStreamingPerfDebug.ts');
  const model = read('src/ai/aiStreamingTailModel.ts');
  const screen = read('src/screens/AiChatScreen.tsx');
  const measured = read('src/components/ai/AiMeasuredStreamBlock.tsx');

  assert.match(perf, /__DEV__/);
  assert.match(perf, /tailStateUpdateCount/);
  assert.match(perf, /measurementCount/);
  assert.match(perf, /promotionCount/);
  assert.match(perf, /reconcileCount/);
  assert.match(perf, /lockState/);
  assert.match(perf, /recordTailReplayBlockMounted/);
  assert.match(perf, /mountCount/);
  assert.match(perf, /throw new Error/);
  assert.match(perf, /recordTailReplayBlockPromoted/);
  assert.match(perf, /recordTailReplayBlockMeasured/);
  assert.match(perf, /recordTailReplayFirstTextVisible/);
  assert.match(perf, /recordTailReplayMeasurementDiff/);
  assert.match(perf, /promotedAt/);
  assert.match(perf, /mountedAt/);
  assert.match(perf, /measuredAt/);
  assert.match(perf, /firstTextVisibleAt/);
  assert.match(perf, /recordTailReplayNegativeDebt/);
  assert.match(perf, /recordTailReplayUnsafePayoff/);
  assert.match(model, /streamingTailPerfDebug/);
  assert.match(model, /recordTailReplayBlockPromoted/);
  assert.match(screen, /streamingTailPerfDebug/);
  assert.match(measured, /recordTailReplayBlockMounted/);
  assert.match(measured, /recordTailReplayFirstTextVisible/);
  assert.match(measured, /recordTailReplayBlockMeasured/);
  assert.match(measured, /recordTailReplayMeasurementDiff/);
});
