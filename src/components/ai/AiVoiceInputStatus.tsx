import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, rhythm, spacing, typography } from '../../design/tokens';

export type AiVoiceInputState = 'idle' | 'listening' | 'recognizing' | 'error' | 'cancelled';

interface AiVoiceInputStatusProps {
  state: AiVoiceInputState;
  error?: string | null;
  mode?: 'on_device' | 'system' | null;
  onCancel?: () => void;
  onAutoDismiss?: () => void;
  autoDismissMs?: number;
}

/**
 * 语音状态提示条：
 * 遵从用户最新交互定案：无边框设计，只有报错/未识别到内容才提示，其他正常输入/录音情况不打扰；
 * 报错时展示轻量级无边框胶囊，并在指定时间（默认 2.5 秒）后自动平滑消失。
 */
export function AiVoiceInputStatus({
  state,
  error,
  onAutoDismiss,
  autoDismissMs = 2500,
}: AiVoiceInputStatusProps) {
  const isError = state === 'error' || Boolean(error);

  useEffect(() => {
    if (!isError || !onAutoDismiss) return;
    const timer = setTimeout(() => {
      onAutoDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [isError, onAutoDismiss, autoDismissMs, error]);

  // 严格要求：只有报错才提示，其他情况不提示
  if (!isError) {
    return null;
  }

  const text = error || '语音识别失败，请重试';

  return (
    <View style={styles.wrap}>
      <Ionicons color="#EF4444" name="alert-circle-outline" size={14} />
      <Text style={styles.errorText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FEF2F2', // 极简柔和淡红底色，无任何边框线
    borderRadius: radius.pill,
    borderWidth: 0,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 28,
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    marginBottom: 4,
  },
  errorText: {
    ...typography.textStyles.caption,
    color: '#DC2626',
    fontWeight: '600',
  },
});
