export const DATABASE_NAME = 'pixory.sqlite';
export const PERSONAL_DATABASE_NAME = 'pixory_personal.sqlite';
export const DATABASE_VERSION = 18;

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
  modelSnapshotJson TEXT NOT NULL DEFAULT '{}',
  roleCardId TEXT,
  roleSnapshotJson TEXT NOT NULL DEFAULT '{}',
  systemPrompt TEXT NOT NULL DEFAULT '',
  materialRulesSnapshot TEXT,
  boundaryMode TEXT NOT NULL DEFAULT 'free' CHECK (boundaryMode IN ('free', 'prefer_material', 'strict_material')),
  summary TEXT,
  lastMessagePreview TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  archivedAt TEXT,
  FOREIGN KEY (boundKnowledgeBaseId) REFERENCES ai_knowledge_bases(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY NOT NULL,
  threadId TEXT NOT NULL,
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
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
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

CREATE INDEX IF NOT EXISTS idx_ai_threads_space_updated_at ON ai_threads(space, updatedAt);
CREATE INDEX IF NOT EXISTS idx_ai_threads_context ON ai_threads(space, contextType, updatedAt);
CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created_at ON ai_messages(threadId, createdAt);
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
