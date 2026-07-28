const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('internal chat performance profiles are defined without user-visible settings', () => {
  const mode = read('src/ai/aiChatPerformanceMode.ts');
  const chat = read('src/ai/aiChatService.ts');
  const screen = read('src/screens/AiChatScreen.tsx');

  for (const profile of ['balanced_companion', 'low_latency', 'long_companion', 'material_grounding']) {
    assert.match(mode, new RegExp(profile));
  }
  assert.match(chat, /resolveAiChatPerformanceProfile/);
  assert.match(chat, /chatPerformanceProfile/);
  assert.match(mode, /material_keyword_only' \|\| input\.fastPathClassification === 'material_full_retrieval'/);
  assert.match(mode, /return 'material_grounding'/);
  assert.doesNotMatch(screen, /low_latency|long_companion|material_grounding|balanced_companion/);
});

test('prompt layer order is fixed from stable prefix through current user message', () => {
  const promptBuilder = read('src/ai/promptBuilder.ts');

  for (const [fn, nextFn] of [
    ['buildNormalChatPrompt', 'buildMaterialBoundPrompt'],
    ['buildMaterialBoundPrompt', null],
  ]) {
    const start = promptBuilder.indexOf(`export function ${fn}`);
    const end = nextFn ? promptBuilder.indexOf(`export function ${nextFn}`) : promptBuilder.length;
    const body = start >= 0 && end > start ? promptBuilder.slice(start, end) : '';
    const order = [
      'stable_app_policy',
      'stable_role',
      'stable_material_rules',
      'stable_tool_definitions',
      'memory_snapshot',
      'history_window',
      'companion_runtime',
      'temporal_open_loops',
      'summary_bridge',
      'user_observation',
      'dynamic_memory',
      'retrieval_context',
      'current_user_message',
    ];
    let cursor = -1;
    for (const layer of order) {
      const next = body.indexOf(layer);
      assert.ok(next > cursor, `${fn} should place ${layer} after the previous layer`);
      cursor = next;
    }
  }
});

test('prompt layer semantics keep role instructions stable and current user message untrimmed', () => {
  const promptBuilder = read('src/ai/promptBuilder.ts');

  const normalBody = /export function buildNormalChatPrompt[\s\S]*?\r?\n}\r?\n\r?\nexport function buildMaterialBoundPrompt/.exec(promptBuilder)?.[0] ?? '';
  const materialBody = /export function buildMaterialBoundPrompt[\s\S]*?\r?\n}\r?\n/.exec(promptBuilder)?.[0] ?? '';
  const priorityBody = /function promptBlockPriority[\s\S]*?\r?\n}/.exec(promptBuilder)?.[0] ?? '';

  assert.match(normalBody, /block\('stable_role', frameRoleInstruction\(\[/);
  assert.match(normalBody, /baseRolePrompt = stripStructuredSillyTavernSections\(input\.systemPrompt, input\.roleCardContext\)/);
  assert.match(normalBody, /frameRoleInstruction\(\[\s*baseRolePrompt,[\s\S]*input\.roleInstructionWeight\)/);
  assert.match(normalBody, /resolvedRoleContext = resolveRolePromptContext\(input\.roleCardContext\)/);
  assert.match(normalBody, /buildStructuredRoleCardPrompt\(resolvedRoleContext\)/);
  assert.match(normalBody, /frameReplyPreference\(input\.replyPreference\)/);
  assert.match(normalBody, /input\.rolePrompt/);
  assert.match(materialBody, /block\('stable_role', frameRoleInstruction\(\[/);
  assert.match(materialBody, /baseRolePrompt = stripStructuredSillyTavernSections\(input\.editablePrompt, input\.roleCardContext\)/);
  assert.match(materialBody, /frameRoleInstruction\(\[\s*baseRolePrompt,[\s\S]*input\.roleInstructionWeight\)/);
  assert.match(materialBody, /resolvedRoleContext = resolveRolePromptContext\(input\.roleCardContext\)/);
  assert.match(materialBody, /buildStructuredRoleCardPrompt\(resolvedRoleContext\)/);
  assert.match(materialBody, /frameReplyPreference\(input\.replyPreference\)/);
  assert.match(promptBuilder, /IMMERSIVE_COMPANION_FRAME/);
  assert.match(promptBuilder, /buildNextReplyNudge/);
  const normalStableRole = /block\('stable_role'[\s\S]*?\]\.filter\(Boolean\)\.join\('\\n\\n'\), true, AI_PROMPT_LAYER_VERSIONS\.role\)/.exec(normalBody)?.[0] ?? '';
  assert.doesNotMatch(normalStableRole, /input\.userMessage|input\.dynamicMemoryContext|input\.materialSnippets/);
  assert.doesNotMatch(normalBody, /memory_snapshot[\s\S]{0,260}input\.rolePrompt/);
  assert.match(priorityBody, /name === 'current_user_message'[\s\S]*return 'required'/);

  const budget = read('src/ai/aiContextBudget.ts');
  assert.match(budget, /if \(block\.priority === 'required'\) \{\s*continue;\s*\}/);
});

test('immersive continuation nudge stays near current request and out of stable prefix', () => {
  const promptBuilder = read('src/ai/promptBuilder.ts');
  const normalBody = /export function buildNormalChatPrompt[\s\S]*?\r?\n}\r?\n\r?\nexport function buildMaterialBoundPrompt/.exec(promptBuilder)?.[0] ?? '';
  const materialBody = /export function buildMaterialBoundPrompt[\s\S]*?\r?\n}\r?\n/.exec(promptBuilder)?.[0] ?? '';
  const stablePrefixRegion = /const stableBlocks[\s\S]*?const dynamicBlocks/.exec(normalBody)?.[0] ?? '';
  const currentRequestRegion = /block\('current_user_message'[\s\S]*?\), false\)/.exec(normalBody)?.[0] ?? '';

  assert.match(promptBuilder, /沉浸式对话框架/);
  assert.match(promptBuilder, /下一条回复要求/);
  assert.match(promptBuilder, /不要主动跳出设定解释自己是 AI/);
  assert.match(currentRequestRegion, /buildNextReplyNudge/);
  assert.match(materialBody, /hasMaterialContext: true/);
  assert.doesNotMatch(stablePrefixRegion, /buildNextReplyNudge/);
});

test('prompt cache key contains scope, branch route, retrieval version, and generation params without metrics', () => {
  const promptCache = read('src/ai/aiPromptCache.ts');
  const chat = read('src/ai/aiChatService.ts');

  assert.match(promptCache, /retrievalVersion/);
  assert.match(promptCache, /AI_RETRIEVAL_CONTEXT_VERSION/);
  assert.match(promptCache, /branchRouteHash/);
  assert.match(promptCache, /generationParamsHash/);
  assert.match(promptCache, /scopeKey/);
  assert.match(promptCache, /`pv\$\{input\.metadata\.promptVersion\}`/);
  assert.match(promptCache, /input\.metadata\.retrievalVersion/);
  assert.match(chat, /buildBranchRouteHash/);
  assert.match(chat, /buildGenerationParamsHash/);
  assert.match(chat, /buildPromptScopeKey/);
  assert.doesNotMatch(promptCache, /generationMetrics/);
  assert.doesNotMatch(promptCache, /sendPressedAt|requestId|providerRequestSentAt|firstProviderDeltaAt/);
});

test('dynamic retrieval changes retrieval hash without being part of stable prefix hash', () => {
  const promptCache = read('src/ai/aiPromptCache.ts');

  const metadataBody = /export function buildPromptCacheMetadata[\s\S]*?\r?\n}\r?\n\r?\nexport function buildProviderCachePolicy/.exec(promptCache)?.[0] ?? '';
  assert.match(metadataBody, /const stableBlocks = stablePromptBlocks\(input\.blocks\)/);
  assert.match(metadataBody, /stablePrefixHash: hashPromptBlocks\(stableBlocks\)/);
  assert.match(metadataBody, /retrievalHash: hashPromptCacheText\(input\.retrievalText\)/);
});

test('semantic final-answer cache remains forbidden for private, personal, and role-play replies', () => {
  const files = [
    'src/ai/aiChatService.ts',
    'src/ai/aiPromptCache.ts',
    'src/ai/aiChatPerformanceMode.ts',
  ].map(read).join('\n');

  assert.doesNotMatch(files, /semanticAnswerCache|semanticReplyCache|finalAnswerCache|answerCache/i);
});
