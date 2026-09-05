import type { DiagnosticEventInput, DiagnosticEventRecord } from './diagnosticTypes';
import { sanitizeDiagnosticPayload } from './diagnosticPrivacy';

export function createDiagnosticBuffer(input: { flush: (events: DiagnosticEventRecord[]) => Promise<void>; maxBatch?: number; flushIntervalMs?: number }) {
  const events: DiagnosticEventRecord[] = [];
  const maxBatch = input.maxBatch ?? 25;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sequence = 0;
  let droppedEventCount = 0;
  let flushPromise: Promise<void> | null = null;
  const schedule = () => { if (timer) return; timer = setTimeout(() => { timer = null; void flush(); }, input.flushIntervalMs ?? 2000); };
  const record = (event: DiagnosticEventInput) => {
    events.push({ ...event, id: `diag_${Date.now()}_${sequence++}`, occurredAt: event.occurredAt ?? new Date().toISOString(), createdAt: new Date().toISOString(), payload: sanitizeDiagnosticPayload(event.payload ?? {}) });
    if (events.length >= maxBatch) void flush(); else schedule();
  };
  const flush = async (): Promise<void> => {
    if (flushPromise) { await flushPromise; if (events.length) await flush(); return; }
    if (timer) { clearTimeout(timer); timer = null; }
    if (!events.length) return;
    const batch = events.splice(0, events.length);
    flushPromise = input.flush(batch).catch(() => { droppedEventCount += batch.length; }).finally(() => { flushPromise = null; });
    await flushPromise;
  };
  return { record, flush, size: () => events.length, droppedCount: () => droppedEventCount };
}
