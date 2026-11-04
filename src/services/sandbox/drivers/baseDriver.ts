/**
 * IDocumentDriver 统一文档驱动端口协议 (FCIS & Hexagonal Architecture)
 *
 * 核心设计原则:
 * 1. 纯算法与宿主解耦: 驱动接口不依赖任何 React Native、Expo 或 SQLite 特有类；
 * 2. 块骨架与稳定索引: 将任意格式文档投影为块骨架 (DocumentBlockSkeleton)，通过哈希生成稳定块 ID；
 * 3. 局部按需读取: 基于 byteRange 偏移区间进行局部读取，杜绝大文件全量加载；
 * 4. 批量事务修补: 支持单次提交多处修改，提供部分应用与原子回滚两种模式。
 */

export type DocumentBlockKind =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'code'
  | 'list'
  | 'frontmatter'
  | 'blockquote'
  | 'thematic_break'
  | 'form_field'
  | 'image'
  | 'raw';

export interface DocumentBlockSkeleton {
  /** 稳定块标识符，如 "[[BLK_a1b2c3d4]]" */
  blockId: string;
  /** 块类型 */
  kind: DocumentBlockKind;
  /** 章节、页面或顶级片段序号 (从 0 开始) */
  pageOrSectionIndex: number;
  /** 前 80 字符摘要预览 */
  previewText: string;
  /** 在底层文件/字符串中的字节或字符偏移区间 [start, end) */
  byteRange?: [number, number];
  /** 附加元数据 (如 heading level, code language, table dimensions 等) */
  meta?: Record<string, unknown>;
}

export interface PatchHunk {
  /** 目标块 ID (支持 "[[BLK_xxxx]]" 或 "BLK_xxxx") */
  targetBlockId: string;
  /** 待搜索替换的目标子串 (支持精准匹配与三级模糊容错) */
  search: string;
  /** 替换后的新文本 */
  replace: string;
  /** 企业级特性：是否以修订留痕模式写入 (如 Markdown del/ins 标记，Docx w:ins/w:del) */
  trackChanges?: boolean;
  /** 可选的前置上下文约束 */
  contextBefore?: string;
  /** 可选的后置上下文约束 */
  contextAfter?: string;
}

export interface PatchDiagnostic {
  /** 对应的块 ID */
  blockId: string;
  /** 匹配时使用的容错级别: 1 精确匹配 | 2 规范化映射 | 3 模糊编辑距离 */
  tierUsed?: 1 | 2 | 3;
  /** 是否成功应用 */
  applied: boolean;
  /** 匹配到的原始字符区间 [start, end) */
  rawRange?: [number, number];
  /** 匹配相似度 (0.0 ~ 1.0) */
  similarity?: number;
  /** 警告信息 (如近似匹配、轻度格式变动) */
  warning?: string;
  /** 错误信息 (如未找到、二义性冲突、重叠冲突) */
  error?: string;
}

export interface PatchBatchResult {
  /** 修改后的完整文本内容 (内存中产生的结果) */
  newContent?: string;
  /** 修改后的新文件路径或 VFS 标识 (若涉及磁盘或工作区落盘) */
  newVfsUri?: string;
  /** 成功应用的 hunk 数量 */
  appliedCount: number;
  /** 提交的总 hunk 数量 */
  totalHunks: number;
  /** 逐 hunk 详细诊断结果 */
  diagnostics: PatchDiagnostic[];
}

export interface DocumentDriverOptions {
  /** 可选的文件系统或 VFS 存储驱动抽象注入 */
  storage?: {
    readText?(path: string): Promise<string>;
    writeText?(path: string, content: string): Promise<void>;
    readBytes?(path: string): Promise<Uint8Array>;
    writeBytes?(path: string, bytes: Uint8Array): Promise<void>;
    readSlice?(path: string, start: number, length: number): Promise<string>;
    exists?(path: string): Promise<boolean>;
  };
  /** 可选传入已有骨架索引，避免 readBlocks 或 applyPatchBatch 重复扫描全文 */
  skeleton?: DocumentBlockSkeleton[];
}

export interface DocumentPatchOptions extends DocumentDriverOptions {
  /** 是否启用原子模式：若为 true 且任一 hunk 匹配或应用失败，则整体回滚并返回原内容 */
  atomic?: boolean;
  /** 是否全局启用修订留痕 (生成 ins/del 标签或 OOXML w:del/w:ins) */
  trackChanges?: boolean;
}

/**
 * 统一规范化 Block ID：剥除可选的 "[[" 与 "]]"，便于模糊索引与精确查找
 */
export function normalizeBlockId(blockId: string): string {
  if (!blockId) return '';
  let id = blockId.trim();
  if (id.startsWith('[[')) id = id.slice(2);
  if (id.endsWith(']]')) id = id.slice(0, -2);
  return id.trim();
}

/**
 * 统一包装为带中括号的展示型 Block ID
 */
export function formatBlockId(rawId: string): string {
  const norm = normalizeBlockId(rawId);
  return `[[${norm}]]`;
}

/**
 * IDocumentDriver 统一六边形端口接口
 */
export interface IDocumentDriver {
  /** 驱动支持的文件扩展名列表 (全部为小写且带点，如 ['.md', '.markdown', '.txt']) */
  readonly supportedExtensions: readonly string[];

  /**
   * 1. 骨架解析与结构化索引
   * @param contentOrUri 文本内容或文档 URI/文件路径
   * @param options 驱动配置选项
   */
  inspectSkeleton(
    contentOrUri: string | Uint8Array,
    options?: DocumentDriverOptions
  ): Promise<DocumentBlockSkeleton[]>;

  /**
   * 2. 按块 ID 局部按需读取 (绝不全量加载)
   * @param contentOrUri 文本内容或文档 URI/文件路径
   * @param blockIds 需要读取的块 ID 列表
   * @param options 驱动配置选项
   */
  readBlocks(
    contentOrUri: string | Uint8Array,
    blockIds: string[],
    options?: DocumentDriverOptions
  ): Promise<Record<string, string>>;

  /**
   * 3. 批量事务修补 (支持多处修改，可配置原子回滚或部分应用)
   * @param contentOrUri 文本内容或文档 URI/文件路径
   * @param hunks 补丁单元数组
   * @param options 修补配置选项 (atomic 等)
   */
  applyPatchBatch(
    contentOrUri: string | Uint8Array,
    hunks: PatchHunk[],
    options?: DocumentPatchOptions
  ): Promise<PatchBatchResult>;
}
