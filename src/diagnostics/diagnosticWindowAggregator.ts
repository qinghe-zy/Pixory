export interface DiagnosticWindowSample {
  atMs: number;
  deltaCount?: number;
  answerCharsDelta?: number;
  reasoningCharsDelta?: number;
  renderCount?: number;
  layoutCount?: number;
  visibleItemCount?: number;
  mountedItemCount?: number;
  contentHeight?: number;
  viewportHeight?: number;
  scrollOffset?: number;
  scrollVelocity?: number;
  jsFrameMs?: number;
  uiFrameMs?: number;
  droppedFrameCount?: number;
  memoryUsedMb?: number;
  removeClippedSubviews?: boolean;
  windowSize?: number;
  generationStatus?: string;
  threadMatch?: boolean;
  anomalyFlags?: string[];
}

export interface DiagnosticWindowAggregate {
  startedAtMs: number;
  endedAtMs: number;
  deltaCount: number;
  answerCharsDelta: number;
  reasoningCharsDelta: number;
  renderCount: number;
  layoutCount: number;
  visibleItemCount: number;
  mountedItemCount: number;
  contentHeight: number;
  viewportHeight: number;
  scrollOffset: number;
  scrollVelocity: number;
  jsFrameP95: number | null;
  uiFrameP95: number | null;
  droppedFrameCount: number;
  memoryUsedMb: number | null;
  removeClippedSubviews: boolean | null;
  windowSize: number | null;
  generationStatus: string | null;
  threadMatch: boolean | null;
  anomalyFlags: string[];
}

function percentile(values: number[], percentileValue: number): number | null { if (!values.length) return null; const sorted = [...values].sort((left, right) => left - right); return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))]; }

export function aggregateDiagnosticWindow(samples: DiagnosticWindowSample[]): DiagnosticWindowAggregate | null {
  if (!samples.length) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  return {
    startedAtMs: first.atMs,
    endedAtMs: last.atMs,
    deltaCount: samples.reduce((total, sample) => total + (sample.deltaCount ?? 0), 0),
    answerCharsDelta: samples.reduce((total, sample) => total + (sample.answerCharsDelta ?? 0), 0),
    reasoningCharsDelta: samples.reduce((total, sample) => total + (sample.reasoningCharsDelta ?? 0), 0),
    renderCount: samples.reduce((total, sample) => total + (sample.renderCount ?? 0), 0),
    layoutCount: samples.reduce((total, sample) => total + (sample.layoutCount ?? 0), 0),
    visibleItemCount: last.visibleItemCount ?? 0,
    mountedItemCount: last.mountedItemCount ?? 0,
    contentHeight: last.contentHeight ?? 0,
    viewportHeight: last.viewportHeight ?? 0,
    scrollOffset: last.scrollOffset ?? 0,
    scrollVelocity: last.scrollVelocity ?? 0,
    jsFrameP95: percentile(samples.flatMap((sample) => sample.jsFrameMs == null ? [] : [sample.jsFrameMs]), 0.95),
    uiFrameP95: percentile(samples.flatMap((sample) => sample.uiFrameMs == null ? [] : [sample.uiFrameMs]), 0.95),
    droppedFrameCount: samples.reduce((total, sample) => total + (sample.droppedFrameCount ?? 0), 0),
    memoryUsedMb: last.memoryUsedMb ?? null,
    removeClippedSubviews: last.removeClippedSubviews ?? null,
    windowSize: last.windowSize ?? null,
    generationStatus: last.generationStatus ?? null,
    threadMatch: samples.every((sample) => sample.threadMatch !== false),
    anomalyFlags: [...new Set(samples.flatMap((sample) => sample.anomalyFlags ?? []))],
  };
}

export function shouldSuspectBlankScreen(input: { dataCount: number; visibleItemCount: number; mountedItemCount: number; contentHeight: number; generating: boolean; uiCommitAgeMs: number; threadMatch: boolean }): boolean { return input.dataCount > 0 && (input.visibleItemCount === 0 || input.mountedItemCount === 0 || input.contentHeight > 0 && input.mountedItemCount === 0 || input.generating && input.uiCommitAgeMs >= 250 || !input.threadMatch); }