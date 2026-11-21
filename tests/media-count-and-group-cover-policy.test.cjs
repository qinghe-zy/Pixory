const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

const previousTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = function compileTypeScript(module, filename) {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename
  );
};

let groupRepository;
let ipRepository;
let imageRepository;
try {
  ({ groupRepository } = require(path.join(rootDir, 'src/database/repositories/groupRepository.ts')));
  ({ ipRepository } = require(path.join(rootDir, 'src/database/repositories/ipRepository.ts')));
  ({ imageRepository } = require(path.join(rootDir, 'src/database/repositories/imageRepository.ts')));
} finally {
  if (previousTsLoader) require.extensions['.ts'] = previousTsLoader;
  else delete require.extensions['.ts'];
}

class RepositoryTestDatabase {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(`
      CREATE TABLE ips (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        isFavorite INTEGER NOT NULL DEFAULT 0,
        isPinned INTEGER NOT NULL DEFAULT 0,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        coverImageAssetId INTEGER,
        coverBlurEnabled INTEGER,
        coverBlurRadius INTEGER,
        deletedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE groups (
        id INTEGER PRIMARY KEY,
        ipId INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        isPinned INTEGER NOT NULL DEFAULT 0,
        coverImageAssetId INTEGER,
        description TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE image_assets (
        id INTEGER PRIMARY KEY,
        ipId INTEGER NOT NULL,
        importBatchId INTEGER,
        sourceOrder INTEGER,
        groupId INTEGER,
        mediaType TEXT NOT NULL DEFAULT 'image',
        originalFileUri TEXT NOT NULL DEFAULT '',
        thumbnailFileUri TEXT,
        coverThumbnailFileUri TEXT,
        originalFilename TEXT NOT NULL DEFAULT 'asset.jpg',
        internalFilename TEXT NOT NULL DEFAULT 'asset.jpg',
        width INTEGER NOT NULL DEFAULT 100,
        height INTEGER NOT NULL DEFAULT 100,
        durationMs INTEGER,
        mimeType TEXT NOT NULL DEFAULT 'image/jpeg',
        fileSize INTEGER NOT NULL DEFAULT 1024,
        isFavorite INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        deletedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastViewedAt TEXT,
        lastPlaybackPositionMs INTEGER,
        previewStatus TEXT NOT NULL DEFAULT 'ready',
        contentHash TEXT,
        visualHash TEXT
      );
      CREATE TABLE image_groups (
        imageAssetId INTEGER NOT NULL,
        groupId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (imageAssetId, groupId)
      );
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE image_tags (
        imageAssetId INTEGER NOT NULL,
        tagId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (imageAssetId, tagId)
      );
    `);
  }

  async getAllAsync(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  async getFirstAsync(sql, ...params) {
    return this.db.prepare(sql).get(...params) ?? null;
  }

  async runAsync(sql, ...params) {
    return this.db.prepare(sql).run(...params);
  }

  async withTransactionAsync(action) {
    this.db.exec('BEGIN');
    try {
      await action();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

test('groupRepository separates imageCount and videoCount, sorts by total assets, and supports video covers with non-null fallback', async () => {
  const db = new RepositoryTestDatabase();
  try {
    db.db.exec(`
      INSERT INTO ips (id, name, createdAt, updatedAt)
      VALUES (1, '测试 IP', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');

      INSERT INTO groups (id, ipId, name, type, sortOrder, isPinned, createdAt, updatedAt)
      VALUES
        (1, 1, '纯视频组', 'custom', 0, 0, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'),
        (2, 1, '混合组', 'custom', 0, 0, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'),
        (3, 1, '空组', 'custom', 0, 0, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');

      INSERT INTO image_assets (
        id, ipId, groupId, mediaType, originalFileUri, thumbnailFileUri, coverThumbnailFileUri,
        originalFilename, internalFilename, fileSize, isFavorite, deletedAt, createdAt, updatedAt, lastViewedAt
      )
      VALUES
        (1, 1, 1, 'video', 'file:///v1.mp4', 'file:///v1_cover.jpg', 'file:///v1_cover.jpg', 'v1.mp4', 'v1.mp4', 100, 1, NULL, '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
        (2, 1, 1, 'video', 'file:///v2.mp4', 'file:///v2_cover.jpg', 'file:///v2_cover.jpg', 'v2.mp4', 'v2.mp4', 200, 0, NULL, '2026-11-03T00:00:00.000Z', '2026-11-03T00:00:00.000Z', NULL),
        (3, 1, 1, 'video', 'file:///v3.mp4', NULL, NULL, 'v3.mp4', 'v3.mp4', 300, 0, NULL, '2026-11-04T00:00:00.000Z', '2026-11-04T00:00:00.000Z', NULL),
        (4, 1, 2, 'image', 'file:///i1.jpg', 'file:///i1_thumb.jpg', NULL, 'i1.jpg', 'i1.jpg', 50, 1, NULL, '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
        (5, 1, 2, 'video', 'file:///v4.mp4', 'file:///v4_cover.jpg', 'file:///v4_cover.jpg', 'v4.mp4', 'v4.mp4', 150, 0, NULL, '2026-11-05T00:00:00.000Z', '2026-11-05T00:00:00.000Z', NULL),
        (6, 1, 2, 'video', 'file:///v_deleted.mp4', 'file:///v_deleted.jpg', 'file:///v_deleted.jpg', 'v_deleted.mp4', 'v_deleted.mp4', 120, 0, '2026-11-06T00:00:00.000Z', '2026-11-01T00:00:00.000Z', '2026-11-06T00:00:00.000Z', NULL);

      INSERT INTO image_groups (imageAssetId, groupId, createdAt)
      VALUES
        (1, 1, '2026-11-02T00:00:00.000Z'),
        (2, 1, '2026-11-03T00:00:00.000Z'),
        (3, 1, '2026-11-04T00:00:00.000Z'),
        (4, 2, '2026-11-02T00:00:00.000Z'),
        (5, 2, '2026-11-05T00:00:00.000Z'),
        (6, 2, '2026-11-01T00:00:00.000Z');
    `);

    const overview = await groupRepository.findOverviewByIpId(db, 1);
    assert.deepEqual(overview.map((g) => g.id), [1, 2, 3]);

    const videoGroup = overview[0];
    assert.equal(videoGroup.imageCount, 0);
    assert.equal(videoGroup.videoCount, 3);
    assert.equal(videoGroup.coverSource, 'default');
    // 最新视频(id=3)缩略图为 NULL 时应回退到有缩略图的视频(id=2)
    assert.equal(videoGroup.coverThumbnailFileUri, 'file:///v2_cover.jpg');

    const mixedGroup = overview[1];
    assert.equal(mixedGroup.imageCount, 1);
    assert.equal(mixedGroup.videoCount, 1);
    assert.equal(mixedGroup.coverThumbnailFileUri, 'file:///v4_cover.jpg');

    const emptyGroup = overview[2];
    assert.equal(emptyGroup.imageCount, 0);
    assert.equal(emptyGroup.videoCount, 0);
    assert.equal(emptyGroup.coverThumbnailFileUri, null);

    // 手动选择组内视频(id=1)作为自定义分组封面
    await groupRepository.setCoverImage(db, 1, 1);
    const pageAfterCover = await groupRepository.findOverviewPage(db, { ipId: 1, limit: 10, offset: 0 });
    const updatedVideoGroup = pageAfterCover.items.find((g) => g.id === 1);
    assert.equal(updatedVideoGroup.coverSource, 'custom');
    assert.equal(updatedVideoGroup.coverThumbnailFileUri, 'file:///v1_cover.jpg');

    // 搜索同样返回分类型计数与视频封面
    const searchResult = await groupRepository.findOverviewSearch(db, '纯视频', 10);
    assert.equal(searchResult.items[0].videoCount, 3);
    assert.equal(searchResult.items[0].coverThumbnailFileUri, 'file:///v1_cover.jpg');

    // IP 默认封面同样跳过无缩略图的视频，回退到有封面的视频
    const ipPage = await ipRepository.findLibraryItemsPage(db, { limit: 10, offset: 0 });
    assert.equal(ipPage.items[0].coverThumbnailFileUri, 'file:///v4_cover.jpg');
  } finally {
    db.close();
  }
});

test('imageRepository counts favorites, trash, recent viewed, and organizing progress across both images and videos', async () => {
  const db = new RepositoryTestDatabase();
  try {
    db.db.exec(`
      INSERT INTO ips (id, name, createdAt, updatedAt)
      VALUES (1, 'IP', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');
      INSERT INTO groups (id, ipId, name, type, createdAt, updatedAt)
      VALUES (10, 1, 'G1', 'custom', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');
      INSERT INTO tags (id, name, createdAt, updatedAt)
      VALUES (1, 'tagA', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');

      INSERT INTO image_assets (
        id, ipId, groupId, mediaType, thumbnailFileUri, isFavorite, deletedAt, createdAt, updatedAt, lastViewedAt
      )
      VALUES
        (1, 1, 10, 'image', 'file:///1.jpg', 1, NULL, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'),
        (2, 1, NULL, 'video', 'file:///2.jpg', 1, NULL, '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z'),
        (3, 1, NULL, 'image', 'file:///3.jpg', 0, '2026-11-03T00:00:00.000Z', '2026-11-01T00:00:00.000Z', '2026-11-03T00:00:00.000Z', NULL),
        (4, 1, NULL, 'video', 'file:///4.jpg', 0, '2026-11-04T00:00:00.000Z', '2026-11-01T00:00:00.000Z', '2026-11-04T00:00:00.000Z', NULL);

      INSERT INTO image_groups (imageAssetId, groupId, createdAt) VALUES (1, 10, '2026-11-01T00:00:00.000Z');
      INSERT INTO image_tags (imageAssetId, tagId, createdAt) VALUES (1, 1, '2026-11-01T00:00:00.000Z');
    `);

    assert.equal(await imageRepository.countFavorites(db), 2);
    assert.equal(await imageRepository.countDeleted(db), 2);
    assert.equal(await imageRepository.countRecentViewed(db), 2);
    assert.equal(await imageRepository.countNeedsOrganizing(db), 1);
    assert.equal(await imageRepository.countNeedsOrganizing(db, 1), 1);

    const queue = await imageRepository.findNeedsOrganizing(db, { ipId: 1 });
    assert.deepEqual(queue.map((item) => item.id), [2]);
    assert.equal(queue[0].mediaType, 'video');

    const progress = await imageRepository.getOrganizationProgress(db, 1);
    assert.equal(progress.totalCount, 2);
    assert.equal(progress.organizedCount, 1);
    assert.equal(progress.ungroupedCount, 1);
    assert.equal(progress.untaggedCount, 1);
    assert.equal(progress.organizationPercent, 50);
  } finally {
    db.close();
  }
});

test('UI cards and pickers enforce minimal MediaCountMeta rules, hero timestamp fix, and video openness', () => {
  const mediaCountMeta = readProjectFile('src/components/MediaCountMeta.tsx');
  const thumbnailTile = readProjectFile('src/components/ThumbnailTile.tsx');
  const ipCard = readProjectFile('src/components/IPCard.tsx');
  const globalGroups = readProjectFile('src/screens/GlobalGroupsScreen.tsx');
  const groupOverview = readProjectFile('src/screens/GroupOverviewScreen.tsx');
  const ipDetail = readProjectFile('src/screens/IpDetailScreen.tsx');
  const globalSearch = readProjectFile('src/screens/GlobalSearchScreen.tsx');
  const groupCoverPicker = readProjectFile('src/screens/GroupCoverPickerScreen.tsx');
  const ipCoverPicker = readProjectFile('src/screens/IpCoverPickerScreen.tsx');
  const importResult = readProjectFile('src/screens/ImportResultScreen.tsx');
  const archiveReader = readProjectFile('src/screens/ArchiveReaderScreen.tsx');
  const quickOrganize = readProjectFile('src/screens/QuickOrganizeScreen.tsx');
  const appSource = readProjectFile('App.tsx');

  // MediaCountMeta 只渲染大于 0 的图标与数字，无多余量词，并具备无障碍摘要与 memo
  const mediaCountMetaJsx = mediaCountMeta.slice(mediaCountMeta.indexOf('return ('));
  assert.match(mediaCountMeta, /export const MediaCountMeta = memo\(/);
  assert.match(mediaCountMeta, /accessibilityLabel=\{accessibilityParts\.join\('，'\)\}/);
  assert.match(mediaCountMeta, /if \(safeImageCount === 0 && safeVideoCount === 0\) \{\s*return null;\s*\}/);
  assert.doesNotMatch(mediaCountMetaJsx, /张|个|图|项/);

  // ThumbnailTile 原生兼容 coverThumbnailFileUri ?? thumbnailFileUri
  assert.match(thumbnailTile, /const previewUri = image\.coverThumbnailFileUri \?\? image\.thumbnailFileUri;/);

  // 第一张卡片(hero)保留原始计数文案不变，但修复硬编码的“刚更新”
  assert.match(ipCard, /<Text style=\{styles\.heroMetaText\}>\{ip\.imageCount\} 张图片<\/Text>/);
  assert.match(ipCard, /<Text style=\{styles\.heroMetaText\}>\{ip\.videoCount\} 个视频<\/Text>/);
  assert.match(ipCard, /<Text style=\{styles\.heroMetaTime\}>\{formatUpdatedLabel\(ip\.updatedAt\)\}<\/Text>/);
  assert.doesNotMatch(ipCard, />刚更新</);

  // 第 2/3 张(standard)与第 4+ 张(grid)统一复用 MediaCountMeta，去除“图”字冗余，并保留无死样式
  assert.equal((ipCard.match(/<MediaCountMeta/g) ?? []).length, 2);
  assert.doesNotMatch(ipCard, /ip\.imageCount\} 图/);
  assert.doesNotMatch(ipCard, /stdMetaItem:/);

  // 分组页、详情页抽屉、搜索页复用 MediaCountMeta 并使用弹性换行布局
  assert.match(globalGroups, /<MediaCountMeta/);
  assert.doesNotMatch(globalGroups, /张图片/);
  assert.match(globalGroups, /flexWrap:\s*'wrap'/);
  assert.match(groupOverview, /<MediaCountMeta/);
  assert.doesNotMatch(groupOverview, /张图片/);
  assert.match(ipDetail, /<MediaCountMeta/);
  assert.match(ipDetail, /\(b\.imageCount \+ b\.videoCount\) - \(a\.imageCount \+ a\.videoCount\)/);
  assert.match(globalSearch, /<MediaCountMeta[\s\S]{0,320}videoCount=\{item\.videoCount\}/);

  // 封面选择与导入结果页开放全部媒体类型，且封面选择具备防连点提交锁
  assert.match(groupCoverPicker, /findByGroupId\(db,\s*groupId,\s*\{\s*mediaType:\s*'all'\s*\}/);
  assert.match(groupCoverPicker, /submittingRef\.current/);
  assert.match(ipCoverPicker, /findByIpId\(db,\s*ipId,\s*\{\s*mediaType:\s*'all'\s*\}/);
  assert.match(ipCoverPicker, /submittingRef\.current/);
  assert.match(importResult, /findByIds\(db,\s*imageIds,\s*\{\s*mediaType:\s*'all'\s*\}/);
  assert.match(archiveReader, /ip\.imageCount \+ \(ip\.videoCount \?\? 0\)/);

  // 待整理支持视频角标与视频播放器路由跳转
  assert.match(quickOrganize, /onOpenImageDetail\?: \(imageId: number, context\?: ImageViewerContext\) => void/);
  assert.match(quickOrganize, /current\.mediaType === 'video' && onOpenImageDetail/);
  assert.match(appSource, /<QuickOrganizeScreen[\s\S]{0,400}onOpenImageDetail=\{openImageDetail\}/);
});
