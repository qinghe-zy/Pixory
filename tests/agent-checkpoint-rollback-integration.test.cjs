const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sha256 } = require('@noble/hashes/sha2.js');
const { bytesToHex } = require('@noble/hashes/utils.js');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

// 加载 VFS 模块
const {
  calculateTreeHash,
} = loadTsModule('src/services/agent/vfs/vfsTypes.ts');

const {
  NodeVfsStorageDriver,
  setVfsStorageDriver,
} = loadTsModule('src/services/agent/vfs/vfsStorageDriver.ts');

const {
  CasBlobStore,
} = loadTsModule('src/services/agent/vfs/casBlobStore.ts');

const {
  VfsWorkspaceManager,
} = loadTsModule('src/services/agent/vfs/vfsWorkspace.ts');

const TEST_WORK_DIR = path.resolve(__dirname, '../.tmp_test_vfs_integration');

function cleanTestDir() {
  if (fs.existsSync(TEST_WORK_DIR)) {
    fs.rmSync(TEST_WORK_DIR, { recursive: true, force: true });
  }
}

/**
 * 内存/临时模拟 SQLite 数据库引擎
 */
class MockSqliteDb {
  constructor() {
    this.runs = new Map();
    this.checkpoints = [];
  }

  async runAsync(sql, params = []) {
    const s = sql.trim().toUpperCase();
    if (s.startsWith('INSERT INTO AGENT_RUNS')) {
      const [id, threadId, docUri, currentCheckpointId, vfsRootHash, space, createdAt, updatedAt] = params;
      this.runs.set(id, {
        id,
        threadId,
        docUri,
        status: 'running',
        totalSteps: 0,
        currentCheckpointId,
        vfsRootHash,
        space,
        createdAt,
        updatedAt,
      });
    } else if (s.startsWith('INSERT INTO AGENT_STEP_CHECKPOINTS')) {
      const [id, runId, stepIndex, toolName, toolArgsJson, toolResultJson, vfsTreeHash, manifestJson, createdAt] = params;
      this.checkpoints.push({
        id,
        runId,
        stepIndex,
        toolName,
        toolArgsJson,
        toolResultJson,
        vfsTreeHash,
        manifestJson,
        status: 'applied',
        createdAt,
      });
    } else if (s.startsWith('UPDATE AGENT_RUNS')) {
      // SET currentCheckpointId = ?, vfsRootHash = ?, totalSteps = ?, updatedAt = ? WHERE id = ?
      // or SET currentCheckpointId = ?, vfsRootHash = ?, status = 'rolled_back', updatedAt = ? WHERE id = ?
      if (s.includes('TOTALSTEPS')) {
        const [currentCheckpointId, vfsRootHash, totalSteps, updatedAt, id] = params;
        const r = this.runs.get(id);
        if (r) {
          r.currentCheckpointId = currentCheckpointId;
          r.vfsRootHash = vfsRootHash;
          r.totalSteps = totalSteps;
          r.updatedAt = updatedAt;
        }
      } else {
        const [currentCheckpointId, vfsRootHash, updatedAt, id] = params;
        const r = this.runs.get(id);
        if (r) {
          r.currentCheckpointId = currentCheckpointId;
          r.vfsRootHash = vfsRootHash;
          r.status = 'rolled_back';
          r.updatedAt = updatedAt;
        }
      }
    } else if (s.startsWith('UPDATE AGENT_STEP_CHECKPOINTS')) {
      // SET status = 'reverted' WHERE runId = ? AND stepIndex > ?
      const [runId, stepIndex] = params;
      for (const chk of this.checkpoints) {
        if (chk.runId === runId && chk.stepIndex > stepIndex) {
          chk.status = 'reverted';
        }
      }
    }
  }

  async getFirstAsync(sql, params = []) {
    const s = sql.trim().toUpperCase();
    if (s.startsWith('SELECT * FROM AGENT_STEP_CHECKPOINTS')) {
      const [runId, stepIndex] = params;
      const matches = this.checkpoints.filter((c) => c.runId === runId && c.stepIndex === stepIndex);
      return matches.length > 0 ? matches[matches.length - 1] : null;
    }
    return null;
  }
}

