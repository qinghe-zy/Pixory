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

test('paged entry pages share request invalidation and debounce tag search', () => {
  const home = read('src/screens/HomeLibraryScreen.tsx');
  const globalGroups = read('src/screens/GlobalGroupsScreen.tsx');
  const groupOverview = read('src/screens/GroupOverviewScreen.tsx');
  const tags = read('src/screens/TagsOverviewScreen.tsx');

  for (const source of [home, globalGroups, groupOverview, tags]) {
    assert.match(source, /usePagedScreenLoad/);
    assert.doesNotMatch(source, /const \[isLoadingMore, setIsLoadingMore\] = useState/);
  }

  assert.match(tags, /debouncedSearchText/);
  assert.match(tags, /setTimeout\(\(\) => setDebouncedSearchText\(searchText\), 250\)/);
  assert.match(tags, /ListHeaderComponent=/);
  assert.match(tags, /recentTags\.map/);
  assert.match(tags, /popularTags\.map/);
});

test('paged request gate exists to reject stale space and refresh results', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/hooks/pagedRequestGate.ts')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/hooks/usePagedScreenLoad.ts')), true);
  const hook = read('src/hooks/usePagedScreenLoad.ts');
  assert.match(hook, /dataRef\.current = resetData/);
});

test('IP detail uses the repository-level group preview limit', () => {
  const detail = read('src/screens/IpDetailScreen.tsx');
  assert.match(detail, /findOverviewPreviewByIpId\(db, ipId, 4\)/);
  assert.doesNotMatch(detail, /groups\.slice\(0, 4\)/);
});

test('global search pushes every category filter into bounded SQL queries', () => {
  const search = read('src/screens/GlobalSearchScreen.tsx');
  assert.match(search, /findLibraryItemsPage/);
  assert.match(search, /findOverviewSearch/);
  assert.match(search, /findUsageOverviewPage/);
  assert.match(search, /findFilteredPage/);
  assert.match(search, /resultKey/);
  assert.doesNotMatch(search, /allGroups\.filter/);
  assert.doesNotMatch(search, /allTags\.filter/);
});

test('shared screen loader invalidates older dependency results', () => {
  const hook = read('src/hooks/useScreenLoad.ts');
  assert.match(hook, /createPagedRequestGate/);
  assert.match(hook, /isCurrent\(request\)/);
});
