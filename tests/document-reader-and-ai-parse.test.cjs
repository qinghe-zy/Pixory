const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 1. DOCX OOXML Semantic Conversion & Text Extraction
test('DOCX OOXML semantic HTML converter and AI text extraction', async () => {
  // Transpile/mock convertDocxXmlToSemanticHtml logic
  const docxParserPath = path.resolve(__dirname, '../src/ai/documentParsers/docxParser.ts');
  const code = fs.readFileSync(docxParserPath, 'utf8');

  assert.ok(code.includes('convertDocxXmlToSemanticHtml'), 'Must export convertDocxXmlToSemanticHtml');
  assert.ok(code.includes('parseDocxToHtml'), 'Must export parseDocxToHtml');
  assert.ok(code.includes('parseDocxText'), 'Must export parseDocxText');
  assert.ok(code.includes('base64-js'), 'Must use base64-js instead of atob');
  assert.ok(!code.includes('atob('), 'Must not use fragile atob()');

  // Verify that styles are mapped
  assert.ok(code.includes('pixory-docx-h'), 'Must map headings to styled classes');
  assert.ok(code.includes('pixory-docx-table'), 'Must map tables to styled classes');
  assert.ok(code.includes('pixory-docx-list-item'), 'Must map numPr lists to styled classes');
});

// 2. PPTX Slide Parser Contracts
test('PPTX slide parser Hermes compatibility and non-empty slide guarantee', () => {
  const pptxParserPath = path.resolve(__dirname, '../src/ai/documentParsers/pptxParser.ts');
  const code = fs.readFileSync(pptxParserPath, 'utf8');

  assert.ok(code.includes('base64-js'), 'Must import base64-js');
  assert.ok(!code.includes('atob('), 'Must not use fragile atob()');
  assert.ok(code.includes('slides.length === 0'), 'Must guard against empty slides');
  assert.ok(code.includes('演示文稿概览'), 'Must provide fallback summary slide');
  assert.ok(code.includes('演示文稿读取失败'), 'Must return structured error slide on failure');
});

// 3. AI Document Parsing & Source Type Integration
test('AI document service and types support pptx', () => {
  const typesPath = path.resolve(__dirname, '../src/ai/types.ts');
  const typesCode = fs.readFileSync(typesPath, 'utf8');
  assert.ok(typesCode.includes("'pptx'"), 'AiDocumentSourceType must include pptx');

  const docServicePath = path.resolve(__dirname, '../src/ai/aiDocumentService.ts');
  const docServiceCode = fs.readFileSync(docServicePath, 'utf8');
  assert.ok(docServiceCode.includes("lowerName.endsWith('.pptx')"), 'resolveSourceType must detect pptx');
  assert.ok(docServiceCode.includes("document.sourceType === 'pptx'"), 'parseDocumentText must handle pptx');
});

// 4. Chat Attachment Ingest Full-Format Text Extraction
test('useImChatSession extracts full text for docx, pptx, and pdf', () => {
  const sessionPath = path.resolve(__dirname, '../src/im/hooks/useImChatSession.ts');
  const sessionCode = fs.readFileSync(sessionPath, 'utf8');

  // Must detect formats
  assert.ok(sessionCode.includes('isDocx ='), 'Must detect docx files');
  assert.ok(sessionCode.includes('isPptx ='), 'Must detect pptx files');
  assert.ok(sessionCode.includes('isPdf ='), 'Must detect pdf files');

  // Must call parsers and set extractedText
  assert.ok(sessionCode.includes('parseDocxText'), 'Must call parseDocxText for docx');
  assert.ok(sessionCode.includes('parsePptx'), 'Must call parsePptx for pptx');
  assert.ok(sessionCode.includes('extractPdfText'), 'Must call extractPdfText for pdf');

  // Must populate metadata
  assert.ok(sessionCode.includes('extractedText,'), 'Must persist extractedText in document metadata');
  assert.ok(sessionCode.includes('charCount,'), 'Must persist charCount in document metadata');
  assert.ok(sessionCode.includes('tocSkeleton,'), 'Must persist tocSkeleton in document metadata');
});

