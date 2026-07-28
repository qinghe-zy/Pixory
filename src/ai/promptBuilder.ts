import { MATERIAL_SESSION_RULES } from './aiConstants';
import { fitPromptBlocksToContextBudget } from './aiContextBudget';
import {
  AI_PROMPT_LAYER_VERSIONS,
  buildPromptCacheMetadata,
  type AiChatMode,
  type AiDynamicContextSegment,
  type AiDynamicContextSegmentType,
  type AiPromptBlock,
  type AiPromptCacheMetadata,
} from './aiPromptCache';
import type { AiReplyPreference, AiRoleInstructionWeight } from './types';

export interface BuiltPrompt {
  cacheMetadata: AiPromptCacheMetadata;
  contextBudgetTrimmed?: boolean;
  materialRules?: string | null;
  promptLayers: AiPromptBlock[];
  stableSystemBlocks: Array<{ name: AiPromptBlock['name']; text: string }>;
  system: string;
  user: string;
}

export interface AiRolePromptContext {
  description?: string | null;
  messageExample?: string | null;
  name?: string | null;
  personality?: string | null;
  postHistoryInstructions?: string | null;
  scenario?: string | null;
  sourceJson?: string | null;
  systemPrompt?: string | null;
}

type JsonRecord = Record<string, unknown>;
type ResolvedRolePromptContext = Required<Omit<AiRolePromptContext, 'sourceJson'>>;

const STRUCTURED_SILLYTAVERN_SECTION_TITLES = new Set([
  '角色描述',
  '性格',
  '场景',
  '系统提示',
  '历史后指令',
  '对话示例',
]);

const DEFAULT_ROLE_INSTRUCTION_FRAME = [
  '当前会话角色指令如下。它是本次请求的角色设定，必须在回答中体现。',
  '如果用户询问当前角色或自定义提示词是否生效，请基于这段角色指令简要说明，不要仅根据对话记录判断为未设置。',
].join('\n');

const HIGH_ROLE_INSTRUCTION_FRAME = [
  '【最高优先级：当前会话角色指令】',
  '下面内容定义本会话的身份、语气、边界和输出方式。',
  '如果用户询问你是谁、你的角色、回答风格、工作方式，必须依据本区块回答。',
].join('\n');

const IMMERSIVE_COMPANION_FRAME = [
  '沉浸式对话框架：把本轮回复当作当前角色在连续聊天中的下一条自然回应，而不是重新开启一次通用问答。',
  '优先保持角色身份、关系状态、语气、场景氛围和最近对话的连续性；不要主动跳出设定解释自己是 AI、语言模型或系统。',
  '除非用户明确要求分析、总结、翻译、写代码或列步骤，否则用贴近当前角色和关系的口吻直接回应。',
].join('\n');

const SILLYTAVERN_IMMERSIVE_ROLEPLAY_FRAME = [
  'SillyTavern 风格沉浸式角色扮演要求：',
  '只写当前角色这一条回复，不要续写多轮对话，不要重复这些要求。',
  '不要替用户决定台词、动作、心理、选择或结果；用户的行为必须留给用户自己表达。',
  '默认至少一段、最多四段；除非用户要求极简，否则让动作、情绪、感官细节和环境反馈自然进入回复。',
  '保持语言有节奏变化，避免机械问答、重复套话和过度总结。',
].join('\n');

function frameRoleInstruction(prompt: string, weight: AiRoleInstructionWeight = 'default'): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return '';
  }
  const frame = weight === 'high' ? HIGH_ROLE_INSTRUCTION_FRAME : DEFAULT_ROLE_INSTRUCTION_FRAME;
  return [frame, IMMERSIVE_COMPANION_FRAME, trimmed].filter(Boolean).join('\n\n');
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readSillyTavernData(sourceJson?: string | null): JsonRecord | null {
  if (!sourceJson?.trim()) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(sourceJson);
    if (!isRecord(parsed)) {
      return null;
    }
    if ((parsed.spec === 'chara_card_v2' || parsed.spec === 'chara_card_v3') && isRecord(parsed.data)) {
      return parsed.data;
    }
    return parsed;
  } catch {
    return null;
  }
}

