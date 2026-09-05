const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('AboutScreen keeps story intro separate and renders journal chapter state', () => {
  const source = read('src/screens/AboutScreen.tsx');
  assert.match(source, /故事开始/);
  assert.match(source, /岁月有声/);
  assert.match(source, /expandedCategoryIds/);
  assert.match(source, /openAchievementId/);
  assert.match(source, /markJournalAchievementRead/);
});

test('journal achievement rows avoid decorative media and reserve the route column', () => {
  const source = read('src/components/about/JournalAchievementRow.tsx');
  assert.doesNotMatch(source, /🖼️|💬|Image|thumbnail/);
  assert.match(source, /achievementRowAction/);
  assert.match(source, /arrow-right/);
  assert.match(source, /achievementRowDate/);
});

test('AboutScreen keeps the back affordance outside the scroll content', () => {
  const source = read('src/screens/AboutScreen.tsx');
  const scaffoldIndex = source.indexOf('<ScreenScaffold');
  const scrollContentIndex = source.indexOf('<View style={styles.container}>');
  const backPropIndex = source.indexOf('onBack={onBack}', scaffoldIndex);
  assert.ok(scaffoldIndex >= 0);
  assert.ok(scrollContentIndex >= 0);
  assert.ok(backPropIndex > scaffoldIndex && backPropIndex < scrollContentIndex);
});
