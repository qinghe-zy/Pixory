import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import { settingsRepository } from '../../database/repositories/settingsRepository';
import { publishSystemTask } from './systemAssistantEvents';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SystemTaskSnapshot } from './systemAssistantTypes';
import { normalizeSystemAssistantAction } from './systemAssistantRegistry';

// Existing SQLite app_settings provides isolated storage and backup without a schema migration.
const key = (messageId: string) => `systemAssistantTask:v1:${messageId}`;

export async function saveSystemTaskInDatabase(db: SQLiteDatabase, task: SystemTaskSnapshot): Promise<void> {
  await settingsRepository.setValue(db, key(task.assistantMessageId), JSON.stringify(task));
}

export async function clearSystemTasksInDatabase(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM app_settings WHERE key LIKE 'systemAssistantTask:v1:%'");
}

export async function loadSystemTask(space: PixorySpace, messageId: string): Promise<SystemTaskSnapshot | null> {
  const raw = await runWithDatabaseSpace(space, db => settingsRepository.getValue(db, key(messageId)));
  if (!raw) return null;
  try {
    const task = JSON.parse(raw) as SystemTaskSnapshot;
    if (task.version !== 1 || task.space !== space || task.assistantMessageId !== messageId
      || task.taskId !== `system-task:${messageId}` || typeof task.originMessageId !== 'string'
      || typeof task.requestText !== 'string' || !Array.isArray(task.steps)
      || (task.requiresIp !== undefined && typeof task.requiresIp !== 'boolean')
      || !task.steps.every(step => typeof step.label === 'string' && Number.isFinite(Date.parse(step.at)))
      || !['waiting_for_ip', 'planning', 'waiting_for_approval', 'executing', 'completed', 'failed',
        'cancelled', 'expired', 'undoing', 'undone'].includes(task.status)) return null;
    if (task.selectedIp && (task.selectedIp.space !== space || !Number.isSafeInteger(task.selectedIp.ipId)
      || task.selectedIp.ipId <= 0 || typeof task.selectedIp.ipNameSnapshot !== 'string'
      || !Number.isFinite(Date.parse(task.selectedIp.expiresAt)))) return null;
    if (task.action) {
      const fields = Object.fromEntries(Object.entries(task.action).filter(([, value]) => value !== undefined)
        .map(([name, value]) => [name, String(value)]));
      const action = normalizeSystemAssistantAction(fields);
      if (!action) return null;
      task.action = action;
    }
    if (task.undo && (typeof task.undo.appliedName !== 'string'
      || (task.undo.previousName !== null && typeof task.undo.previousName !== 'string')
      || !Number.isFinite(Date.parse(task.undo.expiresAt)))) return null;
    return task;
  } catch { return null; }
}

export async function saveSystemTask(task: SystemTaskSnapshot): Promise<void> {
  await runWithDatabaseSpace(task.space, db => saveSystemTaskInDatabase(db, task));
  publishSystemTask(task);
}

export async function restartSystemTask(space: PixorySpace, messageId: string, originMessageId: string, requestText: string): Promise<void> {
  const previous = await loadSystemTask(space, messageId);
  if (!previous) return;
  await saveSystemTask({ ...previous, originMessageId, requestText, action: null, selectedIp: null, requiresIp: false,
    status: 'planning', steps: [], error: null, undo: null, updatedAt: new Date().toISOString() });
}

export async function loadSystemTasks(space: PixorySpace, messageIds: string[]): Promise<SystemTaskSnapshot[]> {
  const tasks: SystemTaskSnapshot[] = [];
  // expo-sqlite prepared statements must be finalized sequentially on this connection.
  for (const id of messageIds) {
    const task = await loadSystemTask(space, id);
    if (task) tasks.push(task);
  }
  return tasks;
}
