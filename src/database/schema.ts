export const DATABASE_NAME = 'pixory.sqlite';
export const PERSONAL_DATABASE_NAME = 'pixory_personal.sqlite';
export const DATABASE_VERSION = 61;

export const MIGRATION_STATEMENTS_V1 = `
CREATE TABLE IF NOT EXISTS ips (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY NOT NULL,
  ipId INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (ipId) REFERENCES ips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS image_assets (
  id INTEGER PRIMARY KEY NOT NULL,
  ipId INTEGER NOT NULL,
  groupId INTEGER,
  originalFileUri TEXT NOT NULL,
  thumbnailFileUri TEXT,
  originalFilename TEXT NOT NULL,
  internalFilename TEXT NOT NULL UNIQUE,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  mimeType TEXT NOT NULL,
  fileSize INTEGER NOT NULL,
  isFavorite INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  deletedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  lastViewedAt TEXT,
  FOREIGN KEY (ipId) REFERENCES ips(id) ON DELETE RESTRICT,
  FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS image_tags (
  imageAssetId INTEGER NOT NULL,
  tagId INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (imageAssetId, tagId),
  FOREIGN KEY (imageAssetId) REFERENCES image_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_groups_ip_id ON groups(ipId);
CREATE INDEX IF NOT EXISTS idx_image_assets_ip_id ON image_assets(ipId);
CREATE INDEX IF NOT EXISTS idx_image_assets_group_id ON image_assets(groupId);
CREATE INDEX IF NOT EXISTS idx_image_assets_deleted_at ON image_assets(deletedAt);
CREATE INDEX IF NOT EXISTS idx_image_assets_is_favorite ON image_assets(isFavorite);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_image_tags_tag_id ON image_tags(tagId);
`;

export const MIGRATION_STATEMENTS_V2 = `
ALTER TABLE ips ADD COLUMN isFavorite INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_ips_is_favorite ON ips(isFavorite);
`;

export const MIGRATION_STATEMENTS_V3 = `
ALTER TABLE groups ADD COLUMN description TEXT;
`;

export const MIGRATION_STATEMENTS_V4 = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,
  updatedAt TEXT NOT NULL
);
`;

export const MIGRATION_STATEMENTS_V5 = `
CREATE TABLE IF NOT EXISTS image_groups (
  imageAssetId INTEGER NOT NULL,
  groupId INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (imageAssetId, groupId),
  FOREIGN KEY (imageAssetId) REFERENCES image_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO image_groups (imageAssetId, groupId, createdAt)
SELECT id, groupId, createdAt
FROM image_assets
WHERE groupId IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_image_groups_group_id ON image_groups(groupId);
`;

export const MIGRATION_STATEMENTS_V6 = `
ALTER TABLE groups ADD COLUMN isPinned INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_groups_is_pinned ON groups(isPinned);
`;

export const MIGRATION_STATEMENTS_V7 = `
CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY NOT NULL,
  ipId INTEGER NOT NULL,
  name TEXT NOT NULL,
  templateKey TEXT,
  totalCount INTEGER NOT NULL DEFAULT 0,
  successCount INTEGER NOT NULL DEFAULT 0,
  failedCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  FOREIGN KEY (ipId) REFERENCES ips(id) ON DELETE CASCADE
);

ALTER TABLE image_assets ADD COLUMN importBatchId INTEGER;

CREATE INDEX IF NOT EXISTS idx_import_batches_ip_id ON import_batches(ipId);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON import_batches(createdAt);
CREATE INDEX IF NOT EXISTS idx_image_assets_import_batch_id ON image_assets(importBatchId);
`;

export const MIGRATION_STATEMENTS_V8 = `
ALTER TABLE ips ADD COLUMN deletedAt TEXT;
CREATE INDEX IF NOT EXISTS idx_ips_deleted_at ON ips(deletedAt);
`;

export const seedDefaultImportTemplates = `
INSERT OR IGNORE INTO import_templates (
  key,
  name,
  groupName,
  tagsJson,
  note,
  isFavorite,
  sortOrder,
  createdAt,
  updatedAt
) VALUES
  ('character-standee', '角色立绘', '角色立绘', '["角色","立绘"]', '角色展示素材', 1, 10, datetime('now'), datetime('now')),
  ('festival-event', '节日活动', '节日活动', '["节日","活动"]', '节日活动素材', 0, 20, datetime('now'), datetime('now')),
  ('operation-poster', '运营海报', '运营海报', '["运营","海报"]', '运营投放素材', 0, 30, datetime('now'), datetime('now')),
  ('scene-art', '场景图', '场景图', '["场景","背景"]', '场景与背景素材', 0, 40, datetime('now'), datetime('now')),
  ('stickers', '表情包', '表情包', '["表情包","社媒"]', '表情与轻量传播素材', 0, 50, datetime('now'), datetime('now'));
`;

export const MIGRATION_STATEMENTS_V9 = `
CREATE TABLE IF NOT EXISTS import_templates (
  key TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  groupName TEXT NOT NULL,
  tagsJson TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  isFavorite INTEGER NOT NULL DEFAULT 0,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_import_templates_sort_order ON import_templates(sortOrder, updatedAt);

${seedDefaultImportTemplates}
`;

export const MIGRATION_STATEMENTS_V10 = `
CREATE TABLE IF NOT EXISTS import_batch_items (
  id INTEGER PRIMARY KEY NOT NULL,
  importBatchId INTEGER NOT NULL,
  sourcePath TEXT NOT NULL,
  originalFilename TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  imageAssetId INTEGER,
  reason TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (importBatchId) REFERENCES import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (imageAssetId) REFERENCES image_assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_import_batch_items_batch_id ON import_batch_items(importBatchId);
CREATE INDEX IF NOT EXISTS idx_import_batch_items_status ON import_batch_items(importBatchId, status);
`;

export const MIGRATION_STATEMENTS_V11 = `
ALTER TABLE ips ADD COLUMN coverImageAssetId INTEGER;
ALTER TABLE ips ADD COLUMN coverBlurEnabled INTEGER;
CREATE INDEX IF NOT EXISTS idx_ips_cover_image_asset_id ON ips(coverImageAssetId);
`;

export const MIGRATION_STATEMENTS_V12 = `
ALTER TABLE image_assets ADD COLUMN mediaType TEXT NOT NULL DEFAULT 'image';
ALTER TABLE image_assets ADD COLUMN coverThumbnailFileUri TEXT;
ALTER TABLE image_assets ADD COLUMN durationMs INTEGER;
ALTER TABLE image_assets ADD COLUMN lastPlaybackPositionMs INTEGER;
ALTER TABLE image_assets ADD COLUMN previewStatus TEXT NOT NULL DEFAULT 'ready';

CREATE TABLE IF NOT EXISTS background_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'preparing', 'copying', 'verifying', 'generatingPreview', 'writingDatabase', 'completed', 'failed', 'cancelled')),
  title TEXT NOT NULL,
  totalCount INTEGER NOT NULL DEFAULT 0,
  successCount INTEGER NOT NULL DEFAULT 0,
  failedCount INTEGER NOT NULL DEFAULT 0,
  totalBytes INTEGER,
  completedBytes INTEGER NOT NULL DEFAULT 0,
  currentLabel TEXT,
  errorMessage TEXT,
  resultJson TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_image_assets_media_type_deleted_at ON image_assets(mediaType, deletedAt);
CREATE INDEX IF NOT EXISTS idx_image_assets_ip_media_type_deleted_at ON image_assets(ipId, mediaType, deletedAt);
CREATE INDEX IF NOT EXISTS idx_image_assets_last_viewed_at ON image_assets(lastViewedAt);
CREATE INDEX IF NOT EXISTS idx_image_assets_duration_ms ON image_assets(durationMs);
CREATE INDEX IF NOT EXISTS idx_background_tasks_space_updated_at ON background_tasks(space, updatedAt);
CREATE INDEX IF NOT EXISTS idx_background_tasks_status_updated_at ON background_tasks(status, updatedAt);
`;

export const MIGRATION_STATEMENTS_V13 = `
CREATE TABLE IF NOT EXISTS trash_cleanup_failures (
  id INTEGER PRIMARY KEY NOT NULL,
  assetId INTEGER,
  fileUri TEXT,
  fileRole TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trash_cleanup_failures_asset_id ON trash_cleanup_failures(assetId);
CREATE INDEX IF NOT EXISTS idx_trash_cleanup_failures_created_at ON trash_cleanup_failures(createdAt);
`;

export const MIGRATION_STATEMENTS_V14 = `
ALTER TABLE groups ADD COLUMN coverImageAssetId INTEGER;
ALTER TABLE ips ADD COLUMN coverBlurRadius INTEGER;
CREATE INDEX IF NOT EXISTS idx_groups_cover_image_asset_id ON groups(coverImageAssetId);
`;

export const MIGRATION_STATEMENTS_V15 = `
ALTER TABLE image_assets ADD COLUMN contentHash TEXT;
ALTER TABLE image_assets ADD COLUMN visualHash TEXT;
CREATE INDEX IF NOT EXISTS idx_image_assets_content_hash ON image_assets(contentHash);
CREATE INDEX IF NOT EXISTS idx_image_assets_visual_hash ON image_assets(visualHash);
`;

export const MIGRATION_STATEMENTS_V16 = `
CREATE TABLE IF NOT EXISTS background_tasks_v16 (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image-import', 'video-import', 'package-import', 'archive-temp-read', 'duplicate-scan', 'backup', 'restore', 'ip-space-migration', 'trash-clear')),
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'preparing', 'copying', 'verifying', 'generatingPreview', 'writingDatabase', 'completed', 'failed', 'cancelled')),
  title TEXT NOT NULL,
  totalCount INTEGER NOT NULL DEFAULT 0,
  successCount INTEGER NOT NULL DEFAULT 0,
  failedCount INTEGER NOT NULL DEFAULT 0,
  totalBytes INTEGER,
  completedBytes INTEGER NOT NULL DEFAULT 0,
  currentLabel TEXT,
  errorMessage TEXT,
  resultJson TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT
);

INSERT OR IGNORE INTO background_tasks_v16 (
  id,
  type,
  space,
  status,
  title,
  totalCount,
  successCount,
  failedCount,
  totalBytes,
  completedBytes,
  currentLabel,
  errorMessage,
  resultJson,
  createdAt,
  updatedAt,
  completedAt
)
SELECT
  id,
  type,
  space,
  status,
  title,
  totalCount,
  successCount,
  failedCount,
  totalBytes,
  completedBytes,
  currentLabel,
  errorMessage,
  resultJson,
  createdAt,
  updatedAt,
  completedAt
