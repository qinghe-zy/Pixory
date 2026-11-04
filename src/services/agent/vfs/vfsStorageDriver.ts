import type { PixorySpace } from './vfsTypes';

export interface IVfsStorageDriver {
  readBytes(filePath: string): Promise<Uint8Array>;
  writeBytes(filePath: string, data: Uint8Array): Promise<void>;
  readText(filePath: string): Promise<string>;
  writeText(filePath: string, text: string): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  deleteDir(dirPath: string): Promise<void>;
  exists(targetPath: string): Promise<boolean>;
  ensureDir(dirPath: string): Promise<void>;
  listFiles(dirPath: string): Promise<string[]>;
  getFileSize(filePath: string): Promise<number>;
  getMtime(filePath: string): Promise<number>;
  copyFile(src: string, dest: string): Promise<void>;
  readSlice?(filePath: string, start: number, length: number): Promise<string>;
  getBaseDir(space: PixorySpace): string;
}

function getDynamicNodeModule(name: string): any {
  if (typeof process !== 'undefined' && process.versions?.node) {
    const req = typeof require !== 'undefined' ? require : (globalThis as any).require;
    if (typeof req === 'function') {
      const target = String(name);
      return req(target);
    }
  }
  throw new Error(`Node module "${name}" is not supported in mobile runtime.`);
}

/**
 * Node.js 本地文件系统驱动实现 (适用于自动化测试与开发环境)
 */
