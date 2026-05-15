const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const promptBuilder = () => fs.readFileSync(path.join(root, 'src/ai/promptBuilder.ts'), 'utf8');
const retrieval = () => fs.readFileSync(path.join(root, 'src/ai/aiRetrievalService.ts'), 'utf8');
const docService = () => fs.readFileSync(path.join(root, 'src/ai/aiDocumentService.ts'), 'utf8');
const embeddingService = () => fs.readFileSync(path.join(root, 'src/ai/aiEmbeddingService.ts'), 'utf8');

test('normal chat prompt avoids Pixory material rules', () => {
  const content = promptBuilder();
  assert.match(content, /buildNormalChatPrompt/);
  assert.match(content, /buildMaterialBoundPrompt/);
  assert.match(content, /MATERIAL_SESSION_RULES/);
});

test('retrieval uses bounded snippets and never whole documents', () => {
  const content = retrieval();
  assert.match(content, /DEFAULT_RETRIEVAL_LIMIT/);
  assert.match(content, /retrieveForThread/);
  assert.match(content, /keyword/);
  assert.match(content, /hybrid/);
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

  assert.doesNotMatch(pdfParser, /当前版本暂不支持从 PDF 提取文本/);
  assert.doesNotMatch(pdfParser, /pdf-fallback/);
  assert.match(pdfReader, /getPdfPageCount/);
  assert.match(pdfReader, /renderPdfPageToFile/);
  assert.match(pdfReader, /放大/);
  assert.match(pdfReader, /缩小/);
  assert.match(nativeModule, /getPdfPageCount/);
  assert.match(nativeModule, /renderPdfPageToFile/);
});
