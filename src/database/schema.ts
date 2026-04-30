export const DATABASE_NAME = 'pixory.sqlite';
export const DATABASE_VERSION = 3;

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
  description TEXT,
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
