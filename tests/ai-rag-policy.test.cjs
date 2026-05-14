const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const promptBuilder = () => fs.readFileSync(path.join(root, 'src/ai/promptBuilder.ts'), 'utf8');
const retrieval = () => fs.readFileSync(path.join(root, 'src/ai/aiRetrievalService.ts'), 'utf8');
const docService = () => fs.readFileSync(path.join(root, 'src/ai/aiDocumentService.ts'), 'utf8');

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

test('document service supports required first-version sources and excludes OCR vision', () => {
  const content = docService();
  for (const source of ['manual_text', 'txt', 'markdown', 'pdf', 'docx', 'ip_generated']) {
    assert.match(content, new RegExp(source));
  }
  assert.doesNotMatch(content, /visionProvider\.analyzeImage/);
  assert.doesNotMatch(content, /performOcr/);
});
