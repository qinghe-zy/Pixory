/**
 * PDF 盒内手术与版面微缩类型定义 (纯函数内核 - 零宿主依赖)
 */

export interface BoundingBox {
  /** 左下角 X 坐标 (点 pt) */
  x: number;
  /** 左下角 Y 坐标 (点 pt) */
  y: number;
  /** 包围盒宽度 (点 pt) */
  width: number;
  /** 包围盒高度 (点 pt) */
  height: number;
}

export type TextMeasureFunction = (text: string, fontSizePt: number) => number;

export interface BoxFitRequest {
  /** 待替换/填入的新文本 */
  text: string;
  /** 目标物理包围盒 */
  box: BoundingBox;
  /** 原始设计字号 (点 pt) */
  initialFontSizePt: number;
  /** 允许压缩的最小字号 (点 pt，默认 initialFontSizePt * 0.65) */
  minFontSizePt?: number;
  /** 行距比例 (默认 1.2) */
  lineHeightRatio?: number;
  /** 是否允许自动折行 (根据盒高与行距计算，默认 true) */
  allowWrap?: boolean;
  /** 文本宽度测量函数 (审查发现 #6: 由外部注入，杜绝硬编码 0.56 估算误差) */
  measureWidth: TextMeasureFunction;
}

export interface FittedLine {
  text: string;
  widthPt: number;
}

export interface BoxFitResult {
  /** 是否成功完全容纳在盒内 */
  fits: boolean;
  /** 最终生效字号 (点 pt) */
  fontSizePt: number;
  /** 最终生效字间距压缩量 (点 pt，0 为正常，负数为压缩) */
  letterSpacingPt: number;
  /** 最终排布行列表 */
  lines: FittedLine[];
  /** 总体缩放比例 (相对于 initialFontSizePt) */
  scaleRatio: number;
  /** 诊断或警告信息 */
  diagnostic?: string;
}

export interface PdfBlockInfo {
  blockId: string;
  pageIndex: number;
  box: BoundingBox;
  text: string;
  fontSizePt: number;
}