test('S4-01 [VFS 多步演进、原子回滚与状态对齐]: 回滚后 Manifest 与磁盘物理文件 100% 逐字节对齐', async () => {
  cleanTestDir();
  const driver = new NodeVfsStorageDriver(TEST_WORK_DIR);
  setVfsStorageDriver(driver);
  const blobStore = new CasBlobStore(driver);
  const vfsManager = new VfsWorkspaceManager(blobStore, driver);
  const db = new MockSqliteDb();

  // 1. 准备原文档 (Original Document)
  const originalDocPath = path.join(TEST_WORK_DIR, 'user_original_contract.docx');
  const originalContent = 'ORIGINAL_CONTRACT_BINARY_HEADER: 甲方违约需支付违约金 10 万元。';
  fs.mkdirSync(TEST_WORK_DIR, { recursive: true });
  fs.writeFileSync(originalDocPath, originalContent, 'utf8');

  // 计算原件初始哈希
  const initialOriginalHash = bytesToHex(sha256(fs.readFileSync(originalDocPath)));

  const runId = 'run_test_001';

  // 2. 初始化工作区 (Step 0)
  const initResult = await vfsManager.initWorkspace({
    runId,
    sourceDocUri: originalDocPath,
    space: 'normal',
    threadId: 'thread_im_999',
    db,
  });

  assert.strictEqual(initResult.run.status, 'running');
  assert.strictEqual(initResult.manifest.version, 1);
  assert.ok(initResult.manifest.files['user_original_contract.docx']);

  // 3. 执行 Step 1: 修改合同为 20 万元
  const step1Result = await vfsManager.applyStepChanges({
    runId,
    stepIndex: 1,
    toolName: 'doc_patch',
    toolArgs: { replace: '20 万元' },
    toolResult: { success: true },
    updatedFiles: {
      'user_original_contract.docx': 'ORIGINAL_CONTRACT_BINARY_HEADER: 甲方违约需支付违约金 20 万元。',
    },
    space: 'normal',
    db,
  });
  assert.strictEqual(step1Result.stepIndex, 1);

  // 4. 执行 Step 2: 保持 20 万元，新增附件 clause_b.txt
  const step2Result = await vfsManager.applyStepChanges({
    runId,
    stepIndex: 2,
    toolName: 'doc_add_attachment',
    toolArgs: { name: 'clause_b.txt' },
    toolResult: { success: true },
    updatedFiles: {
      'clause_b.txt': '附件 B：争议解决条款管辖地为上海仲裁委员会。',
    },
    space: 'normal',
    db,
  });
  assert.strictEqual(step2Result.stepIndex, 2);
  const step2TreeHash = step2Result.vfsTreeHash;

  // 验证当前工作区存在 clause_b.txt
  const clauseBText = await vfsManager.getWorkspaceFile(runId, 'clause_b.txt', 'normal');
  assert.ok(clauseBText);
  assert.strictEqual(new TextDecoder().decode(clauseBText), '附件 B：争议解决条款管辖地为上海仲裁委员会。');

  // 5. 执行 Step 3: 修改为 50 万元，删除附件 clause_b.txt，增加临时审计文件 temp_audit.log
  const step3Result = await vfsManager.applyStepChanges({
    runId,
    stepIndex: 3,
    toolName: 'doc_patch',
    toolArgs: { replace: '50 万元' },
    toolResult: { success: true },
    updatedFiles: {
      'user_original_contract.docx': 'ORIGINAL_CONTRACT_BINARY_HEADER: 甲方违约需支付违约金 50 万元。',
      'temp_audit.log': 'Step 3 audit logged.',
    },
    deletedFiles: ['clause_b.txt'],
    space: 'normal',
    db,
  });
  assert.strictEqual(step3Result.stepIndex, 3);

  // 验证当前 Step 3 状态：clause_b.txt 不存在，temp_audit.log 存在
  assert.strictEqual(await vfsManager.getWorkspaceFile(runId, 'clause_b.txt', 'normal'), null);
  assert.ok(await vfsManager.getWorkspaceFile(runId, 'temp_audit.log', 'normal'));

  // ==============================
  // 6. 执行原子回滚到 Step 2！
  // ==============================
  const rollbackRes = await vfsManager.rollbackToCheckpoint({
    runId,
    targetStepIndex: 2,
    space: 'normal',
    db,
  });

  assert.strictEqual(rollbackRes.success, true);
  assert.strictEqual(rollbackRes.treeHash, step2TreeHash, '回滚后物理目录树哈希必须与 Step 2 严格一致');

  // 验证物理文件状态回滚：
  // 1) user_original_contract.docx 回退到 20 万元
  const restoredContractBytes = await vfsManager.getWorkspaceFile(runId, 'user_original_contract.docx', 'normal');
  const restoredContractText = new TextDecoder().decode(restoredContractBytes);
  assert.strictEqual(restoredContractText, 'ORIGINAL_CONTRACT_BINARY_HEADER: 甲方违约需支付违约金 20 万元。');

  // 2) clause_b.txt 被完整恢复出来
  const restoredClauseBytes = await vfsManager.getWorkspaceFile(runId, 'clause_b.txt', 'normal');
  assert.ok(restoredClauseBytes, '回滚至 Step 2 必须重新物化 clause_b.txt');
  assert.strictEqual(new TextDecoder().decode(restoredClauseBytes), '附件 B：争议解决条款管辖地为上海仲裁委员会。');

  // 3) Step 3 新增的 temp_audit.log 必须被彻底删除，绝无孤儿残留
  assert.strictEqual(await vfsManager.getWorkspaceFile(runId, 'temp_audit.log', 'normal'), null);

  // 4) SQLite 状态：Step 3 检查点被标记为 reverted
  const step3DbRow = db.checkpoints.find((c) => c.stepIndex === 3);
  assert.strictEqual(step3DbRow.status, 'reverted');
  const runDbRow = db.runs.get(runId);
  assert.strictEqual(runDbRow.vfsRootHash, step2TreeHash);
  assert.strictEqual(runDbRow.status, 'rolled_back');

  // ==============================
  // 7. “不得修改原件” 铁律检验！
  // ==============================
  const finalOriginalHash = bytesToHex(sha256(fs.readFileSync(originalDocPath)));
  assert.strictEqual(
    finalOriginalHash,
    initialOriginalHash,
    '原始用户导入文档在经历多步修改、增加文件、删除文件及回滚操作后，其哈希与内容必须 100% 逐字节未变！'
  );

  cleanTestDir();
});

