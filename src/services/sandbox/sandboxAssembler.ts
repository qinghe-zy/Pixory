import { SINGLE_LINE_RUNTIME_SHIM, getSandboxBaseUrl } from './sandboxRuntimeShims';
import type { SandboxAssemblyResult, SearchReplaceDiffBlock, SearchReplaceResult } from './sandboxTypes';

export function assembleSandboxHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return `<script>${SINGLE_LINE_RUNTIME_SHIM}</script>`;
  }

  // 匹配首行水平空白 + <!DOCTYPE html>，严禁使用 \s* 以防吞掉 \n
  if (/^[ \t]*<!DOCTYPE html>/i.test(rawHtml)) {
    return rawHtml.replace(/^[ \t]*<!DOCTYPE html>/i, (match) => `${match}<script>${SINGLE_LINE_RUNTIME_SHIM}</script>`);
  }

  return `<script>${SINGLE_LINE_RUNTIME_SHIM}</script>${rawHtml}`;
}

export function parseSearchReplaceBlocks(diffText: string): SearchReplaceDiffBlock[] {
  if (!diffText || typeof diffText !== 'string') {
    return [];
  }

  const normalized = diffText.replace(/\r\n/g, '\n');
  const blocks: SearchReplaceDiffBlock[] = [];
  const regex = /<{7}\s*SEARCH\s*\n([\s\S]*?)\n={7}\s*\n([\s\S]*?)\n>{7}\s*REPLACE/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    blocks.push({
      search: match[1] ?? '',
      replace: match[2] ?? '',
    });
  }

  return blocks;
}

function normalizeLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function trimTrailingLineSpaces(text: string): string {
  return normalizeLines(text)
    .map((line) => line.trimEnd())
    .join('\n');
}

export function applySearchReplacePatch(originalSource: string, diffText: string): SearchReplaceResult {
  const blocks = parseSearchReplaceBlocks(diffText);
  if (blocks.length === 0) {
    return {
      success: false,
      result: originalSource,
      replacedBlocks: 0,
      error: '未检测到有效的 SEARCH / REPLACE 差分块',
    };
  }

  let currentSource = originalSource.replace(/\r\n/g, '\n');
  let replacedCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const searchTarget = block.search;
    const replacement = block.replace;

    // 1. 精确字面匹配（使用函数式替换，防止 replacement 中包含 $ 变量名时被转义吞没）
    if (currentSource.includes(searchTarget)) {
      currentSource = currentSource.replace(searchTarget, () => replacement);
      replacedCount++;
      continue;
    }

    // 2. 行尾空格容错匹配
    const trimmedTarget = trimTrailingLineSpaces(searchTarget);
    const trimmedSource = trimTrailingLineSpaces(currentSource);

    if (trimmedSource.includes(trimmedTarget)) {
      const sourceLines = normalizeLines(currentSource);
      const targetLines = normalizeLines(searchTarget).map((l) => l.trimEnd());
      const targetLen = targetLines.length;

      let matchedIndex = -1;
      for (let lineIdx = 0; lineIdx <= sourceLines.length - targetLen; lineIdx++) {
        let allMatch = true;
        for (let subIdx = 0; subIdx < targetLen; subIdx++) {
          if ((sourceLines[lineIdx + subIdx] ?? '').trimEnd() !== targetLines[subIdx]) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          matchedIndex = lineIdx;
          break;
        }
      }

      if (matchedIndex !== -1) {
        const before = sourceLines.slice(0, matchedIndex);
        const after = sourceLines.slice(matchedIndex + targetLen);
        const replacementLines = normalizeLines(replacement);
        currentSource = [...before, ...replacementLines, ...after].join('\n');
        replacedCount++;
        continue;
      }
    }

    return {
      success: false,
      result: originalSource,
      replacedBlocks: replacedCount,
      error: `第 ${i + 1} 个差分块搜索失败：未能在源代码中匹配指定代码锚点`,
    };
  }

  return {
    success: true,
    result: currentSource,
    replacedBlocks: replacedCount,
  };
}

export function extractArtifactTitle(code: string, language?: string): string {
  if (!code || typeof code !== 'string') {
    return '交互式沙箱';
  }

  // 1. 尝试匹配 HTML <title>
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(code);
  if (titleMatch && titleMatch[1]) {
    const cleanTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    if (cleanTitle && cleanTitle.length <= 40) {
      return cleanTitle;
    }
  }

  // 2. 尝试首行或前几行的注释标题 (// 标题: xxx 或 <!-- 标题: xxx -->)
  const commentTitleMatch = /(?:\/\/|<!--|\/\*)\s*(?:title|标题|项目|名称)?[:：]?\s*([^\r\n*<]+)/i.exec(code.slice(0, 500));
  if (commentTitleMatch && commentTitleMatch[1]) {
    const cleanComment = commentTitleMatch[1].trim();
    if (cleanComment && cleanComment.length >= 2 && cleanComment.length <= 30) {
      return cleanComment;
    }
  }

  // 3. 语言与内容特征识别
  const lowerLang = (language ?? '').toLowerCase();
  if (lowerLang === 'svg' || /<svg\b/i.test(code.slice(0, 300))) {
    return '矢量图形沙箱';
  }

  if (code.includes('canvas') || /requestAnimationFrame|setInterval|keydown/i.test(code)) {
    return '交互式小游戏';
  }

  return '交互式沙箱';
}

export function buildSandboxAssembly(params: {
  code: string;
  language?: string;
  artifactId?: string;
  title?: string;
}): SandboxAssemblyResult {
  const artifactId = params.artifactId || `art_${Date.now().toString(36)}`;
  const title = params.title || extractArtifactTitle(params.code, params.language);
  const html = assembleSandboxHtml(params.code);
  const baseUrl = getSandboxBaseUrl(artifactId);

  return {
    html,
    baseUrl,
    artifactId,
    title,
  };
}
