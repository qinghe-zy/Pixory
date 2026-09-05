import type { SQLiteDatabase } from 'expo-sqlite';
import type { DiagnosticEventRecord } from './diagnosticTypes';

export async function insertDiagnosticEvents(db: SQLiteDatabase, events: DiagnosticEventRecord[]): Promise<void> {
  for (const event of events) {
    await db.runAsync(`INSERT OR REPLACE INTO diagnostic_events (id, space, traceId, eventType, occurredAt, monotonicStartMs, monotonicEndMs, durationMs, parentSpanId, threadIdHash, generationId, requestId, payloadJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, event.id, event.space, event.traceId, event.eventType, event.occurredAt, event.monotonicStartMs ?? null, event.monotonicEndMs ?? null, event.durationMs ?? null, event.parentSpanId ?? null, event.threadIdHash ?? null, event.generationId ?? null, event.requestId ?? null, JSON.stringify(event.payload ?? {}), event.createdAt);
  }
}

export async function listDiagnosticEvents(db: SQLiteDatabase, space: 'normal' | 'personal', options: { limit?: number; threadIdHash?: string; threadIdHashes?: string[]; from?: string; to?: string } = {}): Promise<DiagnosticEventRecord[]> {
  const clauses = ['space = ?'];
  const args: (string | number)[] = [space];
  if (options.threadIdHash) { clauses.push('threadIdHash = ?'); args.push(options.threadIdHash); }
  if (options.threadIdHashes?.length) { clauses.push(`threadIdHash IN (${options.threadIdHashes.map(() => '?').join(', ')})`); args.push(...options.threadIdHashes); }
  if (options.from) { clauses.push('occurredAt >= ?'); args.push(options.from); }
  if (options.to) { clauses.push('occurredAt <= ?'); args.push(options.to); }
  args.push(options.limit ?? 20000);
  const rows = await db.getAllAsync<any>(`SELECT * FROM diagnostic_events WHERE ${clauses.join(' AND ')} ORDER BY occurredAt ASC LIMIT ?`, ...args);
  return rows.map((row) => ({ ...row, payload: JSON.parse(row.payloadJson || '{}') }));
}

export async function clearDiagnosticEvents(db: SQLiteDatabase, space: 'normal' | 'personal'): Promise<void> { await db.runAsync('DELETE FROM diagnostic_events WHERE space = ?', space); }
export async function pruneDiagnosticEvents(db: SQLiteDatabase, space: 'normal' | 'personal', retentionDays = 7, maxEvents = 20000): Promise<void> {
  const cutoff = new Date(Date.now() - Math.max(1, retentionDays) * 86400000).toISOString();
  await db.runAsync('DELETE FROM diagnostic_events WHERE space = ? AND occurredAt < ?', space, cutoff);
  await db.runAsync(`DELETE FROM diagnostic_events WHERE space = ? AND id NOT IN (SELECT id FROM diagnostic_events WHERE space = ? ORDER BY occurredAt DESC LIMIT ?)`, space, space, Math.max(1, maxEvents));
}
