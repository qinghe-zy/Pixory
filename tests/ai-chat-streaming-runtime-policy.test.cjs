const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('streaming runtime defines adaptive UI and persist throttling tiers', () => {
  const runtime = read('src/ai/aiStreamingRuntime.ts');

  assert.match(runtime, /export type StreamingVisibilityState/);
  assert.match(runtime, /export const STREAMING_RECOVERABILITY_PERSIST_INTERVAL_MS = 500/);
  assert.match(runtime, /export const STREAMING_PRESSURE_DELAY_MS = 250/);
  assert.match(runtime, /export const STREAMING_PRESSURE_RECOVERY_MS = 120/);
  assert.match(runtime, /export const STREAMING_PRESSURE_WINDOWS_REQUIRED = 2/);
  assert.match(runtime, /export function targetStreamingFps/);
  assert.match(runtime, /export function canPublishStreamingPatch/);
  assert.match(runtime, /export function targetStreamingDisplayStep/);
  assert.match(runtime, /devicePressure\?: boolean/);
  assert.match(runtime, /if \(!input\.bottomLocked\) \{\s*return input\.devicePressure \? 8 : 12;\s*\}/);
  assert.match(runtime, /visibleChars <= 1000/);
  assert.match(runtime, /devicePressure \? 30 : 60/);
  assert.match(runtime, /visibleChars <= 4000/);
  assert.match(runtime, /devicePressure \? 24 : 45/);
  assert.match(runtime, /devicePressure \? 18 : 30/);
  assert.match(runtime, /backlogChars <= 24/);
  assert.match(runtime, /backlogChars <= 120/);
  assert.match(runtime, /backlogChars <= 600/);
  assert.match(runtime, /visibleChars > 4000/);
  assert.match(runtime, /return 0/);
  assert.doesNotMatch(runtime, /if \(!input\.bottomLocked \|\| input\.appActive === false \|\| input\.routeFocused === false\) \{\s*return 0;\s*\}/);
  assert.match(runtime, /export function targetPersistIntervalMs/);
  assert.match(runtime, /STREAMING_PRESSURE_PERSIST_INTERVAL_MS = 1000/);
  assert.match(runtime, /targetPersistIntervalMs\(devicePressure = false\)/);
  assert.match(runtime, /devicePressure \? STREAMING_PRESSURE_PERSIST_INTERVAL_MS/);
  assert.match(runtime, /export function shouldForceStreamingFlush/);
  assert.match(runtime, /export function updateStreamingDevicePressure/);
  assert.match(runtime, /observedDelayMs > STREAMING_PRESSURE_DELAY_MS/);
  assert.match(runtime, /observedDelayMs < STREAMING_PRESSURE_RECOVERY_MS/);
});

test('streaming diagnostics records content-free ingress, backlog, UI, persistence, and detached timing', () => {
  const metrics = read('src/ai/aiGenerationMetrics.ts');
  const diagnostics = read('src/ai/aiStreamingPerformanceDiagnostics.ts');
  const service = read('src/ai/aiChatService.ts');

  for (const field of [
    'providerAnswerChars',
    'providerReasoningChars',
    'maxUiBacklogChars',
    'maxUiBacklogAgeMs',
    'providerEventHandlerTotalMs',
    'partialPersistTotalMs',
    'detachedTailMergeTotalMs',
  ]) {
    assert.match(metrics, new RegExp(field));
  }
  assert.match(diagnostics, /recordStreamingUiCommit/);
  assert.match(diagnostics, /recordDetachedTailMerge/);
  assert.match(service, /recordStreamingProviderDelta/);
  assert.match(service, /recordStreamingPersistence/);
});

