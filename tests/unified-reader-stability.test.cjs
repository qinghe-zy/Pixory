const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ReaderHeader contracts and decluttering', () => {
  const headerPath = path.resolve(__dirname, '../src/components/reader/ReaderHeader.tsx');
  const content = fs.readFileSync(headerPath, 'utf8');

  // Must not have format badge or layout mode pill
  assert.ok(!content.includes('styles.formatBadge'), 'Should not render formatBadge');
  assert.ok(!content.includes('styles.modePill'), 'Should not render modePill');
  assert.ok(!content.includes('styles.subtitleRow'), 'Should not render subtitleRow');

  // Must have standard left-aligned single-line title
  assert.ok(content.includes('numberOfLines={1}'), 'Title must be single-line');
  assert.ok(content.includes('ellipsizeMode="tail"'), 'Title must ellipsize with tail');
  assert.ok(content.includes("textAlign: 'left'"), 'Title must be left aligned');

  // Must have HTML preview/source switcher with proper icons
  assert.ok(content.includes("format === 'html' && onToggleHtmlViewMode"), 'Must support HTML dual mode');
  assert.ok(content.includes('play-outline'), 'Preview tab icon must be play-outline');
  assert.ok(content.includes('code-slash-outline'), 'Source tab icon must be code-slash-outline');

  // Must have PPTX presentation play button
  assert.ok(content.includes("format === 'pptx' && onPlayPresentation"), 'Must support PPTX presentation play button');
});

test('Universal HTML generator contracts', () => {
  const htmlPath = path.resolve(__dirname, '../src/components/reader/kernel/universalReaderHtml.ts');
  const content = fs.readFileSync(htmlPath, 'utf8');

  // Must use static direct injection into #reader-content
  assert.ok(content.includes('<div id="reader-content">${initialBodyHtml}</div>'), 'Must directly inject HTML into reader-content');
  assert.ok(!content.includes('const rawContent = decodeURIComponent('), 'Must not use decodeURIComponent for content transfer');

  // Must have visible fallback state when DOCX content is empty
  assert.ok(content.includes('DOCX 文档暂无提取内容'), 'Must have visible fallback state when DOCX content is empty');
});

test('PPTX parser contracts and in-memory zip decoupling', () => {
  const pptxParserPath = path.resolve(__dirname, '../src/ai/documentParsers/pptxParser.ts');
  const content = fs.readFileSync(pptxParserPath, 'utf8');

  // Must not import react-native-zip-archive
  assert.ok(!content.includes("from 'react-native-zip-archive'"), 'pptxParser must not depend on react-native-zip-archive');

  // Must use NodeDocxZipAdapter for in-memory zip
  assert.ok(content.includes('NodeDocxZipAdapter'), 'Must use NodeDocxZipAdapter');

  // Must handle image-only / empty slides gracefully
  assert.ok(content.includes('此幻灯片主要为图片或图表'), 'Must provide fallback placeholder for textless slides');
});

test('DOCX parser contracts and in-memory zip decoupling', () => {
  const docxParserPath = path.resolve(__dirname, '../src/ai/documentParsers/docxParser.ts');
  const content = fs.readFileSync(docxParserPath, 'utf8');

  // Must not import react-native-zip-archive
  assert.ok(!content.includes("from 'react-native-zip-archive'"), 'docxParser must not depend on react-native-zip-archive');

  // Must use NodeDocxZipAdapter for in-memory zip
  assert.ok(content.includes('NodeDocxZipAdapter'), 'Must use NodeDocxZipAdapter');
});

test('VFS storage driver and CAS blob store robustness', () => {
  const vfsPath = path.resolve(__dirname, '../src/services/agent/vfs/vfsStorageDriver.ts');
  const vfsContent = fs.readFileSync(vfsPath, 'utf8');
  assert.ok(vfsContent.includes('copyUriToFileWithProgress'), 'Must use native streaming copy for content:// URIs');

  const casPath = path.resolve(__dirname, '../src/services/agent/vfs/casBlobStore.ts');
  const casContent = fs.readFileSync(casPath, 'utf8');
  assert.ok(casContent.includes('sizeBytes <= 0'), 'CAS blob store must detect 0-byte invalid files');
});

test('AiPdfReader 0-byte corrupt file check', () => {
  const pdfPath = path.resolve(__dirname, '../src/components/ai/AiPdfReader.tsx');
  const content = fs.readFileSync(pdfPath, 'utf8');
  assert.ok(content.includes('info.size === 0'), 'Must check for 0-byte files before invoking native renderer');
  assert.ok(content.includes('PDF 文件损坏或大小为 0 字节'), 'Must provide friendly error message for corrupt PDF');
});


test('UniversalDocumentViewer error recovery and presentation handle', () => {
  const viewerPath = path.resolve(__dirname, '../src/components/reader/UniversalDocumentViewer.tsx');
  const content = fs.readFileSync(viewerPath, 'utf8');

  // Must offer other-app open recovery in error state
  assert.ok(content.includes('其他应用打开'), 'Must offer secondary button for other-app recovery');
  assert.ok(content.includes('safeShareFileAsync'), 'Must use safeShareFileAsync for other-app opening');

  // Must expose togglePresentation handle
  assert.ok(content.includes('togglePresentation: () => void'), 'Handle must expose togglePresentation');
});

test('Universal HTML generator presentation mode', () => {
  const htmlPath = path.resolve(__dirname, '../src/components/reader/kernel/universalReaderHtml.ts');
  const content = fs.readFileSync(htmlPath, 'utf8');

  // Must support presentation CSS and togglePresentation
  assert.ok(content.includes('data-presentation="true"'), 'Must have presentation layout CSS');
  assert.ok(content.includes('togglePresentation: function()'), 'Must implement togglePresentation in PixoryTheme');
});
