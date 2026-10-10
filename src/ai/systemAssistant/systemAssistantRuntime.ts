import type { SelectedIpContext, SystemNavigationCommand, SystemTaskSnapshot } from './systemAssistantTypes';

export type SystemAssistantRuntimeHost = {
  space: SystemTaskSnapshot['space'];
  load(messageId: string): Promise<SystemTaskSnapshot | null>;
  save(task: SystemTaskSnapshot): Promise<void>;
  validateIp(ipId: number): Promise<SelectedIpContext>;
  continueTask(task: SystemTaskSnapshot): Promise<void>;
  stopTask(task: SystemTaskSnapshot): Promise<void>;
  navigate(command: SystemNavigationCommand): void;
  rename(task: SystemTaskSnapshot): Promise<SystemTaskSnapshot['undo']>;
  undoRename(task: SystemTaskSnapshot): Promise<void>;
  isActive(): boolean;
  canContinue(): boolean;
  hasActiveGeneration?(messageId: string): boolean;
  changed(): void;
  reportError?(message: string): void;
};

// Local writes may outlive a screen. Share the lock across adapters in the same space.
const busyBySpace = new Map<SystemTaskSnapshot['space'], Set<string>>();

export function withSystemTaskStep(task: SystemTaskSnapshot, status: SystemTaskSnapshot['status'], label: string): SystemTaskSnapshot {
  const at = new Date().toISOString();
  return { ...task, status, updatedAt: at, steps: [...task.steps, { label, at }].slice(-8), error: null };
}

