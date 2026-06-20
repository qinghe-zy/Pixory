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
