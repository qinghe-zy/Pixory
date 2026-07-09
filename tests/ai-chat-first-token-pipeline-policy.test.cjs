const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('fast-path classifier defines all first-token retrieval tiers and fail-closed material references', () => {
  const classifier = read('src/ai/aiChatFastPath.ts');

  assert.match(classifier, /export type AiChatFastPathClassification/);
  for (const mode of [
    'normal_no_material_fast_path',
    'normal_memory_only',
    'material_keyword_only',
    'material_full_retrieval',
    'ip_context_retrieval',
    'knowledge_base_retrieval',
    'long_companion_context',
  ]) {
    assert.match(classifier, new RegExp(mode));
  }
  assert.match(classifier, /AMBIGUOUS_MATERIAL_REFERENCE_PATTERNS/);
  assert.match(classifier, /这个文档/);
  assert.match(classifier, /那张图/);
  assert.match(classifier, /上面的设定/);
  assert.match(classifier, /according to the material/i);
  assert.match(classifier, /retrievalTier: 'keyword'/);
  assert.match(classifier, /retrievalTier: 'full'/);
  assert.match(classifier, /retrievalTier: 'none'/);
  assert.match(classifier, /hasMemoryContext\?: boolean/);
  assert.match(classifier, /classification: 'normal_memory_only'/);
  assert.match(classifier, /const explicitMaterialReference = !ambiguousMaterialReference &&/);
});

test('normal no-material fast path skips retrieval and records a content-free skip reason', () => {
  const chat = read('src/ai/aiChatService.ts');
  const promptBody = /async function buildPromptForThread[\s\S]*?\r?\n}\r?\n\r?\nexport async function createThreadFromContext/.exec(chat)?.[0] ?? '';
  const classifier = read('src/ai/aiChatFastPath.ts');

  assert.match(chat, /classifyAiChatFastPath/);
  assert.match(promptBody, /countDocumentsByOwner/);
  assert.doesNotMatch(promptBody, /countChunksByOwner/);
  assert.match(promptBody, /countCompletedNonSystemMessages/);
  assert.doesNotMatch(promptBody, /const \[memorySettings, threadMaterialCount, messageCount\]/);
  assert.match(promptBody, /const memorySettings = await aiThreadRepository\.getThreadMemorySettings\(db, thread\.id\)/);
  assert.match(promptBody, /const finalFastPath = classifyAiChatFastPath/);
  assert.match(promptBody, /hasMemoryContext: memorySettings\.deepMemoryEnabled/);
  assert.match(promptBody, /settings: memorySettings/);
  assert.match(promptBody, /fastPath\.retrievalTier/);
  assert.match(promptBody, /hasThreadMaterials: fastPathContext\.hasThreadMaterials/);
  assert.match(promptBody, /messageCount: fastPathContext\.messageCount/);
  assert.match(promptBody, /const fastPath = classifyAiChatFastPath/);
  assert.match(promptBody, /finalFastPath\.classification/);
  assert.match(promptBody, /retrievalSkippedReason = finalFastPath\.retrievalSkippedReason/);
  assert.match(promptBody, /const skippedRetrievalResult: ThreadRetrievalResult = \{ mode: 'skipped'/);
  assert.match(promptBody, /fastPath\.retrievalTier === 'none'/);
  assert.match(promptBody, /Promise\.resolve\(skippedRetrievalResult\)/);
  assert.match(classifier, /if \(explicitMaterialReference\)/);
  assert.match(classifier, /const materialReference = ambiguousMaterialReference \|\| explicitMaterialReference/);
  assert.match(classifier, /input\.hasThreadMaterials && input\.explicitMaterialReference/);
  assert.match(classifier, /materialReference \? 'keyword'/);
  assert.doesNotMatch(classifier, /explicitMaterialReference \|\| input\.hasThreadMaterials/);
  assert.doesNotMatch(promptBody, /generationMetrics\.context\.[a-zA-Z]*Text/);
});

test('retrieval pipeline distinguishes keyword-only material references from full retrieval and records timeout metadata', () => {
  const retrieval = read('src/ai/aiRetrievalService.ts');
  const chat = read('src/ai/aiChatService.ts');

  assert.match(retrieval, /export type RetrievalMode = 'skipped' \| 'keyword' \| 'hybrid'/);
  assert.match(retrieval, /export type RetrievalTier = 'keyword' \| 'full'/);
  assert.match(retrieval, /tier\?: RetrievalTier/);
  assert.match(retrieval, /timedOut: boolean/);
  assert.match(retrieval, /partial: boolean/);
  assert.match(retrieval, /if \(input\.tier === 'keyword'\)/);
  assert.match(chat, /retrievalPartial/);
  assert.match(chat, /retrievalTimedOut/);
});

