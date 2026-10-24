/**
 * activeSandboxArtifactManager.ts
 * 全会话物理级单例活跃取景框互斥协调器 (Single Active Viewfinder Coordinator)
 *
 * 核心设计原则：
 * 1. 全会话物理级至多 1 个展开态取景框（即至多 1 个活跃 WebView）。
 * 2. 当任一历史卡片或新消息展开取景框时，协调器自动通知其他展开的取景框收拢复原为轻量小卡片。
 * 3. 严格杜绝在滚动长列表中同时驻留多个活跃 WebView，避免 Android 低端机 GPU 显存与硬件合成器溢出。
 */

type ActiveViewfinderSubscriber = (activeId: string | null) => void;

export class ActiveSandboxArtifactManager {
  private activeId: string | null = null;
  private subscribers = new Set<ActiveViewfinderSubscriber>();

  getActiveId(): string | null {
    return this.activeId;
  }

  setActiveId(id: string | null): void {
    if (this.activeId === id) return;
    this.activeId = id;
    this.subscribers.forEach((subscriber) => {
      try {
        subscriber(id);
      } catch {
        // 忽略异常，确保其他订阅者正常接收
      }
    });
  }

  subscribe(subscriber: ActiveViewfinderSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  reset(): void {
    this.activeId = null;
    this.subscribers.clear();
  }
}

export const activeSandboxArtifactManager = new ActiveSandboxArtifactManager();
