const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadTsModule } = require('./helpers/loadTsModule.cjs');

const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

test('copyLocalFile tries FileSystem copyAsync and falls back to native stream only for Android content:// URIs', async () => {
  const copyAsyncCalls = [];
  const nativeStreamCalls = [];
  let shouldFailCopyAsync = false;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const fileStorage = loadTsModule('src/services/fileStorageService.ts', {
      'expo-file-system/legacy': {
        documentDirectory: 'file:///app/data/',
        copyAsync: async (args) => {
          copyAsyncCalls.push(args);
          if (shouldFailCopyAsync) {
            throw new Error('EACCES copyAsync blocked on URI');
          }
        },
      },
      '../native/pixoryMediaModule': {
        copyUriToFileWithProgress: async (src, dst) => {
          nativeStreamCalls.push({ src, dst });
        },
      },
    });

    shouldFailCopyAsync = true;
    await fileStorage.copyLocalFile(
      'content://com.android.providers.media.documents/document/image%3A42',
      'file:///app/data/pixory/ai_documents/thread_system_file_transfer/photo.jpg',
    );
    assert.equal(copyAsyncCalls.length, 1);
    assert.equal(nativeStreamCalls.length, 1);
    assert.deepEqual(nativeStreamCalls[0], {
      src: 'content://com.android.providers.media.documents/document/image%3A42',
      dst: 'file:///app/data/pixory/ai_documents/thread_system_file_transfer/photo.jpg',
    });

    shouldFailCopyAsync = false;
    await fileStorage.copyLocalFile(
      'file:///cache/DocumentPicker/test.pdf',
      'file:///app/data/pixory/ai_documents/thread_system_file_transfer/test.pdf',
    );
    assert.equal(nativeStreamCalls.length, 1);
    assert.equal(copyAsyncCalls.length, 2);
    assert.deepEqual(copyAsyncCalls[1], {
      from: 'file:///cache/DocumentPicker/test.pdf',
      to: 'file:///app/data/pixory/ai_documents/thread_system_file_transfer/test.pdf',
    });

    shouldFailCopyAsync = true;
    await assert.rejects(
      fileStorage.copyLocalFile(
        'file:///cache/DocumentPicker/broken.pdf',
        'file:///app/data/pixory/ai_documents/thread_system_file_transfer/broken.pdf',
      ),
      /EACCES copyAsync blocked on URI/,
    );
    assert.equal(nativeStreamCalls.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test('deleteFileTransferMessages removes selected records atomically and cleans only managed thread files', async () => {
  const deletedDbIds = [];
  const updatedThreads = [];
  const cleanedPaths = [];
  const fakeDb = {};

  const service = loadTsModule('src/ai/fileTransferService.ts', {
    '../database': {
      aiThreadRepository: {
        findMessageById: async (_db, id) => ({
          id,
          threadId: id === 'msg_foreign' ? 'other_thread' : 'pixory-file-transfer',
        }),
        listAttachmentsForMessages: async (_db, ownedIds) => ({
          ...(ownedIds.includes('msg_1')
            ? {
                msg_1: [
                  {
                    id: 'att_1',
                    kind: 'image',
                    name: 'a.jpg',
                    localUri: 'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/a.jpg',
                  },
                  {
                    id: 'att_unsafe',
                    kind: 'document',
                    name: 'escape.pdf',
                    localUri: 'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/../escape.pdf',
                  },
                  {
                    id: 'att_encoded_traversal',
                    kind: 'document',
                    name: 'secret.sqlite',
                    localUri: 'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/%2e%2e/%2e%2e/database/pixory.sqlite',
                  },
                ],
              }
            : {}),
          ...(ownedIds.includes('msg_2')
            ? {
                msg_2: [
                  {
                    id: 'att_2',
                    kind: 'document',
                    name: 'b.pdf',
                    localUri: 'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/b.pdf',
                  },
                ],
              }
            : {}),
        }),
        deleteMessagesByIds: async (_db, ids) => {
          deletedDbIds.push(...ids);
          return ids.length;
        },
        listMessages: async () => [{ id: 'msg_remaining', content: 'still here' }],
        listMessageAttachments: async () => [],
        updateThread: async (_db, threadId, patch) => {
          updatedThreads.push({ threadId, patch });
        },
      },
      runWithDatabaseSpace: async (_space, fn) => fn(fakeDb),
      runWithTransactionRetry: async (_db, fn) => fn(fakeDb),
      settingsRepository: { getProfileAvatarUri: async () => null, getProfileNickname: async () => null },
    },
    '../services/fileStorageService': {
      getAiDocumentsDir: () => 'file:///app/data/pixory/ai_documents/',
    },
    './aiChatService': {
      copyAttachmentToThreadStorage: async () => ({
        localUri: 'file:///unused',
        fileSize: 1,
        name: 'unused',
      }),
      ensureFileTransferThread: async () => {},
      loadThreadMessagePage: async () => ({ messages: [], hasEarlierMessages: false, olderCursor: null }),
      loadThreadMessagePageAroundAnchor: async () => ({ messages: [], hasEarlierMessages: false, olderCursor: null }),
    },
    './aiDocumentService': {
      cleanupDeletedMaterialFiles: async (paths) => {
        cleanedPaths.push(...paths);
      },
    },
  });

  await service.deleteFileTransferMessages('normal', ['msg_1', 'msg_2', 'msg_foreign', 'msg_1']);

  assert.deepEqual(deletedDbIds, ['msg_1', 'msg_2']);
  assert.deepEqual(updatedThreads, [
    { threadId: 'pixory-file-transfer', patch: { lastMessagePreview: 'still here' } },
  ]);
  assert.deepEqual(cleanedPaths, [
    'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/a.jpg',
    'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/b.pdf',
  ]);
});

test('mergeOrderedMessagePages keeps optimistic local messages when initial load finishes late', () => {
  const { mergeOrderedMessagePages } = loadTsModule('src/ai/aiMessagePageMerge.ts');
  const loadedFromDb = [
    { id: 'msg_old_1', createdAt: '2026-11-14T00:10:00.000Z', content: 'old' },
  ];
  const localOptimistic = [
    { id: 'msg_old_1', createdAt: '2026-11-14T00:10:00.000Z', content: 'old' },
    { id: 'ftmsg_new_2', createdAt: '2026-11-14T00:12:00.000Z', content: 'just sent' },
  ];

  const merged = mergeOrderedMessagePages(loadedFromDb, localOptimistic);
  assert.deepEqual(
    merged.map((m) => m.id),
    ['msg_old_1', 'ftmsg_new_2'],
  );
});

test('Attachment and document long-press opens popup menu in AiChatScreen and direct multi-select in FileTransferScreen', () => {
  const docCard = read('src/components/document/DocumentBubbleCard.tsx');
  const bubble = read('src/components/ai/AiMessageBubble.tsx');
  const fileTransfer = read('src/screens/FileTransferScreen.tsx');
  const aiChat = read('src/screens/AiChatScreen.tsx');
  const composer = read('src/components/ai/AiChatComposer.tsx');

  assert.ok(docCard.includes('onLongPress?: (event: GestureResponderEvent) => void;'));
  assert.equal(bubble.includes('longPressIncludesAttachments'), false);
  assert.ok(bubble.includes('!editing && onLongPress'));

  assert.equal(fileTransfer.includes('longPressIncludesAttachments'), false);
  assert.equal(aiChat.includes('longPressIncludesAttachments'), false);
  assert.ok(aiChat.includes('setMessageContextMenuState({'));

  assert.ok(composer.includes('inputRef.current?.clear?.()'));
  assert.ok(composer.includes('Math.round(measuredHeight)'));
});

test('ensureFileTransferThread deduplicates concurrent ensures and FileTransferScreen isolates pending/deleted state', () => {
  const aiChatService = read('src/ai/aiChatService.ts');
  const fileTransfer = read('src/screens/FileTransferScreen.tsx');

  assert.ok(aiChatService.includes('fileTransferEnsureInFlight'));
  assert.ok(aiChatService.includes("message.includes('UNIQUE constraint')"));

  assert.ok(fileTransfer.includes('pendingSendIdsRef'));
  assert.ok(fileTransfer.includes('deletedMessageIdsRef'));
  assert.ok(fileTransfer.includes('deletedSendTokensRef'));
  assert.ok(fileTransfer.includes('pendingSendIdsRef.current.has(message.id)'));
  assert.ok(fileTransfer.includes('styles.multiSelectCheckCircle'));
  assert.ok(fileTransfer.includes('metrics.minTouchSize'));
});

test('Security: fileStorageService blocks unsafe schemes and traversal, and cleans failed destinations', async () => {
  const deletedTargets = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const fileStorage = loadTsModule('src/services/fileStorageService.ts', {
      'expo-file-system/legacy': {
        documentDirectory: 'file:///app/data/',
        copyAsync: async () => {
          throw new Error('EIO disk full');
        },
        deleteAsync: async (uri, opts) => {
          deletedTargets.push({ uri, opts });
        },
      },
      '../native/pixoryMediaModule': {
        copyUriToFileWithProgress: async () => {
          throw new Error('stream aborted');
        },
      },
    });

    await assert.rejects(
      fileStorage.copyLocalFile(
        'https://evil.example/payload.pdf',
        'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/payload.pdf',
      ),
      /Unsupported or unsafe source file URI/,
    );
    await assert.rejects(
      fileStorage.copyLocalFile(
        'file:///cache/good.pdf',
        'file:///app/data/pixory/ai_documents/%2e%2e/database/pixory.sqlite',
      ),
      /Unsafe destination file URI/,
    );
    assert.throws(
      () => fileStorage.joinStoragePath('file:///app/data/pixory/', '../../escape.sqlite'),
      /Invalid storage path segment/,
    );

    await assert.rejects(
      fileStorage.copyLocalFile(
        'content://media/external/file/99',
        'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/partial.pdf',
      ),
      /stream aborted/,
    );
    assert.deepEqual(deletedTargets, [
      {
        uri: 'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/partial.pdf',
        opts: { idempotent: true },
      },
    ]);
  } finally {
    console.warn = originalWarn;
  }
});

test('Security: isManagedThreadAttachmentUri and toFileTransferUserErrorMessage enforce containment and privacy', () => {
  const service = loadTsModule('src/ai/fileTransferService.ts', {
    '../database': {
      aiThreadRepository: {},
      runWithDatabaseSpace: async () => {},
      runWithTransactionRetry: async () => {},
      settingsRepository: {},
    },
    '../services/fileStorageService': {
      getAiDocumentsDir: (space) =>
        space === 'personal'
          ? 'file:///app/data/pixory_personal/ai_documents/'
          : 'file:///app/data/pixory/ai_documents/',
    },
    './aiChatService': {},
    './aiDocumentService': {},
  });

  assert.equal(
    service.isManagedThreadAttachmentUri(
      'normal',
      'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/attachments/photo%201.jpg',
    ),
    true,
  );
  assert.equal(
    service.isManagedThreadAttachmentUri(
      'normal',
      'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/%2e%2e/pixory.sqlite',
    ),
    false,
  );
  assert.equal(
    service.isManagedThreadAttachmentUri(
      'normal',
      'file:///app/data/pixory_personal/ai_documents/thread_pixory-file-transfer/secret.pdf',
    ),
    false,
  );
  assert.equal(
    service.isManagedThreadAttachmentUri(
      'normal',
      'file:///app/data/pixory/ai_documents/thread_pixory-file-transfer/doc.pdf?x=1',
    ),
    false,
  );

  assert.equal(
    service.toFileTransferUserErrorMessage(
      new Error('SQLITE_ERROR: no such table at /data/user/0/pixory_personal/db.sqlite'),
      '发送失败，请重试',
    ),
    '发送失败，请重试',
  );
  assert.equal(
    service.toFileTransferUserErrorMessage(new Error('SQLITE_BUSY: database is locked'), '操作失败'),
    '本地数据库繁忙，已暂停并保护当前状态，请稍后重试',
  );
  assert.equal(
    service.toFileTransferUserErrorMessage(new Error('需要相册权限才能上传图片。'), '选择图片失败'),
    '需要相册权限才能上传图片。',
  );
});

test('Security: exportDocumentToShare sanitizes malicious extensions against cache path traversal', async () => {
  const writtenPaths = [];
  const docExport = loadTsModule('src/im/utils/documentExport.ts', {
    'react-native': {
      Share: { share: async () => ({}) },
    },
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///app/cache/',
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
      getInfoAsync: async () => ({ exists: false, isDirectory: false }),
      makeDirectoryAsync: async () => undefined,
      writeAsStringAsync: async (uri) => {
        writtenPaths.push(uri);
      },
      deleteAsync: async () => undefined,
    },
    '../../services/export/exportDocumentService': {
      safeShareFileAsync: async () => true,
    },
  });

  await docExport.exportDocumentToShare({
    title: 'report.pdf/../../../evil',
    content: 'hello',
  });
  assert.equal(writtenPaths.length, 1);
  assert.match(writtenPaths[0], /^file:\/\/\/app\/cache\/pixory_share\/\d+\/[^/]+\.txt$/);
  assert.equal(writtenPaths[0].includes('..'), false);
});

test('Security & Android fallback: copyOriginalToAppStorage rejects relative URIs and allows content:// stream fallback without source getInfoAsync', async () => {
  const getInfoCalls = [];
  const nativeStreamCalls = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const fileStorage = loadTsModule('src/services/fileStorageService.ts', {
      'expo-file-system/legacy': {
        documentDirectory: 'file:///app/data/',
        getInfoAsync: async (uri) => {
          getInfoCalls.push(uri);
          if (uri.startsWith('content://')) {
            throw new Error('getInfoAsync must not be called for content:// source URIs');
          }
          if (uri.endsWith('/')) {
            return { exists: true, isDirectory: true };
          }
          return { exists: false, isDirectory: false };
        },
        makeDirectoryAsync: async () => undefined,
        copyAsync: async () => {
          throw new Error('EACCES copyAsync failed on content URI');
        },
        deleteAsync: async () => undefined,
      },
      '../native/pixoryMediaModule': {
        copyUriToFileWithProgress: async (src, dst) => {
          nativeStreamCalls.push({ src, dst });
        },
      },
    });

    await assert.rejects(
      () => fileStorage.copyOriginalToAppStorage('../../secret.sqlite', 7, 'stolen.sqlite', 'normal'),
      /Unsupported or unsafe source file URI/,
    );
    await assert.rejects(
      () => fileStorage.copyLocalFile('relative/path.pdf', 'file:///app/data/pixory/out.pdf'),
      /Unsupported or unsafe source file URI/,
    );

    const contentUri = 'content://com.android.providers.downloads.documents/document/raw%3A99';
    const dest = await fileStorage.copyOriginalToAppStorage(contentUri, 12, 'doc.pdf', 'normal');
    assert.equal(dest, 'file:///app/data/pixory/originals/ip_12/doc.pdf');
    assert.equal(nativeStreamCalls.length, 1);
    assert.deepEqual(nativeStreamCalls[0], { src: contentUri, dst: dest });
    assert.equal(getInfoCalls.some((u) => u.startsWith('content://')), false);
  } finally {
    console.warn = originalWarn;
  }
});

