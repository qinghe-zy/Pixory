import { useState } from 'react';
import { View } from 'react-native';
import type { IpRecord } from '../../database/types';
import type { SystemTaskSnapshot } from '../../ai/systemAssistant/systemAssistantTypes';
import { systemActionTitle } from '../../ai/systemAssistant/systemAssistantRegistry';
import { SystemActionConfirmCard, SystemIpSelectCard } from './SystemActionCards';
import { SystemAssistantTaskDetailsDialog } from './SystemAssistantTaskDetails';

export function SystemAssistantTaskCard({ task, ips, disabled, onSelectIp, onConfirm, onCancel, onRetry, onUndo, onCreateIp, onOpenRole, onStartChat }: {
  task: SystemTaskSnapshot; ips: IpRecord[]; disabled: boolean;
  onSelectIp(ipId: number): void; onConfirm(): void; onCancel(): void;
  onRetry(): void; onUndo(): void; onCreateIp(): void; onOpenRole?(roleCardId: string): void;
  onStartChat?(roleCardId: string): void;
}) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const details = () => setDetailsVisible(true);
  const ended = ['completed', 'cancelled', 'undone'].includes(task.status);
  const processing = ['planning', 'executing', 'undoing'].includes(task.status);
  const action = task.action;
  const waiting = (task.status === 'waiting_for_ip' || task.action?.type === 'select_ip') && !ended;
  const isNavigate = action?.type === 'navigate';
  const isRename = action?.type === 'rename-thread';
  const createdRole = task.status === 'completed' ? task.createdRoleCard : null;
  const isFailed = (task.status === 'failed' || task.status === 'expired') && Boolean(action);
  const isSelectIpEnded = task.action?.type === 'select_ip' && ended;

  // Pure chat text without action, waiting, role or failure has no card.
  if (!waiting && !isNavigate && !isRename && !createdRole && !isFailed && !isSelectIpEnded) return null;

  let title = systemActionTitle(action);
  let description = task.error ?? undefined;
  let confirmLabel = '确认';
  let cancelLabel = '取消';
  let handleConfirm = onConfirm;
  let handleCancel: (() => void) | undefined;

  if (isFailed && !waiting) {
    const actionName = action ? systemActionTitle(action) : '操作';
    title = task.status === 'expired' ? `${actionName}已过期` : `${actionName}未能完成`;
    description = description || '任务未能完成，可点击重试。';
    confirmLabel = '重试';
    cancelLabel = '取消';
    handleConfirm = onRetry;
    handleCancel = onCancel;
  } else if (waiting) {
    title = '暂无目标 IP';
    description = '请先创建一个 IP 资产';
    confirmLabel = '新建 IP';
    handleConfirm = onCreateIp;
    handleCancel = onCancel;
  } else if (createdRole) {
    title = `已创建角色卡「${createdRole.name}」`;
    description = description || '设定已成功保存至角色库，可直接开启对话或查看详情。';
    confirmLabel = onStartChat ? '直接开聊' : onOpenRole ? '查看角色' : '查看详情';
    handleConfirm = onStartChat ? () => onStartChat(createdRole.id) : onOpenRole ? () => onOpenRole(createdRole.id) : details;
    if (onOpenRole && onStartChat) {
      cancelLabel = '查看详情';
      handleCancel = () => onOpenRole(createdRole.id);
    } else if (Date.parse(createdRole.expiresAt) > Date.now()) {
      cancelLabel = '撤销';
      handleCancel = onUndo;
    }
  } else if (isSelectIpEnded) {
    title = task.status === 'completed' ? '已选择 IP' : '已取消选择';
    description = task.selectedIp ? `已选择「${task.selectedIp.ipNameSnapshot}」` : description || '已结束 IP 选择';
    confirmLabel = '查看详情';
    handleConfirm = details;
  } else {
    if (isRename) {
      title = ended ? '已修改昵称' : processing ? '正在修改昵称' : '确认修改昵称';
      description = description || (ended ? `当前昵称为「${action.newTitle}」`
        : processing ? '请稍候...' : `将修改为「${action.newTitle}」`);
    } else if (isNavigate) {
      const actionName = systemActionTitle(action);
      title = task.status === 'completed' ? '操作已就绪'
        : task.status === 'cancelled' ? '已取消' : processing ? '正在处理' : '确认前往页面';
      description = description || (task.status === 'completed' ? `已为你跳转至「${actionName}」`
        : task.status === 'cancelled' ? `未跳转至「${actionName}」`
          : processing ? '请稍候...' : `准备打开「${actionName}」`);
    }
    confirmLabel = ended ? '查看详情' : task.status === 'planning' ? '停止'
      : processing ? '处理中' : isNavigate ? '立即前往' : '确认修改';
    handleConfirm = ended ? details : task.status === 'planning' ? onCancel : onConfirm;
    if (task.status === 'waiting_for_approval') handleCancel = onCancel;
    else if (isNavigate && (task.status === 'completed' || task.status === 'cancelled')) {
      cancelLabel = task.status === 'completed' ? '再次前往' : '前往';
      handleCancel = onConfirm;
    }
  }

  return (
    <View>
      <View pointerEvents={disabled ? 'none' : 'auto'}>
        {waiting && ips.length > 0 ? (
          <SystemIpSelectCard controlled ips={ips} onConfirm={onSelectIp} onCancel={onCancel}
            onViewSteps={details} />
        ) : (
          <SystemActionConfirmCard disableLocalConfirmState compact
            title={title} description={description}
            confirmLabel={confirmLabel} cancelLabel={cancelLabel}
            disabled={disabled || (processing && task.status !== 'planning')}
            onConfirm={handleConfirm} onCancel={handleCancel}
            onViewSteps={ended ? undefined : details} />
        )}
      </View>
      <SystemAssistantTaskDetailsDialog task={task} visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
        onUndo={() => { setDetailsVisible(false); onUndo(); }} />
    </View>
  );
}




