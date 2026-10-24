import type { SandboxInitialMode } from './sandboxTypes';

const RUNNABLE_LANGUAGES = new Set(['html', 'htm', 'xhtml', 'svg', 'xml']);

export function isCodeBlockClosed(rawMarkdownOrBlock: string): boolean {
  if (!rawMarkdownOrBlock) return true;
  const matches = rawMarkdownOrBlock.match(/```/g);
  return !matches || matches.length % 2 === 0;
}

export function isExecutableSandboxCode(code: string, language?: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim();
  const lang = (language ?? '').toLowerCase().trim();

  // 1. 如果明确声明了 html / svg
  if (RUNNABLE_LANGUAGES.has(lang)) {
    // 排除纯普通无任何互动/结构的超短文本
    if (trimmed.length > 20) {
      if (
        /<!doctype\s+html/i.test(trimmed) ||
        /<html\b/i.test(trimmed) ||
        /<body\b/i.test(trimmed) ||
        /<svg\b/i.test(trimmed) ||
        /<canvas\b/i.test(trimmed) ||
        /<script\b/i.test(trimmed) ||
        /<style\b/i.test(trimmed)
      ) {
        return true;
      }
    }
  }

  // 2. 语言未声明或声明为 js/ts，但内容是自包含 HTML/SVG
  if (/^\s*(?:<!doctype\s+html|<html|<body|<svg)/i.test(trimmed)) {
    return true;
  }

  // 3. 包含完整的 HTML 文档结构或 Canvas 脚本
  if (
    trimmed.includes('<canvas') &&
    (trimmed.includes('<script') || trimmed.includes('getContext(') || trimmed.includes('requestAnimationFrame'))
  ) {
    return true;
  }

  // 4. SVG 标签匹配
  if (/^<svg[\s\S]*<\/svg>$/i.test(trimmed)) {
    return true;
  }

  return false;
}

export function decideInitialMode(code: string): SandboxInitialMode {
  if (!code || typeof code !== 'string') return 'drawer';

  // 强交互游戏、WebGL、Three.js、方向键监听、全屏画布 -> 沉浸全屏
  const isFullScreenGame =
    /requestAnimationFrame/i.test(code) &&
    (/addEventListener\s*\(\s*['"](?:keydown|keyup|touchstart|pointerdown)['"]/i.test(code) ||
      /<canvas\b/i.test(code) ||
      /webgl|three\.js/i.test(code));

  if (isFullScreenGame) {
    return 'fullscreen';
  }

  // 视口尺寸占比设置
  if (/width\s*:\s*100vw/i.test(code) && /height\s*:\s*100vh/i.test(code)) {
    return 'fullscreen';
  }

  return 'drawer';
}

export interface ExtractedSandboxTarget {
  code: string;
  language?: string;
  title?: string;
}

/**
 * 从任意消息文本中提取可执行沙箱代码（支持纯 HTML、SVG、代码块包围文本）
 * 瞬态微秒级执行，用于长按菜单判定和全屏提取
 */
export function extractSandboxExecutableCode(content: string): ExtractedSandboxTarget | null {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();

  // 1. 如果本身就是整段自包含 HTML/SVG
  if (isExecutableSandboxCode(trimmed)) {
    return {
      code: trimmed,
      language: trimmed.startsWith('<svg') ? 'svg' : 'html',
    };
  }

  // 2. 检查 Markdown 围栏代码块 ```html ... ``` 或 ```svg ... ```
  const fenceRegex = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(content)) !== null) {
    const lang = (match[1] || '').toLowerCase();
    const code = match[2] || '';
    if (isExecutableSandboxCode(code, lang)) {
      return { code, language: lang };
    }
  }

  // 3. 检查嵌入的裸 <svg>...</svg> 块
  const svgMatch = /<svg\b[\s\S]*?<\/svg>/i.exec(content);
  if (svgMatch && svgMatch[0].length > 40) {
    return { code: svgMatch[0], language: 'svg' };
  }

  return null;
}
/**
 * 检测文本是否包含 Markdown 或 HTML 格式化标记（用于选择文本窗口是否展示双模分段器）
 * 包含 O(1) 快速字符串包含短路与防 ReDoS 的线性匹配
 */
export function hasRichFormatting(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  // 1. O(1) 快速短路嗅探：常见 Markdown 与公式标记
  if (text.includes('```') || text.includes('$$') || text.includes('\\[') || text.includes('**') || text.includes('~~')) {
    return true;
  }

  // 2. 标题、无序/有序列表、表格、行内代码与链接
  if (/^#{1,6}\s+/m.test(text)) return true;
  if (/^\s*[-*+]\s+/m.test(text) || /^\s*\d+\.\s+/m.test(text)) return true;
  if (/`[^`\n]+`|\[[^\]\n]*\]\([^)\n]*\)/.test(text)) return true;
  if (/\|[^|\n]+\|/.test(text)) return true;

  // 3. HTML 特征标记（使用 [^>]* 避免贪婪跨行回溯防 ReDoS）
  if (/<\/?[a-z][a-z0-9_-]*\b[^>]*>/i.test(text) || /<!doctype\s+html/i.test(text)) {
    return true;
  }

  return false;
}

export interface StandaloneArtifactCandidate {
  code: string;
  language: 'html' | 'svg';
  title: string;
  lineCount: number;
}

// 1. 含省略号/未完成注释（一票否决黑名单）
export const INCOMPLETE_CODE_REGEX =
  /(\/\/|\/\*|<!--)\s*(\.\.\.|…)?\s*(剩余代码|省略|此处省略|以下代码同上|rest of code|omitted|todo:\s*implement)/i;

// 2. 含无法在单文件内解析的本地相对引用或框架模板语法（必白屏死代码）
export const UNRUNNABLE_DEPENDENCY_REGEX =
  /(<script[^>]+src=["'](?!https?:\/\/)[^"']+["']|<link[^>]+href=["'](?!https?:\/\/)[^"']+["']|<template\b|\bv-(if|for|model|bind)\b|\bclassName=|\bimport\s+.*\s+from\s+["']\.)/i;

/**
 * 严格检测一段代码是否为自包含、可运行的独立视觉/交互制品（用于在最新消息中挂载取景框或卡片）
 * 遵循「契约 + 死代码黑名单 + 交互密度」三保险原则，坚决不误判教学代码或残缺片段
 */
export function detectStandaloneArtifactCandidate(
  code: string,
  language?: string
): StandaloneArtifactCandidate | null {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.trim();
  const lang = (language ?? '').toLowerCase().trim();

  // 一票否决 1：包含残缺省略注释
  if (INCOMPLETE_CODE_REGEX.test(trimmed)) {
    return null;
  }

  // 一票否决 2：包含不可在本地单文件内解析的相对本地脚本、样式或 Vue/React 模板
  if (UNRUNNABLE_DEPENDENCY_REGEX.test(trimmed)) {
    return null;
  }

  // 一票否决 3：明确是后端/系统/非可执行脚本语言（坚决以纯文本代码块展示）
  const NON_ARTIFACT_LANGUAGES = new Set([
    'python', 'py', 'javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx',
    'css', 'scss', 'less', 'json', 'yaml', 'yml', 'bash', 'sh', 'zsh',
    'powershell', 'ps1', 'sql', 'c', 'cpp', 'csharp', 'cs', 'java', 'go',
    'rust', 'rs', 'php', 'ruby', 'rb', 'dockerfile', 'makefile'
  ]);
  if (NON_ARTIFACT_LANGUAGES.has(lang)) {
    return null;
  }

  const lineCount = trimmed.split('\n').length;

  // 路径 C：独立完整的 SVG 矢量制品（兼容前置 XML 声明，如 <?xml version="1.0" ...?>）
  const isPureSvg = /^(?:<\?xml[\s\S]*?\?>\s*)?<svg\b[\s\S]*<\/svg>$/i.test(trimmed);
  if (lang === 'svg' || isPureSvg) {
    if (isPureSvg) {
      if (lineCount >= 6 || trimmed.length >= 120) {
        const titleMatch = trimmed.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : 'SVG 矢量绘图';
        return {
          code: trimmed,
          language: 'svg',
          title,
          lineCount,
        };
      }
    }
    return null;
  }

  // 路径 A 与 B：HTML 体系
  if (lang === 'html' || lang === 'htm' || lang === 'xhtml' || !lang) {
    // 基础体量门槛：至少 10 行或字符数 >= 150，过滤 <div>hi</div> 等微型碎语
    if (lineCount < 10 && trimmed.length < 150) {
      return null;
    }

    // 路径 A：标准完整 HTML 文档（含 <!doctype html> 或 <html> 外壳且闭合）
    const hasDoctypeOrHtmlTag = /<!doctype\s+html\b|<html\b/i.test(trimmed);
    const hasClosingTag = /<\/html>|<\/body>/i.test(trimmed);
    const hasVisualElement = /<(?:canvas|svg|style|button|input|div|table|section|article|h[1-6])\b/i.test(trimmed);

    if (hasDoctypeOrHtmlTag && hasClosingTag && hasVisualElement) {
      const titleMatch = trimmed.match(/<title>([^<]+)<\/title>/i);
      let title = titleMatch ? titleMatch[1].trim() : '';
      if (!title) {
        if (/<canvas\b/i.test(trimmed)) {
          title = 'HTML5 交互呈现';
        } else {
          title = 'HTML5 可视化组件';
        }
      }
      return {
        code: trimmed,
        language: 'html',
        title,
        lineCount,
      };
    }

    // 路径 B：无 doctype 外壳但有真互动的自包含小组件（必须同时含闭合 script 与画布或 >=2 个交互控件）
    const hasClosedScript = /<script\b[\s\S]*?<\/script>/i.test(trimmed);
    const hasCanvasOrSvg = /<(?:canvas|svg)\b/i.test(trimmed);
    const interactiveControlsCount = (trimmed.match(/<(?:button|input|select|textarea)\b/gi) || []).length;

    if (hasClosedScript && (hasCanvasOrSvg || interactiveControlsCount >= 2)) {
      let title = '';
      const h1Match = trimmed.match(/<h[1-3]>([^<]+)<\/h[1-3]>/i);
      if (h1Match && h1Match[1].trim().length <= 20) {
        title = h1Match[1].trim();
      } else if (hasCanvasOrSvg) {
        title = 'HTML5 交互作品';
      } else {
        title = '可交互微组件';
      }
      return {
        code: trimmed,
        language: 'html',
        title,
        lineCount,
      };
    }
  }

  return null;
}

export type StreamingBlockStatus =
  | 'pending_sniff'      // 刚遇到 ```html，不足1行，微缓冲等待嗅探（约100~150ms）
  | 'streaming_artifact' // 已嗅探确认为完整制品，展示【取景框 + 极光骨架屏 + 实时行数】
  | 'ready_artifact'     // 代码块已闭合 ``` 且通过完整性校验，挂载 WebView 揭幕画面
  | 'normal_codeblock';  // 普通教学代码片段，或被用户中途点击“停止生成”的残缺代码

export interface SniffResult {
  status: StreamingBlockStatus;
  artifactType?: 'html' | 'svg';
  liveTitle?: string;
  lineCount: number;
}

/**
 * 在流式输出过程中，实时嗅探代码块是否为完整可执行制品
 * 采用 60 字符微缓冲防闪与首行契约嗅探机制，第一时间隔离滚动代码并原地挂载极光取景框
 */
export function sniffCodeBlockInStream(
  rawCode: string,
  language: string = '',
  isFenceClosed: boolean,
  isMessageStreaming: boolean
): SniffResult {
  const lang = language.toLowerCase().trim();
  const lines = rawCode.split('\n');
  const lineCount = lines.length;

  // 1. 非 Web 视图语言（Python/JS/TS/JSON/Bash等），0 延迟直接走普通代码块
  if (lang && !['html', 'htm', 'xhtml', 'svg', 'xml'].includes(lang)) {
    return { status: 'normal_codeblock', lineCount };
  }

  const trimmed = rawCode.trimStart();

  // 2. 还在吐前几个字符（未满 1 行且少于 60 字符），微缓冲挂起防止黑块闪屏
  if (!isFenceClosed && isMessageStreaming && trimmed.length < 60 && !trimmed.includes('\n')) {
    return { status: 'pending_sniff', lineCount };
  }

  // 3. 首行契约嗅探：剥离最前面的 HTML/XML 注释后，看第 1 个标签是不是文档级根节点
  const withoutLeadingComments = trimmed.replace(
    /^(?:<!--[\s\S]*?-->\s*|<\?xml[\s\S]*?\?>\s*)*/i,
    ''
  );

  const isFullHtmlHeader = /^<!doctype\s+html\b|^<html\b/i.test(withoutLeadingComments);
  const isFullSvgHeader = /^<svg\b[^>]*?(?:viewBox|xmlns)/i.test(withoutLeadingComments);

  // 如果开头不是 <!DOCTYPE html> / <html> / <svg viewBox...>，说明是局部教学代码（如 <div> / <style>）
  if (!isFullHtmlHeader && !isFullSvgHeader) {
    return { status: 'normal_codeblock', lineCount };
  }

  // 4. 实时从流式半成品中提取 <title>，让骨架屏顶栏第一时间显示出作品名字
  const titleMatch = rawCode.match(/<title[^>]*>([^<]+)<\/title>/i);
  const liveTitle = titleMatch?.[1]?.trim() || (isFullSvgHeader ? 'SVG 矢量绘图' : 'HTML5 交互呈现');
  const artifactType: 'html' | 'svg' = isFullSvgHeader ? 'svg' : 'html';

  // 5. 如果代码块还没闭合（正在流式生成代码体）
  if (!isFenceClosed) {
    if (isMessageStreaming) {
      // 正在流式生成中 -> 渲染【取景框 + 极光骨架屏 + 实时跳动行数】
      return { status: 'streaming_artifact', artifactType, liveTitle, lineCount };
    } else {
      // 消息流已经结束（例如用户中途按了“停止生成”按钮），导致代码块没闭合 -> 安全降级回普通代码块！
      return { status: 'normal_codeblock', lineCount };
    }
  }

  // 6. 代码块已闭合（收到了结尾的 ```）：直接复用权威的 detectStandaloneArtifactCandidate 契约，100% 杜绝规则分歧
  const candidate = detectStandaloneArtifactCandidate(
    rawCode,
    lang || (isFullSvgHeader ? 'svg' : 'html')
  );
  if (!candidate) {
    return { status: 'normal_codeblock', lineCount };
  }

  return {
    status: 'ready_artifact',
    artifactType: candidate.language,
    liveTitle: candidate.title || liveTitle,
    lineCount: candidate.lineCount,
  };
}
