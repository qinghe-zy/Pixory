import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

export type AiVoiceInputState = 'idle' | 'listening' | 'recognizing' | 'error' | 'cancelled';

interface AiVoiceInputStatusProps {
  state: AiVoiceInputState;
  error?: string | null;
  onCancel?: () => void;
}

export function AiVoiceInputStatus({ state, error, onCancel }: AiVoiceInputStatusProps) {
  if (state === 'idle') {
    return null;
  }
  const text =
    state === 'listening'
      ? '正在听...'
      : state === 'recognizing'
        ? '正在识别...'
        : state === 'cancelled'
          ? '已取消语音输入'
          : error || '语音输入失败';
  return (
    <View style={[styles.wrap, state === 'error' && styles.errorWrap]}>
      <Ionicons color={state === 'error' ? aiLightColors.coralActive : aiLightColors.muted} name={state === 'error' ? 'alert-circle-outline' : 'mic-outline'} size={14} />
      <Text style={[styles.text, state === 'error' && styles.errorText]}>{text}</Text>
      {state === 'listening' || state === 'recognizing' ? (
        <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>取消</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 28,
    paddingHorizontal: spacing[3],
  },
  errorWrap: {
    borderColor: aiLightColors.coral,
  },
  text: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '600',
  },
  errorText: {
    color: aiLightColors.coralActive,
  },
  cancel: {
    paddingHorizontal: spacing[1],
  },
  cancelText: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
});