export class NodeVfsStorageDriver implements IVfsStorageDriver {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    const path = getDynamicNodeModule('node:path');
    this.baseDir = customBaseDir || path.resolve(process.cwd(), '.tmp_vfs');
  }

  public getBaseDir(space: PixorySpace): string {
    const path = getDynamicNodeModule('node:path');
    const rootName = space === 'personal' ? 'pixory_personal' : 'pixory';
    return path.join(this.baseDir, rootName);
  }

  public async readBytes(filePath: string): Promise<Uint8Array> {
    const fs = getDynamicNodeModule('node:fs');
    return new Uint8Array(fs.readFileSync(filePath));
  }

  public async writeBytes(filePath: string, data: Uint8Array): Promise<void> {
    const fs = getDynamicNodeModule('node:fs');
    const path = getDynamicNodeModule('node:path');
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, Buffer.from(data));
  }

  public async readText(filePath: string): Promise<string> {
    const fs = getDynamicNodeModule('node:fs');
    return fs.readFileSync(filePath, 'utf8');
  }

  public async readSlice(filePath: string, start: number, length: number): Promise<string> {
    const fs = getDynamicNodeModule('node:fs');
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const bytesRead = fs.readSync(fd, buffer, 0, length, start);
      return buffer.slice(0, bytesRead).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  }

  public async writeText(filePath: string, text: string): Promise<void> {
    const fs = getDynamicNodeModule('node:fs');
    const path = getDynamicNodeModule('node:path');
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, text, 'utf8');
  }

  public async deleteFile(filePath: string): Promise<void> {
    const fs = getDynamicNodeModule('node:fs');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  public async deleteDir(dirPath: string): Promise<void> {
    const fs = getDynamicNodeModule('node:fs');
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  public async exists(targetPath: string): Promise<boolean> {
    const fs = getDynamicNodeModule('node:fs');
    return fs.existsSync(targetPath);
  }

  public async ensureDir(dirPath: string): Promise<void> {
    const fs = getDynamicNodeModule('node:fs');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  public async listFiles(dirPath: string): Promise<string[]> {
    const fs = getDynamicNodeModule('node:fs');
    const path = getDynamicNodeModule('node:path');
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const results: string[] = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const full = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        results.push(full);
      } else if (entry.isDirectory()) {
        const nested = await this.listFiles(full);
        for (let j = 0; j < nested.length; j++) {
          results.push(nested[j]);
        }
      }
    }
    return results;
  }

  public async getFileSize(filePath: string): Promise<number> {
    const fs = getDynamicNodeModule('node:fs');
    const stat = fs.statSync(filePath);
    return stat.size;
  }

  public async getMtime(filePath: string): Promise<number> {
    const fs = getDynamicNodeModule('node:fs');
    const stat = fs.statSync(filePath);
    return stat.mtimeMs;
  }

  public async copyFile(src: string, dest: string): Promise<void> {
    const fs = getDynamicNodeModule('node:fs');
    const path = getDynamicNodeModule('node:path');
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

/**
 * Expo 运行时文件系统驱动实现 (适用于 Android 真机环境)
 */
export class ExpoVfsStorageDriver implements IVfsStorageDriver {
  public getBaseDir(space: PixorySpace): string {
    const FileSystem = require('expo-file-system/legacy');
    const base = FileSystem.documentDirectory || '';
    const rootName = space === 'personal' ? 'pixory_personal' : 'pixory';
    return base.endsWith('/') ? `${base}${rootName}` : `${base}/${rootName}`;
  }

  public async readBytes(filePath: string): Promise<Uint8Array> {
    const FileSystem = require('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  public async writeBytes(filePath: string, data: Uint8Array): Promise<void> {
    const FileSystem = require('expo-file-system/legacy');
    await this.ensureParentDir(filePath);
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    const base64 = btoa(binary);
    await FileSystem.writeAsStringAsync(filePath, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  public async readText(filePath: string): Promise<string> {
    const FileSystem = require('expo-file-system/legacy');
    return FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  public async readSlice(filePath: string, start: number, length: number): Promise<string> {
    const FileSystem = require('expo-file-system/legacy');
    try {
      return await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.UTF8,
        position: start,
        length,
      });
    } catch {
      const full = await this.readText(filePath);
      return full.slice(start, start + length);
    }
  }

  public async writeText(filePath: string, text: string): Promise<void> {
    const FileSystem = require('expo-file-system/legacy');
    await this.ensureParentDir(filePath);
    await FileSystem.writeAsStringAsync(filePath, text, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  public async deleteFile(filePath: string): Promise<void> {
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }
  }

  public async deleteDir(dirPath: string): Promise<void> {
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(dirPath);
    if (info.exists) {
      await FileSystem.deleteAsync(dirPath, { idempotent: true });
    }
  }

  public async exists(targetPath: string): Promise<boolean> {
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(targetPath);
    return info.exists;
  }

  public async ensureDir(dirPath: string): Promise<void> {
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(dirPath);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
    }
  }

  public async listFiles(dirPath: string): Promise<string[]> {
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(dirPath);
    if (!info.exists || !info.isDirectory) {
      return [];
    }
    const fileNames: string[] = await FileSystem.readDirectoryAsync(dirPath);
    const results: string[] = [];
    const normalizedDir = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;

    for (let i = 0; i < fileNames.length; i++) {
      const childPath = `${normalizedDir}${fileNames[i]}`;
      const childInfo = await FileSystem.getInfoAsync(childPath);
      if (childInfo.exists) {
        if (childInfo.isDirectory) {
          const nested = await this.listFiles(childPath);
          for (let j = 0; j < nested.length; j++) {
            results.push(nested[j]);
          }
        } else {
          results.push(childPath);
        }
      }
    }
    return results;
  }

  public async getFileSize(filePath: string): Promise<number> {
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(filePath);
    return info.exists && typeof info.size === 'number' ? info.size : 0;
  }

  public async getMtime(filePath: string): Promise<number> {
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(filePath);
    return info.exists && typeof info.modificationTime === 'number'
      ? info.modificationTime * 1000
      : Date.now();
  }

  public async copyFile(src: string, dest: string): Promise<void> {
    const FileSystem = require('expo-file-system/legacy');
    await this.ensureParentDir(dest);
    await FileSystem.copyAsync({ from: src, to: dest });
  }

  private async ensureParentDir(filePath: string): Promise<void> {
    const parts = filePath.replace(/\\/g, '/').split('/');
    parts.pop();
    const parentDir = parts.join('/');
    if (parentDir) {
      await this.ensureDir(parentDir);
    }
  }
}

// 驱动单例管理
let activeDriver: IVfsStorageDriver | null = null;

export function getVfsStorageDriver(): IVfsStorageDriver {
  if (activeDriver) {
    return activeDriver;
  }
  // 在 Node.js 环境下自动选用 NodeVfsStorageDriver
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    activeDriver = new NodeVfsStorageDriver();
    return activeDriver;
  }
  activeDriver = new ExpoVfsStorageDriver();
  return activeDriver;
}

export function setVfsStorageDriver(driver: IVfsStorageDriver | null): void {
  activeDriver = driver;
}
