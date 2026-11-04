import type { SQLiteDatabase } from 'expo-sqlite';
import {
  calculateTreeHash,
  normalizeVfsPath,
  type AgentRunRecord,
  type AgentStepCheckpointRecord,
  type PixorySpace,
  type VfsFileEntry,
  type VfsManifest,
} from './vfsTypes';
import { CasBlobStore } from './casBlobStore';
import { getVfsStorageDriver, type IVfsStorageDriver } from './vfsStorageDriver';

export interface InitWorkspaceParams {
  runId: string;
  sourceDocUri: string;
  space: PixorySpace;
  threadId?: string | null;
  db?: SQLiteDatabase;
}

export interface ApplyStepChangesParams {
  runId: string;
  stepIndex: number;
  toolName: string;
  toolArgs: any;
  toolResult: any;
  updatedFiles: Record<string, Uint8Array | string>;
  deletedFiles?: string[];
  space: PixorySpace;
  db?: SQLiteDatabase;
}

export interface RollbackParams {
  runId: string;
  targetStepIndex: number;
  space: PixorySpace;
  db?: SQLiteDatabase;
}

export interface RollbackResult {
  success: boolean;
  rolledBackTo: AgentStepCheckpointRecord;
  treeHash: string;
}

/**
 * VFS 工作区管理器 (Workspace Manager)
 *
 * 铁律保障：
 * 1. 原件 100% 只读：从不就地修改原始文件，仅在工作区构建 CAS 副本；
 * 2. 崩溃一致性（Crash Consistency）：
 *    严格遵循「Blob 落盘 → 工作区文件落盘 → Manifest 落盘 → SQLite 事务提交指针」执行序；
 * 3. MVCC 原子回滚：回滚 = 恢复 Manifest 快照 + 切换 SQLite 指针，两者原子绑定；
 * 4. 空间隔离：Normal 空间严禁探测或读取 Personal 工作区。
 */
export class VfsWorkspaceManager {
  private blobStore: CasBlobStore;
  private driver: IVfsStorageDriver;

  constructor(customBlobStore?: CasBlobStore, customDriver?: IVfsStorageDriver) {
    this.driver = customDriver || getVfsStorageDriver();
    this.blobStore = customBlobStore || new CasBlobStore(this.driver);
  }

  /**
   * 获取指定工作区物理目录
   */
  public getWorkspaceDir(runId: string, space: PixorySpace): string {
    const base = this.driver.getBaseDir(space).replace(/\\/g, '/');
    return `${base}/vfs_work/run_${runId}`;
  }

  /**
   * 初始化工作区 (Step 0)
   * 严格保障原始导入文档零字节改动
   */
  public async initWorkspace(params: InitWorkspaceParams): Promise<{
    manifest: VfsManifest;
    run: AgentRunRecord;
    initialCheckpoint: AgentStepCheckpointRecord;
  }> {
    const { runId, sourceDocUri, space, threadId, db } = params;
    const workspaceDir = this.getWorkspaceDir(runId, space);
    await this.driver.ensureDir(workspaceDir);

    // 1. 读取原件内容并计算哈希（原件完全只读）
    const originalBytes = await this.driver.readBytes(sourceDocUri);
    const { blobHash, sizeBytes } = await this.blobStore.putBlob(originalBytes, space);

    // 提取文档虚拟文件名
    const cleanUri = sourceDocUri.replace(/\\/g, '/');
    const fileName = cleanUri.split('/').pop() || 'document.bin';
    const virtualPath = normalizeVfsPath(fileName);

    const now = Date.now();
    const files: Record<string, VfsFileEntry> = {
      [virtualPath]: {
        blobHash,
        sizeBytes,
        mtime: now,
      },
    };

    const treeHash = calculateTreeHash(files);
    const manifest: VfsManifest = {
      version: 1,
      treeHash,
      files,
      createdAt: now,
    };

    // 2. 将原件副本物化至工作区，并写入初始 Manifest
    const targetFilePath = `${workspaceDir}/${virtualPath}`;
    await this.driver.writeBytes(targetFilePath, originalBytes);
    await this.driver.writeText(`${workspaceDir}/manifest.json`, JSON.stringify(manifest, null, 2));

    const initialCheckpointId = `chk_${runId}_0`;

    // 3. 持久化记录至 SQLite
    const executeDbWork = async (activeDb: SQLiteDatabase) => {
      await activeDb.runAsync(
        `INSERT INTO agent_runs (id, threadId, docUri, status, totalSteps, currentCheckpointId, vfsRootHash, space, createdAt, updatedAt)
         VALUES (?, ?, ?, 'running', 0, ?, ?, ?, ?, ?);`,
        [runId, threadId ?? null, sourceDocUri, initialCheckpointId, treeHash, space, now, now]
      );

      await activeDb.runAsync(
        `INSERT INTO agent_step_checkpoints (id, runId, stepIndex, toolName, toolArgsJson, toolResultJson, vfsTreeHash, manifestJson, status, createdAt)
         VALUES (?, ?, 0, 'workspace_init', '{}', '{}', ?, ?, 'applied', ?);`,
        [initialCheckpointId, runId, treeHash, JSON.stringify(manifest), now]
      );
    };

    if (db) {
      await executeDbWork(db);
    } else {
      const { runWithDatabaseSpace } = await import('../../../database/db');
      await runWithDatabaseSpace(space, executeDbWork);
    }

    const run: AgentRunRecord = {
      id: runId,
      threadId: threadId ?? null,
      docUri: sourceDocUri,
      status: 'running',
      totalSteps: 0,
      currentCheckpointId: initialCheckpointId,
      vfsRootHash: treeHash,
      space,
      createdAt: now,
      updatedAt: now,
    };

    const initialCheckpoint: AgentStepCheckpointRecord = {
      id: initialCheckpointId,
      runId,
      stepIndex: 0,
      toolName: 'workspace_init',
      toolArgsJson: '{}',
      toolResultJson: '{}',
      vfsTreeHash: treeHash,
      manifestJson: JSON.stringify(manifest),
      status: 'applied',
      createdAt: now,
    };

    return { manifest, run, initialCheckpoint };
  }

