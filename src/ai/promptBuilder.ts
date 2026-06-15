import { MATERIAL_SESSION_RULES } from './aiConstants';
import {
  buildPromptCacheMetadata,
  type AiChatMode,
  type AiPromptBlock,
  type AiPromptCacheMetadata,
} from './aiPromptCache';
import type { AiReplyPreference, AiRoleInstructionWeight } from './types';

export interface BuiltPrompt {
  cacheMetadata: AiPromptCacheMetadata;
  materialRules?: string | null;
  promptLayers: AiPromptBlock[];
  stableSystemBlocks: Array<{ name: AiPromptBlock['name']; text: string }>;
  system: string;
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

function frameReplyPreference(preference: AiReplyPreference = 'auto'): string {
  if (preference === 'concise') {
    return [
      '回复倾向：默认更直接、更简洁，减少铺垫和重复，但不要省略必要事实、关键步骤或风险。',
      '如果用户当前明确要求详细、展开、逐步说明或指定格式，以用户当前要求为准。',
    ].join('\n');
  }
  if (preference === 'detailed') {
    return [
      '回复倾向：默认多给必要背景、步骤和注意点，让回答更完整，但避免模板化、空泛扩写和无关铺垫。',
      '如果用户当前明确要求简短、一句话、只给结论或指定格式，以用户当前要求为准。',
    ].join('\n');
  }
  return '';
}

function block(name: AiPromptBlock['name'], text: string | null | undefined, stable: boolean, version = 1): AiPromptBlock {
  return {
    name,
    stable,
    text: text?.trim() ?? '',
    version,
  };
}

function joinBlocks(blocks: Array<{ text: string }>): string {
  return blocks.map((item) => item.text).filter(Boolean).join('\n\n');
}

export function buildNormalChatPrompt(input: {
  chatMode: AiChatMode;
  memoryEpoch: string;
  systemPrompt: string;
  roleInstructionWeight?: AiRoleInstructionWeight;
  replyPreference?: AiReplyPreference;
  stableMemoryPrefix?: string | null;
  userProfile?: string | null;
  summarySegments?: string | null;
  companionMemoryPrefix?: string | null;
  dynamicMemoryContext?: string | null;
  rolePrompt?: string | null;
  materialSnippets?: Array<{ label: string; text: string }>;
  userMessage: string;
}): BuiltPrompt {
  const materialSection = input.materialSnippets?.length
    ? [
        '当前会话资料：',
        ...input.materialSnippets.map((snippet, index) => `[${index + 1}] ${snippet.label}\n${snippet.text}`),
      ].join('\n\n')
    : '';

  const stableBlocks = [
    block('stable_app_policy', frameRoleInstruction(input.systemPrompt, input.roleInstructionWeight), true),
    block('stable_role', frameReplyPreference(input.replyPreference), true),
    block('stable_material_rules', '', true),
    block('stable_tool_definitions', '', true),
    block('memory_snapshot', [
      input.companionMemoryPrefix,
      input.userProfile ? `关于这个用户：\n${input.userProfile}\n不要为了展示记忆而主动提旧事。` : '',
      input.summarySegments ? `过往记忆：\n${input.summarySegments}` : '',
      input.stableMemoryPrefix,
      input.rolePrompt,
    ].filter(Boolean).join('\n\n'), true),
  ];
  const dynamicBlocks = [
    block('history_window', '', false),
    block('dynamic_memory', input.dynamicMemoryContext, false),
    block('retrieval_context', materialSection, false),
    block('current_user_message', `用户当前问题：\n${input.userMessage}`, false),
  ];
  const promptLayers = [...stableBlocks, ...dynamicBlocks];
  const system = joinBlocks(stableBlocks);
  const user = joinBlocks(dynamicBlocks);

  return {
    cacheMetadata: buildPromptCacheMetadata({
      blocks: promptLayers,
      chatMode: input.chatMode,
      memoryEpoch: input.memoryEpoch,
      retrievalText: materialSection,
    }),
    materialRules: null,
    promptLayers,
    stableSystemBlocks: stableBlocks.map((item) => ({ name: item.name, text: item.text })),
    system,
    user,
  };
}

export function buildMaterialBoundPrompt(input: {
  chatMode: AiChatMode;
  memoryEpoch: string;
  editablePrompt: string;
  roleInstructionWeight?: AiRoleInstructionWeight;
  replyPreference?: AiReplyPreference;
  stableMemoryPrefix?: string | null;
  userProfile?: string | null;
  summarySegments?: string | null;
  companionMemoryPrefix?: string | null;
  dynamicMemoryContext?: string | null;
  materialRules?: string;
  contextSummary: string;
  snippets: Array<{ label: string; text: string }>;
  userMessage: string;
}): BuiltPrompt {
  const materialRules = input.materialRules ?? MATERIAL_SESSION_RULES;
  const retrievalContext = [
    input.contextSummary,
    '可引用资料片段：',
    ...input.snippets.map((snippet, index) => `[${index + 1}] ${snippet.label}\n${snippet.text}`),
  ].join('\n\n');
  const stableBlocks = [
    block('stable_app_policy', frameRoleInstruction(input.editablePrompt, input.roleInstructionWeight), true),
    block('stable_role', frameReplyPreference(input.replyPreference), true),
    block('stable_material_rules', ['资料规则：', materialRules].join('\n'), true),
    block('stable_tool_definitions', '', true),
    block('memory_snapshot', [
      input.companionMemoryPrefix,
      input.userProfile ? `关于这个用户：\n${input.userProfile}\n不要为了展示记忆而主动提旧事。` : '',
      input.summarySegments ? `过往记忆：\n${input.summarySegments}` : '',
      input.stableMemoryPrefix,
    ].filter(Boolean).join('\n\n'), true),
  ];
  const dynamicBlocks = [
    block('history_window', '', false),
    block('retrieval_context', retrievalContext, false),
    block('dynamic_memory', input.dynamicMemoryContext, false),
    block('current_user_message', ['用户问题：', input.userMessage].join('\n'), false),
  ];
  const promptLayers = [...stableBlocks, ...dynamicBlocks];
  const system = joinBlocks(stableBlocks);
  const user = joinBlocks(dynamicBlocks);

  return {
    cacheMetadata: buildPromptCacheMetadata({
      blocks: promptLayers,
      chatMode: input.chatMode,
      memoryEpoch: input.memoryEpoch,
      retrievalText: retrievalContext,
    }),
    materialRules,
    promptLayers,
    stableSystemBlocks: stableBlocks.map((item) => ({ name: item.name, text: item.text })),
    system,
    user,
  };
}