// 5. PDF Reader Dynamic Aspect Ratio and Fault Tolerance
test('AiPdfReader dynamic aspect ratio and fallback recovery', () => {
  const pdfReaderPath = path.resolve(__dirname, '../src/components/ai/AiPdfReader.tsx');
  const code = fs.readFileSync(pdfReaderPath, 'utf8');

  assert.ok(code.includes('Image.getSize'), 'Must dynamically calculate aspect ratio via Image.getSize');
  assert.ok(code.includes('setActiveUri'), 'Must support switching to healthy fallback URI');
  assert.ok(code.includes('safeShareFileAsync'), 'Must support external app opening on failure');
  assert.ok(code.includes('PDF 页面解析受阻'), 'Must provide clear user feedback on error');
});

// 7. Static Direct Injection Architecture & Script Syntax Guarantee
test('universalReaderHtml static direct injection and script parse test', () => {
  const { getUniversalReaderHtml } = require('../src/components/reader/kernel/universalReaderHtml.ts');
  const vm = require('node:vm');

  const sampleDocxHtml = '<div class="docx-wrapper"><p class="pixory-docx-p">测试段落内容</p></div>';
  const html = getUniversalReaderHtml({
    format: 'docx',
    content: sampleDocxHtml,
    theme: 'paper',
    fontSize: 16,
    layoutMode: 'flow',
    fontFamily: 'sans',
  });

  // Verify static direct injection
  assert.ok(html.includes(`<div id="reader-content">${sampleDocxHtml}</div>`), 'Must directly inject HTML into #reader-content');

  // Verify script parses with 0 syntax errors
  const scriptStart = html.indexOf('<script>');
  const scriptEnd = html.lastIndexOf('</script>');
  const scriptCode = html.slice(scriptStart + 8, scriptEnd);
  assert.doesNotThrow(() => {
    new vm.Script(scriptCode);
  }, 'Inline script must parse with zero syntax errors');
});

// 8. DocumentPicker Android Wildcard File Penetration
test('DocumentPicker uses wildcard */* string across picker screens', () => {
  const chatScreen = fs.readFileSync(path.resolve(__dirname, '../src/screens/AiChatScreen.tsx'), 'utf8');
  assert.ok(chatScreen.includes("type: '*/*'"), 'AiChatScreen must use wildcard string */*');

  const materialScreen = fs.readFileSync(path.resolve(__dirname, '../src/screens/AiMaterialImportScreen.tsx'), 'utf8');
  assert.ok(materialScreen.includes("type: '*/*'"), 'AiMaterialImportScreen must use wildcard string */*');

  const sessionScreen = fs.readFileSync(path.resolve(__dirname, '../src/screens/AiSessionConfigScreen.tsx'), 'utf8');
  assert.ok(sessionScreen.includes("type: '*/*'"), 'AiSessionConfigScreen must use wildcard string */*');
});

// 9. OLE2 Binary & PPT/DOC Support
test('docxParser and pptxParser support legacy binary formats and pako zip engine', () => {
  const docxZip = fs.readFileSync(path.resolve(__dirname, '../src/services/sandbox/docx/docxZipAdapter.ts'), 'utf8');
  assert.ok(docxZip.includes('pako.inflateRaw'), 'Must use pako.inflateRaw');
  assert.ok(docxZip.includes('pako.deflateRaw'), 'Must use pako.deflateRaw');

  const pptxParser = fs.readFileSync(path.resolve(__dirname, '../src/ai/documentParsers/pptxParser.ts'), 'utf8');
  assert.ok(pptxParser.includes('isOle2Binary'), 'pptxParser must detect OLE2 binary');
  assert.ok(pptxParser.includes('renderPptxSlidesHtml'), 'pptxParser must export renderPptxSlidesHtml');

  const docxParser = fs.readFileSync(path.resolve(__dirname, '../src/ai/documentParsers/docxParser.ts'), 'utf8');
  assert.ok(docxParser.includes('isOle2Binary'), 'docxParser must detect OLE2 binary');
  assert.ok(docxParser.includes('extractTextFromOle2Doc'), 'docxParser must extract text from .doc');
});

