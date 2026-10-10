import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SystemTaskSnapshot } from '../../ai/systemAssistant/systemAssistantTypes';
import { systemActionTitle } from '../../ai/systemAssistant/systemAssistantRegistry';
import { AppDialog } from '../AppDialog';
import { colors, rhythm, typography } from '../../design/tokens';

interface Props {
  task: SystemTaskSnapshot | null;
  visible: boolean;
  onClose: () => void;
  onUndo: () => void;
}

export function SystemAssistantTaskDetailsDialog({ task, visible, onClose, onUndo }: Props) {
  if (!task) return null;

  const isNavigate = task.action?.type === 'navigate';
  const isRename = task.action?.type === 'rename-thread';
  const canUndo = task.status === 'completed' && task.undo && Date.parse(task.undo.expiresAt) > Date.now();

  let targetText = '执行操作';
  if (isRename) {
    targetText = `修改昵称为「${(task.action as any).newTitle}」`;
  } else if (isNavigate) {
    targetText = `前往「${systemActionTitle(task.action)}」页面`;
  }

  let statusText = '处理中';
  if (task.status === 'waiting_for_approval') statusText = '等待确认';
  else if (task.status === 'completed') statusText = '已完成';
  else if (task.status === 'failed') statusText = '执行失败';
  else if (task.status === 'cancelled') statusText = '已取消';
  else if (task.status === 'undone') statusText = '已撤销';

  return (
    <AppDialog
      visible={visible}
      title="任务详情"
      appearance="opaqueMonochrome"
      primaryLabel="关闭"
      onPrimary={onClose}
      onClose={onClose}
      secondaryLabel={null}
      tertiaryLabel={canUndo ? '撤销修改' : undefined}
      onTertiary={canUndo ? onUndo : undefined}
      actionLayout="horizontal"
    >
      <View style={styles.container}>
        {task.selectedIp ? (
          <View style={styles.row}>
            <Text style={styles.label}>目标 IP：</Text>
            <Text style={styles.value}>{task.selectedIp.ipNameSnapshot}</Text>
          </View>
        ) : null}
        
        <View style={styles.row}>
          <Text style={styles.label}>操作：</Text>
          <Text style={styles.value}>{targetText}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>状态：</Text>
          <Text style={styles.value}>{statusText}</Text>
        </View>

        {task.error ? (
          <View style={styles.row}>
            <Text style={styles.label}>错误：</Text>
            <Text style={[styles.value, styles.error]}>{task.error}</Text>
          </View>
        ) : null}

        {canUndo ? (
          <Text style={styles.hint}>* 30 分钟内可撤销修改，再次修改将失效</Text>
        ) : null}
      </View>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
    width: 70, // Fixed width for alignment
  },
  value: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '600',
    lineHeight: 22,
  },
  error: {
    color: colors.semantic.danger,
  },
  hint: {
    marginTop: 16,
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});

