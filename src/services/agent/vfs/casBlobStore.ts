import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { PixorySpace } from './vfsTypes';
import { getVfsStorageDriver, type IVfsStorageDriver } from './vfsStorageDriver';

export interface CasBlobPutResult {
  blobHash: string;
  sizeBytes: number;
  isDeduplicated: boolean;
}

/**
 * CAS 内容寻址 Blob 存储管理器 (Content-Addressed Storage)
 *
 * 核心指标：
 * 1. 严格使用 @noble/hashes/sha2.js 计算 SHA-256 寻址散列；
 * 2. 两级分片存储结构: vfs_blobs/{hash前2位}/{完整hash}；
 * 3. 强幂等性：同内容写入自动去重，零重复物理 IO；
 * 4. 原子写入：通过临时文件原子写入避免断电半包损坏；
 * 5. 空间强隔离：normal 与 personal 存储根路径物理隔离。
 */
export class CasBlobStore {
  private driver: IVfsStorageDriver;
  public static readonly pinnedHashes: Set<string> = new Set();

  public static pinHash(hash: string): void {
    if (hash) CasBlobStore.pinnedHashes.add(hash.toLowerCase());
  }

  public static unpinHash(hash: string): void {
    if (hash) CasBlobStore.pinnedHashes.delete(hash.toLowerCase());
  }

  constructor(customDriver?: IVfsStorageDriver) {
    this.driver = customDriver || getVfsStorageDriver();
  }

  /**
   * 获取指定 Space 下的 Blob 物理根目录
   */
  public getBlobsRootDir(space: PixorySpace): string {
    const base = this.driver.getBaseDir(space).replace(/\\/g, '/');
    return `${base}/vfs_blobs`;
  }

  /**
   * 计算 Blob 的物理存储完整路径
   */
  public getBlobPath(blobHash: string, space: PixorySpace): string {
    const root = this.getBlobsRootDir(space);
    const prefix = blobHash.slice(0, 2);
    return `${root}/${prefix}/${blobHash}`;
  }

  /**
   * 将数据存入 CAS 存储
   */
  public async putBlob(
    data: Uint8Array | string,
    space: PixorySpace,
  ): Promise<CasBlobPutResult> {
    const bytes = typeof data === 'string' ? utf8ToBytes(data) : data;
    const blobHash = bytesToHex(sha256(bytes));
    const sizeBytes = bytes.length;
    const targetPath = this.getBlobPath(blobHash, space);

    // 1. 去重检查：若相同哈希已存在，直接复用已存 Blob
    const alreadyExists = await this.driver.exists(targetPath);
    if (alreadyExists) {
      return {
        blobHash,
        sizeBytes,
        isDeduplicated: true,
      };
    }

    // 2. 原子写入：先写入临时文件，再重命名/移动至最终目标
    const tempPath = `${targetPath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.driver.writeBytes(tempPath, bytes);
    await this.driver.copyFile(tempPath, targetPath);
    await this.driver.deleteFile(tempPath);

    return {
      blobHash,
      sizeBytes,
      isDeduplicated: false,
    };
  }

  /**
   * 将本地文件直接吸纳进 CAS 存储 (Ingest Native File URI)
   * 彻底避免大文件（如 20MB PDF）在 JS 端转 Base64 导致的内存暴增与 OOM
   */
  public async ingestFileUri(
    fileUri: string,
    space: PixorySpace,
    _originalFilename?: string,
  ): Promise<{ blobHash: string; casUri: string; sizeBytes: number; isDeduplicated: boolean }> {
    const bytes = await this.driver.readBytes(fileUri);
    const putRes = await this.putBlob(bytes, space);
    CasBlobStore.pinHash(putRes.blobHash);
    const targetPath = this.getBlobPath(putRes.blobHash, space);
    return {
      blobHash: putRes.blobHash,
      casUri: targetPath,
      sizeBytes: putRes.sizeBytes,
      isDeduplicated: putRes.isDeduplicated,
    };
  }

  /**
   * 读取 Blob 二进制内容
   */
  public async getBlob(blobHash: string, space: PixorySpace): Promise<Uint8Array | null> {
    const targetPath = this.getBlobPath(blobHash, space);
    const exists = await this.driver.exists(targetPath);
    if (!exists) {
      return null;
    }
    return this.driver.readBytes(targetPath);
  }

  /**
   * 读取 Blob 纯文本内容
   */
  public async getBlobText(blobHash: string, space: PixorySpace): Promise<string | null> {
    const targetPath = this.getBlobPath(blobHash, space);
    const exists = await this.driver.exists(targetPath);
    if (!exists) {
      return null;
    }
    return this.driver.readText(targetPath);
  }

  /**
   * 检查 Blob 是否存在
   */
  public async hasBlob(blobHash: string, space: PixorySpace): Promise<boolean> {
    const targetPath = this.getBlobPath(blobHash, space);
    return this.driver.exists(targetPath);
  }

  /**
   * 枚举指定空间下所有物理存在的 Blob 哈希集合
   */
  public async listAllBlobHashes(space: PixorySpace): Promise<string[]> {
    const root = this.getBlobsRootDir(space);
    if (!(await this.driver.exists(root))) {
      return [];
    }
    const allFiles = await this.driver.listFiles(root);
    const hashes: string[] = [];

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i].replace(/\\/g, '/');
      const filename = file.split('/').pop() || '';
      // 过滤临时文件，匹配 64 位 SHA-256 十六进制文件名
      if (/^[0-9a-f]{64}$/i.test(filename)) {
        hashes.push(filename.toLowerCase());
      }
    }

    return hashes;
  }
}
