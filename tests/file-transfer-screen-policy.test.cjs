const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

test('AiChatScreen is cleanly decoupled from File Transfer Assistant', () => {
  const aiChatScreen = read('src/screens/AiChatScreen.tsx');
  assert.equal(aiChatScreen.includes('FILE_TRANSFER_THREAD_ID'), false);
  assert.equal(aiChatScreen.includes('isFileTransfer'), false);
  assert.equal(aiChatScreen.includes('ensureFileTransferThread'), false);
  assert.equal(aiChatScreen.includes('FILE_TRANSFER_AVATAR'), false);
  assert.equal(aiChatScreen.includes('isSpecialSystemThread'), false);
});

test('FileTransferScreen avoids Android inverted FlatList clipping race and drawer coupling', () => {
  const screen = read('src/screens/FileTransferScreen.tsx');
  assert.ok(screen.includes('removeClippedSubviews={false}'));
  assert.ok(screen.includes('maintainVisibleContentPosition={FILE_TRANSFER_LIST_ANCHOR_CONFIG}'));
  assert.ok(screen.includes('chevron-back'));
  assert.ok(screen.includes('loadingEarlier'));
  assert.ok(screen.includes('appendPickedAttachments'));
  assert.ok(screen.includes('pendingAttachmentsRef'));
  assert.equal(screen.includes('setClippingEnabled'), false);
  assert.equal(screen.includes('FileTransferDrawer'), false);
  assert.equal(screen.includes('AiComprehensiveRecordDrawer'), false);
  assert.equal(screen.includes("AppState.addEventListener('change'"), false);
  assert.equal(screen.includes('ToastAndroidShow'), false);
});

test('fileTransferService enforces transactional sequential SQLite writes, ownership, and safe storage cleanup', () => {
  const service = read('src/ai/fileTransferService.ts');
  assert.ok(service.includes('copyAttachmentToThreadStorage'));
  assert.ok(service.includes('runWithTransactionRetry'));
  assert.ok(service.includes('findMessageById'));
  assert.ok(service.includes("uri.includes('..')"));
  assert.equal(service.includes('Promise.all'), false);
});

test('App.tsx routes FILE_TRANSFER_THREAD_ID to dedicated file-transfer route', () => {
  const app = read('App.tsx');
  assert.ok(app.includes("name: 'file-transfer'"));
  assert.ok(app.includes("currentRoute.name === 'file-transfer'"));
  assert.ok(app.includes('<FileTransferScreen'));
  assert.ok(app.includes('route.threadId === FILE_TRANSFER_THREAD_ID'));
});
