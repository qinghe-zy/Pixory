import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiChatErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export function AiChatErrorBanner({ message, onDismiss, onRetry }: AiChatErrorBannerProps) {
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.wrap}>
      <Ionicons color={aiLightColors.primaryActive} name="alert-circle-outline" size={metrics.iconSizeSm} />
      <Text style={styles.text}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityLabel="重试"
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>重试</Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable
          accessibilityLabel="关闭提示"
          accessibilityRole="button"
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
        >
          <Ionicons color={aiLightColors.muted} name="close" size={metrics.iconSizeSm} />
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
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
  },
  text: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    flex: 1,
  },
  retry: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: metrics.minTouchSize,
    minWidth: metrics.minTouchSize,
    paddingHorizontal: spacing[2],
  },
  retryText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    fontWeight: typography.weight.semibold,
  },
  dismiss: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: metrics.minTouchSize,
    minWidth: metrics.minTouchSize,
  },
  pressed: {
    opacity: 0.78,
  },
});
