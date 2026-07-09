export const DATABASE_NAME = 'pixory.sqlite';
export const PERSONAL_DATABASE_NAME = 'pixory_personal.sqlite';
export const DATABASE_VERSION = 45;

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
