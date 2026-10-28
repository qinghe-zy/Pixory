import React from 'react';
import { Platform, ToastAndroid } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { ImMessage } from '../../types';
import {
  AnchoredContextMenu,
  type AnchoredContextMenuAction,
} from '../../../components/AnchoredContextMenu';

export interface ImMessageActionMenuProps {
  visible: boolean;
  message: ImMessage | null;
  anchorX?: number;
  anchorY?: number;
  onClose: () => void;
  onDelete: (message: ImMessage) => void;
  onEditResend?: (message: ImMessage) => void;
}

export function ImMessageActionMenu({
  visible,
  message,
  anchorX = 180,
  anchorY = 320,
  onClose,
  onDelete,
  onEditResend,
}: ImMessageActionMenuProps) {
  if (!visible || !message) return null;

  const handleCopy = async () => {
    const text = message.content
      .replace(/\[(STATUS|MOOD|STICKER|HEARTBEAT|VOICE):[^\]]+\]/gi, '')
      .replace(/\[BR\]/g, '\n')
      .trim();
    await Clipboard.setStringAsync(text);
    if (Platform.OS === 'android') {
      ToastAndroid.show('已复制到剪贴板', ToastAndroid.SHORT);
    }
    onClose();
  };

  const isUserMessage = message.role === 'user';
  const actions: AnchoredContextMenuAction[] = [];

  actions.push({
    key: 'copy',
    icon: 'copy-outline',
    label: '复制',
    onPress: handleCopy,
  });

  if (isUserMessage && onEditResend) {
    actions.push({
      key: 'edit',
      icon: 'create-outline',
      label: '重新编辑',
      onPress: () => {
        onEditResend(message);
        onClose();
      },
    });
  }

  actions.push({
    key: 'delete',
    icon: 'trash-outline',
    label: '删除',
    danger: true,
    onPress: () => {
      onDelete(message);
      onClose();
    },
  });

  return (
    <AnchoredContextMenu
      actions={actions}
      anchorX={anchorX}
      anchorY={anchorY}
      dismissAccessibilityLabel="关闭消息操作菜单"
      onClose={onClose}
      visible={visible}
    />
  );
}
