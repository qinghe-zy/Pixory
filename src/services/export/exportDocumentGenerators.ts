import type { ExportDocumentFormat, ExportDocumentInput } from './exportDocumentTypes';

const ILLEGAL_FILENAME_REGEX = /[\\/:*?"<>|\r\n\t]/g;

/**
 * 格式智能预判：根据文本特征自动推荐最合适的导出格式
 */
export function detectSuggestedExportFormat(content: string): ExportDocumentFormat {
  const trimmed = content.trim();
  if (!trimmed) {
    return 'txt';
  }

  // 1. JSON 结构预判
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // 不是合法的严格 JSON，继续后续规则
    }
  }

  // 2. 完整 HTML 骨架预判
  if (/<!DOCTYPE\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed)) {
    return 'html';
  }

  // 3. Markdown 语法特征预判
  const hasMarkdownTriggers =
    /```[\s\S]*?```/.test(trimmed) || // 代码块
    /^#{1,6}\s+/m.test(trimmed) || // 标题
    /^\s*[-*+]\s+/m.test(trimmed) || // 无序列表
    /^\s*\d+\.\s+/m.test(trimmed) || // 有序列表
    /^\s*>\s+/m.test(trimmed) || // 引用块
    /\|.+\|\r?\n\|[-:\s|]+\|/.test(trimmed) || // 表格
    /\$\$.+?\$\$/.test(trimmed) || // 数学公式
    /\*\*[^*]+?\*\*/.test(trimmed); // 粗体

  if (hasMarkdownTriggers) {
    return 'md';
  }

  // 4. 普通纯文本
  return 'txt';
}

/**
 * 智能预填充文件名（参考成熟软件设计规范）
 */
export function buildDefaultExportFileName(content: string, fallbackTitle?: string): string {
  if (fallbackTitle && fallbackTitle.trim()) {
    const sanitized = sanitizeFileName(fallbackTitle.trim());
    if (sanitized) return sanitized;
  }

  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  // 1. 扫描前 5 行优先提取 Markdown 标题
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch && headingMatch[1]) {
      const extracted = cleanCandidateTitle(headingMatch[1]);
      if (extracted) {
        return sanitizeFileName(extracted);
      }
    }
  }

  // 2. 取第一个有效段落的首句
  if (lines.length > 0) {
    const firstLine = lines[0];
    // 去除前导语法符号（如引用 >、列表符号 - 或数字编号 1.）
    const cleanFirstLine = firstLine
      .replace(/^>\s*/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '');

    // 按标点或换行截断为首句
    const sentenceMatch = cleanFirstLine.match(/^[^。！？!?:：;\n]+/);
    const candidate = sentenceMatch ? sentenceMatch[0] : cleanFirstLine;
    const extracted = cleanCandidateTitle(candidate);
    if (extracted) {
      return sanitizeFileName(extracted);
    }
  }

  // 3. 兜底时间戳命名
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `Pixory_文档_${year}${month}${day}_${hours}${minutes}`;
}

/**
 * 清理候选标题中的语法标记
 */
function cleanCandidateTitle(text: string): string {
  const stripped = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/#+\s*/g, '')
    .trim();

  // 截断为最多 32 个汉字/字符
  return stripped.slice(0, 32).trim();
}

/**
 * 过滤文件名非法字符并修剪
 */
