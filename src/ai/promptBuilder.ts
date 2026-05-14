import { MATERIAL_SESSION_RULES } from './aiConstants';

export interface BuiltPrompt {
  system: string;
  materialRules?: string | null;
  user: string;
}

export function buildNormalChatPrompt(input: {
  systemPrompt: string;
  rolePrompt?: string | null;
  userMessage: string;
}): BuiltPrompt {
  return {
    system: [input.systemPrompt, input.rolePrompt].filter(Boolean).join('\n\n'),
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
    system: [input.editablePrompt, '资料规则：', materialRules].filter(Boolean).join('\n\n'),
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
