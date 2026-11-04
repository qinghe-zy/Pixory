import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type PixorySpace = 'normal' | 'personal';

/**
 * VFS 虚拟文件系统单个文件元数据项
 */
export interface VfsFileEntry {
  blobHash: string; // CAS 存储的 SHA-256 内容哈希
  sizeBytes: number; // 文件字节数
  mtime: number; // 变更时间戳
}

/**
 * VFS 工作区目录快照清单 (Manifest)
 * 遵循 MVCC 状态树模型，以轻量级 JSON 记录工作区全局快照
 */
export interface VfsManifest {
  version: number;
  treeHash: string; // 工作区目录树 canonical SHA-256 哈希
  files: Record<string, VfsFileEntry>; // 虚拟相对路径 -> 文件项
  createdAt: number;
}

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'rolled_back';
export type CheckpointStatus = 'applied' | 'reverted';

export interface AgentRunRecord {
  id: string;
  threadId?: string | null;
  docUri: string;
  status: AgentRunStatus;
  totalSteps: number;
  currentCheckpointId?: string | null;
  vfsRootHash?: string | null;
  space: PixorySpace;
  createdAt: number;
  updatedAt: number;
}

export interface AgentStepCheckpointRecord {
  id: string;
  runId: string;
  stepIndex: number;
  toolName: string;
  toolArgsJson: string;
  toolResultJson?: string | null;
  vfsTreeHash: string;
  manifestJson: string;
  status: CheckpointStatus;
  createdAt: number;
}

/**
 * 确定性计算 VFS 目录树的全局唯一版本哈希 (Tree Hash)
 *
 * 规范：
 * 1. 严格按文件相对路径 ASCII 字母序升序排序；
 * 2. 拼接 key + blobHash + sizeBytes，空字节隔离；
 * 3. 采用 @noble/hashes/sha2.js 计算 SHA-256；
 * 4. 目录树内容完全相同时，哈希结果 100% 逐字节恒定。
 */
export function calculateTreeHash(files: Record<string, VfsFileEntry>): string {
  const sortedPaths = Object.keys(files).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const hasher = sha256.create();

  for (let i = 0; i < sortedPaths.length; i++) {
    const filePath = sortedPaths[i];
    const entry = files[filePath];
    hasher.update(utf8ToBytes(filePath));
    hasher.update(new Uint8Array([0]));
    hasher.update(utf8ToBytes(entry.blobHash));
    hasher.update(new Uint8Array([0]));
    hasher.update(utf8ToBytes(String(entry.sizeBytes)));
    hasher.update(new Uint8Array([10])); // '\n' 分隔
  }

  return bytesToHex(hasher.digest());
}

/**
 * 规范化 VFS 相对路径 (去除前导斜杠与冗余点)
 */
export function normalizeVfsPath(pathStr: string): string {
  return pathStr
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}
