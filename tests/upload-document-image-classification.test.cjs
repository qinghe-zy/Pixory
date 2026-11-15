const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

const {
  containsBinaryNullOrGarbledText,
  extractSafeFileNameFromUri,
  normalizeImageMimeType,
  resolveAttachmentKind,
  resolveImageFileExtension,
} = loadTsModule('src/utils/attachmentKind.ts');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

test('extractSafeFileNameFromUri decodes safely and handles malformed percent encoding', () => {
  assert.equal(
    extractSafeFileNameFromUri('file:///data/user/0/cache/%E6%B5%8B%E8%AF%95.png?w=200#top'),
    '测试.png',
  );
  assert.equal(
    extractSafeFileNameFromUri('content://com.android.providers/document/100%ZZbad.jpg'),
    '100%ZZbad.jpg',
  );
  assert.equal(extractSafeFileNameFromUri('file:///empty/', 'fallback-name'), 'fallback-name');
});

test('resolveAttachmentKind classifies raster images picked as documents while guarding SVG scope', () => {
  assert.equal(resolveAttachmentKind('application/octet-stream', 'photo.JPG', 'content://x/1'), 'image');
  assert.equal(resolveAttachmentKind(null, 'IMG_001', 'content://media/picker/sample.webp?size=10'), 'image');
  assert.equal(resolveAttachmentKind('IMAGE/PNG; charset=utf-8', 'noext', 'content://x/1'), 'image');
  assert.equal(resolveAttachmentKind(undefined, 'shot.heic', 'file:///shot.heic'), 'image');

  // SVG defaults to document in vision chat, and classifies as image for preview/FileTransfer
  assert.equal(resolveAttachmentKind('image/svg+xml', 'icon.svg', 'file:///icon.svg'), 'document');
  assert.equal(
    resolveAttachmentKind('image/svg+xml', 'icon.svg', 'file:///icon.svg', { includeSvg: true }),
    'image',
  );

  // Documents remain document
  assert.equal(resolveAttachmentKind('application/pdf', 'report.pdf', 'file:///report.pdf'), 'document');
  assert.equal(resolveAttachmentKind('text/markdown', 'notes.md', 'file:///notes.md'), 'document');
  assert.equal(
    resolveAttachmentKind(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'spec.docx',
      'file:///spec.docx',
    ),
    'document',
  );
});

test('normalizeImageMimeType and resolveImageFileExtension canonicalize provider MIME types', () => {
  assert.equal(normalizeImageMimeType('image/jpg', 'a.jpg'), 'image/jpeg');
  assert.equal(normalizeImageMimeType('image/pjpeg; boundary=x', 'a'), 'image/jpeg');
  assert.equal(normalizeImageMimeType('image/x-png', 'a.png'), 'image/png');
  assert.equal(normalizeImageMimeType('application/octet-stream', 'pic.webp'), 'image/webp');
  assert.equal(normalizeImageMimeType(null, 'unknown'), 'image/jpeg');

  assert.equal(resolveImageFileExtension('image/jpeg', 'pic'), 'jpg');
  assert.equal(resolveImageFileExtension('image/png', 'pic'), 'png');
  assert.equal(resolveImageFileExtension(null, 'pic.heif'), 'heif');
});

test('containsBinaryNullOrGarbledText rejects binary garbled buffers and keeps normal CJK text', () => {
  assert.equal(containsBinaryNullOrGarbledText(''), false);
  assert.equal(containsBinaryNullOrGarbledText('# 标题\n这是一段正常的中文 Markdown 文本，包含 emoji 🎨 和 JSON {"a": 1}。'), false);
  assert.equal(containsBinaryNullOrGarbledText('PNG\u0000\u0001binary'), true);
  assert.equal(containsBinaryNullOrGarbledText('\uFFFD'.repeat(12) + 'abcd'), true);
  assert.equal(containsBinaryNullOrGarbledText('\u0001\u0002\u0003\u0004\u0005\u0006normal'), true);
});

test('AiChatScreen, FileTransferScreen, and ImChat session route picked images consistently and safely', () => {
  const aiChat = read('src/screens/AiChatScreen.tsx');
  const fileTransfer = read('src/screens/FileTransferScreen.tsx');
  const aiChatService = read('src/ai/aiChatService.ts');
  const useImChat = read('src/im/hooks/useImChatSession.ts');
  const imChatScreen = read('src/im/screens/ImChatScreen.tsx');

  assert.match(aiChat, /resolveAttachmentKind\([\s\S]{0,120}includeSvg:\s*false/);
  assert.match(aiChat, /normalizeImageMimeType\(/);
  assert.match(fileTransfer, /resolveAttachmentKind\([\s\S]{0,120}includeSvg:\s*true/);
  assert.match(aiChatService, /copyLocalFile\(readUri, tempCacheUri\)/);
  assert.match(aiChatService, /deleteLocalFile\(tempCacheUri\)/);
  assert.match(aiChatService, /AI_CHAT_IMAGE_MAX_BYTES/);

  assert.match(useImChat, /resolveAttachmentKind\([\s\S]{0,120}includeSvg:\s*false/);
  assert.match(useImChat, /im_images\/\$\{space\}\//);
  assert.match(useImChat, /containsBinaryNullOrGarbledText\(text\)/);
  assert.match(imChatScreen, /resolveAttachmentKind\([^)]*includeSvg:\s*true[^)]*\)\s*===\s*'image'/);
  assert.ok(imChatScreen.split(/\r?\n/).length <= 150, 'ImChatScreen.tsx must remain within 150 lines');
});

test('document parsers, material import, continuity import, and reader block image and garbled text fallback', () => {
  const aiDocService = read('src/ai/aiDocumentService.ts');
  const materialImport = read('src/screens/AiMaterialImportScreen.tsx');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const viewer = read('src/components/reader/UniversalDocumentViewer.tsx');

  assert.match(aiDocService, /resolveAttachmentKind\(document\.mimeType, document\.originalFilename, document\.localUri/);
  assert.match(aiDocService, /containsBinaryNullOrGarbledText\(/);
  assert.match(materialImport, /resolveAttachmentKind\(/);
  assert.match(materialImport, /资料库当前仅支持文本\/PDF\/Word\/PPT 文档/);
  assert.match(sessionConfig, /containsBinaryNullOrGarbledText\(text\)/);
  assert.match(viewer, /resolveAttachmentKind\(mimeType, fileName, fileUri, \{\s*includeSvg:\s*true/);
  assert.match(viewer, /containsBinaryNullOrGarbledText\(/);
});