FROM background_tasks;

DROP TABLE background_tasks;
ALTER TABLE background_tasks_v16 RENAME TO background_tasks;

CREATE INDEX IF NOT EXISTS idx_background_tasks_space_updated_at ON background_tasks(space, updatedAt);
CREATE INDEX IF NOT EXISTS idx_background_tasks_status_updated_at ON background_tasks(status, updatedAt);
`;

export const MIGRATION_STATEMENTS_V17 = `
CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY NOT NULL,
  providerType TEXT NOT NULL CHECK (providerType IN ('deepseek', 'openai', 'gemini', 'claude', 'openai_compatible', 'custom')),
  displayName TEXT NOT NULL,
  baseUrl TEXT,
  protocol TEXT NOT NULL CHECK (protocol IN ('openai_compatible', 'gemini', 'anthropic')),
  chatEnabled INTEGER NOT NULL DEFAULT 1,
  embeddingEnabled INTEGER NOT NULL DEFAULT 0,
  visionEnabled INTEGER NOT NULL DEFAULT 0,
  defaultChatModelId TEXT,
  defaultEmbeddingModelId TEXT,
  keyUpdatedAt TEXT,
  lastVerifiedAt TEXT,
  lastVerifyStatus TEXT CHECK (lastVerifyStatus IN ('ready', 'changed', 'failed', 'untested')),
  lastVerifyMessage TEXT,
  verifyFingerprint TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_provider_models (
  id TEXT PRIMARY KEY NOT NULL,
  providerId TEXT NOT NULL,
  modelId TEXT NOT NULL,
  displayName TEXT NOT NULL,
  supportsChat INTEGER NOT NULL DEFAULT 1,
  supportsEmbedding INTEGER NOT NULL DEFAULT 0,
  supportsThinking INTEGER NOT NULL DEFAULT 0,
  supportsVision INTEGER NOT NULL DEFAULT 0,
  supportsTools INTEGER NOT NULL DEFAULT 0,
  contextWindowTokens INTEGER,
  capabilityJson TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('built_in', 'synced', 'manual')),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE (providerId, modelId),
  FOREIGN KEY (providerId) REFERENCES ai_providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_role_cards (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  firstMessage TEXT,
  alternateGreetingsJson TEXT NOT NULL DEFAULT '[]',
  sourceType TEXT,
  sourceJson TEXT,
  defaultLanguage TEXT,
  defaultModelId TEXT,
  boundaryMode TEXT NOT NULL DEFAULT 'free' CHECK (boundaryMode IN ('free', 'prefer_material', 'strict_material')),
  tagsJson TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  archivedAt TEXT
);

CREATE TABLE IF NOT EXISTS ai_knowledge_bases (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  archivedAt TEXT
);

