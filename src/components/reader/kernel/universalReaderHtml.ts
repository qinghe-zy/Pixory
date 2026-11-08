import type {
  AiDocumentReaderLocator,
  DocumentAnnotation,
  DocumentFontFamily,
  DocumentFormat,
  DocumentLayoutMode,
  DocumentReaderTheme,
  HtmlViewMode,
} from '../../../ai/readers/readerTypes';
import { DOCX_PREVIEW_SOURCE_CODE } from './vendor/docxPreview.bundle.js';
import { JSZIP_SOURCE_CODE } from './vendor/jszip.bundle.js';
import { PPTX_PREVIEW_SOURCE_CODE } from './vendor/pptxPreview.bundle.js';

export interface UniversalReaderHtmlOptions {
  format: DocumentFormat;
  /** For markdown/html/txt: content string or HTML; For docx: base64 encoded document */
  content: string;
  theme?: DocumentReaderTheme;
  fontSize?: number;
  layoutMode?: DocumentLayoutMode;
  fontFamily?: DocumentFontFamily;
  htmlViewMode?: HtmlViewMode;
  enableBlockIds?: boolean;
  locator?: AiDocumentReaderLocator;
  annotations?: DocumentAnnotation[];
  fallbackSemanticHtml?: string;
}

export function getThemeVariables(theme: DocumentReaderTheme): string {
  switch (theme) {
    case 'sepia':
      return `
        --canvas: #f4ecd8;
        --surface-card: #e8dcc2;
        --surface-dark: #2c2216;
        --ink: #2c2216;
        --body-strong: #382c1e;
        --body: #4a3b2c;
        --muted: #7c6853;
        --primary: #b26a3c;
        --primary-light: rgba(178, 106, 60, 0.16);
        --hairline: #ddd0b2;
      `;
    case 'dark':
      return `
        --canvas: #141413;
        --surface-card: #201f1d;
        --surface-dark: #0a0a09;
        --ink: #ededea;
        --body-strong: #dedbd4;
        --body: #cbc8c0;
        --muted: #8c8982;
        --primary: #de8e72;
        --primary-light: rgba(222, 142, 114, 0.22);
        --hairline: #2e2d29;
      `;
    case 'white':
      return `
        --canvas: #ffffff;
        --surface-card: #f8fafc;
        --surface-dark: #0f172a;
        --ink: #0f172a;
        --body-strong: #1e293b;
        --body: #334155;
        --muted: #64748b;
        --primary: #2563eb;
        --primary-light: rgba(37, 99, 235, 0.12);
        --hairline: #e2e8f0;
      `;
    case 'paper':
    default:
      return `
        --canvas: #faf9f5;
        --surface-card: #efe9de;
        --surface-dark: #181715;
        --ink: #141413;
        --body-strong: #252523;
        --body: #3d3d3a;
        --muted: #6c6a64;
        --primary: #cc785c;
        --primary-light: rgba(204, 120, 92, 0.14);
        --hairline: #e6dfd8;
      `;
  }
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSourceCodeHtml(rawText: string, showLines = true): string {
  const lines = (rawText || '').split(/\r?\n/);
  const rows = lines.map((line, i) => {
    const no = showLines ? `<span class="pixory-line-no">${i + 1}</span>` : '';
    const text = escapeHtmlText(line) || '&nbsp;';
    return `<div class="pixory-source-line">${no}<span class="pixory-line-text">${text}</span></div>`;
  });
  return `<div class="pixory-source-box">${rows.join('')}</div>`;
}

export function getUniversalReaderHtml(options: UniversalReaderHtmlOptions): string {
  const {
    format,
    content,
    theme = 'paper',
    fontSize = 16,
    layoutMode = 'flow',
    fontFamily = 'sans',
    htmlViewMode = 'preview',
    enableBlockIds = true,
    locator,
    annotations = [],
    fallbackSemanticHtml = '',
  } = options;

  const isPreRenderedHtml = typeof content === 'string' && content.trim().startsWith('<');
  let initialBodyHtml = '';
  if (format === 'html' && htmlViewMode === 'source') {
    initialBodyHtml = formatSourceCodeHtml(content, true);
  } else if (format === 'txt') {
    initialBodyHtml = formatSourceCodeHtml(content, true);
  } else if (format === 'docx') {
    if (!content || !content.trim()) {
      initialBodyHtml = `<div style="color:var(--muted);text-align:center;padding:48px 16px;">
        <p style="font-weight:600;font-size:15px;margin-bottom:8px;color:var(--ink);">DOCX 文档暂无提取内容</p>
        <p style="font-size:12px;">建议在右上角菜单中选择使用外部办公应用打开</p>
      </div>`;
    } else if (isPreRenderedHtml) {
      initialBodyHtml = content;
    } else {
      initialBodyHtml = `<div class="pixory-loading-container" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;gap:14px;color:var(--muted);">
        <div class="pixory-spinner" style="width:28px;height:28px;border:2.5px solid var(--hairline);border-top-color:var(--primary);border-radius:50%;animation:pixorySpin 0.8s linear infinite;"></div>
        <p style="font-size:14px;margin:0;font-weight:500;color:var(--ink);">正在高保真排版渲染 Word 文档...</p>
      </div>`;
    }
  } else if (format === 'pptx') {
    if (!content || !content.trim()) {
      initialBodyHtml = `<div style="color:var(--muted);text-align:center;padding:48px 16px;">
        <p style="font-weight:600;font-size:15px;margin-bottom:8px;color:var(--ink);">PPTX 幻灯片暂无提取内容</p>
        <p style="font-size:12px;">建议在右上角菜单中选择使用外部办公应用打开</p>
      </div>`;
    } else if (isPreRenderedHtml) {
      initialBodyHtml = content;
    } else {
      initialBodyHtml = `<div class="pixory-loading-container" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;gap:14px;color:var(--muted);">
        <div class="pixory-spinner" style="width:28px;height:28px;border:2.5px solid var(--hairline);border-top-color:var(--primary);border-radius:50%;animation:pixorySpin 0.8s linear infinite;"></div>
        <p style="font-size:14px;margin:0;font-weight:500;color:var(--ink);">正在高保真排版渲染幻灯片...</p>
      </div>`;
    }
  } else {
    initialBodyHtml = content || '';
  }

  let vendorScriptBody = '';
  if (format === 'docx') {
    vendorScriptBody = `
${JSZIP_SOURCE_CODE}
if (typeof JSZip !== 'undefined') {
  window.JSZip = JSZip;
}
${DOCX_PREVIEW_SOURCE_CODE}
`;
  } else if (format === 'pptx') {
    vendorScriptBody = `
${PPTX_PREVIEW_SOURCE_CODE}
`;
  }

  const encodedAnnotations = encodeURIComponent(JSON.stringify(annotations));
  const encodedLocator = encodeURIComponent(JSON.stringify(locator || {}));
  const encodedSemanticDocxFallback = encodeURIComponent(fallbackSemanticHtml || '');
  const isDocx = format === 'docx';

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${theme}" data-layout="${layoutMode}" data-font="${fontFamily}" data-view="${htmlViewMode}" data-doc-type="${format}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <title>Pixory Document Reader</title>
  <style>
    :root {
      ${getThemeVariables(theme)}
      --font-size: ${fontSize}px;
    }

    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      margin: 0;
      padding: 0;
      background-color: var(--canvas);
      color: var(--body);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: var(--font-size);
      line-height: 1.75;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
      transition: background-color 0.25s ease, color 0.25s ease;
    }

    /* ── Document Type Office Desk Backgrounds ── */
    html[data-doc-type="pptx"] body {
      background-color: #F0F2F5 !important;
    }
    html[data-doc-type="docx"] body {
      background-color: var(--surface, #FFFFFF) !important;
      color: var(--body-text, #1F2329) !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    /* ── Font Family Switching ── */
    html[data-font="sans"] body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }
    html[data-font="serif"] body {
      font-family: "Songti SC", "SimSun", "STSong", "Georgia", "Cambria", "Times New Roman", serif;
    }
    html[data-font="mono"] body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
    }

    /* ── Layout Modes (Flow vs Print) ── */
    html[data-layout="flow"] .docx-wrapper > section.docx,
    html[data-layout="flow"] .docx {
      columns: 1 !important;
      column-count: 1 !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    html[data-layout="print"] .docx-wrapper {
      padding: 16px 8px !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
    }
    html[data-layout="print"] .docx-wrapper > section.docx {
      margin: 0 auto 24px auto !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12) !important;
      max-width: 820px !important;
    }

    #reader-viewport {
      width: 100%;
      min-height: 100vh;
      padding: 24px 18px 80px 18px;
    }

    /* Headings */
    h1, h2, h3, h4, h5, h6 {
      color: var(--ink);
      font-weight: 600;
      margin-top: 1.8em;
      margin-bottom: 0.8em;
      line-height: 1.35;
      scroll-margin-top: 24px;
    }

    h1 { font-size: 1.8em; letter-spacing: -0.02em; margin-top: 0.6em; }
    h2 { font-size: 1.45em; border-bottom: 1px solid var(--hairline); padding-bottom: 0.35em; }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1.1em; }
    h5 { font-size: 1em; }
    h6 { font-size: 0.9em; color: var(--muted); }

    /* Paragraphs and typography */
    p {
      margin-top: 0;
      margin-bottom: 1.4em;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    a {
      color: var(--primary);
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.2s;
    }
    a:active {
      border-bottom-color: var(--primary);
    }

    /* Blockquotes */
    blockquote {
      margin: 0 0 1.5em 0;
      padding: 0.6em 0 0.6em 1.2em;
      border-left: 3.5px solid var(--primary);
      background-color: var(--surface-card);
      border-radius: 0 8px 8px 0;
      color: var(--muted);
      font-style: italic;
    }
    blockquote p:last-child { margin-bottom: 0; }

    /* Code & Pre */
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.88em;
      background-color: var(--surface-card);
      padding: 0.2em 0.4em;
      border-radius: 4px;
      color: var(--body-strong);
    }

    pre {
      background-color: var(--surface-card);
      padding: 14px 16px;
      border-radius: 10px;
      overflow-x: auto;
      border: 1px solid var(--hairline);
      margin-bottom: 1.5em;
    }
    pre code {
      background-color: transparent;
      padding: 0;
      font-size: 0.9em;
      color: var(--body);
      white-space: pre;
    }

    /* Lists */
    ul, ol {
      margin-bottom: 1.4em;
      padding-left: 1.5em;
    }
    li {
      margin-bottom: 0.4em;
    }

    /* Tables & Gradient Responsive Shadows */
    .pixory-table-wrapper {
      position: relative;
      width: 100%;
      overflow-x: auto;
      margin-bottom: 1.6em;
      -webkit-overflow-scrolling: touch;
      border: 1px solid var(--hairline);
      border-radius: 8px;
      background:
        linear-gradient(to right, var(--canvas) 30%, rgba(255, 255, 255, 0)),
        linear-gradient(to right, rgba(255, 255, 255, 0), var(--canvas) 70%) 100% 0,
        radial-gradient(farthest-side at 0 50%, rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0)),
        radial-gradient(farthest-side at 100% 50%, rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0)) 100% 0;
      background-repeat: no-repeat;
      background-size: 40px 100%, 40px 100%, 14px 100%, 14px 100%;
      background-attachment: local, local, scroll, scroll;
    }
    table {
      border-collapse: collapse;
      width: 100% !important;
      margin-bottom: 0 !important;
      font-size: 0.92em;
    }
    th {
      background-color: var(--surface-card);
      color: var(--ink);
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border-bottom: 2px solid var(--hairline);
      white-space: nowrap;
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--hairline);
      vertical-align: top;
      color: var(--body);
    }
    tr:last-child td {
      border-bottom: none;
    }

    /* ── Source Code View ── */
    .pixory-source-box {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.65;
      background: var(--surface-card);
      border: 1px solid var(--hairline);
      border-radius: 8px;
      padding: 12px 0;
      overflow-x: auto;
      white-space: pre;
    }
    .pixory-source-line {
      display: flex;
      padding: 0 12px;
    }
    .pixory-source-line:hover {
      background: var(--primary-light);
    }
    .pixory-line-no {
      color: var(--muted);
      width: 44px;
      text-align: right;
      padding-right: 14px;
      user-select: none;
      flex-shrink: 0;
      font-size: 12px;
    }
    .pixory-line-text {
      color: var(--body);
      flex: 1;
      word-break: break-all;
    }

    /* ── Word docx-preview Overrides & Mobile Page Discipline ── */
    .docx-wrapper {
      background: transparent !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
      border: none !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    section.pixory-docx,
    .pixory-docx-page,
    section.docx {
      width: 100% !important;
      max-width: 100% !important;
      padding: 20px 16px !important;
      box-sizing: border-box !important;
      margin: 0 auto 16px auto !important;
      min-height: auto !important;
      box-shadow: none !important;
      border: none !important;
      background-color: var(--canvas) !important;
      color: var(--body) !important;
    }

    section.pixory-docx > header,
    .docx-header,
    header[class*="docx-header"] {
      margin-top: 0 !important;
      padding-bottom: 12px !important;
      border-bottom: 1px solid var(--hairline);
    }

    section.pixory-docx table,
    .pixory-docx-page table,
    .docx-wrapper table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: auto !important;
      box-sizing: border-box !important;
    }

    section.pixory-docx img,
    .docx-wrapper img {
      max-width: 100% !important;
      height: auto !important;
      box-sizing: border-box !important;
    }

    /* Dark mode adaptive overrides for docx */
    html[data-theme="dark"] section.pixory-docx,
    html[data-theme="dark"] .docx-wrapper,
    html[data-theme="dark"] .docx-wrapper > section.docx {
      background-color: var(--canvas) !important;
      color: var(--body) !important;
    }
    html[data-theme="dark"] section.pixory-docx [style*="color: rgb(0, 0, 0)"],
    html[data-theme="dark"] section.pixory-docx [style*="color: #000000"],
    html[data-theme="dark"] section.pixory-docx [style*="color:#000000"],
    html[data-theme="dark"] section.pixory-docx [style*="color: #000"],
    html[data-theme="dark"] section.pixory-docx [style*="color:#000"],
    html[data-theme="dark"] section.pixory-docx [style*="color: black"] {
      color: var(--ink) !important;
    }

    /* Monospace / Code Font Tight Spacing & Wrap Protection */
    section.pixory-docx code,
    section.pixory-docx pre,
    section.pixory-docx [style*="Courier"],
    section.pixory-docx [style*="Consolas"],
    section.pixory-docx [style*="monospace"],
    code, pre, .pixory-source-box {
      font-family: Consolas, "Courier New", Courier, monospace !important;
      white-space: pre-wrap !important;
      word-break: break-all !important;
      overflow-wrap: break-word !important;
      line-height: 1.35 !important;
    }

    /* Loading Pulse Spinner Animation */
    @keyframes pixorySpin {
      to { transform: rotate(360deg); }
    }

    /* ── pptx-preview Styles & Presentation Mode ── */
    .pptx-preview-wrapper-next,
    .pptx-preview-wrapper-pagination {
      display: none !important;
    }

    /* Normal Preview Mode (Mode: List, aligned with WPS) */
    html[data-doc-type="pptx"]:not([data-presentation="true"]) .pptx-preview-wrapper {
      width: 100% !important;
      max-width: 860px !important;
      height: auto !important;
      overflow: visible !important;
      background: transparent !important;
      margin: 0 auto !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 16px !important;
      padding: 12px 10px 80px 10px !important;
      box-sizing: border-box !important;
    }

    html[data-doc-type="pptx"]:not([data-presentation="true"]) .pptx-preview-slide-wrapper,
    html[data-doc-type="pptx"]:not([data-presentation="true"]) div[class*="pptx-preview-slide-wrapper-"] {
      max-width: 100% !important;
      border-radius: 8px !important;
      overflow: hidden !important;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08) !important;
      margin: 0 auto !important;
      contain: layout paint;
    }

    /* 强力防御 PPT 内部极端行距/缩放导致的段落文字重叠挤压 */
    .pptx-preview-wrapper p,
    .pptx-preview-slide-wrapper p,
    div[class*="pptx-preview-slide-wrapper-"] p,
    .pptx-preview-wrapper .text-wrapper p,
    .pptx-preview-wrapper .text-wrapper span {
      line-height: 1.35 !important;
      min-height: 1.1em;
    }

    /* Presentation / Deck Playing Mode (Mode: Slide) */
    html[data-presentation="true"] .pptx-preview-wrapper {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      padding: 0 !important;
      margin: 0 !important;
      background: #000000 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 9999 !important;
      overflow: hidden !important;
    }

    html[data-presentation="true"] .pptx-preview-slide-wrapper,
    html[data-presentation="true"] div[class*="pptx-preview-slide-wrapper-"] {
      display: none !important;
    }

    html[data-presentation="true"] .pptx-preview-slide-wrapper.deck-active,
    html[data-presentation="true"] div[class*="pptx-preview-slide-wrapper-"].deck-active {
      display: block !important;
      position: relative !important;
      margin: auto !important;
      animation: pixoryDeckFade 0.25s ease-out;
    }

    /* ── PPTX Slide Deck View ── */
    .pptx-slide-canvas,
    .pptx-slide-card {
      width: 100%;
      max-width: 860px;
      aspect-ratio: 16 / 9;
      aspect-ratio: var(--slide-aspect, 16 / 9);
      margin: 0 auto 14px auto;
      background: #FFFFFF !important;
      color: #111111;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08), 0 0 1px rgba(15, 23, 42, 0.12);
      border-radius: 6px;
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
      padding: 0 !important;
      contain: layout paint;
    }

    .pptx-slide-canvas-inner,
    .pptx-spatial-stage {
      display: block !important;
      width: var(--logical-w, 960px);
      height: var(--logical-h, 540px);
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: top left;
      transform: scale(var(--slide-scale, 1));
      box-sizing: border-box;
      overflow: hidden;
    }

    .pptx-slide-index-watermark {
      position: absolute;
      right: 8px;
      bottom: 6px;
      padding: 2px 6px;
      font-size: 10px;
      line-height: 1.2;
      color: rgba(0, 0, 0, 0.4);
      background: rgba(255, 255, 255, 0.7);
      border-radius: 4px;
      pointer-events: none;
      z-index: 25;
      user-select: none;
    }

    .pptx-spatial-elem {
      position: absolute;
      box-sizing: border-box;
      word-break: break-word;
    }
    .pptx-spatial-text {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      padding: 0;
      overflow: visible;
    }
    .pptx-shape-text-inner {
      overflow: visible;
      word-break: break-word;
    }
    .pptx-spatial-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      margin: 0 !important;
      box-shadow: none !important;
      border-radius: 0;
    }
    .pptx-spatial-table-wrapper {
      width: 100%;
      height: 100%;
      overflow: auto;
    }
    .pptx-spatial-table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      font-size: 0.85em;
    }
    .pptx-spatial-table th, .pptx-spatial-table td {
      border: 1px solid rgba(0, 0, 0, 0.15);
      padding: 4px 6px;
    }
    .pptx-p {
      margin: 0 0 2px 0 !important;
      line-height: 1.2 !important;
    }
    .pptx-slide-images-grid {
      display: none;
    }

    .pptx-slide-notes {
      margin: 8px auto 16px auto;
      max-width: 860px;
      padding: 10px 14px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.04);
      border-left: 3px solid var(--primary);
      font-size: 0.88em;
      color: var(--muted);
      line-height: 1.6;
    }
    .pptx-notes-label {
      font-weight: 600;
      color: var(--primary);
      margin-right: 6px;
    }

    /* Presentation Mode (Deck Pager) */
    html[data-presentation="true"] {
      height: 100%;
      overflow: hidden;
      background-color: #0b0c0e !important;
    }
    html[data-presentation="true"] body {
      height: 100%;
      overflow: hidden;
      background-color: #0b0c0e !important;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 0;
    }
    html[data-presentation="true"] #reader-viewport {
      width: 100vw;
      height: 100vh;
      max-width: none;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      position: relative;
    }
    html[data-presentation="true"] #reader-content {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    html[data-presentation="true"] .pptx-slide-card {
      display: none;
      width: 100vw;
      height: 100vh;
      max-width: none;
      max-height: none;
      aspect-ratio: auto;
      margin: 0;
      padding: 0 !important;
      border-radius: 0;
      box-shadow: none;
      border: none;
      background-color: #0b0c0e !important;
    }
    html[data-presentation="true"] .pptx-slide-card.deck-active {
      display: flex !important;
      animation: pixoryDeckFade 0.25s ease-out;
    }
    html[data-presentation="true"] .pptx-slide-notes {
      display: none;
    }
    @keyframes pixoryDeckFade {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }

    /* Deck Floating Control Pill */
    #deck-control-pill,
    .pptx-deck-controls {
      display: none;
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    html[data-presentation="true"] #deck-control-pill,
    html[data-presentation="true"] .pptx-deck-controls {
      display: inline-flex;
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(24, 24, 27, 0.94);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 999px;
      padding: 6px 14px;
      align-items: center;
      gap: 8px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
      z-index: 99999;
      user-select: none;
      white-space: nowrap !important;
      max-width: 94vw !important;
    }
    .deck-pill-btn,
    .pptx-deck-controls button {
      background: transparent;
      border: none;
      color: #f4f4f5;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 14px;
      min-height: 38px;
      border-radius: 999px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      outline: none;
      touch-action: manipulation;
      white-space: nowrap !important;
      flex-shrink: 0 !important;
    }
    .deck-pill-btn:active,
    .pptx-deck-controls button:active {
      background: rgba(255, 255, 255, 0.16);
    }
    .deck-btn-disabled {
      opacity: 0.3 !important;
      cursor: not-allowed !important;
      pointer-events: none !important;
    }
    .deck-pill-page {
      color: #a1a1aa;
      font-size: 12px;
      font-weight: 600;
      min-width: 64px;
      text-align: center;
      white-space: nowrap !important;
      flex-shrink: 0 !important;
    }
    .deck-pill-exit {
      color: #ef4444;
      margin-left: 4px;
      border-left: 1px solid rgba(255, 255, 255, 0.14);
      padding-left: 12px;
    }
    html[data-presentation="true"] .pptx-slide-index-watermark {
      display: none !important;
    }

    /* Images */
    img {
      max-width: 100% !important;
      height: auto !important;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      margin: 1.5em 0;
      display: block;
    }

    /* DOCX-specific styling overrides */
    .docx-wrapper {
      background: transparent !important;
      padding: 0 !important;
    }
    .docx-wrapper > section.docx {
      width: 100% !important;
      max-width: 100% !important;
      min-height: auto !important;
      box-shadow: none !important;
      margin: 0 0 24px 0 !important;
      padding: 16px 12px !important;
      background: var(--canvas) !important;
      color: var(--body) !important;
      border: 1px solid var(--hairline) !important;
      border-radius: 12px !important;
      box-sizing: border-box !important;
    }
    .docx-wrapper p {
      line-height: 1.7 !important;
    }
    .pixory-docx-multicolumn {
      column-count: 2;
      column-gap: 28px;
      column-rule: 1px solid var(--hairline);
      margin: 1.4em 0;
    }
    .pixory-docx-multicolumn > * {
      break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    @media (max-width: 520px) {
      .pixory-docx-multicolumn {
        column-count: 1;
        column-gap: 0;
        column-rule: none;
      }
    }
    .pixory-docx-image-wrapper {
      margin: 1.4em auto;
      text-align: center;
    }
    .pixory-docx-image {
      max-width: 100% !important;
      max-height: 55vh;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      margin: 0 auto !important;
      display: inline-block !important;
    }
    .pixory-docx-h1 { font-size: 1.7em; font-weight: 700; margin: 1.4em 0 0.6em; color: var(--ink); line-height: 1.35; }
    .pixory-docx-h2 { font-size: 1.4em; font-weight: 600; margin: 1.2em 0 0.5em; color: var(--ink); border-bottom: 1px solid var(--hairline); padding-bottom: 0.3em; }
    .pixory-docx-h3 { font-size: 1.2em; font-weight: 600; margin: 1.1em 0 0.4em; color: var(--ink); }
    .pixory-docx-h4 { font-size: 1.1em; font-weight: 600; margin: 1em 0 0.3em; color: var(--ink); }
    .pixory-docx-h5, .pixory-docx-h6 { font-size: 1em; font-weight: 600; margin: 0.9em 0 0.3em; color: var(--muted); }
    .pixory-docx-p { margin: 0 0 1.2em 0; line-height: 1.75; color: var(--body); }
    .pixory-docx-list-item { display: flex; align-items: flex-start; margin-bottom: 0.5em; line-height: 1.7; }
    .pixory-docx-bullet { color: var(--primary); font-weight: bold; margin-right: 8px; flex-shrink: 0; }
    .pixory-docx-num-badge { display: inline-block; min-width: 1.6em; font-weight: 600; color: var(--primary); margin-right: 8px; flex-shrink: 0; }
    .pixory-docx-list-content { flex: 1; color: var(--body); }
    .pixory-docx-callout {
      margin: 16px 0;
      padding: 14px 18px;
      border-radius: 8px;
      background: var(--surface-card);
      border-left: 4px solid var(--primary);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    .pixory-docx-callout-body {
      font-size: 0.95em;
      color: var(--body-strong);
      line-height: 1.65;
    }
    .pixory-docx-blockquote {
      margin: 14px 0;
      padding: 8px 16px;
      border-left: 3.5px solid var(--primary);
      background: var(--surface-card);
      border-radius: 0 8px 8px 0;
      font-style: italic;
    }
    .pixory-docx-blockquote p { margin: 0; }
    .pixory-docx-math {
      font-family: "Cambria Math", "Latin Modern Math", serif;
      font-style: italic;
      color: var(--primary);
      padding: 0 4px;
    }
    .pixory-docx-math-frac {
      display: inline-flex;
      flex-direction: column;
      vertical-align: middle;
      text-align: center;
      font-size: 0.85em;
      padding: 0 2px;
      line-height: 1.1;
    }
    .pixory-docx-math-num {
      border-bottom: 1px solid currentColor;
      padding-bottom: 1px;
    }
    .pixory-docx-math-den {
      padding-top: 1px;
    }
    .pixory-docx-table-wrapper { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 1.4em 0; border: 1px solid var(--hairline); border-radius: 8px; }
    .pixory-docx-table { width: 100%; border-collapse: collapse; font-size: 0.92em; }
    .pixory-docx-table th { background-color: var(--surface-card); color: var(--ink); font-weight: 600; padding: 10px 12px; border: 1px solid var(--hairline); text-align: left; }
    .pixory-docx-table td { padding: 9px 12px; border: 1px solid var(--hairline); color: var(--body); vertical-align: top; }
    .pixory-docx-table tr:last-child td { border-bottom: none; }

    /* Block Anchor Hook (data-block-id) */
    [data-block-id] {
      position: relative;
      border-radius: 4px;
      transition: background-color 0.2s ease;
    }
    [data-block-id]:active {
      background-color: var(--primary-light);
    }
    .pixory-block-focused {
      outline: 2px solid var(--primary);
      background-color: var(--primary-light) !important;
    }

    /* Search Highlights */
    mark.pixory-search-match {
      background-color: rgba(255, 215, 0, 0.45);
      color: inherit;
      border-radius: 3px;
      padding: 1px 2px;
      transition: background-color 0.2s ease;
    }
    mark.pixory-search-match.active-match {
      background-color: #ff9800;
      color: #ffffff;
      outline: 2px solid #ff5722;
      box-shadow: 0 0 8px rgba(255, 87, 34, 0.5);
    }

    /* Annotation Layer Highlights */
    mark.pixory-annotation-highlight {
      background-color: var(--primary-light);
      border-bottom: 2px solid var(--primary);
      color: inherit;
      border-radius: 2px;
      padding: 0 2px;
    }

    /* Citation Locator Jump Highlight */
    .pixory-locator-target {
      background-color: var(--primary-light);
      border-left: 4px solid var(--primary);
      padding-left: 8px;
      border-radius: 4px;
      animation: pixoryFadeTarget 3s forwards;
    }
    @keyframes pixoryFadeTarget {
      0% { background-color: var(--primary-light); }
      70% { background-color: var(--primary-light); }
      100% { background-color: transparent; border-left-color: transparent; }
    }
  </style>
</head>
<body>
  <div id="reader-viewport">
    <div id="reader-content">${initialBodyHtml}</div>
  </div>

  <script>
    ${vendorScriptBody}
    window.onerror = function(msg, url, line, col, error) {
      console.warn('WebView client warning: ' + msg + ' (line ' + line + ')');
    };
    window.addEventListener('unhandledrejection', function(event) {
      console.warn('WebView unhandled rejection: ' + (event.reason ? (event.reason.message || String(event.reason)) : 'unknown'));
    });

    (function() {
      var contentEl = document.getElementById('reader-content');
      var ENABLE_BLOCKS = ${enableBlockIds ? 'true' : 'false'};

      function sendToNative(data) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
        }
      }

      var ANNOTATIONS = [];
      try {
        ANNOTATIONS = JSON.parse(decodeURIComponent("${encodedAnnotations}"));
      } catch(e) {}

      var LOCATOR = {};
      try {
        LOCATOR = JSON.parse(decodeURIComponent("${encodedLocator}"));
      } catch(e) {}

      var format = '${format}';
      var rawBase64 = ${isDocx || format === 'pptx' ? JSON.stringify(content) : 'null'};
      var isPreRendered = typeof rawBase64 === 'string' && rawBase64.trim().charAt(0) === '<';
      window.__semanticDocxFallback = '';
      try {
        window.__semanticDocxFallback = decodeURIComponent("${encodedSemanticDocxFallback}");
      } catch(e) {}

      if (format === 'docx' && typeof docx !== 'undefined' && rawBase64 && !isPreRendered) {
        contentEl.innerHTML = '';
        fetch('data:application/octet-stream;base64,' + rawBase64)
          .then(function(r) { return r.arrayBuffer(); })
          .then(function(buffer) {
            return docx.renderAsync(buffer, contentEl, null, {
              className: 'pixory-docx',
              inWrapper: false,
              ignoreWidth: true,
              ignoreHeight: true,
              useBase64URL: true,
              breakPages: false,
              renderHeaders: true,
              renderFooters: true,
              renderFootnotes: true,
              renderEndnotes: true
            });
          })
          .then(function() {
            var renderedText = (contentEl.innerText || contentEl.textContent || '').trim();
            if (renderedText.length < 40 && window.__semanticDocxFallback) {
              console.warn('docx-preview 渲染正文过少 (' + renderedText.length + ' 字符)，切换至语义解析兜底');
              contentEl.innerHTML = window.__semanticDocxFallback;
            }
            finalizeRendering();
            sendToNative({ type: 'renderSuccess' });
          })
          .catch(function(err) {
            console.error('docx preview render error:', err);
            if (window.__semanticDocxFallback) {
              console.warn('docx-preview 渲染抛错，切换至高保真语义兜底');
              contentEl.innerHTML = window.__semanticDocxFallback;
              finalizeRendering();
              sendToNative({ type: 'renderSuccess' });
            } else {
              sendToNative({ type: 'renderError', message: 'Word排版渲染受阻: ' + (err.message || String(err)) });
              finalizeRendering();
            }
          });
      } else if (format === 'pptx' && typeof pptxPreview !== 'undefined' && rawBase64 && !isPreRendered) {
        contentEl.innerHTML = '';
        fetch('data:application/octet-stream;base64,' + rawBase64)
          .then(function(r) { return r.arrayBuffer(); })
          .then(function(buffer) {
            var slideW = window.innerWidth || document.documentElement.clientWidth || 360;
            var slideH = Math.round(slideW * 9 / 16);
            window.__pptxSlideW = slideW;
            window.__pptxSlideH = slideH;
            var pptxInstance = pptxPreview.init(contentEl, {
              width: slideW,
              height: slideH,
              mode: 'list' // 默认阅读态呈现纵向全部幻灯片流（对齐图二 WPS 预览流）
            });
            window.__pptxInstance = pptxInstance;
            return pptxInstance.preview(buffer);
          })
          .then(function() {
            finalizeRendering();
            initDeckPager();
            sendToNative({
              type: 'pptxLoaded',
              slideCount: window.__pptxInstance ? window.__pptxInstance.slideCount : 0
            });
          })
          .catch(function(err) {
            console.error('pptx preview render error:', err);
            sendToNative({ type: 'renderError', message: 'PPT排版渲染受阻: ' + (err.message || String(err)) });
            finalizeRendering();
          });
      } else {
        finalizeRendering();
      }

      function finalizeRendering() {
        try { wrapTablesWithShadows(); } catch(e) {}
        if (ENABLE_BLOCKS) {
          try { indexBlocks(); } catch(e) {}
        }
        try { extractAndSendToc(); } catch(e) {}
        try { applyLocatorHighlight(); } catch(e) {}
        try { applyAnnotations(); } catch(e) {}
        try {
          initDeckPager();
          if (document.documentElement.getAttribute('data-presentation') === 'true') {
            showDeckSlide(0);
          }
        } catch(e) {}

        sendToNative({ type: 'ready' });
      }

      function wrapTablesWithShadows() {
        var tables = contentEl.querySelectorAll('table');
        tables.forEach(function(tbl) {
          if (tbl.parentElement && !tbl.parentElement.classList.contains('pixory-table-wrapper')) {
            var wrapper = document.createElement('div');
            wrapper.className = 'pixory-table-wrapper';
            tbl.parentNode.insertBefore(wrapper, tbl);
            wrapper.appendChild(tbl);
          }
        });
      }

      // ── Block ID Hook ──────────────────────────────────────────
      function indexBlocks() {
        var blocks = contentEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, table, tr, blockquote, pre');
        blocks.forEach(function(el, idx) {
          var tag = el.tagName.toLowerCase();
          var blockType = 'other';
          if (tag === 'p') blockType = 'paragraph';
          else if (tag.startsWith('h')) blockType = 'heading';
          else if (tag === 'table' || tag === 'tr') blockType = 'table-cell';
          else if (tag === 'blockquote') blockType = 'quote';
          else if (tag === 'pre') blockType = 'code-block';

          var blockId = 'block-' + idx;
          el.setAttribute('data-block-id', blockId);
          el.setAttribute('data-block-type', blockType);

          el.addEventListener('click', function(e) {
            // Avoid bubbling if nested
            e.stopPropagation();
            var textSnippet = (el.innerText || '').slice(0, 300).trim();
            sendToNative({
              type: 'blockPress',
              block: {
                blockId: blockId,
                blockType: blockType,
                text: textSnippet,
                offsetTop: el.offsetTop,
                tagName: tag,
              }
            });
          });
        });
      }

      // ── TOC Extraction ─────────────────────────────────────────
      function extractAndSendToc() {
        var headings = contentEl.querySelectorAll('h1, h2, h3, h4');
        var tocItems = [];
        headings.forEach(function(h, idx) {
          var id = 'heading-' + idx;
          h.id = id;
          var level = parseInt(h.tagName.substring(1), 10) || 2;
          tocItems.push({
            id: id,
            title: h.innerText.trim(),
            level: level,
            targetId: id,
          });
        });

        if (tocItems.length > 0) {
          sendToNative({ type: 'tocExtracted', toc: tocItems });
        }
      }

      // ── Locator Jumps ──────────────────────────────────────────
      function applyLocatorHighlight() {
        if (!LOCATOR) return;
        var targetEl = null;
        if (LOCATOR.blockId) {
          targetEl = document.querySelector('[data-block-id="' + LOCATOR.blockId + '"]');
        } else if (LOCATOR.paragraph) {
          var ps = contentEl.querySelectorAll('p');
          if (ps.length >= LOCATOR.paragraph) {
            targetEl = ps[LOCATOR.paragraph - 1];
          }
        }

        if (targetEl) {
          setTimeout(function() {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.classList.add('pixory-locator-target');
          }, 350);
        }
      }

      // ── Annotations Overlay Hook ───────────────────────────────
      function applyAnnotations() {
        if (!ANNOTATIONS || !ANNOTATIONS.length) return;
        ANNOTATIONS.forEach(function(item) {
          var el = document.querySelector('[data-block-id="' + item.blockId + '"]');
          if (el) {
            el.classList.add('pixory-annotation-highlight');
          }
        });
      }

      // ── In-Document Search Engine ───────────────────────────────
      var searchMatches = [];
      var activeSearchIdx = -1;

      window.PixorySearch = {
        find: function(query) {
          this.clear();
          if (!query || !query.trim()) {
            sendToNative({ type: 'searchResult', current: 0, total: 0 });
            return;
          }
          var q = query.trim().toLowerCase();
          var walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null, false);
          var textNodes = [];
          var node;
          while (node = walker.nextNode()) {
            if (node.parentElement && node.parentElement.tagName !== 'SCRIPT' && node.parentElement.tagName !== 'STYLE') {
              textNodes.push(node);
            }
          }

          var matchCount = 0;
          var MAX_MATCHES = 200;
          for (var i = 0; i < textNodes.length; i++) {
            if (matchCount >= MAX_MATCHES) break;
            var tNode = textNodes[i];
            var val = tNode.nodeValue;
            var lower = val.toLowerCase();
            var firstIdx = lower.indexOf(q);
            if (firstIdx !== -1) {
              var parent = tNode.parentNode;
              var frag = document.createDocumentFragment();
              var lastPos = 0;
              while (firstIdx !== -1 && matchCount < MAX_MATCHES) {
                if (firstIdx > lastPos) {
                  frag.appendChild(document.createTextNode(val.slice(lastPos, firstIdx)));
                }
                var mark = document.createElement('mark');
                mark.className = 'pixory-search-match';
                mark.id = 'search-match-' + matchCount;
                mark.textContent = val.slice(firstIdx, firstIdx + q.length);
                frag.appendChild(mark);
                searchMatches.push(mark);
                matchCount++;

                lastPos = firstIdx + q.length;
                firstIdx = lower.indexOf(q, lastPos);
              }
              if (lastPos < val.length) {
                frag.appendChild(document.createTextNode(val.slice(lastPos)));
              }
              parent.replaceChild(frag, tNode);
            }
          }

          if (searchMatches.length > 0) {
            this.goToMatch(0);
          } else {
            sendToNative({ type: 'searchResult', current: 0, total: 0 });
          }
        },

        goToMatch: function(index) {
          if (!searchMatches.length) return;
          if (activeSearchIdx >= 0 && searchMatches[activeSearchIdx]) {
            searchMatches[activeSearchIdx].classList.remove('active-match');
          }
          activeSearchIdx = (index + searchMatches.length) % searchMatches.length;
          var target = searchMatches[activeSearchIdx];
          target.classList.add('active-match');
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sendToNative({ type: 'searchResult', current: activeSearchIdx + 1, total: searchMatches.length });
        },

        next: function() {
          this.goToMatch(activeSearchIdx + 1);
        },

        prev: function() {
          this.goToMatch(activeSearchIdx - 1);
        },

        clear: function() {
          searchMatches.forEach(function(mark) {
            var parent = mark.parentNode;
            if (parent) {
              parent.replaceChild(document.createTextNode(mark.textContent), mark);
              parent.normalize();
            }
          });
          searchMatches = [];
          activeSearchIdx = -1;
        }
      };

      // ── Dynamic Theme & Font Size Controller ───────────────────
      window.PixoryTheme = {
        setTheme: function(themeName) {
          document.documentElement.setAttribute('data-theme', themeName);
          var vars = '';
          if (themeName === 'sepia') {
            vars = '${getThemeVariables('sepia').replace(/\s+/g, ' ')}';
          } else if (themeName === 'dark') {
            vars = '${getThemeVariables('dark').replace(/\s+/g, ' ')}';
          } else if (themeName === 'white') {
            vars = '${getThemeVariables('white').replace(/\s+/g, ' ')}';
          } else {
            vars = '${getThemeVariables('paper').replace(/\s+/g, ' ')}';
          }
          document.documentElement.style.cssText = vars + '; --font-size: ' + (window.__currentFontSize || ${fontSize}) + 'px;';
        },
        setFontSize: function(size) {
          window.__currentFontSize = size;
          document.documentElement.style.setProperty('--font-size', size + 'px');
        },
        setLayoutMode: function(mode) {
          document.documentElement.setAttribute('data-layout', mode);
        },
        setFontFamily: function(font) {
          document.documentElement.setAttribute('data-font', font);
        },
        setHtmlViewMode: function(mode) {
          document.documentElement.setAttribute('data-view', mode);
        },
        scrollToHeading: function(targetId) {
          var el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        },
        togglePresentation: function() {
          var isPres = document.documentElement.getAttribute('data-presentation') === 'true';
          var nextPres = !isPres;
          document.documentElement.setAttribute('data-presentation', nextPres ? 'true' : 'false');
          deckSlides = getPptxSlides();
          if (nextPres) {
            initDeckPager();
            showDeckSlide(currentDeckIndex);
          } else {
            deckSlides.forEach(function(slide) {
              slide.classList.remove('deck-active');
              slide.style.display = '';
              slide.style.transform = '';
              slide.style.transformOrigin = '';
            });
          }
          syncAllPptxSlidesScale();
          sendToNative({ type: 'presentationState', active: nextPres });
        },
        goToSlide: function(index) {
          deckSlides = getPptxSlides();
          if (document.documentElement.getAttribute('data-presentation') === 'true') {
            showDeckSlide(index);
          } else {
            if (deckSlides[index]) {
              deckSlides[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }
      };

      // ── PPT Deck Pager Controller & Autoscale Scaling Engine ───
      var deckSlides = [];
      var currentDeckIndex = 0;
      var deckPill = null;

      function getPptxSlides() {
        var slides = Array.prototype.slice.call(
          contentEl.querySelectorAll('.pptx-preview-slide-wrapper, div[class*="pptx-preview-slide-wrapper-"]')
        );
        if (!slides.length) {
          slides = Array.prototype.slice.call(
            contentEl.querySelectorAll('.pptx-slide-card')
          );
        }
        return slides;
      }

      function fitAllPptxTextBoxes() {
        var canvases = document.querySelectorAll('.pptx-slide-canvas');
        for (var c = 0; c < canvases.length; c++) {
          var canvas = canvases[c];
          var logicalH = parseFloat(canvas.getAttribute('data-logical-height')) || 540;
          var textBoxes = canvas.querySelectorAll('.pptx-spatial-text');
          for (var b = 0; b < textBoxes.length; b++) {
            var box = textBoxes[b];
            box.style.fontSize = '';
            var topPx = box.offsetTop || 0;
            var maxAvailH = Math.min(box.clientHeight || logicalH, logicalH - topPx - 8);
            var actualH = box.scrollHeight;

            if (actualH > maxAvailH && maxAvailH > 24) {
              var ratio = Math.max(0.62, Math.sqrt(maxAvailH / actualH) * 0.92);
              var paragraphs = box.querySelectorAll('.pptx-p, span');
              for (var p = 0; p < paragraphs.length; p++) {
                var el = paragraphs[p];
                var computedFs = parseFloat(window.getComputedStyle(el).fontSize);
                if (computedFs) {
                  el.style.fontSize = Math.max(10, Math.floor(computedFs * ratio)) + 'px';
                }
                el.style.lineHeight = '1.18';
              }
            }
          }
        }
      }

      function syncAllPptxSlidesScale() {
        var isPresentation = document.documentElement.getAttribute('data-presentation') === 'true' ||
                             document.body.getAttribute('data-presentation') === 'true';
        var canvases = document.querySelectorAll('.pptx-slide-canvas');
        for (var i = 0; i < canvases.length; i++) {
          var canvas = canvases[i];
          var logicalW = parseFloat(canvas.getAttribute('data-logical-width')) || 960;
          var logicalH = parseFloat(canvas.getAttribute('data-logical-height')) || 540;
          canvas.style.setProperty('--logical-w', logicalW + 'px');
          canvas.style.setProperty('--logical-h', logicalH + 'px');
          canvas.style.setProperty('--slide-aspect', logicalW + ' / ' + logicalH);

          var inner = canvas.querySelector('.pptx-slide-canvas-inner');
          if (!inner) continue;

          if (isPresentation && canvas.classList.contains('deck-active')) {
            var availW = window.innerWidth;
            var availH = window.innerHeight;
            var scale = Math.min(availW / logicalW, availH / logicalH) * 0.96;
            var offsetX = (availW - logicalW * scale) / 2;
            var offsetY = (availH - logicalH * scale) / 2;
            inner.style.transform = 'translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + scale + ')';
          } else {
            var rectW = canvas.clientWidth;
            if (rectW > 0) {
              var previewScale = rectW / logicalW;
              inner.style.transform = 'scale(' + previewScale + ')';
            }
          }
        }
        fitAllPptxTextBoxes();
      }
      window.addEventListener('resize', syncAllPptxSlidesScale);
      window.addEventListener('load', syncAllPptxSlidesScale);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(syncAllPptxSlidesScale);
      }
      if (typeof ResizeObserver !== 'undefined') {
        try {
          var ro = new ResizeObserver(syncAllPptxSlidesScale);
          ro.observe(document.body);
          if (contentEl) ro.observe(contentEl);
        } catch (e) {}
      }
      setTimeout(syncAllPptxSlidesScale, 60);
      setTimeout(syncAllPptxSlidesScale, 300);

      function initDeckPager() {
        deckSlides = getPptxSlides();
        if (!deckSlides.length) return;
        if (!document.getElementById('deck-control-pill')) {
          deckPill = document.createElement('div');
          deckPill.id = 'deck-control-pill';
          deckPill.innerHTML =
            '<button class="deck-pill-btn" id="deck-btn-prev">◀ 上一页</button>' +
            '<span class="deck-pill-page" id="deck-pill-page">1 / ' + deckSlides.length + '</span>' +
            '<button class="deck-pill-btn" id="deck-btn-next">下一页 ▶</button>' +
            '<button class="deck-pill-btn deck-pill-exit" id="deck-btn-exit">✕ 退出</button>';
          document.body.appendChild(deckPill);

          var prevBtn = document.getElementById('deck-btn-prev');
          var nextBtn = document.getElementById('deck-btn-next');
          var exitBtn = document.getElementById('deck-btn-exit');

          if (prevBtn) {
            prevBtn.addEventListener('click', function(e) {
              e.stopPropagation();
              deckPrev();
            });
          }
          if (nextBtn) {
            nextBtn.addEventListener('click', function(e) {
              e.stopPropagation();
              deckNext();
            });
          }
          if (exitBtn) {
            exitBtn.addEventListener('click', function(e) {
              e.stopPropagation();
              window.PixoryTheme.togglePresentation();
            });
          }
        }
      }

      function showDeckSlide(index) {
        deckSlides = getPptxSlides();
        if (!deckSlides.length) return;
        currentDeckIndex = Math.max(0, Math.min(index, deckSlides.length - 1));
        deckSlides.forEach(function(slide, idx) {
          if (idx === currentDeckIndex) {
            slide.classList.add('deck-active');
            slide.style.display = 'block';
          } else {
            slide.classList.remove('deck-active');
            slide.style.display = 'none';
          }
        });

        var activeSlide = deckSlides[currentDeckIndex];
        if (activeSlide && document.documentElement.getAttribute('data-presentation') === 'true') {
          var availW = window.innerWidth;
          var availH = window.innerHeight;
          var baseW = parseFloat(activeSlide.style.width) || window.__pptxSlideW || 960;
          var baseH = parseFloat(activeSlide.style.height) || window.__pptxSlideH || 540;
          var scale = Math.min(availW / baseW, availH / baseH) * 0.98;
          activeSlide.style.transform = 'scale(' + scale + ')';
          activeSlide.style.transformOrigin = 'center center';
        }

        syncAllPptxSlidesScale();
        var pageEl = document.getElementById('deck-pill-page');
        if (pageEl) {
          pageEl.textContent = (currentDeckIndex + 1) + ' / ' + deckSlides.length;
        }
        var prevBtn = document.getElementById('deck-btn-prev');
        var nextBtn = document.getElementById('deck-btn-next');
        if (prevBtn) {
          if (currentDeckIndex === 0) {
            prevBtn.classList.add('deck-btn-disabled');
            prevBtn.setAttribute('disabled', 'true');
          } else {
            prevBtn.classList.remove('deck-btn-disabled');
            prevBtn.removeAttribute('disabled');
          }
        }
        if (nextBtn) {
          if (currentDeckIndex === deckSlides.length - 1) {
            nextBtn.classList.add('deck-btn-disabled');
            nextBtn.setAttribute('disabled', 'true');
          } else {
            nextBtn.classList.remove('deck-btn-disabled');
            nextBtn.removeAttribute('disabled');
          }
        }
        sendToNative({
          type: 'presentationPage',
          current: currentDeckIndex + 1,
          total: deckSlides.length
        });
      }

      function deckNext() {
        if (currentDeckIndex < deckSlides.length - 1) {
          showDeckSlide(currentDeckIndex + 1);
        }
      }

      function deckPrev() {
        if (currentDeckIndex > 0) {
          showDeckSlide(currentDeckIndex - 1);
        }
      }

      // Touch swipe gestures in presentation mode
      var touchStartX = 0;
      var touchStartY = 0;
      window.addEventListener('touchstart', function(e) {
        if (document.documentElement.getAttribute('data-presentation') === 'true' && e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      window.addEventListener('touchend', function(e) {
        if (document.documentElement.getAttribute('data-presentation') === 'true' && e.changedTouches.length === 1) {
          var dx = e.changedTouches[0].clientX - touchStartX;
          var dy = e.changedTouches[0].clientY - touchStartY;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) {
              deckNext();
            } else {
              deckPrev();
            }
          }
        }
      }, { passive: true });

      // Click edge zones for next/prev, center for toggling pill visibility
      window.addEventListener('click', function(e) {
        if (document.documentElement.getAttribute('data-presentation') === 'true') {
          if (e.target.closest('#deck-control-pill, a, button, input')) return;
          var width = window.innerWidth;
          var x = e.clientX;
          if (x < width * 0.18) {
            deckPrev();
          } else if (x > width * 0.82) {
            deckNext();
          } else {
            var pill = document.getElementById('deck-control-pill');
            if (pill) {
              if (pill.style.opacity === '0') {
                pill.style.opacity = '1';
                pill.style.pointerEvents = 'auto';
              } else {
                pill.style.opacity = '0';
                pill.style.pointerEvents = 'none';
              }
            }
          }
        }
      });

      // Keyboard navigation
      window.addEventListener('keydown', function(e) {
        if (document.documentElement.getAttribute('data-presentation') === 'true') {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
            deckNext();
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
            deckPrev();
          } else if (e.key === 'Escape') {
            window.PixoryTheme.togglePresentation();
          }
        }
      });

      // ── Scroll Progress Reporter ───────────────────────────────
      var scrollTimer = null;
      window.addEventListener('scroll', function() {
        if (scrollTimer) return;
        scrollTimer = setTimeout(function() {
          scrollTimer = null;
          var total = document.documentElement.scrollHeight - window.innerHeight;
          var pct = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
          sendToNative({ type: 'scrollProgress', progress: pct });
        }, 150);
      }, { passive: true });

      // ── Link Interceptor ───────────────────────────────────────
      document.addEventListener('click', function(e) {
        var a = e.target.closest('a');
        if (a && a.href) {
          if (a.getAttribute('href').startsWith('#')) return;
          e.preventDefault();
          sendToNative({ type: 'linkPress', url: a.href });
        }
      });
    })();
  </script>
</body>
</html>`;
}
