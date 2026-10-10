import React, { useState } from 'react';
import { View } from 'react-native';
import type { IpRecord } from '../../database/types';
import type { SystemTaskSnapshot } from '../../ai/systemAssistant/systemAssistantTypes';
import { systemActionTitle } from '../../ai/systemAssistant/systemAssistantRegistry';
import { SystemActionConfirmCard, SystemIpSelectCard } from './SystemActionCards';
import { SystemAssistantTaskDetailsDialog } from './SystemAssistantTaskDetails';

export function SystemAssistantTaskCard({ task, ips, disabled, onSelectIp, onConfirm, onCancel, onRetry, onUndo, onCreateIp }: {
  task: SystemTaskSnapshot; ips: IpRecord[]; disabled: boolean;
  onSelectIp(ipId: number): void; onConfirm(): void; onCancel(): void;
  onRetry(): void; onUndo(): void; onCreateIp(): void;
}) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const details = () => setDetailsVisible(true);
  const waiting = task.status === 'waiting_for_ip';
  const failed = task.status === 'failed' || task.status === 'expired';
  const ended = ['completed', 'cancelled', 'undone'].includes(task.status);
  const processing = ['planning', 'executing', 'undoing'].includes(task.status);
  
  const isNavigate = task.action?.type === 'navigate';
  const isRename = task.action?.type === 'rename-thread';
  const actionName = systemActionTitle(task.action);

  // Dynamic minimalist wording
  let title = actionName;
  let description = task.error;
  
  if (isRename) {
    const newName = (task.action as any).newTitle;
    if (ended) {
      title = '已修改昵称';
      description = description || `当前昵称为「${newName}」`;
    } else if (processing) {
      title = '正在修改昵称';
      description = description || '请稍候...';
    } else {
      title = '确认修改昵称';
      description = description || `将修改为「${newName}」`;
    }
  } else if (isNavigate) {
    if (task.status === 'completed') {
      title = '操作已就绪';
      description = description || `已为你跳转至「${actionName}」`;
    } else if (task.status === 'cancelled') {
      title = '已取消';
      description = description || `未跳转至「${actionName}」`;
    } else if (processing) {
      title = '正在处理';
      description = description || '请稍候...';
    } else {
      title = '确认前往页面';
      description = description || `准备打开「${actionName}」`;
    }
  } else {
    // Fallback for others
    if (ended) title = task.status === 'completed' ? '已完成' : task.status === 'cancelled' ? '已取消' : '已撤销';
    else if (processing) title = '正在执行';
    description = description || task.selectedIp?.ipNameSnapshot || null;
  }

  if (waiting) {
    title = '暂无目标 IP';
    description = '请先创建一个 IP 资产';
  }

  let confirmLabel = '确认';
  if (waiting) confirmLabel = '新建 IP';
  else if (failed) confirmLabel = '重试';
  else if (ended) confirmLabel = '查看详情';
  else if (task.status === 'planning') confirmLabel = '停止';
  else if (processing) confirmLabel = '处理中';
  else if (isNavigate) confirmLabel = '立即前往';
  else if (isRename) confirmLabel = '确认修改';

  let cancelLabel: string | null = '取消';
  let handleCancel = undefined;
  
  if (waiting || failed || task.status === 'waiting_for_approval') {
    handleCancel = onCancel;
  } else if (task.status === 'completed' && isNavigate) {
    cancelLabel = '再次前往';
    handleCancel = onConfirm; // Re-trigger the navigation
  } else if (task.status === 'cancelled' && isNavigate) {
    cancelLabel = '前往';
    handleCancel = onConfirm; // Trigger the navigation
  }

  return (
    <View>
      <View pointerEvents={disabled ? 'none' : 'auto'}>
        {waiting && ips.length > 0 ? (
          <SystemIpSelectCard controlled ips={ips} onConfirm={onSelectIp} onCancel={onCancel}
            stepLabel={undefined} onViewSteps={details} />
        ) : (
          <SystemActionConfirmCard disableLocalConfirmState compact
            title={title}
            description={description ?? undefined}
            confirmLabel={confirmLabel}
            cancelLabel={cancelLabel ?? undefined}
            disabled={processing && task.status !== 'planning'}
            onConfirm={waiting ? onCreateIp : failed ? onRetry : ended ? details : task.status === 'planning' ? onCancel : onConfirm}
            onCancel={handleCancel}
            stepLabel={undefined}
            onViewSteps={ended ? undefined : details}
          />
        )}
      </View>
      <SystemAssistantTaskDetailsDialog
        task={task}
        visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
        onUndo={() => { setDetailsVisible(false); onUndo(); }}
      />
    </View>
  );
}




