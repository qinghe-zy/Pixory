import type { DiagnosticEventRecord } from './diagnosticTypes';
export function summarizeDiagnosticEvents(events: DiagnosticEventRecord[]) {
  const durations = events.map((event) => event.durationMs).filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
  const percentile = (ratio: number) => durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * ratio))] : null;
  return { eventCount: events.length, durationP50Ms: percentile(0.5), durationP90Ms: percentile(0.9), durationP95Ms: percentile(0.95), eventTypes: Object.fromEntries([...new Set(events.map((event) => event.eventType))].map((type) => [type, events.filter((event) => event.eventType === type).length])) };
}