function replaceRoleMacros(text: string, input: { roleName?: string | null; userName?: string | null }): string {
  const roleName = input.roleName?.trim() || '当前角色';
  const userName = input.userName?.trim() || '用户';
  return text
    .replace(/\{\{\s*char\s*\}\}/gi, roleName)
    .replace(/\{\{\s*user\s*\}\}/gi, userName);
}

function section(title: string, content: string | null | undefined, input: { roleName?: string | null }): string {
  const trimmed = content?.trim();
  if (!trimmed) {
    return '';
  }
  return `## ${title}\n${replaceRoleMacros(trimmed, { roleName: input.roleName })}`;
}

function resolveRolePromptContext(input?: AiRolePromptContext | null): ResolvedRolePromptContext {
  const data = readSillyTavernData(input?.sourceJson);
  const name = stringField(data?.name) || input?.name?.trim() || null;
  const preferSource = Boolean(data);
  return {
    description: preferSource
      ? stringField(data?.description) || input?.description?.trim() || null
      : input?.description?.trim() || null,
    messageExample: preferSource
      ? stringField(data?.mes_example) || input?.messageExample?.trim() || null
      : input?.messageExample?.trim() || null,
    name,
    personality: preferSource
      ? stringField(data?.personality) || input?.personality?.trim() || null
      : input?.personality?.trim() || null,
    postHistoryInstructions: preferSource
      ? stringField(data?.post_history_instructions) || input?.postHistoryInstructions?.trim() || null
      : input?.postHistoryInstructions?.trim() || null,
    scenario: preferSource
      ? stringField(data?.scenario) || input?.scenario?.trim() || null
      : input?.scenario?.trim() || null,
    systemPrompt: preferSource
      ? stringField(data?.system_prompt) || input?.systemPrompt?.trim() || null
      : input?.systemPrompt?.trim() || null,
  };
}

function buildStructuredRoleCardPrompt(context: ResolvedRolePromptContext): string {
  const body = [
    section('角色描述', context.description, { roleName: context.name }),
    section('性格', context.personality, { roleName: context.name }),
    section('场景', context.scenario, { roleName: context.name }),
    section('系统提示', context.systemPrompt, { roleName: context.name }),
    section('对话示例', context.messageExample, { roleName: context.name }),
  ].filter(Boolean).join('\n\n');
  if (!body) {
    return '';
  }
  return ['SillyTavern 风格角色卡结构：', body].join('\n\n');
}

