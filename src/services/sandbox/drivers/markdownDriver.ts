/**
 * MarkdownDriver 纯算法 Markdown / 纯文本驱动实现
 *
 * 核心特性:
 * 1. 零宿主依赖: 纯 TypeScript 实现，无任何 react-native 或 expo 运行时依赖；
 * 2. 稳定块 ID (Non-Drifting Block ID): 基于内容哈希 + 局部重复计数器，任一段落修改不影响其他段落 ID；
 * 3. 结构感知索引: 精准识别 Frontmatter、标题、围栏代码块、GFM 表格、引用、列表与段落；
 * 4. 局部按需读取 (O(1)): 基于 byteRange 直接定位切片，避免重复全量遍历；
 * 5. 批量多锚点修补 (doc_batch_patch): 结合 IndexPreservingFuzzyPatcher 实施三级容错与逆序安全修补；
 * 6. 支持企业级修订留痕 (Track Changes): 自动生成 <del>...</del><ins>...</ins> 差异标记。
 */

import { sha256 } from '@noble/hashes/sha2.js';
import type {
  IDocumentDriver,
  DocumentBlockSkeleton,
  DocumentBlockKind,
  PatchHunk,
  PatchDiagnostic,
  PatchBatchResult,
  DocumentDriverOptions,
  DocumentPatchOptions,
} from './baseDriver';
import { normalizeBlockId } from './baseDriver';
import { applyBatchSafely } from '../diff/fuzzyPatcher';

/**
 * 辅助：将 Uint8Array 转为十六进制字符串 (小写)
 */
function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    hex += (byte < 16 ? '0' : '') + byte.toString(16);
  }
  return hex;
}

/**
 * 辅助：计算稳定块 ID
 */
function computeStableBlockId(
  kind: DocumentBlockKind,
  previewText: string,
  occurrenceMap: Map<string, number>
): string {
  const normalizedSeed = previewText.trim().toLowerCase().slice(0, 80);
  const seed = normalizedSeed.length > 0 ? `${kind}:${normalizedSeed}` : `${kind}:empty`;
  const digest = sha256(new TextEncoder().encode(seed));
  // 截取前 4 字节转为 8 位十六进制字符
  const hex = bytesToHex(digest.slice(0, 4));

  const count = occurrenceMap.get(hex) || 0;
  occurrenceMap.set(hex, count + 1);
  const suffix = count > 0 ? `_${count}` : '';
  return `[[BLK_${hex}${suffix}]]`;
}

/**
 * 辅助：解析文本内容 (支持直接传入文本，或通过注入的 storage 读取文件)
 */
async function resolveContent(
  contentOrUri: string | Uint8Array,
  options?: DocumentDriverOptions
): Promise<string> {
  if (contentOrUri instanceof Uint8Array) {
    return new TextDecoder('utf-8').decode(contentOrUri);
  }
  if (options?.storage && typeof options.storage.readText === 'function') {
    try {
      if (typeof options.storage.exists === 'function') {
        const exists = await options.storage.exists(contentOrUri);
        if (exists) {
          return await options.storage.readText(contentOrUri);
        }
      } else {
        return await options.storage.readText(contentOrUri);
      }
    } catch {
      // 降级使用 raw content
    }
  }
  return contentOrUri;
}

export class MarkdownDriver implements IDocumentDriver {
  public readonly supportedExtensions = ['.md', '.markdown', '.txt'] as const;

