const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const promptBuilder = () => fs.readFileSync(path.join(root, 'src/ai/promptBuilder.ts'), 'utf8');
const retrieval = () => fs.readFileSync(path.join(root, 'src/ai/aiRetrievalService.ts'), 'utf8');
const docService = () => fs.readFileSync(path.join(root, 'src/ai/aiDocumentService.ts'), 'utf8');
const embeddingService = () => fs.readFileSync(path.join(root, 'src/ai/aiEmbeddingService.ts'), 'utf8');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('normal chat prompt avoids Pixory material rules', () => {
  const content = promptBuilder();
  assert.match(content, /buildNormalChatPrompt/);
  assert.match(content, /buildMaterialBoundPrompt/);
  assert.match(content, /MATERIAL_SESSION_RULES/);
  assert.match(content, /当前会话角色指令如下/);
  assert.match(content, /不要仅根据对话记录判断为未设置/);
  assert.match(content, /if \(!trimmed\) \{\s*return '';\s*\}/);
  assert.match(content, /frameRoleInstruction\(input\.systemPrompt, input\.roleInstructionWeight\)/);
  assert.match(content, /frameReplyPreference\(input\.replyPreference\)/);
  assert.match(content, /\[frameRoleInstruction\(input\.systemPrompt, input\.roleInstructionWeight\), frameReplyPreference\(input\.replyPreference\), input\.stableMemoryPrefix, input\.rolePrompt\]/);
  assert.match(content, /return ''/);
  assert.match(content, /以用户当前要求为准/);
});

test('AI prompt assembly separates stable memory prefix from dynamic memory context', () => {
  const chatService = read('src/ai/aiChatService.ts');
  const content = promptBuilder();

  assert.match(chatService, /buildStableMemoryPrefix/);
  assert.match(chatService, /retrieveDynamicMemoryContext/);
  assert.match(chatService, /stableMemoryPrefix/);
  assert.match(chatService, /dynamicMemoryContext/);
  assert.match(content, /stableMemoryPrefix/);
  assert.match(content, /dynamicMemoryContext/);
  assert.match(content, /\[frameRoleInstruction[\s\S]*input\.stableMemoryPrefix[\s\S]*input\.rolePrompt\]/);
});

test('retrieval uses bounded snippets and never whole documents', () => {
  const content = retrieval();
  assert.match(content, /DEFAULT_RETRIEVAL_LIMIT/);
  assert.match(content, /retrieveForThread/);
  assert.match(content, /keyword/);
  assert.match(content, /hybrid/);
  assert.match(content, /ownerPreviewSearch/);
  assert.match(content, /ORDER BY sourceLabel ASC, chunkIndex ASC/);
  assert.match(content, /directSnippets\.length === 0 \? await ownerPreviewSearch/);
});

test('hybrid retrieval generates query vectors and document embeddings when configured', () => {
  const retrievalContent = retrieval();
  const embeddingContent = embeddingService();
  const documentContent = docService();

  assert.match(retrievalContent, /generateQueryEmbedding/);
  assert.match(retrievalContent, /embeddingProviderId/);
  assert.match(retrievalContent, /queryVector/);
  assert.match(embeddingContent, /getEmbeddingProviderForSpace/);
  assert.match(embeddingContent, /adapter\.embedText/);
  assert.match(embeddingContent, /replaceEmbeddings/);
  assert.doesNotMatch(embeddingContent, /return \{ generated: 0, failed: chunks\.length \}/);
  assert.match(documentContent, /generateMissingEmbeddingsForDocument/);
  assert.match(documentContent, /embedding_pending/);
  assert.match(documentContent, /embedding_ready/);
  assert.match(retrievalContent, /loadChunkSnippetsByIds/);
  assert.match(retrievalContent, /vectorSnippets/);
});

test('document service supports required first-version sources and excludes OCR vision', () => {
  const content = docService();
  for (const source of ['manual_text', 'txt', 'markdown', 'pdf', 'docx', 'ip_generated']) {
    assert.match(content, new RegExp(source));
  }
  assert.doesNotMatch(content, /visionProvider\.analyzeImage/);
  assert.doesNotMatch(content, /performOcr/);
});

test('PDF import and reader use native renderer instead of unsupported fallback', () => {
  const pdfParser = fs.readFileSync(path.join(root, 'src/ai/documentParsers/pdfParser.ts'), 'utf8');
  const pdfReader = fs.readFileSync(path.join(root, 'src/components/ai/AiPdfReader.tsx'), 'utf8');
  const nativeModule = fs.readFileSync(path.join(root, 'src/native/pixoryMediaModule.ts'), 'utf8');
  const nativeAndroid = fs.readFileSync(path.join(root, 'plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt'), 'utf8');
  const configPlugin = fs.readFileSync(path.join(root, 'plugins/withPixoryAndroidIntents.js'), 'utf8');

  assert.doesNotMatch(pdfParser, /当前版本暂不支持从 PDF 提取文本/);
  assert.doesNotMatch(pdfParser, /pdf-fallback/);
  assert.match(pdfParser, /extractPdfText/);
  assert.match(pdfReader, /getPdfPageCount/);
  assert.match(pdfReader, /renderPdfPageToFile/);
  assert.match(pdfReader, /FlatList/);
  assert.doesNotMatch(pdfReader, /上一页/);
  assert.doesNotMatch(pdfReader, /下一页/);
  assert.match(nativeModule, /getPdfPageCount/);
  assert.match(nativeModule, /renderPdfPageToFile/);
  assert.match(nativeModule, /extractPdfText/);
  assert.match(nativeAndroid, /PDFTextStripper/);
  assert.match(configPlugin, /com\.tom-roush:pdfbox-android:2\.0\.27\.0/);
});

test('AI memory retrieval supports asset-aware hybrid fallback scoring', () => {
  const service = read('src/ai/aiMemoryService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(repository, /ipId/);
  assert.match(repository, /groupId/);
  assert.match(repository, /imageAssetId/);
  assert.match(repository, /assetSnapshotJson/);
  assert.match(service, /buildMemoryAssetSnapshot/);
  assert.match(service, /internalFilename/);
  assert.match(service, /originalFilename/);
  assert.match(service, /width/);
  assert.match(service, /height/);
  assert.match(service, /scoreMemoryForQuery/);
  assert.match(service, /scopeScore/);
  assert.match(service, /importanceScore/);
  assert.match(service, /recencyScore/);
  assert.match(service, /assetScore/);
  assert.match(service, /keywordScore/);
  assert.match(service, /embedding/);
  assert.match(service, /fallback/);
});

test('AI prompt context is budget-aware and records trim state', () => {
  const budget = read('src/ai/aiContextBudget.ts');
  const chatService = read('src/ai/aiChatService.ts');

  assert.match(budget, /estimatePromptTokens/);
  assert.match(budget, /getConservativeContextBudget/);
  assert.match(budget, /protectedPrompt/);
  assert.match(budget, /trimmed/);
  assert.match(chatService, /trimMessagesToContextBudget/);
  assert.match(chatService, /contextTrimmed/);
});
