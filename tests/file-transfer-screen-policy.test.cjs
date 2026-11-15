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
  assert.ok(/\n\s+inverted\r?\n/.test(screen));
  assert.equal(screen.includes('inverted={invertedItems.length > 0}'), false);
  assert.equal(/messageScrollContent:\s*\{[^}]*\bgap:/s.test(screen), false);
  assert.ok(screen.includes('resolveAttachmentKind(asset.mimeType, resolvedName, asset.uri, {'));
  assert.match(screen, /resolveAttachmentKind\([\s\S]{0,120}includeSvg:\s*true/);
  assert.equal(screen.includes('maintainVisibleContentPosition'), false);
  assert.ok(screen.includes('chevron-back'));
  assert.ok(screen.includes('loadingEarlier'));
  assert.ok(screen.includes('appendPickedAttachments'));
  assert.ok(screen.includes('pendingAttachmentsRef'));
  assert.equal(screen.includes('longPressIncludesAttachments'), false);
  assert.equal(screen.includes('updateFileTransferMessageText'), false);
  assert.ok(screen.includes('FILE_TRANSFER_ASSISTANT_AVATAR'));
  assert.ok(screen.includes('SYSTEM_BADGE_BACKGROUND'));
  assert.ok(screen.includes('styles.headerTextBtn'));
  assert.ok(screen.includes('activeSpaceRef'));
  assert.ok(screen.includes('deletedSendTokensRef'));
  assert.ok(screen.includes('buildFileTransferFavoriteKey'));
  assert.equal(screen.includes('|main|'), false);
  assert.ok(screen.includes("setPreviewImageUri(null)"));
  assert.ok(screen.includes("setDocViewerState(null)"));
  assert.ok(screen.includes("setComposerText('')"));
  assert.ok(screen.includes("pointerEvents={isMultiSelectMode ? 'none' : 'auto'}"));
  assert.equal(screen.includes('AiMessageContextMenu'), false);
  assert.equal(screen.includes('setClippingEnabled'), false);
  assert.equal(screen.includes('FileTransferDrawer'), false);
  assert.equal(screen.includes('AiComprehensiveRecordDrawer'), false);
  assert.equal(screen.includes("AppState.addEventListener('change'"), false);
  assert.equal(screen.includes('ToastAndroidShow'), false);
  const footerIdx = screen.indexOf('ListFooterComponent=');
  const errorBannerIdx = screen.indexOf('<AiChatErrorBanner');
  assert.ok(footerIdx > 0 && errorBannerIdx > 0 && errorBannerIdx < footerIdx);
});

test('fileTransferService enforces transactional sequential SQLite writes, ownership, and safe storage cleanup', () => {
  const service = read('src/ai/fileTransferService.ts');
  assert.ok(service.includes('copyAttachmentToThreadStorage'));
  assert.ok(service.includes('runWithTransactionRetry'));
  assert.ok(service.includes('findMessageById'));
  assert.ok(service.includes('decodeURIComponent(segment)'));
  assert.ok(service.includes("decodedSegment !== '..'"));
  assert.ok(service.includes('toFileTransferUserErrorMessage'));
  assert.equal(service.includes('Promise.all'), false);
});

test('db.ts ensures database access stability without non-reentrant queues', () => {
  const db = read('src/database/db.ts');
  assert.ok(db.includes('export async function runWithDatabaseSpace'));
  assert.ok(db.includes('export async function runWithTransactionRetry'));
});

test('FileTransferScreen pickDocuments classifies image files as kind:image, not kind:document', () => {
  const screen = read('src/screens/FileTransferScreen.tsx');
  const kindHelper = read('src/utils/attachmentKind.ts');
  // resolveAttachmentKind helper must be shared from attachmentKind utility
  assert.ok(screen.includes('resolveAttachmentKind'));
  assert.ok(kindHelper.includes("mime.startsWith('image/')"));
  // pickDocuments must use resolveAttachmentKind, not hardcode 'document'
  assert.ok(screen.includes('resolveAttachmentKind(asset.mimeType'));
  // handleDeleteMessages must await DB delete before commitMessages (fix concurrent effect)
  const deleteBlock = screen.slice(screen.indexOf('handleDeleteMessages'), screen.indexOf('handleBatchDeleteSelected'));
  const awaitIdx = deleteBlock.indexOf('await deleteFileTransferMessages');
  const commitIdx = deleteBlock.indexOf('commitMessages((current) => current.filter');
  assert.ok(awaitIdx >= 0 && commitIdx >= 0 && awaitIdx < commitIdx,
    'deleteFileTransferMessages must be awaited before commitMessages filter');
});

