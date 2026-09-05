import { runWithDatabaseSpace } from '../database/db';
import { settingsRepository } from '../database/repositories/settingsRepository';
import { insertDiagnosticEvents, insertDiagnosticWindows, pruneDiagnosticEvents } from './diagnosticRepository';
import { createDiagnosticBuffer } from './diagnosticBuffer';
import type { DiagnosticEventInput } from './diagnosticTypes';
import { upsertDiagnosticOperation, type DiagnosticOperationInput } from './diagnosticOperation';
import { upsertDiagnosticIncident, type DiagnosticIncidentInput } from './diagnosticIncident';
const buffers = new Map<'normal' | 'personal', ReturnType<typeof createDiagnosticBuffer>>();
const enabledBySpace = new Map<'normal' | 'personal', boolean>();
const operationBuffers = new Map<'normal' | 'personal', ReturnType<typeof createDiagnosticBuffer>>();
const incidentBuffers = new Map<'normal' | 'personal', ReturnType<typeof createDiagnosticBuffer>>();
const windowBuffers = new Map<'normal' | 'personal', ReturnType<typeof createDiagnosticBuffer>>();
function operationBufferFor(space: 'normal' | 'personal') { let buffer = operationBuffers.get(space); if (!buffer) { buffer = createDiagnosticBuffer({ flush: (items) => runWithDatabaseSpace(space, async (db) => { for (const item of items) await upsertDiagnosticOperation(db, item.payload as unknown as DiagnosticOperationInput); }) }); operationBuffers.set(space, buffer); } return buffer; }
function windowBufferFor(space: 'normal' | 'personal') { let buffer = windowBuffers.get(space); if (!buffer) { buffer = createDiagnosticBuffer({ flush: (items) => runWithDatabaseSpace(space, (db) => insertDiagnosticWindows(db, items.map((item) => item.payload as any))) }); windowBuffers.set(space, buffer); } return buffer; }
function incidentBufferFor(space: 'normal' | 'personal') { let buffer = incidentBuffers.get(space); if (!buffer) { buffer = createDiagnosticBuffer({ flush: (items) => runWithDatabaseSpace(space, async (db) => { for (const item of items) await upsertDiagnosticIncident(db, item.payload as unknown as DiagnosticIncidentInput); }) }); incidentBuffers.set(space, buffer); } return buffer; }
function bufferFor(space: 'normal' | 'personal') { let buffer = buffers.get(space); if (!buffer) { buffer = createDiagnosticBuffer({ flush: (events) => runWithDatabaseSpace(space, (db) => insertDiagnosticEvents(db, events)) }); buffers.set(space, buffer); } return buffer; }
export async function initializeDiagnostics(space: 'normal' | 'personal'): Promise<void> { const settings = await runWithDatabaseSpace(space, (db) => settingsRepository.getDiagnosticsSettings(db)); enabledBySpace.set(space, settings.enabled); }
export function recordDiagnosticEvent(event: DiagnosticEventInput): void {
  if (enabledBySpace.get(event.space) === false) return;
  bufferFor(event.space).record(event);
  if (event.eventType.endsWith('_completed') || event.eventType.endsWith('_failed') || event.eventType === 'provider_usage' || event.eventType === 'chat_content_layout') {
    recordDiagnosticOperation({ id: `operation_${Date.now()}_${event.eventType}`, space: event.space, operationType: event.eventType, status: event.eventType.endsWith('_failed') ? 'failed' : 'completed', occurredAtUtc: event.occurredAt ?? new Date().toISOString(), traceId: event.traceId, threadIdHash: event.threadIdHash ?? undefined, generationId: event.generationId ?? undefined, payload: { metrics: { durationMs: event.durationMs ?? null }, attributes: event.payload ?? {} } });
  }
}
export function setDiagnosticsEnabled(space: 'normal' | 'personal', enabled: boolean): void { enabledBySpace.set(space, enabled); }
export function recordDiagnosticWindow(input: { id: string; space: 'normal' | 'personal'; operationId?: string; occurredAtUtc: string; traceId: string; payload: Record<string, unknown> }): void { if (enabledBySpace.get(input.space) === false) return; windowBufferFor(input.space).record({ traceId: input.traceId, space: input.space, eventType: 'diagnostic_window', occurredAt: input.occurredAtUtc, payload: input as unknown as Record<string, unknown> }); }
export function recordDiagnosticOperation(input: DiagnosticOperationInput): void { if (enabledBySpace.get(input.space) === false) return; operationBufferFor(input.space).record({ traceId: input.traceId, space: input.space, eventType: 'operation_summary', occurredAt: input.occurredAtUtc, threadIdHash: input.threadIdHash, generationId: input.generationId, payload: input as unknown as Record<string, unknown> }); }
export function recordDiagnosticIncident(input: DiagnosticIncidentInput): void { if (enabledBySpace.get(input.space) === false) return; incidentBufferFor(input.space).record({ traceId: input.traceId, space: input.space, eventType: 'incident', occurredAt: input.occurredAtUtc, threadIdHash: input.threadIdHash, generationId: input.generationId, payload: input as unknown as Record<string, unknown> }); }
export function getDroppedDiagnosticEventCount(space: 'normal' | 'personal'): number { return buffers.get(space)?.droppedCount() ?? 0; }
export async function flushDiagnostics(space?: 'normal' | 'personal'): Promise<void> { const all = [...buffers.values(), ...operationBuffers.values(), ...incidentBuffers.values(), ...windowBuffers.values()]; if (space) await Promise.all([buffers.get(space)?.flush(), operationBuffers.get(space)?.flush(), incidentBuffers.get(space)?.flush(), windowBuffers.get(space)?.flush()]); else await Promise.all(all.map((buffer) => buffer.flush())); }
export async function pruneDiagnostics(space: 'normal' | 'personal', retentionDays = 7, maxEvents = 20000): Promise<void> { await flushDiagnostics(space); await runWithDatabaseSpace(space, (db) => pruneDiagnosticEvents(db, space, retentionDays, maxEvents)); }
