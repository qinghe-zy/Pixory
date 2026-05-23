import { MATERIAL_SESSION_RULES } from './aiConstants';
import type { AiRoleInstructionWeight } from './types';

export interface BuiltPrompt {
  system: string;
  materialRules?: string | null;
  user: string;
}

const DEFAULT_ROLE_INSTRUCTION_FRAME = [
  '当前会话角色指令如下。它是本次请求的角色设定，必须在回答中体现。',
  '如果用户询问当前角色或自定义提示词是否生效，请基于这段角色指令简要说明，不要仅根据对话记录判断为未设置。',
].join('\n');

const HIGH_ROLE_INSTRUCTION_FRAME = [
  '【最高优先级：当前会话角色指令】',
  '下面内容定义本会话的身份、语气、边界和输出方式。',
  '如果用户询问你是谁、你的角色、回答风格、工作方式，必须依据本区块回答。',
].join('\n');

function frameRoleInstruction(prompt: string, weight: AiRoleInstructionWeight = 'default'): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return '';
  }
  const frame = weight === 'high' ? HIGH_ROLE_INSTRUCTION_FRAME : DEFAULT_ROLE_INSTRUCTION_FRAME;
  return [frame, trimmed].filter(Boolean).join('\n\n');
}

export function buildNormalChatPrompt(input: {
  systemPrompt: string;
  roleInstructionWeight?: AiRoleInstructionWeight;
  rolePrompt?: string | null;
  userMessage: string;
}): BuiltPrompt {
  return {
    system: [frameRoleInstruction(input.systemPrompt, input.roleInstructionWeight), input.rolePrompt].filter(Boolean).join('\n\n'),
    materialRules: null,
    user: input.userMessage,
  };
}

export function buildMaterialBoundPrompt(input: {
  editablePrompt: string;
  roleInstructionWeight?: AiRoleInstructionWeight;
  materialRules?: string;
  contextSummary: string;
  snippets: Array<{ label: string; text: string }>;
  userMessage: string;
}): BuiltPrompt {
  const materialRules = input.materialRules ?? MATERIAL_SESSION_RULES;
  return {
    system: [frameRoleInstruction(input.editablePrompt, input.roleInstructionWeight), '资料规则：', materialRules].filter(Boolean).join('\n\n'),
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
