const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('companion cards can reuse the shared version stepper controls', () => {
  const stepperPath = path.join(root, 'src/components/ai/AiVersionStepper.tsx');
  const stepper = fs.existsSync(stepperPath) ? fs.readFileSync(stepperPath, 'utf8') : '';

  assert.match(stepper, /currentIndex[\s\S]*total/);
  assert.match(stepper, /chevron-back/);
  assert.match(stepper, /chevron-forward/);
  assert.match(read('src/components/ai/AiMessageBubble.tsx'), /AiVersionStepper/);
});

test('completed diary and dream cards expose the same long-press affordance as messages', () => {
  for (const source of [
    read('src/components/ai/DiaryChatCard.tsx'),
    read('src/components/ai/DreamChatCard.tsx'),
  ]) {
    assert.match(source, /delayLongPress=\{500\}/);
    assert.match(source, /event\.nativeEvent\.pageX/);
    assert.match(source, /event\.nativeEvent\.pageY/);
    assert.match(source, /AiVersionStepper/);
  }
});

test('only the current dream version can enter the companion prompt context', () => {
  const source = read('src/ai/companion/companionArtifactService.ts');

  assert.match(source, /dreams\.filter\(x=>x\.isCurrent===true&&x\.contextOptIn===true/);
});

test('chat artifact actions use the shared anchored menu and persist only thread-local hiding', () => {
  const source = read('src/screens/AiChatScreen.tsx');

  assert.match(source, /AiAnchoredContextMenu/);
  assert.match(source, /label: '从聊天中移除'/);
  assert.match(source, /companionArtifactChatStateRepository\.hide/);
  assert.match(source, /label: '重新生成'/);
  assert.doesNotMatch(source, /roleDiaries\.splice|roleDreams\.splice/);
});

test('inner life exposes every artifact version and permanently deletes selected current-tab entries', () => {
  const source = read('src/screens/CompanionInnerLifeScreen.tsx');

  assert.match(source, /listVersionGroupsForRole/);
  assert.match(source, /onLongPress=\{\(\) => enterSelection\(key\)\}/);
  assert.match(source, /diaryRepository\.permanentlyDeleteVersions/);
  assert.match(source, /dreamRepository\.permanentlyDeleteVersions/);
  assert.match(source, /thoughtRepository\.permanentlyDelete/);
  assert.match(source, /不会进入回收站/);
});
