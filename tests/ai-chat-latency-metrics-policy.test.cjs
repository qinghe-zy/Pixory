const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('generation metrics module defines content-free phase timestamps and derived durations', () => {
  const source = read('src/ai/aiGenerationMetrics.ts');

  for (const field of [
    'sendPressedAt',
    'userMessagePersistStartAt',
    'userMessagePersistEndAt',
    'assistantPlaceholderPersistStartAt',
    'assistantPlaceholderPersistEndAt',
    'generationStartAt',
    'providerResolveStartAt',
    'providerResolveEndAt',
    'branchResolveStartAt',
    'branchResolveEndAt',
    'memoryResolveStartAt',
    'memoryResolveEndAt',
    'retrievalStartAt',
    'retrievalEndAt',
    'historyLoadStartAt',
    'historyLoadEndAt',
    'promptBuildStartAt',
    'promptBuildEndAt',
    'providerRequestSentAt',
    'firstProviderDeltaAt',
    'firstUiPatchAt',
    'lastProviderDeltaAt',
    'finalPersistStartAt',
    'finalPersistEndAt',
    'generationSettledAt',
  ]) {
    assert.match(source, new RegExp(field));
  }

  for (const duration of [
    'sendToProviderRequestMs',
    'providerRequestToFirstDeltaMs',
    'sendToFirstDeltaMs',
    'firstDeltaToFirstUiPatchMs',
    'sendToFirstVisibleTextMs',
    'promptPipelineMs',
    'retrievalMs',
    'memoryMs',
    'historyLoadMs',
    'finalizationMs',
    'totalGenerationMs',
  ]) {
    assert.match(source, new RegExp(duration));
  }

  assert.match(source, /export function createGenerationMetricsDraft/);
  assert.match(source, /export function markGenerationMetric/);
  assert.match(source, /export function finalizeGenerationMetrics/);
  assert.match(source, /export function redactGenerationMetricsForDiagnostics/);
});

test('generation metrics stay content-free and block prompt-like fields', () => {
  const source = read('src/ai/aiGenerationMetrics.ts');

  assert.match(source, /FORBIDDEN_GENERATION_METRIC_KEYS/);
  assert.match(source, /system/i);
  assert.match(source, /prompt/i);
  assert.match(source, /memory/i);
  assert.match(source, /retrieved/i);
  assert.match(source, /assistant/i);
  assert.match(source, /userMessage/i);
  assert.match(source, /assertContentFreeGenerationMetrics/);
  assert.doesNotMatch(source, /promptText:/);
  assert.doesNotMatch(source, /systemPrompt:/);
  assert.doesNotMatch(source, /retrievedText:/);
});

test('chat service stores metrics under promptSnapshotJson.generationMetrics', () => {
  const chat = read('src/ai/aiChatService.ts');
  const manager = read('src/ai/aiGenerationManager.ts');
  const screen = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /generationMetrics/);
  assert.match(chat, /createGenerationMetricsDraft/);
  assert.match(chat, /finalizeGenerationMetrics/);
  assert.match(chat, /redactGenerationMetricsForDiagnostics/);
  assert.match(chat, /promptSnapshotJson/);
  assert.match(chat, /sendPressedAt/);
  assert.match(manager, /sendPressedAt/);
  assert.match(screen, /sendPressedAt/);
});

test('prompt build records memory and retrieval subphase timings separately', () => {
  const chat = read('src/ai/aiChatService.ts');

  assert.match(chat, /memoryResolveStartAt/);
  assert.match(chat, /memoryResolveEndAt/);
  assert.match(chat, /retrievalStartAt/);
  assert.match(chat, /retrievalEndAt/);
  assert.match(chat, /generationMetrics/);
});

test('pre-provider pipeline failures persist failed assistant state with metrics', () => {
  const chat = read('src/ai/aiChatService.ts');

  assert.match(chat, /try\s*\{[\s\S]*providerResolveStartAt[\s\S]*buildProviderCachePolicy[\s\S]*\}\s*catch \(error\)/);
  assert.match(chat, /buildMetricsOnlyPromptSnapshotJson\(\{ failureReason: failureCode, generationMetrics \}\)/);
  assert.match(chat, /markAssistantFailed\([\s\S]*readableError[\s\S]*buildMetricsOnlyPromptSnapshotJson/);
  assert.match(chat, /return;\s*\}\s*\n\s*let providerUsageRaw/);
});

test('generation metric failure reasons are stable codes rather than raw provider text', () => {
  const metrics = read('src/ai/aiGenerationMetrics.ts');
  const chat = read('src/ai/aiChatService.ts');

  assert.match(metrics, /export function toGenerationFailureCode/);
  assert.match(metrics, /knownCode/);
  assert.match(metrics, /generation_failed/);
  assert.doesNotMatch(metrics, /replace\(\/\[\^a-z0-9_:-\]\+\/g/);
  assert.match(chat, /setGenerationFailureReason/);
  assert.doesNotMatch(chat, /context\.failureReason = readableError/);
});
