const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const home = () => fs.readFileSync(path.join(root, 'src/screens/AiHomeScreen.tsx'), 'utf8');
const chat = () => fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');

test('AI routes are registered for workbench, chat, settings, history, materials, and readers', () => {
  for (const route of [
    'ai-chat',
    'ai-session-config',
    'ai-provider-settings',
    'ai-ip-picker',
    'ai-knowledge-base',
    'ai-material-import',
    'ai-material-list',
    'ai-document-reader',
    'ai-history',
  ]) {
    assert.match(app, new RegExp(route));
  }
});

test('AI workbench exposes the three first-version starts and no disconnected default warning', () => {
  const content = home();
  assert.match(content, /开始普通聊天/);
  assert.match(content, /问问某个 IP/);
  assert.match(content, /连接知识库/);
  assert.doesNotMatch(content, /当前未连接知识库/);
});

test('AI chat screen exposes context title, settings, streaming, thinking, and citations', () => {
  const content = chat();
  for (const expected of ['contextTitle', '会话设置', 'stream', 'thinking', 'citations']) {
    assert.match(content, new RegExp(expected));
  }
});

test('AI history supports long-press batch delete and private-space moves', () => {
  const history = fs.readFileSync(path.join(root, 'src/screens/AiHistoryScreen.tsx'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const repository = fs.readFileSync(path.join(root, 'src/database/repositories/aiThreadRepository.ts'), 'utf8');

  for (const expected of ['onLongPress', 'selectedIds', 'deleteAiThreads', 'moveAiThreadsBetweenSpaces', 'personalPassword']) {
    assert.match(history, new RegExp(expected));
  }
  assert.match(service, /verifyPersonalPassword/);
  assert.match(repository, /exportThread/);
  assert.match(repository, /importThread/);
  assert.match(repository, /deleteThreads/);
});
