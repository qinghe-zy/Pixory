import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { CompanionObservedMessage } from './companionTypes';

export function hashCompanionText(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}

export function hashCompanionMessageVersion(message: CompanionObservedMessage): string {
  return hashCompanionText(JSON.stringify({
    branchRootMessageId: message.branchRootMessageId,
    branchVersionIndex: message.branchVersionIndex,
    completedAt: message.completedAt,
    content: message.content,
    id: message.id,
    role: message.role,
    status: message.status,
    updatedAt: message.updatedAt,
  }));
}

export function parseCompanionJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function parseCompanionJsonArray(value: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isFiniteUnit(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
