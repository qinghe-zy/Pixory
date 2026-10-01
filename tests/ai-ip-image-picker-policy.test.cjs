const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AiComposerAttachmentBar renders images and documents as horizontal scrolling grid with top-right remove icon', () => {
  const attachmentBar = read('src/components/ai/AiComposerAttachmentBar.tsx');

  // Must render horizontal ScrollView
  assert.match(attachmentBar, /<ScrollView[\s\S]*?horizontal/);
  assert.match(attachmentBar, /showsHorizontalScrollIndicator=\{false\}/);

  // Must render tiles as square grid (56x56)
  assert.match(attachmentBar, /tileWrap:\s*\{/);
  assert.match(attachmentBar, /height:\s*56/);
  assert.match(attachmentBar, /width:\s*56/);

  // Documents must be rendered as grid tiles with icon and document name
  assert.match(attachmentBar, /name="document-text"/);
  assert.match(attachmentBar, /documentTileName/);
  assert.match(attachmentBar, /attachment\.name/);

  // Must have small remove button in top-right corner with close icon
  assert.match(attachmentBar, /imageRemoveButton:\s*\{[\s\S]*?position:\s*'absolute'[\s\S]*?right:\s*3[\s\S]*?top:\s*3/);
  assert.match(attachmentBar, /name="close"/);
});

test('AiIpImagePickerPanel renders 2-row scrollable grid matching ImportImagesScreen and supports multi-select', () => {
  const ipPicker = read('src/components/ai/AiIpImagePickerPanel.tsx');

  // Must query imageRepository for the IP
  assert.match(ipPicker, /imageRepository\.findByIpId/);

  // Must match 2-row scrollable grid style from ImportImagesScreen
  assert.match(ipPicker, /previewScroll:\s*\{[\s\S]*?maxHeight:\s*176/);
  assert.match(ipPicker, /previewRow:\s*\{[\s\S]*?flexDirection:\s*'row'[\s\S]*?flexWrap:\s*'wrap'[\s\S]*?gap:\s*4/);
  assert.match(ipPicker, /previewCard:\s*\{[\s\S]*?aspectRatio:\s*1\.5[\s\S]*?width:\s*'32\.2%'/);

  // Must support toggle on press and multi-select indication
  assert.match(ipPicker, /accessibilityRole="checkbox"/);
  assert.match(ipPicker, /onToggleImage/);
  assert.match(ipPicker, /checkBadgeSelected/);
  assert.match(ipPicker, /name="checkmark"/);
});

test('AiChatComposer includes 从IP选择图片 option when hasBoundIp and onSelectIpImages are set', () => {
  const composer = read('src/components/ai/AiChatComposer.tsx');

  assert.match(composer, /hasBoundIp\?: boolean/);
  assert.match(composer, /onSelectIpImages\?: \(\) => void/);
  assert.match(composer, /从IP选择图片/);
  assert.match(composer, /name="albums-outline"/);
  assert.match(composer, /AiComposerAttachmentBar/);
});

test('AiChatScreen passes IP image picker props and connects selection toggle with composer attachments', () => {
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.match(chat, /AiIpImagePickerPanel/);
  assert.match(chat, /effectiveIpId/);
  assert.match(chat, /handleToggleIpImage/);
  assert.match(chat, /hasBoundIp=\{Boolean\(effectiveIpId\)\}/);
  assert.match(chat, /onSelectIpImages/);
});
