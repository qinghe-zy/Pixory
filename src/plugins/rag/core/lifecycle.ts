/**
 * 统一组件生命周期规范 (Component Lifecycle Contract)
 * 所有受管组件统一遵循此接口
 */

export type RagComponentKind =
  | 'parser'
  | 'splitter'
  | 'embedder'
  | 'store'
  | 'searcher'
  | 'provider';

export interface IRagComponent {
  /** 唯一组件标识符，例如 'splitter:recursive' 或 'embedder:openai' */
  readonly id: string;
  /** 组件分类 */
  readonly kind: RagComponentKind;
  /** 可选生命周期初始化 */
  init?(): Promise<void>;
  /** 可选生命周期销毁与资源释放 */
  dispose?(): Promise<void>;
}
