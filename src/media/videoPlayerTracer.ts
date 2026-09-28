/**
 * VideoPlayerTracer
 * Lightweight in-memory event tracer for the video player.
 * Records the full lifecycle chain: load → play → switch → error.
 *
 * Usage:
 *   import { tracer } from './videoPlayerTracer';
 *   tracer.log('replaceAsync:start', { uri });
 *   const report = tracer.exportReport();
 */

export type TraceEventKind =
  | 'replaceAsync:start'
  | 'replaceAsync:done'
  | 'replaceAsync:error'
  | 'player:play'
  | 'player:pause'
  | 'player:statusChange'
  | 'player:timeUpdate'
  | 'player:durationChange'
  | 'player:playingChange'
  | 'switch:start'
  | 'switch:exit-anim-done'
  | 'switch:enter-anim-done'
  | 'switch:committed'
  | 'switch:safety-unlock'
  | 'gesture:video-switch-start'
  | 'gesture:video-switch-commit'
  | 'gesture:video-switch-cancel'
  | 'gesture:video-switch-drag'
  | 'shuffle:commitNext'
  | 'shuffle:peekNext'
  | 'pool:update'
  | 'pool:player-active'
  | 'cover:show'
  | 'cover:clear'
  | 'error';

export interface TraceEvent {
  t: number;         // timestamp ms relative to tracer creation
  seq: number;       // monotonic sequence number
  kind: TraceEventKind;
  data?: Record<string, unknown>;
}

const MAX_EVENTS = 500;

class VideoPlayerTracer {
  private readonly startTs = Date.now();
  private seq = 0;
  private events: TraceEvent[] = [];
  private _enabled = true;

  get enabled() { return this._enabled; }
  set enabled(v: boolean) { this._enabled = v; }

  log(kind: TraceEventKind, data?: Record<string, unknown>) {
    if (!this._enabled) return;
    const event: TraceEvent = {
      t: Date.now() - this.startTs,
      seq: ++this.seq,
      kind,
      data,
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events.shift();
    }
    if (__DEV__) {
      const dataStr = data ? ` ${JSON.stringify(data)}` : '';
      console.log(`[VideoTracer] +${event.t}ms #${event.seq} ${kind}${dataStr}`);
    }
  }

  getEvents(): readonly TraceEvent[] {
    return this.events;
  }

  clear() {
    this.events = [];
    this.seq = 0;
  }

  exportReport(): string {
    const lines: string[] = [];
    lines.push('# VideoPlayer Trace Report');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Total events captured: ${this.events.length}`);
    lines.push('');

    // --- Summary: count by kind ---
    lines.push('## Event Summary');
    const counts = new Map<string, number>();
    for (const ev of this.events) {
      counts.set(ev.kind, (counts.get(ev.kind) ?? 0) + 1);
    }
    for (const [kind, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${kind}: **${count}**`);
    }
    lines.push('');

    // --- Anomaly detection ---
    lines.push('## Anomaly Detection');
    const anomalies: string[] = [];

    // Check: replaceAsync starts that don't have a matching done
    const replaceStarts = this.events.filter(e => e.kind === 'replaceAsync:start');
    const replaceDones = this.events.filter(e => e.kind === 'replaceAsync:done');
    if (replaceStarts.length > replaceDones.length + 1) {
      anomalies.push(`⚠️ replaceAsync called ${replaceStarts.length}x but only completed ${replaceDones.length}x — possible concurrent load race`);
    }

    // Check: switch:start without matching switch:committed
    const switchStarts = this.events.filter(e => e.kind === 'switch:start');
    const switchCommits = this.events.filter(e => e.kind === 'switch:committed');
    if (switchStarts.length > switchCommits.length + 1) {
      anomalies.push(`⚠️ ${switchStarts.length} video switches started but only ${switchCommits.length} committed — transition lock may have frozen`);
    }

    // Check: safety-unlock fired
    const safetyUnlocks = this.events.filter(e => e.kind === 'switch:safety-unlock');
    if (safetyUnlocks.length > 0) {
      anomalies.push(`🚨 Safety unlock fired ${safetyUnlocks.length}x — animation chain was interrupted; this prevents freeze`);
    }

    // Check: errors
    const errors = this.events.filter(e => e.kind === 'error' || e.kind === 'replaceAsync:error');
    if (errors.length > 0) {
      anomalies.push(`🚨 ${errors.length} error event(s) detected`);
      for (const ev of errors) {
        anomalies.push(`   - #${ev.seq} +${ev.t}ms: ${JSON.stringify(ev.data)}`);
      }
    }

    // Check: timeUpdate events during a switch (player still sending old video's time)
    const switchRanges: Array<[number, number]> = [];
    let lastSwitchStart: TraceEvent | null = null;
    for (const ev of this.events) {
      if (ev.kind === 'switch:start') lastSwitchStart = ev;
      if (ev.kind === 'switch:committed' && lastSwitchStart) {
        switchRanges.push([lastSwitchStart.seq, ev.seq]);
        lastSwitchStart = null;
      }
    }
    for (const [startSeq, endSeq] of switchRanges) {
      const staleUpdates = this.events.filter(e => e.kind === 'player:timeUpdate' && e.seq > startSeq && e.seq < endSeq);
      if (staleUpdates.length > 0) {
        anomalies.push(`⚠️ ${staleUpdates.length} timeUpdate events fired between switch:start(#${startSeq}) and switch:committed(#${endSeq}) — stale progress bar possible`);
      }
    }

    if (anomalies.length === 0) {
      lines.push('✅ No anomalies detected');
    } else {
      for (const a of anomalies) lines.push(a);
    }
    lines.push('');

    // --- Full event log ---
    lines.push('## Full Event Log');
    lines.push('```');
    lines.push('seq  | +ms     | kind                          | data');
    lines.push('-----|---------|-------------------------------|--------------------------------');
    for (const ev of this.events) {
      const seqStr = String(ev.seq).padStart(4, ' ');
      const tStr = `+${ev.t}ms`.padEnd(8, ' ');
      const kindStr = ev.kind.padEnd(30, ' ');
      const dataStr = ev.data ? JSON.stringify(ev.data).slice(0, 80) : '';
      lines.push(`${seqStr} | ${tStr} | ${kindStr} | ${dataStr}`);
    }
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('*Report generated by VideoPlayerTracer. See `src/media/videoPlayerTracer.ts`.*');

    return lines.join('\n');
  }
}

/** Singleton tracer — import this anywhere in the player. */
export const tracer = new VideoPlayerTracer();