CREATE TABLE IF NOT EXISTS ai_threads (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  contextType TEXT NOT NULL CHECK (contextType IN ('normal', 'ip', 'knowledge_base')),
  boundIpId INTEGER,
  boundKnowledgeBaseId TEXT,
  includeIpDocuments INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  titleStatus TEXT NOT NULL DEFAULT 'fallback' CHECK (titleStatus IN ('fallback', 'generated', 'custom')),
  providerId TEXT,
  modelId TEXT,
  sessionBaseUrl TEXT,
  sessionApiKeyRef TEXT,
  modelTitleGeneratedAt TEXT,
  modelSnapshotJson TEXT NOT NULL DEFAULT '{}',
  roleCardId TEXT,
  roleSnapshotJson TEXT NOT NULL DEFAULT '{}',
  thinkingDisabled INTEGER NOT NULL DEFAULT 0,
  systemPrompt TEXT NOT NULL DEFAULT '',
  materialRulesSnapshot TEXT,
  boundaryMode TEXT NOT NULL DEFAULT 'free' CHECK (boundaryMode IN ('free', 'prefer_material', 'strict_material')),
  summary TEXT,
  lastMessagePreview TEXT,
  currentBranchRootMessageId TEXT,
  currentBranchVersionIndex INTEGER,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  archivedAt TEXT,
  FOREIGN KEY (boundKnowledgeBaseId) REFERENCES ai_knowledge_bases(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY NOT NULL,
  threadId TEXT NOT NULL,
  branchRootMessageId TEXT,
  branchVersionIndex INTEGER,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'generating', 'completed', 'failed', 'stopped')),
  content TEXT NOT NULL DEFAULT '',
  reasoningText TEXT,
  errorMessage TEXT,
  providerId TEXT,
  modelId TEXT,
  modelSnapshotJson TEXT NOT NULL DEFAULT '{}',
  promptSnapshotJson TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (branchRootMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_documents (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  ownerType TEXT NOT NULL CHECK (ownerType IN ('knowledge_base', 'ip', 'thread')),
  ownerId TEXT NOT NULL,
  sourceType TEXT NOT NULL CHECK (sourceType IN ('manual_text', 'txt', 'markdown', 'pdf', 'docx', 'ip_generated')),
  title TEXT NOT NULL,
  originalFilename TEXT,
  localUri TEXT,
  mimeType TEXT,
  fileSize INTEGER,
  parserStatus TEXT NOT NULL CHECK (parserStatus IN ('pending', 'parsing', 'parsed', 'chunked', 'searchable', 'embedding_pending', 'embedding_ready', 'failed')),
  parserError TEXT,
  metadataJson TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_chunks (
  id TEXT PRIMARY KEY NOT NULL,
  documentId TEXT NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  ownerType TEXT NOT NULL,
  ownerId TEXT NOT NULL,
  chunkIndex INTEGER NOT NULL,
  text TEXT NOT NULL,
  normalizedText TEXT NOT NULL,
  sourceLabel TEXT NOT NULL,
  locatorJson TEXT NOT NULL DEFAULT '{}',
  tokenEstimate INTEGER,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (documentId) REFERENCES ai_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_embeddings (
  id TEXT PRIMARY KEY NOT NULL,
  chunkId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  modelId TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vectorJson TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (chunkId) REFERENCES ai_chunks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_message_citations (
  id TEXT PRIMARY KEY NOT NULL,
  messageId TEXT NOT NULL,
  sourceType TEXT NOT NULL CHECK (sourceType IN ('document_chunk', 'ip_metadata', 'image_note')),
  sourceId TEXT NOT NULL,
  label TEXT NOT NULL,
  locatorJson TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL,
  FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_message_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  messageId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'document')),
  name TEXT NOT NULL,
  localUri TEXT NOT NULL,
  documentId TEXT,
  mimeType TEXT,
  fileSize INTEGER,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (documentId) REFERENCES ai_documents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_message_versions (
  id TEXT PRIMARY KEY NOT NULL,
  originalMessageId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  versionIndex INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'generating', 'completed', 'failed', 'stopped')),
  content TEXT NOT NULL DEFAULT '',
  reasoningText TEXT,
  errorMessage TEXT,
  providerId TEXT,
  modelId TEXT,
  modelSnapshotJson TEXT NOT NULL DEFAULT '{}',
  promptSnapshotJson TEXT NOT NULL DEFAULT '{}',
  citationsJson TEXT NOT NULL DEFAULT '[]',
  messageCreatedAt TEXT NOT NULL,
  messageUpdatedAt TEXT NOT NULL,
  messageCompletedAt TEXT,
  createdAt TEXT NOT NULL,
  UNIQUE(originalMessageId, versionIndex),
  FOREIGN KEY (originalMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_threads_space_updated_at ON ai_threads(space, updatedAt);
CREATE INDEX IF NOT EXISTS idx_ai_threads_context ON ai_threads(space, contextType, updatedAt);
CREATE INDEX IF NOT EXISTS idx_ai_threads_role_card_activity
  ON ai_threads(space, archivedAt, roleCardId, updatedAt);
CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created_at ON ai_messages(threadId, createdAt);
CREATE INDEX IF NOT EXISTS idx_ai_messages_branch ON ai_messages(threadId, branchRootMessageId, branchVersionIndex, createdAt);
CREATE INDEX IF NOT EXISTS idx_ai_message_versions_message ON ai_message_versions(originalMessageId, versionIndex);
CREATE INDEX IF NOT EXISTS idx_ai_message_attachments_message ON ai_message_attachments(messageId, createdAt);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_space_updated_at ON ai_knowledge_bases(space, updatedAt);
CREATE INDEX IF NOT EXISTS idx_ai_documents_owner_status ON ai_documents(space, ownerType, ownerId, parserStatus);
CREATE INDEX IF NOT EXISTS idx_ai_documents_owner_updated_id ON ai_documents(space, ownerType, ownerId, updatedAt DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_owner ON ai_chunks(space, ownerType, ownerId);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_document_index ON ai_chunks(documentId, chunkIndex);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_chunk ON ai_embeddings(chunkId);
CREATE INDEX IF NOT EXISTS idx_ai_citations_message ON ai_message_citations(messageId);
`;

export const MIGRATION_STATEMENTS_V18 = `
ALTER TABLE ai_role_cards ADD COLUMN avatarEnabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_role_cards ADD COLUMN avatarUri TEXT;
`;

export const MIGRATION_STATEMENTS_V19 = `
ALTER TABLE ai_providers ADD COLUMN embeddingBaseUrl TEXT;
`;

export const MIGRATION_STATEMENTS_V20 = `
CREATE TABLE IF NOT EXISTS ai_message_versions (
  id TEXT PRIMARY KEY NOT NULL,
  originalMessageId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  versionIndex INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'generating', 'completed', 'failed', 'stopped')),
  content TEXT NOT NULL DEFAULT '',
  reasoningText TEXT,
  errorMessage TEXT,
  providerId TEXT,
  modelId TEXT,
  modelSnapshotJson TEXT NOT NULL DEFAULT '{}',
  promptSnapshotJson TEXT NOT NULL DEFAULT '{}',
  citationsJson TEXT NOT NULL DEFAULT '[]',
  messageCreatedAt TEXT NOT NULL,
  messageUpdatedAt TEXT NOT NULL,
  messageCompletedAt TEXT,
  createdAt TEXT NOT NULL,
  UNIQUE(originalMessageId, versionIndex),
  FOREIGN KEY (originalMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_message_versions_message ON ai_message_versions(originalMessageId, versionIndex);
`;

export const MIGRATION_STATEMENTS_V21 = `
ALTER TABLE ai_threads ADD COLUMN roleInstructionWeight TEXT NOT NULL DEFAULT 'default' CHECK (roleInstructionWeight IN ('default', 'high'));
`;

export const MIGRATION_STATEMENTS_V22 = `
CREATE TABLE IF NOT EXISTS ai_thread_memory_settings (
  threadId TEXT PRIMARY KEY NOT NULL,
  deepMemoryEnabled INTEGER NOT NULL DEFAULT 1,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_thread_summaries (
  threadId TEXT PRIMARY KEY NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  decisions TEXT NOT NULL DEFAULT '',
  openQuestions TEXT NOT NULL DEFAULT '',
  lastMessageId TEXT,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (lastMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_memories (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'thread', 'role', 'ip', 'knowledge_base')),
  scopeId TEXT,
  type TEXT NOT NULL CHECK (type IN ('preference', 'fact', 'decision', 'instruction', 'task', 'correction')),
  content TEXT NOT NULL,
  normalizedContent TEXT NOT NULL,
  sourceMessageId TEXT,
  confidence REAL NOT NULL DEFAULT 0.7,
  importance INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale', 'deleted')),
  lastUsedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT,
  FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_settings_thread ON ai_thread_memory_settings(threadId);
CREATE INDEX IF NOT EXISTS idx_ai_memories_scope_status ON ai_memories(space, scope, scopeId, status, importance);
CREATE INDEX IF NOT EXISTS idx_ai_memories_source ON ai_memories(sourceMessageId);
`;

export const MIGRATION_STATEMENTS_V23 = `
ALTER TABLE ai_threads ADD COLUMN replyPreference TEXT NOT NULL DEFAULT 'auto' CHECK (replyPreference IN ('auto', 'concise', 'detailed'));
`;

export const MIGRATION_STATEMENTS_V24 = `
ALTER TABLE ai_memories ADD COLUMN ipId INTEGER;
ALTER TABLE ai_memories ADD COLUMN groupId INTEGER;
ALTER TABLE ai_memories ADD COLUMN imageAssetId INTEGER;
ALTER TABLE ai_memories ADD COLUMN assetSnapshotJson TEXT NOT NULL DEFAULT '{}';
ALTER TABLE ai_memories ADD COLUMN sourceKind TEXT NOT NULL DEFAULT 'auto' CHECK (sourceKind IN ('auto', 'manual'));

CREATE TABLE IF NOT EXISTS ai_thread_memory_jobs (
  threadId TEXT PRIMARY KEY NOT NULL,
  pendingTurnCount INTEGER NOT NULL DEFAULT 0,
  lastConsolidatedMessageId TEXT,
  lastCaptureNoticeJson TEXT NOT NULL DEFAULT '[]',
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (lastConsolidatedMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_memories_asset_refs ON ai_memories(space, ipId, groupId, imageAssetId, status);
CREATE INDEX IF NOT EXISTS idx_ai_memory_jobs_updated_at ON ai_thread_memory_jobs(updatedAt);
`;

export const MIGRATION_STATEMENTS_V25 = `
CREATE TABLE IF NOT EXISTS ai_user_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  profileJson TEXT NOT NULL,
  profileText TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sourceThreadId TEXT,
  sourceStartMessageId TEXT,
  sourceEndMessageId TEXT,
  messageCountAtUpdate INTEGER NOT NULL DEFAULT 0,
  lastUpdatedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (sourceThreadId) REFERENCES ai_threads(id) ON DELETE SET NULL,
  FOREIGN KEY (sourceStartMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (sourceEndMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_user_profiles_space ON ai_user_profiles(space);

CREATE TABLE IF NOT EXISTS ai_thread_summary_segments (
  id TEXT PRIMARY KEY NOT NULL,
  threadId TEXT NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  kind TEXT NOT NULL CHECK (kind IN ('compressed', 'merged')),
  summaryText TEXT NOT NULL,
  startMessageId TEXT,
  endMessageId TEXT,
  startAt TEXT,
  endAt TEXT,
  roundCount INTEGER NOT NULL DEFAULT 0,
  sourceSegmentIdsJson TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (startMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (endMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_summary_segments_thread ON ai_thread_summary_segments(threadId, createdAt);

ALTER TABLE ai_thread_memory_jobs ADD COLUMN lastCompressedMessageId TEXT;
ALTER TABLE ai_thread_memory_jobs ADD COLUMN uncompressedRoundCount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_thread_memory_jobs ADD COLUMN completedMessageCountAtProfileUpdate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_thread_memory_jobs ADD COLUMN lastProfileUpdatedAt TEXT;
ALTER TABLE ai_thread_memory_jobs ADD COLUMN profileUpdateCooldownUntil TEXT;
ALTER TABLE ai_thread_memory_jobs ADD COLUMN lastMaintenanceError TEXT;
ALTER TABLE ai_thread_memory_jobs ADD COLUMN lastMaintenanceModelProviderId TEXT;
ALTER TABLE ai_thread_memory_jobs ADD COLUMN lastMaintenanceModelId TEXT;
`;

export const MIGRATION_STATEMENTS_V26 = `
CREATE VIRTUAL TABLE IF NOT EXISTS ai_message_fts USING fts5(
  id UNINDEXED,
  threadId UNINDEXED,
  role UNINDEXED,
  content,
  updatedAt UNINDEXED
);

CREATE VIRTUAL TABLE IF NOT EXISTS ai_memory_fts USING fts5(
  id UNINDEXED,
  space UNINDEXED,
  scope UNINDEXED,
  scopeId UNINDEXED,
  content,
  normalizedContent,
  assetSnapshotJson,
  updatedAt UNINDEXED
);

DELETE FROM ai_message_fts;
INSERT INTO ai_message_fts (id, threadId, role, content, updatedAt)
SELECT id, threadId, role, content, updatedAt
FROM ai_messages
WHERE status = 'completed' AND role <> 'system' AND content <> '';

DELETE FROM ai_memory_fts;
INSERT INTO ai_memory_fts (id, space, scope, scopeId, content, normalizedContent, assetSnapshotJson, updatedAt)
SELECT id, space, scope, scopeId, content, normalizedContent, assetSnapshotJson, updatedAt
FROM ai_memories
WHERE status = 'active';

ALTER TABLE ai_thread_memory_jobs ADD COLUMN lastMaintenanceCompletedAt TEXT;
ALTER TABLE ai_thread_memory_jobs ADD COLUMN lastMaintenanceUsedFallback INTEGER NOT NULL DEFAULT 0;
`;

export const MIGRATION_STATEMENTS_V27 = `
CREATE INDEX IF NOT EXISTS idx_ai_memories_normalized_content
  ON ai_memories(space, scope, scopeId, normalizedContent, status);
`;

export const MIGRATION_STATEMENTS_V28 = `
UPDATE ai_memories
SET status = 'stale',
    updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'active'
  AND id IN (
    SELECT id FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY space, scope, COALESCE(scopeId, ''), normalizedContent
          ORDER BY importance DESC, confidence DESC, createdAt ASC, id ASC
        ) AS duplicateRank
      FROM ai_memories
      WHERE status = 'active'
    )
    WHERE duplicateRank > 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_memories_active_normalized_content
  ON ai_memories(space, scope, COALESCE(scopeId, ''), normalizedContent)
  WHERE status = 'active';
`;

export const MIGRATION_STATEMENTS_V29 = `
ALTER TABLE ai_memories ADD COLUMN supersededByMemoryId TEXT;
ALTER TABLE ai_memories ADD COLUMN mergeReason TEXT;
ALTER TABLE ai_memories ADD COLUMN mergedAt TEXT;
ALTER TABLE ai_memories ADD COLUMN lastReconciledAt TEXT;
ALTER TABLE ai_memories ADD COLUMN reconcileSourceMessageId TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_memories_reconcile_source
  ON ai_memories(reconcileSourceMessageId);
CREATE INDEX IF NOT EXISTS idx_ai_memories_superseded_by
  ON ai_memories(supersededByMemoryId);

DELETE FROM ai_memory_fts;
INSERT INTO ai_memory_fts (id, space, scope, scopeId, content, normalizedContent, assetSnapshotJson, updatedAt)
SELECT id, space, scope, scopeId, content, normalizedContent, assetSnapshotJson, updatedAt
FROM ai_memories
WHERE status = 'active' AND supersededByMemoryId IS NULL;
`;

export const MIGRATION_STATEMENTS_V30 = `
ALTER TABLE ai_role_cards ADD COLUMN firstMessage TEXT;
ALTER TABLE ai_role_cards ADD COLUMN alternateGreetingsJson TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ai_role_cards ADD COLUMN sourceType TEXT;
ALTER TABLE ai_role_cards ADD COLUMN sourceJson TEXT;
`;

export const MIGRATION_STATEMENTS_V31 = `
ALTER TABLE ai_messages ADD COLUMN branchRootMessageId TEXT;
ALTER TABLE ai_messages ADD COLUMN branchVersionIndex INTEGER;

CREATE INDEX IF NOT EXISTS idx_ai_messages_branch
  ON ai_messages(threadId, branchRootMessageId, branchVersionIndex, createdAt);
`;

export const MIGRATION_STATEMENTS_V32 = `
CREATE VIRTUAL TABLE IF NOT EXISTS ai_message_version_fts USING fts5(
  id UNINDEXED,
  originalMessageId UNINDEXED,
  threadId UNINDEXED,
  role UNINDEXED,
  content,
  updatedAt UNINDEXED
);

DELETE FROM ai_message_version_fts;
INSERT INTO ai_message_version_fts (id, originalMessageId, threadId, role, content, updatedAt)
SELECT id, originalMessageId, threadId, role, content, messageUpdatedAt
FROM ai_message_versions
WHERE status = 'completed' AND role <> 'system' AND content <> '';
`;

export const MIGRATION_STATEMENTS_V33 = `
ALTER TABLE ai_user_profiles ADD COLUMN boundIpId INTEGER;
DROP INDEX IF EXISTS idx_ai_user_profiles_space;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_user_profiles_space_ip ON ai_user_profiles(space, IFNULL(boundIpId, 0));
`;

export const MIGRATION_STATEMENTS_V34 = `
ALTER TABLE ai_user_profiles ADD COLUMN boundThreadId TEXT REFERENCES ai_threads(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS idx_ai_user_profiles_space_ip;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_user_profiles_scope
ON ai_user_profiles(space, IFNULL(boundIpId, -1), IFNULL(boundThreadId, ''));

CREATE TRIGGER IF NOT EXISTS trg_ai_user_profiles_no_mixed_scope_insert
BEFORE INSERT ON ai_user_profiles
WHEN NEW.boundIpId IS NOT NULL AND NEW.boundThreadId IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'AI user profile cannot bind both an IP and a thread.');
END;

CREATE TRIGGER IF NOT EXISTS trg_ai_user_profiles_no_mixed_scope_update
BEFORE UPDATE ON ai_user_profiles
WHEN NEW.boundIpId IS NOT NULL AND NEW.boundThreadId IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'AI user profile cannot bind both an IP and a thread.');
END;
`;

export const MIGRATION_STATEMENTS_V35 = `
CREATE TABLE IF NOT EXISTS ai_branch_route_metadata (
  id TEXT PRIMARY KEY NOT NULL,
  threadId TEXT NOT NULL,
  branchRootMessageId TEXT NOT NULL,
  branchVersionIndex INTEGER NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'exploring'
    CHECK (status IN ('exploring', 'adopted', 'paused', 'abandoned')),
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (branchRootMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  UNIQUE(threadId, branchRootMessageId, branchVersionIndex)
);

CREATE INDEX IF NOT EXISTS idx_ai_branch_route_metadata_thread
  ON ai_branch_route_metadata(threadId, updatedAt);
`;

export const MIGRATION_STATEMENTS_V36 = `
ALTER TABLE ai_threads ADD COLUMN currentBranchRootMessageId TEXT;
ALTER TABLE ai_threads ADD COLUMN currentBranchVersionIndex INTEGER;
`;

export const MIGRATION_STATEMENTS_V37 = `
CREATE TABLE IF NOT EXISTS ai_message_favorites (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  threadId TEXT NOT NULL,
  messageId TEXT NOT NULL,
  favoriteKey TEXT NOT NULL,
  branchRootMessageId TEXT,
  branchVersionIndex INTEGER,
  branchScopesJson TEXT NOT NULL DEFAULT '[]',
  messageVersionIndex INTEGER,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_message_favorites_key
  ON ai_message_favorites(favoriteKey);

CREATE INDEX IF NOT EXISTS idx_ai_message_favorites_space_created_at
  ON ai_message_favorites(space, createdAt);

CREATE INDEX IF NOT EXISTS idx_ai_message_favorites_thread
  ON ai_message_favorites(threadId, createdAt);
`;

export const MIGRATION_STATEMENTS_V38 = `
ALTER TABLE ai_threads ADD COLUMN sessionBaseUrl TEXT;
ALTER TABLE ai_threads ADD COLUMN sessionApiKeyRef TEXT;
`;

export const MIGRATION_STATEMENTS_V39 = `
ALTER TABLE ai_threads ADD COLUMN modelTitleGeneratedAt TEXT;
`;

export const MIGRATION_STATEMENTS_V40 = `
ALTER TABLE ai_threads ADD COLUMN thinkingDisabled INTEGER NOT NULL DEFAULT 0;
`;

export const MIGRATION_STATEMENTS_V41 = `
ALTER TABLE ai_providers ADD COLUMN keyUpdatedAt TEXT;
ALTER TABLE ai_providers ADD COLUMN lastVerifiedAt TEXT;
ALTER TABLE ai_providers ADD COLUMN lastVerifyStatus TEXT CHECK (lastVerifyStatus IN ('ready', 'changed', 'failed', 'untested'));
ALTER TABLE ai_providers ADD COLUMN lastVerifyMessage TEXT;
ALTER TABLE ai_providers ADD COLUMN verifyFingerprint TEXT;
`;

export const MIGRATION_STATEMENTS_V42 = `
CREATE TABLE IF NOT EXISTS ai_message_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  messageId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'document')),
  name TEXT NOT NULL,
  localUri TEXT NOT NULL,
  documentId TEXT,
  mimeType TEXT,
  fileSize INTEGER,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (documentId) REFERENCES ai_documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_message_attachments_message
  ON ai_message_attachments(messageId, createdAt);
`;

export const MIGRATION_STATEMENTS_V43 = `
CREATE TABLE IF NOT EXISTS ai_continuity_import_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  threadId TEXT NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  sourceKind TEXT NOT NULL,
  sourcePlatform TEXT,
  formatVersion TEXT,
  status TEXT NOT NULL,
  rollbackState TEXT NOT NULL,
  rollbackRoundsRemaining INTEGER NOT NULL DEFAULT 10,
  reviewGateState TEXT NOT NULL,
  preImportBranchRootMessageId TEXT,
  preImportBranchVersionIndex INTEGER,
  importedBranchRootMessageId TEXT,
  importedBranchVersionIndex INTEGER,
  importAnchorMessageId TEXT,
  importAnchorMessageRole TEXT,
  importBranchRootKind TEXT,
  rawDocumentText TEXT NOT NULL,
  rawDocumentHash TEXT NOT NULL,
  parsedMessageCount INTEGER NOT NULL DEFAULT 0,
  containsCompressedContinuity INTEGER NOT NULL DEFAULT 0,
  memoryReviewStatus TEXT,
  memoryReviewError TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  rolledBackAt TEXT,
  stabilizedAt TEXT,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_continuity_import_blocks (
  id TEXT PRIMARY KEY NOT NULL,
  importSessionId TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (importSessionId) REFERENCES ai_continuity_import_sessions(id) ON DELETE CASCADE
);

ALTER TABLE ai_messages ADD COLUMN continuityImportSessionId TEXT REFERENCES ai_continuity_import_sessions(id) ON DELETE SET NULL;
ALTER TABLE ai_messages ADD COLUMN continuitySyntheticKind TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_messages_continuity_import_session
  ON ai_messages(continuityImportSessionId, continuitySyntheticKind, createdAt);
CREATE INDEX IF NOT EXISTS idx_ai_continuity_import_sessions_thread
  ON ai_continuity_import_sessions(threadId, createdAt);
CREATE INDEX IF NOT EXISTS idx_ai_continuity_import_blocks_session
  ON ai_continuity_import_blocks(importSessionId, createdAt);
`;

export const MIGRATION_STATEMENTS_V44 = `
ALTER TABLE ai_thread_summary_segments ADD COLUMN continuityImportSessionId TEXT REFERENCES ai_continuity_import_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_summary_segments_continuity_import_session
  ON ai_thread_summary_segments(continuityImportSessionId, createdAt);
`;

export const MIGRATION_STATEMENTS_V45 = `
CREATE TABLE IF NOT EXISTS ai_continuity_import_effects (
  id TEXT PRIMARY KEY NOT NULL,
  importSessionId TEXT NOT NULL,
  effectOrder INTEGER NOT NULL,
  effectType TEXT NOT NULL,
  targetRecordId TEXT,
  beforeStateJson TEXT,
  afterStateJson TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (importSessionId) REFERENCES ai_continuity_import_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_continuity_import_effects_session
  ON ai_continuity_import_effects(importSessionId, effectOrder, createdAt);
`;

export const MIGRATION_STATEMENTS_V46 = `
ALTER TABLE ai_threads ADD COLUMN contextHistoryRoundLimit INTEGER NOT NULL DEFAULT 30;
`;

export const MIGRATION_STATEMENTS_V47 = `
CREATE TABLE IF NOT EXISTS memory_claims (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  schemaVersion INTEGER NOT NULL DEFAULT 1,
  canonicalClaimId TEXT NOT NULL,
  relatedClaimGroupId TEXT,
  lane TEXT NOT NULL CHECK (lane IN ('confirmed', 'working', 'archive')),
  status TEXT NOT NULL CHECK (status IN ('tentative', 'committed', 'confirmed', 'stale', 'superseded', 'conflicted', 'suppressed', 'deleted')),
  kind TEXT NOT NULL CHECK (kind IN ('state', 'episode', 'task', 'commitment', 'relational_signal')),
  actor TEXT NOT NULL CHECK (actor IN ('user', 'companion', 'joint')),
  subjectEntityId TEXT NOT NULL,
  subjectDisplay TEXT NOT NULL,
  scopeType TEXT NOT NULL CHECK (scopeType IN ('global', 'role', 'ip', 'knowledge_base', 'thread', 'branch')),
  scopeId TEXT,
  predicate TEXT NOT NULL,
  valueNormalized TEXT NOT NULL,
  valueDisplay TEXT NOT NULL,
  polarity TEXT NOT NULL CHECK (polarity IN ('positive', 'negative', 'unknown')),
  speechMode TEXT NOT NULL CHECK (speechMode IN ('asserted', 'corrected', 'negated', 'hypothetical', 'joke', 'quoted', 'roleplay', 'uncertain')),
  rawTimePhrase TEXT,
  validFrom TEXT,
  validTo TEXT,
  validPrecision TEXT NOT NULL CHECK (validPrecision IN ('exact', 'day', 'month', 'relative', 'unknown')),
  confidenceRaw REAL NOT NULL CHECK (confidenceRaw >= 0 AND confidenceRaw <= 1),
  confidenceCalibrated REAL CHECK (confidenceCalibrated IS NULL OR (confidenceCalibrated >= 0 AND confidenceCalibrated <= 1)),
  confidenceBand TEXT NOT NULL CHECK (confidenceBand IN ('high', 'medium', 'low')),
  importance INTEGER NOT NULL CHECK (importance BETWEEN 0 AND 100),
  stability TEXT NOT NULL CHECK (stability IN ('ephemeral', 'short', 'long', 'permanent')),
  manualLocked INTEGER NOT NULL DEFAULT 0 CHECK (manualLocked IN (0, 1)),
  safetyState TEXT NOT NULL DEFAULT 'none' CHECK (safetyState IN ('none', 'safety_pending', 'safety_confirmed')),
  sourceKind TEXT NOT NULL CHECK (sourceKind IN ('message', 'summary', 'import', 'manual', 'assistant_commitment')),
  sourceMessageId TEXT,
  extractorVersion TEXT NOT NULL,
  ontologyVersion TEXT NOT NULL,
  projectionVersion INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  lastUsedAt TEXT,
  supersededByClaimId TEXT,
  deletedAt TEXT,
  FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (supersededByClaimId) REFERENCES memory_claims(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_claims_active_canonical
  ON memory_claims(space, canonicalClaimId, scopeType, COALESCE(scopeId, '∅'))
  WHERE status IN ('tentative', 'committed', 'confirmed', 'conflicted')
    AND deletedAt IS NULL;
CREATE INDEX IF NOT EXISTS idx_memory_claims_scope_status
  ON memory_claims(space, scopeType, scopeId, lane, status, importance);
CREATE INDEX IF NOT EXISTS idx_memory_claims_source
  ON memory_claims(sourceMessageId);
CREATE INDEX IF NOT EXISTS idx_memory_claims_canonical
  ON memory_claims(space, canonicalClaimId, updatedAt);

CREATE TABLE IF NOT EXISTS memory_events (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  aggregateType TEXT NOT NULL CHECK (aggregateType IN ('claim', 'episode', 'relation', 'import')),
  aggregateId TEXT NOT NULL,
  eventType TEXT NOT NULL,
  eventVersion INTEGER NOT NULL,
  commandId TEXT NOT NULL,
  idempotencyKey TEXT NOT NULL UNIQUE,
  actorType TEXT NOT NULL CHECK (actorType IN ('user', 'system', 'model', 'import')),
  actorId TEXT,
  source TEXT NOT NULL,
  payloadJson TEXT NOT NULL,
  evidenceIdsJson TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL,
  projectionVersion INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_events_aggregate
  ON memory_events(space, aggregateType, aggregateId, eventVersion);
CREATE INDEX IF NOT EXISTS idx_memory_events_projection
  ON memory_events(space, projectionVersion, createdAt);

CREATE TABLE IF NOT EXISTS memory_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  sourceType TEXT NOT NULL CHECK (sourceType IN ('message', 'summary', 'import', 'attachment')),
  sourceId TEXT NOT NULL,
  messageId TEXT,
  role TEXT,
  quote TEXT,
  quoteHash TEXT NOT NULL,
  charStart INTEGER,
  charEnd INTEGER,
  sourceRevision TEXT,
  createdAt TEXT NOT NULL,
  deletedAt TEXT,
  FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_evidence_source
  ON memory_evidence(space, sourceType, sourceId);
CREATE INDEX IF NOT EXISTS idx_memory_evidence_message
  ON memory_evidence(messageId);

CREATE TABLE IF NOT EXISTS memory_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  eventId TEXT,
  taskType TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'retry', 'dead', 'done')),
  idempotencyKey TEXT NOT NULL UNIQUE,
  retryCount INTEGER NOT NULL DEFAULT 0,
  leaseUntil TEXT,
  nextRunAt TEXT NOT NULL,
  lastError TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (eventId) REFERENCES memory_events(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_memory_outbox_ready
  ON memory_outbox(space, status, nextRunAt);

CREATE TABLE IF NOT EXISTS memory_projection_meta (
  space TEXT PRIMARY KEY NOT NULL CHECK (space IN ('normal', 'personal')),
  projectionVersion INTEGER NOT NULL DEFAULT 0,
  memoryEpoch INTEGER NOT NULL DEFAULT 0,
  ontologyVersion TEXT NOT NULL DEFAULT 'ontology-v1',
  retrievalScorerVersion TEXT NOT NULL DEFAULT 'retrieval-v1',
  lastRebuiltAt TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_import_id_map (
  packageId TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  sourceId TEXT NOT NULL,
  targetType TEXT NOT NULL,
  targetId TEXT NOT NULL,
  sourceHash TEXT NOT NULL,
  importedAt TEXT NOT NULL,
  PRIMARY KEY (packageId, sourceType, sourceId)
);

CREATE TABLE IF NOT EXISTS memory_deletion_certificates (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  commandId TEXT NOT NULL UNIQUE,
  targetClaimIdsJson TEXT NOT NULL,
  projectionCleared INTEGER NOT NULL DEFAULT 0,
  ftsCleared INTEGER NOT NULL DEFAULT 0,
  embeddingCleared INTEGER NOT NULL DEFAULT 0,
  graphCleared INTEGER NOT NULL DEFAULT 0,
  cacheEpochAdvanced INTEGER NOT NULL DEFAULT 0,
  exportCleared INTEGER NOT NULL DEFAULT 0,
  providerCacheLimitation TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_episodes (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  scopeType TEXT NOT NULL,
  scopeId TEXT,
  lane TEXT NOT NULL CHECK (lane IN ('confirmed', 'working', 'archive')),
  status TEXT NOT NULL CHECK (status IN ('active', 'closed', 'archived', 'deleted')),
  title TEXT NOT NULL,
  summaryText TEXT NOT NULL,
  startMessageId TEXT,
  endMessageId TEXT,
  validFrom TEXT,
  validTo TEXT,
  sourceClaimIdsJson TEXT NOT NULL DEFAULT '[]',
  sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]',
  branchRootMessageId TEXT,
  branchVersionIndex INTEGER,
  confidenceBand TEXT NOT NULL CHECK (confidenceBand IN ('high', 'medium', 'low')),
  importance INTEGER NOT NULL CHECK (importance BETWEEN 0 AND 100),
  projectionVersion INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  archivedAt TEXT,
  deletedAt TEXT,
  FOREIGN KEY (startMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (endMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_episodes_scope
  ON memory_episodes(space, scopeType, scopeId, lane, status, updatedAt);

CREATE TABLE IF NOT EXISTS memory_relational_states (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  scopeType TEXT NOT NULL,
  scopeId TEXT,
  subjectEntityId TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('affinity', 'trust', 'tension', 'familiarity')),
  value REAL NOT NULL CHECK (value BETWEEN -1.0 AND 1.0),
  signalWeight REAL NOT NULL CHECK (signalWeight >= 0),
  decayHalfLifeDays REAL NOT NULL CHECK (decayHalfLifeDays > 0),
  lastEvidenceAt TEXT,
  evidenceIdsJson TEXT NOT NULL DEFAULT '[]',
  projectionVersion INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(space, scopeType, scopeId, subjectEntityId, metric)
);

CREATE TABLE IF NOT EXISTS memory_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  scopeType TEXT NOT NULL,
  scopeId TEXT,
  profileJson TEXT NOT NULL,
  profileText TEXT NOT NULL,
  sourceClaimIdsJson TEXT NOT NULL DEFAULT '[]',
  sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  projectionVersion INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(space, scopeType, scopeId)
);

CREATE TABLE IF NOT EXISTS memory_board_projection (
  claimId TEXT NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  displayContent TEXT NOT NULL,
  lane TEXT NOT NULL CHECK (lane IN ('confirmed', 'working', 'archive')),
  scopeLabel TEXT NOT NULL,
  sourceLabel TEXT NOT NULL,
  needsReview INTEGER NOT NULL DEFAULT 0 CHECK (needsReview IN (0, 1)),
  hasConflict INTEGER NOT NULL DEFAULT 0 CHECK (hasConflict IN (0, 1)),
  sortKey REAL NOT NULL,
  projectionVersion INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (claimId, space),
  FOREIGN KEY (claimId) REFERENCES memory_claims(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_memory_board_lane
  ON memory_board_projection(space, lane, hidden, sortKey DESC);

CREATE TABLE IF NOT EXISTS memory_current_turn_observations (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  threadId TEXT NOT NULL,
  branchRootMessageId TEXT,
  branchVersionIndex INTEGER,
  messageId TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('none', 'recall', 'correction', 'forget', 'confirm', 'historical', 'safety')),
  explicitUserAction INTEGER NOT NULL DEFAULT 0 CHECK (explicitUserAction IN (0, 1)),
  payloadJson TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'consumed', 'expired', 'deleted')),
  extractorVersion TEXT NOT NULL,
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  consumedAt TEXT,
  deletedAt TEXT,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_memory_current_turn_pending
  ON memory_current_turn_observations(threadId, status, expiresAt);

CREATE TABLE IF NOT EXISTS memory_ontology_predicates (
  ontologyVersion TEXT NOT NULL,
  predicate TEXT NOT NULL,
  subjectKind TEXT NOT NULL,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (ontologyVersion, predicate)
);

CREATE TABLE IF NOT EXISTS memory_ontology_aliases (
  ontologyVersion TEXT NOT NULL,
  aliasNormalized TEXT NOT NULL,
  predicate TEXT NOT NULL,
  objectNormalizer TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (ontologyVersion, aliasNormalized),
  FOREIGN KEY (ontologyVersion, predicate)
    REFERENCES memory_ontology_predicates(ontologyVersion, predicate)
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  claimId TEXT NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  providerId TEXT NOT NULL,
  modelId TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vectorJson TEXT NOT NULL,
  sourceTextHash TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (claimId, space, modelId),
  FOREIGN KEY (claimId) REFERENCES memory_claims(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_space_model
  ON memory_embeddings(space, modelId, updatedAt);

CREATE TABLE IF NOT EXISTS memory_lineage_meta (
  threadId TEXT PRIMARY KEY NOT NULL,
  currentRootMessageId TEXT,
  currentBranchVersionIndex INTEGER NOT NULL DEFAULT 0,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO memory_ontology_predicates
  (ontologyVersion, predicate, subjectKind, description)
VALUES
  ('ontology-v1', 'preference.general', 'user', 'General preference'),
  ('ontology-v1', 'preference.food', 'user', 'Food preference or restriction'),
  ('ontology-v1', 'preference.communication', 'user', 'Communication preference'),
  ('ontology-v1', 'preference.schedule', 'user', 'Schedule preference'),
  ('ontology-v1', 'fact.identity', 'user', 'Stable identity fact'),
  ('ontology-v1', 'fact.household', 'user', 'Household fact'),
  ('ontology-v1', 'fact.health', 'user', 'Health fact'),
  ('ontology-v1', 'decision', 'user', 'Important decision'),
  ('ontology-v1', 'boundary.safety', 'user', 'Safety boundary'),
  ('ontology-v1', 'boundary.consent', 'user', 'Consent boundary'),
  ('ontology-v1', 'task', 'user', 'Task or plan'),
  ('ontology-v1', 'commitment', 'companion', 'Companion commitment'),
  ('ontology-v1', 'relational.affinity', 'joint', 'Relational affinity signal'),
  ('ontology-v1', 'relational.trust', 'joint', 'Relational trust signal'),
  ('ontology-v1', 'relational.tension', 'joint', 'Relational tension signal'),
  ('ontology-v1', 'relational.familiarity', 'joint', 'Relational familiarity signal'),
  ('ontology-v1', 'state.emotion', 'user', 'Emotional state'),
  ('ontology-v1', 'state.location', 'user', 'Location state'),
  ('ontology-v1', 'state.health', 'user', 'Health state'),
  ('ontology-v1', 'episode.scene', 'joint', 'Conversation episode');

INSERT OR IGNORE INTO memory_ontology_aliases
  (ontologyVersion, aliasNormalized, predicate, objectNormalizer)
VALUES
  ('ontology-v1', '喜欢', 'preference.general', 'text'),
  ('ontology-v1', '偏好', 'preference.general', 'text'),
  ('ontology-v1', '不喜欢', 'preference.general', 'text'),
  ('ontology-v1', '讨厌', 'preference.general', 'text'),
  ('ontology-v1', '不吃', 'preference.food', 'text'),
  ('ontology-v1', '忌口', 'preference.food', 'text'),
  ('ontology-v1', '过敏', 'boundary.safety', 'text'),
  ('ontology-v1', '过敏于', 'boundary.safety', 'text'),
  ('ontology-v1', '记住', 'preference.communication', 'text'),
  ('ontology-v1', '以后默认', 'preference.communication', 'text');

INSERT OR IGNORE INTO memory_projection_meta
  (space, projectionVersion, memoryEpoch, ontologyVersion, retrievalScorerVersion, updatedAt)
VALUES
  ('normal', 0, 0, 'ontology-v1', 'retrieval-v1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('personal', 0, 0, 'ontology-v1', 'retrieval-v1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
`;

export const MIGRATION_STATEMENTS_V47_ADD_LINEAGE_COLUMN = `
ALTER TABLE ai_threads ADD COLUMN lineageVersion INTEGER NOT NULL DEFAULT 0;
`;

export const MIGRATION_STATEMENTS_V48 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  appliedAt TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (version, appliedAt)
VALUES
  (47, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (48, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
`;

export const MIGRATION_STATEMENTS_V49 = `
CREATE TABLE IF NOT EXISTS companion_diaries (
  id TEXT PRIMARY KEY NOT NULL,
  roleCardId TEXT NOT NULL,
  diaryDate TEXT NOT NULL,
  currentVersionId TEXT,
  themeKey TEXT NOT NULL,
  bodyFontKey TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('generating', 'ready_pending_presentation', 'ready', 'failed')),
  sourceThreadId TEXT,
  sourceBranchRouteJson TEXT NOT NULL DEFAULT '[]',
  sourceSnapshotHash TEXT NOT NULL,
  contextOptIn INTEGER CHECK (contextOptIn IN (0, 1)),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(roleCardId, diaryDate)
);

CREATE TABLE IF NOT EXISTS companion_diary_versions (
  id TEXT PRIMARY KEY NOT NULL,
  diaryId TEXT NOT NULL,
  versionNumber INTEGER NOT NULL,
  body TEXT NOT NULL,
  pageLayoutJson TEXT,
  generationModelSnapshotJson TEXT NOT NULL DEFAULT '{}',
  sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]',
  sourceSummarySnapshot TEXT,
  sourceSnapshotHash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('current', 'superseded')),
  createdAt TEXT NOT NULL,
  supersededAt TEXT,
  UNIQUE(diaryId, versionNumber),
  FOREIGN KEY (diaryId) REFERENCES companion_diaries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS companion_diary_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  roleCardId TEXT NOT NULL,
  diaryDate TEXT NOT NULL,
  triggerKind TEXT NOT NULL,
  scheduledFor TEXT NOT NULL,
  sourceThreadId TEXT,
  sourceBranchRouteJson TEXT NOT NULL DEFAULT '[]',
  sourceSnapshotHash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'due', 'generating', 'completed', 'failed', 'cancelled')),
  idempotencyKey TEXT NOT NULL UNIQUE,
  attemptCount INTEGER NOT NULL DEFAULT 0,
  nextRunAt TEXT,
  errorMessage TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companion_diaries_role_date
  ON companion_diaries(roleCardId, diaryDate DESC);
CREATE INDEX IF NOT EXISTS idx_companion_diary_jobs_ready
  ON companion_diary_jobs(status, scheduledFor, nextRunAt);
CREATE INDEX IF NOT EXISTS idx_companion_diary_versions_diary
  ON companion_diary_versions(diaryId, versionNumber DESC);
`;

// A diary may be generated after a quiet-period timer fires. Preserve the exact
// source at scheduling time so later messages, edits, or role-card changes do
// not alter what that diary is about.
export const MIGRATION_STATEMENTS_V50 = `
ALTER TABLE companion_diary_jobs ADD COLUMN sourceMessagesJson TEXT NOT NULL DEFAULT '[]';
ALTER TABLE companion_diary_jobs ADD COLUMN sourceSummarySnapshot TEXT;
ALTER TABLE companion_diary_jobs ADD COLUMN roleSnapshotJson TEXT NOT NULL DEFAULT '{}';
`;

// Summary coverage is valid only for the exact materialized branch and message
// versions from which it was produced. Existing segments are conservative-stale
// until a maintenance pass recreates them with complete provenance.
export const MIGRATION_STATEMENTS_V51 = `
ALTER TABLE ai_thread_summary_segments ADD COLUMN sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ai_thread_summary_segments ADD COLUMN branchRouteHash TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_thread_summary_segments ADD COLUMN lineageVersion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_thread_summary_segments ADD COLUMN sourceMessageVersionHash TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_thread_summary_segments ADD COLUMN quality TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE ai_thread_summary_segments ADD COLUMN status TEXT NOT NULL DEFAULT 'stale';

CREATE INDEX IF NOT EXISTS idx_ai_summary_segments_coverage
  ON ai_thread_summary_segments(threadId, status, branchRouteHash, lineageVersion, createdAt);
`;

// Companion runtime V1 begins with an append-only event ledger, temporal
// anchors, OpenLoops, durable maintenance jobs, and content-free traces.
export const MIGRATION_STATEMENTS_V52 = `
CREATE TABLE IF NOT EXISTS companion_events (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  subjectType TEXT NOT NULL CHECK (subjectType IN ('role', 'thread')),
  subjectId TEXT NOT NULL,
  roleCardId TEXT,
  threadId TEXT NOT NULL,
  branchRootMessageId TEXT,
  branchVersionIndex INTEGER,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sourceMessageId TEXT NOT NULL,
  sourceMessageVersionHash TEXT NOT NULL,
  category TEXT NOT NULL,
  subtype TEXT NOT NULL,
  speechMode TEXT NOT NULL,
  confidence REAL NOT NULL,
  intensity REAL NOT NULL,
  sincerity REAL NOT NULL,
  payloadJson TEXT NOT NULL DEFAULT '{}',
  evidenceSpanJson TEXT NOT NULL DEFAULT '{}',
  extractorVersion TEXT NOT NULL,
  provenanceJson TEXT NOT NULL DEFAULT '[]',
  idempotencyKey TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deleted')),
  eventSequence INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companion_events_sequence
  ON companion_events(space, subjectType, subjectId, threadId, branchRouteHash, eventSequence);
CREATE INDEX IF NOT EXISTS idx_companion_events_visible
  ON companion_events(threadId, branchRouteHash, lineageVersion, status, eventSequence);
CREATE INDEX IF NOT EXISTS idx_companion_events_role
  ON companion_events(roleCardId, status, createdAt);
CREATE INDEX IF NOT EXISTS idx_companion_events_source
  ON companion_events(sourceMessageId, sourceMessageVersionHash);

CREATE TABLE IF NOT EXISTS companion_temporal_anchors (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT,
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sourceEventId TEXT NOT NULL,
  sourceMessageId TEXT NOT NULL,
  rawText TEXT NOT NULL,
  startAtUtc TEXT,
  endAtUtc TEXT,
  parseTimeZone TEXT NOT NULL,
  localDateKey TEXT NOT NULL,
  precision TEXT NOT NULL,
  anchorType TEXT NOT NULL,
  recurrenceRule TEXT,
  mentionCount INTEGER NOT NULL DEFAULT 0,
  lastMentionedAt TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled', 'superseded')),
  confidence REAL NOT NULL,
  parserVersion TEXT NOT NULL,
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceEventId) REFERENCES companion_events(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_temporal_visible
  ON companion_temporal_anchors(threadId, branchRouteHash, lineageVersion, status, startAtUtc);
CREATE INDEX IF NOT EXISTS idx_companion_temporal_role
  ON companion_temporal_anchors(roleCardId, status, localDateKey);

CREATE TABLE IF NOT EXISTS companion_open_loops (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT,
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sourceEventId TEXT NOT NULL,
  sourceMessageId TEXT NOT NULL,
  temporalAnchorId TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('deadline', 'result_wait', 'weak', 'recurring')),
  topicText TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed', 'expired', 'superseded')),
  priority INTEGER NOT NULL DEFAULT 50,
  earliestMentionAt TEXT NOT NULL,
  expiresAt TEXT,
  mentionCount INTEGER NOT NULL DEFAULT 0,
  lastMentionedAt TEXT,
  lastMentionedRound INTEGER,
  recurrenceRule TEXT,
  resolutionEvidenceMessageId TEXT,
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceEventId) REFERENCES companion_events(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (temporalAnchorId) REFERENCES companion_temporal_anchors(id) ON DELETE SET NULL,
  FOREIGN KEY (resolutionEvidenceMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_companion_open_loops_ready
  ON companion_open_loops(threadId, branchRouteHash, lineageVersion, status, earliestMentionAt, expiresAt);
CREATE INDEX IF NOT EXISTS idx_companion_open_loops_role
  ON companion_open_loops(roleCardId, status, updatedAt);

CREATE TABLE IF NOT EXISTS companion_runtime_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sourceMessageId TEXT,
  jobType TEXT NOT NULL CHECK (jobType IN ('event_enrichment', 'projection_rebuild', 'temporal_expiry')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'retry', 'waiting_model', 'done', 'dead', 'cancelled')),
  payloadJson TEXT NOT NULL DEFAULT '{}',
  idempotencyKey TEXT NOT NULL UNIQUE,
  attemptCount INTEGER NOT NULL DEFAULT 0,
  nextRunAt TEXT NOT NULL,
  leaseOwner TEXT,
  leaseUntil TEXT,
  lastErrorCode TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_companion_runtime_jobs_ready
  ON companion_runtime_jobs(space, status, nextRunAt, leaseUntil);
CREATE INDEX IF NOT EXISTS idx_companion_runtime_jobs_thread
  ON companion_runtime_jobs(threadId, branchRouteHash, status, updatedAt);

CREATE TABLE IF NOT EXISTS companion_context_traces (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  threadId TEXT NOT NULL,
  sourceMessageId TEXT,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  policyVersion TEXT NOT NULL,
  eventCount INTEGER NOT NULL DEFAULT 0,
  diagnosticCandidateCount INTEGER NOT NULL DEFAULT 0,
  optionalCandidateCount INTEGER NOT NULL DEFAULT 0,
  selectedTopicType TEXT,
  observerDurationMs REAL NOT NULL DEFAULT 0,
  compilerDurationMs REAL NOT NULL DEFAULT 0,
  reasonCodesJson TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_companion_context_traces_thread
  ON companion_context_traces(threadId, createdAt DESC);
`;

export const MIGRATION_STATEMENTS_V53 = `
CREATE TABLE IF NOT EXISTS companion_projection_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  scopeType TEXT NOT NULL CHECK (scopeType IN ('role_base', 'branch_overlay', 'thread')),
  roleCardId TEXT,
  threadId TEXT,
  branchRouteHash TEXT NOT NULL DEFAULT '',
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  basedOnEventSequence INTEGER NOT NULL DEFAULT 0,
  affection REAL NOT NULL DEFAULT 0,
  security REAL NOT NULL DEFAULT 0,
  arousal REAL NOT NULL DEFAULT 0,
  agency REAL NOT NULL DEFAULT 0,
  relationshipJson TEXT NOT NULL,
  stanceJson TEXT NOT NULL,
  policyVersion TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale', 'rebuilding')),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(space, scopeType, roleCardId, threadId, branchRouteHash, lineageVersion),
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_projection_scope
  ON companion_projection_snapshots(space, roleCardId, threadId, branchRouteHash, lineageVersion, status);

CREATE TABLE IF NOT EXISTS companion_affective_observations (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT,
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sourceEventId TEXT NOT NULL UNIQUE,
  sourceMessageId TEXT NOT NULL,
  sourceMessageVersionHash TEXT NOT NULL,
  label TEXT NOT NULL,
  confidence REAL NOT NULL,
  expiresAt TEXT NOT NULL,
  expiresAfterRound INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'source_changed')),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceEventId) REFERENCES companion_events(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_affective_visible
  ON companion_affective_observations(threadId, branchRouteHash, lineageVersion, status, expiresAt);

CREATE TABLE IF NOT EXISTS companion_repairs (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT,
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sourceEventId TEXT NOT NULL UNIQUE,
  sourceMessageId TEXT NOT NULL,
  sourceMessageVersionHash TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('boundary', 'correction')),
  subtype TEXT NOT NULL,
  constraintText TEXT NOT NULL,
  forbiddenTermsJson TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL CHECK (state IN ('detected', 'constrained', 'acknowledged', 'observing', 'verified', 'violated', 'dismissed')),
  passedRelevantTurns INTEGER NOT NULL DEFAULT 0,
  violationCount INTEGER NOT NULL DEFAULT 0,
  semanticReviewRequired INTEGER NOT NULL DEFAULT 0,
  lastCheckedAssistantMessageId TEXT,
  resolutionEvidenceMessageId TEXT,
  policyVersion TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceEventId) REFERENCES companion_events(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (lastCheckedAssistantMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (resolutionEvidenceMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_companion_repairs_active
  ON companion_repairs(threadId, branchRouteHash, lineageVersion, state, updatedAt DESC);

CREATE TABLE IF NOT EXISTS companion_dream_scenes (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  semanticState TEXT NOT NULL CHECK (semanticState IN ('approaching_sleep', 'sleep_established', 'dream_active', 'closing', 'closed')),
  participantsJson TEXT NOT NULL DEFAULT '[]',
  evidenceMessageIdsJson TEXT NOT NULL DEFAULT '[]',
  sourceSnapshotHash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'source_changed')),
  openedAt TEXT NOT NULL,
  closedAt TEXT,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companion_dream_scene_active
  ON companion_dream_scenes(space, roleCardId, threadId, branchRouteHash, lineageVersion)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS companion_dream_seeds (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sceneId TEXT NOT NULL,
  sourceMessageIdsJson TEXT NOT NULL,
  sourceMessageVersionHashesJson TEXT NOT NULL,
  sourceSnapshotHash TEXT NOT NULL,
  roll REAL NOT NULL CHECK (roll >= 0 AND roll < 1),
  classificationJson TEXT,
  classifiedProbability REAL,
  decision TEXT NOT NULL CHECK (decision IN ('awaiting_confirmation', 'prepruned', 'frequency_blocked', 'classifying', 'selected', 'rejected', 'cancelled', 'failed')),
  manual INTEGER NOT NULL DEFAULT 0,
  policyVersion TEXT NOT NULL,
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sceneId) REFERENCES companion_dream_scenes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_dream_seeds_scope
  ON companion_dream_seeds(roleCardId, threadId, branchRouteHash, decision, createdAt DESC);

CREATE TABLE IF NOT EXISTS companion_dream_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sceneId TEXT NOT NULL,
  seedId TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL CHECK (phase IN ('classifying', 'generating')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'retry', 'waiting_model', 'completed', 'failed', 'cancelled')),
  sourceSnapshotHash TEXT NOT NULL,
  sourceMessageIdsJson TEXT NOT NULL,
  attemptCount INTEGER NOT NULL DEFAULT 0,
  maxAttempts INTEGER NOT NULL DEFAULT 3,
  cancelRequested INTEGER NOT NULL DEFAULT 0,
  quotaReserved INTEGER NOT NULL DEFAULT 0,
  nextRunAt TEXT NOT NULL,
  leaseOwner TEXT,
  leaseUntil TEXT,
  lastErrorCode TEXT,
  classifierPromptTokens INTEGER,
  classifierCompletionTokens INTEGER,
  generationPromptTokens INTEGER,
  generationCompletionTokens INTEGER,
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sceneId) REFERENCES companion_dream_scenes(id) ON DELETE CASCADE,
  FOREIGN KEY (seedId) REFERENCES companion_dream_seeds(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_dream_jobs_ready
  ON companion_dream_jobs(space, status, nextRunAt, leaseUntil);
CREATE INDEX IF NOT EXISTS idx_companion_dream_jobs_thread
  ON companion_dream_jobs(threadId, branchRouteHash, status, createdAt DESC);

CREATE TABLE IF NOT EXISTS companion_dreams (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT NOT NULL,
  sourceThreadId TEXT NOT NULL,
  sourceBranchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sceneId TEXT NOT NULL,
  seedId TEXT NOT NULL UNIQUE,
  jobId TEXT NOT NULL UNIQUE,
  sourceMessageIdsJson TEXT NOT NULL,
  sourceSnapshotHash TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  displayAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale_source', 'soft_deleted')),
  contextOptIn INTEGER CHECK (contextOptIn IN (0, 1)),
  viewedAt TEXT,
  deletedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (sourceThreadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sceneId) REFERENCES companion_dream_scenes(id) ON DELETE CASCADE,
  FOREIGN KEY (seedId) REFERENCES companion_dream_seeds(id) ON DELETE CASCADE,
  FOREIGN KEY (jobId) REFERENCES companion_dream_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_dreams_role
  ON companion_dreams(roleCardId, status, displayAt DESC);
CREATE INDEX IF NOT EXISTS idx_companion_dreams_context
  ON companion_dreams(sourceThreadId, sourceBranchRouteHash, contextOptIn, status, displayAt DESC);

CREATE TABLE IF NOT EXISTS companion_role_round_counters (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT NOT NULL,
  totalRounds INTEGER NOT NULL DEFAULT 0,
  lastDreamSuccessRound INTEGER,
  beijingDateKey TEXT NOT NULL,
  dailyDreamSuccessCount INTEGER NOT NULL DEFAULT 0,
  dailyDreamReservedCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(space, roleCardId)
);

CREATE TABLE IF NOT EXISTS companion_role_round_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  userMessageId TEXT NOT NULL,
  assistantMessageId TEXT NOT NULL,
  userMessageVersionHash TEXT NOT NULL,
  assistantMessageVersionHash TEXT NOT NULL,
  roundNumber INTEGER NOT NULL,
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (userMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (assistantMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_role_round_receipts_role
  ON companion_role_round_receipts(roleCardId, roundNumber DESC);

CREATE TABLE IF NOT EXISTS companion_thought_events (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sessionKey TEXT NOT NULL,
  eventType TEXT NOT NULL CHECK (eventType IN ('vulnerable', 'hurtful', 'reconciliation', 'apology', 'praise', 'cold')),
  priority INTEGER NOT NULL,
  userMessageId TEXT NOT NULL,
  assistantMessageId TEXT NOT NULL,
  userMessageVersionHash TEXT NOT NULL,
  assistantMessageVersionHash TEXT NOT NULL,
  sourceSnapshotHash TEXT NOT NULL,
  evidenceJson TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'batched', 'discarded', 'source_changed')),
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (userMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (assistantMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_thought_events_session
  ON companion_thought_events(threadId, branchRouteHash, sessionKey, status, priority DESC, createdAt ASC);

CREATE TABLE IF NOT EXISTS companion_thought_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  sessionKey TEXT NOT NULL,
  eventIdsJson TEXT NOT NULL,
  sourceSnapshotHash TEXT NOT NULL,
  roleSnapshotJson TEXT NOT NULL,
  scheduledFor TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'retry', 'waiting_model', 'completed', 'failed', 'cancelled')),
  attemptCount INTEGER NOT NULL DEFAULT 0,
  maxAttempts INTEGER NOT NULL DEFAULT 3,
  quotaReservedCount INTEGER NOT NULL DEFAULT 0,
  nextRunAt TEXT NOT NULL,
  leaseOwner TEXT,
  leaseUntil TEXT,
  lastErrorCode TEXT,
  promptTokens INTEGER,
  completionTokens INTEGER,
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companion_thought_jobs_session
  ON companion_thought_jobs(space, roleCardId, threadId, branchRouteHash, sessionKey);
CREATE INDEX IF NOT EXISTS idx_companion_thought_jobs_ready
  ON companion_thought_jobs(space, status, nextRunAt, leaseUntil);

CREATE TABLE IF NOT EXISTS companion_thoughts (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  roleCardId TEXT NOT NULL,
  sourceThreadId TEXT NOT NULL,
  sourceBranchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  jobId TEXT NOT NULL,
  eventIdsJson TEXT NOT NULL,
  sourceMessageIdsJson TEXT NOT NULL,
  sourceSnapshotHash TEXT NOT NULL,
  priority INTEGER NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale_source', 'soft_deleted')),
  deliveryStatus TEXT NOT NULL DEFAULT 'pending' CHECK (deliveryStatus IN ('pending', 'reserved', 'delivered')),
  reservationId TEXT,
  reservationMessageId TEXT,
  reservedAt TEXT,
  deliveredAt TEXT,
  deliveredMessageId TEXT,
  deletedAt TEXT,
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (sourceThreadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (jobId) REFERENCES companion_thought_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (reservationMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL,
  FOREIGN KEY (deliveredMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_companion_thoughts_role
  ON companion_thoughts(roleCardId, status, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_companion_thoughts_delivery
  ON companion_thoughts(sourceThreadId, sourceBranchRouteHash, status, deliveryStatus, priority DESC, createdAt DESC);
`;

export const MIGRATION_STATEMENTS_V54 = `
ALTER TABLE ai_message_citations ADD COLUMN refId TEXT;
ALTER TABLE ai_message_citations ADD COLUMN claimStart INTEGER;
ALTER TABLE ai_message_citations ADD COLUMN claimEnd INTEGER;
ALTER TABLE ai_message_citations ADD COLUMN sourceExcerptHash TEXT;
ALTER TABLE ai_message_citations ADD COLUMN documentVersion TEXT;
ALTER TABLE ai_message_citations ADD COLUMN validationStatus TEXT NOT NULL DEFAULT 'valid'
  CHECK (validationStatus IN ('valid', 'invalid'));
ALTER TABLE ai_message_citations ADD COLUMN validationReason TEXT;
ALTER TABLE ai_message_citations ADD COLUMN usedAt TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_citations_validation
  ON ai_message_citations(messageId, validationStatus, claimStart);
`;

export const MIGRATION_STATEMENTS_V55 = `
CREATE TABLE IF NOT EXISTS ai_generation_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  threadId TEXT NOT NULL,
  userMessageId TEXT NOT NULL,
  assistantMessageId TEXT NOT NULL,
  generationId TEXT NOT NULL UNIQUE,
  attemptId TEXT NOT NULL,
  requestMode TEXT NOT NULL CHECK (requestMode IN ('replace', 'continue', 'followup')),
  state TEXT NOT NULL CHECK (state IN ('prepared', 'requesting', 'streaming', 'reconciling', 'recoverable_interrupted', 'retrying', 'continuing', 'completed', 'failed', 'stopped')),
  providerId TEXT,
  modelId TEXT,
  protocol TEXT,
  requestSnapshotJson TEXT NOT NULL DEFAULT '{}',
  promptSnapshotHash TEXT,
  cacheMetadataJson TEXT NOT NULL DEFAULT '{}',
  branchRouteHash TEXT NOT NULL,
  lineageVersion INTEGER NOT NULL DEFAULT 0,
  partialContent TEXT NOT NULL DEFAULT '',
  partialReasoning TEXT,
  lastPersistSequence INTEGER NOT NULL DEFAULT 0,
  completionReason TEXT,
  providerRequestId TEXT,
  providerCursor TEXT,
  retryCount INTEGER NOT NULL DEFAULT 0 CHECK (retryCount BETWEEN 0 AND 1),
  continuationCount INTEGER NOT NULL DEFAULT 0 CHECK (continuationCount BETWEEN 0 AND 1),
  leaseOwner TEXT,
  leaseExpiresAt TEXT,
  heartbeatAt TEXT,
  lastErrorCode TEXT,
  remoteOutcomeUnknown INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  startedAt TEXT,
  completedAt TEXT,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (userMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (assistantMessageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_reconcile
  ON ai_generation_jobs(space, state, leaseExpiresAt, updatedAt);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_assistant
  ON ai_generation_jobs(assistantMessageId, createdAt DESC);

CREATE TABLE IF NOT EXISTS ai_generation_events (
  id TEXT PRIMARY KEY NOT NULL,
  jobId TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  eventType TEXT NOT NULL,
  fromState TEXT,
  toState TEXT,
  payloadJson TEXT NOT NULL DEFAULT '{}',
  partialContentHash TEXT,
  createdAt TEXT NOT NULL,
  UNIQUE (jobId, sequence),
  FOREIGN KEY (jobId) REFERENCES ai_generation_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_generation_events_job
  ON ai_generation_events(jobId, sequence ASC);
`;

export const MIGRATION_STATEMENTS_V56 = `
ALTER TABLE image_assets ADD COLUMN sourceOrder INTEGER;
CREATE INDEX IF NOT EXISTS idx_image_assets_import_batch_source_order ON image_assets(importBatchId, sourceOrder, id);
`;

// Diary retries must use the exact prompt context frozen at scheduling time.
// Keep the durable job-context hash separate from the model-budget-adjusted
// message snapshot hash stored on the generated version.
export const MIGRATION_STATEMENTS_V57 = `
ALTER TABLE companion_diary_jobs ADD COLUMN sourceSystemPromptSnapshot TEXT;
ALTER TABLE companion_diary_versions ADD COLUMN jobContextSnapshotHash TEXT;
ALTER TABLE companion_diary_versions ADD COLUMN sourceSystemPromptSnapshot TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_messages_snapshot_candidates
  ON ai_messages(threadId, status, role, createdAt DESC);
`;

// Dream retries must keep the exact session role voice that existed when the
// seed was created. Message hashes alone cannot detect later session edits.
export const MIGRATION_STATEMENTS_V58 = `
ALTER TABLE companion_dream_seeds ADD COLUMN roleSnapshotJson TEXT NOT NULL DEFAULT '{}';
ALTER TABLE companion_dream_jobs ADD COLUMN quotaReservationDateKey TEXT;

UPDATE companion_dream_seeds
SET roleSnapshotJson = COALESCE(
  (SELECT ai_threads.roleSnapshotJson
   FROM ai_threads
   WHERE ai_threads.id = companion_dream_seeds.threadId),
  '{}'
)
WHERE roleSnapshotJson = '{}';
`;

export const MIGRATION_STATEMENTS_V59 = `
ALTER TABLE companion_dream_jobs ADD COLUMN targetVersionGroupId TEXT;
ALTER TABLE companion_dreams ADD COLUMN versionGroupId TEXT NOT NULL DEFAULT '';
ALTER TABLE companion_dreams ADD COLUMN versionNumber INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companion_dreams ADD COLUMN isCurrent INTEGER NOT NULL DEFAULT 0
  CHECK (isCurrent IN (0, 1));

UPDATE companion_dreams
SET versionGroupId = id,
    versionNumber = 1,
    isCurrent = 1
WHERE versionGroupId = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_companion_dreams_group_version
  ON companion_dreams(versionGroupId, versionNumber);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companion_dreams_group_current
  ON companion_dreams(versionGroupId)
  WHERE isCurrent = 1 AND status = 'active';

CREATE TABLE IF NOT EXISTS companion_artifact_chat_states (
  artifactKind TEXT NOT NULL CHECK (artifactKind IN ('diary', 'dream')),
  artifactGroupId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  hiddenAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (artifactKind, artifactGroupId, threadId),
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_artifact_chat_states_thread
  ON companion_artifact_chat_states(threadId, artifactKind, hiddenAt);
`;

export const MIGRATION_STATEMENTS_V60 = `
CREATE TABLE IF NOT EXISTS ai_prompt_requests (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK(space IN ('normal', 'personal')),
  threadId TEXT NOT NULL,
  userMessageId TEXT NOT NULL,
  assistantMessageId TEXT NOT NULL,
  generationId TEXT NOT NULL,
  providerId TEXT,
  modelId TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'failed', 'stopped')),
  branchRouteHash TEXT NOT NULL,
  sourceMessageVersionHash TEXT NOT NULL,
  contextAssemblyProfileHash TEXT NOT NULL,
  memoryEpoch TEXT,
  retrievalHash TEXT,
  historyRoundLimit INTEGER NOT NULL,
  promptVersion INTEGER NOT NULL,
  stablePrefixHash TEXT NOT NULL,
  stablePrefixEstimatedTokens INTEGER NOT NULL DEFAULT 0,
  reusablePrefixEstimatedTokens INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  completedAt TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_requests_generation ON ai_prompt_requests(generationId);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_requests_assistant_status ON ai_prompt_requests(assistantMessageId, status);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_requests_thread_route ON ai_prompt_requests(threadId, branchRouteHash, status);

CREATE TABLE IF NOT EXISTS ai_prompt_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  requestId TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  messageId TEXT NOT NULL,
  renderedContent TEXT NOT NULL,
  sourceMessageVersionHash TEXT NOT NULL,
  branchRouteHash TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(requestId, sequence),
  FOREIGN KEY(requestId) REFERENCES ai_prompt_requests(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_snapshots_message ON ai_prompt_snapshots(messageId, sourceMessageVersionHash);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_snapshots_request ON ai_prompt_snapshots(requestId, sequence);
`;

export const MIGRATION_STATEMENTS_V61 = `
CREATE TABLE IF NOT EXISTS diagnostic_events (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK(space IN ('normal', 'personal')),
  traceId TEXT NOT NULL,
  eventType TEXT NOT NULL,
  occurredAt TEXT NOT NULL,
  monotonicStartMs REAL,
  monotonicEndMs REAL,
  durationMs REAL,
  parentSpanId TEXT,
  threadIdHash TEXT,
  generationId TEXT,
  requestId TEXT,
  payloadJson TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_occurred ON diagnostic_events(occurredAt);
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_trace ON diagnostic_events(traceId, occurredAt);
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_generation ON diagnostic_events(generationId, occurredAt);
`;

export const MEMORY_SCOPE_GOVERNANCE_STATEMENTS = `
UPDATE ai_memories
SET status = 'stale',
    mergeReason = '旧版自动全局记忆已停用，请在记忆管理中手动确认是否保留为全局要求。',
    mergedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    lastReconciledAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE scope = 'global'
  AND sourceKind = 'auto'
  AND status = 'active';

DELETE FROM ai_memory_fts;
INSERT INTO ai_memory_fts (id, space, scope, scopeId, content, normalizedContent, assetSnapshotJson, updatedAt)
SELECT id, space, scope, scopeId, content, normalizedContent, assetSnapshotJson, updatedAt
FROM ai_memories
WHERE status = 'active' AND supersededByMemoryId IS NULL;
`;
