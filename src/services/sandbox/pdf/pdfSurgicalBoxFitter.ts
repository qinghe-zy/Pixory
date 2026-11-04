/**
 * PdfSurgicalBoxFitter PDF 盒内手术弹性微缩拟合器 (纯函数内核 - 零宿主依赖)
 *
 * 审查发现落实:
 * 1. 审查 #6: 宽度测量由外部注入 (measureWidth)，杜绝 0.56 硬编码带来的 15% 字体宽度误差;
 * 2. 盒内物理守恒: 二分搜索最优字号与字间距压缩量，确保文本严格居于原包围盒内，绝不外溢破坏版面;
 * 3. CJK 与英文自适应折行: 支持按词或按字断行，智能计算行距与高度限制。
 */

import type {
  BoxFitRequest,
  BoxFitResult,
  FittedLine,
} from './pdfBoxTypes';

export class PdfSurgicalBoxFitter {
  /**
   * 将长文本按照最大宽度折行 (贪心换行算法)
   */
  private static wrapText(
    text: string,
    maxWidthPt: number,
    fontSizePt: number,
    measureWidth: (t: string, size: number) => number,
    letterSpacingPt: number = 0
  ): FittedLine[] {
    if (!text) return [];

    // 计算单个字符附加字间距后的实际占用
    const effectiveWidth = (str: string): number => {
      const baseWidth = measureWidth(str, fontSizePt);
      const extraSpacing = (str.length - 1) * letterSpacingPt;
      return baseWidth + Math.max(0, extraSpacing);
    };

    const lines: FittedLine[] = [];
    let currentLine = '';

    // 支持以空格分词 (英文) 或按字符断开 (CJK)
    const isCjk = /[\u4e00-\u9fa5]/.test(text);
    const tokens = isCjk ? text.split('') : text.split(/(\s+)/);

    for (const token of tokens) {
      if (!token) continue;
      const testLine = currentLine + token;
      const width = effectiveWidth(testLine);

      if (width <= maxWidthPt || currentLine.length === 0) {
        currentLine = testLine;
      } else {
        lines.push({ text: currentLine.trimEnd(), widthPt: effectiveWidth(currentLine.trimEnd()) });
        currentLine = token.trimStart();
      }
    }

    if (currentLine.length > 0) {
      lines.push({ text: currentLine, widthPt: effectiveWidth(currentLine) });
    }

    return lines;
  }

  /**
   * 盒内弹性微缩拟合核心函数
   */
  public static fitTextInBox(request: BoxFitRequest): BoxFitResult {
    const {
      text,
      box,
      initialFontSizePt,
      measureWidth,
      lineHeightRatio = 1.2,
      allowWrap = true,
    } = request;

    const minFontSizePt = request.minFontSizePt ?? Math.max(6, initialFontSizePt * 0.65);

    if (!text || text.trim().length === 0) {
      return {
        fits: true,
        fontSizePt: initialFontSizePt,
        letterSpacingPt: 0,
        lines: [],
        scaleRatio: 1.0,
      };
    }

    // 1. 尝试以 initialFontSizePt 原字号排布
    const testInitialLines = this.wrapText(text, box.width, initialFontSizePt, measureWidth, 0);
    const initialLineHeight = initialFontSizePt * lineHeightRatio;
    const initialTotalHeight = testInitialLines.length * initialLineHeight;
    const initialMaxLineWidth = Math.max(...testInitialLines.map((l) => l.widthPt), 0);

    const maxAllowedLines = allowWrap
      ? Math.max(1, Math.floor(box.height / (minFontSizePt * lineHeightRatio)))
      : 1;

    if (
      initialMaxLineWidth <= box.width &&
      initialTotalHeight <= box.height &&
      (!allowWrap ? testInitialLines.length <= 1 : true)
    ) {
      return {
        fits: true,
        fontSizePt: initialFontSizePt,
        letterSpacingPt: 0,
        lines: testInitialLines,
        scaleRatio: 1.0,
      };
    }

    // 2. 二分搜索最优字号 (精度 0.25 pt)
    let low = minFontSizePt;
    let high = initialFontSizePt;
    let bestSize = minFontSizePt;
    let bestLines: FittedLine[] = [];
    let fitsFound = false;

    for (let iter = 0; iter < 12; iter++) {
      const mid = Math.round(((low + high) / 2) * 4) / 4;
      const currentLineHeight = mid * lineHeightRatio;
      const lines = this.wrapText(text, box.width, mid, measureWidth, 0);
      const totalHeight = lines.length * currentLineHeight;
      const maxLineWidth = Math.max(...lines.map((l) => l.widthPt), 0);

      const withinBox =
        maxLineWidth <= box.width &&
        totalHeight <= box.height &&
        (!allowWrap ? lines.length <= 1 : true);

      if (withinBox) {
        fitsFound = true;
        bestSize = mid;
        bestLines = lines;
        low = mid + 0.25; // 尝试更大字号以最大化易读性
      } else {
        high = mid - 0.25;
      }

      if (low > high) break;
    }

    if (fitsFound) {
      return {
        fits: true,
        fontSizePt: bestSize,
        letterSpacingPt: 0,
        lines: bestLines,
        scaleRatio: bestSize / initialFontSizePt,
      };
    }

    // 3. 达到 minFontSize 依然超宽时，启动字间距微调压缩 (至多压缩 -0.5 pt)
    let letterSpacing = 0;
    let compressedLines: FittedLine[] = [];

    for (let ls = -0.1; ls >= -0.5; ls -= 0.1) {
      const lines = this.wrapText(text, box.width, minFontSizePt, measureWidth, ls);
      const currentLineHeight = minFontSizePt * lineHeightRatio;
      const totalHeight = lines.length * currentLineHeight;
      const maxLineWidth = Math.max(...lines.map((l) => l.widthPt), 0);

      if (
        maxLineWidth <= box.width &&
        totalHeight <= box.height &&
        (!allowWrap ? lines.length <= 1 : true)
      ) {
        letterSpacing = ls;
        compressedLines = lines;
        fitsFound = true;
        break;
      }
    }

    if (fitsFound) {
      return {
        fits: true,
        fontSizePt: minFontSizePt,
        letterSpacingPt: letterSpacing,
        lines: compressedLines,
        scaleRatio: minFontSizePt / initialFontSizePt,
        diagnostic: `已启动字间距微缩 (${letterSpacing}pt) 以适应包围盒`,
      };
    }

    // 4. 极端超限情况：强制截断在最后一行加省略号，坚决不重叠破坏相邻图元
    const fallbackLines = this.wrapText(text, box.width, minFontSizePt, measureWidth, -0.5);
    const safeLines = fallbackLines.slice(0, maxAllowedLines);
    if (safeLines.length > 0 && fallbackLines.length > maxAllowedLines) {
      const lastLine = safeLines[safeLines.length - 1];
      safeLines[safeLines.length - 1] = {
        text: lastLine.text.slice(0, Math.max(1, lastLine.text.length - 2)) + '...',
        widthPt: box.width,
      };
    }

    return {
      fits: false,
      fontSizePt: minFontSizePt,
      letterSpacingPt: -0.5,
      lines: safeLines,
      scaleRatio: minFontSizePt / initialFontSizePt,
      diagnostic: '文本超出包围盒最大弹性容限，已安全截断防溢出',
    };
  }
}
