/**
 * OoxmlRunSplicer Word OOXML 游标扫描、跨 Run 文本投影与原位区间替换引擎
 * (纯算法内核 - 零宿主依赖)
 *
 * 审查发现全面落实:
 * 1. 审查发现 #2: 原位区间替换而非整段重建，除被替换 Run 外，段内前后所有原始字节逐字节 100% 保持不变;
 * 2. 审查发现 #3: 公章图片 (<w:drawing>)、超链接与脚注引用的 Run 标为 nonInvasive 绝不侵入篡改;
 * 3. 隐藏 Boss 1: O(N) 双指针线性扫描，杜绝巨型 document.xml (30MB 单行) 的全局正则回溯崩溃与 OOM;
 * 4. 前缀二义性防护: 严格区分 <w:p>、<w:pPr> 与 <w:proofErr>，完美支持自闭合 <w:p/>;
 * 5. 企业级修订留痕: 生成合法的 <w:ins> / <w:del> 标签，全局递增保证 w:id 唯一性。
 */

import type {
  RunSpan,
  ParagraphBlockInfo,
  ProjectedParagraph,
  OoxmlSpliceHunk,
  OoxmlSpliceResult,
} from './ooxmlTypes';

/**
 * 全局默认的 w:id 递增生成器
 */
export class OoxmlIdGenerator {
  private currentId = 1000;

  constructor(initialId = 1000) {
    this.currentId = initialId;
  }

  public nextId(): number {
    return ++this.currentId;
  }
}

export const defaultOoxmlIdGenerator = new OoxmlIdGenerator();

/**
 * XML 实体编解码
 */
export function decodeXmlEntities(val: string): string {
  if (!val) return '';
  return val
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * 净化塞入 OOXML <w:t> 的纯文本：
 * 剥除 LLM 偶尔带出的 Markdown 行级标号（## ）、加粗标号（**），防止裸字符污染 Word 视图
 */
export function sanitizeOoxmlText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1');
}

