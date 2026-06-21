import type { AiBoundaryMode, AiModelCapabilities, AiProviderProtocol, AiProviderType } from './types';

export const DEFAULT_AI_ROLE_PROMPT =
  '你是一个清晰、可靠、尊重用户意图的 AI 助手。回答时优先直接解决问题，必要时给出简洁的步骤。';

export const MATERIAL_SESSION_RULES = [
  '只能把当前已绑定的 IP 或知识库作为 Pixory 提供的资料来源。',
  '不要声称读取了未绑定的 IP、知识库、文档或图片。',
  '不要编造引用来源。',
  '引用只能来自 Pixory 检索返回的真实来源。',
  '不要把整篇文档当作上下文，只使用当前检索到的有限片段。',
  '如果没有找到可引用资料，需要说明未找到可引用资料。',
].join('\n');

export const STRICT_MATERIAL_RULES = [
  MATERIAL_SESSION_RULES,
  '严格资料模式下，如果资料没有答案，需要说明资料不足。',
  '严格资料模式下，不要做无来源的外延推断。',
].join('\n');

export const DEFAULT_BOUNDARY_MODE: AiBoundaryMode = 'free';

export interface BuiltInProvider {
  providerType: AiProviderType;
  displayName: string;
  protocol: AiProviderProtocol;
  baseUrl: string;
  chatEnabled: boolean;
  embeddingEnabled: boolean;
  visionEnabled: boolean;
}

export const BUILT_IN_PROVIDERS: BuiltInProvider[] = [
  {
    providerType: 'deepseek',
    displayName: 'DeepSeek',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.deepseek.com',
    chatEnabled: true,
    embeddingEnabled: false,
    visionEnabled: false,
  },
  {
    providerType: 'openai',
    displayName: 'OpenAI / GPT',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.openai.com/v1',
    chatEnabled: true,
    embeddingEnabled: true,
    visionEnabled: true,
  },
  {
    providerType: 'gemini',
    displayName: 'Gemini',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    chatEnabled: true,
    embeddingEnabled: true,
    visionEnabled: true,
  },
  {
    providerType: 'claude',
    displayName: 'Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    chatEnabled: true,
    embeddingEnabled: false,
    visionEnabled: true,
  },
  {
    providerType: 'openai_compatible',
    displayName: '其他模型',
    protocol: 'openai_compatible',
    baseUrl: '',
    chatEnabled: true,
    embeddingEnabled: true,
    visionEnabled: false,
  },
];

export function secureStoreKeyForProvider(providerId: string): string {
  return `pixory.ai.provider.${providerId}.apiKey`;
}

export function secureStoreKeyForProviderInSpace(space: 'normal' | 'personal', providerId: string): string {
  return `pixory.ai.provider.${space}.${providerId}.apiKey`;
}

export function capabilityLabels(capabilities: AiModelCapabilities): string[] {
  const labels: string[] = [];
  if (capabilities.contextWindowTokens && capabilities.contextWindowTokens >= 1_000_000) {
    labels.push('1M 上下文');
  }
  if (capabilities.supportsThinking) {
    labels.push('思考');
  }
  if (capabilities.supportsEmbedding) {
    labels.push('Embedding');
  }
  if (capabilities.supportsVision) {
    labels.push('Vision 预留');
  }
  if (capabilities.supportsTools) {
    labels.push('工具调用');
  }
  return labels;
}
