import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import { ipRepository } from '../../database/repositories/ipRepository';
import { aiThreadRepository } from '../../database/repositories/aiThreadRepository';
import { SYSTEM_ASSISTANT_THREAD_ID } from './capabilityProfile';
import type { SelectedIpContext, SystemTaskSnapshot } from './systemAssistantTypes';
import { saveSystemTaskInDatabase } from './systemAssistantPersistence';
import { withSystemTaskStep } from './systemAssistantRuntime';
import { publishSystemTask } from './systemAssistantEvents';

export async function listSystemAssistantIps(space: PixorySpace) {
  return runWithDatabaseSpace(space, db => ipRepository.findAll(db));
}

export async function validateSystemAssistantIp(space: PixorySpace, ipId: number): Promise<SelectedIpContext> {
  const ip = await runWithDatabaseSpace(space, db => ipRepository.findById(db, ipId));
  if (!ip || ip.deletedAt) throw new Error('目标 IP 已失效，请重新选择。');
  return { space, ipId, ipNameSnapshot: ip.name, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
}

export async function renameSystemAssistant(task: SystemTaskSnapshot): Promise<SystemTaskSnapshot['undo']> {
  if (task.action?.type !== 'rename-thread') throw new Error('此操作不可执行。');
  const newTitle = task.action.newTitle;
  return runWithDatabaseSpace(task.space, async db => {
    const thread = await aiThreadRepository.findThreadById(db, SYSTEM_ASSISTANT_THREAD_ID);
    if (!thread) throw new Error('系统管家会话已不存在。');
    const snapshot = JSON.parse(thread.roleSnapshotJson);
    const previousName = typeof snapshot.name === 'string' ? snapshot.name : null;
    snapshot.name = newTitle;
    const undo = { previousName, appliedName: newTitle, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
    const completed = { ...withSystemTaskStep(task, 'completed', '昵称已修改'), undo };
    await db.withTransactionAsync(async () => {
      await aiThreadRepository.updateThread(db, thread.id, { roleSnapshotJson: JSON.stringify(snapshot) });
      await saveSystemTaskInDatabase(db, completed);
    });
    publishSystemTask(completed);
    return undo;
  });
}

export async function undoSystemAssistantRename(task: SystemTaskSnapshot): Promise<void> {
  const undo = task.undo;
  if (!undo || Date.parse(undo.expiresAt) <= Date.now()) throw new Error('撤销已过期。');
  await runWithDatabaseSpace(task.space, async db => {
    const thread = await aiThreadRepository.findThreadById(db, SYSTEM_ASSISTANT_THREAD_ID);
    if (!thread) throw new Error('系统管家会话已不存在。');
    const snapshot = JSON.parse(thread.roleSnapshotJson);
    if (snapshot.name !== undo.appliedName) throw new Error('昵称已再次修改，无法撤销此操作。');
    snapshot.name = undo.previousName;
    const undone = { ...withSystemTaskStep(task, 'undone', '已撤销昵称修改'), undo: null };
    await db.withTransactionAsync(async () => {
      await aiThreadRepository.updateThread(db, thread.id, { roleSnapshotJson: JSON.stringify(snapshot) });
      await saveSystemTaskInDatabase(db, undone);
    });
    publishSystemTask(undone);
  });
}