test('copyLocalFile preserves pre-existing destination files on copy failure while cleaning newly failed targets', async () => {
  const deletedUris = [];
  let destExists = true;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const fileStorage = loadTsModule('src/services/fileStorageService.ts', {
      'expo-file-system/legacy': {
        documentDirectory: 'file:///app/data/',
        getInfoAsync: async () => ({ exists: destExists, isDirectory: false }),
        copyAsync: async () => {
          throw new Error('ENOSPC disk full');
        },
        deleteAsync: async (uri) => {
          deletedUris.push(uri);
        },
      },
      '../native/pixoryMediaModule': {
        copyUriToFileWithProgress: async () => {
          throw new Error('native fallback not expected for file://');
        },
      },
    });

    const targetUri = 'file:///app/data/pixory/ai_documents/thread_system_file_transfer/existing.jpg';
    await assert.rejects(
      () => fileStorage.copyLocalFile('file:///sdcard/Download/photo.jpg', targetUri),
      /ENOSPC disk full/,
    );
    assert.deepEqual(deletedUris, []);

    destExists = false;
    await assert.rejects(
      () => fileStorage.copyLocalFile('file:///sdcard/Download/photo.jpg', targetUri),
      /ENOSPC disk full/,
    );
    assert.deepEqual(deletedUris, [targetUri]);
  } finally {
    console.warn = originalWarn;
  }
});
