const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function logicHash(relativePath) {
  const source = read(relativePath);
  const styleStart = source.lastIndexOf('const styles = StyleSheet.create');
  return crypto.createHash('sha256').update(source.slice(0, styleStart)).digest('hex');
}

test('main chat UI changes preserve the existing composer and streaming logic', () => {
  assert.equal(
    logicHash('src/components/ai/AiChatComposer.tsx'),
    '9998d2f61f0fe1877239f28112f8f94e4d34642c6f9b505931b644648ceccdc0'
  );
  assert.equal(
    logicHash('src/screens/AiChatScreen.tsx'),
    '57e7d97bbee50bff645887e3d55e354e5a8590e9490084d730435735df8e35c4'
  );
});

test('AI canvas, title, and real composer use the approved floating visual treatment', () => {
  const theme = read('src/components/ai/aiLightTheme.ts');
  const scaffold = read('src/components/ai/AiLightScaffold.tsx');
  const composer = read('src/components/ai/AiChatComposer.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(theme, /canvas:\s*'#EDEDED'/);
  assert.match(theme, /posterBottomFade:\s*'rgba\(237,\s*237,\s*237,\s*0\.92\)'/);
  assert.match(theme, /posterRightFade:\s*'rgba\(237,\s*237,\s*237,\s*0\.82\)'/);
  assert.match(scaffold, /title:\s*\{[\s\S]*fontFamily:\s*typography\.family\.base[\s\S]*fontSize:\s*18[\s\S]*fontWeight:\s*'600'/);
  assert.match(composer, /composerShell:\s*\{[\s\S]*backgroundColor:\s*aiLightColors\.surface[\s\S]*borderWidth:\s*StyleSheet\.hairlineWidth[\s\S]*\.\.\.shadows\.sm/);
  assert.match(chat, /composerPanel:\s*\{[\s\S]*backgroundColor:\s*'transparent'/);
});

test('AI dialog and button styling is optional and default styling remains the default', () => {
  const dialog = read('src/components/AppDialog.tsx');
  const button = read('src/components/PrimaryButton.tsx');

  assert.match(dialog, /accent\?:\s*'default'\s*\|\s*'ai'/);
  assert.match(dialog, /accent\s*=\s*'default'/);
  assert.match(button, /tone\?:\s*ButtonTone/);
  assert.match(button, /tone\s*=\s*'default'/);
});

test('AI home removes duplicate material cards but keeps their route props intact', () => {
  const home = read('src/screens/AiHomeScreen.tsx');
  const quickGrid = /<View style=\{styles\.quickGrid\}>([\s\S]*?)<\/View>/.exec(home)?.[1] ?? '';

  assert.match(quickGrid, /选择 IP 开聊/);
  assert.match(quickGrid, /会话历史/);
  assert.doesNotMatch(quickGrid, /label="资料库"/);
  assert.doesNotMatch(quickGrid, /label="总资料库"/);
  assert.match(home, /onOpenKnowledgeBase:\s*\(\)\s*=>\s*void/);
  assert.match(home, /onOpenGlobalMaterials:\s*\(\)\s*=>\s*void/);
});

test('chat search uses static concise copy without adding group or scheduling behavior', () => {
  const search = read('src/screens/AiChatSearchScreen.tsx');

  assert.match(search, />查找聊天记录</);
  assert.match(search, />搜索聊天记录</);
  assert.match(search, />没有匹配结果</);
  assert.doesNotMatch(search, /aiVisibleWorkService|selectedParticipantId|群成员/);
});

test('About statistics render explanations in normal flow below a complete row', () => {
  const about = read('src/screens/AboutScreen.tsx');

  assert.match(about, /styles\.statRow/);
  assert.match(about, /styles\.statExplanation/);
  assert.doesNotMatch(about, /statTooltipText:\s*\{[\s\S]*position:\s*'absolute'/);
  assert.match(about, /setTimeout\(\(\)\s*=>\s*\{[\s\S]*setActiveStatIndex\(null\)[\s\S]*\},\s*5000\)/);
});

test('milestone detail uses the same continuous document canvas without decorative background', () => {
  const detail = read('src/screens/MilestonesDetailScreen.tsx');

  assert.match(detail, /const DOC_CANVAS = '#FAF9F5'/);
  assert.match(detail, /<AppScreen backgroundColor=\{DOC_CANVAS\}/);
  assert.doesNotMatch(detail, /backgroundVariant="detail"/);
});

test('Me removes the title block while retaining a safe-area headerless inset', () => {
  const scaffold = read('src/components/ScreenScaffold.tsx');
  const me = read('src/screens/MeScreen.tsx');

  assert.match(scaffold, /showHeader\?:\s*boolean/);
  assert.match(scaffold, /useSafeAreaInsets/);
  assert.match(scaffold, /showHeader\s*\?\s*\(/);
  assert.match(me, /showHeader=\{false\}/);
  assert.doesNotMatch(me, /title="我的"/);
});
