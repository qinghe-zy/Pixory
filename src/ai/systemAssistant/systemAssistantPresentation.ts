import type { SystemTaskSnapshot, SystemTaskStatus } from './systemAssistantTypes';

export type SystemProgressState = {
  label: string; status: SystemTaskStatus; tone: 'neutral' | 'success' | 'warning' | 'danger';
  icon: 'checkmark-circle' | 'close-circle-outline' | 'alert-circle-outline' | 'time-outline' | 'arrow-undo-outline' | 'ellipse-outline';
  busy: boolean;
};

export type SystemProgressRow = { label: string; tone: 'neutral' | 'success' | 'danger'; busy: boolean };
export type SystemProgressSummary = {
  title: string;
  badge?: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  busy: boolean;
  totalSteps: number;
};
const internalStep = /^(?:正在理解请求|正在回复|已回复)$/;

export function shouldShowSystemProgress(task: SystemTaskSnapshot | null | undefined): boolean {
  return Boolean(task && (task.action || task.steps.some(step => /角色|设定|草稿|操作|目标|入口/.test(step.label))));
}

function compactLabel(label: string): string {
  if (/无法|未能|不可用|未完成|未保存/.test(label)) return /角色/.test(label) ? '角色卡未保存' : '操作未完成';
  if (/正在梳理角色设定/.test(label)) return '梳理角色设定';
  if (/正在整理角色卡/.test(label)) return '整理角色卡';
  if (/等待补充设定|待补充角色设定/.test(label)) return '等待补充设定';
  return label;
}

export function getSystemProgressRows(task: SystemTaskSnapshot | null | undefined,
  state: SystemProgressState): SystemProgressRow[] {
  const stages = (task?.steps ?? []).filter(step => !internalStep.test(step.label));
  const rows: SystemProgressRow[] = [];
  const isOverallCompleted = state.status === 'completed' && task?.status === 'completed';

  for (const [index, step] of stages.entries()) {
    const last = index === stages.length - 1;
    let status = last ? state.status : step.status;
    // When the whole task is successfully completed, prior valid stages are also successfully completed milestones!
    if (isOverallCompleted && status !== 'failed' && status !== 'expired') {
      status = 'completed';
    }
    const tone = status === 'failed' || status === 'expired' ? 'danger'
      : status === 'completed' || /^(?:设定已记录|草稿已保留)$/.test(step.label) ? 'success' : 'neutral';
    const row: SystemProgressRow = { label: compactLabel(last ? state.label : step.label), tone,
      busy: last && state.busy };
    if (rows.at(-1)?.label === row.label) rows[rows.length - 1] = row;
    else rows.push(row);
  }
  if (!rows.length) rows.push({ label: compactLabel(state.label),
    tone: state.tone === 'danger' ? 'danger' : state.tone === 'success' ? 'success' : 'neutral', busy: state.busy });
  return rows;
}

export function getSystemProgressSummary(
  task: SystemTaskSnapshot | null | undefined,
  state: SystemProgressState,
  rows: SystemProgressRow[]
): SystemProgressSummary {
  const totalSteps = rows.length;
  let title = state.label;

  if (task?.action?.type === 'navigate') {
    title = state.status === 'completed' ? '操作已就绪' : state.busy ? '正在处理操作' : '操作入口';
  } else if (task?.action?.type === 'rename-thread') {
    title = state.status === 'completed' ? '昵称已修改' : state.busy ? '正在修改昵称' : '修改昵称';
  } else if (task?.createdRoleCard || task?.steps.some(s => /角色/.test(s.label))) {
    title = state.status === 'completed' ? '角色卡已就绪' : state.busy ? '正在生成角色卡' : '角色卡任务';
  } else if (state.status === 'completed') {
    title = '操作已完成';
  }

  let badge: string | undefined;
  if (totalSteps > 1) {
    if (state.status === 'completed') {
      badge = `${totalSteps} 步完成`;
    } else if (state.busy) {
      badge = `步骤 ${totalSteps} 进行中`;
    } else {
      badge = `${totalSteps} 步`;
    }
  }

  return {
    title: compactLabel(title),
    badge,
    tone: state.tone,
    busy: state.busy,
    totalSteps,
  };
}

export function getSystemProgressState(task: SystemTaskSnapshot | null | undefined,
  messageStatus: string, hasAnswer: boolean): SystemProgressState {
  let status: SystemTaskStatus = task?.status ?? (messageStatus === 'failed' ? 'failed'
    : messageStatus === 'stopped' ? 'cancelled' : messageStatus === 'completed' ? 'completed' : 'planning');
  // Message failures override an unfinished task, never a successfully committed operation.
  if (status === 'planning' && messageStatus === 'failed') status = 'failed';
  if (status === 'planning' && messageStatus === 'stopped') status = 'cancelled';
  const latest = task?.steps.at(-1)?.label;
  if (status === 'failed' || status === 'expired') return {
    status, label: status === 'expired' ? '任务已过期' : latest && task?.status === status ? latest : '回复未完成',
    icon: 'alert-circle-outline', tone: 'danger', busy: false,
  };
  if (status === 'cancelled') return { status, label: latest && task?.status === status ? latest : '已停止',
    icon: 'close-circle-outline', tone: 'neutral', busy: false };
  if (status === 'undone') return { status, label: latest ?? '已撤销', icon: 'arrow-undo-outline', tone: 'neutral', busy: false };
  if (status === 'completed') return { status, label: latest ?? '已回复', icon: 'checkmark-circle', tone: 'success', busy: false };
  if (status === 'waiting_for_ip' || status === 'waiting_for_approval' || status === 'waiting_for_user') return {
    status, label: latest ?? '等待确认', icon: 'time-outline', tone: 'neutral', busy: false,
  };
  return { status, label: latest && !internalStep.test(latest) ? latest : hasAnswer && status === 'planning' ? '正在回复' : latest ?? '正在理解请求',
    icon: 'ellipse-outline', tone: 'neutral', busy: true };
}
