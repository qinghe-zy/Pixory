/**
 * 用户连发输入防抖聚合器 (InputAggregator)
 *
 * 核心设计：
 * 1. 用户按发送立即在 UI 上屏绿色气泡并持久化至 SQLite。
 * 2. 开启 800ms 防抖聚合窗口。
 * 3. 若窗口内用户继续发送，重置定时器并追加待处理文本。
 * 4. 窗口超时后，将合并文本一次性触发给大模型装填引擎。
 */

export class InputAggregator {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingInputs: string[] = [];
  private debounceMs: number;
  private onFlush: (combinedText: string) => void;
  private isInputEmptyCheck?: () => boolean;

  constructor(
    onFlush: (combinedText: string) => void,
    debounceMs: number = 2000,
    isInputEmptyCheck?: () => boolean
  ) {
    this.onFlush = onFlush;
    this.debounceMs = debounceMs;
    this.isInputEmptyCheck = isInputEmptyCheck;
  }

  setDebounceMs(ms: number) {
    this.debounceMs = Math.max(1000, Math.min(60000, ms));
  }

  setIsInputEmptyCheck(check: () => boolean) {
    this.isInputEmptyCheck = check;
  }

  push(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.pendingInputs.push(trimmed);

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.attemptFlush();
    }, this.debounceMs);
  }

  private attemptFlush() {
    // 若配置了输入框空探测，且当前输入框非空（用户正在继续打字），暂停发送，等待输入框为空
    if (this.isInputEmptyCheck && !this.isInputEmptyCheck()) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.attemptFlush();
      }, 400);
      return;
    }
    this.flush();
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pendingInputs.length === 0) return;

    const combined = this.pendingInputs.join('\n');
    this.pendingInputs = [];
    this.onFlush(combined);
  }

  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingInputs = [];
  }
}