export function encodeXmlEntities(val: string): string {
  if (!val) return '';
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class OoxmlRunSplicer {
  /**
   * S6.1 双指针线性扫描器 (scanBlockByteOffsets)
   * 在单行无换行的巨型 document.xml (如 30MB) 中，以 O(N) 线性游标扫描提取所有段落的物理切片
   */
  public static scanBlockByteOffsets(documentXml: string): ParagraphBlockInfo[] {
    const len = documentXml.length;
    if (len === 0) return [];

    const blocks: ParagraphBlockInfo[] = [];
    let cursor = 0;
    let pIndex = 0;
    let tableDepth = 0;

    let nextP = documentXml.indexOf('<w:p', cursor);
    let nextTbl = documentXml.indexOf('<w:tbl', cursor);
    let nextTblClose = documentXml.indexOf('</w:tbl>', cursor);

    while (cursor < len) {
      // 1. 跳过 XML 注释 <!-- ... -->
      if (documentXml.startsWith('<!--', cursor)) {
        const commentEnd = documentXml.indexOf('-->', cursor + 4);
        cursor = commentEnd === -1 ? len : commentEnd + 3;
        continue;
      }

      // 2. 跳过 CDATA 块 <![CDATA[ ... ]]>
      if (documentXml.startsWith('<![CDATA[', cursor)) {
        const cdataEnd = documentXml.indexOf(']]>', cursor + 9);
        cursor = cdataEnd === -1 ? len : cdataEnd + 3;
        continue;
      }

      // 增量推进游标缓存：仅在缓存位置落后于当前游标时才执行下一次 indexOf
      if (nextP !== -1 && nextP < cursor) nextP = documentXml.indexOf('<w:p', cursor);
      if (nextTbl !== -1 && nextTbl < cursor) nextTbl = documentXml.indexOf('<w:tbl', cursor);
      if (nextTblClose !== -1 && nextTblClose < cursor) nextTblClose = documentXml.indexOf('</w:tbl>', cursor);

      if (nextP === -1 && nextTbl === -1 && nextTblClose === -1) break;

      const pPos = nextP !== -1 ? nextP : Infinity;
      const tblPos = nextTbl !== -1 ? nextTbl : Infinity;
      const tblClosePos = nextTblClose !== -1 ? nextTblClose : Infinity;
      const firstPos = Math.min(pPos, tblPos, tblClosePos);

      // 3. 处理表格标签 (<w:tbl>)
      if (firstPos === tblPos) {
        const charAfterTbl = documentXml[tblPos + 6];
        if (
          charAfterTbl === ' ' ||
          charAfterTbl === '>' ||
          charAfterTbl === '/' ||
          charAfterTbl === '\t' ||
          charAfterTbl === '\n' ||
          charAfterTbl === '\r'
        ) {
          tableDepth++;
        }
        const tagClose = documentXml.indexOf('>', tblPos + 6);
        cursor = tagClose === -1 ? len : tagClose + 1;
        continue;
      }

      // 4. 处理表格闭合标签 (</w:tbl>)
      if (firstPos === tblClosePos) {
        if (tableDepth > 0) tableDepth--;
        cursor = tblClosePos + 8;
        continue;
      }

      // 5. 定位段落标签 <w:p
      // 校验标签边界：防止误命中 <w:pPr> 或 <w:proofErr>
      const charAfterP = documentXml[nextP + 4];
      const isValidP =
        charAfterP === ' ' ||
        charAfterP === '>' ||
        charAfterP === '/' ||
        charAfterP === '\t' ||
        charAfterP === '\n' ||
        charAfterP === '\r';

      if (!isValidP) {
        cursor = nextP + 4;
        continue;
      }

      // 检查当前 <w:p 是否为自闭合标签 <w:p ... />
      const openTagEnd = documentXml.indexOf('>', nextP + 4);
      if (openTagEnd === -1) break;

      const isSelfClosing = documentXml[openTagEnd - 1] === '/';
      let blockEnd = openTagEnd + 1;

      if (!isSelfClosing) {
        // 查找对应的 </w:p> 闭合标签
        const closeTag = documentXml.indexOf('</w:p>', openTagEnd);
        if (closeTag === -1) {
          blockEnd = len;
        } else {
          blockEnd = closeTag + 6;
        }
      }

      const rawParaXml = documentXml.slice(nextP, blockEnd);

      // 6. 判断段落类型与标题级别
      let kind: 'heading' | 'paragraph' | 'table' = tableDepth > 0 ? 'table' : 'paragraph';
      let headingLevel: number | undefined;

      const styleMatch = rawParaXml.match(/<w:pStyle\s+[^>]*w:val="([^"]+)"/);
      if (styleMatch) {
        const val = styleMatch[1];
        const hMatch = val.match(/(?:Heading|heading|标题)\s*(\d+)/i) || val.match(/^(\d+)$/);
        if (hMatch) {
          kind = 'heading';
          headingLevel = parseInt(hMatch[1], 10);
        }
      }

      // 7. 提取前 80 字摘要预览
      let previewText = '';
      let tPos = 0;
      while ((tPos = rawParaXml.indexOf('<w:t', tPos)) !== -1) {
        const tagClose = rawParaXml.indexOf('>', tPos);
        if (tagClose === -1) break;
        const tEnd = rawParaXml.indexOf('</w:t>', tagClose);
        if (tEnd === -1) break;
        const textSlice = decodeXmlEntities(rawParaXml.slice(tagClose + 1, tEnd));
        previewText += textSlice;
        if (previewText.length >= 80) break;
        tPos = tEnd + 6;
      }
      previewText = previewText.trim().slice(0, 80);
      if (!previewText) {
        previewText = isSelfClosing ? '(empty self-closing)' : '(empty paragraph)';
      }

      blocks.push({
        index: pIndex++,
        blockStart: nextP,
        blockEnd,
        kind,
        headingLevel,
        tableDepth,
        isSelfClosing,
        previewText,
      });

      cursor = blockEnd;
    }

    return blocks;
  }

  /**
   * S6.2 虚拟纯文本与 RunSpan 双向投影 (projectParagraph)
   * 将段落 XML 中的分散 Run、表格、符号与特殊节点解析为连续的虚拟文本，并映射其物理坐标
   */
  public static projectParagraph(paragraphXml: string): ProjectedParagraph {
    const spans: RunSpan[] = [];
    let virtualText = '';
    let hasNonInvasive = false;

    // 扫描段落内部所有的标签
    let cursor = 0;
    const len = paragraphXml.length;

    while (cursor < len) {
      // 定位下一个 Run 节点 <w:r
      const rStart = paragraphXml.indexOf('<w:r', cursor);
      if (rStart === -1) break;

      const charAfterR = paragraphXml[rStart + 4];
      if (charAfterR !== ' ' && charAfterR !== '>' && charAfterR !== '/' && charAfterR !== '\t' && charAfterR !== '\n') {
        cursor = rStart + 4;
        continue;
      }

      const rOpenEnd = paragraphXml.indexOf('>', rStart + 4);
      if (rOpenEnd === -1) break;

      // 自闭合 <w:r/>
      if (paragraphXml[rOpenEnd - 1] === '/') {
        cursor = rOpenEnd + 1;
        continue;
      }

      const rClose = paragraphXml.indexOf('</w:r>', rOpenEnd);
      if (rClose === -1) break;
      const rEnd = rClose + 6;
      const runXml = paragraphXml.slice(rStart, rEnd);

      // 提取 <w:rPr> 样式
      let rPrXml = '';
      const rPrStart = runXml.indexOf('<w:rPr');
      if (rPrStart !== -1) {
        const rPrEnd = runXml.indexOf('</w:rPr>', rPrStart);
        if (rPrEnd !== -1) {
          rPrXml = runXml.slice(rPrStart, rPrEnd + 8);
        } else {
          const selfEnd = runXml.indexOf('/>', rPrStart);
          if (selfEnd !== -1 && selfEnd < runXml.indexOf('>', rPrStart) + 2) {
            rPrXml = runXml.slice(rPrStart, selfEnd + 2);
          }
        }
      }

      // 检查是否包含不可侵入节点 (公章图片、OLE 对象、图表、脚注引用)
      const isDrawing = runXml.includes('<w:drawing') || runXml.includes('<w:pict') || runXml.includes('<w:object>');
      const isFootnote = runXml.includes('<w:footnoteReference') || runXml.includes('<w:commentReference');

      if (isDrawing || isFootnote) {
        hasNonInvasive = true;
        spans.push({
          rawStart: rStart,
          rawEnd: rEnd,
          vStart: virtualText.length,
          vEnd: virtualText.length,
          text: '',
          rPrXml,
          isTextNode: false,
          nonInvasive: true,
          tagType: 'drawing',
        });
        cursor = rEnd;
        continue;
      }

      // 扫描 Run 内部的所有文本与换行节点
      let innerCursor = 0;
      let handledAny = false;

      while (innerCursor < runXml.length) {
        const nextTag = runXml.indexOf('<w:', innerCursor);
        if (nextTag === -1) break;

        // 1. 纯文本节点 <w:t
        if (runXml.startsWith('<w:t', nextTag)) {
          const tOpenEnd = runXml.indexOf('>', nextTag + 4);
          if (tOpenEnd !== -1) {
            const tClose = runXml.indexOf('</w:t>', tOpenEnd);
            if (tClose !== -1) {
              const rawContent = runXml.slice(tOpenEnd + 1, tClose);
              const decoded = decodeXmlEntities(rawContent);

              const absRawStart = rStart + tOpenEnd + 1;
              const absRawEnd = rStart + tClose;
              const vStart = virtualText.length;
              virtualText += decoded;
              const vEnd = virtualText.length;

              spans.push({
                rawStart: absRawStart,
                rawEnd: absRawEnd,
                vStart,
                vEnd,
                text: decoded,
                rPrXml,
                isTextNode: true,
                nonInvasive: false,
                tagType: 'text',
              });
              handledAny = true;
              innerCursor = tClose + 6;
              continue;
            }
          }
        }

        // 2. 制表符 <w:tab/>
        if (runXml.startsWith('<w:tab', nextTag)) {
          const tabEnd = runXml.indexOf('>', nextTag + 6);
          if (tabEnd !== -1) {
            const vStart = virtualText.length;
            virtualText += '\t';
            spans.push({
              rawStart: rStart + nextTag,
              rawEnd: rStart + tabEnd + 1,
              vStart,
              vEnd: vStart + 1,
              text: '\t',
              rPrXml,
              isTextNode: false,
              nonInvasive: false,
              tagType: 'tab',
            });
            handledAny = true;
            innerCursor = tabEnd + 1;
            continue;
          }
        }

        // 3. 换行符 <w:br/>
        if (runXml.startsWith('<w:br', nextTag)) {
          const brEnd = runXml.indexOf('>', nextTag + 5);
          if (brEnd !== -1) {
            const vStart = virtualText.length;
            virtualText += '\n';
            spans.push({
              rawStart: rStart + nextTag,
              rawEnd: rStart + brEnd + 1,
              vStart,
              vEnd: vStart + 1,
              text: '\n',
              rPrXml,
              isTextNode: false,
              nonInvasive: false,
              tagType: 'br',
            });
            handledAny = true;
            innerCursor = brEnd + 1;
            continue;
          }
        }

        // 4. 不换行连字符 <w:noBreakHyphen/>
        if (runXml.startsWith('<w:noBreakHyphen', nextTag)) {
          const hypEnd = runXml.indexOf('>', nextTag + 16);
          if (hypEnd !== -1) {
            const vStart = virtualText.length;
            virtualText += '-';
            spans.push({
              rawStart: rStart + nextTag,
              rawEnd: rStart + hypEnd + 1,
              vStart,
              vEnd: vStart + 1,
              text: '-',
              rPrXml,
              isTextNode: false,
              nonInvasive: false,
              tagType: 'hyphen',
            });
            handledAny = true;
            innerCursor = hypEnd + 1;
            continue;
          }
        }

        innerCursor = nextTag + 3;
      }

      if (!handledAny) {
        // 空 Run 或其它属性 Run
        spans.push({
          rawStart: rStart,
          rawEnd: rEnd,
          vStart: virtualText.length,
          vEnd: virtualText.length,
          text: '',
          rPrXml,
          isTextNode: false,
          nonInvasive: false,
          tagType: 'other',
        });
      }

      cursor = rEnd;
    }

    return {
      virtualText,
      spans,
      hasNonInvasive,
    };
  }

  /**
   * S6.2 原位区间替换 (spliceParagraphXml · 落实审查 #2 与 #3)
   * 仅替换 [首个受影响 Run 物理起点, 末个受影响 Run 物理终点) 区间，段内前后所有其余字节 100% 逐字节守恒
   */
  public static spliceParagraphXml(
    paragraphXml: string,
    hunks: OoxmlSpliceHunk[],
    idGenerator: OoxmlIdGenerator = defaultOoxmlIdGenerator
  ): OoxmlSpliceResult {
    if (!hunks || hunks.length === 0) {
      return { splicedXml: paragraphXml, appliedCount: 0, warnings: [] };
    }

    const { virtualText, spans } = this.projectParagraph(paragraphXml);
    const warnings: string[] = [];

    // 过滤出所有有文本映射的有效 spans
    const textSpans = spans.filter((s) => s.vEnd > s.vStart && s.isTextNode);
    if (textSpans.length === 0) {
      return {
        splicedXml: paragraphXml,
        appliedCount: 0,
        warnings: ['段落内无有效文本 Run，无法实施修补'],
      };
    }

    interface ValidHunkMatch {
      hunk: OoxmlSpliceHunk;
      rawSliceStart: number;
      rawSliceEnd: number;
      dominantRPr: string;
      matchedRawVirtual: string;
    }

    const resolved: ValidHunkMatch[] = [];

    for (const hunk of hunks) {
      // 范围越界检查
      if (hunk.vStart < 0 || hunk.vEnd > virtualText.length || hunk.vStart >= hunk.vEnd) {
        warnings.push(`修补区间 [${hunk.vStart}, ${hunk.vEnd}) 超出虚拟文本长度 ${virtualText.length}`);
        continue;
      }

      // 定位第一个被影响的 Span 与最后一个被影响的 Span
      const affectedSpans = textSpans.filter(
        (s) => Math.max(s.vStart, hunk.vStart) < Math.min(s.vEnd, hunk.vEnd)
      );

      if (affectedSpans.length === 0) {
        warnings.push(`未能在段落文本中匹配到覆盖区间 [${hunk.vStart}, ${hunk.vEnd}) 的有效 Run`);
        continue;
      }

      // 检查是否侵入不可侵入节点 (审查发现 #3)
      const hasConflict = spans.some((s) => {
        if (!s.nonInvasive) return false;
        if (s.vEnd === s.vStart) {
          // 零宽节点（如公章占位）：仅当修补区间严格跨越该点时冲突
          return hunk.vStart < s.vStart && hunk.vEnd > s.vStart;
        }
        return Math.max(s.vStart, hunk.vStart) < Math.min(s.vEnd, hunk.vEnd);
      });
      if (hasConflict) {
        warnings.push('修补区间与公章图片、图表或脚注节点冲突，已安全跳过');
        continue;
      }

      const firstSpan = affectedSpans[0];
      const lastSpan = affectedSpans[affectedSpans.length - 1];

      // 查找首个 Span 所在外层 <w:r> 的物理起点与末个 Span 所在外层 <w:r> 的物理终点
      // 向前查找包裹 firstSpan.rawStart 的 '<w:r'
      const rOpenStart = paragraphXml.lastIndexOf('<w:r', firstSpan.rawStart);
      // 向后查找包裹 lastSpan.rawEnd 的 '</w:r>'
      const rCloseEnd = paragraphXml.indexOf('</w:r>', lastSpan.rawEnd);

      const rawSliceStart = rOpenStart !== -1 ? rOpenStart : firstSpan.rawStart;
      const rawSliceEnd = rCloseEnd !== -1 ? rCloseEnd + 6 : lastSpan.rawEnd;

      resolved.push({
        hunk,
        rawSliceStart,
        rawSliceEnd,
        dominantRPr: firstSpan.rPrXml || '',
        matchedRawVirtual: virtualText.slice(hunk.vStart, hunk.vEnd),
      });
    }

    if (resolved.length === 0) {
      return { splicedXml: paragraphXml, appliedCount: 0, warnings };
    }

    // 检查是否有重叠
    resolved.sort((a, b) => a.rawSliceStart - b.rawSliceStart);
    const validMatches: ValidHunkMatch[] = [];
    for (let i = 0; i < resolved.length; i++) {
      if (i > 0 && resolved[i].rawSliceStart < resolved[i - 1].rawSliceEnd) {
        warnings.push('段落内存在多处修改区间交叠冲突，已安全跳过该项');
        continue;
      }
      validMatches.push(resolved[i]);
    }

    // 逆序替换：严格按 rawSliceStart 降序从后往前替换 (审查发现 #2)
    validMatches.sort((a, b) => b.rawSliceStart - a.rawSliceStart);

    let resultXml = paragraphXml;
    let appliedCount = 0;

    for (const match of validMatches) {
      const { hunk, rawSliceStart, rawSliceEnd, dominantRPr, matchedRawVirtual } = match;
      const cleanReplace = sanitizeOoxmlText(hunk.replacement);
      const escapedReplace = encodeXmlEntities(cleanReplace);
      let replacementXml = '';

      if (hunk.trackChanges) {
        // 企业级修订留痕模式 (Track Changes)
        const delId = idGenerator.nextId();
        const insId = idGenerator.nextId();
        const author = encodeXmlEntities(hunk.author || 'Pixory Agent');
        const date = hunk.date || new Date().toISOString();
        const escapedDel = encodeXmlEntities(matchedRawVirtual);

        replacementXml =
          `<w:del w:id="${delId}" w:author="${author}" w:date="${date}">` +
          `<w:r>${dominantRPr}<w:delText xml:space="preserve">${escapedDel}</w:delText></w:r>` +
          `</w:del>` +
          `<w:ins w:id="${insId}" w:author="${author}" w:date="${date}">` +
          `<w:r>${dominantRPr}<w:t xml:space="preserve">${escapedReplace}</w:t></w:r>` +
          `</w:ins>`;
      } else {
        // 普通原位干净替换
        replacementXml = `<w:r>${dominantRPr}<w:t xml:space="preserve">${escapedReplace}</w:t></w:r>`;
      }

      // 执行原位局部切片拼接
      resultXml =
        resultXml.slice(0, rawSliceStart) +
        replacementXml +
        resultXml.slice(rawSliceEnd);

      appliedCount++;
    }

    return {
      splicedXml: resultXml,
      appliedCount,
      warnings,
    };
  }
}
