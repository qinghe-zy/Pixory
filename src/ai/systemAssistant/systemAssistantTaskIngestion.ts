import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listSystemAssistantIps, validateSystemAssistantIp } from './systemAssistantExecutor';
import { loadSystemTask, saveSystemTask, saveSystemTaskInDatabase } from './systemAssistantPersistence';
import { publishSystemTask } from './systemAssistantEvents';
import { withSystemTaskStep } from './systemAssistantRuntime';
import type { SystemAssistantAction, SystemTaskSnapshot } from './systemAssistantTypes';
import { IP_SCOPED_SYSTEM_ROUTES } from './systemAssistantRegistry';
import { applySystemRoleDraft, retainSystemRoleDraft } from './systemAssistantRoleCreation';

const IP_REQUIRED_ROUTES = new Set(['ip-detail', 'import-images', 'import-batch-history']);

async function savePendingTask(task: SystemTaskSnapshot, canExecute?: (db: SQLiteDatabase) => Promise<boolean>): Promise<void> {
  const latest = await loadSystemTask(task.space, task.assistantMessageId);
  if (latest && ['cancelled', 'completed', 'undone'].includes(latest.status)) return;
  if (latest?.generationId && task.generationId && latest.generationId !== task.generationId) return;
  if (!canExecute) { await saveSystemTask(task); return; }
  const saved = await runWithDatabaseSpace(task.space, async db => {
    let saved = false;
    await db.withTransactionAsync(async () => {
      if (!await canExecute(db)) return;
      await saveSystemTaskInDatabase(db, task);
      saved = true;
    });
    return saved;
  });
  if (saved) publishSystemTask(task);
}

export async function ingestSystemAssistantAction(input: {
  space: PixorySpace; assistantMessageId: string; originMessageId: string; requestText: string;
  action: SystemAssistantAction | null; invalid?: boolean;
  replyText?: string;
  roleCollecting?: boolean;
  roleSaveAuthorized?: boolean;
  canExecute?: (db: SQLiteDatabase) => Promise<boolean>;
}): Promise<string | undefined> {
  if (input.canExecute && !await runWithDatabaseSpace(input.space, input.canExecute)) return;
  const previous = await loadSystemTask(input.space, input.assistantMessageId);
  const task: SystemTaskSnapshot = previous ?? {
    version: 1, taskId: `system-task:${input.assistantMessageId}`, assistantMessageId: input.assistantMessageId,
    originMessageId: input.originMessageId, requestText: input.requestText, space: input.space,
    action: null, selectedIp: null, status: 'planning', steps: [], error: null, undo: null,
    updatedAt: new Date().toISOString(),
  };
  const savePending = (next: SystemTaskSnapshot) => savePendingTask(next, input.canExecute);
  if (previous && ['cancelled', 'completed', 'undone'].includes(previous.status)) return;
  task.action = input.action;
  if (input.invalid || !input.action) {
    if (input.roleCollecting) {
      await retainSystemRoleDraft(task, input.canExecute).catch(() => {});
      await savePending(withSystemTaskStep(task, input.roleSaveAuthorized ? 'failed' : 'waiting_for_user',
        input.roleSaveAuthorized ? '角色卡未保存' : '等待补充设定'));
      return input.roleSaveAuthorized ? '角色卡暂未保存，设定已保留。' : undefined;
    }
    await savePending({ ...withSystemTaskStep(task, 'failed', '此操作暂不可用'), error: '此操作暂不可用，请重新描述请求。' });
    return;
  }
  const action = input.action;
  if (action.type === 'role-draft') {
    try {
      const { type: _type, ...draft } = action;
      const applied = await applySystemRoleDraft(task, draft, input.canExecute, input.replyText);
      if (applied.status === 'completed') return applied.createdRoleCard
        ? `已创建「${applied.createdRoleCard.name}」。` : '角色卡已创建。';
    } catch (error) {
      // Stopped, cancelled and replaced generations are expected lifecycle events.
      if (error && typeof error === 'object' && 'message' in error
        && /^角色创建任务已变化/.test(String(error.message))) return;
      await retainSystemRoleDraft(task, input.canExecute).catch(() => {});
      if (!input.roleSaveAuthorized) {
        await savePending(withSystemTaskStep(task, 'waiting_for_user', '等待补充设定'));
        return;
      }
      const message = '角色卡未能保存，设定已保留。';
      await savePending({ ...withSystemTaskStep(task, 'failed', '角色卡未保存'), error: message });
      return message;
    }
    return;
  }
  let ambiguousIp = false;
  if (action.type === 'select_ip' && task.selectedIp) {
    await savePending({ ...withSystemTaskStep(task, 'failed', '未能确定操作入口'),
      error: '已选定 IP，但未能确定操作入口，请说明要打开素材还是导入素材。' });
    return;
  }
  if (!task.selectedIp && action.type === 'navigate') {
    const ips = await listSystemAssistantIps(input.space);
    const matches = ips.filter(ip => action.ipName
      ? ip.name.toLocaleLowerCase() === action.ipName.toLocaleLowerCase() && task.requestText.toLocaleLowerCase().includes(ip.name.toLocaleLowerCase())
      : task.requestText.includes(ip.name));
    if (!IP_SCOPED_SYSTEM_ROUTES.has(action.route) && matches.length > 0) {
      await savePending({ ...withSystemTaskStep(task, 'failed', '此入口不支持 IP 范围'),
        error: '此入口不支持指定 IP，请使用素材列表或批量管理。' });
      return;
    }
    if (matches.length === 1) task.selectedIp = await validateSystemAssistantIp(input.space, matches[0].id);
    ambiguousIp = matches.length > 1;
    // Model-supplied numeric IDs are never trusted, including the legacy protocol.
    task.action = { type: 'navigate', route: action.route, ipName: action.ipName };
  }
  if (action.type === 'navigate' && !IP_SCOPED_SYSTEM_ROUTES.has(action.route)
    && (action.ipName || action.ipId || task.selectedIp)) {
    await savePending({ ...withSystemTaskStep(task, 'failed', '此入口不支持 IP 范围'),
      error: '此入口不支持指定 IP，请使用素材列表或批量管理。' });
    return;
  }
  const needsIp = action.type === 'select_ip'
    || (action.type === 'navigate' && (ambiguousIp || IP_REQUIRED_ROUTES.has(action.route) || Boolean(action.ipName) || Boolean(action.ipId)) && !task.selectedIp);
  task.requiresIp = needsIp || Boolean(task.selectedIp);
  await savePending(withSystemTaskStep(task, needsIp ? 'waiting_for_ip' : 'waiting_for_approval', needsIp ? '请选择目标 IP' : '等待确认'));
}
