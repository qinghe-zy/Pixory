import { BUILT_IN_PROVIDERS, capabilityLabels } from './aiConstants';
import type { AiProviderModelRecord, AiProviderProtocol, AiProviderType } from './types';

export function detectProviderType(baseUrl: string): AiProviderType {
  const normalized = baseUrl.toLowerCase();
  if (normalized.includes('api.deepseek.com')) {
    return 'deepseek';
  }
  if (normalized.includes('api.openai.com')) {
    return 'openai';
  }
  if (normalized.includes('generativelanguage.googleapis.com')) {
    return 'gemini';
  }
  if (normalized.includes('api.anthropic.com')) {
    return 'claude';
  }
  return 'custom';
}

export function protocolForProvider(providerType: AiProviderType): AiProviderProtocol {
  return BUILT_IN_PROVIDERS.find((provider) => provider.providerType === providerType)?.protocol ?? 'openai_compatible';
}

export function builtInModelsForProvider(providerId: string, providerType: AiProviderType): AiProviderModelRecord[] {
  const now = new Date().toISOString();
  const build = (
    modelId: string,
    displayName: string,
    partial: Partial<AiProviderModelRecord>
  ): AiProviderModelRecord => {
    const record: AiProviderModelRecord = {
      id: `${providerId}:${modelId}`,
      providerId,
      modelId,
      displayName,
      supportsChat: true,
      supportsEmbedding: false,
      supportsThinking: false,
      supportsVision: false,
      supportsTools: false,
      labels: [],
      source: 'built_in',
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
    return { ...record, labels: capabilityLabels(record) };
  };

  if (providerType === 'deepseek') {
    return [
      build('deepseek-v4-flash', 'DeepSeek V4 Flash', { contextWindowTokens: 1_000_000, supportsThinking: true }),
      build('deepseek-v4-pro', 'DeepSeek V4 Pro', { contextWindowTokens: 1_000_000, supportsThinking: true }),
    ];
  }

  if (providerType === 'openai') {
    return [
      build('gpt-5.5', 'GPT-5.5', {
        contextWindowTokens: 1_000_000,
        supportsThinking: true,
        supportsVision: true,
        supportsTools: true,
      }),
      build('gpt-5.4', 'GPT-5.4', {
        supportsThinking: true,
        supportsVision: true,
        supportsTools: true,
      }),
      build('text-embedding-3-large', 'text-embedding-3-large', {
        supportsChat: false,
        supportsEmbedding: true,
      }),
    ];
  }

  if (providerType === 'gemini') {
    return [
      build('gemini-2.5-flash', 'Gemini 2.5 Flash', { supportsThinking: true, supportsVision: true }),
      build('gemini-2.5-pro', 'Gemini 2.5 Pro', { supportsThinking: true, supportsVision: true }),
      build('text-embedding-004', 'Gemini Text Embedding', { supportsChat: false, supportsEmbedding: true }),
    ];
  }

  if (providerType === 'claude') {
    return [
      build('claude-sonnet-4.5', 'Claude Sonnet 4.5', { supportsThinking: true, supportsVision: true }),
      build('claude-haiku-4.5', 'Claude Haiku 4.5', { supportsThinking: true, supportsVision: true }),
    ];
  }

  return [];
}