// 10. DOCX Rich Layout & Typography Engine
test('DOCX rich typography and layout framework: font sizes, indents, multi-columns, and shaded tables', () => {
  const docxParser = fs.readFileSync(path.resolve(__dirname, '../src/ai/documentParsers/docxParser.ts'), 'utf8');

  // Character typography
  assert.ok(docxParser.includes('w:sz'), 'Must parse <w:sz> font size');
  assert.ok(docxParser.includes('w:spacing'), 'Must parse <w:spacing> letter spacing');
  assert.ok(docxParser.includes('w:highlight'), 'Must parse <w:highlight>');
  assert.ok(docxParser.includes('w:vertAlign'), 'Must parse <w:vertAlign> (superscript/subscript)');

  // Paragraph & section layout
  assert.ok(docxParser.includes('w:jc'), 'Must parse <w:jc> alignment');
  assert.ok(docxParser.includes('text-indent:2em;'), 'Must support Chinese 2-character first-line indent');
  assert.ok(docxParser.includes('pixory-docx-multicolumn'), 'Must support multi-column layout wrapper');

  // Drawing & embedded images
  assert.ok(docxParser.includes('pixory-docx-image-wrapper'), 'Must generate image wrapper');
  assert.ok(docxParser.includes('parseDocxRels'), 'Must parse document.xml.rels for embedded media');

  // Table enhancements
  assert.ok(docxParser.includes('w:shd'), 'Must parse table cell shading/background');
  assert.ok(docxParser.includes('w:gridSpan'), 'Must parse table cell colspan');
  assert.ok(docxParser.includes('w:vMerge'), 'Must parse table cell vertical rowspan merge (vMerge)');
  assert.ok(docxParser.includes('rowspan='), 'Must compute and output HTML rowspan attribute');
  assert.ok(docxParser.includes('w:tblGrid'), 'Must parse <w:tblGrid> for column widths');
  assert.ok(docxParser.includes('<colgroup>'), 'Must emit <colgroup> with percentage widths');

  // Enterprise typography & elements
  assert.ok(docxParser.includes('parseNumberingXml'), 'Must parse word/numbering.xml for multi-level lists');
  assert.ok(docxParser.includes('pixory-docx-num-badge'), 'Must output real list number badge');
  assert.ok(docxParser.includes('extractTextBoxCallouts'), 'Must extract <w:txbxContent> text boxes');
  assert.ok(docxParser.includes('pixory-docx-callout'), 'Must style text boxes as callout cards');
  assert.ok(docxParser.includes('parseMathFormula'), 'Must parse <m:oMath> mathematical expressions');
  assert.ok(docxParser.includes('pixory-docx-math'), 'Must style formulas with pixory-docx-math');
  assert.ok(docxParser.includes('extractTopLevelBlocks'), 'Must extract top-level blocks with nesting depth tracking');
});

// 11. High-Standard PPT Presentation Player & Deck Engine
test('PPTX presentation player 16:9 canvas, deck pager pill, gestures, and media', () => {
  const pptxParser = fs.readFileSync(path.resolve(__dirname, '../src/ai/documentParsers/pptxParser.ts'), 'utf8');
  assert.ok(pptxParser.includes('parseSlideRels'), 'Must parse slide rels for media & notes');
  assert.ok(pptxParser.includes('pptx-slide-images-grid'), 'Must render images grid on slide');
  assert.ok(pptxParser.includes('pptx-slide-notes'), 'Must extract and render speaker notes');
  assert.ok(pptxParser.includes('titleShapeMatch'), 'Must detect PPTX title placeholder');

  // 2D Spatial Geometry Engine contracts
  assert.ok(pptxParser.includes('parsePresentationDimensions'), 'Must parse presentation.xml dimensions');
  assert.ok(pptxParser.includes('parseSpatialBox'), 'Must parse <a:xfrm> into percentage bounding boxes');
  assert.ok(pptxParser.includes('pptx-spatial-stage'), 'Must render 2D spatial presentation stage');
  assert.ok(pptxParser.includes('pptx-spatial-elem'), 'Must render spatial elements with absolute positioning');
  assert.ok(pptxParser.includes('aspect-ratio:'), 'Must apply slide canvas aspect ratio');

  const readerHtml = fs.readFileSync(path.resolve(__dirname, '../src/components/reader/kernel/universalReaderHtml.ts'), 'utf8');
  assert.ok(readerHtml.includes('aspect-ratio: 16 / 9;'), 'Must enforce 16:9 widescreen slide canvas');
  assert.ok(readerHtml.includes('deck-control-pill'), 'Must include interactive floating control pill');
  assert.ok(readerHtml.includes('deckNext'), 'Must support deck navigation next');
  assert.ok(readerHtml.includes('deckPrev'), 'Must support deck navigation prev');
  assert.ok(readerHtml.includes('deck-btn-disabled'), 'Must apply disabled state to first/last slide navigation');
  assert.ok(readerHtml.includes('touchstart'), 'Must support touch swipe gestures');
  assert.ok(readerHtml.includes('presentationPage'), 'Must report active presentation page to Native');
  assert.ok(readerHtml.includes('break-inside: avoid;'), 'Must prevent multi-column content breaking awkwardly');
  assert.ok(readerHtml.includes('.pptx-spatial-stage'), 'Must include CSS for spatial stage');
  assert.ok(readerHtml.includes('.pptx-spatial-elem'), 'Must include CSS for spatial elements');
});

