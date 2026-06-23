import type { PixorySpace } from '../database';

export type AiProviderType = 'deepseek' | 'openai' | 'gemini' | 'claude' | 'openai_compatible' | 'custom';
export type AiProviderProtocol = 'openai_compatible' | 'gemini' | 'anthropic';
export type AiContextType = 'normal' | 'ip' | 'knowledge_base';
export type AiBoundaryMode = 'free' | 'prefer_material' | 'strict_material';
export type AiRoleInstructionWeight = 'default' | 'high';
export type AiReplyPreference = 'auto' | 'concise' | 'detailed';
export type AiRoleCardSourceType =
  | 'sillytavern_png_v2'
  | 'sillytavern_png_v3'
  | 'sillytavern_json_v2'
  | 'sillytavern_json_v3'
  | 'tavern_json_v1'
  | 'pixory_manual';
export type AiMemorySourceKind = 'auto' | 'manual';
export type AiMessageRole = 'user' | 'assistant' | 'system';
export type AiMessageStatus = 'draft' | 'queued' | 'generating' | 'completed' | 'failed' | 'stopped';
export type AiMessageSourceKind = 'default' | 'continuity_import';
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
export type AiProviderVerifyStatus = 'ready' | 'changed' | 'failed' | 'untested';

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
  embeddingBaseUrl: string | null;
  protocol: AiProviderProtocol;
  chatEnabled: boolean;
  embeddingEnabled: boolean;
  visionEnabled: boolean;
  defaultChatModelId: string | null;
  defaultEmbeddingModelId: string | null;
  keyUpdatedAt: string | null;
  lastVerifiedAt: string | null;
  lastVerifyStatus: AiProviderVerifyStatus | null;
  lastVerifyMessage: string | null;
  verifyFingerprint: string | null;
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
  firstMessage: string | null;
  alternateGreetings: string[];
  sourceType: AiRoleCardSourceType | null;
  sourceJson: string | null;
  defaultLanguage: string | null;
  defaultModelId: string | null;
  boundaryMode: AiBoundaryMode;
  avatarEnabled: boolean;
  avatarUri: string | null;
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
  modelTitleGeneratedAt: string | null;
  providerId: string | null;
  modelId: string | null;
  sessionBaseUrl: string | null;
  sessionApiKeyRef: string | null;
  modelSnapshotJson: string;
  roleCardId: string | null;
  roleSnapshotJson: string;
  roleInstructionWeight: AiRoleInstructionWeight;
  replyPreference: AiReplyPreference;
  thinkingDisabled: boolean;
  boundaryMode: AiBoundaryMode;
  systemPrompt: string;
  materialRulesSnapshot: string | null;
  summary: string | null;
  lastMessagePreview: string | null;
  currentBranchRootMessageId: string | null;
  currentBranchVersionIndex: number | null;
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
