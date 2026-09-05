import { runWithDatabaseSpace } from '../database/db';
import { settingsRepository } from '../database/repositories/settingsRepository';
import { insertDiagnosticEvents, pruneDiagnosticEvents } from './diagnosticRepository';
import { createDiagnosticBuffer } from './diagnosticBuffer';
import type { DiagnosticEventInput } from './diagnosticTypes';
const buffers = new Map<'normal' | 'personal', ReturnType<typeof createDiagnosticBuffer>>();
const enabledBySpace = new Map<'normal' | 'personal', boolean>();
function bufferFor(space: 'normal' | 'personal') { let buffer = buffers.get(space); if (!buffer) { buffer = createDiagnosticBuffer({ flush: (events) => runWithDatabaseSpace(space, (db) => insertDiagnosticEvents(db, events)) }); buffers.set(space, buffer); } return buffer; }
export async function initializeDiagnostics(space: 'normal' | 'personal'): Promise<void> { const settings = await runWithDatabaseSpace(space, (db) => settingsRepository.getDiagnosticsSettings(db)); enabledBySpace.set(space, settings.enabled); }
export function recordDiagnosticEvent(event: DiagnosticEventInput): void { if (enabledBySpace.get(event.space) === false) return; bufferFor(event.space).record(event); }
export function setDiagnosticsEnabled(space: 'normal' | 'personal', enabled: boolean): void { enabledBySpace.set(space, enabled); }
export function getDroppedDiagnosticEventCount(space: 'normal' | 'personal'): number { return buffers.get(space)?.droppedCount() ?? 0; }
export async function flushDiagnostics(space?: 'normal' | 'personal'): Promise<void> { if (space) await buffers.get(space)?.flush(); else await Promise.all([...buffers.values()].map((buffer) => buffer.flush())); }
export async function pruneDiagnostics(space: 'normal' | 'personal', retentionDays = 7, maxEvents = 20000): Promise<void> { await flushDiagnostics(space); await runWithDatabaseSpace(space, (db) => pruneDiagnosticEvents(db, space, retentionDays, maxEvents)); }
