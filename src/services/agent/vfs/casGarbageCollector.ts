import type { SQLiteDatabase } from 'expo-sqlite';
import { CasBlobStore } from './casBlobStore';
import { getVfsStorageDriver, type IVfsStorageDriver } from './vfsStorageDriver';
import type { PixorySpace, VfsManifest } from './vfsTypes';

export interface CasGcReport {
  scannedBlobs: number;
  activeBlobs: number;
  deletedOrphans: number;
  retainedInGracePeriod: number;
}

/**
 * CAS 孤儿 Blob 安全垃圾回收器 (Safe Garbage Collector)
 *
 * 核心指标：
 * 1. 引用守恒：被任一检查点引用的 Blob 严禁删除；
 * 2. 竞态防护（Grace Period）：最新 5 分钟内创建的 Blob 默认保留，杜绝并发写入期间被误删；
 * 3. 空间隔离：仅在指定的 space 目录内扫描与清理。
 */
export class CasGarbageCollector {
  private blobStore: CasBlobStore;
  private driver: IVfsStorageDriver;

  constructor(customBlobStore?: CasBlobStore, customDriver?: IVfsStorageDriver) {
    this.driver = customDriver || getVfsStorageDriver();
    this.blobStore = customBlobStore || new CasBlobStore(this.driver);
  }

  /**
   * 执行孤儿 Blob 垃圾回收
   * @param space 存储空间 (normal / personal)
   * @param gracePeriodMs 竞态保护窗口时间 (默认 5 分钟)
   * @param db 可选外部传入的 SQLiteDatabase
   */
  public async collectOrphanBlobs(
    space: PixorySpace,
    gracePeriodMs: number = 5 * 60 * 1000,
    db?: SQLiteDatabase,
  ): Promise<CasGcReport> {
    // 1. 从 SQLite 中读取所有检查点的 Manifest，收集所有活跃 Blob 哈希
    const queryActiveHashes = async (activeDb: SQLiteDatabase): Promise<Set<string>> => {
      const active = new Set<string>();
      const rows = await activeDb.getAllAsync<{ manifestJson: string }>(
        `SELECT c.manifestJson
         FROM agent_step_checkpoints c
         JOIN agent_runs r ON c.runId = r.id
         WHERE r.space = ?;`,
        [space]
      );

      for (let i = 0; i < rows.length; i++) {
        try {
          const manifest: VfsManifest = JSON.parse(rows[i].manifestJson);
          if (manifest.files) {
            const paths = Object.keys(manifest.files);
            for (let j = 0; j < paths.length; j++) {
              const entry = manifest.files[paths[j]];
              if (entry && entry.blobHash) {
                active.add(entry.blobHash.toLowerCase());
              }
            }
          }
        } catch {
          // 容错跳过无效 JSON
        }
      }

      // 扫描 im_messages 与 ai_messages 表中所有被引用的 CAS Blob 哈希，绝对防止聊天文档被误删
      const scanTableHashes = async (tableName: string) => {
        try {
          const msgRows = await activeDb.getAllAsync<{ content?: string; metadata?: string }>(
            `SELECT content, metadata FROM ${tableName} WHERE type = 'document' OR content LIKE '%casHash%' OR metadata LIKE '%casHash%';`
          );
          const hashRegex = /[0-9a-f]{64}/gi;
          for (const row of msgRows) {
            if (row.content) {
              const matches = row.content.match(hashRegex);
              if (matches) {
                for (const h of matches) active.add(h.toLowerCase());
              }
            }
            if (row.metadata) {
              const matches = row.metadata.match(hashRegex);
              if (matches) {
                for (const h of matches) active.add(h.toLowerCase());
              }
            }
          }
        } catch {
          // 容错（如该表在特定测试环境下尚未初始化）
        }
      };

      await scanTableHashes('im_messages');
      await scanTableHashes('ai_messages');

      // 吸收内存 Pinning 锁中的哈希（防止已上传但尚未落库发送的文件被误删）
      for (const pin of CasBlobStore.pinnedHashes) {
        active.add(pin.toLowerCase());
      }

      return active;
    };

    let activeHashes: Set<string>;
    if (db) {
      activeHashes = await queryActiveHashes(db);
    } else {
      const { runWithDatabaseSpace } = await import('../../../database/db');
      activeHashes = await runWithDatabaseSpace(space, queryActiveHashes);
    }

    // 2. 枚举物理磁盘上的所有 Blob 文件
    const blobsRoot = this.blobStore.getBlobsRootDir(space);
    if (!(await this.driver.exists(blobsRoot))) {
      return {
        scannedBlobs: 0,
        activeBlobs: activeHashes.size,
        deletedOrphans: 0,
        retainedInGracePeriod: 0,
      };
    }

    const allBlobFiles = await this.driver.listFiles(blobsRoot);
    const now = Date.now();
    let deletedCount = 0;
    let graceCount = 0;

    for (let i = 0; i < allBlobFiles.length; i++) {
      const filePath = allBlobFiles[i].replace(/\\/g, '/');
      const filename = filePath.split('/').pop() || '';

      if (!/^[0-9a-f]{64}$/i.test(filename)) {
        continue;
      }

      const hash = filename.toLowerCase();

      // 如果属于活跃引用，保留
      if (activeHashes.has(hash)) {
        continue;
      }

      // 如果是孤儿，检查最后修改时间是否在保护期内
      const mtime = await this.driver.getMtime(filePath);
      if (now - mtime < gracePeriodMs) {
        graceCount++;
        continue;
      }

      // 超过保护期的孤儿 Blob，安全删除
      await this.driver.deleteFile(filePath);
      deletedCount++;
    }

    return {
      scannedBlobs: allBlobFiles.length,
      activeBlobs: activeHashes.size,
      deletedOrphans: deletedCount,
      retainedInGracePeriod: graceCount,
    };
  }
}
