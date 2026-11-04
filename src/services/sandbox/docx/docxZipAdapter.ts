/**
 * IDocxZipAdapter DOCX 容器压缩与解压适配器 (支持纯 Node 测试与 React Native 运行)
 */

export interface IDocxZipAdapter {
  /**
   * 解压 docx 文件中的全部或关键文件
   */
  readEntries(docxPathOrBytes: string | Uint8Array): Promise<Map<string, Uint8Array>>;

  /**
   * 将修改后的 entries 重新打包为全新 docx 文件
   */
  writeDocx(entries: Map<string, Uint8Array>, destPath?: string): Promise<Uint8Array>;
}

// ---------------------------------------------------------------------------
// CRC-32 校验码计算器
// ---------------------------------------------------------------------------

function makeCrcTable(): Int32Array {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

export function crc32(buf: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function tryGetDynamicNodeModule(name: string): any {
  if (typeof process !== 'undefined' && process.versions?.node) {
    const req = typeof require !== 'undefined' ? require : (globalThis as any).require;
    if (typeof req === 'function') {
      try {
        const target = String(name);
        return req(target);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function getDynamicNodeModule(name: string): any {
  const mod = tryGetDynamicNodeModule(name);
  if (mod) return mod;
  throw new Error(`Node module "${name}" is not supported in mobile runtime.`);
}

/**
 * 纯 TypeScript / Node 内置流与 zlib 实现的轻量级 ZIP 解压与打包器
 */
export class NodeDocxZipAdapter implements IDocxZipAdapter {
  public async readEntries(docxPathOrBytes: string | Uint8Array): Promise<Map<string, Uint8Array>> {
    let buf: Uint8Array;
    if (typeof docxPathOrBytes === 'string') {
      const fs = getDynamicNodeModule('node:fs');
      buf = new Uint8Array(fs.readFileSync(docxPathOrBytes));
    } else {
      buf = docxPathOrBytes;
    }

    const entries = new Map<string, Uint8Array>();
    const dataView = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    // 1. 定位 End of Central Directory (EOCD: 0x06054b50)
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (dataView.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error('无效的 DOCX 文件容器: 未找到 End of Central Directory 标识符');
    }

    const totalEntries = dataView.getUint16(eocdOffset + 10, true);
    const cdOffset = dataView.getUint32(eocdOffset + 16, true);

    // 2. 遍历 Central Directory (0x02014b50)
    let cdPos = cdOffset;
    const textDecoder = new TextDecoder('utf8');

    for (let i = 0; i < totalEntries; i++) {
      if (cdPos + 46 > buf.length) break;
      const sig = dataView.getUint32(cdPos, true);
      if (sig !== 0x02014b50) break;

      const method = dataView.getUint16(cdPos + 10, true);
      const compressedSize = dataView.getUint32(cdPos + 20, true);
      const uncompressedSize = dataView.getUint32(cdPos + 24, true);
      const nameLen = dataView.getUint16(cdPos + 28, true);
      const extraLen = dataView.getUint16(cdPos + 30, true);
      const commentLen = dataView.getUint16(cdPos + 32, true);
      const localHeaderOffset = dataView.getUint32(cdPos + 42, true);

      const filenameBytes = buf.subarray(cdPos + 46, cdPos + 46 + nameLen);
      let filename = textDecoder.decode(filenameBytes).replace(/\\/g, '/');
      if (filename.includes('../') || filename.startsWith('/')) {
        filename = filename.replace(/\.\.\//g, '').replace(/^\/+/, '');
      }

      // 读取 Local File Header (0x04034b50) 定位数据体
      if (localHeaderOffset + 30 <= buf.length) {
        const localSig = dataView.getUint32(localHeaderOffset, true);
        if (localSig === 0x04034b50) {
          const localNameLen = dataView.getUint16(localHeaderOffset + 26, true);
          const localExtraLen = dataView.getUint16(localHeaderOffset + 28, true);
          const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
          const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

          let uncompressedData: Uint8Array;
          if (method === 8) {
            const zlib = tryGetDynamicNodeModule('node:zlib');
            if (!zlib || typeof zlib.inflateRawSync !== 'function') {
              throw new Error(`移动端纯 JS 运行时暂不支持 Deflate 算法解压 (文件: ${filename})`);
            }
            uncompressedData = new Uint8Array(zlib.inflateRawSync(compressedData));
          } else if (method === 0) {
            uncompressedData = new Uint8Array(compressedData);
          } else {
            throw new Error(`不支持的 ZIP 压缩算法: ${method} (文件: ${filename})`);
          }

          entries.set(filename, uncompressedData);
        }
      }

      cdPos += 46 + nameLen + extraLen + commentLen;
    }

    return entries;
  }

  public async writeDocx(entries: Map<string, Uint8Array>, destPath?: string): Promise<Uint8Array> {
    const zlib = tryGetDynamicNodeModule('node:zlib');
    const textEncoder = new TextEncoder();

    interface EntryMeta {
      name: string;
      nameBytes: Uint8Array;
      data: Uint8Array;
      compressed: Uint8Array;
      method: number;
      crc: number;
      localHeaderOffset: number;
    }

    const metaList: EntryMeta[] = [];
    const localChunks: Uint8Array[] = [];
    let currentOffset = 0;

    // 1. 编码所有 Local File Headers 与文件数据
    for (const [name, rawData] of entries) {
      const nameBytes = textEncoder.encode(name);
      const crcVal = crc32(rawData);

      let method = 0;
      let compressed = rawData;

      // 若在 Node 宿主环境下具备 zlib 模块，优先尝试 deflate 压缩以缩减体积；
      // 在 React Native 移动端 (Hermes) 无 native 依赖时，纯 JS 采用标准 Store (method 0) 打包，
      // 所有 Office 软件 (Word/WPS/LibreOffice) 均原生完整支持 Store 规范，且打包解压速度更快。
      if (zlib && typeof zlib.deflateRawSync === 'function') {
        try {
          const deflated = new Uint8Array(zlib.deflateRawSync(Buffer.from(rawData)));
          if (deflated.length < rawData.length) {
            method = 8;
            compressed = deflated;
          }
        } catch {
          method = 0;
          compressed = rawData;
        }
      }

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lhView = new DataView(localHeader.buffer, localHeader.byteOffset, localHeader.byteLength);

      lhView.setUint32(0, 0x04034b50, true); // Local header signature
      lhView.setUint16(4, 20, true);         // Version needed: 2.0
      lhView.setUint16(6, 0, true);          // Flags
      lhView.setUint16(8, method, true);     // Method: deflate / store
      lhView.setUint16(10, 0, true);         // Mod time
      lhView.setUint16(12, 0, true);         // Mod date
      lhView.setUint32(14, crcVal, true);    // CRC-32
      lhView.setUint32(18, compressed.length, true);   // Compressed size
      lhView.setUint32(22, rawData.length, true);      // Uncompressed size
      lhView.setUint16(26, nameBytes.length, true);    // Filename length
      lhView.setUint16(28, 0, true);                   // Extra field length
      localHeader.set(nameBytes, 30);

      metaList.push({
        name,
        nameBytes,
        data: rawData,
        compressed,
        method,
        crc: crcVal,
        localHeaderOffset: currentOffset,
      });

      localChunks.push(localHeader);
      localChunks.push(compressed);
      currentOffset += localHeader.length + compressed.length;
    }

    const cdStartOffset = currentOffset;
    const cdChunks: Uint8Array[] = [];

    // 2. 编码 Central Directory Headers
    for (const meta of metaList) {
      const cdHeader = new Uint8Array(46 + meta.nameBytes.length);
      const cdView = new DataView(cdHeader.buffer, cdHeader.byteOffset, cdHeader.byteLength);

      cdView.setUint32(0, 0x02014b50, true); // Central directory signature
      cdView.setUint16(4, 20, true);         // Version made by: 2.0
      cdView.setUint16(6, 20, true);         // Version needed: 2.0
      cdView.setUint16(8, 0, true);          // Flags
      cdView.setUint16(10, meta.method, true);
      cdView.setUint16(12, 0, true);
      cdView.setUint16(14, 0, true);
      cdView.setUint32(16, meta.crc, true);
      cdView.setUint32(20, meta.compressed.length, true);
      cdView.setUint32(24, meta.data.length, true);
      cdView.setUint16(28, meta.nameBytes.length, true);
      cdView.setUint16(30, 0, true);         // Extra field length
      cdView.setUint16(32, 0, true);         // File comment length
      cdView.setUint16(34, 0, true);         // Disk number
      cdView.setUint16(36, 0, true);         // Internal attributes
      cdView.setUint32(38, 0, true);         // External attributes
      cdView.setUint32(42, meta.localHeaderOffset, true); // Local header offset
      cdHeader.set(meta.nameBytes, 46);

      cdChunks.push(cdHeader);
      currentOffset += cdHeader.length;
    }

    const cdLength = currentOffset - cdStartOffset;

    // 3. 编码 End of Central Directory (EOCD: 22 字节)
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength);

    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);          // Disk number
    eocdView.setUint16(6, 0, true);          // Disk with CD
    eocdView.setUint16(8, metaList.length, true);  // Number of entries on disk
    eocdView.setUint16(10, metaList.length, true); // Total entries
    eocdView.setUint32(12, cdLength, true);        // CD size
    eocdView.setUint32(16, cdStartOffset, true);   // CD offset
    eocdView.setUint16(20, 0, true);               // Comment length

    // 4. 拼接完整二进制 Buffer
    const totalSize = currentOffset + eocd.length;
    const finalBuffer = new Uint8Array(totalSize);

    let writePos = 0;
    for (const chunk of localChunks) {
      finalBuffer.set(chunk, writePos);
      writePos += chunk.length;
    }
    for (const chunk of cdChunks) {
      finalBuffer.set(chunk, writePos);
      writePos += chunk.length;
    }
    finalBuffer.set(eocd, writePos);

    if (destPath && typeof destPath === 'string') {
      const fs = getDynamicNodeModule('node:fs');
      const path = getDynamicNodeModule('node:path');
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(destPath, Buffer.from(finalBuffer));
    }

    return finalBuffer;
  }
}
