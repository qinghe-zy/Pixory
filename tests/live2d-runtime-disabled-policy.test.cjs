const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Live2D has no chat or session-settings runtime entry point', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');

  for (const source of [chat, sessionConfig]) {
    assert.doesNotMatch(source, /Live2DPetView|Live2DPetManagerModal|PET_MODELS/);
    assert.doesNotMatch(source, /GLOBAL_PET_|LIVE2D_MODEL_CHANGED/);
  }
  assert.doesNotMatch(chat, /petPan|petScale|resetIdleTimer|petPanResponder|scalePanResponder/);
});
