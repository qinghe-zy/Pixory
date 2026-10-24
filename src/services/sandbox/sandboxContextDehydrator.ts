import { extractArtifactTitle } from './sandboxAssembler';
import { isExecutableSandboxCode } from './sandboxDetector';

export interface DehydrateOptions {
  currentArtifactId?: string;
}

export function dehydrateCodeBlockToStub(code: string, language?: string, artifactId?: string): string {
  const title = extractArtifactTitle(code, language);
  const lang = (language || 'html').toLowerCase();
  const id = artifactId || `art_${Math.abs(code.length * 31).toString(36)}`;
  const lineCount = (code.match(/\n/g) || []).length + 1;

  return `<artifact_ref id="${id}" title="${title}" language="${lang}" lines="${lineCount}" />`;
}

export function dehydrateHistoricalMessageContent(content: string, options?: DehydrateOptions): string {
  if (!content || typeof content !== 'string') {
    return content;
  }

  let processed = content;
  // 1. 如果历史消息中包含向模型注入的动态快照容器，必须脱水清除，防止历史多轮累积数千 Token
  if (processed.includes('<active_artifact_context>')) {
    processed = processed.replace(/<active_artifact_context>[\s\S]*?<\/active_artifact_context>/g, '').trim();
  }

  if (!processed.includes('```')) {
    return processed;
  }

  // 2. 正则匹配 ```lang\ncode\n```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)\n```/g;

  return processed.replace(codeBlockRegex, (match, lang, code) => {
    // 检查是否包含 SEARCH / REPLACE 差分块
    if (code.includes('<<<<<<< SEARCH') && code.includes('>>>>>>> REPLACE')) {
      return `<artifact_diff_applied summary="代码微调增量补丁" />`;
    }

    // 检查是否为可执行沙箱制品
    if (isExecutableSandboxCode(code, lang)) {
      return dehydrateCodeBlockToStub(code, lang, options?.currentArtifactId);
    }

    // 普通代码块保留
    return match;
  });
}