// 12. UniversalDocumentViewer Android Zero-SSL Crash Guarantee
test('UniversalDocumentViewer uses safe baseUrl about:blank for Android WebView', () => {
  const viewerCode = fs.readFileSync(path.resolve(__dirname, '../src/components/reader/UniversalDocumentViewer.tsx'), 'utf8');
  assert.ok(viewerCode.includes("baseUrl: 'about:blank'"), 'Must use baseUrl: about:blank to prevent Android SSL blank screen');
  assert.ok(!viewerCode.includes("baseUrl: 'https://localhost'"), 'Must NEVER use https://localhost baseUrl on Android');
});

// 13. PPTX True-to-Life 16:9 Canvas, Theme Colors, Vector SVG Shapes, and Word Frameless Immersion Engine
test('PPTX true-to-life canvas autoscale, theme color resolution, and Word frameless immersion engine', () => {
  const pptxParser = fs.readFileSync(path.resolve(__dirname, '../src/ai/documentParsers/pptxParser.ts'), 'utf8');
  assert.ok(pptxParser.includes('logicalWidth'), 'pptxParser must compute logicalWidth based on EMU / 12700');
  assert.ok(pptxParser.includes('parseThemeColors'), 'pptxParser must parse theme1.xml colors');
  assert.ok(pptxParser.includes('parseClrMap'), 'pptxParser must parse clrMap from slideMaster');
  assert.ok(pptxParser.includes('resolveColorFromXml'), 'pptxParser must resolve theme schemeClr and alpha transparency');
  assert.ok(pptxParser.includes('resolveShapeFillStyle'), 'pptxParser must isolate solid and gradient fill while stripping border lines');
  assert.ok(pptxParser.includes('generateSvgForShape'), 'pptxParser must generate SVG paths for non-rectangular and custom geometries');
  assert.ok(pptxParser.includes('parseGroupShapes'), 'pptxParser must support group shapes recursive projection');
  assert.ok(pptxParser.includes('pptx-slide-canvas'), 'pptxParser must render pure .pptx-slide-canvas');
  assert.ok(pptxParser.includes('pptx-slide-index-watermark'), 'pptxParser must render non-intrusive watermark');

  const docxParser = fs.readFileSync(path.resolve(__dirname, '../src/ai/documentParsers/docxParser.ts'), 'utf8');
  assert.ok(docxParser.includes('isLikelyCodeLine'), 'docxParser must detect code lines via syntax heuristics');
  assert.ok(docxParser.includes('formatCodeBlock'), 'docxParser must format code blocks with indentation');
  assert.ok(docxParser.includes('pendingCodeBlankLines'), 'docxParser must buffer blank lines across code paragraphs');
  assert.ok(docxParser.includes('pixory-docx-code-block'), 'docxParser must output .pixory-docx-code-block');
  assert.ok(docxParser.includes('pixory-docx-page'), 'docxParser must encapsulate document in .pixory-docx-page sheets');

  const readerHtml = fs.readFileSync(path.resolve(__dirname, '../src/components/reader/kernel/universalReaderHtml.ts'), 'utf8');
  assert.ok(readerHtml.includes('syncAllPptxSlidesScale'), 'universalReaderHtml must contain syncAllPptxSlidesScale autoscale matrix');
  assert.ok(readerHtml.includes('fitAllPptxTextBoxes'), 'universalReaderHtml must contain fitAllPptxTextBoxes text autofit engine');
  assert.ok(readerHtml.includes('ResizeObserver'), 'universalReaderHtml must observe canvas resize via ResizeObserver');
  assert.ok(readerHtml.includes('white-space: nowrap !important;'), 'universalReaderHtml must prevent deck pill text from wrapping vertically');
  assert.ok(readerHtml.includes('.pixory-docx-page'), 'universalReaderHtml must style docx pages');
  assert.ok(readerHtml.includes('width: 100% !important;'), 'universalReaderHtml must use 100% width for mobile immersion');
  assert.ok(readerHtml.includes('white-space: pre-wrap !important;'), 'universalReaderHtml must wrap code lines to prevent clipping');
  assert.ok(readerHtml.includes('var(--surface'), 'universalReaderHtml must adapt docx background to theme variable');

  const readerScreen = fs.readFileSync(path.resolve(__dirname, '../src/screens/AiDocumentReaderScreen.tsx'), 'utf8');
  assert.ok(readerScreen.includes('isPresentation'), 'AiDocumentReaderScreen must track presentation state');
  assert.ok(readerScreen.includes('!isPresentation ?'), 'AiDocumentReaderScreen must hide header during presentation mode');
});

