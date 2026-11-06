/**
 * 角色卡提示词与文本宏清洗工具 (Role Prompt & Macro Sanitizer)
 *
 * 仅用于 UI 呈现层的只读投影，绝不修改数据库底层记录，避免污染导出和二次编辑。
 */

export interface RoleSanitizeOptions {
  roleName: string;
  userNickname?: string | null;
  mode?: 'cleaned' | 'raw';
}

/**
 * 清洗角色人设、开场白及描述中的宏变量与机械语法
 */
export function sanitizeRolePromptForDisplay(
  text: string | null | undefined,
  options: RoleSanitizeOptions
): string {
  if (!text) {
    return '';
  }
  if (options.mode === 'raw') {
    return text;
  }

  const userCallName = options.userNickname?.trim() || '你';
  const roleName = options.roleName?.trim() || '角色';

  return text
    // 1. 替换角色名宏: {{char}}, {char}, <char>, <BOT>
    .replace(/\{\{\s*char\s*\}\}|\{\s*char\s*\}|<\s*char\s*>|<\s*BOT\s*>/gi, roleName)
    // 2. 替换用户宏: {{user}}, {user}, <user>, <USER>
    .replace(/\{\{\s*user\s*\}\}|\{\s*user\s*\}|<\s*user\s*>|<\s*USER\s*>/gi, userCallName)
    // 3. 滤除机械化 prompt 标记与上下文断句
    .replace(/<\s*START\s*>/gi, '')
    .replace(/###\s*(Instruction|Response|System):/gi, '')
    // 4. 清理连续多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 过滤角色标签列表，剔除模板变量与系统级杂音
 */
export function sanitizeRoleTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((tag) => tag.trim())
    .filter((trimmed) => {
      if (!trimmed) {
        return false;
      }
      // 剔除包含模板变量符号的伪标签如 {user}, {{char}}, <tag>
      if (trimmed.includes('{') || trimmed.includes('}') || trimmed.includes('<') || trimmed.includes('>')) {
        return false;
      }
      // 剔除系统级调试或无意义标记
      if (/^#?(nsfw|system|prompt|bot|char|user)$/i.test(trimmed)) {
        return false;
      }
      return true;
    });
}
