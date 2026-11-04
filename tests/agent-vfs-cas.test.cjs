const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

// 加载 VFS 模块
const {
  calculateTreeHash,
  normalizeVfsPath,
} = loadTsModule('src/services/agent/vfs/vfsTypes.ts');

const {
  NodeVfsStorageDriver,
  setVfsStorageDriver,
} = loadTsModule('src/services/agent/vfs/vfsStorageDriver.ts');

const {
  CasBlobStore,
} = loadTsModule('src/services/agent/vfs/casBlobStore.ts');

const {
  CasGarbageCollector,
} = loadTsModule('src/services/agent/vfs/casGarbageCollector.ts');

const TEST_VFS_DIR = path.resolve(__dirname, '../.tmp_test_vfs_cas');

function cleanTestDir() {
  if (fs.existsSync(TEST_VFS_DIR)) {
    fs.rmSync(TEST_VFS_DIR, { recursive: true, force: true });
  }
}

test('CAS-01 [目录树哈希规范化与确定性]: calculateTreeHash 必须对任意键序具有绝对确定性', () => {
  const filesA = {
    'section_1.xml': { blobHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', sizeBytes: 100, mtime: 1 },
    'section_2.xml': { blobHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', sizeBytes: 200, mtime: 1 },
    'word/document.xml': { blobHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', sizeBytes: 500, mtime: 1 },
  };

  // 打乱键序构造 filesB
  const filesB = {
    'word/document.xml': { blobHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', sizeBytes: 500, mtime: 999 },
    'section_2.xml': { blobHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', sizeBytes: 200, mtime: 888 },
    'section_1.xml': { blobHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', sizeBytes: 100, mtime: 777 },
  };

  const hashA = calculateTreeHash(filesA);
  const hashB = calculateTreeHash(filesB);

  assert.strictEqual(hashA.length, 64, '目录树哈希必须为 64 位 SHA-256');
  assert.strictEqual(hashA, hashB, '打乱键序后的目录树哈希必须 100% 逐字节一致（忽略 mtime 差异）');

  // 修改任意一个 blobHash 或 sizeBytes 必须触发哈希剧变
  const filesChanged = {
    ...filesA,
    'section_1.xml': { blobHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaf', sizeBytes: 100, mtime: 1 },
  };
  assert.notStrictEqual(calculateTreeHash(filesChanged), hashA, '内容变更必须触发树哈希变化');
});

test('CAS-02 [VFS 路径规范化]: normalizeVfsPath 正确去除前导斜杠与 Windows 反斜杠', () => {
  assert.strictEqual(normalizeVfsPath('word\\document.xml'), 'word/document.xml');
  assert.strictEqual(normalizeVfsPath('/root//dir///file.txt'), 'root/dir/file.txt');
  assert.strictEqual(normalizeVfsPath('\\\\win\\share\\doc.docx'), 'win/share/doc.docx');
});

test('CAS-03 [CAS Blob 存储与去重]: putBlob 寻址存储、自动分片与重复写入去重', async () => {
  cleanTestDir();
  const driver = new NodeVfsStorageDriver(TEST_VFS_DIR);
  setVfsStorageDriver(driver);
  const blobStore = new CasBlobStore(driver);

  const content = 'Hello Pixory Intelligent Document Agent VFS';
  const res1 = await blobStore.putBlob(content, 'normal');

  assert.strictEqual(res1.isDeduplicated, false, '初次写入不得标记去重');
  assert.strictEqual(res1.sizeBytes, Buffer.byteLength(content));

  // 验证物理分片存储路径: vfs_blobs/{hash前2位}/{完整hash}
  const prefix = res1.blobHash.slice(0, 2);
  const blobPath = path.join(TEST_VFS_DIR, 'pixory', 'vfs_blobs', prefix, res1.blobHash);
  assert.ok(fs.existsSync(blobPath), '物理磁盘必须存在分片存储文件');

  // 验证读出一致性
  const readBack = await blobStore.getBlobText(res1.blobHash, 'normal');
  assert.strictEqual(readBack, content, '读取内容必须与写入完全一致');

  // 再次写入相同内容 -> 触发去重
  const res2 = await blobStore.putBlob(content, 'normal');
  assert.strictEqual(res2.blobHash, res1.blobHash);
  assert.strictEqual(res2.isDeduplicated, true, '同内容二次写入必须自动去重，避免重复物理写');

  cleanTestDir();
});

test('CAS-04 [CAS 孤儿垃圾回收器 GC]: 活跃 Blob 保留，保护期内孤儿保留，过期孤儿彻底清理', async () => {
  cleanTestDir();
  const driver = new NodeVfsStorageDriver(TEST_VFS_DIR);
  setVfsStorageDriver(driver);
  const blobStore = new CasBlobStore(driver);

  // 写入 3 个 Blob
  const blob1 = await blobStore.putBlob('Active Document 1', 'normal');
  const blob2 = await blobStore.putBlob('Active Document 2', 'normal');
  const blob3 = await blobStore.putBlob('Orphan Document to be collected', 'normal');

  // 模拟数据库中只有 blob1 和 blob2 被检查点引用
  const mockDb = {
    async getAllAsync() {
      return [
        {
          manifestJson: JSON.stringify({
            files: {
              'doc1.txt': { blobHash: blob1.blobHash, sizeBytes: 10, mtime: 1 },
              'doc2.txt': { blobHash: blob2.blobHash, sizeBytes: 10, mtime: 1 },
            },
          }),
        },
      ];
    },
  };

  const gc = new CasGarbageCollector(blobStore, driver);

  // 1. 设置保护期为 100000ms（当前刚写入，处于保护期）
  const reportGrace = await gc.collectOrphanBlobs('normal', 100000, mockDb);
  assert.strictEqual(reportGrace.scannedBlobs, 3);
  assert.strictEqual(reportGrace.retainedInGracePeriod, 1, '处于保护期的孤儿 Blob 不得被误删');
  assert.strictEqual(reportGrace.deletedOrphans, 0);
  assert.ok(await blobStore.hasBlob(blob3.blobHash, 'normal'), '保护期内孤儿依然存在');

  // 2. 将保护期设为 0ms（立即过期）
  const reportExpired = await gc.collectOrphanBlobs('normal', 0, mockDb);
  assert.strictEqual(reportExpired.deletedOrphans, 1, '超期孤儿必须被安全清理');
  assert.strictEqual(await blobStore.hasBlob(blob3.blobHash, 'normal'), false, '超期孤儿已被物理删除');
  assert.strictEqual(await blobStore.hasBlob(blob1.blobHash, 'normal'), true, '活跃 blob1 必须完好保留');
  assert.strictEqual(await blobStore.hasBlob(blob2.blobHash, 'normal'), true, '活跃 blob2 必须完好保留');

  cleanTestDir();
});
