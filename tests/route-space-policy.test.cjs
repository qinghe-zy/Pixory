const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function routePattern(routeName, body) {
  return new RegExp(`\\|\\s*\\{\\s*name: '${routeName}';\\s*${body}\\s*\\}`);
}

test('every ID-bearing AppRoute carries PixorySpace as part of route identity', () => {
  const appSource = readProjectFile('App.tsx');

  const requiredRoutes = [
    ['create-ip', 'space: PixorySpace'],
    ['ip-detail', 'ipId: number; space: PixorySpace'],
    ['edit-ip', 'ipId: number; space: PixorySpace'],
    ['edit-group', 'ipId: number; groupId: number; space: PixorySpace'],
    ['edit-image', 'imageId: number; space: PixorySpace'],
    ['group-overview', 'ipId: number; space: PixorySpace'],
    ['create-group', 'ipId: number; space: PixorySpace'],
    ['group-images', 'ipId: number; groupId: number; space: PixorySpace'],
    ['import-images', 'ipId: number; groupId\\?: number \\| null; space: PixorySpace'],
    ['import-result', 'ipId: number; imageIds: number\\[\\]; importBatchId: number \\| null; space: PixorySpace'],
    ['import-batch-history', 'ipId: number; space: PixorySpace'],
    ['duplicate-review', 'ipId: number; importBatchId: number; space: PixorySpace'],
    ['all-images', 'ipId: number; space: PixorySpace'],
    ['image-viewer', 'imageId: number; space: PixorySpace; context: ImageViewerContext'],
    ['image-detail', 'imageId: number; space: PixorySpace; context\\?: ImageViewerContext'],
    ['move-image-group', 'imageId: number; space: PixorySpace'],
    ['tag-result', 'tagId: number; space: PixorySpace'],
    ['favorites', 'space: PixorySpace'],
    ['recent-viewed', 'space: PixorySpace'],
    ['quick-organize', 'ipId\\?: number; importBatchId\\?: number \\| null; space: PixorySpace'],
    ['global-search', 'query\\?: string; space: PixorySpace'],
    ['trash', 'space: PixorySpace'],
    ['backup', 'space: PixorySpace'],
  ];

  for (const [routeName, routeBody] of requiredRoutes) {
    assert.match(appSource, routePattern(routeName, routeBody), `${routeName} must include required space`);
  }

  assert.doesNotMatch(appSource, /space\?: PixorySpace/, 'space must not be optional on ID-bearing routes');
});