test('streaming message store exposes a generation-scoped external subscription API', () => {
  const store = read('src/ai/aiStreamingMessageStore.ts');
  const component = read('src/components/ai/AiStreamingMessageText.tsx');

  assert.match(store, /export type AiStreamingMessageIdentity/);
  assert.match(store, /generationId: string/);
  assert.match(store, /export function publishStreamingMessage/);
  assert.match(store, /export function clearStreamingMessage/);
  assert.match(store, /export function subscribeStreamingMessage/);
  assert.match(store, /export function useStreamingMessageSnapshot/);
  assert.match(store, /export function useStreamingMessageTextSnapshot/);
  assert.match(store, /export function useStreamingMessageReasoningSnapshot/);
  assert.match(store, /contentListeners/);
  assert.match(store, /reasoningListeners/);
  assert.match(store, /contentChanged/);
  assert.match(store, /reasoningChanged/);
  assert.match(store, /statusChanged/);
  assert.match(store, /if \(!contentChanged && !reasoningChanged && !statusChanged && !hasSnapshotChanged\) \{/);
  assert.match(store, /useSyncExternalStore/);
  assert.match(store, /hasSnapshot: false/);
  assert.match(store, /hasSnapshot: true/);
  assert.match(component, /useStreamingMessageTextSnapshot/);
  assert.match(component, /useStreamingMessageReasoningSnapshot/);
  assert.match(component, /snapshot\.hasSnapshot \? snapshot\.content : initialContent/);
  assert.doesNotMatch(component, /snapshot\.content \|\| initialContent/);
  assert.match(component, /<Text selectable=\{false\}/);
  assert.doesNotMatch(component, /<Text selectable style/);
  assert.match(component, /InlineStreamingCursor/);
  assert.match(component, /export const AiStreamingReasoningText/);
  assert.match(component, /snapshot\.hasSnapshot \? snapshot\.reasoningText : initialReasoningText/);
  assert.match(component, /snapshot\.hasSnapshot \? snapshot\.status : status/);
  assert.match(component, /<AiThinkingBlock/);
});

test('provider readers dispatch deltas without awaiting UI or persistence work', () => {
  for (const file of [
    'src/ai/providers/openAiCompatibleProvider.ts',
    'src/ai/providers/geminiProvider.ts',
    'src/ai/providers/claudeProvider.ts',
  ]) {
    const provider = read(file);
    assert.doesNotMatch(provider, /await onEvent\(event\)/);
    assert.doesNotMatch(provider, /await onEvent\(\{ type: 'answer_delta'/);
  }
  const service = read('src/ai/aiChatService.ts');
  assert.match(service, /recordStreamingProviderDelta/);
  assert.match(service, /schedulePersistStreamingSnapshot/);
});

test('ordinary streaming accumulates provider chunks until display or persistence flushes', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /const pendingAnswerChunks: string\[\] = \[\];/);
  assert.match(service, /const pendingReasoningChunks: string\[\] = \[\];/);
  assert.match(service, /function flushStreamingTextChunks\(\)/);
  assert.match(service, /pendingAnswerChunks\.push\(event\.text\)/);
  assert.match(service, /pendingReasoningChunks\.push\(event\.text\)/);
  assert.match(service, /if \(!force && now - lastUiPatchAt < effectivePatchIntervalMs\)/);
  assert.match(service, /flushStreamingTextChunks\(\);/);
});

test('stream scheduler drains queued chunks even when no later provider delta arrives', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /let pendingUiPatchTimer: ReturnType<typeof setTimeout> \| null = null;/);
  assert.match(service, /const scheduleStreamingPatch = \(\) =>/);
  assert.match(service, /pendingUiPatchTimer = setTimeout\(\(\) => \{[\s\S]{0,160}emitStreamingPatch\(true\)/);
  assert.match(service, /scheduleStreamingPatch\(\);\s*generationMetrics\.counters\.streamMergedDeltaCount/);
});

test('streaming patches and created callbacks carry generationId for stale patch rejection', () => {
  const service = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');
  const screen = read('src/screens/AiChatScreen.tsx');

  assert.match(service, /onCreated\?: \(ids: AiGenerationCreatedInfo\) => void/);
  assert.match(service, /export interface AiStreamingMessagePatch \{[\s\S]*generationId: string/);
  assert.match(service, /const generationId = generationMetrics\.context\.generationId/);
  assert.match(service, /generationId,/);
  assert.match(manager, /generationId: string/);
  assert.match(manager, /onCreated: \(ids\) => emitCreated\(task, ids\)/);
  assert.match(manager, /subscriber\.onCreated\?\.\(\{\s*assistantMessageId: task\.assistantMessageId,\s*generationId: task\.generationId,[\s\S]*thinkingExpected: task\.thinkingExpected \?\? undefined,[\s\S]*userMessageId: task\.userMessageId \?\? '',/);
  assert.match(screen, /type ActiveStreamingIdentity/);
  assert.match(screen, /activeStreamingIdentityRef/);
  assert.match(screen, /function isCurrentStreamingPatch/);
  assert.match(screen, /patch\.generationId !== activeStreamingIdentityRef\.current\.generationId/);
});

test('generation diagnostics use stable failure codes without retaining provider text', () => {
  const metrics = read('src/ai/aiGenerationMetrics.ts');

  const failureBody = /export function toGenerationFailureCode[\s\S]*?\r?\n}/.exec(metrics)?.[0] ?? '';
  assert.match(failureBody, /knownCode/);
  assert.match(failureBody, /generation_failed/);
  assert.doesNotMatch(failureBody, /replace\(\/\[\^a-z0-9/);
  assert.doesNotMatch(failureBody, /slice\(0, 80\)/);
});

test('active streaming updates publish live text without replacing the full message array on each tick', () => {
  const screen = read('src/screens/AiChatScreen.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');

  const bufferBody = /const applyOrBufferStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[[^\]]*\]\);/.exec(screen)?.[0] ?? '';
  const settledBody = /onSettled: \(\) => \{[\s\S]*?\r?\n      \},\r?\n      onUpdated/.exec(screen)?.[0] ?? '';

  assert.match(screen, /publishStreamingMessage/);
  assert.match(screen, /clearStreamingMessage/);
  assert.match(screen, /const shouldUseLiveStreamingPatch/);
  assert.match(screen, /pendingFinalStreamingIdentityRef/);
  assert.match(screen, /function clearStreamingIdentity/);
  assert.match(screen, /function beginStreamingRequest[\s\S]*resetStreamingReadBufferState\(\);[\s\S]*clearActiveStreamingIdentity\(\);[\s\S]*activeStreamGenerationRef\.current \+= 1/);
  assert.match(bufferBody, /publishStreamingMessage\(/);
  assert.match(bufferBody, /return;/);
  assert.doesNotMatch(bufferBody, /applyStreamingMessagePatch\(patch\);\s*return;\s*\}/);
  assert.match(settledBody, /await reloadMessages\(targetThreadId\)/);
  assert.match(settledBody, /await reloadMemoryCaptures\(targetThreadId\)/);
  assert.match(settledBody, /clearActiveStreamingIdentity\(\)/);
  assert.doesNotMatch(settledBody, /clearActiveStreamingIdentity\(\);[\s\S]{0,120}await reloadMessages\(targetThreadId\)/);
  assert.match(bubble, /streamingIdentity\?: AiStreamingMessageIdentity \| null/);
  assert.match(bubble, /<AiStreamingMessageText identity=\{streamingIdentity\} initialContent=\{message\.content\} \/>/);
  assert.match(bubble, /<AiStreamingReasoningText/);
  assert.match(bubble, /identity=\{streamingIdentity\}/);
  assert.match(bubble, /initialReasoningText=\{message\.reasoningText\}/);
});

test('service no longer uses fixed high-frequency streaming persistence', () => {
  const service = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');
  const screen = read('src/screens/AiChatScreen.tsx');

  assert.doesNotMatch(service, /const STREAMING_PERSIST_INTERVAL_MS = 120/);
  assert.doesNotMatch(service, /const STREAMING_UI_PATCH_INTERVAL_MS = 80/);
  assert.match(service, /targetStreamingFps/);
  assert.match(service, /targetStreamingDisplayStep/);
  assert.match(service, /targetPersistIntervalMs/);
  assert.match(service, /targetPersistIntervalMs\(generationMetrics\.context\.devicePressureThrottled\)/);
  assert.match(service, /schedulePersistStreamingSnapshot/);
  assert.doesNotMatch(service, /await persistStreamingSnapshot\(\);\s*\n/);
  assert.match(service, /STREAMING_RECOVERABILITY_PERSIST_INTERVAL_MS/);
  assert.match(service, /STREAMING_PRESSURE_RECOVERY_MS/);
  assert.match(service, /updateStreamingDevicePressure/);
  assert.match(service, /sampleStreamingDevicePressure/);
  assert.match(service, /observedDelayMs: now - pressureProbeExpectedAt/);
  assert.match(service, /lastUiPatchAnswerChars/);
  assert.match(service, /lastUiPatchReasoningChars/);
  assert.match(service, /lastPersistedAnswerChars/);
  assert.match(service, /lastPersistedReasoningChars/);
  assert.match(service, /answerChars === lastUiPatchAnswerChars && reasoningChars === lastUiPatchReasoningChars/);
  assert.match(service, /answerChars === lastPersistedAnswerChars && reasoningChars === lastPersistedReasoningChars/);
  assert.doesNotMatch(service, /const visibleText = answerText \+ '\\n' \+ reasoningText/);
  assert.match(service, /generationMetrics\.context\.devicePressureThrottled = pressure\.devicePressureThrottled/);
  assert.match(service, /devicePressure: generationMetrics\.context\.devicePressureThrottled/);
  assert.match(service, /finally \{\s*pressureProbeActive = false;[\s\S]{0,220}clearProviderTimeout\(\);[\s\S]{0,20}\}/);
  assert.match(service, /answerText\.length \+ reasoningText\.length > 0/);
  assert.doesNotMatch(service, /!generationMetrics\.timestamps\.firstUiPatchAt && answerText\.length > 0/);
  assert.match(service, /streamMergedDeltaCount = Math\.max/);
  assert.match(service, /getStreamingVisibility/);
  assert.match(manager, /getTaskStreamingVisibility/);
  assert.match(screen, /getStreamingVisibility: \(\) => getActiveStreamingVisibility\(targetThreadId, generation\)/);
  assert.match(screen, /function getActiveStreamingVisibility/);
  assert.match(screen, /routeFocused = screenMountedRef\.current && appActiveRef\.current && isCurrentStream\(targetThreadId, generation\)/);
  assert.match(screen, /bottomLocked: bottomLockedRef\.current/);
  assert.match(screen, /AppState\.addEventListener\('change'/);
  assert.doesNotMatch(service, /targetStreamingPatchIntervalMs\(\{\s*bottomLocked: true/);
});

test('streaming patches decouple live text publication from bottom attachment', () => {
  const screen = read('src/screens/AiChatScreen.tsx');
  const bufferBody = /const applyOrBufferStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[[^\]]*\]\);/.exec(screen)?.[0] ?? '';

  assert.match(screen, /function shouldPublishLiveStreamingPatch/);
  assert.match(screen, /shouldPublishLiveStreamingPatch\(targetThreadId, generation, patch\)/);
  assert.match(screen, /bottomLocked.*auto-scroll/i);
  assert.match(bufferBody, /publishStreamingMessage/);
  assert.match(bufferBody, /const canPublishLive/);
  assert.match(bufferBody, /const canAttachLiveLayout = bottomLockedRef\.current && !hasPendingStreamingReadBuffer\(\)/);
  assert.match(bufferBody, /canAttachLiveLayout && canPublishLive && streamingIdentity/);
  assert.doesNotMatch(bufferBody, /if \(bottomLockedRef\.current && !hasPendingStreamingReadBuffer\(\)\) \{\s*const streamingIdentity/);
  assert.doesNotMatch(bufferBody, /else \{[\s\S]*publishStreamingMessage/);
  const detachedBody = /bottomLockedRef\.current = false;[\s\S]*?syncScrollToLatestVisibility\(\);/.exec(bufferBody)?.[0] ?? '';
  assert.doesNotMatch(detachedBody, /scrollToOffset/);
  assert.doesNotMatch(detachedBody, /followLatestMessage/);
});

test('service guards durable streaming writes by generationId', () => {
  const service = read('src/ai/aiChatService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(service, /function buildGenerationGuardSnapshotJson/);
  assert.match(service, /async function updateAssistantMessageForGeneration/);
  assert.match(service, /isAssistantMessageCurrentGeneration/);
  assert.match(service, /function generationSnapshotNeedle/);
  assert.match(service, /updateMessageWherePromptSnapshotJsonContains/);
  assert.match(service, /options\?: \{ syncFts\?: boolean \}/);
  assert.match(service, /\{ syncFts: false \}/);
  assert.match(repository, /updateMessageWherePromptSnapshotJsonContains/);
  assert.match(repository, /options\?: \{ syncFts\?: boolean \}/);
  assert.match(repository, /options\?\.syncFts !== false/);
  assert.match(repository, /WHERE id = \? AND instr\(promptSnapshotJson, \?\) > 0/);
  assert.match(service, /const resetMessage = await updateAssistantMessageForGeneration/);
  assert.match(service, /if \(!resetMessage\) \{\s*return;\s*\}/);
  assert.match(service, /let finalMessagePersisted = false/);
  assert.match(service, /finalMessagePersisted = Boolean\(current\)/);
  assert.match(service, /if \(!finalMessagePersisted\) \{\s*return;\s*\}/);
  assert.match(service, /generationId/);
  assert.match(service, /function stoppedGenerationKey/);
  assert.match(service, /stoppedMessageIds\.delete\(stoppedGenerationKey\(/);
  assert.match(service, /stoppedMessageIds\.has\(stoppedGenerationKey\(/);
  assert.doesNotMatch(service, /stoppedMessageIds\.has\(input\.assistantMessageId\)/);
});

test('user stop records user_stopped before abort fallback can settle metrics', () => {
  const service = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');

  const stopForAbortBody = /const currentStopReason = \(\) =>[\s\S]*?const stopForAbort = async[\s\S]*?return true;\s*\n  }/.exec(service)?.[0] ?? '';
  const stopGenerationBody = /async function stopGeneration[\s\S]*?\r?\n}/.exec(manager)?.[0] ?? '';

  assert.match(stopForAbortBody, /currentStopReason/);
  assert.match(stopForAbortBody, /user_stopped/);
  assert.match(service, /stoppedMessageIds\.has\(key\)/);
  assert.match(stopForAbortBody, /generationMetrics\.context\.stopReason = stopReason/);
  assert.match(stopForAbortBody, /options\?\.buildPromptSnapshotJson\?\.\(\)/);
  assert.match(service, /buildPromptSnapshotJson: \(\) => createPromptSnapshotJson\(\{ stopReason: currentStopReason\(\) \}\)/);
  assert.match(service, /buildPromptSnapshotJson: \(\) => buildMetricsOnlyPromptSnapshotJson\(\{ generationMetrics, messageDisplayKind, stopReason: currentStopReason\(\) \}\)/);
  assert.doesNotMatch(service, /stopForAbort\(\{ promptSnapshotJson:/);
  assert.match(stopGenerationBody, /await stopStreamingMessage\(\{ assistantMessageId: stoppedAssistantId, reason, space \}\);[\s\S]*task\?\.controller\.abort\(\)/);
});

test('streaming idle timeout finalizes as failure instead of user stopped', () => {
  const service = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');

  assert.match(service, /timeout_failed/);
  assert.match(service, /stoppedTimeoutGenerationIds/);
  assert.match(service, /markAssistantFailed\([\s\S]*timeout_failed/);
  assert.match(service, /生成已中断/);
  assert.match(manager, /stopGeneration\(\{ assistantMessageId, reason = 'user', space, threadId \}/);
  assert.match(manager, /reason: 'timeout'/);
  assert.match(manager, /stopStreamingMessage\(\{ assistantMessageId: stoppedAssistantId, reason, space \}/);
  const streamAssistantCalls = service.match(/await streamAssistantReply\(\{[\s\S]*?\n  \}\);/g) ?? [];
  assert.equal(streamAssistantCalls.length, 6);
  for (const call of streamAssistantCalls) {
    assert.match(call, /onTimeout: input\.onTimeout/);
  }
});

test('screen forces a recoverability flush when app backgrounds during streaming', () => {
  const screen = read('src/screens/AiChatScreen.tsx');

  assert.match(screen, /flushActiveStreamingSnapshot/);
  assert.match(screen, /AppState\.addEventListener\('change', \(state\) => \{/);
  assert.match(screen, /if \(state !== 'active'\) \{/);
  assert.match(screen, /void flushActiveStreamingSnapshot\(\)/);
  assert.match(screen, /return \(\) => \{[\s\S]*void flushActiveStreamingSnapshot\(\)/);
  assert.match(screen, /function abortActiveStreamingRequest\(\) \{[\s\S]*void flushActiveStreamingSnapshot\(\)/);
});