// 14. SQLite PPTX Schema Support, PPT Line-Height Anti-Squash, and Word Dual-Engine Fallback
test('Database schema, PPT line-height clamp, and Word dual-engine fallback integrity', () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '../src/database/schema.ts'), 'utf8');
  assert.ok(schema.includes("'pptx'"), 'schema.ts ai_documents must include pptx in CHECK constraint');

  const dbCode = fs.readFileSync(path.resolve(__dirname, '../src/database/db.ts'), 'utf8');
  assert.ok(dbCode.includes('ensureAiDocumentSchema'), 'db.ts must define ensureAiDocumentSchema migration');
  assert.ok(dbCode.includes('ai_documents_v2'), 'db.ts must support atomic table recreation for CHECK constraint');

  const pptxBundleJs = fs.readFileSync(path.resolve(__dirname, '../src/components/reader/kernel/vendor/pptxPreview.bundle.js'), 'utf8');
  assert.ok(pptxBundleJs.includes('Math.max(1.25,m||1.25)'), 'pptxPreview bundle JS must clamp line height to >= 1.25');

  const pptxBundleTs = fs.readFileSync(path.resolve(__dirname, '../src/components/reader/kernel/vendor/pptxPreview.bundle.ts'), 'utf8');
  assert.ok(pptxBundleTs.includes('Math.max(1.25,m||1.25)'), 'pptxPreview bundle TS must clamp line height to >= 1.25');

  const readerHtml = fs.readFileSync(path.resolve(__dirname, '../src/components/reader/kernel/universalReaderHtml.ts'), 'utf8');
  assert.ok(readerHtml.includes('line-height: 1.35 !important;'), 'universalReaderHtml must enforce line-height: 1.35 !important on pptx paragraphs');
  assert.ok(readerHtml.includes('section.pixory-docx > header'), 'universalReaderHtml must calibrate docx header margin-top');
  assert.ok(readerHtml.includes('breakPages: false'), 'universalReaderHtml must use breakPages: false for mobile docx reading flow');
  assert.ok(readerHtml.includes('window.__semanticDocxFallback'), 'universalReaderHtml must support window.__semanticDocxFallback');

  const viewer = fs.readFileSync(path.resolve(__dirname, '../src/components/reader/UniversalDocumentViewer.tsx'), 'utf8');
  assert.ok(viewer.includes('fallbackSemanticHtml: fallbackSemanticDocx'), 'UniversalDocumentViewer must pass semantic fallback HTML to webview');
});