function stripStructuredSillyTavernSections(prompt: string, roleCardContext?: AiRolePromptContext | null): string {
  if (!roleCardContext?.sourceJson || !prompt.trim()) {
    return prompt;
  }
  const lines = prompt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const keptSections: string[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  function flush(): void {
    if (currentLines.length === 0) {
      return;
    }
    if (!currentTitle || !STRUCTURED_SILLYTAVERN_SECTION_TITLES.has(currentTitle)) {
      keptSections.push(currentLines.join('\n').trim());
    }
  }

  for (const line of lines) {
    const title = /^##\s+(.+?)\s*$/.exec(line)?.[1]?.trim() ?? null;
    if (title) {
      flush();
      currentTitle = title;
      currentLines = [line];
      continue;
    }
    currentLines.push(line);
  }
  flush();

  return keptSections.filter(Boolean).join('\n\n').trim();
}

function buildPostHistoryInstruction(context: ResolvedRolePromptContext): string {
  if (!context.postHistoryInstructions) {
    return '';
  }
  return section('历史后指令', context.postHistoryInstructions, { roleName: context.name });
}

function shouldUseSillyTavernRoleplayFrame(input: {
  chatMode: AiChatMode;
  roleCardContext?: AiRolePromptContext | null;
}): boolean {
  return input.chatMode === 'roleplay' || Boolean(input.roleCardContext?.sourceJson || input.roleCardContext?.name);
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

function compileDynamicSegments(
  segments: AiDynamicContextSegment[] | undefined,
  type: AiDynamicContextSegmentType,
): string {
  return (segments ?? [])
    .filter((segment) => segment.type === type && !segment.traceOnly && segment.text.trim())
    .slice()
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    .map((segment) => segment.text.trim())
    .join('\n\n');
}

function compileUserObservation(input: {
  companionMemoryPrefix?: string | null;
  userProfile?: string | null;
  dynamicSegments?: AiDynamicContextSegment[];
}): string {
  return [
    input.companionMemoryPrefix,
    input.userProfile ? `关于这个用户：\n${input.userProfile}\n不要为了展示记忆而主动提旧事。` : '',
    compileDynamicSegments(input.dynamicSegments, 'user_observation'),
  ].filter(Boolean).join('\n\n');
}

function buildNextReplyNudge(input: {
  hasMaterialContext: boolean;
  postHistoryInstruction?: string | null;
  replyPreference?: AiReplyPreference;
}): string {
  const lines = [
    input.postHistoryInstruction?.trim() ?? '',
    '下一条回复要求：',
    '请直接生成当前角色/助手此刻应该发出的下一条消息；除非用户明确要求检查角色设定、提示词状态或配置，否则不要复述系统规则、不要解释提示词结构、不要声明“我将扮演”。',
    '默认延续最近上下文、人物关系和情绪节奏；如果用户正在角色对话中，用自然对话推进，而不是用问答模板收束。',
  ].filter(Boolean);
  if (input.hasMaterialContext) {
    lines.push('涉及资料、知识库或 IP 设定时，优先贴合已提供片段；没有依据的细节不要伪造为资料事实。');
  }
  if (input.replyPreference === 'concise') {
    lines.push('保持短而有力，但保留角色感和必要信息。');
  } else if (input.replyPreference === 'detailed') {
    lines.push('可以展开细节、动作、心理或步骤，但避免空泛铺垫。');
  }
  return lines.join('\n');
}

function promptBlockPriority(name: AiPromptBlock['name']): 'dynamic' | 'protected' | 'required' | 'stable' {
  if (name === 'current_user_message' || name === 'summary_bridge') {
    return 'required';
  }
  if (name === 'memory_snapshot') {
    return 'protected';
  }
  if (
    name === 'companion_runtime'
    || name === 'temporal_open_loops'
    || name === 'user_observation'
    || name === 'dynamic_memory'
    || name === 'retrieval_context'
    || name === 'history_window'
  ) {
    return 'dynamic';
  }
  return 'stable';
}

function promptBlockMinChars(name: AiPromptBlock['name']): number {
  if (name === 'current_user_message') {
    return 0;
  }
  if (name === 'stable_app_policy' || name === 'stable_role') {
    return 280;
  }
  if (name === 'stable_material_rules') {
    return 240;
  }
  return 0;
}

function buildPromptFromLayers(input: {
  chatMode: AiChatMode;
  materialRules?: string | null;
  memoryEpoch: string;
  promptLayers: AiPromptBlock[];
}): BuiltPrompt {
  const stableBlocks = input.promptLayers.filter((item) => item.stable);
  const dynamicBlocks = input.promptLayers.filter((item) => !item.stable);
  const retrievalBlock = input.promptLayers.find((item) => item.name === 'retrieval_context');
  return {
    cacheMetadata: buildPromptCacheMetadata({
      blocks: input.promptLayers,
      chatMode: input.chatMode,
      memoryEpoch: input.memoryEpoch,
      retrievalText: retrievalBlock?.text ?? '',
    }),
    materialRules: input.materialRules ?? null,
    promptLayers: input.promptLayers,
    stableSystemBlocks: stableBlocks.map((item) => ({ name: item.name, text: item.text })),
    system: joinBlocks(stableBlocks),
    user: joinBlocks(dynamicBlocks),
  };
}

export function fitBuiltPromptToContextBudget(input: {
  modelContextWindowTokens?: number | null;
  prompt: BuiltPrompt;
}): BuiltPrompt {
  const budgeted = fitPromptBlocksToContextBudget({
    blocks: input.prompt.promptLayers.map((layer) => ({
      key: layer.name,
      minChars: promptBlockMinChars(layer.name),
      priority: promptBlockPriority(layer.name),
      text: layer.text,
    })),
    modelContextWindowTokens: input.modelContextWindowTokens,
  });
  if (!budgeted.trimmed) {
    return input.prompt;
  }
  const textByName = new Map(budgeted.blocks.map((item) => [item.key, item.text]));
  const promptLayers = input.prompt.promptLayers.map((layer) => ({
    ...layer,
    text: textByName.get(layer.name) ?? layer.text,
  }));
  return {
    ...buildPromptFromLayers({
      chatMode: input.prompt.cacheMetadata.chatMode,
      materialRules: input.prompt.materialRules ?? null,
      memoryEpoch: input.prompt.cacheMetadata.memoryEpoch,
      promptLayers,
    }),
    contextBudgetTrimmed: true,
  };
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
  stableSummarySnapshot?: string | null;
  companionMemoryPrefix?: string | null;
  dynamicMemoryContext?: string | null;
  dynamicSegments?: AiDynamicContextSegment[];
  roleCardContext?: AiRolePromptContext | null;
  rolePrompt?: string | null;
  materialSnippets?: Array<{ label: string; text: string }>;
  attachmentPromptContext?: string | null;
  userMessage: string;
}): BuiltPrompt {
  const resolvedRoleContext = resolveRolePromptContext(input.roleCardContext);
  const useRoleplayFrame = shouldUseSillyTavernRoleplayFrame(input);
  const baseRolePrompt = stripStructuredSillyTavernSections(input.systemPrompt, input.roleCardContext);
  const materialSection = input.materialSnippets?.length
    ? [
        '当前会话资料：',
        ...input.materialSnippets.map((snippet, index) => `[${index + 1}] ${snippet.label}\n${snippet.text}`),
      ].join('\n\n')
    : '';
  const retrievalContext = [materialSection, input.attachmentPromptContext].filter(Boolean).join('\n\n');
  const stableSummarySnapshot = input.stableSummarySnapshot ?? input.summarySegments ?? '';

  const stableBlocks = [
    block('stable_app_policy', '', true),
    block('stable_role', frameRoleInstruction([
      baseRolePrompt,
      useRoleplayFrame ? SILLYTAVERN_IMMERSIVE_ROLEPLAY_FRAME : '',
      buildStructuredRoleCardPrompt(resolvedRoleContext),
      frameReplyPreference(input.replyPreference),
      input.rolePrompt,
    ].filter(Boolean).join('\n\n'), input.roleInstructionWeight), true, AI_PROMPT_LAYER_VERSIONS.role),
    block('stable_material_rules', '', true),
    block('stable_tool_definitions', '', true),
    block('memory_snapshot', [
      stableSummarySnapshot ? `过往记忆：\n${stableSummarySnapshot}` : '',
      input.stableMemoryPrefix,
    ].filter(Boolean).join('\n\n'), true),
  ];
  const dynamicBlocks = [
    block('history_window', '', false),
    block('companion_runtime', compileDynamicSegments(input.dynamicSegments, 'companion_runtime'), false),
    block('temporal_open_loops', compileDynamicSegments(input.dynamicSegments, 'temporal_open_loops'), false),
    block('summary_bridge', compileDynamicSegments(input.dynamicSegments, 'summary_bridge'), false),
    block('user_observation', compileUserObservation(input), false),
    block('dynamic_memory', input.dynamicMemoryContext, false),
    block('retrieval_context', retrievalContext, false),
    block('current_user_message', [
      `用户当前问题：\n${input.userMessage}`,
      buildNextReplyNudge({
        hasMaterialContext: Boolean(retrievalContext),
        postHistoryInstruction: buildPostHistoryInstruction(resolvedRoleContext),
        replyPreference: input.replyPreference,
      }),
    ].join('\n\n'), false),
  ];
  const promptLayers = [...stableBlocks, ...dynamicBlocks];
  return buildPromptFromLayers({
    chatMode: input.chatMode,
    materialRules: null,
    memoryEpoch: input.memoryEpoch,
    promptLayers,
  });
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
  stableSummarySnapshot?: string | null;
  companionMemoryPrefix?: string | null;
  dynamicMemoryContext?: string | null;
  dynamicSegments?: AiDynamicContextSegment[];
  roleCardContext?: AiRolePromptContext | null;
  materialRules?: string;
  contextSummary: string;
  snippets: Array<{ label: string; text: string }>;
  attachmentPromptContext?: string | null;
  userMessage: string;
}): BuiltPrompt {
  const resolvedRoleContext = resolveRolePromptContext(input.roleCardContext);
  const useRoleplayFrame = shouldUseSillyTavernRoleplayFrame(input);
  const baseRolePrompt = stripStructuredSillyTavernSections(input.editablePrompt, input.roleCardContext);
  const materialRules = input.materialRules ?? MATERIAL_SESSION_RULES;
  const retrievalContext = [
    input.contextSummary,
    '可引用资料片段：',
    ...input.snippets.map((snippet, index) => `[${index + 1}] ${snippet.label}\n${snippet.text}`),
    input.attachmentPromptContext,
  ].join('\n\n');
  const stableSummarySnapshot = input.stableSummarySnapshot ?? input.summarySegments ?? '';
  const stableBlocks = [
    block('stable_app_policy', '', true),
    block('stable_role', frameRoleInstruction([
      baseRolePrompt,
      useRoleplayFrame ? SILLYTAVERN_IMMERSIVE_ROLEPLAY_FRAME : '',
      buildStructuredRoleCardPrompt(resolvedRoleContext),
      frameReplyPreference(input.replyPreference),
    ].filter(Boolean).join('\n\n'), input.roleInstructionWeight), true, AI_PROMPT_LAYER_VERSIONS.role),
    block('stable_material_rules', ['资料规则：', materialRules].join('\n'), true),
    block('stable_tool_definitions', '', true),
    block('memory_snapshot', [
      stableSummarySnapshot ? `过往记忆：\n${stableSummarySnapshot}` : '',
      input.stableMemoryPrefix,
    ].filter(Boolean).join('\n\n'), true),
  ];
  const dynamicBlocks = [
    block('history_window', '', false),
    block('companion_runtime', compileDynamicSegments(input.dynamicSegments, 'companion_runtime'), false),
    block('temporal_open_loops', compileDynamicSegments(input.dynamicSegments, 'temporal_open_loops'), false),
    block('summary_bridge', compileDynamicSegments(input.dynamicSegments, 'summary_bridge'), false),
    block('user_observation', compileUserObservation(input), false),
    block('dynamic_memory', input.dynamicMemoryContext, false),
    block('retrieval_context', retrievalContext, false),
    block('current_user_message', [
      ['用户问题：', input.userMessage].join('\n'),
      buildNextReplyNudge({
        hasMaterialContext: true,
        postHistoryInstruction: buildPostHistoryInstruction(resolvedRoleContext),
        replyPreference: input.replyPreference,
      }),
    ].join('\n\n'), false),
  ];
  const promptLayers = [...stableBlocks, ...dynamicBlocks];
  return buildPromptFromLayers({
    chatMode: input.chatMode,
    materialRules,
    memoryEpoch: input.memoryEpoch,
    promptLayers,
  });
}
