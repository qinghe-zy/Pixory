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
  onSelectText?: (message: ImMessage) => void;
  onToggleVoiceTranscript?: (message: ImMessage) => void;
  onSpeakMessage?: (message: ImMessage) => void;
}

export function ImMessageActionMenu({
  visible,
  message,
  anchorX = 180,
  anchorY = 320,
  onClose,
  onDelete,
  onEditResend,
  onSelectText,
  onToggleVoiceTranscript,
  onSpeakMessage,
}: ImMessageActionMenuProps) {
  if (!visible || !message) return null;

  const isVoiceMessage = message.type === 'voice' || Boolean(message.voice);
  const isVoiceTranscriptExpanded = Boolean(message.metadata?.isTranscriptExpanded);

  const handleCopy = async () => {
    const rawContent = isVoiceMessage
      ? message.voice?.transcription || message.content
      : message.content;
    const text = rawContent
      .replace(/\[(STATUS|MOOD|STICKER|HEARTBEAT|VOICE)(?:[:：][^\]]+|\][:：]?[^\]\n]*)?\]?/gi, '')
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

  // 1. 语音消息专属：优先放置【转文字 / 隐藏文字】
  if (isVoiceMessage && onToggleVoiceTranscript) {
    actions.push({
      key: 'toggle_transcript',
      icon: 'chatbubble-ellipses-outline',
      label: isVoiceTranscriptExpanded ? '隐藏文字' : '转文字',
      onPress: () => {
        onToggleVoiceTranscript(message);
        onClose();
      },
    });
  }

  // 2. 通用复制操作
  actions.push({
    key: 'copy',
    icon: 'copy-outline',
    label: '复制',
    onPress: handleCopy,
  });

  // 3. 文本消息专属：长按支持【朗读】
  if (!isVoiceMessage && onSpeakMessage && message.content) {
    actions.push({
      key: 'speak',
      icon: 'volume-high-outline',
      label: '朗读',
      onPress: () => {
        onSpeakMessage(message);
        onClose();
      },
    });
  }

  // 4. 选择文本操作
  if (onSelectText && message.content) {
    actions.push({
      key: 'select_text',
      icon: 'document-text-outline',
      label: '选择文本',
      onPress: () => {
        onSelectText(message);
        onClose();
      },
    });
  }

  // 5. 重新编辑操作
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

  // 6. 删除操作
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
