const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('role detail uses avatar as a faded poster hero without changing role data', () => {
  const detail = read('src/screens/AiRoleCardDetailScreen.tsx');
  const roleService = read('src/ai/aiRoleCardService.ts');
  const repository = read('src/database/repositories/aiRoleCardRepository.ts');

  assert.match(detail, /ROLE_HERO_HEIGHT/);
  assert.match(detail, /styles\.heroPoster/);
  assert.match(detail, /styles\.heroImageLayer/);
  assert.match(detail, /styles\.heroFadeRight/);
  assert.match(detail, /styles\.heroFadeBottom/);
  assert.match(detail, /styles\.heroActionWrap/);
  assert.match(detail, /card\.avatarEnabled && card\.avatarUri/);
  assert.match(detail, /SecureImage[\s\S]{0,220}contentFit="cover"[\s\S]{0,220}style=\{styles\.heroImage\}/);
  assert.match(detail, /numberOfLines=\{4\} style=\{styles\.heroDescription\}/);
  assert.match(detail, /headerDividerVisible=\{false\}/);
  assert.match(detail, /contentContainerStyle=\{styles\.screenContent\}/);

  assert.match(roleService, /description: input\.description\?\.trim\(\) \|\| null/);
  assert.match(repository, /avatarUri/);
  assert.doesNotMatch(roleService, /heroImage|displayIntro|detailIntro/);
  assert.doesNotMatch(repository, /heroImage|displayIntro|detailIntro/);
});

test('role detail sections render dossier preview cards with icons and compact greeting previews', () => {
  const detail = read('src/screens/AiRoleCardDetailScreen.tsx');
  const section = read('src/components/ai/AiRoleDetailSection.tsx');
  const theme = read('src/components/ai/aiLightTheme.ts');

  assert.match(section, /iconName\?:/);
  assert.match(section, /variant\?: 'body' \| 'quote' \| 'list'/);
  assert.match(section, /footer\?: ReactNode/);
  assert.match(section, /styles\.iconBubble/);
  assert.match(section, /styles\.previewCard/);
  assert.match(section, /numberOfLines=\{expanded \? undefined : previewLines\}/);
  assert.match(section, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(section, /onPress=\{\(\) => setExpanded\(true\)\}/);
  assert.match(section, /name="chevron-forward"/);
  assert.match(section, /backgroundColor: aiLightColors\.coralSoft/);
  assert.match(section, /backgroundColor: aiLightColors\.cardWash/);
  assert.doesNotMatch(section, /#F4E2D4|rgba\(255, 250, 242/);

  assert.match(detail, /title="角色指令"[\s\S]{0,180}iconName="book-outline"/);
  assert.match(detail, /title="默认开场白"[\s\S]{0,180}iconName="chatbubble-ellipses-outline"/);
  assert.match(detail, /MORE_GREETING_PREVIEW_COUNT = 3/);
  assert.match(detail, /hasHiddenAlternateGreetings/);
  assert.match(detail, /title="更多开场白"[\s\S]{0,260}footer=\{hasHiddenAlternateGreetings \? moreGreetingsFooter : undefined\}/);
  assert.match(detail, /card\.alternateGreetings\.map/);
  assert.match(detail, /查看全部 \{card\.alternateGreetings\.length\} 条/);
  assert.match(detail, /aiLightDisplayFont/);
  assert.match(detail, /fontFamily: aiLightDisplayFont/);
  assert.doesNotMatch(detail, /fontFamily: 'serif'/);
  assert.match(detail, /Hero art-board constants/);
  assert.match(detail, /ROLE_HERO_TITLE_SIZE/);
  assert.match(detail, /ROLE_HERO_FADE_BOTTOM_HEIGHT/);
  assert.match(detail, /backgroundColor: aiLightColors\.coralSoft/);
  assert.doesNotMatch(detail, /#F4E2D4|rgba\(|fontSize: 48|height: 118/);
  assert.match(detail, /styles\.tagSection/);
  assert.match(detail, /styles\.tagChip/);

  assert.match(theme, /coralSoft:/);
  assert.match(theme, /cardWash:/);
});
