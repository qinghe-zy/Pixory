/**
 * PdfSandboxWatchdog PDF 沙箱看门狗机制 (纯函数内核 - 零宿主依赖)
 *
 * 核心机制:
 * 1. 3000ms 心跳超时检测: 防止畸形大 PDF 解析挂起或死锁;
 * 2. 自动取消与降级恢复: 超时后主动中断并抛出特定异常，不阻塞移动端 UI 主线程。
 */

export interface WatchdogOptions {
  timeoutMs?: number;
  taskName?: string;
}

export class PdfSandboxWatchdogTimeoutError extends Error {
  public readonly timeoutMs: number;
  public readonly taskName: string;

  constructor(taskName: string, timeoutMs: number) {
    super(`PDF 沙箱执行超时: 任务 "${taskName}" 超过 ${timeoutMs}ms 未响应，看门狗已自动熔断`);
    this.name = 'PdfSandboxWatchdogTimeoutError';
    this.taskName = taskName;
    this.timeoutMs = timeoutMs;
  }
}

export class PdfSandboxWatchdog {
  public static readonly DEFAULT_TIMEOUT_MS = 3000;

  /**
   * 带看门狗保护执行异步任务
   */
  public static async executeWithWatchdog<T>(
    action: () => Promise<T>,
    options?: WatchdogOptions
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs || PdfSandboxWatchdog.DEFAULT_TIMEOUT_MS;
    const taskName = options?.taskName || 'anonymous_pdf_task';

    let timer: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new PdfSandboxWatchdogTimeoutError(taskName, timeoutMs));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([action(), timeoutPromise]);
      return result;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
