/**
 * OOXML 类型定义 (纯算法内核 - 零宿主依赖)
 */

export interface RunSpan {
  /** 在段落 XML 中的物理字符起始位置 (基于 <w:p> 内部的相对偏移) */
  rawStart: number;
  /** 在段落 XML 中的物理字符结束位置 */
  rawEnd: number;
  /** 在虚拟投影纯文本中的字符起始位置 */
  vStart: number;
  /** 在虚拟投影纯文本中的字符结束位置 */
  vEnd: number;
  /** 映射的虚拟文本片段 (如实体解码后的文字、\t、\n 等) */
  text: string;
  /** 该 Run 节点的样式标签 <w:rPr>...</w:rPr> (若无则为空字符串) */
  rPrXml: string;
  /** 是否为纯文本节点 (<w:t>) */
  isTextNode: boolean;
  /** 是否包含公章图片 (<w:drawing>)、超链接、对象或脚注引用等不可侵入元素 */
  nonInvasive: boolean;
  /** 节点标识或额外信息 */
  tagType?: 'text' | 'tab' | 'br' | 'hyphen' | 'drawing' | 'other';
}

export interface ParagraphBlockInfo {
  /** 段落自然序号 */
  index: number;
  /** 在 document.xml 中的物理起始偏移 (指向 '<w:p') */
  blockStart: number;
  /** 在 document.xml 中的物理结束偏移 (指向 '</w:p>' 之后，闭区间右开) */
  blockEnd: number;
  /** 块类型 */
  kind: 'heading' | 'paragraph' | 'table';
  /** 标题级别 (若为 heading，1~6) */
  headingLevel?: number;
  /** 所在表格嵌套深度 (0 为正文段落，>= 1 为表格单元格内段落) */
  tableDepth: number;
  /** 是否为自闭合标签 (如 <w:p/> 或 <w:p ... />) */
  isSelfClosing: boolean;
  /** 前 80 字符摘要预览 */
  previewText: string;
}

export interface ProjectedParagraph {
  /** 虚拟纯文本 (供大模型读取与 Diff 引擎匹配) */
  virtualText: string;
  /** 虚拟文本到 raw XML 的双向映射区间列表 */
  spans: RunSpan[];
  /** 段落内是否包含不可侵入的特殊元素 (如公章、图表) */
  hasNonInvasive: boolean;
}

export interface OoxmlSpliceHunk {
  /** 在虚拟纯文本中的起始匹配位置 */
  vStart: number;
  /** 在虚拟纯文本中的结束匹配位置 */
  vEnd: number;
  /** 替换的新文本 */
  replacement: string;
  /** 是否以企业级修订留痕 (Track Changes) 模式写入 */
  trackChanges?: boolean;
  /** 修订作者 */
  author?: string;
  /** 修订 ISO 8601 时间戳 */
  date?: string;
}

export interface OoxmlSpliceResult {
  /** 原位替换后的完整段落 XML */
  splicedXml: string;
  /** 诊断与状态 */
  appliedCount: number;
  warnings: string[];
}
