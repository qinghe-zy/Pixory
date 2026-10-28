const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('IM bubble renderers and registry policy verification', async (t) => {
  const beakPath = path.resolve(__dirname, '../src/im/components/common/ImBubbleBeak.tsx');
  const registryPath = path.resolve(__dirname, '../src/im/registry/bubbleRegistry.ts');
  const textBubblePath = path.resolve(__dirname, '../src/im/components/renderers/TextBubbleRenderer.tsx');
  const imageBubblePath = path.resolve(__dirname, '../src/im/components/renderers/ImageBubbleRenderer.tsx');
  const noticePath = path.resolve(__dirname, '../src/im/components/renderers/SystemNoticeRenderer.tsx');
  const diaryCardPath = path.resolve(__dirname, '../src/im/components/renderers/DiaryCardRenderer.tsx');

  const beakContent = fs.readFileSync(beakPath, 'utf8');
  const registryContent = fs.readFileSync(registryPath, 'utf8');
  const textBubbleContent = fs.readFileSync(textBubblePath, 'utf8');
  const imageBubbleContent = fs.readFileSync(imageBubblePath, 'utf8');
  const noticeContent = fs.readFileSync(noticePath, 'utf8');
  const diaryCardContent = fs.readFileSync(diaryCardPath, 'utf8');

  await t.test('ImBubbleBeak handles left/right directions and respects flags.showBeak', () => {
    assert.match(beakContent, /export function ImBubbleBeak/);
    assert.match(beakContent, /if \(!theme\.flags\.showBeak\)/);
    assert.match(beakContent, /borderRightColor:\s*fillColor/);
    assert.match(beakContent, /borderLeftColor:\s*fillColor/);
  });

  await t.test('bubbleRegistry registers text, image, system_notice, and diary_card as defaults', () => {
    assert.match(registryContent, /registry\.set\('text',\s*TextBubbleRenderer\)/);
    assert.match(registryContent, /registry\.set\('image',\s*ImageBubbleRenderer\)/);
    assert.match(registryContent, /registry\.set\('system_notice',\s*SystemNoticeRenderer\)/);
    assert.match(registryContent, /registry\.set\('diary_card',\s*DiaryCardRenderer\)/);
    assert.match(registryContent, /export const BubbleRegistry/);
  });

  await t.test('DiaryCardRenderer renders thumbnail card with theme letter asset and open callback', () => {
    assert.match(diaryCardContent, /export function DiaryCardRenderer/);
    assert.match(diaryCardContent, /imDiaryThemeAssets/);
    assert.match(diaryCardContent, /onOpenDiary/);
  });

  await t.test('TextBubbleRenderer formats [BR] and consumes all theme tokens without bubble drop shadow', () => {
    assert.match(textBubbleContent, /useImTheme\(\)/);
    assert.match(textBubbleContent, /replace\(\/\\\[BR\\\]\/g,\s*'\\n'\)/);
    assert.match(textBubbleContent, /ImBubbleBeak/);
    assert.match(textBubbleContent, /bubbleLeftBackground/);
    assert.match(textBubbleContent, /bubbleRightBackground/);
    assert.match(textBubbleContent, /avatarSize/);
    assert.match(textBubbleContent, /bubbleBox:\s*\{\s*elevation:\s*0\s*\}/);
  });

  await t.test('ImageBubbleRenderer renders image with avatar, IP badge and flat card', () => {
    assert.match(imageBubbleContent, /export function ImageBubbleRenderer/);
    assert.match(imageBubbleContent, /useImTheme\(\)/);
    assert.match(imageBubbleContent, /boundIpName/);
    assert.match(imageBubbleContent, /Image/);
    assert.match(imageBubbleContent, /onPressMessage/);
    assert.ok(!imageBubbleContent.includes('shadowOpacity: 0.08'), 'imageCard 不应包含阴影');
  });

  await t.test('SystemNoticeRenderer renders centered status and timestamp pills', () => {
    assert.match(noticeContent, /useImTheme\(\)/);
    assert.match(noticeContent, /systemNoticeBackground/);
    assert.match(noticeContent, /systemNoticeText/);
  });
});
