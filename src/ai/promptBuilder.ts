import { MATERIAL_SESSION_RULES } from './aiConstants';

export interface BuiltPrompt {
  system: string;
  materialRules?: string | null;
  user: string;
}

const ROLE_INSTRUCTION_FRAME = [
  '当前会话角色指令如下。它是本次请求的角色设定，必须在回答中体现。',
  '如果用户询问当前角色或自定义提示词是否生效，请基于这段角色指令简要说明，不要仅根据对话记录判断为未设置。',
].join('\n');

function frameRoleInstruction(prompt: string): string {
  return [ROLE_INSTRUCTION_FRAME, prompt.trim()].filter(Boolean).join('\n\n');
}

export function buildNormalChatPrompt(input: {
  systemPrompt: string;
  rolePrompt?: string | null;
  userMessage: string;
}): BuiltPrompt {
  return {
    system: [frameRoleInstruction(input.systemPrompt), input.rolePrompt].filter(Boolean).join('\n\n'),
    materialRules: null,
    user: input.userMessage,
  };
}

export function buildMaterialBoundPrompt(input: {
  editablePrompt: string;
  materialRules?: string;
  contextSummary: string;
  snippets: Array<{ label: string; text: string }>;
  userMessage: string;
}): BuiltPrompt {
  const materialRules = input.materialRules ?? MATERIAL_SESSION_RULES;
  return {
    system: [frameRoleInstruction(input.editablePrompt), '资料规则：', materialRules].filter(Boolean).join('\n\n'),
    materialRules,
    user: [
      input.contextSummary,
      '可引用资料片段：',
      ...input.snippets.map((snippet, index) => `[${index + 1}] ${snippet.label}\n${snippet.text}`),
      '用户问题：',
      input.userMessage,
    ].join('\n\n'),
  };
}