test('ImageViewerContext requires top-level space and exposes shared spaced helper types', () => {
  const contextSource = readProjectFile('src/navigation/imageViewerContext.ts');

  assert.match(contextSource, /import type \{ PixorySpace \} from '..\/database'/);
  assert.match(contextSource, /export type SpacedId = \{\s*id: number;\s*space: PixorySpace;\s*\}/);
  assert.match(contextSource, /export type SpacedRecord<T> = \{\s*space: PixorySpace;\s*record: T;\s*\}/);
  assert.match(contextSource, /type ImageViewerContextBase = \{\s*space: PixorySpace;\s*\}/);
  assert.match(contextSource, /ImageViewerContextBase & \{ type: 'ip-recent'/);
  assert.match(contextSource, /ImageViewerContextBase & \{ type: 'favorites' \}/);
  assert.match(contextSource, /ImageViewerContextBase & \{ type: 'recent-viewed' \}/);
});

test('viewer and image detail repository work runs inside the viewer context space', () => {
  const viewerSource = readProjectFile('src/screens/ImageViewerScreen.tsx');
  const detailSource = readProjectFile('src/screens/ImageDetailScreen.tsx');

  assert.match(viewerSource, /runWithDatabaseSpace/);
  assert.match(viewerSource, /runWithDatabaseSpace\(context\.space/);
  assert.match(viewerSource, /runWithDatabaseSpace\(context\.space[\s\S]{0,160}touchLastViewedAt/);

  assert.match(detailSource, /space\?: PixorySpace/);
  assert.match(detailSource, /const routeSpace = context\?\.space \?\? space/);
  assert.match(detailSource, /runWithDatabaseSpace\(routeSpace/);
  assert.match(detailSource, /runWithDatabaseSpace\(routeSpace[\s\S]{0,260}touchLastViewedAt/);
});

test('IP and group route screens apply route space to repository work', () => {
  const appSource = readProjectFile('App.tsx');
  const screenFiles = [
    'src/screens/IpDetailScreen.tsx',
    'src/screens/EditIpScreen.tsx',
    'src/screens/GroupOverviewScreen.tsx',
    'src/screens/CreateGroupScreen.tsx',
    'src/screens/EditGroupScreen.tsx',
    'src/screens/GroupImagesScreen.tsx',
    'src/screens/AllImagesScreen.tsx',
    'src/screens/BatchManageImagesScreen.tsx',
  ];

  for (const file of screenFiles) {
    const source = readProjectFile(file);
    assert.match(source, /space\?: PixorySpace/, `${file} must accept route space`);
    assert.match(source, /runWithDatabaseSpace\(space/, `${file} must run repository work in route space`);
  }

  for (const routeName of ['edit-ip', 'group-overview', 'create-group', 'edit-group', 'group-images', 'all-images', 'batch-manage-images']) {
    assert.match(appSource, new RegExp(`name: '${routeName}'[\\s\\S]{0,240}space: currentRoute\\.space`), `${routeName} route must pass currentRoute.space`);
  }

  const ipDetailSource = readProjectFile('src/screens/IpDetailScreen.tsx');
  assert.match(ipDetailSource, /runWithDatabaseSpace\(space[\s\S]{0,120}updatePinned/, 'IpDetail group pin action must write in route space');
});

test('image, batch, and library route screens apply route space to repository work', () => {
  const appSource = readProjectFile('App.tsx');
  const screenFiles = [
    'src/screens/EditImageScreen.tsx',
    'src/screens/MoveImageGroupScreen.tsx',
    'src/screens/ImportBatchHistoryScreen.tsx',
    'src/screens/ImportBatchReviewScreen.tsx',
    'src/screens/DuplicateReviewScreen.tsx',
    'src/screens/TagResultScreen.tsx',
    'src/screens/FavoritesScreen.tsx',
    'src/screens/RecentViewedScreen.tsx',
    'src/screens/QuickOrganizeScreen.tsx',
  ];

  for (const file of screenFiles) {
    const source = readProjectFile(file);
    assert.match(source, /space\?: PixorySpace/, `${file} must accept route space`);
    assert.match(source, /runWithDatabaseSpace\(space/, `${file} must run repository work in route space`);
  }

  for (const screenName of [
    'EditImageScreen',
    'MoveImageGroupScreen',
    'ImportBatchHistoryScreen',
    'ImportBatchReviewScreen',
    'DuplicateReviewScreen',
    'TagResultScreen',
    'FavoritesScreen',
    'RecentViewedScreen',
    'QuickOrganizeScreen',
  ]) {
    assert.match(appSource, new RegExp(`<${screenName}[\\s\\S]{0,900}space=\\{currentRoute\\.space\\}`), `${screenName} must receive currentRoute.space`);
  }
});

test('remaining global route screens receive route space and scope repository work', () => {
  const appSource = readProjectFile('App.tsx');
  const screenFiles = [
    'src/screens/CreateIpScreen.tsx',
    'src/screens/GlobalSearchScreen.tsx',
    'src/screens/TrashScreen.tsx',
    'src/screens/BackupScreen.tsx',
    'src/screens/GlobalGroupsScreen.tsx',
    'src/screens/TagsOverviewScreen.tsx',
  ];

  for (const file of screenFiles) {
    const source = readProjectFile(file);
    assert.match(source, /space\?: PixorySpace/, `${file} must accept route space`);
    assert.match(source, /runWithDatabaseSpace\(space/, `${file} must run repository work in route space`);
  }

  for (const screenName of ['CreateIpScreen', 'GlobalSearchScreen', 'TrashScreen', 'BackupScreen']) {
    assert.match(appSource, new RegExp(`<${screenName}[\\s\\S]{0,900}space=\\{currentRoute\\.space\\}`), `${screenName} must receive currentRoute.space`);
  }

  assert.match(appSource, /<GlobalGroupsScreen[\s\S]{0,900}space=\{activeSpace\}/, 'Groups tab must use the authenticated active space');
  assert.match(appSource, /<TagsOverviewScreen[\s\S]{0,900}space=\{activeSpace\}/, 'Tags tab must use the authenticated active space');
});