test('Android native media copy validates source schemes and removes partial destination files on failure', () => {
  const appNative = read('android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');
  const pluginNative = read('plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt');
  for (const source of [appNative, pluginNative]) {
    assert.ok(source.includes('Unsupported source URI scheme.'));
    assert.ok(source.includes('if (destination.exists()) {\n          destination.delete()\n        }') || source.includes('if (destination.exists()) {\r\n          destination.delete()\r\n        }'));
  }
});

test('App.tsx routes FILE_TRANSFER_THREAD_ID to dedicated file-transfer route', () => {
  const app = read('App.tsx');
  assert.ok(app.includes("name: 'file-transfer'"));
  assert.ok(app.includes("currentRoute.name === 'file-transfer'"));
  assert.ok(app.includes('<FileTransferScreen'));
  assert.ok(app.includes('route.threadId === FILE_TRANSFER_THREAD_ID'));
  assert.ok(
    app.includes("isFocused={isTop && (currentRoute.space !== 'personal' || personalSessionState === 'unlocked')}"),
    'FileTransferScreen isFocused must stay false while personal space is locked',
  );
});

test('FileTransferScreen enforces managed attachment URI containment, composer retention, and post-delete multi-select clear', () => {
  const screen = read('src/screens/FileTransferScreen.tsx');
  assert.ok(screen.includes('isManagedThreadAttachmentUri'), 'must import/use isManagedThreadAttachmentUri');
  assert.ok(screen.includes('assertManagedUriOrNotify'), 'must guard attachment access with assertManagedUriOrNotify');
  assert.ok(screen.includes('bottomFooterContainer'), 'must keep composer mounted in bottomFooterContainer');
  assert.ok(screen.includes('multiSelectActionBarOverlay'), 'must overlay multi-select bar instead of unmounting composer');
  assert.ok(screen.includes('errorRetryKind'), 'must track retry kind for recoverable error banner actions');
  assert.ok(screen.includes('composerClearSignal'), 'must pass composerClearSignal to clear composer deterministically');

  const batchDeleteStart = screen.indexOf('const handleBatchDeleteSelected');
  const batchDeleteEnd = screen.indexOf('const handleBatchFavoriteSelected');
  assert.ok(batchDeleteStart >= 0 && batchDeleteEnd > batchDeleteStart);
  const batchDeleteBlock = screen.slice(batchDeleteStart, batchDeleteEnd);
  assert.ok(batchDeleteBlock.includes('handleDeleteMessages(ids)'), 'batch delete must invoke handleDeleteMessages(ids)');
  assert.ok(
    batchDeleteBlock.includes('.then((deleted) =>') &&
      batchDeleteBlock.includes('if (deleted') &&
      batchDeleteBlock.includes('setIsMultiSelectMode(false)') &&
      batchDeleteBlock.includes('setSelectedMessageIds(new Set())'),
    'multi-select must clear only after handleDeleteMessages succeeds',
  );
});

test('FileTransfer composer, attachment strip, and error banner enforce SecureImage, accessibility, and touch targets', () => {
  const attachmentBar = read('src/components/ai/AiComposerAttachmentBar.tsx');
  assert.ok(attachmentBar.includes('<SecureImage'), 'AiComposerAttachmentBar must render thumbnails via SecureImage');
  assert.ok(attachmentBar.includes('hitSlop={14}'), 'AiComposerAttachmentBar remove button must expand touch hit area');

  const errorBanner = read('src/components/ai/AiChatErrorBanner.tsx');
  assert.ok(errorBanner.includes('accessibilityRole="alert"'), 'AiChatErrorBanner must announce errors as alerts');
  assert.ok(errorBanner.includes('accessibilityLiveRegion="polite"'), 'AiChatErrorBanner must set polite live region');
  assert.ok(errorBanner.includes('metrics.minTouchSize'), 'AiChatErrorBanner actions must meet minimum touch target size');

  const composer = read('src/components/ai/AiChatComposer.tsx');
  assert.ok(composer.includes('clearSignal'), 'AiChatComposer must support deterministic clearSignal prop');
});