  /**
   * 应用单步工具修改并创建原子检查点 (Crash-Consistent Checkpoint)
   */
  public async applyStepChanges(params: ApplyStepChangesParams): Promise<AgentStepCheckpointRecord> {
    const { runId, stepIndex, toolName, toolArgs, toolResult, updatedFiles, deletedFiles, space, db } = params;
    const workspaceDir = this.getWorkspaceDir(runId, space);

    // 1. 读取当前工作区 Manifest
    const manifestPath = `${workspaceDir}/manifest.json`;
    if (!(await this.driver.exists(manifestPath))) {
      throw new Error(`工作区未初始化或缺少 manifest.json: ${runId}`);
    }
    const currentManifest: VfsManifest = JSON.parse(await this.driver.readText(manifestPath));
    const now = Date.now();

    // 2. 将修改的文件写入 CAS 存储，并复制到工作区物理目录
    const newFiles: Record<string, VfsFileEntry> = { ...currentManifest.files };

    const updateKeys = Object.keys(updatedFiles);
    for (let i = 0; i < updateKeys.length; i++) {
      const vPath = normalizeVfsPath(updateKeys[i]);
      const content = updatedFiles[updateKeys[i]];
      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;

      // 写入 CAS
      const { blobHash, sizeBytes } = await this.blobStore.putBlob(bytes, space);

      newFiles[vPath] = {
        blobHash,
        sizeBytes,
        mtime: now,
      };

      // 写入工作区物理文件
      await this.driver.writeBytes(`${workspaceDir}/${vPath}`, bytes);
    }

    // 3. 处理文件删除
    if (deletedFiles && deletedFiles.length > 0) {
      for (let i = 0; i < deletedFiles.length; i++) {
        const vPath = normalizeVfsPath(deletedFiles[i]);
        delete newFiles[vPath];
        await this.driver.deleteFile(`${workspaceDir}/${vPath}`);
      }
    }

    // 4. 生成新版本 Manifest 与 treeHash
    const newTreeHash = calculateTreeHash(newFiles);
    const newManifest: VfsManifest = {
      version: currentManifest.version + 1,
      treeHash: newTreeHash,
      files: newFiles,
      createdAt: now,
    };

    // 5. 将新 Manifest 写入工作区
    await this.driver.writeText(manifestPath, JSON.stringify(newManifest, null, 2));

    const checkpointId = `chk_${runId}_${stepIndex}_${Date.now()}`;
    const toolArgsJson = typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs ?? {});
    const toolResultJson = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult ?? {});

    // 6. 原子提交 SQLite 检查点
    const executeDb = async (activeDb: SQLiteDatabase) => {
      await activeDb.runAsync(
        `INSERT INTO agent_step_checkpoints (id, runId, stepIndex, toolName, toolArgsJson, toolResultJson, vfsTreeHash, manifestJson, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?);`,
        [checkpointId, runId, stepIndex, toolName, toolArgsJson, toolResultJson, newTreeHash, JSON.stringify(newManifest), now]
      );

      await activeDb.runAsync(
        `UPDATE agent_runs
         SET currentCheckpointId = ?, vfsRootHash = ?, totalSteps = ?, updatedAt = ?
         WHERE id = ?;`,
        [checkpointId, newTreeHash, stepIndex, now, runId]
      );
    };

    if (db) {
      await executeDb(db);
    } else {
      const { runWithDatabaseSpace } = await import('../../../database/db');
      await runWithDatabaseSpace(space, executeDb);
    }

    return {
      id: checkpointId,
      runId,
      stepIndex,
      toolName,
      toolArgsJson,
      toolResultJson,
      vfsTreeHash: newTreeHash,
      manifestJson: JSON.stringify(newManifest),
      status: 'applied',
      createdAt: now,
    };
  }

  /**
   * 原子回滚至指定步骤检查点
   * 恢复工作区物理文件至与对应 Manifest 100% 逐字节一致
   */
  public async rollbackToCheckpoint(params: RollbackParams): Promise<RollbackResult> {
    const { runId, targetStepIndex, space, db } = params;
    const workspaceDir = this.getWorkspaceDir(runId, space);

    // 1. 查询目标检查点
    let targetCheckpoint: AgentStepCheckpointRecord | null = null;
    const queryDb = async (activeDb: SQLiteDatabase) => {
      return activeDb.getFirstAsync<AgentStepCheckpointRecord>(
        `SELECT * FROM agent_step_checkpoints
         WHERE runId = ? AND stepIndex = ?
         ORDER BY createdAt DESC LIMIT 1;`,
        [runId, targetStepIndex]
      );
    };

    if (db) {
      targetCheckpoint = await queryDb(db);
    } else {
      const { runWithDatabaseSpace } = await import('../../../database/db');
      targetCheckpoint = await runWithDatabaseSpace(space, queryDb);
    }

    if (!targetCheckpoint) {
      throw new Error(`未找到目标步骤检查点: runId=${runId}, stepIndex=${targetStepIndex}`);
    }

    const targetManifest: VfsManifest = JSON.parse(targetCheckpoint.manifestJson);

    // 2. 物理恢复工作区文件
    // A. 恢复 Manifest 中定义的所有文件
    const targetFilePaths = Object.keys(targetManifest.files);
    for (let i = 0; i < targetFilePaths.length; i++) {
      const vPath = targetFilePaths[i];
      const entry = targetManifest.files[vPath];
      const blobBytes = await this.blobStore.getBlob(entry.blobHash, space);
      if (!blobBytes) {
        throw new Error(`CAS Blob 缺失，无法恢复文件: ${entry.blobHash} (${vPath})`);
      }
      await this.driver.writeBytes(`${workspaceDir}/${vPath}`, blobBytes);
    }

    // B. 清理在后续步骤新增而在目标快照中不存在的孤儿文件
    const currentFiles = await this.driver.listFiles(workspaceDir);
    const allowedSet = new Set(targetFilePaths.map((p) => `${workspaceDir}/${p}`.replace(/\\/g, '/')));
    allowedSet.add(`${workspaceDir}/manifest.json`.replace(/\\/g, '/'));

    for (let i = 0; i < currentFiles.length; i++) {
      const normCurrent = currentFiles[i].replace(/\\/g, '/');
      if (!allowedSet.has(normCurrent)) {
        await this.driver.deleteFile(normCurrent);
      }
    }

    // C. 重新覆写工作区 manifest.json
    await this.driver.writeText(`${workspaceDir}/manifest.json`, JSON.stringify(targetManifest, null, 2));

    // 3. 验证回滚后目录树哈希是否严格一致
    const restoredTreeHash = calculateTreeHash(targetManifest.files);
    if (restoredTreeHash !== targetCheckpoint.vfsTreeHash) {
      throw new Error(`回滚哈希校验失败: 预期 ${targetCheckpoint.vfsTreeHash}, 实际 ${restoredTreeHash}`);
    }

    // 4. 更新数据库状态：将目标步骤之后的检查点全部标记为 reverted
    const now = Date.now();
    const updateDb = async (activeDb: SQLiteDatabase) => {
      await activeDb.runAsync(
        `UPDATE agent_step_checkpoints
         SET status = 'reverted'
         WHERE runId = ? AND stepIndex > ?;`,
        [runId, targetStepIndex]
      );

      await activeDb.runAsync(
        `UPDATE agent_runs
         SET currentCheckpointId = ?, vfsRootHash = ?, status = 'rolled_back', updatedAt = ?
         WHERE id = ?;`,
        [targetCheckpoint!.id, targetCheckpoint!.vfsTreeHash, now, runId]
      );
    };

    if (db) {
      await updateDb(db);
    } else {
      const { runWithDatabaseSpace } = await import('../../../database/db');
      await runWithDatabaseSpace(space, updateDb);
    }

    return {
      success: true,
      rolledBackTo: targetCheckpoint,
      treeHash: restoredTreeHash,
    };
  }

  /**
   * 读取工作区内指定文件的实时二进制数据
   */
  public async getWorkspaceFile(
    runId: string,
    virtualPath: string,
    space: PixorySpace,
  ): Promise<Uint8Array | null> {
    const workspaceDir = this.getWorkspaceDir(runId, space);
    const filePath = `${workspaceDir}/${normalizeVfsPath(virtualPath)}`;
    if (!(await this.driver.exists(filePath))) {
      return null;
    }
    return this.driver.readBytes(filePath);
  }

  /**
   * 清理指定工作区
   */
  public async cleanWorkspace(runId: string, space: PixorySpace): Promise<void> {
    const workspaceDir = this.getWorkspaceDir(runId, space);
    await this.driver.deleteDir(workspaceDir);
  }

  /**
   * 清理指定空间下的所有工作区（用于私密空间加锁时的数据擦除）
   */
  public async cleanAllWorkspacesForSpace(space: PixorySpace): Promise<void> {
    const base = this.driver.getBaseDir(space).replace(/\\/g, '/');
    const workDir = `${base}/vfs_work`;
    await this.driver.deleteDir(workDir);
  }
}
