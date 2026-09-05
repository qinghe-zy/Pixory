import type { PixorySpace } from '../database/db';

export type DiagnosticExportLevel = 'standard' | 'deep';
export interface DiagnosticEventInput {
  traceId: string;
  space: PixorySpace;
  eventType: string;
  occurredAt?: string;
  monotonicStartMs?: number;
  monotonicEndMs?: number;
  durationMs?: number;
  parentSpanId?: string | null;
  threadIdHash?: string | null;
  generationId?: string | null;
  requestId?: string | null;
  payload?: Record<string, unknown>;
}
export interface DiagnosticEventRecord extends DiagnosticEventInput {
  id: string;
  occurredAt: string;
  createdAt: string;
}