export function sanitizeFileName(name: string): string {
  let cleaned = name
    .replace(ILLEGAL_FILENAME_REGEX, '_')
    .replace(/_+/g, '_')
    .replace(/\s*_\s*/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  // 彻底剔除首尾的下划线和点
  cleaned = cleaned.replace(/^[_\s.]+|[_\s.]+$/g, '');

  return cleaned.slice(0, 60);
}

/**
 * 将 Markdown 剥离为通俗可读的纯文本
 */
export function stripMarkdownToPlainText(markdown: string): string {
  return markdown
    // 保护代码块内容，剥离语言围栏
    .replace(/```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)```/g, '$1\n')
    // 剥离标题符号
    .replace(/^#{1,6}\s+(.+)$/gm, '$1')
    // 剥离加粗和斜体
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/___([^_]+)___/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // 剥离删除线
    .replace(/~~([^~]+)~~/g, '$1')
    // 剥离行内代码
    .replace(/`([^`]+)`/g, '$1')
    // 转换超链接 [文字](url) => 文字 (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // 转换图片 ![alt](url) => [图片: alt]
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[图片: $1]')
    // 规范化引用块：替换为轻量缩进
    .replace(/^>\s*/gm, '  ')
    // 压缩多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 线性、无回溯风险的 Markdown 转换为结构化 HTML 内容
 */
function markdownToHtmlFragment(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const result: string[] = [];

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeLines: string[] = [];

  let inList = false;
  let inTable = false;
  let tableHeaderParsed = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. 代码块处理
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // 闭合代码块
        const langAttr = codeBlockLang ? ` class="language-${escapeHtml(codeBlockLang)}"` : '';
        result.push(`<pre><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        inCodeBlock = false;
        codeLines = [];
        codeBlockLang = '';
      } else {
        // 开始代码块前闭合其他块
        if (inList) { result.push('</ul>'); inList = false; }
        if (inTable) { result.push('</tbody></table></div>'); inTable = false; }

        inCodeBlock = true;
        codeBlockLang = trimmed.replace(/^```/, '').trim();
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    // 2. 表格处理 (检测 | col | col | 结构)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      // 检查是否为分隔行 (|---|---|)
      const isDivider = cells.every((c) => /^[-:\s]+$/.test(c));

      if (isDivider) {
        tableHeaderParsed = true;
        continue;
      }

      if (!inTable) {
        if (inList) { result.push('</ul>'); inList = false; }
        inTable = true;
        tableHeaderParsed = false;
        result.push('<div class="table-container"><table>');
        result.push('<thead><tr>' + cells.map((c) => `<th>${formatInline(c)}</th>`).join('') + '</tr></thead>');
        result.push('<tbody>');
        continue;
      }

      if (inTable) {
        result.push('<tr>' + cells.map((c) => `<td>${formatInline(c)}</td>`).join('') + '</tr>');
        continue;
      }
    } else if (inTable) {
      result.push('</tbody></table></div>');
      inTable = false;
      tableHeaderParsed = false;
    }

    // 3. 列表处理
    const listMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        inList = true;
        result.push('<ul>');
      }
      result.push(`<li>${formatInline(listMatch[1])}</li>`);
      continue;
    } else if (inList) {
      result.push('</ul>');
      inList = false;
    }

    // 4. 空行
    if (!trimmed) {
      continue;
    }

    // 5. 标题处理
    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      result.push(`<h${level}>${formatInline(hMatch[2])}</h${level}>`);
      continue;
    }

    // 6. 引用块
    if (trimmed.startsWith('>')) {
      const quoteText = trimmed.replace(/^>\s*/, '');
      result.push(`<blockquote>${formatInline(quoteText)}</blockquote>`);
      continue;
    }

    // 7. 数学公式块
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
      const math = trimmed.slice(2, -2).trim();
      result.push(`<div class="math-block">$$${escapeHtml(math)}$$</div>`);
      continue;
    }

    // 8. 普通段落
    result.push(`<p>${formatInline(trimmed)}</p>`);
  }

  // 循环结束后的清理闭合
  if (inCodeBlock) {
    const langAttr = codeBlockLang ? ` class="language-${escapeHtml(codeBlockLang)}"` : '';
    result.push(`<pre><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  if (inList) {
    result.push('</ul>');
  }
  if (inTable) {
    result.push('</tbody></table></div>');
  }

  return result.join('\n');
}

/**
 * 行内样式转换（粗体、斜体、行内代码、删除线、链接）
 */
function formatInline(text: string): string {
  let safe = escapeHtml(text);
  // 粗体
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体
  safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // 行内代码
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 删除线
  safe = safe.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // 链接
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  return safe;
}

/**
 * 组装自包含单文件精美网页 (HTML)
 */
export function buildStandaloneHtmlDocument(title: string, markdown: string, metadata?: Record<string, string>): string {
  const bodyHtml = markdownToHtmlFragment(markdown);
  const dateStr = metadata?.createdAt || new Date().toLocaleString('zh-CN', { hour12: false });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #1a1c1c;
      --text-muted: #747878;
      --card-bg: #f9f9f9;
      --code-bg: #1e1e1e;
      --code-text: #d4d4d4;
      --border: #e2e2e2;
      --accent: #1a1c1c;
      --quote-border: #1a1c1c;
      --table-header: #f3f3f4;
      --table-stripe: #fafafa;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #141414;
        --text: #f0f0f0;
        --text-muted: #999999;
        --card-bg: #1f1f1f;
        --code-bg: #0d0d0d;
        --code-text: #e0e0e0;
        --border: #333333;
        --accent: #ffffff;
        --quote-border: #888888;
        --table-header: #262626;
        --table-stripe: #1a1a1a;
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.75;
      padding: 36px 20px;
      font-size: 16px;
    }
    .container {
      max-width: 820px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 32px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--border);
    }
    h1.doc-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 10px;
      color: var(--text);
      letter-spacing: -0.5px;
    }
    .doc-meta {
      font-size: 13px;
      color: var(--text-muted);
    }
    .content h1, .content h2, .content h3, .content h4 {
      margin-top: 28px;
      margin-bottom: 14px;
      font-weight: 600;
      line-height: 1.35;
      color: var(--text);
    }
    .content h1 { font-size: 23px; }
    .content h2 { font-size: 20px; }
    .content h3 { font-size: 18px; }
    .content p {
      margin-bottom: 16px;
      word-break: break-word;
    }
    .content ul, .content ol {
      margin-left: 22px;
      margin-bottom: 16px;
    }
    .content li {
      margin-bottom: 6px;
    }
    .content pre {
      background-color: var(--code-bg);
      color: var(--code-text);
      padding: 16px 18px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: "JetBrains Mono", Consolas, Monaco, monospace;
      font-size: 13.5px;
      line-height: 1.55;
      margin-bottom: 18px;
    }
    .content code:not(pre code) {
      background-color: var(--card-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 14px;
      font-family: "JetBrains Mono", Consolas, monospace;
      border: 1px solid var(--border);
    }
    .content blockquote {
      border-left: 4px solid var(--quote-border);
      padding: 10px 18px;
      background-color: var(--card-bg);
      border-radius: 0 8px 8px 0;
      margin-bottom: 18px;
      color: var(--text-muted);
    }
    .table-container {
      overflow-x: auto;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      font-size: 14.5px;
    }
    th, td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background-color: var(--table-header);
      font-weight: 600;
    }
    tr:nth-child(even) {
      background-color: var(--table-stripe);
    }
    .math-block {
      background-color: var(--card-bg);
      border: 1px dashed var(--border);
      border-radius: 6px;
      padding: 12px 16px;
      text-align: center;
      font-family: "KaTeX_Main", "Times New Roman", serif;
      margin-bottom: 16px;
      overflow-x: auto;
    }
    a {
      color: #3B82F6;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    footer {
      margin-top: 56px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1 class="doc-title">${escapeHtml(title)}</h1>
      <div class="doc-meta">导出时间：${escapeHtml(dateStr)}</div>
    </header>
    <main class="content">
      ${bodyHtml}
    </main>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 嗅探并提取独立完整的可执行 HTML 文档（支持直接 HTML、前置注释/XML 声明、或 Markdown 围栏包裹）
 */
export function extractStandaloneHtmlDocument(content: string): string | null {
  if (!content || typeof content !== 'string') return null;
  let trimmed = content.trim();

  // 1. 如果被 Markdown 代码围栏整段包裹，剥离外围围栏
  const singleFenceMatch = /^```(?:html|htm|xhtml|xml)?\s*\n([\s\S]*?)\n?```$/i.exec(trimmed);
  if (singleFenceMatch && singleFenceMatch[1]) {
    trimmed = singleFenceMatch[1].trim();
  }

  // 2. 剥离前导 HTML 注释与 XML 声明
  const withoutLeadingComments = trimmed.replace(/^(?:<!--[\s\S]*?-->\s*|<\?xml[\s\S]*?\?>\s*)*/i, '');

  // 3. 判定是否为完整 HTML 文档骨架 (含 <!doctype html> 或 <html> 根节点)
  const isHtmlRoot =
    /^<!doctype\s+html\b/i.test(withoutLeadingComments) ||
    (/^<html\b/i.test(withoutLeadingComments) && /<\/html>/i.test(withoutLeadingComments));

  if (isHtmlRoot) {
    // 确保存在 UTF-8 声明，防止在某些外部移动浏览器或文件管理器中打开时出现中文乱码
    if (!/<meta\s+[^>]*charset\s*=/i.test(trimmed)) {
      if (/<head\b[^>]*>/i.test(trimmed)) {
        trimmed = trimmed.replace(/(<head\b[^>]*>)/i, '$1\n  <meta charset="UTF-8">');
      } else if (/<html\b[^>]*>/i.test(trimmed)) {
        trimmed = trimmed.replace(/(<html\b[^>]*>)/i, '$1\n<head><meta charset="UTF-8"></head>');
      } else if (/<!doctype\s+html[^>]*>/i.test(trimmed)) {
        trimmed = trimmed.replace(/(<!doctype\s+html[^>]*>)/i, '$1\n<meta charset="UTF-8">');
      }
    }
    return trimmed;
  }

  return null;
}

/**
 * 嗅探并提取独立完整的 SVG 矢量图代码
 */
export function extractStandaloneSvg(content: string): string | null {
  if (!content || typeof content !== 'string') return null;
  let trimmed = content.trim();

  // 1. 如果被 Markdown 代码围栏整段包裹，剥离围栏
  const singleFenceMatch = /^```(?:svg|xml)?\s*\n([\s\S]*?)\n?```$/i.exec(trimmed);
  if (singleFenceMatch && singleFenceMatch[1]) {
    trimmed = singleFenceMatch[1].trim();
  }

  // 2. 剥离前导 XML 声明与注释
  const withoutXml = trimmed.replace(/^(?:<!--[\s\S]*?-->\s*|<\?xml[\s\S]*?\?>\s*)*/i, '');
  if (/^<svg\b[\s\S]*<\/svg>$/i.test(withoutXml)) {
    return withoutXml;
  }

  return null;
}

/**
 * 为纯 SVG 注入极简全屏自适应 HTML 外壳（零多余装饰，专为浏览器直接高保真渲染）
 */
export function wrapSvgInStandaloneHtml(svg: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #ffffff;
      overflow: hidden;
    }
    svg {
      max-width: 95vw;
      max-height: 95vh;
    }
  </style>
</head>
<body>
  ${svg}
</body>
</html>`;
}

/**
 * 从可能包含前后说明文字的 Markdown 复合内容中提取完整 HTML 文档
 */
export function extractEmbeddedHtmlBlock(content: string): string | null {
  if (!content || typeof content !== 'string') return null;
  const fenceRegex = /```(?:html|htm|xhtml|xml)?\s*\n([\s\S]*?)\n```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(content)) !== null) {
    const candidate = extractStandaloneHtmlDocument(match[1]);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

/**
 * 从可能包含前后说明文字的 Markdown 复合内容中提取完整 SVG 代码
 */
export function extractEmbeddedSvgBlock(content: string): string | null {
  if (!content || typeof content !== 'string') return null;
  const fenceRegex = /```(?:svg|xml)?\s*\n([\s\S]*?)\n```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(content)) !== null) {
    const candidate = extractStandaloneSvg(match[1]);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

/**
 * 根据格式生成导出文档的纯文本/内容字符串
 */
export function buildDocumentContent(input: ExportDocumentInput): string {
  switch (input.format) {
    case 'md':
      return input.content;

    case 'txt': {
      const standaloneHtml =
        extractStandaloneHtmlDocument(input.content) || extractEmbeddedHtmlBlock(input.content);
      if (standaloneHtml) {
        return standaloneHtml;
      }
      return stripMarkdownToPlainText(input.content);
    }

    case 'html': {
      // 1. 如果内容本身或单围栏包含独立完整的 HTML 文档，直接导出纯净无污染源码
      const standaloneHtml = extractStandaloneHtmlDocument(input.content);
      if (standaloneHtml) {
        return standaloneHtml;
      }

      // 2. 如果内容本身或单围栏包含独立完整的 SVG 矢量图，注入极简全屏自适应 HTML 外壳
      const standaloneSvg = extractStandaloneSvg(input.content);
      if (standaloneSvg) {
        return wrapSvgInStandaloneHtml(standaloneSvg, input.fileName);
      }

      // 3. 检查是否为包含独立可执行 HTML/SVG 制品代码块的复合消息
      const embeddedHtml = extractEmbeddedHtmlBlock(input.content);
      if (embeddedHtml) {
        return embeddedHtml;
      }

      const embeddedSvg = extractEmbeddedSvgBlock(input.content);
      if (embeddedSvg) {
        return wrapSvgInStandaloneHtml(embeddedSvg, input.fileName);
      }

      // 4. 内容为普通 Markdown 或长文本，编译为精美排版网页文档
      return buildStandaloneHtmlDocument(input.fileName, input.content, input.metadata);
    }

    case 'json':
      return JSON.stringify(
        {
          title: input.fileName,
          exportedAt: input.metadata?.createdAt || new Date().toISOString(),
          source: input.metadata?.source || 'Pixory',
          formatVersion: '1.0',
          characterCount: input.content.length,
          content: input.content,
        },
        null,
        2
      );

    case 'pdf': {
      // PDF 渲染底料：复用 HTML 格式解析结果（纯 HTML 时直接渲染交互画布，Markdown 时渲染排版网页）
      return buildDocumentContent({
        ...input,
        format: 'html',
      });
    }

    default:
      return input.content;
  }
}