export function createSystemAssistantRuntime(host: SystemAssistantRuntimeHost) {
  const busy = busyBySpace.get(host.space) ?? new Set<string>();
  busyBySpace.set(host.space, busy);

  async function run(messageId: string, operation: (task: SystemTaskSnapshot) => Promise<void>) {
    if (busy.size > 0 || !host.isActive()) return;
    busy.add(messageId);
    try {
      const task = await host.load(messageId);
      if (task && host.isActive()) await operation(task);
    } catch { host.reportError?.('任务状态无法保存，请稍后重试。'); }
    finally { busy.delete(messageId); }
  }

  async function fail(task: SystemTaskSnapshot, label: string) {
    const latest = await host.load(task.assistantMessageId);
    if (latest?.status === 'cancelled' || latest?.status === 'undone'
      || (latest?.status === 'completed' && latest.undo)) return;
    await host.save({ ...withSystemTaskStep(task, 'failed', label), error: label });
  }

  return {
    resolveInput(messageId: string, ipId: number) {
      return run(messageId, async task => {
        if (task.status !== 'waiting_for_ip') return;
        if (task.action?.type === 'select_ip' && !host.canContinue()) return;
        try {
          const selectedIp = await host.validateIp(ipId);
          if (selectedIp.space !== task.space) throw new Error('空间不匹配。');
          if (!host.isActive()) return;
          if ((await host.load(messageId))?.status !== 'waiting_for_ip') return;
          task = { ...task, selectedIp };
          if (task.action?.type === 'navigate') {
            await host.save(withSystemTaskStep(task, 'waiting_for_approval', '已选择目标 IP'));
          } else {
            task = withSystemTaskStep(task, 'planning', '正在继续原请求');
            await host.save(task);
            if ((await host.load(messageId))?.status !== 'planning' || !host.isActive()) return;
            await host.continueTask(task);
          }
        } catch { await fail(task, '无法继续此任务，请重试或重新选择 IP。'); }
      });
    },
    approve(messageId: string) {
      if (!host.canContinue()) return Promise.resolve();
      return run(messageId, async task => {
        if (task.action?.type === 'navigate' && (task.status === 'completed' || task.status === 'cancelled')) {
          const command = { route: task.action.route, ipId: task.selectedIp?.ipId };
          if (host.isActive()) host.navigate(command);
          return;
        }
        if (task.status !== 'waiting_for_approval' || !task.action || task.action.type === 'select_ip') return;
        const action = task.action;
        try {
          if (task.selectedIp) {
            if (task.selectedIp.space !== task.space) throw new Error('空间不匹配。');
            if (Date.parse(task.selectedIp.expiresAt) <= Date.now()) {
              await host.save({ ...withSystemTaskStep(task, 'waiting_for_ip', '请重新选择目标 IP'), selectedIp: null });
              return;
            }
            const validated = await host.validateIp(task.selectedIp.ipId);
            if (validated.space !== task.space) throw new Error('空间不匹配。');
          }
          if (!host.isActive()) return;
          task = withSystemTaskStep(task, 'executing', '正在执行');
          await host.save(task);
          if (action.type === 'rename-thread') {
            const undo = await host.rename(task);
            await host.save({ ...withSystemTaskStep(task, 'completed', '昵称已修改'), undo });
            host.changed();
          } else if (action.type === 'navigate') {
            const command = { route: action.route, ipId: task.selectedIp?.ipId };
            // Persist the outcome before leaving the chat. Never replay navigation on restore.
            await host.save(withSystemTaskStep(task, 'completed', '已准备好操作入口'));
            if (host.isActive()) host.navigate(command);
          }
        } catch { await fail(task, '操作未完成，请重试。'); }
      });
    },
    async cancel(messageId: string) {
      if (!host.isActive()) return;
      try {
        const pending = await host.load(messageId);
        if (!pending || !host.isActive()) return;
        if (pending.status === 'planning') {
          await host.save(withSystemTaskStep(pending, 'cancelled', '已停止继续任务'));
          await host.stopTask(pending);
          return;
        }
        return run(messageId, async task => {
          if (!['waiting_for_ip', 'waiting_for_approval', 'failed', 'expired'].includes(task.status)) return;
          await host.save(withSystemTaskStep(task, 'cancelled', '已取消'));
        });
      } catch { host.reportError?.('任务状态无法保存，请稍后重试。'); }
    },
    retry(messageId: string) {
      return run(messageId, async task => {
        if (!['failed', 'expired'].includes(task.status)) return;
        if (!task.action) {
          await host.save({ ...task, error: '请重新发送原请求。', updatedAt: new Date().toISOString() });
          return;
        }
        const status = task.action.type === 'rename-thread' ? 'waiting_for_approval'
          : task.action.type === 'navigate' && !task.requiresIp && !task.selectedIp && !task.action.ipName && !task.action.ipId
            && !['ip-detail', 'import-images', 'import-batch-history'].includes(task.action.route)
            ? 'waiting_for_approval' : 'waiting_for_ip';
        await host.save({ ...withSystemTaskStep(task, status, '请确认任务目标'),
          selectedIp: status === 'waiting_for_ip' ? null : task.selectedIp });
      });
    },
    recover(messageId: string) {
      return run(messageId, async task => {
        if (!['planning', 'executing', 'undoing'].includes(task.status)
          || host.hasActiveGeneration?.(messageId)) return;
        // An interrupted undo retains its completed outcome and original undo token.
        const status = task.status === 'undoing' && task.undo ? 'completed' : 'failed';
        await host.save({ ...withSystemTaskStep(task, status, '上次任务已中断'),
          error: '上次任务已中断，请核对结果后重试。' });
      });
    },
    undo(messageId: string) {
      if (!host.canContinue()) return Promise.resolve();
      return run(messageId, async task => {
        if (task.status !== 'completed' || !task.undo) return;
        try {
          await host.save(withSystemTaskStep(task, 'undoing', '正在撤销'));
          await host.undoRename(task);
          await host.save({ ...withSystemTaskStep(task, 'undone', '已撤销昵称修改'), undo: null });
          host.changed();
        } catch {
          if ((await host.load(messageId))?.status !== 'undone') {
            await host.save({ ...task, error: '无法撤销：昵称已再次修改或撤销已过期。', updatedAt: new Date().toISOString() });
          }
        }
      });
    },
  };
}