test('IP document opt-out keeps IP metadata but excludes document chunks from bound-owner retrieval', () => {
  const retrieval = read('src/ai/aiRetrievalService.ts');
  const chat = read('src/ai/aiChatService.ts');

  assert.match(retrieval, /includeDocumentChunks\?: boolean/);
  assert.match(retrieval, /const includeDocumentChunks = input\.includeDocumentChunks !== false/);
  assert.match(retrieval, /includeDocumentChunks\s*\?\s*keywordSearch\(\{ \.\.\.input, limit \}\)\s*:\s*Promise\.resolve\(\[\]\)/);
  assert.match(retrieval, /if \(!includeDocumentChunks\) \{\s*return \{ mode: 'keyword', partial: false, snippets: directSnippets, timedOut: false \};\s*\}/);
  assert.match(chat, /includeDocumentChunks: ownerType !== 'ip' \|\| thread\.includeIpDocuments/);
});

test('chat history trimming uses resolved model context window and preserves protected current request/role prompt', () => {
  const chat = read('src/ai/aiChatService.ts');

  assert.match(chat, /modelContextWindowTokens: resolvedModel\.contextWindowTokens/);
  assert.match(chat, /modelContextWindowTokens\?: number \| null/);
  assert.match(chat, /buildChatHistory\(historyMessages, input\.userMessage\.id, \{/);
  assert.match(chat, /modelContextWindowTokens,/);
  assert.match(chat, /protectedPrompt: \[\s*prompt\.system,\s*prompt\.user,\s*input\.userMessage\.content/);
  assert.match(chat, /fitBuiltPromptToContextBudget\(\{ modelContextWindowTokens, prompt \}\)/);
  assert.match(chat, /trimMessagesToContextBudget\(\{/);
  assert.match(chat, /modelContextWindowTokens: options\?\.modelContextWindowTokens/);

  const budget = read('src/ai/aiContextBudget.ts');
  assert.match(budget, /Math\.min\(modelContextWindowTokens, Math\.max\(1, targetBudget\)\)/);
  assert.match(budget, /fitPromptBlocksToContextBudget/);
  assert.doesNotMatch(budget, /Math\.max\(2400, Math\.floor\(modelContextWindowTokens \* 0\.7\)\)/);

  const promptBuilder = read('src/ai/promptBuilder.ts');
  assert.match(promptBuilder, /fitBuiltPromptToContextBudget/);
  assert.match(promptBuilder, /buildPromptFromLayers/);
  assert.match(promptBuilder, /contextBudgetTrimmed: true/);
  assert.match(promptBuilder, /buildPromptCacheMetadata/);
});

test('first visible streaming patch is not gated by scroll attachment', () => {
  const screen = read('src/screens/AiChatScreen.tsx');
  const runtime = read('src/ai/aiStreamingRuntime.ts');
  const bufferBody = /const applyOrBufferStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[[^\]]*\]\);/.exec(screen)?.[0] ?? '';

  assert.match(runtime, /canPublishStreamingPatch/);
  assert.doesNotMatch(runtime, /!input\.bottomLocked[\s\S]{0,80}return 0/);
  assert.match(screen, /function shouldPublishLiveStreamingPatch/);
  assert.match(screen, /routeFocused/);
  assert.match(screen, /appActive/);
  assert.match(screen, /isCurrentStreamingPatch/);
  assert.match(screen, /bottomLocked.*auto-scroll/i);
  assert.match(bufferBody, /const canPublishLive/);
  assert.match(bufferBody, /const canAttachLiveLayout = bottomLockedRef\.current && !hasPendingStreamingReadBuffer\(\)/);
  assert.match(bufferBody, /publishStreamingMessage/);
  assert.match(bufferBody, /if \(canAttachLiveLayout && canPublishLive && streamingIdentity\) \{/);
  assert.match(bufferBody, /if \(canPublishLive\) \{/);
  assert.doesNotMatch(bufferBody, /else \{[\s\S]*publishStreamingMessage/);
  assert.match(screen, /function beginStreamingRequest[\s\S]*resetStreamingReadBufferState\(\);[\s\S]*clearActiveStreamingIdentity\(\);[\s\S]*activeStreamGenerationRef\.current \+= 1/);
});
