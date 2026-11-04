/**
 * AgentTelemetryBus 运行遥测与响应式可观测事件总线 (纯函数内核 - 零宿主依赖)
 *
 * 核心机制:
 * 1. 响应式事件派发: 实时广播思考流 (thought)、工具调用 (tool_call)、执行状态与检查点;
 * 2. 零轮询驱动: UI 或业务层无需轮询 SQLite，按 runId 订阅即可获得全量流式更新;
 * 3. 内存事件队列缓冲: 保留最近 runs 的事件历史，支持重连与晚期挂载回放。
 */

export type AgentRunState =
  | 'IDLE'
  | 'INSPECTING'
  | 'PLANNING'
  | 'PATCHING'
  | 'VERIFYING'
  | 'COMMITTED'
  | 'ROLLED_BACK'
  | 'ERROR';

export type AgentTelemetryEventType =
  | 'run:start'
  | 'step:start'
  | 'thought:chunk'
  | 'tool:call'
  | 'tool:result'
  | 'checkpoint:created'
  | 'run:finish'
  | 'run:error';

export interface AgentTelemetryPayloadMap {
  'run:start': { runId: string; documentUri: string; userPrompt: string; timestamp: number };
  'step:start': { runId: string; stepIndex: number; state: AgentRunState; timestamp: number };
  'thought:chunk': { runId: string; chunk: string; fullThought: string; timestamp: number };
  'tool:call': { runId: string; stepIndex: number; toolName: string; args: Record<string, any>; timestamp: number };
  'tool:result': { runId: string; stepIndex: number; toolName: string; result?: any; error?: string; timestamp: number };
  'checkpoint:created': { runId: string; checkpointId: string; stepIndex: number; vfsTreeHash: string; timestamp: number };
  'run:finish': {
    runId: string;
    status: 'success' | 'failed' | 'aborted';
    durationMs: number;
    resultDocumentUri?: string;
    checkpointsCount: number;
    timestamp: number;
  };
  'run:error': { runId: string; error: string; stepIndex?: number; timestamp: number };
}

export interface AgentTelemetryEvent<K extends AgentTelemetryEventType = AgentTelemetryEventType> {
  type: K;
  payload: AgentTelemetryPayloadMap[K];
}

export type AgentTelemetryListener<K extends AgentTelemetryEventType = AgentTelemetryEventType> = (
  event: AgentTelemetryEvent<K>
) => void;

export class AgentTelemetryBus {
  private static instance: AgentTelemetryBus | null = null;
  private readonly listeners = new Set<AgentTelemetryListener<any>>();
  private readonly runEventLog = new Map<string, AgentTelemetryEvent<any>[]>();
  private readonly MAX_RUN_HISTORY = 50;

  public static getInstance(): AgentTelemetryBus {
    if (!AgentTelemetryBus.instance) {
      AgentTelemetryBus.instance = new AgentTelemetryBus();
    }
    return AgentTelemetryBus.instance;
  }

  public static resetInstance(): void {
    AgentTelemetryBus.instance = null;
  }

  /**
   * 发布遥测事件
   */
  public emit<K extends AgentTelemetryEventType>(type: K, payload: AgentTelemetryPayloadMap[K]): void {
    const event: AgentTelemetryEvent<K> = { type, payload };
    const runId = payload.runId;

    if (runId) {
      let history = this.runEventLog.get(runId);
      if (!history) {
        if (this.runEventLog.size >= this.MAX_RUN_HISTORY) {
          const oldestKey = this.runEventLog.keys().next().value;
          if (oldestKey) this.runEventLog.delete(oldestKey);
        }
        history = [];
        this.runEventLog.set(runId, history);
      }
      history.push(event);
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // 保护遥测通道不被单个异常监听器阻断
      }
    }
  }

  /**
   * 订阅所有事件或特定事件
   */
  public subscribe(listener: AgentTelemetryListener<any>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 订阅指定 runId 的事件，并可选回放已有历史事件
   */
  public subscribeRun(runId: string, listener: AgentTelemetryListener<any>, replayExisting = true): () => void {
    if (replayExisting) {
      const history = this.runEventLog.get(runId);
      if (history) {
        for (const ev of history) {
          try {
            listener(ev);
          } catch {
            // 忽略
          }
        }
      }
    }

    const filteredListener: AgentTelemetryListener<any> = (ev) => {
      if (ev.payload.runId === runId) {
        listener(ev);
      }
    };

    this.listeners.add(filteredListener);
    return () => {
      this.listeners.delete(filteredListener);
    };
  }

  /**
   * 获取指定 runId 的事件历史
   */
  public getHistory(runId: string): AgentTelemetryEvent<any>[] {
    return [...(this.runEventLog.get(runId) || [])];
  }

  /**
   * 清除指定 runId 的事件日志
   */
  public clearRun(runId: string): void {
    this.runEventLog.delete(runId);
  }
}