test('S4-02 [Personal 空间物理隔离与锁定清理]: 私密空间与普通空间物理目录完全分离', async () => {
  cleanTestDir();
  const driver = new NodeVfsStorageDriver(TEST_WORK_DIR);
  setVfsStorageDriver(driver);
  const blobStore = new CasBlobStore(driver);
  const vfsManager = new VfsWorkspaceManager(blobStore, driver);

  const normalDir = vfsManager.getWorkspaceDir('run_normal', 'normal');
  const personalDir = vfsManager.getWorkspaceDir('run_personal', 'personal');

  // 1. 物理路径隔离断言
  assert.ok(normalDir.includes('pixory/vfs_work'), '普通空间存放在 pixory/ 目录下');
  assert.ok(personalDir.includes('pixory_personal/vfs_work'), '私密空间必须存放在 pixory_personal/ 独立根下');
  assert.notStrictEqual(normalDir, personalDir);

  // 2. 模拟私密空间工作区创建与加锁清理
  await driver.writeText(`${personalDir}/secret_note.txt`, 'Personal secret document');
  assert.strictEqual(await driver.exists(`${personalDir}/secret_note.txt`), true);

  // 模拟普通空间工作区文件
  await driver.writeText(`${normalDir}/public_note.txt`, 'Public normal document');
  assert.strictEqual(await driver.exists(`${normalDir}/public_note.txt`), true);

  // 私密空间加锁时调用清理
  await vfsManager.cleanAllWorkspacesForSpace('personal');

  // 3. 断言私密空间工作区已被清空，而普通空间丝毫不受影响
  assert.strictEqual(await driver.exists(`${personalDir}/secret_note.txt`), false, '私密空间锁定后工作区必须完全擦除');
  assert.strictEqual(await driver.exists(`${normalDir}/public_note.txt`), true, '普通空间工作区不受私密空间清理影响');

  cleanTestDir();
});
