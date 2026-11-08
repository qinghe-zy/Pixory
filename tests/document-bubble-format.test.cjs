const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadModule(path.join(path.dirname(targetPath), reqPath), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

const {
  resolveWeChatFileTypeStyle,
  formatWeChatFileSize,
  truncateFileNameMiddle,
} = loadModule('../src/components/document/fileTypeResolver.ts');

test('Document format resolution - Word (.docx, .doc)', () => {
  const styleDocx = resolveWeChatFileTypeStyle('transformer_通俗但深入系统讲解.docx');
  assert.equal(styleDocx.label, 'W');
  assert.equal(styleDocx.bgColor, '#1877F2');
  assert.equal(styleDocx.textColor, '#FFFFFF');
  assert.equal(styleDocx.fontSize, 18);
  assert.equal(styleDocx.foldColor, 'rgba(0, 0, 0, 0.22)');

  const styleDoc = resolveWeChatFileTypeStyle('report.doc');
  assert.equal(styleDoc.label, 'W');
  assert.equal(styleDoc.bgColor, '#1877F2');
});

test('Document format resolution - PDF (.pdf)', () => {
  const style = resolveWeChatFileTypeStyle('基于Web的个性化博客推荐系统...与实现.pdf');
  assert.equal(style.label, 'PDF');
  assert.equal(style.bgColor, '#E53935');
  assert.equal(style.textColor, '#FFFFFF');
  assert.equal(style.fontSize, 12);
  assert.equal(style.letterSpacing, -0.4);
});

test('Document format resolution - HTML (.html, .htm)', () => {
  const style = resolveWeChatFileTypeStyle('PDF 格式发展简史.html');
  assert.equal(style.label, 'HTML');
  assert.equal(style.bgColor, '#CAD3E2');
  assert.equal(style.textColor, '#657591');
  assert.equal(style.fontSize, 10);
  assert.equal(style.foldColor, 'rgba(0, 0, 0, 0.18)');
});

test('Document format resolution - Markdown (.md, .markdown)', () => {
  const style = resolveWeChatFileTypeStyle('CONSENT.md');
  assert.equal(style.label, 'MD');
  assert.equal(style.bgColor, '#CAD3E2');
  assert.equal(style.textColor, '#657591');
  assert.equal(style.fontSize, 12);
});

test('Document format resolution - Excel (.xlsx, .xls, .csv)', () => {
  const styleXlsx = resolveWeChatFileTypeStyle('财务报表2026.xlsx');
  assert.equal(styleXlsx.label, 'X');
  assert.equal(styleXlsx.bgColor, '#20A055');
  assert.equal(styleXlsx.textColor, '#FFFFFF');
  assert.equal(styleXlsx.fontSize, 18);

  const styleCsv = resolveWeChatFileTypeStyle('data.csv');
  assert.equal(styleCsv.label, 'X');
  assert.equal(styleCsv.bgColor, '#20A055');
});

test('Document format resolution - PowerPoint (.pptx, .ppt)', () => {
  const style = resolveWeChatFileTypeStyle('年终述职汇报.pptx');
  assert.equal(style.label, 'P');
  assert.equal(style.bgColor, '#EA5B2B');
  assert.equal(style.textColor, '#FFFFFF');
  assert.equal(style.fontSize, 18);
});

test('Document format resolution - Plain text (.txt)', () => {
  const style = resolveWeChatFileTypeStyle('notes.txt');
  assert.equal(style.label, 'TXT');
  assert.equal(style.bgColor, '#CAD3E2');
  assert.equal(style.textColor, '#657591');
  assert.equal(style.fontSize, 12);
});

test('Document format resolution - Archive (.zip, .rar, .7z, .tar, .gz)', () => {
  const style = resolveWeChatFileTypeStyle('backup_20261107.zip');
  assert.equal(style.label, 'ZIP');
  assert.equal(style.bgColor, '#7B68EE');
  assert.equal(style.textColor, '#FFFFFF');
});

test('Document format resolution - Code & structured data (.json, .py, .ts)', () => {
  const styleJson = resolveWeChatFileTypeStyle('package.json');
  assert.equal(styleJson.label, 'JSON');
  assert.equal(styleJson.bgColor, '#CAD3E2');
  assert.equal(styleJson.textColor, '#657591');

  const stylePy = resolveWeChatFileTypeStyle('main.py');
  assert.equal(stylePy.label, 'PY');
  assert.equal(stylePy.bgColor, '#CAD3E2');

  const styleTs = resolveWeChatFileTypeStyle('app.ts');
  assert.equal(styleTs.label, 'TS');
  assert.equal(styleTs.bgColor, '#CAD3E2');
});

test('Document format resolution - Image sent as file (.png, .jpg)', () => {
  const stylePng = resolveWeChatFileTypeStyle('photo_backup.png');
  assert.equal(stylePng.label, 'IMG');
  assert.equal(stylePng.bgColor, '#5C6BC0');
  assert.equal(stylePng.textColor, '#FFFFFF');

  const styleEncoded = resolveWeChatFileTypeStyle('my%20presentation.pptx');
  assert.equal(styleEncoded.label, 'P');
  assert.equal(styleEncoded.bgColor, '#EA5B2B');
});

test('Document format resolution - Unknown / Fallback', () => {
  const styleApk = resolveWeChatFileTypeStyle('app-release.apk');
  assert.equal(styleApk.label, 'APK');
  assert.equal(styleApk.bgColor, '#CAD3E2');

  const styleNoExt = resolveWeChatFileTypeStyle('my_unknown_blob');
  assert.equal(styleNoExt.label, 'FILE');
  assert.equal(styleNoExt.bgColor, '#CAD3E2');

  const styleLongExt = resolveWeChatFileTypeStyle('data.abcdefghijk');
  assert.equal(styleLongExt.label, 'FILE');
});

test('File size formatting matches WeChat prototype', () => {
  // 129 B
  assert.equal(formatWeChatFileSize(129), '129 B');
  // 9.8 KB (9.8 * 1024 = 10035.2 bytes)
  assert.equal(formatWeChatFileSize(9.8 * 1024), '9.8 KB');
  // 11.2 KB
  assert.equal(formatWeChatFileSize(11.2 * 1024), '11.2 KB');
  // 55.5 KB
  assert.equal(formatWeChatFileSize(55.5 * 1024), '55.5 KB');
  // 3.6 MB (3.6 * 1024 * 1024 bytes)
  assert.equal(formatWeChatFileSize(3.6 * 1024 * 1024), '3.6 MB');
  // 1.5 GB
  assert.equal(formatWeChatFileSize(1.5 * 1024 * 1024 * 1024), '1.5 GB');
  // 0 bytes
  assert.equal(formatWeChatFileSize(0), '0 B');
  // 0 / undefined fallback
  assert.equal(formatWeChatFileSize(undefined, undefined), '0 B');
  // Char count fallback
  assert.equal(formatWeChatFileSize(undefined, 2048), '4.0 KB');
});

test('Filename middle-truncation preserves extension', () => {
  // 短文件名不截断
  assert.equal(truncateFileNameMiddle('report3.docx'), 'report3.docx');
  assert.equal(truncateFileNameMiddle('CONSENT.md'), 'CONSENT.md');

  // 超长文件名截断中间并保留扩展名
  const longName = '基于Web的个性化博客推荐系统设计与实现完整毕业论文.pdf';
  const truncated = truncateFileNameMiddle(longName, 14, 8);
  assert.ok(truncated.endsWith('.pdf'));
  assert.ok(truncated.includes('...'));
  assert.ok(truncated.length < longName.length);
});

test('DocumentBubbleCard source code adheres 1:1 to WeChat prototype dimensions', () => {
  const cardSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/document/DocumentBubbleCard.tsx'), 'utf8');

  // 1. 265px 宽度与 78px 最小高度
  assert.ok(cardSrc.includes('width: 265'), 'Card width must be exactly 265px');
  assert.ok(cardSrc.includes('minHeight: 78'), 'Card minHeight must be exactly 78px');

  // 2. 5px 圆角与纯白底色
  assert.ok(cardSrc.includes("backgroundColor: '#FFFFFF'"), 'Card background must be white');
  assert.ok(cardSrc.includes('borderRadius: 5'), 'Card borderRadius must be 5px');

  // 3. 内边距 p-3.5 pr-3 (14px 12px 14px 14px)
  assert.ok(cardSrc.includes('paddingLeft: 14'), 'paddingLeft must be 14px');
  assert.ok(cardSrc.includes('paddingRight: 12'), 'paddingRight must be 12px');

  // 4. 文字规范
  assert.ok(cardSrc.includes('fontSize: 15'), 'Title fontSize must be 15px');
  assert.ok(cardSrc.includes("color: '#111111'"), 'Title color must be #111111');
  assert.ok(cardSrc.includes('fontSize: 12'), 'Size fontSize must be 12px');
  assert.ok(cardSrc.includes("color: '#8E8E93'"), 'Size color must be #8E8E93');
  assert.ok(cardSrc.includes('marginTop: 8'), 'Size marginTop must be 8px (mt-2)');
});

test('WeChatFileIcon vector geometry integrity', () => {
  const iconSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/document/WeChatFileIcon.tsx'), 'utf8');

  // 42x52 尺寸
  assert.ok(iconSrc.includes('width: 42'), 'Icon width must be 42');
  assert.ok(iconSrc.includes('height: 52'), 'Icon height must be 52');

  // 切角与折角翻折三角路径
  assert.ok(iconSrc.includes('M 4 0 H 30 L 42 12 V 48 A 4 4 0 0 1 38 52 H 4 A 4 4 0 0 1 0 48 V 4 A 4 4 0 0 1 4 0 Z'), 'Cut corner path must be valid');
  assert.ok(iconSrc.includes('M 30 0 L 42 12 H 33 A 3 3 0 0 1 30 9 V 0 Z'), 'Fold flap path must be valid');
});

test('DocumentBubbleRenderer provides white beak at top 14px', () => {
  const rendererSrc = fs.readFileSync(path.resolve(__dirname, '../src/im/components/renderers/DocumentBubbleRenderer.tsx'), 'utf8');

  // 尖角纯白与 top 14px
  assert.ok(rendererSrc.includes('customColor="#FFFFFF"'), 'Beak must be colored #FFFFFF');
  assert.ok(rendererSrc.includes('offsetTop={14}'), 'Beak offsetTop must be 14');
});