  /**
   * 1. 骨架解析与结构化索引
   */
  public async inspectSkeleton(
    contentOrUri: string | Uint8Array,
    options?: DocumentDriverOptions
  ): Promise<DocumentBlockSkeleton[]> {
    const text = await resolveContent(contentOrUri, options);
    const len = text.length;
    if (len === 0) return [];

    const blocks: DocumentBlockSkeleton[] = [];
    const occurrenceMap = new Map<string, number>();
    let cursor = 0;
    let sectionIndex = 0;

    // 1. 检查 YAML Frontmatter (必须从索引 0 开始)
    if (text.startsWith('---')) {
      const closingIdx = text.indexOf('\n---', 3);
      if (closingIdx !== -1) {
        let afterClosing = closingIdx + 4;
        if (text[afterClosing] === '\r') afterClosing++;
        if (text[afterClosing] === '\n') afterClosing++;

        const frontmatterText = text.slice(0, closingIdx + 4);
        const preview = frontmatterText.slice(0, 80).replace(/\r?\n/g, ' ').trim();
        const blockId = computeStableBlockId('frontmatter', preview, occurrenceMap);

        blocks.push({
          blockId,
          kind: 'frontmatter',
          pageOrSectionIndex: sectionIndex,
          previewText: preview,
          byteRange: [0, closingIdx + 4],
        });
        cursor = afterClosing;
      }
    }

    // 辅助行扫描
    const getLineEnd = (pos: number): number => {
      const nextNewline = text.indexOf('\n', pos);
      return nextNewline === -1 ? len : nextNewline;
    };

    while (cursor < len) {
      // 跳过段落之间的空行与多余空白
      while (cursor < len && (text[cursor] === ' ' || text[cursor] === '\t' || text[cursor] === '\r' || text[cursor] === '\n')) {
        cursor++;
      }
      if (cursor >= len) break;

      const blockStart = cursor;
      const lineEnd = getLineEnd(cursor);
      const rawFirstLine = text.slice(cursor, lineEnd);
      const firstLineTrimmed = rawFirstLine.trim();

      // 2. 围栏代码块 (``` 或 ~~~)
      if (firstLineTrimmed.startsWith('```') || firstLineTrimmed.startsWith('~~~')) {
        const fenceMarker = firstLineTrimmed.slice(0, 3);
        const lang = firstLineTrimmed.slice(3).trim();
        let searchPos = lineEnd + 1;
        let blockEnd = len;

        while (searchPos < len) {
          const nextEnd = getLineEnd(searchPos);
          const line = text.slice(searchPos, nextEnd).trim();
          if (line.startsWith(fenceMarker)) {
            blockEnd = nextEnd;
            cursor = nextEnd + 1;
            break;
          }
          searchPos = nextEnd + 1;
        }

        const rawCode = text.slice(blockStart, blockEnd);
        const preview = rawCode.slice(0, 80).replace(/\r?\n/g, ' ').trim();
        const blockId = computeStableBlockId('code', preview, occurrenceMap);

        blocks.push({
          blockId,
          kind: 'code',
          pageOrSectionIndex: sectionIndex,
          previewText: preview,
          byteRange: [blockStart, blockEnd],
          meta: { language: lang },
        });
        continue;
      }

      // 3. ATX 标题 (# 开头)
      const atxMatch = firstLineTrimmed.match(/^(#{1,6})\s+(.*)$/);
      if (atxMatch) {
        const level = atxMatch[1].length;
        if (level === 1 || level === 2) {
          sectionIndex++;
        }
        const preview = firstLineTrimmed.slice(0, 80);
        const blockId = computeStableBlockId('heading', preview, occurrenceMap);

        blocks.push({
          blockId,
          kind: 'heading',
          pageOrSectionIndex: sectionIndex,
          previewText: preview,
          byteRange: [blockStart, lineEnd],
          meta: { level },
        });
        cursor = lineEnd + 1;
        continue;
      }

      // 4. 水平分割线 (Thematic Break)
      if (/^([-*_]\s*){3,}$/.test(firstLineTrimmed)) {
        const preview = firstLineTrimmed.slice(0, 80);
        const blockId = computeStableBlockId('thematic_break', preview, occurrenceMap);

        blocks.push({
          blockId,
          kind: 'thematic_break',
          pageOrSectionIndex: sectionIndex,
          previewText: preview,
          byteRange: [blockStart, lineEnd],
        });
        cursor = lineEnd + 1;
        continue;
      }

      // 5. GFM 表格 (第一行含 | 且第二行具有分割线格式 |---|)
      if (firstLineTrimmed.includes('|') && lineEnd < len) {
        const secondLineEnd = getLineEnd(lineEnd + 1);
        const secondLine = text.slice(lineEnd + 1, secondLineEnd).trim();
        if (/^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(secondLine)) {
          // 确认为表格，扫描后续所有包含 | 的行
          let tableEnd = secondLineEnd;
          let nextScan = secondLineEnd + 1;
          while (nextScan < len) {
            const rowEnd = getLineEnd(nextScan);
            const row = text.slice(nextScan, rowEnd).trim();
            if (!row.includes('|') || row.length === 0) {
              break;
            }
            tableEnd = rowEnd;
            nextScan = rowEnd + 1;
          }

          const rawTable = text.slice(blockStart, tableEnd);
          const preview = rawTable.slice(0, 80).replace(/\r?\n/g, ' ').trim();
          const blockId = computeStableBlockId('table', preview, occurrenceMap);

          blocks.push({
            blockId,
            kind: 'table',
            pageOrSectionIndex: sectionIndex,
            previewText: preview,
            byteRange: [blockStart, tableEnd],
          });
          cursor = tableEnd + 1;
          continue;
        }
      }

      // 6. 块引用 (Blockquote)
      if (firstLineTrimmed.startsWith('>')) {
        let bqEnd = lineEnd;
        let nextScan = lineEnd + 1;
        while (nextScan < len) {
          const rowEnd = getLineEnd(nextScan);
          const row = text.slice(nextScan, rowEnd);
          const trimmed = row.trim();
          if (trimmed.length === 0 || (!trimmed.startsWith('>') && !row.startsWith(' '))) {
            break;
          }
          bqEnd = rowEnd;
          nextScan = rowEnd + 1;
        }

        const rawBq = text.slice(blockStart, bqEnd);
        const preview = rawBq.slice(0, 80).replace(/\r?\n/g, ' ').trim();
        const blockId = computeStableBlockId('blockquote', preview, occurrenceMap);

        blocks.push({
          blockId,
          kind: 'blockquote',
          pageOrSectionIndex: sectionIndex,
          previewText: preview,
          byteRange: [blockStart, bqEnd],
        });
        cursor = bqEnd + 1;
        continue;
      }

      // 7. 列表 (有序 1. 或 无序 - / * / +)
      const isListStart = /^(\s*)(\d+\.|[-*+])\s+/.test(rawFirstLine);
      if (isListStart) {
        let listEnd = lineEnd;
        let nextScan = lineEnd + 1;
        while (nextScan < len) {
          const rowEnd = getLineEnd(nextScan);
          const row = text.slice(nextScan, rowEnd);
          const trimmed = row.trim();
          if (trimmed.length === 0) {
            // 遇到空行需检查下一行是否仍为列表项缩进
            const peekEnd = getLineEnd(rowEnd + 1);
            const peekRow = text.slice(rowEnd + 1, peekEnd);
            if (/^(\s{2,}|\t)(\d+\.|[-*+])\s+/.test(peekRow)) {
              listEnd = rowEnd;
              nextScan = rowEnd + 1;
              continue;
            }
            break;
          }
          // 遇到标题或代码块立即终止列表
          if (trimmed.startsWith('#') || trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
            break;
          }
          listEnd = rowEnd;
          nextScan = rowEnd + 1;
        }

        const rawList = text.slice(blockStart, listEnd);
        const preview = rawList.slice(0, 80).replace(/\r?\n/g, ' ').trim();
        const blockId = computeStableBlockId('list', preview, occurrenceMap);

        blocks.push({
          blockId,
          kind: 'list',
          pageOrSectionIndex: sectionIndex,
          previewText: preview,
          byteRange: [blockStart, listEnd],
        });
        cursor = listEnd + 1;
        continue;
      }

      // 8. 普通段落 (扫描连续非空行，遇空行或结构标记终止)
      let paraEnd = lineEnd;
      let nextScan = lineEnd + 1;
      let isSetextHeading = false;
      let setextLevel = 0;

      // 检查 Setext 标题 (如文字下一行为 === 或 ---)
      if (lineEnd < len) {
        const nextRowEnd = getLineEnd(lineEnd + 1);
        const nextRowTrimmed = text.slice(lineEnd + 1, nextRowEnd).trim();
        if (/^=+$/.test(nextRowTrimmed)) {
          isSetextHeading = true;
          setextLevel = 1;
          paraEnd = nextRowEnd;
        } else if (/^-+$/.test(nextRowTrimmed)) {
          isSetextHeading = true;
          setextLevel = 2;
          paraEnd = nextRowEnd;
        }
      }

      if (isSetextHeading) {
        if (setextLevel === 1 || setextLevel === 2) sectionIndex++;
        const preview = firstLineTrimmed.slice(0, 80);
        const blockId = computeStableBlockId('heading', preview, occurrenceMap);

        blocks.push({
          blockId,
          kind: 'heading',
          pageOrSectionIndex: sectionIndex,
          previewText: preview,
          byteRange: [blockStart, paraEnd],
          meta: { level: setextLevel },
        });
        cursor = paraEnd + 1;
        continue;
      }

      // 普通多行段落扫描
      while (nextScan < len) {
        const rowEnd = getLineEnd(nextScan);
        const row = text.slice(nextScan, rowEnd);
        const trimmed = row.trim();
        if (trimmed.length === 0) break;

        // 遇到新的结构标签边界即终止当前段落
        if (
          trimmed.startsWith('#') ||
          trimmed.startsWith('```') ||
          trimmed.startsWith('~~~') ||
          trimmed.startsWith('>') ||
          /^(\s*)(\d+\.|[-*+])\s+/.test(row) ||
          /^([-*_]\s*){3,}$/.test(trimmed)
        ) {
          break;
        }

        paraEnd = rowEnd;
        nextScan = rowEnd + 1;
      }

      const rawPara = text.slice(blockStart, paraEnd);
      const preview = rawPara.slice(0, 80).replace(/\r?\n/g, ' ').trim();
      const blockId = computeStableBlockId('paragraph', preview, occurrenceMap);

      blocks.push({
        blockId,
        kind: 'paragraph',
        pageOrSectionIndex: sectionIndex,
        previewText: preview,
        byteRange: [blockStart, paraEnd],
      });
      cursor = paraEnd + 1;
    }

    return blocks;
  }

  /**
   * 2. 按块 ID 局部按需读取 (绝不全量加载)
   */
  public async readBlocks(
    contentOrUri: string | Uint8Array,
    blockIds: string[],
    options?: DocumentDriverOptions
  ): Promise<Record<string, string>> {
    if (!blockIds || blockIds.length === 0) return {};

    // 优先复用调用方传入的已有骨架索引，避免重复全篇扫描
    const skeleton = options?.skeleton || (await this.inspectSkeleton(contentOrUri, options));

    // 建立索引映射：同时支持规范化 ID 与原始 ID
    const blockMap = new Map<string, DocumentBlockSkeleton>();
    for (const b of skeleton) {
      blockMap.set(normalizeBlockId(b.blockId), b);
      blockMap.set(b.blockId, b);
    }

    const result: Record<string, string> = {};
    const canReadSlice =
      options?.storage &&
      typeof options.storage.readSlice === 'function' &&
      typeof contentOrUri === 'string' &&
      !contentOrUri.includes('\n');

    let fullText: string | null = null;

    for (const requestedId of blockIds) {
      const normId = normalizeBlockId(requestedId);
      const matched = blockMap.get(normId);
      if (matched && matched.byteRange) {
        const [start, end] = matched.byteRange;
        const length = end - start;
        let slice: string;

        if (canReadSlice) {
          try {
            slice = await options!.storage!.readSlice!(contentOrUri, start, length);
          } catch {
            if (fullText === null) {
              fullText = await resolveContent(contentOrUri, options);
            }
            slice = fullText.slice(start, end);
          }
        } else {
          if (fullText === null) {
            fullText = await resolveContent(contentOrUri, options);
          }
          slice = fullText.slice(start, end);
        }

        result[matched.blockId] = slice;
        if (requestedId !== matched.blockId) {
          result[requestedId] = slice;
        }
      }
    }

    return result;
  }

  /**
   * 3. 批量事务修补 (支持多处修改，可配置原子回滚或部分应用)
   */
  public async applyPatchBatch(
    contentOrUri: string | Uint8Array,
    hunks: PatchHunk[],
    options?: DocumentPatchOptions
  ): Promise<PatchBatchResult> {
    const originalText = await resolveContent(contentOrUri, options);
    if (!hunks || hunks.length === 0) {
      return {
        newContent: originalText,
        appliedCount: 0,
        totalHunks: 0,
        diagnostics: [],
      };
    }

    const skeleton = options?.skeleton || (await this.inspectSkeleton(originalText, options));

    // 建立 normalizedId -> skeleton 索引
    const blockMap = new Map<string, DocumentBlockSkeleton>();
    for (const b of skeleton) {
      blockMap.set(normalizeBlockId(b.blockId), b);
      blockMap.set(b.blockId, b);
    }

    interface ResolvedHunk {
      hunk: PatchHunk;
      globalStart: number;
      globalEnd: number;
      replacementText: string;
      tierUsed: 1 | 2 | 3;
      similarity: number;
    }

    const resolvedList: ResolvedHunk[] = [];
    const diagnostics: PatchDiagnostic[] = [];

    // 逐个 hunk 定位并验证
    for (const hunk of hunks) {
      const targetNorm = normalizeBlockId(hunk.targetBlockId);
      let targetBlock = blockMap.get(targetNorm);

      // 若为全局通配目标 '*' 或 'all'
      if (!targetBlock && (targetNorm === '*' || targetNorm === 'all')) {
        const matches = skeleton.filter((b) => {
          if (!b.byteRange) return false;
          const content = originalText.slice(b.byteRange[0], b.byteRange[1]);
          return content.includes(hunk.search);
        });
        if (matches.length === 1) {
          targetBlock = matches[0];
        } else if (matches.length > 1) {
          diagnostics.push({
            blockId: hunk.targetBlockId,
            applied: false,
            error: 'AMBIGUOUS_MATCH',
            warning: `全局搜索 "${hunk.search}" 在多个块中命中，触发二义性保护`,
          });
          continue;
        }
      }

      if (!targetBlock || !targetBlock.byteRange) {
        diagnostics.push({
          blockId: hunk.targetBlockId,
          applied: false,
          error: 'BLOCK_NOT_FOUND',
          warning: `未找到目标块 ID: "${hunk.targetBlockId}"`,
        });
        continue;
      }

      const [blockStart, blockEnd] = targetBlock.byteRange;
      const blockText = originalText.slice(blockStart, blockEnd);

      // 委托 IndexPreservingFuzzyPatcher 在块内实施三级容错定位
      const patchResult = applyBatchSafely(blockText, [
        {
          id: hunk.targetBlockId,
          search: hunk.search,
          replace: hunk.replace,
          contextBefore: hunk.contextBefore,
          contextAfter: hunk.contextAfter,
        },
      ]);

      const diag = patchResult.diagnostics[0];
      if (diag && diag.status === 'applied' && diag.rawRange) {
        const [relStart, relEnd] = diag.rawRange;
        const globalStart = blockStart + relStart;
        const globalEnd = blockStart + relEnd;
        const matchedRaw = blockText.slice(relStart, relEnd);

        // 处理企业级修订留痕 (Track Changes)
        let replacementText = hunk.replace;
        if (hunk.trackChanges) {
          replacementText = `<del>${matchedRaw}</del><ins>${hunk.replace}</ins>`;
        }

        resolvedList.push({
          hunk,
          globalStart,
          globalEnd,
          replacementText,
          tierUsed: diag.tierUsed || 1,
          similarity: diag.similarity || 1.0,
        });
      } else {
        diagnostics.push({
          blockId: hunk.targetBlockId,
          applied: false,
          error: diag?.status || 'NOT_FOUND',
          warning: diag?.message || `在目标块中未找到匹配文本: "${hunk.search}"`,
        });
      }
    }

    // 检查各 hunk 是否在文档全局存在修改区间交叠冲突
    resolvedList.sort((a, b) => a.globalStart - b.globalStart);
    const overlappedSet = new Set<PatchHunk>();

    for (let i = 0; i < resolvedList.length; i++) {
      const cur = resolvedList[i];
      for (let j = 0; j < i; j++) {
        const prev = resolvedList[j];
        if (cur.globalStart < prev.globalEnd) {
          overlappedSet.add(cur.hunk);
          overlappedSet.add(prev.hunk);
        }
      }
    }

    for (const item of resolvedList) {
      if (overlappedSet.has(item.hunk)) {
        diagnostics.push({
          blockId: item.hunk.targetBlockId,
          applied: false,
          error: 'OVERLAPPING_HUNK',
          warning: '该 hunk 的修改区间与另一处修改发生交叠，已安全拦截',
        });
      }
    }

    const validHunks = resolvedList.filter((item) => !overlappedSet.has(item.hunk));

    // 原子模式判定：若开启 atomic 且有任一 hunk 未成功，则整批回滚
    const isAtomic = options?.atomic === true;
    if (isAtomic && validHunks.length < hunks.length) {
      return {
        newContent: originalText,
        appliedCount: 0,
        totalHunks: hunks.length,
        diagnostics,
      };
    }

    // 逆序替换：严格按 globalStart 从大到小替换，确保前序偏移绝不发生漂移
    validHunks.sort((a, b) => b.globalStart - a.globalStart);

    let currentText = originalText;
    for (const item of validHunks) {
      currentText =
        currentText.slice(0, item.globalStart) +
        item.replacementText +
        currentText.slice(item.globalEnd);

      diagnostics.push({
        blockId: item.hunk.targetBlockId,
        applied: true,
        tierUsed: item.tierUsed,
        rawRange: [item.globalStart, item.globalEnd],
        similarity: item.similarity,
      });
    }

    // 若传入了 storage 驱动且文本发生变化，同步落盘
    let newVfsUri: string | undefined;
    if (options?.storage && typeof options.storage.writeText === 'function' && typeof contentOrUri === 'string') {
      try {
        await options.storage.writeText(contentOrUri, currentText);
        newVfsUri = contentOrUri;
      } catch {
        // 忽略存储写入异常，不破坏 newContent 返回
      }
    }

    return {
      newContent: currentText,
      newVfsUri,
      appliedCount: validHunks.length,
      totalHunks: hunks.length,
      diagnostics,
    };
  }
}
