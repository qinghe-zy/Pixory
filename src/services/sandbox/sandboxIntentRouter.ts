import type { SandboxTrack } from './sandboxTypes';

export interface SandboxIntentParams {
  activeArtifact?: {
    id: string;
    code: string;
    title: string;
    language?: string;
    version?: number;
  } | null;
  userMessage: string;
}

const CREATE_INTENT_PATTERNS = [
  /写一个?(?:html|网页|小游戏|转盘|动画|2048|贪吃蛇|打砖块|俄罗斯方块)/i,
  /做一个?(?:html|网页|小游戏|转盘|动画|2048|贪吃蛇|打砖块|俄罗斯方块)/i,
  /制作一个?(?:html|网页|小游戏|转盘|动画|2048|贪吃蛇|打砖块|俄罗斯方块)/i,
  /开发一个?(?:html|网页|小游戏|转盘|动画|2048|贪吃蛇|打砖块|俄罗斯方块)/i,
  /生成一个?(?:html|网页|小游戏|转盘|动画|svg)/i,
  /用\s*(?:html|canvas|svg)\s*实现/i,
];

export function detectSandboxTrack(params: SandboxIntentParams): SandboxTrack {
  if (params.activeArtifact && params.activeArtifact.code) {
    return 'modify';
  }

  const message = params.userMessage.trim();
  for (const pattern of CREATE_INTENT_PATTERNS) {
    if (pattern.test(message)) {
      return 'create';
    }
  }

  return 'chat';
}

export function buildSandboxDynamicPromptSection(params: SandboxIntentParams): string | null {
  const track = detectSandboxTrack(params);

  if (track === 'modify' && params.activeArtifact) {
    const artifact = params.activeArtifact;
    const lang = artifact.language || 'html';
    const ver = artifact.version ? `v${artifact.version}` : 'v1';

    return [
      `【当前活跃制品快照 (Active Artifact Snapshot)】`,
      `<active_artifact id="${artifact.id}" title="${artifact.title}" version="${ver}" language="${lang}">`,
      artifact.code,
      `</active_artifact>`,
      '',
      `【代码微调规范：SEARCH/REPLACE 差分协议】`,
      `当前正在针对上述制品代码进行微调或修复。`,
      `为大幅降低延迟并保护上下文，请绝对不要输出完整文件代码！`,
      `你必须输出一个或多个 SEARCH / REPLACE 差分块来精确描述修改部位：`,
      `<<<<<<< SEARCH`,
      `[待替换的原始精准代码片段]`,
      `=======`,
      `[修改后的新代码片段]`,
      `>>>>>>> REPLACE`,
      `伴侣提示：在差分块之外，请用你一贯的温暖自然口吻跟伴侣交流几句，说明改了什么。`,
    ].join('\n');
  }

  if (track === 'create') {
    return [
      `【交互式沙箱制品生成规范】`,
      `伴侣希望你制作一个交互式小道具、小游戏或动态页面。`,
      `要求：`,
      `1. 输出单一自包含代码块（以 \`\`\`html 开头并以 \`\`\` 闭合）；`,
      `2. 首行必须为 <!DOCTYPE html>，所有样式写在 <style> 中，所有脚本写在 <script> 中；`,
      `3. 零依赖优先：尽量使用原生 Canvas、WebAudio、CSS 动画与 DOM，避免依赖可能加载超时或失效的外部 CDN 脚本；`,
      `4. 界面友好：适配移动端竖屏操作，触摸点击防误触；`,
      `5. 伴侣人设：在代码块之后，用温暖亲昵的口吻向伴侣介绍这个小礼物。`,
    ].join('\n');
  }

  return null;
}
