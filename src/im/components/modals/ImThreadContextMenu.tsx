import React, { useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { ImThreadListItem } from '../../types';
import { AnchoredContextMenu, type AnchoredContextMenuAction } from '../../../components/AnchoredContextMenu';
import { AppDialog } from '../../../components/AppDialog';

export interface ImThreadContextMenuProps {
  visible: boolean;
  thread: ImThreadListItem | null;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  onTogglePin?: (thread: ImThreadListItem) => void;
  onToggleFold?: (thread: ImThreadListItem) => void;
  onHideFromList?: (thread: ImThreadListItem) => void;
  onClearHistory?: (thread: ImThreadListItem) => void;
}

/**
 * 伴聊长按操作菜单
 * 统一沿用长聊列表的 AnchoredContextMenu 气泡菜单与 AppDialog 二次确认弹窗风格，保持产品设计一致性
 */
export const ImThreadContextMenu = React.memo(function ImThreadContextMenu({
  visible,
  thread,
  anchorX,
  anchorY,
  onClose,
  onTogglePin,
  onToggleFold,
  onHideFromList,
  onClearHistory,
}: ImThreadContextMenuProps) {
  const [showClearConfirmDialog, setShowClearConfirmDialog] = useState(false);
  const [persistedThread, setPersistedThread] = useState<ImThreadListItem | null>(thread);

  React.useEffect(() => {
    if (thread) {
      setPersistedThread(thread);
    }
  }, [thread]);

  const activeThread = thread || persistedThread;
  if (!activeThread && !showClearConfirmDialog) return null;

  const isPinned = Boolean(activeThread?.isPinned);
  const isFolded = Boolean(activeThread?.isFolded);

  const actions: AnchoredContextMenuAction[] = [
    {
      key: 'pin',
      label: isPinned ? '取消置顶' : '置顶会话',
      icon: isPinned ? 'pin' : 'pin-outline',
      onPress: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (activeThread) onTogglePin?.(activeThread);
      },
    },
    {
      key: 'fold',
      label: isFolded ? '移出折叠会话' : '折叠该会话',
      icon: isFolded ? 'folder-open-outline' : 'folder-outline',
      onPress: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (activeThread) onToggleFold?.(activeThread);
      },
    },
    {
      key: 'hide',
      label: '从列表删除',
      icon: 'eye-off-outline',
      onPress: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (activeThread) onHideFromList?.(activeThread);
      },
    },
    {
      key: 'clear',
      label: '彻底删除聊天信息',
      icon: 'trash-outline',
      danger: true,
      onPress: () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setShowClearConfirmDialog(true);
      },
    },
  ];

  return (
    <>
      <AnchoredContextMenu
        actions={actions}
        anchorX={anchorX}
        anchorY={anchorY}
        dismissAccessibilityLabel="关闭会话操作菜单"
        onClose={onClose}
        visible={visible && !showClearConfirmDialog}
      />

      {/* 彻底清空聊天记录二次确认弹窗（长聊同款 AppDialog） */}
      <AppDialog
        accent="ai"
        appearance="opaqueMonochrome"
        danger
        message={`确定要彻底清空与「${activeThread?.title || ''}」的全部消息记录吗？此操作不可撤销。`}
        onClose={() => {
          setShowClearConfirmDialog(false);
          setPersistedThread(null);
          onClose();
        }}
        onPrimary={() => {
          setShowClearConfirmDialog(false);
          if (activeThread) {
            onClearHistory?.(activeThread);
          }
          setPersistedThread(null);
          onClose();
        }}
        primaryLabel="彻底清空"
        title="彻底清空聊天记录"
        visible={showClearConfirmDialog}
      />
    </>
  );
});
