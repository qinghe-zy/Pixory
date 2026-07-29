const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('latency spec has closed decisions and phase gates for long-running implementation', () => {
  const spec = read('docs/superpowers/specs/2026-06-19-ai-chat-latency-and-streaming-performance-design.md');

  assert.match(spec, /Reviewed implementation spec, ready for detailed implementation planning/);
  assert.match(spec, /## Execution Guardrails/);
  assert.match(spec, /## Default Decisions/);
  assert.match(spec, /## Phase Gates/);
  assert.match(spec, /## Resolved Decisions/);
  assert.doesNotMatch(spec, /## Open Questions/);
  assert.doesNotMatch(spec, /TBD|TODO|where test infrastructure allows/);
});

test('implementation keeps forbidden scope out of the codebase', () => {
  const files = [
    'src/ai/aiChatService.ts',
    'src/ai/aiPromptCache.ts',
    'src/ai/promptBuilder.ts',
  ].map(read).join('\n');

  assert.doesNotMatch(files, /semanticAnswerCache|semanticReplyCache|answerCache/i);
  assert.doesNotMatch(files, /redis|qdrant|milvus|serverGateway/i);
});

test('streaming output modernization acceptance contract is implemented', () => {
  const runtime = read('src/ai/aiStreamingRuntime.ts');
  const service = read('src/ai/aiChatService.ts');
  const screen = read('src/screens/AiChatScreen.tsx');
  const store = read('src/ai/aiStreamingMessageStore.ts');
  const button = read('src/components/ai/AiScrollToLatestButton.tsx');

  assert.match(runtime, /canPublishStreamingPatch/);
  assert.match(runtime, /targetStreamingDisplayStep/);
  assert.doesNotMatch(runtime, /!input\.bottomLocked[\s\S]{0,120}return 0/);
  assert.match(service, /schedulePersistStreamingSnapshot/);
  assert.match(service, /waitForScheduledPersistStreamingSnapshot/);
  assert.match(service, /await waitForScheduledPersistStreamingSnapshot\(\);\s*flushStreamingTextChunks\(\);\s*(?:mergeStreamingPerformanceSnapshot\(\);\s*)?await persistStreamingSnapshot\(true\)/);
  assert.doesNotMatch(service, /await persistStreamingSnapshot\(\);\s*\n/);
  assert.match(screen, /shouldPublishLiveStreamingPatch/);
  assert.match(screen, /bottomLocked.*auto-scroll/i);
  assert.match(screen, /publishStreamingMessage/);
  assert.match(screen, /pendingFinalReloadRef/);
  assert.match(store, /useSyncExternalStore/);
  assert.doesNotMatch(button, /AI 正在回复/);
  assert.match(button, /generating: boolean/);
  assert.match(button, /accessibilityLabel=\{generating \? 'AI 正在生成，回到最新' : '回到最新'\}/);
  assert.match(button, /useReducedMotion/);
  assert.match(button, /withRepeat/);
  assert.match(button, /Math\.sin/);
  assert.match(button, /metrics\.scrollToLatestVisualSize/);
  assert.match(button, /metrics\.minTouchSize/);
  assert.match(button, /right: spacing\[4\]/);
  assert.match(button, /name="arrow-down"/);
  assert.doesNotMatch(button, /BlurView/);
  assert.doesNotMatch(button, />回到最新</);
});
