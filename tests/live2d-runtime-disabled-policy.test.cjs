const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function listSourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(entryPath));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

test('Live2D has no chat or session-settings runtime entry point', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');

  for (const source of [chat, sessionConfig]) {
    assert.doesNotMatch(source, /Live2DPetView|Live2DPetManagerModal|PET_MODELS/);
    assert.doesNotMatch(source, /GLOBAL_PET_|LIVE2D_MODEL_CHANGED/);
  }
  assert.doesNotMatch(chat, /petPan|petScale|resetIdleTimer|petPanResponder|scalePanResponder/);
});

test('Live2D references remain isolated to dormant source modules', () => {
  const allowed = new Set([
    path.join(root, 'src/components/ai/Live2DPetManagerModal.tsx'),
    path.join(root, 'src/components/ai/Live2DPetView.tsx'),
    path.join(root, 'src/config/petModels.ts'),
    path.join(root, 'src/services/live2dManagerService.ts'),
  ]);
  const unexpected = listSourceFiles(path.join(root, 'src')).filter((file) => (
    !allowed.has(file) && /Live2D|LIVE2D|GLOBAL_PET_|PET_MODELS|live2d/.test(fs.readFileSync(file, 'utf8'))
  ));

  assert.deepEqual(
    unexpected.map((file) => path.relative(root, file)),
    [],
  );
});
