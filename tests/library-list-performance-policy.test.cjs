const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('asset library entry pages use virtual lists and paged repository reads', () => {
  const home = read('src/screens/HomeLibraryScreen.tsx');
  const globalGroups = read('src/screens/GlobalGroupsScreen.tsx');
  const groupOverview = read('src/screens/GroupOverviewScreen.tsx');
  const tags = read('src/screens/TagsOverviewScreen.tsx');

  assert.match(home, /<FlatList/);
  assert.match(home, /findLibraryItemsPage/);
  assert.match(globalGroups, /<SectionList/);
  assert.match(globalGroups, /findOverviewPage/);
  assert.match(groupOverview, /<SectionList/);
  assert.match(tags, /<FlatList/);
  assert.match(tags, /findUsageOverviewPage/);
  assert.doesNotMatch(tags, /\[\.\.\.tags\]\.sort/);
});

test('IP detail uses the repository-level group preview limit', () => {
  const detail = read('src/screens/IpDetailScreen.tsx');
  assert.match(detail, /findOverviewPreviewByIpId\(db, ipId, 4\)/);
  assert.doesNotMatch(detail, /groups\.slice\(0, 4\)/);
});
