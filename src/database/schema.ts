export const DATABASE_NAME = 'pixory.sqlite';
export const PERSONAL_DATABASE_NAME = 'pixory_personal.sqlite';
export const DATABASE_VERSION = 15;

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
