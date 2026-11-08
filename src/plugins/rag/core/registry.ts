import type { IRagComponent, RagComponentKind } from './lifecycle';

/**
 * 统一组件注册中心 (Unified Component Registry)
 * 集中管理所有受管组件（分块器、解析器、向量化提供者、存储引擎、检索器与完整 Provider）
 */
export class RagComponentRegistry {
  private components = new Map<string, IRagComponent>();

  /** 注册组件 */
  public register<T extends IRagComponent>(component: T): T {
    if (!component.id || !component.kind) {
      throw new Error('组件注册失败：缺少必须的 id 或 kind 属性');
    }
    this.components.set(component.id, component);
    return component;
  }

  /** 获取指定组件 */
  public get<T extends IRagComponent = IRagComponent>(id: string): T | undefined {
    return this.components.get(id) as T | undefined;
  }

  /** 按组件种类查找所有组件 */
  public getByKind<T extends IRagComponent = IRagComponent>(kind: RagComponentKind): T[] {
    const matched: T[] = [];
    for (const comp of this.components.values()) {
      if (comp.kind === kind) {
        matched.push(comp as T);
      }
    }
    return matched;
  }

  /** 卸载/注销组件（自动触发生命周期销毁） */
  public async unregister(id: string): Promise<boolean> {
    const comp = this.components.get(id);
    if (!comp) return false;
    if (typeof comp.dispose === 'function') {
      try {
        await comp.dispose();
      } catch {
        // 容错吸收
      }
    }
    return this.components.delete(id);
  }

  /** 列出所有已注册组件信息 */
  public list(): Array<{ id: string; kind: RagComponentKind }> {
    return Array.from(this.components.values()).map((c) => ({
      id: c.id,
      kind: c.kind,
    }));
  }

  /** 清空并释放所有组件 */
  public async clear(): Promise<void> {
    for (const comp of this.components.values()) {
      if (typeof comp.dispose === 'function') {
        try {
          await comp.dispose();
        } catch {
          // 容错吸收
        }
      }
    }
    this.components.clear();
  }
}
