export interface VoicePlaybackState {
  isPlaying: boolean;
  activeId: string | null;
  activeUri: string | null;
  currentTimeSec: number;
  durationSec: number;
  isBuffering: boolean;
}

type PlaybackListener = (state: VoicePlaybackState) => void;

interface InternalPlayer {
  play: () => void;
  pause: () => void;
  release: () => void;
}

// 基于已编译进 2.9.1 底包的 expo-video (ExoPlayer 纯音频模式)，100% 兼容 OTA 热更新与离线音频播放
let createVideoPlayerFn: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ev = require('expo-video');
  if (typeof ev?.createVideoPlayer === 'function') {
    createVideoPlayerFn = ev.createVideoPlayer;
  }
} catch {
  // 容错忽略
}

class VoicePlayerManager {
  private player: InternalPlayer | null = null;
  private activeId: string | null = null;
  private activeUri: string | null = null;
  private listeners: Set<PlaybackListener> = new Set();
  private subscription: { remove: () => void } | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  private state: VoicePlaybackState = {
    isPlaying: false,
    activeId: null,
    activeUri: null,
    currentTimeSec: 0,
    durationSec: 0,
    isBuffering: false,
  };

  private async ensureAudioMode(): Promise<void> {
    // 纯音频模式下由 ExoPlayer 自动管理音频焦点与播放会话
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...this.state });
      } catch {
        // 隔离单个监听器异常
      }
    }
  }

  subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): VoicePlaybackState {
    return { ...this.state };
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  isPlaying(id?: string): boolean {
    if (!this.state.isPlaying) return false;
    if (id) return this.activeId === id;
    return true;
  }

  async play(uri: string, id: string = uri): Promise<void> {
    // 若当前正在播放相同音频，则停止并重置（切换开关体验）
    if (this.activeId === id && this.state.isPlaying) {
      await this.stop();
      return;
    }

    // 停止并清理前一个音频实例
    await this.stop();

    await this.ensureAudioMode();

    this.activeId = id;
    this.activeUri = uri;

    try {
      if (typeof createVideoPlayerFn === 'function') {
        const vp = createVideoPlayerFn({ uri });
        try { vp.audioMixingMode = 'auto'; } catch {}
        try { vp.timeUpdateEventInterval = 0.25; } catch {}

        const playingSub = vp.addListener('playingChange', (event: any) => {
          const isPlaying = Boolean(event?.isPlaying ?? vp.playing);
          this.state = {
            ...this.state,
            isPlaying,
            currentTimeSec: vp.currentTime || 0,
            durationSec: vp.duration || this.state.durationSec || 0,
          };
          this.notify();
        });

        const endSub = vp.addListener('playToEnd', () => {
          void this.stop();
        });

        const timeSub = vp.addListener('timeUpdate', (event: any) => {
          const currentTimeSec = event?.currentTime ?? vp.currentTime ?? 0;
          const durationSec = vp.duration || this.state.durationSec || 0;
          this.state = {
            ...this.state,
            currentTimeSec,
            durationSec,
          };
          this.notify();
        });

        this.subscription = {
          remove: () => {
            try { playingSub.remove(); } catch {}
            try { endSub.remove(); } catch {}
            try { timeSub.remove(); } catch {}
          },
        };

        this.player = {
          play: () => { try { vp.play(); } catch {} },
          pause: () => { try { vp.pause(); } catch {} },
          release: () => { try { (vp as any)?.release?.(); } catch {} },
        };
        vp.play();

        // 启动 200ms 高灵敏度进度主动采样器，杜绝原生 headless timeUpdate 未派发导致的进度停滞 (如 00:00 假死)
        if (this.ticker) {
          clearInterval(this.ticker);
          this.ticker = null;
        }
        this.ticker = setInterval(() => {
          if (!this.state.isPlaying || !this.player) return;
          const current = typeof vp.currentTime === 'number' && !isNaN(vp.currentTime) ? vp.currentTime : 0;
          const dur = typeof vp.duration === 'number' && !isNaN(vp.duration) && vp.duration > 0
            ? vp.duration
            : this.state.durationSec;
          if (Math.abs(current - this.state.currentTimeSec) >= 0.25 || (dur > 0 && dur !== this.state.durationSec)) {
            this.state = {
              ...this.state,
              currentTimeSec: current,
              durationSec: dur,
            };
            this.notify();
          }
        }, 200);
      } else {
        // 环境暂无播放驱动（例如纯 Node.js 测试环境）
        this.player = {
          play: () => {},
          pause: () => {},
          release: () => {},
        };
      }

      this.state = {
        isPlaying: true,
        activeId: id,
        activeUri: uri,
        currentTimeSec: 0,
        durationSec: 0,
        isBuffering: false,
      };
      this.notify();
    } catch (err) {
      await this.stop();
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }

    if (this.subscription) {
      try {
        this.subscription.remove();
      } catch {}
      this.subscription = null;
    }

    if (this.player) {
      try {
        this.player.pause();
        this.player.release();
      } catch {}
      this.player = null;
    }

    this.activeId = null;
    this.activeUri = null;

    this.state = {
      isPlaying: false,
      activeId: null,
      activeUri: null,
      currentTimeSec: 0,
      durationSec: 0,
      isBuffering: false,
    };
    this.notify();
  }
}

export const voicePlayer = new VoicePlayerManager();
