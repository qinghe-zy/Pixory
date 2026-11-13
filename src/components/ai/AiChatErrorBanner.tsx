import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiChatErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export function AiChatErrorBanner({ message, onDismiss, onRetry }: AiChatErrorBannerProps) {
  return (
    <View style={styles.wrap}>
      <Ionicons color={aiLightColors.primaryActive} name="alert-circle-outline" size={16} />
      <Text style={styles.text}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Text style={styles.retryText}>重试</Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable
          accessibilityLabel="关闭提示"
          accessibilityRole="button"
          hitSlop={spacing[2]}
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
        >
          <Ionicons color={aiLightColors.muted} name="close" size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.primary,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    padding: spacing[3],
  },
  text: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    flex: 1,
  },
  retry: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  retryText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    fontWeight: '700',
  },
  dismiss: {
    padding: spacing[1],
  },
  pressed: {
    opacity: 0.78,
  },
});
