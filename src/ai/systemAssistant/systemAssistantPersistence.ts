import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import { settingsRepository } from '../../database/repositories/settingsRepository';
import { publishSystemTask } from './systemAssistantEvents';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SystemTaskSnapshot } from './systemAssistantTypes';
import { normalizeSystemAssistantAction } from './systemAssistantRegistry';
import { withSystemTaskStep } from './systemAssistantRuntime';

// Existing SQLite app_settings provides isolated storage and backup without a schema migration.
const key = (messageId: string) => `systemAssistantTask:v1:${messageId}`;

export async function saveSystemTaskInDatabase(db: SQLiteDatabase, task: SystemTaskSnapshot): Promise<void> {
  await settingsRepository.setValue(db, key(task.assistantMessageId), JSON.stringify(task));
}

export async function clearSystemTasksInDatabase(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM app_settings WHERE key LIKE 'systemAssistantTask:v1:%'");
  await db.runAsync("DELETE FROM app_settings WHERE key = 'systemAssistantRoleCreation:v1'");
  await db.runAsync("DELETE FROM app_settings WHERE key LIKE 'systemAssistantRoleSnapshot:v1:%'");
}

export function parseSystemTaskSnapshot(raw: string | null, space: PixorySpace, messageId?: string): SystemTaskSnapshot | null {
  if (!raw) return null;
  try {
    const task = JSON.parse(raw) as SystemTaskSnapshot;
    if (task.version !== 1 || task.space !== space || (messageId && task.assistantMessageId !== messageId)
      || (messageId && task.taskId !== `system-task:${messageId}`) || typeof task.originMessageId !== 'string'
      || typeof task.requestText !== 'string' || !Array.isArray(task.steps)
      || (task.requiresIp !== undefined && typeof task.requiresIp !== 'boolean')
      || !task.steps.every(step => typeof step.label === 'string' && Number.isFinite(Date.parse(step.at)))
      || !['waiting_for_ip', 'waiting_for_user', 'planning', 'waiting_for_approval', 'executing', 'completed', 'failed',
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
    if (task.createdRoleCard && (typeof task.createdRoleCard.id !== 'string' || typeof task.createdRoleCard.name !== 'string'
      || !Number.isFinite(Date.parse(task.createdRoleCard.updatedAt))
      || !Number.isFinite(Date.parse(task.createdRoleCard.expiresAt)))) return null;
    return task;
  } catch { return null; }
}

export async function loadSystemTask(space: PixorySpace, messageId: string): Promise<SystemTaskSnapshot | null> {
  const raw = await runWithDatabaseSpace(space, db => settingsRepository.getValue(db, key(messageId)));
  return parseSystemTaskSnapshot(raw, space, messageId);
}

export async function saveSystemTask(task: SystemTaskSnapshot): Promise<void> {
  await runWithDatabaseSpace(task.space, db => saveSystemTaskInDatabase(db, task));
  publishSystemTask(task);
}

export async function beginSystemTask(input: {
  space: PixorySpace; assistantMessageId: string; originMessageId: string; requestText: string; generationId: string;
}): Promise<SystemTaskSnapshot> {
  const previous = await loadSystemTask(input.space, input.assistantMessageId);
  if (previous?.createdRoleCard || previous?.status === 'undone') {
    const preserved = { ...previous, generationId: input.generationId,
      status: previous.createdRoleCard ? 'completed' as const : 'undone' as const };
    await saveSystemTask(preserved);
    return preserved;
  }
  const task: SystemTaskSnapshot = {
    version: 1, taskId: `system-task:${input.assistantMessageId}`, ...input,
    status: 'planning', action: null, selectedIp: previous?.status === 'planning' ? previous.selectedIp : null,
    steps: [], error: null, undo: null, updatedAt: new Date().toISOString(),
  };
  const started = withSystemTaskStep(task, 'planning', '正在理解请求');
  await saveSystemTask(started);
  return started;
}

export async function settleSystemTaskGeneration(input: {
  space: PixorySpace; assistantMessageId: string; generationId: string;
  status: 'completed' | 'failed' | 'stopped'; roleCollecting?: boolean;
}): Promise<void> {
  const task = await loadSystemTask(input.space, input.assistantMessageId);
  if (!task || task.generationId !== input.generationId || task.status !== 'planning') return;
  const status = input.status === 'failed' ? 'failed' : input.status === 'stopped' ? 'cancelled'
    : input.roleCollecting ? 'waiting_for_user' : 'completed';
  const label = status === 'failed' ? '回复未完成' : status === 'cancelled' ? '已停止'
    : status === 'waiting_for_user' ? '等待补充设定' : '已回复';
  await saveSystemTask({ ...withSystemTaskStep(task, status, label),
    error: status === 'failed' ? '回复未完成，可重新发送。' : null });
}

export async function restartSystemTask(space: PixorySpace, messageId: string, originMessageId: string, requestText: string): Promise<void> {
  const previous = await loadSystemTask(space, messageId);
  if (!previous) return;
  await saveSystemTask({ ...previous, originMessageId, requestText, action: null, selectedIp: null, requiresIp: false,
    status: 'planning', steps: [], error: null, undo: null, updatedAt: new Date().toISOString() });
}

export async function loadSystemTasks(space: PixorySpace, messageIds: string[]): Promise<SystemTaskSnapshot[]> {
  if (messageIds.length === 0) return [];
  const targetKeys = messageIds.map(id => key(id));
  const placeholders = targetKeys.map(() => '?').join(',');
  const rows = await runWithDatabaseSpace(space, db =>
    db.getAllAsync<{ key: string; value: string }>(
      `SELECT key, value FROM app_settings WHERE key IN (${placeholders})`,
      targetKeys
    )
  ).catch(() => []);
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row?.key && row?.value) map.set(row.key, row.value);
  }
  const tasks: SystemTaskSnapshot[] = [];
  for (const id of messageIds) {
    const raw = map.get(key(id));
    const task = parseSystemTaskSnapshot(raw ?? null, space, id);
    if (task) tasks.push(task);
  }
  return tasks;
}
