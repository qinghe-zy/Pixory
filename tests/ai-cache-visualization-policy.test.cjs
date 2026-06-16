const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI usage overview loads only scoped assistant observations', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiChatService.ts');

  assert.match(repository, /listAssistantUsageObservationMessages/);
  assert.match(repository, /ai_threads\.space = \?/);
  assert.match(repository, /ai_messages\.role = 'assistant'/);
  assert.match(repository, /ai_messages\.promptSnapshotJson <> '\{\}'/);
  assert.match(service, /loadAiUsageOverview/);
  assert.match(service, /aggregateAiUsageObservations/);
});

test('thread AI usage overview checks thread belongs to current space', () => {
  const service = read('src/ai/aiChatService.ts');
  assert.match(service, /loadThreadAiUsageOverview/);
  assert.match(service, /thread\.space !== space/);
  assert.match(service, /return emptyAiUsageAggregate/);
});

test('AI usage visualization uses compact token bars without diagnostic fields', () => {
  const component = read('src/components/ai/AiUsageSummary.tsx');

  assert.match(component, /AiUsageSummary/);
  assert.match(component, /AiTokenStackBar/);
  assert.match(component, /总量|Total/);
  assert.match(component, /命中率|Hit Rate/);
  assert.doesNotMatch(component, /TTL|miss|stablePrefix|stableCore|hash|diagnostic|诊断|解释/);
  assert.doesNotMatch(component, /promptSnapshotJson|cacheObservation|rawUsage/);
});

test('AI workbench provider settings shows total usage overview', () => {
  const screen = read('src/screens/AiProviderSettingsScreen.tsx');
  assert.match(screen, /loadAiUsageOverview/);
  assert.match(screen, /AiUsageSummary/);
  assert.match(screen, /AI 用量|用量/);
  assert.doesNotMatch(screen, /TTL|stablePrefix|miss reason|诊断/);
});

test('AI session settings shows current thread usage overview', () => {
  const screen = read('src/screens/AiSessionConfigScreen.tsx');
  assert.match(screen, /loadThreadAiUsageOverview/);
  assert.match(screen, /AiUsageSummary/);
  assert.match(screen, /本会话用量/);
  assert.match(screen, /<AiUsageSummary\s+showRecent=\{false\}\s+usage=/);
  assert.doesNotMatch(screen, /TTL|stablePrefix|miss reason|诊断/);
});
