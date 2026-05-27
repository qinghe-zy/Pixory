const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('AI chat resolves the latest thread model instead of reusing message snapshots', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /type ResolvedThreadChatModel/);
  assert.match(service, /resolveThreadChatModel/);
  assert.match(service, /invalid_global_default/);
  assert.match(service, /invalid_thread_model/);
  assert.match(service, /thread\.providerId/);
  assert.match(service, /thread\.modelId/);
  assert.match(service, /regenerateAssistantMessage[\s\S]*findThreadById/);
  assert.match(service, /rewriteUserMessage[\s\S]*findThreadById/);
  assert.doesNotMatch(service, /const\s+modelId\s*=\s*message\.modelId/);
  assert.doesNotMatch(service, /const\s+providerId\s*=\s*message\.providerId/);
});

test('AI session settings exposes current session model and follow-global option', () => {
  const screen = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(screen, /当前会话模型/);
  assert.match(screen, /仅在当前会话生效/);
  assert.match(screen, /跟随全局默认/);
  assert.match(screen, /saveSessionModel\(null,\s*null\)/);
  assert.match(screen, /updateAiThreadSessionConfig/);
  assert.match(screen, /loadThreadSessionModelConfig/);
  assert.match(screen, /模型配置已失效|当前会话模型已失效/);
});

test('AI provider settings labels model selection as global default only', () => {
  const screen = read('src/screens/AiProviderSettingsScreen.tsx');

  assert.match(screen, /全局默认模型/);
  assert.match(screen, /新创建会话的默认选择/);
  assert.match(screen, /不会影响已有独立设置的会话/);
});

test('AI session model resolver documents invalid and partial-null cases', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /provider_default/);
  assert.match(service, /global_default/);
  assert.match(service, /thread_model/);
  assert.match(service, /if\s*\(thread\.providerId\)/);
  assert.match(service, /thread\.modelId\s*\?/);
  assert.match(service, /supportsChat/);
});

test('new AI chats follow global default unless a model is explicitly supplied', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /const shouldUseFixedModel = Boolean\(input\.providerId \|\| input\.modelId\)/);
  assert.match(service, /providerId: shouldUseFixedModel && provider \? provider\.id : null/);
  assert.match(service, /modelId: shouldUseFixedModel && model \? model\.modelId : null/);
  assert.match(service, /createNormalThreadFromRoleCard[\s\S]*providerId: null/);
  assert.match(service, /createNormalThreadFromRoleCard[\s\S]*modelId: null/);
  assert.doesNotMatch(service, /providerId: provider\?\.id \?\? null/);
  assert.doesNotMatch(service, /modelId: model\?\.modelId \?\? null/);
});

test('session model settings uses the same resolver as generation', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /loadThreadSessionModelConfig[\s\S]*resolveThreadChatModel\(space, thread\)/);
  assert.match(service, /loadThreadSessionModelConfig[\s\S]*resolvedModel\.status !== 'ready'/);
  assert.match(service, /loadThreadSessionModelConfig[\s\S]*currentStatus[\s\S]*'invalid'/);
});
