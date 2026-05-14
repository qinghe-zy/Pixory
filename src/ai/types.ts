import type { PixorySpace } from '../database';

export type AiProviderType = 'deepseek' | 'openai' | 'gemini' | 'claude' | 'openai_compatible' | 'custom';
export type AiProviderProtocol = 'openai_compatible' | 'gemini' | 'anthropic';
export type AiContextType = 'normal' | 'ip' | 'knowledge_base';
export type AiBoundaryMode = 'free' | 'prefer_material' | 'strict_material';
export type AiMessageRole = 'user' | 'assistant' | 'system';
export type AiMessageStatus = 'draft' | 'queued' | 'generating' | 'completed' | 'failed' | 'stopped';
export type AiDocumentOwnerType = 'knowledge_base' | 'ip' | 'thread';
export type AiDocumentSourceType = 'manual_text' | 'txt' | 'markdown' | 'pdf' | 'docx' | 'ip_generated';
export type AiDocumentStatus =
  | 'pending'
  | 'parsing'
  | 'parsed'
  | 'chunked'
  | 'searchable'
  | 'embedding_pending'
  | 'embedding_ready'
  | 'failed';
export type AiCitationSourceType = 'document_chunk' | 'ip_metadata' | 'image_note';
export type AiModelSource = 'built_in' | 'synced' | 'manual';

export interface AiModelCapabilities {
  supportsChat: boolean;
  supportsEmbedding: boolean;
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  contextWindowTokens?: number;
  labels: string[];
}

export interface AiProviderRecord {
  id: string;
  providerType: AiProviderType;
  displayName: string;
  baseUrl: string | null;
  protocol: AiProviderProtocol;
  chatEnabled: boolean;
  embeddingEnabled: boolean;
  visionEnabled: boolean;
  defaultChatModelId: string | null;
  defaultEmbeddingModelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiProviderModelRecord extends AiModelCapabilities {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  source: AiModelSource;
  createdAt: string;
  updatedAt: string;
}

export interface AiRoleCardRecord {
  id: string;
  space: PixorySpace;
  name: string;
  description: string | null;
  prompt: string;
  defaultLanguage: string | null;
  defaultModelId: string | null;
  boundaryMode: AiBoundaryMode;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AiThreadRecord {
  id: string;
  space: PixorySpace;
  contextType: AiContextType;
  boundIpId: number | null;
  boundKnowledgeBaseId: string | null;
  includeIpDocuments: boolean;
  title: string;
  titleStatus: 'fallback' | 'generated' | 'custom';
  providerId: string | null;
  modelId: string | null;
  boundaryMode: AiBoundaryMode;
  systemPrompt: string;
  materialRulesSnapshot: string | null;
  summary: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AiCitationRecord {
  id: string;
  messageId: string;
  sourceType: AiCitationSourceType;
  sourceId: string;
  label: string;
  locator: Record<string, unknown>;
  createdAt: string;
}
