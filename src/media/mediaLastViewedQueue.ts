const DEFAULT_FLUSH_INTERVAL_MS = 2_000;

interface MediaLastViewedScheduler {
  clearTimeout: (handle: unknown) => void;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
}

export interface MediaLastViewedQueueOptions {
  flushIds: (ids: readonly number[]) => Promise<unknown>;
  flushIntervalMs?: number;
  onFlushed?: (ids: readonly number[]) => void;
  scheduler?: MediaLastViewedScheduler;
}

export class MediaLastViewedQueue {
  private disposed = false;
  private flushPromise: Promise<void> | null = null;
  private readonly pendingIds = new Set<number>();
  private timerHandle: unknown | null = null;
  private readonly scheduler: MediaLastViewedScheduler;

  constructor(private readonly options: MediaLastViewedQueueOptions) {
    this.scheduler = options.scheduler ?? {
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    };
  }

  enqueue(id: number): void {
    if (this.disposed || !Number.isInteger(id) || id <= 0) {
      return;
    }
    this.pendingIds.add(id);
    this.scheduleFlush();
  }

  async flush(): Promise<void> {
    this.cancelTimer();
    if (this.flushPromise) {
      return this.flushPromise;
    }
    if (this.pendingIds.size === 0) {
      return;
    }

    const ids = [...this.pendingIds];
    this.pendingIds.clear();
    this.flushPromise = this.options.flushIds(ids)
      .then(() => {
        this.options.onFlushed?.(ids);
      })
      .catch(() => {
        if (!this.disposed) {
          ids.forEach((id) => this.pendingIds.add(id));
        }
      })
      .finally(() => {
        this.flushPromise = null;
        if (!this.disposed && this.pendingIds.size > 0) {
          this.scheduleFlush();
        }
      });
    return this.flushPromise;
  }

  whenIdle(): Promise<void> {
    return this.flushPromise ?? Promise.resolve();
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return this.whenIdle();
    }
    this.cancelTimer();
    await this.whenIdle();
    if (this.pendingIds.size > 0) {
      await this.flush();
    }
    this.disposed = true;
  }

  private scheduleFlush(): void {
    if (this.timerHandle != null || this.disposed) {
      return;
    }
    this.timerHandle = this.scheduler.setTimeout(() => {
      this.timerHandle = null;
      void this.flush();
    }, this.options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS);
  }

  private cancelTimer(): void {
    if (this.timerHandle == null) {
      return;
    }
    this.scheduler.clearTimeout(this.timerHandle);
    this.timerHandle = null;
  }
}
